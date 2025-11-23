/**
 * Restore and Recovery Resolvers
 *
 * Provides functions to restore embed configurations from:
 * - Soft-deleted items (macro-vars-deleted: namespace)
 * - Backup snapshots (backup-{timestamp}:embed: namespace)
 *
 * All restore operations support preview before commit for safety.
 */

import { storage, startsWith } from '@forge/api';
import { logSuccess, logFailure } from '../utils/forge-logger.js';

/**
 * List all available backup snapshots
 * Returns metadata for each backup including timestamp, embed count, operation type
 */
export async function listBackups() {
  try {
    // Query all backup metadata entries
    const backupKeys = await storage.query()
      .where('key', startsWith('backup-'))
      .getMany();

    // Filter for metadata entries only (exclude individual embed backups)
    const backupMetadata = [];
    for (const entry of backupKeys.results) {
      if (entry.key.endsWith(':metadata')) {
        backupMetadata.push({
          key: entry.key,
          ...entry.value
        });
      }
    }

    // Sort by creation date (most recent first)
    const sortedBackups = backupMetadata.sort((a, b) =>
      new Date(b.createdAt) - new Date(a.createdAt)
    );

    return {
      success: true,
      backups: sortedBackups,
      count: sortedBackups.length
    };
  } catch (error) {
    logFailure('listBackups', 'Error listing backups', error);
    return {
      success: false,
      error: error.message,
      backups: []
    };
  }
}

/**
 * List all soft-deleted embeds that can be restored
 * Returns embeds moved to macro-vars-deleted: namespace within recovery window
 */
export async function listDeletedEmbeds() {
  try {
    // Query all soft-deleted embed configs
    const deletedKeys = await storage.query()
      .where('key', startsWith('macro-vars-deleted:'))
      .getMany();

    // Build array of deleted embed info
    const deletedEmbeds = deletedKeys.results.map(entry => {
      const localId = entry.key.replace('macro-vars-deleted:', '');
      const data = entry.value;

      return {
        localId,
        excerptId: data.excerptId,
        deletedAt: data.deletedAt,
        deletedBy: data.deletedBy,
        deletionReason: data.deletionReason,
        canRecover: data.canRecover,
        pageId: data.pageId,
        pageTitle: data.pageTitle,
        hasVariableValues: !!data.variableValues && Object.keys(data.variableValues).length > 0,
        hasToggleStates: !!data.toggleStates && Object.keys(data.toggleStates).length > 0,
        hasCustomInsertions: !!data.customInsertions && data.customInsertions.length > 0,
        hasInternalNotes: !!data.internalNotes && data.internalNotes.length > 0
      };
    });

    // Sort by deletion date (most recent first)
    const sortedDeleted = deletedEmbeds.sort((a, b) =>
      new Date(b.deletedAt) - new Date(a.deletedAt)
    );

    return {
      success: true,
      deletedEmbeds: sortedDeleted,
      count: sortedDeleted.length
    };
  } catch (error) {
    logFailure('listDeletedEmbeds', 'Error listing deleted embeds', error);
    return {
      success: false,
      error: error.message,
      deletedEmbeds: []
    };
  }
}

/**
 * Preview embed configuration from a backup
 * Shows what would be restored WITHOUT actually restoring
 * Phase 1 of two-phase restore process
 */
