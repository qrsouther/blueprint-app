import Resolver from '@forge/resolver';
import { storage } from '@forge/api';
import api, { route } from '@forge/api';
import { Queue } from '@forge/events';
import { generateUUID } from './utils.js';
import { logFunction, logPhase, logSuccess, logFailure } from './utils/forge-logger.js';

// Import utility functions from modular files

// Import simple resolver functions (Phase 2 modularization)
import {
  detectVariablesFromContent as detectVariablesResolver,
  detectTogglesFromContent as detectTogglesResolver,
  getExcerpts as getExcerptsResolver,
  getExcerpt as getExcerptResolver,
  debugExcerpt as debugExcerptResolver,
  getPageTitle as getPageTitleResolver,
  getVariableValues as getVariableValuesResolver,
  getCanonicalLocalId as getCanonicalLocalIdResolver,
  recoverOrphanedData as recoverOrphanedDataResolver,
  detectDeactivatedEmbeds as detectDeactivatedEmbedsResolver,
  copyDeactivatedEmbedData as copyDeactivatedEmbedDataResolver,
  getCachedContent as getCachedContentResolver,
  saveCachedContent as saveCachedContentResolver,
  getCategories as getCategoriesResolver,
  saveCategories as saveCategoriesResolver,
  getCheckProgress as getCheckProgressResolver,
  getMigrationStatus as getMigrationStatusResolver,
  getMultiExcerptScanProgress as getMultiExcerptScanProgressResolver,
  checkVersionStaleness as checkVersionStalenessResolver,
  getOrphanedUsage as getOrphanedUsageResolver,
  getLastVerificationTime as getLastVerificationTimeResolver,
  setLastVerificationTime as setLastVerificationTimeResolver,
  getNextScheduledCheckTime as getNextScheduledCheckTimeResolver,
  setNextScheduledCheckTime as setNextScheduledCheckTimeResolver,
  getCurrentUser as getCurrentUserResolver,
  queryStorage as queryStorageResolver,
  queryStorageMultiple as queryStorageMultipleResolver,
  bulkUpdateStorage as bulkUpdateStorageResolver,
  getAdminUrl as getAdminUrlResolver,
  setAdminUrl as setAdminUrlResolver,
  getForgeEnvironment as getForgeEnvironmentResolver,
  backfillBespokeProperty as backfillBespokePropertyResolver,
  cacheIncompleteStatus as cacheIncompleteStatusResolver
} from './resolvers/simple-resolvers.js';

// Import excerpt CRUD resolver functions (Phase 3 modularization)
import {
  saveExcerpt as saveExcerptResolver,
  updateExcerptContent as updateExcerptContentResolver,
  getAllExcerpts as getAllExcerptsResolver,
  deleteExcerpt as deleteExcerptResolver,
  updateExcerptMetadata as updateExcerptMetadataResolver,
  massUpdateExcerpts as massUpdateExcerptsResolver,
  updateSourceMacroBody as updateSourceMacroBodyResolver
} from './resolvers/excerpt-resolvers.js';

// Import verification resolver functions (Phase 5 modularization)
import {
  checkAllSources as checkAllSourcesResolver,
  startCheckAllSources as startCheckAllSourcesResolver,
  checkAllIncludes as checkAllIncludesResolver,
  startCheckAllIncludes as startCheckAllIncludesResolver,
  getStorageUsage as getStorageUsageResolver
} from './resolvers/verification-resolvers.js';

// Import usage tracking and update resolver functions (Phase 6 modularization)
import {
  trackExcerptUsage as trackExcerptUsageResolver,
  removeExcerptUsage as removeExcerptUsageResolver,
  getExcerptUsage as getExcerptUsageResolver,
  getExcerptUsageForCSV as getExcerptUsageForCSVResolver,
  getAllUsageCounts as getAllUsageCountsResolver,
  pushUpdatesToAll as pushUpdatesToAllResolver,
  pushUpdatesToPage as pushUpdatesToPageResolver
} from './resolvers/usage-resolvers.js';

// Import Embed instance configuration resolver functions (Phase 7 modularization)
import {
  saveVariableValues as saveVariableValuesResolver
} from './resolvers/include-resolvers.js';

// Import restore and recovery resolver functions (Phase 8 modularization)
import {
  listBackups as listBackupsResolver,
  listDeletedEmbeds as listDeletedEmbedsResolver,
  previewFromBackup as previewFromBackupResolver,
  previewDeletedEmbed as previewDeletedEmbedResolver,
  restoreDeletedEmbed as restoreDeletedEmbedResolver,
  restoreFromBackup as restoreFromBackupResolver
} from './resolvers/restore-resolvers.js';

// Import emergency recovery resolver functions (Phase 1 Safety Patch - v7.16.0)
import {
  getDeletedItems as getDeletedItemsResolver,
  restoreDeletedItem as restoreDeletedItemResolver,
  deleteOrphanedEmbedsByPage as deleteOrphanedEmbedsByPageResolver,
  deleteOrphanedUsageReferences as deleteOrphanedUsageReferencesResolver,
  deleteOrphanedUsageKey as deleteOrphanedUsageKeyResolver
} from './resolvers/emergency-recovery-resolvers.js';

