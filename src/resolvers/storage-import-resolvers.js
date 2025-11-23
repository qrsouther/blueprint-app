/**
 * Storage Import Resolvers
 *
 * Provides functionality to import storage data from a JSON export file
 * into Forge storage, overwriting all existing data.
 *
 * Validates data integrity before import and rebuilds indexes after import.
 *
 * Uses async worker pattern for long-running imports (up to 15 minutes).
 */

import { storage } from '@forge/api';
import { Queue } from '@forge/events';
import { generateUUID } from '../utils.js';
import { validateExcerptData, validateMacroVarsData } from '../utils/storage-validator.js';
import { logFunction, logPhase, logSuccess, logFailure, logWarning } from '../utils/forge-logger.js';

/**
 * Validate export JSON structure and version compatibility
 * 
 * @param {Object} exportData - Parsed export JSON
 * @returns {Object} { valid: boolean, errors: string[] }
 */
function validateExportStructure(exportData) {
  const errors = [];

  if (!exportData || typeof exportData !== 'object') {
    return { valid: false, errors: ['Export data must be an object'] };
  }

  // Check required top-level fields
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

  // Check version compatibility
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
 * 
 * @param {Array} entries - Array of { key, value } objects
 * @returns {Object} { valid: boolean, errors: Array<{key: string, error: string}> }
 */
function validateDataIntegrity(entries) {
  const errors = [];
  let validatedCount = 0;

  for (const { key, value } of entries) {
    try {
      // Validate excerpts
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
      }
      // Validate macro-vars
      else if (key.startsWith('macro-vars:')) {
        const validation = validateMacroVarsData(value);
        if (!validation.valid) {
          errors.push({
            key,
            error: `Macro-vars validation failed: ${validation.errors.join(', ')}`
          });
          continue;
        }
        validatedCount++;
      }
      // Other data types don't have specific validators, but check basic structure
      else if (value === null || value === undefined) {
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
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    validatedCount
  };
}

/**
 * Initialize import storage (create metadata)
 * 
 * @param {Object} req - Request object
 * @param {number} req.payload.totalChunks - Total number of chunks
 * @param {number} req.payload.totalSize - Total size in bytes
 * @returns {Object} { success: boolean, importKey: string, error?: string }
 */
export async function initImportStorage(req) {
  try {
    const { totalChunks, totalSize } = req.payload;

    if (totalChunks === undefined || totalSize === undefined) {
      return {
        success: false,
        error: 'totalChunks and totalSize are required',
        importKey: null
      };
    }

    const importId = Date.now();
    const importKey = `import-temp-${importId}`;

    // Store metadata
    const metadata = {
      importId,
      totalChunks,
      totalSize,
      chunkSizeChars: 120000
    };
    await storage.set(`${importKey}-metadata`, metadata);

    logPhase('initializeImportStorage', 'Initialized import storage', { importKey, totalChunks });

    return {
      success: true,
      importKey: importKey
    };
  } catch (error) {
    logFailure('initializeImportStorage', 'Error initializing import storage', error);
    return {
      success: false,
      error: error.message,
      importKey: null
    };
  }
}

/**
 * Store a single chunk of import data
 * 
 * @param {Object} req - Request object
 * @param {string} req.payload.importKey - Import key from initImportStorage
 * @param {number} req.payload.chunkIndex - Chunk index (0-based)
 * @param {string} req.payload.chunkData - Chunk data string
 * @returns {Object} { success: boolean, error?: string }
 */
export async function storeImportChunk(req) {
  const { importKey, chunkIndex, chunkData } = req.payload || {};
  const extractedImportKey = importKey; // Extract for use in catch block
  
  try {

    if (!importKey || chunkIndex === undefined || !chunkData) {
      return {
        success: false,
        error: 'importKey, chunkIndex, and chunkData are required'
      };
    }

    const chunkKey = `${importKey}-chunk-${chunkIndex}`;
    const chunkWrapper = { data: chunkData, index: chunkIndex };
    const jsonStringified = JSON.stringify(chunkWrapper);
    const MAX_CHARS = 245760; // Forge storage limit

    if (jsonStringified.length > MAX_CHARS) {
      return {
        success: false,
        error: `Chunk ${chunkIndex} exceeds storage limit after JSON encoding (${jsonStringified.length} > ${MAX_CHARS} chars)`
      };
    }

    await storage.set(chunkKey, chunkWrapper);

    return {
      success: true
    };
  } catch (error) {
    logFailure('storeImportChunk', 'Error storing chunk', error, { chunkIndex: req.payload.chunkIndex, importKey: extractedImportKey });
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get stored import data from storage
 * 
 * @param {Object} req - Request object
 * @param {string} req.payload.importKey - Storage key returned by storeImportData
 * @returns {Object} { success: boolean, data: string, error?: string }
 */
export async function getImportData(req) {
  const { importKey } = req.payload || {};
  const extractedImportKey = importKey; // Extract for use in catch block
  
  try {

    if (!importKey) {
      return {
        success: false,
        error: 'Import key is required'
      };
    }

    // Check if import is chunked
    const metadata = await storage.get(`${importKey}-metadata`);

    if (metadata && metadata.totalChunks) {
      // Reassemble from chunks
      logPhase('getImportData', 'Reassembling chunks', { totalChunks: metadata.totalChunks, importKey });
      const chunks = [];

      for (let i = 0; i < metadata.totalChunks; i++) {
        const chunkKey = `${importKey}-chunk-${i}`;
        const chunkData = await storage.get(chunkKey);

        if (!chunkData) {
          return {
            success: false,
            error: `Chunk ${i} not found`
          };
        }

        const chunk = typeof chunkData === 'string' ? chunkData : (chunkData.data || chunkData);

        if (typeof chunk !== 'string') {
          return {
            success: false,
            error: `Chunk ${i} invalid format`
          };
        }

        chunks.push(chunk);
      }

      const jsonString = chunks.join('');

      return {
        success: true,
        data: jsonString
      };
    } else {
      // Single key (not chunked)
      const importData = await storage.get(importKey);

      if (!importData) {
        return {
          success: false,
          error: 'Import data not found'
        };
      }

      const jsonString = typeof importData === 'string' ? importData : (importData.data || importData);

      if (typeof jsonString !== 'string') {
        return {
          success: false,
          error: 'Import data invalid format'
        };
      }

      return {
        success: true,
        data: jsonString
      };
    }
  } catch (error) {
    logFailure('getImportData', 'Error fetching import data', error, { importKey: extractedImportKey });
    return {
      success: false,
      error: error.message,
      data: null
    };
  }
}

/**
 * Start storage import job (async worker pattern)
 * 
 * Queues an import job that runs in the background with up to 15 minutes timeout.
 * Frontend should poll getImportProgress for status updates.
 * 
 * @param {Object} req - Request object
 * @param {string} req.payload.importKey - Import key with stored JSON data
 * @returns {Object} { success: boolean, jobId: string, progressId: string, error?: string }
 */
export async function startStorageImport(req) {
  try {
    const { importKey } = req.payload;

    if (!importKey) {
      return {
        success: false,
        error: 'Import key is required'
      };
    }

    // Generate progress ID for tracking
    const progressId = generateUUID();

    // Initialize progress state (queued)
    await storage.set(`progress:${progressId}`, {
      phase: 'queued',
      percent: 0,
      status: 'Import job queued...',
      total: 0,
      processed: 0,
      queuedAt: new Date().toISOString()
    });

    // Create queue and push event
    const queue = new Queue({ key: 'storage-import-queue' });
    const { jobId } = await queue.push({
      body: { progressId, importKey }
    });

    logSuccess('startStorageImport', 'Job queued', { jobId, progressId, importKey });

    // Return immediately - worker will process in background
    return {
      success: true,
      jobId,
      progressId,
      message: 'Storage import job queued successfully'
    };

  } catch (error) {
    logFailure('startStorageImport', 'Error starting import job', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get import progress
 * 
 * Polls the progress state for an ongoing import job.
 * 
 * @param {Object} req - Request object
 * @param {string} req.payload.progressId - Progress ID returned by startStorageImport
 * @returns {Object} { success: boolean, progress: Object, error?: string }
 */
export async function getImportProgress(req) {
  try {
    const { progressId } = req.payload;

    if (!progressId) {
      return {
        success: false,
        error: 'Progress ID is required'
      };
    }

    const progress = await storage.get(`progress:${progressId}`);

    if (!progress) {
      return {
        success: false,
        error: 'Progress not found. The import job may not have started yet.'
      };
    }

    return {
      success: true,
      progress
    };
  } catch (error) {
    logFailure('getImportProgress', 'Error fetching import progress', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Import storage data from JSON export stored in storage (LEGACY - kept for backwards compatibility)
 * 
 * Reads JSON from storage using importKey, validates structure and data integrity,
 * then overwrites all existing storage with imported data.
 * 
 * NOTE: This is the legacy synchronous version. Use startStorageImport + worker for large imports.
 * 
 * @param {Object} req - Request object
 * @param {string} req.payload.importKey - Storage key returned by storeImportData
 * @returns {Object} { success: boolean, imported: number, failed: number, errors: Array }
 */
export async function importStorageData(req) {
  try {
    const { importKey } = req.payload;

    if (!importKey) {
      return {
        success: false,
        error: 'Import key is required',
        imported: 0,
        failed: 0,
        errors: []
      };
    }

    const functionStartTime = Date.now();
    logFunction('importStorage', 'START', { importKey });

    // Get JSON data from storage
    const dataResponse = await getImportData({ payload: { importKey } });
    if (!dataResponse.success) {
      return {
        success: false,
        error: `Failed to get import data: ${dataResponse.error}`,
        imported: 0,
        failed: 0,
        errors: []
      };
    }

    const jsonData = dataResponse.data;

    // Parse JSON
    let exportData;
    try {
      exportData = JSON.parse(jsonData);
    } catch (error) {
      return {
        success: false,
        error: `Invalid JSON: ${error.message}`,
        imported: 0,
        failed: 0,
        errors: []
      };
    }

    // Validate export structure
    const structureValidation = validateExportStructure(exportData);
    if (!structureValidation.valid) {
      return {
        success: false,
        error: `Export structure validation failed: ${structureValidation.errors.join(', ')}`,
        imported: 0,
        failed: 0,
        errors: []
      };
    }

    logPhase('importStorage', 'Export data loaded', { exportVersion: exportData.exportVersion, exportedAt: exportData.exportedAt, totalKeys: exportData.totalKeys });

    // Flatten organized data back into key-value pairs
    const allEntries = [];
    const { data } = exportData;

    // Add all categorized entries
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

    // Validate data integrity
    logPhase('importStorage', 'Validating data integrity', { entryCount: allEntries.length });
    const integrityValidation = validateDataIntegrity(allEntries);
    
    if (integrityValidation.errors.length > 0) {
      logWarning('importStorage', 'Found validation errors', { errorCount: integrityValidation.errors.length });
      // Continue with import but log errors
    }

    // Import all entries
    logPhase('importStorage', 'Writing data to storage', { entryCount: allEntries.length });
    const results = {
      imported: 0,
      failed: 0,
      errors: []
    };

    // Track excerpts for index rebuild
    const importedExcerpts = [];

    // Write each entry
    for (const { key, value } of allEntries) {
      try {
        await storage.set(key, value);
        results.imported++;

        // Track excerpts for index rebuild
        if (key.startsWith('excerpt:') && value && value.id && value.name) {
          importedExcerpts.push(value);
        }

        // Log progress every 50 entries
        if (results.imported % 50 === 0) {
          logPhase('importStorage', 'Import progress', { imported: results.imported, total: allEntries.length });
        }
      } catch (error) {
        logFailure('importStorage', 'Error importing entry', error, { key });
        results.failed++;
        results.errors.push({
          key,
          error: error.message
        });
      }
    }

    // Rebuild excerpt-index from imported excerpts
    if (importedExcerpts.length > 0) {
      logPhase('importStorage', 'Rebuilding excerpt-index', { excerptCount: importedExcerpts.length });
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
        logSuccess('importStorage', 'Excerpt-index rebuilt successfully', { excerptCount: importedExcerpts.length });
      } catch (error) {
        logFailure('importStorage', 'Error rebuilding excerpt-index', error);
        results.errors.push({
          key: 'excerpt-index',
          error: `Failed to rebuild index: ${error.message}`
        });
      }
    }

    const elapsed = Date.now() - functionStartTime;
    logSuccess('importStorage', 'Import complete', { duration: `${elapsed}ms`, imported: results.imported, failed: results.failed });

    return {
      success: results.failed === 0,
      imported: results.imported,
      failed: results.failed,
      errors: results.errors,
      validationErrors: integrityValidation.errors,
      elapsed: elapsed
    };
  } catch (error) {
    logFailure('importStorage', 'Error importing storage', error);
    return {
      success: false,
      error: error.message,
      imported: 0,
      failed: 0,
      errors: []
    };
  }
}

