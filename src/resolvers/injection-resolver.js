/**
 * Content Injection Resolver
 *
 * Handles manual injection of rendered excerpt content into page storage.
 * Called when user clicks the "Inject Content" button in the Include macro UI.
 */

import api, { route } from '@forge/api';
import { storage } from '@forge/api';
import { logFunction, logPhase, logSuccess, logFailure, logWarning } from '../utils/forge-logger.js';

// Helper function to escape regex special characters
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Helper function to convert ADF to storage format using Confluence API
async function convertAdfToStorage(adfContent) {
  logPhase('convertAdfToStorage', 'Converting ADF to storage format via API', {});

  try {
    const response = await api.asApp().requestConfluence(
      route`/wiki/rest/api/contentbody/convert/storage`,
      {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          value: JSON.stringify(adfContent),
          representation: 'atlas_doc_format'
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      logFailure('convertAdfToStorage', 'ADF conversion failed', new Error(errorText), { status: response.status });
      return null;
    }

    const result = await response.json();
    logSuccess('convertAdfToStorage', 'ADF successfully converted to storage format', {});
    return result.value; // The converted storage format HTML
  } catch (error) {
    logFailure('convertAdfToStorage', 'Error converting ADF', error);
    return null;
  }
}

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
