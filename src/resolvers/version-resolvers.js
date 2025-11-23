/**
 * Version Resolvers
 *
 * Part of Phase 2 (v7.16.0) - Data Safety & Versioning System
 *
 * UI endpoints for version management:
 * - getVersionHistory: Fetch version history for Admin UI
 * - restoreFromVersion: Restore from specific version
 * - pruneVersionsNow: Manual pruning trigger (admin function)
 * - getVersioningStats: Storage usage and retention stats
 *
 * These resolvers provide UI access to the version-manager.js utilities.
 *
 * @module version-resolvers
 */

import { storage } from '@forge/api';
import { Queue } from '@forge/events';
import { generateUUID } from '../utils.js';
import {
  listVersions,
  getVersion,
  restoreVersion,
  pruneExpiredVersions,
  getVersioningStats
} from '../utils/version-manager.js';
import {
  logFunction,
  logSuccess,
  logFailure,
  logPhase
} from '../utils/forge-logger.js';

/**
 * Get version history for an entity
 *
 * UI endpoint to fetch all versions for a Source or Embed.
 * Returns version metadata sorted by timestamp (newest first).
 *
 * @param {Object} req - Forge request object
 * @param {string} req.payload.entityId - The entity ID (excerptId, localId, etc.)
 * @returns {Promise<Object>} { success: boolean, versions: Array, totalCount: number }
 *
 * @example
 * const result = await invoke('getVersionHistory', { entityId: 'abc123' });
 * // Returns: { success: true, versions: [...], totalCount: 5 }
 */
