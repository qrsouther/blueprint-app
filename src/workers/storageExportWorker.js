/**
 * Storage Export Worker - Handles full storage export with 900s timeout
 * Runs asynchronously via Forge Events API queue
 * 
 * This worker exports ALL storage data to JSON format, chunking if necessary
 * to avoid storage size limits. Progress is tracked for frontend polling.
 */

import { storage, startsWith } from '@forge/api';
import { updateProgress } from './helpers/progress-tracker.js';
import { logFunction, logPhase, logSuccess, logFailure, logWarning } from '../utils/forge-logger.js';

/**
 * Helper: Fetch all pages from a storage query cursor
 */
async function getAllKeysWithPrefix(prefix) {
  const allKeys = [];
  let cursor = await storage.query().where('key', startsWith(prefix)).getMany();

  // Add first page
  allKeys.push(...(cursor.results || []));

  // Paginate through remaining pages
  while (cursor.nextCursor) {
    cursor = await storage.query().where('key', startsWith(prefix)).cursor(cursor.nextCursor).getMany();
    allKeys.push(...(cursor.results || []));
  }

  return allKeys;
}

/**
 * Get all storage keys by querying all known prefixes
 */
async function getAllStorageKeys() {
  const allKeys = [];
  
  // List of all known prefixes to query
  const prefixes = [
    'excerpt:',
    'include:',
    'macro-vars:',
    'usage:',
    'cache:',
    'backup-',
    'version:',
    'deleted:',
    'categories',
    'meta:',
    'excerpt-index', // Special case - single key, not a prefix
    'admin-url', // Special case - single key
    'macro-vars-deleted:' // Soft-deleted items
  ];
  
  // Query each prefix
  for (const prefix of prefixes) {
    try {
      const keys = await getAllKeysWithPrefix(prefix);
      allKeys.push(...keys);
    } catch (error) {
      logWarning('storageExportWorker', 'Error querying prefix', { prefix, error: error.message });
      // Continue with other prefixes
    }
  }
  
  // Handle special single keys (not prefixes)
  const specialKeys = ['excerpt-index', 'admin-url'];
  for (const key of specialKeys) {
    try {
      const value = await storage.get(key);
      if (value !== null && value !== undefined) {
        allKeys.push({ key, value });
      }
    } catch (error) {
      // Key doesn't exist, skip
    }
  }
  
  return allKeys;
}

/**
 * Worker handler for storage export
 * 
 * @param {Object} event - Event from queue
 * @param {string} event.body.progressId - Progress tracking ID
 * @param {string} event.body.exportId - Export job ID
 */
