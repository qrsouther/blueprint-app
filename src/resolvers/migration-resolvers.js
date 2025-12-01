/* eslint-disable no-console */
/**
 * Migration Resolver Functions
 *
 * ⚠️ ONE-TIME USE ONLY - READY FOR DELETION AFTER PRODUCTION MIGRATION ⚠️
 *
 * This module contains all one-time migration operations for converting from
 * MultiExcerpt to Blueprint App. These functions will be used ONCE during the
 * initial production setup, then can be safely deleted.
 *
 * Note: Console statements are intentionally left for migration debugging.
 *
 * DELETION CHECKLIST (after production migration complete):
 * 1. Delete this entire file (migration-resolvers.js)
 * 2. Remove imports from index.js (lines ~41-52)
 * 3. Remove resolver registrations from index.js (lines ~1067-1091)
 * 4. Remove getMigrationStatus and getMultiExcerptScanProgress from simple-resolvers.js
 * 5. Remove migration UI code from admin-page.jsx (search for SHOW_MIGRATION_TOOLS)
 * 6. Remove migration state variables from admin-page.jsx (lines ~126-138)
 *
 * Extracted during Phase 4 of index.js modularization.
 *
 * Functions in this file (all one-time use):
 * - importFromMultiExcerpt: Create Blueprint App from MultiExcerpt data
 * - trackMigration: Manually track migration status
 * - scanMultiExcerptIncludes: Scan pages for old MultiExcerpt include macros
 * - bulkImportSources: Import multiple sources from JSON export
 * - createSourceMacrosOnPage: Create Source macros on a destination page
 * - convertMultiExcerptsOnPage: Convert MultiExcerpt macros to Blueprint App
 * - bulkInitializeAllExcerpts: Initialize all 147 excerpts with hardcoded mappings
 */

import { storage } from '@forge/api';
import api, { route } from '@forge/api';
import { generateUUID } from '../utils.js';
import { updateExcerptIndex } from '../utils/storage-utils.js';
import { storageToPlainText, cleanMultiExcerptMacros } from '../utils/migration-utils.js';
import { logFunction, logSuccess, logFailure } from '../utils/forge-logger.js';

/**
 * Import a MultiExcerpt as a Blueprint App
 */
