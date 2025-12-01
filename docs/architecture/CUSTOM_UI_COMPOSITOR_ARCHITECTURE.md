# Custom UI Compositor Architecture (Future Consideration)

**Status:** Concept / Not Implemented
**Decision Point:** Revisit after current architecture is stable and real-world performance data is collected
**Last Updated:** 2025-01-27

---

## Overview

This document captures a potential "nuclear option" architectural redesign: migrating from multiple Forge UI macros to a single Custom UI application that renders an entire Blueprint as a compositor interface.

## Current Architecture (v7.15.0)

**50 Embeds = 50 separate Forge UI iframes**
- Each Embed is an independent macro with its own iframe
- Each runs Forge UI (React components serialized to Confluence host)
- Limited performance control (no IntersectionObserver, no direct DOM access)
- Configuration stored per `localId` in Forge storage
- Inline positioning handled by Confluence

**Performance Limitations:**
- No viewport-based lazy loading (Forge UI doesn't expose DOM refs)
- 50 iframes = 50 initialization cycles
- Staleness checks must be deferred (2-3s delay) to avoid blocking
- Each Embed independently fetches and renders

## Proposed Architecture: Single Custom UI Compositor

### Core Concept

Replace 50 inline Embeds with a **single Custom UI application** that:
1. Fetches all Source data once
2. Renders the entire Blueprint in one iframe
3. Uses an "assembly tool" Edit Mode for configuration
4. Provides full performance control via direct DOM access

### High-Level Flow

```
┌─────────────────────────────────────────────┐
│  Confluence Page (View Mode)               │
│                                             │
│  ┌────────────────────────────────────┐   │
│  │  Custom UI App (Single iframe)     │   │
│  │                                      │   │
│  │  ┌──────────────────────────────┐  │   │
│  │  │  Embed #1 Content            │  │   │
│  │  └──────────────────────────────┘  │   │
│  │  ┌──────────────────────────────┐  │   │
│  │  │  Embed #2 Content            │  │   │
│  │  └──────────────────────────────┘  │   │
│  │  ...                                │   │
│  │  ┌──────────────────────────────┐  │   │
│  │  │  Embed #50 Content           │  │   │
│  │  └──────────────────────────────┘  │   │
│  └────────────────────────────────────┘   │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  Edit Mode: Compositor Interface           │
│                                             │
│  ┌────────────────────────────────────┐   │
│  │  📋 Available Sources               │   │
│  │  ☐ Client Intake Process            │   │
│  │  ☐ Project Kickoff Checklist        │   │
│  │  ☑ Weekly Status Report             │   │
│  │  ...                                 │   │
│  └────────────────────────────────────┘   │
│                                             │
│  ┌────────────────────────────────────┐   │
│  │  🎯 Blueprint Composition           │   │
│  │  1. [Weekly Status Report] 🔽       │   │
│  │     Variables: client, week         │   │
│  │     Toggles: [x] Include timeline   │   │
│  │  2. [+ Add Source]                  │   │
│  └────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

## Edit Mode: Compositor Interface

### Source Selection Panel
```
┌──────────────────────────────────┐
│ Available Blueprint Standards    │
│                                  │
│ Search: [______________] 🔍     │
│                                  │
│ Categories:                      │
│ ☐ All                           │
│ ☐ Client Onboarding             │
│ ☑ Project Management            │
│ ☐ Legal                         │
│                                  │
│ ☐ Client Intake Process         │
│ ☐ SOW Template                  │
│ ☑ Weekly Status Report          │
│ ☐ Kickoff Checklist             │
│ ☐ Risk Assessment               │
└──────────────────────────────────┘
```

### Composition Builder (Drag & Drop)
```
┌────────────────────────────────────────────┐
│ Blueprint Composition                      │
│                                            │
│ [1] Weekly Status Report          ☰ 🗑️   │
│     └─ Variables                           │
│        client: [{{client}}___________]     │
│        week:   [{{week}}_____________]     │
│     └─ Toggles                             │
│        [x] Include project timeline        │
│        [ ] Show budget details             │
│     └─ Custom Paragraphs                   │
│        Before: (empty)                     │
│        After: (empty)                      │
│                                            │
│ [2] Risk Assessment Matrix        ☰ 🗑️   │
│     └─ Variables                           │
│        client:   [{{client}}__________]    │
│        project:  [{{project}}_________]    │
│     └─ Toggles                             │
│        [x] Include mitigation plan         │
│                                            │
│ [+ Add Source]                             │
│                                            │
│ [Preview] [Save Configuration]             │
└────────────────────────────────────────────┘
```

### Configuration Storage Format
```javascript
{
  compositorVersion: "1.0.0",
  blueprintId: "unique-id",
  sources: [
    {
      order: 1,
      sourceId: "excerpt-123",
      variables: {
        client: "Acme Corp",
        week: "Week of 11/9/2025"
      },
      toggles: {
        "Include project timeline": true,
        "Show budget details": false
      },
      customInsertions: [],
      internalNotes: []
    },
    {
      order: 2,
      sourceId: "excerpt-456",
      variables: {
        client: "Acme Corp",
        project: "Website Redesign"
      },
      toggles: {
        "Include mitigation plan": true
      },
      customInsertions: [],
      internalNotes: []
    }
  ]
}
```

## View Mode: Performance Optimizations

### Lazy Loading with IntersectionObserver
```javascript
// ✅ WORKS in Custom UI (has real DOM access)
import { useIntersectionObserver } from './hooks/use-intersection-observer';

const EmbedRenderer = ({ source, config }) => {
  const [ref, isVisible] = useIntersectionObserver({
    threshold: 0.1,
    rootMargin: '200px',
    triggerOnce: true
  });

  return (
    <div ref={ref}>
      {isVisible ? (
        <RenderedSource source={source} config={config} />
      ) : (
        <Skeleton height="200px" />
      )}
    </div>
  );
};
```

### Shared State & Caching
```javascript
// Single React Query instance for entire Blueprint
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      cacheTime: 1000 * 60 * 30
    }
  }
});

