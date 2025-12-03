/**
 * Check All Includes - Async Worker
 *
 * This worker processes the Check All Includes operation asynchronously using
 * Forge's Async Events API v2. It runs in the background with up to 15 minutes
 * of execution time, writing progress updates to storage as it processes.
 *
 * Architecture:
 * 1. Frontend calls startCheckAllIncludes (trigger resolver)
 * 2. Trigger pushes event to queue and returns immediately with jobId + progressId
 * 3. This worker processes the event asynchronously
 * 4. Frontend polls getCheckProgress for real-time updates
 *
 * Progress Flow:
 * - 0%: Job queued
 * - 10%: Fetching excerpts index
 * - 25%: Starting page checks
 * - 25-95%: Processing pages (incremental progress)
 * - 95%: Finalizing results
 * - 100%: Complete
 */

import { storage } from '@forge/api';
import { updateProgress, calculatePhaseProgress, buildCompletionMessage } from './helpers/progress-tracker.js';
import { fetchPageContent, checkMacroExistsInADF, groupIncludesByPage } from './helpers/page-scanner.js';
import { handleOrphanedMacro, softDeleteMacroVars } from './helpers/orphan-detector.js';
import { attemptReferenceRepair, checkExcerptExists, buildRepairedRecord, buildBrokenRecord } from './helpers/reference-repairer.js';
import { createBackupSnapshot } from './helpers/backup-manager.js';
import { collectAllEmbedInstances, buildActiveIncludeRecord } from './helpers/usage-collector.js';
import { extractChapterBodyFromAdf } from '../utils/storage-format-utils.js';
import { logFunction, logPhase, logSuccess, logFailure, logWarning } from '../utils/forge-logger.js';

// SAFETY: Dry-run mode configuration
// Default is true (preview mode) - must be explicitly set to false for cleanup
const DEFAULT_DRY_RUN_MODE = true;

/**
 * Process Check All Includes operation asynchronously
 * This is the consumer function that processes queued events
 * @param {AsyncEvent} event - The async event from the queue (v2: payload is in event.body)
 * @param {Object} context - The context object with jobId, etc.
 */
