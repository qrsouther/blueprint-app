/**
 * Backup Manager Module
 *
 * Creates full system backups before destructive operations.
 * Allows recovery if cleanup operations go wrong.
 *
 * Backup Strategy:
 * - Snapshot all `macro-vars:*` configurations to `backup-{timestamp}:*` namespace
 * - Store backup metadata for recovery operations
 * - Backups persist indefinitely (manual cleanup required)
 */

import { storage, startsWith } from '@forge/api';
import { logFunction, logSuccess, logFailure } from '../../utils/forge-logger.js';

/**
 * Create a full backup of all embed configurations before running destructive operations
 * @param {string} operation - The operation triggering the backup (e.g., 'checkAllIncludes')
 * @returns {Promise<string>} The backupId for recovery operations
 */
export async function createBackupSnapshot(operation = 'checkAllIncludes') {
  const timestamp = new Date().toISOString();
  const backupId = `backup-${timestamp}`;

  try {
    logFunction('createBackupSnapshot', 'START', { backupId, operation });

    // Query all active embed configurations
    const allKeys = await storage.query()
      .where('key', startsWith('macro-vars:'))
      .getMany();

    const embedCount = allKeys.results.length;

    // Save backup metadata
    await storage.set(`${backupId}:metadata`, {
      backupId,
      createdAt: timestamp,
      operation,
      totalEmbeds: embedCount,
      canRestore: true,
      version: '1.0'
    });

    // Save each embed configuration to backup namespace
    let savedCount = 0;
    for (const entry of allKeys.results) {
      const localId = entry.key.replace('macro-vars:', '');
      await storage.set(`${backupId}:embed:${localId}`, entry.value);
      savedCount++;
    }

    logSuccess('createBackupSnapshot', 'Backup complete', { backupId, savedCount });

    return backupId;
  } catch (error) {
    logFailure('createBackupSnapshot', 'Failed to create backup', error, { backupId, operation });
    throw new Error(`Backup creation failed: ${error.message}`);
  }
}

/**
 * Restore all embeds from a backup
 * @param {string} backupId - Backup ID to restore from
 * @returns {Promise<{success: boolean, restored: number, error?: string}>}
 */
export async function restoreFromBackup(backupId) {
  try {
    logFunction('restoreFromBackup', 'START', { backupId });

    // Verify backup exists
    const metadata = await storage.get(`${backupId}:metadata`);
    if (!metadata) {
      throw new Error(`Backup ${backupId} not found`);
    }

    // Query all backup entries
    const backupKeys = await storage.query()
      .where('key', startsWith(`${backupId}:embed:`))
      .getMany();

    let restoredCount = 0;
    for (const entry of backupKeys.results) {
      const localId = entry.key.replace(`${backupId}:embed:`, '');
      await storage.set(`macro-vars:${localId}`, entry.value);
      restoredCount++;
    }

    logSuccess('restoreFromBackup', 'Restore complete', { backupId, restoredCount });

    return {
      success: true,
      restored: restoredCount
    };
  } catch (error) {
    logFailure('restoreFromBackup', 'Restore failed', error, { backupId });
    return {
      success: false,
      restored: 0,
      error: error.message
    };
  }
}