export async function importFromMultiExcerpt(req) {
  try {
    const { name, storageContent, sourcePageId, sourcePageTitle, sourcePageUrl, category } = req.payload;

    // Generate new excerpt ID
    const excerptId = generateUUID();

    // Convert storage format content to plain text for display/search
    const plainTextContent = storageToPlainText(storageContent);

    // Create the new excerpt
    const excerpt = {
      id: excerptId,
      name: name,
      category: category || 'Migrated from MultiExcerpt',
      content: plainTextContent, // Plain text for display/search
      originalStorageContent: storageContent, // Preserve original XML for macro bodies
      variables: [],
      toggles: [], // MultiExcerpt doesn't have toggles
      migratedFrom: {
        originalPageId: sourcePageId,
        originalPageTitle: sourcePageTitle,
        originalPageUrl: sourcePageUrl,
        importedAt: new Date().toISOString()
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Save to storage
    await storage.set(`excerpt:${excerptId}`, excerpt);

    // Update index
    await updateExcerptIndex(excerpt);

    logSuccess('importFromMultiExcerpt', 'MultiExcerpt imported successfully', { name, excerptId });

    // Track this migration
    const tracker = await storage.get('migration-tracker') || { multiExcerpts: [] };
    tracker.multiExcerpts.push({
      name,
      excerptId,
      sourcePageId,
      sourcePageTitle,
      importedAt: new Date().toISOString()
    });
    await storage.set('migration-tracker', tracker);

    return {
      success: true,
      excerptId,
      name
    };
  } catch (error) {
    logFailure('importFromMultiExcerpt', 'Error importing MultiExcerpt', error, { name });
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Track a migration manually (for planning purposes)
 */
export async function trackMigration(req) {
  try {
    const { name, excerptId, sourcePageId, sourcePageTitle } = req.payload;

    const tracker = await storage.get('migration-tracker') || { multiExcerpts: [] };
    tracker.multiExcerpts.push({
      name,
      excerptId,
      sourcePageId,
      sourcePageTitle,
      trackedAt: new Date().toISOString()
    });
    await storage.set('migration-tracker', tracker);

    logSuccess('trackMigration', 'Migration tracked', { name });

    return {
      success: true
    };
  } catch (error) {
    logFailure('trackMigration', 'Error tracking migration', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Scan for MultiExcerpt Include macros across Confluence
 */
export async function scanMultiExcerptIncludes() {
  try {
    const progressId = generateUUID();

    // Initialize progress tracking
    await storage.set(`progress:${progressId}`, {
      status: 'running',
      currentPage: 0,
      totalPages: 0,
      pagesScanned: 0,
      includesFound: 0,
      startedAt: new Date().toISOString()
    });

    // Start async scan (don't await)
    (async () => {
      try {
        const includes = [];
        let start = 0;
        const limit = 25;
        let hasMore = true;
        let totalResults = 0;
        let pagesScanned = 0;

        // Use CQL to search for pages with multiexcerpt-include-macro
        while (hasMore) {
          const cqlQuery = `macro = multiexcerpt-include-macro`;
          const searchUrl = route`/wiki/rest/api/content/search?cql=${cqlQuery}&start=${start}&limit=${limit}&expand=body.storage,space,version`;

          const response = await api.asApp().requestConfluence(searchUrl);
          const data = await response.json();

          totalResults = data.size || 0;
          const results = data.results || [];

          for (const page of results) {
            pagesScanned++;

            // Update progress
            await storage.set(`progress:${progressId}`, {
              status: 'running',
              currentPage: start + results.indexOf(page) + 1,
              totalPages: totalResults,
              pagesScanned,
              includesFound: includes.length,
              lastPageScanned: page.title,
              startedAt: new Date().toISOString()
            });

            const pageId = page.id;
            const pageTitle = page.title;
            const spaceKey = page.space?.key || 'Unknown';
            const storageContent = page.body?.storage?.value || '';

            // Parse storage format to find multiexcerpt-include-macro instances
            const macroRegex = /<ac:structured-macro[^>]*ac:name="multiexcerpt-include-macro"[^>]*>(.*?)<\/ac:structured-macro>/gs;
            const matches = [...storageContent.matchAll(macroRegex)];

            for (const match of matches) {
              const macroContent = match[1];

              // Extract parameters
              const nameMatch = macroContent.match(/<ac:parameter ac:name="name">([^<]+)<\/ac:parameter>/);
              const spaceKeyMatch = macroContent.match(/<ac:parameter ac:name="SpaceKey">([^<]*)<\/ac:parameter>/);
              const pageNameMatch = macroContent.match(/<ac:parameter ac:name="PageName">([^<]*)<\/ac:parameter>/);

              const excerptName = nameMatch ? nameMatch[1] : 'Unknown';
              const sourceSpaceKey = spaceKeyMatch ? spaceKeyMatch[1] : spaceKey;
              const sourcePageName = pageNameMatch ? pageNameMatch[1] : pageTitle;

              includes.push({
                pageId,
                pageTitle,
                spaceKey,
                excerptName,
                sourceSpaceKey,
                sourcePageName
              });
            }
          }

          start += limit;
          hasMore = results.length === limit && start < totalResults;
        }

        // Save results
        await storage.set(`scan-results:${progressId}`, { includes });

        // Mark as complete
        await storage.set(`progress:${progressId}`, {
          status: 'complete',
          totalPages: totalResults,
          pagesScanned,
          includesFound: includes.length,
          completedAt: new Date().toISOString()
        });

        console.log(`Scan complete: Found ${includes.length} includes across ${pagesScanned} pages`);

      } catch (error) {
        console.error('Error during scan:', error);
        await storage.set(`progress:${progressId}`, {
          status: 'error',
          error: error.message
        });
      }
    })();

    return {
      success: true,
      progressId
    };

  } catch (error) {
    console.error('Error starting scan:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Bulk import sources from JSON export
 */
export async function bulkImportSources(req) {
  try {
    const { sources, destinationPageId } = req.payload;

    if (!sources || !Array.isArray(sources)) {
      return {
        success: false,
        error: 'Invalid sources data'
      };
    }

    logFunction('bulkImportSources', 'START', { sourceCount: sources.length });

    const imported = [];
    const errors = [];

    for (const source of sources) {
      try {
        // Generate new excerpt ID
        const excerptId = generateUUID();

        // Convert storage format content to plain text for display/search
        const plainTextContent = storageToPlainText(source.content);

        // Variables are already detected in the JSON
        const variables = source.variables || [];

        // Create excerpt entry
        const excerpt = {
          id: excerptId,
          name: source.name,
          category: 'Migrated from MultiExcerpt',
          content: plainTextContent, // Plain text for display/search
          originalStorageContent: source.content, // Preserve original XML for macro bodies
          variables: variables,
          toggles: [], // MultiExcerpt doesn't have toggles
          sourcePageId: destinationPageId || null,
          sourceSpaceKey: null,
          sourceLocalId: null,
          migratedFrom: {
            originalPageId: source.sourcePageId,
            originalPageTitle: source.sourcePageTitle,
            originalPageUrl: source.sourcePageUrl,
            importedAt: new Date().toISOString()
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        // Save to storage
        await storage.set(`excerpt:${excerptId}`, excerpt);

        // Update index
        await updateExcerptIndex(excerpt);

        console.log(`Imported: ${source.name}`);
        imported.push({
          name: source.name,
          excerptId: excerptId
        });

      } catch (error) {
        console.error(`Error importing "${source.name}":`, error);
        errors.push({
          name: source.name,
          error: error.message
        });
      }
    }

    console.log(`Bulk import complete: ${imported.length} imported, ${errors.length} errors`);

    return {
      success: true,
      summary: {
        total: sources.length,
        imported: imported.length,
        errors: errors.length
      },
      imported,
      errors
    };

  } catch (error) {
    console.error('Error in bulkImportSources:', error);
    return {
      success: false,
      error: error.message,
      summary: {
        total: 0,
        imported: 0,
        errors: 0
      },
      imported: [],
      errors: []
    };
  }
}

/**
 * Create Source macros on a Confluence page for migrated excerpts
 */
export async function createSourceMacrosOnPage(req) {
  try {
    const { pageId, category } = req.payload;

    if (!pageId) {
      return {
        success: false,
        error: 'Page ID is required'
      };
    }

    const targetCategory = category || 'Migrated from MultiExcerpt';
    console.log(`Creating Source macros on page ${pageId} for category: ${targetCategory}`);

    // Get all excerpts from the target category
    const excerptIndex = await storage.get('excerpt-index') || { excerpts: [] };
    const targetExcerpts = [];

    for (const excerptSummary of excerptIndex.excerpts) {
      const excerpt = await storage.get(`excerpt:${excerptSummary.id}`);
      if (excerpt && excerpt.category === targetCategory) {
        targetExcerpts.push(excerpt);
      }
    }

    if (targetExcerpts.length === 0) {
      return {
        success: false,
        error: `No excerpts found in category "${targetCategory}"`
      };
    }

    console.log(`Found ${targetExcerpts.length} excerpts to create macros for`);

    // Sort alphabetically by name
    targetExcerpts.sort((a, b) => a.name.localeCompare(b.name));

    // Fetch the destination page
    const pageResponse = await api.asApp().requestConfluence(
      route`/wiki/api/v2/pages/${pageId}?body-format=storage`,
      {
        headers: {
          'Accept': 'application/json'
        }
      }
    );

    if (!pageResponse.ok) {
      throw new Error(`Failed to fetch page: ${pageResponse.status}`);
    }

    const pageData = await pageResponse.json();
    const currentContent = pageData?.body?.storage?.value || '';
    const pageVersion = pageData.version.number;

    console.log(`Current page version: ${pageVersion}`);

    // Build new content with Source macros
    let newContent = currentContent;

    // Add a separator if page already has content
    if (currentContent.trim()) {
      newContent += '\n<hr />\n<h1>Migrated MultiExcerpt Sources</h1>\n';
    } else {
      newContent = '<h1>Migrated MultiExcerpt Sources</h1>\n';
    }

    const createdMacros = [];
    const skippedMacros = [];

    // Forge app IDs (from manifest and installation)
    const appId = 'be1ff96b-d44d-4975-98d3-25b80a813bdd';

    // Get environment ID from context (production vs development)
    // This ensures macros work in the environment where they're created
    const environmentId = req.context?.installContext?.split('/')[1] || 'ae38f536-b4c8-4dfa-a1c9-62026d61b4f9';
    console.log(`Creating macros with environment ID: ${environmentId}`);

    for (const excerpt of targetExcerpts) {
      try {
        // Generate unique localId for this macro
        const localId = generateUUID();

        // Escape XML special characters in excerpt name for attributes
        const escapedName = (excerpt.name || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const escapedCategory = (excerpt.category || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        // Use original storage format content if available, otherwise use plain text
        let macroBodyContent;
        if (excerpt.originalStorageContent) {
          // Clean MultiExcerpt-specific macros from the content
          const cleanedContent = cleanMultiExcerptMacros(excerpt.originalStorageContent);

          // Validate that the XML is well-formed after cleaning (WARNING ONLY, don't skip)
          const structuredMacroOpen = (cleanedContent.match(/<ac:structured-macro/g) || []).length;
          const structuredMacroClose = (cleanedContent.match(/<\/ac:structured-macro>/g) || []).length;

          if (structuredMacroOpen !== structuredMacroClose) {
            console.warn(`WARNING: Excerpt "${excerpt.name}" has ${structuredMacroOpen} opening and ${structuredMacroClose} closing structured-macro tags (may contain nested macros - proceeding anyway)`);
            // Don't skip - nested macros (panel, expand, etc.) can cause this, and Confluence API will validate
          }

          macroBodyContent = cleanedContent;
        } else {
          macroBodyContent = `<p>${(excerpt.content || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`;
        }

        // Create heading
        newContent += `<h2>${escapedName}</h2>\n`;

        // Create Source macro in Forge ADF format
        newContent += `<ac:adf-extension><ac:adf-node type="bodied-extension">`;
        newContent += `<ac:adf-attribute key="extension-key">${appId}/${environmentId}/static/blueprint-standard-source</ac:adf-attribute>`;
        newContent += `<ac:adf-attribute key="extension-type">com.atlassian.ecosystem</ac:adf-attribute>`;
        newContent += `<ac:adf-attribute key="parameters">`;
        newContent += `<ac:adf-parameter key="local-id">${localId}</ac:adf-parameter>`;
        newContent += `<ac:adf-parameter key="extension-id">ari:cloud:ecosystem::extension/${appId}/${environmentId}/static/blueprint-standard-source</ac:adf-parameter>`;
        newContent += `<ac:adf-parameter key="extension-title">Blueprint Standard - Source</ac:adf-parameter>`;
        newContent += `<ac:adf-parameter key="layout">bodiedExtension</ac:adf-parameter>`;
        newContent += `<ac:adf-parameter key="forge-environment">PRODUCTION</ac:adf-parameter>`;
        newContent += `<ac:adf-parameter key="render">native</ac:adf-parameter>`;
        newContent += `<ac:adf-parameter key="guest-params">`;
        newContent += `<ac:adf-parameter key="excerpt-id">${excerpt.id}</ac:adf-parameter>`;
        newContent += `<ac:adf-parameter key="excerpt-name">${escapedName}</ac:adf-parameter>`;
        newContent += `<ac:adf-parameter key="category">${escapedCategory}</ac:adf-parameter>`;
        newContent += `<ac:adf-parameter key="variables"><ac:adf-parameter-value /></ac:adf-parameter>`;
        newContent += `<ac:adf-parameter key="toggles"><ac:adf-parameter-value /></ac:adf-parameter>`;
        newContent += `</ac:adf-parameter>`;
        newContent += `</ac:adf-attribute>`;
        newContent += `<ac:adf-attribute key="text">Blueprint Standard - Source</ac:adf-attribute>`;
        newContent += `<ac:adf-attribute key="layout">default</ac:adf-attribute>`;
        newContent += `<ac:adf-attribute key="local-id">${localId}</ac:adf-attribute>`;
        newContent += `<ac:adf-content>${macroBodyContent}</ac:adf-content>`;
        newContent += `</ac:adf-node></ac:adf-extension>\n\n`;

        // Update excerpt metadata with page info
        excerpt.sourcePageId = pageId;
        excerpt.sourceLocalId = localId;
        excerpt.updatedAt = new Date().toISOString();

        await storage.set(`excerpt:${excerpt.id}`, excerpt);

        createdMacros.push({
          name: excerpt.name,
          excerptId: excerpt.id,
          localId
        });

        console.log(`Created macro for: ${excerpt.name}`);

      } catch (macroError) {
        console.error(`Error creating macro for ${excerpt.name}:`, macroError);
      }
    }

    // Update the page with new content
    console.log('Updating page with new content...');

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
            value: newContent
          },
          version: {
            number: pageVersion + 1,
            message: `Added ${createdMacros.length} Blueprint App Source macros`
          }
        })
      }
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      throw new Error(`Failed to update page: ${updateResponse.status} - ${errorText}`);
    }

    console.log(`✅ Successfully created ${createdMacros.length} Source macros on page ${pageId}`);
    if (skippedMacros.length > 0) {
      console.log(`⚠️ Skipped ${skippedMacros.length} macros due to malformed XML`);
    }

    return {
      success: true,
      summary: {
        total: targetExcerpts.length,
        created: createdMacros.length,
        skipped: skippedMacros.length,
        pageId,
        pageVersion: pageVersion + 1
      },
      createdMacros,
      skippedMacros
    };

  } catch (error) {
    console.error('Error creating Source macros:', error);
    return {
      success: false,
      error: error.message,
      summary: {
        total: 0,
        created: 0
      },
      createdMacros: []
    };
  }
}

/**
 * Convert MultiExcerpt macros to Blueprint App macros on a page
 */
export async function convertMultiExcerptsOnPage(req) {
  try {
    const { pageId, deleteOldMigrations } = req.payload;

    if (!pageId) {
      return {
        success: false,
        error: 'Page ID is required'
      };
    }

    console.log(`Converting MultiExcerpt macros to Blueprint Standards on page ${pageId}...`);

    // Step 1: Delete all existing "Migrated from MultiExcerpt" excerpts if requested
    if (deleteOldMigrations) {
      console.log('Deleting all previously migrated excerpts...');
      const excerptIndex = await storage.get('excerpt-index') || { excerpts: [] };
      const toDelete = [];

      for (const excerptSummary of excerptIndex.excerpts) {
        const excerpt = await storage.get(`excerpt:${excerptSummary.id}`);
        if (excerpt && excerpt.category === 'Migrated from MultiExcerpt') {
          toDelete.push(excerpt.id);
        }
      }

      // Delete each excerpt
      for (const id of toDelete) {
        await storage.delete(`excerpt:${id}`);
        // Removed individual deletion logging to avoid hitting 100-line limit
      }

      // Update index
      const updatedIndex = {
        excerpts: excerptIndex.excerpts.filter(e => !toDelete.includes(e.id))
      };
      await storage.set('excerpt-index', updatedIndex);

      console.log(`Deleted ${toDelete.length} old migrated excerpts`);
    }

    // Fetch the page
    const pageResponse = await api.asApp().requestConfluence(
      route`/wiki/api/v2/pages/${pageId}?body-format=storage`,
      {
        headers: {
          'Accept': 'application/json'
        }
      }
    );

    if (!pageResponse.ok) {
      throw new Error(`Failed to fetch page: ${pageResponse.status}`);
    }

    const pageData = await pageResponse.json();
    const currentContent = pageData?.body?.storage?.value || '';
    const pageVersion = pageData.version.number;

    console.log(`Current page version: ${pageVersion}`);

    // Find all multiexcerpt-macro instances
    const multiexcerptRegex = /<ac:structured-macro ac:name="multiexcerpt-macro"[^>]*>(.*?)<\/ac:structured-macro>/gs;
    const matches = [...currentContent.matchAll(multiexcerptRegex)];

    console.log(`Found ${matches.length} MultiExcerpt macros on page`);

    if (matches.length === 0) {
      return {
        success: false,
        error: 'No MultiExcerpt macros found on page'
      };
    }

    let newContent = currentContent;
    const converted = [];
    const skipped = [];

    // Forge app IDs
    const appId = 'be1ff96b-d44d-4975-98d3-25b80a813bdd';
    const environmentId = req.context?.installContext?.split('/')[1] || 'ae38f536-b4c8-4dfa-a1c9-62026d61b4f9';
    console.log(`Using environment ID: ${environmentId}`);

    // Get excerpt index to add new excerpts
    const excerptIndex = await storage.get('excerpt-index') || { excerpts: [] };

    // Process each MultiExcerpt macro
    for (const match of matches) {
      try {
        const fullMacro = match[0];
        const macroContent = match[1];

        // Extract the name parameter
        const nameMatch = macroContent.match(/<ac:parameter ac:name="name">([^<]+)<\/ac:parameter>/);
        if (!nameMatch) {
          console.warn('Could not extract name from MultiExcerpt macro');
          skipped.push({ reason: 'No name parameter found' });
          continue;
        }

        const excerptName = nameMatch[1];
        console.log(`Processing: ${excerptName}`);

        // Decode HTML entities in the name
        const decodedName = excerptName
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&nbsp;/g, ' ');

        // Extract the rich-text-body content
        const bodyMatch = macroContent.match(/<ac:rich-text-body>([\s\S]*?)<\/ac:rich-text-body>/);
        let bodyContent;

        if (!bodyMatch) {
          console.warn(`No rich-text-body found for: ${excerptName}, using empty paragraph`);
          bodyContent = '<p />';
        } else {
          bodyContent = bodyMatch[1];
        }

        // Unescape HTML entities in body content
        let cleanedBody = bodyContent
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          .replace(/&nbsp;/g, ' ')
          .replace(/&rsquo;/g, "'")
          .replace(/&lsquo;/g, "'")
          .replace(/&rdquo;/g, '"')
          .replace(/&ldquo;/g, '"');

        // Detect variables {{variableName}}
        const variableMatches = cleanedBody.match(/\{\{([^}]+)\}\}/g) || [];
        const variables = [...new Set(variableMatches)].map(v => {
          const varName = v.replace(/[{}]/g, '');
          return {
            name: varName,
            label: varName.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            description: `Auto-detected variable: ${varName}`,
            required: false
          };
        });

        // Create new excerpt
        const excerptId = generateUUID();
        const localId = generateUUID();

        const newExcerpt = {
          id: excerptId,
          name: decodedName,
          content: cleanedBody,
          category: 'Migrated from MultiExcerpt',
          variables: variables,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          sourcePageId: pageId,
          sourceLocalId: localId
        };

        // Save excerpt to storage
        await storage.set(`excerpt:${excerptId}`, newExcerpt);

        // Add to index
        excerptIndex.excerpts.push({
          id: excerptId,
          name: decodedName,
          category: 'Migrated from MultiExcerpt'
        });

        console.log(`Created new excerpt: ${excerptId} for "${decodedName}"`);

        // Escape XML special characters in excerpt name for attributes
        const escapedName = excerptName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const escapedCategory = 'Migrated from MultiExcerpt';

        // Build Blueprint Standard Source ADF macro
        let blueprintMacro = `<ac:adf-extension><ac:adf-node type="bodied-extension">`;
        blueprintMacro += `<ac:adf-attribute key="extension-key">${appId}/${environmentId}/static/blueprint-standard-source</ac:adf-attribute>`;
        blueprintMacro += `<ac:adf-attribute key="extension-type">com.atlassian.ecosystem</ac:adf-attribute>`;
        blueprintMacro += `<ac:adf-attribute key="parameters">`;
        blueprintMacro += `<ac:adf-parameter key="local-id">${localId}</ac:adf-parameter>`;
        blueprintMacro += `<ac:adf-parameter key="extension-id">ari:cloud:ecosystem::extension/${appId}/${environmentId}/static/blueprint-standard-source</ac:adf-parameter>`;
        blueprintMacro += `<ac:adf-parameter key="extension-title">Blueprint Standard - Source</ac:adf-parameter>`;
        blueprintMacro += `<ac:adf-parameter key="layout">bodiedExtension</ac:adf-parameter>`;
        blueprintMacro += `<ac:adf-parameter key="forge-environment">PRODUCTION</ac:adf-parameter>`;
        blueprintMacro += `<ac:adf-parameter key="render">native</ac:adf-parameter>`;
        blueprintMacro += `<ac:adf-parameter key="guest-params">`;
        blueprintMacro += `<ac:adf-parameter key="excerpt-id">${excerptId}</ac:adf-parameter>`;
        blueprintMacro += `<ac:adf-parameter key="excerpt-name">${escapedName}</ac:adf-parameter>`;
        blueprintMacro += `<ac:adf-parameter key="category">${escapedCategory}</ac:adf-parameter>`;
        blueprintMacro += `<ac:adf-parameter key="variables"><ac:adf-parameter-value /></ac:adf-parameter>`;
        blueprintMacro += `<ac:adf-parameter key="toggles"><ac:adf-parameter-value /></ac:adf-parameter>`;
        blueprintMacro += `</ac:adf-parameter>`;
        blueprintMacro += `</ac:adf-attribute>`;
        blueprintMacro += `<ac:adf-attribute key="text">Blueprint Standard - Source</ac:adf-attribute>`;
        blueprintMacro += `<ac:adf-attribute key="layout">default</ac:adf-attribute>`;
        blueprintMacro += `<ac:adf-attribute key="local-id">${localId}</ac:adf-attribute>`;
        blueprintMacro += `<ac:adf-content>${bodyContent}</ac:adf-content>`;
        blueprintMacro += `</ac:adf-node></ac:adf-extension>`;

        // Replace the MultiExcerpt macro with Blueprint Standard macro
        newContent = newContent.replace(fullMacro, blueprintMacro);

        converted.push({
          name: excerptName,
          excerptId: excerptId,
          localId
        });

        console.log(`✓ Converted: ${excerptName}`);

      } catch (macroError) {
        console.error(`Error converting macro:`, macroError);
        skipped.push({ reason: macroError.message });
      }
    }

    // Save updated excerpt index
    await storage.set('excerpt-index', excerptIndex);

    // Update the page with converted content
    console.log(`Updating page with ${converted.length} converted macros...`);

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
            value: newContent
          },
          version: {
            number: pageVersion + 1,
            message: `Converted ${converted.length} MultiExcerpt macros to Blueprint App`
          }
        })
      }
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      throw new Error(`Failed to update page: ${updateResponse.status} - ${errorText}`);
    }

    console.log(`✅ Successfully converted ${converted.length} macros on page ${pageId}`);
    if (skipped.length > 0) {
      console.log(`⚠️ Skipped ${skipped.length} macros`);
    }

    return {
      success: true,
      summary: {
        total: matches.length,
        converted: converted.length,
        skipped: skipped.length,
        pageId,
        pageVersion: pageVersion + 1
      },
      converted,
      skipped
    };

  } catch (error) {
    console.error('Error converting MultiExcerpt macros:', error);
    return {
      success: false,
      error: error.message,
      summary: {
        total: 0,
        converted: 0,
        skipped: 0
      }
    };
  }
}

/**
 * Bulk initialize all excerpts with hardcoded name-UUID mappings
 * This is a one-time initialization function with 147 hardcoded mappings
 */
export async function bulkInitializeAllExcerpts(req) {
  console.log('🚀 Starting bulk initialization of all excerpts...');

  // Get page ID from request payload (defaults to 99909654 for backward compatibility)
  const PAGE_ID = req.payload?.pageId || '99909654';
  console.log(`📡 Fetching page ${PAGE_ID}...`);

  const pageResponse = await api.asApp().requestConfluence(
    route`/wiki/api/v2/pages/${PAGE_ID}?body-format=storage`,
    { headers: { 'Accept': 'application/json' } }
  );

  if (!pageResponse.ok) {
    throw new Error(`Failed to fetch page: ${pageResponse.status}`);
  }

  const pageData = await pageResponse.json();
  const storageContent = pageData.body.storage.value;
  console.log(`✓ Page fetched (version ${pageData.version.number})`);

  // Extract all Blueprint Standard Source macros
  console.log('🔍 Extracting Blueprint Standard Source macros...');
  const macroRegex = /<ac:adf-extension><ac:adf-node type="bodied-extension">[\s\S]*?blueprint-standard-source[\s\S]*?<\/ac:adf-node><\/ac:adf-extension>/g;

  const mappings = [];
  let match;
  while ((match = macroRegex.exec(storageContent)) !== null) {
    const macroXml = match[0];

    // Extract excerpt-id
    const idMatch = macroXml.match(/<ac:adf-parameter key="excerpt-id">([^<]+)<\/ac:adf-parameter>/);
    const excerptId = idMatch ? idMatch[1] : null;

    // Extract excerpt-name
    const nameMatch = macroXml.match(/<ac:adf-parameter key="excerpt-name">([^<]+)<\/ac:adf-parameter>/);
    const excerptName = nameMatch ? nameMatch[1] : null;

    // Extract local-id (Confluence's unique macro instance ID)
    const localIdMatch = macroXml.match(/<ac:adf-attribute key="local-id">([^<]+)<\/ac:adf-attribute>/);
    const localId = localIdMatch ? localIdMatch[1] : null;

    // Extract content from <ac:adf-content> tag (contains Storage Format XML)
    const contentMatch = macroXml.match(/<ac:adf-content>([\s\S]*?)<\/ac:adf-content>/);
    let content = null;
    let variables = [];

    if (contentMatch) {
      // Content is in Storage Format XML, store it as-is
      content = contentMatch[1];

      // Extract variables from content (look for {{variableName}} patterns)
      const variableRegex = /\{\{([^}]+)\}\}/g;
      const variableSet = new Set();
      let varMatch;
      while ((varMatch = variableRegex.exec(content)) !== null) {
        variableSet.add(varMatch[1]);
      }
      variables = Array.from(variableSet).map(name => ({
        name,
        defaultValue: '',
        description: ''
      }));
    } else {
      console.warn(`⚠️ No content found for ${excerptName}`);
    }

    // Skip the template macro (Test0 or Blueprint App0)
    if (excerptId && excerptName && excerptName !== 'Test0' && excerptName !== 'Blueprint App0') {
      mappings.push({
        uuid: excerptId,
        name: excerptName,
        category: 'General',
        localId: localId,
        content: content,
        variables: variables
      });
    }
  }

  console.log(`✓ Found ${mappings.length} Blueprint Standard Source macros to initialize`);

  // Old hardcoded mappings (kept for reference, commented out)
  /*const mappings = [
  {
    "name": "[ALL] Fundamentals - Key dates, Stack model",
    "uuid": "a698f73f-c913-4350-988e-629181026bd8",
    "category": "General"
  },
  {
    "name": "[ALL] Fundamentals - Venues, Performers",
    "uuid": "258b1fb5-5bf0-4895-96b2-8da06fe95d81",
    "category": "General"
  },
  {
    "name": "[GOLF] Fundamentals - Venues, Performers",
    "uuid": "a66e17ee-e1c1-4cfe-961b-20864945b3e3",
    "category": "General"
  },
  {
    "name": "[ALL] Fundamentals - Infrastructure, Tenant ID, Weblink",
    "uuid": "5dd0d2e6-a90f-4e85-9c56-041b4f5d00d1",
    "category": "General"
  },
  {
    "name": "[ALL] Base platform utilization [some eSRO, no tSRO, all Native AC]",
    "uuid": "b95e7e67-1cf7-4d23-b57f-c949149d3d12",
    "category": "General"
  },
  {
    "name": "[ALL] Base platform utilization [no eSRO, no tSRO, all Native AC]",
    "uuid": "a95dab75-3b16-4501-8d24-18d57699eafa",
    "category": "General"
  },
  {
    "name": "[ALL] Base platform utilization [no eSRO, no tSRO, some Native AC]",
    "uuid": "e3ef9319-7c7a-414d-839c-e3ab09adf65f",
    "category": "General"
  },
  {
    "name": "[ALL] Base platform utilization [no eSRO, no tSRO, no Native AC]",
    "uuid": "ac23dc1f-3d59-4dfb-96d5-5eb2445cc08e",
    "category": "General"
  },
  {
    "name": "[ALL] Organization units",
    "uuid": "41ce3c90-6665-4330-9fe8-ebd6d53e675b",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;ALL&amp;rsqb; Users &amp;lsqb;No client SSO&amp;rsqb;",
    "uuid": "dbd13acb-7558-4161-a59b-975816a7d52b",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;ALL&amp;rsqb; Users &amp;lsqb;With client SSO&amp;rsqb;",
    "uuid": "2b818cf6-14cc-4849-ab50-60ce36db7194",
    "category": "General"
  },
  {
    "name": "[ALL] Profiles, Security Tokens, and User Roles",
    "uuid": "feba88db-c0aa-4241-9613-92b69636d375",
    "category": "General"
  },
  {
    "name": "[GOLF] Translator (Captions)",
    "uuid": "c2f78b77-09a6-48b8-8d23-0731aef737ee",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;MLS&amp;rsqb; &amp;lsqb;NWSL&amp;rsqb; &amp;lsqb;USL&amp;rsqb; Translator &amp;lpar;Captions&amp;rpar;",
    "uuid": "2aad3300-debc-48e7-aefb-4ec2ade71d0e",
    "category": "General"
  },
  {
    "name": "[NBA] Translator (Captions)",
    "uuid": "f64cf589-72a4-4d4b-890a-98bf8236536e",
    "category": "General"
  },
  {
    "name": "[NFL] Translator (Captions)",
    "uuid": "fc3dd22e-3ee1-429a-8e4e-0cb79cc902ca",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;NHL&amp;rsqb; Translator &amp;lpar;Captions&amp;rpar;",
    "uuid": "cdb11fd7-3e1d-4d51-887a-8c45701d1293",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;HORSE RACING&amp;rsqb; Translator &amp;lpar;Captions&amp;rpar;",
    "uuid": "bf1eb6ae-8e28-4955-bdd6-90055567a212",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;INTRO&amp;rsqb; Products &amp;lsqb;Overview&amp;rsqb;",
    "uuid": "16f7a05c-45eb-422b-b8d8-063c94314e86",
    "category": "General"
  },
  {
    "name": "[ALL] Single-event tickets",
    "uuid": "0e56dc61-91b3-4d61-a160-5dcae34b5919",
    "category": "General"
  },
  {
    "name": "[ALL] Third-party events",
    "uuid": "dead00d7-f0ea-4704-a7f2-6c0be733d1d5",
    "category": "General"
  },
  {
    "name": "[ALL] Season tickets",
    "uuid": "3565cfb1-9483-41f6-930b-85591dbf67d6",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;NFL&amp;rsqb; Season tickets",
    "uuid": "19417ed6-c92c-4dc3-a298-ca9887639588",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;NHL&amp;rsqb; Season tickets",
    "uuid": "d9685194-b97b-4f64-8252-57c579e93456",
    "category": "General"
  },
  {
    "name": "[MLS] Full season tickets",
    "uuid": "62f6068d-5460-4931-adb6-fb1de3b1c7ce",
    "category": "General"
  },
  {
    "name": "[NBA] Full season tickets",
    "uuid": "f2c85898-d7b5-4280-bd78-e038de4169af",
    "category": "General"
  },
  {
    "name": "[NFL] Full season tickets",
    "uuid": "7dfba599-7f5c-4f1e-9916-5f8f9dc15363",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;NHL&amp;rsqb; Full season tickets",
    "uuid": "e4628f60-b151-4894-80a8-e30ee27b326b",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;NWSL&amp;rsqb; Full season tickets",
    "uuid": "7f085760-cc4e-44dc-ae69-888427abbf97",
    "category": "General"
  },
  {
    "name": "[USL] Full season tickets",
    "uuid": "06900bbf-12be-4b6f-b07b-1634b4832692",
    "category": "General"
  },
  {
    "name": "[TENNIS] Full season tickets",
    "uuid": "0344510c-d3de-4e7c-bcc4-f876db385560",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;BOWL&amp;rsqb; Full season tickets",
    "uuid": "f8733855-504c-4eef-b2bd-ec71fcc3b397",
    "category": "General"
  },
  {
    "name": "[ALL] Partial season tickets [Overview; 1 of 5]",
    "uuid": "871ae09c-9ed6-4590-8b7d-eaeae6fb07d5",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;NFL&amp;rsqb; Partial season tickets &amp;lsqb;Overview&amp;semi; N&amp;sol;A&amp;rsqb;",
    "uuid": "6a1e28ba-86a8-4393-a224-7a4d4101326a",
    "category": "General"
  },
  {
    "name": "[ALL] Partial season tickets [Fixed; 2 of 5]",
    "uuid": "6af9ba0e-f118-413e-9555-258fc6251a5e",
    "category": "General"
  },
  {
    "name": "[ALL] Partial season tickets [Flex; 3 of 5]",
    "uuid": "0a0b0c5b-86f2-445e-a22c-d1623ef35b1d",
    "category": "General"
  },
  {
    "name": "[ALL] Partial season tickets [Mixed; 4 of 5]",
    "uuid": "691af237-a3e0-4071-b0fd-88c111bd5f63",
    "category": "General"
  },
  {
    "name": "[ALL] Partial season tickets [Buckets; 5 of 5]",
    "uuid": "cfba756a-2dc3-4afe-9918-c95d31c1ba74",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;Horse Racing&amp;rsqb; Combo Ticket Event Packages",
    "uuid": "0e5ad632-a1d4-487b-88e9-ad2bad39ba3f",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;MLS&amp;sol;USL&amp;rsqb; Season voucher packs",
    "uuid": "20cbea1a-e28f-400b-b4aa-2200df76a6bc",
    "category": "General"
  },
  {
    "name": "[ALL] Season ticket renewals [Method 1 of 3]",
    "uuid": "95ef6e54-3b06-49d6-85e3-1aa7f594ed32",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;NBA&amp;rsqb; Season ticket renewals &amp;lsqb;Method 2 of 3&amp;rsqb;",
    "uuid": "c2580600-15ad-4fa4-9fc5-68c876447956",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;NFL&amp;rsqb; Season ticket renewals &amp;lsqb;Method 2 of 3&amp;rsqb;",
    "uuid": "552fd645-62cd-47f0-888a-f52e30251363",
    "category": "General"
  },
  {
    "name": "[ALL] Season ticket renewals [Method 2 of 3]",
    "uuid": "ccdb1a3d-5da2-48f4-b449-0860e4c4f791",
    "category": "General"
  },
  {
    "name": "[ALL] Season ticket renewals [Method 3 of 3]",
    "uuid": "c6153550-d111-4fce-b6db-881bba661fb3",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;SEASONAL&amp;rsqb; Renewals not including &amp;quot;Season Ticket&amp;quot;",
    "uuid": "315ec2df-1a24-4186-ba54-f4122e1eee22",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;ALL&amp;rsqb; Relocations &amp;lsqb;SeatGeek Native&amp;rsqb;",
    "uuid": "219cd955-d0ba-42e7-8822-697a075cde29",
    "category": "General"
  },
  {
    "name": "[ALL] Relocations [MMC]",
    "uuid": "28e3b18b-51f5-4f10-9ca7-500af8fe5267",
    "category": "General"
  },
  {
    "name": "[ALL] Exchanges [SeatGeek Exchanges]",
    "uuid": "d202c52e-ac09-4682-8395-5504812f3045",
    "category": "General"
  },
  {
    "name": "[MLS] Playoffs",
    "uuid": "3ec4ff53-ac5b-45d1-a007-7d1bc78b7936",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;MLS&amp;rsqb; Playoffs - Reservation Confirmation",
    "uuid": "bc8690b2-a75f-4802-b9f7-b1ea61a09f66",
    "category": "General"
  },
  {
    "name": "[NBA] Playoffs",
    "uuid": "24ddcf47-3a65-4c13-93a2-a6b4fb0c3a4f",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;NHL&amp;rsqb; Playoffs",
    "uuid": "1ca88f04-3e33-4603-8563-29cb3555a452",
    "category": "General"
  },
  {
    "name": "[NFL] Playoffs",
    "uuid": "b5e83839-3741-4d8f-b518-20eed2685452",
    "category": "General"
  },
  {
    "name": "[USL] Playoffs",
    "uuid": "e19d3489-7326-4c52-979c-f3565fda91f1",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;ALL&amp;rsqb; Premium tickets &amp;lpar;Suites and Clubs&amp;rpar; &amp;lsqb;Ancillary&amp;rsqb;",
    "uuid": "f60e2497-9a72-465f-86a1-0821fb85f689",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;ALL&amp;rsqb; Premium tickets &amp;lpar;Suites and Clubs&amp;rpar; &amp;lsqb;Main-manifest&amp;rsqb;",
    "uuid": "8ad77989-03e6-4cac-9550-8a198fb61e1a",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;NFL&amp;rsqb; Premium lift",
    "uuid": "40335076-b458-4019-b556-33140c6db6bd",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;ALL&amp;rsqb; Deposits and Waitlists &amp;lsqb;Dummy Series&amp;rsqb;",
    "uuid": "34cf3654-84a4-4be0-bff4-4a334e15c3b1",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;ALL&amp;rsqb; Deposits and Waitlists &amp;lsqb;Dummy Events&amp;rsqb;",
    "uuid": "3fa74eb6-d063-42bc-ac5d-e24c9544ff92",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;ALL&amp;rsqb; Group sales",
    "uuid": "d31e0806-1cfa-4b4d-bb3d-55e4ed7eaed7",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;ALL&amp;rsqb; Group sales &amp;lsqb;with Project Admission&amp;rsqb;",
    "uuid": "72d6e29a-de6d-4109-861f-2236538c70ac",
    "category": "General"
  },
  {
    "name": "[ALL] Parking",
    "uuid": "4df079f1-fd80-4bef-97f2-8131237591db",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;NFL&amp;rsqb; Parking",
    "uuid": "9b50224f-277c-4b0a-8961-1afc506068fd",
    "category": "General"
  },
  {
    "name": "[ALL] Merchandise",
    "uuid": "85b76a81-b168-4eaf-95da-9ddd3ddbacb0",
    "category": "General"
  },
  {
    "name": "[INTRO] Sales fundamentals",
    "uuid": "d0aa1e41-17b2-42b1-88b2-b9e27bc2a1da",
    "category": "General"
  },
  {
    "name": "[GOLF] Distribution partnerships",
    "uuid": "0fa2195b-5034-49c3-9ce9-84a2be637d55",
    "category": "General"
  },
  {
    "name": "[MLS] Distribution partnerships",
    "uuid": "c9167a43-008a-4c87-a069-560f3115085a",
    "category": "General"
  },
  {
    "name": "[NBA] Distribution partnerships",
    "uuid": "a616486e-ab46-4c50-899f-e1af05c35e13",
    "category": "General"
  },
  {
    "name": "[NFL] Distribution partnerships",
    "uuid": "32ebef00-1cd9-47de-a80a-d80e818081de",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;OTHER&amp;rsqb; Distribution partnerships",
    "uuid": "01a05070-de95-4a97-8230-1b2391e29384",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;NFL&amp;rsqb; NFL Ticket Exchange",
    "uuid": "0e1407e6-04af-4da5-981b-ff8bb98577ff",
    "category": "General"
  },
  {
    "name": "[ALL] Sales Period, Return Period rules",
    "uuid": "e0640f8a-b93c-40b5-96d6-e06d007cddaa",
    "category": "General"
  },
  {
    "name": "[ALL] Inventory management",
    "uuid": "71a19c1d-f26e-4c9d-95e7-64417229243b",
    "category": "General"
  },
  {
    "name": "[ALL] Locks and Allocations",
    "uuid": "95198f32-5ad8-41cc-b37b-7ba641c40cd0",
    "category": "General"
  },
  {
    "name": "[ENTERTAINMENT] Prime and VIP Locks and Allocations",
    "uuid": "07f38276-312d-4ea5-a2b0-d62148ff8dd7",
    "category": "General"
  },
  {
    "name": "[ALL] Seat-Level Pricing",
    "uuid": "fd135114-08d9-4fb6-b972-4009a7948cbb",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;ALL&amp;rsqb; Seat-Level Pricing &amp;lsqb;with SeatGeekIQ&amp;rsqb;",
    "uuid": "861c2db0-bbc5-47dc-9852-e96eb4d7134f",
    "category": "General"
  },
  {
    "name": "[ENTERTAINMENT] Entertainment Unmanifested Seats",
    "uuid": "dbb749f3-5050-4130-8daa-1e2d03258596",
    "category": "General"
  },
  {
    "name": "[ALL] Extra Data rules",
    "uuid": "ad5b21e7-a9b8-415e-a723-afb71b9f534d",
    "category": "General"
  },
  {
    "name": "[ALL] Sale Modes",
    "uuid": "511f6b82-a674-4b42-9c07-60ee11e7c4d4",
    "category": "General"
  },
  {
    "name": "[ALL] Sale Points",
    "uuid": "ddffbf68-cd1c-454b-b875-8fdc4eaac0eb",
    "category": "General"
  },
  {
    "name": "[ALL] Sites",
    "uuid": "a99b5242-ffd9-4f3f-97fa-b4d5ae0ec930",
    "category": "General"
  },
  {
    "name": "[ALL] Venues, Halls (Venue Maps), Hall (Venue Map) Versions [Overview; 1 of 5]",
    "uuid": "39ff1161-45df-4487-9e7e-bc4076b0c38f",
    "category": "General"
  },
  {
    "name": "[ALL] Halls (Venue Maps), Hall (Venue Map) Versions [Stands; 2 of 5]",
    "uuid": "227f4aac-6500-4e6a-b8a3-9488c5e04c78",
    "category": "General"
  },
  {
    "name": "[ALL] Halls (Venue Maps), Hall (Venue Map) Versions [Areas and sections; 3 of 5]",
    "uuid": "ccdfb56b-fcca-448b-9260-a226f5cb3094",
    "category": "General"
  },
  {
    "name": "[ALL] Halls (Venue Maps), Hall (Venue Map) Versions [General Admission; 4 of 5]",
    "uuid": "4fe0ca19-bcb1-43a2-8507-22b04ca35387",
    "category": "General"
  },
  {
    "name": "[ALL] Halls (Venue Maps), Hall (Venue Map) Versions [Gates and Turnstiles (Fortress); 5 of 5]",
    "uuid": "36ba00f3-7723-4872-82b4-566b9e836410",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;ALL&amp;rsqb; Halls &amp;lpar;Venue Maps&amp;rpar;&amp;comma; Hall &amp;lpar;Venue Map&amp;rpar; Versions &amp;lsqb;Gates and Turnstiles &amp;lpar;SRO Built-In Access Control&amp;rpar;&amp;semi; 5 of 5&amp;rsqb;",
    "uuid": "8a932c7c-6987-43ca-8dad-eb98c1e94d7f",
    "category": "General"
  },
  {
    "name": "[ALL] Seat Types",
    "uuid": "dbb193a2-6075-4a5d-8d07-3be07daa9c7c",
    "category": "General"
  },
  {
    "name": "[ALL] Custom Properties",
    "uuid": "b1379e9f-50f6-456a-8661-c3a84854fa81",
    "category": "General"
  },
  {
    "name": "[ALL] Pricing",
    "uuid": "47a80318-90a4-4e44-a184-c501e67ac1c0",
    "category": "General"
  },
  {
    "name": "[ALL] Price Lists",
    "uuid": "b442d573-ed60-4f2b-98ec-6ee04734a0b0",
    "category": "General"
  },
  {
    "name": "Prime and VIP Price Type to Allocations",
    "uuid": "c3db716c-9de1-42df-bff1-1276ebf071ce",
    "category": "General"
  },
  {
    "name": "[ALL] Price Type Availability rules",
    "uuid": "ea6cbc9d-bf2d-469b-9fbc-0d74d3a36229",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;USL&amp;rsqb; Price Type Availability rules",
    "uuid": "82c55cce-83fb-443d-8b32-45cf01e75c81",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;ALL&amp;rsqb; Market-based pricing",
    "uuid": "c1320f2e-1bbf-4d82-bf04-ffebadbeebcc",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;ALL&amp;rsqb; Dynamic pricing &amp;lsqb;PriceIQ&amp;rsqb;",
    "uuid": "321b7c44-792c-42be-ab5f-fa6c8938ffc7",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;ALL&amp;rsqb; Dynamic pricing &amp;lsqb;ReachIQ&amp;rsqb;",
    "uuid": "277f01dd-5b7a-4626-aac1-89b7aea919d8",
    "category": "General"
  },
  {
    "name": "[ALL] Fees",
    "uuid": "d7646d13-3d11-44f1-b722-3c5af66d5b77",
    "category": "General"
  },
  {
    "name": "[NFL] Fees",
    "uuid": "52f93450-9cb0-429c-83f6-ef43ade09d0a",
    "category": "General"
  },
  {
    "name": "[ENTERTAINMENT] Entertainment Fee Bands",
    "uuid": "802376c4-7d34-407a-9f80-41c665379627",
    "category": "General"
  },
  {
    "name": "[ALL] Taxes",
    "uuid": "6b082bff-8bc6-44c3-9d1d-d733dd1d0268",
    "category": "General"
  },
  {
    "name": "[ALL] Coupons",
    "uuid": "ff427e45-2817-4eb3-9580-ed39971e16d0",
    "category": "General"
  },
  {
    "name": "[ALL] Packages",
    "uuid": "e9787f80-2ea4-4784-ab99-935ebb80cd75",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;ALL&amp;rsqb; Bundles",
    "uuid": "1ea2a20d-98da-4a9d-a209-5f24c2f9c03f",
    "category": "General"
  },
  {
    "name": "[ALL] Prompts (Upsells)",
    "uuid": "0b6031b3-e58a-4c40-bb20-c2ce49e0342f",
    "category": "General"
  },
  {
    "name": "[ALL] CRM",
    "uuid": "dbb7598b-ef73-43f3-8769-8c1ca04636ef",
    "category": "General"
  },
  {
    "name": "[ALL] Customers",
    "uuid": "151fca8c-f93c-414b-afe8-cf02cf683074",
    "category": "General"
  },
  {
    "name": "[ALL] Client Types",
    "uuid": "ae92e108-87a4-4f56-b089-c8369b1ca20e",
    "category": "General"
  },
  {
    "name": "[ALL] Remarks",
    "uuid": "8e13da4d-0837-49c8-b8c1-6dbb4b5e0ab4",
    "category": "General"
  },
  {
    "name": "[ALL] Sales and Service Representatives",
    "uuid": "e5c6bbd1-6ca2-4073-bd16-a060f094dfbe",
    "category": "General"
  },
  {
    "name": "[ALL] Correspondence Processes, Communication Profiles",
    "uuid": "bd570b09-51bd-4ad0-bf5e-26849232eec3",
    "category": "General"
  },
  {
    "name": "[ALL] Delivery Methods",
    "uuid": "ccac001d-9b8e-4582-8143-e0fb1d4fbd1a",
    "category": "General"
  },
  {
    "name": "[ALL] Client Duplication rules",
    "uuid": "441d75f9-04d1-422e-a8a5-58f8f709c6aa",
    "category": "General"
  },
  {
    "name": "[ALL] Client Extra Data fields",
    "uuid": "ae7c83db-dfc0-4151-8447-191b2ecc517a",
    "category": "General"
  },
  {
    "name": "[ALL] Limit per Person rules",
    "uuid": "e3e028d0-f3b3-4139-b4c9-fba552865bb7",
    "category": "General"
  },
  {
    "name": "[ALL] Printing and Access Control",
    "uuid": "69a066d7-50fc-4d89-8d0d-176b0d0a965c",
    "category": "General"
  },
  {
    "name": "[ALL] Documents",
    "uuid": "909a7ad3-65e0-43b5-b874-5cac56cac414",
    "category": "General"
  },
  {
    "name": "[ALL] Printers",
    "uuid": "b4662343-984a-4b27-b07c-3701c852dbbd",
    "category": "General"
  },
  {
    "name": "[ALL] Printer Servers",
    "uuid": "f0a0507e-24de-41b1-8df8-effaaf205de0",
    "category": "General"
  },
  {
    "name": "[ALL] SMS Ticket Collection",
    "uuid": "0891c1bc-31b6-471c-b765-6bd03554dd6b",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;ALL&amp;rsqb; Access Control &amp;lpar;SRO Native&amp;rpar;",
    "uuid": "f6ea9a3d-af56-4654-acb4-d94b316e873d",
    "category": "General"
  },
  {
    "name": "[ALL] Access Control (Fortress)",
    "uuid": "2386b76e-a42c-4893-a622-6aaaaabe2223",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;ALL&amp;rsqb; Access Control &amp;lpar;Skidata&amp;rpar;",
    "uuid": "7a2cb3ef-0dbe-4712-bf32-1ef995829968",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;ALL&amp;rsqb; Loaded Value &amp;lpar;Non-VenueNext&amp;rpar;",
    "uuid": "30c19f2e-49a4-42f0-87d8-b888162669f8",
    "category": "General"
  },
  {
    "name": "[ALL] Loaded Value (VenueNext)",
    "uuid": "8d58ee78-93da-45f3-acc8-87458d0fda81",
    "category": "General"
  },
  {
    "name": "[ALL] Payments",
    "uuid": "898bfa01-e8b3-4660-a3a2-9cb3a9afe2dc",
    "category": "General"
  },
  {
    "name": "[ALL] Payment Methods",
    "uuid": "399077fd-07b8-4212-a820-55d55d13eb1f",
    "category": "General"
  },
  {
    "name": "[ALL] Payment Plans",
    "uuid": "c1fee9c4-7fe0-40dc-a0b8-b7a889492fea",
    "category": "General"
  },
  {
    "name": "[ALL] Deposits (Account Credits)",
    "uuid": "d58d4b82-7539-4f84-affd-5d21e1eeb9f9",
    "category": "General"
  },
  {
    "name": "[ALL] Reports, Queries",
    "uuid": "581c58a8-c4db-4a8c-8d68-85b7771fa351",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;NFL&amp;rsqb; League reports",
    "uuid": "87967c7e-aff9-4b05-9765-cc8cf4101a12",
    "category": "General"
  },
  {
    "name": "[ALL] SeatGeek Open",
    "uuid": "81914b0a-563e-4e0f-8b4c-9ec65b845403",
    "category": "General"
  },
  {
    "name": "[ALL] [INTERNAL] Open Admin configurations",
    "uuid": "578a195f-2422-4d0c-8c32-2ea82e93f8fa",
    "category": "General"
  },
  {
    "name": "[ALL] [INTERNAL] Rufus configurations",
    "uuid": "36a95fd8-53b5-466f-a2ba-4a2482acfc0c",
    "category": "General"
  },
  {
    "name": "[ALL] [INTERNAL] Unleash feature flags",
    "uuid": "50bfcef1-9556-4ca7-b63f-dbb8ae569cb8",
    "category": "General"
  },
  {
    "name": "[ALL] Performer page",
    "uuid": "763c8da1-cf40-49cf-b13c-575510ead743",
    "category": "General"
  },
  {
    "name": "[ALL] Event page",
    "uuid": "1c31ca32-0a8d-4b48-8cbd-6c677eaca750",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;ALL&amp;rsqb; Rally &amp;lsqb;Basic&amp;rsqb;",
    "uuid": "fb8428aa-3d4f-4e65-b8c0-8ac56d6ce570",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;ALL&amp;rsqb; Rally &amp;lsqb;Detailed&amp;rsqb;",
    "uuid": "2d2ecaec-8a82-408a-8381-bed9594525d3",
    "category": "General"
  },
  {
    "name": "[ALL] Account Manager",
    "uuid": "81ae1232-b8bb-432d-84ae-eea8685ae9e3",
    "category": "General"
  },
  {
    "name": "[ALL] SeatGeek Online Ticket Management rules",
    "uuid": "90f6fdae-44ec-4679-abc1-9726df22f3f0",
    "category": "General"
  },
  {
    "name": "[ALL] Amplify",
    "uuid": "616a1345-ae5d-404d-8acc-a686d1fc208b",
    "category": "General"
  },
  {
    "name": "[ALL] Price Floors",
    "uuid": "6b0ba694-5954-4f64-813a-e64c6b0472de",
    "category": "General"
  },
  {
    "name": "[INTRO] Appendix - Integrations summary",
    "uuid": "6b6f2934-d72a-41f9-a7b9-87e1b184cae4",
    "category": "General"
  },
  {
    "name": "[INTRO] Appendix - External sources",
    "uuid": "9ea7f532-5bb9-4ba3-adb8-f7719b8fae68",
    "category": "General"
  }
];*/

  const results = [];

  for (const { uuid, name, category, localId, content, variables } of mappings) {
    try {
      // Generate content hash for staleness detection
      let contentHash = null;
      if (content) {
        const crypto = require('crypto');
        // Content is Storage Format XML string, use it directly
        contentHash = crypto.createHash('sha256').update(content).digest('hex');
      }

      // Get existing excerpt from Forge storage
      let excerpt = await storage.get(`excerpt:${uuid}`);

      if (!excerpt) {
        // Create new excerpt if it doesn't exist
        excerpt = {
          id: uuid,
          name: name,
          category: category || 'General',
          content: content,
          variables: variables,
          toggles: [],
          sourcePageId: PAGE_ID,  // All excerpts are on this page
          sourceLocalId: localId,  // Confluence's unique macro instance ID
          contentHash: contentHash,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        console.log(`✓ Created new excerpt: ${name} (localId: ${localId}, ${variables.length} variables, ${content ? 'with content' : 'no content'})`);
      } else {
        // Update existing excerpt
        excerpt.name = name;
        excerpt.category = category || excerpt.category || 'General';
        excerpt.content = content;
        excerpt.variables = variables;
        excerpt.sourcePageId = PAGE_ID;  // All excerpts are on this page
        excerpt.sourceLocalId = localId;  // Update the local ID
        excerpt.contentHash = contentHash;
        excerpt.updatedAt = new Date().toISOString();
        console.log(`✓ Updated existing excerpt: ${name} (localId: ${localId}, ${variables.length} variables, ${content ? 'with content' : 'no content'})`);
      }

      // Save to storage
      await storage.set(`excerpt:${uuid}`, excerpt);
      results.push({ uuid, name, success: true, variables: variables.length, hasContent: !!content });

    } catch (error) {
      console.error(`✗ Error initializing ${name}:`, error);
      results.push({ uuid, name, success: false, error: error.message });
    }
  }

  const successCount = results.filter(r => r.success).length;
  console.log(`✅ Bulk initialization complete: ${successCount}/${results.length} successful`);

  // Build and save the excerpt-index so getExcerpts can list them
  const successfulExcerpts = results
    .filter(r => r.success)
    .map(r => {
      const mapping = mappings.find(m => m.uuid === r.uuid);
      return {
        id: r.uuid,
        name: r.name,
        category: mapping?.category || 'General'
      };
    });

  await storage.set('excerpt-index', { excerpts: successfulExcerpts });
  console.log(`✓ Updated excerpt-index with ${successfulExcerpts.length} excerpts`);

  return {
    success: true,
    total: results.length,
    successful: successCount,
    failed: results.length - successCount,
    results
  };
}

/**
 * TEST FUNCTION: Fetch a page and analyze MultiExcerpt macro content availability
 *
 * This is a diagnostic function to check if the Confluence API returns the actual
 * content body of MultiExcerpt macros, or just metadata.
 *
 * @param {Object} req - Request object with pageId
 * @returns {Object} Analysis of what content is available
 */
export async function testMultiExcerptPageFetch(req) {
  try {
    const { pageId } = req.payload;

    console.log(`[TEST] Fetching page ${pageId} to analyze MultiExcerpt content...`);

    // Fetch page in storage format (XML representation)
    const response = await api.asUser().requestConfluence(
      route`/wiki/rest/api/content/${pageId}?expand=body.storage,version`
    );

    const data = await response.json();

    console.log('[TEST] Page fetched successfully');
    console.log('[TEST] Page title:', data.title);
    console.log('[TEST] Page version:', data.version.number);

    const storageContent = data.body?.storage?.value;

    if (!storageContent) {
      return {
        success: false,
        error: 'No storage content found in API response'
      };
    }

    console.log('[TEST] Storage content length:', storageContent.length);

    // Find all MultiExcerpt macros in the content
    const multiExcerptPattern = /<ac:structured-macro[^>]*ac:name="multiexcerpt-macro"[^>]*>/g;
    const matches = storageContent.match(multiExcerptPattern);

    const macroCount = matches ? matches.length : 0;
    console.log('[TEST] Found', macroCount, 'MultiExcerpt macros');

    // Extract the first macro for detailed analysis
    let firstMacroAnalysis = null;
    if (macroCount > 0) {
      // Find first macro with its full content
      const firstMacroStart = storageContent.indexOf('<ac:structured-macro');
      const firstMacroWithName = storageContent.indexOf('ac:name="multiexcerpt-macro"', firstMacroStart);

      // Find the opening tag end
      const openingTagEnd = storageContent.indexOf('>', firstMacroWithName);

      // Find the closing tag
      const closingTag = '</ac:structured-macro>';
      let closingTagStart = storageContent.indexOf(closingTag, openingTagEnd);

      if (closingTagStart !== -1) {
        const macroContent = storageContent.substring(firstMacroStart, closingTagStart + closingTag.length);

        // Extract macro name parameter
        const nameMatch = macroContent.match(/<ac:parameter ac:name="name">([^<]+)<\/ac:parameter>/);
        const macroName = nameMatch ? nameMatch[1] : 'Unknown';

        // Check for rich-text-body
        const hasRichTextBody = macroContent.includes('<ac:rich-text-body>');
        const richTextBodyMatch = macroContent.match(/<ac:rich-text-body>([\s\S]*?)<\/ac:rich-text-body>/);
        const bodyContent = richTextBodyMatch ? richTextBodyMatch[1] : null;

        firstMacroAnalysis = {
          name: macroName,
          hasRichTextBody,
          bodyContentLength: bodyContent ? bodyContent.length : 0,
          bodyContentPreview: bodyContent ? bodyContent.substring(0, 200) : null,
          fullMacroLength: macroContent.length,
          fullMacroPreview: macroContent.substring(0, 500)
        };

        console.log('[TEST] First macro analysis:');
        console.log('  - Name:', macroName);
        console.log('  - Has rich-text-body:', hasRichTextBody);
        console.log('  - Body content length:', bodyContent ? bodyContent.length : 0);
      }
    }

    return {
      success: true,
      pageId,
      pageTitle: data.title,
      storageContentLength: storageContent.length,
      multiExcerptCount: macroCount,
      firstMacroAnalysis,
      // Return a snippet of the raw storage content for manual inspection
      storageContentSnippet: storageContent.substring(0, 2000),
      verdict: firstMacroAnalysis?.hasRichTextBody
        ? 'GOOD: API returns macro body content - automated import is possible!'
        : 'BAD: API does not include macro body content - manual paste required'
    };

  } catch (error) {
    console.error('[TEST] Error fetching page:', error);
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
}

/**
 * Import Blueprint Standards directly from parsed JSON
 * This avoids regex parsing of nested XML which causes nesting issues
 */
export async function importFromParsedJson(req) {
  try {
    const { sources, deleteOldMigrations, spaceKey: providedSpaceKey } = req.payload;

    if (!sources || !Array.isArray(sources)) {
      return {
        success: false,
        error: 'Invalid sources data: expected array'
      };
    }

    console.log(`Importing ${sources.length} Blueprint Standards from parsed JSON...`);

    // Step 1: Delete all existing "Migrated from MultiExcerpt" excerpts if requested
    if (deleteOldMigrations) {
      console.log('Deleting all previously migrated excerpts...');
      const excerptIndex = await storage.get('excerpt-index') || { excerpts: [] };
      const toDelete = [];

      for (const excerptSummary of excerptIndex.excerpts) {
        const excerpt = await storage.get(`excerpt:${excerptSummary.id}`);
        if (excerpt && excerpt.category === 'Migrated from MultiExcerpt') {
          toDelete.push(excerpt.id);
        }
      }

      // Delete each excerpt
      for (const id of toDelete) {
        await storage.delete(`excerpt:${id}`);
        // Removed individual deletion logging to avoid hitting 100-line limit
      }

      // Update index
      const updatedIndex = {
        excerpts: excerptIndex.excerpts.filter(e => !toDelete.includes(e.id))
      };
      await storage.set('excerpt-index', updatedIndex);

      console.log(`Deleted ${toDelete.length} old migrated excerpts`);
    }

    // Step 2: Create new excerpts from JSON data and prepare for page creation
    const excerptIndex = await storage.get('excerpt-index') || { excerpts: [] };
    const imported = [];
    const skipped = [];
    const excerptsToCreate = []; // Store excerpt data for page creation

    for (const source of sources) {
      try {
        // Skip if no content or name
        if (!source.name || !source.name.trim()) {
          console.warn('Skipping source with no name');
          skipped.push({ name: 'Unknown', reason: 'No name provided' });
          continue;
        }

        if (!source.content || source.content.trim().length === 0) {
          console.warn(`Skipping source "${source.name}" - no content`);
          skipped.push({ name: source.name, reason: 'No content' });
          continue;
        }

        // Generate new excerpt ID and local ID
        const excerptId = generateUUID();
        const localId = generateUUID();

        // Create excerpt with name and "Migrated from MultiExcerpt" category
        const newExcerpt = {
          id: excerptId,
          name: source.name,
          content: source.content,
          category: 'Migrated from MultiExcerpt', // Always use this category
          variables: source.variables || [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
          // sourcePageId and sourceLocalId will be set after page creation
        };

        // Save to storage (will be updated with page info later)
        await storage.set(`excerpt:${excerptId}`, newExcerpt);

        // Add to index
        excerptIndex.excerpts.push({
          id: excerptId,
          name: source.name,
          category: 'Migrated from MultiExcerpt'
        });

        // Store for page creation
        excerptsToCreate.push({
          excerptId,
          localId,
          name: source.name,
          content: source.content
        });

        imported.push({
          id: excerptId,
          name: source.name,
          localId
        });

        // Removed individual import logging to avoid hitting 100-line limit

      } catch (err) {
        console.error(`Error importing source "${source.name}":`, err);
        skipped.push({ name: source.name, reason: err.message });
      }
    }

    // Save updated index
    await storage.set('excerpt-index', excerptIndex);

    console.log(`✅ Storage import complete: ${imported.length} imported, ${skipped.length} skipped`);

    // Step 3: Create a new page with all Source macros
    if (imported.length > 0) {
      console.log(`Creating new page with ${imported.length} Source macros...`);

      const appId = 'be1ff96b-d44d-4975-98d3-25b80a813bdd';
      const environmentId = req.context?.installContext?.split('/')[1] || 'ae38f536-b4c8-4dfa-a1c9-62026d61b4f9';

      // Get space key: use provided, fallback to auto-detection
      let spaceKey = providedSpaceKey;

      if (spaceKey) {
        console.log(`Using provided space key: ${spaceKey}`);
      } else {
        console.log('No space key provided, attempting auto-detection...');

        // Try to get current user's personal space
        try {
          const userResponse = await api.asApp().requestConfluence(route`/wiki/rest/api/user/current`, {
            headers: { 'Accept': 'application/json' }
          });

          if (userResponse.ok) {
            const userData = await userResponse.json();
            // Personal space key is usually ~accountId
            if (userData.accountId) {
              spaceKey = `~${userData.accountId}`;
              console.log(`Auto-detected personal space: ${spaceKey}`);
            }
          }
        } catch (err) {
          console.warn('Could not get user info:', err);
        }

        // If still no space, try to get any accessible space
        if (!spaceKey) {
          console.log('Trying to find any accessible space...');
          const spacesResponse = await api.asApp().requestConfluence(route`/wiki/rest/api/space?limit=10`, {
            headers: { 'Accept': 'application/json' }
          });

          if (spacesResponse.ok) {
            const spacesData = await spacesResponse.json();
            console.log(`Found ${spacesData.results?.length || 0} spaces`);
            if (spacesData.results && spacesData.results.length > 0) {
              // Try to find personal space first
              const personalSpace = spacesData.results.find(s => s.type === 'personal');
              spaceKey = personalSpace ? personalSpace.key : spacesData.results[0].key;
              console.log(`Using space: ${spaceKey} (type: ${personalSpace ? 'personal' : 'team'})`);
            }
          }
        }

        if (!spaceKey) {
          throw new Error('No space found to create page in. Please provide a space key or ensure you have access to at least one Confluence space.');
        }
      }

      console.log(`Creating page in space: ${spaceKey}`);

      // Build page content with all Source macros
      let pageContent = `<p><Strong>Blueprint Standards - Migrated from MultiExcerpt</Strong></p>`;
      pageContent += `<p>This page contains ${imported.length} Blueprint Standard Source macros imported from MultiExcerpt.</p>`;
      pageContent += `<p><em>Created: ${new Date().toISOString()}</em></p><hr />`;

      for (const excerpt of excerptsToCreate) {
        // Escape XML special characters in name
        const escapedName = excerpt.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        // Add section header
        pageContent += `<h3>${escapedName}</h3>`;

        // Build Source macro
        pageContent += `<ac:adf-extension><ac:adf-node type="bodied-extension">`;
        pageContent += `<ac:adf-attribute key="extension-key">${appId}/${environmentId}/static/blueprint-standard-source</ac:adf-attribute>`;
        pageContent += `<ac:adf-attribute key="extension-type">com.atlassian.ecosystem</ac:adf-attribute>`;
        pageContent += `<ac:adf-attribute key="parameters">`;
        pageContent += `<ac:adf-parameter key="local-id">${excerpt.localId}</ac:adf-parameter>`;
        pageContent += `<ac:adf-parameter key="extension-id">ari:cloud:ecosystem::extension/${appId}/${environmentId}/static/blueprint-standard-source</ac:adf-parameter>`;
        pageContent += `<ac:adf-parameter key="extension-title">Blueprint Standard - Source</ac:adf-parameter>`;
        pageContent += `<ac:adf-parameter key="layout">bodiedExtension</ac:adf-parameter>`;
        pageContent += `<ac:adf-parameter key="forge-environment">PRODUCTION</ac:adf-parameter>`;
        pageContent += `<ac:adf-parameter key="render">native</ac:adf-parameter>`;
        pageContent += `<ac:adf-parameter key="guest-params">`;
        pageContent += `<ac:adf-parameter key="excerpt-id">${excerpt.excerptId}</ac:adf-parameter>`;
        pageContent += `<ac:adf-parameter key="excerpt-name">${escapedName}</ac:adf-parameter>`;
        pageContent += `<ac:adf-parameter key="category">Migrated from MultiExcerpt</ac:adf-parameter>`;
        pageContent += `<ac:adf-parameter key="variables"><ac:adf-parameter-value /></ac:adf-parameter>`;
        pageContent += `<ac:adf-parameter key="toggles"><ac:adf-parameter-value /></ac:adf-parameter>`;
        pageContent += `</ac:adf-parameter>`;
        pageContent += `</ac:adf-attribute>`;
        pageContent += `<ac:adf-attribute key="text">Blueprint Standard - Source</ac:adf-attribute>`;
        pageContent += `<ac:adf-attribute key="layout">default</ac:adf-attribute>`;
        pageContent += `<ac:adf-attribute key="local-id">${excerpt.localId}</ac:adf-attribute>`;
        pageContent += `<ac:adf-content><![CDATA[${excerpt.content}]]></ac:adf-content>`;
        pageContent += `</ac:adf-node></ac:adf-extension>`;
        pageContent += `<br />`;
      }

      // Step 1: Get numeric space ID (API v2 requires numeric spaceId)
      // Accept either spaceKey (string like "~5bb22d3a..." or "CS") or spaceId (numeric)
      let spaceId;

      // Check if input is numeric (spaceId provided directly)
      if (/^\d+$/.test(spaceKey)) {
        spaceId = spaceKey;
        console.log(`Using provided space ID: ${spaceId}`);
      } else {
        // Look up spaceId from spaceKey
        console.log(`Looking up space ID for key: ${spaceKey}...`);
        const spaceResponse = await api.asApp().requestConfluence(route`/wiki/api/v2/spaces?keys=${spaceKey}`, {
          headers: { 'Accept': 'application/json' }
        });

        if (!spaceResponse.ok) {
          const errorText = await spaceResponse.text();
          console.error(`Failed to lookup space: ${spaceResponse.status} - ${errorText}`);
          throw new Error(`Failed to lookup space: ${spaceResponse.status} - ${errorText}`);
        }

        const spaceData = await spaceResponse.json();
        if (!spaceData.results || spaceData.results.length === 0) {
          throw new Error(`Space not found: ${spaceKey}`);
        }

        spaceId = spaceData.results[0].id;
        console.log(`✅ Found space ID: ${spaceId} for key: ${spaceKey}`);
      }

      // Step 2: Create page with full content in ONE API call (faster than blank+update)
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const pageTitle = `Blueprint Standards (Migrated ${timestamp})`;

      console.log(`Creating page with ${imported.length} Source macros...`);
      const createPageResponse = await api.asApp().requestConfluence(route`/wiki/api/v2/pages`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          spaceId: spaceId,
          status: 'current',
          title: pageTitle,
          body: {
            representation: 'storage',
            value: pageContent
          }
        })
      });

      if (!createPageResponse.ok) {
        const errorText = await createPageResponse.text();
        console.error(`Failed to create page: ${createPageResponse.status} - ${errorText}`);
        throw new Error(`Failed to create page: ${createPageResponse.status} - ${errorText}`);
      }

      const newPage = await createPageResponse.json();
      const newPageId = newPage.id;
      console.log(`✅ Created page with ${imported.length} Source macros (ID: ${newPageId})`);
      console.log(`Page URL: /wiki/spaces/${spaceKey}/pages/${newPageId}`);

      // Step 4: Update all excerpts with sourcePageId and sourceLocalId
      for (const excerpt of excerptsToCreate) {
        const storedExcerpt = await storage.get(`excerpt:${excerpt.excerptId}`);
        if (storedExcerpt) {
          storedExcerpt.sourcePageId = newPageId;
          storedExcerpt.sourceLocalId = excerpt.localId;
          storedExcerpt.updatedAt = new Date().toISOString();
          await storage.set(`excerpt:${excerpt.excerptId}`, storedExcerpt);
        }
      }

      console.log(`✅ Updated ${excerptsToCreate.length} excerpts with page info`);

      return {
        success: true,
        summary: {
          total: sources.length,
          imported: imported.length,
          skipped: skipped.length,
          pageId: newPageId,
          pageTitle: pageTitle
        },
        imported,
        skipped,
        pageUrl: `${req.context?.siteUrl}/wiki/spaces/${spaceKey}/pages/${newPageId}`
      };
    }

    return {
      success: true,
      summary: {
        total: sources.length,
        imported: imported.length,
        skipped: skipped.length
      },
      imported,
      skipped
    };

  } catch (error) {
    console.error('Error importing from JSON:', error);
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
}

/**
 * UI-Based Migration Functions
 * 
 * These functions replicate the logic from scripts/*.js but run within Forge,
 * eliminating the need for API tokens and external Node.js scripts.
 */

/**
 * Step 1: Clone Blueprint Standard Source Macros
 * 
 * Clones a single template Blueprint Standard Source macro N times,
 * once for each MultiExcerpt macro found on the page.
 */
export async function migrateStep1CloneMacros(req) {
  const { pageId } = req.payload;
  
  console.log(`[Step 1] Starting macro cloning for page ${pageId}...`);

  try {
    // Fetch page storage
    console.log('Fetching page storage...');
    const pageResponse = await api.asApp().requestConfluence(
      route`/wiki/api/v2/pages/${pageId}?body-format=storage`,
      { headers: { 'Accept': 'application/json' } }
    );

    if (!pageResponse.ok) {
      const errorText = await pageResponse.text();
      throw new Error(`Failed to fetch page: ${pageResponse.status} - ${errorText}`);
    }

    const pageData = await pageResponse.json();
    const storageContent = pageData.body.storage.value;
    const currentVersion = pageData.version.number;
    console.log(`✓ Page fetched (version ${currentVersion})`);

    // Extract MultiExcerpt names
    console.log('Extracting MultiExcerpt names...');
    const nameRegex = /<ac:structured-macro ac:name="multiexcerpt-macro"[^>]*>[\s\S]*?<ac:parameter ac:name="name">([^<]+)<\/ac:parameter>/g;
    const multiExcerptNames = [];
    let match;
    while ((match = nameRegex.exec(storageContent)) !== null) {
      multiExcerptNames.push(match[1]);
    }
    console.log(`✓ Found ${multiExcerptNames.length} MultiExcerpt macros`);

    if (multiExcerptNames.length === 0) {
      return {
        success: false,
        error: 'No MultiExcerpt macros found on this page'
      };
    }

    // Find Blueprint Standard Source template
    console.log('Finding Blueprint Standard Source macro template...');
    const blueprintRegex = /<ac:adf-extension><ac:adf-node type="bodied-extension">[\s\S]*?blueprint-standard-source[\s\S]*?<\/ac:adf-node><\/ac:adf-extension>/;
    const templateMatch = storageContent.match(blueprintRegex);

    if (!templateMatch) {
      return {
        success: false,
        error: 'No Blueprint Standard Source macro found! Please create one manually first.'
      };
    }

    const blueprintTemplate = templateMatch[0];
    console.log('✓ Found Blueprint Standard Source macro template');

    // Clone and update names
    console.log('Cloning Blueprint Standard Source macros...');
    const clonedMacros = multiExcerptNames.map(name => {
      return blueprintTemplate.replace(
        /(<ac:adf-parameter key="excerpt-name">)(.*?)(<\/ac:adf-parameter>)/,
        `$1${name}$3`
      );
    });
    console.log(`✓ Created ${clonedMacros.length} cloned macros`);

    // Insert clones into storage
    console.log('Inserting clones into page storage...');
    const insertPosition = storageContent.indexOf(blueprintTemplate) + blueprintTemplate.length;
    const updatedStorage =
      storageContent.slice(0, insertPosition) +
      '\n' + clonedMacros.join('\n') + '\n' +
      storageContent.slice(insertPosition);
    console.log('✓ Macros inserted into storage');

    // Update page
    console.log('Updating page via API...');
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
            value: updatedStorage
          },
          version: {
            number: currentVersion + 1,
            message: 'Cloned Blueprint Standard Source macros via UI migration tool'
          }
        })
      }
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      throw new Error(`Failed to update page: ${updateResponse.status} - ${errorText}`);
    }

    console.log('✓ Page updated successfully!');

    return {
      success: true,
      clonedCount: clonedMacros.length,
      message: `Successfully cloned ${clonedMacros.length} Blueprint Standard Source macros`
    };

  } catch (error) {
    console.error('[Step 1] Error:', error);
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
}

