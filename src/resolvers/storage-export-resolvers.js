/**
 * Storage Export Resolvers
 *
 * Provides functionality to export all storage data from Forge storage
 * to a JSON file for copying to development environment.
 *
 * Exports ALL data types for complete clone of production storage.
 *
 * Uses async worker pattern for long-running exports (up to 15 minutes).
 */

import { storage, startsWith } from '@forge/api';
import { Queue } from '@forge/events';
import { generateUUID } from '../utils.js';
import { logFunction, logPhase, logSuccess, logFailure, logWarning } from '../utils/forge-logger.js';

/**
 * Helper: Fetch all pages from a storage query cursor
 * Reused from verification-resolvers.js pattern
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
 * Forge storage requires a prefix filter, so we query all known prefixes
 * and combine the results for a complete export
 * 
 * @returns {Promise<Array>} Array of { key, value } objects
 */
async function getAllStorageKeys() {
  const allKeys = [];
  
  // List of all known prefixes to query
  // This ensures we get ALL data types for complete export
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
      logWarning('getAllStorageKeys', 'Error querying prefix', { prefix, error: error.message });
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
 * Export all storage data to JSON format
 * 
 * Collects ALL storage keys and values, organizing them by type for easier inspection.
 * Returns a JSON string that can be downloaded and imported into development.
 * 
 * @param {Object} req - Request object (no payload needed)
 * @returns {Object} { success: boolean, data: string, summary: Object, error?: string }
 */
export async function exportAllStorageData() {
  const startTime = Date.now();
  
  try {
    logFunction('exportAllStorageData', 'START', {});

    // Get all storage keys
    const allKeys = await getAllStorageKeys();

    // Organize data by type for easier inspection
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

    // Categorize each key-value pair
    for (const entry of allKeys) {
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
        // Catch-all for any other keys (e.g., excerpt-index, admin-url, etc.)
        organizedData.other.push({ key, value });
      }
    }

    // Create export structure with metadata
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
    
    // Serialize to JSON
    const jsonString = JSON.stringify(exportData, null, 2);
    const jsonSize = new Blob([jsonString]).size;
    
    // Store export in storage to avoid GraphQL response size limits (5MB)
    // Also chunk if needed to avoid individual key size limits (245,760 characters per key)
    const exportId = Date.now();
    const exportKey = `export-temp-${exportId}`;
    
    // Chunk size: 120,000 characters per chunk
    // Forge limit is 245,760 characters per key value
    // We store as { data: string, index: number }, which gets JSON stringified
    // JSON escaping can expand strings significantly (e.g., " becomes \", \n becomes \\n)
    // Using 120K to leave ~125K for wrapper + escaping overhead (very safe margin)
    const CHUNK_SIZE_CHARS = 120000;
    const needsChunking = jsonString.length > CHUNK_SIZE_CHARS;
    
    if (needsChunking) {
      // Split into chunks (by character count, not bytes)
      const chunks = [];
      for (let i = 0; i < jsonString.length; i += CHUNK_SIZE_CHARS) {
        chunks.push(jsonString.slice(i, i + CHUNK_SIZE_CHARS));
      }
      
      logPhase('exportAllStorageData', 'Chunking export', { chunkCount: chunks.length });
      
      // Store each chunk (wrap in object to ensure proper storage)
      // Validate size after JSON stringification to ensure under 245,760 character limit
      const MAX_CHARS = 245760;
      for (let i = 0; i < chunks.length; i++) {
        const chunkKey = `${exportKey}-chunk-${i}`;
        const chunkWrapper = { data: chunks[i], index: i };
        const jsonStringified = JSON.stringify(chunkWrapper);
        
        if (jsonStringified.length > MAX_CHARS) {
          // This shouldn't happen with 120K chunks, but handle it gracefully
          logWarning('exportAllStorageData', 'Chunk too large after JSON stringification', { chunkIndex: i, size: jsonStringified.length });
          throw new Error(`Chunk ${i} exceeds storage limit after JSON encoding (${jsonStringified.length} > ${MAX_CHARS} chars). This indicates the chunk size needs to be reduced further.`);
        }
        
        try {
          await storage.set(chunkKey, chunkWrapper);
        } catch (chunkError) {
          logFailure('exportAllStorageData', 'Error storing chunk', chunkError, { chunkIndex: i });
          throw new Error(`Failed to store chunk ${i}: ${chunkError.message}`);
        }
      }
      
      // Store metadata about chunks
      const metadata = {
        exportId,
        totalChunks: chunks.length,
        totalSize: jsonSize,
        chunkSizeChars: CHUNK_SIZE_CHARS
      };
      await storage.set(`${exportKey}-metadata`, metadata);
    } else {
      // Small enough to store in single key (wrap in object)
      try {
        await storage.set(exportKey, { data: jsonString });
      } catch (storeError) {
        logFailure('exportAllStorageData', 'Error storing export', storeError);
        throw new Error(`Failed to store export: ${storeError.message}`);
      }
    }
    
    const elapsed = Date.now() - startTime;
    logSuccess('exportAllStorageData', 'Export complete', { duration: `${elapsed}ms`, totalKeys: allKeys.length, jsonSizeKB: (jsonSize / 1024).toFixed(2) });

    return {
      success: true,
      exportKey: exportKey,
      exportId: exportId,
      chunked: needsChunking,
      summary: exportData.summary,
      totalKeys: allKeys.length,
      jsonSize: jsonSize,
      elapsed: elapsed
    };
  } catch (error) {
    logFailure('exportAllStorageData', 'Error exporting storage', error);
    const elapsed = Date.now() - startTime;
    
    // Provide helpful error messages
    let errorMessage = error.message || 'Unknown error occurred during export';
    
    // Check if it's likely a timeout (Forge's 30s limit)
    if (elapsed > 28000) {
      errorMessage = `Export likely timed out after ${elapsed}ms (Forge has a 30-second limit). ` +
        `If your storage is large, this may be expected. The export may have partially completed. ` +
        `Original error: ${errorMessage}`;
    }
    
    return {
      success: false,
      error: errorMessage,
      data: null,
      summary: null,
      elapsed: elapsed
    };
  }
}

