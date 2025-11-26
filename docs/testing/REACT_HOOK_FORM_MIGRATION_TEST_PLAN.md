# React Hook Form Migration - Manual Test Plan

## Overview
This test plan verifies that the React Hook Form migration works correctly and that all functionality (especially auto-save) operates as expected.

**Test Environment:** Development environment with `forge tunnel` running

**Prerequisites:**
- Embed instance exists on a Confluence page
- Embed has at least one Source/Standard selected
- Source has variables and/or toggles defined

---

## Test Suite 1: Variable Input Fields (VariableConfigPanel)

### Test 1.1: Basic Variable Input
**Objective:** Verify variable input fields work and update status checkmarks immediately

**Steps:**
1. Open a page with an Embed in Edit Mode
2. Navigate to the "Write" tab
3. Locate a variable input field
4. Type a value into the field

**Expected Results:**
- ✅ Status checkmark updates immediately (green checkmark appears)
- ✅ No delay or lag in UI update
- ✅ Value appears in the input field as you type

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test 1.2: Clear Variable Value
**Objective:** Verify clearing a variable value works correctly

**Steps:**
1. In Edit Mode, "Write" tab
2. Find a variable field that has a value
3. Select all text and delete it (or backspace to clear)
4. Click outside the field (blur event)

**Expected Results:**
- ✅ Status checkmark updates immediately to show empty state
- ✅ Field shows as empty
- ✅ If required, warning icon appears

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test 1.3: Auto-Save on Variable Input
**Objective:** Verify auto-save triggers when typing in variable fields

**Steps:**
1. In Edit Mode, "Write" tab
2. Type a value into a variable field
3. Wait 500ms (watch for "Saving..." indicator)
4. Wait for "Saved" indicator to appear
5. Publish the page
6. Reload the page
7. Enter Edit Mode again
8. Check the "Write" tab

**Expected Results:**
- ✅ "Saving..." indicator appears after ~500ms of no typing
- ✅ "Saved" indicator appears after save completes
- ✅ Value persists after page reload
- ✅ Value appears in the field when Edit Mode is reopened

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test 1.4: Multiple Variable Inputs
**Objective:** Verify multiple variable fields can be edited and all save correctly

**Steps:**
1. In Edit Mode, "Write" tab
2. Fill in 3-4 different variable fields with different values
3. Wait for auto-save to complete
4. Publish and reload the page
5. Enter Edit Mode again

**Expected Results:**
- ✅ All values persist after reload
- ✅ All status checkmarks show correctly
- ✅ Auto-save triggers for all changes

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test 1.5: Rapid Typing (Debounce Test)
**Objective:** Verify debouncing works correctly during rapid typing

**Steps:**
1. In Edit Mode, "Write" tab
2. Rapidly type and delete text in a variable field (type 10+ characters quickly)
3. Observe the "Saving..." indicator

**Expected Results:**
- ✅ "Saving..." doesn't appear while actively typing
- ✅ "Saving..." appears only after 500ms of no typing
- ✅ Final value is saved (not intermediate values)
- ✅ No console errors

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

## Test Suite 2: Toggle Switches (ToggleConfigPanel)

### Test 2.1: Toggle On/Off
**Objective:** Verify toggle switches work and update immediately

**Steps:**
1. In Edit Mode, navigate to "Toggles" tab
2. Toggle a switch from OFF to ON
3. Toggle it back to OFF

**Expected Results:**
- ✅ Toggle state updates immediately
- ✅ No lag or delay
- ✅ Visual state matches actual state

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test 2.2: Auto-Save on Toggle Change
**Objective:** Verify auto-save triggers when toggles are changed

**Steps:**
1. In Edit Mode, "Toggles" tab
2. Toggle a switch
3. Wait for "Saving..." and "Saved" indicators
4. Publish and reload the page
5. Enter Edit Mode again
6. Check "Toggles" tab

**Expected Results:**
- ✅ "Saving..." indicator appears after toggle change
- ✅ "Saved" indicator appears after save completes
- ✅ Toggle state persists after reload
- ✅ Toggle shows correct state when Edit Mode is reopened

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test 2.3: Multiple Toggle Changes
**Objective:** Verify multiple toggles can be changed and all save

**Steps:**
1. In Edit Mode, "Toggles" tab
2. Toggle 3-4 different switches
3. Wait for auto-save
4. Publish and reload
5. Enter Edit Mode again

**Expected Results:**
- ✅ All toggle states persist
- ✅ All toggles show correct state after reload

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

## Test Suite 3: Custom Insertions (CustomInsertionsPanel)

### Test 3.1: Add Custom Paragraph
**Objective:** Verify adding custom paragraphs works

**Steps:**
1. In Edit Mode, navigate to "Custom" tab
2. Select "Paragraph" insertion type
3. Select a position from the dropdown
4. Enter text in the text field
5. Click "Add"
6. Wait for auto-save

**Expected Results:**
- ✅ Custom paragraph appears in the list
- ✅ "Saving..." indicator appears
- ✅ "Saved" indicator appears
- ✅ Paragraph persists after reload

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test 3.2: Add Internal Note
**Objective:** Verify adding internal notes works

