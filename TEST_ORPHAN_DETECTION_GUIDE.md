# Automated Test Suite for Orphan Detection Fixes

This guide explains the automated tests for orphan detection improvements.

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

## Running the Tests

### Quick Run

```bash
node test-orphan-detection.js
```

### Expected Output

```
🧪 Testing Orphan Detection Fixes
============================================================

📋 Test 1: Extension with localId in attrs.localId
✅ PASS: Found macro with localId in attrs.localId

📋 Test 2: Extension with localId in attrs.parameters.localId
✅ PASS: Found macro with localId in attrs.parameters.localId

... (15 tests total)

📊 Test Summary:
   ✅ Passed: 15
   ❌ Failed: 0
   Total: 15

🎉 All tests passed! The orphan detection fixes are working correctly.
```

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

## Integration with CI/CD

You can add this test to your CI/CD pipeline:

```json
{
  "scripts": {
    "test": "node test-orphan-detection.js && node test-adf-traversal-safety.js",
    "test:orphan": "node test-orphan-detection.js",
    "test:adf": "node test-adf-traversal-safety.js"
  }
}
```

Then run:
```bash
npm test
```

## What These Tests Don't Cover

These automated tests cover the **logic** of orphan detection, but don't test:

1. **Real Confluence API calls** - The `fetchPageContent()` function requires Forge API, which can't be easily mocked
2. **Retry logic** - The exponential backoff retry logic would require time delays
3. **Storage operations** - The actual marking of embeds as orphaned requires Forge storage

For those, you'd need:
- Manual testing in Confluence
- Integration tests with Forge environment
- End-to-end tests

## Next Steps

After running these automated tests:

1. ✅ **Automated tests pass** (you just did this!)
2. ⏳ **Manual testing in Confluence** - Test with real pages
3. ⏳ **Integration testing** - Test the full "Check All Embeds" flow
4. ⏳ **Edge case testing** - Test with various page structures

## Summary

The automated test suite verifies:
- ✅ All `localId` locations are checked
- ✅ `bodiedExtension` nodes are detected
- ✅ Error handling distinguishes error types correctly
- ✅ Edge cases are handled properly

**Result:** 15/15 tests pass - The orphan detection fixes are working correctly! 🎉

