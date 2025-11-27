/**
 * Compositor Resolvers
 *
 * Backend functions for the Compositor system - page-level Blueprint composition.
 * Handles archetype selection, chapter management, and bulk publishing.
 *
 * The Compositor allows admins to:
 * 1. Select an Archetype for a page (e.g., "Client Onboarding", "Vendor Setup")
 * 2. Toggle chapters on/off based on page needs
 * 3. Bulk publish all enabled chapters at once
 *
 * @module compositor-resolvers
 */

import api, { route } from '@forge/api';
import { storage } from '@forge/api';
import { logFunction, logPhase, logSuccess, logFailure, logWarning } from '../utils/forge-logger.js';
import { ARCHETYPES, getArchetypeById, getChaptersByArchetypeId } from '../config/archetype-definitions.js';
import {
  buildChapterStructure,
  buildChapterPlaceholder,
  findChapter,
  replaceManagedZone,
  convertAdfToStorage
} from '../utils/storage-format-utils.js';
import {
  filterContentByToggles,
  substituteVariablesInAdf,
  insertCustomParagraphsInAdf,
  insertInternalNotesInAdf
} from '../utils/adf-rendering-utils.js';
import { calculateContentHash } from '../utils/hash-utils.js';

/**
 * Get Compositor configuration for a page
 *
 * Returns the selected archetype and chapter states for a page.
 *
 * @param {Object} req - Request object
 * @param {string} req.payload.pageId - Confluence page ID
 * @returns {Promise<Object>} Compositor config or defaults
 */
export async function getCompositorConfig(req) {
  const { pageId } = req.payload || {};

  logFunction('getCompositorConfig', 'START', { pageId });

  try {
    if (!pageId) {
      return { success: false, error: 'Missing required parameter: pageId' };
    }

    // Fetch config from storage
    const config = await storage.get(`compositor:${pageId}`);

    if (!config) {
      // Return default config (no archetype selected)
      return {
        success: true,
        data: {
          pageId,
          archetypeId: null,
          chapterStates: {}, // { chapterId: { enabled: boolean, localId: string } }
          createdAt: null,
          updatedAt: null
        }
      };
    }

    return { success: true, data: config };
  } catch (error) {
    logFailure('getCompositorConfig', 'Error', error, { pageId });
    return { success: false, error: error.message };
  }
}

/**
 * Save Compositor configuration for a page
 *
 * Saves the selected archetype and chapter states.
 *
 * @param {Object} req - Request object
 * @param {string} req.payload.pageId - Confluence page ID
 * @param {string} req.payload.archetypeId - Selected archetype ID
 * @param {Object} req.payload.chapterStates - Chapter enable/disable states
 * @returns {Promise<Object>} Result
 */
