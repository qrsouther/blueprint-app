/**
 * Emergency Recovery Resolvers
 *
 * Part of Phase 1 Safety Patch (v7.16.0) - Data Safety & Versioning System
 *
 * Provides functionality to view and restore soft-deleted Embeds from the
 * `macro-vars-deleted:*` namespace.
 *
 * Features comprehensive structured logging to trace execution flow and identify failures.
 *
 * @module emergency-recovery-resolvers
 */

import { storage, startsWith } from '@forge/api';
import {
  logFunction,
  logPhase,
  logSuccess,
  logFailure,
  logWarning,
  logStorageOp,
  logSnapshot
} from '../utils/forge-logger.js';

/**
 * Get all soft-deleted items from storage
 *
 * Queries the `macro-vars-deleted:*` namespace and returns a list of deleted
 * items with their metadata and recovery information.
 *
 * @param {Object} req - Forge resolver request
 * @returns {Object} { success: boolean, items: Array, error?: string }
 */
export async function getDeletedItems() {
  const FUNCTION_NAME = 'getDeletedItems';
  logFunction(FUNCTION_NAME, 'START');

  try {
    // Phase 1: Query storage
    logPhase(FUNCTION_NAME, 'Querying deleted items', { namespace: 'macro-vars-deleted:*' });

    const query = await storage.query()
      .where('key', startsWith('macro-vars-deleted:'))
      .getMany();

    logStorageOp(FUNCTION_NAME, 'QUERY', 'macro-vars-deleted:*', true);
    logPhase(FUNCTION_NAME, 'Query complete', { resultCount: query.results.length });

    // Phase 2: Transform results
    logPhase(FUNCTION_NAME, 'Transforming results to display format');

    const items = query.results.map(entry => {
      const localId = entry.key.replace('macro-vars-deleted:', '');
      const data = entry.value;

      return {
        localId,
        deletedAt: data.deletedAt,
        deletedBy: data.deletedBy,
        deletionReason: data.deletionReason,
        canRecover: data.canRecover,
        pageId: data.pageId,
        pageTitle: data.pageTitle || data.metadata?.pageTitle,
        excerptId: data.excerptId,
        data: data // Full data for preview
      };
    });

    // Phase 3: Sort by deletion time
    logPhase(FUNCTION_NAME, 'Sorting items by deletion time (most recent first)');

    items.sort((a, b) => {
      const dateA = new Date(a.deletedAt || 0);
      const dateB = new Date(b.deletedAt || 0);
      return dateB - dateA;
    });

    // Phase 4: Limit results
    const limitedItems = items.slice(0, 50);
    if (items.length > 50) {
      logWarning(FUNCTION_NAME, `Limiting results to 50 most recent items`, {
        total: items.length,
        showing: limitedItems.length
      });
    }

    logSuccess(FUNCTION_NAME, `Successfully retrieved ${limitedItems.length} deleted items`, {
      total: query.results.length,
      showing: limitedItems.length
    });

    logFunction(FUNCTION_NAME, 'END', { success: true, itemCount: limitedItems.length });

    return {
      success: true,
      items: limitedItems,
      total: query.results.length
    };
  } catch (error) {
    logFailure(FUNCTION_NAME, 'Failed to fetch deleted items', error);
    logFunction(FUNCTION_NAME, 'END', { success: false });

    return {
      success: false,
      error: error.message,
      items: []
    };
  }
}

/**
 * Restore a soft-deleted item back to active storage
 *
 * Moves data from `macro-vars-deleted:{localId}` back to `macro-vars:{localId}`
 * and removes the deleted entry.
 *
 * @param {Object} req - Forge resolver request
 * @param {string} req.payload.localId - The localId of the item to restore
 * @returns {Object} { success: boolean, error?: string }
 */
