/**
 * Page Sync Worker
 *
 * Processes page update events to keep the publication cache in sync.
 * Called automatically when pages are published/updated via the page-updated trigger.
 *
 * Architecture:
 * 1. Page is published/updated in Confluence
 * 2. Forge trigger fires and pushes pageId to page-sync-queue
 * 3. This worker picks up the event and processes the page
 * 4. Worker extracts Blueprint Embed macros and their injectedContent
 * 5. Worker extracts Blueprint Source macros and compares BEFORE vs AFTER
 * 6. Sources removed from the page are immediately soft-deleted
 * 7. Admin UI is notified via sources-last-modified timestamp change
 *
 * The publication cache enables:
 * - Accurate "published embeds" count in Storage Footer
 * - Usage Details showing only actually-published embeds
 * - Real-time sync without manual "Check All" operations
 *
 * Source Existence Tracking (v2):
 * - Tracks Sources per page in sources-on-page:{pageId}
 * - Compares BEFORE (cached) vs AFTER (parsed) on each publish
 * - Immediately soft-deletes Sources removed from pages
 * - Updates sources-last-modified timestamp for UI refresh
 */

import { storage } from '@forge/api';
import { fetchPageContent } from './helpers/page-scanner.js';
import { extractChapterBodyFromAdf } from '../utils/storage-format-utils.js';
import { logFunction, logPhase, logSuccess, logFailure, logWarning } from '../utils/forge-logger.js';
import { softDeleteOrphanedSource } from './helpers/orphan-detector.js';

// Cache key for Embed publication status
const PUBLICATION_CACHE_KEY = 'published-embeds-cache';

// Storage key pattern for tracking Sources per page
const SOURCES_ON_PAGE_PREFIX = 'sources-on-page:';

// Timestamp for when Sources list was last modified (for UI cache invalidation)
const SOURCES_LAST_MODIFIED_KEY = 'sources-last-modified';

/**
 * Process a page update event
 * 
 * @param {Object} event - The async event from the queue
 * @param {string} event.body.pageId - Confluence page ID that was updated
 * @param {number} event.body.timestamp - When the event was triggered
 * @param {string} event.body.eventType - Type of event (page_updated)
 */
