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
 * - 0-10%: Loading excerpts from storage
 * - 10-20%: Grouping excerpts by page
 * - 20-90%: Checking pages and running backfills
 * - 90-100%: Finalizing results
 *
 * Primary Functions:
 * 1. Bespoke property backfill - ensures all Sources have bespoke:false
 * 2. Smart case matching backfill - adds sentence-start occurrence data
 * 3. Storage Format to ADF conversion - converts old XML content to ADF JSON
 * 4. excerpt-index repair - rebuilds index if out of sync
 *
 * Note: Orphan detection and soft-deletion is now handled in real-time by
 * pageSyncWorker using the BEFORE/AFTER comparison approach. This worker
 * focuses on maintenance/backfill operations.
 */

import { storage, startsWith } from '@forge/api';
import api, { route } from '@forge/api';
import { updateProgress, calculatePhaseProgress } from './helpers/progress-tracker.js';
import { extractVariablesFromAdf } from '../utils/adf-utils.js';
import { validateExcerptData } from '../utils/storage-validator.js';
import { detectVariableOccurrences, mergeOccurrencesIntoVariables, detectVariablesWithToggleContext } from '../utils/detection-utils.js';
import { calculateContentHash } from '../utils/hash-utils.js';
import { logFunction, logPhase, logSuccess, logFailure, logWarning } from '../utils/forge-logger.js';