/**
 * Step 2: Migrate Content from MultiExcerpt to Blueprint Standard
 * 
 * Copies the body content from each MultiExcerpt macro into its
 * corresponding Blueprint Standard Source macro (matched by name).
 */
export async function migrateStep2MigrateContent(req) {
  const { pageId } = req.payload;
  
  console.log(`[Step 2] Starting content migration for page ${pageId}...`);

  try {
    // Fetch page storage
    console.log('Fetching page storage...');
    const pageResponse = await api.asApp().requestConfluence(
      route`/wiki/api/v2/pages/${pageId}?body-format=storage`,
      { headers: { 'Accept': 'application/json' } }
    );

    if (!pageResponse.ok) {
      const errorText = await pageResponse.text();
      throw new Error(`Failed to fetch page: ${pageResponse.status} - ${errorText}`);
    }

    const pageData = await pageResponse.json();
    const storageContent = pageData.body.storage.value;
    const currentVersion = pageData.version.number;
    console.log(`✓ Page fetched (version ${currentVersion})`);

    // Extract MultiExcerpt macros with content
    console.log('Extracting MultiExcerpt macros...');
    const multiExcerpts = [];
    const macroStartRegex = /<ac:structured-macro ac:name="multiexcerpt-macro"[\s\S]*?<ac:parameter ac:name="name">([^<]+)<\/ac:parameter>[\s\S]*?<ac:rich-text-body>/g;

    let startMatch;
    while ((startMatch = macroStartRegex.exec(storageContent)) !== null) {
      const name = startMatch[1];
      const bodyStart = macroStartRegex.lastIndex;

      // Find matching closing tag with depth counting
      let depth = 1;
      let pos = bodyStart;
      let bodyEnd = -1;

      while (pos < storageContent.length && depth > 0) {
        const nextOpen = storageContent.indexOf('<ac:rich-text-body>', pos);
        const nextClose = storageContent.indexOf('</ac:rich-text-body>', pos);

        if (nextClose === -1) break;

        if (nextOpen !== -1 && nextOpen < nextClose) {
          depth++;
          pos = nextOpen + 19;
        } else {
          depth--;
          if (depth === 0) {
            bodyEnd = nextClose;
          }
          pos = nextClose + 20;
        }
      }

      if (bodyEnd !== -1) {
        const content = storageContent.substring(bodyStart, bodyEnd);
        multiExcerpts.push({ name, content });
      }
    }

    console.log(`✓ Found ${multiExcerpts.length} MultiExcerpt macros with content`);

    if (multiExcerpts.length === 0) {
      return {
        success: false,
        error: 'No MultiExcerpt macros with content found on this page'
      };
    }

    // Create content map
    const contentMap = new Map();
    multiExcerpts.forEach(me => {
      contentMap.set(me.name, me.content);
    });

    // Update Blueprint Standard Source macros
    console.log('Updating Blueprint Standard Source content...');
    const blueprintRegex = /<ac:adf-extension><ac:adf-node type="bodied-extension">[\s\S]*?<ac:adf-parameter key="excerpt-name">([^<]+)<\/ac:adf-parameter>[\s\S]*?<ac:adf-content>([\s\S]*?)<\/ac:adf-content>[\s\S]*?<\/ac:adf-node><\/ac:adf-extension>/g;

    let updatedCount = 0;
    const updatedStorage = storageContent.replace(blueprintRegex, (match, excerptName) => {
      const newContent = contentMap.get(excerptName);

      if (newContent) {
        updatedCount++;
        if (updatedCount % 10 === 0) {
          console.log(`  ✓ Updated ${updatedCount} macros...`);
        }
        return match.replace(
          /(<ac:adf-content>)([\s\S]*?)(<\/ac:adf-content>)/,
          `$1${newContent}$3`
        );
      }
      return match;
    });

    console.log(`✓ Updated ${updatedCount} Blueprint Standard Source macros`);

    // Update page
    console.log('Updating page via API...');
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
            value: updatedStorage
          },
          version: {
            number: currentVersion + 1,
            message: 'Migrated content from MultiExcerpt to Blueprint Standard Source macros via UI migration tool'
          }
        })
      }
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      throw new Error(`Failed to update page: ${updateResponse.status} - ${errorText}`);
    }

    console.log('✓ Page updated successfully!');

    return {
      success: true,
      updatedCount,
      message: `Successfully migrated content for ${updatedCount} Blueprint Standard Source macros`
    };

  } catch (error) {
    console.error('[Step 2] Error:', error);
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
}

