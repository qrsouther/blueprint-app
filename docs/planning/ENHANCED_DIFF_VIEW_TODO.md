# Enhanced Diff View Implementation Plan

**Goal:** Replace current "apples to oranges" diff with meaningful side-by-side comparison that shows ALL changes, including content in disabled toggles, with proper visual distinction.

**Status:** Not Started

---

## Overview

Current diff view compares:
- LEFT: Rendered content with variables substituted
- RIGHT: Raw source with `{{variable}}` tags

This makes it impossible to see actual changes.

**New diff view will compare:**
- LEFT: Old Source rendered with current variable values (including disabled toggles in gray)
- RIGHT: New Source rendered with current variable values (including disabled toggles in gray)

**Key Innovation:** Disabled toggle content is shown in both sides (gray italic text) so users can see changes even in content they're not currently using.

---

## Phase 1: Storage Schema Update

### 1.1 Add `syncedContent` to Storage

**File:** `src/resolvers/include-resolvers.js`

**Change:** Update `saveVariableValues()` to store actual Source content, not just hash.

**Before:**
```javascript
const excerpt = await storage.get(`excerpt:${excerptId}`);
const syncedContentHash = excerpt?.contentHash || null;

await storage.set(key, {
  excerptId,
  variableValues,
  toggleStates: toggleStates || {},
  customInsertions: customInsertions || [],
  internalNotes: internalNotes || [],
  updatedAt: now,
  lastSynced: now,
  syncedContentHash  // Only storing hash
});
```

**After:**
```javascript
const excerpt = await storage.get(`excerpt:${excerptId}`);
const syncedContentHash = excerpt?.contentHash || null;
const syncedContent = excerpt?.content || null;  // NEW: Store actual content

await storage.set(key, {
  excerptId,
  variableValues,
  toggleStates: toggleStates || {},
  customInsertions: customInsertions || [],
  internalNotes: internalNotes || [],
  updatedAt: now,
  lastSynced: now,
  syncedContentHash,
  syncedContent  // NEW: Store Source ADF at sync time
});
```

**Why:** We need old Source content to compare against new Source content.

**Impact:** Storage size increases by ~5-20KB per Include (acceptable, necessary for feature).

---

## Phase 2: Install Dependencies

### 2.1 Install react-diff-viewer

```bash
npm install react-diff-viewer
```

**Package Info:**
- Downloads: ~300K/week
- Size: ~30KB minified
- Purpose: Beautiful word-level diff with green/red highlighting

---

## Phase 3: Create Ghost Mode Rendering Functions

### 3.1 Create `renderContentWithGhostToggles()`

**File:** `src/utils/adf-rendering-utils.js`

**Purpose:** Render ADF with ALL content visible (including disabled toggles), but mark disabled content for styling.

**Function Signature:**
```javascript
export function renderContentWithGhostToggles(adfContent, variableValues, toggleStates) {
  // 1. Apply variable substitutions
  let rendered = substituteVariablesInAdf(adfContent, variableValues);

  // 2. DON'T filter out disabled toggles - instead, mark them with metadata
  rendered = markDisabledToggleBlocks(rendered, toggleStates);

  return rendered;
}
```

**Key Difference from Current Rendering:**
- Current: `filterContentByToggles()` removes disabled toggle blocks entirely
- New: `markDisabledToggleBlocks()` keeps them but adds `data-disabled-toggle: true` attribute

### 3.2 Create `markDisabledToggleBlocks()`

**File:** `src/utils/adf-rendering-utils.js`

**Purpose:** Walk ADF tree and add metadata to disabled toggle blocks.

**Implementation:**
```javascript
function markDisabledToggleBlocks(adfContent, toggleStates) {
  function processNode(node) {
    if (!node) return node;

    const processedNode = { ...node };

    // Check if this is a toggle block
    if (node.type === 'expand' && node.attrs?.title?.startsWith('{{toggle:')) {
      const toggleName = node.attrs.title.match(/\{\{toggle:([^}]+)\}\}/)?.[1];
      const isDisabled = !toggleStates[toggleName];

      if (isDisabled) {
        processedNode.attrs = {
          ...processedNode.attrs,
          'data-disabled-toggle': true,
          'data-toggle-name': toggleName
        };
      }
    }

    // Recursively process children
    if (processedNode.content && Array.isArray(processedNode.content)) {
      processedNode.content = processedNode.content.map(processNode);
    }

    return processedNode;
  }

  return processNode(adfContent);
}
```

