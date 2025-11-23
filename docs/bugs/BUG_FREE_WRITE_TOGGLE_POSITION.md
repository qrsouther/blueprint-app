# Bug: Free Write Paragraph Insertion Position with Enabled Toggles

> **⚠️ ARCHIVED** - This bug has been resolved. Code references in this document may be outdated due to refactoring. This document is kept for historical reference and root cause analysis.

**Status:** ✅ FIXED
**Date Discovered:** 2025-10-30
**Date Fixed:** 2025-11-22
**Discovered During:** Phase 2 refactoring testing
**Priority:** Medium
**GitHub Issue:** #2

## Problem

When a toggle is enabled and the user attempts to insert a Free Write paragraph at the END of that toggle's text content, the custom paragraph is incorrectly appended to the END of the entire Include macro content instead of being inserted at the position the user selected (which should be directly after the toggle content).

## Expected Behavior

If a Source macro has this content:
```
Paragraph 1: Hello world

{{toggle:advanced}}
Paragraph 2: This is advanced content
{{/toggle:advanced}}

Paragraph 3: Final paragraph
```

And the user selects "After paragraph 2" in the Free Write tab dropdown and adds custom text "My custom insertion", the result should be:
```
Paragraph 1: Hello world

{{toggle:advanced}}
Paragraph 2: This is advanced content
{{/toggle:advanced}}

My custom insertion

Paragraph 3: Final paragraph
```

**Important:** The custom paragraph should appear **after** the toggle block (outside the `{{/toggle:advanced}}` marker), not inside it. This ensures the custom paragraph is always visible regardless of toggle state.

## Actual Behavior

The custom paragraph gets inserted at the very end:
```
Paragraph 1: Hello world

{{toggle:advanced}}
Paragraph 2: This is advanced content
{{/toggle:advanced}}

Paragraph 3: Final paragraph

My custom insertion
```

## Root Cause Analysis

**Root cause:** The paragraph extraction and insertion logic was processing content in the wrong order. When toggles were filtered FIRST (before custom paragraph insertion), the paragraph index mapping became misaligned with the original document structure.

**The Problem:**
- **Buggy order:** Filter toggles → Substitute variables → Insert custom paragraphs
- When toggles were filtered first, the document structure changed, causing paragraph indices to be calculated incorrectly
- Custom paragraphs were then inserted at the wrong position (end of document)

**The Fix:**
- **Fixed order:** Substitute variables → Insert custom paragraphs → Filter toggles
- By inserting custom paragraphs BEFORE toggle filtering, the insertion logic works on the original structure (with toggle markers intact)
- This allows correct paragraph position calculation, and the custom paragraph is inserted at the right location
- Toggle filtering then preserves the insertion outside the toggle block

**Relevant Code:**
- `src/components/CustomInsertionsPanel.jsx` - Extract paragraphs from original content before toggle filtering
- `src/EmbedContainer.jsx` - Insert custom paragraphs before toggle filtering (3 locations)
- `src/hooks/embed-hooks.js` - Insert custom paragraphs before toggle filtering
- `src/components/admin/RedlineQueueCard.jsx` - Insert custom paragraphs before toggle filtering

## Steps to Reproduce

1. Create a Source macro with toggle content:
   ```
   Hello world

   {{toggle:advanced}}
   This is advanced content
   {{/toggle:advanced}}

   Final paragraph
   ```

2. Create an Include macro referencing that Source
3. Open the Include in Edit mode
4. Go to the Toggles tab and enable the "advanced" toggle
5. Go to the Free Write tab
6. Select "After paragraph 2: This is advanced content" from the dropdown
7. Enter custom text: "My custom insertion"
8. Click "Add Custom Paragraph"
9. Observe the Preview

**Result:** Custom paragraph appears at the end of the entire content, not after paragraph 2

## Impact

- **User Experience:** Medium - Users can still add custom paragraphs, but position is incorrect
- **Functionality:** Medium - Feature works but produces unexpected results
- **Workaround:** Users can manually edit content or insert at different positions

## Fix Implementation

**Files Modified:**
1. `src/components/CustomInsertionsPanel.jsx` - Extract paragraphs from original content (before toggle filtering)
2. `src/EmbedContainer.jsx` - Changed order of operations in 3 locations:
   - `getPreviewContent()` - Preview content generation
   - `getRawPreviewContent()` - Raw preview for diff view
   - Fresh content generation for view mode
3. `src/hooks/embed-hooks.js` - Changed order in cached content generation
4. `src/components/admin/RedlineQueueCard.jsx` - Changed order in admin preview

**Change Summary:**
Changed the order of ADF processing operations from:
- ❌ Filter toggles → Substitute variables → Insert custom paragraphs
- ✅ Substitute variables → Insert custom paragraphs → Filter toggles

**Testing:**
✅ Tested and verified - Custom paragraphs now appear in the correct position (after toggle blocks, outside toggle markers) and remain visible regardless of toggle state.

## Resolution

**Status:** ✅ FIXED and TESTED
**Resolution Date:** 2025-11-22
**Verification:** Custom paragraphs correctly inserted after toggle blocks, outside toggle markers, ensuring they remain visible regardless of toggle state.

## Related Code

- `src/include-display.jsx:483-536` - `extractParagraphsFromAdf()` function
- `src/include-display.jsx:440-479` - `insertCustomParagraphsInAdf()` function
- `src/include-display.jsx:173-325` - `filterContentByToggles()` function
- `src/include-display.jsx:1207-1288` - Free Write tab UI

---

**Note:** This bug is separate from the toggle marker visibility issue (fixed in v6.31). This is a paragraph positioning calculation issue in the Free Write feature.