// Pre-fetch all Sources used in Blueprint
const { data: allSources } = useQueries(
  config.sources.map(s => ({
    queryKey: ['source', s.sourceId],
    queryFn: () => fetchSource(s.sourceId)
  }))
);
```

### Virtual Scrolling (Optional for 100+ Embeds)
```javascript
import { useVirtualizer } from '@tanstack/react-virtual';

const VirtualizedBlueprint = ({ sources }) => {
  const parentRef = useRef();

  const virtualizer = useVirtualizer({
    count: sources.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 400,
    overscan: 5
  });

  return (
    <div ref={parentRef} style={{ height: '100vh', overflow: 'auto' }}>
      {virtualizer.getVirtualItems().map(virtualRow => (
        <RenderedSource
          key={virtualRow.index}
          source={sources[virtualRow.index]}
        />
      ))}
    </div>
  );
};
```

### Priority-Based Lazy Loading with URL Hash Support

**Critical Feature:** Deep linking to specific sections in long documents with intelligent priority loading.

**The Problem:** When users share URLs with hash fragments (e.g., `#section-50`), traditional lazy loading loads content top-to-bottom, meaning sections 1-49 must load before the target section is visible. This creates a poor user experience where the target content isn't immediately available.

**The Solution:** Within the Custom UI iframe, we have full DOM control, allowing us to implement priority-based lazy loading that:
1. Detects URL hash fragments on mount
2. Loads target section immediately (highest priority)
3. Loads adjacent sections next (medium priority)
4. Lazy loads remaining sections as user scrolls (low priority)

**Key Advantage:** Forge controls when the iframe loads, but inside the iframe we have complete control over rendering priorities, IntersectionObserver, and scroll behavior.

#### URL Hash Detection & Deep Linking

```javascript
const BlueprintCompositor = ({ sources, config }) => {
  const [targetSectionId, setTargetSectionId] = useState(null);
  const [loadedSections, setLoadedSections] = useState(new Set());

  // Parse URL hash on mount
  useEffect(() => {
    const hash = window.location.hash.slice(1); // Remove #
    if (hash) {
      setTargetSectionId(hash);
      
      // Immediately load target section
      setLoadedSections(prev => new Set([...prev, hash]));
      
      // Scroll to target after render
      setTimeout(() => {
        const element = document.getElementById(hash);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  }, []);
  
  // ... rest of component
};
```

#### Priority-Based Section Loading Hook

```javascript
const usePriorityLazyLoad = (sources, targetSectionId) => {
  const [loadedSections, setLoadedSections] = useState(new Set());
  const [loadingQueue, setLoadingQueue] = useState([]);

  useEffect(() => {
    if (!targetSectionId) {
      // Normal lazy loading - top to bottom
      return;
    }

    // Phase 1: Load target section immediately
    setLoadedSections(prev => new Set([...prev, targetSectionId]));

    // Phase 2: Find target index and load adjacent sections
    const targetIndex = sources.findIndex(s => s.id === targetSectionId);
    const adjacentSections = [
      sources[targetIndex - 1],
      sources[targetIndex + 1],
      sources[targetIndex - 2],
      sources[targetIndex + 2]
    ].filter(Boolean);

    // Load adjacent sections with medium priority
    adjacentSections.forEach(section => {
      setLoadedSections(prev => new Set([...prev, section.id]));
    });

    // Phase 3: Queue remaining sections for lazy loading
    const remaining = sources.filter(s => 
      s.id !== targetSectionId && 
      !adjacentSections.includes(s)
    );
    setLoadingQueue(remaining);
  }, [sources, targetSectionId]);

  return { loadedSections, loadingQueue };
};
```

#### IntersectionObserver with Priority