### 3.3 Create `extractTextWithToggleMarkers()`

**File:** `src/utils/adf-rendering-utils.js`

**Purpose:** Convert ADF to plain text with visual markers for toggles.

**Implementation:**
```javascript
export function extractTextWithToggleMarkers(adfContent, toggleStates) {
  let text = '';

  function processNode(node) {
    if (node.type === 'paragraph') {
      const paragraphText = node.content
        ?.map(c => c.text || '')
        .join('');
      text += paragraphText + '\n';
    }

    if (node.type === 'expand') {
      const toggleName = node.attrs?.title?.match(/\{\{toggle:([^}]+)\}\}/)?.[1];
      const isDisabled = !toggleStates[toggleName];

      // Add visual marker
      if (isDisabled) {
        text += `\n🔲 [DISABLED TOGGLE: ${toggleName}]\n`;
      } else {
        text += `\n✓ [ENABLED TOGGLE: ${toggleName}]\n`;
      }

      // Process content inside toggle
      node.content?.forEach(processNode);

      // Close marker
      if (isDisabled) {
        text += `🔲 [END DISABLED TOGGLE]\n\n`;
      } else {
        text += `✓ [END ENABLED TOGGLE]\n\n`;
      }

      return;
    }

    // Recursively process children
    node.content?.forEach(processNode);
  }

  processNode(adfContent);
  return text;
}
```

**Output Example:**
```
Welcome to our service.

✓ [ENABLED TOGGLE: premium-features]
Premium features include advanced analytics.
✓ [END ENABLED TOGGLE]

🔲 [DISABLED TOGGLE: enterprise-options]
Enterprise options include SSO integration.
🔲 [END DISABLED TOGGLE]
```

---

## Phase 4: Create Visual ADF Renderer with Gray Styling

### 4.1 Create `AdfRendererWithGhostToggles` Component

**File:** `src/components/AdfRendererWithGhostToggles.jsx` (NEW FILE)

**Purpose:** Render ADF with visual distinction for disabled toggles (gray italic text).

**Implementation:**
```javascript
import React from 'react';
import { Box, Text, Em, Strong, Lozenge, xcss } from '@forge/react';
import { extractTextFromNode } from '../utils/adf-rendering-utils';

// Styles
const disabledToggleStyle = xcss({
  opacity: '0.5',
  borderLeft: '3px dashed',
  borderColor: 'color.border',
  paddingLeft: 'space.200',
  marginBlock: 'space.100',
  backgroundColor: 'color.background.neutral'
});

const grayContentStyle = xcss({
  color: 'color.text.subtlest',
  fontStyle: 'italic'
});

const enabledToggleStyle = xcss({
  borderLeft: '3px solid',
  borderColor: 'color.border.success',
  paddingLeft: 'space.200',
  marginBlock: 'space.100'
});

export function AdfRendererWithGhostToggles({ content, toggleStates }) {
  function renderNode(node, key) {
    if (!node) return null;

    if (node.type === 'paragraph') {
      return (
        <Text key={key}>
          {node.content?.map((child, idx) => {
            if (child.type === 'text') {
              let textNode = child.text;
              if (child.marks?.some(m => m.type === 'strong')) {
                textNode = <Strong>{textNode}</Strong>;
              }
              if (child.marks?.some(m => m.type === 'em')) {
                textNode = <Em>{textNode}</Em>;
              }
              return <span key={idx}>{textNode}</span>;
            }
            return null;
          })}
        </Text>
      );
    }

    if (node.type === 'expand') {
      const toggleName = node.attrs?.title?.match(/\{\{toggle:([^}]+)\}\}/)?.[1];
      const isDisabled = node.attrs?.['data-disabled-toggle'] || !toggleStates[toggleName];

      return (
        <Box
          key={key}
          xcss={isDisabled ? disabledToggleStyle : enabledToggleStyle}
        >
          <Box xcss={xcss({ marginBottom: 'space.100' })}>
            <Text>
              {isDisabled ? '🔲' : '✓'}{' '}
              <Em>{toggleName}</Em>
              {' '}
              {isDisabled && <Lozenge appearance="removed">Not in your version</Lozenge>}
            </Text>
          </Box>
          <Box xcss={isDisabled ? grayContentStyle : undefined}>
            {node.content?.map((child, idx) => renderNode(child, idx))}
          </Box>
        </Box>
      );
    }

    if (node.type === 'panel') {
      return (
        <Box
          key={key}
          xcss={xcss({
            borderLeft: '3px solid',
            borderColor: 'color.border.information',
            paddingLeft: 'space.200',
            marginBlock: 'space.100',
            backgroundColor: 'color.background.information'
          })}
        >
          {node.content?.map((child, idx) => renderNode(child, idx))}
        </Box>
      );
    }

    // Handle other node types recursively
    if (node.content && Array.isArray(node.content)) {
      return (
        <Box key={key}>
          {node.content.map((child, idx) => renderNode(child, idx))}
        </Box>
      );
    }

    return null;
  }

  return (
    <Box>
      {content?.content?.map((node, idx) => renderNode(node, idx))}
    </Box>
  );
}
```

