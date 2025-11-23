/**
 * Check All Sources - Async Worker
 *
 * This worker processes the Check All Sources operation asynchronously using
 * Forge's Async Events API v2. It runs in the background with up to 15 minutes
 * of execution time, writing progress updates to storage as it processes.
 *
 * Architecture:
 * 1. Frontend calls startCheckAllSources (trigger resolver)
 * 2. Trigger pushes event to queue and returns immediately with jobId + progressId
 * 3. This worker processes the event asynchronously
 * 4. Frontend polls getCheckProgress for real-time updates
 *
 * Progress Flow:
 * - 0%: Job queued
 * - 10%: Loading excerpts index
 * - 20%: Grouping excerpts by page
 * - 20-90%: Checking pages (incremental progress)
 * - 90-100%: Finalizing results
 */

import { storage } from '@forge/api';
import api, { route } from '@forge/api';
import { updateProgress, calculatePhaseProgress } from './helpers/progress-tracker.js';
import { extractVariablesFromAdf } from '../utils/adf-utils.js';
import { validateExcerptData } from '../utils/storage-validator.js';
import { logFunction, logPhase, logSuccess, logFailure, logWarning } from '../utils/forge-logger.js';

/**
 * Process Check All Sources operation asynchronously
 * This is the consumer function that processes queued events
 * @param {AsyncEvent} event - The async event from the queue (v2: payload is in event.body)
 * @param {Object} context - The context object with jobId, etc.
 */