```javascript
const usePriorityIntersectionObserver = (targetSectionId) => {
  const [visibleSections, setVisibleSections] = useState(new Set());

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          const sectionId = entry.target.dataset.sectionId;
          if (entry.isIntersecting) {
            setVisibleSections(prev => new Set([...prev, sectionId]));
          }
        });
      },
      {
        rootMargin: '200px', // Start loading 200px before visible
        threshold: 0.1
      }
    );

    // Observe all sections
    document.querySelectorAll('[data-section-id]').forEach(el => {
      // Skip target section if already loaded
      if (el.id !== targetSectionId) {
        observer.observe(el);
      }
    });

    return () => observer.disconnect();
  }, [targetSectionId]);

  return visibleSections;
};
```

#### Complete Component Pattern

```javascript
const BlueprintCompositor = ({ sources, config }) => {
  // 1. Detect URL hash
  const targetSectionId = useMemo(() => {
    const hash = window.location.hash.slice(1);
    return hash || null;
  }, []);

  // 2. Priority loading logic
  const { loadedSections, loadingQueue } = usePriorityLazyLoad(
    sources, 
    targetSectionId
  );

  // 3. IntersectionObserver for remaining sections
  const visibleSections = usePriorityIntersectionObserver(targetSectionId);

  // 4. Determine what to render
  const shouldRenderSection = (sectionId) => {
    // Always render target section
    if (sectionId === targetSectionId) return true;
    
    // Render if loaded via priority
    if (loadedSections.has(sectionId)) return true;
    
    // Render if visible in viewport
    if (visibleSections.has(sectionId)) return true;
    
    return false;
  };

  return (
    <div className="blueprint-compositor">
      {sources.map((source, index) => {
        const shouldRender = shouldRenderSection(source.id);
        
        return (
          <div
            key={source.id}
            id={source.id}
            data-section-id={source.id}
            className="blueprint-section"
          >
            {shouldRender ? (
              <RenderedSource source={source} config={config[source.id]} />
            ) : (
              <SectionSkeleton height={400} />
            )}
          </div>
        );
      })}
    </div>
  );
};
```

#### Table of Contents with Hash Links