export async function handler(event) {
  const payload = event.payload || event.body || event;
  const { pageId, timestamp, eventType } = payload;

  const functionStartTime = Date.now();
  logFunction('pageSyncWorker', 'Processing page update', { pageId, eventType, timestamp });

  if (!pageId) {
    logFailure('pageSyncWorker', 'No pageId in event payload', new Error('Missing pageId'));
    return;
  }

  try {
    // Step 1: Fetch the page content as ADF
    logPhase('pageSyncWorker', 'Fetching page content', { pageId });
    const pageResult = await fetchPageContent(pageId);

    if (!pageResult.success) {
      // Page might have been deleted or permissions changed
      logWarning('pageSyncWorker', 'Failed to fetch page - may have been deleted', {
        pageId,
        error: pageResult.error,
        errorType: pageResult.errorType
      });
      
      // If page was deleted, remove its embeds from cache and soft-delete Sources
      if (pageResult.errorType === 'page_deleted') {
        await removePageFromCache(pageId);
        await handlePageDeleted(pageId);  // Soft-delete all Sources on this page
      }
      return;
    }

    const { adfContent, pageData } = pageResult;
    const pageTitle = pageData?.title || `Page ${pageId}`;

    // Step 2: Find all Blueprint Embed macros on this page
    logPhase('pageSyncWorker', 'Scanning for Blueprint Embeds', { pageId, pageTitle });
    const embedsOnPage = findBlueprintEmbedsInAdf(adfContent);

    // Step 2b: Find all Blueprint Source macros on this page (do this early to avoid early return)
    logPhase('pageSyncWorker', 'Scanning for Blueprint Sources', { pageId, pageTitle });
    const sourcesOnPage = findBlueprintSourcesInAdf(adfContent);

    // If no Blueprint macros at all, clean up caches and handle Source removal
    if (embedsOnPage.length === 0 && sourcesOnPage.length === 0) {
      logPhase('pageSyncWorker', 'No Blueprint macros found on page', { pageId });
      // Remove any cached embeds for this page
      await removePageFromCache(pageId);
      // Sync Sources (empty AFTER state will soft-delete any previously cached Sources)
      await syncSourcesOnPage(pageId, pageTitle, []);
      return;
    }

    // Handle case: page has Sources but no Embeds
    if (embedsOnPage.length === 0) {
      logPhase('pageSyncWorker', 'No Blueprint Embeds found on page (but has Sources)', { pageId });
      // Remove any cached embeds for this page (they may have been deleted)
      await removePageFromCache(pageId);
      // Continue to process Sources below...
    }

    logPhase('pageSyncWorker', 'Found Blueprint Embeds', { 
      pageId, 
      embedCount: embedsOnPage.length,
      localIds: embedsOnPage.map(e => e.localId)
    });

    // Step 3: For each embed, extract injectedContent and gather data
    const publishedEmbeds = [];
    
    for (const embed of embedsOnPage) {
      const { localId, excerptId } = embed;
      
      // Extract the injected content between boundary markers
      const injectedContent = extractChapterBodyFromAdf(adfContent, localId);
      
      if (injectedContent) {
        // Get additional data from macro-vars storage
        const macroVars = await storage.get(`macro-vars:${localId}`);
        
        publishedEmbeds.push({
          localId,
          excerptId,
          pageId,
          pageTitle,
          variableValues: macroVars?.variableValues || {},
          toggleStates: macroVars?.toggleStates || {},
          lastSynced: macroVars?.lastSynced || null,
          publishedAt: macroVars?.publishedAt || new Date().toISOString(),
          hasInjectedContent: true
        });
      }
    }

    logPhase('pageSyncWorker', 'Extracted published embeds', {
      pageId,
      total: embedsOnPage.length,
      published: publishedEmbeds.length
    });

    // Step 4: Update the Embed publication cache
    await updatePublicationCache(pageId, publishedEmbeds);

    // Step 5: Sync Sources using BEFORE vs AFTER comparison (v2)
    logPhase('pageSyncWorker', 'Found Blueprint Sources', {
      pageId,
      sourceCount: sourcesOnPage.length,
      excerptIds: sourcesOnPage.map(s => s.excerptId)
    });

    const sourceResult = await syncSourcesOnPage(pageId, pageTitle, sourcesOnPage);

    const duration = Date.now() - functionStartTime;
    logSuccess('pageSyncWorker', 'Page sync complete', {
      pageId,
      pageTitle,
      embedsFound: embedsOnPage.length,
      publishedEmbeds: publishedEmbeds.length,
      sourcesFound: sourcesOnPage.length,
      sourcesRemoved: sourceResult.removed,
      sourcesSoftDeleted: sourceResult.softDeleted,
      durationMs: duration
    });

  } catch (error) {
    logFailure('pageSyncWorker', 'Error processing page update', error, { pageId });
  }
}

/**
 * Find all Blueprint Embed macros in ADF content
 * 
 * @param {Object} adfContent - ADF document
 * @returns {Array<{localId: string, excerptId: string}>} Array of embed info
 */
function findBlueprintEmbedsInAdf(adfContent) {
  const embeds = [];
  
  if (!adfContent || !adfContent.content) {
    return embeds;
  }

  // Recursive function to search through ADF nodes
  function searchNodes(nodes) {
    if (!Array.isArray(nodes)) return;

    for (const node of nodes) {
      // Check if this is a Blueprint Embed extension
      if (node.type === 'extension' || node.type === 'bodiedExtension') {
        const extensionKey = node.attrs?.extensionKey || '';
        
        // Check if it's a Blueprint Embed macro (not Source)
        if (extensionKey.includes('blueprint-standard-embed')) {
          const localId = node.attrs?.localId || node.attrs?.parameters?.localId;
          const excerptId = node.attrs?.parameters?.guestParams?.excerptId ||
                           node.attrs?.parameters?.excerptId;
          
          if (localId && excerptId) {
            embeds.push({ localId, excerptId });
          }
        }
      }

      // Recursively search child nodes
      if (node.content) {
        searchNodes(node.content);
      }
    }
  }

  searchNodes(adfContent.content);
  return embeds;
}