/**
 * Process Check All Sources operation asynchronously
 * This is the consumer function that processes queued events
 * 
 * @param {AsyncEvent} event - The async event from the queue (v2: payload is in event.body)
 * @param {Object} event.body.progressId - Progress tracking ID
 * @param {Object} context - The context object with jobId, etc.
 * 
 * Primary Functions:
 * 1. Bespoke property backfill - ensures all Sources have bespoke:false
 * 2. Smart case matching backfill - adds sentence-start occurrence data
 * 3. Storage Format to ADF conversion - converts old XML content to ADF JSON
 * 4. excerpt-index repair - rebuilds index if out of sync
 * 
 * Note: Orphan detection is now handled by pageSyncWorker in real-time.
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
      status: 'Loading excerpts from storage...',
      total: 0,
      processed: 0
    });

    // Query all excerpts directly from storage (not via index, which may be stale/missing)
    // This matches how getAllExcerpts works, ensuring consistency
    const allExcerpts = [];
    let cursor = await storage.query().where('key', startsWith('excerpt:')).getMany();
    let pageCount = 1;
    const maxPages = 20; // Safety limit to prevent timeouts

    // Add first page
    if (cursor.results && cursor.results.length > 0) {
      const excerpts = cursor.results
        .map(item => ({ ...item.value, id: item.key.replace('excerpt:', '') }))
        .filter(value => value !== null && value !== undefined);
      allExcerpts.push(...excerpts);
    }

    // Paginate through remaining pages
    while (cursor.nextCursor && pageCount < maxPages) {
      cursor = await storage.query()
        .where('key', startsWith('excerpt:'))
        .cursor(cursor.nextCursor)
        .getMany();
      
      if (cursor.results && cursor.results.length > 0) {
        const excerpts = cursor.results
          .map(item => ({ ...item.value, id: item.key.replace('excerpt:', '') }))
          .filter(value => value !== null && value !== undefined);
        allExcerpts.push(...excerpts);
      }
      pageCount++;
    }

    if (cursor.nextCursor && pageCount >= maxPages) {
      logWarning('checkSourcesWorker', `Hit page limit (${maxPages}) for excerpt query. Results may be incomplete.`);
    }

    logPhase('checkSourcesWorker', 'Loaded excerpts directly from storage', { 
      count: allExcerpts.length,
      pages: pageCount 
    });

    // Check and auto-repair the excerpt-index if missing or out of sync
    const excerptIndex = await storage.get('excerpt-index');
    const indexCount = excerptIndex?.excerpts?.length || 0;
    const needsRepair = !excerptIndex || indexCount !== allExcerpts.length;

    if (needsRepair) {
      logWarning('checkSourcesWorker', 'excerpt-index needs repair', {
        indexExists: !!excerptIndex,
        indexCount,
        storageCount: allExcerpts.length,
        action: 'AUTO-REBUILDING'
      });

      // Rebuild the index from the actual storage data
      const rebuiltIndex = {
        excerpts: allExcerpts.map(excerpt => ({
          id: excerpt.id,
          name: excerpt.name || 'Unknown',
          category: excerpt.category || 'General'
        }))
      };

      await storage.set('excerpt-index', rebuiltIndex);
      logSuccess('checkSourcesWorker', 'excerpt-index REBUILT successfully', {
        newCount: rebuiltIndex.excerpts.length
      });
    } else {
      logPhase('checkSourcesWorker', 'excerpt-index is in sync', { 
        indexCount,
        storageCount: allExcerpts.length
      });
    }

    await updateProgress(progressId, {
      phase: 'loading',
      percent: 10,
      status: 'Grouping excerpts by page...',
      total: allExcerpts.length,
      processed: 0
    });

    // Load all excerpts and group by page to minimize API calls
    const excerptsByPage = new Map(); // pageId -> [excerpts]
    const skippedExcerpts = [];
    let bespokeBackfillCount = 0;
    let headlessBackfillCount = 0;
    let smartCaseBackfillCount = 0;
    let variableRequiredBackfillCount = 0;

    for (const excerpt of allExcerpts) {
      if (!excerpt) continue;

      // BACKFILL: Set bespoke to false if undefined or null
      // This ensures all Sources have an explicit bespoke property
      if (excerpt.bespoke === undefined || excerpt.bespoke === null) {
        excerpt.bespoke = false;
        await storage.set(`excerpt:${excerpt.id}`, excerpt);
        bespokeBackfillCount++;
        logPhase('checkSourcesWorker', 'Backfilled bespoke property', { 
          excerptId: excerpt.id, 
          excerptName: excerpt.name 
        });
      }

      // BACKFILL: Set headless to false if undefined or null
      // This ensures all Sources have an explicit headless property
      // One-time migration - can be removed after all Sources are backfilled
      if (excerpt.headless === undefined || excerpt.headless === null) {
        excerpt.headless = false;
        excerpt.updatedAt = new Date().toISOString();
        // Recalculate content hash since we modified the object
        excerpt.contentHash = calculateContentHash(excerpt);
        await storage.set(`excerpt:${excerpt.id}`, excerpt);
        headlessBackfillCount++;
        logPhase('checkSourcesWorker', 'Backfilled headless property', { 
          excerptId: excerpt.id, 
          excerptName: excerpt.name 
        });
      }

      // BACKFILL: Add smart case matching occurrences to variables
      // This enables automatic capitalization of lowercase variable values at sentence starts
      // Check if any variable is missing the occurrences property (indicates pre-smart-case-matching data)
      const needsSmartCaseBackfill = excerpt.variables && 
        Array.isArray(excerpt.variables) && 
        excerpt.variables.length > 0 &&
        excerpt.variables.some(v => !v.occurrences) &&
        excerpt.content && 
        typeof excerpt.content === 'object';
      
      if (needsSmartCaseBackfill) {
        try {
          // Detect variable occurrences with sentence-start context
          const occurrences = detectVariableOccurrences(excerpt.content);
          
          // Merge occurrences into existing variable definitions
          excerpt.variables = mergeOccurrencesIntoVariables(excerpt.variables, occurrences);
          
          await storage.set(`excerpt:${excerpt.id}`, excerpt);
          smartCaseBackfillCount++;
          logPhase('checkSourcesWorker', 'Backfilled smart case matching occurrences', { 
            excerptId: excerpt.id, 
            excerptName: excerpt.name,
            variablesCount: excerpt.variables.length,
            occurrencesCount: occurrences.length
          });
        } catch (backfillError) {
          // Log warning but don't fail the entire operation
          logWarning('checkSourcesWorker', 'Failed to backfill smart case matching', {
            excerptId: excerpt.id,
            excerptName: excerpt.name,
            error: backfillError.message
          });
        }
      }

      // BACKFILL: Re-compute variable 'required' property based on toggle context
      // Variables outside toggles are auto-required, variables only inside toggles are auto-optional
      // This converts from manually-set required values to auto-computed values
      const needsVariableRequiredBackfill = excerpt.variables && 
        Array.isArray(excerpt.variables) && 
        excerpt.variables.length > 0 &&
        excerpt.content && 
        typeof excerpt.content === 'object';
      
      if (needsVariableRequiredBackfill) {
        try {
          // Detect variables with toggle context to get auto-computed required values
          const detectedVariables = detectVariablesWithToggleContext(excerpt.content);
          
          // Build a map of variable name -> auto-computed required
          const computedRequired = new Map();
          for (const v of detectedVariables) {
            computedRequired.set(v.name, v.required);
          }
          
          // Check if any required values would change
          let hasChanges = false;
          const changes = [];
          
          for (const v of excerpt.variables) {
            const newRequired = computedRequired.has(v.name) ? computedRequired.get(v.name) : false;
            const oldRequired = v.required || false;
            
            if (newRequired !== oldRequired) {
              hasChanges = true;
              changes.push({
                variable: v.name,
                oldRequired,
                newRequired
              });
            }
          }
          
          // Only update if there are actual changes
          if (hasChanges) {
            // Update variables with new required values
            excerpt.variables = excerpt.variables.map(v => ({
              ...v,
              required: computedRequired.has(v.name) ? computedRequired.get(v.name) : false
            }));
            
            excerpt.updatedAt = new Date().toISOString();
            excerpt.contentHash = calculateContentHash(excerpt);
            
            await storage.set(`excerpt:${excerpt.id}`, excerpt);
            variableRequiredBackfillCount++;
            logPhase('checkSourcesWorker', 'Backfilled variable required property', { 
              excerptId: excerpt.id, 
              excerptName: excerpt.name,
              changes
            });
          }
        } catch (backfillError) {
          // Log warning but don't fail the entire operation
          logWarning('checkSourcesWorker', 'Failed to backfill variable required property', {
            excerptId: excerpt.id,
            excerptName: excerpt.name,
            error: backfillError.message
          });
        }
      }

      // Skip if this excerpt doesn't have page info
      if (!excerpt.sourcePageId || !excerpt.sourceLocalId) {
        logWarning('checkSourcesWorker', 'Skipping excerpt - missing page info', {
          excerptId: excerpt.id,
          excerptName: excerpt.name,
          hasSourcePageId: !!excerpt.sourcePageId,
          hasSourceLocalId: !!excerpt.sourceLocalId,
          sourcePageId: excerpt.sourcePageId || 'MISSING',
          sourceLocalId: excerpt.sourceLocalId || 'MISSING'
        });
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
      skippedCount: skippedExcerpts.length,
      bespokeBackfillCount,
      headlessBackfillCount,
      smartCaseBackfillCount,
      variableRequiredBackfillCount
    });

    await updateProgress(progressId, {
      phase: 'checking',
      percent: 20,
      status: `Checking ${excerptsByPage.size} pages...`,
      total: allExcerpts.length,
      processed: 0,
      totalPages: excerptsByPage.size,
      currentPage: 0
    });

    // Phase 2: Check each page for backfill and conversion (20-90%)
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
          // CRITICAL: Distinguish between error types to prevent false positives
          // 404 can mean either "page deleted" OR "page exists but app has no permission"
          // Confluence API may return 404 for permission-denied pages to avoid information leakage
          // Since we can't distinguish, we must be conservative and NOT mark as orphaned on 404
          const httpStatus = storageResponse.status;
          
          if (httpStatus === 403 || httpStatus === 401) {
            // Permission error - don't mark as orphaned (may be temporary or app lacks permission)
            logWarning('checkSourcesWorker', 'Page access denied - not marking as orphaned', {
              pageId,
              excerptCount: pageExcerpts.length,
              httpStatus
            });
            // These are not orphaned, just inaccessible to the app
          } else if (httpStatus === 404) {
            // 404 could mean deleted OR permission denied - be conservative, don't mark as orphaned
            // NOTE: This means we may miss some truly deleted pages, but prevents false positives
            logWarning('checkSourcesWorker', 'Page returned 404 - not marking as orphaned (could be permission issue)', {
              pageId,
              excerptCount: pageExcerpts.length,
              httpStatus,
              note: '404 may indicate page deleted OR app lacks permission - being conservative'
            });
            // These are not orphaned - could be permission issue or actually deleted, but we can't tell
          } else {
            // Other errors (500, network errors, etc.) - don't mark as orphaned
            logWarning('checkSourcesWorker', 'Page fetch failed - not marking as orphaned', {
              pageId,
              excerptCount: pageExcerpts.length,
              httpStatus,
              error: `HTTP ${httpStatus}`
            });
            // These are not orphaned, just temporarily unavailable - skip checking but don't mark as orphaned
          }
          
          // Update progress
          const percentComplete = calculatePhaseProgress(pageNumber, excerptsByPage.size, 20, 90);
          await updateProgress(progressId, {
            phase: 'checking',
            status: `Checked page ${pageNumber} of ${excerptsByPage.size}...`,
            percent: percentComplete,
            total: allExcerpts.length,
            processed: checkedSources.length + orphanedSources.length,
            totalPages: excerptsByPage.size,
            currentPage: pageNumber
          });
          continue;
        }

        const storageData = await storageResponse.json();
        const storageBody = storageData?.body?.storage?.value || '';

        if (!storageBody) {
          // CRITICAL: Empty storage body doesn't mean page is deleted
          // Could be empty page, parsing error, or API issue
          // Don't mark as orphaned - be conservative
          logWarning('checkSourcesWorker', 'No storage body found for page - not marking as orphaned', {
            pageId,
            excerptCount: pageExcerpts.length,
            hasStorageData: !!storageData,
            hasBody: !!storageData?.body,
            hasStorage: !!storageData?.body?.storage
          });
          // Skip checking these Sources but don't mark as orphaned
          // They remain in active state until next successful check
          
          // Update progress
          const percentComplete = calculatePhaseProgress(pageNumber, excerptsByPage.size, 20, 90);
          await updateProgress(progressId, {
            phase: 'checking',
            status: `Checked page ${pageNumber} of ${excerptsByPage.size}...`,
            percent: percentComplete,
            total: allExcerpts.length,
            processed: checkedSources.length + orphanedSources.length,
            totalPages: excerptsByPage.size,
            currentPage: pageNumber
          });
          continue;
        }

        // STEP 2: Check which Sources exist on the page (string matching - works for all Sources)
        const sourcesToConvert = []; // Track Sources that need conversion

        logPhase('checkSourcesWorker', 'Checking page for Sources', {
          pageId,
          excerptCount: pageExcerpts.length,
          storageBodyLength: storageBody.length,
          excerptNames: pageExcerpts.map(e => e.name),
          sourceLocalIds: pageExcerpts.map(e => e.sourceLocalId)
        });

        for (const excerpt of pageExcerpts) {
          const macroExists = storageBody.includes(excerpt.sourceLocalId);

          logPhase('checkSourcesWorker', 'Source existence check', {
            excerptId: excerpt.id,
            excerptName: excerpt.name,
            sourceLocalId: excerpt.sourceLocalId,
            macroExists,
            // Log a snippet around where localId might be (if found)
            foundAt: macroExists ? storageBody.indexOf(excerpt.sourceLocalId) : -1
          });

          if (!macroExists) {
            // Note: With v2 Source tracking, orphan detection is handled by pageSyncWorker
            // If a Source is missing from its expected page but exists in storage, it means
            // the page hasn't been published since the Source was removed.
            // Log for diagnostics but don't take action - pageSyncWorker handles this.
            logWarning('checkSourcesWorker', 'Source not found on page - will be handled by pageSyncWorker on next publish', {
              excerptId: excerpt.id,
              excerptName: excerpt.name,
              sourceLocalId: excerpt.sourceLocalId,
              sourcePageId: excerpt.sourcePageId
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
        // CRITICAL: Do NOT mark as orphaned on processing errors
        // Only mark as orphaned if page fetch confirms deletion (404)
        // Processing errors (network failures, parsing errors, etc.) should NOT cause false positives
        logFailure('checkSourcesWorker', 'Error processing page - NOT marking as orphaned', apiError, {
          pageId,
          excerptCount: pageExcerpts.length,
          errorType: apiError.name,
          errorMessage: apiError.message
        });
        
        // Log warning for each excerpt that couldn't be checked
        // These are NOT orphaned - they just couldn't be verified due to processing error
        pageExcerpts.forEach(excerpt => {
          logWarning('checkSourcesWorker', 'Source check skipped due to processing error', {
            excerptId: excerpt.id,
            excerptName: excerpt.name,
            pageId,
            error: apiError.message
          });
        });
        
        // NOTE: We intentionally do NOT add these to orphanedSources
        // They remain in active state until next successful check
        // This prevents false positives from transient errors
      }

      // Update progress after each page
      const percentComplete = calculatePhaseProgress(pageNumber, excerptsByPage.size, 20, 90);
      await updateProgress(progressId, {
        phase: 'checking',
        status: `Checked page ${pageNumber} of ${excerptsByPage.size}...`,
        percent: percentComplete,
        total: allExcerpts.length,
        processed: checkedSources.length,
        totalPages: excerptsByPage.size,
        currentPage: pageNumber
      });

    }

    // Phase 3: Finalize results (90-100%)
    await updateProgress(progressId, {
      phase: 'finalizing',
      percent: 95,
      status: 'Finalizing results...',
      total: allExcerpts.length,
      processed: checkedSources.length
    });

    // Build completion status message
    let statusMessage = `Complete! ${checkedSources.length} active Sources checked`;
    if (skippedExcerpts.length > 0) {
      statusMessage += `, ${skippedExcerpts.length} skipped (no page info)`;
    }
    if (contentConversionsCount > 0) {
      statusMessage += `, ${contentConversionsCount} converted to ADF`;
    }
    if (bespokeBackfillCount > 0) {
      statusMessage += `, ${bespokeBackfillCount} backfilled with bespoke:false`;
    }
    if (headlessBackfillCount > 0) {
      statusMessage += `, ${headlessBackfillCount} backfilled with headless:false`;
    }
    if (smartCaseBackfillCount > 0) {
      statusMessage += `, ${smartCaseBackfillCount} backfilled with smart case data`;
    }
    if (variableRequiredBackfillCount > 0) {
      statusMessage += `, ${variableRequiredBackfillCount} backfilled with auto-computed required`;
    }

    const finalResults = {
      skippedSources: skippedExcerpts, // Sources without sourcePageId/sourceLocalId
      checkedCount: checkedSources.length,
      activeCount: checkedSources.length,
      skippedCount: skippedExcerpts.length,
      contentConversionsCount,
      bespokeBackfillCount,
      headlessBackfillCount,
      smartCaseBackfillCount,
      variableRequiredBackfillCount,
      completedAt: new Date().toISOString()
    };

    // Mark as complete
    await updateProgress(progressId, {
      phase: 'complete',
      status: statusMessage,
      percent: 100,
      total: allExcerpts.length,
      processed: checkedSources.length,
      activeCount: checkedSources.length,
      contentConversionsCount,
      bespokeBackfillCount,
      headlessBackfillCount,
      smartCaseBackfillCount,
      variableRequiredBackfillCount,
      results: finalResults
    });

    logSuccess('checkSourcesWorker', 'Check All Sources complete', {
      progressId,
      duration: `${Date.now() - functionStartTime}ms`,
      totalInStorage: allExcerpts.length,
      activeCount: checkedSources.length,
      skippedCount: skippedExcerpts.length,
      conversionsCount: contentConversionsCount,
      bespokeBackfillCount,
      headlessBackfillCount,
      smartCaseBackfillCount,
      variableRequiredBackfillCount
    });

    return {
      success: true,
      progressId,
      summary: {
        totalInStorage: allExcerpts.length,
        checkedCount: checkedSources.length,
        activeCount: checkedSources.length,
        skippedCount: skippedExcerpts.length,
        contentConversionsCount,
        bespokeBackfillCount,
        headlessBackfillCount,
        smartCaseBackfillCount,
        variableRequiredBackfillCount
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


