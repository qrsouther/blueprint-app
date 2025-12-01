/**
 * Content Injection Resolver
 *
 * Handles injection of rendered Blueprint content into Confluence page storage.
 *
 * Two main use cases:
 * 1. Legacy: injectIncludeContent - old-style injection for Include macros
 * 2. New: publishChapter - chapter-based injection for Compositor model
 *
 * The publishChapter function is the primary method for the new Locked Page model
 * where users edit via Embed UI and the app injects content via asApp().
 */

import api, { route } from '@forge/api';
import { storage } from '@forge/api';
import { logFunction, logPhase, logSuccess, logFailure, logWarning } from '../utils/forge-logger.js';
import {
  convertAdfToStorage,
  buildChapterStructure,
  buildChapterPlaceholder,
  buildFreeformChapter,
  findChapter,
  stripLeadingHeading
} from '../utils/storage-format-utils.js';
import {
  filterContentByToggles,
  substituteVariablesInAdf,
  insertCustomParagraphsInAdf,
  insertInternalNotesInAdf
} from '../utils/adf-rendering-utils.js';
import { calculateContentHash } from '../utils/hash-utils.js';

// Helper function to escape regex special characters
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Note: convertAdfToStorage is now imported from storage-format-utils.js

// Helper function to render excerpt content with variable substitution
async function renderExcerptContent(excerpt, variableValues = {}) {
  let content = excerpt.content;

  // Check if content is ADF JSON format
  const isAdf = content && typeof content === 'object' && content.type === 'doc';

  if (isAdf) {
    // Convert ADF to storage format
    const storageContent = await convertAdfToStorage(content);

    if (!storageContent) {
      logFailure('prepareContentForInjection', 'Failed to convert ADF to storage format', new Error('Conversion returned null'));
      return `<p><strong>⚠️ ADF Conversion Failed</strong></p><p>Could not convert ADF content to storage format. Check logs for details.</p>`;
    }

    content = storageContent;
  }

  // Handle plain text/string content
  if (typeof content !== 'string') {
    logWarning('prepareContentForInjection', 'Content is not a string and not ADF format', {});
    content = String(content || '');
  }

  // Substitute variables
  if (excerpt.variables && Array.isArray(excerpt.variables)) {
    excerpt.variables.forEach(variable => {
      const value = variableValues[variable.name] || `{{${variable.name}}}`;
      const regex = new RegExp(`\\{\\{${escapeRegex(variable.name)}\\}\\}`, 'g');
      content = content.replace(regex, value);
    });
  }

  return content;
}

/**
 * Inject rendered excerpt content for a specific Include macro
 */