/**
 * Update the publication cache with embeds from a page
 * 
 * @param {string} pageId - Confluence page ID
 * @param {Array} publishedEmbeds - Array of published embed data
 */
async function updatePublicationCache(pageId, publishedEmbeds) {
  logPhase('pageSyncWorker', 'Updating publication cache', { 
    pageId, 
    embedCount: publishedEmbeds.length 
  });

  // Get current cache
  let cache = await storage.get(PUBLICATION_CACHE_KEY) || {
    timestamp: Date.now(),
    totalPublished: 0,
    byExcerptId: {},
    byPageId: {}
  };

  // Get previous embeds for this page (to know what to remove)
  const previousLocalIds = cache.byPageId[pageId] || [];

  // Remove previous entries for this page from byExcerptId
  for (const localId of previousLocalIds) {
    for (const excerptId of Object.keys(cache.byExcerptId)) {
      const excerptCache = cache.byExcerptId[excerptId];
      if (excerptCache && excerptCache.embeds) {
        excerptCache.embeds = excerptCache.embeds.filter(e => e.localId !== localId);
        // Remove empty excerpt entries
        if (excerptCache.embeds.length === 0) {
          delete cache.byExcerptId[excerptId];
        }
      }
    }
  }

  // Add new entries for this page
  const newLocalIds = [];
  
  for (const embed of publishedEmbeds) {
    const { localId, excerptId } = embed;
    newLocalIds.push(localId);

    // Initialize excerpt cache if needed
    if (!cache.byExcerptId[excerptId]) {
      cache.byExcerptId[excerptId] = {
        refreshedAt: Date.now(),
        embeds: []
      };
    }

    // Add or update this embed
    const existingIndex = cache.byExcerptId[excerptId].embeds.findIndex(e => e.localId === localId);
    if (existingIndex >= 0) {
      cache.byExcerptId[excerptId].embeds[existingIndex] = embed;
    } else {
      cache.byExcerptId[excerptId].embeds.push(embed);
    }
    
    cache.byExcerptId[excerptId].refreshedAt = Date.now();
  }

  // Update byPageId index
  if (newLocalIds.length > 0) {
    cache.byPageId[pageId] = newLocalIds;
  } else {
    delete cache.byPageId[pageId];
  }

  // Recalculate total published count
  cache.totalPublished = Object.values(cache.byExcerptId).reduce(
    (sum, excerptCache) => sum + (excerptCache.embeds?.length || 0),
    0
  );
  
  cache.timestamp = Date.now();

  // Save updated cache
  await storage.set(PUBLICATION_CACHE_KEY, cache);

  logSuccess('pageSyncWorker', 'Publication cache updated', {
    pageId,
    previousCount: previousLocalIds.length,
    newCount: newLocalIds.length,
    totalPublished: cache.totalPublished
  });
}

/**
 * Remove all embeds for a page from the publication cache
 * Called when a page is deleted or no longer has Blueprint Embeds
 * 
 * @param {string} pageId - Confluence page ID
 */