export async function handler(event) {
  // In @forge/events v2, payload is in event.body, not event.payload
  const payload = event.payload || event.body || event;
  const { progressId } = payload;

  const functionStartTime = Date.now();
  logFunction('checkSourcesWorker', 'Starting Check All Sources', { progressId });

  try {
    // Phase 1: Initialize (0-10%)
    await updateProgress(progressId, {
      phase: 'initializing',
      percent: 0,
      status: 'Loading excerpts...',
      total: 0,
      processed: 0
    });

    // Get all excerpts from the index
    const excerptIndex = await storage.get('excerpt-index') || { excerpts: [] };
    logPhase('checkSourcesWorker', 'Total excerpts to check', { count: excerptIndex.excerpts.length });

    await updateProgress(progressId, {
      phase: 'loading',
      percent: 10,
      status: 'Grouping excerpts by page...',
      total: excerptIndex.excerpts.length,
      processed: 0
    });

    // Load all excerpts and group by page to minimize API calls
    const excerptsByPage = new Map(); // pageId -> [excerpts]
    const skippedExcerpts = [];

    for (const excerptSummary of excerptIndex.excerpts) {
      const excerpt = await storage.get(`excerpt:${excerptSummary.id}`);
      if (!excerpt) continue;

      // Skip if this excerpt doesn't have page info
      if (!excerpt.sourcePageId || !excerpt.sourceLocalId) {
        skippedExcerpts.push(excerpt.name);
        continue;
      }

      if (!excerptsByPage.has(excerpt.sourcePageId)) {
        excerptsByPage.set(excerpt.sourcePageId, []);
      }
      excerptsByPage.get(excerpt.sourcePageId).push(excerpt);
    }

    logPhase('checkSourcesWorker', 'Grouped excerpts by page', {
      totalPages: excerptsByPage.size,
      skippedCount: skippedExcerpts.length
    });

    await updateProgress(progressId, {
      phase: 'checking',
      percent: 20,
      status: `Checking ${excerptsByPage.size} pages...`,
      total: excerptIndex.excerpts.length,
      processed: 0,
      totalPages: excerptsByPage.size,
      currentPage: 0
    });

    // Phase 2: Check each page (20-90%)
    const orphanedSources = [];
    const checkedSources = [];
    let contentConversionsCount = 0;

    let pageNumber = 0;
    for (const [pageId, pageExcerpts] of excerptsByPage.entries()) {
      pageNumber++;

      try {
        // STEP 1: Fetch in storage format for orphan detection (proven to work)
        const storageResponse = await api.asApp().requestConfluence(
          route`/wiki/api/v2/pages/${pageId}?body-format=storage`,
          {
            headers: {
              'Accept': 'application/json'
            }
          }
        );

        if (!storageResponse.ok) {
          logWarning('checkSourcesWorker', 'Page not accessible', { pageId, excerptCount: pageExcerpts.length });
          pageExcerpts.forEach(excerpt => {
            orphanedSources.push({
              ...excerpt,
              orphanedReason: 'Source page not found or deleted'
            });
          });
          
          // Update progress
          const percentComplete = calculatePhaseProgress(pageNumber, excerptsByPage.size, 20, 90);
          await updateProgress(progressId, {
            phase: 'checking',
            status: `Checked page ${pageNumber} of ${excerptsByPage.size}...`,
            percent: percentComplete,
            total: excerptIndex.excerpts.length,
            processed: checkedSources.length + orphanedSources.length,
            totalPages: excerptsByPage.size,
            currentPage: pageNumber
          });
          continue;
        }

        const storageData = await storageResponse.json();
        const storageBody = storageData?.body?.storage?.value || '';

        if (!storageBody) {
          logWarning('checkSourcesWorker', 'No storage body found for page', { pageId });
          pageExcerpts.forEach(excerpt => {
            orphanedSources.push({
              ...excerpt,
              orphanedReason: 'Unable to read page content'
            });
          });
          
          // Update progress
          const percentComplete = calculatePhaseProgress(pageNumber, excerptsByPage.size, 20, 90);
          await updateProgress(progressId, {
            phase: 'checking',
            status: `Checked page ${pageNumber} of ${excerptsByPage.size}...`,
            percent: percentComplete,
            total: excerptIndex.excerpts.length,
            processed: checkedSources.length + orphanedSources.length,
            totalPages: excerptsByPage.size,
            currentPage: pageNumber
          });
          continue;
        }

        // STEP 2: Check which Sources exist on the page (string matching - works for all Sources)
        const sourcesToConvert = []; // Track Sources that need conversion

        for (const excerpt of pageExcerpts) {
          const macroExists = storageBody.includes(excerpt.sourceLocalId);

          if (!macroExists) {
            orphanedSources.push({
              ...excerpt,
              orphanedReason: 'Macro deleted from source page'
            });
            continue;
          }

          // Source exists on page
          checkedSources.push(excerpt.name);

          // Check if content needs conversion (Storage Format XML -> ADF JSON)
          const needsConversion = excerpt.content && typeof excerpt.content === 'string';
          if (needsConversion) {
            sourcesToConvert.push(excerpt);
          }
        }

        // STEP 3: If any Sources need conversion, fetch page in ADF format
        // PHASE 3 (v7.19.0): RE-ENABLED WITH VERSIONING PROTECTION
        if (sourcesToConvert.length > 0) {
          logPhase('checkSourcesWorker', 'Sources need conversion', { count: sourcesToConvert.length, pageId });

          const adfResponse = await api.asApp().requestConfluence(
            route`/wiki/api/v2/pages/${pageId}?body-format=atlas_doc_format`,
            {
              headers: {
                'Accept': 'application/json'
              }
            }
          );

          if (!adfResponse.ok) {
            logWarning('checkSourcesWorker', 'Could not fetch ADF for page', { pageId });
          } else {
            const adfData = await adfResponse.json();
            const adfBody = adfData?.body?.atlas_doc_format?.value;

            if (!adfBody) {
              logWarning('checkSourcesWorker', 'No ADF body found for page', { pageId });
            } else {
              const adfDoc = typeof adfBody === 'string' ? JSON.parse(adfBody) : adfBody;

              // Find all bodiedExtension nodes
              const findExtensions = (node, extensions = []) => {
                if (node.type === 'bodiedExtension' && node.attrs?.extensionKey?.includes('blueprint-standard-source')) {
                  extensions.push(node);
                }
                if (node.content) {
                  for (const child of node.content) {
                    findExtensions(child, extensions);
                  }
                }
                return extensions;
              };

              const extensionNodes = findExtensions(adfDoc);
              logPhase('checkSourcesWorker', 'Found extension nodes in ADF', { count: extensionNodes.length });

              // Convert each Source that needs it (with versioning protection)
              for (const excerpt of sourcesToConvert) {
                const extensionNode = extensionNodes.find(node =>
                  node.attrs?.localId === excerpt.sourceLocalId
                );

                if (!extensionNode || !extensionNode.content) {
                  logWarning('checkSourcesWorker', 'Could not find ADF node for excerpt', { excerptName: excerpt.name });
                  continue;
                }

                // ═══════════════════════════════════════════════════════════════════════
                // PHASE 3 FORMAT CONVERSION
                // ═══════════════════════════════════════════════════════════════════════
                // Note: Source versioning removed - only current contentHash needed for staleness detection
                // Embed versioning is still active for data recovery purposes
                logPhase('checkSourcesWorker', '[PHASE 3] Converting from Storage Format to ADF JSON', { excerptName: excerpt.name });

                // Perform conversion
                logPhase('checkSourcesWorker', '[PHASE 3] Converting from Storage Format to ADF JSON', { excerptName: excerpt.name });

                try {
                  // Extract ADF content from the bodiedExtension node
                  const bodyContent = {
                    type: 'doc',
                    version: 1,
                    content: extensionNode.content
                  };

                  // Extract variables from ADF content
                  const variables = extractVariablesFromAdf(bodyContent);

                  // Generate content hash
                  const crypto = require('crypto');
                  const contentHash = crypto.createHash('sha256').update(JSON.stringify(bodyContent)).digest('hex');

                  // Create converted excerpt object
                  const convertedExcerpt = {
                    ...excerpt,
                    content: bodyContent,
                    variables: variables,
                    contentHash: contentHash,
                    updatedAt: new Date().toISOString()
                  };

                  // STEP 2: Post-conversion validation
                  logPhase('checkSourcesWorker', '[PHASE 3] Validating converted data', { excerptName: excerpt.name });
                  const validation = validateExcerptData(convertedExcerpt);

                  if (!validation.valid) {
                    // VALIDATION FAILED - Skip conversion (no rollback needed, original data unchanged)
                    logFailure('checkSourcesWorker', '[PHASE 3] Validation FAILED', new Error(validation.errors.join(', ')), { excerptName: excerpt.name });
                    logWarning('checkSourcesWorker', '[PHASE 3] Conversion skipped - Source remains in Storage Format', { excerptName: excerpt.name });
                    continue; // Skip to next Source
                  }

                  // STEP 3: Validation passed - save converted data
                  logPhase('checkSourcesWorker', '[PHASE 3] Validation passed', { excerptName: excerpt.name });
                  await storage.set(`excerpt:${excerpt.id}`, convertedExcerpt);
                  logSuccess('checkSourcesWorker', '[PHASE 3] Converted to ADF JSON', { excerptName: excerpt.name, variablesCount: variables.length });
                  contentConversionsCount++;

                } catch (conversionError) {
                  // CONVERSION ERROR - Skip conversion (no rollback needed, original data unchanged)
                  logFailure('checkSourcesWorker', '[PHASE 3] Conversion ERROR', conversionError, { excerptName: excerpt.name });
                  logWarning('checkSourcesWorker', '[PHASE 3] Conversion skipped - Source remains in Storage Format', { excerptName: excerpt.name });
                  continue; // Skip to next Source
                }
              }
            }
          }
        }
      } catch (apiError) {
        logFailure('checkSourcesWorker', 'Error checking page', apiError, { pageId });
        pageExcerpts.forEach(excerpt => {
          orphanedSources.push({
            ...excerpt,
            orphanedReason: `API error: ${apiError.message}`
          });
        });
      }

      // Update progress after each page
      const percentComplete = calculatePhaseProgress(pageNumber, excerptsByPage.size, 20, 90);
      await updateProgress(progressId, {
        phase: 'checking',
        status: `Checked page ${pageNumber} of ${excerptsByPage.size}...`,
        percent: percentComplete,
        total: excerptIndex.excerpts.length,
        processed: checkedSources.length + orphanedSources.length,
        totalPages: excerptsByPage.size,
        currentPage: pageNumber
      });

    }

    // Phase 3: Finalize results (90-100%)
    await updateProgress(progressId, {
      phase: 'finalizing',
      percent: 90,
      status: 'Finalizing results...',
      total: excerptIndex.excerpts.length,
      processed: checkedSources.length + orphanedSources.length
    });

    // Build completion status message
    let statusMessage = `Complete! ${checkedSources.length} active, ${orphanedSources.length} orphaned`;
    if (contentConversionsCount > 0) {
      statusMessage += `, ${contentConversionsCount} converted to ADF`;
    }

    const finalResults = {
      orphanedSources,
      checkedCount: checkedSources.length + orphanedSources.length,
      activeCount: checkedSources.length,
      staleEntriesRemoved: 0, // Not running cleanup
      contentConversionsCount,
      completedAt: new Date().toISOString()
    };

    // Mark as complete
    await updateProgress(progressId, {
      phase: 'complete',
      status: statusMessage,
      percent: 100,
      total: excerptIndex.excerpts.length,
      processed: checkedSources.length + orphanedSources.length,
      activeCount: checkedSources.length,
      orphanedCount: orphanedSources.length,
      contentConversionsCount,
      results: finalResults
    });

    logSuccess('checkSourcesWorker', 'Check All Sources complete', {
      progressId,
      duration: `${Date.now() - functionStartTime}ms`,
      activeCount: checkedSources.length,
      orphanedCount: orphanedSources.length,
      conversionsCount: contentConversionsCount
    });

    return {
      success: true,
      progressId,
      summary: {
        checkedCount: checkedSources.length + orphanedSources.length,
        activeCount: checkedSources.length,
        orphanedCount: orphanedSources.length,
        contentConversionsCount
      }
    };

  } catch (error) {
    logFailure('checkSourcesWorker', 'Fatal error in Check All Sources', error, { progressId });

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

