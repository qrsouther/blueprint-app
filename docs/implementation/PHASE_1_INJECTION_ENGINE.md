# Phase 1: Core Injection Engine - Implementation Spec

**Author:** Claude Opus 4 (claude-opus-4-20250514)  
**Created:** 2025-11-26  
**Branch:** `feature/compositor-native-injection`  
**Status:** Implementation Ready  
**Parent Document:** `docs/architecture/CONTENT_INJECTION_PROPOSALS.md`

---

## Objective

Build the foundational injection engine that can:
1. Render Embed content (with variables, toggles, custom insertions applied)
2. Convert rendered ADF to Confluence storage format
3. Inject content into a locked Confluence page via REST API
4. Track published state per Embed

This phase focuses on **single-chapter injection** triggered from the existing Embed Edit Mode. The Compositor UI (bulk chapter management) comes in Phase 2.

---

## Success Criteria

- [ ] User can click "Publish to Page" in Embed Edit Mode
- [ ] Content is injected into page storage with proper chapter markers
- [ ] Chapter heading is injected (visible to Confluence TOC)
- [ ] Chapter divider (HR) is injected at chapter end
- [ ] Published state is tracked (`publishedAt`, `publishedContentHash`)
- [ ] Existing auto-save continues working (to Forge Storage only)
- [ ] Staleness detection continues working
- [ ] Page content is searchable in Confluence

---

## File Changes Overview

| File | Change Type | Description |
|------|-------------|-------------|
| `src/resolvers/injection-resolver.js` | **Enhance** | Add `publishChapter` function |
| `src/EmbedContainer.jsx` | **Modify** | Add Publish button, call injection resolver |
| `src/components/embed/EmbedEditMode.jsx` | **Modify** | Add Publish button UI |
| `src/components/embed/EmbedViewMode.jsx` | **Modify** | Hide content when injection exists |
| `src/utils/storage-format-utils.js` | **NEW** | ADF → Storage conversion helpers |
| `src/index.js` | **Modify** | Register new resolver functions |

---

## Detailed Implementation

### 1. Storage Format Utilities

**File:** `src/utils/storage-format-utils.js` (NEW)

```javascript
/**
 * Storage Format Utilities
 * 
 * Helpers for converting ADF content to Confluence storage format
 * and building chapter structures for injection.
 */

import api, { route } from '@forge/api';

/**
 * Convert ADF document to Confluence storage format via REST API
 * 
 * @param {Object} adfContent - ADF document object
 * @returns {Promise<string|null>} Storage format HTML or null on error
 */
export async function convertAdfToStorage(adfContent) {
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
      console.error('[convertAdfToStorage] Conversion failed:', errorText);
      return null;
    }

    const result = await response.json();
    return result.value;
  } catch (error) {
    console.error('[convertAdfToStorage] Error:', error);
    return null;
  }
}

/**
 * Build chapter HTML structure with markers
 * 
 * @param {Object} options
 * @param {string} options.chapterId - Unique chapter identifier
 * @param {string} options.localId - Embed macro localId
 * @param {string} options.heading - Chapter heading text
 * @param {string} options.bodyContent - Rendered body content (storage format)
 * @returns {string} Complete chapter HTML with markers
 */
export function buildChapterStructure({ chapterId, localId, heading, bodyContent }) {
  return `
<!-- BLUEPRINT-CHAPTER-START: ${chapterId} -->
<h2>${escapeHtml(heading)}</h2>

<!-- BLUEPRINT-MANAGED-START: ${localId} -->
${bodyContent}
<!-- BLUEPRINT-MANAGED-END: ${localId} -->

<hr class="blueprint-chapter-divider" data-chapter="${chapterId}" data-local-id="${localId}" />
<!-- BLUEPRINT-CHAPTER-END: ${chapterId} -->
`.trim();
}

/**
 * Build placeholder HTML for unpublished chapter
 * 
 * @param {Object} options
 * @param {string} options.chapterId - Unique chapter identifier
 * @param {string} options.localId - Embed macro localId
 * @param {string} options.heading - Chapter heading text
 * @returns {string} Placeholder HTML
 */
export function buildChapterPlaceholder({ chapterId, localId, heading }) {
  return `
<!-- BLUEPRINT-CHAPTER-START: ${chapterId} -->
<h2>${escapeHtml(heading)}</h2>

<!-- BLUEPRINT-MANAGED-START: ${localId} -->
<ac:structured-macro ac:name="info" ac:schema-version="1">
  <ac:rich-text-body>
    <p><Strong>📝 Chapter Under Construction</Strong></p>
    <p>This chapter has not been configured yet. Click the Edit button above to set up variables and publish content.</p>
  </ac:rich-text-body>