export async function getVersionHistory(req) {
  const FUNCTION_NAME = 'getVersionHistory';
  const { entityId } = req.payload;

  logFunction(FUNCTION_NAME, 'START', { entityId });

  try {
    if (!entityId || typeof entityId !== 'string') {
      throw new Error('Missing or invalid entityId parameter');
    }

    const result = await listVersions(storage, entityId);

    if (!result.success) {
      throw new Error(result.error || 'Failed to list versions');
    }

    // Sort versions by timestamp (newest first) for UI display
    const sortedVersions = result.versions
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .map(version => ({
        ...version,
        // Format timestamp for UI
        formattedTimestamp: new Date(version.timestamp).toLocaleString(),
        // Truncate content hash for display
        shortHash: version.contentHash ? version.contentHash.substring(0, 8) : null,
        // Format size in KB
        sizeKB: version.size ? (version.size / 1024).toFixed(2) : null
      }));

    logSuccess(FUNCTION_NAME, `Retrieved ${sortedVersions.length} version(s) for entity: ${entityId}`);
    logFunction(FUNCTION_NAME, 'END', { success: true, count: sortedVersions.length });

    return {
      success: true,
      versions: sortedVersions,
      totalCount: result.totalCount,
      entityId
    };

  } catch (error) {
    logFailure(FUNCTION_NAME, 'Failed to get version history', error, { entityId });
    logFunction(FUNCTION_NAME, 'END', { success: false });
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get details for a specific version
 *
 * UI endpoint to fetch full version snapshot including data payload.
 * Used for version preview/comparison before restore.
 *
 * @param {Object} req - Forge request object
 * @param {string} req.payload.versionId - The version ID
 * @returns {Promise<Object>} { success: boolean, version: Object }
 *
 * @example
 * const result = await invoke('getVersionDetails', {
 *   versionId: 'version:abc123:1699564800000'
 * });
 */
export async function getVersionDetails(req) {
  const FUNCTION_NAME = 'getVersionDetails';
  const { versionId } = req.payload;

  logFunction(FUNCTION_NAME, 'START', { versionId });

  try {
    if (!versionId || typeof versionId !== 'string') {
      throw new Error('Missing or invalid versionId parameter');
    }

    const result = await getVersion(storage, versionId);

    if (!result.success) {
      throw new Error(result.error || 'Failed to get version');
    }

    const version = result.version;

    // Enrich version data for UI display
    const enrichedVersion = {
      ...version,
      formattedTimestamp: new Date(version.timestamp).toLocaleString(),
      shortHash: version.contentHash ? version.contentHash.substring(0, 8) : null,
      sizeBytes: JSON.stringify(version.data).length,
      sizeKB: (JSON.stringify(version.data).length / 1024).toFixed(2),
      dataPreview: generateDataPreview(version.data)
    };

    logSuccess(FUNCTION_NAME, `Retrieved version details: ${versionId}`);
    logFunction(FUNCTION_NAME, 'END', { success: true });

    return {
      success: true,
      version: enrichedVersion
    };

  } catch (error) {
    logFailure(FUNCTION_NAME, 'Failed to get version details', error, { versionId });
    logFunction(FUNCTION_NAME, 'END', { success: false });
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Restore data from a version snapshot
 *
 * UI endpoint to restore from a specific version.
 * Creates backup of current data before overwriting.
 *
 * @param {Object} req - Forge request object
 * @param {string} req.payload.versionId - The version ID to restore from
 * @returns {Promise<Object>} { success: boolean, storageKey: string, backupVersionId: string }
 *
 * @example
 * const result = await invoke('restoreFromVersion', {
 *   versionId: 'version:abc123:1699564800000'
 * });
 */
export async function restoreFromVersion(req) {
  const FUNCTION_NAME = 'restoreFromVersion';
  const { versionId } = req.payload;

  logFunction(FUNCTION_NAME, 'START', { versionId });

  try {
    if (!versionId || typeof versionId !== 'string') {
      throw new Error('Missing or invalid versionId parameter');
    }

    logPhase(FUNCTION_NAME, `Restoring from version: ${versionId}`);

    const result = await restoreVersion(storage, versionId);

    if (!result.success) {
      throw new Error(result.error || 'Failed to restore version');
    }

    logSuccess(FUNCTION_NAME, `Successfully restored version: ${versionId}`, {
      storageKey: result.storageKey,
      backupVersionId: result.backupVersionId
    });

    logFunction(FUNCTION_NAME, 'END', { success: true });

    return {
      success: true,
      storageKey: result.storageKey,
      versionId: result.versionId,
      backupVersionId: result.backupVersionId,
      message: result.message
    };

  } catch (error) {
    logFailure(FUNCTION_NAME, 'Failed to restore from version', error, { versionId });
    logFunction(FUNCTION_NAME, 'END', { success: false });
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Start version pruning - Trigger resolver for async processing
 *
 * Queues a pruning job that runs in the background with up to 15 minutes timeout.
 * Frontend should poll getCheckProgress for status updates.
 *
 * @param {Object} req - Forge request object
 * @param {boolean} req.payload.onlySourceVersions - Optional: Only prune Source versions (default: false)
 * @param {number} req.payload.sourceRetentionMinutes - Optional: Retention in minutes for Source versions (default: 2)
 * @returns {Promise<Object>} { success: boolean, jobId: string, progressId: string }
 *
 * @example
 * // Prune all old Source versions (2-minute retention, one-time cleanup)
 * const result = await invoke('startPruneVersions', { 
 *   onlySourceVersions: true, 
 *   sourceRetentionMinutes: 2 
 * });
 */
export async function startPruneVersions(req) {
  const FUNCTION_NAME = 'startPruneVersions';
  const { onlySourceVersions = false, sourceRetentionMinutes = 2 } = req.payload || {};

  logFunction(FUNCTION_NAME, 'START', { onlySourceVersions, sourceRetentionMinutes });

  try {
    // Generate progressId for frontend polling
    const progressId = generateUUID();

    // Initialize progress state (queued)
    await storage.set(`progress:${progressId}`, {
      phase: 'queued',
      percent: 0,
      status: 'Version pruning job queued...',
      total: 0,
      processed: 0,
      queuedAt: new Date().toISOString()
    });

    // Create queue and push event
    const queue = new Queue({ key: 'prune-versions-queue' });
    const { jobId } = await queue.push({
      body: { progressId, onlySourceVersions, sourceRetentionMinutes }
    });

    logSuccess(FUNCTION_NAME, 'Job queued successfully', { jobId, progressId, onlySourceVersions, sourceRetentionMinutes });

    return {
      success: true,
      jobId,
      progressId,
      message: 'Version pruning job queued successfully'
    };

  } catch (error) {
    logFailure(FUNCTION_NAME, 'Failed to queue pruning job', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Manually trigger version pruning (synchronous - for small datasets only)
 *
 * @deprecated Use startPruneVersions for large datasets (50+ pages)
 * This function is kept for backwards compatibility but will timeout on large datasets.
 */
export async function pruneVersionsNow(req) {
  const FUNCTION_NAME = 'pruneVersionsNow';
  const { retentionDays, onlySourceVersions, sourceRetentionMinutes, maxPages = 10 } = req.payload || {};

  logFunction(FUNCTION_NAME, 'START', { retentionDays, onlySourceVersions, sourceRetentionMinutes, maxPages });

  try {
    logPhase(FUNCTION_NAME, `Manually triggering version pruning (synchronous, ${maxPages} pages per call)`);

    const result = await pruneExpiredVersions(storage, retentionDays, {
      onlySourceVersions: onlySourceVersions || false,
      sourceRetentionMinutes: sourceRetentionMinutes || null,
      maxPages: maxPages || null // Default to 10 pages for piecemeal processing
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to prune versions');
    }

    logSuccess(FUNCTION_NAME, `Pruned ${result.prunedCount} expired version(s)`, {
      pruned: result.prunedCount,
      kept: result.skippedCount,
      errors: result.errors.length,
      pagesProcessed: result.pagesProcessed,
      hasMorePages: result.hasMorePages
    });

    logFunction(FUNCTION_NAME, 'END', { success: true, prunedCount: result.prunedCount });

    return {
      success: true,
      prunedCount: result.prunedCount,
      skippedCount: result.skippedCount,
      errors: result.errors,
      pagesProcessed: result.pagesProcessed,
      hasMorePages: result.hasMorePages,
      message: result.message || `Successfully pruned ${result.prunedCount} expired version(s)`
    };

  } catch (error) {
    logFailure(FUNCTION_NAME, 'Failed to prune versions', error);
    logFunction(FUNCTION_NAME, 'END', { success: false });
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get versioning system statistics
 *
 * UI endpoint to display versioning stats on Admin page.
 * Shows storage usage, retention settings, and prune history.
 *
 * @param {Object} req - Forge request object
 * @returns {Promise<Object>} { success: boolean, stats: Object }
 *
 * @example
 * const result = await invoke('getVersioningStats');
 * // Returns: { success: true, stats: { totalVersions: 50, totalSizeMB: 1.5, ... } }
 */
export async function getVersioningStatsResolver() {
  const FUNCTION_NAME = 'getVersioningStats';

  logFunction(FUNCTION_NAME, 'START');

  try {
    const result = await getVersioningStats(storage);

    if (!result.success) {
      throw new Error(result.error || 'Failed to get versioning stats');
    }

    logSuccess(FUNCTION_NAME, 'Retrieved versioning stats', result.stats);
    logFunction(FUNCTION_NAME, 'END', { success: true });

    return {
      success: true,
      stats: result.stats
    };

  } catch (error) {
    logFailure(FUNCTION_NAME, 'Failed to get versioning stats', error);
    logFunction(FUNCTION_NAME, 'END', { success: false });
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Generate a preview of version data for UI display
 *
 * @param {Object} data - The version data
 * @returns {Object} Preview data with key fields
 * @private
 */
function generateDataPreview(data) {
  if (!data || typeof data !== 'object') {
    return { type: 'unknown', preview: 'No data' };
  }

  // Excerpt data preview
  if (data.id && data.name && data.content) {
    return {
      type: 'excerpt',
      id: data.id,
      name: data.name,
      category: data.category || 'General',
      variableCount: Array.isArray(data.variables) ? data.variables.length : 0,
      toggleCount: Array.isArray(data.toggles) ? data.toggles.length : 0,
      contentType: typeof data.content === 'object' ? 'ADF' : 'Storage Format'
    };
  }

  // Macro-vars data preview
  if (data.excerptId && (data.variableValues || data.toggleStates)) {
    return {
      type: 'macro-vars',
      excerptId: data.excerptId,
      pageId: data.pageId || 'Unknown',
      variableCount: data.variableValues ? Object.keys(data.variableValues).length : 0,
      toggleCount: data.toggleStates ? Object.keys(data.toggleStates).length : 0
    };
  }

  // Generic preview
  return {
    type: 'generic',
    keys: Object.keys(data).slice(0, 5).join(', '),
    size: JSON.stringify(data).length
  };
}
