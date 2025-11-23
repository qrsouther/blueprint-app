/**
 * Page Published Handler
 *
 * This function is triggered when a Confluence page is published.
 * It scans the page for Blueprint App Include macros and automatically injects
 * their rendered content into the page storage as native Confluence content.
 */

import api, { route } from '@forge/api';
import { storage } from '@forge/api';
import { logFunction, logPhase, logSuccess, logFailure } from './utils/forge-logger.js';

// Helper function to escape regex special characters
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Helper function to parse macro parameters from XML
function parseMacroParameters(macroXml) {
  const params = {};

  // Extract ac:parameter elements
  const paramPattern = /<ac:parameter\s+ac:name="([^"]+)">([^<]*)<\/ac:parameter>/g;
  let match;

  while ((match = paramPattern.exec(macroXml)) !== null) {
    const paramName = match[1];
    const paramValue = match[2];

    // Try to parse as JSON for complex values (like variableValues object)
    try {
      params[paramName] = JSON.parse(paramValue);
    } catch (e) {
      params[paramName] = paramValue;
    }
  }

  return params;
}

// Helper function to render excerpt content with variable substitution
function renderExcerptContent(excerpt, variableValues = {}) {
  let content = excerpt.content || '';

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

export async function handler(event) {
  const { content, updateTrigger } = event;
  const pageId = content?.id || null; // Extract for use in catch block
  const pageTitle = content?.title;
  
  try {

    logFunction('pagePublishedHandler', 'TRIGGER FIRED', { eventType: event?.eventType, pageId, pageTitle, updateTrigger });

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
      logFailure('pagePublishedHandler', 'Failed to get page', new Error(errorText), { pageId, status: pageResponse.status });
      return;
    }

    const pageData = await pageResponse.json();
    const currentBody = pageData.body.storage.value;
    const currentVersion = pageData.version.number;

    // Step 2: Find all Blueprint App Include macros in the page
    const includeMacroPattern = /<ac:structured-macro[^>]*ac:name="smart-excerpt-include"[^>]*ac:macro-id="([^"]+)"[^>]*>(.*?)<\/ac:structured-macro>/gs;
    const macros = [];
    let match;

    while ((match = includeMacroPattern.exec(currentBody)) !== null) {
      const macroId = match[1];
      const macroBody = match[2];
      const params = parseMacroParameters(match[0]);

      macros.push({
        fullMatch: match[0],
        macroId,
        macroBody,
        params,
        index: match.index
      });
    }

    if (macros.length === 0) {
      return;
    }

    // Step 3: Inject content for each macro
    let modifiedBody = currentBody;
    let injectionCount = 0;

    for (const macro of macros.reverse()) { // Reverse to maintain indices
      const excerptId = macro.params.excerptId;
      if (!excerptId) {
        continue;
      }

      // Load the excerpt
      const excerpt = await storage.get(`excerpt:${excerptId}`);
      if (!excerpt) {
        logFailure('pagePublishedHandler', 'Excerpt not found', new Error('Excerpt not found'), { pageId, macroId: macro.macroId, excerptId });
        continue;
      }

      // Render content with variable substitution
      const variableValues = macro.params.variableValues || {};
      const renderedContent = renderExcerptContent(excerpt, variableValues);

      // Create injected content (native Confluence storage format)
      const injectedContent = `
<!-- INJECTED BY BLUEPRINT APP -->
${renderedContent}
<!-- END BLUEPRINT APP INJECTION -->
`;

      // Check if injected content already exists for this macro
      const injectedPattern = new RegExp(
        `<!-- INJECTED BY BLUEPRINT APP -->.*?<!-- END BLUEPRINT APP INJECTION -->`,
        'gs'
      );

      // Find injection immediately after this specific macro
      const afterMacroPos = macro.index + macro.fullMatch.length;
      const nextMacroPos = macros.find(m => m.index > macro.index)?.index || modifiedBody.length;
      const afterMacroSection = modifiedBody.substring(afterMacroPos, nextMacroPos);

      if (injectedPattern.test(afterMacroSection)) {
        // Replace the first occurrence after this macro
        const beforeMacro = modifiedBody.substring(0, afterMacroPos);
        const afterSection = modifiedBody.substring(afterMacroPos);
        const updatedAfterSection = afterSection.replace(injectedPattern, injectedContent);
        modifiedBody = beforeMacro + updatedAfterSection;
      } else {
        // Insert after the macro
        modifiedBody =
          modifiedBody.substring(0, afterMacroPos) +
          '\n' + injectedContent + '\n' +
          modifiedBody.substring(afterMacroPos);
      }

      injectionCount++;
    }

    if (injectionCount === 0) {
      return;
    }

    // Step 4: Update the page with injected content
    logPhase('pagePublishedHandler', 'Updating page with injected content', { pageId, injectionCount });

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
            message: 'Blueprint App: Auto-injected excerpt content'
          }
        })
      }
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      logFailure('pagePublishedHandler', 'Failed to update page', new Error(errorText), { pageId, status: updateResponse.status });
      return;
    }

    const updatedPage = await updateResponse.json();
    logSuccess('pagePublishedHandler', 'Successfully injected excerpts', { pageId, injectionCount, newVersion: updatedPage.version.number });

  } catch (error) {
    logFailure('pagePublishedHandler', 'Error', error, { pageId });
  }
}