</ac:structured-macro>
<!-- BLUEPRINT-MANAGED-END: ${localId} -->

<hr class="blueprint-chapter-divider" data-chapter="${chapterId}" data-local-id="${localId}" />
<!-- BLUEPRINT-CHAPTER-END: ${chapterId} -->
`.trim();
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Find and extract chapter content from page body
 * 
 * @param {string} pageBody - Full page storage content
 * @param {string} chapterId - Chapter ID to find
 * @returns {Object|null} { startIndex, endIndex, content } or null if not found
 */
export function findChapter(pageBody, chapterId) {
  const startMarker = `<!-- BLUEPRINT-CHAPTER-START: ${chapterId} -->`;
  const endMarker = `<!-- BLUEPRINT-CHAPTER-END: ${chapterId} -->`;
  
  const startIndex = pageBody.indexOf(startMarker);
  if (startIndex === -1) return null;
  
  const endIndex = pageBody.indexOf(endMarker);
  if (endIndex === -1) return null;
  
  const fullEndIndex = endIndex + endMarker.length;
  
  return {
    startIndex,
    endIndex: fullEndIndex,
    content: pageBody.substring(startIndex, fullEndIndex)
  };
}

/**
 * Find managed content zone within a chapter
 * 
 * @param {string} pageBody - Full page storage content
 * @param {string} localId - Embed localId
 * @returns {Object|null} { startIndex, endIndex, content } or null if not found
 */
export function findManagedZone(pageBody, localId) {
  const startMarker = `<!-- BLUEPRINT-MANAGED-START: ${localId} -->`;
  const endMarker = `<!-- BLUEPRINT-MANAGED-END: ${localId} -->`;
  
  const startIndex = pageBody.indexOf(startMarker);
  if (startIndex === -1) return null;
  
  const endIndex = pageBody.indexOf(endMarker);
  if (endIndex === -1) return null;
  
  const contentStart = startIndex + startMarker.length;
  
  return {
    startIndex,
    endIndex: endIndex + endMarker.length,
    contentStart,
    contentEnd: endIndex,
    content: pageBody.substring(contentStart, endIndex).trim()
  };
}

/**
 * Replace managed zone content, preserving markers
 * 
 * @param {string} pageBody - Full page storage content
 * @param {string} localId - Embed localId
 * @param {string} newContent - New content to inject
 * @returns {string|null} Updated page body or null if zone not found
 */
export function replaceManagedZone(pageBody, localId, newContent) {
  const zone = findManagedZone(pageBody, localId);
  if (!zone) return null;
  
  const startMarker = `<!-- BLUEPRINT-MANAGED-START: ${localId} -->`;
  const endMarker = `<!-- BLUEPRINT-MANAGED-END: ${localId} -->`;
  
  return (
    pageBody.substring(0, zone.startIndex) +
    startMarker + '\n' +
    newContent + '\n' +
    endMarker +
    pageBody.substring(zone.endIndex)
  );
}
```

---

### 2. Enhanced Injection Resolver

**File:** `src/resolvers/injection-resolver.js` (ENHANCE)

Add the following functions to the existing file:

