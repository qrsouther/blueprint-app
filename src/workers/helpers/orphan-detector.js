/**
 * Orphan Detector Module
 *
 * Handles detection and cleanup of orphaned Embed configurations.
 * Orphaned Embeds are those that no longer exist on their pages or reference deleted Sources.
 *
 * Cleanup Strategy:
 * - Soft delete: Move data to `macro-vars-deleted:*` namespace for 90-day recovery window
 * - Version snapshot: Create version before deletion for additional recovery
 * - Usage tracking: Remove orphaned references from usage data
 */

import { storage } from '@forge/api';
import { saveVersion } from '../../utils/version-manager.js';
import { logSuccess, logWarning } from '../../utils/forge-logger.js';

// SAFETY: Dry-run mode configuration
// Default is true (preview mode) - must be explicitly set to false for cleanup
const DEFAULT_DRY_RUN_MODE = true;

/**
 * Soft Delete: Move Embed configuration to deleted namespace
 * Allows recovery for 90 days before automatic expiration
 *
 * @param {string} localId - Embed macro localId
 * @param {string} reason - Reason for deletion (for audit trail)
 * @param {Object} metadata - Additional metadata to store with deleted item
 * @param {boolean} dryRun - If true, only log what would be deleted
 */
export async function softDeleteMacroVars(localId, reason, metadata = {}, dryRun = DEFAULT_DRY_RUN_MODE) {
  const data = await storage.get(`macro-vars:${localId}`);

  if (data) {
    // Phase 3: Create version snapshot before soft delete (v7.17.0)
    const versionResult = await saveVersion(
      storage,
      `macro-vars:${localId}`,
      data,
      {
        changeType: 'DELETE',
        changedBy: 'checkAllIncludes',
        deletionReason: reason,
        localId: localId
      }
    );
    if (versionResult.success) {
      logSuccess('softDeleteMacroVars', 'Version snapshot created', { versionId: versionResult.versionId, localId });
    } else {
      logWarning('softDeleteMacroVars', 'Version snapshot failed', { error: versionResult.error, localId });
    }

    // Move to deleted namespace with recovery metadata
    await storage.set(`macro-vars-deleted:${localId}`, {
      ...data,
      deletedAt: new Date().toISOString(),
      deletedBy: 'checkAllIncludes',
      deletionReason: reason,
      canRecover: true,
      ...metadata
    });

    logSuccess('softDeleteMacroVars', 'Moved to deleted namespace', { localId, reason });
  }

  // Remove from active namespace
  if (!dryRun) {
    await storage.delete(`macro-vars:${localId}`);
  }
}

/**
 * Soft Delete for cached content
 * Cache can be safely deleted without version snapshot since it's regenerable
 *
 * @param {string} localId - Embed macro localId
 * @param {string} reason - Reason for deletion
 * @param {boolean} dryRun - If true, only log what would be deleted
 */
export async function softDeleteMacroCache(localId, reason, dryRun = DEFAULT_DRY_RUN_MODE) {
  if (!dryRun) {
    await storage.delete(`macro-cache:${localId}`);
  }
}

/**
 * Remove orphaned Embed from usage tracking
 * Updates the `usage:{excerptId}` key to remove the orphaned reference
 *
 * @param {string} localId - Embed macro localId
 * @param {string} excerptId - Source excerpt ID
 * @returns {Promise<boolean>} True if removed from usage tracking
 */
export async function removeFromUsageTracking(localId, excerptId) {
  if (!excerptId) {
    return false;
  }

  const usageKey = `usage:${excerptId}`;
  const usageData = await storage.get(usageKey);

  if (usageData) {
    usageData.references = usageData.references.filter(
      r => r.localId !== localId
    );

    if (usageData.references.length === 0) {
      // No more references, delete the usage key entirely
      await storage.delete(usageKey);
    } else {
      // Still has references, update
      await storage.set(usageKey, usageData);
    }
    return true;
  }

  return false;
}

/**
 * Detect orphaned Embeds on a page that doesn't exist
 * All Embeds on the page are considered orphaned
 *
 * NOTE: This function NO LONGER automatically deletes storage entries.
 * Deletion is now a separate manual action that must be explicitly triggered.
 * This prevents accidental data loss if a user accidentally deletes an Embed
 * from their page and an Admin runs Check All Embeds before they can recover it.
 *
 * @param {Array} pageIncludes - Array of includes on the page
 * @param {string} reason - Reason page is inaccessible
 * @param {boolean} dryRun - Unused (kept for API compatibility, but deletion is always disabled)
 * @returns {Promise<Array>} Array of orphaned include objects
 */
export async function handlePageNotFound(pageIncludes, reason) {
  const orphanedIncludes = [];

  for (const include of pageIncludes) {
    orphanedIncludes.push({
      ...include,
      reason: reason || 'Page deleted or inaccessible',
      pageExists: false
    });

    // NOTE: We NO LONGER automatically delete storage entries here.
    // Deletion must be done manually via Emergency Recovery or explicit cleanup actions.
    // This prevents accidental data loss if a user accidentally deletes an Embed
    // and an Admin runs Check All Embeds before they can recover it.

    // Remove from usage tracking only (this is safe and helps keep usage data accurate)
    await removeFromUsageTracking(include.localId, include.excerptId);
  }

  return orphanedIncludes;
}

/**
 * Detect orphaned Embed (macro not found in page ADF)
 *
 * NOTE: This function NO LONGER automatically deletes storage entries.
 * Deletion is now a separate manual action that must be explicitly triggered.
 * This prevents accidental data loss if a user accidentally deletes an Embed
 * from their page and an Admin runs Check All Embeds before they can recover it.
 *
 * @param {Object} include - Include reference object
 * @param {Object} pageData - Confluence page data
 * @param {boolean} dryRun - Unused (kept for API compatibility, but deletion is always disabled)
 * @returns {Promise<Object>} Orphaned include object
 */
export async function handleOrphanedMacro(include) {
  logWarning('handleOrphanedMacro', 'Orphan detected', { localId: include.localId, pageId: include.pageId });

  const orphanedInclude = {
    ...include,
    reason: 'Macro not found in page content',
    pageExists: true
  };

  // NOTE: We NO LONGER automatically delete storage entries here.
  // Deletion must be done manually via Emergency Recovery or explicit cleanup actions.
  // This prevents accidental data loss if a user accidentally deletes an Embed
  // and an Admin runs Check All Embeds before they can recover it.

  // Remove from usage tracking only (this is safe and helps keep usage data accurate)
  await removeFromUsageTracking(include.localId, include.excerptId);

  return orphanedInclude;
}