/**
 * Get export metadata (chunk count, etc.)
 * 
 * @param {Object} req - Request object
 * @param {string} req.payload.exportKey - Storage key returned by exportAllStorageData
 * @returns {Object} { success: boolean, chunked: boolean, totalChunks: number, error?: string }
 */
export async function getExportMetadata(req) {
  try {
    const { exportKey } = req.payload;

    if (!exportKey) {
      return {
        success: false,
        error: 'Export key is required'
      };
    }

    const metadata = await storage.get(`${exportKey}-metadata`);
    
    if (metadata && metadata.totalChunks) {
      return {
        success: true,
        chunked: true,
        totalChunks: metadata.totalChunks
      };
    } else {
      // Check if single key exists
      const exportData = await storage.get(exportKey);
      return {
        success: !!exportData,
        chunked: false,
        totalChunks: 1
      };
    }
  } catch (error) {
    logFailure('getExportMetadata', 'Error fetching export metadata', error);
    return {
      success: false,
      error: error.message,
      chunked: false,
      totalChunks: 0
    };
  }
}

/**
 * Start storage export job (async worker pattern)
 * 
 * Queues an export job that runs in the background with up to 15 minutes timeout.
 * Frontend should poll getExportProgress for status updates.
 * 
 * @param {Object} req - Request object (no payload needed)
 * @returns {Object} { success: boolean, jobId: string, progressId: string, error?: string }
 */
