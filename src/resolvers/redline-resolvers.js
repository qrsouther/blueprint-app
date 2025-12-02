/**
 * Redline Resolvers
 *
 * Backend API for the Redlining system - a queue-based review and approval workflow
 * for tracking the completeness/readiness of individual Embed instances.
 *
 * Core Features:
 * - Granular status tracking per Embed instance
 * - Automatic status transitions when approved content is modified
 * - Queue filtering, sorting, and grouping
 * - User avatar integration via Confluence API
 * - Audit trail for all status changes
 *
 * Status Types:
 * - "reviewable" - Ready for initial review
 * - "pre-approved" - Content finalized but not fully approved
 * - "needs-revision" - Requires changes/corrections
 * - "approved" - Fully approved and good-to-go
 *
 * Storage Schema (added to macro-vars:{localId}):
 * {
 *   redlineStatus: "reviewable" | "pre-approved" | "needs-revision" | "approved",
 *   approvedContentHash: "abc123...",  // Hash when status set to "approved"
 *   approvedBy: "5e7f419c...",         // Confluence accountId
 *   approvedAt: "2025-01-15T10:30:00.000Z",
 *   statusHistory: [
 *     { status, changedBy, changedAt, reason }
 *   ]
 * }
 */

import { storage, startsWith } from '@forge/api';
import api, { route } from '@forge/api';
import { listVersions } from '../utils/version-manager.js';
import { logPhase, logSuccess, logFailure, logWarning } from '../utils/forge-logger.js';
import { fetchPageContent, checkMacroExistsInADF } from '../workers/helpers/page-scanner.js';
import { createErrorResponse, ERROR_CODES } from '../utils/error-codes.js';
import { extractChapterBodyFromAdf } from '../utils/storage-format-utils.js';

/**
 * Get redline queue with filtering, sorting, and grouping
 *
 * @param {Object} req.payload
 * @param {Object} req.payload.filters - Filter criteria { status: [], pageIds: [], excerptIds: [] }
 * @param {string} req.payload.sortBy - Sort field: "status" | "page" | "source" | "updated"
 * @param {string|null} req.payload.groupBy - Group field: "status" | "page" | "source" | null
 * @returns {Object} { embeds: [...], groups: {...} }
 */
