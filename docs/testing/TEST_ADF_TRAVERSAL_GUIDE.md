# ADF Traversal Safety

This guide explains the depth limit and cycle detection safety measures in ADF traversal functions.

**Note:** The standalone test script (`test-adf-traversal-safety.js`) has been removed. The test scenarios it covered (150+ levels of nesting, circular references) are unrealistic since Confluence enforces a maximum nesting depth of 3-4 levels and validates ADF structure to prevent circular references.

## Production Implementation

The ADF traversal functions in production include safety measures as defensive programming:

- **Depth limit:** `MAX_DEPTH = 100` (way more than Confluence's 3-4 level limit)
- **Cycle detection:** Uses a `visited` Set to track node references
- **Graceful degradation:** Returns partial results instead of crashing

**Files:**
- `src/utils/adf-utils.js` - `extractTextFromAdf()`, `findHeadingBeforeMacro()`
- `src/workers/helpers/page-scanner.js` - `checkMacroExistsInADF()`

## Why These Safety Measures Exist

While Confluence enforces strict limits on nesting depth (3-4 levels), these safety measures provide:

1. **Defensive programming** - Protection against unexpected edge cases
2. **Future-proofing** - If Confluence changes limits or validation
3. **Malformed data handling** - Protection against corrupted or manually edited ADF

## Test Cases (Historical Reference)

### Test Case 1: Deeply Nested ADF (Exceeds MAX_DEPTH)

**What it would test:** ADF structure with 150+ levels of nesting (exceeds our MAX_DEPTH of 100)

**Note:** This scenario cannot occur in real Confluence data since Confluence limits nesting to 3-4 levels.

**Expected behavior:**
- Function should NOT crash or stack overflow
- Should hit depth limit and return partial results
- Should log a warning: `[extractTextFromAdf] Maximum depth reached, truncating extraction`
- Should complete in < 1 second

**Example ADF structure:**
```json
{
  "type": "doc",
  "content": [
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Level 1"
        },
        {
          "type": "doc",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Level 2"
                },
                {
                  // ... nested 150+ times ...
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

### Test Case 2: Circular Reference ADF

**What it would test:** ADF where a node references itself, creating an infinite loop

**Note:** This scenario cannot occur in real Confluence data since Confluence validates ADF structure and prevents circular references.

**Expected behavior:**
- Function should NOT crash or enter infinite loop
- Should detect the cycle and return partial results
- Should log a warning: `[extractTextFromAdf] Circular reference detected, skipping`
- Should complete in < 1 second

**Example ADF structure:**
```json
{
  "type": "doc",
  "content": [
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Start"
        },
        // This node references itself!
        // (In JavaScript: node.content.push(node))
      ]
    }
  ]
}
```

### Test Case 3: Complex Circular Reference

**What it tests:** Multiple nodes forming a cycle (A → B → C → A)

**Expected behavior:**
- Function should NOT crash or enter infinite loop
- Should detect the cycle and return partial results
- Should complete in < 1 second

**Example ADF structure:**
```json
{
  "type": "doc",
  "content": [
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "Node A" },
        // References Node B
      ]
    },
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "Node B" },
        // References Node C
      ]
    },
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "Node C" },
        // References Node A (cycle!)
      ]
    }
  ]
}
```

### Test Case 4: Normal ADF (Control Test)

**What it tests:** Normal, well-formed ADF with reasonable nesting

**Expected behavior:**
- Should extract all text normally
- Should complete without warnings
- Should return complete text: `"Normal DocumentThis is a normal ADF document..."`

## How to Verify Safety Measures

The production code includes these safety measures, which are verified through:

### Option 1: Code Review

Review the implementation in:
- `src/utils/adf-utils.js` - Check for `MAX_DEPTH` and `visited` Set usage
- `src/workers/helpers/page-scanner.js` - Check for depth limits and cycle detection

### Option 2: Manual Testing with Real Confluence Pages

1. **Use the Source macro** on real Confluence pages with various nesting levels
2. **Verify** that the extraction completes without errors
3. **Test with complex pages** that have multiple levels of nesting (up to Confluence's limit)
4. **Verify** that all content is extracted correctly

## What to Look For

### ✅ Success Indicators

- Functions complete without crashing
- Functions complete in reasonable time (< 1 second for test cases)
- Warnings are logged for depth/cycle issues (not errors)
- Partial results are returned (not undefined or null)
- Normal ADF still works correctly

### ❌ Failure Indicators

- Stack overflow errors
- Functions hang or take > 5 seconds
- Functions return undefined/null for normal ADF
- No warnings logged when they should be
- Browser/Node.js crashes

## Safety Measures in Production

The production code includes:
- `MAX_DEPTH = 100` limit (way more than Confluence's 3-4 level limit)
- Cycle detection using `visited` Set
- Graceful degradation (returns partial results instead of crashing)

These measures are defensive programming - they protect against edge cases that shouldn't occur in real Confluence data, but provide safety if unexpected scenarios arise.

## Next Steps

After verifying these fixes work:

1. Test orphan detection with various ADF structures
2. Test page fetch error handling (404, 403, 500, network errors)
3. Test with real Confluence pages that have complex structures

