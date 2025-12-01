# Content Injection Architecture Proposals

**Author:** Claude Opus 4 (claude-opus-4-20250514)  
**Date:** 2025-11-26T20:35:00Z  
**Last Updated:** 2025-11-26T20:55:00Z  
**Status:** Proposal / Refined with Stakeholder Input  
**Reviewing:** CUSTOM_UI_COMPOSITOR_ARCHITECTURE.md (authored by earlier model version)

---

## Executive Summary

This document presents a critical review of the existing Custom UI Compositor Architecture proposal and offers 5 alternative approaches to achieving the primary goal: **making Blueprint content fully indexed within Confluence search** while maintaining the Source → Embed standardization model and the redlining review system.

### Key Finding: The Indexing Problem

After reviewing the current architecture and Confluence/Forge platform constraints, I can confirm:

> **Content rendered inside Forge UI or Custom UI iframes is NOT indexed by Confluence's search engine.**

This is a fundamental limitation of the iframe rendering model. Confluence's search crawler indexes the page storage format (ADF/XHTML), not the rendered DOM. Since Forge macros store only parameters (not rendered content) in the page storage, and the actual content is rendered client-side inside iframes, that content is invisible to search.

**This confirms your hypothesis and makes content injection the correct strategic direction.**

### Critical Challenge Identified: Content Boundaries

With iframe rendering, boundaries are absolute — inside = managed, outside = unmanaged. With injection, **content boundaries dissolve**. Users can freely edit around and within injected content, which the redlining system cannot see.