export async function startStorageExport() {
  try {
    // Generate IDs for tracking
    const progressId = generateUUID();
    const exportId = Date.now();

    // Initialize progress state (queued)
    await storage.set(`progress:${progressId}`, {
      phase: 'queued',
      percent: 0,
      status: 'Export job queued...',
      total: 0,
      processed: 0,
      queuedAt: new Date().toISOString()
    });

    // Create queue and push event
    const queue = new Queue({ key: 'storage-export-queue' });
    const { jobId } = await queue.push({
      body: { progressId, exportId }
    });

    logSuccess('startStorageExport', 'Job queued', { jobId, progressId, exportId });

    // Return immediately - worker will process in background
    return {
      success: true,
      jobId,
      progressId,
      exportId,
      message: 'Storage export job queued successfully'
    };

  } catch (error) {
    logFailure('startStorageExport', 'Error starting export job', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get export progress
 * 
 * Polls the progress state for an ongoing export job.
 * 
 * @param {Object} req - Request object
 * @param {string} req.payload.progressId - Progress ID returned by startStorageExport
 * @returns {Object} { success: boolean, progress: Object, error?: string }
 */
export async function getExportProgress(req) {
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
        error: 'Progress not found. The export job may not have started yet.'
      };
    }

    return {
      success: true,
      progress
    };
  } catch (error) {
    logFailure('getExportProgress', 'Error fetching export progress', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get a single chunk of exported data
 * 
 * Fetches a single chunk by index to avoid GraphQL response size limits.
 * Client should fetch all chunks and assemble them.
 * 
 * @param {Object} req - Request object
 * @param {string} req.payload.exportKey - Storage key returned by exportAllStorageData
 * @param {number} req.payload.chunkIndex - Chunk index (0-based)
 * @returns {Object} { success: boolean, data: string, error?: string }
 */
export async function getExportChunk(req) {
  try {
    const { exportKey, chunkIndex } = req.payload;

    if (!exportKey) {
      return {
        success: false,
        error: 'Export key is required'
      };
    }

    if (chunkIndex === undefined || chunkIndex === null) {
      return {
        success: false,
        error: 'Chunk index is required'
      };
    }

    // Check if export is chunked
    const metadata = await storage.get(`${exportKey}-metadata`);
    
    if (metadata && metadata.totalChunks) {
      // Fetch specific chunk
      if (chunkIndex < 0 || chunkIndex >= metadata.totalChunks) {
        return {
          success: false,
          error: `Invalid chunk index: ${chunkIndex} (valid range: 0-${metadata.totalChunks - 1})`
        };
      }

      const chunkKey = `${exportKey}-chunk-${chunkIndex}`;
      const chunkData = await storage.get(chunkKey);
      
      if (!chunkData) {
        return {
          success: false,
          error: `Chunk ${chunkIndex} not found`
        };
      }
      
      // Handle wrapped format { data: string, index: number }
      const chunk = typeof chunkData === 'string' ? chunkData : (chunkData.data || chunkData);
      
      if (typeof chunk !== 'string') {
        return {
          success: false,
          error: `Chunk ${chunkIndex} invalid format`
        };
      }
      
      return {
        success: true,
        data: chunk
      };
    } else {
      // Single key (not chunked) - only return if chunkIndex is 0
      if (chunkIndex !== 0) {
        return {
          success: false,
          error: 'Export is not chunked, only chunk index 0 is valid'
        };
      }

      const exportData = await storage.get(exportKey);

      if (!exportData) {
        return {
          success: false,
          error: 'Export data not found'
        };
      }

      // Handle wrapped format { data: string }
      const jsonString = typeof exportData === 'string' ? exportData : (exportData.data || exportData);

      if (typeof jsonString !== 'string') {
        return {
          success: false,
          error: 'Export data invalid format'
        };
      }

      return {
        success: true,
        data: jsonString
      };
    }
  } catch (error) {
    logFailure('getExportChunk', 'Error fetching export chunk', error);
    return {
      success: false,
      error: error.message,
      data: null
    };
  }
}

