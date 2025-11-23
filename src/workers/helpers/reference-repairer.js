/**
 * Reference Repairer Module
 *
 * Handles repair of broken Embed references where usage tracking is out of sync.
 * Repairs scenarios:
 * - Missing excerptId in usage data (but exists in macro-vars)
 * - Broken reference to deleted Source
 * - Stale usage tracking data
 */

import { storage } from '@forge/api';
import { logSuccess, logFailure, logWarning } from '../../utils/forge-logger.js';

/**
 * Attempt to repair a broken reference by looking up excerptId from macro-vars
 * @param {Object} include - Include reference (may have missing excerptId)
 * @returns {Promise<{repaired: boolean, excerptId?: string, excerpt?: Object, error?: string}>}
 */
export async function attemptReferenceRepair(include) {
  // Validate input to prevent storage errors
  if (!include || typeof include !== 'object') {
    logFailure('attemptReferenceRepair', 'Invalid include object', new Error('Include is not an object'), { include });
    return {
      repaired: false,
      error: 'Invalid include object'
    };
  }

  if (!include.localId || typeof include.localId !== 'string' || include.localId.trim() === '') {
    logFailure('attemptReferenceRepair', 'Invalid localId in include', new Error('localId is invalid'), { localId: include.localId });
    return {
      repaired: false,
      error: 'Invalid localId in include object'
    };
  }

  logWarning('attemptReferenceRepair', 'No excerptId in usage data', { localId: include.localId });

  try {
    // Try to repair: read the actual excerptId from macro-vars storage
    const macroVars = await storage.get(`macro-vars:${include.localId}`);
    const actualExcerptId = macroVars?.excerptId;

    if (!actualExcerptId || typeof actualExcerptId !== 'string' || actualExcerptId.trim() === '') {
      logFailure('attemptReferenceRepair', 'No excerptId found in macro-vars either', new Error('Truly broken'), { localId: include.localId });
      return {
        repaired: false,
        error: 'No excerptId in usage data or macro-vars storage'
      };
    }

    // Verify the excerpt exists
    let excerpt;
    try {
      excerpt = await storage.get(`excerpt:${actualExcerptId}`);
    } catch (excerptError) {
      logFailure('attemptReferenceRepair', 'Error fetching excerpt from storage', excerptError, { localId: include.localId, excerptId: actualExcerptId });
      return {
        repaired: false,
        error: `Error fetching excerpt: ${excerptError.message}`,
        excerptId: actualExcerptId
      };
    }

    if (!excerpt) {
      logFailure('attemptReferenceRepair', 'Excerpt not found - orphaned reference', new Error('Referenced excerpt not found'), { localId: include.localId, excerptId: actualExcerptId });
      return {
        repaired: false,
        error: 'Referenced excerpt not found (from macro-vars)',
        excerptId: actualExcerptId
      };
    }

    // Update the usage tracking with the correct excerptId
    const usageKey = `usage:${actualExcerptId}`;
    let usageData;
    try {
      usageData = await storage.get(usageKey) || { excerptId: actualExcerptId, references: [] };
    } catch (usageGetError) {
      logFailure('attemptReferenceRepair', 'Error fetching usage data from storage', usageGetError, { localId: include.localId, usageKey });
      return {
        repaired: false,
        error: `Error fetching usage data: ${usageGetError.message}`,
        excerptId: actualExcerptId
      };
    }

    // Find and update this reference
    const refIndex = usageData.references.findIndex(r => r.localId === include.localId);
    if (refIndex >= 0) {
      // Update existing reference
      usageData.references[refIndex] = {
        ...usageData.references[refIndex],
        ...include,
        excerptId: actualExcerptId,
        updatedAt: new Date().toISOString()
      };
    } else {
      // Add missing reference
      usageData.references.push({
        ...include,
        excerptId: actualExcerptId,
        updatedAt: new Date().toISOString()
      });
    }

    try {
      await storage.set(usageKey, usageData);
    } catch (setError) {
      logFailure('attemptReferenceRepair', 'Error saving usage data to storage', setError, { localId: include.localId, usageKey });
      return {
        repaired: false,
        error: `Error saving usage data: ${setError.message}`,
        excerptId: actualExcerptId
      };
    }

    logSuccess('attemptReferenceRepair', 'Repaired usage tracking', { localId: include.localId, excerptId: actualExcerptId });

    return {
      repaired: true,
      excerptId: actualExcerptId,
      excerpt
    };
  } catch (error) {
    logFailure('attemptReferenceRepair', 'Unexpected error during repair', error, { localId: include.localId });
    return {
      repaired: false,
      error: `Unexpected error: ${error.message}`
    };
  }
}

/**
 * Build repaired reference record for reporting
 * @param {string} localId - Embed localId
 * @param {string} pageId - Page ID
 * @param {string} pageTitle - Page title
 * @param {string} excerptId - Repaired excerpt ID
 * @param {string} excerptName - Excerpt name
 * @returns {Object} Repaired reference record
 */
export function buildRepairedRecord(localId, pageId, pageTitle, excerptId, excerptName) {
  return {
    localId,
    pageId,
    pageTitle,
    excerptId,
    excerptName,
    repairedAt: new Date().toISOString()
  };
}

/**
 * Check if an Embed references a non-existent Source
 * @param {string} excerptId - Excerpt ID to check
 * @returns {Promise<{exists: boolean, excerpt?: Object, error?: string}>}
 */
export async function checkExcerptExists(excerptId) {
  // Validate input
  if (!excerptId || typeof excerptId !== 'string' || excerptId.trim() === '') {
    logWarning('checkExcerptExists', 'Invalid excerptId', { excerptId });
    return { exists: false, error: 'Invalid excerptId' };
  }

  try {
    const excerpt = await storage.get(`excerpt:${excerptId}`);

    if (!excerpt) {
      logWarning('checkExcerptExists', 'Referenced excerpt not found in storage', { excerptId });
      return { exists: false };
    }

    return { exists: true, excerpt };
  } catch (error) {
    logFailure('checkExcerptExists', 'Error checking excerpt existence', error, { excerptId });
    // Return exists: false on error to be conservative (don't assume it exists if we can't check)
    return { exists: false, error: error.message };
  }
}

/**
 * Build broken reference record for reporting
 * @param {Object} include - Include reference
 * @param {string} reason - Reason reference is broken
 * @param {string} excerptId - Broken excerpt ID (if known)
 * @returns {Object} Broken reference record
 */
export function buildBrokenRecord(include, reason, excerptId = null) {
  return {
    ...include,
    reason,
    ...(excerptId && { excerptId })
  };
}
