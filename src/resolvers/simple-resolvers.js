/**
 * Simple Resolver Functions
 *
 * This module contains simple getter/setter resolvers with minimal business logic.
 * These are primarily storage lookups, API calls, and utility function wrappers.
 *
 * Extracted during Phase 2 of index.js modularization.
 */

import { storage, startsWith } from '@forge/api';
import api, { route } from '@forge/api';
import { detectVariables, detectToggles } from '../utils/detection-utils.js';
import { saveVersion } from '../utils/version-manager.js';
import { validateExcerptData, safeStorageSet } from '../utils/storage-validator.js';
import { updateExcerptIndex } from '../utils/storage-utils.js';
import { calculateContentHash } from '../utils/hash-utils.js';
import {
  logFunction,
  logPhase,
  logSuccess,
  logFailure
} from '../utils/forge-logger.js';

/**
 * Detect variables from content (for UI to call)
 */
export async function detectVariablesFromContent(req) {
  try {
    const { content } = req.payload || {};
    
    // Input validation
    if (content === undefined || content === null) {
      logFailure('detectVariablesFromContent', 'Validation failed: content is required', new Error('Missing content'));
      return {
        success: false,
        error: 'content is required',
        variables: []
      };
    }

    // Handle different content formats
    // detectVariables() can handle both ADF objects and plain text strings
    // So we accept both formats here
    let contentToProcess = content;
    
    // If content is a string, check if it's JSON or plain text
    if (typeof content === 'string') {
      // Try to parse as JSON first (in case it's a stringified ADF object)
      try {
        const parsed = JSON.parse(content);
        // Only use parsed result if it's an object (not a primitive)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          contentToProcess = parsed;
        }
        // Otherwise, treat the string as plain text (which detectVariables can handle)
      } catch (parseErr) {
        // Not JSON - treat as plain text string (which detectVariables can handle)
        // No error, just use the string as-is
      }
    }

    // Validate it's either an object (ADF) or a string (plain text)
    // Both are acceptable since detectVariables handles both
    if (contentToProcess === null || contentToProcess === undefined) {
      logFailure('detectVariablesFromContent', 'Validation failed: content is null or undefined', new Error('Invalid content'));
      return {
        success: false,
        error: 'content must be an ADF object or text string',
        variables: []
      };
    }

    // Reject arrays (not a valid format)
    if (Array.isArray(contentToProcess)) {
      logFailure('detectVariablesFromContent', 'Validation failed: content cannot be an array', new Error('Invalid content type'));
      return {
        success: false,
        error: 'content must be an ADF object or text string, not an array',
        variables: []
      };
    }

    const variables = detectVariables(contentToProcess);
    return {
      success: true,
      data: {
        variables
      }
    };
  } catch (error) {
    logFailure('detectVariablesFromContent', 'Error detecting variables', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Detect toggles from content (for UI to call)
 */
export async function detectTogglesFromContent(req) {
  try {
    const { content } = req.payload || {};
    
    // Input validation
    if (content === undefined || content === null) {
      logFailure('detectTogglesFromContent', 'Validation failed: content is required', new Error('Missing content'));
      return {
        success: false,
        error: 'content is required',
        toggles: []
      };
    }

    // Handle different content formats
    // detectToggles() can handle both ADF objects and plain text strings
    // So we accept both formats here
    let contentToProcess = content;
    
    // If content is a string, check if it's JSON or plain text
    if (typeof content === 'string') {
      // Try to parse as JSON first (in case it's a stringified ADF object)
      try {
        const parsed = JSON.parse(content);
        // Only use parsed result if it's an object (not a primitive)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          contentToProcess = parsed;
        }
        // Otherwise, treat the string as plain text (which detectToggles can handle)
      } catch (parseErr) {
        // Not JSON - treat as plain text string (which detectToggles can handle)
        // No error, just use the string as-is
      }
    }

    // Validate it's either an object (ADF) or a string (plain text)
    // Both are acceptable since detectToggles handles both
    if (contentToProcess === null || contentToProcess === undefined) {
      logFailure('detectTogglesFromContent', 'Validation failed: content is null or undefined', new Error('Invalid content'));
      return {
        success: false,
        error: 'content must be an ADF object or text string',
        toggles: []
      };
    }

    // Reject arrays (not a valid format)
    if (Array.isArray(contentToProcess)) {
      logFailure('detectTogglesFromContent', 'Validation failed: content cannot be an array', new Error('Invalid content type'));
      return {
        success: false,
        error: 'content must be an ADF object or text string, not an array',
        toggles: []
      };
    }

    const toggles = detectToggles(contentToProcess);
    return {
      success: true,
      data: {
        toggles
      }
    };
  } catch (error) {
    logFailure('detectTogglesFromContent', 'Error detecting toggles', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get all excerpts from index
 * 
 * Standard return format:
 * - Success: { success: true, data: { excerpts: [...] } }
 * - Error: { success: false, error: "error message" }
 */
export async function getExcerpts() {
  try {
    const index = await storage.get('excerpt-index') || { excerpts: [] };
    return {
      success: true,
      data: {
        excerpts: index.excerpts
      }
    };
  } catch (error) {
    logFailure('getExcerpts', 'Error getting excerpts', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get specific excerpt by ID
 * 
 * Standard return format:
 * - Success: { success: true, data: { excerpt: {...} } }
 * - Error: { success: false, error: "error message" }
 */
export async function getExcerpt(req) {
  try {
    const excerptId = req.payload?.excerptId;
    
    // Input validation
    if (!excerptId || typeof excerptId !== 'string' || excerptId.trim() === '') {
      logFailure('getExcerpt', 'Validation failed: excerptId is required and must be a non-empty string', new Error('Invalid excerptId'));
      return {
        success: false,
        error: 'excerptId is required and must be a non-empty string'
      };
    }

    const excerpt = await storage.get(`excerpt:${excerptId}`);

    if (excerpt === null || excerpt === undefined) {
      logFailure('getExcerpt', 'Excerpt not found in storage', new Error('Excerpt not found'), { excerptId, storageKey: `excerpt:${excerptId}` });
      return {
        success: false,
        error: `Excerpt not found: ${excerptId}`
      };
    }

    return {
      success: true,
      data: {
        excerpt: excerpt
      }
    };
  } catch (error) {
    logFailure('getExcerpt', 'Error getting excerpt', error, { excerptId: req.payload?.excerptId });
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * DEBUG: Get raw excerpt JSON for debugging (TEMPORARY)
 */
export async function debugExcerpt(req) {
  try {
    const excerptId = req.payload.excerptId;
    const excerpt = await storage.get(`excerpt:${excerptId}`);

    return {
      success: true,
      excerpt: excerpt,
      json: JSON.stringify(excerpt, null, 2)
    };
  } catch (error) {
    logFailure('debugExcerpt', 'Error in debugExcerpt', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get page title by content ID
 * 
 * Standard return format:
 * - Success: { success: true, data: { title: string } }
 * - Error: { success: false, error: "error message" }
 */
export async function getPageTitle(req) {
  try {
    const contentId = req.payload?.contentId;
    
    // Input validation
    if (!contentId || typeof contentId !== 'string' || contentId.trim() === '') {
      logFailure('getPageTitle', 'Validation failed: contentId is required and must be a non-empty string', new Error('Invalid contentId'));
      return {
        success: false,
        error: 'contentId is required and must be a non-empty string'
      };
    }

    const response = await api.asApp().requestConfluence(route`/wiki/api/v2/pages/${contentId}`);
    const data = await response.json();

    return {
      success: true,
      data: {
        title: data.title
      }
    };
  } catch (error) {
    logFailure('getPageTitle', 'Error getting page title', error, { contentId: req.payload?.contentId });
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get variable values and toggle states for a specific macro instance
 * 
 * Standard return format:
 * - Success: { success: true, data: { variableValues, toggleStates, customInsertions, ... } }
 * - Error: { success: false, error: "error message" }
 */
export async function getVariableValues(req) {
  try {
    const { localId } = req.payload || {};
    
    // Input validation
    if (!localId || typeof localId !== 'string' || localId.trim() === '') {
      logFailure('getVariableValues', 'Validation failed: localId is required and must be a non-empty string', new Error('Invalid localId'));
      return {
        success: false,
        error: 'localId is required and must be a non-empty string'
      };
    }

    const key = `macro-vars:${localId}`;
    const data = await storage.get(key) || {};

    return {
      success: true,
      data: {
        variableValues: data.variableValues || {},
        toggleStates: data.toggleStates || {},
        customInsertions: data.customInsertions || [],
        internalNotes: data.internalNotes || [],
        lastSynced: data.lastSynced,
        excerptId: data.excerptId,
        syncedContentHash: data.syncedContentHash,  // Hash for staleness detection
        syncedContent: data.syncedContent,  // Old Source ADF for diff comparison
        redlineStatus: data.redlineStatus || 'reviewable',  // Redline approval status
        approvedBy: data.approvedBy,
        approvedAt: data.approvedAt,
        lastChangedBy: data.lastChangedBy,  // User who made the last status change
        lastChangedAt: data.lastChangedAt
      }
    };
  } catch (error) {
    logFailure('getVariableValues', 'Error getting variable values', error, { localId: req.payload?.localId });
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * DEPRECATED: Get or register the canonical localId for an excerpt on a page
 *
 * This approach had performance issues (extra network call on every render)
 * and didn't handle multiple instances of same excerpt on one page well.
 *
 * Replaced with lazy recovery approach: use context.localId directly,
 * only call recoverOrphanedData when data is missing.
 *
 * Keeping this function for backward compatibility during transition.
 */
export async function getCanonicalLocalId(req) {
  // Simply return the current localId - no longer doing canonical mapping
  return {
    success: true,
    canonicalLocalId: req.payload.currentLocalId,
    isDragged: false
  };
}

/**
 * Recover orphaned data after a macro has been moved (localId changed)
 * This handles the case where dragging a macro in Confluence assigns it a new localId
 *
 * Performance: Only called when data is missing (lazy recovery), not on every render
 * Multiple instances: Uses most recent updatedAt timestamp as tiebreaker
 */
export async function recoverOrphanedData(req) {
  try {
    const { pageId, excerptId, currentLocalId } = req.payload || {};
    
    // Input validation
    if (!pageId || typeof pageId !== 'string' || pageId.trim() === '') {
      logFailure('recoverOrphanedData', 'Validation failed: pageId is required and must be a non-empty string', new Error('Invalid pageId'));
      return {
        success: false,
        error: 'pageId is required and must be a non-empty string'
      };
    }

    if (!currentLocalId || typeof currentLocalId !== 'string' || currentLocalId.trim() === '') {
      logFailure('recoverOrphanedData', 'Validation failed: currentLocalId is required and must be a non-empty string', new Error('Invalid currentLocalId'));
      return {
        success: false,
        error: 'currentLocalId is required and must be a non-empty string'
      };
    }

    // excerptId is optional (if not provided, will recover most recent entry on page)
    if (excerptId !== undefined && excerptId !== null && (typeof excerptId !== 'string' || excerptId.trim() === '')) {
      logFailure('recoverOrphanedData', 'Validation failed: excerptId must be a non-empty string if provided', new Error('Invalid excerptId'));
      return {
        success: false,
        error: 'excerptId must be a non-empty string if provided'
      };
    }
    
    logFunction('recoverOrphanedData', 'Starting recovery', { pageId, excerptId, currentLocalId });

    // Query all macro-vars entries
    const allEntries = await storage.query()
      .where('key', startsWith('macro-vars:'))
      .getMany();

    // Find candidates: entries on the same page (pageId is required for recovery)
    // If excerptId is provided, also match by excerptId for more precise recovery
    const candidates = [];

    for (const entry of allEntries.results) {
      const data = entry.value;
      const entryLocalId = entry.key.replace('macro-vars:', '');

      // Skip if this is the current localId (we already checked it)
      if (entryLocalId === currentLocalId) {
        continue;
      }

      // CRITICAL: pageId matching is required to prevent cross-page recovery
      // If pageId is provided, only consider entries from the same page
      if (pageId && data.pageId) {
        // Normalize to strings for comparison (storage might have strings or numbers)
        if (String(data.pageId) !== String(pageId)) {
          continue; // Skip if pageId doesn't match
        }
      } else if (pageId) {
        // If we have pageId but entry doesn't, skip it (can't verify it's from same page)
        continue;
      }

      // If excerptId is provided, also match by excerptId for more precise recovery
      // If excerptId is NOT provided, we'll recover the most recent entry on this page
      if (excerptId && data.excerptId !== excerptId) {
        continue; // Skip if excerptId doesn't match (when excerptId is provided)
      }

      // No time window restriction - if it's on the same page, it's a valid candidate
      // We filter by pageId above, so there's no risk of cross-page contamination
      // If there are multiple candidates, we'll pick the most recent one by updatedAt
      // This ensures we can recover data even if the Embed was configured months ago
      const timestamp = data.lastSynced || data.updatedAt;
      if (timestamp || data.updatedAt) {
        candidates.push({
          localId: entryLocalId,
          data: data,
          updatedAt: data.updatedAt || data.lastSynced || new Date(0).toISOString() // Use updatedAt for tiebreaker, fallback to epoch if missing
        });
      }
    }

    // If we found candidate(s), pick the most recently updated one
    if (candidates.length >= 1) {
      // Sort by updatedAt timestamp, most recent first
      candidates.sort((a, b) => {
        const dateA = new Date(a.updatedAt);
        const dateB = new Date(b.updatedAt);
        return dateB - dateA; // Most recent first
      });

      const orphanedEntry = candidates[0];

      // Update excerptId: use provided excerptId if available, otherwise use recovered data's excerptId
      // This ensures excerptId is preserved even when recovery is triggered without excerptId
      if (excerptId) {
        orphanedEntry.data.excerptId = excerptId;
      } else if (orphanedEntry.data.excerptId) {
        // Keep the recovered excerptId (don't overwrite with null)
        // This is the key fix: when excerptId is lost during drag, we recover it from orphaned data
      }
      // If neither exists, leave it as is (shouldn't happen, but safe fallback)

      // Save to new localId
      await storage.set(`macro-vars:${currentLocalId}`, orphanedEntry.data);

      // Delete old entry (only if not same as current)
      if (orphanedEntry.localId !== currentLocalId) {
        await storage.delete(`macro-vars:${orphanedEntry.localId}`);
      }

      // Also migrate cache if it exists
      const oldCache = await storage.get(`macro-cache:${orphanedEntry.localId}`);
      if (oldCache) {
        await storage.set(`macro-cache:${currentLocalId}`, oldCache);
        if (orphanedEntry.localId !== currentLocalId) {
          await storage.delete(`macro-cache:${orphanedEntry.localId}`);
        }
      }

      logSuccess('recoverOrphanedData', 'Recovery successful', {
        migratedFrom: orphanedEntry.localId,
        excerptId: orphanedEntry.data.excerptId,
        candidateCount: candidates.length,
        currentLocalId
      });
      
      return {
        success: true,
        data: {
          recovered: true,
          data: orphanedEntry.data,
          migratedFrom: orphanedEntry.localId,
          candidateCount: candidates.length
        }
      };
    } else {
      logPhase('recoverOrphanedData', 'No candidates found', {
        pageId,
        excerptId,
        reason: 'no_candidates',
        currentLocalId
      });
      return {
        success: true,
        data: {
          recovered: false,
          reason: 'no_candidates'
        }
      };
    }
  } catch (error) {
    logFailure('recoverOrphanedData', 'Error recovering orphaned data', error, {
      pageId: req.payload?.pageId,
      excerptId: req.payload?.excerptId,
      currentLocalId: req.payload?.currentLocalId
    });
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Extract all active localIds from ADF content
 * Recursively walks the ADF tree to find all extension nodes with localIds
 * @param {Object} node - ADF node to search
 * @param {Set<string>} activeLocalIds - Set to collect active localIds
 */
function extractActiveLocalIdsFromADF(node, activeLocalIds = new Set()) {
  if (!node || typeof node !== 'object') {
    return activeLocalIds;
  }

  // Check if this node is an extension (macro) with a localId
  if (node.type === 'extension' || node.type === 'bodiedExtension') {
    const extensionKey = node.attrs?.extensionKey || '';
    const isOurMacro = extensionKey.includes('blueprint-standard-embed') ||
                       extensionKey.includes('smart-excerpt-include') ||
                       extensionKey.includes('blueprint-standard-embed-poc');

    // Check for localId in various possible locations
    const localId = node.attrs?.localId ||
                    node.attrs?.parameters?.localId ||
                    node.attrs?.parameters?.macroParams?.localId?.value;

    if (localId && (isOurMacro || node.attrs?.extensionType === 'com.atlassian.ecosystem')) {
      activeLocalIds.add(localId);
    }
  }

  // Recursively check content array
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      extractActiveLocalIdsFromADF(child, activeLocalIds);
    }
  }

  // Also check marks array (some content nests in marks)
  if (Array.isArray(node.marks)) {
    for (const mark of node.marks) {
      extractActiveLocalIdsFromADF(mark, activeLocalIds);
    }
  }

  return activeLocalIds;
}

/**
 * Detect deactivated Embeds on a page
 * Deactivated Embeds are those that exist in storage but not in the page's ADF
 */
export async function detectDeactivatedEmbeds(req) {
  try {
    const { pageId, currentLocalId } = req.payload || {};

    // Input validation
    if (!pageId || typeof pageId !== 'string' || pageId.trim() === '') {
      logFailure('detectDeactivatedEmbeds', 'Validation failed: pageId is required and must be a non-empty string', new Error('Invalid pageId'));
      return {
        success: false,
        error: 'pageId is required and must be a non-empty string'
      };
    }

    // currentLocalId is optional, but if provided should be valid
    if (currentLocalId !== undefined && currentLocalId !== null && (typeof currentLocalId !== 'string' || currentLocalId.trim() === '')) {
      logFailure('detectDeactivatedEmbeds', 'Validation failed: currentLocalId must be a non-empty string if provided', new Error('Invalid currentLocalId'));
      return {
        success: false,
        error: 'currentLocalId must be a non-empty string if provided'
      };
    }

    logFunction('detectDeactivatedEmbeds', 'Starting detection', { pageId, currentLocalId });

    // Step 1: Query all macro-vars entries for this pageId
    const allEntries = await storage.query()
      .where('key', startsWith('macro-vars:'))
      .getMany();

    const pageEmbeds = [];
    for (const entry of allEntries.results) {
      const data = entry.value;
      const entryLocalId = entry.key.replace('macro-vars:', '');

      // Skip the current localId (the new Embed we're checking for)
      if (entryLocalId === currentLocalId) {
        continue;
      }

      // Filter by pageId
      if (data.pageId && String(data.pageId) === String(pageId)) {
        pageEmbeds.push({
          localId: entryLocalId,
          data: data
        });
      }
    }

    logPhase('detectDeactivatedEmbeds', `Found ${pageEmbeds.length} Embed(s) in storage for page ${pageId}`);

    if (pageEmbeds.length === 0) {
      return {
        success: true,
        deactivatedEmbeds: []
      };
    }

    // Step 2: Fetch page's ADF to get active localIds
    let activeLocalIds = new Set();
    try {
      const response = await api.asApp().requestConfluence(
        route`/wiki/api/v2/pages/${pageId}?body-format=atlas_doc_format`,
        {
          headers: {
            'Accept': 'application/json'
          }
        }
      );

      if (response.ok) {
        const pageData = await response.json();
        const adfBody = pageData?.body?.atlas_doc_format?.value;

        if (adfBody) {
          const adfDoc = typeof adfBody === 'string' ? JSON.parse(adfBody) : adfBody;
          activeLocalIds = extractActiveLocalIdsFromADF(adfDoc);
          logPhase('detectDeactivatedEmbeds', `Found ${activeLocalIds.size} active Embed(s) in page ADF`);
        }
      } else {
        logPhase('detectDeactivatedEmbeds', `Failed to fetch page ADF (HTTP ${response.status}), assuming all are deactivated`);
      }
    } catch (adfError) {
      logFailure('detectDeactivatedEmbeds', 'Error fetching page ADF', adfError, { pageId });
      // Continue with detection - assume all are deactivated if ADF fetch fails
    }

    // Step 3: Compare storage entries with active localIds
    const deactivatedEmbeds = [];
    const now = new Date().toISOString();

    for (const embed of pageEmbeds) {
      const { localId, data } = embed;

      // If localId is not in active set, it's deactivated
      if (!activeLocalIds.has(localId)) {
        // Set deactivatedAt timestamp if not already set
        if (!data.deactivatedAt) {
          data.deactivatedAt = now;
          await storage.set(`macro-vars:${localId}`, data);
          logPhase('detectDeactivatedEmbeds', `Marked Embed ${localId} as deactivated`);
        }

        // Fetch excerpt name for display
        let excerptName = 'Unknown Source';
        if (data.excerptId) {
          try {
            const excerpt = await storage.get(`excerpt:${data.excerptId}`);
            if (excerpt && excerpt.name) {
              excerptName = excerpt.name;
            }
          } catch (excerptError) {
            logPhase('detectDeactivatedEmbeds', `Could not fetch excerpt name for ${data.excerptId}`, { error: excerptError.message });
          }
        }

        deactivatedEmbeds.push({
          localId: localId,
          excerptId: data.excerptId || null,
          excerptName: excerptName,
          deactivatedAt: data.deactivatedAt || now,
          lastUpdatedAt: data.updatedAt || data.lastSynced || now,
          variableValues: data.variableValues || {},
          toggleStates: data.toggleStates || {},
          customInsertions: data.customInsertions || [],
          internalNotes: data.internalNotes || []
        });
      }
    }

    // Sort by deactivatedAt (most recent first)
    deactivatedEmbeds.sort((a, b) => {
      const dateA = new Date(a.deactivatedAt);
      const dateB = new Date(b.deactivatedAt);
      return dateB - dateA; // Most recent first
    });

    logSuccess('detectDeactivatedEmbeds', `Found ${deactivatedEmbeds.length} deactivated Embed(s)`, {
      pageId,
      deactivatedCount: deactivatedEmbeds.length
    });

    return {
      success: true,
      data: {
        deactivatedEmbeds: deactivatedEmbeds
      }
    };
  } catch (error) {
    logFailure('detectDeactivatedEmbeds', 'Error detecting deactivated Embeds', error, {
      pageId: req.payload?.pageId,
      currentLocalId: req.payload?.currentLocalId
    });
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Copy data from a deactivated Embed to a new Embed
 */
export async function copyDeactivatedEmbedData(req) {
  try {
    const { sourceLocalId, targetLocalId } = req.payload || {};

    // Input validation
    if (!sourceLocalId || typeof sourceLocalId !== 'string' || sourceLocalId.trim() === '') {
      logFailure('copyDeactivatedEmbedData', 'Validation failed: sourceLocalId is required and must be a non-empty string', new Error('Invalid sourceLocalId'));
      return {
        success: false,
        error: 'sourceLocalId is required and must be a non-empty string'
      };
    }

    if (!targetLocalId || typeof targetLocalId !== 'string' || targetLocalId.trim() === '') {
      logFailure('copyDeactivatedEmbedData', 'Validation failed: targetLocalId is required and must be a non-empty string', new Error('Invalid targetLocalId'));
      return {
        success: false,
        error: 'targetLocalId is required and must be a non-empty string'
      };
    }

    logFunction('copyDeactivatedEmbedData', 'Copying Embed data', { sourceLocalId, targetLocalId });

    // Step 1: Load source Embed data
    const sourceKey = `macro-vars:${sourceLocalId}`;
    const sourceData = await storage.get(sourceKey);

    if (!sourceData) {
      return {
        success: false,
        error: `Source Embed ${sourceLocalId} not found`
      };
    }

    // Step 2: Copy metadata to target
    const now = new Date().toISOString();
    const targetData = {
      excerptId: sourceData.excerptId,
      variableValues: sourceData.variableValues || {},
      toggleStates: sourceData.toggleStates || {},
      customInsertions: sourceData.customInsertions || [],
      internalNotes: sourceData.internalNotes || [],
      updatedAt: now,
      lastSynced: sourceData.lastSynced || null,
      syncedContentHash: sourceData.syncedContentHash || null,
      syncedContent: sourceData.syncedContent || null,
      pageId: sourceData.pageId || null,
      pageTitle: sourceData.pageTitle || null, // Preserve pageTitle if available
      // Preserve redline fields if they exist
      redlineStatus: sourceData.redlineStatus || 'reviewable',
      approvedContentHash: sourceData.approvedContentHash || null,
      approvedBy: sourceData.approvedBy || null,
      approvedAt: sourceData.approvedAt || null,
      statusHistory: sourceData.statusHistory || []
    };

    await storage.set(`macro-vars:${targetLocalId}`, targetData);

    // Step 3: Copy cache if it exists
    const sourceCacheKey = `macro-cache:${sourceLocalId}`;
    const sourceCache = await storage.get(sourceCacheKey);
    if (sourceCache) {
      await storage.set(`macro-cache:${targetLocalId}`, sourceCache);
      logPhase('copyDeactivatedEmbedData', 'Copied cached content', { targetLocalId });
    }

    logSuccess('copyDeactivatedEmbedData', 'Successfully copied Embed data', {
      sourceLocalId,
      targetLocalId
    });

    return {
      success: true
    };
  } catch (error) {
    logFailure('copyDeactivatedEmbedData', 'Error copying Embed data', error, {
      sourceLocalId: req.payload?.sourceLocalId,
      targetLocalId: req.payload?.targetLocalId
    });
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get cached rendered content for an Embed instance (view mode)
 * 
 * Standard return format:
 * - Success: { success: true, data: { content: ADF, cachedAt: string } }
 * - Error: { success: false, error: "error message" }
 */
export async function getCachedContent(req) {
  try {
    const { localId } = req.payload || {};

    // Input validation
    if (!localId || typeof localId !== 'string' || localId.trim() === '') {
      logFailure('getCachedContent', 'Validation failed: localId is required and must be a non-empty string', new Error('Invalid localId'));
      return {
        success: false,
        error: 'localId is required and must be a non-empty string'
      };
    }

    const key = `macro-cache:${localId}`;
    const cached = await storage.get(key);

    if (!cached) {
      return { success: false, error: 'No cached content found' };
    }

    return {
      success: true,
      data: {
        content: cached.content,
        cachedAt: cached.cachedAt
      }
    };
  } catch (error) {
    logFailure('getCachedContent', 'Error loading cached content', error, { localId: req.payload?.localId });
    return { success: false, error: error.message };
  }
}

/**
 * Get saved categories
 * 
 * Standard return format:
 * - Success: { success: true, data: { categories: [...] } }
 * - Error: { success: false, error: "error message" }
 */
export async function getCategories() {
  try {
    const data = await storage.get('categories');

    // Return stored categories or default list if not found
    const defaultCategories = ['General', 'Pricing', 'Technical', 'Legal', 'Marketing'];
    const categories = data?.categories || defaultCategories;

    return {
      success: true,
      data: {
        categories
      }
    };
  } catch (error) {
    logFailure('getCategories', 'Error getting categories', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Save categories to storage
 * 
 * Standard return format:
 * - Success: { success: true, data: {} }
 * - Error: { success: false, error: "error message" }
 */
export async function saveCategories(req) {
  try {
    const { categories } = req.payload;

    if (!Array.isArray(categories)) {
      return {
        success: false,
        error: 'Categories must be an array'
      };
    }

    await storage.set('categories', { categories });

    return {
      success: true,
      data: {}
    };
  } catch (error) {
    logFailure('saveCategories', 'Error saving categories', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Check if Embed instance has stale content (update available)
 */
export async function checkVersionStaleness(req) {
  try {
    const { localId, excerptId } = req.payload || {};

    // Input validation
    if (!localId || typeof localId !== 'string' || localId.trim() === '') {
      logFailure('checkVersionStaleness', 'Validation failed: localId is required and must be a non-empty string', new Error('Invalid localId'));
      return {
        success: false,
        error: 'localId is required and must be a non-empty string'
      };
    }

    if (!excerptId || typeof excerptId !== 'string' || excerptId.trim() === '') {
      logFailure('checkVersionStaleness', 'Validation failed: excerptId is required and must be a non-empty string', new Error('Invalid excerptId'));
      return {
        success: false,
        error: 'excerptId is required and must be a non-empty string'
      };
    }

    // Get excerpt's lastModified (updatedAt)
    const excerpt = await storage.get(`excerpt:${excerptId}`);
    if (!excerpt) {
      return { success: false, error: 'Excerpt not found' };
    }

    // Get Embed instance's lastSynced
    const varsKey = `macro-vars:${localId}`;
    const macroVars = await storage.get(varsKey);

    const excerptLastModified = new Date(excerpt.updatedAt);
    const includeLastSynced = macroVars?.lastSynced ? new Date(macroVars.lastSynced) : new Date(0);

    const isStale = excerptLastModified > includeLastSynced;

    return {
      success: true,
      isStale,
      excerptLastModified: excerpt.updatedAt,
      includeLastSynced: macroVars?.lastSynced || null
    };
  } catch (error) {
    logFailure('checkVersionStaleness', 'Error checking version staleness', error, { localId: req.payload?.localId, excerptId: req.payload?.excerptId });
    return { success: false, error: error.message };
  }
}

/**
 * Get check progress data
 */
export async function getCheckProgress(req) {
  try {
    const { progressId } = req.payload || {};

    // Input validation
    if (!progressId || typeof progressId !== 'string' || progressId.trim() === '') {
      logFailure('getCheckProgress', 'Validation failed: progressId is required and must be a non-empty string', new Error('Invalid progressId'));
      return {
        success: false,
        error: 'progressId is required and must be a non-empty string'
      };
    }

    const progress = await storage.get(`progress:${progressId}`);

    if (!progress) {
      return {
        success: false,
        error: 'Progress not found'
      };
    }

    return {
      success: true,
      data: {
        progress
      }
    };
  } catch (error) {
    logFailure('getCheckProgress', 'Error getting progress', error, { progressId: req.payload?.progressId });
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get migration status
 * ⚠️ ONE-TIME USE ONLY - DELETE AFTER PRODUCTION MIGRATION
 * This function reads migration-tracker data written by migration resolvers.
 * Once production migration is complete, this can be safely deleted.
 */
export async function getMigrationStatus() {
  try {
    const tracker = await storage.get('migration-tracker') || { multiExcerpts: [] };

    return {
      success: true,
      migrations: tracker.multiExcerpts
    };
  } catch (error) {
    logFailure('getMigrationStatus', 'Error getting migration status', error);
    return {
      success: false,
      error: error.message,
      migrations: []
    };
  }
}

/**
 * Get MultiExcerpt scan progress
 * ⚠️ ONE-TIME USE ONLY - DELETE AFTER PRODUCTION MIGRATION
 * This function provides progress tracking for scanMultiExcerptIncludes operation.
 * Only used by hidden migration UI (SHOW_MIGRATION_TOOLS flag).
 * Once production migration is complete, this can be safely deleted.
 */
export async function getMultiExcerptScanProgress(req) {
  try {
    const { progressId } = req.payload;
    const progress = await storage.get(`progress:${progressId}`);

    if (!progress) {
      return {
        success: false,
        error: 'Progress not found'
      };
    }

    return {
      success: true,
      progress
    };
  } catch (error) {
    logFailure('getScanProgress', 'Error getting scan progress', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Save cached rendered content for an Embed instance
 */
export async function saveCachedContent(req) {
  try {
    const { localId, renderedContent, syncedContentHash, syncedContent } = req.payload || {};

    // Input validation
    if (!localId || typeof localId !== 'string' || localId.trim() === '') {
      logFailure('saveCachedContent', 'Validation failed: localId is required and must be a non-empty string', new Error('Invalid localId'));
      return {
        success: false,
        error: 'localId is required and must be a non-empty string'
      };
    }

    if (renderedContent === undefined || renderedContent === null) {
      logFailure('saveCachedContent', 'Validation failed: renderedContent is required', new Error('Missing renderedContent'));
      return {
        success: false,
        error: 'renderedContent is required'
      };
    }

    const key = `macro-cache:${localId}`;
    const now = new Date().toISOString();

    await storage.set(key, {
      content: renderedContent,
      cachedAt: now
    });

    // Also update lastSynced, syncedContentHash, and syncedContent in macro-vars
    const varsKey = `macro-vars:${localId}`;
    const existingVars = await storage.get(varsKey) || {};

    // Phase 3: Create version snapshot before modification (v7.17.0)
    if (existingVars && Object.keys(existingVars).length > 0) {
      const versionResult = await saveVersion(
        storage,
        varsKey,
        existingVars,
        {
          changeType: 'UPDATE',
          changedBy: 'saveCachedContent',
          userAccountId: req.context?.accountId,
          localId: localId
        }
      );
      if (versionResult.success) {
        logPhase('saveCachedContent', 'Version snapshot created', { versionId: versionResult.versionId });
      } else if (versionResult.skipped) {
        // Version snapshot skipped (content unchanged) - no logging needed
      } else {
        logFailure('saveCachedContent', 'Version snapshot failed', new Error(versionResult.error));
      }
    }

    existingVars.lastSynced = now;

    // Update syncedContentHash if provided (for Update button in view mode)
    if (syncedContentHash !== undefined) {
      existingVars.syncedContentHash = syncedContentHash;
    }

    // Update syncedContent if provided (for diff view)
    if (syncedContent !== undefined) {
      existingVars.syncedContent = syncedContent;
    }

    await storage.set(varsKey, existingVars);

    return {
      success: true,
      data: {
        cachedAt: now
      }
    };
  } catch (error) {
    logFailure('saveCachedContent', 'Error saving cached content', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get all orphaned usage entries (usage data for excerpts that no longer exist)
 */
export async function getOrphanedUsage() {
  try {
    // Get all storage keys
    const allKeys = await storage.query().where('key', startsWith('usage:')).getMany();

    // Get all existing excerpt IDs
    const excerptIndex = await storage.get('excerpt-index') || { excerpts: [] };
    const existingExcerptIds = new Set(excerptIndex.excerpts.map(e => e.id));

    // Find orphaned usage entries
    const orphanedUsage = [];
    for (const entry of allKeys.results) {
      const excerptId = entry.key.replace('usage:', '');

      // If usage exists but excerpt doesn't, it's orphaned
      if (!existingExcerptIds.has(excerptId)) {
        const usageData = entry.value;
        orphanedUsage.push({
          excerptId,
          excerptName: usageData.excerptName || 'Unknown',
          references: usageData.references || [],
          referenceCount: (usageData.references || []).length
        });
      }
    }

    return {
      success: true,
      data: {
        orphanedUsage
      }
    };
  } catch (error) {
    logFailure('getOrphanedUsage', 'Error getting orphaned usage', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get last verification timestamp
 * Used by auto-verification on Admin page mount to check if data is stale
 */
export async function getLastVerificationTime() {
  try {
    const timestamp = await storage.get('last-verification-time');
    return {
      success: true,
      lastVerificationTime: timestamp || null
    };
  } catch (error) {
    logFailure('getLastVerificationTime', 'Error getting last verification time', error);
    return {
      success: false,
      error: error.message,
      lastVerificationTime: null
    };
  }
}

/**
 * Set last verification timestamp
 * Called after Check All Includes completes to mark data as fresh
 */
export async function setLastVerificationTime(req) {
  const { timestamp } = req.payload;
  try {
    await storage.set('last-verification-time', timestamp);
    return {
      success: true,
      timestamp
    };
  } catch (error) {
    logFailure('setLastVerificationTime', 'Error setting last verification time', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get next scheduled check time
 * Returns the timestamp when the next automatic "Check All Embeds" should run
 * Used by Admin page to determine if check should run automatically
 */
export async function getNextScheduledCheckTime() {
  try {
    const nextScheduledTime = await storage.get('meta:next-scheduled-check-time');
    return {
      success: true,
      data: {
        nextScheduledTime: nextScheduledTime || null
      }
    };
  } catch (error) {
    logFailure('getNextScheduledCheckTime', 'Error getting next scheduled check time', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Set next scheduled check time
 * Sets the timestamp when the next automatic "Check All Embeds" should run
 * Typically set to 10 AM UTC tomorrow after a check completes
 */
export async function setNextScheduledCheckTime(req) {
  const { timestamp } = req.payload || {};
  
  try {
    // Input validation
    if (!timestamp || typeof timestamp !== 'string' || timestamp.trim() === '') {
      logFailure('setNextScheduledCheckTime', 'Validation failed: timestamp is required and must be a non-empty ISO string', new Error('Invalid timestamp'));
      return {
        success: false,
        error: 'timestamp is required and must be a non-empty ISO string'
      };
    }

    // Validate that timestamp is a valid ISO date string
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
      logFailure('setNextScheduledCheckTime', 'Validation failed: timestamp must be a valid ISO date string', new Error('Invalid date'));
      return {
        success: false,
        error: 'timestamp must be a valid ISO date string'
      };
    }

    await storage.set('meta:next-scheduled-check-time', timestamp);
    return {
      success: true,
      data: {}
    };
  } catch (error) {
    logFailure('setNextScheduledCheckTime', 'Error setting next scheduled check time', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get current user's context (accountId, etc.)
 * Used for redline status changes and other user-specific actions
 */
export async function getCurrentUser(req) {
  try {
    // In Forge Custom UI, the user's accountId is available in req.context
    const accountId = req.context?.accountId;

    if (!accountId) {
      logFailure('getCurrentUser', 'No accountId found in context', new Error('No user context available'));
      return {
        success: false,
        error: 'No user context available'
      };
    }

    return {
      success: true,
      accountId
    };
  } catch (error) {
    logFailure('getCurrentUser', 'Error in getCurrentUser', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Query Forge storage by key (debugging tool)
 * Allows direct inspection of storage data for any key
 *
 * @param {Object} req - Request with payload.key
 * @returns {Object} Storage data or error
 */
/**
 * Get the current Forge environment (development or production)
 * This is useful for distinguishing between environments in the UI
 */
export async function getForgeEnvironment(req) {
  try {
    // Check process.env first (available in deployed environments)
    const envFromProcess = typeof process !== 'undefined' && process.env?.FORGE_ENV;
    
    // Also check installContext which contains environment info
    const installContext = req.context?.installContext;
    
    // In Forge, when using tunnel, the environment might not be set
    // We can detect tunnel by checking if we're in a local development context
    // For now, return 'development' if FORGE_ENV is 'development', otherwise 'production'
    const environment = envFromProcess === 'development' ? 'development' : 'production';
    
    return {
      success: true,
      environment,
      installContext: installContext || null,
      envFromProcess: envFromProcess || null,
      debug: {
        hasProcessEnv: typeof process !== 'undefined',
        processEnvKeys: typeof process !== 'undefined' && process.env ? Object.keys(process.env).filter(k => k.includes('FORGE') || k.includes('ENV')) : []
      }
    };
  } catch (error) {
    logFailure('getForgeEnvironment', 'Error getting Forge environment', error);
    // Default to production for safety
    return {
      success: true,
      environment: 'production',
      installContext: null,
      error: error.message
    };
  }
}

/**
 * Get the stored Admin page URL
 * Returns the URL stored when the admin page first loads
 * 
 * Standard return format:
 * - Success: { success: true, data: { adminUrl: string | null } }
 * - Error: { success: false, error: "error message" }
 */
export async function getAdminUrl() {
  try {
    const adminUrl = await storage.get('app-config:adminUrl');
    return {
      success: true,
      data: {
        adminUrl: adminUrl || null
      }
    };
  } catch (error) {
    logFailure('getAdminUrl', 'Error getting admin URL', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Store the Admin page URL
 * Called by the admin page when it first loads to store its URL
 * 
 * Standard return format:
 * - Success: { success: true, data: {} }
 * - Error: { success: false, error: "error message" }
 */
export async function setAdminUrl(req) {
  try {
    const { adminUrl } = req.payload;
    if (!adminUrl) {
      return {
        success: false,
        error: 'adminUrl is required'
      };
    }
    await storage.set('app-config:adminUrl', adminUrl);
    return {
      success: true,
      data: {}
    };
  } catch (error) {
    logFailure('setAdminUrl', 'Error setting admin URL', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Query Forge storage by key (debugging tool)
 * 
 * Standard return format:
 * - Success: { success: true, data: { exists: boolean, key: string, data: any, dataType: string, dataSize: number, message?: string } }
 * - Error: { success: false, error: "error message" }
 */
export async function queryStorage(req) {
  const { key } = req.payload || {};
  const extractedKey = key; // Extract for use in catch block
  
  try {

    if (!key) {
      return {
        success: false,
        error: 'No key provided'
      };
    }

    const data = await storage.get(key);

    if (data === null || data === undefined) {
      return {
        success: true,
        data: {
          exists: false,
          key,
          data: null,
          dataType: 'null',
          dataSize: 0,
          message: `No data found for key: ${key}`
        }
      };
    }

    return {
      success: true,
      data: {
        exists: true,
        key,
        data,
        dataType: typeof data,
        dataSize: JSON.stringify(data).length
      }
    };
  } catch (error) {
    logFailure('queryStorage', 'Error', error, { key: extractedKey });
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Query multiple storage keys by prefix with optional field filtering
 * 
 * Standard return format:
 * - Success: { success: true, data: { results: Array, count: number } }
 * - Error: { success: false, error: "error message" }
 * 
 * @param {Object} req.payload
 * @param {string} req.payload.prefix - Storage key prefix (e.g., 'excerpt:', 'macro-vars:')
 * @param {string} req.payload.filterField - Optional field path to filter by (e.g., 'name')
 * @param {string} req.payload.filterValue - Optional filter value (contains match, case-insensitive)
 */
export async function queryStorageMultiple(req) {
  const { prefix, filterField, filterValue } = req.payload || {};
  const extractedPrefix = prefix; // Extract for use in catch block
  const extractedFilterField = filterField; // Extract for use in catch block
  const extractedFilterValue = filterValue; // Extract for use in catch block
  
  try {

    if (!prefix) {
      return {
        success: false,
        error: 'Prefix is required'
      };
    }

    // Query all keys matching the prefix with pagination
    // Forge storage query has a default limit, so we need to paginate through all results
    const allEntries = [];
    let cursor = undefined;

    do {
      const batch = await storage.query()
        .where('key', startsWith(extractedPrefix))
        .limit(100)
        .cursor(cursor)
        .getMany();

      allEntries.push(...(batch.results || []));
      cursor = batch.nextCursor;
    } while (cursor);

    let results = allEntries.map(entry => ({
      key: entry.key,
      value: entry.value,
      dataType: typeof entry.value,
      dataSize: JSON.stringify(entry.value).length
    }));

    // Apply field filter if provided
    if (extractedFilterField && extractedFilterValue) {
      results = results.filter(entry => {
        const value = entry.value;
        if (!value || typeof value !== 'object') {
          return false;
        }

        // Support nested field paths (e.g., 'metadata.name')
        const fieldParts = extractedFilterField.split('.');
        let fieldValue = value;
        for (const part of fieldParts) {
          if (fieldValue && typeof fieldValue === 'object' && part in fieldValue) {
            fieldValue = fieldValue[part];
          } else {
            return false;
          }
        }

        // Case-insensitive contains match
        if (typeof fieldValue === 'string') {
          return fieldValue.toLowerCase().includes(extractedFilterValue.toLowerCase());
        }
        return false;
      });
    }

    return {
      success: true,
      data: {
        results,
        count: results.length
      }
    };
  } catch (error) {
    logFailure('queryStorageMultiple', 'Error', error, { prefix: extractedPrefix, filterField: extractedFilterField, filterValue: extractedFilterValue });
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Bulk update multiple storage entries with validation
 * 
 * @param {Object} req.payload
 * @param {Array<{key: string, value: Object}>} req.payload.updates - Array of key-value pairs to update
 * @returns {Object} { success: boolean, updated: number, failed: number, errors: Array }
 */
export async function bulkUpdateStorage(req) {
  try {
    const { updates } = req.payload;

    if (!Array.isArray(updates) || updates.length === 0) {
      return {
        success: false,
        error: 'Updates array is required and must not be empty',
        updated: 0,
        failed: 0,
        errors: []
      };
    }

    logFunction('bulkUpdateStorage', 'START', { updateCount: updates.length });

    const results = {
      updated: 0,
      failed: 0,
      errors: []
    };

    // Track original excerpt names for index updates
    const excerptNameChanges = new Map();

    // Process each update
    for (const { key, value } of updates) {
      try {
        if (!key || !value) {
          results.failed++;
          results.errors.push({
            key: key || 'unknown',
            error: 'Missing key or value'
          });
          continue;
        }

        // Determine if this is an excerpt that needs validation
        const isExcerpt = key.startsWith('excerpt:');
        
        if (isExcerpt) {
          // Get original excerpt to check if name changed
          const originalExcerpt = await storage.get(key);
          if (originalExcerpt && originalExcerpt.name !== value.name) {
            excerptNameChanges.set(key, {
              original: originalExcerpt,
              updated: value
            });
          }

          // Recalculate contentHash if content or other hashable fields changed
          // This ensures contentHash is always correct after JSON editing
          if (value.content !== undefined || value.name !== undefined || 
              value.category !== undefined || value.variables !== undefined || 
              value.toggles !== undefined || value.documentationLinks !== undefined) {
            value.contentHash = calculateContentHash(value);
            // Update timestamp to reflect modification
            if (value.metadata) {
              value.metadata.updatedAt = new Date().toISOString();
            } else {
              value.metadata = {
                ...(originalExcerpt?.metadata || {}),
                updatedAt: new Date().toISOString()
              };
            }
          }

          // Validate excerpt data
          const validation = validateExcerptData(value);
          if (!validation.valid) {
            results.failed++;
            results.errors.push({
              key,
              error: `Validation failed: ${validation.errors.join(', ')}`
            });
            continue;
          }

          // Use safeStorageSet for excerpts
          await safeStorageSet(storage, key, value, validateExcerptData);
        } else {
          // For non-excerpts, save directly (no validation)
          await storage.set(key, value);
        }

        results.updated++;
      } catch (error) {
        logFailure('bulkUpdateStorage', 'Error updating entry', error, { key });
        results.failed++;
        results.errors.push({
          key,
          error: error.message
        });
      }
    }

    // Update excerpt-index for any name changes
    for (const [key, { updated }] of excerptNameChanges) {
      try {
        await updateExcerptIndex(updated);
      } catch (error) {
        logFailure('bulkUpdateStorage', 'Error updating index', error, { key });
        // Don't fail the whole operation if index update fails
      }
    }

    logSuccess('bulkUpdateStorage', 'Completed', { updated: results.updated, failed: results.failed });

    return {
      success: results.failed === 0,
      updated: results.updated,
      failed: results.failed,
      errors: results.errors
    };
  } catch (error) {
    logFailure('bulkUpdateStorage', 'Error', error);
    return {
      success: false,
      error: error.message,
      updated: 0,
      failed: 0,
      errors: []
    };
  }
}