```javascript
import { storage } from '@forge/api';
import api, { route } from '@forge/api';
import { 
  convertAdfToStorage, 
  buildChapterStructure,
  buildChapterPlaceholder,
  findChapter,
  replaceManagedZone 
} from '../utils/storage-format-utils.js';
import {
  filterContentByToggles,
  substituteVariablesInAdf,
  insertCustomParagraphsInAdf,
  insertInternalNotesInAdf
} from '../utils/adf-rendering-utils.js';
import { calculateContentHash } from '../utils/hash-utils.js';
import { logFunction, logPhase, logSuccess, logFailure } from '../utils/forge-logger.js';

/**
 * Publish a single chapter/Embed to the page
 * 
 * Called when user clicks "Publish to Page" in Embed Edit Mode.
 * Renders content with current config and injects into page storage.
 */
export async function publishChapter(req) {
  const { pageId, localId, excerptId } = req.payload;
  
  logFunction('publishChapter', 'START', { pageId, localId, excerptId });
  
  try {
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
    
    // 2. Load Embed config (variables, toggles, etc.)
    const embedConfig = await storage.get(`macro-vars:${localId}`);
    const variableValues = embedConfig?.variableValues || {};
    const toggleStates = embedConfig?.toggleStates || {};
    const customInsertions = embedConfig?.customInsertions || [];
    const internalNotes = embedConfig?.internalNotes || [];
    
    // 3. Render content with all settings applied
    let renderedAdf = excerpt.content;
    
    if (renderedAdf && typeof renderedAdf === 'object' && renderedAdf.type === 'doc') {
      renderedAdf = substituteVariablesInAdf(renderedAdf, variableValues);
      renderedAdf = insertCustomParagraphsInAdf(renderedAdf, customInsertions);
      renderedAdf = insertInternalNotesInAdf(renderedAdf, internalNotes);
      renderedAdf = filterContentByToggles(renderedAdf, toggleStates);
    }
    
    // 4. Convert ADF to storage format
    const storageContent = await convertAdfToStorage(renderedAdf);
    if (!storageContent) {
      logFailure('publishChapter', 'ADF conversion failed', new Error('Conversion returned null'));
      return { success: false, error: 'Failed to convert content to storage format' };
    }
    
    // 5. Get current page content
    logPhase('publishChapter', 'Fetching page content', { pageId });
    const pageResponse = await api.asApp().requestConfluence(
      route`/wiki/api/v2/pages/${pageId}?body-format=storage`,
      { headers: { 'Accept': 'application/json' } }
    );
    
    if (!pageResponse.ok) {
      const errorText = await pageResponse.text();
      logFailure('publishChapter', 'Failed to get page', new Error(errorText));
      return { success: false, error: `Failed to get page: ${pageResponse.status}` };
    }
    
    const pageData = await pageResponse.json();
    let pageBody = pageData.body.storage.value;
    const currentVersion = pageData.version.number;
    
    // 6. Determine chapter ID (use excerptId or generate)
    const chapterId = embedConfig?.chapterId || `chapter-${localId}`;
    
    // 7. Check if chapter already exists in page
    const existingChapter = findChapter(pageBody, chapterId);
    
    let newPageBody;
    
    if (existingChapter) {
      // Update existing chapter - replace managed zone only
      logPhase('publishChapter', 'Updating existing chapter', { chapterId });
      newPageBody = replaceManagedZone(pageBody, localId, storageContent);
      
      if (!newPageBody) {
        // Managed zone not found - rebuild entire chapter
        logPhase('publishChapter', 'Rebuilding chapter (zone not found)', { chapterId });
        const chapterHtml = buildChapterStructure({
          chapterId,
          localId,
          heading: excerpt.name || 'Untitled Chapter',
          bodyContent: storageContent
        });
        
        newPageBody = 
          pageBody.substring(0, existingChapter.startIndex) +
          chapterHtml +
          pageBody.substring(existingChapter.endIndex);
      }
    } else {
      // New chapter - append to page
      logPhase('publishChapter', 'Injecting new chapter', { chapterId });
      const chapterHtml = buildChapterStructure({
        chapterId,
        localId,
        heading: excerpt.name || 'Untitled Chapter',
        bodyContent: storageContent
      });
      
      // Append after existing content
      newPageBody = pageBody + '\n\n' + chapterHtml;
    }
    
    // 8. Update page via REST API
    logPhase('publishChapter', 'Updating page', { pageId, version: currentVersion + 1 });
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
      logFailure('publishChapter', 'Failed to update page', new Error(errorText));
      return { success: false, error: `Failed to update page: ${updateResponse.status}` };
    }
    
    const updatedPage = await updateResponse.json();
    
    // 9. Update Embed config with published state
    const publishedContentHash = calculateContentHash(storageContent);
    await storage.set(`macro-vars:${localId}`, {
      ...embedConfig,
      chapterId,
      publishedAt: new Date().toISOString(),
      publishedContentHash,
      publishedVersion: updatedPage.version.number
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
      publishedAt: new Date().toISOString()
    };
    
  } catch (error) {
    logFailure('publishChapter', 'Unexpected error', error);
    return {
      success: false,
      error: error.message || 'Unknown error occurred'
    };
  }
}

/**
 * Check if a chapter has been published and get its status
 */
export async function getPublishStatus(req) {
  const { localId } = req.payload;
  
  try {
    const embedConfig = await storage.get(`macro-vars:${localId}`);
    
    if (!embedConfig) {
      return { success: true, data: { isPublished: false } };
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
    return { success: false, error: error.message };
  }
}

/**
 * Inject placeholder for unpublished chapter
 */
export async function injectPlaceholder(req) {
  const { pageId, localId, excerptId, heading } = req.payload;
  
  logFunction('injectPlaceholder', 'START', { pageId, localId });
  
  try {
    // Get page
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
    
    const chapterId = `chapter-${localId}`;
    
    // Check if chapter already exists
    if (findChapter(pageBody, chapterId)) {
      return { success: true, message: 'Chapter already exists' };
    }
    
    // Build placeholder
    const placeholderHtml = buildChapterPlaceholder({
      chapterId,
      localId,
      heading: heading || 'New Chapter'
    });
    
    const newPageBody = pageBody + '\n\n' + placeholderHtml;
    
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
      return { success: false, error: 'Failed to update page' };
    }
    
    // Save chapter ID in embed config
    const embedConfig = await storage.get(`macro-vars:${localId}`) || {};
    await storage.set(`macro-vars:${localId}`, {
      ...embedConfig,
      chapterId,
      excerptId
    });
    
    return { success: true, chapterId };
    
  } catch (error) {
    logFailure('injectPlaceholder', 'Error', error);
    return { success: false, error: error.message };
  }
}
```

