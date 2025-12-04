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

// ============================================================================
// PUBLISHED EMBEDS INDEX
// ============================================================================
// A single index containing all published embeds for fast Redline Queue loading.
// Structure: { embeds: [{ l: localId, p: pageId, s: status, t: lastChangedAt }], updatedAt }
// This eliminates the need to query all 2000+ macro-vars configs on every load.

const PUBLISHED_EMBEDS_INDEX_KEY = 'published-embeds-index';

// Forge Storage limit per key is 128KB
const FORGE_STORAGE_LIMIT_BYTES = 128 * 1024; // 128KB
const STORAGE_WARNING_THRESHOLD = 0.80; // Warn at 80% capacity

// Custom error code for storage limit issues
const STORAGE_LIMIT_ERROR_CODE = 'PUBLISHED_EMBEDS_INDEX_LIMIT_EXCEEDED';

/**
 * Estimate the byte size of the published embeds index
 * @param {Object} index - The index object with embeds array
 * @returns {number} Estimated size in bytes
 */
function estimateIndexSize(index) {
  // JSON.stringify gives us a reasonable byte estimate for UTF-8
  return new TextEncoder().encode(JSON.stringify(index)).length;
}

/**
 * Check if the index is approaching or at the storage limit
 * @param {Object} index - The index object with embeds array  
 * @returns {Object} { isAtLimit: boolean, isNearLimit: boolean, sizeBytes: number, percentUsed: number }
 */
function checkIndexSize(index) {
  const sizeBytes = estimateIndexSize(index);
  const percentUsed = (sizeBytes / FORGE_STORAGE_LIMIT_BYTES) * 100;
  
  return {
    isAtLimit: sizeBytes >= FORGE_STORAGE_LIMIT_BYTES,
    isNearLimit: sizeBytes >= FORGE_STORAGE_LIMIT_BYTES * STORAGE_WARNING_THRESHOLD,
    sizeBytes,
    percentUsed: Math.round(percentUsed * 10) / 10, // Round to 1 decimal
    maxBytes: FORGE_STORAGE_LIMIT_BYTES,
    embedCount: index.embeds?.length || 0
  };
}

/**
 * Detect if an error is a Forge storage limit error
 * @param {Error} error - The error to check
 * @returns {boolean} True if this is a storage limit error
 */
function isStorageLimitError(error) {
  const message = error?.message?.toLowerCase() || '';
  // Forge typically throws errors with these keywords for size limits
  return message.includes('size') || 
         message.includes('limit') || 
         message.includes('too large') ||
         message.includes('exceeded') ||
         message.includes('quota');
}

/**
 * Create a clear, actionable error for storage limit issues
 * @param {Object} sizeInfo - Size info from checkIndexSize
 * @returns {Object} Error object with clear messaging
 */
function createStorageLimitError(sizeInfo) {
  return {
    code: STORAGE_LIMIT_ERROR_CODE,
    message: `Published Embeds Index has exceeded Forge Storage limit (128KB). ` +
             `Current size: ${Math.round(sizeInfo.sizeBytes / 1024)}KB with ${sizeInfo.embedCount} embeds. ` +
             `ACTION REQUIRED: Implement index sharding to support more than ~3000 published embeds.`,
    sizeBytes: sizeInfo.sizeBytes,
    maxBytes: sizeInfo.maxBytes,
    embedCount: sizeInfo.embedCount,
    percentUsed: sizeInfo.percentUsed,
    requiresSharding: true
  };
}

/**
 * Get the published embeds index from storage
 * @returns {Object} { embeds: [...], updatedAt: string } or empty structure if not found
 */
export async function getPublishedEmbedsIndex() {
  try {
    const index = await storage.get(PUBLISHED_EMBEDS_INDEX_KEY);
    if (!index) {
      return { embeds: [], updatedAt: null };
    }
    return index;
  } catch (error) {
    logFailure('getPublishedEmbedsIndex', 'Failed to read index', error);
    return { embeds: [], updatedAt: null };
  }
}

