/**
 * Verification Resolver Functions
 *
 * This module contains all health-check and verification operations for
 * Source and Include macros. These are production features used regularly
 * to maintain data integrity and clean up orphaned entries.
 *
 * Extracted during Phase 5 of index.js modularization.
 *
 * Functions:
 * - checkAllSources: Verify all Source macros exist on their pages
 * - checkAllIncludes: Comprehensive Include verification with progress tracking
 * - getStorageUsage: Calculate storage usage statistics
 */

import { storage, startsWith } from '@forge/api';
import { Queue } from '@forge/events';
import { generateUUID } from '../utils.js';
import { logFunction, logPhase, logSuccess, logFailure, logWarning } from '../utils/forge-logger.js';

/**
 * Start Check All Sources - Trigger resolver for async processing
 *
 * This replaces the old synchronous checkAllSources function with an async
 * queue-based approach that can handle large scale operations with real-time
 * progress tracking.
 *
 * Architecture:
 * 1. This trigger pushes event to queue and returns immediately with jobId + progressId
 * 2. Consumer worker (src/workers/checkSourcesWorker.js) processes asynchronously
 * 3. Frontend polls getCheckProgress for real-time updates
 *
 * Returns immediately with:
 * - success: boolean
 * - jobId: string (for Async Events API job tracking)
 * - progressId: string (for progress polling via getCheckProgress)
 */