export async function saveCompositorConfig(req) {
  const { pageId, archetypeId, chapterStates } = req.payload || {};

  logFunction('saveCompositorConfig', 'START', { pageId, archetypeId });

  try {
    if (!pageId) {
      return { success: false, error: 'Missing required parameter: pageId' };
    }

    // Get existing config
    const existing = await storage.get(`compositor:${pageId}`) || {};

    const config = {
      pageId,
      archetypeId: archetypeId || existing.archetypeId,
      chapterStates: chapterStates || existing.chapterStates || {},
      createdAt: existing.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await storage.set(`compositor:${pageId}`, config);

    logSuccess('saveCompositorConfig', 'Config saved', { pageId, archetypeId });

    return { success: true, data: config };
  } catch (error) {
    logFailure('saveCompositorConfig', 'Error', error, { pageId });
    return { success: false, error: error.message };
  }
}

/**
 * Get available archetypes
 *
 * Returns the list of all defined archetypes.
 *
 * @returns {Promise<Object>} List of archetypes
 */
export async function getArchetypes(req) {
  logFunction('getArchetypes', 'START', {});

  try {
    return {
      success: true,
      data: ARCHETYPES
    };
  } catch (error) {
    logFailure('getArchetypes', 'Error', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get chapters for an archetype
 *
 * Returns the list of chapters defined for a specific archetype.
 *
 * @param {Object} req - Request object
 * @param {string} req.payload.archetypeId - Archetype ID
 * @returns {Promise<Object>} List of chapters
 */
export async function getArchetypeChapters(req) {
  const { archetypeId } = req.payload || {};

  logFunction('getArchetypeChapters', 'START', { archetypeId });

  try {
    if (!archetypeId) {
      return { success: false, error: 'Missing required parameter: archetypeId' };
    }

    const chapters = getChaptersByArchetypeId(archetypeId);

    if (!chapters) {
      return { success: false, error: `Archetype not found: ${archetypeId}` };
    }

    return { success: true, data: chapters };
  } catch (error) {
    logFailure('getArchetypeChapters', 'Error', error, { archetypeId });
    return { success: false, error: error.message };
  }
}

/**
 * Toggle a chapter on/off
 *
 * Enables or disables a chapter for a page. When enabled, creates an Embed
 * macro association. When disabled, removes the chapter from the page.
 *
 * @param {Object} req - Request object
 * @param {string} req.payload.pageId - Confluence page ID
 * @param {string} req.payload.chapterId - Chapter ID
 * @param {boolean} req.payload.enabled - Whether to enable or disable
 * @returns {Promise<Object>} Result
 */
export async function toggleChapter(req) {
  const { pageId, chapterId, enabled } = req.payload || {};

  logFunction('toggleChapter', 'START', { pageId, chapterId, enabled });

  try {
    if (!pageId || !chapterId) {
      return { success: false, error: 'Missing required parameters' };
    }

    // Get current config
    const config = await storage.get(`compositor:${pageId}`) || {
      pageId,
      archetypeId: null,
      chapterStates: {},
      createdAt: new Date().toISOString()
    };

    // Update chapter state
    if (!config.chapterStates) {
      config.chapterStates = {};
    }

    if (!config.chapterStates[chapterId]) {
      config.chapterStates[chapterId] = {};
    }

    config.chapterStates[chapterId].enabled = enabled;
    config.updatedAt = new Date().toISOString();

    // Save config
    await storage.set(`compositor:${pageId}`, config);

    logSuccess('toggleChapter', 'Chapter toggled', { pageId, chapterId, enabled });

    return { success: true, data: config };
  } catch (error) {
    logFailure('toggleChapter', 'Error', error, { pageId, chapterId });
    return { success: false, error: error.message };
  }
}

/**
 * Bulk publish all enabled chapters
 *
 * Publishes all enabled chapters for a page in a single operation.
 * This is more efficient than publishing each chapter individually
 * as it only makes one page update API call.
 *
 * @param {Object} req - Request object
 * @param {string} req.payload.pageId - Confluence page ID
 * @returns {Promise<Object>} Result with published chapters
 */
export async function bulkPublishChapters(req) {
  const { pageId } = req.payload || {};

  logFunction('bulkPublishChapters', 'START', { pageId });

  try {
    if (!pageId) {
      return { success: false, error: 'Missing required parameter: pageId' };
    }

    // Get compositor config
    const config = await storage.get(`compositor:${pageId}`);
    if (!config || !config.archetypeId) {
      return { success: false, error: 'No archetype configured for this page' };
    }

    // Get chapters for this archetype
    const chapters = getChaptersByArchetypeId(config.archetypeId);
    if (!chapters || chapters.length === 0) {
      return { success: false, error: 'No chapters found for archetype' };
    }

    // Get enabled chapters
    const enabledChapters = chapters.filter(ch => 
      config.chapterStates?.[ch.id]?.enabled
    );

    if (enabledChapters.length === 0) {
      return { success: true, message: 'No chapters enabled', publishedCount: 0 };
    }

    // Fetch current page content
    logPhase('bulkPublishChapters', 'Fetching page content', { pageId });
    const pageResponse = await api.asApp().requestConfluence(
      route`/wiki/api/v2/pages/${pageId}?body-format=storage`,
      { headers: { 'Accept': 'application/json' } }
    );

    if (!pageResponse.ok) {
      const errorText = await pageResponse.text();
      logFailure('bulkPublishChapters', 'Failed to get page', new Error(errorText));
      return { success: false, error: 'Failed to get page content' };
    }

    const pageData = await pageResponse.json();
    let pageBody = pageData.body.storage.value;
    const currentVersion = pageData.version.number;

    // Process each enabled chapter
    const publishedChapters = [];
    const errors = [];

    for (const chapter of enabledChapters) {
      try {
        logPhase('bulkPublishChapters', `Processing chapter: ${chapter.id}`, {});

        // Get the localId for this chapter (from config or generate new)
        let localId = config.chapterStates[chapter.id]?.localId;
        if (!localId) {
          localId = crypto.randomUUID();
          config.chapterStates[chapter.id].localId = localId;
        }

        // Load Source (excerpt) for this chapter
        const excerpt = await storage.get(`excerpt:${chapter.sourceId}`);
        if (!excerpt) {
          errors.push({ chapterId: chapter.id, error: 'Source not found' });
          continue;
        }

        // Load Embed config for this chapter
        const embedConfig = await storage.get(`macro-vars:${localId}`) || {};
        const variableValues = embedConfig.variableValues || {};
        const toggleStates = embedConfig.toggleStates || {};
        const customInsertions = embedConfig.customInsertions || [];
        const internalNotes = embedConfig.internalNotes || [];

        // Render content with settings
        let renderedAdf = excerpt.content;

        if (renderedAdf && typeof renderedAdf === 'object' && renderedAdf.type === 'doc') {
          renderedAdf = substituteVariablesInAdf(renderedAdf, variableValues);
          renderedAdf = insertCustomParagraphsInAdf(renderedAdf, customInsertions);
          renderedAdf = insertInternalNotesInAdf(renderedAdf, internalNotes);
          renderedAdf = filterContentByToggles(renderedAdf, toggleStates);
        }

        // Convert to storage format
        const storageContent = await convertAdfToStorage(renderedAdf);
        if (!storageContent) {
          errors.push({ chapterId: chapter.id, error: 'ADF conversion failed' });
          continue;
        }

        // Check if chapter already exists in page
        const chapterId = `chapter-${localId}`;
        const existingChapter = findChapter(pageBody, chapterId);

        if (existingChapter) {
          // Update existing chapter
          const updated = replaceManagedZone(pageBody, localId, storageContent);
          if (updated) {
            pageBody = updated;
          } else {
            // Rebuild entire chapter if zone not found
            const chapterHtml = buildChapterStructure({
              chapterId,
              localId,
              heading: chapter.name || excerpt.name,
              bodyContent: storageContent
            });
            pageBody =
              pageBody.substring(0, existingChapter.startIndex) +
              chapterHtml +
              pageBody.substring(existingChapter.endIndex);
          }
        } else {
          // Add new chapter
          const chapterHtml = buildChapterStructure({
            chapterId,
            localId,
            heading: chapter.name || excerpt.name,
            bodyContent: storageContent
          });
          pageBody = pageBody.trim() + '\n\n' + chapterHtml;
        }

        // Update Embed config with published state
        const publishedContentHash = calculateContentHash({
          content: storageContent,
          variableValues,
          toggleStates,
          customInsertions,
          internalNotes
        });

        await storage.set(`macro-vars:${localId}`, {
          ...embedConfig,
          chapterId,
          excerptId: chapter.sourceId,
          publishedAt: new Date().toISOString(),
          publishedContentHash,
          publishedVersion: currentVersion + 1
        });

        publishedChapters.push({
          chapterId: chapter.id,
          localId,
          name: chapter.name
        });

      } catch (chapterError) {
        logWarning('bulkPublishChapters', `Error processing chapter ${chapter.id}`, {
          error: chapterError.message
        });
        errors.push({ chapterId: chapter.id, error: chapterError.message });
      }
    }

    // Update page with all changes in single API call
    if (publishedChapters.length > 0) {
      logPhase('bulkPublishChapters', 'Updating page', { 
        pageId, 
        chaptersCount: publishedChapters.length 
      });

      const updateResponse = await api.asApp().requestConfluence(
        route`/wiki/api/v2/pages/${pageId}`,
        {
          method: 'PUT',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            id: pageId,
            status: 'current',
            title: pageData.title,
            body: {
              representation: 'storage',
              value: pageBody
            },
            version: {
              number: currentVersion + 1,
              message: `Blueprint: Published ${publishedChapters.length} chapter(s)`
            }
          })
        }
      );

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        logFailure('bulkPublishChapters', 'Failed to update page', new Error(errorText));
        return { success: false, error: 'Failed to update page' };
      }

      // Save updated config with localIds
      await storage.set(`compositor:${pageId}`, config);
    }

    logSuccess('bulkPublishChapters', 'Bulk publish complete', {
      pageId,
      publishedCount: publishedChapters.length,
      errorCount: errors.length
    });

    return {
      success: true,
      publishedChapters,
      errors: errors.length > 0 ? errors : undefined,
      publishedCount: publishedChapters.length
    };

  } catch (error) {
    logFailure('bulkPublishChapters', 'Error', error, { pageId });
    return { success: false, error: error.message };
  }
}

/**
 * Initialize page with archetype
 *
 * Sets up a page with the selected archetype and optionally
 * creates placeholder content for all chapters.
 *
 * @param {Object} req - Request object
 * @param {string} req.payload.pageId - Confluence page ID
 * @param {string} req.payload.archetypeId - Archetype ID to use
 * @param {boolean} req.payload.createPlaceholders - Whether to create placeholders
 * @returns {Promise<Object>} Result
 */
export async function initializePageWithArchetype(req) {
  const { pageId, archetypeId, createPlaceholders = false } = req.payload || {};

  logFunction('initializePageWithArchetype', 'START', { pageId, archetypeId });

  try {
    if (!pageId || !archetypeId) {
      return { success: false, error: 'Missing required parameters' };
    }

    // Validate archetype exists
    const archetype = getArchetypeById(archetypeId);
    if (!archetype) {
      return { success: false, error: `Archetype not found: ${archetypeId}` };
    }

    // Get chapters
    const chapters = getChaptersByArchetypeId(archetypeId);

    // Initialize chapter states (all enabled by default for new pages)
    const chapterStates = {};
    for (const chapter of chapters) {
      const localId = crypto.randomUUID();
      chapterStates[chapter.id] = {
        enabled: chapter.defaultEnabled !== false, // Default to enabled
        localId
      };
    }

    // Save config
    const config = {
      pageId,
      archetypeId,
      chapterStates,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await storage.set(`compositor:${pageId}`, config);

    logSuccess('initializePageWithArchetype', 'Page initialized', {
      pageId,
      archetypeId,
      chapterCount: chapters.length
    });

    return {
      success: true,
      data: config,
      archetype,
      chapters
    };

  } catch (error) {
    logFailure('initializePageWithArchetype', 'Error', error, { pageId, archetypeId });
    return { success: false, error: error.message };
  }
}