async function removePageFromCache(pageId) {
  logPhase('pageSyncWorker', 'Removing page from publication cache', { pageId });

  let cache = await storage.get(PUBLICATION_CACHE_KEY);
  if (!cache) return;

  const localIdsToRemove = cache.byPageId[pageId] || [];
  if (localIdsToRemove.length === 0) {
    logPhase('pageSyncWorker', 'Page not in cache, nothing to remove', { pageId });
    return;
  }

  // Remove from byExcerptId
  for (const localId of localIdsToRemove) {
    for (const excerptId of Object.keys(cache.byExcerptId)) {
      const excerptCache = cache.byExcerptId[excerptId];
      if (excerptCache && excerptCache.embeds) {
        excerptCache.embeds = excerptCache.embeds.filter(e => e.localId !== localId);
        if (excerptCache.embeds.length === 0) {
          delete cache.byExcerptId[excerptId];
        }
      }
    }
  }

  // Remove from byPageId
  delete cache.byPageId[pageId];

  // Recalculate total
  cache.totalPublished = Object.values(cache.byExcerptId).reduce(
    (sum, excerptCache) => sum + (excerptCache.embeds?.length || 0),
    0
  );
  
  cache.timestamp = Date.now();

  await storage.set(PUBLICATION_CACHE_KEY, cache);

  logSuccess('pageSyncWorker', 'Page removed from publication cache', {
    pageId,
    removedCount: localIdsToRemove.length,
    totalPublished: cache.totalPublished
  });
}

// ============================================================================
// SOURCE EXISTENCE TRACKING (v2)
// ============================================================================

/**
 * Find all Blueprint Source macros in ADF content
 * 
 * @param {Object} adfContent - ADF document
 * @returns {Array<{localId: string, excerptId: string}>} Array of source info
 */
function findBlueprintSourcesInAdf(adfContent) {
  const sources = [];
  
  if (!adfContent || !adfContent.content) {
    return sources;
  }

  // Recursive function to search through ADF nodes
  function searchNodes(nodes) {
    if (!Array.isArray(nodes)) return;

    for (const node of nodes) {
      // Check if this is a Blueprint Source extension (bodiedExtension for Source macros)
      if (node.type === 'bodiedExtension') {
        const extensionKey = node.attrs?.extensionKey || '';
        
        // Check if it's a Blueprint Source macro
        if (extensionKey.includes('blueprint-standard-source')) {
          const localId = node.attrs?.localId;
          // For Sources, excerptId is stored in parameters.guestParams.excerptId or parameters.excerptId
          const excerptId = node.attrs?.parameters?.guestParams?.excerptId ||
                           node.attrs?.parameters?.excerptId;
          
          if (localId && excerptId) {
            sources.push({ localId, excerptId });
          } else if (localId) {
            // Source exists but might not have excerptId set yet (uninitialized Source)
            logWarning('pageSyncWorker', 'Found Source without excerptId', { localId });
          }
        }
      }

      // Recursively search child nodes
      if (node.content) {
        searchNodes(node.content);
      }
    }
  }

  searchNodes(adfContent.content);
  return sources;
}

/**
 * Sync Sources on a page using BEFORE vs AFTER comparison
 * 
 * This is the core of Source Existence Tracking v2:
 * 1. Parse page content for Source excerptIds (AFTER state)
 * 2. Load cached state (BEFORE state) from sources-on-page:{pageId}
 * 3. Calculate diff: removed = BEFORE - AFTER, added = AFTER - BEFORE
 * 4. Soft-delete removed Sources immediately
 * 5. Update cache with new state
 * 6. Update sources-last-modified timestamp if anything changed
 * 
 * @param {string} pageId - Confluence page ID
 * @param {string} pageTitle - Page title for logging
 * @param {Array} sourcesOnPage - Array of source data { localId, excerptId }
 * @returns {Object} { removed: number, added: number, softDeleted: number }
 */