export async function startCheckAllSources(_req) {
  try {
    logFunction('startCheckAllSources', 'Starting Check All Sources async operation');

    // One-time cleanup: Prune all old Source versions (2-minute retention)
    // This runs automatically when Check All Sources is called
    // Uses synchronous pruning (10 pages at a time) for piecemeal processing
    // User can run multiple times until all pages are processed
    const lastSourcePruneTime = await storage.get('last-source-prune-time');
    
    // Always attempt pruning if timestamp doesn't exist, or if we're still hitting page limits
    // Check if we have more than 20 pages of version data (indicates pruning needed)
    let shouldPrune = !lastSourcePruneTime;
    
    if (lastSourcePruneTime) {
      try {
        // Quick check: query with a limit to see if we hit the page limit
        // If we hit the limit, there are still too many versions and we need to prune more
        let cursor = await storage.query()
          .where('key', startsWith('version:'))
          .getMany();
        let pageCount = 1;
        
        // Count pages up to 20 (the limit that triggers warnings in getAllKeysWithPrefix)
        while (cursor.nextCursor && pageCount < 20) {
          cursor = await storage.query()
            .where('key', startsWith('version:'))
            .cursor(cursor.nextCursor)
            .getMany();
          pageCount++;
        }
        
        // If we still have more pages after 20, we need to prune
        // This means we're hitting the page limit warning
        if (cursor.nextCursor) {
          logPhase('startCheckAllSources', `Storage still high (${pageCount}+ pages of versions detected), forcing re-prune`);
          shouldPrune = true;
        } else {
          logPhase('startCheckAllSources', `Version count check: ${pageCount} pages (within limit, no pruning needed)`);
        }
        
        logPhase('startCheckAllSources', `Pruning decision: shouldPrune=${shouldPrune}, lastSourcePruneTime=${!!lastSourcePruneTime}, hasMorePages=${!!cursor.nextCursor}`);
      } catch (checkError) {
        // If check fails, assume we need to prune (safer to prune than skip)
        logWarning('startCheckAllSources', 'Could not check version count, will attempt pruning', { error: checkError.message });
        shouldPrune = true;
      }
    }
    
    if (shouldPrune) {
      logPhase('startCheckAllSources', 'Queuing Source version pruning job (async worker, 1000 versions at a time)');
      
      // Queue the pruning job as async worker (avoids 25-second timeout)
      const { Queue } = await import('@forge/events');
      const pruneProgressId = generateUUID();
      
      // Initialize progress state
      await storage.set(`progress:${pruneProgressId}`, {
        phase: 'queued',
        percent: 0,
        status: 'Source version pruning job queued...',
        total: 0,
        processed: 0,
        queuedAt: new Date().toISOString()
      });
      
      // Create queue and push event
      const pruneQueue = new Queue({ key: 'prune-versions-queue' });
      const { jobId: pruneJobId } = await pruneQueue.push({
        body: { 
          progressId: pruneProgressId, 
          onlySourceVersions: true, 
          sourceRetentionMinutes: 2,
          maxVersions: 1000 // Process 1000 versions at a time
        }
      });
      
      logSuccess('startCheckAllSources', 'Source version pruning job queued', {
        jobId: pruneJobId,
        progressId: pruneProgressId
      });
      // Note: The worker will set last-source-prune-time when all versions are processed
    } else {
      logPhase('startCheckAllSources', 'Source version pruning already complete, skipping');
    }

    // Generate progressId for frontend polling
    const progressId = generateUUID();

    // Initialize progress state (queued)
    await storage.set(`progress:${progressId}`, {
      phase: 'queued',
      percent: 0,
      status: 'Check All Sources job queued...',
      total: 0,
      processed: 0,
      queuedAt: new Date().toISOString()
    });

    // Create queue and push event
    const queue = new Queue({ key: 'check-sources-queue' });
    const { jobId } = await queue.push({
      body: { progressId }
    });

    logSuccess('startCheckAllSources', 'Job queued successfully', { jobId, progressId });

    // Return immediately - consumer will process in background
    return {
      success: true,
      data: {
        jobId,
        progressId,
        message: 'Check All Sources job queued successfully'
      }
    };

  } catch (error) {
    logFailure('startCheckAllSources', 'Error starting Check All Sources', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Check all Sources - wrapper for backwards compatibility
 * Redirects to startCheckAllSources (async worker)
 */
export async function checkAllSources(req) {
  return startCheckAllSources(req);
}

/**
 * OLD SYNC VERSION - REMOVED
 * 
 * The old synchronous checkAllSources function has been replaced by
 * startCheckAllSources + async worker to avoid 25-second timeout limits.
 * The worker can run for up to 15 minutes.
 * 
 * The old implementation code has been moved to checkSourcesWorker.js
 */

// ============================================================================
// OLD SYNCHRONOUS CHECK ALL INCLUDES - COMMENTED OUT
// ============================================================================
// This function is being replaced by startCheckAllIncludes + async worker
// Keeping it here temporarily for reference until async version is proven stable
// TODO: Delete this entire commented section after async version is confirmed working

/*
export async function checkAllIncludes_OLD_SYNC_VERSION(req) {
  try {
    // OLD SYNC VERSION - COMMENTED OUT - console statements removed

    // Accept progressId from frontend, or generate if not provided
    const progressId = req.payload?.progressId || generateUUID();
    const startTime = Date.now();

    // Get all macro-vars entries (each represents an Include instance)
    const allMacroVars = await storage.query().where('key', startsWith('macro-vars:')).getMany();
    const totalIncludes = allMacroVars.results.length;

    // Initialize progress tracking
    await storage.set(`progress:${progressId}`, {
      phase: 'initializing',
      total: totalIncludes,
      processed: 0,
      percent: 0,
      startTime,
      status: 'Loading excerpts...'
    });

    // Get excerpt index for validation
    const excerptIndex = await storage.get('excerpt-index') || { excerpts: [] };
    const existingExcerptIds = new Set(excerptIndex.excerpts.map(e => e.id));

    // Load all excerpts for metadata
    const excerptMap = new Map();
    for (const excerptSummary of excerptIndex.excerpts) {
      const excerpt = await storage.get(`excerpt:${excerptSummary.id}`);
      if (excerpt) {
        excerptMap.set(excerpt.id, excerpt);
      }
    }

    const activeIncludes = [];
    const orphanedIncludes = [];
    const brokenReferences = [];
    const staleIncludes = [];
    let orphanedEntriesRemoved = 0;

    // Group includes by page to minimize API calls
    const pageMap = new Map(); // pageId -> [includes on that page]

    // Update progress
    await storage.set(`progress:${progressId}`, {
      phase: 'grouping',
      total: totalIncludes,
      processed: 0,
      percent: 5,
      startTime,
      status: 'Organizing Includes by page...'
    });

    for (const entry of allMacroVars.results) {
      const localId = entry.key.replace('macro-vars:', '');
      const macroVars = entry.value;

      // Get usage data to find which page this Include is on
      const excerptId = macroVars.excerptId;
      const usageKey = `usage:${excerptId}`;
      const usageData = await storage.get(usageKey) || { references: [] };
      const reference = usageData.references.find(ref => ref.localId === localId);

      if (!reference) {
        orphanedIncludes.push({
          localId,
          excerptId,
          reason: 'No usage tracking reference'
        });
        continue;
      }

      const pageId = reference.pageId;

      if (!pageMap.has(pageId)) {
        pageMap.set(pageId, []);
      }

      pageMap.get(pageId).push({
        localId,
        macroVars,
        reference
      });
    }

    // Update progress - grouping complete
    await storage.set(`progress:${progressId}`, {
      phase: 'checking',
      total: totalIncludes,
      processed: 0,
      percent: 10,
      startTime,
      status: `Checking ${pageMap.size} pages with Includes...`
    });

    // Check each page
    let processedIncludes = 0;
    const totalPages = pageMap.size;
    let processedPages = 0;

    for (const [pageId, includes] of pageMap.entries()) {
      try {
        // Update progress before checking page
        processedPages++;
        const percent = Math.min(10 + Math.floor((processedIncludes / totalIncludes) * 80), 95);
        await storage.set(`progress:${progressId}`, {
          phase: 'checking',
          total: totalIncludes,
          processed: processedIncludes,
          percent,
          startTime,
          currentPage: processedPages,
          totalPages,
          status: `Checking page ${processedPages}/${totalPages}...`
        });

        // Fetch page content
        const response = await api.asApp().requestConfluence(
          route`/wiki/api/v2/pages/${pageId}?body-format=storage`,
          {
            headers: {
              'Accept': 'application/json'
            }
          }
        );

        if (!response.ok) {
          includes.forEach(inc => {
            orphanedIncludes.push({
              localId: inc.localId,
              pageId,
              pageTitle: inc.reference.pageTitle,
              excerptId: inc.macroVars.excerptId,
              reason: 'Page not found or deleted'
            });
          });
          continue;
        }

        const pageData = await response.json();
        const pageBody = pageData?.body?.storage?.value || '';
        const pageTitle = pageData.title || 'Unknown Page';

        // Check each Include on this page
        for (const inc of includes) {
          const { localId, macroVars, reference } = inc;
          const excerptId = macroVars.excerptId;

          // Check if Include still exists on page
          if (!pageBody.includes(localId)) {
            orphanedIncludes.push({
              localId,
              pageId,
              pageTitle,
              excerptId,
              reason: 'Macro deleted from page'
            });
            continue;
          }

          // Check if excerpt still exists
          if (!existingExcerptIds.has(excerptId)) {
            brokenReferences.push({
              localId,
              pageId,
              pageTitle,
              excerptId,
              reason: 'Referenced excerpt deleted'
            });
            continue;
          }

          // Get excerpt details
          const excerpt = excerptMap.get(excerptId);
          if (!excerpt) {
            continue;
          }

          // Check staleness
          const excerptLastModified = new Date(excerpt.updatedAt || 0);
          const includeLastSynced = macroVars.lastSynced ? new Date(macroVars.lastSynced) : new Date(0);
          const isStale = excerptLastModified > includeLastSynced;

          // Generate rendered content for export
          let renderedContent = '';
          try {
            let content = excerpt.content;
            const isAdf = content && typeof content === 'object' && content.type === 'doc';

            if (isAdf) {
              // For ADF, extract plain text (simplified)
              renderedContent = extractTextFromAdf(content);
            } else {
              renderedContent = content || '';
            }

            // Perform variable substitution
            if (macroVars.variableValues) {
              Object.entries(macroVars.variableValues).forEach(([varName, value]) => {
                const regex = new RegExp(`\\{\\{${varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}`, 'g');
                renderedContent = renderedContent.replace(regex, value || '');
              });
            }

            // Remove toggle markers (simplified - just remove the markers themselves)
            renderedContent = renderedContent.replace(/\{\{toggle:[^}]+\}\}/g, '');
            renderedContent = renderedContent.replace(/\{\{\/toggle:[^}]+\}\}/g, '');

          } catch (err) {
            logFailure('checkAllIncludes_OLD_SYNC_VERSION', 'Error rendering content', err, { localId });
            renderedContent = '[Error rendering content]';
          }

          // Build complete Include data
          const includeData = {
            localId,
            pageId,
            pageTitle,
            pageUrl: `/wiki/pages/viewpage.action?pageId=${pageId}`,
            headingAnchor: reference.headingAnchor || '',
            excerptId,
            excerptName: excerpt.name,
            excerptCategory: excerpt.category || 'General',
            status: isStale ? 'stale' : 'active',
            lastSynced: macroVars.lastSynced || null,
            excerptLastModified: excerpt.updatedAt || null,
            variableValues: macroVars.variableValues || {},
            toggleStates: macroVars.toggleStates || {},
            customInsertions: macroVars.customInsertions || [],
            renderedContent: renderedContent.trim(),
            variables: excerpt.variables || [],
            toggles: excerpt.toggles || []
          };

          if (isStale) {
            staleIncludes.push(includeData);
          }

          activeIncludes.push(includeData);

          // Increment processed count
          processedIncludes++;
        }

        // Update progress after processing all Includes on this page
        processedIncludes += includes.filter(inc => !pageBody || !pageBody.includes(inc.localId) || !existingExcerptIds.has(inc.macroVars.excerptId)).length;

      } catch (apiError) {
        logFailure('checkAllIncludes_OLD_SYNC_VERSION', 'Error checking page', apiError, { pageId });
        includes.forEach(inc => {
          orphanedIncludes.push({
            localId: inc.localId,
            pageId,
            pageTitle: inc.reference.pageTitle,
            excerptId: inc.macroVars.excerptId,
            reason: `API error: ${apiError.message}`
          });
        });
      }
    }

    // Clean up orphaned entries
    await storage.set(`progress:${progressId}`, {
      phase: 'cleanup',
      total: totalIncludes,
      processed: totalIncludes,
      percent: 95,
      startTime,
      status: `Cleaning up ${orphanedIncludes.length} orphaned entries...`
    });

    for (const orphaned of orphanedIncludes) {
      try {
        // Remove macro-vars entry
        await storage.delete(`macro-vars:${orphaned.localId}`);

        // Remove macro-cache entry
        await storage.delete(`macro-cache:${orphaned.localId}`);

        orphanedEntriesRemoved++;
      } catch (err) {
        logFailure('checkAllIncludes_OLD_SYNC_VERSION', 'Error removing orphaned entry', err, { localId: orphaned.localId });
      }
    }

    // Clean up stale usage tracking references
    let staleUsageReferencesRemoved = 0;

    for (const orphaned of [...orphanedIncludes, ...brokenReferences]) {
      try {
        const usageKey = `usage:${orphaned.excerptId}`;
        const usageData = await storage.get(usageKey);

        if (usageData && Array.isArray(usageData.references)) {
          const originalLength = usageData.references.length;
          usageData.references = usageData.references.filter(ref => ref.localId !== orphaned.localId);

          if (usageData.references.length < originalLength) {
            staleUsageReferencesRemoved += (originalLength - usageData.references.length);

            if (usageData.references.length > 0) {
              await storage.set(usageKey, usageData);
            } else {
              await storage.delete(usageKey);
            }
          }
        }
      } catch (err) {
        logFailure('checkAllIncludes_OLD_SYNC_VERSION', 'Error cleaning usage data', err, { excerptId: orphaned.excerptId });
      }
    }

    // Final progress update
    await storage.set(`progress:${progressId}`, {
      phase: 'complete',
      total: totalIncludes,
      processed: totalIncludes,
      percent: 100,
      startTime,
      endTime: Date.now(),
      status: 'Complete!'
    });

    // Clean up progress data after a delay (frontend will have time to read it)
    setTimeout(async () => {
      try {
        await storage.delete(`progress:${progressId}`);
      } catch (err) {
        logFailure('checkAllIncludes_OLD_SYNC_VERSION', 'Error cleaning up progress data', err);
      }
    }, 60000); // 1 minute

    return {
      success: true,
      progressId, // Return this so frontend can poll for progress
      summary: {
        totalChecked: allMacroVars.results.length,
        activeCount: activeIncludes.length,
        orphanedCount: orphanedIncludes.length,
        brokenReferenceCount: brokenReferences.length,
        staleCount: staleIncludes.length,
        orphanedEntriesRemoved
      },
      activeIncludes,
      orphanedIncludes,
      brokenReferences,
      staleIncludes
    };

  } catch (error) {
    logFailure('checkAllIncludes', 'Error in checkAllIncludes', error);
    return {
      success: false,
      error: error.message,
      summary: {
        totalChecked: 0,
        activeCount: 0,
        orphanedCount: 0,
        brokenReferenceCount: 0,
        staleCount: 0,
        orphanedEntriesRemoved: 0
      },
      activeIncludes: [],
      orphanedIncludes: [],
      brokenReferences: [],
      staleIncludes: []
    };
  }
}
*/

// ============================================================================
// NEW ASYNC CHECK ALL INCLUDES - USES FORGE ASYNC EVENTS API
// ============================================================================

/**
 * Start Check All Includes - Trigger resolver for async processing
 *
 * This replaces the old synchronous checkAllIncludes function with an async
 * queue-based approach that can handle large scale operations (3,000+ Includes)
 * with real-time progress tracking.
 *
 * Architecture:
 * 1. This trigger pushes event to queue and returns immediately with jobId + progressId
 * 2. Consumer worker (src/workers/checkIncludesWorker.js) processes asynchronously
 * 3. Frontend polls getCheckProgress for real-time updates
 *
 * Returns immediately with:
 * - success: boolean
 * - jobId: string (for Async Events API job tracking)
 * - progressId: string (for progress polling via getCheckProgress)
 */
export async function startCheckAllIncludes(req) {
  try {
    // Extract dryRun parameter from request (defaults to true for safety)
    const { dryRun = true } = req.payload || {};

    logFunction('startCheckAllIncludes', 'Starting Check All Includes async operation', { dryRun });

    // Generate progressId for frontend polling
    const progressId = generateUUID();

    // Initialize progress state (queued)
    await storage.set(`progress:${progressId}`, {
      phase: 'queued',
      percent: 0,
      status: dryRun ? '🛡️ Job queued (dry-run mode)...' : 'Job queued (live mode)...',
      total: 0,
      processed: 0,
      queuedAt: new Date().toISOString(),
      dryRun
    });

    // Create queue and push event (include dryRun in payload)
    const queue = new Queue({ key: 'check-includes-queue' });
    const { jobId } = await queue.push({
      body: { progressId, dryRun }
    });

    logSuccess('startCheckAllIncludes', 'Job queued successfully', { jobId, progressId, dryRun });

    // Return immediately - consumer will process in background
    return {
      success: true,
      data: {
        jobId,
        progressId,
        dryRun,
        message: `Check All Includes job queued successfully (${dryRun ? 'dry-run' : 'live'} mode)`
      }
    };

  } catch (error) {
    logFailure('startCheckAllIncludes', 'Error starting Check All Includes', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Check All Includes - wrapper for backwards compatibility
 * Redirects to startCheckAllIncludes
 */
export async function checkAllIncludes(req) {
  return startCheckAllIncludes(req);
}

/**
 * Helper: Fetch all pages from a storage query cursor
 */
async function getAllKeysWithPrefix(prefix, maxPages = 50) {
  const allKeys = [];
  let cursor = await storage.query().where('key', startsWith(prefix)).getMany();
  let pageCount = 1;

  // Add first page
  allKeys.push(...(cursor.results || []));

  // Paginate through remaining pages with safety limit
  // Limit prevents infinite loops and timeout issues
  while (cursor.nextCursor && pageCount < maxPages) {
    cursor = await storage.query().where('key', startsWith(prefix)).cursor(cursor.nextCursor).getMany();
    allKeys.push(...(cursor.results || []));
    pageCount++;
  }

  // Log warning if we hit the page limit (indicates very large dataset)
  // Only warn if we actually processed multiple pages (not just a false positive from nextCursor)
  if (cursor.nextCursor && pageCount >= maxPages && pageCount > 1) {
    logWarning('getAllKeysWithPrefix', `Hit page limit (${maxPages}) for prefix "${prefix}". Results may be incomplete.`);
  }

  return allKeys;
}

/**
 * Get Storage Usage - Calculate total storage used across all keys
 *
 * Forge storage limit: 250MB per app
 * Returns usage in bytes, MB, and percentage of limit
 */
export async function getStorageUsage(_req) {
  try {
    logFunction('getStorageUsage', 'Calculating storage usage');

    // Query all keys from storage in parallel (with pagination)
    // This is much faster than sequential calls and reduces timeout risk
    // Use lower page limits for prefixes that might have many entries (versions, deleted)
    // Reduced version: limit to 20 pages to prevent timeout (can still calculate approximate usage)
    const [excerpts, excerptPrevious, usage, categories, versions, deleted, metadata] = await Promise.all([
      getAllKeysWithPrefix('excerpt:', 20),           // Sources (current) - typically < 200
      getAllKeysWithPrefix('excerpt-previous:', 20), // Sources (previous versions) - typically < 200
      getAllKeysWithPrefix('usage:', 20),             // Usage data - typically < 200
      getAllKeysWithPrefix('categories', 5),          // Categories - typically single key, but allow a few pages for safety
      getAllKeysWithPrefix('version:', 20),           // Versions (Embed versions only now) - reduced from 50 to 20 to prevent timeout
      getAllKeysWithPrefix('deleted:', 20),          // Deleted items - typically < 200
      getAllKeysWithPrefix('meta:', 10)               // Metadata - typically few keys
    ]);

    const allKeys = [
      ...excerpts,
      ...excerptPrevious,
      ...usage,
      ...categories,
      ...versions,
      ...deleted,
      ...metadata
    ];

    // Calculate total size in bytes
    let totalBytes = 0;
    const breakdown = {
      excerpts: 0,
      usage: 0,
      categories: 0,
      versions: 0,
      deleted: 0,
      metadata: 0
    };

    for (const item of allKeys) {
      const key = item.key;
      const value = item.value;

      // Calculate size: key + value (as JSON string)
      const keySize = new Blob([key]).size;
      const valueSize = new Blob([JSON.stringify(value)]).size;
      const itemSize = keySize + valueSize;

      totalBytes += itemSize;

      // Categorize
      if (key.startsWith('excerpt:') || key.startsWith('excerpt-previous:')) {
        breakdown.excerpts += itemSize;
      } else if (key.startsWith('usage:')) {
        breakdown.usage += itemSize;
      } else if (key.startsWith('categories')) {
        breakdown.categories += itemSize;
      } else if (key.startsWith('version:')) {
        breakdown.versions += itemSize;
      } else if (key.startsWith('deleted:')) {
        breakdown.deleted += itemSize;
      } else if (key.startsWith('meta:')) {
        breakdown.metadata += itemSize;
      }
    }

    // Convert to MB
    const totalMB = totalBytes / (1024 * 1024);
    const limitMB = 250;
    const warningThresholdMB = 100; // Warn at 40% of limit
    const percentUsed = (totalMB / limitMB) * 100;
    const exceedsWarningThreshold = totalMB >= warningThresholdMB;

    // Convert breakdown to MB
    const breakdownMB = {
      excerpts: breakdown.excerpts / (1024 * 1024),
      usage: breakdown.usage / (1024 * 1024),
      categories: breakdown.categories / (1024 * 1024),
      versions: breakdown.versions / (1024 * 1024),
      deleted: breakdown.deleted / (1024 * 1024),
      metadata: breakdown.metadata / (1024 * 1024)
    };

    // Count Sources (excerpts) and Embeds (usage references)
    const sourcesCount = excerpts.length;
    let embedsCount = 0;

    // Count total embeds by summing all usage references
    // Usage data structure: { excerptId, references: [...] }
    for (const usageItem of usage) {
      if (usageItem.value && usageItem.value.references && Array.isArray(usageItem.value.references)) {
        embedsCount += usageItem.value.references.length;
      }
    }

    if (exceedsWarningThreshold) {
      logWarning('getStorageUsage', `Storage usage exceeds warning threshold (${warningThresholdMB} MB)`, {
        totalMB: totalMB.toFixed(2),
        warningThresholdMB,
        limitMB,
        percentUsed: percentUsed.toFixed(1)
      });
    } else {
      logSuccess('getStorageUsage', 'Storage usage calculated', {
        totalMB: totalMB.toFixed(2),
        limitMB,
        percentUsed: percentUsed.toFixed(1),
        sourcesCount,
        embedsCount,
        breakdown: breakdownMB
      });
    }

    return {
      success: true,
      data: {
        totalBytes,
        totalMB: parseFloat(totalMB.toFixed(2)),
        limitMB,
        warningThresholdMB,
        percentUsed: parseFloat(percentUsed.toFixed(1)),
        exceedsWarningThreshold,
        keyCount: allKeys.length,
        sourcesCount,
        embedsCount,
        breakdown: {
          bytes: breakdown,
          mb: breakdownMB
        }
      }
    };

  } catch (error) {
    logFailure('getStorageUsage', 'Error calculating storage usage', error);
    return {
      success: false,
      error: error.message
    };
  }
}