---

### 3. Register New Resolver Functions

**File:** `src/index.js` (MODIFY)

Add imports and handler cases:

```javascript
// Add to imports at top of file
import { 
  publishChapter, 
  getPublishStatus, 
  injectPlaceholder 
} from './resolvers/injection-resolver.js';

// Add to handler switch statement
case 'publishChapter':
  return await publishChapter(req);

case 'getPublishStatus':
  return await getPublishStatus(req);

case 'injectPlaceholder':
  return await injectPlaceholder(req);
```

---

### 4. Embed Edit Mode UI Changes

**File:** `src/components/embed/EmbedEditMode.jsx` (MODIFY)

Add Publish button and status display. Add these to the component:

```jsx
// Add to imports
import { invoke } from '@forge/bridge';

// Add to component (inside the function, after existing state declarations)
const [publishStatus, setPublishStatus] = useState(null);
const [isPublishing, setIsPublishing] = useState(false);
const [publishError, setPublishError] = useState(null);

// Add useEffect to load publish status
useEffect(() => {
  const loadPublishStatus = async () => {
    if (!localId) return;
    try {
      const result = await invoke('getPublishStatus', { localId });
      if (result.success) {
        setPublishStatus(result.data);
      }
    } catch (error) {
      console.error('Failed to load publish status:', error);
    }
  };
  loadPublishStatus();
}, [localId]);

// Add publish handler
const handlePublish = async () => {
  if (!pageId || !localId || !excerptId) {
    setPublishError('Missing required data for publishing');
    return;
  }
  
  setIsPublishing(true);
  setPublishError(null);
  
  try {
    const result = await invoke('publishChapter', {
      pageId,
      localId,
      excerptId
    });
    
    if (result.success) {
      setPublishStatus({
        isPublished: true,
        publishedAt: result.publishedAt,
        publishedVersion: result.pageVersion
      });
      // Optionally show success message
    } else {
      setPublishError(result.error || 'Failed to publish');
    }
  } catch (error) {
    setPublishError(error.message || 'Failed to publish');
  } finally {
    setIsPublishing(false);
  }
};

// Add to JSX (at the bottom of the component, before closing tags)
// Place this after the preview section, before the closing Stack

<Box xcss={xcss({ 
  borderTopWidth: 'border.width', 
  borderTopStyle: 'solid', 
  borderTopColor: 'color.border',
  paddingTop: 'space.200',
  marginTop: 'space.200'
})}>
  <Stack space="space.100">
    {/* Publish Status */}
    {publishStatus?.isPublished && (
      <Inline space="space.100" alignBlock="center">
        <Lozenge appearance="success">Published</Lozenge>
        <Text size="small" color="color.text.subtle">
          Last published: {new Date(publishStatus.publishedAt).toLocaleString()}
        </Text>
      </Inline>
    )}
    
    {!publishStatus?.isPublished && (
      <Inline space="space.100" alignBlock="center">
        <Lozenge appearance="new">Draft</Lozenge>
        <Text size="small" color="color.text.subtle">
          Not yet published to page
        </Text>
      </Inline>
    )}
    
    {/* Publish Error */}
    {publishError && (
      <SectionMessage appearance="error">
        <Text>{publishError}</Text>
      </SectionMessage>
    )}
    
    {/* Publish Button */}
    <Inline space="space.100">
      <Button 
        appearance="primary" 
        onClick={handlePublish}
        isLoading={isPublishing}
        isDisabled={isPublishing || !excerptId}
      >
        {publishStatus?.isPublished ? 'Republish to Page' : 'Publish to Page'}
      </Button>
      
      <Button 
        appearance="subtle"
        onClick={() => {/* Open Compositor - Phase 2 */}}
      >
        Blueprint Settings
      </Button>
    </Inline>
  </Stack>
</Box>
```