export async function handler(event) {
  // In @forge/events v2, payload is in event.body, not event.payload
  const payload = event.payload || event.body || event;
  const { progressId, dryRun = DEFAULT_DRY_RUN_MODE } = payload;

  const functionStartTime = Date.now();
  logFunction('checkIncludesWorker', 'Starting Check All Includes', { progressId, dryRun });

  // CRITICAL SAFETY MESSAGE
  if (dryRun) {
    logPhase('checkIncludesWorker', 'DRY-RUN MODE ENABLED - No data will be deleted. Orphaned items will be logged only.');
  } else {
    logWarning('checkIncludesWorker', 'LIVE MODE - Deletions ENABLED. Orphaned data will be soft-deleted and moved to recovery namespace.');
  }

  try {
    // Phase 1: Initialize (0-5%)
    await updateProgress(progressId, {
      phase: 'initializing',
      percent: 0,
      status: dryRun ? '🛡️ DRY-RUN: Starting check (no deletions)...' : 'Starting check...',
      total: 0,
      processed: 0,
      dryRun: dryRun
    });

    // Phase 1.5: Create backup snapshot (5-10%)
    await updateProgress(progressId, {
      phase: 'backup',
      percent: 5,
      status: '💾 Creating backup snapshot...',
      total: 0,
      processed: 0,
      dryRun: dryRun
    });

    let backupId = null;
    try {
      backupId = await createBackupSnapshot('checkAllIncludes');

      await updateProgress(progressId, {
        phase: 'backup',
        percent: 10,
        status: `✅ Backup created: ${backupId.substring(0, 30)}...`,
        total: 0,
        processed: 0,
        backupId,
        dryRun: dryRun
      });
    } catch (backupError) {
      // Log backup failure but continue - don't block the check operation
      logWarning('checkIncludesWorker', 'Backup creation failed, continuing anyway', { error: backupError.message });

      await updateProgress(progressId, {
        phase: 'backup',
        percent: 10,
        status: '⚠️ Backup failed - continuing check...',
        total: 0,
        processed: 0,
        dryRun: dryRun
      });
    }

    // Phase 2: Fetch excerpts index (10-15%)
    await updateProgress(progressId, {
      phase: 'fetching',
      percent: 10,
      status: 'Fetching excerpts index...',
      total: 0,
      processed: 0
    });

    const index = await storage.get('excerpt-index') || { excerpts: [] };
    const excerptIds = index.excerpts.map(e => e.id);

    logPhase('checkIncludesWorker', 'Found excerpts to check', { count: excerptIds.length });

    await updateProgress(progressId, {
      phase: 'fetching',
      percent: 15,
      status: `Found ${excerptIds.length} excerpt(s)...`,
      total: 0,
      processed: 0
    });

    // Phase 3: Collect all usage data (15-25%)
    await updateProgress(progressId, {
      phase: 'collecting',
      percent: 15,
      status: 'Collecting usage data...',
      total: 0,
      processed: 0
    });

    const { uniqueIncludes } = await collectAllEmbedInstances(excerptIds);

    // Group by pageId for efficient checking
    const includesByPage = groupIncludesByPage(uniqueIncludes);
    const pageIds = Object.keys(includesByPage);
    const totalPages = pageIds.length;

    logPhase('checkIncludesWorker', 'Found Embed instances', { count: uniqueIncludes.length, pages: totalPages });

    await updateProgress(progressId, {
      phase: 'collecting',
      percent: 25,
      status: `Found ${uniqueIncludes.length} Embed(s) on ${totalPages} page(s)...`,
      total: totalPages,
      processed: 0
    });

    // Phase 4: Check each page (25-95%)
    const activeIncludes = [];
    const orphanedIncludes = [];
    const brokenReferences = [];
    const repairedReferences = [];
    const staleIncludes = [];
    const orphanedEntriesRemoved = [];

    let pagesProcessed = 0;

    for (const pageId of pageIds) {
      const pageIncludes = includesByPage[pageId];

      try {
        // Fetch page content to verify macro existence (with retry logic)
        const pageResult = await fetchPageContent(pageId);

        if (!pageResult.success) {
          // Distinguish between error types to prevent false positives
          const errorType = pageResult.errorType || 'unknown';
          const httpStatus = pageResult.httpStatus;

          // CRITICAL: 404 can mean either "page deleted" OR "page exists but app has no permission"
          // Confluence API may return 404 for permission-denied pages to avoid information leakage
          // Since we can't distinguish, we must be conservative and NOT mark as orphaned on 404
          // Only mark as orphaned if we can be 100% certain the page is deleted
          // For now, we treat 404 the same as permission errors - don't mark as orphaned
          
          if (errorType === 'permission_denied' || errorType === 'unauthorized' || httpStatus === 403 || httpStatus === 401) {
            // Permission error - don't mark as orphaned (may be temporary or app lacks permission)
            logWarning('checkIncludesWorker', 'Page access denied - not marking as orphaned', {
              pageId,
              error: pageResult.error,
              errorType,
              httpStatus
            });
            // These are not orphaned, just inaccessible to the app
          } else if (httpStatus === 404) {
            // 404 could mean deleted OR permission denied - be conservative, don't mark as orphaned
            // NOTE: This means we may miss some truly deleted pages, but prevents false positives
            logWarning('checkIncludesWorker', 'Page returned 404 - not marking as orphaned (could be permission issue)', {
              pageId,
              error: pageResult.error,
              errorType,
              httpStatus,
              note: '404 may indicate page deleted OR app lacks permission - being conservative'
            });
            // These are not orphaned - could be permission issue or actually deleted, but we can't tell
          } else if (errorType === 'transient_failure') {
            // Transient failure after retries - don't mark as orphaned
            logWarning('checkIncludesWorker', 'Page fetch failed after retries - not marking as orphaned', {
              pageId,
              error: pageResult.error,
              errorType,
              httpStatus
            });
            // These are not orphaned, just temporarily unavailable
          } else {
            // Unknown error type - be conservative, don't mark as orphaned
            logWarning('checkIncludesWorker', 'Page fetch failed with unknown error - not marking as orphaned', {
              pageId,
              error: pageResult.error,
              errorType,
              httpStatus
            });
          }
        } else {
          // Page exists - check each Embed instance
          const { pageData, adfContent } = pageResult;

          for (const include of pageIncludes) {
            try {
              // Validate localId before processing
              if (!include.localId || typeof include.localId !== 'string' || include.localId.trim() === '') {
                logWarning('checkIncludesWorker', 'Invalid localId - skipping include', {
                  localId: include.localId,
                  pageId,
                  include: include
                });
                // Mark as broken reference, not orphaned
                brokenReferences.push({
                  ...include,
                  reason: 'Invalid localId in usage data',
                  pageExists: true
                });
                continue;
              }

              // Validate ADF content before searching
              if (!adfContent || typeof adfContent !== 'object' || !adfContent.type) {
                logWarning('checkIncludesWorker', 'Invalid ADF content - skipping macro check', {
                  localId: include.localId,
                  pageId,
                  adfType: typeof adfContent
                });
                // Don't mark as orphaned - ADF validation failed, not macro missing
                // Continue to next include
                continue;
              }

              // Check if this localId exists in the ADF
              const macroExists = checkMacroExistsInADF(adfContent, include.localId);

              if (!macroExists) {
                const orphaned = await handleOrphanedMacro(include);
                orphanedIncludes.push(orphaned);
                
                // Actually soft-delete if not in dry-run mode
                if (!dryRun) {
                  await softDeleteMacroVars(
                    include.localId,
                    'Macro not found in page content',
                    { pageId: include.pageId, pageTitle: pageData?.title },
                    false // dryRun: false - actually delete
                  );
                  orphanedEntriesRemoved.push(include.localId);
                }
              } else {
                // Macro exists - check if referenced excerpt exists
                // Wrap in try/catch to prevent processing errors from marking as orphaned
                try {
                  await processActiveEmbed(
                    include,
                    pageData,
                    activeIncludes,
                    brokenReferences,
                    repairedReferences,
                    staleIncludes
                  );
                } catch (processError) {
                  // Processing error (storage read, data validation, etc.) - NOT an orphan
                  logFailure('checkIncludesWorker', 'Error processing active embed - NOT marking as orphaned', processError, {
                    localId: include.localId,
                    pageId,
                    errorType: processError.name
                  });
                  // Mark as broken reference if we can't process it, but don't mark as orphaned
                  brokenReferences.push({
                    ...include,
                    reason: `Processing error: ${processError.message}`,
                    pageExists: true
                  });
                }
              }
            } catch (includeError) {
              // Catch any other errors in the include processing loop
              logFailure('checkIncludesWorker', 'Unexpected error processing include - NOT marking as orphaned', includeError, {
                localId: include.localId,
                pageId,
                errorType: includeError.name
              });
              // Don't mark as orphaned - unknown error, be conservative
              brokenReferences.push({
                ...include,
                reason: `Unexpected error: ${includeError.message}`,
                pageExists: true
              });
            }
          }
        }
      } catch (error) {
        // CRITICAL: Do NOT mark as orphaned on processing errors
        // Only mark as orphaned if page fetch confirms deletion (404)
        // Processing errors (storage failures, ADF parsing, etc.) should NOT cause false positives
        logFailure('checkIncludesWorker', 'Error processing page - NOT marking as orphaned', error, { 
          pageId,
          includeCount: pageIncludes.length,
          errorType: error.name,
          errorMessage: error.message
        });
        
        // Log warning for each include that couldn't be checked
        // These are NOT orphaned - they just couldn't be verified due to processing error
        for (const include of pageIncludes) {
          logWarning('checkIncludesWorker', 'Include check skipped due to processing error', {
            localId: include.localId,
            pageId,
            error: error.message
          });
        }
        
        // NOTE: We intentionally do NOT add these to orphanedIncludes
        // They remain in active state until next successful check
        // This prevents false positives from transient errors
      }

      // Update progress
      pagesProcessed++;
      const percent = calculatePhaseProgress(pagesProcessed, totalPages, 25, 95);

      await updateProgress(progressId, {
        phase: 'processing',
        percent,
        status: `Checked page ${pagesProcessed}/${totalPages}...`,
        total: totalPages,
        processed: pagesProcessed
      });

    }

    // Phase 5: Finalize results (95-100%)
    await updateProgress(progressId, {
      phase: 'finalizing',
      percent: 95,
      status: 'Finalizing results...',
      total: totalPages,
      processed: totalPages
    });

    const summary = {
      totalChecked: uniqueIncludes.length,
      activeCount: activeIncludes.length,
      orphanedCount: orphanedIncludes.length,
      brokenReferenceCount: brokenReferences.length,
      repairedReferenceCount: repairedReferences.length,
      staleCount: staleIncludes.length,
      orphanedEntriesRemoved: orphanedEntriesRemoved.length,
      pagesChecked: totalPages
    };

    // Phase 6: Store final results and mark complete (100%)
    const finalResults = {
      summary,
      activeIncludes,
      orphanedIncludes,
      brokenReferences,
      repairedReferences,
      staleIncludes,
      orphanedEntriesRemoved,
      backupId, // Include backup ID for potential recovery operations
      completedAt: new Date().toISOString()
    };

    const completionStatus = buildCompletionMessage(
      dryRun,
      orphanedIncludes.length,
      repairedReferences.length,
      orphanedEntriesRemoved.length
    );

    await updateProgress(progressId, {
      phase: 'complete',
      percent: 100,
      status: completionStatus,
      total: totalPages,
      processed: totalPages,
      dryRun: dryRun,
      results: finalResults
    });

    logSuccess('checkIncludesWorker', 'Check All Includes complete', {
      progressId,
      duration: `${Date.now() - functionStartTime}ms`,
      summary
    });

    if (backupId) {
      logPhase('checkIncludesWorker', 'Backup available for recovery', { backupId });
    }

    // Phase: Refresh publication cache as safety net
    // This ensures the publication cache is up-to-date after the check
    await updateProgress(progressId, {
      phase: 'refreshing_publication_cache',
      percent: 98,
      status: '📊 Refreshing publication cache...',
      total: 0,
      processed: 0,
      dryRun: dryRun
    });

    try {
      await refreshAllPublicationStatus(activeIncludes);
      logSuccess('checkIncludesWorker', 'Publication cache refreshed');
    } catch (cacheError) {
      // Don't fail the whole operation if cache refresh fails
      logWarning('checkIncludesWorker', 'Publication cache refresh failed', { error: cacheError.message });
    }

    await updateProgress(progressId, {
      phase: 'complete',
      percent: 100,
      status: dryRun
        ? `✅ DRY-RUN complete - ${summary.pagesChecked} pages checked`
        : `✅ Complete - ${summary.pagesChecked} pages checked`,
      total: summary.pagesChecked,
      processed: summary.pagesChecked,
      summary,
      backupId,
      dryRun: dryRun,
      results: finalResults
    });

    return {
      success: true,
      progressId,
      summary,
      backupId
    };

  } catch (error) {
    logFailure('checkIncludesWorker', 'Fatal error in Check All Includes', error, { progressId });

    await updateProgress(progressId, {
      phase: 'error',
      percent: 0,
      status: `Error: ${error.message}`,
      total: 0,
      processed: 0,
      error: error.message
    });

    return {
      success: false,
      error: error.message,
      progressId
    };
  }
}