/**
 * Step 3: Fix Excerpt IDs
 * 
 * Generates a unique UUID for each Blueprint Standard Source macro.
 * This is required for the Edit modal to work correctly.
 */
export async function migrateStep3FixExcerptIds(req) {
  const { pageId } = req.payload;
  
  console.log(`[Step 3] Starting excerpt ID fix for page ${pageId}...`);

  try {
    // Fetch page storage
    console.log('Fetching page storage...');
    const pageResponse = await api.asApp().requestConfluence(
      route`/wiki/api/v2/pages/${pageId}?body-format=storage`,
      { headers: { 'Accept': 'application/json' } }
    );

    if (!pageResponse.ok) {
      const errorText = await pageResponse.text();
      throw new Error(`Failed to fetch page: ${pageResponse.status} - ${errorText}`);
    }

    const pageData = await pageResponse.json();
    const storageContent = pageData.body.storage.value;
    const currentVersion = pageData.version.number;
    console.log(`✓ Page fetched (version ${currentVersion})`);

    // Update excerpt IDs
    console.log('Generating unique IDs for each Blueprint Standard Source...');
    const macroRegex = /<ac:adf-extension><ac:adf-node type="bodied-extension">[\s\S]*?blueprint-standard-source[\s\S]*?<\/ac:adf-node><\/ac:adf-extension>/g;

    let updateCount = 0;
    const updatedStorage = storageContent.replace(macroRegex, (macroMatch) => {
      // Extract excerpt-name
      const nameMatch = macroMatch.match(/<ac:adf-parameter key="excerpt-name">([^<]+)<\/ac:adf-parameter>/);
      const excerptName = nameMatch ? nameMatch[1] : 'Unknown';

      // Skip template macros
      if (excerptName === 'Blueprint App0' || excerptName === 'Test0') {
        return macroMatch;
      }

      // Generate new UUID
      const newId = generateUUID();

      // Replace excerpt-id
      const updatedMacro = macroMatch.replace(
        /(<ac:adf-parameter key="excerpt-id">)([^<]+)(<\/ac:adf-parameter>)/,
        `$1${newId}$3`
      );

      updateCount++;
      if (updateCount % 10 === 0) {
        console.log(`  ✓ Updated ${updateCount} macros...`);
      }

      return updatedMacro;
    });

    console.log(`✓ Generated ${updateCount} unique IDs`);

    // Update page
    console.log('Updating page via API...');
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
            value: updatedStorage
          },
          version: {
            number: currentVersion + 1,
            message: 'Fixed excerpt IDs for Blueprint Standard Source macros via UI migration tool'
          }
        })
      }
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      throw new Error(`Failed to update page: ${updateResponse.status} - ${errorText}`);
    }

    console.log('✓ Page updated successfully!');

    return {
      success: true,
      updatedCount: updateCount,
      message: `Successfully generated unique IDs for ${updateCount} Blueprint Standard Source macros`
    };

  } catch (error) {
    console.error('[Step 3] Error:', error);
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
}