---

## Phase 5: Create Enhanced Diff View Component

### 5.1 Create `EnhancedDiffView` Component

**File:** `src/components/EnhancedDiffView.jsx` (NEW FILE)

**Purpose:** Main diff component that combines text diff + visual preview.

**Implementation:**
```javascript
import React from 'react';
import { Box, Stack, Heading, Text, Em, Inline, Strong, xcss } from '@forge/react';
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer';
import { AdfRendererWithGhostToggles } from './AdfRendererWithGhostToggles';
import {
  renderContentWithGhostToggles,
  extractTextWithToggleMarkers
} from '../utils/adf-rendering-utils';

const diffBoxStyle = xcss({
  width: '48%',
  padding: 'space.200',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderColor: 'color.border',
  borderRadius: 'border.radius'
});

const oldVersionBoxStyle = xcss({
  ...diffBoxStyle,
  borderColor: 'color.border.warning'
});

const newVersionBoxStyle = xcss({
  ...diffBoxStyle,
  borderColor: 'color.border.success'
});

export function EnhancedDiffView({
  oldSourceContent,    // Old ADF from Source (stored at last sync)
  newSourceContent,    // New ADF from Source (current)
  variableValues,      // Current user's variable values
  toggleStates         // Current user's toggle states
}) {

  // Render BOTH versions with ALL content visible (ghost mode)
  const oldRenderedFull = renderContentWithGhostToggles(
    oldSourceContent,
    variableValues,
    toggleStates
  );

  const newRenderedFull = renderContentWithGhostToggles(
    newSourceContent,
    variableValues,
    toggleStates
  );

  // Convert to text for diff highlighting
  const oldText = extractTextWithToggleMarkers(oldRenderedFull, toggleStates);
  const newText = extractTextWithToggleMarkers(newRenderedFull, toggleStates);

  return (
    <Stack space="space.300">
      {/* Text diff with word-level highlighting */}
      <Box>
        <Heading size="small">Changes in This Update</Heading>
        <Box xcss={xcss({ marginBottom: 'space.100' })}>
          <Text>
            <Em>
              Normal text shows content you're currently using.
              🔲 Gray text shows disabled toggle blocks (changes may exist there too).
            </Em>
          </Text>
        </Box>
        <ReactDiffViewer
          oldValue={oldText}
          newValue={newText}
          splitView={true}
          compareMethod={DiffMethod.WORDS}
          useDarkTheme={false}
          leftTitle="Your Current Version"
          rightTitle="Updated Version Available"
        />
      </Box>

      {/* Visual side-by-side with ADF rendering */}
      <Box>
        <Heading size="small">Visual Preview</Heading>
        <Inline space="space.200" spread="space-between" alignBlock="start">
          <Box xcss={oldVersionBoxStyle}>
            <Box xcss={xcss({ marginBottom: 'space.100' })}>
              <Text><Strong>Your Current Version</Strong></Text>
            </Box>
            <AdfRendererWithGhostToggles
              content={oldRenderedFull}
              toggleStates={toggleStates}
            />
          </Box>
          <Box xcss={newVersionBoxStyle}>
            <Box xcss={xcss({ marginBottom: 'space.100' })}>
              <Text><Strong>Updated Version Available</Strong></Text>
            </Box>
            <AdfRendererWithGhostToggles
              content={newRenderedFull}
              toggleStates={toggleStates}
            />
          </Box>
        </Inline>
      </Box>
    </Stack>
  );
}
```

