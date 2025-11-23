# Orphan Detection System

This guide explains the orphan detection improvements that are now implemented in the production worker system.

**Note:** The standalone test script (`test-orphan-detection.js`) has been removed. The orphan detection logic is now fully implemented and tested in the production worker (`src/workers/checkIncludesWorker.js`) with improved error handling, retry logic, and integration with the Forge storage system.

## What Was Tested

### 1. All Possible localId Locations ✅

The fix checks **4 different locations** where `localId` might be stored in ADF:

1. **`attrs.localId`** (primary location) ✅
2. **`attrs.parameters.localId`** ✅
3. **`attrs.parameters.macroParams.localId`** ✅
4. **`attrs.parameters.macroParams.localId.value`** ✅

**Why this matters:** Different ADF structures or Confluence versions might store `localId` in different places. Checking all locations prevents false negatives (marking valid embeds as orphaned).

### 2. BodiedExtension Nodes ✅

The fix now checks **both** `extension` and `bodiedExtension` node types.

**Why this matters:** Some macros use `bodiedExtension` (macros with bodies), and the old code only checked `extension` nodes. This could cause false negatives.

### 3. Error Handling Logic ✅

The fix distinguishes between different HTTP error types:

- **HTTP 404** → `page_deleted` → **Mark as orphaned** ✅
- **HTTP 403** → `permission_denied` → **Don't mark as orphaned** ✅
- **HTTP 401** → `unauthorized` → **Don't mark as orphaned** ✅
- **HTTP 5xx** → `transient_failure` → **Don't mark as orphaned** ✅

**Why this matters:** Network errors or permission issues shouldn't cause data deletion. Only confirmed page deletions (404) should mark embeds as orphaned.

### 4. Edge Cases ✅

- Nested macros (macro inside other content) ✅
- Multiple macros on same page ✅
- Legacy macro names (`smart-excerpt-include`) ✅
- Macros that don't exist (returns false correctly) ✅
- Wrong localId (returns false correctly) ✅

## Production Implementation

The orphan detection logic is implemented in:
- **Worker:** `src/workers/checkIncludesWorker.js` - Main async worker that processes orphan detection
- **Helpers:**
  - `src/workers/helpers/page-scanner.js` - ADF scanning and macro detection
  - `src/workers/helpers/orphan-detector.js` - Orphan detection and cleanup logic
  - `src/workers/helpers/reference-repairer.js` - Reference repair and validation

The production implementation includes all the improvements described below, plus:
- Real Confluence API integration with retry logic
- Exponential backoff for transient failures
- Integration with Forge storage for tracking orphaned items
- Progress tracking for long-running operations
- Safe dry-run mode by default

## Test Cases Explained

### Test 1-4: Different localId Locations

These tests verify that macros are found regardless of where `localId` is stored in the ADF structure. This is critical because:

- Different Confluence versions might use different structures
- API responses might vary
- Legacy data might use different formats

**Before the fix:** Only checked `attrs.localId` → could miss macros with `localId` in other locations → false negatives → data deletion

**After the fix:** Checks all 4 possible locations → finds macros regardless of structure → prevents false negatives

### Test 5: BodiedExtension Nodes

Tests that `bodiedExtension` nodes (macros with bodies) are detected, not just `extension` nodes.

**Before the fix:** Only checked `extension` → could miss `bodiedExtension` macros → false negatives

**After the fix:** Checks both `extension` and `bodiedExtension` → finds all macro types

### Test 6: Nested Macros

Tests that macros nested inside other content (paragraphs, lists, etc.) are still found.

### Test 7: Multiple Macros

Tests that when multiple macros exist on a page, the function finds the correct one by `localId`.

### Test 8: Legacy Macro Names

Tests that legacy macro names (`smart-excerpt-include`, `blueprint-standard-embed-poc`) are still recognized.

### Test 9-10: Negative Cases

Tests that the function correctly returns `false` when:
- No macro exists in the ADF
- A macro exists but with a different `localId`

### Error Handling Tests

Tests that different HTTP error codes are handled correctly:
- **404** = Page deleted → Mark as orphaned
- **403/401** = Permission issue → Don't mark as orphaned
- **5xx** = Server error → Don't mark as orphaned (retry instead)

## Testing the Production System

To test orphan detection in the production system:

1. **Use the Admin UI:** Navigate to Admin → Check All Embeds
2. **Review Results:** The system will show orphaned embeds with detailed information
3. **Dry Run Mode:** By default, the system runs in dry-run mode (preview only)
4. **Manual Testing:** Test with real Confluence pages to verify behavior

## Production System Features

The production worker system includes:

1. **Real Confluence API calls** - `fetchPageContent()` with retry logic and error handling
2. **Retry logic** - Exponential backoff for transient failures (HTTP 5xx, network errors)
3. **Storage operations** - Integration with Forge storage for tracking and cleanup
4. **Progress tracking** - Real-time progress updates for long-running operations
5. **Error handling** - Distinguishes between page deletion (404) and permission issues (403/401)
6. **Safe defaults** - Dry-run mode enabled by default to prevent accidental data loss

## Summary

The production orphan detection system implements:
- ✅ All `localId` locations are checked (4 different locations)
- ✅ `bodiedExtension` nodes are detected
- ✅ Error handling distinguishes error types correctly (404 vs 403/401 vs 5xx)
- ✅ Edge cases are handled properly (nested macros, multiple macros, legacy names)
- ✅ Retry logic for transient failures
- ✅ Safe dry-run mode by default
- ✅ Progress tracking for long-running operations
- ✅ Integration with Forge storage and recovery systems

**Status:** Production-ready and actively used in the Admin UI "Check All Embeds" feature.