**Steps:**
1. In Edit Mode, "Custom" tab
2. Select "Internal Note" insertion type
3. Select a position
4. Enter note content
5. Click "Add"
6. Wait for auto-save

**Expected Results:**
- ✅ Internal note appears in the list with 🔏 icon
- ✅ Auto-save triggers
- ✅ Note persists after reload

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test 3.3: Delete Custom Content
**Objective:** Verify deleting custom insertions works

**Steps:**
1. In Edit Mode, "Custom" tab
2. Add a custom paragraph (from Test 3.1)
3. Click the "Delete" button for that paragraph
4. Wait for auto-save

**Expected Results:**
- ✅ Paragraph is removed from the list immediately
- ✅ Auto-save triggers
- ✅ Deletion persists after reload

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

## Test Suite 4: Combined Operations

### Test 4.1: Mixed Changes Across Tabs
**Objective:** Verify changes across multiple tabs all save correctly

**Steps:**
1. In Edit Mode:
   - "Write" tab: Fill in 2 variable values
   - "Toggles" tab: Toggle 2 switches
   - "Custom" tab: Add 1 custom paragraph
2. Wait for auto-save to complete
3. Publish and reload
4. Enter Edit Mode again
5. Verify all changes persisted

**Expected Results:**
- ✅ All variable values persist
- ✅ All toggle states persist
- ✅ Custom paragraph persists
- ✅ Single auto-save operation handles all changes

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test 4.2: Rapid Tab Switching
**Objective:** Verify form state is preserved when switching tabs quickly

**Steps:**
1. In Edit Mode, "Write" tab
2. Type a value in a variable field (don't wait for save)
3. Quickly switch to "Toggles" tab
4. Toggle a switch
5. Switch back to "Write" tab
6. Wait for auto-save

**Expected Results:**
- ✅ Variable value is still in the field
- ✅ Toggle state is preserved
- ✅ Both changes save correctly
- ✅ No data loss

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

## Test Suite 5: Edge Cases & Error Handling

### Test 5.1: Restore from Version History
**Objective:** Verify version restore works with React Hook Form

**Steps:**
1. Make some changes to variables/toggles
2. Save and create a version
3. Make different changes
4. Save again
5. Open Version History modal
6. Restore the first version
7. Verify form updates correctly

**Expected Results:**
- ✅ Form values update to restored version
- ✅ Status checkmarks update correctly
- ✅ Restored values persist after reload
- ✅ No console errors

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test 5.2: Switch Source/Standard
**Objective:** Verify form resets correctly when switching Sources

**Steps:**
1. In Edit Mode, select a Source with variables
2. Fill in some variable values
3. Switch to a different Source (with different variables)
4. Verify form state

**Expected Results:**
- ✅ Form resets to new Source's variables
- ✅ Old variable values are cleared
- ✅ New variables are available
- ✅ No stale data from previous Source

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test 5.3: Empty Values Handling
**Objective:** Verify empty/null values are handled correctly

**Steps:**
1. In Edit Mode, "Write" tab
2. Fill in a variable value
3. Clear the value completely
4. Save and reload
5. Verify empty value persists

**Expected Results:**
- ✅ Empty value is saved (not null/undefined)
- ✅ Field shows as empty after reload
- ✅ Status checkmark shows empty state
- ✅ No errors in console

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test 5.4: Required Field Validation
**Objective:** Verify required field indicators work correctly

**Steps:**
1. In Edit Mode, "Write" tab
2. Locate a required variable (marked with *)
3. Leave it empty
4. Verify warning indicator appears
5. Fill in a value
6. Verify warning disappears

**Expected Results:**
- ✅ Warning icon appears for empty required fields
- ✅ Warning disappears when field is filled
- ✅ Status checkmark updates correctly

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

## Test Suite 6: Performance & UX

### Test 6.1: No Lag During Typing
**Objective:** Verify UI remains responsive during typing

**Steps:**
1. In Edit Mode, "Write" tab
2. Rapidly type in a variable field
3. Observe UI responsiveness

**Expected Results:**
- ✅ No lag or stuttering
- ✅ Status checkmark updates smoothly
- ✅ Input field remains responsive
- ✅ No console warnings about performance

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test 6.2: Save Status Indicators
**Objective:** Verify save status indicators are accurate

**Steps:**
1. Make a change
2. Observe "Saving..." indicator
3. Wait for "Saved" indicator
4. Make another change immediately
5. Observe indicators again

**Expected Results:**
- ✅ "Saving..." appears when changes are pending
- ✅ "Saved" appears when save completes
- ✅ Indicators update correctly for subsequent changes
- ✅ No stuck "Saving..." state

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

## Summary

**Total Tests:** 18
**Passed:** ___
**Failed:** ___
**Blocked:** ___

**Critical Issues Found:**
1. 
2. 
3. 

**Minor Issues Found:**
1. 
2. 
3. 

**Overall Assessment:**
☐ Ready for production
☐ Needs fixes before production
☐ Major issues found - needs rework

**Notes:**

---

## Known Issues / Limitations

(Record any known issues or limitations discovered during testing)

---

**Test Date:** _______________
**Tester:** _______________
**Environment:** Development
**Branch:** `react-hook-form-embed-edit`

