/**
 * Version Manager
 *
 * Part of Phase 2 (v7.16.0) - Data Safety & Versioning System
 *
 * Provides comprehensive versioning infrastructure with automatic snapshots,
 * 14-day retention, and integrity validation to prevent data loss.
 *
 * Features:
 * - Automatic version snapshots with SHA-256 content hashing
 * - Time-based retention (14 days default, configurable)
 * - On-demand pruning (max once per day)
 * - Version history tracking
 * - Point-in-time restoration
 * - Integrity validation
 *
 * Storage Schema:
 * - version:{excerptId}:{timestamp}  - Individual version snapshot
 * - version-index:{excerptId}        - Array of version metadata
 * - last-prune-time                  - Timestamp of last pruning run
 *
 * Usage:
 * ```javascript
 * import { saveVersion, restoreVersion } from './utils/version-manager.js';
 *
 * // Before modifying data
 * await saveVersion(storage, `excerpt:${id}`, excerptData, { changeType: 'UPDATE' });
 *
 * // To restore
 * await restoreVersion(storage, versionId);
 * ```
 *
 * @module version-manager
 */

import { startsWith } from '@forge/api';
import {
  logFunction,
  logSuccess,
  logFailure,
  logPhase,
  logStorageOp,
  logSnapshot
} from './forge-logger.js';
import { validateExcerptData, validateMacroVarsData } from './storage-validator.js';

/**
 * Default retention period in days
 */
const DEFAULT_RETENTION_DAYS = 14;

/**
 * Minimum time between pruning runs (24 hours)
 */
const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Generate a unique version ID
 *
 * @param {string} excerptId - The excerpt/entity ID
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} Version ID in format: version:{excerptId}:{timestamp}
 */
function generateVersionId(excerptId, timestamp) {
  return `version:${excerptId}:${timestamp}`;
}

/**
 * Parse version ID to extract components
 *
 * @param {string} versionId - The version ID
 * @returns {Object} Parsed components: { excerptId, timestamp }
 */
export function parseVersionId(versionId) {
  const parts = versionId.split(':');
  if (parts.length !== 3 || parts[0] !== 'version') {
    throw new Error(`Invalid version ID format: ${versionId}`);
  }
  return {
    excerptId: parts[1],
    timestamp: parseInt(parts[2], 10)
  };
}

/**
 * Calculate SHA-256 content hash for version deduplication
 *
 * NOTE: This is DISTINCT from excerpt.contentHash (calculated by hash-utils.js).
 * There are TWO contentHash properties in this codebase with different purposes:
 *
 * 1. Source contentHash (hash-utils.js - WHITELIST approach):
 *    - Purpose: Staleness detection (did Source change since last sync?)
 *    - Applies to: excerpt:* objects (Sources)
 *    - Includes ONLY: content, name, category, variables, toggles, documentationLinks
 *    - Excludes: id, timestamps, source metadata (sourcePageId, etc.)
 *    - Used in: EmbedContainer.jsx staleness checks (excerpt.contentHash vs syncedContentHash)
 *
 * 2. Version contentHash (THIS function - BLACKLIST approach):
 *    - Purpose: Version deduplication (prevent duplicate snapshots when only timestamps change)
 *    - Applies to: version:* snapshot data (both Sources and Embeds)
 *    - Includes: ALL fields in data object EXCEPT timestamps/metadata
 *    - Excludes: updatedAt, lastSynced, cachedAt, restoredAt, restoredFrom, *At fields
 *    - Used in: saveVersion() to detect if version snapshot already exists
 *
 * For Embed data (macro-vars:*), this function hashes:
 * - excerptId, variableValues, toggleStates, customInsertions, internalNotes
 * - pageId, spaceId, syncedContentHash, syncedContent
 * But NOT: updatedAt, lastSynced, cachedAt, restoredAt, restoredFrom
 *
 * This prevents creating a new version snapshot when an Embed is re-saved
 * with identical configuration but a newer timestamp.
 *
 * @param {Object} data - The data to hash
 * @returns {string} SHA-256 hash in hex format
 */
