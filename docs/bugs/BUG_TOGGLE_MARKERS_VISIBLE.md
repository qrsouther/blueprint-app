# Bug: Toggle Markers Visible in Include Macro Published View

> **⚠️ ARCHIVED** - This bug has been resolved. Code references in this document may be outdated due to refactoring. This document is kept for historical reference and root cause analysis.

**Status:** ✅ RESOLVED (v6.31)
**Date Discovered:** 2025-10-30
**Date Resolved:** 2025-10-30
**Discovered During:** Phase 1 refactoring testing
**Resolution Version:** v6.31
**Priority:** Medium

## Problem

When an Include macro has toggle content enabled, the raw toggle markers are visible in the published view:
- `{{toggle:advanced}}`
- `{{/toggle:advanced}}`

These markers should be stripped out during rendering, showing only the content between them.

## Expected Behavior

When toggle "advanced" is **enabled**:
```
Hello Quinn, welcome to SeatGeek!

This is advanced content with expert.

You can even write custom stuff here too.
```

## Actual Behavior

When toggle "advanced" is **enabled**:
```
Hello Quinn, welcome to SeatGeek!

{{toggle:advanced}}

This is advanced content with expert.

You can even write custom stuff here too.

{{/toggle:advanced}}
```

## Root Cause Analysis

**Pre-Existing Bug:** This issue existed BEFORE Phase 1 refactoring.
- Phase 1 only touched backend utilities in `index.js`
- No changes made to `include-display.jsx`
- Git history confirms zero commits modified Include display logic

**Code Investigation:**

The `filterContentByToggles` function exists at `src/include-display.jsx:176-213` and has correct logic:
```javascript
text = text.replace(toggleRegex, (match, toggleName, content) => {
  const trimmedName = toggleName.trim();
  // If toggle is enabled (true), keep content without markers
  return toggleStates?.[trimmedName] === true ? content : '';
});
```

**This function is called in 4 places:**
- Line 465: Optimistic rendering path
- Line 545: Fresh content loading path
- Line 691: Preview rendering
- Line 740: Update content path

**Hypothesis:** One of the rendering code paths is not properly applying `filterContentByToggles`, or the toggle markers are being re-inserted somewhere in the rendering pipeline.

## Steps to Reproduce

1. Create a Source macro with toggle content:
   ```
   Hello {{name}}, welcome to {{company}}!

   {{toggle:advanced}}
   This is advanced content with {{detail-level}}.
   {{/toggle:advanced}}
   ```

2. Create an Include macro on a different page
3. Enable the "advanced" toggle
4. Save the Include
5. View the published page

**Result:** Toggle markers are visible in output

## Test Environment

- Environment: qrsouther.atlassian.net (Development)
- Branch: `refactor/modularize-index-js`
- Forge CLI: Latest
- Test macro: "Test Phase 1"

## Impact

- **User Experience:** Medium - Markers are visible but don't break functionality
- **Visual Cleanliness:** Low - Content is still readable, just cluttered
- **Functionality:** None - Toggle enable/disable logic works correctly

## Resolution (v6.31)

**Root Cause:** Rich text formatting in Confluence's ADF splits toggle content across multiple text nodes, breaking regex pattern matching. The original overlap detection logic only removed nodes COMPLETELY within the content range, missing nodes that contained toggle markers.

**Fix Applied:** Modified overlap detection in `filterContentByToggles` (line 266) to remove ANY node that has overlap with the full toggle range (including markers):

```javascript
// OLD (BROKEN): Only removed nodes completely within content range
if (item.textStart >= range.contentStart && item.textEnd <= range.contentEnd)

// NEW (FIXED): Removes nodes with ANY overlap with full toggle range
if (item.textEnd > range.fullStart && item.textStart < range.fullEnd)
```

**Implementation Details:**
- Implemented two-pass algorithm: flatten all text nodes to find complete toggle patterns, then remove overlapping nodes
- Changed from checking if nodes are within `contentStart`-`contentEnd` to checking overlap with `fullStart`-`fullEnd`
- This ensures ALL nodes within disabled toggle blocks are removed, not just the middle ones

**Testing Results:**
✅ Published view: Markers hidden, toggle filtering works correctly
✅ Edit > Write > Preview: Markers hidden, toggle filtering works correctly
✅ Edit > Toggles > Preview: Same as Write (markers hidden, toggle filtering works)
✅ Edit > Free Write > Preview: Same as Write (markers hidden, toggle filtering works)

**Cleanup:**
- Removed all debug console.log statements added during investigation (v6.32)

## Related Code

- `src/include-display.jsx:174-213` - `filterContentByToggles` function
- `src/include-display.jsx:465` - Optimistic rendering path
- `src/include-display.jsx:545` - Fresh content loading path
- `src/include-display.jsx:691` - Preview rendering path
- `src/include-display.jsx:740` - Update content path

## Screenshots

See test screenshot showing markers visible: `{{toggle:advanced}}` and `{{/toggle:advanced}}`

---

**Note:** This bug is tracked separately from the Phase 1 refactoring work. Phase 1 did not cause this issue.