/**
 * Process an active Embed (macro exists on page)
 * Checks if excerpt exists, repairs broken references, and detects staleness
 */
async function processActiveEmbed(
  include,
  pageData,
  activeIncludes,
  brokenReferences,
  repairedReferences,
  staleIncludes
) {
  const excerptId = include.excerptId;

  // Handle missing excerptId (attempt repair)
  if (!excerptId) {
    const repairResult = await attemptReferenceRepair(include);

    if (!repairResult.repaired) {
      brokenReferences.push(buildBrokenRecord(include, repairResult.error, repairResult.excerptId));
      return;
    }

    // Repair successful - update include with repaired excerptId
    include.excerptId = repairResult.excerptId;
    repairedReferences.push(
      buildRepairedRecord(
        include.localId,
        include.pageId,
        include.pageTitle || pageData.title,
        repairResult.excerptId,
        repairResult.excerpt.name
      )
    );
  }

  // Check if referenced excerpt exists
  const excerptCheck = await checkExcerptExists(include.excerptId);

  if (!excerptCheck.exists) {
    brokenReferences.push(buildBrokenRecord(include, 'Referenced excerpt not found', include.excerptId));
    return;
  }

  // Active Include - check if stale and collect metadata

  const macroVars = await storage.get(`macro-vars:${include.localId}`);
  const cacheData = await storage.get(`macro-cache:${include.localId}`);

  const activeRecord = buildActiveIncludeRecord(
    include,
    pageData,
    excerptCheck.excerpt,
    macroVars,
    cacheData
  );

  activeIncludes.push(activeRecord);

  if (activeRecord.isStale) {
    staleIncludes.push(activeRecord);
  }
}

