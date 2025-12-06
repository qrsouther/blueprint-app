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
  findEmbedMacroPosition,
  stripLeadingHeading
} from '../utils/storage-format-utils.js';
import {
  filterContentByToggles,
  substituteVariablesInAdf,
  insertCustomParagraphsInAdf,
  insertInternalNotesInAdf
} from '../utils/adf-rendering-utils.js';
import { calculateContentHash } from '../utils/hash-utils.js';
import { addEmbedToIndex } from './redline-resolvers.js';

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

  // Substitute variables (use empty string for unset variables on published pages)
  if (excerpt.variables && Array.isArray(excerpt.variables)) {
    excerpt.variables.forEach(variable => {
      const value = variableValues[variable.name] || '';
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
    freeformContent: passedFreeformContent,
    // Smart casing preference
    smartCasingEnabled: passedSmartCasingEnabled
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
    // Smart casing defaults to true for backwards compatibility
    const smartCasingEnabled = passedSmartCasingEnabled !== undefined ? passedSmartCasingEnabled : embedConfig.smartCasingEnabled !== false;
    
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
        const beforeContentNodes = renderedAdf.content?.length || 0;
        logPhase('publishChapter', 'Before toggle filtering', { 
          contentLength: beforeContentLength,
          contentNodes: beforeContentNodes,
          toggleStates: toggleStates,
          hasToggles: JSON.stringify(renderedAdf).includes('{{toggle:')
        });
        
        // Apply transformations in correct order
        // Pass excerpt.variables for smart case matching (auto-capitalize at sentence starts)
        // Pass disableSmartCase option based on user's Smart Casing toggle preference
        // Pass removeUnset: true to ensure null variables don't show {{varName}} on published pages
        renderedAdf = substituteVariablesInAdf(
          renderedAdf, 
          variableValues, 
          excerpt.variables,
          { disableSmartCase: !smartCasingEnabled, removeUnset: true }
        );
        renderedAdf = insertCustomParagraphsInAdf(renderedAdf, customInsertions);
        // Pass customInsertions to insertInternalNotesInAdf so it can adjust positions
        // (internal note positions are based on original content, but custom paragraphs are already inserted)
        renderedAdf = insertInternalNotesInAdf(renderedAdf, internalNotes, customInsertions);
        renderedAdf = filterContentByToggles(renderedAdf, toggleStates);
        
        // Log content stats after filtering
        const afterContentLength = JSON.stringify(renderedAdf).length;
        const afterContentNodes = renderedAdf.content?.length || 0;
        logPhase('publishChapter', 'After toggle filtering', { 
          contentLength: afterContentLength,
          contentNodes: afterContentNodes,
          contentReduction: beforeContentLength - afterContentLength,
          nodesReduction: beforeContentNodes - afterContentNodes
        });
        
        // Validate that content is not empty after filtering
        if (!renderedAdf.content || renderedAdf.content.length === 0) {
          logFailure('publishChapter', 'Content is empty after filtering', new Error('No content remaining after toggle filtering'), {
            excerptId,
            localId,
            toggleStates,
            beforeContentNodes,
            afterContentNodes
          });
          return { 
            success: false, 
            error: 'Content is empty after applying toggles. Please ensure at least one toggle is enabled or disable all toggles to show all content.' 
          };
        }
      } else {
        logWarning('publishChapter', 'Content is not ADF format', { excerptId, localId, contentType: typeof renderedAdf });
        return { 
          success: false, 
          error: `Source content is not in ADF format. Content type: ${typeof renderedAdf}` 
        };
      }

      // 4. Convert ADF to storage format
      logPhase('publishChapter', 'Converting ADF to storage format', { excerptId, localId });
      storageContent = await convertAdfToStorage(renderedAdf);
      if (!storageContent || (typeof storageContent === 'string' && storageContent.trim().length === 0)) {
        logFailure('publishChapter', 'ADF conversion failed', new Error('Conversion returned null or empty'), {
          excerptId,
          localId,
          renderedAdfType: typeof renderedAdf,
          renderedAdfHasContent: !!renderedAdf,
          renderedAdfContentLength: renderedAdf?.content?.length || 0,
          renderedAdfStringLength: JSON.stringify(renderedAdf).length
        });
        return { success: false, error: 'Failed to convert content to storage format (conversion returned empty result). This may indicate the content structure is invalid or incompatible.' };
      }
      
      logPhase('publishChapter', 'ADF conversion successful', {
        excerptId,
        localId,
        storageContentLength: storageContent.length
      });
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
    logPhase('publishChapter', 'Determining chapter ID', { 
      chapterId, 
      embedConfigChapterId: embedConfig.chapterId,
      localId 
    });

    // 7. Find the Embed macro position - this is always our anchor point
    logPhase('publishChapter', 'Finding Embed macro position', { 
      localId, 
      pageBodyLength: pageBody.length 
    });
    
    const embedPosition = findEmbedMacroPosition(pageBody, localId);
    
    if (!embedPosition) {
      logFailure('publishChapter', 'Embed macro not found in page', new Error('Embed macro not found'), {
        localId,
        pageId,
        pageBodyLength: pageBody.length
      });
      return { 
        success: false, 
        error: 'Embed macro not found in page. The Embed may have been deleted or moved.' 
      };
    }
    
    logPhase('publishChapter', 'Found Embed macro', {
      localId,
      embedStart: embedPosition.position,
      embedEnd: embedPosition.macroEnd
    });

    // 8. Build the chapter HTML
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
        complianceLevel,
        headless: excerpt.headless || false
      });
    } else {
      // Strip leading heading from body content to prevent duplicate headings
      // (We add our own heading above the Section macro)
      const cleanedBodyContent = stripLeadingHeading(storageContent);
      
      // Use standard chapter builder with rendered Source content
      // Include documentation links (only for standard/bespoke/semi-standard, not freeform)
      chapterHtml = buildChapterStructure({
        chapterId,
        localId,
        heading: heading,
        bodyContent: cleanedBodyContent,
        complianceLevel,
        isBespoke: excerpt.bespoke || false,
        documentationLinks: excerpt.documentationLinks || [],
        headless: excerpt.headless || false
      });
    }

    // 9. Search for existing chapter boundaries AFTER the Embed macro
    // This ensures we always anchor on the Embed position
    const contentAfterEmbed = pageBody.substring(embedPosition.macroEnd);
    const startMarkerId = `blueprint-start-${localId}`;
    const endMarkerId = `blueprint-end-${localId}`;
    const startMarkerPattern = `<ac:parameter ac:name="id">${startMarkerId}</ac:parameter>`;
    const endMarkerPattern = `<ac:parameter ac:name="id">${endMarkerId}</ac:parameter>`;
    
    const startMarkerRelativeIndex = contentAfterEmbed.indexOf(startMarkerPattern);
    const endMarkerRelativeIndex = contentAfterEmbed.indexOf(endMarkerPattern);
    
    let newPageBody;
    
    if (startMarkerRelativeIndex !== -1 && endMarkerRelativeIndex !== -1) {
      // Existing chapter found after Embed - replace it
      // Find the full boundaries (need to find the opening/closing of the details macros)
      const beforeStartMarker = contentAfterEmbed.substring(0, startMarkerRelativeIndex);
      const chapterStartOffset = beforeStartMarker.lastIndexOf('<ac:structured-macro');
      
      if (chapterStartOffset !== -1) {
        const afterEndMarker = contentAfterEmbed.indexOf('</ac:structured-macro>', endMarkerRelativeIndex);
        if (afterEndMarker !== -1) {
          const chapterEndOffset = afterEndMarker + '</ac:structured-macro>'.length;
          
          // Calculate absolute positions
          const absoluteChapterStart = embedPosition.macroEnd + chapterStartOffset;
          const absoluteChapterEnd = embedPosition.macroEnd + chapterEndOffset;
          
          logPhase('publishChapter', 'Replacing existing chapter after Embed', {
            localId,
            chapterId,
            absoluteChapterStart,
            absoluteChapterEnd
          });
          
          newPageBody =
            pageBody.substring(0, absoluteChapterStart) +
            chapterHtml +
            pageBody.substring(absoluteChapterEnd);
        }
      }
    }
    
    // If we didn't replace (no existing chapter or couldn't parse boundaries), insert new
    if (!newPageBody) {
      logPhase('publishChapter', 'Inserting new chapter after Embed', {
        localId,
        chapterId,
        insertPosition: embedPosition.macroEnd
      });
      
      newPageBody =
        pageBody.substring(0, embedPosition.macroEnd) +
        '\n\n' + chapterHtml + '\n' +
        pageBody.substring(embedPosition.macroEnd);
    }

    // 10. Validate that chapterHtml is not empty
    if (!chapterHtml || chapterHtml.trim().length === 0) {
      logFailure('publishChapter', 'Chapter HTML is empty', new Error('Empty chapter HTML'), { localId, chapterId });
      return { success: false, error: 'Generated chapter content is empty' };
    }

    // 11. Validate that newPageBody contains the chapter markers
    // (startMarkerId and endMarkerId are already defined in step 9)
    if (!newPageBody.includes(startMarkerId) || !newPageBody.includes(endMarkerId)) {
      logFailure('publishChapter', 'Chapter markers missing from page body', new Error('Markers not found'), { 
        localId, 
        chapterId,
        hasStartMarker: newPageBody.includes(startMarkerId),
        hasEndMarker: newPageBody.includes(endMarkerId),
        chapterHtmlLength: chapterHtml.length
      });
      return { success: false, error: 'Chapter markers missing from generated content' };
    }

    // 12. Update page via REST API
    logPhase('publishChapter', 'Updating page', { 
      pageId, 
      newVersion: currentVersion + 1,
      newPageBodyLength: newPageBody.length,
      chapterHtmlLength: chapterHtml.length
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
      logFailure('publishChapter', 'Failed to update page', new Error(errorText), { 
        status: updateResponse.status,
        pageId,
        localId,
        chapterId
      });
      return { success: false, error: `Failed to update page: ${updateResponse.status}` };
    }

    const updatedPage = await updateResponse.json();
    
    // Verify the content was actually persisted by reading it back
    logPhase('publishChapter', 'Verifying content was persisted', { pageId, localId });
    const verifyResponse = await api.asApp().requestConfluence(
      route`/wiki/api/v2/pages/${pageId}?body-format=storage`,
      { headers: { 'Accept': 'application/json' } }
    );
    
    if (verifyResponse.ok) {
      const verifyPageData = await verifyResponse.json();
      const verifyPageBody = verifyPageData.body.storage.value;
      const verifyChapter = findChapter(verifyPageBody, localId);
      
      if (!verifyChapter) {
        // Check if markers exist in the page body (even if findChapter didn't find them)
        const startMarkerId = `blueprint-start-${localId}`;
        const endMarkerId = `blueprint-end-${localId}`;
        const hasStartMarker = verifyPageBody.includes(startMarkerId);
        const hasEndMarker = verifyPageBody.includes(endMarkerId);
        
        logFailure('publishChapter', 'Content verification failed - chapter not found after update', new Error('Content not persisted'), {
          pageId,
          localId,
          chapterId,
          pageVersion: updatedPage.version.number,
          pageBodyLength: verifyPageBody.length,
          hasStartMarker,
          hasEndMarker,
          startMarkerPattern: `<ac:parameter ac:name="id">${startMarkerId}</ac:parameter>`,
          endMarkerPattern: `<ac:parameter ac:name="id">${endMarkerId}</ac:parameter>`
        });
        
        // If markers exist but findChapter didn't find them, it's a detection issue, not a persistence issue
        if (hasStartMarker && hasEndMarker) {
          logWarning('publishChapter', 'Markers exist but findChapter failed - may be a detection issue', {
            localId,
            pageId
          });
          // Don't fail - the content is likely there, just not detected correctly
        } else {
          return { 
            success: false, 
            error: `Page update succeeded but content was not persisted. Markers missing: start=${!hasStartMarker}, end=${!hasEndMarker}. This may indicate a Confluence validation issue or content was stripped.` 
          };
        }
      }
      
      logPhase('publishChapter', 'Content verification successful', {
        pageId,
        localId,
        chapterId,
        verifiedChapterLength: verifyChapter.content.length
      });
    } else {
      logWarning('publishChapter', 'Could not verify content persistence (verification request failed)', {
        pageId,
        localId,
        status: verifyResponse.status
      });
      // Don't fail the publish if verification fails - just log a warning
    }

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

    // Auto-transition to "reviewable" on ANY republish
    // Publishing new content always requires re-review, regardless of previous status
    const previousStatus = embedConfig.redlineStatus || 'reviewable';
    const newRedlineStatus = 'reviewable';
    let statusHistory = embedConfig.statusHistory || [];
    let lastChangedBy = embedConfig.lastChangedBy;
    let lastChangedAt = embedConfig.lastChangedAt;

    // Only log transition if status is actually changing
    if (previousStatus !== 'reviewable') {
      statusHistory = [...statusHistory, {
        status: 'reviewable',
        previousStatus,
        changedBy: 'system',
        changedAt: new Date().toISOString(),
        reason: 'Embed republished (auto-transition)'
      }];
      lastChangedBy = 'system';
      lastChangedAt = new Date().toISOString();
      
      logPhase('publishChapter', `AUTO-TRANSITION: ${previousStatus} → reviewable`, { localId });
    }

    // Save the ACTUAL values used for publishing (not the old embedConfig values)
    // This ensures the form state is persisted correctly
    const publishedAtTimestamp = new Date().toISOString();
    const lastChangedAtFinal = lastChangedAt || publishedAtTimestamp;
    
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
      pageId, // Store pageId for index lookups
      pageTitle: pageData.title, // Store pageTitle for display
      publishedAt: publishedAtTimestamp,
      publishedContentHash,
      publishedSourceContentHash, // Source's contentHash at publish time (for staleness detection)
      publishedSourceContent, // Source's ADF content at publish time (for diff view)
      publishedVersion: updatedPage.version.number,
      // Clear cached incomplete status (no longer incomplete once published)
      cachedIncomplete: false,
      // Update sync timestamp
      lastSynced: publishedAtTimestamp,
      // Redline status (may be auto-transitioned from needs-revision to reviewable)
      redlineStatus: newRedlineStatus,
      statusHistory,
      lastChangedBy,
      lastChangedAt: lastChangedAtFinal
    });

    // Update the published embeds index for fast Redline Queue loading
    await addEmbedToIndex(localId, pageId, newRedlineStatus, lastChangedAtFinal, excerptId);

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

    // Get excerpt to check for headless property (if excerptId is provided)
    let isHeadless = false;
    if (excerptId) {
      const excerpt = await storage.get(`excerpt:${excerptId}`);
      if (excerpt) {
        isHeadless = excerpt.headless || false;
      }
    }

    // Build placeholder
    // Placeholder uses 'tbd' compliance level by default since no Source is selected yet
    const placeholderHtml = buildChapterPlaceholder({
      chapterId,
      localId,
      heading: heading || 'New Chapter',
      complianceLevel: 'tbd',
      isBespoke: false,
      headless: isHeadless
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

/**
 * Insert a new Embed macro above an existing one
 *
 * Creates a new Embed macro in the page storage directly ABOVE the specified
 * Embed. The new Embed is pre-attached to the same Source as the existing one,
 * allowing users to create a "clone" chapter that can be independently configured.
 *
 * @param {Object} req - Request object with payload
 * @param {string} req.payload.pageId - Confluence page ID
 * @param {string} req.payload.localId - Current Embed's localId (insert above this)
 * @param {string} req.payload.excerptId - Source ID to attach to the new Embed
 * @returns {Promise<Object>} Result with success status and newLocalId
 */
export async function insertEmbedAbove(req) {
  const { pageId, localId, excerptId } = req.payload || {};

  logFunction('insertEmbedAbove', 'START', { pageId, localId, excerptId });

  try {
    if (!pageId || !localId || !excerptId) {
      return { success: false, error: 'Missing required parameters: pageId, localId, excerptId' };
    }

    // 1. Generate a new UUID for the new Embed
    const newLocalId = crypto.randomUUID();
    logPhase('insertEmbedAbove', 'Generated new localId', { newLocalId });

    // 2. Get page content
    const pageResponse = await api.asApp().requestConfluence(
      route`/wiki/api/v2/pages/${pageId}?body-format=storage`,
      { headers: { 'Accept': 'application/json' } }
    );

    if (!pageResponse.ok) {
      const errorText = await pageResponse.text();
      logFailure('insertEmbedAbove', 'Failed to get page', new Error(errorText));
      return { success: false, error: 'Failed to get page' };
    }

    const pageData = await pageResponse.json();
    const pageBody = pageData.body.storage.value;
    const currentVersion = pageData.version.number;

    // 3. Find the current Embed macro position
    const embedPosition = findEmbedMacroPosition(pageBody, localId);
    
    if (!embedPosition) {
      logFailure('insertEmbedAbove', 'Embed macro not found in page', new Error('Embed not found'), { localId });
      return { success: false, error: 'Embed macro not found in page. It may have been deleted or moved.' };
    }

    logPhase('insertEmbedAbove', 'Found Embed position', { 
      position: embedPosition.position, 
      macroEnd: embedPosition.macroEnd 
    });

    // 4. Extract extension-key from the existing Embed macro to use the same environment
    // This is more reliable than trying to extract from context, which varies by call source
    const existingMacroContent = pageBody.substring(embedPosition.position, embedPosition.macroEnd);
    
    // Extract extension-key from existing macro
    const extensionKeyMatch = existingMacroContent.match(/<ac:adf-attribute key="extension-key">([^<]+)<\/ac:adf-attribute>/);
    if (!extensionKeyMatch) {
      logFailure('insertEmbedAbove', 'Could not extract extension-key from existing Embed', new Error('Missing extension-key'));
      return { success: false, error: 'Could not determine Embed configuration from existing macro.' };
    }
    
    const extensionKey = extensionKeyMatch[1];
    const extensionId = `ari:cloud:ecosystem::extension/${extensionKey}`;
    
    // Extract environment info from extension-key (format: APP_ID/ENV_ID/static/MACRO_KEY)
    const keyParts = extensionKey.split('/');
    const ENV_ID = keyParts[1] || 'ae38f536-b4c8-4dfa-a1c9-62026d61b4f9';
    
    // Determine environment label based on whether we're using the development env ID
    const isDevelopment = ENV_ID === 'ae38f536-b4c8-4dfa-a1c9-62026d61b4f9';
    const envLabel = isDevelopment ? ' (Development)' : '';
    const forgeEnv = isDevelopment ? 'DEVELOPMENT' : 'PRODUCTION';

    logPhase('insertEmbedAbove', 'Using extension config from existing Embed', { 
      extensionKey, 
      ENV_ID, 
      isDevelopment 
    });

    const newEmbedMacro = `<ac:adf-extension><ac:adf-node type="extension"><ac:adf-attribute key="extension-key">${extensionKey}</ac:adf-attribute><ac:adf-attribute key="extension-type">com.atlassian.ecosystem</ac:adf-attribute><ac:adf-attribute key="parameters"><ac:adf-parameter key="local-id">${newLocalId}</ac:adf-parameter><ac:adf-parameter key="extension-id">${extensionId}</ac:adf-parameter><ac:adf-parameter key="extension-title">🎯 Blueprint App - Embed${envLabel}</ac:adf-parameter><ac:adf-parameter key="layout">default</ac:adf-parameter><ac:adf-parameter key="forge-environment">${forgeEnv}</ac:adf-parameter><ac:adf-parameter key="render">native</ac:adf-parameter></ac:adf-attribute><ac:adf-attribute key="text">🎯 Blueprint App - Embed${envLabel}</ac:adf-attribute><ac:adf-attribute key="layout">default</ac:adf-attribute><ac:adf-attribute key="local-id">${newLocalId}</ac:adf-attribute></ac:adf-node></ac:adf-extension>`;

    // 5. Insert the new macro BEFORE the current Embed's position
    const beforeEmbed = pageBody.substring(0, embedPosition.position);
    const afterEmbed = pageBody.substring(embedPosition.position);
    const newPageBody = beforeEmbed + newEmbedMacro + '\n\n' + afterEmbed;

    // 6. Initialize storage for the new Embed with the same excerptId
    await storage.set(`macro-vars:${newLocalId}`, {
      excerptId,
      pageId,
      variableValues: {},
      toggleStates: {},
      customInsertions: [],
      internalNotes: [],
      createdAt: new Date().toISOString()
    });

    logPhase('insertEmbedAbove', 'Initialized storage for new Embed', { newLocalId, excerptId });

    // 7. Update the page
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
            message: 'Blueprint: Added new chapter above'
          }
        })
      }
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      logFailure('insertEmbedAbove', 'Failed to update page', new Error(errorText));
      // Clean up the storage we created since page update failed
      await storage.delete(`macro-vars:${newLocalId}`);
      return { success: false, error: 'Failed to update page' };
    }

    logSuccess('insertEmbedAbove', 'New Embed inserted above', { 
      newLocalId, 
      excerptId,
      pageId 
    });

    return { 
      success: true, 
      newLocalId,
      message: 'New chapter inserted above. Reload the page to see it.'
    };

  } catch (error) {
    logFailure('insertEmbedAbove', 'Error', error, { pageId, localId, excerptId });
    return { success: false, error: error.message };
  }
}