// Import version management resolver functions (Phase 2 - v7.16.0)
import {
  getVersionHistory,
  getVersionDetails,
  restoreFromVersion,
  pruneVersionsNow,
  startPruneVersions,
  getVersioningStatsResolver
} from './resolvers/version-resolvers.js';

// Import redline system resolver functions (Phase 1 - Redlining System)
import {
  getRedlineQueue as getRedlineQueueResolver,
  setRedlineStatus as setRedlineStatusResolver,
  bulkSetRedlineStatus as bulkSetRedlineStatusResolver,
  checkRedlineStale as checkRedlineStaleResolver,
  getConfluenceUser as getConfluenceUserResolver,
  getRedlineStats as getRedlineStatsResolver,
  postRedlineComment as postRedlineCommentResolver,
  checkEmbedExists as checkEmbedExistsResolver,
  manuallySoftDeleteEmbed as manuallySoftDeleteEmbedResolver
} from './resolvers/redline-resolvers.js';

// Import storage export/import resolver functions
import {
  exportAllStorageData as exportAllStorageDataResolver,
  getExportMetadata as getExportMetadataResolver,
  getExportChunk as getExportChunkResolver
} from './resolvers/storage-export-resolvers.js';
import {
  initImportStorage as initImportStorageResolver,
  storeImportChunk as storeImportChunkResolver,
  getImportData as getImportDataResolver,
  importStorageData as importStorageDataResolver
} from './resolvers/storage-import-resolvers.js';

// Import redline migration utilities
import {
  backfillRedlineFields as backfillRedlineFieldsResolver
} from './resolvers/redline-migration.js';

// Import content injection resolver functions (Compositor + Native Injection)
import {
  publishChapter as publishChapterResolver,
  getPublishStatus as getPublishStatusResolver,
  injectPlaceholder as injectPlaceholderResolver,
  removeChapterFromPage as removeChapterFromPageResolver
} from './resolvers/injection-resolver.js';

// Import compositor resolver functions
import {
  getCompositorConfig as getCompositorConfigResolver,
  saveCompositorConfig as saveCompositorConfigResolver,
  getArchetypes as getArchetypesResolver,
  getArchetype as getArchetypeResolver,
  createArchetype as createArchetypeResolver,
  updateArchetype as updateArchetypeResolver,
  updateArchetypeSourceDefaults as updateArchetypeSourceDefaultsResolver,
  updateArchetypeSourceOrder as updateArchetypeSourceOrderResolver,
  removeArchetypeSource as removeArchetypeSourceResolver,
  copyArchetype as copyArchetypeResolver,
  deleteArchetype as deleteArchetypeResolver,
  getArchetypeChapters as getArchetypeChaptersResolver,
  toggleChapter as toggleChapterResolver,
  bulkPublishChapters as bulkPublishChaptersResolver,
  initializePageWithArchetype as initializePageWithArchetypeResolver,
  scanPageForMacros as scanPageForMacrosResolver,
  deployArchetype as deployArchetypeResolver
} from './resolvers/compositor-resolvers.js';

// ⚠️ ONE-TIME USE MIGRATION FUNCTIONS - DELETE AFTER PRODUCTION MIGRATION ⚠️
// Import migration resolver functions (Phase 4 modularization)
// These are one-time use functions for migrating from MultiExcerpt to Blueprint App
// Will be used ONCE during initial production setup, then can be safely deleted
// See migration-resolvers.js header for full deletion checklist
import {
  importFromMultiExcerpt as importFromMultiExcerptResolver,
  trackMigration as trackMigrationResolver,
  scanMultiExcerptIncludes as scanMultiExcerptIncludesResolver,
  bulkImportSources as bulkImportSourcesResolver,
  createSourceMacrosOnPage as createSourceMacrosOnPageResolver,
  convertMultiExcerptsOnPage as convertMultiExcerptsOnPageResolver,
  importFromParsedJson as importFromParsedJsonResolver,
  bulkInitializeAllExcerpts as bulkInitializeAllExcerptsResolver,
  populateSourceContent as populateSourceContentResolver,
  testMultiExcerptPageFetch as testMultiExcerptPageFetchResolver,
  migrateStep1CloneMacros as migrateStep1CloneMacrosResolver,
  migrateStep2MigrateContent as migrateStep2MigrateContentResolver,
  migrateStep3FixExcerptIds as migrateStep3FixExcerptIdsResolver,
  createTestEmbedsPage as createTestEmbedsPageResolver,
  dumpFirstSourceMacro as dumpFirstSourceMacroResolver,
  getOneExcerptData as getOneExcerptDataResolver,
  diagnosePageAdfStructure as diagnosePageAdfStructureResolver
} from './resolvers/migration-resolvers.js';

const resolver = new Resolver();

// Detect variables from content (for UI to call)
resolver.define('detectVariablesFromContent', detectVariablesResolver);

// Detect toggles from content (for UI to call)
resolver.define('detectTogglesFromContent', detectTogglesResolver);

// Save excerpt
resolver.define('saveExcerpt', saveExcerptResolver);

// Get all excerpts
resolver.define('getExcerpts', getExcerptsResolver);

// Get specific excerpt
resolver.define('getExcerpt', getExcerptResolver);

// DEBUG: Get raw excerpt JSON for debugging (TEMPORARY)
resolver.define('debugExcerpt', debugExcerptResolver);