```javascript
const TableOfContents = ({ sources }) => {
  const handleLinkClick = (sectionId) => {
    // Update URL hash
    window.location.hash = sectionId;
    
    // Scroll to section (works inside iframe!)
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <nav className="table-of-contents">
      {sources.map(source => (
        <a
          key={source.id}
          href={`#${source.id}`}
          onClick={(e) => {
            e.preventDefault();
            handleLinkClick(source.id);
          }}
        >
          {source.name}
        </a>
      ))}
    </nav>
  );
};
```

#### Performance Benefits of Priority Loading

| Scenario | Traditional Lazy Load | Priority-Based Load | Improvement |
|----------|---------------------|---------------------|-------------|
| **Deep link to section 50** | Loads 1-49 first (~5-10s) | Target loads immediately (~0.1s) | **98% faster** |
| **Adjacent sections** | Load sequentially | Load in parallel with target | **50% faster** |
| **User experience** | Blank/loading state | Target visible immediately | **Dramatically better** |

**Key Benefits:**
- ✅ Target section loads immediately (0ms delay)
- ✅ Adjacent sections load next (200-500ms)
- ✅ Remaining sections lazy load as user scrolls
- ✅ URL sharing works perfectly
- ✅ Full control over caching, batching, etc.
- ✅ Works within Custom UI iframe (full DOM access)

#### Integration with Compositor Architecture

This priority loading strategy integrates seamlessly with the single Custom UI iframe approach:

```javascript
// From compositor architecture - now with priority loading!
const BlueprintCoordinator = () => {
  const { sources, config } = useBlueprintConfig();
  const targetSectionId = useMemo(() => 
    window.location.hash.slice(1), []
  );

  // Priority-based rendering
  const renderOrder = useMemo(() => {
    if (!targetSectionId) return sources;
    
    const target = sources.find(s => s.id === targetSectionId);
    const others = sources.filter(s => s.id !== targetSectionId);
    
    // Target first, then others
    return target ? [target, ...others] : sources;
  }, [sources, targetSectionId]);

  return (
    <PriorityLazyLoader 
      sources={renderOrder}
      targetSectionId={targetSectionId}
      config={config}
    />
  );
};
```

**Architecture Advantage:** The iframe boundary gives us full control inside it. Forge only controls when the iframe loads; everything inside (IntersectionObserver, priority loading, URL hash parsing, scroll behavior) is ours to optimize. This aligns perfectly with the architecture document's vision of "full performance control via direct DOM access."

## Realistic Performance Benefits

### Current Architecture (50 Forge UI Embeds)
- **Initial Load:** ~5-10 seconds (all 50 iframes initialize)
- **With Deferred Staleness:** ~2-3 seconds (content renders, checks delayed)
- **Staleness Checks:** 50 separate API calls (spread over 2-3s with jitter)
- **Memory:** 50 React instances, 50 Forge UI contexts
- **Optimization Ceiling:** Limited by Forge UI constraints

### Custom UI Compositor (Single App)
- **Initial Load:** ~1-2 seconds (single iframe initialization)
- **With Lazy Loading:** ~0.5-1 second (only render visible Embeds)
- **Viewport-based:** Off-screen Embeds don't initialize until scrolled into view
- **Shared Fetching:** Single batch API call for all Source data
- **Staleness Checks:** Centralized, can be parallelized efficiently
- **Memory:** 1 React instance, shared state, dramatically lower footprint

### Performance Comparison Table

| Metric | Current (50 Forge UI) | Compositor (Custom UI) | Improvement |
|--------|----------------------|------------------------|-------------|
| **Initial Render** | 5-10s | 0.5-1s | **80-90% faster** |
| **Visible Content** | 2-3s (deferred) | 0.5-1s (lazy load) | **60-75% faster** |
| **Memory Usage** | ~50 React instances | 1 React instance | **~98% reduction** |
| **API Calls** | 50 (parallel) | 1-3 (batched) | **94-98% reduction** |
| **Staleness Checks** | 50 separate | 1 batch | **98% reduction** |
| **Scroll Performance** | N/A (all loaded) | Smooth (lazy) | **New capability** |

### Real-World Scenarios

#### Scenario 1: 50 Embeds, All Visible
- **Current:** 2-3s initial render + 2-3s staleness checks = **~5s total**
- **Compositor:** 0.5s app init + 0.5s batch fetch = **~1s total**
- **Improvement:** **80% faster**

#### Scenario 2: 50 Embeds, 10 Initially Visible
- **Current:** Still loads all 50 = **5s**
- **Compositor:** Only renders 10 visible = **0.5s**
- **Improvement:** **90% faster**

#### Scenario 3: 150 Embeds (Edge Case)
- **Current:** Would be unusable = **30-60s+**
- **Compositor:** Lazy + virtual scrolling = **1-2s**
- **Improvement:** **95%+ faster**

## Technical Considerations

### Raw Content Injection Approach (Hybrid Model)

**The Breakthrough:** Custom UI can inject rendered HTML directly into Confluence page DOM, **bypassing iframes entirely** for View Mode.

**Reference Implementation:** See `src/resolvers/poc-injection-resolver.js` for a proof-of-concept that demonstrates injecting content directly into Confluence page body via REST API. This POC validates the core injection mechanism and serves as a foundation for the desired ideal implementation.

```
┌─────────────────────────────────────────────┐
│  Confluence Page                            │
│                                             │
│  <div id="blueprint-container-123">        │
│    <!-- Injected ADF/HTML from Custom UI  │
│         rendered content -->               │
│    <h2>Weekly Status Report</h2>          │
│    <p>Client: Acme Corp</p>               │
│    <table>...</table>                     │
│  </div>                                    │
│                                             │
│  <div id="blueprint-container-456">       │
│    <h2>Risk Assessment</h2>               │
│    ...                                     │
│  </div>                                    │
│                                             │
│  [Hidden iframe: Custom UI Coordinator]    │
└─────────────────────────────────────────────┘
```

#### How It Works

1. **Edit Mode:** Compositor interface in Custom UI (or lightweight Forge macro)
2. **Configuration Saved:** Blueprint composition stored in Forge storage
3. **View Mode:**
   - Page loads with placeholder `<div>` elements (one per Source in Blueprint)
   - Hidden Custom UI iframe initializes
   - Custom UI:
     - Fetches Blueprint configuration
     - Renders all Sources (with lazy loading, caching, etc.)
     - Uses `postMessage` + DOM manipulation to inject HTML into placeholders
   - Result: Native Confluence content, no visible iframes

#### Technical Implementation

```javascript
// Custom UI app (hidden iframe)
const BlueprintCoordinator = () => {
  const { sources, config } = useBlueprintConfig();

  useEffect(() => {
    sources.forEach((source, index) => {
      const targetDiv = window.parent.document.getElementById(
        `blueprint-container-${source.id}`
      );

      if (targetDiv) {
        // Render Source content
        const renderedHTML = renderSourceToHTML(source, config);

        // Inject into page DOM
        targetDiv.innerHTML = renderedHTML;

        // Add event listeners if needed
        attachInteractiveElements(targetDiv, source.id);
      }
    });
  }, [sources, config]);

  return <div>Coordinator active</div>;
};
```

#### Benefits

✅ **No iframe positioning issues** - Content is native to page
✅ **Zero iframe overhead** in View Mode - Single hidden coordinator
✅ **Perfect layout integration** - Flows with Confluence content
✅ **All Custom UI benefits** - Lazy loading, IntersectionObserver, batched fetching
✅ **Searchable content** - Injected HTML is in page DOM, searchable by Ctrl+F
✅ **Copy/paste works** - Users can select/copy content normally
✅ **Print-friendly** - No iframe print issues

#### Challenges

⚠️ **Security:** DOM manipulation from iframe requires careful CSP handling
⚠️ **Confluence Updates:** Changes to page structure could break injection
⚠️ **Event Handling:** Interactive elements (buttons, etc.) need postMessage coordination
⚠️ **Staleness UI:** Update Available banner needs coordination with parent DOM
⚠️ **SSR/Export:** Confluence exports might not include injected content

#### Enhanced Performance Profile

| Metric | Current | Compositor Only | **Compositor + Injection** |
|--------|---------|-----------------|---------------------------|
| Initial Load | 5-10s | 1-2s | **0.5-1s** (no iframe render) |
| Visible Content | 2-3s | 0.5-1s | **0.3-0.5s** (direct DOM) |
| Scroll Perf | N/A | Good | **Native** (no iframe) |
| Memory | 50 iframes | 1 iframe | **1 hidden iframe** |
| Layout Jank | Medium | Low | **None** (native flow) |

### Module Type Requirements

Custom UI apps need a module location. Options:

### Page Rewrite Approach (Most Radical - Zero Runtime Overhead)

**The Ultimate Vision:** Edit Mode is a full-page compositor, View Mode has **ZERO app involvement** - just native Confluence content.

**Note:** A proof-of-concept implementation exists in `src/resolvers/poc-injection-resolver.js` that demonstrates the core concept of injecting rendered content directly into Confluence page body via REST API. This POC validates the technical feasibility of the page rewrite approach and serves as a reference implementation for the desired ideal architecture.

```
┌──────────────────────────────────────────┐
│  EDIT MODE                               │
│  (Full-page Custom UI iframe)           │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │  Blueprint Compositor Interface    │ │
│  │                                    │ │
│  │  [Source Selection Panel]         │ │
│  │  [Drag & Drop Builder]            │ │
│  │  [Variable Configuration]         │ │
│  │  [Preview]                        │ │
│  │                                    │ │
│  │  [Save & Publish] ←───────────────┼─┼─ Triggers page update
│  └────────────────────────────────────┘ │
└──────────────────────────────────────────┘
                    ↓
        Confluence REST API Call:
        PUT /wiki/rest/api/content/{pageId}
        Body: Rendered ADF document
                    ↓