/**
 * Create Test Page with 148 Embed Macros
 *
 * Performance testing tool that creates a page with 148 Embed macros,
 * each referencing one of the migrated Sources with random variable values.
 */
export async function createTestEmbedsPage(req) {
  try {
    console.log('🚀 Starting test page creation with 148 Embed macros...');

    // Get page ID from request
    const targetPageId = req.payload?.pageId || '84803640';
    console.log(`📋 Target page ID: ${targetPageId}`);

    // Random word generators for test data
    const adjectives = ['Red', 'Blue', 'Fast', 'Slow', 'Big', 'Small', 'Hot', 'Cold', 'New', 'Old'];
    const nouns = ['Cat', 'Dog', 'Car', 'Tree', 'House', 'Book', 'Phone', 'Table', 'Chair', 'Window'];
    const dates = ['2024-01-15', '2024-02-20', '2024-03-10', '2024-04-05', '2024-05-25'];
    const venues = ['Stadium Alpha', 'Arena Beta', 'Center Gamma', 'Park Delta'];

    const randomWord = () => {
      const words = [...adjectives, ...nouns];
      return words[Math.floor(Math.random() * words.length)];
    };

    const randomTwoWords = () => {
      return `${randomWord()} ${randomWord()}`;
    };

    const randomDate = () => {
      return dates[Math.floor(Math.random() * dates.length)];
    };

    const randomVenue = () => {
      return venues[Math.floor(Math.random() * venues.length)];
    };

    const generateRandomValue = (variableName) => {
      // Try to generate contextually appropriate random values
      if (variableName.includes('date')) return randomDate();
      if (variableName.includes('venue')) return randomVenue();
      if (variableName.includes('league') || variableName.includes('vertical')) return randomWord();

      // Default: 1-2 random words
      return Math.random() > 0.5 ? randomWord() : randomTwoWords();
    }

    // Step 1: Fetch all excerpts from storage
    console.log('📡 Fetching all excerpts from storage...');
    const excerptIndex = await storage.get('excerpt-index') || { excerpts: [] };
    console.log(`✓ Found ${excerptIndex.excerpts.length} excerpts`);

    if (excerptIndex.excerpts.length === 0) {
      throw new Error('No excerpts found in storage. Run bulk initialization first.');
    }

    // Step 2: Load full excerpt data for each (to get variables)
    console.log('📋 Loading full excerpt data...');
    const excerpts = [];
    for (const summary of excerptIndex.excerpts) {
      const excerpt = await storage.get(`excerpt:${summary.id}`);
      if (excerpt) {
        excerpts.push(excerpt);
      }
    }
    console.log(`✓ Loaded ${excerpts.length} full excerpts`);

    // Step 3: Generate Embed macros
    console.log('🏗️ Generating Embed macros...');
    const embedMacros = [];

    for (let i = 0; i < excerpts.length; i++) {
      const excerpt = excerpts[i];
      const localId = crypto.randomUUID();

      // Generate random variable values
      const variableValues = {};
      if (excerpt.variables && excerpt.variables.length > 0) {
        excerpt.variables.forEach(variable => {
          variableValues[variable.name] = generateRandomValue(variable.name);
        });
      }

      // Create the Embed macro in Confluence storage format
      const variableValuesJson = JSON.stringify(variableValues).replace(/"/g, '&quot;');

      const embedMacro = `<ac:adf-extension><ac:adf-node type="extension"><ac:adf-attribute key="extension-type">com.atlassian.ecosystem</ac:adf-attribute><ac:adf-attribute key="extension-key">blueprint-standard-embed</ac:adf-attribute><ac:adf-attribute key="layout">default</ac:adf-attribute><ac:adf-attribute key="local-id">${localId}</ac:adf-attribute><ac:adf-parameter key="excerpt-id">${excerpt.id}</ac:adf-parameter><ac:adf-parameter key="__bodyContent"><guest-params><parameter name="excerpt-id">${excerpt.id}</parameter><parameter name="variable-values">${variableValuesJson}</parameter></guest-params></ac:adf-parameter></ac:adf-node></ac:adf-extension>`;

      embedMacros.push(embedMacro);

      if ((i + 1) % 20 === 0) {
        console.log(`  ✓ Created ${i + 1}/${excerpts.length} Embeds...`);
      }
    }

    console.log(`✓ Generated ${embedMacros.length} Embed macros`);

    // Step 4: Create page content
    console.log('📝 Assembling page content...');
    const pageContent = `<h1>🧪 Performance Test: ${embedMacros.length} Blueprint Standard Embeds</h1>
<p>This page contains <Strong>${embedMacros.length} Embed macros</Strong> for performance testing.</p>
<p><em>Created: ${new Date().toISOString()}</em></p>
<p>This is 3x the realistic maximum to test caching and rendering performance.</p>
<hr/>
<h2>Test Embeds Below:</h2>
${embedMacros.map(m => `<p>${m}</p>`).join('\n')}`;

    console.log(`✓ Page content assembled (${Math.round(pageContent.length / 1024)} KB)`);

    // Step 5: Fetch current page to get version
    console.log(`📡 Fetching page ${targetPageId}...`);
    const pageResponse = await api.asApp().requestConfluence(
      route`/wiki/api/v2/pages/${targetPageId}`,
      {
        headers: { 'Accept': 'application/json' }
      }
    );

    if (!pageResponse.ok) {
      throw new Error(`Failed to fetch page: ${pageResponse.status}`);
    }

    const pageData = await pageResponse.json();
    console.log(`✓ Page fetched (version ${pageData.version.number})`);

    // Step 6: Update the page
    console.log('🚀 Updating page with Embed macros...');
    const updateResponse = await api.asApp().requestConfluence(
      route`/wiki/api/v2/pages/${targetPageId}`,
      {
        method: 'PUT',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: targetPageId,
          status: 'current',
          title: `🧪 Performance Test: ${embedMacros.length} Embeds`,
          spaceId: pageData.spaceId,
          body: {
            representation: 'storage',
            value: pageContent
          },
          version: {
            number: pageData.version.number + 1,
            message: `Added ${embedMacros.length} test Embed macros for performance testing`
          }
        })
      }
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      throw new Error(`Failed to update page: ${updateResponse.status} - ${errorText}`);
    }

    console.log('✓ Page updated successfully!');

    return {
      success: true,
      pageId: targetPageId,
      embedCount: embedMacros.length,
      message: `Successfully created test page with ${embedMacros.length} Embed macros! Check page ${targetPageId}`
    };

  } catch (error) {
    console.error('❌ Error creating test page:', error);
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
}

