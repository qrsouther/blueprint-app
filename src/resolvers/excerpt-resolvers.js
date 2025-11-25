/**
 * Excerpt CRUD Resolver Functions
 *
 * This module contains all excerpt create, read, update, and delete operations.
 * These are the core business logic resolvers for managing excerpt entities.
 *
 * Extracted during Phase 3 of index.js modularization.
 */

import { storage } from '@forge/api';
import api, { route } from '@forge/api';
import { generateUUID } from '../utils.js';
import { detectVariables, detectToggles } from '../utils/detection-utils.js';
import { updateExcerptIndex } from '../utils/storage-utils.js';
import { calculateContentHash } from '../utils/hash-utils.js';
import { logFunction, logPhase, logSuccess, logFailure, logWarning } from '../utils/forge-logger.js';
import { validateExcerptData } from '../utils/storage-validator.js';

/**
 * Save excerpt (create or update)
 */
export async function saveExcerpt(req) {
  const functionStartTime = Date.now();
  logFunction('saveExcerpt', 'Starting save operation', { excerptId: req.payload.excerptId, excerptName: req.payload.excerptName });

  // Input validation
  const { excerptName, category, content, excerptId, variableMetadata, toggleMetadata, documentationLinks, sourcePageId, sourceSpaceKey, sourceLocalId } = req.payload;

  // Validate required fields
  if (!excerptName || typeof excerptName !== 'string' || excerptName.trim() === '') {
    logFailure('saveExcerpt', 'Validation failed: excerptName is required and must be a non-empty string', new Error('Invalid excerptName'));
    return {
      success: false,
      error: 'excerptName is required and must be a non-empty string'
    };
  }

  // Validate content (must be ADF object if provided)
  if (content !== undefined && content !== null) {
    if (typeof content !== 'object' || Array.isArray(content)) {
      logFailure('saveExcerpt', 'Validation failed: content must be an ADF object', new Error('Invalid content type'));
      return {
        success: false,
        error: 'content must be an ADF object'
      };
    }
  }

  // Validate excerptId format if provided (should be UUID)
  if (excerptId && typeof excerptId !== 'string') {
    logFailure('saveExcerpt', 'Validation failed: excerptId must be a string', new Error('Invalid excerptId type'));
    return {
      success: false,
      error: 'excerptId must be a string'
    };
  }

  // Validate variableMetadata if provided
  if (variableMetadata !== undefined && !Array.isArray(variableMetadata)) {
    logFailure('saveExcerpt', 'Validation failed: variableMetadata must be an array', new Error('Invalid variableMetadata type'));
    return {
      success: false,
      error: 'variableMetadata must be an array'
    };
  }

  // Validate toggleMetadata if provided
  if (toggleMetadata !== undefined && !Array.isArray(toggleMetadata)) {
    logFailure('saveExcerpt', 'Validation failed: toggleMetadata must be an array', new Error('Invalid toggleMetadata type'));
    return {
      success: false,
      error: 'toggleMetadata must be an array'
    };
  }

  // Validate documentationLinks if provided
  if (documentationLinks !== undefined && !Array.isArray(documentationLinks)) {
    logFailure('saveExcerpt', 'Validation failed: documentationLinks must be an array', new Error('Invalid documentationLinks type'));
    return {
      success: false,
      error: 'documentationLinks must be an array'
    };
  }

  // Extract page information from backend context (more reliable than frontend)
  const pageId = sourcePageId || req.context?.extension?.content?.id;
  const spaceKey = sourceSpaceKey || req.context?.extension?.space?.key;

  // Generate or reuse excerpt ID
  // If excerptId is missing, try to find existing Source by name + category + pageId to avoid duplicates
  let id = excerptId;
  if (!id && excerptName && pageId) {
    try {
      const index = await storage.get('excerpt-index') || { excerpts: [] };
      // Look for existing Source with same name, category, and pageId
      for (const indexEntry of index.excerpts) {
        const existingExcerpt = await storage.get(`excerpt:${indexEntry.id}`);
        if (existingExcerpt &&
            existingExcerpt.name === excerptName &&
            (existingExcerpt.category || 'General') === (category || 'General') &&
            existingExcerpt.sourcePageId === pageId) {
          id = existingExcerpt.id;
          logPhase('saveExcerpt', 'Found existing Source by name/category/pageId, reusing excerptId', {
            excerptId: id,
            name: excerptName,
            category: category || 'General',
            pageId
          });
          break;
        }
      }
    } catch (lookupError) {
      logWarning('saveExcerpt', 'Error looking up existing Source, will create new one', lookupError);
    }
  }
  
  // Generate new UUID if still no ID found
  if (!id) {
    id = generateUUID();
  }

  // Provide default empty ADF object if content is missing (for new Sources)
  // This allows creating a Source with just name/category, content can be added later
  // Use a paragraph with empty text to satisfy ADF validation (empty content array is rejected)
  const contentToProcess = content || {
    type: 'doc',
    version: 1,
    content: [
      {
        type: 'paragraph',
        content: []
      }
    ]
  };

  // Detect variables in content
  const detectedVariables = detectVariables(contentToProcess);

  // Merge detected variables with provided metadata
  const variables = detectedVariables.map(v => {
    const metadata = variableMetadata?.find(m => m.name === v.name);
    return {
      name: v.name,
      description: metadata?.description || '',
      example: metadata?.example || '',
      required: metadata?.required || false
    };
  });

  // Detect toggles in content
  const detectedToggles = detectToggles(contentToProcess);

  // Merge detected toggles with provided metadata
  const toggles = detectedToggles.map(t => {
    const metadata = toggleMetadata?.find(m => m.name === t.name);
    return {
      name: t.name,
      description: metadata?.description || ''
    };
  });

  // Get existing excerpt to preserve createdAt and existing source page if not provided
  const existingExcerpt = excerptId ? await storage.get(`excerpt:${id}`) : null;

  // Create excerpt object (without hash first)
  const excerpt = {
    id: id,
    name: excerptName,
    category: category || 'General',
    content: contentToProcess,
    variables: variables,
    toggles: toggles,
    documentationLinks: documentationLinks || [],
    sourcePageId: pageId || existingExcerpt?.sourcePageId,
    sourceSpaceKey: spaceKey || existingExcerpt?.sourceSpaceKey,
    sourceLocalId: sourceLocalId || existingExcerpt?.sourceLocalId,
    createdAt: existingExcerpt?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // Calculate and add content hash
  excerpt.contentHash = calculateContentHash(excerpt);

  // Validate the complete excerpt object before saving
  const validation = validateExcerptData(excerpt);
  if (!validation.valid) {
    logFailure('saveExcerpt', 'Validation failed after object construction', new Error(validation.errors.join(', ')), {
      excerptId: id,
      errors: validation.errors
    });
    return {
      success: false,
      error: `Validation failed: ${validation.errors.join(', ')}`
    };
  }

  logPhase('saveExcerpt', 'Excerpt object prepared and validated', {
    excerptId: id,
    variablesCount: variables.length,
    togglesCount: toggles.length,
    documentationLinksCount: (documentationLinks || []).length
  });

  // Simple versioning: Keep only current + previous version (2 total)
  // When updating, save current as previous before overwriting
  if (existingExcerpt) {
    // Save current version as previous before overwriting
    await storage.set(`excerpt-previous:${id}`, existingExcerpt);
    logPhase('saveExcerpt', 'Previous version saved', { excerptId: id });
  }

  await storage.set(`excerpt:${id}`, excerpt);
  logPhase('saveExcerpt', 'Excerpt saved to storage', { excerptId: id });

  // Update index
  await updateExcerptIndex(excerpt);

  logSuccess('saveExcerpt', 'Excerpt saved successfully', {
    excerptId: id,
    duration: `${Date.now() - functionStartTime}ms`
  });

  // Return saved excerpt data
  // Standard return format: { success: true, data: { excerptId, excerptName, ... } }
  return {
    success: true,
    data: {
      excerptId: id,
      excerptName: excerptName,
      category: category,
      content: content,
      variables: variables,
      toggles: toggles,
      documentationLinks: excerpt.documentationLinks || []
    }
  };
}

/**
 * Update excerpt content only (called automatically when Source macro body changes)
 */
export async function updateExcerptContent(req) {
  const { excerptId, content } = req.payload || {};
  const extractedExcerptId = excerptId; // Extract for use in catch block
  
  try {
    // Input validation
    if (!excerptId || typeof excerptId !== 'string' || excerptId.trim() === '') {
      logFailure('updateExcerptContent', 'Validation failed: excerptId is required and must be a non-empty string', new Error('Invalid excerptId'));
      return {
        success: false,
        error: 'excerptId is required and must be a non-empty string'
      };
    }

    if (content === undefined || content === null) {
      logFailure('updateExcerptContent', 'Validation failed: content is required', new Error('Missing content'));
      return {
        success: false,
        error: 'content is required'
      };
    }

    if (typeof content !== 'object' || Array.isArray(content)) {
      logFailure('updateExcerptContent', 'Validation failed: content must be an ADF object', new Error('Invalid content type'));
      return {
        success: false,
        error: 'content must be an ADF object'
      };
    }

    // Load existing excerpt
    const excerpt = await storage.get(`excerpt:${excerptId}`);
    if (!excerpt) {
      logFailure('updateExcerptContent', 'Excerpt not found', new Error('Excerpt not found'), { excerptId });
      return { success: false, error: 'Excerpt not found' };
    }

    // Update content and re-detect variables/toggles
    const detectedVariables = detectVariables(content);
    const detectedToggles = detectToggles(content);

    // Preserve existing variable metadata, but update the list
    const variables = detectedVariables.map(v => {
      const existing = excerpt.variables?.find(ev => ev.name === v.name);
      return existing || {
        name: v.name,
        description: '',
        example: '',
        multiline: false
      };
    });

    // Preserve existing toggle metadata, but update the list
    const toggles = detectedToggles.map(t => {
      const existing = excerpt.toggles?.find(et => et.name === t.name);
      return existing || {
        name: t.name,
        description: ''
      };
    });

    // Build updated excerpt object (without updatedAt yet)
    const updatedExcerpt = {
      ...excerpt,
      content: content,
      variables: variables,
      toggles: toggles
    };

    // Calculate what the new content hash would be
    const newContentHash = calculateContentHash(updatedExcerpt);

    // Compare to existing hash - if unchanged, skip the update
    if (excerpt.contentHash === newContentHash) {
      return { success: true, unchanged: true };
    }

    // Content actually changed - update the excerpt
    updatedExcerpt.contentHash = newContentHash;
    updatedExcerpt.updatedAt = new Date().toISOString();

    // Validate the updated excerpt before saving
    const validation = validateExcerptData(updatedExcerpt);
    if (!validation.valid) {
      logFailure('updateExcerptContent', 'Validation failed after content update', new Error(validation.errors.join(', ')), {
        excerptId,
        errors: validation.errors
      });
      return {
        success: false,
        error: `Validation failed: ${validation.errors.join(', ')}`
      };
    }

    // Simple versioning: Keep only current + previous version (2 total)
    // Save current version as previous before overwriting
    await storage.set(`excerpt-previous:${excerptId}`, excerpt);
    logPhase('updateExcerptContent', 'Previous version saved', { excerptId });

    await storage.set(`excerpt:${excerptId}`, updatedExcerpt);

    // Update index
    await updateExcerptIndex(updatedExcerpt);

    return { success: true, unchanged: false };
  } catch (error) {
    logFailure('updateExcerptContent', 'Error updating excerpt content', error, { excerptId: extractedExcerptId });
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get all excerpts with full details (for admin page)
 */
export async function getAllExcerpts() {
  try {
    const index = await storage.get('excerpt-index') || { excerpts: [] };

    // Load full details for each excerpt
    const excerptPromises = index.excerpts.map(async (indexEntry) => {
      const fullExcerpt = await storage.get(`excerpt:${indexEntry.id}`);
      return fullExcerpt;
    });

    const excerpts = await Promise.all(excerptPromises);

    return {
      success: true,
      data: {
        excerpts: excerpts.filter(e => e !== null)
      }
    };
  } catch (error) {
    logFailure('getAllExcerpts', 'Error getting all excerpts', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Delete an excerpt
 */
export async function deleteExcerpt(req) {
  const { excerptId } = req.payload || {};
  const extractedExcerptId = excerptId; // Extract for use in catch block
  
  try {
    // Input validation
    if (!excerptId || typeof excerptId !== 'string' || excerptId.trim() === '') {
      logFailure('deleteExcerpt', 'Validation failed: excerptId is required and must be a non-empty string', new Error('Invalid excerptId'));
      return {
        success: false,
        error: 'excerptId is required and must be a non-empty string'
      };
    }

    // Delete the excerpt and its previous version
    await storage.delete(`excerpt:${excerptId}`);
    await storage.delete(`excerpt-previous:${excerptId}`);

    // Update the index
    const index = await storage.get('excerpt-index') || { excerpts: [] };
    index.excerpts = index.excerpts.filter(e => e.id !== excerptId);
    await storage.set('excerpt-index', index);

    return {
      success: true
    };
  } catch (error) {
    logFailure('deleteExcerpt', 'Error deleting excerpt', error, { excerptId: extractedExcerptId });
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Update excerpt metadata (name, category)
 */
export async function updateExcerptMetadata(req) {
  const { excerptId, name, category } = req.payload || {};
  const extractedExcerptId = excerptId; // Extract for use in catch block
  
  try {
    // Input validation
    if (!excerptId || typeof excerptId !== 'string' || excerptId.trim() === '') {
      logFailure('updateExcerptMetadata', 'Validation failed: excerptId is required and must be a non-empty string', new Error('Invalid excerptId'));
      return {
        success: false,
        error: 'excerptId is required and must be a non-empty string'
      };
    }

    if (name !== undefined && (typeof name !== 'string' || name.trim() === '')) {
      logFailure('updateExcerptMetadata', 'Validation failed: name must be a non-empty string', new Error('Invalid name'));
      return {
        success: false,
        error: 'name must be a non-empty string'
      };
    }

    if (category !== undefined && typeof category !== 'string') {
      logFailure('updateExcerptMetadata', 'Validation failed: category must be a string', new Error('Invalid category'));
      return {
        success: false,
        error: 'category must be a string'
      };
    }

    // Load the existing excerpt
    const excerpt = await storage.get(`excerpt:${excerptId}`);
    if (!excerpt) {
      return {
        success: false,
        error: 'Excerpt not found'
      };
    }

    // Update the metadata (only if provided)
    if (name !== undefined) {
      excerpt.name = name;
    }
    if (category !== undefined) {
      excerpt.category = category;
    }
    excerpt.updatedAt = new Date().toISOString();

    // Validate the updated excerpt before saving
    const validation = validateExcerptData(excerpt);
    if (!validation.valid) {
      logFailure('updateExcerptMetadata', 'Validation failed after metadata update', new Error(validation.errors.join(', ')), {
        excerptId,
        errors: validation.errors
      });
      return {
        success: false,
        error: `Validation failed: ${validation.errors.join(', ')}`
      };
    }

    // Simple versioning: Keep only current + previous version (2 total)
    // Save current version as previous before overwriting
    await storage.set(`excerpt-previous:${excerptId}`, excerpt);
    logPhase('updateExcerptMetadata', 'Previous version saved', { excerptId });

    // Save the updated excerpt
    await storage.set(`excerpt:${excerptId}`, excerpt);

    // Update the index
    await updateExcerptIndex(excerpt);

    return {
      success: true
    };
  } catch (error) {
    logFailure('updateExcerptMetadata', 'Error updating excerpt metadata', error, { excerptId: extractedExcerptId });
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Mass update excerpts (e.g., change category for multiple excerpts)
 */
export async function massUpdateExcerpts(req) {
  const { excerptIds, category } = req.payload || {};
  const extractedExcerptIds = excerptIds; // Extract for use in catch block
  
  try {
    // Input validation
    if (!excerptIds || !Array.isArray(excerptIds) || excerptIds.length === 0) {
      logFailure('massUpdateExcerpts', 'Validation failed: excerptIds is required and must be a non-empty array', new Error('Invalid excerptIds'));
      return {
        success: false,
        error: 'excerptIds is required and must be a non-empty array'
      };
    }

    if (category !== undefined && typeof category !== 'string') {
      logFailure('massUpdateExcerpts', 'Validation failed: category must be a string', new Error('Invalid category'));
      return {
        success: false,
        error: 'category must be a string'
      };
    }

    // Validate each excerptId in the array
    for (const excerptId of excerptIds) {
      if (!excerptId || typeof excerptId !== 'string' || excerptId.trim() === '') {
        logFailure('massUpdateExcerpts', 'Validation failed: all excerptIds must be non-empty strings', new Error('Invalid excerptId in array'));
        return {
          success: false,
          error: 'All excerptIds must be non-empty strings'
        };
      }
    }

    const updatePromises = excerptIds.map(async (excerptId) => {
      const excerpt = await storage.get(`excerpt:${excerptId}`);
      if (excerpt) {
        excerpt.category = category;
        excerpt.updatedAt = new Date().toISOString();
        
        // Validate before saving
        const validation = validateExcerptData(excerpt);
        if (!validation.valid) {
          logWarning('massUpdateExcerpts', 'Validation failed for excerpt', { excerptId, errors: validation.errors });
          return { excerptId, success: false, error: validation.errors.join(', ') };
        }
        
        // Simple versioning: Keep only current + previous version (2 total)
        // Save current version as previous before overwriting
        await storage.set(`excerpt-previous:${excerptId}`, excerpt);
        
        await storage.set(`excerpt:${excerptId}`, excerpt);
        await updateExcerptIndex(excerpt);
        return { excerptId, success: true };
      }
      return { excerptId, success: false, error: 'Excerpt not found' };
    });

    await Promise.all(updatePromises);

    return {
      success: true
    };
  } catch (error) {
    logFailure('massUpdateExcerpts', 'Error in mass update', error, { excerptIds: extractedExcerptIds });
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Update Source macro body content on the page
 */
export async function updateSourceMacroBody(req) {
  const { pageId, excerptId, localId, content } = req.payload || {};
  const extractedPageId = pageId; // Extract for use in catch block
  const extractedExcerptId = excerptId; // Extract for use in catch block
  const extractedLocalId = localId; // Extract for use in catch block
  
  try {
    // Input validation
    if (!pageId || typeof pageId !== 'string' || pageId.trim() === '') {
      logFailure('updateSourceMacroBody', 'Validation failed: pageId is required and must be a non-empty string', new Error('Invalid pageId'));
      return {
        success: false,
        error: 'pageId is required and must be a non-empty string'
      };
    }

    if (!excerptId || typeof excerptId !== 'string' || excerptId.trim() === '') {
      logFailure('updateSourceMacroBody', 'Validation failed: excerptId is required and must be a non-empty string', new Error('Invalid excerptId'));
      return {
        success: false,
        error: 'excerptId is required and must be a non-empty string'
      };
    }

    if (content === undefined || content === null) {
      logFailure('updateSourceMacroBody', 'Validation failed: content is required', new Error('Missing content'));
      return {
        success: false,
        error: 'content is required'
      };
    }

    if (typeof content !== 'object' || Array.isArray(content)) {
      logFailure('updateSourceMacroBody', 'Validation failed: content must be an ADF object', new Error('Invalid content type'));
      return {
        success: false,
        error: 'content must be an ADF object'
      };
    }

    if (localId !== undefined && (typeof localId !== 'string' || localId.trim() === '')) {
      logFailure('updateSourceMacroBody', 'Validation failed: localId must be a non-empty string if provided', new Error('Invalid localId'));
      return {
        success: false,
        error: 'localId must be a non-empty string if provided'
      };
    }

    logFunction('updateSourceMacroBody', 'START', { pageId: extractedPageId, excerptId: extractedExcerptId, localId: extractedLocalId });

    // Step 1: Get the current page content
    const pageResponse = await api.asApp().requestConfluence(
      route`/wiki/api/v2/pages/${extractedPageId}?body-format=storage`,
      {
        headers: {
          'Accept': 'application/json'
        }
      }
    );

    if (!pageResponse.ok) {
      const errorText = await pageResponse.text();
      logFailure('updateSourceMacroBody', 'Failed to get page', new Error(errorText), { pageId: extractedPageId, status: pageResponse.status });
      return {
        success: false,
        error: `Failed to get page: ${pageResponse.status}`
      };
    }

    const pageData = await pageResponse.json();
    const currentBody = pageData.body.storage.value;
    const currentVersion = pageData.version.number;

    // Step 2: Find the Source macro by excerptId
    // The macro structure: <ac:adf-extension><ac:adf-node type="bodied-extension">...<ac:adf-parameter key="excerpt-id">EXCERPT_ID</ac:adf-parameter>...<ac:adf-content>CURRENT_CONTENT</ac:adf-content>...</ac:adf-node></ac:adf-extension>
    // If localId is provided, use it for more precise matching
    let macroPattern;
    if (extractedLocalId) {
      // Match by both excerpt-id and local-id for precision
      macroPattern = new RegExp(
        `(<ac:adf-extension><ac:adf-node type="bodied-extension"[^>]*>.*?<ac:adf-parameter key="excerpt-id">${extractedExcerptId}</ac:adf-parameter>.*?<ac:adf-parameter key="local-id">${extractedLocalId}</ac:adf-parameter>.*?<ac:adf-content>)([\\s\\S]*?)(</ac:adf-content>.*?</ac:adf-node></ac:adf-extension>)`,
        'gs'
      );
    } else {
      // Match by excerpt-id only
      macroPattern = new RegExp(
        `(<ac:adf-extension><ac:adf-node type="bodied-extension"[^>]*>.*?<ac:adf-parameter key="excerpt-id">${extractedExcerptId}</ac:adf-parameter>.*?<ac:adf-content>)([\\s\\S]*?)(</ac:adf-content>.*?</ac:adf-node></ac:adf-extension>)`,
        'gs'
      );
    }

    const match = macroPattern.exec(currentBody);

    if (!match) {
      logFailure('updateSourceMacroBody', 'Macro not found', new Error('Macro not found on page'), { pageId: extractedPageId, excerptId: extractedExcerptId, localId: extractedLocalId });
      return {
        success: false,
        error: `Source macro not found on page`
      };
    }

    // Step 3: Replace the content within <ac:adf-content> tags
    // The content is already in ADF format (JSON), so we need to insert it as a JSON string
    // JSON.stringify already escapes quotes properly, we just need to escape XML special chars
    const contentJson = JSON.stringify(content);
    // Escape XML special characters: & < > (quotes are already escaped by JSON.stringify)
    const escapedContent = contentJson
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    const modifiedBody = currentBody.replace(
      macroPattern,
      `$1${escapedContent}$3`
    );

    // Step 4: Update the page
    logPhase('updateSourceMacroBody', 'Updating page with new macro body content', { pageId: extractedPageId, excerptId: extractedExcerptId });

    const updateResponse = await api.asApp().requestConfluence(
      route`/wiki/api/v2/pages/${extractedPageId}`,
      {
        method: 'PUT',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: extractedPageId,
          status: 'current',
          title: pageData.title,
          body: {
            representation: 'storage',
            value: modifiedBody
          },
          version: {
            number: currentVersion + 1,
            message: `Blueprint App: Updated Source macro content`
          }
        })
      }
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      logFailure('updateSourceMacroBody', 'Failed to update page', new Error(errorText), { pageId: extractedPageId, status: updateResponse.status });
      return {
        success: false,
        error: `Failed to update page: ${updateResponse.status}`
      };
    }

    const updatedPage = await updateResponse.json();
    logSuccess('updateSourceMacroBody', 'Successfully updated macro body', { pageId: extractedPageId, excerptId: extractedExcerptId, newVersion: updatedPage.version.number });

    return {
      success: true,
      pageVersion: updatedPage.version.number,
      updatedAt: new Date().toISOString()
    };

  } catch (error) {
    logFailure('updateSourceMacroBody', 'Error', error, { pageId: extractedPageId, excerptId: extractedExcerptId, localId: extractedLocalId });
    return {
      success: false,
      error: error.message
    };
  }
}