export async function getRedlineQueue(req) {
  const { filters = {}, sortBy = 'status', groupBy = null } = req.payload || {};

  try {
    // Input validation
    if (filters !== undefined && (typeof filters !== 'object' || Array.isArray(filters) || filters === null)) {
      logFailure('getRedlineQueue', 'Validation failed: filters must be an object', new Error('Invalid filters type'));
      return {
        success: false,
        error: 'filters must be an object',
        embeds: [],
        groups: {}
      };
    }

    if (sortBy !== undefined && typeof sortBy !== 'string') {
      logFailure('getRedlineQueue', 'Validation failed: sortBy must be a string', new Error('Invalid sortBy type'));
      return {
        success: false,
        error: 'sortBy must be a string',
        embeds: [],
        groups: {}
      };
    }

    if (groupBy !== undefined && groupBy !== null && typeof groupBy !== 'string') {
      logFailure('getRedlineQueue', 'Validation failed: groupBy must be a string or null', new Error('Invalid groupBy type'));
      return {
        success: false,
        error: 'groupBy must be a string or null',
        embeds: [],
        groups: {}
      };
    }
    // Get all macro-vars:* keys (Embed configs)
    // Note: getMany() has a default limit, so we need to paginate through all results
    let allKeys = [];
    let cursor = undefined;

    do {
      const batch = await storage.query()
        .where('key', startsWith('macro-vars:'))
        .limit(100)
        .cursor(cursor)
        .getMany();

      allKeys = allKeys.concat(batch.results);
      cursor = batch.nextCursor;
    } while (cursor);

    logPhase('getRedlineQueue', 'Fetched Embed configs', { count: allKeys.length });

    // First pass: Check for soft-deleted embeds, fetch excerpt data, and lookup page titles from usage tracking
    // Usage tracking stores pageTitle, which is much faster than API calls
    const embedConfigsWithMetadata = await Promise.all(
      allKeys.map(async (item) => {
        const localId = item.key.replace('macro-vars:', '');
        const config = item.value;

        // Check if soft-deleted
        const deletedEntry = await storage.get(`macro-vars-deleted:${localId}`);
        if (deletedEntry) {
          return null; // Will be filtered out
        }

        // SANITY CHECK: Verify the config actually has required fields
        // This helps catch cases where production data was imported but is invalid in dev
        if (!config || typeof config !== 'object') {
          logWarning('getRedlineQueue', 'Invalid config data found, skipping', { localId, configType: typeof config });
          return null; // Will be filtered out
        }

        // Fetch excerpt details (storage-only, fast)
        let excerptData = null;
        if (config.excerptId) {
          const excerptKey = `excerpt:${config.excerptId}`;
          excerptData = await storage.get(excerptKey);
        }

        // OPTIMIZATION: Prioritize pageTitle from embed config (most reliable, always up-to-date)
        // Fallback to usage tracking for older embeds that don't have pageTitle in config yet
        let pageTitleFromUsage = null;
        let pageIdFromUsage = null;
        
        // First, check if pageTitle is already in config (preferred source)
        const pageTitleFromConfig = config.pageTitle;
        
        // If not in config, try usage tracking as fallback (for older embeds)
        if (!pageTitleFromConfig && config.excerptId) {
          try {
            const usageKey = `usage:${config.excerptId}`;
            const usageData = await storage.get(usageKey);
            if (usageData?.references) {
              // Try to find by localId and pageId (if pageId exists in config)
              let ref = null;
        if (config.pageId) {
                ref = usageData.references.find(r => r.localId === localId && r.pageId === config.pageId);
              } else {
                // If pageId is missing from config, try to find by localId only (take first match)
                ref = usageData.references.find(r => r.localId === localId);
                if (ref?.pageId) {
                  pageIdFromUsage = ref.pageId;
                  logPhase('getRedlineQueue', 'Found pageId from usage tracking (missing from config)', { localId, pageId: pageIdFromUsage });
                }
              }
              if (ref?.pageTitle) {
                pageTitleFromUsage = ref.pageTitle;
              }
            }
          } catch (error) {
            // Silently fail - we'll fall back to API or fallback title
          }
        }
        
        // Use pageId from usage tracking if missing from config
        const effectivePageId = config.pageId || pageIdFromUsage;

        return { localId, config, excerptData, pageTitleFromConfig, pageTitleFromUsage, effectivePageId };
      })
    );

    // Filter out deleted embeds
    let validEmbeds = embedConfigsWithMetadata.filter(item => item !== null);

    // OPTIMIZATION: Apply all filters that don't require API data FIRST
    // This dramatically reduces the number of API calls needed
    
    // Status filter (if not "all")
    if (filters.status && filters.status.length > 0 && filters.status[0] !== 'all') {
      validEmbeds = validEmbeds.filter(({ config }) =>
        filters.status.includes(config.redlineStatus || 'reviewable')
      );
      logPhase('getRedlineQueue', 'Applied status filter', { 
        status: filters.status, 
        remaining: validEmbeds.length 
      });
    }

    // PageIds filter (we have pageId in config)
    if (filters.pageIds && filters.pageIds.length > 0) {
      validEmbeds = validEmbeds.filter(({ config }) =>
        filters.pageIds.includes(config.pageId)
      );
      logPhase('getRedlineQueue', 'Applied pageIds filter', { 
        pageIds: filters.pageIds.length, 
        remaining: validEmbeds.length 
      });
    }

    // ExcerptIds filter (we have excerptId in config)
    if (filters.excerptIds && filters.excerptIds.length > 0) {
      validEmbeds = validEmbeds.filter(({ config }) =>
        filters.excerptIds.includes(config.excerptId)
      );
      logPhase('getRedlineQueue', 'Applied excerptIds filter', { 
        excerptIds: filters.excerptIds.length, 
        remaining: validEmbeds.length 
      });
    }

    // OPTIMIZATION: Sort by storage fields if possible (before expensive API calls)
    // This enables FIFO for reviewable embeds and improves perceived performance
    if (sortBy === 'status' && filters.status?.length === 1 && filters.status[0] === 'reviewable') {
      // FIFO for reviewable: sort by lastChangedAt ASC (oldest first)
      validEmbeds.sort((a, b) => {
        const aTime = a.config.lastChangedAt || a.config.updatedAt || a.config.lastSynced || '0';
        const bTime = b.config.lastChangedAt || b.config.updatedAt || b.config.lastSynced || '0';
        return new Date(aTime) - new Date(bTime); // ASC = oldest first (FIFO)
      });
      logPhase('getRedlineQueue', 'Sorted by lastChangedAt ASC (FIFO)', { 
        count: validEmbeds.length 
      });
    } else if (sortBy === 'source') {
      // Can sort by sourceName from excerptData (already fetched from storage)
      validEmbeds.sort((a, b) => {
        const aName = a.excerptData?.name || 'Unknown Source';
        const bName = b.excerptData?.name || 'Unknown Source';
        return aName.localeCompare(bName);
      });
      logPhase('getRedlineQueue', 'Sorted by sourceName', { 
        count: validEmbeds.length 
      });
    } else if (sortBy === 'updated') {
      // Sort by updatedAt (storage field)
      validEmbeds.sort((a, b) => {
        const aTime = a.config.updatedAt || a.config.lastSynced || '0';
        const bTime = b.config.updatedAt || b.config.lastSynced || '0';
        return new Date(bTime) - new Date(aTime); // DESC = newest first
      });
      logPhase('getRedlineQueue', 'Sorted by updatedAt DESC', { 
        count: validEmbeds.length 
      });
    }

    // OPTIMIZATION: Build embed configs with storage data first (optimistic rendering)
    // Prioritize pageTitle from embed config (most reliable), fallback to usage tracking, then API
    const embedConfigsWithStorageData = validEmbeds.map(({ localId, config, excerptData, pageTitleFromConfig, pageTitleFromUsage, effectivePageId }) => ({
      localId,
      excerptId: config.excerptId,
      sourceName: excerptData?.name || 'Unknown Source',
      sourceCategory: excerptData?.category || 'Uncategorized',
      pageId: effectivePageId || config.pageId, // Use effectivePageId (from usage tracking if config.pageId is missing)
      // Priority: 1) pageTitle from config, 2) pageTitle from usage tracking, 3) fallback
      pageTitle: pageTitleFromConfig || pageTitleFromUsage || (effectivePageId || config.pageId ? `Page ${effectivePageId || config.pageId}` : 'Unknown Page'),
      spaceKey: 'Unknown', // Will be updated from API if needed
      variableValues: config.variableValues || {},
      toggleStates: config.toggleStates || {},
      customInsertions: config.customInsertions || [],
      internalNotes: config.internalNotes || [],
      cachedContent: config.cachedContent,
      syncedContent: config.syncedContent,
      injectedContent: null, // Will be populated from page content for published embeds
      publishedAt: config.publishedAt || null, // Track if/when content was published to page
      redlineStatus: config.redlineStatus || 'reviewable',
      approvedContentHash: config.approvedContentHash,
      approvedBy: config.approvedBy,
      approvedAt: config.approvedAt,
      lastSynced: config.lastSynced,
      updatedAt: config.updatedAt,
      lastChangedAt: config.lastChangedAt, // Include for FIFO sorting
      lastChangedBy: config.lastChangedBy // Include for showing who changed status
    }));

    // OPTIMIZATION: Only fetch page data if needed for:
    // - Search filter (needs pageTitle)
    // - Sorting by "page" (needs pageTitle)
    // - Grouping by "page" (needs pageTitle)
    // - Any embed missing pageTitle (to avoid showing "Page {pageId}" or "Unknown Page")
    // Otherwise, we can skip API calls entirely for faster response
    // NOTE: With pageTitle now stored in embed config, most embeds won't need API calls
    const needsPageData = 
      (filters.searchTerm && filters.searchTerm.trim()) ||
      sortBy === 'page' ||
      groupBy === 'page' ||
      embedConfigsWithStorageData.some(embed => !embed.pageTitle || embed.pageTitle.startsWith('Page ') || embed.pageTitle === 'Unknown Page');

    let embedConfigs = embedConfigsWithStorageData;

    if (needsPageData) {
      // Fetch page data in batches to respect Forge's 100 network requests per invocation limit
      // Forge allows up to 100 network requests per runtime minute (default 25s timeout = 100 requests)
      const BATCH_SIZE = 90; // Leave some headroom below the 100 request limit
      embedConfigs = [];

      for (let i = 0; i < validEmbeds.length; i += BATCH_SIZE) {
        const batch = validEmbeds.slice(i, i + BATCH_SIZE);
        
        // Fetch page data for this batch in parallel
        const batchResults = await Promise.all(
          batch.map(async ({ localId, config, excerptData, pageTitleFromConfig, pageTitleFromUsage, effectivePageId }) => {
            // Priority: 1) pageTitle from config, 2) pageTitle from usage tracking, 3) fetch from API
            let pageData = null;
            let pageTitle = pageTitleFromConfig || pageTitleFromUsage; // Start with config or usage tracking title
            const pageIdToUse = effectivePageId || config.pageId; // Use effectivePageId (from usage tracking if config.pageId is missing)
            
            // Only fetch from API if we don't have a real title (not from config or usage tracking)
            if (pageIdToUse && (!pageTitle || pageTitle.startsWith('Page ') || pageTitle === 'Unknown Page')) {
          try {
            const pageResponse = await api.asApp().requestConfluence(
                  route`/wiki/api/v2/pages/${pageIdToUse}`
            );
            pageData = await pageResponse.json();
                pageTitle = pageData?.title || (pageIdToUse ? `Page ${pageIdToUse}` : 'Unknown Page');
          } catch (error) {
                logWarning('getRedlineQueue', 'Failed to fetch page', { localId, pageId: pageIdToUse, error: error.message });
                pageTitle = pageTitle || (pageIdToUse ? `Page ${pageIdToUse}` : 'Unknown Page');
          }
            } else if (!pageTitle) {
              pageTitle = pageIdToUse ? `Page ${pageIdToUse}` : 'Unknown Page';
        }

        return {
          localId,
          excerptId: config.excerptId,
          sourceName: excerptData?.name || 'Unknown Source',
          sourceCategory: excerptData?.category || 'Uncategorized',
              pageId: pageIdToUse, // Use effectivePageId (from usage tracking if config.pageId is missing)
              pageTitle: pageTitle,
          spaceKey: pageData?.spaceId || 'Unknown',
          variableValues: config.variableValues || {},
          toggleStates: config.toggleStates || {},
          customInsertions: config.customInsertions || [],
          internalNotes: config.internalNotes || [],
          cachedContent: config.cachedContent,
          syncedContent: config.syncedContent,
          injectedContent: null, // Will be populated from page content for published embeds
          publishedAt: config.publishedAt || null, // Track if/when content was published to page
              redlineStatus: config.redlineStatus || 'reviewable',
          approvedContentHash: config.approvedContentHash,
          approvedBy: config.approvedBy,
          approvedAt: config.approvedAt,
          lastSynced: config.lastSynced,
              updatedAt: config.updatedAt,
              lastChangedAt: config.lastChangedAt
        };
      })
    );

        embedConfigs.push(...batchResults);
      }
    } else {
      logPhase('getRedlineQueue', 'Skipping page data fetch (not needed)', { 
        reason: 'No search/sort/group by page',
        embeds: embedConfigs.length 
      });
    }

    // ============================================================================
    // FETCH INJECTED CONTENT FROM PAGES
    // For published embeds, fetch the actual content from the Confluence page
    // instead of relying on stored syncedContent (which may be outdated or empty)
    // ============================================================================
    
    // Group published embeds by pageId for efficient batch fetching
    const publishedEmbedsByPage = {};
    for (let i = 0; i < embedConfigs.length; i++) {
      const embed = embedConfigs[i];
      
      // Only fetch for published embeds that have a pageId
      if (embed.publishedAt && embed.pageId) {
        if (!publishedEmbedsByPage[embed.pageId]) {
          publishedEmbedsByPage[embed.pageId] = [];
        }
        publishedEmbedsByPage[embed.pageId].push({
          embedIndex: i,
          localId: embed.localId
        });
      }
    }

    const pageIds = Object.keys(publishedEmbedsByPage);
    if (pageIds.length > 0) {
      logPhase('getRedlineQueue', 'Fetching injected content from pages', { 
        pageCount: pageIds.length,
        publishedEmbedCount: pageIds.reduce((sum, pid) => sum + publishedEmbedsByPage[pid].length, 0)
      });

      // Fetch pages in batches to respect rate limits
      const PAGE_BATCH_SIZE = 20;
      const pageAdfCache = {};

      for (let i = 0; i < pageIds.length; i += PAGE_BATCH_SIZE) {
        const batchPageIds = pageIds.slice(i, i + PAGE_BATCH_SIZE);
        
        // Fetch page content in parallel for this batch
        const pageResults = await Promise.all(
          batchPageIds.map(async (pageId) => {
            try {
              const result = await fetchPageContent(pageId);
              return { pageId, result };
            } catch (error) {
              logWarning('getRedlineQueue', 'Failed to fetch page for injected content', { 
                pageId, 
                error: error.message 
              });
              return { pageId, result: { success: false, error: error.message } };
            }
          })
        );

        // Cache successful page fetches
        for (const { pageId, result } of pageResults) {
          if (result.success && result.adfContent) {
            pageAdfCache[pageId] = result.adfContent;
          }
        }
      }

      // Extract chapter content for each published embed
      for (const pageId of pageIds) {
        const adfContent = pageAdfCache[pageId];
        if (!adfContent) continue;

        const embedsOnPage = publishedEmbedsByPage[pageId];
        for (const { embedIndex, localId } of embedsOnPage) {
          try {
            const chapterBody = extractChapterBodyFromAdf(adfContent, localId);
            if (chapterBody) {
              embedConfigs[embedIndex].injectedContent = chapterBody;
              logPhase('getRedlineQueue', 'Extracted injected content', { 
                localId, 
                nodeCount: chapterBody.content?.length || 0
              });
            }
            // Note: No warning if chapter body not found - embed may not be published on this page
          } catch (error) {
            logWarning('getRedlineQueue', 'Failed to extract chapter body', { 
              localId, 
              pageId, 
              error: error.message 
            });
          }
        }
      }

      logSuccess('getRedlineQueue', 'Finished fetching injected content', {
        pagesProcessed: Object.keys(pageAdfCache).length,
        pagesFailed: pageIds.length - Object.keys(pageAdfCache).length
      });
    }

    // Apply filters that require API data
    let filteredEmbeds = embedConfigs;

    if (filters.status && filters.status.length > 0 && filters.status[0] !== 'all') {
      filteredEmbeds = filteredEmbeds.filter(embed =>
        filters.status.includes(embed.redlineStatus)
      );
    }

    if (filters.pageIds && filters.pageIds.length > 0) {
      filteredEmbeds = filteredEmbeds.filter(embed =>
        filters.pageIds.includes(embed.pageId)
      );
    }

    if (filters.excerptIds && filters.excerptIds.length > 0) {
      filteredEmbeds = filteredEmbeds.filter(embed =>
        filters.excerptIds.includes(embed.excerptId)
      );
    }

    // Search filter - matches Page Title or Embed UUID (requires pageTitle from API)
    if (filters.searchTerm && filters.searchTerm.trim()) {
      const searchLower = filters.searchTerm.toLowerCase().trim();
      filteredEmbeds = filteredEmbeds.filter(embed => {
        const pageTitleMatch = embed.pageTitle?.toLowerCase().includes(searchLower);
        const uuidMatch = embed.localId?.toLowerCase().includes(searchLower);
        return pageTitleMatch || uuidMatch;
      });
      logPhase('getRedlineQueue', 'Applied search filter', { 
        searchTerm: filters.searchTerm, 
        remaining: filteredEmbeds.length 
      });
    }

    // Final sorting (only if not already sorted by storage fields)
    // Note: If we already sorted by storage fields above, this will maintain that order
    // unless sortBy requires API data (like 'page')
    if (sortBy === 'page') {
      // Sort by pageTitle (requires API data)
      filteredEmbeds.sort((a, b) => a.pageTitle.localeCompare(b.pageTitle));
      logPhase('getRedlineQueue', 'Sorted by pageTitle', { 
        count: filteredEmbeds.length 
      });
    } else if (sortBy === 'status' && (!filters.status || filters.status[0] === 'all' || filters.status.length > 1)) {
      // Sort by status priority (only if not already sorted by lastChangedAt)
          const statusOrder = { 'reviewable': 0, 'needs-revision': 1, 'pre-approved': 2, 'approved': 3 };
      filteredEmbeds.sort((a, b) => statusOrder[a.redlineStatus] - statusOrder[b.redlineStatus]);
      logPhase('getRedlineQueue', 'Sorted by status priority', { 
        count: filteredEmbeds.length 
      });
    } else if (sortBy === 'source' && !filters.status?.length) {
      // Sort by sourceName (only if not already sorted above)
      filteredEmbeds.sort((a, b) => a.sourceName.localeCompare(b.sourceName));
      logPhase('getRedlineQueue', 'Sorted by sourceName', { 
        count: filteredEmbeds.length 
      });
    } else if (sortBy === 'updated' && !filters.status?.length) {
      // Sort by updatedAt (only if not already sorted above)
      filteredEmbeds.sort((a, b) => {
        const aTime = a.updatedAt || a.lastSynced || '0';
        const bTime = b.updatedAt || b.lastSynced || '0';
        return new Date(bTime) - new Date(aTime); // DESC = newest first
      });
      logPhase('getRedlineQueue', 'Sorted by updatedAt DESC', { 
        count: filteredEmbeds.length 
      });
    }

    // Group if requested
    if (groupBy) {
      const groups = {};

      filteredEmbeds.forEach(embed => {
        let groupKey;
        switch (groupBy) {
          case 'status':
            groupKey = embed.redlineStatus;
            break;
          case 'page':
            groupKey = embed.pageTitle;
            break;
          case 'source':
            groupKey = embed.sourceName;
            break;
          default:
            groupKey = 'Other';
        }

        if (!groups[groupKey]) {
          groups[groupKey] = [];
        }
        groups[groupKey].push(embed);
      });

      return {
        success: true,
        data: {
          embeds: filteredEmbeds,
          groups
        }
      };
    }

    return {
      success: true,
      data: {
        embeds: filteredEmbeds,
        groups: null
      }
    };

  } catch (error) {
    logFailure('getRedlineQueue', 'Error loading redline queue', error);
    return {
      success: false,
      error: `Failed to load redline queue: ${error.message}`
    };
  }
}