// Publication cache key - shared with pageSyncWorker
const PUBLICATION_CACHE_KEY = 'published-embeds-cache';

/**
 * Refresh the publication cache for all active embeds
 * Called at the end of Check All Includes as a safety net
 * 
 * This builds the publication cache from scratch using the active embeds
 * that were verified during the check operation.
 * 
 * @param {Array} activeIncludes - Array of active embed records from the check
 */
async function refreshAllPublicationStatus(activeIncludes) {
  logPhase('refreshAllPublicationStatus', 'Starting full publication cache refresh', { 
    activeCount: activeIncludes.length 
  });

  // Group active includes by pageId
  const includesByPage = {};
  for (const include of activeIncludes) {
    if (include.pageId) {
      if (!includesByPage[include.pageId]) {
        includesByPage[include.pageId] = [];
      }
      includesByPage[include.pageId].push(include);
    }
  }

  const pageIds = Object.keys(includesByPage);
  const publishedEmbeds = [];
  const byExcerptId = {};
  const byPageId = {};

  // Fetch pages in batches and extract injected content
  const PAGE_BATCH_SIZE = 20;
  
  for (let i = 0; i < pageIds.length; i += PAGE_BATCH_SIZE) {
    const batchPageIds = pageIds.slice(i, i + PAGE_BATCH_SIZE);
    
    const pageResults = await Promise.all(
      batchPageIds.map(async (pageId) => {
        try {
          const result = await fetchPageContent(pageId);
          return { pageId, result };
        } catch (error) {
          logWarning('refreshAllPublicationStatus', 'Failed to fetch page', { pageId, error: error.message });
          return { pageId, result: { success: false } };
        }
      })
    );

    for (const { pageId, result } of pageResults) {
      if (!result.success || !result.adfContent) continue;
      
      const { adfContent, pageData } = result;
      const pageTitle = pageData?.title || `Page ${pageId}`;
      const includesOnPage = includesByPage[pageId];
      const localIdsOnPage = [];

      for (const include of includesOnPage) {
        const localId = include.localId;
        const excerptId = include.excerptId;
        
        // Extract injected content for this embed
        const injectedContent = extractChapterBodyFromAdf(adfContent, localId);
        
        if (injectedContent) {
          localIdsOnPage.push(localId);
          
          const publishedEmbed = {
            localId,
            excerptId,
            pageId,
            pageTitle,
            variableValues: include.variableValues || {},
            toggleStates: include.toggleStates || {},
            lastSynced: include.lastSynced || null,
            publishedAt: include.publishedAt || new Date().toISOString(),
            hasInjectedContent: true
          };
          
          publishedEmbeds.push(publishedEmbed);
          
          // Build byExcerptId index
          if (!byExcerptId[excerptId]) {
            byExcerptId[excerptId] = {
              refreshedAt: Date.now(),
              embeds: []
            };
          }
          byExcerptId[excerptId].embeds.push(publishedEmbed);
        }
      }

      // Build byPageId index
      if (localIdsOnPage.length > 0) {
        byPageId[pageId] = localIdsOnPage;
      }
    }
  }

  // Build and save the publication cache
  const cache = {
    timestamp: Date.now(),
    totalPublished: publishedEmbeds.length,
    byExcerptId,
    byPageId
  };

  await storage.set(PUBLICATION_CACHE_KEY, cache);

  logSuccess('refreshAllPublicationStatus', 'Publication cache refreshed', {
    totalPublished: publishedEmbeds.length,
    sourcesWithEmbeds: Object.keys(byExcerptId).length,
    pagesWithEmbeds: Object.keys(byPageId).length
  });
}
