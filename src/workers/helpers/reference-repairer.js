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
  logWarning('attemptReferenceRepair', 'No excerptId in usage data', { localId: include.localId });

  // Try to repair: read the actual excerptId from macro-vars storage
  const macroVars = await storage.get(`macro-vars:${include.localId}`);
  const actualExcerptId = macroVars?.excerptId;

  if (!actualExcerptId) {
    logFailure('attemptReferenceRepair', 'No excerptId found in macro-vars either', new Error('Truly broken'), { localId: include.localId });
    return {
      repaired: false,
      error: 'No excerptId in usage data or macro-vars storage'
    };
  }

  // Verify the excerpt exists
  const excerpt = await storage.get(`excerpt:${actualExcerptId}`);
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
  const usageData = await storage.get(usageKey) || { excerptId: actualExcerptId, references: [] };

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

  await storage.set(usageKey, usageData);

  logSuccess('attemptReferenceRepair', 'Repaired usage tracking', { localId: include.localId, excerptId: actualExcerptId });

  return {
    repaired: true,
    excerptId: actualExcerptId,
    excerpt
  };
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
 * @returns {Promise<{exists: boolean, excerpt?: Object}>}
 */
export async function checkExcerptExists(excerptId) {
  const excerpt = await storage.get(`excerpt:${excerptId}`);

  if (!excerpt) {
    logWarning('checkExcerptExists', 'Referenced excerpt not found in storage', { excerptId });
    return { exists: false };
  }

  return { exists: true, excerpt };
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