export async function injectIncludeContent(req) {
  const { pageId, excerptId, variableValues, localId } = req.payload || {};
  const extractedPageId = pageId; // Extract for use in catch block
  const extractedLocalId = localId; // Extract for use in catch block
  
  logFunction('injectIncludeContent', 'START', {});

  try {

    if (!pageId || !excerptId || !localId) {
      return {
        success: false,
        error: 'Missing required parameters: pageId, excerptId, and localId are required'
      };
    }

    // Step 1: Get the current page content
    const pageResponse = await api.asApp().requestConfluence(
      route`/wiki/api/v2/pages/${pageId}?body-format=storage`,
      {
        headers: {
          'Accept': 'application/json'
        }
      }
    );

    if (!pageResponse.ok) {
      const errorText = await pageResponse.text();
      logFailure('injectIncludeContent', 'Failed to get page', new Error(errorText), { pageId, status: pageResponse.status });
      return {
        success: false,
        error: `Failed to get page: ${pageResponse.status}`
      };
    }

    const pageData = await pageResponse.json();
    const currentBody = pageData.body.storage.value;
    const currentVersion = pageData.version.number;

    // Step 2: Check if page uses new ADF format or old storage format
    const isAdfFormat = currentBody.includes('<ac:adf-extension>');

    let match = null;

    if (isAdfFormat) {
      // NEW EDITOR FORMAT: Search for ADF extension with matching local-id

      // Pattern to find the entire ADF extension node containing our local-id
      const adfPattern = new RegExp(
        `(<ac:adf-extension>.*?<ac:adf-parameter key="local-id">${localId}</ac:adf-parameter>.*?</ac:adf-extension>)`,
        'gs'
      );

      match = adfPattern.exec(currentBody);

      if (!match) {
        // Fallback: Search by excerpt-id
        const excerptIdPattern = new RegExp(
          `(<ac:adf-extension>.*?<ac:adf-parameter key="excerpt-id">${excerptId}</ac:adf-parameter>.*?</ac:adf-extension>)`,
          'gs'
        );

        match = excerptIdPattern.exec(currentBody);
      }

    } else {
      // OLD EDITOR FORMAT: Use structured-macro search

      const includeMacroPattern = new RegExp(
        `(<ac:structured-macro[^>]*ac:name="smart-excerpt-include"[^>]*ac:macro-id="${localId}"[^>]*>.*?</ac:structured-macro>)`,
        'gs'
      );

      match = includeMacroPattern.exec(currentBody);

      if (!match) {
        const paramPattern = new RegExp(
          `(<ac:structured-macro[^>]*ac:name="smart-excerpt-include"[^>]*>.*?<ac:parameter ac:name="excerptId">${excerptId}</ac:parameter>.*?</ac:structured-macro>)`,
          'gs'
        );

        match = paramPattern.exec(currentBody);
      }
    }

    if (!match) {
      logFailure('injectIncludeContent', 'No Include macro found', new Error('Macro not found'), { localId, excerptId });
      return {
        success: false,
        error: `Include macro not found in page storage. Format: ${isAdfFormat ? 'ADF' : 'Storage'}`
      };
    }

    // Step 3: Load the excerpt
    const excerpt = await storage.get(`excerpt:${excerptId}`);
    if (!excerpt) {
      logFailure('injectIncludeContent', 'Excerpt not found', new Error('Excerpt not found'), { excerptId });
      return {
        success: false,
        error: `Excerpt not found: ${excerptId}`
      };
    }

    // Step 4: Render content with variable substitution
    const renderedContent = await renderExcerptContent(excerpt, variableValues || {});

    // Create injected content with simple markers
    // Use a unique marker ID based on localId so each macro instance has its own injection
    const markerStart = `<!-- BLUEPRINT-APP-START-${localId} -->`;
    const markerEnd = `<!-- BLUEPRINT-APP-END-${localId} -->`;
    const injectedContent = `${markerStart}\n${renderedContent}\n${markerEnd}`;

    // Step 5: Check if injected content already exists for this specific macro (by localId)
    const afterMacroPos = match.index + match[0].length;

    // CRITICAL: Search for the marker in what Confluence actually has stored, not what we think we saved
    // Confluence might encode the comment, so look for the pattern flexibly
    const markerPattern = new RegExp(
      `<!--\\s*BLUEPRINT-APP-START-${escapeRegex(localId)}\\s*-->[\\s\\S]*?<!--\\s*BLUEPRINT-APP-END-${escapeRegex(localId)}\\s*-->`,
      'g'
    );

    // Test if the marker exists anywhere in the body
    const testMatch = markerPattern.exec(currentBody);
    const hasExisting = testMatch !== null;

    let modifiedBody;
    if (hasExisting) {
      // Replace the existing injection anywhere in the document
      markerPattern.lastIndex = 0; // Reset regex
      modifiedBody = currentBody.replace(markerPattern, injectedContent);

      // Verify replacement happened
      const replacementHappened = modifiedBody !== currentBody;

      if (!replacementHappened) {
        logWarning('injectIncludeContent', 'Replacement failed even though marker was found', { localId });
      }
    } else {
      // Insert after the macro
      modifiedBody =
        currentBody.substring(0, afterMacroPos) +
        '\n' + injectedContent + '\n' +
        currentBody.substring(afterMacroPos);
    }

    // Step 6: Update the page with injected content
    logPhase('injectIncludeContent', 'Updating page with injected content', { pageId, localId });

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
            value: modifiedBody
          },
          version: {
            number: currentVersion + 1,
            message: `Blueprint App: Injected "${excerpt.name}"`
          }
        })
      }
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      logFailure('injectIncludeContent', 'Failed to update page', new Error(errorText), { pageId, localId, status: updateResponse.status });
      return {
        success: false,
        error: `Failed to update page: ${updateResponse.status}`
      };
    }

    const updatedPage = await updateResponse.json();
    logSuccess('injectIncludeContent', 'Successfully injected', { pageId, localId, newVersion: updatedPage.version.number });

    return {
      success: true,
      message: `Content injected successfully! Refresh the page to see the native content.`,
      pageVersion: updatedPage.version.number
    };

  } catch (error) {
    logFailure('injectIncludeContent', 'Error', error, { pageId: extractedPageId, localId: extractedLocalId });
    return {
      success: false,
      error: error.message || 'Unknown error occurred'
    };
  }
}