/**
 * Add or update an embed in the published embeds index
 * Called when an embed is published via publishChapter()
 * 
 * @param {string} localId - Embed instance localId
 * @param {string} pageId - Confluence page ID
 * @param {string} status - Redline status (reviewable, pre-approved, needs-revision, approved)
 * @param {string} lastChangedAt - ISO timestamp of last status change
 * @param {string} excerptId - Optional excerptId for source name lookup
 * @returns {Object} { success: boolean, warning?: Object, error?: string, errorDetails?: Object }
 */
export async function addEmbedToIndex(localId, pageId, status, lastChangedAt, excerptId = null) {
  try {
    const index = await getPublishedEmbedsIndex();
    
    // Find existing entry or create new one
    const existingIndex = index.embeds.findIndex(e => e.l === localId);
    const entry = {
      l: localId,           // localId
      p: pageId,            // pageId
      s: status || 'reviewable',  // status
      t: lastChangedAt || new Date().toISOString(),  // lastChangedAt
      e: excerptId          // excerptId (for source name enrichment)
    };
    
    if (existingIndex >= 0) {
      // Update existing entry
      index.embeds[existingIndex] = entry;
    } else {
      // Add new entry
      index.embeds.push(entry);
    }
    
    index.updatedAt = new Date().toISOString();
    
    // Check size BEFORE attempting to write
    const sizeInfo = checkIndexSize(index);
    
    if (sizeInfo.isAtLimit) {
      const limitError = createStorageLimitError(sizeInfo);
      logFailure('addEmbedToIndex', 'INDEX SIZE LIMIT EXCEEDED - Sharding required', limitError);
      return { 
        success: false, 
        error: limitError.message,
        errorDetails: limitError
      };
    }
    
    // Log warning if approaching limit (80%+)
    if (sizeInfo.isNearLimit) {
      logWarning('addEmbedToIndex', 
        `Published Embeds Index approaching storage limit: ${sizeInfo.percentUsed}% used ` +
        `(${Math.round(sizeInfo.sizeBytes / 1024)}KB / 128KB) with ${sizeInfo.embedCount} embeds. ` +
        `Consider implementing sharding soon.`,
        { sizeInfo }
      );
    }
    
    await storage.set(PUBLISHED_EMBEDS_INDEX_KEY, index);
    
    logPhase('addEmbedToIndex', 'Added/updated embed in index', { 
      localId, 
      pageId, 
      status,
      indexSize: `${Math.round(sizeInfo.sizeBytes / 1024)}KB`,
      embedCount: sizeInfo.embedCount
    });
    
    // Return success with warning if approaching limit
    const result = { success: true };
    if (sizeInfo.isNearLimit) {
      result.warning = {
        message: `Index at ${sizeInfo.percentUsed}% capacity (${sizeInfo.embedCount} embeds). Consider sharding soon.`,
        percentUsed: sizeInfo.percentUsed,
        embedCount: sizeInfo.embedCount
      };
    }
    return result;
    
  } catch (error) {
    // Check if this is a storage limit error from Forge
    if (isStorageLimitError(error)) {
      const index = await getPublishedEmbedsIndex().catch(() => ({ embeds: [] }));
      const sizeInfo = checkIndexSize(index);
      const limitError = createStorageLimitError(sizeInfo);
      
      logFailure('addEmbedToIndex', 'FORGE STORAGE LIMIT ERROR - Sharding required', {
        originalError: error.message,
        ...limitError
      });
      
      return { 
        success: false, 
        error: limitError.message,
        errorDetails: limitError
      };
    }
    
    logFailure('addEmbedToIndex', 'Failed to add embed to index', error, { localId });
    return { success: false, error: error.message };
  }
}

/**
 * Update only the status field for an embed in the index
 * Called when status is changed via setRedlineStatus()
 * 
 * @param {string} localId - Embed instance localId
 * @param {string} newStatus - New redline status
 * @param {string} lastChangedAt - ISO timestamp of status change
 * @returns {Object} { success: boolean, found: boolean, error?: string }
 */
