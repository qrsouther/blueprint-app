/**
 * Embed Instance Configuration Resolver Functions
 *
 * This module contains operations for managing Embed macro instances.
 * Each Embed instance has its own configuration (variable values, toggle states,
 * custom insertions) that's stored separately from the source excerpt.
 *
 * Think of this like individual reader preferences for the same book chapter:
 * the chapter (excerpt) is the same, but each reader (Embed instance) can
 * have their own bookmarks, highlights, and notes.
 *
 * Extracted during Phase 7 of index.js modularization.
 *
 * Functions:
 * - saveVariableValues: Save Embed instance configuration
 */

import { storage } from '@forge/api';
import api, { route } from '@forge/api';
import { findHeadingBeforeMacro } from '../utils/adf-utils.js';
import { listVersions, saveVersion } from '../utils/version-manager.js';
import {
  cleanAdfForRenderer,
  filterContentByToggles,
  substituteVariablesInAdf,
  insertCustomParagraphsInAdf,
  insertInternalNotesInAdf
} from '../utils/adf-rendering-utils.js';
import { logPhase, logSuccess, logWarning, logFailure } from '../utils/forge-logger.js';
import { createErrorResponse, ERROR_CODES } from '../utils/error-codes.js';

/**
 * Save variable values, toggle states, and custom insertions for a specific Include instance
 * Also updates usage tracking to keep it synchronized
 */