export async function restoreDeletedItem(req) {
  const FUNCTION_NAME = 'restoreDeletedItem';
  const { localId } = req.payload || {};

  logFunction(FUNCTION_NAME, 'START', { localId });

  // Validate input
  if (!localId) {
    logFailure(FUNCTION_NAME, 'Missing required parameter', 'localId parameter is required');
    logFunction(FUNCTION_NAME, 'END', { success: false });
    return {
      success: false,
      error: 'Missing localId parameter'
    };
  }

  try {
    // Phase 1: Read deleted data
    logPhase(FUNCTION_NAME, 'Reading deleted data', { key: `macro-vars-deleted:${localId}` });

    const deletedData = await storage.get(`macro-vars-deleted:${localId}`);
    logStorageOp(FUNCTION_NAME, 'READ', `macro-vars-deleted:${localId}`, !!deletedData);

    if (!deletedData) {
      logFailure(FUNCTION_NAME, 'Deleted item not found', `No data at macro-vars-deleted:${localId}`, { localId });
      logFunction(FUNCTION_NAME, 'END', { success: false });
      return {
        success: false,
        error: `No deleted item found with localId: ${localId}`
      };
    }

    // Check recoverability
    if (!deletedData.canRecover) {
      logWarning(FUNCTION_NAME, 'Item marked as NOT recoverable - proceeding anyway', {
        localId,
        canRecover: deletedData.canRecover
      });
    }

    // Phase 2: Prepare restoration data
    logPhase(FUNCTION_NAME, 'Preparing data for restoration (removing deletion metadata)');

    const restoredData = { ...deletedData };
    delete restoredData.deletedAt;
    delete restoredData.deletedBy;
    delete restoredData.deletionReason;
    delete restoredData.canRecover;

    // Phase 3: Check if active slot is occupied
    logPhase(FUNCTION_NAME, 'Checking if active slot is occupied', { key: `macro-vars:${localId}` });

    const existingData = await storage.get(`macro-vars:${localId}`);
    logStorageOp(FUNCTION_NAME, 'READ', `macro-vars:${localId}`, true);

    if (existingData) {
      logWarning(FUNCTION_NAME, 'Active slot already occupied - will overwrite', {
        localId,
        activeDataExists: true
      });
    }

    // Phase 4: Log CSV snapshot before restore
    logSnapshot(FUNCTION_NAME, 'RESTORE', `macro-vars:${localId}`, existingData, restoredData);

    // Phase 5: Restore to active storage
    logPhase(FUNCTION_NAME, 'Writing restored data to active storage');

    await storage.set(`macro-vars:${localId}`, restoredData);
    logStorageOp(FUNCTION_NAME, 'WRITE', `macro-vars:${localId}`, true);

    // Phase 6: Remove from deleted namespace
    logPhase(FUNCTION_NAME, 'Removing from deleted namespace');

    await storage.delete(`macro-vars-deleted:${localId}`);
    logStorageOp(FUNCTION_NAME, 'DELETE', `macro-vars-deleted:${localId}`, true);

    // Phase 7: Restore usage tracking
    if (restoredData.excerptId) {
      logPhase(FUNCTION_NAME, 'Restoring usage tracking', { excerptId: restoredData.excerptId });

      try {
        const usageKey = `usage:${restoredData.excerptId}`;
        const usageData = await storage.get(usageKey) || {
          excerptId: restoredData.excerptId,
          references: []
        };

        logStorageOp(FUNCTION_NAME, 'READ', usageKey, true);

        // Check if already in usage tracking
        const existingRef = usageData.references.find(ref => ref.localId === localId);
        if (!existingRef) {
          // Add back to usage tracking
          usageData.references.push({
            localId,
            excerptId: restoredData.excerptId,
            pageId: restoredData.pageId || deletedData.pageId,
            restoredAt: new Date().toISOString(),
            restoredFrom: 'emergency-recovery'
          });

          await storage.set(usageKey, usageData);
          logStorageOp(FUNCTION_NAME, 'WRITE', usageKey, true);
          logSuccess(FUNCTION_NAME, `Restored usage tracking for excerpt: ${restoredData.excerptId}`);
        } else {
          logPhase(FUNCTION_NAME, 'Usage tracking already contains this localId - skipping');
        }
      } catch (usageError) {
        logFailure(FUNCTION_NAME, 'Failed to restore usage tracking (non-fatal)', usageError, {
          excerptId: restoredData.excerptId
        });
        // Don't fail the whole restore if usage tracking fails
      }
    } else {
      logPhase(FUNCTION_NAME, 'No excerptId found - skipping usage tracking restore');
    }

    logSuccess(FUNCTION_NAME, `Successfully restored item: ${localId}`);
    logFunction(FUNCTION_NAME, 'END', { success: true, localId });

    return {
      success: true,
      message: `Successfully restored ${localId}`
    };
  } catch (error) {
    logFailure(FUNCTION_NAME, `Failed to restore item: ${localId}`, error, { localId });
    logFunction(FUNCTION_NAME, 'END', { success: false, localId });

    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Find and permanently delete orphaned Embeds by page ID
 *
 * Searches active macro-vars storage for Embeds on specific pages and deletes them.
 * Useful for cleaning up test data or truly broken Embeds with no valid Source references.
 *
 * @param {Object} req - Forge resolver request
 * @param {string[]} req.payload.pageIds - Array of page IDs to search
 * @returns {Object} { success: boolean, deleted: Array, notFound: Array }
 */
export async function deleteOrphanedEmbedsByPage(req) {
  const FUNCTION_NAME = 'deleteOrphanedEmbedsByPage';
  const { pageIds } = req.payload || {};

  logFunction(FUNCTION_NAME, 'START', { pageIds });

  // Validate input
  if (!pageIds || !Array.isArray(pageIds) || pageIds.length === 0) {
    logFailure(FUNCTION_NAME, 'Missing or invalid pageIds parameter', 'pageIds must be a non-empty array');
    logFunction(FUNCTION_NAME, 'END', { success: false });
    return {
      success: false,
      error: 'Missing or invalid pageIds parameter (must be non-empty array)'
    };
  }

  try {
    // Phase 1: Query all active macro-vars
    logPhase(FUNCTION_NAME, 'Querying all active macro-vars', { namespace: 'macro-vars:*' });

    const query = await storage.query()
      .where('key', startsWith('macro-vars:'))
      .getMany();

    logStorageOp(FUNCTION_NAME, 'QUERY', 'macro-vars:*', true);
    logPhase(FUNCTION_NAME, 'Query complete', { resultCount: query.results.length });

    // Phase 2: Filter by page IDs
    logPhase(FUNCTION_NAME, 'Filtering by page IDs', { targetPageIds: pageIds });

    // Normalize pageIds to strings for comparison (storage might have strings or numbers)
    const normalizedTargetIds = pageIds.map(id => String(id));

    const matchingItems = [];
    for (const entry of query.results) {
      const localId = entry.key.replace('macro-vars:', '');
      const data = entry.value;

      // Normalize stored pageId to string for comparison
      const normalizedPageId = data.pageId ? String(data.pageId) : null;

      // Check if pageId matches any of the target IDs
      if (normalizedPageId && normalizedTargetIds.includes(normalizedPageId)) {
        matchingItems.push({
          localId,
          pageTitle: data.pageTitle,
          pageId: data.pageId,
          excerptId: data.excerptId,
          data
        });
      }
    }

    logPhase(FUNCTION_NAME, 'Filtering complete', { matchesFound: matchingItems.length });

    // Phase 3: Delete matching items
    const deleted = [];
    const errors = [];

    for (const item of matchingItems) {
      try {
        logPhase(FUNCTION_NAME, `Deleting macro-vars:${item.localId}`, {
          pageTitle: item.pageTitle,
          excerptId: item.excerptId
        });

        // Log CSV snapshot before deletion
        logSnapshot(FUNCTION_NAME, 'DELETE', `macro-vars:${item.localId}`, item.data, null);

        // Delete from active storage
        await storage.delete(`macro-vars:${item.localId}`);
        logStorageOp(FUNCTION_NAME, 'DELETE', `macro-vars:${item.localId}`, true);

        // Remove from usage tracking if excerptId exists
        if (item.excerptId) {
          try {
            const usageKey = `usage:${item.excerptId}`;
            const usageData = await storage.get(usageKey);

            if (usageData && usageData.references) {
              const updatedReferences = usageData.references.filter(ref => ref.localId !== item.localId);

              if (updatedReferences.length !== usageData.references.length) {
                usageData.references = updatedReferences;
                await storage.set(usageKey, usageData);
                logStorageOp(FUNCTION_NAME, 'WRITE', usageKey, true);
                logPhase(FUNCTION_NAME, `Removed from usage tracking: ${usageKey}`);
              }
            }
          } catch (usageError) {
            logWarning(FUNCTION_NAME, 'Failed to remove from usage tracking (non-fatal)', {
              localId: item.localId,
              excerptId: item.excerptId,
              error: usageError.message
            });
          }
        }

        deleted.push({
          localId: item.localId,
          pageTitle: item.pageTitle,
          pageId: item.pageId,
          excerptId: item.excerptId
        });

        logSuccess(FUNCTION_NAME, `Deleted orphaned Embed: ${item.localId}`, {
          pageTitle: item.pageTitle
        });

      } catch (deleteError) {
        logFailure(FUNCTION_NAME, `Failed to delete ${item.localId}`, deleteError, {
          pageTitle: item.pageTitle
        });
        errors.push({
          localId: item.localId,
          pageTitle: item.pageTitle,
          error: deleteError.message
        });
      }
    }

    // Phase 4: Report which page IDs had no matches
    const deletedPageIds = deleted.map(item => item.pageId);
    const notFound = pageIds.filter(id => !deletedPageIds.includes(id));

    if (notFound.length > 0) {
      logWarning(FUNCTION_NAME, 'Some page IDs had no matching Embeds', { notFound });
    }

    logSuccess(FUNCTION_NAME, `Deleted ${deleted.length} orphaned Embed(s)`, {
      deleted: deleted.length,
      errors: errors.length,
      notFound: notFound.length
    });

    logFunction(FUNCTION_NAME, 'END', { success: true, deletedCount: deleted.length });

    return {
      success: true,
      deleted,
      errors,
      notFound,
      summary: `Deleted ${deleted.length} Embed(s), ${errors.length} error(s), ${notFound.length} page(s) not found`
    };

  } catch (error) {
    logFailure(FUNCTION_NAME, 'Failed to delete orphaned Embeds', error, { pageIds });
    logFunction(FUNCTION_NAME, 'END', { success: false });

    return {
      success: false,
      error: error.message,
      deleted: [],
      errors: []
    };
  }
}

/**
 * Force delete orphaned usage references by localId
 *
 * Permanently deletes specific Embeds by their localIds from active storage.
 * Used to clean up stale orphaned references that are stuck in the checker.
 *
 * @param {Object} req - Forge resolver request
 * @param {string[]} req.payload.localIds - Array of localIds to delete
 * @returns {Object} { success: boolean, deleted: Array, errors: Array }
 */
export async function deleteOrphanedUsageReferences(req) {
  const FUNCTION_NAME = 'deleteOrphanedUsageReferences';
  const { localIds } = req.payload || {};

  logFunction(FUNCTION_NAME, 'START', { localIds });

  // Validate input
  if (!localIds || !Array.isArray(localIds) || localIds.length === 0) {
    logFailure(FUNCTION_NAME, 'Missing or invalid localIds parameter', 'localIds must be a non-empty array');
    logFunction(FUNCTION_NAME, 'END', { success: false });
    return {
      success: false,
      error: 'Missing or invalid localIds parameter (must be non-empty array)'
    };
  }

  try {
    const deleted = [];
    const errors = [];

    // Phase 1: Delete each localId
    for (const localId of localIds) {
      try {
        logPhase(FUNCTION_NAME, `Processing localId: ${localId}`);

        // Read data before deletion for logging
        const key = `macro-vars:${localId}`;
        const data = await storage.get(key);

        logStorageOp(FUNCTION_NAME, 'READ', key, !!data);

        let excerptId = null;
        let pageTitle = null;
        let pageId = null;

        if (!data) {
          // Macro-vars entry doesn't exist (truly orphaned)
          // We still need to clean up usage tracking
          logWarning(FUNCTION_NAME, `localId not found in active storage - searching usage keys for cleanup`, { localId });

          // Search all usage:* keys to find which one references this localId
          try {
            logPhase(FUNCTION_NAME, 'Querying all usage keys to find orphaned reference', { localId });
            const usageQuery = await storage.query()
              .where('key', startsWith('usage:'))
              .getMany();

            logStorageOp(FUNCTION_NAME, 'QUERY', 'usage:*', true);

            // Find usage key(s) that contain this localId
            for (const usageEntry of usageQuery.results) {
              const usageData = usageEntry.value;
              if (usageData && usageData.references) {
                const hasReference = usageData.references.some(ref => ref.localId === localId);
                if (hasReference) {
                  // Found the usage key containing this orphaned localId
                  excerptId = usageEntry.key.replace('usage:', '');
                  logPhase(FUNCTION_NAME, `Found orphaned reference in ${usageEntry.key}`, { localId, excerptId });

                  // Remove this localId from references
                  const updatedReferences = usageData.references.filter(ref => ref.localId !== localId);

                  if (updatedReferences.length === 0) {
                    // No references left, delete the entire usage key
                    await storage.delete(usageEntry.key);
                    logStorageOp(FUNCTION_NAME, 'DELETE', usageEntry.key, true);
                    logPhase(FUNCTION_NAME, `Deleted empty usage tracking key: ${usageEntry.key}`);
                  } else {
                    // Update with remaining references
                    usageData.references = updatedReferences;
                    await storage.set(usageEntry.key, usageData);
                    logStorageOp(FUNCTION_NAME, 'WRITE', usageEntry.key, true);
                    logPhase(FUNCTION_NAME, `Removed orphaned reference from: ${usageEntry.key}`);
                  }

                  break; // Found and cleaned up, move to next localId
                }
              }
            }

            if (!excerptId) {
              logWarning(FUNCTION_NAME, `No usage tracking found for orphaned localId`, { localId });
            }

          } catch (usageError) {
            logWarning(FUNCTION_NAME, 'Failed to clean up usage tracking for orphaned localId (non-fatal)', {
              localId,
              error: usageError.message
            });
          }

          // Mark as successfully deleted (cleaned up orphaned reference)
          deleted.push({
            localId,
            pageTitle: 'Unknown (orphaned)',
            pageId: null,
            excerptId,
            wasOrphaned: true
          });

          logSuccess(FUNCTION_NAME, `Cleaned up orphaned reference: ${localId}`, {
            excerptId: excerptId || 'not found'
          });

        } else {
          // Macro-vars entry exists - normal deletion flow
          excerptId = data.excerptId;
          pageTitle = data.pageTitle;
          pageId = data.pageId;

          // Log CSV snapshot before deletion
          logSnapshot(FUNCTION_NAME, 'DELETE', key, data, null);

          // Delete from active storage
          await storage.delete(key);
          logStorageOp(FUNCTION_NAME, 'DELETE', key, true);

          // Remove from usage tracking if excerptId exists
          if (excerptId) {
            try {
              const usageKey = `usage:${excerptId}`;
              const usageData = await storage.get(usageKey);

              if (usageData && usageData.references) {
                const originalCount = usageData.references.length;
                const updatedReferences = usageData.references.filter(ref => ref.localId !== localId);

                if (updatedReferences.length !== originalCount) {
                  // If no references left, delete the entire usage key
                  if (updatedReferences.length === 0) {
                    await storage.delete(usageKey);
                    logStorageOp(FUNCTION_NAME, 'DELETE', usageKey, true);
                    logPhase(FUNCTION_NAME, `Deleted empty usage tracking key: ${usageKey}`);
                  } else {
                    // Otherwise update with remaining references
                    usageData.references = updatedReferences;
                    await storage.set(usageKey, usageData);
                    logStorageOp(FUNCTION_NAME, 'WRITE', usageKey, true);
                    logPhase(FUNCTION_NAME, `Removed from usage tracking: ${usageKey}`);
                  }
                }
              }
            } catch (usageError) {
              logWarning(FUNCTION_NAME, 'Failed to remove from usage tracking (non-fatal)', {
                localId,
                excerptId,
                error: usageError.message
              });
            }
          }

          deleted.push({
            localId,
            pageTitle,
            pageId,
            excerptId,
            wasOrphaned: false
          });

          logSuccess(FUNCTION_NAME, `Deleted orphaned reference: ${localId}`, {
            pageTitle
          });
        }

      } catch (deleteError) {
        logFailure(FUNCTION_NAME, `Failed to delete ${localId}`, deleteError);
        errors.push({
          localId,
          error: deleteError.message
        });
      }
    }

    logSuccess(FUNCTION_NAME, `Deleted ${deleted.length} orphaned reference(s)`, {
      deleted: deleted.length,
      errors: errors.length
    });

    logFunction(FUNCTION_NAME, 'END', { success: true, deletedCount: deleted.length });

    return {
      success: true,
      deleted,
      errors,
      summary: `Deleted ${deleted.length} orphaned reference(s), ${errors.length} error(s)`
    };

  } catch (error) {
    logFailure(FUNCTION_NAME, 'Failed to delete orphaned references', error, { localIds });
    logFunction(FUNCTION_NAME, 'END', { success: false });

    return {
      success: false,
      error: error.message,
      deleted: [],
      errors: []
    };
  }
}

/**
 * Delete orphaned usage key by excerptId
 *
 * Directly deletes a usage:{excerptId} key when the orphaned reference has no valid localIds.
 * This is a simpler approach for cleaning up stale orphaned usage tracking.
 *
 * @param {Object} req - Forge resolver request
 * @param {string} req.payload.excerptId - The excerptId to delete usage key for
 * @returns {Object} { success: boolean, message?: string, error?: string }
 */
export async function deleteOrphanedUsageKey(req) {
  const FUNCTION_NAME = 'deleteOrphanedUsageKey';
  const { excerptId } = req.payload || {};

  logFunction(FUNCTION_NAME, 'START', { excerptId });

  // Validate input
  if (!excerptId) {
    logFailure(FUNCTION_NAME, 'Missing excerptId parameter', 'excerptId parameter is required');
    logFunction(FUNCTION_NAME, 'END', { success: false });
    return {
      success: false,
      error: 'Missing excerptId parameter'
    };
  }

  try {
    const usageKey = `usage:${excerptId}`;

    // Phase 1: Check if key exists and log it
    logPhase(FUNCTION_NAME, 'Checking if usage key exists', { key: usageKey });

    const usageData = await storage.get(usageKey);
    logStorageOp(FUNCTION_NAME, 'READ', usageKey, !!usageData);

    if (!usageData) {
      logWarning(FUNCTION_NAME, 'Usage key not found - may have been already deleted', { usageKey });
      logFunction(FUNCTION_NAME, 'END', { success: true, alreadyDeleted: true });
      return {
        success: true,
        message: `Usage key ${usageKey} not found (may have been already deleted)`
      };
    }

    // Phase 2: Log CSV snapshot before deletion
    logSnapshot(FUNCTION_NAME, 'DELETE', usageKey, usageData, null);

    // Phase 3: Delete the usage key
    logPhase(FUNCTION_NAME, 'Deleting orphaned usage key', { key: usageKey });

    await storage.delete(usageKey);
    logStorageOp(FUNCTION_NAME, 'DELETE', usageKey, true);

    logSuccess(FUNCTION_NAME, `Successfully deleted orphaned usage key: ${usageKey}`);
    logFunction(FUNCTION_NAME, 'END', { success: true, excerptId });

    return {
      success: true,
      message: `Successfully deleted orphaned usage key for ${excerptId}`
    };

  } catch (error) {
    logFailure(FUNCTION_NAME, `Failed to delete orphaned usage key`, error, { excerptId });
    logFunction(FUNCTION_NAME, 'END', { success: false, excerptId });

    return {
      success: false,
      error: error.message
    };
  }
}