export async function updateEmbedStatusInIndex(localId, newStatus, lastChangedAt) {
  try {
    const index = await getPublishedEmbedsIndex();
    
    const existingIndex = index.embeds.findIndex(e => e.l === localId);
    
    if (existingIndex < 0) {
      // Embed not in index - might not be published yet, that's OK
      logPhase('updateEmbedStatusInIndex', 'Embed not in index (not published)', { localId });
      return { success: true, found: false };
    }
    
    // Update status and timestamp
    index.embeds[existingIndex].s = newStatus;
    index.embeds[existingIndex].t = lastChangedAt;
    index.updatedAt = new Date().toISOString();
    
    await storage.set(PUBLISHED_EMBEDS_INDEX_KEY, index);
    
    logPhase('updateEmbedStatusInIndex', 'Updated status in index', { localId, newStatus });
    return { success: true, found: true };
  } catch (error) {
    logFailure('updateEmbedStatusInIndex', 'Failed to update status in index', error, { localId });
    return { success: false, found: false, error: error.message };
  }
}

/**
 * Remove an embed from the published embeds index
 * Called when an embed is removed from a page (orphan detection)
 * 
 * @param {string} localId - Embed instance localId
 * @returns {Object} { success: boolean, found: boolean, error?: string }
 */
export async function removeEmbedFromIndex(localId) {
  try {
    const index = await getPublishedEmbedsIndex();
    
    const existingIndex = index.embeds.findIndex(e => e.l === localId);
    
    if (existingIndex < 0) {
      return { success: true, found: false };
    }
    
    // Remove the entry
    index.embeds.splice(existingIndex, 1);
    index.updatedAt = new Date().toISOString();
    
    await storage.set(PUBLISHED_EMBEDS_INDEX_KEY, index);
    
    logPhase('removeEmbedFromIndex', 'Removed embed from index', { localId });
    return { success: true, found: true };
  } catch (error) {
    logFailure('removeEmbedFromIndex', 'Failed to remove embed from index', error, { localId });
    return { success: false, found: false, error: error.message };
  }
}

/**
 * Remove all embeds for a specific page from the index
 * Called when a page is unpublished or all embeds on it are removed
 * 
 * @param {string} pageId - Confluence page ID
 * @returns {Object} { success: boolean, removedCount: number, error?: string }
 */
export async function removePageEmbedsFromIndex(pageId) {
  try {
    const index = await getPublishedEmbedsIndex();
    
    const originalCount = index.embeds.length;
    index.embeds = index.embeds.filter(e => e.p !== pageId);
    const removedCount = originalCount - index.embeds.length;
    
    if (removedCount > 0) {
      index.updatedAt = new Date().toISOString();
      await storage.set(PUBLISHED_EMBEDS_INDEX_KEY, index);
      logPhase('removePageEmbedsFromIndex', 'Removed page embeds from index', { pageId, removedCount });
    }
    
    return { success: true, removedCount };
  } catch (error) {
    logFailure('removePageEmbedsFromIndex', 'Failed to remove page embeds from index', error, { pageId });
    return { success: false, removedCount: 0, error: error.message };
  }
}

// ============================================================================
// PAGE CONTENT CACHE
// ============================================================================
// Cache page ADF content with version checking to avoid redundant Confluence API calls.
// Structure: { adfContent, pageVersion, pageTitle, fetchedAt }

/**
 * Get cached page content if version matches
 * 
 * @param {string} pageId - Confluence page ID
 * @param {number} currentVersion - Current page version (from metadata fetch)
 * @returns {Object|null} Cached content if version matches, null otherwise
 */
export async function getCachedPageContent(pageId, currentVersion) {
  try {
    const cached = await storage.get(`page-cache:${pageId}`);
    
    if (!cached) {
      return null;
    }
    
    // Check if cached version matches current
    if (cached.pageVersion === currentVersion) {
      logPhase('getCachedPageContent', 'Cache hit', { pageId, version: currentVersion });
      return cached;
    }
    
    logPhase('getCachedPageContent', 'Cache miss (version mismatch)', { 
      pageId, 
      cachedVersion: cached.pageVersion, 
      currentVersion 
    });
    return null;
  } catch (error) {
    logWarning('getCachedPageContent', 'Failed to read cache', { pageId, error: error.message });
    return null;
  }
}