export async function saveVariableValues(req) {
  const functionStartTime = Date.now();
  try {
    const { localId, excerptId, variableValues, toggleStates, customInsertions, internalNotes, pageId: explicitPageId } = req.payload;
    
    // Input validation
    if (!localId || typeof localId !== 'string' || localId.trim() === '') {
      logFailure('saveVariableValues', 'Validation failed: localId is required and must be a non-empty string', new Error('Invalid localId'));
      return createErrorResponse(
        ERROR_CODES.VALIDATION_REQUIRED,
        'localId is required and must be a non-empty string',
        { field: 'localId' }
      );
    }

    if (!excerptId || typeof excerptId !== 'string' || excerptId.trim() === '') {
      logFailure('saveVariableValues', 'Validation failed: excerptId is required and must be a non-empty string', new Error('Invalid excerptId'));
      return createErrorResponse(
        ERROR_CODES.VALIDATION_REQUIRED,
        'excerptId is required and must be a non-empty string',
        { field: 'excerptId' }
      );
    }

    // Validate optional fields if provided
    if (variableValues !== undefined && (typeof variableValues !== 'object' || Array.isArray(variableValues) || variableValues === null)) {
      logFailure('saveVariableValues', 'Validation failed: variableValues must be an object', new Error('Invalid variableValues type'));
      return createErrorResponse(
        ERROR_CODES.VALIDATION_INVALID_TYPE,
        'variableValues must be an object',
        { field: 'variableValues' }
      );
    }

    if (toggleStates !== undefined && (typeof toggleStates !== 'object' || Array.isArray(toggleStates) || toggleStates === null)) {
      logFailure('saveVariableValues', 'Validation failed: toggleStates must be an object', new Error('Invalid toggleStates type'));
      return createErrorResponse(
        ERROR_CODES.VALIDATION_INVALID_TYPE,
        'toggleStates must be an object',
        { field: 'toggleStates' }
      );
    }

    if (customInsertions !== undefined && !Array.isArray(customInsertions)) {
      logFailure('saveVariableValues', 'Validation failed: customInsertions must be an array', new Error('Invalid customInsertions type'));
      return createErrorResponse(
        ERROR_CODES.VALIDATION_INVALID_TYPE,
        'customInsertions must be an array',
        { field: 'customInsertions' }
      );
    }

    if (internalNotes !== undefined && !Array.isArray(internalNotes)) {
      logFailure('saveVariableValues', 'Validation failed: internalNotes must be an array', new Error('Invalid internalNotes type'));
      return createErrorResponse(
        ERROR_CODES.VALIDATION_INVALID_TYPE,
        'internalNotes must be an array',
        { field: 'internalNotes' }
      );
    }
    
    const key = `macro-vars:${localId}`;
    const now = new Date().toISOString();

    // Check if this embed was soft-deleted - if so, don't recreate it
    const deletedEntry = await storage.get(`macro-vars-deleted:${localId}`);
    if (deletedEntry) {
      logWarning('saveVariableValues', 'Attempted to save variables for soft-deleted embed', { localId, excerptId });
      return createErrorResponse(
        ERROR_CODES.OPERATION_NOT_ALLOWED,
        'This embed has been soft-deleted and cannot be modified. Please recover it first if needed.',
        { localId }
      );
    }

    // OPTIMIZATION: Load excerpt and existing config in parallel (they're independent)
    const [excerpt, existingConfig] = await Promise.all([
      storage.get(`excerpt:${excerptId}`),
      storage.get(key)
    ]);
    
    const syncedContentHash = excerpt?.contentHash || null;
    const syncedContent = excerpt?.content || null;  // Store actual Source ADF for diff view

    // CRITICAL: Create version snapshot BEFORE modifying data
    // This captures the OLD state before the save, so restore can bring back the previous state
    if (existingConfig && Object.keys(existingConfig).length > 0) {
      const versionResult = await saveVersion(
        storage,
        key,
        existingConfig, // OLD state before modification
        {
          changeType: 'UPDATE',
          changedBy: 'saveVariableValues',
          userAccountId: req.context?.accountId,
          localId: localId
        }
      );
      if (versionResult.success) {
        logPhase('saveVariableValues', 'Version snapshot created', { versionId: versionResult.versionId, localId });
      } else if (versionResult.skipped) {
        logPhase('saveVariableValues', 'Version snapshot skipped (content unchanged)', { localId });
      } else {
        logWarning('saveVariableValues', 'Version snapshot failed', { localId, error: versionResult.error });
      }
    }

    // Initialize redline fields for new Embeds
    const redlineStatus = existingConfig?.redlineStatus || 'reviewable';
    const approvedContentHash = existingConfig?.approvedContentHash || null;
    const approvedBy = existingConfig?.approvedBy || null;
    const approvedAt = existingConfig?.approvedAt || null;
    const statusHistory = existingConfig?.statusHistory || [];
    
    // Preserve existing pageTitle if available (will be updated async if page context is available)
    const existingPageTitle = existingConfig?.pageTitle || null;

    // Build the new config object
    // CRITICAL: Preserve publish metadata from existing config (chapterId, publishedAt, etc.)
    const newConfig = {
      excerptId,
      variableValues,
      toggleStates: toggleStates || {},
      customInsertions: customInsertions || [],
      internalNotes: internalNotes || [],
      updatedAt: now,
      lastSynced: now,  // Track when this Include instance last synced with Source
      syncedContentHash,  // Store hash of the content at sync time for staleness detection
      syncedContent,  // Store Source ADF at sync time for diff comparison

      // Redline fields (initialized on first save, preserved on updates)
      redlineStatus,
      approvedContentHash,
      approvedBy,
      approvedAt,
      statusHistory,
      pageId: explicitPageId || req.context?.extension?.content?.id,  // Store for redline queue
      pageTitle: existingPageTitle,  // Preserve existing, will be updated async if available
      
      // Preserve publish metadata from existing config (added by publishChapter)
      chapterId: existingConfig?.chapterId,
      publishedAt: existingConfig?.publishedAt,
      publishedContentHash: existingConfig?.publishedContentHash,
      publishedVersion: existingConfig?.publishedVersion
    };

    await storage.set(key, newConfig);
    logSuccess('saveVariableValues', `Config saved for ${localId}`);

    // AUTO-TRANSITION LOGIC: Check if approved Embed content has changed
    // OPTIMIZATION: Run asynchronously in background to avoid blocking the save response
    // This status transition is not critical for the save to complete
    if (existingConfig && existingConfig.redlineStatus === 'approved' && existingConfig.approvedContentHash) {
      const autoTransitionPromise = (async () => {
        try {
          // Query version system for latest contentHash
          const versionsResult = await listVersions(storage, localId);

          if (versionsResult.success && versionsResult.versions.length > 0) {
            const latestVersion = versionsResult.versions[0];
            const currentContentHash = latestVersion.contentHash;

            // Compare with approved contentHash
            if (currentContentHash !== existingConfig.approvedContentHash) {
              logPhase('saveVariableValues', 'AUTO-TRANSITION: Embed content changed after approval (async)', {
                localId,
                previousHash: existingConfig.approvedContentHash,
                currentHash: currentContentHash
              });

              // Auto-transition status to "needs-revision"
              const updatedStatusHistory = existingConfig.statusHistory || [];
              updatedStatusHistory.push({
                status: 'needs-revision',
                previousStatus: 'approved',
                changedBy: 'system',
                changedAt: new Date().toISOString(),
                reason: 'Content modified after approval (auto-transition)'
              });

              // Update redline fields
              const updatedConfig = { ...newConfig };
              updatedConfig.redlineStatus = 'needs-revision';
              updatedConfig.statusHistory = updatedStatusHistory;

              // Save updated config with new status
              await storage.set(key, updatedConfig);
              
              logSuccess('saveVariableValues', `Auto-transitioned Embed ${localId}: approved → needs-revision (async)`);
            }
          }
        } catch (autoTransitionError) {
          logFailure('saveVariableValues', 'Error in auto-transition logic (async)', autoTransitionError, { localId });
        }
      })();
      
      // Don't await - let auto-transition run in the background
      autoTransitionPromise.catch(error => {
        logFailure('saveVariableValues', 'Unhandled error in async auto-transition', error, { localId });
      });
    }

    // Also update usage tracking with the latest toggle states
    // This ensures toggle states are always current in the usage data
    // OPTIMIZATION: Run usage tracking asynchronously in the background to avoid blocking the save
    // This significantly improves auto-save performance (removes ~500-1500ms Confluence API call latency)
    const usageTrackingPromise = (async () => {
      try {
        // Get page context - use explicit pageId if provided (from Admin page), otherwise use context
        const pageId = explicitPageId || req.context?.extension?.content?.id;
        const spaceKey = req.context?.extension?.space?.key || 'Unknown Space';

        if (pageId && excerptId && localId) {
          // Fetch page title
          let pageTitle = 'Unknown Page';
          let headingAnchor = null;

          try {
            const response = await api.asApp().requestConfluence(route`/wiki/api/v2/pages/${pageId}?body-format=atlas_doc_format`);
            const pageData = await response.json();
            
            pageTitle = pageData.title || 'Unknown Page';

            // Parse the ADF to find the heading above this Include macro
            if (pageData.body?.atlas_doc_format?.value) {
              const adfContent = JSON.parse(pageData.body.atlas_doc_format.value);
              const headingText = findHeadingBeforeMacro(adfContent, localId);
              // Format heading for Confluence URL anchor (spaces → hyphens)
              if (headingText) {
                headingAnchor = headingText.replace(/\s+/g, '-');
              }
            }
          } catch (apiError) {
            logFailure('saveVariableValues', 'Error fetching page data (async)', apiError, { localId, pageId });
            pageTitle = req.context?.extension?.content?.title || 'Unknown Page';
          }

          // Update usage data
          const usageKey = `usage:${excerptId}`;
          const usageData = await storage.get(usageKey) || { excerptId, references: [] };

          const existingIndex = usageData.references.findIndex(r => r.localId === localId);

          const reference = {
            localId,
            pageId,
            pageTitle,
            spaceKey,
            headingAnchor,
            toggleStates: toggleStates || {},
            variableValues: variableValues || {},
            updatedAt: new Date().toISOString()
          };

          if (existingIndex >= 0) {
            usageData.references[existingIndex] = reference;
          } else {
            usageData.references.push(reference);
          }

          await storage.set(usageKey, usageData);
          logSuccess('saveVariableValues', `Usage tracking updated for ${localId} (async)`);
          
          // Also update pageTitle in embed config if it changed
          // This ensures pageTitle is always current in the embed config
          if (pageTitle && pageTitle !== 'Unknown Page') {
            try {
              const currentConfig = await storage.get(key);
              if (currentConfig) {
                // Only update if pageTitle changed (avoid unnecessary writes)
                if (currentConfig.pageTitle !== pageTitle) {
                  currentConfig.pageTitle = pageTitle;
                  await storage.set(key, currentConfig);
                  logPhase('saveVariableValues', 'Updated pageTitle in embed config', { localId, pageTitle });
                }
              }
            } catch (configUpdateError) {
              // Don't fail if config update fails - it's not critical
              logWarning('saveVariableValues', 'Failed to update pageTitle in embed config (async)', { 
                localId, 
                pageTitle, 
                error: configUpdateError.message 
              });
            }
          }
        }
      } catch (trackingError) {
        // Don't fail the save if tracking fails
        logFailure('saveVariableValues', 'Error updating usage tracking (async)', trackingError, { localId, excerptId });
      }
    })();
    
    // Don't await - let it run in the background
    // Fire and forget, but log if it fails
    usageTrackingPromise.catch(error => {
      logFailure('saveVariableValues', 'Unhandled error in async usage tracking', error, { localId, excerptId });
    });

    // Generate and cache rendered content server-side
    // OPTIMIZATION: Run cache generation asynchronously in the background to avoid blocking the save
    // The config is already saved, so cache generation can happen after the response is sent
    const cacheGenerationPromise = (async () => {
      const cacheGenerationStartTime = Date.now();
      try {
        if (excerpt && excerpt.content) {
        let previewContent = excerpt.content;
        const isAdf = previewContent && typeof previewContent === 'object' && previewContent.type === 'doc';

        if (isAdf) {
          // Process ADF content: Match Edit Mode processing order for consistency
          // CRITICAL: Insert custom paragraphs BEFORE toggle filtering so paragraph indices match
          // The insertion logic needs to work on the original structure (with toggle markers) 
          // so it knows where toggle boundaries are. Then toggle filtering will preserve 
          // the insertion if the toggle is enabled.
          try {
            previewContent = substituteVariablesInAdf(previewContent, variableValues || {});
            previewContent = insertCustomParagraphsInAdf(previewContent, customInsertions || []);
            previewContent = insertInternalNotesInAdf(previewContent, internalNotes || []);
            // Then filter toggles (this will preserve insertions inside enabled toggles)
            previewContent = filterContentByToggles(previewContent, toggleStates || {});
            previewContent = cleanAdfForRenderer(previewContent);
          } catch (processingError) {
            logFailure('saveVariableValues', 'Error during ADF processing', processingError, {
              localId,
              step: 'ADF processing',
              hasVariableValues: !!variableValues,
              variableCount: variableValues ? Object.keys(variableValues).length : 0
            });
            // Don't re-throw - allow save to continue even if cache generation fails
            // The config will still be saved, just without cached content
            previewContent = excerpt.content; // Use original content as fallback
          }
        } else {
          // For plain text, filter toggles first
          const toggleRegex = /\{\{toggle:([^}]+)\}\}([\s\S]*?)\{\{\/toggle:\1\}\}/g;
          previewContent = previewContent.replace(toggleRegex, (match, toggleName, content) => {
            const trimmedName = toggleName.trim();
            return (toggleStates || {})[trimmedName] === true ? content : '';
          });

          // Strip any remaining markers
          previewContent = previewContent.replace(/\{\{toggle:[^}]+\}\}/g, '');
          previewContent = previewContent.replace(/\{\{\/toggle:[^}]+\}\}/g, '');

          // Then substitute variables
          const escapeRegex = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          if (excerpt.variables) {
            excerpt.variables.forEach(variable => {
              const value = (variableValues || {})[variable.name] || `{{${variable.name}}}`;
              const regex = new RegExp(`\\{\\{${escapeRegex(variable.name)}\\}\\}`, 'g');
              previewContent = previewContent.replace(regex, value);
            });
          }
        }

        // Save cached content
        const cacheKey = `macro-cache:${localId}`;
        await storage.set(cacheKey, {
          content: previewContent,
          cachedAt: now
        });
        const totalCacheGenerationDuration = Date.now() - cacheGenerationStartTime;
        logSuccess('saveVariableValues', `Cached content saved for ${localId} (async)`, { 
          duration: `${totalCacheGenerationDuration}ms`
        });
      } else {
        logWarning('saveVariableValues', `No excerpt content to cache for ${localId}`);
      }

      // Also update lastSynced, syncedContentHash, and syncedContent in macro-vars
      // (This was previously done in saveCachedContent, now consolidated here)
      // NOTE: Version snapshot was already created above (before the save), so we don't need to create it again here
      const varsKey = `macro-vars:${localId}`;
      const existingVars = await storage.get(varsKey) || {};

      existingVars.lastSynced = now;
      if (syncedContentHash !== undefined) {
        existingVars.syncedContentHash = syncedContentHash;
      }
      if (syncedContent !== undefined) {
        existingVars.syncedContent = syncedContent;
      }

      await storage.set(varsKey, existingVars);
      const totalCacheGenerationDuration = Date.now() - cacheGenerationStartTime;
      logSuccess('saveVariableValues', `Cache generation complete for ${localId} (async)`, { 
        duration: `${totalCacheGenerationDuration}ms`
      });
      } catch (cacheError) {
        // Don't fail the save if cache generation fails
        logFailure('saveVariableValues', 'Error generating and caching preview content (async)', cacheError, { localId });
      }
    })();
    
    // Don't await - let cache generation run in the background
    // Fire and forget, but log if it fails
    cacheGenerationPromise.catch(error => {
      logFailure('saveVariableValues', 'Unhandled error in async cache generation', error, { localId, excerptId });
    });

    // Return immediately after saving config - don't wait for cache generation
    const totalFunctionDuration = Date.now() - functionStartTime;
    logSuccess('saveVariableValues', 'Function completed successfully', { 
      localId,
      duration: `${totalFunctionDuration}ms`
    });
    
    return {
      success: true,
      data: {}
    };
  } catch (error) {
    const totalFunctionDuration = Date.now() - functionStartTime;
    logFailure('saveVariableValues', 'Error saving variable values', error, { 
      localId: req.payload?.localId,
      duration: `${totalFunctionDuration}ms`
    });
    return createErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      error.message,
      { localId: req.payload?.localId }
    );
  }
}
