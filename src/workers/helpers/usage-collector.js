/**
 * Usage Collector Module
 *
 * Handles collection and aggregation of Embed usage data.
 * Collects all Embed instances from usage tracking keys for verification.
 */

import { storage, startsWith } from '@forge/api';
import { logWarning } from '../../utils/forge-logger.js';

/**
 * Collect all Embed instances from ALL usage keys
 * This ensures we clean up orphaned embeds even if their Source was deleted
 *
 * @param {Array} excerptIds - Array of existing excerpt IDs
 * @returns {Promise<{
 *   allIncludes: Array,
 *   uniqueIncludes: Array,
 *   orphanedUsageKeys: Array
 * }>}
 */
export async function collectAllEmbedInstances(excerptIds) {
  const allUsageQuery = await storage.query()
    .where('key', startsWith('usage:'))
    .getMany();

  const allIncludes = [];
  const orphanedUsageKeys = []; // Track usage keys for deleted Sources

  for (const entry of allUsageQuery.results) {
    const excerptId = entry.key.replace('usage:', '');
    const usageData = entry.value;
    const references = usageData ? usageData.references || [] : [];

    // Check if this Source still exists
    const sourceExists = excerptIds.includes(excerptId);

    if (!sourceExists) {
      logWarning('collectAllEmbedInstances', 'Found orphaned usage key for deleted Source', { excerptId, referenceCount: references.length });
      orphanedUsageKeys.push({ excerptId, key: entry.key, references });
    }

    // Collect all references (whether Source exists or not)
    allIncludes.push(...references);
  }

  // IMPORTANT: Filter out embeds that don't have corresponding macro-vars:* entries
  // This prevents issues when production data is imported into dev - usage tracking
  // may reference embeds that don't actually exist in the current environment
  const validIncludes = [];
  for (const include of allIncludes) {
    const macroVarsKey = `macro-vars:${include.localId}`;
    const macroVars = await storage.get(macroVarsKey);
    
    // Only include if macro-vars entry exists and is not soft-deleted
    if (macroVars) {
      const deletedEntry = await storage.get(`macro-vars-deleted:${include.localId}`);
      if (!deletedEntry) {
        validIncludes.push(include);
      } else {
        logWarning('collectAllEmbedInstances', 'Skipping soft-deleted embed from usage tracking', { localId: include.localId });
      }
    } else {
      logWarning('collectAllEmbedInstances', 'Skipping embed without macro-vars entry (likely from production import)', { localId: include.localId, excerptId: include.excerptId });
    }
  }

  // Deduplicate by localId (in case an Include references multiple excerpts)
  const uniqueIncludes = Array.from(
    new Map(validIncludes.map(inc => [inc.localId, inc])).values()
  );

  return {
    allIncludes,
    uniqueIncludes,
    orphanedUsageKeys
  };
}

/**
 * Check if an Embed is stale (Source updated after last sync)
 * @param {string} lastSynced - ISO timestamp of last sync
 * @param {string} excerptUpdated - ISO timestamp of excerpt update
 * @returns {boolean} True if Embed is stale
 */
export function checkStalenessstatus(lastSynced, excerptUpdated) {
  if (!lastSynced || !excerptUpdated) {
    return false;
  }
  return new Date(excerptUpdated) > new Date(lastSynced);
}

/**
 * Build active Embed record with all metadata
 * @param {Object} include - Include reference
 * @param {Object} pageData - Confluence page data
 * @param {Object} excerpt - Source excerpt data
 * @param {Object} macroVars - Embed configuration data
 * @param {Object} cacheData - Cached content data
 * @returns {Object} Active include record
 */
export function buildActiveIncludeRecord(include, pageData, excerpt, macroVars, cacheData) {
  const lastSynced = macroVars?.lastSynced;
  const excerptUpdated = excerpt.updatedAt;
  const isStale = checkStalenessstatus(lastSynced, excerptUpdated);

  // Construct page URL for CSV export
  const pageUrl = pageData._links?.webui ? `/wiki${pageData._links.webui}` : null;

  return {
    localId: include.localId,
    pageId: include.pageId,
    pageTitle: include.pageTitle || pageData.title,
    pageUrl: pageUrl,
    spaceKey: include.spaceKey,
    headingAnchor: include.headingAnchor,
    excerptId: include.excerptId,
    excerptName: excerpt.name,
    excerptCategory: excerpt.category,
    status: isStale ? 'Stale (update available)' : 'Active',
    lastSynced,
    excerptUpdated,
    excerptLastModified: excerpt.updatedAt,
    isStale,
    variables: excerpt.variables || [],
    toggles: excerpt.toggles || [],
    variableValues: macroVars?.variableValues || {},
    toggleStates: macroVars?.toggleStates || {},
    customInsertions: macroVars?.customInsertions || [],
    renderedContent: cacheData?.content || null
  };
}
