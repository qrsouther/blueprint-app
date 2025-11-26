# Testing Plan: Standardized Resolver Return Formats

## Overview
All resolvers now return `{ success: true, data: {...} }` or `{ success: false, error: "..." }`. This plan prioritizes testing by risk and frequency of use.

## Testing Status Summary

**Last Updated:** 2025-11-21

### ✅ Completed Priorities
- **Priority 1:** Core Embed Functionality - ✅ ALL TESTS PASSED
- **Priority 2:** Source Management - ✅ ALL TESTS PASSED (with fixes applied)
- **Priority 3:** Admin UI & Usage Tracking - ✅ ALL TESTS PASSED
- **Priority 4:** Redline System - ✅ ALL TESTS PASSED

### ⏳ Remaining Priorities
- **Priority 5:** Version History & Recovery - Not yet tested

---

## Priority 1: CRITICAL - Core Embed Functionality ⚠️

**Why First:** Embeds are the primary user-facing feature. If broken, the app is unusable.

### Test 1.1: Embed Loading & Display
- [ ] Open a page with an existing Embed
- [ ] **Expected:** Embed loads and displays content correctly
- [ ] **Check:** No console errors, content renders properly
- [ ] **Resolvers tested:** `getVariableValues`, `getExcerpt`, `getCachedContent`

### Test 1.2: Embed Variable Input
- [ ] Edit variable values in an Embed
- [ ] Save the Embed
- [ ] **Expected:** Values save and persist after page refresh
- [ ] **Resolvers tested:** `saveVariableValues`, `getVariableValues`

### Test 1.3: Embed Source Selection
- [ ] Change the selected Source in an Embed dropdown
- [ ] **Expected:** New Source loads, variables update correctly
- [ ] **Resolvers tested:** `getExcerpt`, `getVariableValues`

### Test 1.4: Embed Toggle States
- [ ] Toggle content sections on/off
- [ ] Save and refresh
- [ ] **Expected:** Toggle states persist correctly
- [ ] **Resolvers tested:** `saveVariableValues`, `getVariableValues`

### Test 1.5: Custom Insertions
- [ ] Add external/internal custom paragraphs
- [ ] Save and view in published page
- [ ] **Expected:** Insertions appear in correct positions
- [ ] **Resolvers tested:** `saveVariableValues`, `getCachedContent`

### Test 1.6: Orphaned Data Recovery
- [ ] Create an Embed, then delete the macro from page
- [ ] Re-add the macro (same localId)
- [ ] **Expected:** Embed recovers previous variable values
- [ ] **Resolvers tested:** `recoverOrphanedData`, `getVariableValues`

---

## Priority 2: HIGH - Source Management 🔴

**Why Second:** Sources are created/edited frequently. Breaking this blocks content creation.

### Test 2.1: Create New Source
- [ ] Open Source macro config
- [ ] Create a new Source with name, category, content
- [ ] Save
- [ ] **Expected:** Source saves, appears in Admin sidebar
- [ ] **Resolvers tested:** `saveExcerpt`, `getAllExcerpts`

### Test 2.2: Edit Existing Source
- [ ] Open Admin, select a Source
- [ ] Edit name, category, or content
- [ ] Save
- [ ] **Expected:** Changes persist, modal closes correctly
- [ ] **Resolvers tested:** `getExcerpt`, `saveExcerpt`

### Test 2.3: Variable Detection
- [ ] Edit Source content with `{{variableName}}` syntax
- [ ] Navigate to Variables tab
- [ ] **Expected:** Variables detected and displayed
- [ ] **Resolvers tested:** `detectVariablesFromContent`

### Test 2.4: Toggle Detection
- [ ] Edit Source content with toggle syntax
- [ ] Navigate to Toggles tab
- [ ] **Expected:** Toggles detected and displayed
- [ ] **Resolvers tested:** `detectTogglesFromContent`

### Test 2.5: Source Categories
- [ ] Edit Source category
- [ ] Save
- [ ] **Expected:** Category updates in Admin sidebar
- [ ] **Resolvers tested:** `saveExcerpt`, `getCategories`

---

## Priority 3: MEDIUM - Admin UI & Usage Tracking 🟡

**Why Third:** Admin features are important but not blocking for end users.

### Test 3.1: Admin Page Load
- [ ] Open Admin page
- [ ] **Expected:** Sources list loads in sidebar
- [ ] Click on a Source → View Usage Details tab
- [ ] **Expected:** Usage count displays correctly in Usage Details UI
- [ ] **Resolvers tested:** `getAllExcerpts`, `getAllUsageCounts`, `getExcerptUsage`

