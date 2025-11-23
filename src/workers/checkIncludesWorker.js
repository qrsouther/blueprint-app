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
import { handlePageNotFound, handleOrphanedMacro } from './helpers/orphan-detector.js';
import { attemptReferenceRepair, checkExcerptExists, buildRepairedRecord, buildBrokenRecord } from './helpers/reference-repairer.js';
import { createBackupSnapshot } from './helpers/backup-manager.js';
import { collectAllEmbedInstances, buildActiveIncludeRecord } from './helpers/usage-collector.js';
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

          // Only mark as orphaned if page is confirmed deleted (404)
          // Permission errors (403, 401) and transient failures should NOT mark as orphaned
          if (errorType === 'page_deleted' && httpStatus === 404) {
            // Page confirmed deleted - legitimate orphan
            logWarning('checkIncludesWorker', 'Page confirmed deleted', { pageId, error: pageResult.error });

            const orphaned = await handlePageNotFound(pageIncludes, pageResult.error, dryRun);
            orphanedIncludes.push(...orphaned);
            orphanedEntriesRemoved.push(...pageIncludes.map(inc => inc.localId));
          } else if (errorType === 'permission_denied' || errorType === 'unauthorized') {
            // Permission error - don't mark as orphaned (may be temporary)
            logWarning('checkIncludesWorker', 'Page access denied - not marking as orphaned', {
              pageId,
              error: pageResult.error,
              errorType,
              httpStatus
            });
            // Add to a separate list for reporting (optional)
            // These are not orphaned, just inaccessible
          } else if (errorType === 'transient_failure') {
            // Transient failure after retries - don't mark as orphaned
            logWarning('checkIncludesWorker', 'Page fetch failed after retries - not marking as orphaned', {
              pageId,
              error: pageResult.error,
              errorType,
              httpStatus
            });
            // Add to a separate list for reporting (optional)
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
            // Check if this localId exists in the ADF
            const macroExists = checkMacroExistsInADF(adfContent, include.localId);

            if (!macroExists) {
              const orphaned = await handleOrphanedMacro(include, pageData, dryRun);
              orphanedIncludes.push(orphaned);
              orphanedEntriesRemoved.push(include.localId);
            } else {
              // Macro exists - check if referenced excerpt exists
              await processActiveEmbed(
                include,
                pageData,
                activeIncludes,
                brokenReferences,
                repairedReferences,
                staleIncludes
              );
            }
          }
        }
      } catch (error) {
        logFailure('checkIncludesWorker', 'Error checking page', error, { pageId });
        // Mark all Includes on this page as orphaned due to error
        for (const include of pageIncludes) {
          orphanedIncludes.push({
            ...include,
            reason: `Error checking page: ${error.message}`,
            pageExists: false
          });
        }
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