---

## Phase 6: Update Embed Display to Use Enhanced Diff

### 6.1 Update Staleness Check in `embed-display.jsx`

**File:** `src/embed-display.jsx`

**Change:** Store both old and new Source content when staleness is detected.

**Add new state variables:**
```javascript
const [oldSourceContent, setOldSourceContent] = useState(null);
const [newSourceContent, setNewSourceContent] = useState(null);
```

**Update staleness check effect (around line 440):**
```javascript
useEffect(() => {
  const checkStaleness = async () => {
    if (!content || isEditing || !selectedExcerptId || !effectiveLocalId) return;

    try {
      // Get the Include's saved configuration (includes syncedContentHash and syncedContent)
      const varsResult = await invoke('getVariableValues', {
        localId: effectiveLocalId
      });

      // Get the current Source excerpt
      const excerptResult = await invoke('getExcerpt', {
        excerptId: selectedExcerptId
      });

      if (!varsResult.success || !excerptResult.success) return;

      const syncedContentHash = varsResult.syncedContentHash;
      const syncedContent = varsResult.syncedContent;  // NEW: Old content
      const sourceContentHash = excerptResult.excerpt?.contentHash;

      // Compare hashes
      const stale = syncedContentHash && sourceContentHash &&
                    syncedContentHash !== sourceContentHash;

      setIsStale(stale);
      setSourceLastModified(excerptResult.excerpt.updatedAt);
      setIncludeLastSynced(varsResult.lastSynced);

      // If stale, store BOTH old and new content for diff
      if (stale) {
        setOldSourceContent(syncedContent);           // NEW: Old Source ADF
        setNewSourceContent(excerptResult.excerpt.content);  // NEW: New Source ADF
      }
    } catch (err) {
      console.error('[Include] Staleness check error:', err);
    }
  };

  checkStaleness();
}, [content, isEditing, selectedExcerptId, effectiveLocalId]);
```

### 6.2 Update `getVariableValues` Resolver

**File:** `src/resolvers/simple-resolvers.js`

**Change:** Return `syncedContent` along with other variables.

**Find the `getVariableValues` function and update return statement:**
```javascript
return {
  success: true,
  excerptId: data.excerptId,
  variableValues: data.variableValues || {},
  toggleStates: data.toggleStates || {},
  customInsertions: data.customInsertions || [],
  internalNotes: data.internalNotes || [],
  lastSynced: data.lastSynced,
  syncedContentHash: data.syncedContentHash,
  syncedContent: data.syncedContent  // NEW: Return old content for diff
};
```

### 6.3 Replace Current Diff View

**File:** `src/embed-display.jsx`

**Find the diff view rendering section (around line 900) and replace with:**

```javascript
{showDiff && oldSourceContent && newSourceContent && (
  <Box xcss={xcss({ marginTop: 'space.200' })}>
    <EnhancedDiffView
      oldSourceContent={oldSourceContent}
      newSourceContent={newSourceContent}
      variableValues={variableValues}
      toggleStates={toggleStates}
    />
    <Box xcss={xcss({ marginTop: 'space.200' })}>
      <Button appearance="primary" onClick={handleCloseDiff}>
        Close Diff View
      </Button>
    </Box>
  </Box>
)}
```

**Add import at top of file:**
```javascript
import { EnhancedDiffView } from './components/EnhancedDiffView';
```

---

## Phase 7: Testing & Validation

### 7.1 Test Scenarios

1. **Basic Content Change**
   - Update a Source excerpt's plain text
   - Verify diff shows green (additions) and red (deletions)
   - Verify visual preview shows both versions

2. **Variable Changes**
   - Update Source with different variable references
   - Verify diff renders with user's current variable values in BOTH sides
   - Verify changes are visible

