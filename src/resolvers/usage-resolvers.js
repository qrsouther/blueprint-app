/**
 * Usage Tracking and Update Resolver Functions
 *
 * This module contains operations for tracking excerpt usage across pages
 * and pushing updates to Include instances. These are tightly related operations:
 * tracking tells us WHERE instances are, and push updates keep those instances
 * in sync with their source.
 *
 * Extracted during Phase 6 of index.js modularization.
 *
 * Usage Tracking Functions:
 * - trackExcerptUsage: Record when/where an excerpt is used on a page
 * - removeExcerptUsage: Remove usage tracking when Include is deleted
 * - getExcerptUsage: Get all pages using a specific excerpt
 *
 * Push Update Functions:
 * - pushUpdatesToAll: Push excerpt updates to all Include instances
 * - pushUpdatesToPage: Push updates to specific page's Include instances
 */

import { storage, startsWith } from '@forge/api';
import api, { route } from '@forge/api';
import { findHeadingBeforeMacro } from '../utils/adf-utils.js';
import { logFailure, logWarning } from '../utils/forge-logger.js';
import { createErrorResponse, ERROR_CODES } from '../utils/error-codes.js';

/**
 * Track excerpt usage - record when/where an excerpt is used
 * Called when Embed macro is saved
 */
export async function trackExcerptUsage(req) {
  const { excerptId, localId } = req.payload || {};
  const extractedExcerptId = excerptId; // Extract for use in catch block
  const extractedLocalId = localId; // Extract for use in catch block
  
  try {
    // Input validation
    if (!excerptId || typeof excerptId !== 'string' || excerptId.trim() === '') {
      logFailure('trackExcerptUsage', 'Validation failed: excerptId is required and must be a non-empty string', new Error('Invalid excerptId'));
      return {
        success: false,
        error: 'excerptId is required and must be a non-empty string'
      };
    }

    if (!localId || typeof localId !== 'string' || localId.trim() === '') {
      logFailure('trackExcerptUsage', 'Validation failed: localId is required and must be a non-empty string', new Error('Invalid localId'));
      return {
        success: false,
        error: 'localId is required and must be a non-empty string'
      };
    }

    // Extract page information from backend context
    const pageId = req.context?.extension?.content?.id;
    const spaceKey = req.context?.extension?.space?.key || 'Unknown Space';

    if (!pageId) {
      logFailure('trackExcerptUsage', 'CRITICAL: pageId not available in req.context', new Error('Page context not available'));
      return {
        success: false,
        error: 'Page context not available'
      };
    }

    // Fetch page data including title and body (ADF content)
    let pageTitle = 'Unknown Page';
    let headingAnchor = null;

    try {
      const response = await api.asApp().requestConfluence(route`/wiki/api/v2/pages/${pageId}?body-format=atlas_doc_format`);
      const pageData = await response.json();
      pageTitle = pageData.title || 'Unknown Page';

      // Parse the ADF to find the heading above this Embed macro
      if (pageData.body?.atlas_doc_format?.value) {
        const adfContent = JSON.parse(pageData.body.atlas_doc_format.value);
        const headingText = findHeadingBeforeMacro(adfContent, localId);
        // Format heading for Confluence URL anchor (spaces → hyphens)
        if (headingText) {
          headingAnchor = headingText.replace(/\s+/g, '-');
        }
      }
    } catch (apiError) {
      logFailure('trackExcerptUsage', 'Error fetching page data via API', apiError, { pageId, localId });
      // Fall back to context title if API fails
      pageTitle = req.context?.extension?.content?.title || 'Unknown Page';
    }

    // Fetch toggle states and variable values from storage (saved during auto-save)
    let toggleStates = {};
    let variableValues = {};
    try {
      const macroVars = await storage.get(`macro-vars:${localId}`);
      if (macroVars?.toggleStates) {
        toggleStates = macroVars.toggleStates;
      }
      if (macroVars?.variableValues) {
        variableValues = macroVars.variableValues;
      }
    } catch (storageError) {
      logFailure('trackExcerptUsage', 'Error fetching toggle states and variable values', storageError, { localId });
    }

    // Store usage data in a reverse index
    const usageKey = `usage:${excerptId}`;
    const usageData = await storage.get(usageKey) || { excerptId, references: [] };

    // Check if this localId already exists
    const existingIndex = usageData.references.findIndex(r => r.localId === localId);

    const reference = {
      localId,
      pageId,
      pageTitle,
      spaceKey,
      headingAnchor,
      toggleStates,
      variableValues,
      updatedAt: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      // Update existing reference
      usageData.references[existingIndex] = reference;
    } else {
      // Add new reference
      usageData.references.push(reference);
    }

    await storage.set(usageKey, usageData);

    return {
      success: true,
      data: {
        pageId,
        pageTitle,
        spaceKey,
        headingAnchor,
        toggleStates
      }
    };
  } catch (error) {
    logFailure('trackExcerptUsage', 'Error tracking excerpt usage', error, { excerptId: extractedExcerptId, localId: extractedLocalId });
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Remove usage tracking
 * Called when Embed macro is deleted or excerptId changes
 */
export async function removeExcerptUsage(req) {
  const { excerptId, localId } = req.payload || {};
  const extractedExcerptId = excerptId; // Extract for use in catch block
  const extractedLocalId = localId; // Extract for use in catch block
  
  try {
    // Input validation
    if (!excerptId || typeof excerptId !== 'string' || excerptId.trim() === '') {
      logFailure('removeExcerptUsage', 'Validation failed: excerptId is required and must be a non-empty string', new Error('Invalid excerptId'));
      return {
        success: false,
        error: 'excerptId is required and must be a non-empty string'
      };
    }

    if (!localId || typeof localId !== 'string' || localId.trim() === '') {
      logFailure('removeExcerptUsage', 'Validation failed: localId is required and must be a non-empty string', new Error('Invalid localId'));
      return {
        success: false,
        error: 'localId is required and must be a non-empty string'
      };
    }

    const usageKey = `usage:${excerptId}`;
    const usageData = await storage.get(usageKey);

    if (usageData) {
      usageData.references = usageData.references.filter(r => r.localId !== localId);

      if (usageData.references.length === 0) {
        // No more references, delete the usage record
        await storage.delete(usageKey);
      } else {
        await storage.set(usageKey, usageData);
      }
    }

    return {
      success: true,
      data: {}
    };
  } catch (error) {
    logFailure('removeExcerptUsage', 'Error removing excerpt usage', error, { excerptId: extractedExcerptId, localId: extractedLocalId });
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get excerpt usage - which Embed macros reference this excerpt
 */
export async function getExcerptUsage(req) {
  const { excerptId } = req.payload || {};
  const extractedExcerptId = excerptId; // Extract for use in catch block
  
  try {
    // Input validation
    if (!excerptId || typeof excerptId !== 'string' || excerptId.trim() === '') {
      logFailure('getExcerptUsage', 'Validation failed: excerptId is required and must be a non-empty string', new Error('Invalid excerptId'));
      return {
        success: false,
        error: 'excerptId is required and must be a non-empty string',
        usage: []
      };
    }

    const usageKey = `usage:${excerptId}`;
    const usageData = await storage.get(usageKey) || { references: [] };

    // Enrich usage data with lastSynced timestamp from macro-vars
    const enrichedReferences = await Promise.all(usageData.references.map(async (ref) => {
      const varsKey = `macro-vars:${ref.localId}`;
      const macroVars = await storage.get(varsKey);

      return {
        ...ref,
        lastSynced: macroVars?.lastSynced || null
      };
    }));

    return {
      success: true,
      data: {
        usage: enrichedReferences
      }
    };
  } catch (error) {
    logFailure('getExcerptUsage', 'Error getting excerpt usage', error, { excerptId: extractedExcerptId });
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get excerpt usage with full CSV export data
 * Fetches usage data along with customInsertions and renderedContent for CSV export
 */
export async function getExcerptUsageForCSV(req) {
  const { excerptId } = req.payload || {};
  const extractedExcerptId = excerptId; // Extract for use in catch block
  
  try {
    // Input validation
    if (!excerptId || typeof excerptId !== 'string' || excerptId.trim() === '') {
      logFailure('getExcerptUsageForCSV', 'Validation failed: excerptId is required and must be a non-empty string', new Error('Invalid excerptId'));
      return {
        success: false,
        error: 'excerptId is required and must be a non-empty string',
        usage: []
      };
    }

    // Get the excerpt for metadata
    const excerpt = await storage.get(`excerpt:${extractedExcerptId}`);
    if (!excerpt) {
      return {
        success: false,
        error: 'Excerpt not found',
        usage: []
      };
    }

    const usageKey = `usage:${extractedExcerptId}`;
    const usageData = await storage.get(usageKey) || { references: [] };

    // Enrich usage data with all fields needed for CSV export
    // Filter out deleted embeds (where macro-vars doesn't exist)
    const enrichedReferences = [];
    for (const ref of usageData.references) {
      const varsKey = `macro-vars:${ref.localId}`;
      const cacheKey = `macro-cache:${ref.localId}`;
      
      const [macroVars, cacheData] = await Promise.all([
        storage.get(varsKey),
        storage.get(cacheKey)
      ]);

      // Skip if macro-vars doesn't exist (Embed was deleted)
      if (!macroVars) {
        continue;
      }

      // Build page URL
      const pageUrl = `/wiki/pages/viewpage.action?pageId=${ref.pageId}${ref.headingAnchor ? `#${ref.headingAnchor}` : ''}`;

      // Determine status
      const excerptUpdated = excerpt.updatedAt;
      const lastSynced = macroVars?.lastSynced || null;
      const isStale = lastSynced ? new Date(excerptUpdated) > new Date(lastSynced) : false;
      const status = isStale ? 'Stale (update available)' : 'Active';

      enrichedReferences.push({
        localId: ref.localId,
        pageId: ref.pageId,
        pageTitle: ref.pageTitle || 'Unknown Page',
        pageUrl: pageUrl,
        headingAnchor: ref.headingAnchor || '',
        excerptId: extractedExcerptId,
        excerptName: excerpt.name,
        excerptCategory: excerpt.category,
        status: status,
        lastSynced: lastSynced || '',
        excerptLastModified: excerpt.updatedAt,
        updatedAt: macroVars?.lastSynced || ref.updatedAt || null, // For deduplication
        variables: excerpt.variables || [],
        toggles: excerpt.toggles || [],
        variableValues: macroVars?.variableValues || {},
        toggleStates: macroVars?.toggleStates || {},
        customInsertions: macroVars?.customInsertions || [],
        renderedContent: cacheData?.content || null
      });
    }

    // Deduplicate by pageId (keep most recent by updatedAt/lastSynced)
    // This matches the frontend deduplication logic
    const uniqueReferences = [];
    const seenPages = new Map();
    for (const ref of enrichedReferences) {
      const pageId = String(ref.pageId);
      if (!seenPages.has(pageId)) {
        seenPages.set(pageId, ref);
        uniqueReferences.push(ref);
      } else {
        const existing = seenPages.get(pageId);
        const refUpdatedAt = ref.updatedAt ? new Date(ref.updatedAt) : new Date(0);
        const existingUpdatedAt = existing.updatedAt ? new Date(existing.updatedAt) : new Date(0);
        if (refUpdatedAt > existingUpdatedAt) {
          const idx = uniqueReferences.findIndex(u => String(u.pageId) === pageId);
          uniqueReferences[idx] = ref;
          seenPages.set(pageId, ref);
        }
      }
    }

    return {
      success: true,
      data: {
        usage: uniqueReferences
      }
    };
  } catch (error) {
    logFailure('getExcerptUsageForCSV', 'Error getting excerpt usage for CSV', error, { excerptId: extractedExcerptId });
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get usage counts for all excerpts (lightweight for sorting)
 * Returns object mapping excerptId -> count of references
 * 
 * Uses storage.query() to fetch all usage data in a single efficient query
 * instead of many individual storage.get() calls, preventing timeouts.
 */
export async function getAllUsageCounts() {
  try {
    // Get all excerpt IDs from the index for fallback (in case some usage keys don't exist)
    const index = await storage.get('excerpt-index') || { excerpts: [] };
    const usageCounts = {};

    // Initialize all excerpt IDs to 0 (in case they have no usage data)
    if (index.excerpts && Array.isArray(index.excerpts)) {
      for (const indexEntry of index.excerpts) {
        usageCounts[indexEntry.id] = 0;
      }
    }

    // Query all usage: keys at once using storage.query() - much faster than individual gets
    const allUsageData = [];
    let cursor = await storage.query()
      .where('key', startsWith('usage:'))
      .getMany();

    // Add first page
    allUsageData.push(...(cursor.results || []));

    // Paginate through remaining pages (should be minimal, typically 1-2 pages for 147 Sources)
    while (cursor.nextCursor) {
      cursor = await storage.query()
        .where('key', startsWith('usage:'))
        .cursor(cursor.nextCursor)
        .getMany();
      allUsageData.push(...(cursor.results || []));
    }

    // Process all usage data
    for (const entry of allUsageData) {
      try {
        // Extract excerptId from key (format: "usage:{excerptId}")
        const key = entry.key;
        const excerptId = key.replace('usage:', '');
        const usageData = entry.value;

        // Count unique pages (not total references)
        if (usageData && Array.isArray(usageData.references)) {
          const uniquePageIds = new Set(usageData.references.map(ref => ref.pageId));
          usageCounts[excerptId] = uniquePageIds.size;
        } else {
          usageCounts[excerptId] = 0;
        }
      } catch (entryError) {
        // If a single entry fails, log but continue with others
        logWarning('getAllUsageCounts', `Failed to process usage entry ${entry.key}`, { error: entryError.message });
      }
    }

    return {
      success: true,
      data: {
        usageCounts
      }
    };
  } catch (error) {
    logFailure('getAllUsageCounts', 'Error getting all usage counts', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Push updates to all Include instances of a specific excerpt
 * Admin function to force-refresh all instances
 */
export async function pushUpdatesToAll(req) {
  const { excerptId } = req.payload || {};
  const extractedExcerptId = excerptId; // Extract for use in catch block
  
  try {

    // Get the excerpt
    const excerpt = await storage.get(`excerpt:${excerptId}`);
    if (!excerpt) {
      return { success: false, error: 'Excerpt not found' };
    }

    // Get all usages of this excerpt
    const usageKey = `excerpt-usage:${excerptId}`;
    const usageData = await storage.get(usageKey) || { usages: [] };

    let updated = 0;
    let errors = [];

    // For each usage, regenerate and cache content
    for (const usage of usageData.usages) {
      try {
        const localId = usage.localId;

        // Get variable values for this instance
        const varsKey = `macro-vars:${localId}`;
        const macroVars = await storage.get(varsKey) || {};

        // Generate fresh content
        let freshContent = excerpt.content;
        const isAdf = freshContent && typeof freshContent === 'object' && freshContent.type === 'doc';

        if (isAdf) {
          // Apply filters/substitutions (we'll need to import helper functions)
          // For now, just cache the base content - frontend will handle processing
          freshContent = excerpt.content;
        }

        // Cache the updated content
        const now = new Date().toISOString();
        const cacheKey = `macro-cache:${localId}`;
        await storage.set(cacheKey, {
          content: freshContent,
          cachedAt: now
        });

        // Update lastSynced timestamp
        macroVars.lastSynced = now;
        await storage.set(varsKey, macroVars);

        updated++;
      } catch (err) {
        logFailure('pushUpdatesToAll', 'Error updating localId', err, { localId: usage.localId, excerptId: extractedExcerptId });
        errors.push({ localId: usage.localId, error: err.message });
      }
    }

    return {
      success: true,
      updated,
      total: usageData.usages.length,
      errors: errors.length > 0 ? errors : undefined
    };
  } catch (error) {
    logFailure('pushUpdatesToAll', 'Error pushing updates to all', error, { excerptId: extractedExcerptId });
    return createErrorResponse(ERROR_CODES.INTERNAL_ERROR, error.message);
  }
}

/**
 * Push updates to a specific page's Include instances
 * Admin function to force-refresh instances on one page
 */
export async function pushUpdatesToPage(req) {
  const { excerptId, pageId } = req.payload || {};
  const extractedExcerptId = excerptId; // Extract for use in catch block
  const extractedPageId = pageId; // Extract for use in catch block
  
  try {

    // Get the excerpt
    const excerpt = await storage.get(`excerpt:${extractedExcerptId}`);
    if (!excerpt) {
      return { success: false, error: 'Excerpt not found' };
    }

    // Get all usages of this excerpt
    const usageKey = `excerpt-usage:${extractedExcerptId}`;
    const usageData = await storage.get(usageKey) || { usages: [] };

    // Filter to only usages on the specified page
    const pageUsages = usageData.usages.filter(u => u.pageId === extractedPageId);

    if (pageUsages.length === 0) {
      return { success: false, error: 'No instances found on this page' };
    }

    let updated = 0;
    let errors = [];

    // Update each instance on this page
    for (const usage of pageUsages) {
      try {
        const localId = usage.localId;

        // Get variable values for this instance
        const varsKey = `macro-vars:${localId}`;
        const macroVars = await storage.get(varsKey) || {};

        // Generate fresh content
        let freshContent = excerpt.content;

        // Cache the updated content
        const now = new Date().toISOString();
        const cacheKey = `macro-cache:${localId}`;
        await storage.set(cacheKey, {
          content: freshContent,
          cachedAt: now
        });

        // Update lastSynced timestamp
        macroVars.lastSynced = now;
        await storage.set(varsKey, macroVars);

        updated++;
      } catch (err) {
        logFailure('pushUpdatesToPage', 'Error updating localId', err, { localId: usage.localId, excerptId: extractedExcerptId, pageId: extractedPageId });
        errors.push({ localId: usage.localId, error: err.message });
      }
    }

    return {
      success: true,
      updated,
      total: pageUsages.length,
      errors: errors.length > 0 ? errors : undefined
    };
  } catch (error) {
    logFailure('pushUpdatesToPage', 'Error pushing updates to page', error, { excerptId, pageId });
    return createErrorResponse(ERROR_CODES.INTERNAL_ERROR, error.message);
  }
}