export async function previewFromBackup(req) {
  const { backupId, localId } = req.payload || {};
  const extractedBackupId = backupId; // Extract for use in catch block
  const extractedLocalId = localId; // Extract for use in catch block
  
  try {

    // Get the backed-up embed data
    const backupData = await storage.get(`${backupId}:embed:${localId}`);

    if (!backupData) {
      return {
        success: false,
        error: `No backup found for embed ${localId} in backup ${backupId}`
      };
    }

    // Get current data for comparison (if exists)
    const currentData = await storage.get(`macro-vars:${localId}`);

    return {
      success: true,
      preview: {
        localId,
        backupId,
        backupData: {
          excerptId: backupData.excerptId,
          variableValues: backupData.variableValues || {},
          toggleStates: backupData.toggleStates || {},
          customInsertions: backupData.customInsertions || [],
          internalNotes: backupData.internalNotes || [],
          lastSynced: backupData.lastSynced,
          contentHash: backupData.contentHash
        },
        currentData: currentData ? {
          excerptId: currentData.excerptId,
          variableValues: currentData.variableValues || {},
          toggleStates: currentData.toggleStates || {},
          customInsertions: currentData.customInsertions || [],
          internalNotes: currentData.internalNotes || [],
          lastSynced: currentData.lastSynced,
          contentHash: currentData.contentHash
        } : null,
        hasConflict: !!currentData,
        canRestore: true
      }
    };
  } catch (error) {
    logFailure('previewFromBackup', 'Error previewing backup', error, { backupId: extractedBackupId, localId: extractedLocalId });
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Preview soft-deleted embed configuration
 * Shows what would be restored WITHOUT actually restoring
 * Phase 1 of two-phase restore process
 */
export async function previewDeletedEmbed(req) {
  const { localId } = req.payload || {};
  const extractedLocalId = localId; // Extract for use in catch block
  
  try {

    // Get the soft-deleted data
    const deletedData = await storage.get(`macro-vars-deleted:${localId}`);

    if (!deletedData) {
      return {
        success: false,
        error: `No soft-deleted data found for embed ${localId}`
      };
    }

    // Get current data for comparison (if exists)
    const currentData = await storage.get(`macro-vars:${localId}`);

    return {
      success: true,
      preview: {
        localId,
        deletedData: {
          excerptId: deletedData.excerptId,
          variableValues: deletedData.variableValues || {},
          toggleStates: deletedData.toggleStates || {},
          customInsertions: deletedData.customInsertions || [],
          internalNotes: deletedData.internalNotes || [],
          deletedAt: deletedData.deletedAt,
          deletedBy: deletedData.deletedBy,
          deletionReason: deletedData.deletionReason
        },
        currentData: currentData ? {
          excerptId: currentData.excerptId,
          variableValues: currentData.variableValues || {},
          toggleStates: currentData.toggleStates || {},
          customInsertions: currentData.customInsertions || [],
          internalNotes: currentData.internalNotes || []
        } : null,
        hasConflict: !!currentData,
        canRecover: deletedData.canRecover
      }
    };
  } catch (error) {
    logFailure('previewDeletedEmbed', 'Error previewing deleted embed', error, { localId: extractedLocalId });
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Restore embed configuration from soft-delete namespace
 * Phase 2 of two-phase restore (after preview confirmation)
 */
export async function restoreDeletedEmbed(req) {
  const { localId, force = false } = req.payload || {};
  const extractedLocalId = localId; // Extract for use in catch block
  
  try {
    // Input validation
    if (!localId || typeof localId !== 'string' || localId.trim() === '') {
      logFailure('restoreDeletedEmbed', 'Validation failed: localId is required and must be a non-empty string', new Error('Invalid localId'));
      return {
        success: false,
        error: 'localId is required and must be a non-empty string'
      };
    }

    if (force !== undefined && typeof force !== 'boolean') {
      logFailure('restoreDeletedEmbed', 'Validation failed: force must be a boolean', new Error('Invalid force type'));
      return {
        success: false,
        error: 'force must be a boolean'
      };
    }

    // Get soft-deleted data
    const deletedData = await storage.get(`macro-vars-deleted:${localId}`);

    if (!deletedData) {
      return {
        success: false,
        error: 'No deleted data found for this embed'
      };
    }

    // Check if canRecover flag is set
    if (!deletedData.canRecover) {
      return {
        success: false,
        error: 'This embed is marked as non-recoverable'
      };
    }

    // Check if current data exists
    const currentData = await storage.get(`macro-vars:${localId}`);
    if (currentData && !force) {
      return {
        success: false,
        error: 'Embed already exists - use force=true to overwrite',
        hasConflict: true
      };
    }

    // Remove deletion metadata before restoring
    const { ...originalData } = deletedData;

    // Restore to active namespace
    await storage.set(`macro-vars:${localId}`, {
      ...originalData,
      restoredAt: new Date().toISOString(),
      restoredFrom: 'soft-delete'
    });

    // Remove from deleted namespace
    await storage.delete(`macro-vars-deleted:${localId}`);

    logSuccess('restoreDeletedEmbed', 'Successfully restored embed from soft-delete', { localId });

    return {
      success: true,
      localId,
      restoredAt: new Date().toISOString(),
      restoredFrom: 'soft-delete'
    };
  } catch (error) {
    logFailure('restoreDeletedEmbed', 'Error restoring deleted embed', error, { localId: extractedLocalId });
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Restore embed configuration(s) from backup snapshot
 * Phase 2 of two-phase restore (after preview confirmation)
 *
 * Can restore specific embeds or all embeds from a backup
 */
export async function restoreFromBackup(req) {
  const { backupId, localIds = null, force = false } = req.payload || {};
  const extractedBackupId = backupId; // Extract for use in catch block
  
  try {

    // Get backup metadata
    const metadata = await storage.get(`${backupId}:metadata`);

    if (!metadata || !metadata.canRestore) {
      return {
        success: false,
        error: 'Backup not found or not restorable'
      };
    }

    const restored = [];
    const skipped = [];

    // Determine which embeds to restore
    let embedsToRestore = localIds;
    if (!embedsToRestore) {
      // Restore ALL from backup
      const backupKeys = await storage.query()
        .where('key', startsWith(`${backupId}:embed:`))
        .getMany();

      embedsToRestore = backupKeys.results.map(entry =>
        entry.key.replace(`${backupId}:embed:`, '')
      );
    }

    // Restore each embed
    for (const localId of embedsToRestore) {
      const backupData = await storage.get(`${backupId}:embed:${localId}`);

      if (!backupData) {
        skipped.push({ localId, reason: 'Not found in backup' });
        continue;
      }

      // Check if current data exists
      const currentData = await storage.get(`macro-vars:${localId}`);

      if (currentData && !force) {
        skipped.push({ localId, reason: 'Already exists (use force=true to overwrite)' });
        continue;
      }

      // Restore from backup
      await storage.set(`macro-vars:${localId}`, {
        ...backupData,
        restoredAt: new Date().toISOString(),
        restoredFrom: backupId
      });

      restored.push(localId);
    }

    logSuccess('restoreFromBackup', 'Restored embeds from backup', { backupId, restored: restored.length, skipped: skipped.length });

    return {
      success: true,
      backupId,
      restored: restored.length,
      skipped: skipped.length,
      details: { restored, skipped }
    };
  } catch (error) {
    logFailure('restoreFromBackup', 'Error restoring from backup', error, { backupId: extractedBackupId });
    return {
      success: false,
      error: error.message
    };
  }
}