// ============================================================================
// NEW: Chapter-Based Injection (Compositor Model)
// ============================================================================

/**
 * Publish a single chapter/Embed to the page
 *
 * Called when user clicks "Publish to Page" in Embed Edit Mode.
 * Renders content with current config (variables, toggles, custom insertions)
 * and injects into the locked Confluence page storage.
 *
 * @param {Object} req - Request object with payload
 * @param {string} req.payload.pageId - Confluence page ID
 * @param {string} req.payload.localId - Embed macro localId
 * @param {string} req.payload.excerptId - Source excerpt ID
 * @returns {Promise<Object>} Result with success status and page version
 */
export async function publishChapter(req) {
  const { 
    pageId, 
    localId, 
    excerptId,
    heading: passedHeading,
    // Accept form values directly from frontend - no dependency on storage!
    variableValues: passedVariableValues,
    toggleStates: passedToggleStates,
    customInsertions: passedCustomInsertions,
    internalNotes: passedInternalNotes,
    complianceLevel: passedComplianceLevel,
    // Freeform mode values
    isFreeformMode: passedIsFreeformMode,
    freeformContent: passedFreeformContent
  } = req.payload || {};

  logFunction('publishChapter', 'START', { pageId, localId, excerptId });

  try {
    // Validate required parameters
    if (!pageId || !localId || !excerptId) {
      return {
        success: false,
        error: 'Missing required parameters: pageId, localId, excerptId'
      };
    }

    // 1. Load Source (excerpt)
    const excerpt = await storage.get(`excerpt:${excerptId}`);
    if (!excerpt) {
      logFailure('publishChapter', 'Source not found', new Error('Not found'), { excerptId });
      return { success: false, error: 'Source not found' };
    }

    // 2. Use values passed from frontend (matches preview exactly)
    // Fall back to storage only if not passed (backward compatibility)
    const embedConfig = await storage.get(`macro-vars:${localId}`) || {};
    
    const variableValues = passedVariableValues || embedConfig.variableValues || {};
    const toggleStates = passedToggleStates || embedConfig.toggleStates || {};
    const customInsertions = passedCustomInsertions || embedConfig.customInsertions || [];
    const internalNotes = passedInternalNotes || embedConfig.internalNotes || [];
    const complianceLevel = passedComplianceLevel !== undefined ? passedComplianceLevel : embedConfig.complianceLevel || null;
    const isFreeformMode = passedIsFreeformMode !== undefined ? passedIsFreeformMode : embedConfig.isFreeformMode || false;
    const freeformContent = passedFreeformContent !== undefined ? passedFreeformContent : embedConfig.freeformContent || '';
    
    logPhase('publishChapter', 'Using form values', {
      toggleStateKeys: Object.keys(toggleStates),
      toggleStateValues: toggleStates,
      variableValueKeys: Object.keys(variableValues),
      customInsertionsCount: customInsertions.length,
      internalNotesCount: Array.isArray(internalNotes) ? internalNotes.length : 0,
      chapterId: embedConfig.chapterId,
      usedPassedValues: !!passedToggleStates,
      isFreeformMode: isFreeformMode
    });

    // 3. Handle content based on mode (freeform vs standard)
    let storageContent;
    
    if (isFreeformMode) {
      // Freeform mode - use raw text content (no Source rendering needed)
      logPhase('publishChapter', 'Using freeform content mode', { 
        freeformContentLength: freeformContent?.length || 0 
      });
      // storageContent will be built by buildFreeformChapter, so we don't need conversion here
      storageContent = null; // Signal to use freeform chapter builder
    } else {
      // Standard mode - render Source content with all settings applied
      let renderedAdf = excerpt.content;

      if (renderedAdf && typeof renderedAdf === 'object' && renderedAdf.type === 'doc') {
        // Log content stats before filtering
        const beforeContentLength = JSON.stringify(renderedAdf).length;
        logPhase('publishChapter', 'Before toggle filtering', { 
          contentLength: beforeContentLength,
          toggleStates: toggleStates,
          hasToggles: JSON.stringify(renderedAdf).includes('{{toggle:')
        });
        
        // Apply transformations in correct order
        renderedAdf = substituteVariablesInAdf(renderedAdf, variableValues);
        renderedAdf = insertCustomParagraphsInAdf(renderedAdf, customInsertions);
        // Pass customInsertions to insertInternalNotesInAdf so it can adjust positions
        // (internal note positions are based on original content, but custom paragraphs are already inserted)
        renderedAdf = insertInternalNotesInAdf(renderedAdf, internalNotes, customInsertions);
        renderedAdf = filterContentByToggles(renderedAdf, toggleStates);
        
        // Log content stats after filtering
        const afterContentLength = JSON.stringify(renderedAdf).length;
        logPhase('publishChapter', 'After toggle filtering', { 
          contentLength: afterContentLength,
          contentReduction: beforeContentLength - afterContentLength
        });
      } else {
        logWarning('publishChapter', 'Content is not ADF format', { excerptId });
      }

      // 4. Convert ADF to storage format
      logPhase('publishChapter', 'Converting ADF to storage format', { excerptId });
      storageContent = await convertAdfToStorage(renderedAdf);
      if (!storageContent) {
        logFailure('publishChapter', 'ADF conversion failed', new Error('Conversion returned null'));
        return { success: false, error: 'Failed to convert content to storage format' };
      }
    }

    // 5. Get current page content
    logPhase('publishChapter', 'Fetching page content', { pageId });
    const pageResponse = await api.asApp().requestConfluence(
      route`/wiki/api/v2/pages/${pageId}?body-format=storage`,
      { headers: { 'Accept': 'application/json' } }
    );

    if (!pageResponse.ok) {
      const errorText = await pageResponse.text();
      logFailure('publishChapter', 'Failed to get page', new Error(errorText), { status: pageResponse.status });
      return { success: false, error: `Failed to get page: ${pageResponse.status}` };
    }

    const pageData = await pageResponse.json();
    let pageBody = pageData.body.storage.value;
    const currentVersion = pageData.version.number;

    // 6. Determine chapter ID (use existing or generate from localId)
    const chapterId = embedConfig.chapterId || `chapter-${localId}`;
    console.log('[publishChapter] DEBUG - chapterId:', chapterId);
    console.log('[publishChapter] DEBUG - embedConfig.chapterId:', embedConfig.chapterId);

    // 7. Check if chapter already exists in page (search by localId for new Content Properties boundaries)
    console.log('[publishChapter] DEBUG - searching for chapter by localId:', localId);
    console.log('[publishChapter] DEBUG - page body length:', pageBody.length);
    
    const existingChapter = findChapter(pageBody, localId);
    console.log('[publishChapter] DEBUG - existingChapter found:', existingChapter !== null);
    if (existingChapter) {
      console.log('[publishChapter] DEBUG - existingChapter.startIndex:', existingChapter.startIndex);
      console.log('[publishChapter] DEBUG - existingChapter.endIndex:', existingChapter.endIndex);
    }

    let newPageBody;

    // Build the chapter HTML (same structure for new or update)
    // Use passed heading or fall back to excerpt name
    const heading = passedHeading || excerpt.name || 'Untitled Chapter';
    
    let chapterHtml;
    if (isFreeformMode) {
      // Use freeform chapter builder for fully custom content
      chapterHtml = buildFreeformChapter({
        chapterId,
        localId,
        heading: heading,
        freeformContent: freeformContent || '',
        complianceLevel
      });
    } else {
      // Strip leading heading from body content to prevent duplicate headings
      // (We add our own heading above the Section macro)
      const cleanedBodyContent = stripLeadingHeading(storageContent);
      
      // Use standard chapter builder with rendered Source content
      chapterHtml = buildChapterStructure({
        chapterId,
        localId,
        heading: heading,
        bodyContent: cleanedBodyContent,
        complianceLevel,
        isBespoke: excerpt.bespoke || false
      });
    }

    if (existingChapter) {
      // Update existing chapter - replace entire layout block
      // (With Locked Page Model, the whole chapter IS the managed content)
      logPhase('publishChapter', 'Replacing existing chapter', { chapterId });
      newPageBody =
        pageBody.substring(0, existingChapter.startIndex) +
        chapterHtml +
        pageBody.substring(existingChapter.endIndex);
    } else {
      // New chapter - append to page
      logPhase('publishChapter', 'Injecting new chapter', { chapterId });
      newPageBody = pageBody.trim() + '\n\n' + chapterHtml;
    }

    // 8. Update page via REST API
    logPhase('publishChapter', 'Updating page', { pageId, newVersion: currentVersion + 1 });
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
            value: newPageBody
          },
          version: {
            number: currentVersion + 1,
            message: `Blueprint: Published "${excerpt.name}"`
          }
        })
      }
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      logFailure('publishChapter', 'Failed to update page', new Error(errorText), { status: updateResponse.status });
      return { success: false, error: `Failed to update page: ${updateResponse.status}` };
    }

    const updatedPage = await updateResponse.json();

    // 9. Update Embed config with published state
    // Store the Source's contentHash and ADF content at publish time for staleness detection
    // This allows us to detect when the Source changes after publishing and show a diff
    const publishedSourceContentHash = excerpt.contentHash || null;
    // Deep clone the Source ADF content to prevent reference issues
    // If we store by reference, updates to the Source will mutate our stored copy
    const publishedSourceContent = excerpt.content 
      ? JSON.parse(JSON.stringify(excerpt.content))
      : null;
    
    // Also store a hash of the rendered content for reference
    const publishedContentHash = calculateContentHash({
      content: storageContent,
      variableValues,
      toggleStates,
      customInsertions,
      internalNotes
    });

    // Save the ACTUAL values used for publishing (not the old embedConfig values)
    // This ensures the form state is persisted correctly
    await storage.set(`macro-vars:${localId}`, {
      // Preserve existing fields from embedConfig that we don't override
      ...embedConfig,
      // Save the values that were actually used for publishing
      variableValues,
      toggleStates,
      customInsertions,
      internalNotes,
      // Freeform mode values
      isFreeformMode,
      freeformContent,
      // Publish metadata
      chapterId,
      excerptId,
      publishedAt: new Date().toISOString(),
      publishedContentHash,
      publishedSourceContentHash, // Source's contentHash at publish time (for staleness detection)
      publishedSourceContent, // Source's ADF content at publish time (for diff view)
      publishedVersion: updatedPage.version.number,
      // Clear cached incomplete status (no longer incomplete once published)
      cachedIncomplete: false,
      // Update sync timestamp
      lastSynced: new Date().toISOString()
    });

    logSuccess('publishChapter', 'Successfully published', {
      pageId,
      localId,
      chapterId,
      newVersion: updatedPage.version.number
    });

    return {
      success: true,
      message: 'Chapter published successfully',
      pageVersion: updatedPage.version.number,
      publishedAt: new Date().toISOString(),
      chapterId
    };

  } catch (error) {
    logFailure('publishChapter', 'Unexpected error', error, { pageId, localId, excerptId });
    return {
      success: false,
      error: error.message || 'Unknown error occurred'
    };
  }
}

