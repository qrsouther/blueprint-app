/**
 * Prune Versions - Async Worker
 *
 * This worker processes version pruning asynchronously using Forge's Async Events API v2.
 * It runs in the background with up to 15 minutes of execution time, processing all
 * version data with pagination to handle large datasets (50+ pages).
 *
 * Architecture:
 * 1. Frontend calls startPruneVersions (trigger resolver)
 * 2. Trigger pushes event to queue and returns immediately with jobId + progressId
 * 3. This worker processes the event asynchronously
 * 4. Frontend polls getCheckProgress for real-time updates
 *
 * Progress Flow:
 * - 0%: Job queued
 * - 10%: Fetching all version keys (with pagination)
 * - 20-90%: Processing versions (incremental progress)
 * - 90%: Updating version indexes
 * - 100%: Complete
 */

import { storage, startsWith } from '@forge/api';
import { updateProgress, calculatePhaseProgress } from './helpers/progress-tracker.js';
import { logFunction, logPhase, logSuccess, logFailure, logStorageOp } from '../utils/forge-logger.js';
import { parseVersionId } from '../utils/version-manager.js';

/**
 * Process version pruning operation asynchronously
 * @param {AsyncEvent} event - The async event from the queue (v2: payload is in event.body)
 */
export async function handler(event) {
  // In @forge/events v2, payload is in event.body, not event.payload
  const payload = event.payload || event.body || event;
  const { progressId, onlySourceVersions = false, sourceRetentionMinutes = 2, maxVersions = 1000 } = payload;

  // const functionStartTime = Date.now(); // Reserved for future performance tracking
  logFunction('pruneVersionsWorker', 'Starting version pruning', { progressId, onlySourceVersions, sourceRetentionMinutes });

  try {
    // Initialize progress
    await updateProgress(progressId, {
      phase: 'initializing',
      status: 'Starting version pruning...',
      percent: 0
    });

    const now = Date.now();
    const retentionMs = sourceRetentionMinutes * 60 * 1000; // Convert minutes to milliseconds
    const cutoffTime = now - retentionMs;

    logPhase('pruneVersionsWorker', `Pruning versions older than ${sourceRetentionMinutes} minutes`, {
      cutoffDate: new Date(cutoffTime).toISOString(),
      onlySourceVersions
    });

    // Step 1: Fetch version keys with pagination (limit to maxVersions for piecemeal processing)
    await updateProgress(progressId, {
      phase: 'fetching',
      status: 'Fetching version keys...',
      percent: 10
    });

    const allVersions = [];
    let cursor = await storage.query()
      .where('key', startsWith('version:'))
      .getMany();
    let pageCount = 1;

    // Add first page
    allVersions.push(...(cursor.results || []));

    // Paginate through pages, but limit to maxVersions (for piecemeal processing)
    while (cursor.nextCursor && (maxVersions === null || allVersions.length < maxVersions)) {
      cursor = await storage.query()
        .where('key', startsWith('version:'))
        .cursor(cursor.nextCursor)
        .getMany();
      allVersions.push(...(cursor.results || []));
      pageCount++;

      // Update progress every 5 pages
      if (pageCount % 5 === 0) {
        const percent = Math.min(10 + Math.floor((pageCount / 100) * 10), 20); // 10-20% for fetching
        await updateProgress(progressId, {
          phase: 'fetching',
          status: `Fetched ${pageCount} pages, found ${allVersions.length} version(s)...`,
          percent
        });
      }
      
      // Stop if we've reached the version limit
      if (maxVersions !== null && allVersions.length >= maxVersions) {
        break;
      }
    }

    // Trim to maxVersions if we exceeded it
    if (maxVersions !== null && allVersions.length > maxVersions) {
      allVersions.splice(maxVersions);
    }

    const hasMorePages = cursor.nextCursor;
    logPhase('pruneVersionsWorker', `Found ${allVersions.length} total version snapshot(s) across ${pageCount} page(s)${hasMorePages ? ' (more pages available)' : ''}`);

    // Step 2: Process versions
    let prunedCount = 0;
    let skippedCount = 0;
    const errors = [];
    const totalVersions = allVersions.length;

    await updateProgress(progressId, {
      phase: 'processing',
      status: `Processing ${totalVersions} version(s)...`,
      percent: 20,
      total: totalVersions,
      processed: 0
    });

    // Process in batches to update progress regularly
    const BATCH_SIZE = 100;
    for (let i = 0; i < allVersions.length; i += BATCH_SIZE) {
      const batch = allVersions.slice(i, i + BATCH_SIZE);
      
      for (const entry of batch) {
        try {
          const versionSnapshot = entry.value;

          // If onlySourceVersions is true, skip Embed versions (macro-vars)
          if (onlySourceVersions && versionSnapshot.entityType !== 'excerpt') {
            skippedCount++;
            continue;
          }

          const versionTimestamp = new Date(versionSnapshot.timestamp).getTime();

          if (versionTimestamp < cutoffTime) {
            // Version is expired, delete it
            await storage.delete(entry.key);
            logStorageOp('pruneVersionsWorker', 'DELETE', entry.key, true);
            prunedCount++;

            // Update version index
            const { entityId } = parseVersionId(entry.key);
            const versionIndex = await storage.get(`version-index:${entityId}`);
            if (versionIndex && versionIndex.versions) {
              versionIndex.versions = versionIndex.versions.filter(v => v.versionId !== entry.key);
              await storage.set(`version-index:${entityId}`, versionIndex);
            }
          } else {
            skippedCount++;
          }
        } catch (pruneError) {
          errors.push({
            versionId: entry.key,
            error: pruneError.message
          });
          logFailure('pruneVersionsWorker', `Failed to prune version: ${entry.key}`, pruneError);
        }
      }

      // Update progress after each batch
      const processed = Math.min(i + BATCH_SIZE, totalVersions);
      const percent = calculatePhaseProgress(processed, totalVersions, 20, 90);
      await updateProgress(progressId, {
        phase: 'processing',
        status: `Processed ${processed}/${totalVersions} version(s)...`,
        percent,
        total: totalVersions,
        processed
      });
    }

    // Step 3: Finalize
    await updateProgress(progressId, {
      phase: 'complete',
      status: 'Pruning complete!',
      percent: 100,
      total: totalVersions,
      processed: totalVersions
    });

    // Update last prune time only if all pages were processed (no more pages available)
    if (!hasMorePages) {
      if (onlySourceVersions) {
        await storage.set('last-source-prune-time', new Date().toISOString());
      } else {
        await storage.set('last-prune-time', new Date().toISOString());
      }
    } else {
      // More pages available - delete timestamp so next run will continue
      if (onlySourceVersions) {
        await storage.delete('last-source-prune-time');
      }
    }

    logSuccess('pruneVersionsWorker', `Pruning complete`, {
      pruned: prunedCount,
      kept: skippedCount,
      errors: errors.length,
      totalVersions,
      pagesProcessed: pageCount,
      hasMorePages
    });

    return {
      success: true,
      prunedCount,
      skippedCount,
      errors,
      totalVersions,
      pagesProcessed: pageCount,
      hasMorePages
    };

  } catch (error) {
    logFailure('pruneVersionsWorker', 'Failed to prune versions', error);
    await updateProgress(progressId, {
      phase: 'error',
      status: `Error: ${error.message}`,
      percent: 0
    });
    return {
      success: false,
      error: error.message
    };
  }
}