// Update excerpt content only (called automatically when Source macro body changes)
resolver.define('updateExcerptContent', updateExcerptContentResolver);

// Save variable values and toggle states for a specific macro instance
// We'll store this keyed by localId (unique ID for each macro instance)
resolver.define('saveVariableValues', saveVariableValuesResolver);

// Save cached rendered content for an Embed instance
resolver.define('saveCachedContent', saveCachedContentResolver);

// Get cached rendered content for an Embed instance (view mode)
resolver.define('getCachedContent', getCachedContentResolver);

// Check if Embed instance has stale content (update available)
resolver.define('checkVersionStaleness', checkVersionStalenessResolver);

// Push updates to all Embed instances of a specific excerpt (Admin function)
resolver.define('pushUpdatesToAll', pushUpdatesToAllResolver);

// Push updates to a specific page's Embed instances (Admin function)
resolver.define('pushUpdatesToPage', pushUpdatesToPageResolver);

// Get page title via Confluence API
resolver.define('getPageTitle', getPageTitleResolver);

// Get variable values and toggle states for a specific macro instance
resolver.define('getVariableValues', getVariableValuesResolver);

// Get canonical localId for excerpt on page (prevents drag-move data loss)
resolver.define('getCanonicalLocalId', getCanonicalLocalIdResolver);

// Recover orphaned data after macro has been moved (localId changed) - DEPRECATED
resolver.define('recoverOrphanedData', recoverOrphanedDataResolver);

// Detect deactivated Embeds on a page (for user-controlled recovery)
resolver.define('detectDeactivatedEmbeds', detectDeactivatedEmbedsResolver);

// Copy data from a deactivated Embed to a new Embed
resolver.define('copyDeactivatedEmbedData', copyDeactivatedEmbedDataResolver);

// Get all excerpts with full details (for admin page)
resolver.define('getAllExcerpts', getAllExcerptsResolver);

// Delete an excerpt
resolver.define('deleteExcerpt', deleteExcerptResolver);

// Update excerpt metadata (name, category)
resolver.define('updateExcerptMetadata', updateExcerptMetadataResolver);

// Mass update excerpts (e.g., change category for multiple excerpts)
resolver.define('massUpdateExcerpts', massUpdateExcerptsResolver);

// Update Source macro body content on the page
resolver.define('updateSourceMacroBody', updateSourceMacroBodyResolver);

// Track usage of an excerpt (called when Embed macro is saved)
resolver.define('trackExcerptUsage', trackExcerptUsageResolver);

// Remove usage tracking (called when Embed macro is deleted)
resolver.define('removeExcerptUsage', removeExcerptUsageResolver);

// Get excerpt usage (which Embed macros reference this excerpt)
resolver.define('getExcerptUsage', getExcerptUsageResolver);

// Get excerpt usage with full CSV export data
resolver.define('getExcerptUsageForCSV', getExcerptUsageForCSVResolver);

// Get usage counts for all excerpts (lightweight for sorting in admin page)
resolver.define('getAllUsageCounts', getAllUsageCountsResolver);

// Get orphaned Sources (Sources that haven't checked in recently or were deleted)
// Active check: Verify each Source still exists on its page
resolver.define('checkAllSources', checkAllSourcesResolver);

// Start Check All Sources (async trigger - immediately returns jobId + progressId)
resolver.define('startCheckAllSources', startCheckAllSourcesResolver);

// Get all orphaned usage entries (usage data for excerpts that no longer exist)
resolver.define('getOrphanedUsage', getOrphanedUsageResolver);

// Check all Embed instances (async via Forge Events API - uses checkIncludesWorker.js)
// Note: checkAllIncludes now redirects to startCheckAllIncludes (async queue-based)
resolver.define('checkAllIncludes', checkAllIncludesResolver);

// Start Check All Includes (async trigger - immediately returns jobId + progressId)
resolver.define('startCheckAllIncludes', startCheckAllIncludesResolver);

// Get storage usage (calculate total storage used across all keys)
resolver.define('getStorageUsage', getStorageUsageResolver);

// Export all storage data to JSON (for production to dev copy)
resolver.define('exportAllStorageData', exportAllStorageDataResolver);

// Get export metadata (chunk count, etc.)
resolver.define('getExportMetadata', getExportMetadataResolver);

// Get a single chunk of exported data (for large exports)
resolver.define('getExportChunk', getExportChunkResolver);

// Initialize import storage (create metadata)
resolver.define('initImportStorage', initImportStorageResolver);

// Store a single chunk of import data
resolver.define('storeImportChunk', storeImportChunkResolver);

// Get stored import data from storage
resolver.define('getImportData', getImportDataResolver);

// Import storage data from JSON export stored in storage (overwrites all existing data)
resolver.define('importStorageData', importStorageDataResolver);

// Get progress for checkAllIncludes operation
resolver.define('getCheckProgress', getCheckProgressResolver);

// ============================================================================
// REDLINE SYSTEM RESOLVERS (Phase 1 - Redlining System)
// ============================================================================
// Queue-based review and approval workflow for Embed instances

// Get redline queue with filtering, sorting, and grouping
resolver.define('getRedlineQueue', getRedlineQueueResolver);

// Set redline status for a single Embed
resolver.define('setRedlineStatus', setRedlineStatusResolver);