### Test 3.2: Usage Details
- [ ] Click on a Source in Admin
- [ ] View Usage Details tab
- [ ] **Expected:** List of pages using this Source displays correctly
- [ ] **Resolvers tested:** `getExcerptUsage`

### Test 3.3: CSV Export
- [ ] In Usage Details, click "Export to CSV"
- [ ] **Expected:** CSV downloads with correct data
- [ ] **Resolvers tested:** `getExcerptUsageForCSV`

### Test 3.4: Usage Tracking
- [ ] Create a new Embed on a page
- [ ] Check Admin → Usage Details for that Source
- [ ] **Expected:** New usage appears in list
- [ ] **Resolvers tested:** `trackExcerptUsage`, `getExcerptUsage`

---

## Priority 4: MEDIUM - Redline System 🟡

**Why Fourth:** Used for review workflow, but not core functionality.

### Test 4.1: Redline Queue Load
- [x] Open Redline Queue in Admin
- [x] **Expected:** Queue loads with all Embeds
- [x] **Resolvers tested:** `getRedlineQueue`
- **Status:** ✅ PASSED

### Test 4.2: Status Update
- [x] Change redline status of an Embed (e.g., "approved")
- [x] **Expected:** Status updates, card moves to correct group
- [x] **Resolvers tested:** `setRedlineStatus`, `getRedlineQueue`
- **Status:** ✅ PASSED

### Test 4.3: User Avatars
- [x] View Redline Queue
- [x] **Expected:** User avatars display correctly
- [x] **Resolvers tested:** `getConfluenceUser`
- **Status:** ✅ PASSED

### Test 4.4: Redline Stats
- [x] View Redline Queue summary
- [x] **Expected:** Status counts display correctly
- [x] **Resolvers tested:** `getRedlineStats`
- **Status:** ✅ PASSED

### Test 4.5: Post Comment
- [x] Post an inline comment on an Embed
- [x] **Expected:** Comment posts successfully
- [x] **Resolvers tested:** `postRedlineComment`
- **Status:** ✅ PASSED

---

## Priority 5: LOW - Version History & Recovery 🟢

**Why Last:** Advanced features, less frequently used.

### Test 5.1: View Version History
- [ ] Open Version History for an Embed
- [ ] **Expected:** Version list loads
- [ ] **Resolvers tested:** `getVersionHistory`

### Test 5.2: View Version Details
- [ ] Click on a version in history
- [ ] **Expected:** Version details display
- [ ] **Resolvers tested:** `getVersionDetails`

### Test 5.3: Restore from Version
- [ ] Restore an Embed from a previous version
- [ ] **Expected:** Embed restores, backup created
- [ ] **Resolvers tested:** `restoreFromVersion`

### Test 5.4: List Backups
- [ ] View backup list (if applicable)
- [ ] **Expected:** Backups list correctly
- [ ] **Resolvers tested:** `listBackups`

---

## Quick Smoke Test (5 minutes)

If you're short on time, test these **critical paths only**:

1. ✅ **Embed loads** - Open a page with an Embed
2. ✅ **Source edits** - Edit a Source name/category, save
3. ✅ **Variable detection** - Add `{{var}}` to Source, check Variables tab
4. ✅ **Admin loads** - Open Admin page, check Sources list

If all 4 pass, the core functionality is working.

---

## Error Scenarios to Test

### Test E.1: Missing Data
- [ ] Try to load an Embed with invalid excerptId
- [ ] **Expected:** Graceful error, no crash

### Test E.2: Network Errors
- [ ] Simulate slow network (if possible)
- [ ] **Expected:** Loading states display, errors handled

### Test E.3: Invalid Input
- [ ] Try to save Source with empty name
- [ ] **Expected:** Validation error message displays

---

## Success Criteria

✅ **All Priority 1 tests pass** - Core functionality works  
✅ **All Priority 2 tests pass** - Content creation works  
✅ **No console errors** - Clean error handling  
✅ **Data persists** - Changes save correctly  

---

## Notes

- **Focus on Priority 1 first** - If these fail, stop and debug
- **Test incrementally** - Don't test everything at once
- **Check browser console** - Look for errors or warnings
- **Verify data persistence** - Refresh pages to ensure saves work

---

## Rollback Plan

If critical issues are found:
1. The changes are in feature branch `feature/standardize-resolver-returns`
2. Can merge to main only after all Priority 1 & 2 tests pass
3. Keep main branch stable until verification complete