/**
 * Diagnostic function to dump the first Source macro XML structure
 */
export async function dumpFirstSourceMacro(req) {
  try {
    const PAGE_ID = req.payload?.pageId || '99909654';
    console.log(`📡 Fetching page ${PAGE_ID}...`);

    const pageResponse = await api.asApp().requestConfluence(
      route`/wiki/api/v2/pages/${PAGE_ID}?body-format=storage`,
      { headers: { 'Accept': 'application/json' } }
    );

    const pageData = await pageResponse.json();
    const storageContent = pageData.body.storage.value;

    // Find first Source macro
    const macroRegex = /<ac:adf-extension><ac:adf-node type="bodied-extension">[\s\S]*?blueprint-standard-source[\s\S]*?<\/ac:adf-node><\/ac:adf-extension>/;
    const match = storageContent.match(macroRegex);

    if (match) {
      const macroXml = match[0];
      console.log('========== First Source Macro XML ==========');
      console.log(macroXml);
      console.log('========== End Macro XML ==========');

      return {
        success: true,
        macroXml: macroXml,
        length: macroXml.length
      };
    } else {
      return {
        success: false,
        error: 'No Source macro found'
      };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Populate content for all migrated Sources by fetching ADF from their pages
 * Converts Storage Format XML to ADF JSON format for proper rendering
 */
export async function populateSourceContent() {
  try {
    console.log('📥 Starting content population for migrated Sources...');

    // Get all excerpts from the index
    const excerptIndex = await storage.get('excerpt-index') || { excerpts: [] };

    // Group excerpts by page to minimize API calls
    const excerptsByPage = new Map(); // pageId -> [excerpts]

    for (const excerptSummary of excerptIndex.excerpts) {
      const excerpt = await storage.get(`excerpt:${excerptSummary.id}`);
      if (!excerpt) continue;

      // Only process excerpts that have sourcePageId and sourceLocalId
      if (excerpt.sourcePageId && excerpt.sourceLocalId) {
        if (!excerptsByPage.has(excerpt.sourcePageId)) {
          excerptsByPage.set(excerpt.sourcePageId, []);
        }
        excerptsByPage.get(excerpt.sourcePageId).push(excerpt);
      }
    }

    console.log(`Found ${excerptsByPage.size} unique pages with Source macros`);

    let successCount = 0;
    let failCount = 0;

    // Fetch each page in ADF format and extract content
    for (const [pageId, pageExcerpts] of excerptsByPage.entries()) {
      try {
        console.log(`Fetching page ${pageId} with ${pageExcerpts.length} Sources...`);

        // Fetch page in atlas_doc_format (ADF) to get proper ADF structure
        const response = await api.asApp().requestConfluence(
          route`/wiki/api/v2/pages/${pageId}?body-format=atlas_doc_format`,
          { headers: { 'Accept': 'application/json' } }
        );

        const pageData = await response.json();
        const adfBody = pageData?.body?.atlas_doc_format?.value;

        if (!adfBody) {
          console.warn(`⚠️ No ADF body found for page ${pageId}`);
          failCount += pageExcerpts.length;
          continue;
        }

        // Parse ADF to find each Source macro
        const adfDoc = typeof adfBody === 'string' ? JSON.parse(adfBody) : adfBody;

        // Find all bodiedExtension nodes (Source macros) in the ADF
        const findExtensions = (node, extensions = []) => {
          if (node.type === 'bodiedExtension' && node.attrs?.extensionKey?.includes('blueprint-standard-source')) {
            extensions.push(node);
          }
          if (node.content) {
            for (const child of node.content) {
              findExtensions(child, extensions);
            }
          }
          return extensions;
        };

        const extensionNodes = findExtensions(adfDoc);
        console.log(`Found ${extensionNodes.length} Source macro extension nodes`);

        // Match each excerpt to its extension node by localId
        for (const excerpt of pageExcerpts) {
          const extensionNode = extensionNodes.find(node =>
            node.attrs?.localId === excerpt.sourceLocalId
          );

          if (extensionNode && extensionNode.content) {
            // The content is the ADF inside the bodiedExtension
            const bodyContent = {
              type: 'doc',
              version: 1,
              content: extensionNode.content
            };

            // Extract variables from ADF content
            const variables = extractVariablesFromAdf(bodyContent);

            // Generate content hash
            const crypto = require('crypto');
            const contentHash = crypto.createHash('sha256').update(JSON.stringify(bodyContent)).digest('hex');

            // Update excerpt
            excerpt.content = bodyContent;
            excerpt.variables = variables;
            excerpt.contentHash = contentHash;
            excerpt.updatedAt = new Date().toISOString();

            await storage.set(`excerpt:${excerpt.id}`, excerpt);

            console.log(`✅ Populated content for: ${excerpt.name} (${variables.length} variables)`);
            successCount++;
          } else {
            console.warn(`⚠️ No extension node found for ${excerpt.name} (localId: ${excerpt.sourceLocalId})`);
            failCount++;
          }
        }
      } catch (error) {
        console.error(`Error processing page ${pageId}:`, error);
        failCount += pageExcerpts.length;
      }
    }

    const message = `✅ Content population complete!\n\n` +
      `• Successfully populated: ${successCount}\n` +
      `• Failed: ${failCount}`;

    console.log(message);

    return {
      success: true,
      successCount,
      failCount,
      message
    };
  } catch (error) {
    console.error('Error in populateSourceContent:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Helper function to extract variables from ADF content
 */
function extractVariablesFromAdf(adfDoc) {
  const variables = new Set();
  const variableRegex = /\{\{([^}]+)\}\}/g;

  const extractFromNode = (node) => {
    // Check text content
    if (node.text) {
      let match;
      while ((match = variableRegex.exec(node.text)) !== null) {
        variables.add(match[1]);
      }
    }

    // Recurse into content
    if (node.content) {
      for (const child of node.content) {
        extractFromNode(child);
      }
    }
  };

  extractFromNode(adfDoc);

  return Array.from(variables).map(name => ({
    name,
    defaultValue: '',
    description: ''
  }));
}

/**
 * Diagnostic: Get one excerpt from storage and log its structure
 */
export async function getOneExcerptData(req) {
  try {
    const { excerptName } = req.payload || {};

    // Get the excerpt index
    const excerptIndex = await storage.get('excerpt-index') || { excerpts: [] };

    if (excerptIndex.excerpts.length === 0) {
      return { success: false, error: 'No excerpts in index' };
    }

    // Find excerpt by name if provided, otherwise use first one
    let targetExcerptId;
    if (excerptName) {
      const found = excerptIndex.excerpts.find(e => e.name === excerptName);
      if (found) {
        targetExcerptId = found.id;
      } else {
        return { success: false, error: `No excerpt found with name: ${excerptName}` };
      }
    } else {
      targetExcerptId = excerptIndex.excerpts[0].id;
    }

    const excerpt = await storage.get(`excerpt:${targetExcerptId}`);

    // Log to forge logs for easy viewing
    console.log('========== EXCERPT DIAGNOSTIC ==========');
    console.log('Name:', excerpt?.name);
    console.log('Content Type:', excerpt?.content ? typeof excerpt.content : 'null');
    console.log('Is Object:', excerpt?.content && typeof excerpt.content === 'object');
    if (excerpt?.content && typeof excerpt.content === 'object') {
      console.log('Object Keys:', Object.keys(excerpt.content));
      console.log('Full Content (first 500 chars):', JSON.stringify(excerpt.content).substring(0, 500));
    } else {
      console.log('Content (first 500 chars):', String(excerpt?.content || '').substring(0, 500));
    }
    console.log('========================================');

    return {
      success: true,
      message: `Check forge logs for excerpt data: ${excerpt?.name}`
    };
  } catch (error) {
    console.error('Error in getOneExcerptData:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Diagnostic: Check page ADF structure to understand why macros aren't found
 */
export async function diagnosePageAdfStructure(req) {
  try {
    const { pageId } = req.payload || {};

    if (!pageId) {
      return { success: false, error: 'pageId required' };
    }

    console.log(`========== PAGE ADF DIAGNOSTIC (Page ${pageId}) ==========`);

    // Fetch page in ADF format
    const response = await api.asApp().requestConfluence(
      route`/wiki/api/v2/pages/${pageId}?body-format=atlas_doc_format`,
      {
        headers: {
          'Accept': 'application/json'
        }
      }
    );

    if (!response.ok) {
      console.log('❌ Failed to fetch page');
      return { success: false, error: 'Failed to fetch page' };
    }

    const pageData = await response.json();
    const adfBody = pageData?.body?.atlas_doc_format?.value;

    if (!adfBody) {
      console.log('❌ No ADF body found');
      return { success: false, error: 'No ADF body' };
    }

    const adfDoc = typeof adfBody === 'string' ? JSON.parse(adfBody) : adfBody;

    // Find all nodes recursively and log their types
    const nodeTypes = new Map(); // type -> count
    const extensionKeys = new Set();
    const localIds = [];

    const analyzeNode = (node, depth = 0) => {
      if (!node || typeof node !== 'object') return;

      // Count node types
      if (node.type) {
        nodeTypes.set(node.type, (nodeTypes.get(node.type) || 0) + 1);
      }

      // Track extensions
      if (node.type === 'bodiedExtension' || node.type === 'extension') {
        if (node.attrs?.extensionKey) {
          extensionKeys.add(node.attrs.extensionKey);
        }
        if (node.attrs?.localId) {
          localIds.push({
            type: node.type,
            extensionKey: node.attrs.extensionKey,
            localId: node.attrs.localId,
            hasContent: !!node.content
          });
        }
      }

      // Recurse
      if (node.content) {
        for (const child of node.content) {
          analyzeNode(child, depth + 1);
        }
      }
    };

    analyzeNode(adfDoc);

    console.log('\n📊 Node Types Found:');
    for (const [type, count] of nodeTypes.entries()) {
      console.log(`  - ${type}: ${count}`);
    }

    console.log('\n🔌 Extension Keys Found:');
    for (const key of extensionKeys) {
      console.log(`  - ${key}`);
    }

    console.log(`\n🆔 Extension Nodes with LocalIDs (${localIds.length} total):`);
    localIds.slice(0, 5).forEach(item => {
      console.log(`  - Type: ${item.type}, Key: ${item.extensionKey}, LocalID: ${item.localId}, HasContent: ${item.hasContent}`);
    });
    if (localIds.length > 5) {
      console.log(`  ... and ${localIds.length - 5} more`);
    }

    console.log('========================================\n');

    return {
      success: true,
      message: `Found ${nodeTypes.size} node types, ${extensionKeys.size} extension types, ${localIds.length} extensions with localIds. Check forge logs for details.`
    };
  } catch (error) {
    console.error('Error in diagnosePageAdfStructure:', error);
    return { success: false, error: error.message };
  }
}