/**
 * Get publish status for an Embed
 *
 * Returns whether the Embed has been published, when, and the content hash.
 * Used by the UI to show publish status and detect if republish is needed.
 *
 * @param {Object} req - Request object with payload
 * @param {string} req.payload.localId - Embed macro localId
 * @returns {Promise<Object>} Publish status data
 */
export async function getPublishStatus(req) {
  const { localId } = req.payload || {};

  try {
    if (!localId) {
      return { success: false, error: 'Missing required parameter: localId' };
    }

    const embedConfig = await storage.get(`macro-vars:${localId}`);

    if (!embedConfig) {
      return {
        success: true,
        data: {
          isPublished: false,
          publishedAt: null,
          publishedContentHash: null,
          publishedVersion: null,
          chapterId: null
        }
      };
    }

    return {
      success: true,
      data: {
        isPublished: !!embedConfig.publishedAt,
        publishedAt: embedConfig.publishedAt || null,
        publishedContentHash: embedConfig.publishedContentHash || null,
        publishedVersion: embedConfig.publishedVersion || null,
        chapterId: embedConfig.chapterId || null
      }
    };
  } catch (error) {
    logFailure('getPublishStatus', 'Error', error, { localId });
    return { success: false, error: error.message };
  }
}

/**
 * Inject placeholder for unpublished chapter
 *
 * Creates an "Under Construction" placeholder when a chapter is added
 * via Compositor but not yet configured/published.
 *
 * @param {Object} req - Request object with payload
 * @param {string} req.payload.pageId - Confluence page ID
 * @param {string} req.payload.localId - Embed macro localId
 * @param {string} req.payload.excerptId - Source excerpt ID
 * @param {string} req.payload.heading - Chapter heading text
 * @returns {Promise<Object>} Result with success status
 */
