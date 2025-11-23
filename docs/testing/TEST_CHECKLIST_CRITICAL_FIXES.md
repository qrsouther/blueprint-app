# Test Checklist: Critical Fixes (CR-1, CR-2, CR-4)

## Overview
This checklist tests the three critical fixes we just implemented:
- **CR-4**: ADF Traversal depth limits and cycle detection
- **CR-1**: Orphan detection logging (gated behind debug flag)
- **CR-2**: Orphan detection search improvements (data safety critical)

---

## CR-2: Orphan Detection Search Improvements ⚠️ HIGHEST PRIORITY
**Risk Level:** High - Data Safety Critical  
**What We Changed:** Search now checks all localId locations and bodiedExtension nodes

### Test 1: Basic Orphan Detection - Extension Nodes
**Status:** ⏳ Pending  
**Action Required:** Human operator  
**Steps:**
1. Open a Confluence page that has at least one Embed macro
2. Run "Check All Embeds" operation
3. Verify the Embed is NOT marked as orphaned
4. Check console for any errors

**Expected Result:** Embed is detected and NOT marked as orphaned  
**Actual Result:** _[To be filled after test]_

---

### Test 2: Orphan Detection - BodiedExtension Nodes
**Status:** ⏳ Pending  
**Action Required:** Human operator  
**Steps:**
1. Find or create a page with a bodiedExtension macro (if any exist)
2. Run "Check All Embeds" operation
3. Verify bodiedExtension Embeds are detected

**Expected Result:** BodiedExtension Embeds are detected (previously might have been missed)  
**Actual Result:** _[To be filled after test]_

---

### Test 3: Multiple Embeds on Same Page
**Status:** ⏳ Pending  
**Action Required:** Human operator  
**Steps:**
1. Open a page with 5-10 Embed macros
2. Run "Check All Embeds" operation
3. Verify ALL Embeds are detected (none marked as orphaned)

**Expected Result:** All Embeds detected correctly  
**Actual Result:** _[To be filled after test]_

---

### Test 4: Legacy Macro Names
**Status:** ⏳ Pending  
**Action Required:** Human operator  
**Steps:**
1. Find pages with legacy macro names (`smart-excerpt-include` or `blueprint-standard-embed-poc`)
2. Run "Check All Embeds" operation
3. Verify legacy macros are still detected

**Expected Result:** Legacy macros detected correctly  
**Actual Result:** _[To be filled after test]_

---

## CR-4: ADF Traversal Depth Limits

**Risk Level:** Medium - Functional Change  
**What We Changed:** Added depth limits and cycle detection to prevent crashes

### Test 5: Normal ADF Text Extraction
**Status:** ⏳ Pending  
**Action Required:** Human operator  
**Steps:**
1. Open a Source configuration modal
2. View/edit a Source with normal ADF content
3. Verify text displays correctly
4. Check console for any errors or warnings

**Expected Result:** Text displays normally, no errors  
**Actual Result:** _[To be filled after test]_

---

### Test 6: Normal Heading Detection
**Status:** ⏳ Pending  
**Action Required:** Human operator  
**Steps:**
1. Open an Embed that should show a heading anchor
2. Verify heading is detected and displayed correctly
3. Check console for any errors or warnings

**Expected Result:** Heading detected correctly, no errors  
**Actual Result:** _[To be filled after test]_

---

### Test 7: Deeply Nested ADF Content
**Status:** ⏳ Pending  
**Action Required:** Human operator (if available)  
**Steps:**
1. Find or create content with very deep nesting (50+ levels)
2. Try to extract text or detect headings
3. Verify it doesn't crash, returns partial results if needed

**Expected Result:** No crash, graceful handling  
**Actual Result:** _[To be filled after test]_

---

## CR-1: Orphan Detection Logging

**Risk Level:** Low - Logging Only  
**What We Changed:** Gated all logging behind debug flag

### Test 8: Console Clean During Check All Embeds
**Status:** ⏳ Pending  
**Action Required:** Human operator  
**Steps:**
1. Open browser console
2. Run "Check All Embeds" operation
3. Count console.log statements (should be minimal/zero)
4. Verify no flooding

**Expected Result:** Console is clean, no flooding  
**Actual Result:** _[To be filled after test]_

---

### Test 9: Debug Flag Works (Optional)
**Status:** ⏳ Pending  
**Action Required:** Human operator (if needed for debugging)  
**Steps:**
1. Set environment variable `DEBUG_ORPHAN_DETECTION=true`
2. Run "Check All Embeds" operation
3. Verify detailed logging appears

**Expected Result:** Detailed logging appears when flag is enabled  
**Actual Result:** _[To be filled after test]_

---

## Summary

**Total Tests:** 9  
**Completed:** 0  
**Passed:** 0  
**Failed:** 0  
**Skipped:** 0

---

## Notes
- Tests should be run in order (CR-2 first, then CR-4, then CR-1)
- Mark each test as ✅ Pass or ❌ Fail after completion
- Add notes in "Actual Result" field if issues found