// Bulk status update for multiple Embeds
resolver.define('bulkSetRedlineStatus', bulkSetRedlineStatusResolver);

// Check if Embed needs re-review (content changed after approval)
resolver.define('checkRedlineStale', checkRedlineStaleResolver);

// Get Confluence user data for avatar/name display
resolver.define('getConfluenceUser', getConfluenceUserResolver);

// Get redline statistics (counts by status)
resolver.define('getRedlineStats', getRedlineStatsResolver);

// Post inline comment to Confluence page near Embed
resolver.define('postRedlineComment', postRedlineCommentResolver);

// Check if Embed still exists on its page (lightweight existence check)
resolver.define('checkEmbedExists', checkEmbedExistsResolver);
resolver.define('manuallySoftDeleteEmbed', manuallySoftDeleteEmbedResolver);

// Backfill redline fields for existing Embeds (one-time migration)
resolver.define('backfillRedlineFields', backfillRedlineFieldsResolver);

// Backfill bespoke property on all Sources (one-time migration)
resolver.define('backfillBespokeProperty', backfillBespokePropertyResolver);

// Cache incomplete status for faster unpublished Embed detection
resolver.define('cacheIncompleteStatus', cacheIncompleteStatusResolver);

// ============================================================================
// MIGRATION RESOLVERS (Phase 4 modularization)
// ⚠️ ONE-TIME USE ONLY - DELETE ENTIRE SECTION AFTER PRODUCTION MIGRATION ⚠️
// ============================================================================
// These are one-time use functions for migrating from MultiExcerpt to Blueprint App
// Will be used ONCE during initial production setup, then this entire section can be deleted
// See migration-resolvers.js header for full deletion checklist

// Import from MultiExcerpt and create Blueprint App (ONE-TIME USE)
resolver.define('importFromMultiExcerpt', importFromMultiExcerptResolver);

// Track migration status manually (ONE-TIME USE)
resolver.define('trackMigration', trackMigrationResolver);

// Get migration status (ONE-TIME USE)
resolver.define('getMigrationStatus', getMigrationStatusResolver);

// Scan for old MultiExcerpt Embed macros (ONE-TIME USE)
resolver.define('scanMultiExcerptIncludes', scanMultiExcerptIncludesResolver);

// Get progress for scanMultiExcerptIncludes operation (ONE-TIME USE)
resolver.define('getMultiExcerptScanProgress', getMultiExcerptScanProgressResolver);

// Bulk import MultiExcerpt Sources from JSON export (ONE-TIME USE)
resolver.define('bulkImportSources', bulkImportSourcesResolver);

// Create Source macros on a Confluence page for migrated excerpts (ONE-TIME USE)
resolver.define('createSourceMacrosOnPage', createSourceMacrosOnPageResolver);

// Convert MultiExcerpt macros to Blueprint App macros on a page (ONE-TIME USE)
resolver.define('convertMultiExcerptsOnPage', convertMultiExcerptsOnPageResolver);

// Import Blueprint Standards directly from parsed JSON (ONE-TIME USE)
resolver.define('importFromParsedJson', importFromParsedJsonResolver);

// Start async migration job via queue (ONE-TIME USE)
resolver.define('startMigrationJob', async (req) => {
  const { sources, deleteOldMigrations, spaceKey } = req.payload;
  const jobId = generateUUID();

  logFunction('startMigrationJob', 'START', { jobId, sourceCount: sources.length });

  // Initialize job status in storage
  await storage.set(`migration-job:${jobId}`, {
    status: 'pending',
    queuedAt: new Date().toISOString()
  });

  // Enqueue the job using Queue class
  const queue = new Queue({ key: 'migration-queue' });
  await queue.push({
    body: {
      sources,
      deleteOldMigrations,
      spaceKey,
      jobId
    }
  });

  return {
    success: true,
    jobId
  };
});

// Get migration job status (ONE-TIME USE)
resolver.define('getMigrationJobStatus', async (req) => {
  const { jobId } = req.payload;
  const result = await storage.get(`migration-job:${jobId}`);

  if (!result) {
    return { status: 'pending' };
  }

  return result;
});

// Bulk initialize all excerpts with hardcoded name-UUID mappings (ONE-TIME USE)
resolver.define('bulkInitializeAllExcerpts', bulkInitializeAllExcerptsResolver);
resolver.define('populateSourceContent', populateSourceContentResolver);

// UI-based migration steps (NO API TOKENS REQUIRED)
resolver.define('migrateStep1CloneMacros', migrateStep1CloneMacrosResolver);
resolver.define('migrateStep2MigrateContent', migrateStep2MigrateContentResolver);
resolver.define('migrateStep3FixExcerptIds', migrateStep3FixExcerptIdsResolver);

// Performance testing: Create test page with 148 Embeds (TESTING ONLY)
resolver.define('createTestEmbedsPage', createTestEmbedsPageResolver);

// Diagnostic: Dump first Source macro XML structure (DIAGNOSTIC)
resolver.define('dumpFirstSourceMacro', dumpFirstSourceMacroResolver);

// Diagnostic: Get one excerpt's data from storage (DIAGNOSTIC)
resolver.define('getOneExcerptData', getOneExcerptDataResolver);

