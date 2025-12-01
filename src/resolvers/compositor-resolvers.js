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
 * Returns the list of all defined archetypes from storage.
 * Falls back to hardcoded ARCHETYPES if storage is empty (for migration).
 *
 * @returns {Promise<Object>} List of archetypes
 */
export async function getArchetypes(req) {
  logFunction('getArchetypes', 'START', {});

  try {
    // Try to get archetypes from storage
    const storedArchetypes = await storage.get('archetypes-index');
    
    if (storedArchetypes && storedArchetypes.archetypes && storedArchetypes.archetypes.length > 0) {
      // Load full details for each archetype
      const archetypePromises = storedArchetypes.archetypes.map(async (archetypeId) => {
        const fullArchetype = await storage.get(`archetype:${archetypeId}`);
        return fullArchetype;
      });

      const archetypes = await Promise.all(archetypePromises);
      
      return {
        success: true,
        data: archetypes.filter(a => a !== null)
      };
    }

    // Fallback to hardcoded archetypes (for migration/initial setup)
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
 * Get a single archetype by ID
 *
 * @param {Object} req - Request object
 * @param {string} req.payload.archetypeId - Archetype ID
 * @returns {Promise<Object>} Archetype data
 */
export async function getArchetype(req) {
  const { archetypeId } = req.payload || {};

  logFunction('getArchetype', 'START', { archetypeId });

  try {
    if (!archetypeId) {
      return { success: false, error: 'Missing required parameter: archetypeId' };
    }

    // Try to get from storage first
    const archetype = await storage.get(`archetype:${archetypeId}`);
    
    if (archetype) {
      return {
        success: true,
        data: archetype
      };
    }

    // Fallback to hardcoded archetypes
    const hardcodedArchetype = getArchetypeById(archetypeId);
    if (hardcodedArchetype) {
      return {
        success: true,
        data: hardcodedArchetype
      };
    }

    return { success: false, error: `Archetype not found: ${archetypeId}` };
  } catch (error) {
    logFailure('getArchetype', 'Error', error, { archetypeId });
    return { success: false, error: error.message };
  }
}

/**
 * Create a new archetype
 *
 * Creates a new archetype with the given name and saves it to storage.
 *
 * @param {Object} req - Request object
 * @param {string} req.payload.name - Archetype name
 * @param {string} req.payload.description - Optional description
 * @param {string} req.payload.category - Optional category
 * @returns {Promise<Object>} Created archetype
 */
export async function createArchetype(req) {
  const { name, description = '', category = 'Uncategorized' } = req.payload || {};

  logFunction('createArchetype', 'START', { name });

  try {
    if (!name || !name.trim()) {
      return { success: false, error: 'Archetype name is required' };
    }

    // Generate unique ID
    const id = `archetype-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Create archetype object
    const archetype = {
      id,
      name: name.trim(),
      description: description.trim() || '',
      category: category.trim() || 'Uncategorized',
      chapters: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Save archetype to storage
    await storage.set(`archetype:${id}`, archetype);

    // Update archetypes index
    const index = await storage.get('archetypes-index') || { archetypes: [] };
    if (!index.archetypes.includes(id)) {
      index.archetypes.push(id);
      await storage.set('archetypes-index', index);
    }

    logSuccess('createArchetype', 'Archetype created', { id, name });

    return {
      success: true,
      data: archetype
    };
  } catch (error) {
    logFailure('createArchetype', 'Error', error, { name });
    return { success: false, error: error.message };
  }
}

/**
 * Update an archetype
 *
 * Updates an existing archetype's properties.
 *
 * @param {Object} req - Request object
 * @param {string} req.payload.archetypeId - Archetype ID
 * @param {string} req.payload.name - Optional new name
 * @param {string} req.payload.description - Optional new description
 * @param {string} req.payload.category - Optional new category
 * @returns {Promise<Object>} Updated archetype
 */
export async function updateArchetype(req) {
  const { archetypeId, name, description, category } = req.payload || {};

  logFunction('updateArchetype', 'START', { archetypeId, name });

  try {
    if (!archetypeId) {
      return { success: false, error: 'Missing required parameter: archetypeId' };
    }

    // Get existing archetype
    let archetype = await storage.get(`archetype:${archetypeId}`);
    
    // If not in storage, try hardcoded
    if (!archetype) {
      archetype = getArchetypeById(archetypeId);
      if (!archetype) {
        return { success: false, error: `Archetype not found: ${archetypeId}` };
      }
      // Create a copy to avoid mutating hardcoded data
      archetype = JSON.parse(JSON.stringify(archetype));
    }

    // Update fields if provided
    if (name !== undefined) {
      archetype.name = name.trim();
    }
    if (description !== undefined) {
      archetype.description = description.trim();
    }
    if (category !== undefined) {
      archetype.category = category.trim();
    }

    archetype.updatedAt = new Date().toISOString();

    // Save updated archetype
    await storage.set(`archetype:${archetypeId}`, archetype);

    logSuccess('updateArchetype', 'Archetype updated', { archetypeId, name });

    return {
      success: true,
      data: archetype
    };
  } catch (error) {
    logFailure('updateArchetype', 'Error', error, { archetypeId });
    return { success: false, error: error.message };
  }
}

/**
 * Copy an archetype
 *
 * Creates a duplicate of an existing archetype with a new ID and name.
 *
 * @param {Object} req - Request object
 * @param {string} req.payload.archetypeId - Archetype ID to copy
 * @returns {Promise<Object>} Copied archetype
 */
export async function copyArchetype(req) {
  const { archetypeId } = req.payload || {};

  logFunction('copyArchetype', 'START', { archetypeId });

  try {
    if (!archetypeId) {
      return { success: false, error: 'Missing required parameter: archetypeId' };
    }

    // Get existing archetype
    let archetype = await storage.get(`archetype:${archetypeId}`);
    
    // If not in storage, try hardcoded
    if (!archetype) {
      archetype = getArchetypeById(archetypeId);
      if (!archetype) {
        return { success: false, error: `Archetype not found: ${archetypeId}` };
      }
      // Create a copy to avoid mutating hardcoded data
      archetype = JSON.parse(JSON.stringify(archetype));
    } else {
      // Deep clone to avoid reference issues
      archetype = JSON.parse(JSON.stringify(archetype));
    }

    // Generate new ID
    const newId = `archetype-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Update archetype with new ID and name
    archetype.id = newId;
    archetype.name = `${archetype.name} (Copy)`;
    archetype.createdAt = new Date().toISOString();
    archetype.updatedAt = new Date().toISOString();

    // Deep clone chapters if they exist
    if (archetype.chapters && Array.isArray(archetype.chapters)) {
      archetype.chapters = archetype.chapters.map(chapter => ({
        ...chapter,
        // Generate new chapter IDs to avoid conflicts
        id: `chapter-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      }));
    }

    // Save new archetype to storage
    await storage.set(`archetype:${newId}`, archetype);

    // Update archetypes index
    const index = await storage.get('archetypes-index') || { archetypes: [] };
    if (!index.archetypes.includes(newId)) {
      index.archetypes.push(newId);
      await storage.set('archetypes-index', index);
    }

    logSuccess('copyArchetype', 'Archetype copied', { originalId: archetypeId, newId });

    return {
      success: true,
      data: archetype
    };
  } catch (error) {
    logFailure('copyArchetype', 'Error', error, { archetypeId });
    return { success: false, error: error.message };
  }
}

/**
 * Update source defaults for an archetype
 *
 * Updates toggle states and other defaults for a specific source within an archetype.
 *
 * @param {Object} req - Request object
 * @param {string} req.payload.archetypeId - Archetype ID
 * @param {string} req.payload.sourceId - Source ID
 * @param {Object} req.payload.toggleStates - Toggle states object (e.g., { "toggleName": true })
 * @returns {Promise<Object>} Updated archetype
 */
export async function updateArchetypeSourceDefaults(req) {
  const { archetypeId, sourceId, toggleStates } = req.payload || {};

  logFunction('updateArchetypeSourceDefaults', 'START', { archetypeId, sourceId });

  try {
    if (!archetypeId || !sourceId) {
      return { success: false, error: 'Missing required parameters: archetypeId and sourceId' };
    }

    // Get existing archetype
    let archetype = await storage.get(`archetype:${archetypeId}`);
    
    // If not in storage, try hardcoded
    if (!archetype) {
      archetype = getArchetypeById(archetypeId);
      if (!archetype) {
        return { success: false, error: `Archetype not found: ${archetypeId}` };
      }
      // Create a copy to avoid mutating hardcoded data
      archetype = JSON.parse(JSON.stringify(archetype));
    } else {
      // Deep clone to avoid reference issues
      archetype = JSON.parse(JSON.stringify(archetype));
    }

    // Initialize sourceDefaults if it doesn't exist
    if (!archetype.sourceDefaults) {
      archetype.sourceDefaults = {};
    }

    // Update or create source defaults
    archetype.sourceDefaults[sourceId] = {
      ...archetype.sourceDefaults[sourceId],
      toggleStates: toggleStates || {}
    };

    archetype.updatedAt = new Date().toISOString();

    // Save updated archetype
    await storage.set(`archetype:${archetypeId}`, archetype);

    logSuccess('updateArchetypeSourceDefaults', 'Source defaults updated', { archetypeId, sourceId });

    return {
      success: true,
      data: archetype
    };
  } catch (error) {
    logFailure('updateArchetypeSourceDefaults', 'Error', error, { archetypeId, sourceId });
    return { success: false, error: error.message };
  }
}

/**
 * Update archetype source order
 *
 * Saves the ordered list of source IDs for an archetype.
 * This determines the display order in the Archetype configuration.
 *
 * @param {Object} req - Request object
 * @param {string} req.payload.archetypeId - Archetype ID
 * @param {string[]} req.payload.sourceOrder - Ordered array of source IDs
 * @returns {Promise<Object>} Updated archetype
 */
export async function updateArchetypeSourceOrder(req) {
  const { archetypeId, sourceOrder } = req.payload || {};

  logFunction('updateArchetypeSourceOrder', 'START', { archetypeId, sourceCount: sourceOrder?.length });

  try {
    if (!archetypeId) {
      return { success: false, error: 'Missing required parameter: archetypeId' };
    }

    if (!Array.isArray(sourceOrder)) {
      return { success: false, error: 'sourceOrder must be an array' };
    }

    // Get existing archetype
    let archetype = await storage.get(`archetype:${archetypeId}`);
    
    // If not in storage, try hardcoded
    if (!archetype) {
      archetype = getArchetypeById(archetypeId);
      if (!archetype) {
        return { success: false, error: `Archetype not found: ${archetypeId}` };
      }
      // Create a copy to avoid mutating hardcoded data
      archetype = JSON.parse(JSON.stringify(archetype));
    } else {
      // Deep clone to avoid reference issues
      archetype = JSON.parse(JSON.stringify(archetype));
    }

    // Update source order
    archetype.sourceOrder = sourceOrder;
    archetype.updatedAt = new Date().toISOString();

    // Save updated archetype
    await storage.set(`archetype:${archetypeId}`, archetype);

    logSuccess('updateArchetypeSourceOrder', 'Source order updated', { archetypeId, sourceCount: sourceOrder.length });

    return {
      success: true,
      data: archetype
    };
  } catch (error) {
    logFailure('updateArchetypeSourceOrder', 'Error', error, { archetypeId });
    return { success: false, error: error.message };
  }
}

/**
 * Remove a source from an archetype
 *
 * Removes a source from the archetype's sourceOrder and clears its sourceDefaults.
 *
 * @param {Object} req - Request object
 * @param {string} req.payload.archetypeId - Archetype ID
 * @param {string} req.payload.sourceId - Source ID to remove
 * @returns {Promise<Object>} Updated archetype
 */
export async function removeArchetypeSource(req) {
  const { archetypeId, sourceId } = req.payload || {};

  logFunction('removeArchetypeSource', 'START', { archetypeId, sourceId });

  try {
    if (!archetypeId || !sourceId) {
      return { success: false, error: 'Missing required parameters: archetypeId and sourceId' };
    }

    // Get existing archetype
    let archetype = await storage.get(`archetype:${archetypeId}`);
    
    // If not in storage, try hardcoded
    if (!archetype) {
      archetype = getArchetypeById(archetypeId);
      if (!archetype) {
        return { success: false, error: `Archetype not found: ${archetypeId}` };
      }
      // Create a copy to avoid mutating hardcoded data
      archetype = JSON.parse(JSON.stringify(archetype));
    } else {
      // Deep clone to avoid reference issues
      archetype = JSON.parse(JSON.stringify(archetype));
    }

    // Remove from sourceOrder if it exists
    if (archetype.sourceOrder && Array.isArray(archetype.sourceOrder)) {
      archetype.sourceOrder = archetype.sourceOrder.filter(id => id !== sourceId);
    }

    // Remove sourceDefaults for this source if they exist
    if (archetype.sourceDefaults && archetype.sourceDefaults[sourceId]) {
      delete archetype.sourceDefaults[sourceId];
    }

    archetype.updatedAt = new Date().toISOString();

    // Save updated archetype
    await storage.set(`archetype:${archetypeId}`, archetype);

    logSuccess('removeArchetypeSource', 'Source removed from archetype', { archetypeId, sourceId });

    return {
      success: true,
      data: archetype
    };
  } catch (error) {
    logFailure('removeArchetypeSource', 'Error', error, { archetypeId, sourceId });
    return { success: false, error: error.message };
  }
}

/**
 * Get sources for an archetype
 *
 * Returns the sources that belong to an archetype, already ordered by sourceOrder.
 * This is the single source of truth for what sources an archetype contains.
 * Eliminates race conditions by returning everything the frontend needs in one call.
 *
 * @param {Object} req - Request object
 * @param {string} req.payload.archetypeId - Archetype ID
 * @returns {Promise<Object>} { sources: [...], sourceDefaults: {...} }
 */
export async function getArchetypeSources(req) {
  const { archetypeId } = req.payload || {};

  logFunction('getArchetypeSources', 'START', { archetypeId });

  try {
    if (!archetypeId) {
      return { success: false, error: 'Missing required parameter: archetypeId' };
    }

    // Get archetype from storage
    let archetype = await storage.get(`archetype:${archetypeId}`);
    
    // Fallback to hardcoded if not in storage
    if (!archetype) {
      archetype = getArchetypeById(archetypeId);
    }

    if (!archetype) {
      return { success: false, error: `Archetype not found: ${archetypeId}` };
    }

    // If no sourceOrder, return empty array
    if (!archetype.sourceOrder || !Array.isArray(archetype.sourceOrder) || archetype.sourceOrder.length === 0) {
      logSuccess('getArchetypeSources', 'No sources configured for archetype', { archetypeId });
      return {
        success: true,
        data: {
          sources: [],
          sourceDefaults: archetype.sourceDefaults || {}
        }
      };
    }

    // Batch fetch only the sources we need (in order)
    const sourcePromises = archetype.sourceOrder.map(sourceId => 
      storage.get(`excerpt:${sourceId}`)
    );
    
    const sourcesRaw = await Promise.all(sourcePromises);
    
    // Filter out null/undefined (sources that no longer exist) and maintain order
    const sources = sourcesRaw.filter(source => source !== null && source !== undefined);

    logSuccess('getArchetypeSources', 'Sources loaded for archetype', { 
      archetypeId, 
      requestedCount: archetype.sourceOrder.length,
      foundCount: sources.length 
    });

    return {
      success: true,
      data: {
        sources,
        sourceDefaults: archetype.sourceDefaults || {}
      }
    };
  } catch (error) {
    logFailure('getArchetypeSources', 'Error', error, { archetypeId });
    return { success: false, error: error.message };
  }
}

/**
 * Delete an archetype
 *
 * Removes an archetype from storage.
 *
 * @param {Object} req - Request object
 * @param {string} req.payload.archetypeId - Archetype ID to delete
 * @returns {Promise<Object>} Result
 */
export async function deleteArchetype(req) {
  const { archetypeId } = req.payload || {};

  logFunction('deleteArchetype', 'START', { archetypeId });

  try {
    if (!archetypeId) {
      return { success: false, error: 'Missing required parameter: archetypeId' };
    }

    // Check if archetype exists in storage
    const archetype = await storage.get(`archetype:${archetypeId}`);
    
    if (!archetype) {
      // Check if it's a hardcoded archetype (cannot delete)
      const hardcodedArchetype = getArchetypeById(archetypeId);
      if (hardcodedArchetype) {
        return { success: false, error: 'Cannot delete hardcoded archetype. Only user-created archetypes can be deleted.' };
      }
      return { success: false, error: `Archetype not found: ${archetypeId}` };
    }

    // Remove from storage
    await storage.delete(`archetype:${archetypeId}`);

    // Remove from index
    const index = await storage.get('archetypes-index') || { archetypes: [] };
    index.archetypes = index.archetypes.filter(id => id !== archetypeId);
    await storage.set('archetypes-index', index);

    logSuccess('deleteArchetype', 'Archetype deleted', { archetypeId });

    return {
      success: true,
      message: 'Archetype deleted successfully'
    };
  } catch (error) {
    logFailure('deleteArchetype', 'Error', error, { archetypeId });
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
        const complianceLevel = embedConfig.complianceLevel || null;

        // Render content with settings
        let renderedAdf = excerpt.content;

        if (renderedAdf && typeof renderedAdf === 'object' && renderedAdf.type === 'doc') {
          renderedAdf = substituteVariablesInAdf(renderedAdf, variableValues);
          renderedAdf = insertCustomParagraphsInAdf(renderedAdf, customInsertions);
          // Pass customInsertions to adjust internal note positions
          renderedAdf = insertInternalNotesInAdf(renderedAdf, internalNotes, customInsertions);
          renderedAdf = filterContentByToggles(renderedAdf, toggleStates);
        }

        // Convert to storage format
        const storageContent = await convertAdfToStorage(renderedAdf);
        if (!storageContent) {
          errors.push({ chapterId: chapter.id, error: 'ADF conversion failed' });
          continue;
        }

        // Build the chapter HTML
        const chapterId = `chapter-${localId}`;
        const chapterHtml = buildChapterStructure({
          chapterId,
          localId,
          heading: chapter.name || excerpt.name,
          bodyContent: storageContent,
          complianceLevel,
          isBespoke: excerpt.bespoke || false
        });

        // Check if chapter already exists in page (search by localId for new Content Properties boundaries)
        const existingChapter = findChapter(pageBody, localId);

        if (existingChapter) {
          // Replace existing chapter (entire layout block)
          pageBody =
            pageBody.substring(0, existingChapter.startIndex) +
            chapterHtml +
            pageBody.substring(existingChapter.endIndex);
        } else {
          // Add new chapter
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

/**
 * Scan page for existing Blueprint macros
 *
 * Scans the page content for existing Blueprint Embed macros.
 *
 * @param {Object} req - Request object
 * @param {string} req.payload.pageId - Confluence page ID
 * @returns {Promise<Object>} List of existing macros
 */
export async function scanPageForMacros(req) {
  const { pageId } = req.payload || {};

  logFunction('scanPageForMacros', 'START', { pageId });

  try {
    if (!pageId) {
      return { success: false, error: 'Missing required parameter: pageId' };
    }

    // Fetch page content
    const response = await api.asApp().requestConfluence(
      route`/wiki/api/v2/pages/${pageId}?body-format=storage`,
      { method: 'GET' }
    );

    if (!response.ok) {
      const errorText = await response.text();
      logFailure('scanPageForMacros', 'Failed to fetch page', { status: response.status, error: errorText });
      return { success: false, error: `Failed to fetch page: ${response.status}` };
    }

    const pageData = await response.json();
    const content = pageData?.body?.storage?.value || '';

    // Find all Blueprint Embed macros
    const macroRegex = /<ac:structured-macro[^>]*ac:name="blueprint-standard-embed"[^>]*>[\s\S]*?<ac:parameter[^>]*ac:name="localId"[^>]*>([^<]+)<\/ac:parameter>[\s\S]*?<\/ac:structured-macro>/g;
    
    const macros = [];
    let match;
    while ((match = macroRegex.exec(content)) !== null) {
      macros.push({
        localId: match[1],
        fullMatch: match[0]
      });
    }

    logSuccess('scanPageForMacros', 'Scan complete', { pageId, macroCount: macros.length });

    return {
      success: true,
      data: {
        macros,
        hasContent: content.trim().length > 0
      }
    };
  } catch (error) {
    logFailure('scanPageForMacros', 'Error', error, { pageId });
    return { success: false, error: error.message };
  }
}

/**
 * Find a Source by exact name from the excerpt-index
 *
 * @param {string} sourceName - Exact name of the Source to find
 * @returns {Promise<string|null>} Source ID (UUID) if found, null otherwise
 */
async function findSourceByName(sourceName) {
  try {
    const excerptIndex = await storage.get('excerpt-index') || { excerpts: [] };
    const found = excerptIndex.excerpts?.find(e => e.name === sourceName);
    return found?.id || null;
  } catch (error) {
    logWarning('findSourceByName', 'Error finding source by name', { sourceName, error: error.message });
    return null;
  }
}

/**
 * Build hardcoded page header content
 *
 * Creates the hardcoded header structure:
 * 1. Intro/Legend Embed at the top
 * 2. 2-Column Layout with Fundamentals Embed in left column and TOC in right column
 *
 * @param {Object} options
 * @param {string} options.extensionKey - Extension key for Embed macros
 * @param {string} options.extensionId - Extension ID for Embed macros
 * @param {string} options.envLabel - Environment label
 * @param {string} options.forgeEnv - Forge environment
 * @returns {Promise<string>} Storage format XML for header content
 */
async function buildHardcodedPageHeader({ extensionKey, extensionId, envLabel, forgeEnv }) {
  logPhase('buildHardcodedPageHeader', 'START', {});

  // Find required Sources by name
  const introLegendSourceId = await findSourceByName('Intro/Legend');
  const fundamentalsSourceId = await findSourceByName('Fundamentals - Key dates, Stack model');

  const headerParts = [];

  // 1. Intro/Legend Embed at the top
  if (introLegendSourceId) {
    const introLocalId = crypto.randomUUID();
    
    // Create storage entry for Intro/Legend Embed
    await storage.set(`macro-vars:${introLocalId}`, {
      excerptId: introLegendSourceId,
      toggleStates: {},
      variableValues: {},
      customInsertions: {},
      internalNotes: [],
      customHeading: null,
      complianceLevel: null,
      cachedIncomplete: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    const introEmbedMacro = `<ac:adf-extension><ac:adf-node type="extension"><ac:adf-attribute key="extension-key">${extensionKey}</ac:adf-attribute><ac:adf-attribute key="extension-type">com.atlassian.ecosystem</ac:adf-attribute><ac:adf-attribute key="parameters"><ac:adf-parameter key="local-id">${introLocalId}</ac:adf-parameter><ac:adf-parameter key="extension-id">${extensionId}</ac:adf-parameter><ac:adf-parameter key="extension-title">🎯 Blueprint App - Embed${envLabel}</ac:adf-parameter><ac:adf-parameter key="layout">default</ac:adf-parameter><ac:adf-parameter key="forge-environment">${forgeEnv}</ac:adf-parameter><ac:adf-parameter key="render">native</ac:adf-parameter></ac:adf-attribute><ac:adf-attribute key="text">🎯 Blueprint App - Embed${envLabel}</ac:adf-attribute><ac:adf-attribute key="layout">default</ac:adf-attribute><ac:adf-attribute key="local-id">${introLocalId}</ac:adf-attribute></ac:adf-node></ac:adf-extension>`;
    
    headerParts.push(introEmbedMacro);
    logSuccess('buildHardcodedPageHeader', 'Intro/Legend Embed added', { sourceId: introLegendSourceId });
  } else {
    logWarning('buildHardcodedPageHeader', 'Intro/Legend Source not found', {});
  }

  // 2. 2-Column Layout: Fundamentals Embed (left) + TOC (right)
  if (fundamentalsSourceId) {
    const fundamentalsLocalId = crypto.randomUUID();
    
    // Create storage entry for Fundamentals Embed
    await storage.set(`macro-vars:${fundamentalsLocalId}`, {
      excerptId: fundamentalsSourceId,
      toggleStates: {},
      variableValues: {},
      customInsertions: {},
      internalNotes: [],
      customHeading: null,
      complianceLevel: null,
      cachedIncomplete: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    const fundamentalsEmbedMacro = `<ac:adf-extension><ac:adf-node type="extension"><ac:adf-attribute key="extension-key">${extensionKey}</ac:adf-attribute><ac:adf-attribute key="extension-type">com.atlassian.ecosystem</ac:adf-attribute><ac:adf-attribute key="parameters"><ac:adf-parameter key="local-id">${fundamentalsLocalId}</ac:adf-parameter><ac:adf-parameter key="extension-id">${extensionId}</ac:adf-parameter><ac:adf-parameter key="extension-title">🎯 Blueprint App - Embed${envLabel}</ac:adf-parameter><ac:adf-parameter key="layout">default</ac:adf-parameter><ac:adf-parameter key="forge-environment">${forgeEnv}</ac:adf-parameter><ac:adf-parameter key="render">native</ac:adf-parameter></ac:adf-attribute><ac:adf-attribute key="text">🎯 Blueprint App - Embed${envLabel}</ac:adf-attribute><ac:adf-attribute key="layout">default</ac:adf-attribute><ac:adf-attribute key="local-id">${fundamentalsLocalId}</ac:adf-attribute></ac:adf-node></ac:adf-extension>`;

    // Left column: Fundamentals Embed
    const leftColumn = `<ac:structured-macro ac:name="column" ac:schema-version="1">
<ac:parameter ac:name="width">50%</ac:parameter>
<ac:rich-text-body>
${fundamentalsEmbedMacro}
</ac:rich-text-body>
</ac:structured-macro>`;

    // Right column: Table of Contents macro
    const rightColumn = `<ac:structured-macro ac:name="column" ac:schema-version="1">
<ac:parameter ac:name="width">50%</ac:parameter>
<ac:rich-text-body>
<ac:structured-macro ac:name="toc" ac:schema-version="1">
<ac:parameter ac:name="outline">true</ac:parameter>
<ac:parameter ac:name="maxLevel">3</ac:parameter>
</ac:structured-macro>
</ac:rich-text-body>
</ac:structured-macro>`;

    headerParts.push(leftColumn);
    headerParts.push(rightColumn);
    logSuccess('buildHardcodedPageHeader', '2-Column Layout added', { sourceId: fundamentalsSourceId });
  } else {
    logWarning('buildHardcodedPageHeader', 'Fundamentals Source not found', {});
  }

  if (headerParts.length === 0) {
    logWarning('buildHardcodedPageHeader', 'No hardcoded header content generated - Sources not found', {});
    return '';
  }

  return headerParts.join('\n\n');
}

/**
 * Deploy an archetype to a page
 *
 * Inserts Blueprint Embed macros for each Source in the archetype's sourceOrder,
 * with toggle defaults from sourceDefaults. Uses batched parallel storage writes
 * for performance.
 *
 * @param {Object} req - Request object
 * @param {string} req.payload.pageId - Confluence page ID
 * @param {string} req.payload.archetypeId - Archetype ID to deploy
 * @param {string} req.payload.mode - 'full' (replace all) or 'toggles_only' (keep existing)
 * @returns {Promise<Object>} Deployment result
 */
export async function deployArchetype(req) {
  const { pageId, archetypeId, mode = 'full' } = req.payload || {};

  logFunction('deployArchetype', 'START', { pageId, archetypeId, mode });

  try {
    if (!pageId || !archetypeId) {
      return { success: false, error: 'Missing required parameters: pageId and archetypeId' };
    }

    // Get archetype from storage
    let archetype = await storage.get(`archetype:${archetypeId}`);
    if (!archetype) {
      // Try hardcoded fallback
      archetype = getArchetypeById(archetypeId);
      if (!archetype) {
        return { success: false, error: `Archetype not found: ${archetypeId}` };
      }
    }

    // Validate sourceOrder exists
    if (!archetype.sourceOrder || archetype.sourceOrder.length === 0) {
      return { success: false, error: 'Archetype has no sources configured' };
    }

    const sourceOrder = archetype.sourceOrder;
    const sourceDefaults = archetype.sourceDefaults || {};

    logPhase('deployArchetype', 'SOURCES', { sourceCount: sourceOrder.length });

    // Mode: toggles_only - just update toggle states on existing Embeds
    if (mode === 'toggles_only') {
      const scanResult = await scanPageForMacros({ payload: { pageId } });
      if (!scanResult.success) {
        return { success: false, error: 'Failed to scan page for existing macros' };
      }

      const existingMacros = scanResult.data?.macros || [];
      let updatedCount = 0;

      for (const macro of existingMacros) {
        const localId = macro.localId;
        const existingConfig = await storage.get(`macro-vars:${localId}`);
        
        if (existingConfig && existingConfig.excerptId) {
          const defaults = sourceDefaults[existingConfig.excerptId]?.toggleStates || {};
          
          // Merge defaults with existing toggle states (defaults take precedence)
          const newConfig = {
            ...existingConfig,
            toggleStates: {
              ...existingConfig.toggleStates,
              ...defaults
            }
          };
          
          await storage.set(`macro-vars:${localId}`, newConfig);
          updatedCount++;
        }
      }

      logSuccess('deployArchetype', 'Toggle defaults applied', { pageId, updatedCount });

      return {
        success: true,
        data: {
          mode: 'toggles_only',
          deployedCount: updatedCount
        }
      };
    }

    // Mode: full - replace page content with new Embeds
    logPhase('deployArchetype', 'FULL_DEPLOY', { sourceCount: sourceOrder.length });

    // Helper to chunk array
    const chunk = (arr, size) => {
      const chunks = [];
      for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
      }
      return chunks;
    };

    // Generate localIds and prepare storage entries
    const embedConfigs = sourceOrder.map(sourceId => ({
      localId: crypto.randomUUID(),
      sourceId,
      toggleStates: sourceDefaults[sourceId]?.toggleStates || {}
    }));

    // Batch storage writes in groups of 10 to avoid rate limits
    const batches = chunk(embedConfigs, 10);
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      logPhase('deployArchetype', `BATCH_${i + 1}`, { batchSize: batch.length });
      
      await Promise.all(batch.map(config => 
        storage.set(`macro-vars:${config.localId}`, {
          excerptId: config.sourceId,
          toggleStates: config.toggleStates,
          variableValues: {},
          customInsertions: {},
          internalNotes: [],
          customHeading: null,
          complianceLevel: null,  // Auto-select based on Source's bespoke property
          cachedIncomplete: true,  // Freshly deployed = incomplete until published
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
      ));
    }

    logPhase('deployArchetype', 'STORAGE_COMPLETE', { configCount: embedConfigs.length });

    // Build macro XHTML using ADF extension format (required for Forge native render macros)
    // App ID is constant from manifest, Environment ID is extracted from install context
    const APP_ID = 'be1ff96b-d44d-4975-98d3-25b80a813bdd';
    const ENV_ID = req.context?.installContext?.split('/')[1] || 'ae38f536-b4c8-4dfa-a1c9-62026d61b4f9';
    const MACRO_KEY = 'blueprint-standard-embed';
    
    logPhase('deployArchetype', 'EXTENSION_IDS', { appId: APP_ID, envId: ENV_ID });
    
    const extensionKey = `${APP_ID}/${ENV_ID}/static/${MACRO_KEY}`;
    const extensionId = `ari:cloud:ecosystem::extension/${extensionKey}`;
    
    // Determine environment label based on whether we're using the development env ID
    const isDevelopment = ENV_ID === 'ae38f536-b4c8-4dfa-a1c9-62026d61b4f9';
    const envLabel = isDevelopment ? ' (Development)' : '';
    const forgeEnv = isDevelopment ? 'DEVELOPMENT' : 'PRODUCTION';
    
    const macrosXhtml = embedConfigs.map(config => {
      return `<ac:adf-extension><ac:adf-node type="extension"><ac:adf-attribute key="extension-key">${extensionKey}</ac:adf-attribute><ac:adf-attribute key="extension-type">com.atlassian.ecosystem</ac:adf-attribute><ac:adf-attribute key="parameters"><ac:adf-parameter key="local-id">${config.localId}</ac:adf-parameter><ac:adf-parameter key="extension-id">${extensionId}</ac:adf-parameter><ac:adf-parameter key="extension-title">🎯 Blueprint App - Embed${envLabel}</ac:adf-parameter><ac:adf-parameter key="layout">default</ac:adf-parameter><ac:adf-parameter key="forge-environment">${forgeEnv}</ac:adf-parameter><ac:adf-parameter key="render">native</ac:adf-parameter></ac:adf-attribute><ac:adf-attribute key="text">🎯 Blueprint App - Embed${envLabel}</ac:adf-attribute><ac:adf-attribute key="layout">default</ac:adf-attribute><ac:adf-attribute key="local-id">${config.localId}</ac:adf-attribute></ac:adf-node></ac:adf-extension>`;
    }).join('\n\n');

    // Build hardcoded page header (Intro/Legend Embed + 2-column layout)
    logPhase('deployArchetype', 'BUILDING_HEADER', {});
    const hardcodedHeader = await buildHardcodedPageHeader({
      extensionKey,
      extensionId,
      envLabel,
      forgeEnv
    });

    // Combine header and archetype Embeds
    const contentParts = [];
    if (hardcodedHeader) {
      contentParts.push(hardcodedHeader);
    }
    if (macrosXhtml) {
      contentParts.push(macrosXhtml);
    }

    // Wrap in a simple structure
    const pageContent = `<p></p>\n${contentParts.join('\n\n')}\n<p></p>`;

    // Update page content
    logPhase('deployArchetype', 'UPDATING_PAGE', { pageId });

    // First get the current page to get version number
    const getResponse = await api.asApp().requestConfluence(
      route`/wiki/api/v2/pages/${pageId}`,
      { method: 'GET' }
    );

    if (!getResponse.ok) {
      const errorText = await getResponse.text();
      logFailure('deployArchetype', 'Failed to get page', { status: getResponse.status, error: errorText });
      return { success: false, error: `Failed to get page: ${getResponse.status}` };
    }

    const pageData = await getResponse.json();
    const currentVersion = pageData.version?.number || 1;

    // Update page with new content
    const updateResponse = await api.asApp().requestConfluence(
      route`/wiki/api/v2/pages/${pageId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: pageId,
          status: 'current',
          title: pageData.title,
          body: {
            representation: 'storage',
            value: pageContent
          },
          version: {
            number: currentVersion + 1,
            message: `Blueprint: Deployed archetype "${archetype.name}"`
          }
        })
      }
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      logFailure('deployArchetype', 'Failed to update page', { status: updateResponse.status, error: errorText });
      return { success: false, error: `Failed to update page: ${updateResponse.status}` };
    }

    logSuccess('deployArchetype', 'Deployment complete', { 
      pageId, 
      archetypeId, 
      deployedCount: embedConfigs.length 
    });

    return {
      success: true,
      data: {
        mode: 'full',
        deployedCount: embedConfigs.length,
        localIds: embedConfigs.map(c => c.localId)
      }
    };
  } catch (error) {
    logFailure('deployArchetype', 'Error', error, { pageId, archetypeId, mode });
    return { success: false, error: error.message };
  }
}