/**
 * Manually soft-delete a specific embed
 * Useful for immediately removing known-deleted embeds from the Redline Queue
 * without waiting for "Check All Embeds" to complete
 *
 * @param {Object} req.payload
 * @param {string} req.payload.localId - Embed instance localId
 * @param {string} req.payload.reason - Optional reason for deletion (defaults to "Manually deleted")
 * @returns {Object} { success: true, data: { localId, deleted: boolean } } or { success: false, error: "..." }
 */
export async function manuallySoftDeleteEmbed(req) {
  const FUNCTION_NAME = 'manuallySoftDeleteEmbed';
  const { localId, reason = 'Manually deleted from Redline Queue' } = req.payload || {};

  // Input validation
  if (!localId || typeof localId !== 'string' || localId.trim() === '') {
    logFailure(FUNCTION_NAME, 'Validation failed: localId is required and must be a non-empty string', new Error('Invalid localId'));
    return {
      success: false,
      error: 'localId is required and must be a non-empty string'
    };
  }

  try {
    // Import soft-delete function
    const { softDeleteMacroVars } = await import('../workers/helpers/orphan-detector.js');

    // Check if embed exists in storage
    const config = await storage.get(`macro-vars:${localId}`);
    if (!config) {
      // Check if already soft-deleted
      const deletedEntry = await storage.get(`macro-vars-deleted:${localId}`);
      if (deletedEntry) {
        return {
          success: true,
          data: {
            localId,
            deleted: false,
            message: 'Embed already soft-deleted'
          }
        };
      }

      return {
        success: false,
        error: `Embed not found: ${localId}`
      };
    }

    // Soft-delete the embed (dryRun: false to actually delete)
    await softDeleteMacroVars(localId, reason, {}, false);

    logSuccess(FUNCTION_NAME, 'Embed soft-deleted', { localId, reason });

    return {
      success: true,
      data: {
        localId,
        deleted: true,
        message: 'Embed successfully soft-deleted'
      }
    };
  } catch (error) {
    logFailure(FUNCTION_NAME, 'Error soft-deleting embed', error, { localId });
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Check if an Embed still exists on its page
 * Lightweight existence check for individual embeds
 * Used by Redline Queue to verify embeds as they come into view
 *
 * @param {Object} req.payload
 * @param {string} req.payload.localId - Embed instance localId
 * @param {string} req.payload.pageId - Confluence page ID
 * @returns {Object} { success: true, data: { exists: boolean, pageTitle?: string } } or { success: false, error: "..." }
 */
export async function checkEmbedExists(req) {
  const { localId, pageId } = req.payload || {};

  try {
    // Input validation
    if (!localId || typeof localId !== 'string' || localId.trim() === '') {
      logFailure('checkEmbedExists', 'Validation failed: localId is required and must be a non-empty string', new Error('Invalid localId'));
      return {
        success: false,
        error: 'localId is required and must be a non-empty string'
      };
    }

    if (!pageId || typeof pageId !== 'string' || pageId.trim() === '') {
      logFailure('checkEmbedExists', 'Validation failed: pageId is required and must be a non-empty string', new Error('Invalid pageId'));
      return {
        success: false,
        error: 'pageId is required and must be a non-empty string'
      };
    }

    // Fetch page content
    const pageResult = await fetchPageContent(pageId);

    if (!pageResult.success) {
      // Page not found, permission denied, or other error
      return {
        success: true,
        data: {
          exists: false,
          pageTitle: null
        }
      };
    }

    // Check if macro exists in ADF content
    const { adfContent } = pageResult;
    const exists = checkMacroExistsInADF(adfContent, localId);
    const pageTitle = pageResult.pageData?.title || null;

    return {
      success: true,
      data: {
        exists,
        pageTitle
      }
    };
  } catch (error) {
    logFailure('checkEmbedExists', 'Error checking embed existence', error, { localId, pageId });
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Set redline status for a single Embed
 *
 * @param {Object} req.payload
 * @param {string} req.payload.localId - Embed instance ID
 * @param {string} req.payload.status - New status
 * @param {string} req.payload.userId - Confluence accountId of user making change
 * @param {string} req.payload.reason - Reason for status change
 * @returns {Object} { success: true, localId, newStatus }
 */
export async function setRedlineStatus(req) {
  const { localId, status, userId, reason = '' } = req.payload || {};

  // Input validation
  if (!localId || typeof localId !== 'string' || localId.trim() === '') {
    logFailure('setRedlineStatus', 'Validation failed: localId is required and must be a non-empty string', new Error('Invalid localId'));
    return {
      success: false,
      error: 'localId is required and must be a non-empty string'
    };
  }

  if (!status || typeof status !== 'string') {
    logFailure('setRedlineStatus', 'Validation failed: status is required and must be a string', new Error('Invalid status'));
    return {
      success: false,
      error: 'status is required and must be a string'
    };
  }

  if (!['reviewable', 'pre-approved', 'needs-revision', 'approved'].includes(status)) {
    logFailure('setRedlineStatus', 'Validation failed: status must be one of: reviewable, pre-approved, needs-revision, approved', new Error('Invalid status value'));
    return {
      success: false,
      error: `Invalid status: ${status}. Must be one of: reviewable, pre-approved, needs-revision, approved`
    };
  }

  if (userId !== undefined && userId !== null && (typeof userId !== 'string' || userId.trim() === '')) {
    logFailure('setRedlineStatus', 'Validation failed: userId must be a non-empty string if provided', new Error('Invalid userId'));
    return {
      success: false,
      error: 'userId must be a non-empty string if provided'
    };
  }

  if (reason !== undefined && typeof reason !== 'string') {
    logFailure('setRedlineStatus', 'Validation failed: reason must be a string', new Error('Invalid reason type'));
    return {
      success: false,
      error: 'reason must be a string'
    };
  }

  try {
    // Load current Embed config
    const configKey = `macro-vars:${localId}`;
    const config = await storage.get(configKey);

    if (!config) {
      logFailure('setRedlineStatus', 'Embed config not found', new Error('Embed config not found'), { localId });
      return {
        success: false,
        error: `Embed config not found for localId: ${localId}`
      };
    }

    const now = new Date().toISOString();
    const previousStatus = config.redlineStatus || 'reviewable';

    // Initialize statusHistory if it doesn't exist
    const statusHistory = config.statusHistory || [];

    // If setting to "approved", get contentHash from version system
    let approvedContentHash = config.approvedContentHash;
    let approvedBy = config.approvedBy;
    let approvedAt = config.approvedAt;

    if (status === 'approved') {
      // Query version system for latest Embed version
      const versionsResult = await listVersions(storage, localId);

      if (versionsResult.success && versionsResult.versions.length > 0) {
        // Get latest version's contentHash (versions are sorted newest first)
        const latestVersion = versionsResult.versions[0];
        approvedContentHash = latestVersion.contentHash;

        logPhase('setRedlineStatus', 'Approving Embed with contentHash', { localId, contentHash: approvedContentHash });
      } else {
        logWarning('setRedlineStatus', 'No version history found for Embed', { localId });
        // Still allow approval, but without contentHash tracking
        approvedContentHash = null;
      }

      approvedBy = userId;
      approvedAt = now;
    }

    // Add to status history
    statusHistory.push({
      status,
      previousStatus,
      changedBy: userId,
      changedAt: now,
      reason
    });

    // Update config
    const updatedConfig = {
      ...config,
      redlineStatus: status,
      approvedContentHash,
      approvedBy,
      approvedAt,
      lastChangedBy: userId, // Track who made the current status change
      lastChangedAt: now,
      statusHistory,
      updatedAt: now
    };

    await storage.set(configKey, updatedConfig);

    logSuccess('setRedlineStatus', 'Status updated', { localId, previousStatus, newStatus: status, userId });

    return {
      success: true,
      data: {
      localId,
      newStatus: status,
      previousStatus,
      approvedContentHash
      }
    };

  } catch (error) {
    logFailure('setRedlineStatus', 'Error setting redline status', error, { localId: req.payload?.localId });
    return {
      success: false,
      error: `Failed to set redline status: ${error.message}`
    };
  }
}

/**
 * Bulk status update for multiple Embeds
 *
 * NOTE: This function exists for backend/internal use only. The Admin UI does NOT
 * support bulk status updates - users can only update one Embed at a time.
 * This function is kept for potential future use or programmatic access.
 *
 * @param {Object} req.payload
 * @param {string[]} req.payload.localIds - Array of Embed instance IDs
 * @param {string} req.payload.status - New status for all
 * @param {string} req.payload.userId - Confluence accountId
 * @param {string} req.payload.reason - Reason for bulk change
 * @returns {Object} { success: true, updated: 10, failed: 2, errors: [...] }
 */
export async function bulkSetRedlineStatus(req) {
  const { localIds, status, userId, reason = 'Bulk status update' } = req.payload || {};

  // Input validation
  if (!localIds || !Array.isArray(localIds) || localIds.length === 0) {
    logFailure('bulkSetRedlineStatus', 'Validation failed: localIds is required and must be a non-empty array', new Error('Invalid localIds'));
    return {
      success: false,
      error: 'localIds is required and must be a non-empty array',
      updated: 0,
      failed: 0,
      errors: []
    };
  }

  // Validate each localId in the array
  for (let i = 0; i < localIds.length; i++) {
    if (!localIds[i] || typeof localIds[i] !== 'string' || localIds[i].trim() === '') {
      logFailure('bulkSetRedlineStatus', 'Validation failed: all localIds must be non-empty strings', new Error('Invalid localId in array'));
      return {
        success: false,
        error: `localIds[${i}] must be a non-empty string`,
        updated: 0,
        failed: 0,
        errors: []
      };
    }
  }

  if (!status || typeof status !== 'string') {
    logFailure('bulkSetRedlineStatus', 'Validation failed: status is required and must be a string', new Error('Invalid status'));
    return {
      success: false,
      error: 'status is required and must be a string',
      updated: 0,
      failed: 0,
      errors: []
    };
  }

  if (!['reviewable', 'pre-approved', 'needs-revision', 'approved'].includes(status)) {
    logFailure('bulkSetRedlineStatus', 'Validation failed: status must be one of: reviewable, pre-approved, needs-revision, approved', new Error('Invalid status value'));
    return {
      success: false,
      error: `Invalid status: ${status}. Must be one of: reviewable, pre-approved, needs-revision, approved`,
      updated: 0,
      failed: 0,
      errors: []
    };
  }

  if (userId !== undefined && userId !== null && (typeof userId !== 'string' || userId.trim() === '')) {
    logFailure('bulkSetRedlineStatus', 'Validation failed: userId must be a non-empty string if provided', new Error('Invalid userId'));
    return {
      success: false,
      error: 'userId must be a non-empty string if provided',
      updated: 0,
      failed: 0,
      errors: []
    };
  }

  if (reason !== undefined && typeof reason !== 'string') {
    logFailure('bulkSetRedlineStatus', 'Validation failed: reason must be a string', new Error('Invalid reason type'));
    return {
      success: false,
      error: 'reason must be a string',
      updated: 0,
      failed: 0,
      errors: []
    };
  }

  const results = {
    success: true,
    updated: 0,
    failed: 0,
    errors: []
  };

  for (const localId of localIds) {
    try {
      const result = await setRedlineStatus({
        payload: { localId, status, userId, reason }
      });
      if (result.success) {
      results.updated++;
      } else {
        results.failed++;
        results.errors.push({
          localId,
          error: result.error || 'Unknown error'
        });
        logFailure('bulkSetRedlineStatus', 'Failed to update status', new Error(result.error), { localId });
      }
    } catch (error) {
      results.failed++;
      results.errors.push({
        localId,
        error: error.message
      });
      logFailure('bulkSetRedlineStatus', 'Failed to update status', error, { localId });
    }
  }

  logSuccess('bulkSetRedlineStatus', 'Bulk update completed', { updated: results.updated, failed: results.failed });

  return results;
}

/**
 * Check if an Embed needs re-review (content changed after approval)
 *
 * @param {Object} req.payload
 * @param {string} req.payload.localId - Embed instance ID
 * @returns {Object} { isStale: boolean, currentHash, approvedHash }
 */
export async function checkRedlineStale(req) {
  const { localId } = req.payload || {};

  // Input validation
  if (!localId || typeof localId !== 'string' || localId.trim() === '') {
    logFailure('checkRedlineStale', 'Validation failed: localId is required and must be a non-empty string', new Error('Invalid localId'));
    return {
      success: false,
      error: 'localId is required and must be a non-empty string'
    };
  }

  try {
    // Load Embed config
    const configKey = `macro-vars:${localId}`;
    const config = await storage.get(configKey);

    if (!config) {
      logFailure('setRedlineStatus', 'Embed config not found', new Error('Embed config not found'), { localId });
      return {
        success: false,
        error: `Embed config not found for localId: ${localId}`
      };
    }

    // If not approved, can't be stale
    if (config.redlineStatus !== 'approved' || !config.approvedContentHash) {
      return {
        success: true,
        data: {
        isStale: false,
        reason: 'Not approved yet',
        currentHash: null,
        approvedHash: null
        }
      };
    }

    // Query version system for latest Embed version
    const versionsResult = await listVersions(storage, localId);

    if (!versionsResult.success || versionsResult.versions.length === 0) {
      logWarning('checkRedlineStale', 'No version history found for Embed', { localId });
      return {
        success: true,
        data: {
        isStale: false,
        reason: 'No version history available',
        currentHash: null,
        approvedHash: config.approvedContentHash
        }
      };
    }

    // Get latest version's contentHash
    const latestVersion = versionsResult.versions[0];
    const currentHash = latestVersion.contentHash;

    const isStale = currentHash !== config.approvedContentHash;

    return {
      success: true,
      data: {
      isStale,
      currentHash,
      approvedHash: config.approvedContentHash,
      reason: isStale ? 'Content modified after approval' : 'Content unchanged'
      }
    };

  } catch (error) {
    logFailure('checkRedlineStale', 'Error checking redline staleness', error, { localId: req.payload?.localId });
    return {
      success: false,
      error: `Failed to check redline staleness: ${error.message}`
    };
  }
}

/**
 * Get Confluence user data for avatar/name display
 *
 * @param {Object} req.payload
 * @param {string} req.payload.accountId - Confluence user accountId
 * @returns {Object} User data with avatar URL
 */
export async function getConfluenceUser(req) {
  const { accountId } = req.payload || {};

  // Input validation
  if (!accountId || typeof accountId !== 'string' || accountId.trim() === '') {
    logFailure('getConfluenceUser', 'Validation failed: accountId is required and must be a non-empty string', new Error('Invalid accountId'));
    return {
      accountId: accountId || 'unknown',
      displayName: 'Unknown User',
      publicName: 'Unknown User',
      profilePicture: {
        path: null,
        isDefault: true
      },
      error: 'accountId is required and must be a non-empty string'
    };
  }

  // System user (for automatic transitions)
  if (accountId === 'system') {
    return {
      accountId: 'system',
      displayName: 'System',
      publicName: 'System',
      profilePicture: {
        path: null,
        isDefault: true
      }
    };
  }

  try {
    const response = await api.asApp().requestConfluence(
      route`/wiki/rest/api/user?accountId=${accountId}`
    );

    if (!response.ok) {
      const error = new Error(`Confluence API returned ${response.status}: ${response.statusText}`);
      logFailure('getConfluenceUser', 'Confluence API error', error, { accountId, status: response.status });
      // Return fallback data instead of throwing
      return {
        accountId,
        displayName: 'Unknown User',
        publicName: 'Unknown User',
        profilePicture: {
          path: null,
          isDefault: true
        },
        error: error.message
      };
    }

    const userData = await response.json();

    return {
      success: true,
      data: {
      accountId: userData.accountId,
      displayName: userData.displayName || userData.publicName,
      publicName: userData.publicName,
      email: userData.email,
      profilePicture: userData.profilePicture || {
        path: null,
        isDefault: true
        }
      }
    };

  } catch (error) {
    logFailure('getConfluenceUser', 'Error fetching Confluence user', error, { accountId });
    // Return fallback data instead of throwing
    return {
      success: true,
      data: {
      accountId,
      displayName: 'Unknown User',
      publicName: 'Unknown User',
      profilePicture: {
        path: null,
        isDefault: true
      },
      error: error.message
      }
    };
  }
}

/**
 * Get redline statistics (counts by status)
 *
 * @returns {Object} { reviewable: 10, preApproved: 5, needsRevision: 3, approved: 50, total: 68 }
 */
export async function getRedlineStats() {
  try {
    // Get all macro-vars:* keys with pagination
    let allKeys = [];
    let cursor = undefined;

    do {
      const batch = await storage.query()
        .where('key', startsWith('macro-vars:'))
        .limit(100)
        .cursor(cursor)
        .getMany();

      allKeys = allKeys.concat(batch.results);
      cursor = batch.nextCursor;
    } while (cursor);

    const stats = {
      reviewable: 0,
      preApproved: 0,
      needsRevision: 0,
      approved: 0,
      total: 0
    };

    // Count by status
    for (const item of allKeys) {
      const config = item.value;
      const status = config.redlineStatus || 'reviewable';

      stats.total++;

      switch (status) {
        case 'reviewable':
          stats.reviewable++;
          break;
        case 'pre-approved':
          stats.preApproved++;
          break;
        case 'needs-revision':
          stats.needsRevision++;
          break;
        case 'approved':
          stats.approved++;
          break;
      }
    }

    return {
      success: true,
      data: stats
    };

  } catch (error) {
    logFailure('getRedlineStats', 'Error getting redline stats', error);
    return {
      success: false,
      error: `Failed to get redline stats: ${error.message}`
    };
  }
}

/**
 * Post inline comment to Confluence page near the Embed macro
 *
 * @param {Object} req.payload
 * @param {string} req.payload.localId - Embed instance ID
 * @param {string} req.payload.pageId - Confluence page ID where Embed is located
 * @param {string} req.payload.commentText - Comment text to post
 * @param {string} req.payload.userId - Confluence accountId of user posting comment
 * @returns {Object} { success: true, commentId, location }
 */
export async function postRedlineComment(req) {
  const { localId, pageId, commentText } = req.payload || {};

  // Input validation
  if (!localId || typeof localId !== 'string' || localId.trim() === '') {
    logFailure('postRedlineComment', 'Validation failed: localId is required and must be a non-empty string', new Error('Invalid localId'));
    return {
      success: false,
      error: 'localId is required and must be a non-empty string'
    };
  }

  if (!pageId || typeof pageId !== 'string' || pageId.trim() === '') {
    logFailure('postRedlineComment', 'Validation failed: pageId is required and must be a non-empty string', new Error('Invalid pageId'));
    return {
      success: false,
      error: 'pageId is required and must be a non-empty string'
    };
  }

  if (!commentText || typeof commentText !== 'string' || !commentText.trim()) {
    logFailure('postRedlineComment', 'Validation failed: commentText is required and must be a non-empty string', new Error('Invalid commentText'));
    return {
      success: false,
      error: 'commentText is required and must be a non-empty string'
    };
  }

  try {
    // Step 1: Fetch page content (ADF) from Confluence
    logPhase('postRedlineComment', 'Fetching page content', { pageId });

    const pageResponse = await api.asUser().requestConfluence(
      route`/wiki/api/v2/pages/${pageId}?body-format=atlas_doc_format`
    );

    if (!pageResponse.ok) {
      const error = new Error(`Failed to fetch page: ${pageResponse.status} ${pageResponse.statusText}`);
      logFailure('postRedlineComment', 'Failed to fetch page', error, { pageId, status: pageResponse.status });
      return {
        success: false,
        error: error.message
      };
    }

    const pageData = await pageResponse.json();

    // The ADF value is returned as a JSON string, so we need to parse it
    const adfString = pageData.body?.atlas_doc_format?.value;

    if (!adfString) {
      logFailure('postRedlineComment', 'Page ADF content not found in API response', new Error('Missing ADF content'), { pageId });
      return {
        success: false,
        error: 'Page ADF content not found in API response'
      };
    }

    let adfContent;
    try {
      adfContent = JSON.parse(adfString);
    } catch (parseError) {
      logFailure('postRedlineComment', 'Failed to parse ADF content', parseError, { pageId });
      return {
        success: false,
        error: `Failed to parse ADF content: ${parseError.message}`
      };
    }

    logPhase('postRedlineComment', 'Fetched and parsed page ADF', { pageTitle: pageData.title, nodeCount: adfContent?.content?.length || 0 });

    // Step 2: Navigate ADF to find the Embed macro and nearby text for inline comment
    const { textSelection, matchCount, matchIndex } = findTextNearEmbed(adfContent, localId);

    if (!textSelection) {
      logFailure('postRedlineComment', 'Could not find suitable text near Embed', new Error('No text selection found'), { localId, pageId });
      return {
        success: false,
        error: `Could not find suitable text near Embed ${localId} for inline comment`
      };
    }

    logPhase('postRedlineComment', 'Found text selection for inline comment', { textSelection, matchIndex: matchIndex + 1, matchCount });

    // Step 3: Post inline comment to Confluence
    const commentBody = {
      pageId,
      body: {
        representation: 'storage',
        value: `<p>${commentText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`
      },
      inlineCommentProperties: {
        textSelection,
        textSelectionMatchCount: matchCount,
        textSelectionMatchIndex: matchIndex
      }
    };

    const commentResponse = await api.asUser().requestConfluence(
      route`/wiki/api/v2/inline-comments`,
      {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(commentBody)
      }
    );

    if (!commentResponse.ok) {
      const errorText = await commentResponse.text();
      const error = new Error(`Failed to post comment: ${commentResponse.status} ${commentResponse.statusText} - ${errorText}`);
      logFailure('postRedlineComment', 'Failed to post comment', error, { pageId, localId, status: commentResponse.status });
      return {
        success: false,
        error: error.message
      };
    }

    const commentData = await commentResponse.json();

    logSuccess('postRedlineComment', 'Successfully posted inline comment', { commentId: commentData.id, pageId, localId });

    return {
      success: true,
      data: {
      commentId: commentData.id,
      textSelection,
      location: `match ${matchIndex + 1} of ${matchCount}`
      }
    };

  } catch (error) {
    logFailure('postRedlineComment', 'Error posting inline comment', error, { pageId, localId });
    return {
      success: false,
      error: `Failed to post inline comment: ${error.message}`
    };
  }
}

/**
 * Find suitable text near an Embed macro for inline comment targeting
 *
 * Page structure: [Embed macro] → [Chapter Heading h2] → [Section macro with body]
 * The chapter heading sits BETWEEN the Embed macro and the injected Section content.
 *
 * Strategy:
 * 1. Find the Embed macro (extension node) with matching localId
 * 2. Look FORWARD for the chapter heading (immediately after Embed macro)
 * 3. Fallback: Look backwards for a heading (for legacy structure)
 * 4. Last resort: Look forward for the first text paragraph
 * 5. Count occurrences of that text in the document for textSelectionMatchIndex
 *
 * @param {Object} adfContent - ADF document
 * @param {string} targetLocalId - Embed localId to find
 * @returns {Object} { textSelection, matchCount, matchIndex } or { textSelection: null }
 */
function findTextNearEmbed(adfContent, targetLocalId) {
  // Track all content nodes in order for finding previous/next elements
  const contentNodes = [];
  let embedNodeIndex = -1;
  let extensionNodesFound = 0;

  // Recursively walk the ADF tree to collect all content nodes
  function walkAdf(node, depth = 0) {
    if (!node || typeof node !== 'object') return;

    // Count extension nodes
    if (node.type === 'extension') {
      extensionNodesFound++;
    }

    // Check if this is our target Embed macro
    // The localId can be in multiple locations depending on macro type
    const nodeLocalId = node.attrs?.localId ||
                        node.attrs?.parameters?.localId ||
                        node.attrs?.parameters?.macroParams?.localId?.value;

    if (
      node.type === 'extension' &&
      nodeLocalId === targetLocalId
    ) {
      embedNodeIndex = contentNodes.length;
    }

    // Collect this node if it has useful content
    contentNodes.push(node);

    // Recurse into content array
    if (Array.isArray(node.content)) {
      node.content.forEach(child => walkAdf(child, depth + 1));
    }
  }

  walkAdf(adfContent);

  if (embedNodeIndex === -1) {
    logWarning('findTextNearEmbed', 'Could not find Embed with localId', { targetLocalId, extensionNodesFound });
    return { textSelection: null };
  }

  // Strategy 1: Look FORWARD for the chapter heading (it comes immediately after Embed macro)
  // With heading outside Section macro, the chapter heading is always the first heading after the Embed
  for (let i = embedNodeIndex + 1; i < contentNodes.length; i++) {
    const node = contentNodes[i];
    if (node.type === 'heading' && node.content && node.content.length > 0) {
      const headingText = extractText(node);
      if (headingText && headingText.trim().length > 0) {
        const { matchCount, matchIndex } = countTextOccurrences(adfContent, headingText);
        return { textSelection: headingText, matchCount, matchIndex };
      }
    }
    // Stop searching if we hit another extension node (different chapter)
    if (node.type === 'extension') {
      break;
    }
  }

  // Strategy 2: Fallback - look backwards for a heading (for legacy structure)
  for (let i = embedNodeIndex - 1; i >= 0; i--) {
    const node = contentNodes[i];
    if (node.type === 'heading' && node.content && node.content.length > 0) {
      const headingText = extractText(node);
      if (headingText && headingText.trim().length > 0) {
        const { matchCount, matchIndex } = countTextOccurrences(adfContent, headingText);
        return { textSelection: headingText, matchCount, matchIndex };
      }
    }
  }

  // Strategy 3: Look forward for the first paragraph with text
  for (let i = embedNodeIndex + 1; i < contentNodes.length; i++) {
    const node = contentNodes[i];
    if (node.type === 'paragraph' && node.content && node.content.length > 0) {
      const paraText = extractText(node);
      if (paraText && paraText.trim().length > 0) {
        const { matchCount, matchIndex } = countTextOccurrences(adfContent, paraText);
        return { textSelection: paraText, matchCount, matchIndex };
      }
    }
  }

  logWarning('findTextNearEmbed', 'Could not find suitable text near Embed', { targetLocalId });
  return { textSelection: null };
}

/**
 * Extract plain text from an ADF node
 */
function extractText(node) {
  if (!node) return '';

  if (node.type === 'text') {
    return node.text || '';
  }

  if (Array.isArray(node.content)) {
    return node.content.map(extractText).join('');
  }

  return '';
}

/**
 * Count how many times text appears in ADF document and find the index of the first occurrence
 */
function countTextOccurrences(adfContent, targetText) {
  const allText = extractText(adfContent);
  let count = 0;
  let matchIndex = 0;
  let lastIndex = 0;

  // Count occurrences
  while ((lastIndex = allText.indexOf(targetText, lastIndex)) !== -1) {
    if (count === 0) {
      matchIndex = count; // First occurrence
    }
    count++;
    lastIndex += targetText.length;
  }

  return { matchCount: count, matchIndex };
}