// Diagnostic: Analyze page ADF structure to understand macro layout (DIAGNOSTIC)
resolver.define('diagnosePageAdfStructure', diagnosePageAdfStructureResolver);

// Test function: Fetch a page and analyze MultiExcerpt content availability (DIAGNOSTIC)
resolver.define('testMultiExcerptPageFetch', testMultiExcerptPageFetchResolver);

// Delete test migration pages (ONE-TIME CLEANUP)
resolver.define('deleteTestMigrationPages', async (req) => {
  const { spaceKey } = req.payload;

  try {
    // Use CQL search to find pages with "Blueprint Standard -" in title
    // Use single quotes for CQL values and escape properly
    const cql = `type=page AND space.key='${spaceKey}' AND title~'Blueprint Standard'`;
    const searchResponse = await api.asApp().requestConfluence(
      route`/wiki/rest/api/content/search?cql=${encodeURIComponent(cql)}&limit=100`
    );

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      return { success: false, error: `Search failed: ${searchResponse.status} - ${errorText}` };
    }

    const searchData = await searchResponse.json();
    const pagesToDelete = searchData.results || [];

    const deleted = [];
    const errors = [];

    for (const page of pagesToDelete) {
      try {
        const deleteResponse = await api.asApp().requestConfluence(
          route`/wiki/api/v2/pages/${page.id}`,
          { method: 'DELETE' }
        );

        if (deleteResponse.ok) {
          deleted.push(page.id);
        } else {
          errors.push({ pageId: page.id, title: page.title, error: deleteResponse.status });
        }
      } catch (err) {
        errors.push({ pageId: page.id, title: page.title, error: err.message });
      }
    }

    return {
      success: true,
      deleted: deleted.length,
      errors: errors.length,
      deletedPages: deleted,
      errorPages: errors
    };

  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Start ADF Migration: Fetch page, extract MultiExcerpt macros, convert to ADF, create pages (ONE-TIME USE)
resolver.define('startAdfMigration', async (req) => {
  const { sourcePageId, spaceKey } = req.payload;
  const jobId = generateUUID();

  logFunction('startAdfMigration', 'START', { jobId, sourcePageId });

  try {
    // Initialize job status in storage
    await storage.set(`migration-job:${jobId}`, {
      status: 'pending',
      queuedAt: new Date().toISOString(),
      sourcePageId,
      spaceKey
    });

    // Enqueue the ADF migration job
    const queue = new Queue({ key: 'migration-queue' });
    await queue.push({
      body: {
        jobId,
        sourcePageId,
        spaceKey,
        jobType: 'adf-migration'  // Distinguish from old migration type
      }
    });

    return {
      success: true,
      jobId
    };
  } catch (error) {
    logFailure('startAdfMigration', 'Failed to start ADF migration job', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Delete all migrated sources from storage (ONE-TIME USE CLEANUP)
resolver.define('deleteAllMigratedSources', async () => {
  const excerptIndex = await storage.get('excerpt-index') || { excerpts: [] };
  const toDelete = [];

  for (const excerptSummary of excerptIndex.excerpts) {
    const excerpt = await storage.get(`excerpt:${excerptSummary.id}`);
    if (excerpt && excerpt.category === 'Migrated from MultiExcerpt') {
      toDelete.push(excerpt.id);
      await storage.delete(`excerpt:${excerpt.id}`);
    }
  }

  // Update index to remove deleted excerpts
  const updatedIndex = {
    excerpts: excerptIndex.excerpts.filter(e => !toDelete.includes(e.id))
  };
  await storage.set('excerpt-index', updatedIndex);

  return {
    success: true,
    deleted: toDelete.length,
    deletedIds: toDelete
  };
});

/**
 * Extract Forge extension metadata template from a working Blueprint Standard Source page
 * This metadata includes all the extensionProperties, environment info, etc. that Forge needs
 */
async function extractForgeMetadataTemplate(workingPageId) {
  try {
    const response = await api.asApp().requestConfluence(
      route`/wiki/api/v2/pages/${workingPageId}?body-format=atlas_doc_format`
    );
    const page = await response.json();
    const adf = JSON.parse(page.body.atlas_doc_format.value);

    // Find the bodiedExtension node (Blueprint Standard Source macro)
    const extension = adf.content.find(node => node.type === 'bodiedExtension');
    if (!extension || !extension.attrs) {
      throw new Error('No bodiedExtension found in working page');
    }

    // Extract the template metadata we need to reuse
    return {
      extensionKey: extension.attrs.extensionKey,
      extensionId: extension.attrs.parameters.extensionId,
      extensionTitle: extension.attrs.parameters.extensionTitle,
      text: extension.attrs.text,
      extensionProperties: extension.attrs.parameters.extensionProperties,
      forgeEnvironment: extension.attrs.parameters.forgeEnvironment,
      render: extension.attrs.parameters.render
    };
  } catch (error) {
    logFailure('extractForgeMetadataTemplate', 'Failed to extract Forge metadata template', error);
    throw error;
  }
}

/**
 * Transform MultiExcerpt ADF to Blueprint Standard Source ADF
 * Uses Forge metadata template extracted from a working page
 */
function transformToBlueprintStandardAdf(multiExcerptAdf, excerptId, excerptName, category, localId, forgeMetadata) {
  // Extract the inner content from the MultiExcerpt bodiedExtension
  const innerContent = multiExcerptAdf.content[0].content;

  // Build Blueprint Standard Source macro ADF structure with complete Forge metadata
  return {
    type: 'doc',
    content: [{
      type: 'bodiedExtension',
      attrs: {
        layout: 'default',
        extensionType: 'com.atlassian.ecosystem',
        extensionKey: forgeMetadata.extensionKey,  // Full path with environment ID
        text: forgeMetadata.text,  // "Blueprint Standard - Source"
        parameters: {
          layout: 'bodiedExtension',
          guestParams: {
            variables: [],  // Detect from content later if needed
            excerptId: excerptId,
            toggles: [],  // Detect from content later if needed
            category: category || 'General',
            excerptName: excerptName
          },
          forgeEnvironment: forgeMetadata.forgeEnvironment,
          extensionProperties: forgeMetadata.extensionProperties,
          localId: localId,
          extensionId: forgeMetadata.extensionId,
          render: forgeMetadata.render,
          extensionTitle: forgeMetadata.extensionTitle
        },
        localId: localId
      },
      content: innerContent  // Use the converted content from MultiExcerpt
    }],
    version: 1
  };
}

// Test content conversion with hardcoded example and transform to Blueprint Standard (DIAGNOSTIC)
resolver.define('testHardcodedConversion', async () => {
  const content = '<ac:structured-macro ac:name="multiexcerpt-macro" ac:schema-version="1" data-layout="default" ac:local-id="985f5450-4cdf-4d0b-a03d-600f8df78455" ac:macro-id="d1f16605-d998-4b76-a585-5c62b68285f2"><ac:parameter ac:name="hidden">false</ac:parameter><ac:parameter ac:name="name">Test0</ac:parameter><ac:parameter ac:name="fallback">false</ac:parameter><ac:rich-text-body><p>{{client}} 12345.</p></ac:rich-text-body></ac:structured-macro>';

  logFunction('testHardcodedConversion', 'START', { inputLength: content.length });

  try {
    // Step 0: Extract Forge metadata template from a working page
    logPhase('testHardcodedConversion', 'Step 0: Extracting Forge metadata template', {});
    const forgeMetadata = await extractForgeMetadataTemplate('64880643');

    // Step 1: Convert MultiExcerpt storage to ADF
    const response = await api.asApp().requestConfluence(
      route`/wiki/rest/api/contentbody/convert/atlas_doc_format`,
      {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          value: content,
          representation: 'storage'
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      logFailure('testHardcodedConversion', 'Step 1: Conversion failed', new Error(errorText));
      return {
        success: false,
        error: `Conversion failed: ${response.status}`,
        details: errorText
      };
    }

    const conversionResult = await response.json();

    // Parse the stringified ADF from the value property
    const multiExcerptAdf = JSON.parse(conversionResult.value);

    // Step 2: Transform to Blueprint Standard ADF with complete Forge metadata
    const blueprintAdf = transformToBlueprintStandardAdf(
      multiExcerptAdf,
      '01ea4f7a-265c-4972-8e70-de92a50d4d6e',  // Test excerpt ID
      'Test0',  // Test excerpt name
      'Test Category',  // Category
      generateUUID(),  // Generate new local ID for the Source macro
      forgeMetadata  // Complete Forge metadata from working page
    );

    // Step 3: Create a test page with the Blueprint Standard ADF
    const spaceId = '163842'; // Your space ID
    const pageTitle = `Blueprint Standard Test - ${new Date().toISOString()}`;

    logPhase('testHardcodedConversion', 'Step 3: Creating test page', { spaceId, pageTitle });

    const createPageResponse = await api.asApp().requestConfluence(
      route`/wiki/api/v2/pages`,
      {
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
            representation: 'atlas_doc_format',
            value: JSON.stringify(blueprintAdf)  // Stringify the ADF
          }
        })
      }
    );

    if (!createPageResponse.ok) {
      const errorText = await createPageResponse.text();
      logFailure('testHardcodedConversion', 'Step 3: Page creation failed', new Error(errorText));
      return {
        success: false,
        step: 'page_creation',
        error: `Page creation failed: ${createPageResponse.status}`,
        details: errorText,
        blueprintAdf: blueprintAdf
      };
    }

    const newPage = await createPageResponse.json();
    logSuccess('testHardcodedConversion', 'Step 3: Page created successfully', { pageId: newPage.id });

    return {
      success: true,
      input: content,
      forgeMetadata: forgeMetadata,
      multiExcerptAdf: multiExcerptAdf,
      blueprintAdf: blueprintAdf,
      pageId: newPage.id,
      pageUrl: `/wiki/spaces/~5bb22d3a0958e968ce8153a3/pages/${newPage.id}`
    };

  } catch (error) {
    logFailure('testHardcodedConversion', 'Conversion error', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Compare working vs broken page ADF (DIAGNOSTIC)
resolver.define('comparePageAdf', async (req) => {
  const { workingPageId, brokenPageId } = req.payload;

  try {
    // Fetch working page ADF
    const workingResponse = await api.asApp().requestConfluence(
      route`/wiki/api/v2/pages/${workingPageId}?body-format=atlas_doc_format`
    );
    const workingPage = await workingResponse.json();

    // Fetch broken page ADF
    const brokenResponse = await api.asApp().requestConfluence(
      route`/wiki/api/v2/pages/${brokenPageId}?body-format=atlas_doc_format`
    );
    const brokenPage = await brokenResponse.json();

    return {
      success: true,
      workingAdf: JSON.parse(workingPage.body.atlas_doc_format.value),
      brokenAdf: JSON.parse(brokenPage.body.atlas_doc_format.value)
    };

  } catch (error) {
    logFailure('comparePageAdf', 'Comparison error', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Test content conversion with direct input (DIAGNOSTIC)
resolver.define('testDirectConversion', async (req) => {
  const { content } = req.payload;

  logFunction('testDirectConversion', 'START', { inputLength: content.length });

  try {
    const response = await api.asApp().requestConfluence(
      route`/wiki/rest/api/contentbody/convert/atlas_doc_format`,
      {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          value: content,
          representation: 'storage'
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      logFailure('testDirectConversion', 'Conversion failed', new Error(errorText));
      return {
        success: false,
        error: `Conversion failed: ${response.status}`,
        details: errorText
      };
    }

    const result = await response.json();
    logSuccess('testDirectConversion', 'Conversion successful', {});

    return {
      success: true,
      input: content,
      output: result
    };

  } catch (error) {
    logFailure('testDirectConversion', 'Conversion error', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Test content conversion API by name (DIAGNOSTIC)
resolver.define('testContentConversionByName', async (req) => {
  const { name } = req.payload;

  // Find excerpt by name
  const excerptIndex = await storage.get('excerpt-index') || { excerpts: [] };
  const excerptSummary = excerptIndex.excerpts.find(e => e.name === name);

  if (!excerptSummary) {
    return { success: false, error: `Excerpt not found with name: ${name}` };
  }

  // Get full excerpt from storage
  const excerpt = await storage.get(`excerpt:${excerptSummary.id}`);
  if (!excerpt) {
    return { success: false, error: 'Excerpt not found in storage' };
  }

  logFunction('testConversionForExcerpt', 'START', { excerptName: name, contentLength: excerpt.content.length });

  try {
    // Call Confluence conversion API
    const response = await api.asApp().requestConfluence(
      route`/wiki/rest/api/contentbody/convert/atlas_doc_format`,
      {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          value: excerpt.content,
          representation: 'storage'
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      logFailure('testConversionForExcerpt', 'Conversion failed', new Error(errorText), { excerptName: name });
      return {
        success: false,
        error: `Conversion failed: ${response.status}`,
        details: errorText,
        originalContent: excerpt.content
      };
    }

    const result = await response.json();
    logSuccess('testConversionForExcerpt', 'Converted to ADF successfully', { excerptName: name, excerptId: excerptSummary.id });

    return {
      success: true,
      excerptName: name,
      excerptId: excerptSummary.id,
      original: excerpt.content,
      converted: result
    };

  } catch (error) {
    logFailure('testConversionForExcerpt', 'Conversion error', error, { excerptName: name });
    return {
      success: false,
      error: error.message
    };
  }
});

// ============================================================================
// END OF MIGRATION RESOLVERS - DELETE ABOVE SECTION AFTER PRODUCTION MIGRATION
// ============================================================================

// Save categories to storage
resolver.define('saveCategories', saveCategoriesResolver);

// Get categories from storage
resolver.define('getCategories', getCategoriesResolver);

// Get last verification timestamp (for auto-verification on Admin page mount)
resolver.define('getLastVerificationTime', getLastVerificationTimeResolver);

// Set last verification timestamp (called after Check All Includes completes)
resolver.define('setLastVerificationTime', setLastVerificationTimeResolver);

// Get next scheduled check time (for automatic daily checks at 10 AM UTC)
resolver.define('getNextScheduledCheckTime', getNextScheduledCheckTimeResolver);

// Set next scheduled check time (called after check completes to schedule next run)
resolver.define('setNextScheduledCheckTime', setNextScheduledCheckTimeResolver);

// Get current user context (accountId for redline actions)
resolver.define('getCurrentUser', getCurrentUserResolver);

// Query Forge storage by key (debugging tool)
resolver.define('queryStorage', queryStorageResolver);

// Query multiple storage keys by prefix with filtering (Edit Mode)
resolver.define('queryStorageMultiple', queryStorageMultipleResolver);

// Bulk update multiple storage entries with validation (Edit Mode)
resolver.define('bulkUpdateStorage', bulkUpdateStorageResolver);

// Get/Set Admin page URL (stored dynamically on first admin page load)
resolver.define('getAdminUrl', getAdminUrlResolver);
resolver.define('setAdminUrl', setAdminUrlResolver);

// Get Forge environment (development or production)
resolver.define('getForgeEnvironment', getForgeEnvironmentResolver);

// ============================================================================
// RESTORE AND RECOVERY RESOLVERS (Phase 8 modularization)
// ============================================================================
// Functions to restore embed configurations from backups and soft-deletes
// All restore operations support two-phase preview-then-commit workflow

// List all available backup snapshots
resolver.define('listBackups', listBackupsResolver);

// List all soft-deleted embeds that can be restored
resolver.define('listDeletedEmbeds', listDeletedEmbedsResolver);

// Preview embed from backup (Phase 1: show what would be restored)
resolver.define('previewFromBackup', previewFromBackupResolver);

// Preview soft-deleted embed (Phase 1: show what would be restored)
resolver.define('previewDeletedEmbed', previewDeletedEmbedResolver);

// Restore deleted embed (Phase 2: actually restore after preview)
resolver.define('restoreDeletedEmbed', restoreDeletedEmbedResolver);

// Restore from backup snapshot (Phase 2: actually restore after preview)
resolver.define('restoreFromBackup', restoreFromBackupResolver);

// ============================================================================
// EMERGENCY RECOVERY RESOLVERS (Phase 1 Safety Patch - v7.16.0)
// ============================================================================
// Simplified emergency recovery functions for viewing and restoring soft-deleted items
// Provides immediate safety net while comprehensive versioning system is built

// Get all soft-deleted items (macro-vars-deleted:* namespace)
resolver.define('getDeletedItems', getDeletedItemsResolver);

// Restore a single soft-deleted item back to active storage
resolver.define('restoreDeletedItem', restoreDeletedItemResolver);

// Delete orphaned Embeds by page title (permanent deletion for cleanup)
resolver.define('deleteOrphanedEmbedsByPage', deleteOrphanedEmbedsByPageResolver);

// Force delete orphaned usage references by localId (cleanup stale references)
resolver.define('deleteOrphanedUsageReferences', deleteOrphanedUsageReferencesResolver);

// Delete orphaned usage key directly by excerptId (simpler cleanup for stale keys)
resolver.define('deleteOrphanedUsageKey', deleteOrphanedUsageKeyResolver);

// ═════════════════════════════════════════════════════════════════════════════
// Version Management Resolvers (Phase 2 - v7.16.0)
// Comprehensive versioning system with automatic snapshots, 14-day retention,
// and point-in-time restoration to prevent data loss.
// ═════════════════════════════════════════════════════════════════════════════

// Get version history for an entity (Source or Embed)
resolver.define('getVersionHistory', getVersionHistory);

// Get details for a specific version snapshot
resolver.define('getVersionDetails', getVersionDetails);

// Restore from a specific version snapshot
resolver.define('restoreFromVersion', restoreFromVersion);

// Manually trigger version pruning (admin function - synchronous, for small datasets)
resolver.define('pruneVersionsNow', pruneVersionsNow);

// Start async version pruning job (for large datasets - 50+ pages)
resolver.define('startPruneVersions', startPruneVersions);

// Get versioning system statistics
resolver.define('getVersioningStats', getVersioningStatsResolver);

// ============================================================================
// CONTENT INJECTION RESOLVERS (Compositor + Native Injection Model)
// ============================================================================
// Functions to publish Blueprint content directly into Confluence page storage.
// Used by the Locked Page model where users edit via Embed UI and app injects.

// Publish a single chapter/Embed to the page (renders and injects content)
resolver.define('publishChapter', publishChapterResolver);

// Get publish status for an Embed (isPublished, publishedAt, hash, etc.)
resolver.define('getPublishStatus', getPublishStatusResolver);

// Inject placeholder for unpublished chapter (Under Construction message)
resolver.define('injectPlaceholder', injectPlaceholderResolver);

// Remove a chapter from a page (called when user opts out via Compositor)
resolver.define('removeChapterFromPage', removeChapterFromPageResolver);

// ============================================================================
// COMPOSITOR RESOLVERS (Page-Level Blueprint Composition)
// ============================================================================
// Functions for archetype selection, chapter management, and bulk publishing.
// Used by the Compositor modal accessible from the page byline.

// Get Compositor configuration for a page
resolver.define('getCompositorConfig', getCompositorConfigResolver);

// Save Compositor configuration for a page
resolver.define('saveCompositorConfig', saveCompositorConfigResolver);

// Get available archetypes
resolver.define('getArchetypes', getArchetypesResolver);

// Get a single archetype
resolver.define('getArchetype', getArchetypeResolver);

// Create a new archetype
resolver.define('createArchetype', createArchetypeResolver);

// Update an archetype
resolver.define('updateArchetype', updateArchetypeResolver);

// Update source defaults for an archetype
resolver.define('updateArchetypeSourceDefaults', updateArchetypeSourceDefaultsResolver);

// Update source order for an archetype
resolver.define('updateArchetypeSourceOrder', updateArchetypeSourceOrderResolver);

// Remove a source from an archetype
resolver.define('removeArchetypeSource', removeArchetypeSourceResolver);

// Copy an archetype
resolver.define('copyArchetype', copyArchetypeResolver);

// Delete an archetype
resolver.define('deleteArchetype', deleteArchetypeResolver);

// Get chapters for an archetype
resolver.define('getArchetypeChapters', getArchetypeChaptersResolver);

// Toggle a chapter on/off for a page
resolver.define('toggleChapter', toggleChapterResolver);

// Bulk publish all enabled chapters for a page
resolver.define('bulkPublishChapters', bulkPublishChaptersResolver);

// Initialize a page with a selected archetype
resolver.define('initializePageWithArchetype', initializePageWithArchetypeResolver);

// Scan page for existing Blueprint macros
resolver.define('scanPageForMacros', scanPageForMacrosResolver);

// Deploy an archetype to a page
resolver.define('deployArchetype', deployArchetypeResolver);

export const handler = resolver.getDefinitions();