function calculateContentHash(data) {
  const crypto = require('crypto');

  // Create a copy with timestamp/metadata fields excluded
  const contentOnly = { ...data };

  // Remove common timestamp fields
  delete contentOnly.updatedAt;
  delete contentOnly.lastSynced;
  delete contentOnly.cachedAt;
  delete contentOnly.restoredAt;
  delete contentOnly.restoredFrom;

  // Remove any other fields ending with "At" (timestamp convention)
  Object.keys(contentOnly).forEach(key => {
    if (key.endsWith('At') && key !== 'updatedAt') {
      delete contentOnly[key];
    }
  });

  const jsonString = JSON.stringify(contentOnly);
  return crypto.createHash('sha256').update(jsonString).digest('hex');
}

/**
 * Save a version snapshot before modifying data
 *
 * Creates a point-in-time snapshot with content hash for change detection.
 * Automatically triggers pruning if >24 hours since last prune.
 *
 * @param {Object} storageInstance - Forge storage instance
 * @param {string} storageKey - The storage key being versioned (e.g., "excerpt:abc123")
 * @param {Object} data - The current data to snapshot
 * @param {Object} metadata - Optional metadata about the change
 * @param {string} metadata.changeType - Type of change: CREATE, UPDATE, DELETE
 * @param {string} metadata.changedBy - Function/operation making the change
 * @returns {Promise<Object>} Result: { success: boolean, versionId: string, contentHash: string }
 */
