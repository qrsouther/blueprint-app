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

/**
 * Detect variables from content (for UI to call)
 */
export async function detectVariablesFromContent(req) {
  try {
    const { content } = req.payload;
    const variables = detectVariables(content);
    return {
      success: true,
      variables
    };
  } catch (error) {
    console.error('Error detecting variables:', error);
    return {
      success: false,
      error: error.message,
      variables: []
    };
  }
}

/**
 * Detect toggles from content (for UI to call)
 */
export async function detectTogglesFromContent(req) {
  try {
    const { content } = req.payload;
    const toggles = detectToggles(content);
    return {
      success: true,
      toggles
    };
  } catch (error) {
    console.error('Error detecting toggles:', error);
    return {
      success: false,
      error: error.message,
      toggles: []
    };
  }
}

/**
 * Get all excerpts from index
 */
export async function getExcerpts() {
  try {
    const index = await storage.get('excerpt-index') || { excerpts: [] };
    return {
      success: true,
      excerpts: index.excerpts
    };
  } catch (error) {
    console.error('Error getting excerpts:', error);
    return {
      success: false,
      error: error.message,
      excerpts: []
    };
  }
}

/**
 * Get specific excerpt by ID
 */
export async function getExcerpt(req) {
  try {
    const excerptId = req.payload.excerptId;
    const excerpt = await storage.get(`excerpt:${excerptId}`);

    // DEBUG: Log what we're returning
    console.log('[getExcerpt] Returning excerpt:', {
      id: excerpt?.id,
      name: excerpt?.name,
      hasDocumentationLinks: !!excerpt?.documentationLinks,
      documentationLinksCount: excerpt?.documentationLinks?.length || 0,
      documentationLinks: excerpt?.documentationLinks
    });

    return {
      success: true,
      excerpt: excerpt
    };
  } catch (error) {
    console.error('Error getting excerpt:', error);
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
    console.error('Error in debugExcerpt:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get page title by content ID
 */
export async function getPageTitle(req) {
  try {
    const contentId = req.payload.contentId;

    const response = await api.asApp().requestConfluence(route`/wiki/api/v2/pages/${contentId}`);
    const data = await response.json();

    return {
      success: true,
      title: data.title
    };
  } catch (error) {
    console.error('Error getting page title:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get variable values and toggle states for a specific macro instance
 */
export async function getVariableValues(req) {
  try {
    const { localId } = req.payload;
    const key = `macro-vars:${localId}`;
    const data = await storage.get(key) || {};

    return {
      success: true,
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
    };
  } catch (error) {
    console.error('Error getting variable values:', error);
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
    const { pageId, excerptId, currentLocalId } = req.payload;
    
    console.log('[recoverOrphanedData] Starting recovery', { pageId, excerptId, currentLocalId });

    // Query all macro-vars entries
    const allEntries = await storage.query()
      .where('key', startsWith('macro-vars:'))
      .getMany();

    // Find candidates: entries on the same page (pageId is required for recovery)
    // If excerptId is provided, also match by excerptId for more precise recovery
    const now = new Date();
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

      // Check if recently synced or updated (within last 30 minutes - more generous window)
      // Use updatedAt as fallback if lastSynced is missing
      const timestamp = data.lastSynced || data.updatedAt;
      if (timestamp) {
        const timestampTime = new Date(timestamp);
        const ageInSeconds = (now - timestampTime) / 1000;

        // Extended window to 30 minutes to catch cases where auto-save hasn't completed yet
        // or where user drags macro shortly after making changes
        if (ageInSeconds < 1800) { // 30 minutes
          candidates.push({
            localId: entryLocalId,
            data: data,
            ageInSeconds: ageInSeconds,
            updatedAt: data.updatedAt || data.lastSynced // Use updatedAt for tiebreaker
          });
        }
      } else if (data.updatedAt) {
        // Fallback: if no lastSynced, use updatedAt (for older entries)
        const updatedTime = new Date(data.updatedAt);
        const ageInSeconds = (now - updatedTime) / 1000;
        
        if (ageInSeconds < 1800) { // 30 minutes
          candidates.push({
            localId: entryLocalId,
            data: data,
            ageInSeconds: ageInSeconds,
            updatedAt: data.updatedAt
          });
        }
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

      console.log('[recoverOrphanedData] Recovery successful', {
        migratedFrom: orphanedEntry.localId,
        excerptId: orphanedEntry.data.excerptId,
        candidateCount: candidates.length
      });
      
      return {
        success: true,
        recovered: true,
        data: orphanedEntry.data,
        migratedFrom: orphanedEntry.localId,
        candidateCount: candidates.length
      };
    } else {
      console.log('[recoverOrphanedData] No candidates found', {
        pageId,
        excerptId,
        reason: 'no_candidates'
      });
      return {
        success: true,
        recovered: false,
        reason: 'no_candidates'
      };
    }
  } catch (error) {
    console.error('Error recovering orphaned data:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get cached rendered content for an Embed instance (view mode)
 */
export async function getCachedContent(req) {
  try {
    const { localId } = req.payload;

    const key = `macro-cache:${localId}`;
    const cached = await storage.get(key);

    if (!cached) {
      return { success: false, error: 'No cached content found' };
    }

    return {
      success: true,
      content: cached.content,
      cachedAt: cached.cachedAt
    };
  } catch (error) {
    console.error('Error loading cached content:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get saved categories
 */
export async function getCategories() {
  try {
    const data = await storage.get('categories');

    // Return stored categories or default list if not found
    const defaultCategories = ['General', 'Pricing', 'Technical', 'Legal', 'Marketing'];
    const categories = data?.categories || defaultCategories;

    return {
      success: true,
      categories
    };
  } catch (error) {
    console.error('Error getting categories:', error);
    return {
      success: false,
      error: error.message,
      categories: ['General', 'Pricing', 'Technical', 'Legal', 'Marketing']
    };
  }
}

/**
 * Save categories to storage
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
      success: true
    };
  } catch (error) {
    console.error('Error saving categories:', error);
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
    const { localId, excerptId } = req.payload;

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
    console.error('Error checking version staleness:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get check progress data
 */
export async function getCheckProgress(req) {
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
    console.error('Error getting progress:', error);
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
    console.error('Error getting migration status:', error);
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
    console.error('Error getting scan progress:', error);
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
    const { localId, renderedContent, syncedContentHash, syncedContent } = req.payload;

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
        console.log('[saveCachedContent] ✅ Version snapshot created:', versionResult.versionId);
      } else if (versionResult.skipped) {
        console.log('[saveCachedContent] ⏭️  Version snapshot skipped (content unchanged)');
      } else {
        console.warn('[saveCachedContent] ⚠️  Version snapshot failed:', versionResult.error);
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

    return { success: true, cachedAt: now };
  } catch (error) {
    console.error('Error saving cached content:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get all orphaned usage entries (usage data for excerpts that no longer exist)
 */
export async function getOrphanedUsage(req) {
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
      orphanedUsage
    };
  } catch (error) {
    console.error('Error getting orphaned usage:', error);
    return {
      success: false,
      error: error.message,
      orphanedUsage: []
    };
  }
}

/**
 * Get last verification timestamp
 * Used by auto-verification on Admin page mount to check if data is stale
 */
export async function getLastVerificationTime(req) {
  try {
    const timestamp = await storage.get('last-verification-time');
    return {
      success: true,
      lastVerificationTime: timestamp || null
    };
  } catch (error) {
    console.error('Error getting last verification time:', error);
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
    console.error('Error setting last verification time:', error);
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
      console.warn('[getCurrentUser] No accountId found in context');
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
    console.error('[getCurrentUser] Error:', error);
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
    
    // Log what we're detecting for debugging
    console.log('[getForgeEnvironment] process.env.FORGE_ENV:', envFromProcess);
    console.log('[getForgeEnvironment] installContext:', installContext);
    
    // In Forge, when using tunnel, the environment might not be set
    // We can detect tunnel by checking if we're in a local development context
    // For now, return 'development' if FORGE_ENV is 'development', otherwise 'production'
    const environment = envFromProcess === 'development' ? 'development' : 'production';
    
    console.log('[getForgeEnvironment] Determined environment:', environment);
    
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
    console.error('Error getting Forge environment:', error);
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
 */
export async function getAdminUrl(req) {
  try {
    const adminUrl = await storage.get('app-config:adminUrl');
    return {
      success: true,
      adminUrl: adminUrl || null
    };
  } catch (error) {
    console.error('Error getting admin URL:', error);
    return {
      success: false,
      error: error.message,
      adminUrl: null
    };
  }
}

/**
 * Store the Admin page URL
 * Called by the admin page when it first loads to store its URL
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
      success: true
    };
  } catch (error) {
    console.error('Error setting admin URL:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

export async function queryStorage(req) {
  try {
    const { key } = req.payload;

    if (!key) {
      return {
        success: false,
        error: 'No key provided'
      };
    }

    console.log(`[queryStorage] Querying key: ${key}`);

    const data = await storage.get(key);

    if (data === null || data === undefined) {
      return {
        success: true,
        exists: false,
        key,
        data: null,
        message: `No data found for key: ${key}`
      };
    }

    return {
      success: true,
      exists: true,
      key,
      data,
      dataType: typeof data,
      dataSize: JSON.stringify(data).length
    };
  } catch (error) {
    console.error('[queryStorage] Error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Query multiple storage keys by prefix with optional field filtering
 * 
 * @param {Object} req.payload
 * @param {string} req.payload.prefix - Storage key prefix (e.g., 'excerpt:', 'macro-vars:')
 * @param {string} req.payload.filterField - Optional field path to filter by (e.g., 'name')
 * @param {string} req.payload.filterValue - Optional filter value (contains match, case-insensitive)
 * @returns {Object} { success: boolean, results: Array, count: number, error?: string }
 */
export async function queryStorageMultiple(req) {
  try {
    const { prefix, filterField, filterValue } = req.payload;

    if (!prefix) {
      return {
        success: false,
        error: 'Prefix is required'
      };
    }

    console.log(`[queryStorageMultiple] Querying prefix: ${prefix}, filter: ${filterField} contains "${filterValue}"`);

    // Query all keys matching the prefix with pagination
    // Forge storage query has a default limit, so we need to paginate through all results
    const allEntries = [];
    let cursor = undefined;

    do {
      const batch = await storage.query()
        .where('key', startsWith(prefix))
        .limit(100)
        .cursor(cursor)
        .getMany();

      allEntries.push(...(batch.results || []));
      cursor = batch.nextCursor;
    } while (cursor);

    console.log(`[queryStorageMultiple] Fetched ${allEntries.length} total entries from storage`);

    let results = allEntries.map(entry => ({
      key: entry.key,
      value: entry.value,
      dataType: typeof entry.value,
      dataSize: JSON.stringify(entry.value).length
    }));

    // Apply field filter if provided
    if (filterField && filterValue) {
      results = results.filter(entry => {
        const value = entry.value;
        if (!value || typeof value !== 'object') {
          return false;
        }

        // Support nested field paths (e.g., 'metadata.name')
        const fieldParts = filterField.split('.');
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
          return fieldValue.toLowerCase().includes(filterValue.toLowerCase());
        }
        return false;
      });
    }

    console.log(`[queryStorageMultiple] Found ${results.length} matching entries after filtering`);

    return {
      success: true,
      results,
      count: results.length
    };
  } catch (error) {
    console.error('[queryStorageMultiple] Error:', error);
    return {
      success: false,
      error: error.message,
      results: [],
      count: 0
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

    console.log(`[bulkUpdateStorage] Starting bulk update of ${updates.length} entries`);

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
            console.log(`[bulkUpdateStorage] Recalculated contentHash for ${key}: ${value.contentHash.substring(0, 16)}...`);
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
        console.error(`[bulkUpdateStorage] Error updating ${key}:`, error);
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
        console.log(`[bulkUpdateStorage] Updated excerpt-index for ${key}`);
      } catch (error) {
        console.error(`[bulkUpdateStorage] Error updating index for ${key}:`, error);
        // Don't fail the whole operation if index update fails
      }
    }

    console.log(`[bulkUpdateStorage] Completed: ${results.updated} updated, ${results.failed} failed`);

    return {
      success: results.failed === 0,
      updated: results.updated,
      failed: results.failed,
      errors: results.errors
    };
  } catch (error) {
    console.error('[bulkUpdateStorage] Error:', error);
    return {
      success: false,
      error: error.message,
      updated: 0,
      failed: 0,
      errors: []
    };
  }
}
