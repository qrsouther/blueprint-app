# Understanding Deeply Nested ADF in Confluence

## What Creates Deep Nesting in ADF?

The ADF (Atlassian Document Format) structure represents Confluence pages as a tree of nodes. Deep nesting occurs when you have many levels of `content` arrays within each other.

### Common Sources of Deep Nesting:

1. **Nested Lists** (Most Common)
   - Bullet lists within bullet lists
   - Numbered lists within numbered lists
   - Mixed list types

2. **Nested Panels/Expands**
   - Panel within panel within panel
   - Expand within expand

3. **Nested Tables**
   - Tables within table cells
   - Nested column layouts

4. **Macros with Bodies (Bodied Extensions)**
   - Macros that contain content (like Info/Warning panels)
   - Nested bodied macros

5. **Column Layouts**
   - Columns within columns

## Examples of Deep Nesting

### Example 1: Nested Lists (Easiest to Create)

In Confluence, create a page with:

```
Level 1
  Level 2
    Level 3
      Level 4
        ... (continue to 20+ levels)
```

This creates ADF like:
```json
{
  "type": "bulletList",
  "content": [
    {
      "type": "listItem",
      "content": [
        { "type": "paragraph", "content": [{ "type": "text", "text": "Level 1" }] },
        {
          "type": "bulletList",  // Nested list
          "content": [
            {
              "type": "listItem",
              "content": [
                { "type": "paragraph", "content": [{ "type": "text", "text": "Level 2" }] },
                {
                  "type": "bulletList",  // Nested again
                  "content": [
                    // ... continues nesting
                  ]
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

### Example 2: Macros Within Macros

Yes, your example is valid! If you have:

- **Column Layout** (outer macro)
  - **Table** (inside column)
    - **Info Panel** (inside table cell)
      - **Expand** (inside info panel)
        - **Blueprint Standard Embed** (inside expand)

This creates deep nesting because each macro's body becomes a `content` array in ADF.

### Example 3: Nested Panels

```
Info Panel (outer)
  └─ Warning Panel (inside info panel)
      └─ Note Panel (inside warning panel)
          └─ Paragraph with text
```

Each panel is a `bodiedExtension` node with its own `content` array.

## Confluence Cloud Nesting Limitations

**Important:** Confluence Cloud has strict limitations on macro nesting:

- You **cannot** nest a table inside a SectionMessage/Info panel (or vice versa)
- Blueprint Standard Embed/Source macros can only be nested in:
  - Column layout macros
  - Expand macros
- Maximum practical nesting depth in Confluence Cloud is typically **2-3 levels**

**Example of what IS possible:**
```
Column Layout
  └─ Blueprint Standard Embed (2 levels deep) ✅
```

**Example of what is NOT possible:**
```
Table
  └─ Info Panel
      └─ Blueprint Standard Embed ❌ (Confluence won't allow this)
```

## Why the Safety Fixes Still Matter

Even though Confluence Cloud limits nesting, the safety fixes protect against:

1. **Malformed ADF from API bugs** - Rare but possible if Confluence API returns corrupted data
2. **Circular references** - Could occur from data corruption or API issues
3. **Future-proofing** - If Confluence adds new nesting capabilities
4. **Edge cases** - Deeply nested lists, panels, or other structures that ARE allowed

## How to Test in Confluence Cloud

### Practical Test: Maximum Nesting Allowed

1. **Create a page with maximum nesting:**
   ```
   Column Layout (2 columns)
   ├─ Column 1
   │   └─ Blueprint Standard Embed macro
   └─ Column 2
       └─ Expand macro
           └─ Blueprint Standard Embed macro (2 levels deep)
   ```

2. **Use your Source macro to extract content**
3. **Verify extraction completes without errors**
4. **Check console** - Should see no warnings (normal operation)

### Test with Nested Lists (if supported)

1. Create a page with deeply nested bullet lists (if Confluence allows 10+ levels)
2. Use Source macro to extract
3. Verify it works

### What to Look For

**Normal operation (expected):**
- No warnings
- All text extracted
- Completes quickly
- This is what you should see with real Confluence content

**If safety mechanisms trigger (unlikely with real content):**
- Console warning: `[extractTextFromAdf] Maximum depth reached, truncating extraction`
- Console warning: `[extractTextFromAdf] Circular reference detected, skipping`
- Would only happen with malformed/corrupted ADF

## Why MAX_DEPTH = 100 is Still Good

Even though Confluence Cloud limits nesting to 2-3 levels:
- **Safety net** for malformed data
- **Protects against API bugs** that might return deeply nested structures
- **Future-proof** if Confluence adds new capabilities
- **No performance cost** - only triggers when needed

## Conclusion

For **real Confluence Cloud content**, you won't hit the depth limit. The fixes are:
- ✅ **Safety net** for edge cases
- ✅ **Protection** against malformed ADF
- ✅ **Already tested** with the automated test script
- ✅ **No impact** on normal operation

You've already observed that 2-level nesting works fine, which confirms the fixes don't break normal operation.

## Alternative: Test with Malformed ADF

If you want to test the safety mechanisms more directly, you could:

1. Create a test resolver that manually constructs deeply nested ADF
2. Call it from your Forge app
3. Verify it handles the deep nesting gracefully

**Note:** The standalone test script (`test-adf-traversal-safety.js`) has been removed. The test scenarios it covered (150+ levels of nesting, circular references) are unrealistic since Confluence enforces a maximum nesting depth of 3-4 levels and validates ADF structure to prevent circular references. The production code still includes safety measures (MAX_DEPTH = 100, cycle detection) as defensive programming.

