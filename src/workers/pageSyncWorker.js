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
 * 5. Publication cache is updated for affected Sources
 *
 * The publication cache enables:
 * - Accurate "published embeds" count in Storage Footer
 * - Usage Details showing only actually-published embeds
 * - Real-time sync without manual "Check All" operations
 */

import { storage } from '@forge/api';
import { fetchPageContent } from './helpers/page-scanner.js';
import { extractChapterBodyFromAdf } from '../utils/storage-format-utils.js';
import { logFunction, logPhase, logSuccess, logFailure, logWarning } from '../utils/forge-logger.js';

// Cache key for publication status
const PUBLICATION_CACHE_KEY = 'published-embeds-cache';

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
      
      // If page was deleted, remove its embeds from publication cache
      if (pageResult.errorType === 'page_deleted') {
        await removePageFromCache(pageId);
      }
      return;
    }

    const { adfContent, pageData } = pageResult;
    const pageTitle = pageData?.title || `Page ${pageId}`;

    // Step 2: Find all Blueprint Embed macros on this page
    logPhase('pageSyncWorker', 'Scanning for Blueprint Embeds', { pageId, pageTitle });
    const embedsOnPage = findBlueprintEmbedsInAdf(adfContent);

    if (embedsOnPage.length === 0) {
      logPhase('pageSyncWorker', 'No Blueprint Embeds found on page', { pageId });
      // Remove any cached embeds for this page (they may have been deleted)
      await removePageFromCache(pageId);
      return;
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

    // Step 4: Update the publication cache
    await updatePublicationCache(pageId, publishedEmbeds);

    const duration = Date.now() - functionStartTime;
    logSuccess('pageSyncWorker', 'Page sync complete', {
      pageId,
      pageTitle,
      embedsFound: embedsOnPage.length,
      publishedEmbeds: publishedEmbeds.length,
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