This document now includes:
- **[Critical Challenge: The Content Boundary Problem](#critical-challenge-the-content-boundary-problem)** — 5 approaches to boundary tracking with recommended hybrid strategy
- **[Compositor Integration](#compositor-integration-chapter-based-content-model)** — How chapter-based structure solves boundaries, Edit Mode visibility, custom content preservation

---

## Current State Analysis

### What Works Well Today

1. **Source → Embed Model:** Content is authored once in Source macros and referenced by Embed macros, ensuring language standardization
2. **Variable Substitution:** Client-specific values are injected at view time
3. **Toggle System:** Conditional sections can be enabled/disabled per Embed
4. **Staleness Detection:** Hash-based comparison alerts users when Sources change
5. **Redlining System:** Content review workflow with approval/rejection capabilities
6. **Version History:** Point-in-time snapshots for recovery

### What Doesn't Work

1. **Search Discoverability:** All Blueprint content is invisible to Confluence search
2. **Copy/Paste:** Users cannot easily copy content from iframes
3. **Print/Export:** PDF exports may not capture iframe content correctly
4. **Table of Contents:** Confluence's native TOC macro cannot parse iframe content
5. **Performance:** 50+ iframes per page creates significant overhead

### Existing Foundation

The codebase already contains proof-of-concept implementations:

- `src/resolvers/poc-injection-resolver.js` - Basic injection test
- `src/resolvers/injection-resolver.js` - Full injection with marker-based updates

These demonstrate that the injection mechanism works. The challenge is architectural: how to integrate injection into the workflow while preserving the review and standardization systems.

---

## Proposal Comparison Matrix

| Aspect | Proposal 1: Dual-Mode Hybrid | Proposal 2: Publish Workflow | Proposal 3: Shadow Content | Proposal 4: Scheduled Sync | Proposal 5: Full Page Rewrite |
|--------|------------------------------|------------------------------|---------------------------|---------------------------|------------------------------|
| **Indexing** | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Full |
| **Source → Embed Preserved** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ⚠️ Transformed |
| **Redlining Preserved** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ⚠️ Modified |
| **Real-time Updates** | ⚠️ Manual publish | ⚠️ Manual publish | ✅ Background | ⚠️ Delayed | ❌ Manual only |
| **Implementation Complexity** | Medium | Medium-High | High | Medium | Medium |
| **User Workflow Change** | Low | Medium | None | None | High |
| **Performance Impact** | Good | Good | Good | Good | Excellent |
| **Rollback Capability** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ⚠️ Via history |

---

## Proposal 1: Dual-Mode Hybrid (RECOMMENDED)

### Concept

Maintain the current iframe-based Edit Mode for configuration, but add a "Publish to Page" action that injects rendered content into the page storage alongside the Embed macro. The macro becomes a "controller" that manages both the interactive edit experience AND the static published content.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Confluence Page Storage                                        │
│                                                                 │
│  <ac:adf-extension>                                            │
│    [Embed Macro - stores config, renders Edit UI]              │
│  </ac:adf-extension>                                           │
│                                                                 │
│  <!-- BLUEPRINT-CONTENT-START-{localId} -->                    │
│  <h2>Weekly Status Report</h2>                                 │
│  <p>Client: <Strong>Acme Corp</Strong></p>                    │
│  <p>This is the indexed, searchable content...</p>            │
│  <table>...</table>                                            │
│  <!-- BLUEPRINT-CONTENT-END-{localId} -->                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Workflow

1. **Edit Mode:** User configures Embed via iframe UI (variables, toggles, custom insertions)
2. **Preview:** Changes visible immediately in iframe preview
3. **Redline Review:** Reviewer approves/rejects content
4. **Publish:** On approval (or manual action), content is injected into page storage
5. **View Mode:** Iframe shows "Published" status, but actual content is native Confluence

### Implementation

```javascript
// In include-resolvers.js or new publish-resolver.js
export async function publishEmbedContent(req) {
  const { pageId, localId, excerptId, variableValues, toggleStates, customInsertions, internalNotes } = req.payload;
  
  // 1. Get current page content
  const pageData = await getPageContent(pageId);
  
  // 2. Render the Embed content with all substitutions
  const excerpt = await storage.get(`excerpt:${excerptId}`);
  let renderedContent = renderExcerptToStorage(excerpt, {
    variableValues,
    toggleStates,
    customInsertions,
    internalNotes
  });
  
  // 3. Inject/update content in page storage
  const updatedBody = injectOrUpdateContent(pageData.body, localId, renderedContent);
  
  // 4. Update page via REST API
  await updatePage(pageId, updatedBody, pageData.version + 1);
  
  // 5. Mark Embed as published
  await storage.set(`macro-vars:${localId}`, {
    ...existingData,
    publishedAt: new Date().toISOString(),
    publishedContentHash: calculateHash(renderedContent)
  });
  
  return { success: true };
}
```

### Advantages

- ✅ **Minimal workflow change:** Users keep editing via familiar iframe UI
- ✅ **Full indexing:** Injected content is native Confluence, fully searchable
- ✅ **Redlining preserved:** Review happens before publish action
- ✅ **Source → Embed preserved:** Embeds still reference Sources
- ✅ **Staleness detection:** Can compare published hash vs Source hash
- ✅ **Graceful degradation:** If injection fails, iframe still shows content

### Challenges

- ⚠️ **Dual content:** Both macro params AND injected content exist
- ⚠️ **Sync complexity:** Must handle cases where injected content gets out of sync
- ⚠️ **Page version churn:** Each publish creates a page version

### Staleness Handling

When Source changes:
1. Staleness detection triggers as usual
2. "Update Available" banner appears in iframe
3. User reviews diff, clicks "Accept & Publish"
4. Content re-rendered and re-injected

---

## Proposal 2: Explicit Publish Workflow

### Concept

Similar to Proposal 1, but with a more formal "Draft → Review → Publish" workflow. Embeds exist in "draft" state until explicitly published, with clear status indicators.

### Architecture

```
┌───────────────────────────────────────────────────────────┐
│  DRAFT STATE                                              │
│  - Embed macro exists with configuration                  │
│  - No injected content in page storage                    │
│  - Content visible only in iframe (not searchable)       │
│  - Status: "Draft - Not Published"                        │
└───────────────────────────────────────────────────────────┘
                          ↓
                    [Redline Review]
                          ↓
┌───────────────────────────────────────────────────────────┐
│  PUBLISHED STATE                                          │
│  - Embed macro exists with configuration                  │
│  - Injected content in page storage (searchable)         │
│  - Iframe shows "Published" with edit controls           │
│  - Status: "Published (last: 2025-11-26)"                │
└───────────────────────────────────────────────────────────┘
```

### Workflow States

```javascript
const EmbedState = {
  DRAFT: 'draft',           // Configured but not published
  PENDING_REVIEW: 'pending', // Awaiting redline approval
  APPROVED: 'approved',      // Approved, ready to publish
  PUBLISHED: 'published',    // Content injected into page
  STALE: 'stale'            // Source changed since last publish
};
```

### UI Changes

Edit Mode would show clear state indicators:

```jsx
// In EmbedEditMode.jsx
<Box>
  <Inline space="space.100" alignBlock="center">
    <Lozenge appearance={getLozengeAppearance(state)}>
      {state === 'draft' && 'Draft - Not Published'}
      {state === 'pending' && 'Pending Review'}
      {state === 'approved' && 'Ready to Publish'}
      {state === 'published' && 'Published'}
      {state === 'stale' && 'Update Available'}
    </Lozenge>
  </Inline>
  
  {state === 'approved' && (
    <Button appearance="primary" onClick={handlePublish}>
      Publish to Page
    </Button>
  )}
</Box>
```

### Advantages

- ✅ **Clear visibility:** Users always know content state
- ✅ **Intentional publishing:** Prevents accidental changes to indexed content
- ✅ **Audit trail:** Clear history of draft → review → publish
- ✅ **Batch publishing:** Could publish multiple Embeds at once

### Challenges

- ⚠️ **Workflow overhead:** More steps for users
- ⚠️ **Split experience:** Draft content not searchable until published
- ⚠️ **Training required:** Users must understand new states

---

## Proposal 3: Shadow Content (Background Sync)

### Concept

Automatically inject/update content in the background whenever changes are saved, without requiring explicit user action. The Embed macro acts as the "source of truth" while the injected content is a "shadow" that stays synchronized.

### Architecture

```
┌────────────────────────────────────────────────────────────────┐
│  User saves Embed configuration                                │
│                    ↓                                           │
│  1. Save to Forge Storage (macro-vars:{localId})              │
│                    ↓                                           │
│  2. Queue background sync job                                  │
│                    ↓                                           │
│  3. Worker picks up job                                        │
│                    ↓                                           │
│  4. Render content with current config                         │
│                    ↓                                           │
│  5. Inject into page storage                                   │
│                    ↓                                           │
│  6. Update sync status                                         │
└────────────────────────────────────────────────────────────────┘
```

### Implementation

```yaml
# manifest.yml additions
modules:
  consumer:
    - key: content-sync-consumer
      queue: content-sync-queue
      function: content-sync-worker
      
  function:
    - key: content-sync-worker
      handler: workers/contentSyncWorker.handler
      timeoutSeconds: 300
```

```javascript
// workers/contentSyncWorker.js
export async function handler(event) {
  const { localId, pageId, excerptId, variableValues, toggleStates } = event.payload;
  
  try {
    // Render and inject content
    const result = await injectEmbedContent({
      pageId,
      localId,
      excerptId,
      variableValues,
      toggleStates
    });
    
    // Update sync status
    await storage.set(`sync-status:${localId}`, {
      lastSynced: new Date().toISOString(),
      success: true
    });
    
  } catch (error) {
    await storage.set(`sync-status:${localId}`, {
      lastSynced: new Date().toISOString(),
      success: false,
      error: error.message
    });
  }
}
```

### Trigger Points

1. **Auto-save in Edit Mode:** Queue sync after debounced save
2. **Source update:** When a Source changes, queue sync for all Embeds using it
3. **Redline approval:** Queue sync when content is approved
4. **Manual refresh:** User can trigger manual resync

### Advantages

- ✅ **Transparent to users:** No workflow change required
- ✅ **Always synchronized:** Content stays up-to-date automatically
- ✅ **Resilient:** Queue-based, can retry on failure
- ✅ **Scalable:** Workers handle load independently

### Challenges

- ⚠️ **Eventual consistency:** Brief delay between save and injection
- ⚠️ **Page version churn:** Many automatic page updates
- ⚠️ **Conflict potential:** Race conditions if multiple Embeds update simultaneously
- ⚠️ **Redline bypass:** Auto-sync might publish unapproved content

### Redline Integration

To preserve redlining, sync would only happen for approved content:

```javascript
// Only sync if redline status is approved or not required
const varsData = await storage.get(`macro-vars:${localId}`);
if (varsData.redlineStatus === 'approved' || !varsData.redlineRequired) {
  await injectContent(...);
}
```

---

## Proposal 4: Scheduled Batch Sync

### Concept

Instead of real-time sync, run periodic batch jobs that synchronize all Embed content across all pages. Provides indexing without the complexity of real-time injection.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Scheduled Trigger (e.g., hourly, nightly)                  │
│                    ↓                                        │
│  1. Query all Embeds with changes since last sync          │
│                    ↓                                        │
│  2. Group by pageId                                        │
│                    ↓                                        │
│  3. For each page:                                         │
│     a. Render all Embed content                            │
│     b. Inject/update all in single page update             │
│                    ↓                                        │
│  4. Update sync timestamps                                  │
└─────────────────────────────────────────────────────────────┘
```

### Implementation

```yaml
# manifest.yml additions
modules:
  scheduledTrigger:
    - key: content-sync-trigger
      function: batch-sync-worker
      interval: hour  # or 'day' for less frequent
```

```javascript
// workers/batchSyncWorker.js
export async function handler() {
  const lastRun = await storage.get('last-batch-sync') || 0;
  
  // Get all Embeds modified since last run
  const modifiedEmbeds = await queryModifiedEmbeds(lastRun);
  
  // Group by page
  const byPage = groupBy(modifiedEmbeds, 'pageId');
  
  for (const [pageId, embeds] of Object.entries(byPage)) {
    await syncPageEmbeds(pageId, embeds);
  }
  
  await storage.set('last-batch-sync', Date.now());
}
```

### Advantages

- ✅ **Minimal page churn:** One update per page per cycle
- ✅ **Predictable:** Clear schedule, easy to monitor
- ✅ **Low complexity:** No real-time coordination needed
- ✅ **Batch efficiency:** Can optimize page updates

### Challenges

- ⚠️ **Delayed indexing:** Content not searchable until next sync
- ⚠️ **Stale window:** Users might see outdated indexed content
- ⚠️ **Not suitable for time-sensitive content**

### Use Case Fit

Best for:
- Documentation that changes infrequently
- Organizations with formal release cycles
- Content where 24-hour delay is acceptable

---

## Proposal 5: Full Page Rewrite (Native Content Mode)

### Concept

The most radical approach from the original architecture document: View Mode has ZERO Forge involvement. The Compositor (in Edit Mode) writes fully-rendered ADF directly to the page body. Embeds become native Confluence content.

### Architecture

```
┌────────────────────────────────────────────────────────────────┐
│  EDIT MODE: Full-page Compositor UI                           │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  [Source Selection] [Variable Config] [Toggle Config]  │  │
│  │  [Preview Panel]                                        │  │
│  │                                                          │  │
│  │  [Save Draft] [Request Review] [Publish to Page]        │  │
│  └────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
                              ↓
                      [Publish Action]
                              ↓
┌────────────────────────────────────────────────────────────────┐
│  VIEW MODE: Pure Confluence Page (NO FORGE RUNTIME)          │
│                                                                │
│  <h2>Weekly Status Report</h2>                                │
│  <p>Client: <Strong>Acme Corp</Strong></p>                   │
│  <table>...</table>                                           │
│                                                                │
│  [Edit Blueprint ✏️]  ← Small button to reopen compositor     │
└────────────────────────────────────────────────────────────────┘
```

### Transformation

The Source → Embed model transforms:

**Before (Edit Mode):**
- Source: Template with `{{variables}}` and `{{toggle:X}}` markers
- Embed: References Source + stores configuration (variable values, toggle states)

**After (Publish):**
- Page contains fully-rendered native ADF
- Source reference stored in page properties for re-editing
- No visible Embed macro

### Configuration Storage

```javascript
// Store Embed configuration in page properties for re-editing
await confluence.pageProperties.set(pageId, 'blueprint-config', {
  embeds: [
    {
      id: 'embed-1',
      sourceId: 'excerpt-123',
      position: { paragraph: 5 },  // Where in document
      variableValues: { client: 'Acme Corp' },
      toggleStates: { 'Include Timeline': true },
      customInsertions: [...],
      internalNotes: [...]
    }
  ],
  lastPublished: '2025-11-26T...',
  publishedBy: 'user-123'
});
```

### Redlining in Native Mode

Redlining would work differently:
1. User opens Compositor to edit
2. Makes changes (shows diff against current page content)
3. Requests review
4. Reviewer approves in Compositor UI
5. Changes published to page

### Advantages

- ✅ **Zero runtime overhead:** No Forge code runs in View Mode
- ✅ **Perfect indexing:** 100% native Confluence content
- ✅ **Perfect print/export:** Standard Confluence behavior
- ✅ **Maximum performance:** Just Confluence rendering ADF
- ✅ **Offline capable:** Page works without Forge

### Challenges

- ⚠️ **Major paradigm shift:** Users must learn new Edit workflow
- ⚠️ **No inline editing:** Must open Compositor to change anything
- ⚠️ **Staleness complexity:** No automatic Source update detection in View Mode
- ⚠️ **Re-composition required:** Must parse page back to Sources for editing
- ⚠️ **Source → Embed model transformed:** Not preserved in pure form

### Staleness Detection Alternative

Since no Forge runs in View Mode, staleness would be handled via:

1. **Scheduled function:** Nightly check of all Blueprint pages vs Source hashes
2. **Email notification:** Alert page owners when Sources change
3. **Admin dashboard:** List of stale pages requiring update
4. **On-demand check:** Button in Compositor to check for updates

---

## Detailed Recommendation

### Primary Recommendation: Proposal 1 (Dual-Mode Hybrid)

I recommend **Proposal 1: Dual-Mode Hybrid** as the primary implementation path for the following reasons:

1. **Minimal disruption:** Users continue editing via the familiar iframe UI they already know
2. **Preserves all systems:** Source → Embed model, redlining, version history all work as-is
3. **Achieves indexing goal:** Injected content is fully searchable
4. **Incremental adoption:** Can be rolled out gradually, page by page
5. **Graceful fallback:** If injection fails, iframe still displays content

### Secondary Recommendation: Proposal 3 (Shadow Content) for Phase 2

If Proposal 1 proves successful and users want automatic synchronization, **Proposal 3** can be layered on top:

1. Start with manual "Publish" action (Proposal 1)
2. Add option to enable auto-sync per page/space (Proposal 3)
3. Auto-sync only for approved content (preserves redlining)

### When to Consider Proposal 5 (Full Page Rewrite)

**Proposal 5** should be revisited if:
- Performance remains an issue even with Proposal 1
- Users actively request a compositor-style editing experience
- The organization adopts formal content release cycles
- Real-time Source update detection becomes less important

---

## Implementation Roadmap (Proposal 1)

### Phase 1: Core Injection (2-3 weeks)

1. **Enhance injection-resolver.js:**
   - Handle all ADF content types properly
   - Support toggle filtering and variable substitution
   - Add custom insertion and internal note rendering

2. **Add "Publish" button to EmbedEditMode:**
   - Show after redline approval
   - Confirm action before publishing
   - Show success/failure feedback

3. **Track published state:**
   - Store `publishedAt`, `publishedContentHash` in macro-vars
   - Display published status in View Mode

### Phase 2: Staleness & Sync (2 weeks)

1. **Detect published content staleness:**
   - Compare `publishedContentHash` vs Source `contentHash`
   - Show "Republish Available" when stale

2. **Add "Republish" workflow:**
   - Show diff between current published and new content
   - One-click republish after review

### Phase 3: Polish & Edge Cases (1-2 weeks)

1. **Handle edge cases:**
   - Page structure changes
   - Concurrent editing conflicts
   - Large pages with many Embeds

2. **Add bulk operations:**
   - Publish all Embeds on page
   - Republish all stale Embeds

---

---

## Critical Challenge: The Content Boundary Problem

### The Problem

With iframe-based rendering, content boundaries are absolute and clear:
- **Inside the iframe** = Blueprint-managed content (tracked, versioned, redlined)
- **Outside the iframe** = Native Confluence content (unmanaged)

With content injection, **this boundary dissolves**. Once content is injected into the page storage as native ADF/XHTML, it becomes indistinguishable from manually-typed content. Users can:

1. Add paragraphs **between** injected blocks
2. Edit content **within** injected blocks (modifying what Blueprint "owns")
3. Add content **after** injected blocks in the same section
4. Copy/paste injected content elsewhere on the page

**The redlining system loses visibility into these manual additions**, which defeats its purpose of ensuring all content is reviewed.

### Scope of the Problem

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Page Structure                                                         │
│                                                                         │
│  [Native Confluence heading]                                            │
│                                                                         │
│  <!-- BLUEPRINT-CONTENT-START-embed1 -->                               │
│  [Injected Blueprint content - TRACKED]                                │
│  <!-- BLUEPRINT-CONTENT-END-embed1 -->                                 │
│                                                                         │
│  [User manually types paragraph here]  ← ⚠️ NOT TRACKED by Blueprint   │
│  [User adds another paragraph]         ← ⚠️ NOT TRACKED                │
│                                                                         │
│  <!-- BLUEPRINT-CONTENT-START-embed2 -->                               │
│  [Injected Blueprint content - TRACKED]                                │
│  <!-- BLUEPRINT-CONTENT-END-embed2 -->                                 │
│                                                                         │
│  [User adds conclusion paragraph]      ← ⚠️ NOT TRACKED                │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Solution Approaches

I've identified 5 potential approaches to handle the boundary problem, each with different tradeoffs:

---

### Approach A: Marker-Based Boundary Tracking with Drift Detection

**Concept:** Use HTML comment markers to define managed regions, then detect when content appears outside those regions.

**Implementation:**

```javascript
// During injection
const injectedContent = `
<!-- BLUEPRINT-MANAGED-START-${localId} -->
<!-- BLUEPRINT-CONTENT-START-${localId} -->
${renderedContent}
<!-- BLUEPRINT-CONTENT-END-${localId} -->
<!-- BLUEPRINT-MANAGED-END-${localId} -->
`;

// During redline scan
async function detectUnmanagedContent(pageId) {
  const pageContent = await getPageContent(pageId);
  
  // Parse page into regions
  const regions = parseContentRegions(pageContent, {
    managedStartPattern: /<!-- BLUEPRINT-MANAGED-START-(\w+) -->/g,
    managedEndPattern: /<!-- BLUEPRINT-MANAGED-END-(\w+) -->/g
  });
  
  // Find content outside managed regions
  const unmanagedRegions = regions.filter(r => !r.isManaged && r.hasContent);
  
  return {
    hasUnmanagedContent: unmanagedRegions.length > 0,
    unmanagedRegions: unmanagedRegions,
    warning: unmanagedRegions.length > 0 
      ? `Found ${unmanagedRegions.length} sections of unreviewed content` 
      : null
  };
}
```

**Redline Integration:**

```jsx
// In Admin page or dedicated Review UI
const RedlineReviewPanel = ({ pageId }) => {
  const { data: contentAnalysis } = useQuery(['contentAnalysis', pageId], 
    () => invoke('analyzePageContent', { pageId })
  );
  
  return (
    <Stack space="space.200">
      {/* Managed Blueprint content */}
      {contentAnalysis.managedBlocks.map(block => (
        <ManagedContentReview key={block.localId} block={block} />
      ))}
      
      {/* Warning for unmanaged content */}
      {contentAnalysis.hasUnmanagedContent && (
        <SectionMessage appearance="warning" title="Unreviewed Content Detected">
          <Text>
            This page contains {contentAnalysis.unmanagedRegions.length} sections 
            of content added outside Blueprint Embeds. This content is not tracked 
            by the redlining system.
          </Text>
          <Button onClick={() => showUnmanagedContent(contentAnalysis)}>
            Review Unmanaged Content
          </Button>
        </SectionMessage>
      )}
    </Stack>
  );
};
```

**Pros:**
- ✅ Clear delineation of what Blueprint "owns"
- ✅ Can warn reviewers about unmanaged content
- ✅ Non-invasive to user editing experience

**Cons:**
- ⚠️ Doesn't prevent manual additions, just detects them
- ⚠️ Users might not understand the warning
- ⚠️ Markers could be accidentally deleted

---

### Approach B: Page-Level Content Ownership Model

**Concept:** Designate entire pages as "Blueprint-managed" where ALL content (whether injected or manually added) is subject to redlining.

**Implementation:**

```javascript
// Page metadata stored in Forge storage
const pageConfig = {
  pageId: '123456',
  ownershipModel: 'BLUEPRINT_MANAGED', // or 'HYBRID' or 'NATIVE_ONLY'
  lastFullContentHash: 'abc123...',    // Hash of entire page content
  lastReviewedAt: '2025-11-26T...',
  lastReviewedHash: 'abc123...'
};

// Detect ANY change to page content
async function detectPageChanges(pageId) {
  const config = await storage.get(`page-config:${pageId}`);
  const currentContent = await getPageContent(pageId);
  const currentHash = calculateHash(currentContent);
  
  return {
    hasChanges: currentHash !== config.lastReviewedHash,
    changeType: currentHash !== config.lastFullContentHash 
      ? 'CONTENT_MODIFIED' 
      : 'NO_CHANGE'
  };
}
```

**Redline Workflow:**

1. Any page change (Blueprint injection OR manual edit) marks page as "Needs Review"
2. Redline reviewer sees diff of entire page since last review
3. Approval updates `lastReviewedHash` to current state
4. All content — managed and unmanaged — is reviewed together

**Pros:**
- ✅ Complete coverage — nothing escapes review
- ✅ Simple mental model for reviewers
- ✅ Leverages Confluence's page diff capabilities

**Cons:**
- ⚠️ More review overhead (reviewing non-Blueprint content too)
- ⚠️ May not scale for pages with frequent minor edits
- ⚠️ Blurs the line between Blueprint and native content

---

### Approach C: Structured Section Ownership

**Concept:** Define specific page sections (by heading or explicit markers) as "Blueprint-managed zones" where only injected content is expected.

**Implementation:**

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Page Structure with Zone Markers                                       │
│                                                                         │
│  <!-- BLUEPRINT-ZONE-START: "Standard Operating Procedures" -->        │
│                                                                         │
│    [Embed 1 macro + injected content]                                  │
│    [Embed 2 macro + injected content]                                  │
│    [Embed 3 macro + injected content]                                  │
│                                                                         │
│  <!-- BLUEPRINT-ZONE-END -->                                           │
│                                                                         │
│  <!-- FREE-EDIT-ZONE: "Project-Specific Notes" -->                     │
│                                                                         │
│    [User can add any content here - NOT tracked]                       │
│                                                                         │
│  <!-- FREE-EDIT-ZONE-END -->                                           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Zone Detection:**

```javascript
async function analyzePageZones(pageId) {
  const content = await getPageContent(pageId);
  
  const zones = parseZones(content);
  
  return zones.map(zone => ({
    type: zone.type, // 'BLUEPRINT_MANAGED' or 'FREE_EDIT'
    name: zone.name,
    hasUnexpectedContent: zone.type === 'BLUEPRINT_MANAGED' 
      && zone.containsNonBlueprintContent,
    contentForReview: zone.type === 'BLUEPRINT_MANAGED' 
      ? zone.allContent 
      : null // Free zones not reviewed
  }));
}
```

**Pros:**
- ✅ Clear semantic zones with user-understandable purpose
- ✅ Allows intentional "free edit" areas
- ✅ Zone violations are detectable

**Cons:**
- ⚠️ Requires page structure setup (zone markers)
- ⚠️ Users might add content in wrong zone
- ⚠️ More complex page management

---

### Approach D: Content Fingerprinting with Diff-Based Review

**Concept:** Store a fingerprint of each injected content block. During redline review, compare current page state against the last known fingerprint to identify modifications and additions.

**Implementation:**

```javascript
// After injection, store fingerprint
async function recordInjectionFingerprint(localId, pageId, injectedContent) {
  await storage.set(`injection-fingerprint:${localId}`, {
    localId,
    pageId,
    contentHash: calculateHash(injectedContent),
    contentLength: injectedContent.length,
    injectedAt: new Date().toISOString(),
    // Store key structural elements for drift detection
    structure: {
      headingCount: countHeadings(injectedContent),
      paragraphCount: countParagraphs(injectedContent),
      tableCount: countTables(injectedContent)
    }
  });
}

// During review, detect drift
async function detectContentDrift(pageId) {
  const pageContent = await getPageContent(pageId);
  const embedConfigs = await getEmbedsOnPage(pageId);
  
  const driftReport = [];
  
  for (const embed of embedConfigs) {
    const fingerprint = await storage.get(`injection-fingerprint:${embed.localId}`);
    const currentBlock = extractBlockByMarkers(pageContent, embed.localId);
    
    if (!currentBlock) {
      driftReport.push({
        localId: embed.localId,
        issue: 'BLOCK_MISSING',
        severity: 'high'
      });
      continue;
    }
    
    const currentHash = calculateHash(currentBlock);
    if (currentHash !== fingerprint.contentHash) {
      driftReport.push({
        localId: embed.localId,
        issue: 'CONTENT_MODIFIED',
        severity: 'medium',
        diff: generateDiff(fingerprint.content, currentBlock)
      });
    }
  }
  
  // Also detect content BETWEEN blocks
  const interBlockContent = extractInterBlockContent(pageContent, embedConfigs);
  if (interBlockContent.length > 0) {
    driftReport.push({
      issue: 'UNMANAGED_CONTENT_ADDED',
      severity: 'low',
      locations: interBlockContent.map(c => c.position),
      content: interBlockContent
    });
  }
  
  return driftReport;
}
```

**Pros:**
- ✅ Detects both modifications TO and additions BETWEEN managed content
- ✅ Provides detailed diff for review
- ✅ Non-invasive to editing experience

**Cons:**
- ⚠️ Storage overhead for fingerprints
- ⚠️ Diff generation can be complex for ADF
- ⚠️ Still requires human review of detected changes

---

### Approach E: Custom Insertion Promotion

**Concept:** When users add content manually on the page (outside Blueprint markers), provide a mechanism to "promote" that content into the Blueprint system as a Custom Insertion, bringing it under management.

**Implementation:**

```jsx
// In Admin or Review UI
const UnmanagedContentPromoter = ({ pageId, unmanagedBlock }) => {
  const [targetEmbed, setTargetEmbed] = useState(null);
  const [insertPosition, setInsertPosition] = useState('after');
  
  const handlePromote = async () => {
    // Add this content as a Custom Insertion to the target Embed
    await invoke('promoteToCustomInsertion', {
      pageId,
      targetLocalId: targetEmbed,
      content: unmanagedBlock.content,
      position: insertPosition,
      originalLocation: unmanagedBlock.location
    });
    
    // Remove the unmanaged content from page (now managed via Custom Insertion)
    await invoke('removeUnmanagedContent', {
      pageId,
      location: unmanagedBlock.location
    });
  };
  
  return (
    <Stack space="space.100">
      <Text weight="bold">Unmanaged Content Detected</Text>
      <Box xcss={previewStyle}>
        <AdfRenderer document={unmanagedBlock.contentAdf} />
      </Box>
      <Select
        label="Associate with Embed"
        options={embedsOnPage}
        value={targetEmbed}
        onChange={setTargetEmbed}
      />
      <RadioGroup
        label="Insert Position"
        options={[
          { value: 'before', label: 'Before Embed content' },
          { value: 'after', label: 'After Embed content' }
        ]}
        value={insertPosition}
        onChange={setInsertPosition}
      />
      <Button appearance="primary" onClick={handlePromote}>
        Promote to Custom Insertion
      </Button>
    </Stack>
  );
};
```

**Workflow:**

1. User adds manual content on page
2. Redline review detects unmanaged content
3. Reviewer can "promote" it to a Custom Insertion
4. Content moves from page body into Embed's Custom Insertions array
5. Next injection cycle includes it (now tracked and versioned)

**Pros:**
- ✅ Provides path to bring unmanaged content under management
- ✅ Leverages existing Custom Insertions infrastructure
- ✅ Gives reviewers control over what becomes managed

**Cons:**
- ⚠️ Manual promotion step required
- ⚠️ Content must be "moved" (could cause confusion)
- ⚠️ Not all content may fit the Custom Insertion model

---

### Recommended Hybrid Strategy

I recommend combining **Approaches A + D + E**:

1. **Approach A (Marker-Based Boundaries):** Clear markers define what Blueprint "owns"

2. **Approach D (Fingerprinting with Drift Detection):** Detect both modifications to managed content AND additions of unmanaged content

3. **Approach E (Promotion Path):** Provide workflow for bringing unmanaged content under management when appropriate

**Implementation Priority:**

| Phase | Approach | Purpose |
|-------|----------|---------|
| **Phase 1** | A - Markers | Establish clear boundaries |
| **Phase 2** | D - Fingerprinting | Detect drift and unmanaged content |
| **Phase 3** | E - Promotion | Workflow for managing detected content |

**Redline Dashboard Enhancement:**

```jsx
const EnhancedRedlineReview = ({ pageId }) => {
  const { data } = useQuery(['fullPageAnalysis', pageId], 
    () => invoke('analyzePageForRedline', { pageId })
  );
  
  return (
    <Stack space="space.300">
      {/* Managed Embed Content */}
      <Section title="Blueprint-Managed Content">
        {data.managedBlocks.map(block => (
          <EmbedRedlineCard 
            key={block.localId} 
            block={block}
            driftStatus={block.hasDrift ? 'modified' : 'unchanged'}
          />
        ))}
      </Section>
      
      {/* Drift Warnings */}
      {data.driftReport.length > 0 && (
        <Section title="Content Drift Detected">
          <SectionMessage appearance="warning">
            <Text>
              {data.driftReport.filter(d => d.issue === 'CONTENT_MODIFIED').length} 
              managed blocks have been manually modified.
            </Text>
          </SectionMessage>
          {data.driftReport
            .filter(d => d.issue === 'CONTENT_MODIFIED')
            .map(drift => (
              <DriftReviewCard key={drift.localId} drift={drift} />
            ))}
        </Section>
      )}
      
      {/* Unmanaged Content */}
      {data.unmanagedContent.length > 0 && (
        <Section title="Unmanaged Content">
          <SectionMessage appearance="info">
            <Text>
              {data.unmanagedContent.length} sections of content were added 
              outside Blueprint Embeds.
            </Text>
          </SectionMessage>
          {data.unmanagedContent.map((content, idx) => (
            <UnmanagedContentCard 
              key={idx} 
              content={content}
              onPromote={() => openPromotionDialog(content)}
              onAcknowledge={() => acknowledgeUnmanaged(content)}
            />
          ))}
        </Section>
      )}
    </Stack>
  );
};
```

---

---

## Compositor Integration: Chapter-Based Content Model

### Overview

The planned "Compositor" model for Blueprint v2 introduces **chapter-level content management**, where users toggle entire Sources (as Embeds) into or out of their Blueprint. This creates a natural structural boundary that elegantly addresses the content boundary problem.

### Chapter Structure

```
┌─────────────────────────────────────────────────────────────────────────┐
│  BLUEPRINT PAGE                                                         │
│                                                                         │
│  ══════════════════════════════════════════════════════════════════════│
│  CHAPTER 1: Weekly Status Report                                        │
│  ══════════════════════════════════════════════════════════════════════│
│                                                                         │
│  <!-- BLUEPRINT-CHAPTER-START: chapter-1 -->                           │
│  <h2>Weekly Status Report</h2>  ← Injected heading (Source name)       │
│                                                                         │
│  <!-- BLUEPRINT-MANAGED-START: embed-abc123 -->                        │
│  [Injected Source content]                                             │
│  [Variables substituted, toggles applied]                              │
│  <!-- BLUEPRINT-MANAGED-END: embed-abc123 -->                          │
│                                                                         │
│  <!-- BLUEPRINT-CUSTOM-START: chapter-1 -->                            │
│  [Optional: User's custom additions - PRESERVED on re-injection]       │
│  <!-- BLUEPRINT-CUSTOM-END: chapter-1 -->                              │
│                                                                         │
│  <hr class="blueprint-chapter-divider" />  ← Visual demarcator         │
│  <!-- BLUEPRINT-CHAPTER-END: chapter-1 -->                             │
│                                                                         │
│  ══════════════════════════════════════════════════════════════════════│
│  CHAPTER 2: Risk Assessment                                             │
│  ══════════════════════════════════════════════════════════════════════│
│                                                                         │
│  <!-- BLUEPRINT-CHAPTER-START: chapter-2 -->                           │
│  <h2>Risk Assessment</h2>                                              │
│  ...                                                                    │
│  <hr class="blueprint-chapter-divider" />                              │
│  <!-- BLUEPRINT-CHAPTER-END: chapter-2 -->                             │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Insight: Structural Boundaries Solve the Drift Problem

With explicit chapter markers:

1. **BLUEPRINT-MANAGED zone**: Content injected from Source. Replaced entirely on re-injection.
2. **BLUEPRINT-CUSTOM zone**: Content user added manually. PRESERVED on re-injection.
3. **Chapter boundaries**: Heading at top, HR at bottom — clear visual and programmatic demarcation.

Redlining simply parses each chapter and reviews:
- Managed content (from Source, should match expected output)
- Custom content (user additions, needs human review)

---

### The Edit Mode Visibility Problem

**Question:** What does the user see in Edit Mode after content is injected?

**The Issue:** When a page enters Confluence Edit Mode:
1. The Embed macro shows its Edit Mode UI (iframe with preview)
2. The injected content (native Confluence) is ALSO visible and editable
3. User sees content TWICE — once as preview in iframe, once as actual injected content below

```
┌─────────────────────────────────────────────────────────────────────────┐
│  PAGE IN EDIT MODE                                                      │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │  EMBED MACRO (Edit Mode UI)                                       │ │
│  │  ┌─────────────────────────────────────────────────────────────┐ │ │
│  │  │ Variables: [client] [week]                                  │ │ │
│  │  │ Toggles: ☑ Include timeline ☐ Show budget                  │ │ │
│  │  ├─────────────────────────────────────────────────────────────┤ │ │
│  │  │ PREVIEW:                                                    │ │ │
│  │  │ Weekly Status Report                                        │ │ │
│  │  │ Client: Acme Corp                                           │ │ │
│  │  │ ...                                                         │ │ │
│  │  └─────────────────────────────────────────────────────────────┘ │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ← ALSO VISIBLE: Injected content (native, editable)                   │
│  Weekly Status Report                                                   │
│  Client: Acme Corp                                                      │
│  ...                                                                    │
│  ────────────────────────────────────────  ← Chapter divider HR        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**This is confusing UX.** Users don't know which to edit.

---

### Solution Options for Edit Mode

#### Option 1: Hide Injected Content in Edit Mode (RECOMMENDED)

When the Embed macro detects `isEditing === true`, inject a CSS rule or use Forge's DOM access to visually hide the associated injected content block.

**Implementation:**

```javascript
// In EmbedContainer.jsx or injection-resolver.js
useEffect(() => {
  if (isEditing && effectiveLocalId) {
    // Find and hide the injected content block
    const managedStart = document.querySelector(
      `[data-blueprint-managed="${effectiveLocalId}"]`
    );
    if (managedStart) {
      managedStart.style.display = 'none';
    }
    
    // Also hide custom content zone during editing
    const customZone = document.querySelector(
      `[data-blueprint-custom="${chapterId}"]`
    );
    if (customZone) {
      customZone.style.opacity = '0.3';
      customZone.setAttribute('contenteditable', 'false');
    }
  }
  
  return () => {
    // Restore visibility when exiting edit mode
    // ...
  };
}, [isEditing, effectiveLocalId]);
```

**Pros:**
- ✅ Clean Edit Mode UX — user only sees the config UI
- ✅ Injected content reappears automatically in View Mode
- ✅ No content duplication confusion

**Cons:**
- ⚠️ Requires DOM access (may need Custom UI, not Forge UI)
- ⚠️ User can't see injected content while editing

---

#### Option 2: Collapse Pattern with Indicator

Show injected content in a collapsed/minimized state with an indicator:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  [EMBED EDIT UI - Full config interface]                               │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ 📄 Published content (click to expand)                    [▼]   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ───────────────────────────────  ← Chapter divider                    │
└─────────────────────────────────────────────────────────────────────────┘
```

**Implementation:** Wrap injected content in a Confluence `expand` macro during injection.

**Pros:**
- ✅ User knows published content exists
- ✅ Can expand to compare if needed

**Cons:**
- ⚠️ Extra visual noise
- ⚠️ Expand macro adds complexity to injection

---

#### Option 3: Compositor Full-Page Overlay (V2 Native)

In the Compositor model, editing never happens inline. Instead:

1. User clicks "Edit Blueprint" button
2. Full-page Compositor UI overlays the page
3. All chapter configuration happens in Compositor
4. On save, Compositor re-injects all chapters
5. User never directly edits the page content

```
┌─────────────────────────────────────────────────────────────────────────┐
│  COMPOSITOR OVERLAY                                                     │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  CHAPTER MANAGER                                                │   │
│  │                                                                  │   │
│  │  ☑ Chapter 1: Weekly Status Report        [Configure ▼]        │   │
│  │  ☑ Chapter 2: Risk Assessment             [Configure ▼]        │   │
│  │  ☐ Chapter 3: Budget Overview             [+ Add]              │   │
│  │  ☑ Chapter 4: Next Steps                  [Configure ▼]        │   │
│  │                                                                  │   │
│  │  ─────────────────────────────────────────────────────────────  │   │
│  │                                                                  │   │
│  │  CHAPTER 1 CONFIGURATION:                                       │   │
│  │  Variables: [client: Acme Corp] [week: Nov 26]                 │   │
│  │  Toggles: ☑ Include timeline ☐ Show budget                     │   │
│  │  Custom Content: [Edit ✏️] "Added 2 paragraphs"                │   │
│  │                                                                  │   │
│  │  ─────────────────────────────────────────────────────────────  │   │
│  │                                                                  │   │
│  │  [Preview Full Blueprint] [Save & Publish]                      │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Pros:**
- ✅ Cleanest UX — no confusion about what to edit
- ✅ Central control over all chapters
- ✅ Native "Blueprint editing" experience
- ✅ Custom content can be edited within Compositor

**Cons:**
- ⚠️ Bigger implementation lift
- ⚠️ Departure from current inline editing model

---

### Custom Content Preservation on Re-Injection

**Question:** What happens to custom non-injected content when user re-injects?

**Answer:** With the chapter structure above, **custom content is PRESERVED**.

#### Injection Algorithm

```javascript
async function injectChapterContent(pageId, chapterId, embedLocalId, renderedContent) {
  const pageBody = await getPageContent(pageId);
  
  // Find chapter boundaries
  const chapterStart = findMarker(pageBody, `BLUEPRINT-CHAPTER-START: ${chapterId}`);
  const chapterEnd = findMarker(pageBody, `BLUEPRINT-CHAPTER-END: ${chapterId}`);
  
  // Find managed content zone within chapter
  const managedStart = findMarker(pageBody, `BLUEPRINT-MANAGED-START: ${embedLocalId}`);
  const managedEnd = findMarker(pageBody, `BLUEPRINT-MANAGED-END: ${embedLocalId}`);
  
  // Find custom content zone (if exists)
  const customStart = findMarker(pageBody, `BLUEPRINT-CUSTOM-START: ${chapterId}`);
  const customEnd = findMarker(pageBody, `BLUEPRINT-CUSTOM-END: ${chapterId}`);
  
  // Extract existing custom content (PRESERVE THIS)
  let existingCustomContent = '';
  if (customStart && customEnd) {
    existingCustomContent = pageBody.substring(
      customStart.endIndex,
      customEnd.startIndex
    );
  }
  
  // Build new chapter content
  const newChapterContent = `
<!-- BLUEPRINT-CHAPTER-START: ${chapterId} -->
<h2>${chapterHeading}</h2>

<!-- BLUEPRINT-MANAGED-START: ${embedLocalId} -->
${renderedContent}
<!-- BLUEPRINT-MANAGED-END: ${embedLocalId} -->

<!-- BLUEPRINT-CUSTOM-START: ${chapterId} -->
${existingCustomContent}
<!-- BLUEPRINT-CUSTOM-END: ${chapterId} -->

<hr class="blueprint-chapter-divider" data-chapter="${chapterId}" />
<!-- BLUEPRINT-CHAPTER-END: ${chapterId} -->
`;
  
  // Replace entire chapter (preserving custom content)
  const newPageBody = replaceChapter(pageBody, chapterId, newChapterContent);
  
  await updatePage(pageId, newPageBody);
}
```

#### Behavior Matrix

| Scenario | Managed Content | Custom Content |
|----------|-----------------|----------------|
| First injection | Created | Empty zone created |
| Re-injection (Source changed) | Replaced with new | **PRESERVED** |
| Re-injection (variables changed) | Replaced with new | **PRESERVED** |
| User adds custom content | Unchanged | User content exists |
| Re-injection after custom added | Replaced with new | **PRESERVED** |
| Chapter removed via Compositor | Deleted | Deleted (with warning) |

---

### Redlining in Compositor Model

With explicit chapter structure, redlining becomes straightforward:

```javascript
async function analyzeChapterForRedline(pageId, chapterId) {
  const pageBody = await getPageContent(pageId);
  const chapter = extractChapter(pageBody, chapterId);
  
  return {
    chapterId,
    chapterName: chapter.heading,
    
    // Managed content analysis
    managedContent: {
      localId: chapter.embedLocalId,
      currentHash: calculateHash(chapter.managedContent),
      expectedHash: await getExpectedHash(chapter.embedLocalId),
      hasDrift: /* compare hashes */,
      content: chapter.managedContent
    },
    
    // Custom content analysis  
    customContent: {
      hasContent: chapter.customContent.trim().length > 0,
      content: chapter.customContent,
      lastReviewedHash: await getLastReviewedCustomHash(chapterId),
      needsReview: /* hash changed since last review */
    }
  };
}
```

**Redline Dashboard per Chapter:**

```jsx
const ChapterRedlineCard = ({ chapter }) => (
  <Box>
    <Heading level={3}>{chapter.chapterName}</Heading>
    
    {/* Managed Content Status */}
    <Inline space="space.100">
      <Lozenge appearance={chapter.managedContent.hasDrift ? 'moved' : 'success'}>
        {chapter.managedContent.hasDrift ? 'Drift Detected' : 'Matches Source'}
      </Lozenge>
      {chapter.managedContent.hasDrift && (
        <Button onClick={() => showDiff(chapter)}>View Drift</Button>
      )}
    </Inline>
    
    {/* Custom Content Status */}
    {chapter.customContent.hasContent && (
      <Box>
        <Text weight="bold">Custom Content ({chapter.customContent.wordCount} words)</Text>
        <Lozenge appearance={chapter.customContent.needsReview ? 'new' : 'success'}>
          {chapter.customContent.needsReview ? 'Needs Review' : 'Reviewed'}
        </Lozenge>
        <Button onClick={() => reviewCustomContent(chapter)}>
          Review Custom Content
        </Button>
      </Box>
    )}
  </Box>
);
```

---

### Summary: Compositor + Injection Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  COMPOSITOR (Admin/Config Layer)                                       │
│  ├── Defines available Sources/Chapters                                │
│  ├── Page-level chapter toggles (include/exclude)                      │
│  └── Per-chapter configuration (variables, toggles)                    │
│                                                                         │
│       ↓ Save & Publish                                                 │
│                                                                         │
│  INJECTION ENGINE                                                       │
│  ├── Reads Compositor config                                           │
│  ├── Renders each enabled chapter                                      │
│  ├── Injects into page with chapter structure                          │
│  └── Preserves custom content zones                                    │
│                                                                         │
│       ↓ Page Storage                                                   │
│                                                                         │
│  CONFLUENCE PAGE (Native Content)                                       │
│  ├── Chapter 1: [Heading] [Managed] [Custom] [HR]                      │
│  ├── Chapter 2: [Heading] [Managed] [Custom] [HR]                      │
│  └── Chapter N: ...                                                     │
│                                                                         │
│       ↓ Redline Analysis                                               │
│                                                                         │
│  REDLINE SYSTEM                                                         │
│  ├── Parse chapters by markers                                         │
│  ├── Compare managed content vs Source                                 │
│  ├── Flag custom content for review                                    │
│  └── Track approval status per chapter                                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Simplified Compositor: Archetype-Based Blueprint Composition

### Overview

Based on stakeholder refinement, the Compositor is much simpler than originally envisioned. It provides:

1. **Archetype Selection:** Choose a client's league/vertical (NBA, NFL, Racetrack, Theater, etc.) which auto-populates a predefined set of chapters
2. **Chapter Toggles:** Opt individual chapters in/out of the Blueprint
3. **Immediate Injection:** On save, selected chapters are injected directly into the page

### Why This Works Within UI Kit

| Requirement | UI Kit Solution |
|-------------|-----------------|
| Archetype selector | `RadioGroup` or `Select` component |
| Chapter toggle list | `Checkbox` components |
| Optional chapter preview | Expandable sections or `Tabs` |
| Entry point | `confluence:contentBylineItem` + Embed Edit Mode button |
| Overlay UI | `Modal` component (`width="large"`) |

**No Custom UI required.** This fits entirely within the existing UI Kit native rendering architecture.

### Archetype Configuration (Admin-Defined)

Archetypes are defined in Admin and stored in Forge storage:

```javascript
// Storage: archetype-config:{archetypeId}
{
  id: 'nba',
  name: 'NBA Team',
  description: 'Standard Blueprint for NBA franchises',
  chapters: [
    { 
      id: 'onboarding', 
      sourceId: 'excerpt-abc123',  // Canonical Source
      required: true,               // Cannot be deselected
      order: 1
    },
    { 
      id: 'ticketing', 
      sourceId: 'excerpt-def456',
      required: false,
      order: 2
    },
    { 
      id: 'suites-premium', 
      sourceId: 'excerpt-ghi789',
      required: false,
      order: 3,
      defaultToggles: {
        'Include premium seating section': true
      }
    },
    // ... more chapters
  ]
}
```

### Compositor Modal UI

```
┌─────────────────────────────────────────────────────────────────────────┐
│  BLUEPRINT COMPOSITOR                                       [×]        │
│─────────────────────────────────────────────────────────────────────────│
│                                                                         │
│  CLIENT ARCHETYPE                                                       │
│  ────────────────                                                       │
│  Select your client's league/vertical:                                 │
│                                                                         │
│  ● NBA Team                                                            │
│  ○ NFL Team                                                            │
│  ○ Horse Racetrack                                                     │
│  ○ Theater / Performing Arts                                           │
│  ○ Custom (manual chapter selection)                                   │
│                                                                         │
│─────────────────────────────────────────────────────────────────────────│
│                                                                         │
│  CHAPTERS                                     (8 of 12 selected)       │
│  ────────────────                                                       │
│  ☑ Client Onboarding *            (required)     [Preview ▼]          │
│  ☑ Ticketing Configuration                       [Preview ▼]          │
│  ☑ Access Control Setup                          [Preview ▼]          │
│  ☐ Suite & Premium Services                      [Preview ▼]          │
│  ☑ Event Day Operations *         (required)     [Preview ▼]          │
│  ☑ Reporting & Analytics                         [Preview ▼]          │
│  ☐ Mobile App Integration                        [Preview ▼]          │
│  ☑ Support & Escalation *         (required)     [Preview ▼]          │
│                                                                         │
│─────────────────────────────────────────────────────────────────────────│
│                                         [Cancel]  [Apply to Blueprint] │
└─────────────────────────────────────────────────────────────────────────┘
```

### Entry Points

#### 1. Content Byline Item (Primary)

```yaml
# manifest.yml addition
modules:
  confluence:contentBylineItem:
    - key: blueprint-compositor-byline
      title: Configure Blueprint
      resource: compositor-byline-resource
      render: native
      resolver:
        function: resolver
```

Appears in the page byline (near author/date). Opens Compositor Modal.

#### 2. Embed Edit Mode Button (Secondary)

Add subtle button to existing `EmbedEditMode.jsx`:

```jsx
<Button 
  appearance="subtle" 
  onClick={() => openCompositorModal()}
>
  Blueprint Settings
</Button>
```

Both entry points invoke the same modal component.

### Injection Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  1. USER OPENS COMPOSITOR                                              │
│     ├── Via byline button                                              │
│     └── Or via Embed Edit Mode button                                  │
│                                                                         │
│  2. USER SELECTS ARCHETYPE                                             │
│     └── Chapters auto-populate based on archetype definition           │
│                                                                         │
│  3. USER ADJUSTS CHAPTERS (optional)                                   │
│     ├── Uncheck optional chapters to exclude                           │
│     └── Required chapters remain locked                                │
│                                                                         │
│  4. USER CLICKS "APPLY TO BLUEPRINT"                                   │
│     │                                                                   │
│     ▼                                                                   │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  INJECTION ENGINE                                                │  │
│  │                                                                  │  │
│  │  For each selected chapter:                                     │  │
│  │  ├── Get canonical Source from storage                          │  │
│  │  ├── Generate localId for Embed instance                        │  │
│  │  ├── Apply archetype default toggles                            │  │
│  │  ├── Render Source content to storage format                    │  │
│  │  ├── Create chapter structure with markers                      │  │
│  │  └── Save macro-vars:{localId} for Embed config                │  │
│  │                                                                  │  │
│  │  Then:                                                          │  │
│  │  ├── Assemble full page with all chapters                       │  │
│  │  ├── PUT to Confluence REST API                                 │  │
│  │  └── Save compositor-config:{pageId}                            │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  5. PAGE RELOADS                                                       │
│     └── User sees injected chapter content (native Confluence)        │
│                                                                         │
│  6. USER EDITS INDIVIDUAL EMBEDS (existing flow)                       │
│     ├── Click into chapter → Embed Edit Mode opens                     │
│     ├── Set variables, adjust toggles                                  │
│     ├── Auto-save triggers re-injection of that chapter               │
│     └── Staleness detection works as before                            │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Injected Chapter Structure

Each chapter injected into the page follows this structure:

```html
<!-- BLUEPRINT-CHAPTER-START: ticketing -->
<h2>Ticketing Configuration</h2>

<!-- BLUEPRINT-MANAGED-START: embed-abc123 -->
<p>This section covers ticketing setup for <Strong>{{client}}</Strong>...</p>
<table>...</table>
<!-- BLUEPRINT-MANAGED-END: embed-abc123 -->

<!-- BLUEPRINT-CUSTOM-START: ticketing -->
<!-- User's custom additions preserved here -->
<!-- BLUEPRINT-CUSTOM-END: ticketing -->

<hr class="blueprint-chapter-divider" data-chapter="ticketing" />
<!-- BLUEPRINT-CHAPTER-END: ticketing -->
```

### What Changes vs. Current Architecture

| Component | Change Required |
|-----------|-----------------|
| **Embed Edit Mode** | Minimal: Add "Blueprint Settings" button to open Compositor |
| **Embed View Mode** | Minimal: Render from injected content instead of iframe |
| **Staleness Detection** | **None**: Hash comparison still works, just compares against injected content |
| **Admin UI** | Add: Archetype management (define chapters per archetype) |
| **Redlining System** | Minimal: Parse chapters from page instead of from iframe content |
| **Source Management** | **None**: Sources work exactly as before |
| **Storage Schema** | Add: `archetype-config:*`, `compositor-config:*` keys |

### Code Reuse Summary

**Fully Retained (No Changes):**
- `excerpt-resolvers.js` - Source CRUD
- `version-resolvers.js` - Source versioning
- `redline-resolvers.js` - Redline workflow (minor parse changes)
- Staleness detection logic in `EmbedContainer.jsx`
- `VariableConfigPanel.jsx`
- `ToggleConfigPanel.jsx`
- `CustomInsertionsPanel.jsx`
- All ADF rendering utilities

**Enhanced (Minor Additions):**
- `EmbedEditMode.jsx` - Add Compositor button
- `EmbedViewMode.jsx` - Render injected content
- `include-resolvers.js` - Add chapter injection functions
- `admin-page.jsx` - Add Archetype management tab

**New Components:**
- `CompositorModal.jsx` - The Compositor UI
- `compositor-resolvers.js` - Injection logic
- `contentBylineItem` resource - Entry point

---

## Final Architecture: Locked Page Model

### The Core Insight

Once content is injected as native Confluence content, users can edit anywhere — including corrupting markers, modifying managed content, and breaking the chapter structure. The solution: **remove direct page edit access entirely**.

### How It Works

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  CONFLUENCE PAGE (Locked to normal users)                              │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  Only the Forge app (via asApp()) can write to this page.             │
│  Users see the page but cannot click "Edit" in Confluence.            │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ [Edit ✏️]                          ← Embed macro (visible icon) │   │
│  │                                                                  │   │
│  │ <h2>Client Onboarding</h2>         ← Injected heading (TOC-ok)  │   │
│  │                                                                  │   │
│  │ Welcome to the onboarding process for Acme Corp...              │   │
│  │ [All injected content - variables, toggles, custom insertions]  │   │
│  │                                                                  │   │
│  │ ────────────────────────────────── ← Chapter divider            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ [Edit ✏️]                          ← Next chapter               │   │
│  │ <h2>Ticketing Configuration</h2>                                │   │
│  │ ...                                                              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Edit Flow

```
User clicks [Edit ✏️] on a chapter
            ↓
Embed Edit Mode opens (existing EmbedContainer UI)
            ↓
User configures:
├── Variables (Write tab)
├── Toggles (Toggles tab)
├── Custom Insertions (Free Write tab)
└── Internal Notes (Free Write tab)
            ↓
User clicks [Publish to Page]
            ↓
App renders content with all settings applied
            ↓
App injects via PUT /wiki/api/v2/pages/{pageId} (asApp())
            ↓
Page content updated; user sees changes immediately
```

### What This Solves

| Problem | Solution |
|---------|----------|
| Users editing managed content | **Impossible** — page is locked |
| Users corrupting markers | **Impossible** — page is locked |
| Users adding content between chapters | **Impossible** — page is locked |
| Custom content management | Via existing Custom Insertions feature |
| Staleness detection | **Unchanged** — existing hash comparison |
| Redlining | **Unchanged** — existing review system |
| Zone complexity (MANAGED/CUSTOM) | **Eliminated** — no zones needed |

### Permission Model

| Role | Can View Page | Can Edit via Embed UI | Can Edit Page Directly | Can Manage Archetypes |
|------|---------------|----------------------|------------------------|----------------------|
| Regular User | ✅ | ✅ | ❌ | ❌ |
| Admin | ✅ | ✅ | ✅ (emergency) | ✅ |
| Forge App | N/A | N/A | ✅ (via asApp()) | N/A |

### Page Setup Flow

1. **Admin creates page** in Confluence (normal creation)
2. **Admin adds Embed macros** or uses Compositor to set up chapters
3. **Admin locks page** via Confluence page restrictions
4. **Users interact** only via Embed Edit buttons and Compositor
5. **App injects content** on each Publish action

### Key Benefits

1. **Maximum code reuse** — Existing Embed Edit Mode, Custom Insertions, Staleness, Redlining all work unchanged
2. **Clean mental model** — Page content = published Blueprint, edits happen in Embed UI
3. **No hybrid complexity** — Page is 100% Blueprint-managed
4. **Marker integrity** — Users cannot corrupt chapter boundaries
5. **Searchable content** — All injected content is native Confluence, fully indexed

---

## Stakeholder Decisions (Resolved)

The following questions were answered by the project stakeholder on 2025-11-26:

### 1. Redline Strictness
**Decision:** Publishing/injection happens on **explicit user action** (clicking Publish). Redlining is asynchronous and does not gate publication.

**Rationale:** Redlining is for quality assurance and manager review, not for controlling what readers see.

### 2. Redline ↔ Publication Relationship  
**Decision:** Redlining has **no bearing** on content appearance. It is purely a QA/review process.

### 3. Stale Content in View Mode
**Decision:** The Embed macro is **invisible by default**, but becomes visible when staleness is detected — showing the Update Available banner and diff view.

### 4. Version Management
**Decision:** Rely entirely on **Confluence's built-in page history**. No separate Blueprint-managed version snapshots for injected Embed content.

### 5. Embed Macro Placement
**Decision:** Macro placed **before** chapter content. Heading is injected as native content so Confluence TOC macro can parse it.

### 6. Draft Visibility
**Decision:** Only **explicitly published** content appears on page. Auto-saved drafts remain private in Forge Storage until user clicks Publish.

### 7. First-Time Publish (New Chapter)
**Decision:** Show **placeholder message** ("Under Construction") until first publish. Avoids displaying incomplete content with unset variables/toggles.

### 8. Chapter Removal
**Decision:** Confirmation dialog with warning. Remind user that removed content can be recovered via Confluence page history.

### 9. Custom Content on Chapter Removal
**Decision:** Custom content is deleted with the chapter. Same confirmation dialog and page history reminder.

### 10. Archetype Updates
**Decision:** Manual only. Users discover archetype changes when they open Compositor. No auto-propagation to existing Blueprints.

### 11. Staleness Detection Scope
**Decision:** Compare Source content hash against last-published hash. **Existing staleness detection works unchanged.**

### 12. Page Edit Model (Critical Decision)
**Decision:** Pages are **locked to normal users**. All editing happens via Embed UI. Only the Forge app (via `asApp()`) can write to the page.

**Rationale:** This prevents users from corrupting markers, editing managed content directly, or adding untracked content. Custom content is managed via existing Custom Insertions feature.

---

## Technical Notes

### Content Marker Format

Using unique markers per Embed ensures multiple Embeds on one page don't interfere:

```html
<!-- BLUEPRINT-CONTENT-START-{localId} -->
[rendered content here]
<!-- BLUEPRINT-CONTENT-END-{localId} -->
```

### ADF to Storage Conversion

The existing `convertAdfToStorage` function in `injection-resolver.js` handles this via Confluence's REST API:

```javascript
const response = await api.asApp().requestConfluence(
  route`/wiki/rest/api/contentbody/convert/storage`,
  {
    method: 'POST',
    body: JSON.stringify({
      value: JSON.stringify(adfContent),
      representation: 'atlas_doc_format'
    })
  }
);
```

### Permissions Required

The manifest already includes necessary permissions:
- `read:confluence-content.all`
- `write:confluence-content`
- `write:page:confluence`

---

**Document Signature:**  
Model: Claude Opus 4 (claude-opus-4-20250514)  
Generated: 2025-11-26T20:35:00Z  
**Revised: 2025-11-26T20:55:00Z** (Added Content Boundary Problem section, incorporated stakeholder decisions)  
Context: Review of CUSTOM_UI_COMPOSITOR_ARCHITECTURE.md  
Task: Develop content injection architecture proposals for Blueprint App

---

## Revision History

| Date | Author | Changes |
|------|--------|---------|
| 2025-11-26 20:35 | Claude Opus 4 | Initial proposal with 5 approaches |
| 2025-11-26 20:55 | Claude Opus 4 | Added Content Boundary Problem section with 5 sub-approaches; incorporated stakeholder decisions |
| 2025-11-26 21:10 | Claude Opus 4 | Added Compositor Integration section: chapter-based content model, Edit Mode visibility solutions, custom content preservation algorithm, redlining per chapter |
| 2025-11-26 21:45 | Claude Opus 4 | Added Simplified Compositor section: archetype-based composition, UI Kit Modal approach, code reuse analysis |
| 2025-11-26 22:30 | Claude Opus 4 | **Final architecture decision:** Locked Page Model. All 12 stakeholder questions resolved. Explicit Publish model (not auto-inject). Page locked to users; app owns writes. |
| 2025-12-01 | Claude Opus 4.5 | **Implementation update:** HTML comment markers (`<!-- BLUEPRINT-CHAPTER-START -->`) are stripped by Confluence during page save. Implemented Content Properties macro boundaries (`ac:name="details"` with `hidden=true` parameter) instead. This is the Confluence-sanctioned way to persist invisible boundary markers. |

---

## Implementation Note (2025-12-01)

The chapter boundary approach documented in this proposal (HTML comment markers) was discovered to not work in practice—Confluence strips HTML comments from page storage during save operations.

**Final Implementation:** Content Properties macros (Confluence's `details` macro) with the `hidden=true` parameter:
- START boundary: `<ac:structured-macro ac:name="details"><ac:parameter ac:name="hidden">true</ac:parameter><ac:parameter ac:name="id">blueprint-start-{localId}</ac:parameter>...`
- END boundary: `<ac:structured-macro ac:name="details"><ac:parameter ac:name="hidden">true</ac:parameter><ac:parameter ac:name="id">blueprint-end-{localId}</ac:parameter>...`

This approach:
- Uses an officially supported Confluence macro with a documented `hidden` parameter
- Reliably persists across page saves
- Stores the Embed's `localId` in the `id` parameter for detection
- Is invisible to users but findable by the injection engine

Additionally, the Section macro wrapper was removed from body content entirely. Content is now injected as plain paragraphs, enabling inline comments (Redline system) on all content, not just headings.

---

*This document is intended for review by future model versions and human collaborators. The proposals represent my best analysis given the constraints and goals articulated. I acknowledge uncertainty about Confluence platform internals and recommend validation of key assumptions through prototyping.*