┌──────────────────────────────────────────┐
│  VIEW MODE                               │
│  (Native Confluence page - NO APP!)     │
│                                          │
│  <h2>Weekly Status Report</h2>         │
│  <p>Client: Acme Corp</p>              │
│  <p>Week: 11/9/2025</p>                │
│  <table>...</table>                     │
│                                          │
│  <h2>Risk Assessment Matrix</h2>       │
│  <table>...</table>                     │
│                                          │
│  [Edit Blueprint] ←─ Button to re-open │
│                      compositor         │
└──────────────────────────────────────────┘
```

#### How It Works

1. **View Mode:**
   - Page contains native ADF content (rendered Embeds)
   - Small "Edit Blueprint" button (lightweight Forge macro)
   - **Zero app overhead** - just Confluence rendering ADF
   - **Perfect performance** - native browser rendering

2. **Edit Mode:**
   - Click "Edit Blueprint" → Opens full-page Custom UI compositor
   - Compositor:
     - Fetches current page content via API
     - Parses existing Blueprint structure
     - Shows drag-and-drop interface for composition
     - Real-time preview with variable substitution
   - On Save:
     - Renders all Sources with configurations
     - Assembles complete ADF document
     - Writes to page body via `PUT /wiki/rest/api/content/{pageId}`
     - Closes compositor → back to View Mode

3. **Version Control:**
   - Confluence native page history captures every save
   - Can revert via Confluence's built-in version control
   - Blueprint configuration stored separately in Forge storage (for re-editing)

#### Technical Implementation

```javascript
// Custom UI Compositor App
const BlueprintCompositor = () => {
  const { pageId } = useParams();
  const [sources, setSources] = useState([]);
  const [config, setConfig] = useState({});

  const handleSave = async () => {
    // 1. Render all Sources with configurations
    const renderedSources = sources.map(s =>
      renderSourceToADF(s, config[s.id])
    );

    // 2. Assemble complete ADF document
    const adfDocument = {
      version: 1,
      type: 'doc',
      content: [
        // Optional: Add metadata/edit button
        {
          type: 'extension',
          attrs: {
            extensionType: 'com.atlassian.ecosystem',
            extensionKey: 'blueprint-edit-button',
            parameters: { blueprintId: '...' }
          }
        },
        // Rendered Sources as native ADF
        ...renderedSources
      ]
    };

    // 3. Write to Confluence page body
    await fetch(`/wiki/rest/api/content/${pageId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        version: { number: currentVersion + 1 },
        body: {
          atlas_doc_format: {
            value: JSON.stringify(adfDocument)
          }
        }
      })
    });

    // 4. Save configuration for re-editing
    await invoke('saveBlueprintConfig', {
      pageId,
      sources,
      config
    });

    // 5. Close compositor, redirect to page
    window.location.href = `/wiki/spaces/.../${pageId}`;
  };

  return <CompositorUI onSave={handleSave} />;
};
```

```javascript
// Lightweight "Edit Blueprint" button (Forge UI macro)
const EditBlueprintButton = () => {
  const context = useProductContext();
  const pageId = context.contentId;

  const handleEdit = () => {
    // Open compositor in new window/tab
    window.open(`/forge/custom-ui/compositor?pageId=${pageId}`, '_blank');
  };

  return (
    <Button appearance="primary" onClick={handleEdit}>
      Edit Blueprint
    </Button>
  );
};
```

#### Benefits

✅ **Zero runtime overhead** - View Mode has NO app code running
✅ **Native Confluence performance** - Just browser rendering ADF
✅ **Perfect SEO** - Content is in page body, fully indexable
✅ **Print/Export works** - Native Confluence export
✅ **Copy/paste perfect** - Native browser selection
✅ **Version control** - Confluence page history
✅ **No iframe issues** - No iframes in View Mode at all
✅ **Offline capable** - Page works without Forge

#### Challenges

⚠️ **Edit Mode UX shift** - Users must "enter" compositor mode
⚠️ **Loss of inline editing** - Can't edit individual Embeds inline
⚠️ **Staleness detection** - Page content is static, no auto-update
⚠️ **Concurrent edits** - Needs conflict resolution if multiple editors
⚠️ **Migration** - Existing macros → static content is one-way
⚠️ **Re-composition** - Editing requires parsing page content back to Sources

#### Enhanced Staleness Model

Since content is static, need alternative approach:

**Option 1: Scheduled Checks**
- Forge scheduled function runs nightly
- Checks all pages for stale Blueprint content
- Notifies page owners via email

**Option 2: On-Demand Check**
- "Check for Updates" button in Edit mode
- Compares saved config against current Sources
- Shows diff before updating

**Option 3: Hybrid**
- Most content is static
- "Update Available" banner injected via web panel
- Click banner → opens compositor with suggested updates

#### Ultimate Performance Profile

| Metric | Current | Compositor + Injection | **Page Rewrite** |
|--------|---------|------------------------|------------------|
| View Mode Load | 5-10s | 0.5-1s | **0.1-0.2s** (native!) |
| Runtime Overhead | 50 iframes | 1 hidden iframe | **ZERO** |
| Memory Usage | High | Medium | **Negligible** |
| SEO/Search | Poor | Good | **Perfect** |
| Print/Export | Poor | Good | **Perfect** |
| Offline | No | No | **YES** |

#### When to Use This Approach

✅ **Best For:**
- Static or semi-static Blueprints (updated weekly/monthly)
- Maximum performance requirements
- SEO/discoverability critical
- Large pages (100+ Embeds)
- Organizations with established edit workflows

❌ **Not Ideal For:**
- Frequently updated content (daily changes)
- Users who expect inline editing
- Real-time collaboration
- Content that needs dynamic updates

#### Option A: Hidden Web Panel + Raw Injection (RECOMMENDED for Raw Injection)
```yaml
modules:
  confluence:macro:
    - key: blueprint-compositor-macro
      title: Blueprint Standard - Compositor
      description: Renders entire Blueprint with optimized performance
      render: native
      resolver:
        function: compositor-resolver
      resource: compositor-static

resources:
  - key: compositor-static
    path: static/compositor
```

**Pros:**
- Still inline on page
- Single macro = single configuration point
- Maintains existing mental model

**Cons:**
- Still an iframe (but only 1 instead of 50)
- Configuration UI more complex

#### Option B: Web Panel + Hidden Macros
```yaml
modules:
  confluence:webPanel:
    - key: blueprint-panel
      location: atl.general
      render: native
      resource: compositor-static
```

**Approach:**
- Keep lightweight Forge UI macros for Edit Mode config
- Hide them in View Mode (CSS: `display: none`)
- Panel scans page for macro configs via postMessage
- Panel renders everything

**Pros:**
- Keeps existing Edit Mode UX
- Panel can be full-page overlay
- Graceful fallback if panel fails

**Cons:**
- More complex coordination
- Depends on postMessage reliability

### Design System & UI Considerations

#### SeatGeek Uniform Design System

When implementing the Custom UI Compositor, consideration should be given to utilizing a well-established design system to ensure consistent styling, modern UI components, and streamlined development. **SeatGeek Uniform** (https://uniform.seatgeek.com/) presents a compelling option for this purpose.

**Potential Benefits:**
- **Consistent Styling:** Pre-defined design tokens, typography, colors, and spacing ensure visual consistency across the compositor interface
- **Pre-built Components:** Ready-to-use UI components (buttons, forms, panels, etc.) can accelerate development of the Edit Mode compositor interface
- **Modern Design Standards:** Established design patterns and best practices that align with contemporary user expectations
- **Reduced Custom Development:** Less time spent on building and maintaining custom UI components from scratch
- **Accessibility:** Design systems typically include accessibility considerations built into their components

**Implementation Considerations:**
- Evaluate Uniform's component library against the specific needs of the compositor interface (source selection panels, drag-and-drop builders, variable configuration forms)
- Assess compatibility with Forge Custom UI constraints and React framework requirements
- Consider customization needs vs. design system constraints
- Review licensing and usage terms for commercial applications

**Alternative Approaches:**
- Build custom components aligned with Confluence's design language
- Use Atlassian Design System (ADS) if available for Custom UI
- Hybrid approach: Uniform for compositor interface, native styles for embedded content

This design system consideration should be evaluated during the prototype phase to determine if it provides sufficient value to justify integration.

## Content Demarcation and Accessibility

### Overview

This section outlines potential solutions for demarcating the beginnings and ends of injected content blocks in the Custom UI Compositor architecture. Clear demarcation is essential for:
- Accessibility (screen reader navigation)
- Content identification and management
- Debugging and troubleshooting
- User understanding of content boundaries

### Potential Solutions

#### 1. HTML Comments (Current Approach)

**Implementation:**
```html
<!-- BLUEPRINT-APP-START-${localId} -->
[injected content]
<!-- BLUEPRINT-APP-END-${localId} -->
```

**Pros:**
- Simple and lightweight
- Already implemented in `injection-resolver.js`
- No visual impact
- Easy to parse programmatically

**Cons:**
- Not accessible to screen readers
- Invisible to users (can't see boundaries)
- May be stripped by some Confluence operations
- No semantic meaning

#### 2. Visually Hidden Component (Atlassian Design System)

**Reference:** [Atlassian Design System - Visually Hidden Component](https://atlassian.design/components/visually-hidden/examples)

**Implementation:**
```jsx
import { VisuallyHidden } from '@atlaskit/visually-hidden';

// At the start of injected content
<VisuallyHidden>
  <span>Start of Blueprint content: {excerptName}</span>
</VisuallyHidden>
[injected content]
<VisuallyHidden>
  <span>End of Blueprint content: {excerptName}</span>
</VisuallyHidden>
```

**Pros:**
- ✅ **Accessibility-first:** Content is hidden visually but fully accessible to screen readers
- ✅ **Semantic boundaries:** Screen reader users receive clear auditory cues about content structure
- ✅ **Standards-compliant:** Uses established Atlassian Design System component
- ✅ **User experience:** Improves navigation for assistive technology users
- ✅ **No visual clutter:** Maintains clean visual appearance
- ✅ **Flexible content:** Can include descriptive text (excerpt name, source info, etc.)

**Cons:**
- Requires Atlassian Design System dependency
- Slightly more complex than HTML comments
- May need to be converted to ADF format for native injection

**Use Cases:**
- Marking boundaries of injected content blocks
- Providing context to screen reader users about content source
- Improving accessibility of compositor-generated content
- Supporting navigation through complex document structures

**Implementation Considerations:**
- For native ADF injection: Convert VisuallyHidden component to appropriate ADF nodes
- For Custom UI rendering: Use component directly in React tree
- For raw HTML injection: Use equivalent CSS classes with `sr-only` pattern

**Example ADF Representation:**
```json
{
  "type": "paragraph",
  "marks": [
    {
      "type": "data-consumer",
      "attrs": {
        "data-visually-hidden": true
      }
    }
  ],
  "content": [
    {
      "type": "text",
      "text": "Start of Blueprint content: Weekly Status Report"
    }
  ]
}
```

#### 3. Semantic HTML Elements with ARIA Labels

**Implementation:**
```html
<section aria-label="Blueprint content: Weekly Status Report" data-blueprint-start="${localId}">
  [injected content]
</section>
```

**Pros:**
- Semantic HTML structure
- ARIA labels for accessibility
- Can be styled if needed
- Data attributes for programmatic access

**Cons:**
- Visible wrapper element (unless hidden with CSS)
- May affect layout/flow
- More verbose than comments

#### 4. Heading-Based Demarcation

**Implementation:**
```html
<h2 data-blueprint-marker="start" data-excerpt-id="${excerptId}">
  📄 {excerptName}
</h2>
[injected content]
<h2 data-blueprint-marker="end" data-excerpt-id="${excerptId}">
  End of {excerptName}
</h2>
```

**Pros:**
- Visible to all users
- Creates clear visual boundaries
- Can be styled consistently
- Supports document structure

**Cons:**
- Takes up visual space
- May not be desired for all use cases
- Could interfere with document outline

#### 5. Hybrid Approach: Visually Hidden + Semantic Wrapper

**Implementation:**
```jsx
<section 
  aria-label={`Blueprint content: ${excerptName}`}
  data-blueprint-container={localId}
>
  <VisuallyHidden>
    <span>Start of Blueprint content: {excerptName}</span>
  </VisuallyHidden>
  [injected content]
  <VisuallyHidden>
    <span>End of Blueprint content: {excerptName}</span>
  </VisuallyHidden>
</section>
```

**Pros:**
- Combines accessibility (VisuallyHidden) with semantic structure
- Programmatically identifiable via data attributes
- Screen reader friendly
- Maintains clean visual appearance

**Cons:**
- More complex implementation
- Requires both component and wrapper

### Recommended Approach

**Primary Recommendation: Visually Hidden Component**

The Visually Hidden component from Atlassian Design System provides the best balance of:
- Accessibility compliance
- Zero visual impact
- Standards-based implementation
- User experience enhancement

**Implementation Strategy:**
1. Use VisuallyHidden component in Custom UI rendering
2. For native ADF injection, convert to appropriate ADF structure with accessibility attributes
3. Include descriptive text (excerpt name, source information) in hidden markers
4. Maintain HTML comments as fallback for programmatic identification

**Example Implementation:**
```jsx
// In Custom UI Compositor
const InjectedContentBlock = ({ excerpt, localId, content }) => {
  return (
    <>
      <VisuallyHidden>
        <span>Start of Blueprint content: {excerpt.name} (Source: {excerpt.id})</span>
      </VisuallyHidden>
      {/* HTML comment for programmatic access */}
      {/* BLUEPRINT-APP-START-${localId} --> */}
      {content}
      {/* <!-- BLUEPRINT-APP-END-${localId} --> */}
      <VisuallyHidden>
        <span>End of Blueprint content: {excerpt.name}</span>
      </VisuallyHidden>
    </>
  );
};
```

### Accessibility Benefits

Using Visually Hidden markers provides:
- **Screen reader navigation:** Users can jump between content blocks
- **Context awareness:** Users understand where Blueprint content begins/ends
- **Document structure:** Clear boundaries improve comprehension
- **WCAG compliance:** Supports accessibility standards

### Next Steps

1. Evaluate Atlassian Design System availability in Custom UI context
2. Prototype VisuallyHidden component integration
3. Test with screen readers (NVDA, JAWS, VoiceOver)
4. Document ADF conversion strategy for native injection
5. Update injection resolvers to include accessibility markers

### Migration Path

1. **Phase 1: Prototype** (1-2 weeks)
   - Build basic Custom UI compositor
   - Support 1-3 Sources
   - Validate performance gains
   - Test Edit Mode UX

2. **Phase 2: Feature Parity** (3-4 weeks)
   - Implement all current features
   - Variables, toggles, custom paragraphs, internal notes
   - Staleness detection
   - Update Available banner & diff view

3. **Phase 3: Migration** (2-3 weeks)
   - Dual mode support (Forge UI + Custom UI)
   - Data migration scripts
   - User testing & feedback

4. **Phase 4: Deprecation** (1-2 weeks)
   - Remove old Forge UI macros
   - Final cleanup

**Total Estimated Effort:** 7-10 weeks

### Risks & Challenges

#### High Risk
- **Edit Mode UX Complexity:** Compositor interface is fundamentally different from current inline editing
- **Positioning Issues:** Single iframe can't perfectly replicate Confluence's inline flow layout
- **Migration Complexity:** Converting 50 macros → 1 config per page is non-trivial
- **User Retraining:** Existing users need to learn new Edit Mode

#### Medium Risk
- **Custom UI Maintenance:** More code to maintain vs. Forge UI
- **Confluence Updates:** Changes to page structure could break compositor
- **iframe Limitations:** Even Custom UI has sandboxing restrictions

#### Low Risk
- **Performance:** Custom UI will definitely be faster (this is proven)
- **Feature Parity:** All current features are implementable

## Decision Criteria

### Revisit Custom UI Compositor If:

✅ **Strong Signals to Proceed:**
- Current deferred staleness checks provide <20% improvement
- Users regularly have 100+ Embeds on pages
- Page load times are a major complaint
- Market competitors offer faster rendering

❌ **Signals to Stay with Current:**
- Deferred staleness gives 30-40%+ improvement (sufficient)
- Typical pages have <30 Embeds
- Edit Mode UX is highly valued
- Development resources are limited

### Quantitative Thresholds

| Metric | Current Target | Custom UI Justification Threshold |
|--------|----------------|----------------------------------|
| Typical Embed Count | <30 | >50 per page |
| Page Load (50 Embeds) | ~2-3s | >5s consistently |
| User Complaints | Low | High volume |
| Performance ROI | 30-40% gain | Need 50%+ gain |

## Conclusion

The Custom UI Compositor architecture is **technically sound** and would provide **significant performance benefits** (80-90% faster load times with lazy loading).

**However**, it requires:
- Major architectural rewrite
- 7-10 weeks of development
- User retraining on Edit Mode
- Ongoing maintenance complexity

**Recommendation:**
- **Now:** Deploy deferred staleness checks (v7.15.0 ✅)
- **Next:** Measure real-world performance with users
- **Then:** Revisit this architecture if performance remains a blocker

**When to Revisit:**
- After 2-4 weeks of production data with deferred staleness
- If <30% improvement observed
- If users request/need 100+ Embeds per page
- If market requires competitive performance advantage

---

## Implementation Update (2025-12-01)

The content boundary approaches discussed in this document (HTML comments, VisuallyHidden components) were discovered to not work in practice—Confluence strips HTML comments and custom HTML attributes from page storage.

**Final Implementation:** Content Properties macros (Confluence's `details` macro) with the `hidden=true` parameter are used as chapter boundary markers. This is the only reliable way to persist invisible boundary markers in Confluence storage format.

See `src/utils/storage-format-utils.js` for the current `buildBoundaryMarker()` implementation.

---

**Related Documents:**
- TODO.md - Current roadmap
- PERFORMANCE_TEST_GUIDE.md - Testing methodology
- docs/status/KNOWN_ISSUES.md - Current limitations

**Contact:** Document author/maintainer information here