export async function saveVersion(storageInstance, storageKey, data, metadata = {}) {
  const FUNCTION_NAME = 'saveVersion';
  logFunction(FUNCTION_NAME, 'START', { storageKey, changeType: metadata.changeType });

  try {
    // Check if pruning is needed (once per day)
    await pruneExpiredVersionsIfNeeded(storageInstance);

    // Extract entity ID from storage key (e.g., "excerpt:abc123" -> "abc123")
    const keyParts = storageKey.split(':');
    if (keyParts.length !== 2) {
      throw new Error(`Invalid storage key format: ${storageKey} (expected format: "type:id")`);
    }
    const entityType = keyParts[0]; // "excerpt", "macro-vars", etc.
    const entityId = keyParts[1];

    // Calculate content hash for change detection
    const contentHash = calculateContentHash(data);
    logPhase(FUNCTION_NAME, `Content hash: ${contentHash.substring(0, 16)}...`);

    // Check if content has changed since last version
    const versionIndex = await storageInstance.get(`version-index:${entityId}`) || { versions: [] };
    if (versionIndex.versions.length > 0) {
      const lastVersion = versionIndex.versions[versionIndex.versions.length - 1];
      if (lastVersion.contentHash === contentHash) {
        logPhase(FUNCTION_NAME, 'Content unchanged, skipping version snapshot');
        return {
          success: true,
          versionId: lastVersion.versionId,
          contentHash,
          skipped: true,
          reason: 'Content unchanged'
        };
      }
    }

    // Generate version ID
    const timestamp = Date.now();
    const versionId = generateVersionId(entityId, timestamp);

    // Create version snapshot
    const versionSnapshot = {
      versionId,
      entityId,
      entityType,
      storageKey,
      timestamp: new Date(timestamp).toISOString(),
      contentHash,
      data: JSON.parse(JSON.stringify(data)), // Deep clone to prevent mutations
      metadata: {
        changeType: metadata.changeType || 'UPDATE',
        changedBy: metadata.changedBy || 'unknown',
        ...metadata
      },
      createdAt: new Date().toISOString()
    };

    // Validate version snapshot structure
    const validation = validateVersionSnapshot(versionSnapshot);
    if (!validation.valid) {
      throw new Error(`Invalid version snapshot: ${validation.errors.join(', ')}`);
    }

    // Save version snapshot
    await storageInstance.set(versionId, versionSnapshot);
    logStorageOp(FUNCTION_NAME, 'WRITE', versionId, true);

    // Update version index
    versionIndex.versions.push({
      versionId,
      timestamp: versionSnapshot.timestamp,
      contentHash,
      changeType: versionSnapshot.metadata.changeType,
      size: JSON.stringify(versionSnapshot).length
    });

    // Keep index sorted by timestamp (oldest first)
    versionIndex.versions.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    await storageInstance.set(`version-index:${entityId}`, versionIndex);
    logStorageOp(FUNCTION_NAME, 'WRITE', `version-index:${entityId}`, true);

    // Log CSV snapshot for audit trail
    logSnapshot(FUNCTION_NAME, 'VERSION_CREATED', versionId, null, versionSnapshot);

    logSuccess(FUNCTION_NAME, `Version snapshot saved: ${versionId}`, {
      contentHash: contentHash.substring(0, 16),
      size: JSON.stringify(versionSnapshot).length
    });

    logFunction(FUNCTION_NAME, 'END', { success: true, versionId });

    return {
      success: true,
      versionId,
      contentHash,
      timestamp: versionSnapshot.timestamp
    };

  } catch (error) {
    logFailure(FUNCTION_NAME, 'Failed to save version snapshot', error, { storageKey });
    logFunction(FUNCTION_NAME, 'END', { success: false });
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * List all versions for an entity
 *
 * @param {Object} storageInstance - Forge storage instance
 * @param {string} entityId - The entity ID (excerptId, localId, etc.)
 * @returns {Promise<Object>} Result: { success: boolean, versions: Array, totalCount: number }
 */
export async function listVersions(storageInstance, entityId) {
  const FUNCTION_NAME = 'listVersions';
  logFunction(FUNCTION_NAME, 'START', { entityId });

  try {
    const versionIndex = await storageInstance.get(`version-index:${entityId}`);

    if (!versionIndex || !versionIndex.versions) {
      logPhase(FUNCTION_NAME, `No version history found for entity: ${entityId}`);
      return {
        success: true,
        versions: [],
        totalCount: 0
      };
    }

    logSuccess(FUNCTION_NAME, `Found ${versionIndex.versions.length} version(s) for entity: ${entityId}`);
    logFunction(FUNCTION_NAME, 'END', { success: true, count: versionIndex.versions.length });

    return {
      success: true,
      versions: versionIndex.versions,
      totalCount: versionIndex.versions.length
    };

  } catch (error) {
    logFailure(FUNCTION_NAME, 'Failed to list versions', error, { entityId });
    logFunction(FUNCTION_NAME, 'END', { success: false });
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get a specific version snapshot
 *
 * @param {Object} storageInstance - Forge storage instance
 * @param {string} versionId - The version ID
 * @returns {Promise<Object>} Result: { success: boolean, version: Object }
 */
export async function getVersion(storageInstance, versionId) {
  const FUNCTION_NAME = 'getVersion';
  logFunction(FUNCTION_NAME, 'START', { versionId });

  try {
    const versionSnapshot = await storageInstance.get(versionId);

    if (!versionSnapshot) {
      logPhase(FUNCTION_NAME, `Version not found: ${versionId}`);
      return {
        success: false,
        error: 'Version not found'
      };
    }

    // Validate version snapshot integrity
    const validation = validateVersionSnapshot(versionSnapshot);
    if (!validation.valid) {
      logFailure(FUNCTION_NAME, 'Version snapshot failed integrity check', validation.errors.join(', '), { versionId });
      return {
        success: false,
        error: `Version integrity check failed: ${validation.errors.join(', ')}`
      };
    }

    logSuccess(FUNCTION_NAME, `Retrieved version: ${versionId}`);
    logFunction(FUNCTION_NAME, 'END', { success: true });

    return {
      success: true,
      version: versionSnapshot
    };

  } catch (error) {
    logFailure(FUNCTION_NAME, 'Failed to get version', error, { versionId });
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
 * Validates the version data before restoring to active storage.
 * Creates a new version snapshot of current data before overwriting.
 *
 * @param {Object} storageInstance - Forge storage instance
 * @param {string} versionId - The version ID to restore from
 * @returns {Promise<Object>} Result: { success: boolean, storageKey: string, backupVersionId: string }
 */
export async function restoreVersion(storageInstance, versionId) {
  const FUNCTION_NAME = 'restoreVersion';
  logFunction(FUNCTION_NAME, 'START', { versionId });

  try {
    // Get version snapshot
    const versionResult = await getVersion(storageInstance, versionId);
    if (!versionResult.success) {
      throw new Error(versionResult.error || 'Failed to retrieve version');
    }

    const versionSnapshot = versionResult.version;
    const { storageKey, data, entityType } = versionSnapshot;

    logPhase(FUNCTION_NAME, `Restoring version to: ${storageKey}`);

    // Validate data before restore
    let validation;
    if (entityType === 'excerpt') {
      validation = validateExcerptData(data);
    } else if (entityType === 'macro-vars') {
      validation = validateMacroVarsData(data);
    } else {
      logPhase(FUNCTION_NAME, `No validator for entity type: ${entityType}, skipping validation`);
      validation = { valid: true, errors: [] };
    }

    if (!validation.valid) {
      throw new Error(`Version data failed validation: ${validation.errors.join(', ')}`);
    }

    // Create backup version of current data before overwriting
    const currentData = await storageInstance.get(storageKey);
    let backupVersionId = null;

    if (currentData) {
      logPhase(FUNCTION_NAME, 'Creating backup version of current data before restore');
      const backupResult = await saveVersion(
        storageInstance,
        storageKey,
        currentData,
        { changeType: 'BACKUP_BEFORE_RESTORE', changedBy: FUNCTION_NAME }
      );
      if (backupResult.success) {
        backupVersionId = backupResult.versionId;
        logPhase(FUNCTION_NAME, `Backup created: ${backupVersionId}`);
      }
    }

    // Restore data to active storage
    await storageInstance.set(storageKey, data);
    logStorageOp(FUNCTION_NAME, 'WRITE', storageKey, true);

    // Clear cached rendered content for macro-vars (Embeds)
    if (entityType === 'macro-vars' && storageKey.startsWith('macro-vars:')) {
      const localId = storageKey.replace('macro-vars:', '');
      const cacheKey = `macro-cache:${localId}`;

      try {
        await storageInstance.delete(cacheKey);
        logPhase(FUNCTION_NAME, `Invalidated cache: ${cacheKey}`);
        logStorageOp(FUNCTION_NAME, 'DELETE', cacheKey, true);
      } catch (cacheErr) {
        // Non-fatal error - log but don't fail the restore
        logPhase(FUNCTION_NAME, `Failed to invalidate cache (non-fatal): ${cacheErr.message}`);
      }
    }

    // Log CSV snapshot for audit trail
    logSnapshot(FUNCTION_NAME, 'RESTORE', storageKey, currentData, data);

    logSuccess(FUNCTION_NAME, `Restored version ${versionId} to ${storageKey}`, {
      backupVersionId
    });

    logFunction(FUNCTION_NAME, 'END', { success: true });

    return {
      success: true,
      storageKey,
      versionId,
      backupVersionId,
      message: `Successfully restored version from ${versionSnapshot.timestamp}`
    };

  } catch (error) {
    logFailure(FUNCTION_NAME, 'Failed to restore version', error, { versionId });
    logFunction(FUNCTION_NAME, 'END', { success: false });
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Prune expired versions (older than retention period)
 *
 * @param {Object} storageInstance - Forge storage instance
 * @param {number} retentionDays - Number of days to retain versions (default: 14)
 * @returns {Promise<Object>} Result: { success: boolean, prunedCount: number, errors: Array }
 */
export async function pruneExpiredVersions(storageInstance, retentionDays = DEFAULT_RETENTION_DAYS, options = {}) {
  const FUNCTION_NAME = 'pruneExpiredVersions';
  const { onlySourceVersions = false, sourceRetentionMinutes = null, maxPages = null, maxVersions = null } = options;
  
  logFunction(FUNCTION_NAME, 'START', { retentionDays, onlySourceVersions, sourceRetentionMinutes, maxPages });

  try {
    const now = Date.now();
    
    // If sourceRetentionMinutes is provided, use it for Source versions (one-time cleanup)
    // Otherwise use retentionDays for all versions
    const retentionMs = sourceRetentionMinutes 
      ? sourceRetentionMinutes * 60 * 1000  // Convert minutes to milliseconds
      : retentionDays * 24 * 60 * 60 * 1000; // Convert days to milliseconds
    const cutoffTime = now - retentionMs;

    const retentionDescription = sourceRetentionMinutes 
      ? `${sourceRetentionMinutes} minutes`
      : `${retentionDays} days`;
    
    logPhase(FUNCTION_NAME, `Pruning versions older than ${retentionDescription}`, {
      cutoffDate: new Date(cutoffTime).toISOString(),
      onlySourceVersions,
      maxPages: maxPages || 'all',
      maxVersions: maxVersions || 'all'
    });

    // Query version snapshots with pagination
    // If maxVersions is set, only process that many versions (for piecemeal processing)
    // This ensures we make progress through the entire dataset, not just the first pages
    const allVersions = [];
    let cursor = await storageInstance.query()
      .where('key', startsWith('version:'))
      .getMany();
    let pageCount = 1;

    // Add first page
    allVersions.push(...(cursor.results || []));

    // Paginate through ALL pages, but limit total versions processed if maxVersions is set
    while (cursor.nextCursor && (maxVersions === null || allVersions.length < maxVersions)) {
      cursor = await storageInstance.query()
        .where('key', startsWith('version:'))
        .cursor(cursor.nextCursor)
        .getMany();
      allVersions.push(...(cursor.results || []));
      pageCount++;
      
      // Log progress every 10 pages to avoid flooding logs
      if (pageCount % 10 === 0) {
        logPhase(FUNCTION_NAME, `Processed ${pageCount} pages, found ${allVersions.length} version(s) so far`);
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
    logPhase(FUNCTION_NAME, `Found ${allVersions.length} total version snapshot(s) across ${pageCount} page(s)${hasMorePages ? ' (more pages available)' : ''}`);

    let prunedCount = 0;
    let skippedCount = 0;
    const errors = [];

    // Check each version
    for (const entry of allVersions) {
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
          await storageInstance.delete(entry.key);
          logStorageOp(FUNCTION_NAME, 'DELETE', entry.key, true);
          prunedCount++;

          // Update version index
          const { entityId } = parseVersionId(entry.key);
          const versionIndex = await storageInstance.get(`version-index:${entityId}`);
          if (versionIndex && versionIndex.versions) {
            versionIndex.versions = versionIndex.versions.filter(v => v.versionId !== entry.key);
            await storageInstance.set(`version-index:${entityId}`, versionIndex);
          }
        } else {
          skippedCount++;
        }
      } catch (pruneError) {
        errors.push({
          versionId: entry.key,
          error: pruneError.message
        });
        logFailure(FUNCTION_NAME, `Failed to prune version: ${entry.key}`, pruneError);
      }
    }

    // Update last prune time (only if processing all versions, not piecemeal)
    if (maxVersions === null && maxPages === null) {
      await storageInstance.set('last-prune-time', new Date().toISOString());
    }

    logSuccess(FUNCTION_NAME, `Pruning complete`, {
      pruned: prunedCount,
      kept: skippedCount,
      errors: errors.length,
      pagesProcessed: pageCount,
      hasMorePages: hasMorePages
    });

    logFunction(FUNCTION_NAME, 'END', { success: true, prunedCount });

    return {
      success: true,
      prunedCount,
      skippedCount,
      errors,
      pagesProcessed: pageCount,
      hasMorePages: hasMorePages,
      message: hasMorePages 
        ? `Pruned ${prunedCount} version(s) from ${pageCount} page(s). More pages available - run again to continue.`
        : `Pruned ${prunedCount} version(s) from ${pageCount} page(s).`
    };

  } catch (error) {
    logFailure(FUNCTION_NAME, 'Failed to prune expired versions', error);
    logFunction(FUNCTION_NAME, 'END', { success: false });
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Prune expired versions if needed (on-demand, max once per day)
 *
 * Checks when pruning was last run and only prunes if >24 hours ago.
 *
 * @param {Object} storageInstance - Forge storage instance
 * @returns {Promise<void>}
 */
async function pruneExpiredVersionsIfNeeded(storageInstance) {
  const FUNCTION_NAME = 'pruneExpiredVersionsIfNeeded';

  try {
    const lastPruneTime = await storageInstance.get('last-prune-time');
    const lastSourcePruneTime = await storageInstance.get('last-source-prune-time');

    // One-time cleanup: Prune all old Source versions (2-minute retention)
    // This will run once after deployment to clean up old Source version data
    if (!lastSourcePruneTime) {
      logPhase(FUNCTION_NAME, 'First run: Pruning all old Source versions (2-minute retention)');
      await pruneExpiredVersions(storageInstance, DEFAULT_RETENTION_DAYS, {
        onlySourceVersions: true,
        sourceRetentionMinutes: 2
      });
      await storageInstance.set('last-source-prune-time', new Date().toISOString());
      // Continue with normal pruning for Embed versions
    }

    // Normal pruning for Embed versions (14-day retention)
    if (!lastPruneTime) {
      // Never pruned, run now
      logPhase(FUNCTION_NAME, 'No prune history found, running pruning now');
      await pruneExpiredVersions(storageInstance);
      return;
    }

    const lastPruneMs = new Date(lastPruneTime).getTime();
    const now = Date.now();
    const timeSinceLastPrune = now - lastPruneMs;

    if (timeSinceLastPrune > PRUNE_INTERVAL_MS) {
      logPhase(FUNCTION_NAME, `Last prune was ${Math.round(timeSinceLastPrune / (60 * 60 * 1000))} hours ago, running pruning now`);
      await pruneExpiredVersions(storageInstance);
    } else {
      logPhase(FUNCTION_NAME, `Last prune was ${Math.round(timeSinceLastPrune / (60 * 60 * 1000))} hours ago, skipping`);
    }
  } catch (error) {
    logFailure(FUNCTION_NAME, 'Failed to check prune status', error);
    // Non-fatal - continue with save operation
  }
}

/**
 * Validate version snapshot structure
 *
 * @param {Object} snapshot - The version snapshot to validate
 * @returns {Object} Validation result: { valid: boolean, errors: Array }
 */
function validateVersionSnapshot(snapshot) {
  const errors = [];

  if (!snapshot || typeof snapshot !== 'object') {
    return { valid: false, errors: ['Version snapshot must be an object'] };
  }

  // Required fields
  if (!snapshot.versionId || typeof snapshot.versionId !== 'string') {
    errors.push('Missing or invalid versionId');
  }

  if (!snapshot.entityId || typeof snapshot.entityId !== 'string') {
    errors.push('Missing or invalid entityId');
  }

  if (!snapshot.timestamp || typeof snapshot.timestamp !== 'string') {
    errors.push('Missing or invalid timestamp');
  }

  if (!snapshot.contentHash || typeof snapshot.contentHash !== 'string') {
    errors.push('Missing or invalid contentHash');
  } else if (snapshot.contentHash.length !== 64) {
    errors.push('Invalid contentHash (must be 64-character SHA-256 hash)');
  }

  if (!snapshot.data || typeof snapshot.data !== 'object') {
    errors.push('Missing or invalid data (must be object)');
  }

  // Metadata validation
  if (!snapshot.metadata || typeof snapshot.metadata !== 'object') {
    errors.push('Missing or invalid metadata');
  } else {
    if (!snapshot.metadata.changeType || typeof snapshot.metadata.changeType !== 'string') {
      errors.push('Missing or invalid metadata.changeType');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Get versioning statistics
 *
 * @param {Object} storageInstance - Forge storage instance
 * @returns {Promise<Object>} Statistics about versioning system
 */
export async function getVersioningStats(storageInstance) {
  const FUNCTION_NAME = 'getVersioningStats';
  logFunction(FUNCTION_NAME, 'START');

  try {
    // Query all version snapshots
    const versionsQuery = await storageInstance.query()
      .where('key', startsWith('version:'))
      .getMany();

    // Query all version indexes
    const indexesQuery = await storageInstance.query()
      .where('key', startsWith('version-index:'))
      .getMany();

    // Calculate total storage size
    let totalSize = 0;
    const versionsByEntity = {};

    for (const entry of versionsQuery.results) {
      const size = JSON.stringify(entry.value).length;
      totalSize += size;

      const { entityId } = parseVersionId(entry.key);
      if (!versionsByEntity[entityId]) {
        versionsByEntity[entityId] = { count: 0, size: 0 };
      }
      versionsByEntity[entityId].count++;
      versionsByEntity[entityId].size += size;
    }

    // Get last prune time
    const lastPruneTime = await storageInstance.get('last-prune-time');

    const stats = {
      totalVersions: versionsQuery.results.length,
      totalEntities: indexesQuery.results.length,
      totalSizeBytes: totalSize,
      totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
      lastPruneTime: lastPruneTime || 'Never',
      versionsByEntity: Object.keys(versionsByEntity).length,
      retentionDays: DEFAULT_RETENTION_DAYS
    };

    logSuccess(FUNCTION_NAME, 'Retrieved versioning stats', stats);
    logFunction(FUNCTION_NAME, 'END', { success: true });

    return {
      success: true,
      stats
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
