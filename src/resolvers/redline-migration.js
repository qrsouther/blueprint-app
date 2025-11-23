/**
 * Redline Migration Utilities
 *
 * One-time migration functions to backfill redline fields for existing Embeds
 * created before Phase 1 deployment.
 */

import { storage, startsWith } from '@forge/api';
import { logFunction, logSuccess, logFailure, logWarning } from '../utils/forge-logger.js';

/**
 * Backfill redlineStatus and pageId for all existing Embeds
 *
 * This migration:
 * 1. Finds all macro-vars:* entries (Embed configs)
 * 2. Adds redlineStatus='reviewable' if missing
 * 3. Attempts to fetch pageId from usage data if missing
 * 4. Updates storage with backfilled fields
 *
 * @returns {Object} Migration result with counts
 */
export async function backfillRedlineFields() {
  try {
    logFunction('backfillRedlineFields', 'START', {});

    // Get all macro-vars:* keys
    const allKeys = await storage.query()
      .where('key', startsWith('macro-vars:'))
      .getMany();

    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const item of allKeys.results) {
      const localId = item.key.replace('macro-vars:', '');
      const config = item.value;

      try {
        let needsUpdate = false;
        const updates = { ...config };

        // Backfill redlineStatus if missing
        if (!config.redlineStatus) {
          updates.redlineStatus = 'reviewable';
          updates.statusHistory = [];
          needsUpdate = true;
        }

        // Backfill pageId if missing - try to get from usage data
        if (!config.pageId && config.excerptId) {
          try {
            const usageKey = `usage:${config.excerptId}`;
            const usageData = await storage.get(usageKey);

            if (usageData && usageData.references) {
              // Find the reference matching this localId
              const ref = usageData.references.find(r => r.localId === localId);
              if (ref && ref.pageId) {
                updates.pageId = ref.pageId;
                needsUpdate = true;
              }
            }
          } catch (err) {
            logWarning('backfillRedlineFields', 'Failed to lookup pageId', { localId, error: err.message });
          }
        }

        // Save updates if needed
        if (needsUpdate) {
          await storage.set(item.key, updates);
          updated++;
        } else {
          skipped++;
        }
      } catch (error) {
        logFailure('backfillRedlineFields', 'Error processing Embed', error, { localId });
        errors++;
      }
    }

    const result = {
      success: true,
      total: allKeys.results.length,
      updated,
      skipped,
      errors,
      message: `Backfilled ${updated} Embeds, skipped ${skipped}, ${errors} errors`
    };

    logSuccess('backfillRedlineFields', 'Migration complete', { updated, skipped, errors, total: allKeys.results.length });
    return result;

  } catch (error) {
    logFailure('backfillRedlineFields', 'Migration failed', error);
    return {
      success: false,
      error: error.message,
      total: 0,
      updated: 0,
      skipped: 0,
      errors: 0
    };
  }
}