export async function injectPlaceholder(req) {
  const { pageId, localId, excerptId, heading } = req.payload || {};

  logFunction('injectPlaceholder', 'START', { pageId, localId, heading });

  try {
    if (!pageId || !localId) {
      return { success: false, error: 'Missing required parameters: pageId, localId' };
    }

    // Get page content
    const pageResponse = await api.asApp().requestConfluence(
      route`/wiki/api/v2/pages/${pageId}?body-format=storage`,
      { headers: { 'Accept': 'application/json' } }
    );

    if (!pageResponse.ok) {
      const errorText = await pageResponse.text();
      logFailure('injectPlaceholder', 'Failed to get page', new Error(errorText));
      return { success: false, error: 'Failed to get page' };
    }

    const pageData = await pageResponse.json();
    const pageBody = pageData.body.storage.value;
    const currentVersion = pageData.version.number;

    const chapterId = `chapter-${localId}`;

    // Check if chapter already exists (search by localId for new Content Properties boundaries)
    if (findChapter(pageBody, localId)) {
      logPhase('injectPlaceholder', 'Chapter already exists', { localId, chapterId });
      return { success: true, message: 'Chapter already exists', chapterId };
    }

    // Build placeholder
    // Placeholder uses 'tbd' compliance level by default since no Source is selected yet
    const placeholderHtml = buildChapterPlaceholder({
      chapterId,
      localId,
      heading: heading || 'New Chapter',
      complianceLevel: 'tbd',
      isBespoke: false
    });

    const newPageBody = pageBody.trim() + '\n\n' + placeholderHtml;

    // Update page
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
            value: newPageBody
          },
          version: {
            number: currentVersion + 1,
            message: 'Blueprint: Added chapter placeholder'
          }
        })
      }
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      logFailure('injectPlaceholder', 'Failed to update page', new Error(errorText));
      return { success: false, error: 'Failed to update page' };
    }

    // Save chapter ID in embed config
    const embedConfig = await storage.get(`macro-vars:${localId}`) || {};
    await storage.set(`macro-vars:${localId}`, {
      ...embedConfig,
      chapterId,
      excerptId: excerptId || embedConfig.excerptId
    });

    logSuccess('injectPlaceholder', 'Placeholder injected', { chapterId });

    return { success: true, chapterId };

  } catch (error) {
    logFailure('injectPlaceholder', 'Error', error, { pageId, localId });
    return { success: false, error: error.message };
  }
}