---

### 5. Embed View Mode Changes

**File:** `src/components/embed/EmbedViewMode.jsx` (MODIFY)

Make the component render minimally when content is published (injected content is on the page):

```jsx
// Add to component props
// publishStatus - from parent component

// Add early in the component, after loading check
// If published, render minimal UI (just staleness indicator when needed)
if (publishStatus?.isPublished && !isStale) {
  // Content is injected on page, no need to render in iframe
  // Return null or minimal indicator
  return null; // Injected content is visible on page
}

// If published but stale, show the Update Available banner
if (publishStatus?.isPublished && isStale) {
  return (
    <Box xcss={staleBorderWrapperStyle}>
      <StalenessCheckIndicator
        isCheckingStaleness={false}
        isStale={isStale}
        showUpdateBanner={showUpdateBanner}
        onReviewClick={handleReviewClick}
      />
      {showUpdateBanner && (
        <UpdateAvailableBanner
          isStale={isStale}
          showDiffView={showDiffView}
          setShowDiffView={setShowDiffView}
          handleUpdateToLatest={handleUpdateToLatest}
          isUpdating={isUpdating}
          syncedContent={syncedContent}
          latestRenderedContent={latestRenderedContent}
          variableValues={variableValues}
          toggleStates={toggleStates}
        />
      )}
    </Box>
  );
}

// Existing rendering logic continues for non-published embeds...
```

---

### 6. EmbedContainer Integration

**File:** `src/EmbedContainer.jsx` (MODIFY)

Pass publish status to child components and provide pageId/excerptId to Edit Mode:

```jsx
// Add state for publish status (near other state declarations)
const [publishStatus, setPublishStatus] = useState(null);

// Add effect to load publish status (after other effects)
useEffect(() => {
  const loadPublishStatus = async () => {
    if (!effectiveLocalId) return;
    try {
      const result = await invoke('getPublishStatus', { localId: effectiveLocalId });
      if (result.success) {
        setPublishStatus(result.data);
      }
    } catch (error) {
      console.error('Failed to load publish status:', error);
    }
  };
  loadPublishStatus();
}, [effectiveLocalId]);

// Pass to EmbedEditMode (add to existing props)
<EmbedEditMode
  // ... existing props ...
  pageId={context?.contentId || context?.extension?.content?.id}
  localId={effectiveLocalId}
  excerptId={selectedExcerptId}
  publishStatus={publishStatus}
  onPublishSuccess={(status) => setPublishStatus(status)}
/>

// Pass to EmbedViewMode (add to existing props)
<EmbedViewMode
  // ... existing props ...
  publishStatus={publishStatus}
/>
```

---

## Testing Checklist

### Unit Tests

- [ ] `convertAdfToStorage` handles valid ADF
- [ ] `convertAdfToStorage` returns null on API error
- [ ] `buildChapterStructure` generates valid HTML with markers
- [ ] `findChapter` finds existing chapters
- [ ] `findChapter` returns null for missing chapters
- [ ] `replaceManagedZone` replaces content correctly
- [ ] `replaceManagedZone` preserves markers

### Integration Tests

- [ ] `publishChapter` creates new chapter on empty page
- [ ] `publishChapter` updates existing chapter
- [ ] `publishChapter` preserves other page content
- [ ] `publishChapter` updates embed config with published state
- [ ] `getPublishStatus` returns correct status

### Manual Tests

- [ ] Create new Embed, configure variables, click Publish
- [ ] Verify chapter appears on page with correct heading
- [ ] Verify content is searchable in Confluence
- [ ] Verify TOC macro can find the heading
- [ ] Edit variables, republish, verify content updates
- [ ] Verify staleness detection still works
- [ ] Verify page is editable only by app (locked page)

---

## Rollback Plan

If issues are discovered:

1. Feature is on separate branch - main branch unaffected
2. Published content remains on pages (native Confluence content)
3. Existing iframe rendering still works as fallback
4. Can revert by checking out main branch

---

## Next Steps After Phase 1

1. **Phase 2:** Compositor Modal UI (archetype selection, bulk chapter management)
2. **Phase 3:** Byline entry point (`confluence:contentBylineItem`)
3. **Phase 4:** Admin archetype management
4. **Phase 5:** View Mode refinements (Edit button on chapters)

---

**Document Signature:**  
Model: Claude Opus 4 (claude-opus-4-20250514)  
Created: 2025-11-26  
Branch: `feature/compositor-native-injection`

