# Testing ADF Traversal Safety Fixes

This guide explains how to test the depth limit and cycle detection fixes for ADF traversal.

## Test Cases Overview

### Test Case 1: Deeply Nested ADF (Exceeds MAX_DEPTH)

**What it tests:** ADF structure with 150+ levels of nesting (exceeds our MAX_DEPTH of 100)

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

**What it tests:** ADF where a node references itself, creating an infinite loop

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

## How to Test

### Option 1: Run the Test Script

```bash
node test-adf-traversal-safety.js
```

This will run all test cases and report results.

### Option 2: Test in Forge Environment

Since this is a Forge app, you can test the actual functions in your development environment:

1. **Create a test resolver** that calls `extractTextFromAdf()` with test data
2. **Use the Forge UI** to trigger the resolver
3. **Check the console** for warnings and verify behavior

#### Example Test Resolver

Add this to `src/index.js` (temporarily for testing):

```javascript
import { extractTextFromAdf } from './utils/adf-utils.js';

resolver.define('testAdfTraversal', async (req) => {
  const { testType } = req.payload;
  
  let testADF;
  
  switch (testType) {
    case 'deep':
      // Create deeply nested ADF (150 levels)
      testADF = createDeeplyNestedADF(150);
      break;
    case 'circular':
      // Create circular reference
      testADF = createCircularReferenceADF();
      break;
    case 'normal':
      // Create normal ADF
      testADF = createNormalADF();
      break;
    default:
      return { success: false, error: 'Invalid test type' };
  }
  
  const startTime = Date.now();
  const result = extractTextFromAdf(testADF);
  const duration = Date.now() - startTime;
  
  return {
    success: true,
    result: result.substring(0, 100), // First 100 chars
    resultLength: result.length,
    duration: `${duration}ms`,
    testType
  };
});
```

Then call it from the Forge UI or via API.

### Option 3: Manual Testing with Real Confluence Pages

1. **Create a Confluence page** with deeply nested content (if possible)
2. **Use the Source macro** to extract content from that page
3. **Verify** that the extraction completes without errors
4. **Check console** for any warnings about depth limits

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

## Expected Console Output

When running tests, you should see warnings like:

```
[extractTextFromAdf] Maximum depth reached, truncating extraction
```

or

```
[extractTextFromAdf] Circular reference detected, skipping
```

These warnings are **expected and good** - they indicate the safety mechanisms are working.

## Next Steps

After verifying these fixes work:

1. Test orphan detection with various ADF structures
2. Test page fetch error handling (404, 403, 500, network errors)
3. Test with real Confluence pages that have complex structures