/**
 * Remove a chapter from a page
 *
 * Removes the chapter content and markers from page storage.
 * Called when user opts out of a chapter via Compositor.
 *
 * @param {Object} req - Request object with payload
 * @param {string} req.payload.pageId - Confluence page ID
 * @param {string} req.payload.chapterId - Chapter ID to remove
 * @returns {Promise<Object>} Result with success status
 */
export async function removeChapterFromPage(req) {
  const { pageId, chapterId } = req.payload || {};

  logFunction('removeChapterFromPage', 'START', { pageId, chapterId });

  try {
    if (!pageId || !chapterId) {
      return { success: false, error: 'Missing required parameters: pageId, chapterId' };
    }

    // Get page content
    const pageResponse = await api.asApp().requestConfluence(
      route`/wiki/api/v2/pages/${pageId}?body-format=storage`,
      { headers: { 'Accept': 'application/json' } }
    );

    if (!pageResponse.ok) {
      return { success: false, error: 'Failed to get page' };
    }

    const pageData = await pageResponse.json();
    const pageBody = pageData.body.storage.value;
    const currentVersion = pageData.version.number;

    // Extract localId from chapterId (format: "chapter-{localId}")
    // findChapter now searches by localId for new Content Properties boundaries
    const localId = chapterId.startsWith('chapter-') ? chapterId.slice(8) : chapterId;

    // Find and remove chapter
    const chapter = findChapter(pageBody, localId);
    if (!chapter) {
      return { success: true, message: 'Chapter not found (already removed)' };
    }

    // Remove the chapter content
    const before = pageBody.substring(0, chapter.startIndex).trimEnd();
    const after = pageBody.substring(chapter.endIndex).trimStart();
    const newPageBody = before + (before && after ? '\n\n' : '') + after;

    // Update page
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
            value: newPageBody
          },
          version: {
            number: currentVersion + 1,
            message: `Blueprint: Removed chapter`
          }
        })
      }
    );

    if (!updateResponse.ok) {
      return { success: false, error: 'Failed to update page' };
    }

    logSuccess('removeChapterFromPage', 'Chapter removed', { chapterId });

    return { success: true, message: 'Chapter removed' };

  } catch (error) {
    logFailure('removeChapterFromPage', 'Error', error, { pageId, chapterId });
    return { success: false, error: error.message };
  }
}
