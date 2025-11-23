/**
 * Storage Import Worker - Handles full storage import with 900s timeout
 * Runs asynchronously via Forge Events API queue
 * 
 * This worker imports ALL storage data from a JSON export file, overwriting
 * all existing storage data. Progress is tracked for frontend polling.
 */

import { storage } from '@forge/api';
import { updateProgress } from './helpers/progress-tracker.js';
import { validateExcerptData, validateMacroVarsData } from '../utils/storage-validator.js';
import { logFunction, logSuccess, logFailure, logWarning } from '../utils/forge-logger.js';

/**
 * Validate export JSON structure and version compatibility
 */
function validateExportStructure(exportData) {
  const errors = [];

  if (!exportData || typeof exportData !== 'object') {
    return { valid: false, errors: ['Export data must be an object'] };
  }

  if (!exportData.exportVersion || typeof exportData.exportVersion !== 'string') {
    errors.push('Missing or invalid exportVersion');
  }

  if (!exportData.exportedAt || typeof exportData.exportedAt !== 'string') {
    errors.push('Missing or invalid exportedAt timestamp');
  }

  if (exportData.totalKeys === undefined || typeof exportData.totalKeys !== 'number') {
    errors.push('Missing or invalid totalKeys');
  }

  if (!exportData.data || typeof exportData.data !== 'object') {
    errors.push('Missing or invalid data object');
  }

  if (exportData.exportVersion && exportData.exportVersion !== '1.0') {
    errors.push(`Unsupported export version: ${exportData.exportVersion}. Expected: 1.0`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate data integrity for all imported data
 */
function validateDataIntegrity(entries) {
  const errors = [];
  let validatedCount = 0;

  for (const { key, value } of entries) {
    try {
      if (key.startsWith('excerpt:')) {
        const validation = validateExcerptData(value);
        if (!validation.valid) {
          errors.push({
            key,
            error: `Excerpt validation failed: ${validation.errors.join(', ')}`
          });
          continue;
        }
        validatedCount++;
      } else if (key.startsWith('macro-vars:')) {
        const validation = validateMacroVarsData(value);
        if (!validation.valid) {
          errors.push({
            key,
            error: `Macro-vars validation failed: ${validation.errors.join(', ')}`
          });
          continue;
        }
        validatedCount++;
      } else if (value === null || value === undefined) {
        errors.push({
          key,
          error: 'Value is null or undefined'
        });
        continue;
      }
    } catch (error) {
      errors.push({
        key,
        error: `Validation error: ${error.message}`
      });
      continue;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    validatedCount
  };
}

/**
 * Worker handler for storage import
 * 
 * @param {Object} event - Event from queue
 * @param {string} event.body.progressId - Progress tracking ID
 * @param {string} event.body.importKey - Import key with stored JSON data
 */
export async function handler(event) {
  // In @forge/events v2, payload is in event.body
  const payload = event.payload || event.body || event;
  const { progressId, importKey } = payload;

  if (!progressId || !importKey) {
    logFailure('storageImportWorker', 'Missing progressId or importKey', new Error('Missing required parameters'));
    return;
  }

  const startTime = Date.now();

  try {
    logFunction('storageImportWorker', 'START', { progressId, importKey });

    // Phase 1: Initializing (0-5%)
    await updateProgress(progressId, {
      phase: 'initializing',
      percent: 0,
      status: 'Initializing import...',
      total: 0,
      processed: 0
    });

    // Phase 2: Get import data from storage (5-15%)
    await updateProgress(progressId, {
      phase: 'loading',
      percent: 5,
      status: 'Loading import data from storage...',
      total: 0,
      processed: 0
    });

    // Get all chunks and assemble
    const chunks = [];
    let chunkIndex = 0;
    let hasMoreChunks = true;

    while (hasMoreChunks) {
      const chunkKey = `${importKey}-chunk-${chunkIndex}`;
      const chunkData = await storage.get(chunkKey);

      if (!chunkData) {
        hasMoreChunks = false;
        break;
      }

      // Handle wrapped format { data: string, index: number }
      const chunk = typeof chunkData === 'string' ? chunkData : (chunkData.data || chunkData);
      chunks.push(chunk);

      chunkIndex++;

      // Update progress
      const progress = 5 + Math.floor((chunkIndex / 20) * 10); // Estimate up to 20 chunks
      await updateProgress(progressId, {
        phase: 'loading',
        percent: Math.min(progress, 15),
        status: `Loading chunks... ${chunkIndex} loaded`,
        total: 0,
        processed: chunkIndex
      });
    }

    if (chunks.length === 0) {
      throw new Error('No import data found in storage');
    }

    // Assemble full JSON string
    const jsonData = chunks.join('');

    // Phase 3: Parse and validate structure (15-25%)
    await updateProgress(progressId, {
      phase: 'parsing',
      percent: 15,
      status: 'Parsing JSON data...',
      total: 0,
      processed: 0
    });

    let exportData;
    try {
      exportData = JSON.parse(jsonData);
    } catch (error) {
      throw new Error(`Invalid JSON: ${error.message}`);
    }

    await updateProgress(progressId, {
      phase: 'validating',
      percent: 20,
      status: 'Validating export structure...',
      total: 0,
      processed: 0
    });

    const structureValidation = validateExportStructure(exportData);
    if (!structureValidation.valid) {
      throw new Error(`Export structure validation failed: ${structureValidation.errors.join(', ')}`);
    }

    // Phase 4: Flatten and validate data integrity (25-40%)
    await updateProgress(progressId, {
      phase: 'flattening',
      percent: 25,
      status: 'Organizing data for import...',
      total: exportData.totalKeys,
      processed: 0
    });

    const allEntries = [];
    const { data } = exportData;

    if (data.excerpts) allEntries.push(...data.excerpts);
    if (data.includes) allEntries.push(...data.includes);
    if (data.macroVars) allEntries.push(...data.macroVars);
    if (data.usage) allEntries.push(...data.usage);
    if (data.cache) allEntries.push(...data.cache);
    if (data.backups) allEntries.push(...data.backups);
    if (data.versions) allEntries.push(...data.versions);
    if (data.deleted) allEntries.push(...data.deleted);
    if (data.categories) allEntries.push(...data.categories);
    if (data.metadata) allEntries.push(...data.metadata);
    if (data.other) allEntries.push(...data.other);

    await updateProgress(progressId, {
      phase: 'validating',
      percent: 30,
      status: 'Validating data integrity...',
      total: allEntries.length,
      processed: 0
    });

    const integrityValidation = validateDataIntegrity(allEntries);
    
    if (integrityValidation.errors.length > 0) {
      logWarning('storageImportWorker', 'Found validation errors', { errorCount: integrityValidation.errors.length });
    }

    // Phase 5: Import all entries (40-95%)
    await updateProgress(progressId, {
      phase: 'importing',
      percent: 40,
      status: 'Importing data to storage...',
      total: allEntries.length,
      processed: 0
    });

    const results = {
      imported: 0,
      failed: 0,
      errors: []
    };

    const importedExcerpts = [];

    // Write each entry with progress updates
    for (let i = 0; i < allEntries.length; i++) {
      const { key, value } = allEntries[i];
      
      try {
        await storage.set(key, value);
        results.imported++;

        // Track excerpts for index rebuild
        if (key.startsWith('excerpt:') && value && value.id && value.name) {
          importedExcerpts.push(value);
        }

        // Update progress every 10 entries or at milestones
        if ((i + 1) % 10 === 0 || i === allEntries.length - 1) {
          const progress = 40 + Math.floor(((i + 1) / allEntries.length) * 55);
          await updateProgress(progressId, {
            phase: 'importing',
            percent: progress,
            status: `Imported ${i + 1}/${allEntries.length} keys...`,
            total: allEntries.length,
            processed: i + 1
          });
        }
      } catch (error) {
        logFailure('storageImportWorker', 'Error importing entry', error, { key });
        results.failed++;
        results.errors.push({
          key,
          error: error.message
        });
      }
    }

    // Phase 6: Rebuild excerpt-index (95-100%)
    await updateProgress(progressId, {
      phase: 'rebuilding',
      percent: 95,
      status: 'Rebuilding excerpt index...',
      total: importedExcerpts.length,
      processed: 0
    });

    if (importedExcerpts.length > 0) {
      try {
        const index = { excerpts: [] };
        
        for (const excerpt of importedExcerpts) {
          index.excerpts.push({
            id: excerpt.id,
            name: excerpt.name,
            category: excerpt.category || 'Uncategorized',
            pageId: excerpt.pageId,
            spaceKey: excerpt.spaceKey,
            updatedAt: excerpt.metadata?.updatedAt || new Date().toISOString()
          });
        }

        await storage.set('excerpt-index', index);
        logSuccess('storageImportWorker', 'Excerpt-index rebuilt successfully', { excerptCount: importedExcerpts.length });
      } catch (error) {
        logFailure('storageImportWorker', 'Error rebuilding excerpt-index', error);
        results.errors.push({
          key: 'excerpt-index',
          error: `Failed to rebuild index: ${error.message}`
        });
      }
    }

    // Phase 7: Complete (100%)
    const elapsed = Date.now() - startTime;
    
    await updateProgress(progressId, {
      phase: 'complete',
      percent: 100,
      status: `Import complete! ${results.imported} keys imported${results.failed > 0 ? `, ${results.failed} failed` : ''} in ${elapsed}ms`,
      total: allEntries.length,
      processed: allEntries.length,
      results: {
        success: results.failed === 0,
        imported: results.imported,
        failed: results.failed,
        errors: results.errors,
        validationErrors: integrityValidation.errors,
        elapsed: elapsed
      }
    });

    logSuccess('storageImportWorker', 'Import complete', { elapsed: `${elapsed}ms`, imported: results.imported, failed: results.failed });

  } catch (error) {
    logFailure('storageImportWorker', 'Fatal error', error, { progressId, importKey });
    const elapsed = Date.now() - startTime;
    
    await updateProgress(progressId, {
      phase: 'error',
      percent: 0,
      status: `Import failed: ${error.message}`,
      total: 0,
      processed: 0,
      error: error.message,
      elapsed: elapsed
    });
  }
}