export async function handler(event) {
  // In @forge/events v2, payload is in event.body
  const payload = event.payload || event.body || event;
  const { progressId, exportId } = payload;

  if (!progressId || !exportId) {
    logFailure('storageExportWorker', 'Missing progressId or exportId', new Error('Missing required parameters'));
    return;
  }

  const startTime = Date.now();

  try {
    logFunction('storageExportWorker', 'START', { progressId, exportId });

    // Phase 1: Initializing (0-5%)
    await updateProgress(progressId, {
      phase: 'initializing',
      percent: 0,
      status: 'Initializing export...',
      total: 0,
      processed: 0
    });

    // Phase 2: Fetching all storage keys (5-30%)
    await updateProgress(progressId, {
      phase: 'fetching',
      percent: 5,
      status: 'Fetching all storage keys...',
      total: 0,
      processed: 0
    });

    const allKeys = await getAllStorageKeys();

    await updateProgress(progressId, {
      phase: 'organizing',
      percent: 30,
      status: `Organizing ${allKeys.length} keys by type...`,
      total: allKeys.length,
      processed: 0
    });

    // Phase 3: Organize data by type (30-50%)
    const organizedData = {
      excerpts: [],
      includes: [],
      macroVars: [],
      usage: [],
      cache: [],
      backups: [],
      versions: [],
      deleted: [],
      categories: [],
      metadata: [],
      other: []
    };

    for (let i = 0; i < allKeys.length; i++) {
      const entry = allKeys[i];
      const { key, value } = entry;
      
      if (key.startsWith('excerpt:')) {
        organizedData.excerpts.push({ key, value });
      } else if (key.startsWith('include:')) {
        organizedData.includes.push({ key, value });
      } else if (key.startsWith('macro-vars:')) {
        organizedData.macroVars.push({ key, value });
      } else if (key.startsWith('usage:')) {
        organizedData.usage.push({ key, value });
      } else if (key.startsWith('cache:')) {
        organizedData.cache.push({ key, value });
      } else if (key.startsWith('backup-')) {
        organizedData.backups.push({ key, value });
      } else if (key.startsWith('version:')) {
        organizedData.versions.push({ key, value });
      } else if (key.startsWith('deleted:')) {
        organizedData.deleted.push({ key, value });
      } else if (key.startsWith('categories')) {
        organizedData.categories.push({ key, value });
      } else if (key.startsWith('meta:')) {
        organizedData.metadata.push({ key, value });
      } else {
        organizedData.other.push({ key, value });
      }

      // Update progress every 100 entries
      if (i % 100 === 0 || i === allKeys.length - 1) {
        const progress = 30 + Math.floor((i / allKeys.length) * 20);
        await updateProgress(progressId, {
          phase: 'organizing',
          percent: progress,
          status: `Organizing keys... ${i + 1}/${allKeys.length}`,
          total: allKeys.length,
          processed: i + 1
        });
      }
    }

    // Phase 4: Create export structure (50-60%)
    await updateProgress(progressId, {
      phase: 'structuring',
      percent: 50,
      status: 'Creating export structure...',
      total: 1,
      processed: 0
    });

    const exportData = {
      exportVersion: '1.0',
      exportedAt: new Date().toISOString(),
      sourceEnvironment: 'production',
      totalKeys: allKeys.length,
      summary: {
        excerpts: organizedData.excerpts.length,
        includes: organizedData.includes.length,
        macroVars: organizedData.macroVars.length,
        usage: organizedData.usage.length,
        cache: organizedData.cache.length,
        backups: organizedData.backups.length,
        versions: organizedData.versions.length,
        deleted: organizedData.deleted.length,
        categories: organizedData.categories.length,
        metadata: organizedData.metadata.length,
        other: organizedData.other.length
      },
      data: organizedData
    };

    await updateProgress(progressId, {
      phase: 'serializing',
      percent: 60,
      status: 'Serializing to JSON...',
      total: 1,
      processed: 0
    });

    // Phase 5: Serialize to JSON (60-70%)
    const jsonString = JSON.stringify(exportData, null, 2);
    const jsonSize = new Blob([jsonString]).size;
    
    await updateProgress(progressId, {
      phase: 'chunking',
      percent: 70,
      status: 'Preparing chunks for storage...',
      total: 1,
      processed: 0
    });

    // Phase 6: Chunk and store (70-95%)
    const exportKey = `export-temp-${exportId}`;
    const CHUNK_SIZE_CHARS = 120000;
    const MAX_CHARS = 245760;
    const needsChunking = jsonString.length > CHUNK_SIZE_CHARS;
    
    if (needsChunking) {
      // Split into chunks
      const chunks = [];
      for (let i = 0; i < jsonString.length; i += CHUNK_SIZE_CHARS) {
        chunks.push(jsonString.slice(i, i + CHUNK_SIZE_CHARS));
      }
      
      logPhase('storageExportWorker', 'Chunking export', { chunkCount: chunks.length });
      
      // Store each chunk
      for (let i = 0; i < chunks.length; i++) {
        const chunkKey = `${exportKey}-chunk-${i}`;
        const chunkWrapper = { data: chunks[i], index: i };
        const jsonStringified = JSON.stringify(chunkWrapper);
        
        if (jsonStringified.length > MAX_CHARS) {
          throw new Error(`Chunk ${i} exceeds storage limit after JSON encoding (${jsonStringified.length} > ${MAX_CHARS} chars)`);
        }
        
        await storage.set(chunkKey, chunkWrapper);
        
        // Update progress
        const progress = 70 + Math.floor((i + 1) / chunks.length * 25);
        await updateProgress(progressId, {
          phase: 'storing',
          percent: progress,
          status: `Storing chunks... ${i + 1}/${chunks.length}`,
          total: chunks.length,
          processed: i + 1
        });
      }
      
      // Store metadata
      const metadata = {
        exportId,
        totalChunks: chunks.length,
        totalSize: jsonSize,
        chunkSizeChars: CHUNK_SIZE_CHARS
      };
      await storage.set(`${exportKey}-metadata`, metadata);
    } else {
      // Store as single key
      await storage.set(exportKey, { data: jsonString });
    }

    // Phase 7: Complete (95-100%)
    const elapsed = Date.now() - startTime;
    
    await updateProgress(progressId, {
      phase: 'complete',
      percent: 100,
      status: `Export complete! ${allKeys.length} keys exported (${(jsonSize / 1024).toFixed(2)} KB) in ${elapsed}ms`,
      total: allKeys.length,
      processed: allKeys.length,
      results: {
        success: true,
        exportKey: exportKey,
        exportId: exportId,
        chunked: needsChunking,
        summary: exportData.summary,
        totalKeys: allKeys.length,
        jsonSize: jsonSize,
        elapsed: elapsed
      }
    });

    logSuccess('storageExportWorker', 'Export complete', { elapsed: `${elapsed}ms`, totalKeys: allKeys.length, jsonSizeKB: (jsonSize / 1024).toFixed(2) });

  } catch (error) {
    logFailure('storageExportWorker', 'Fatal error', error, { progressId, exportId });
    const elapsed = Date.now() - startTime;
    
    await updateProgress(progressId, {
      phase: 'error',
      percent: 0,
      status: `Export failed: ${error.message}`,
      total: 0,
      processed: 0,
      error: error.message,
      elapsed: elapsed
    });
  }
}