3. **Disabled Toggle Content Changes**
   - Update content inside a toggle that user has DISABLED
   - Verify diff shows 🔲 markers around changed content
   - Verify both sides show gray italic text for disabled toggle
   - **Critical:** Verify user can SEE the change even though toggle is disabled

4. **Enabled Toggle Content Changes**
   - Update content inside a toggle that user has ENABLED
   - Verify diff shows ✓ markers
   - Verify content appears normally (not grayed out)

5. **Mixed Changes**
   - Update both regular content AND disabled toggle content
   - Verify ALL changes are visible
   - Verify disabled content is visually distinguished

6. **No Changes in User's Version**
   - Update ONLY disabled toggle content (nothing in enabled sections)
   - Verify user still sees "Update Available" banner
   - Verify diff clearly shows "change is in disabled toggle"
   - **This solves the "looks identical but isn't" problem**

### 7.2 Edge Cases

- Include with NO toggles (should work like regular diff)
- Include with ALL toggles disabled (should show all changes in gray)
- Source with nested toggles (toggle inside toggle)
- Very long content (verify performance)
- Storage migration (old Includes without syncedContent)

---

## Phase 8: Storage Migration (If Needed)

**Issue:** Existing Includes don't have `syncedContent` stored.

**Options:**

1. **Lazy Migration** (Recommended)
   - When checking staleness, if `syncedContent` is missing, show simple banner: "Update available (diff unavailable for this update)"
   - Next time user updates, `syncedContent` gets stored
   - Future updates will have full diff support

2. **Proactive Migration**
   - Create migration resolver that fetches current Source for all Includes
   - Store as `syncedContent` (treating current as "old" for next update)
   - Run once on deploy

**Recommendation:** Use lazy migration to avoid complex migration script.

---

## Success Criteria

✅ Users can see word-level diff with green/red highlighting
✅ Users can see visual side-by-side comparison
✅ Changes in disabled toggles ARE visible (grayed out)
✅ No "false identical" diffs when changes exist in disabled content
✅ Clear visual distinction between enabled/disabled toggle content
✅ Bundle size increase is acceptable (<50KB)
✅ Performance is good (diff renders in <500ms)

---

## Effort Estimate

- **Phase 1 (Storage):** 1 hour
- **Phase 2 (Dependencies):** 15 minutes
- **Phase 3 (Ghost Functions):** 2-3 hours
- **Phase 4 (Visual Renderer):** 2-3 hours
- **Phase 5 (Diff Component):** 2 hours
- **Phase 6 (Integration):** 2 hours
- **Phase 7 (Testing):** 2-3 hours
- **Phase 8 (Migration):** 30 minutes

**Total: 12-15 hours** (1.5-2 days of focused work)

---

## Dependencies

- `react-diff-viewer` (npm package)
- Existing ADF utils (`substituteVariablesInAdf`, etc.)
- Existing Forge React components

---

## Rollback Plan

If something goes wrong:
1. Revert `include-resolvers.js` changes (remove `syncedContent` storage)
2. Revert `embed-display.jsx` to use old diff view
3. Remove new component files
4. Uninstall `react-diff-viewer`

Old diff view code is preserved in git history and can be restored.

---

## Future Enhancements (Not in Scope)

- Collapse/expand individual toggle sections in diff
- Highlight variable names differently in diff
- Show custom insertions/internal notes in diff
- Export diff as PDF
- "Accept Selected Changes" (cherry-pick mode)

---

## Questions to Resolve Before Starting

1. ✅ Does storage schema support additional field? (YES - Forge storage is schema-less JSON)
2. ✅ Will bundle size be acceptable? (YES - react-diff-viewer is only ~30KB)
3. ✅ Should we migrate existing Includes? (NO - lazy migration on next update)
4. Do we need to show custom insertions/internal notes in diff? (TBD)

---

## Implementation Notes

- Use `renderContentWithGhostToggles()` instead of `filterContentByToggles()` ONLY for diff view
- Regular rendering still uses `filterContentByToggles()` to hide disabled content
- Ghost mode is a "peek behind the curtain" feature for informed decision-making
- Gray styling must be obvious but not distracting
- Text diff and visual preview serve different purposes (both valuable)