async function syncSourcesOnPage(pageId, pageTitle, sourcesOnPage) {
  logPhase('pageSyncWorker', 'Syncing Sources on page (v2)', { 
    pageId, 
    sourceCount: sourcesOnPage.length 
  });

  // 1. Extract excerptIds from parsed content (AFTER state)
  const sourcesAfter = sourcesOnPage
    .map(s => s.excerptId)
    .filter(Boolean);
  
  // 2. Load cached state (BEFORE state)
  const cacheKey = `${SOURCES_ON_PAGE_PREFIX}${pageId}`;
  const sourcesBefore = await storage.get(cacheKey) || [];
  
  // 3. Calculate diff
  const removed = sourcesBefore.filter(id => !sourcesAfter.includes(id));
  const added = sourcesAfter.filter(id => !sourcesBefore.includes(id));
  
  logPhase('pageSyncWorker', 'Source diff calculated', {
    pageId,
    beforeCount: sourcesBefore.length,
    afterCount: sourcesAfter.length,
    removedCount: removed.length,
    addedCount: added.length,
    removedIds: removed,
    addedIds: added
  });

  // 4. Soft-delete removed Sources (dryRun = false for actual deletion)
  let softDeletedCount = 0;
  for (const excerptId of removed) {
    logPhase('pageSyncWorker', 'Soft-deleting removed Source', { excerptId, pageId });
    const result = await softDeleteOrphanedSource(
      excerptId, 
      `Source removed from page ${pageId}`,
      { pageId, pageTitle },
      false // dryRun = false - actually delete
    );
    if (result.success) {
      softDeletedCount++;
      logSuccess('pageSyncWorker', 'Source soft-deleted', { excerptId, pageId });
    } else {
      logWarning('pageSyncWorker', 'Failed to soft-delete Source', { 
        excerptId, 
        pageId, 
        error: result.error 
      });
    }
  }
  
  // 5. Update cache with new state
  if (sourcesAfter.length > 0) {
    await storage.set(cacheKey, sourcesAfter);
  } else {
    // No Sources on this page anymore, delete the cache entry
    await storage.delete(cacheKey);
  }
  
  // 6. If anything changed, update last-modified timestamp for UI refresh
  if (removed.length > 0 || added.length > 0) {
    await storage.set(SOURCES_LAST_MODIFIED_KEY, Date.now());
    logPhase('pageSyncWorker', 'Updated sources-last-modified timestamp', {
      removedCount: removed.length,
      addedCount: added.length
    });
  }

  logSuccess('pageSyncWorker', 'Source sync complete (v2)', {
    pageId,
    pageTitle,
    removed: removed.length,
    added: added.length,
    softDeleted: softDeletedCount,
    totalOnPage: sourcesAfter.length
  });
  
  return { 
    removed: removed.length, 
    added: added.length, 
    softDeleted: softDeletedCount 
  };
}

/**
 * Handle page deletion - soft-delete all Sources that were on this page
 * 
 * When a page is deleted:
 * 1. Load cached Sources for this page
 * 2. Soft-delete all of them (they no longer exist anywhere)
 * 3. Clear the cache entry
 * 4. Update sources-last-modified timestamp
 * 
 * @param {string} pageId - Confluence page ID that was deleted
 */
async function handlePageDeleted(pageId) {
  logPhase('pageSyncWorker', 'Handling page deletion for Sources', { pageId });

  const cacheKey = `${SOURCES_ON_PAGE_PREFIX}${pageId}`;
  const sourcesBefore = await storage.get(cacheKey) || [];
  
  if (sourcesBefore.length === 0) {
    logPhase('pageSyncWorker', 'No Sources cached for deleted page', { pageId });
    return;
  }

  logPhase('pageSyncWorker', 'Soft-deleting Sources from deleted page', {
    pageId,
    sourceCount: sourcesBefore.length
  });

  // Soft-delete all Sources that were on this page
  let softDeletedCount = 0;
  for (const excerptId of sourcesBefore) {
    const result = await softDeleteOrphanedSource(
      excerptId,
      'Source page deleted',
      { pageId },
      false // dryRun = false
    );
    if (result.success) {
      softDeletedCount++;
    } else {
      logWarning('pageSyncWorker', 'Failed to soft-delete Source from deleted page', {
        excerptId,
        pageId,
        error: result.error
      });
    }
  }

  // Clear the cache entry
  await storage.delete(cacheKey);
  
  // Update last-modified timestamp for UI refresh
  await storage.set(SOURCES_LAST_MODIFIED_KEY, Date.now());

  logSuccess('pageSyncWorker', 'Page deletion handled for Sources', {
    pageId,
    sourcesOnPage: sourcesBefore.length,
    softDeleted: softDeletedCount
  });
}