/**
 * Cache page content with version info
 * 
 * @param {string} pageId - Confluence page ID
 * @param {Object} adfContent - Page ADF content
 * @param {number} pageVersion - Page version number
 * @param {string} pageTitle - Page title
 * @returns {Object} { success: boolean, error?: string }
 */
export async function setCachedPageContent(pageId, adfContent, pageVersion, pageTitle) {
  try {
    const cacheEntry = {
      adfContent,
      pageVersion,
      pageTitle,
      fetchedAt: new Date().toISOString()
    };
    
    await storage.set(`page-cache:${pageId}`, cacheEntry);
    logPhase('setCachedPageContent', 'Cached page content', { pageId, version: pageVersion });
    return { success: true };
  } catch (error) {
    logWarning('setCachedPageContent', 'Failed to cache page content', { pageId, error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Clear page cache for specific pages or all pages
 * Called by Refresh Queue button
 * 
 * @param {string[]|null} pageIds - Specific page IDs to clear, or null to clear all
 * @returns {Object} { success: boolean, clearedCount: number, error?: string }
 */
export async function clearPageCache(pageIds = null) {
  try {
    if (pageIds && pageIds.length > 0) {
      // Clear specific pages
      await Promise.all(pageIds.map(pageId => storage.delete(`page-cache:${pageId}`)));
      logPhase('clearPageCache', 'Cleared specific page caches', { count: pageIds.length });
      return { success: true, clearedCount: pageIds.length };
    }
    
    // Clear all page caches - query for all page-cache:* keys
    let clearedCount = 0;
    let cursor = undefined;
    
    do {
      const batch = await storage.query()
        .where('key', startsWith('page-cache:'))
        .limit(100)
        .cursor(cursor)
        .getMany();
      
      // Delete each cache entry
      await Promise.all(batch.results.map(item => storage.delete(item.key)));
      clearedCount += batch.results.length;
      cursor = batch.nextCursor;
    } while (cursor);
    
    logSuccess('clearPageCache', 'Cleared all page caches', { clearedCount });
    return { success: true, clearedCount };
  } catch (error) {
    logFailure('clearPageCache', 'Failed to clear page cache', error);
    return { success: false, clearedCount: 0, error: error.message };
  }
}

/**
 * Calculate status stats from an array of embeds
 * @param {Array} embeds - Array of embed objects with redlineStatus
 * @returns {Object} Stats object with counts per status
 */
function calculateStatsFromEmbeds(embeds) {
  const stats = {
    reviewable: 0,
    preApproved: 0,
    needsRevision: 0,
    approved: 0,
    total: 0
  };

  for (const embed of embeds) {
    const status = embed.redlineStatus || 'reviewable';
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

  return stats;
}

/**
 * Get redline queue with filtering, sorting, and grouping
 * 
 * OPTIMIZED VERSION: Uses published-embeds-index for fast loading (~500ms vs 45-65s)
 * 
 * Flow:
 * 1. Read from published-embeds-index (single storage read, ~50ms)
 * 2. Filter by status (in-memory)
 * 3. Sort by lastChangedAt for FIFO (in-memory)
 * 4. Paginate (in-memory)
 * 5. Fetch page content with caching for paginated embeds only
 * 6. Extract chapter body from page content (includes heading)
 * 7. Return embed objects with injectedContent
 *
 * @param {Object} req.payload
 * @param {Object} req.payload.filters - Filter criteria { status: [], pageIds: [], excerptIds: [], searchTerm: string }
 * @param {string} req.payload.sortBy - Sort field: "status" | "page" | "source" | "updated"
 * @param {string|null} req.payload.groupBy - Group field: "status" | "page" | "source" | null
 * @param {number} req.payload.page - Page number (1-indexed)
 * @param {number} req.payload.pageSize - Items per page (default 20, max 100)
 * @returns {Object} { success, data: { embeds, groups, stats, pagination } }
 */
export async function getRedlineQueue(req) {
  const { 
    filters = {}, 
    sortBy = 'status', 
    groupBy = null,
    page = 1,
    pageSize = 20
  } = req.payload || {};

  try {
    // Input validation
    if (filters !== undefined && (typeof filters !== 'object' || Array.isArray(filters) || filters === null)) {
      logFailure('getRedlineQueue', 'Validation failed: filters must be an object', new Error('Invalid filters type'));
      return { success: false, error: 'filters must be an object', embeds: [], groups: {} };
    }

    const validatedPage = Math.max(1, parseInt(page, 10) || 1);
    const validatedPageSize = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20));

    // ============================================================================
    // STEP 1: Read from published-embeds-index (single storage read, ~50ms)
    // ============================================================================
    const startTime = Date.now();
    const index = await getPublishedEmbedsIndex();
    
    logPhase('getRedlineQueue', 'Read published embeds index', { 
      embedCount: index.embeds.length,
      timeMs: Date.now() - startTime
    });

    if (index.embeds.length === 0) {
      return {
        success: true,
        data: {
          embeds: [],
          groups: null,
          stats: { reviewable: 0, preApproved: 0, needsRevision: 0, approved: 0, total: 0 },
          pagination: { page: validatedPage, pageSize: validatedPageSize, totalCount: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false }
        }
      };
    }

    // ============================================================================
    // STEP 2: Filter embeds (in-memory, instant)
    // ============================================================================
    let filteredIndexEmbeds = [...index.embeds];

    // Status filter
    if (filters.status && filters.status.length > 0 && filters.status[0] !== 'all') {
      filteredIndexEmbeds = filteredIndexEmbeds.filter(e => 
        filters.status.includes(e.s || 'reviewable')
      );
      logPhase('getRedlineQueue', 'Applied status filter', { 
        status: filters.status, 
        remaining: filteredIndexEmbeds.length 
      });
    }

    // PageIds filter
    if (filters.pageIds && filters.pageIds.length > 0) {
      filteredIndexEmbeds = filteredIndexEmbeds.filter(e => 
        filters.pageIds.includes(e.p)
      );
    }

    // ============================================================================
    // STEP 3: Sort (in-memory, instant)
    // ============================================================================
    if (sortBy === 'status' && filters.status?.length === 1 && filters.status[0] === 'reviewable') {
      // FIFO for reviewable: sort by lastChangedAt ASC (oldest first)
      filteredIndexEmbeds.sort((a, b) => {
        const aTime = a.t || '0';
        const bTime = b.t || '0';
        return new Date(aTime) - new Date(bTime);
      });
      logPhase('getRedlineQueue', 'Sorted by lastChangedAt ASC (FIFO)', { count: filteredIndexEmbeds.length });
    } else if (sortBy === 'updated') {
      // Sort by lastChangedAt DESC (newest first)
      filteredIndexEmbeds.sort((a, b) => {
        const aTime = a.t || '0';
        const bTime = b.t || '0';
        return new Date(bTime) - new Date(aTime);
      });
      logPhase('getRedlineQueue', 'Sorted by lastChangedAt DESC', { count: filteredIndexEmbeds.length });
    } else if (sortBy === 'status') {
      // Sort by status priority
      const statusOrder = { 'reviewable': 0, 'needs-revision': 1, 'pre-approved': 2, 'approved': 3 };
      filteredIndexEmbeds.sort((a, b) => 
        (statusOrder[a.s || 'reviewable'] || 0) - (statusOrder[b.s || 'reviewable'] || 0)
      );
    }

    // ============================================================================
    // STEP 4: Calculate stats from ALL matching embeds (before pagination)
    // ============================================================================
    const stats = {
      reviewable: 0,
      preApproved: 0,
      needsRevision: 0,
      approved: 0,
      total: filteredIndexEmbeds.length
    };
    
    for (const e of filteredIndexEmbeds) {
      const status = e.s || 'reviewable';
      switch (status) {
        case 'reviewable': stats.reviewable++; break;
        case 'pre-approved': stats.preApproved++; break;
        case 'needs-revision': stats.needsRevision++; break;
        case 'approved': stats.approved++; break;
      }
    }

    // ============================================================================
    // STEP 5: Paginate (in-memory, instant)
    // ============================================================================
    const startIndex = (validatedPage - 1) * validatedPageSize;
    const endIndex = startIndex + validatedPageSize;
    const paginatedIndexEmbeds = filteredIndexEmbeds.slice(startIndex, endIndex);
    
    const paginationMeta = {
      page: validatedPage,
      pageSize: validatedPageSize,
      totalCount: filteredIndexEmbeds.length,
      totalPages: Math.ceil(filteredIndexEmbeds.length / validatedPageSize),
      hasNextPage: endIndex < filteredIndexEmbeds.length,
      hasPreviousPage: validatedPage > 1
    };

    logPhase('getRedlineQueue', 'Applied pagination', {
      page: validatedPage,
      totalCount: filteredIndexEmbeds.length,
      returnedCount: paginatedIndexEmbeds.length
    });

    if (paginatedIndexEmbeds.length === 0) {
      return {
        success: true,
        data: { embeds: [], groups: null, stats, pagination: paginationMeta }
      };
    }

    // ============================================================================
    // STEP 6: Fetch page content with caching
    // ============================================================================
    // Group embeds by pageId for efficient batch fetching
    const embedsByPage = {};
    for (const indexEmbed of paginatedIndexEmbeds) {
      if (!embedsByPage[indexEmbed.p]) {
        embedsByPage[indexEmbed.p] = [];
      }
      embedsByPage[indexEmbed.p].push(indexEmbed);
    }

    const pageIds = Object.keys(embedsByPage);
    const pageContentCache = {}; // { pageId: { adfContent, pageTitle, pageVersion } }

    logPhase('getRedlineQueue', 'Fetching page content', { 
      pageCount: pageIds.length,
      embedCount: paginatedIndexEmbeds.length
    });

    // Fetch page content in parallel (with version-based caching)
    const PAGE_BATCH_SIZE = 50;
    for (let i = 0; i < pageIds.length; i += PAGE_BATCH_SIZE) {
      const batchPageIds = pageIds.slice(i, i + PAGE_BATCH_SIZE);
      
      const pageResults = await Promise.all(
        batchPageIds.map(async (pageId) => {
          try {
            // First, get page metadata (fast, includes version)
            const metaResponse = await api.asApp().requestConfluence(
              route`/wiki/api/v2/pages/${pageId}`
            );
            
            if (!metaResponse.ok) {
              logWarning('getRedlineQueue', 'Page metadata fetch failed', { pageId, status: metaResponse.status });
              return { pageId, success: false };
            }
            
            const pageMeta = await metaResponse.json();
            const currentVersion = pageMeta.version?.number;
            const pageTitle = pageMeta.title;

            // Check cache
            const cached = await getCachedPageContent(pageId, currentVersion);
            if (cached) {
              return { 
                pageId, 
                success: true, 
                adfContent: cached.adfContent, 
                pageTitle: cached.pageTitle || pageTitle,
                fromCache: true 
              };
            }

            // Cache miss - fetch full content
            const result = await fetchPageContent(pageId);
            if (result.success && result.adfContent) {
              // Save to cache
              await setCachedPageContent(pageId, result.adfContent, currentVersion, pageTitle);
              return { 
                pageId, 
                success: true, 
                adfContent: result.adfContent, 
                pageTitle,
                fromCache: false 
              };
            }
            
            return { pageId, success: false };
          } catch (error) {
            logWarning('getRedlineQueue', 'Page content fetch error', { pageId, error: error.message });
            return { pageId, success: false };
          }
        })
      );

      // Store results
      for (const result of pageResults) {
        if (result.success) {
          pageContentCache[result.pageId] = {
            adfContent: result.adfContent,
            pageTitle: result.pageTitle
          };
        }
      }

      // Small delay between batches to avoid rate limiting
      if (i + PAGE_BATCH_SIZE < pageIds.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    logPhase('getRedlineQueue', 'Page content fetch complete', {
      fetched: Object.keys(pageContentCache).length,
      failed: pageIds.length - Object.keys(pageContentCache).length
    });

    // ============================================================================
    // STEP 7: Build embed objects with injectedContent
    // ============================================================================
    const embeds = [];
    
    for (const indexEmbed of paginatedIndexEmbeds) {
      const pageContent = pageContentCache[indexEmbed.p];
      
      if (!pageContent) {
        // Page fetch failed - skip this embed
        logWarning('getRedlineQueue', 'Skipping embed - page content not available', { 
          localId: indexEmbed.l, 
          pageId: indexEmbed.p 
        });
        continue;
      }

      // Extract chapter body from ADF
      let injectedContent = null;
      try {
        injectedContent = extractChapterBodyFromAdf(pageContent.adfContent, indexEmbed.l);
      } catch (error) {
        logWarning('getRedlineQueue', 'Failed to extract chapter body', { 
          localId: indexEmbed.l, 
          pageId: indexEmbed.p,
          error: error.message 
        });
      }

      if (!injectedContent) {
        // Embed not found on page - skip for this request
        // NOTE: Do NOT remove from index here - that's too aggressive
        // The orphan detector will handle permanent removal during "Check All Embeds"
        // This could be a transient error, page fetch issue, or timing problem
        logPhase('getRedlineQueue', 'Skipping embed - no injected content found', { 
          localId: indexEmbed.l, 
          pageId: indexEmbed.p 
        });
        continue;
      }

      embeds.push({
        localId: indexEmbed.l,
        pageId: indexEmbed.p,
        pageTitle: pageContent.pageTitle || `Page ${indexEmbed.p}`,
        excerptId: indexEmbed.e || null,
        redlineStatus: indexEmbed.s || 'reviewable',
        lastChangedAt: indexEmbed.t,
        injectedContent,
        // These fields will be loaded by progressive enrichment (getSourceNames)
        sourceName: null,  // Loaded progressively
        sourceCategory: null  // Loaded progressively
      });
    }

    logSuccess('getRedlineQueue', 'Queue loaded', {
      totalTime: Date.now() - startTime,
      embedsReturned: embeds.length,
      totalInFilter: filteredIndexEmbeds.length
    });

    // ============================================================================
    // STEP 8: Apply search filter (needs pageTitle from fetched content)
    // ============================================================================
    let finalEmbeds = embeds;
    
    if (filters.searchTerm && filters.searchTerm.trim()) {
      const searchLower = filters.searchTerm.toLowerCase().trim();
      finalEmbeds = embeds.filter(embed => {
        const pageTitleMatch = embed.pageTitle?.toLowerCase().includes(searchLower);
        const uuidMatch = embed.localId?.toLowerCase().includes(searchLower);
        return pageTitleMatch || uuidMatch;
      });
      logPhase('getRedlineQueue', 'Applied search filter', { 
        searchTerm: filters.searchTerm, 
        remaining: finalEmbeds.length 
      });
    }

    // ============================================================================
    // STEP 9: Group if requested
    // ============================================================================
    if (groupBy) {
      const groups = {};
      
      for (const embed of finalEmbeds) {
        let groupKey;
        switch (groupBy) {
          case 'status':
            groupKey = embed.redlineStatus;
            break;
          case 'page':
            groupKey = embed.pageTitle;
            break;
          case 'source':
            groupKey = embed.sourceName || 'Unknown Source';
            break;
          default:
            groupKey = 'Other';
        }
        
        if (!groups[groupKey]) {
          groups[groupKey] = [];
        }
        groups[groupKey].push(embed);
      }

      return {
        success: true,
        data: { embeds: finalEmbeds, groups, stats, pagination: paginationMeta }
      };
    }

    return {
      success: true,
      data: { embeds: finalEmbeds, groups: null, stats, pagination: paginationMeta }
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

    // Update the published embeds index with new status
    await updateEmbedStatusInIndex(localId, status, now);

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

// ============================================================================
// CACHE MANAGEMENT RESOLVERS
// ============================================================================

/**
 * Clear Redline page cache
 * Called when user clicks "Refresh Queue" button to ensure fresh data
 * 
 * @returns {Object} { success: boolean, clearedCount: number }
 */
export async function clearRedlineCache() {
  try {
    const result = await clearPageCache();
    logSuccess('clearRedlineCache', 'Cache cleared', { clearedCount: result.clearedCount });
    return result;
  } catch (error) {
    logFailure('clearRedlineCache', 'Failed to clear cache', error);
    return { success: false, clearedCount: 0, error: error.message };
  }
}

/**
 * Check the health and size of the published embeds index
 * Useful for proactive monitoring of storage limits
 * 
 * @returns {Object} { success: boolean, health: Object }
 */
export async function getRedlineIndexHealth() {
  try {
    const index = await getPublishedEmbedsIndex();
    const sizeInfo = checkIndexSize(index);
    
    const health = {
      status: sizeInfo.isAtLimit ? 'critical' : sizeInfo.isNearLimit ? 'warning' : 'healthy',
      embedCount: sizeInfo.embedCount,
      sizeBytes: sizeInfo.sizeBytes,
      sizeKB: Math.round(sizeInfo.sizeBytes / 1024 * 10) / 10,
      maxSizeKB: 128,
      percentUsed: sizeInfo.percentUsed,
      requiresSharding: sizeInfo.isAtLimit,
      shardingRecommended: sizeInfo.isNearLimit,
      lastUpdated: index.updatedAt,
      message: sizeInfo.isAtLimit 
        ? `CRITICAL: Index has exceeded 128KB limit. Sharding implementation required immediately.`
        : sizeInfo.isNearLimit
        ? `WARNING: Index at ${sizeInfo.percentUsed}% capacity. Plan for sharding soon.`
        : `Healthy: Index at ${sizeInfo.percentUsed}% capacity with room for ${Math.floor((FORGE_STORAGE_LIMIT_BYTES - sizeInfo.sizeBytes) / 50)} more embeds.`
    };
    
    logPhase('getRedlineIndexHealth', 'Index health check', health);
    return { success: true, health };
  } catch (error) {
    logFailure('getRedlineIndexHealth', 'Failed to check index health', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get source names for a batch of embeds (progressive enrichment)
 * Called after initial queue load to fetch source names in background
 * 
 * @param {Object} req.payload
 * @param {Array} req.payload.excerptIds - Array of excerptIds to look up
 * @returns {Object} { success: boolean, data: { [excerptId]: { name, category } } }
 */
export async function getSourceNames(req) {
  const { excerptIds = [] } = req.payload || {};

  try {
    if (!Array.isArray(excerptIds) || excerptIds.length === 0) {
      return { success: true, data: {} };
    }

    // Fetch all excerpts in parallel
    const results = await Promise.all(
      excerptIds.map(async (excerptId) => {
        if (!excerptId) return { excerptId, data: null };
        
        try {
          const excerpt = await storage.get(`excerpt:${excerptId}`);
          if (excerpt) {
            return {
              excerptId,
              data: {
                name: excerpt.name || 'Unknown Source',
                category: excerpt.category || 'Uncategorized'
              }
            };
          }
          return { excerptId, data: null };
        } catch (error) {
          logWarning('getSourceNames', 'Failed to fetch excerpt', { excerptId, error: error.message });
          return { excerptId, data: null };
        }
      })
    );

    // Build response map
    const sourceMap = {};
    for (const { excerptId, data } of results) {
      if (excerptId && data) {
        sourceMap[excerptId] = data;
      }
    }

    logPhase('getSourceNames', 'Fetched source names', { 
      requested: excerptIds.length, 
      found: Object.keys(sourceMap).length 
    });

    return { success: true, data: sourceMap };
  } catch (error) {
    logFailure('getSourceNames', 'Error fetching source names', error);
    return { success: false, error: error.message, data: {} };
  }
}