# Testing Plan: Standardized Resolver Returns

## Overview
This document outlines testing procedures for the standardized resolver return format changes. All resolvers now return `{ success: true, data: {...} }` or `{ success: false, error: "..." }`.

## Resolvers Standardized (So Far)
1. ✅ `getCategories()` - Category management
2. ✅ `getAdminUrl()` / `setAdminUrl()` - Admin URL storage
3. ✅ `getExcerpts()` / `getExcerpt()` - Source loading
4. ✅ `getPageTitle()` - Page title fetching
5. ✅ `getVariableValues()` - Embed variable/toggle data loading

---

## Test 1: Categories (getCategories)

### What to Test
- Categories load and display in Admin UI
- Category dropdown works when creating/editing Sources

### How to Test
1. **Open Admin Page**
   - Navigate to the Blueprint Admin page
   - Check that categories load in the sidebar or category manager
   - Expected: Categories display correctly (General, Pricing, Technical, Legal, Marketing, or custom)

2. **Create/Edit Source Modal**
   - Click "Create Source" or edit an existing Source
   - Open the Category dropdown
   - Expected: All categories appear in the dropdown
   - Select a category and save
   - Expected: Category saves correctly

### What to Check
- ✅ Categories appear in UI
- ✅ No console errors related to categories
- ✅ Category selection works
- ✅ Category saves correctly

### Potential Issues
- Categories don't load → Check browser console for errors
- Category dropdown is empty → Check if `result.data.categories` is being accessed correctly

---

## Test 2: Admin URL (getAdminUrl / setAdminUrl)

### What to Test
- Admin page URL is stored and retrieved correctly

### How to Test
1. **Open Admin Page**
   - Navigate to the Blueprint Admin page
   - The page should automatically store its URL
   - Expected: No errors, URL stored silently

2. **Check Source Config**
   - Open a Source macro in Edit Mode
   - Check if admin links work (if applicable)
   - Expected: Links to admin page work correctly

### What to Check
- ✅ No console errors
- ✅ Admin page loads normally
- ✅ Any admin links work correctly

### Potential Issues
- Admin page fails to load → Check if `result.data.adminUrl` is being accessed correctly

---

## Test 3: Source Loading (getExcerpt / getExcerpts)

### What to Test
- Sources load in Admin UI
- Source details load when editing
- Source selection works in Embed macro

### How to Test
1. **Admin Page - Source List**
   - Open Admin page
   - Check the Sources list in the sidebar
   - Expected: All Sources appear in the list

2. **Edit Source Modal**
   - Click on a Source to edit it
   - Expected: Source details load correctly (name, category, content, variables, toggles)
   - Make a change and save
   - Expected: Source saves and updates correctly

3. **Embed Macro - Source Selection**
   - Open an Embed macro in Edit Mode
   - Click the Source dropdown
   - Expected: All Sources appear in the dropdown
   - Select a Source
   - Expected: Source loads, variables/toggles appear

### What to Check
- ✅ Sources list displays correctly
- ✅ Source details load when editing
- ✅ Source selection in Embed works
- ✅ No console errors related to Sources

### Potential Issues
- Sources don't appear → Check if `result.data.excerpt` or `result.data.excerpts` is being accessed
- Source details don't load → Check CreateEditSourceModal.jsx usage
- Source selection fails → Check EmbedContainer.jsx usage

---

## Test 4: Page Title (getPageTitle)

### What to Test
- Page titles are fetched and displayed correctly

### How to Test
1. **Embed Container**
   - Open an Embed macro on any Confluence page
   - Check if page title is used anywhere (e.g., for auto-inferring "client" variable)
   - Expected: Page title is fetched correctly

2. **Admin Page - Usage Details**
   - Open Admin page
   - Check Usage details for any Source
   - Expected: Page titles display correctly (or Page ID if title unavailable)

### What to Check
- ✅ Page titles load correctly
- ✅ No console errors related to page titles
- ✅ Auto-inference of "client" variable works (if page title contains "Blueprint: [Client Name]")

### Potential Issues
- Page title doesn't load → Check if `result.data.title` is being accessed correctly

---

## Test 5: Variable Values (getVariableValues) - **CRITICAL**

### What to Test
This is the most critical resolver - it's used everywhere for loading Embed data.

### Test Scenarios

#### 5.1: Embed Loading
1. **Open Embed in Edit Mode**
   - Open any Embed macro on a Confluence page
   - Expected: 
     - Variables load with their current values
     - Toggles load with their current states
     - Custom insertions load
     - Internal notes load
     - Source selection is correct

2. **Open Embed in View Mode**
   - View a published Embed macro
   - Expected: Content renders correctly with all variable values applied

#### 5.2: Variable Editing
1. **Edit Variable Values**
   - Open Embed in Edit Mode
   - Change a variable value
   - Save
   - Expected: Value saves and persists

2. **Toggle States**
   - Toggle a toggle on/off
   - Save
   - Expected: Toggle state saves and persists

#### 5.3: Custom Insertions
1. **Add Custom Insertion**
   - Add a custom paragraph
   - Save
   - Expected: Custom insertion saves and appears in View Mode

#### 5.4: Staleness Detection
1. **Check Staleness**
   - Open an Embed that's up-to-date
   - Expected: No "Update Available" banner
   - Update the Source that the Embed uses
   - Refresh the page
   - Expected: "Update Available" banner appears

#### 5.5: Data Recovery
1. **Orphaned Data Recovery**
   - If you have an Embed with missing data (orphaned)
   - Expected: System attempts recovery automatically
   - Data should be recovered if possible

#### 5.6: Copy Embed Data
1. **Copy from Another Embed**
   - Use the "Copy from another Embed" feature (if available)
   - Expected: All data (variables, toggles, insertions, notes) copies correctly

### What to Check
- ✅ All variable values load correctly
- ✅ All toggle states load correctly
- ✅ Custom insertions load correctly
- ✅ Internal notes load correctly
- ✅ Staleness detection works
- ✅ Data saves correctly
- ✅ No console errors
- ✅ No data loss

### Potential Issues
- Variables don't load → Check if `result.data.variableValues` is being accessed
- Toggles don't load → Check if `result.data.toggleStates` is being accessed
- Data doesn't save → Check saveVariableValues resolver (not yet standardized)
- Staleness detection broken → Check if `result.data.syncedContentHash` is being accessed

---

## Test 6: Integration Tests

### Test Full Workflow
1. **Create Source → Use in Embed → Edit Embed → Save**
   - Create a new Source with variables
   - Create an Embed using that Source
   - Edit variable values in the Embed
   - Save the Embed
   - Expected: Everything works end-to-end

2. **Edit Source → Check Staleness → Update Embed**
   - Edit a Source that's being used by an Embed
   - Open the Embed
   - Expected: Staleness banner appears
   - Click "Update Available"
   - Expected: Embed updates with new Source content

---

## Error Scenarios to Test

### Test Error Handling
1. **Invalid Data**
   - Try to access a non-existent Source
   - Expected: Error message displays, no crash

2. **Network Issues**
   - Simulate network failure (if possible)
   - Expected: Error handling works gracefully

3. **Missing Data**
   - Open an Embed with missing variable data
   - Expected: System handles gracefully, attempts recovery

---

## Console Checks

### What to Look For
- ✅ No errors related to `result.data` access
- ✅ No errors about `undefined` properties
- ✅ No errors about missing `success` property
- ✅ No TypeErrors about accessing properties of undefined

### Red Flags
- ❌ `Cannot read property 'data' of undefined`
- ❌ `result.data is undefined`
- ❌ `result.excerpt is undefined` (should be `result.data.excerpt`)
- ❌ `result.variableValues is undefined` (should be `result.data.variableValues`)

---

## Quick Smoke Test Checklist

Run through these quickly to verify basic functionality:

- [ ] Admin page loads
- [ ] Sources list displays
- [ ] Can open Source for editing
- [ ] Can create new Source
- [ ] Categories work
- [ ] Embed macro opens in Edit Mode
- [ ] Variables load in Embed
- [ ] Can edit and save variable values
- [ ] Toggles work
- [ ] Can save Embed
- [ ] Embed renders in View Mode
- [ ] Staleness detection works (if applicable)

---

## If Something Breaks

### Debugging Steps
1. **Check Browser Console**
   - Look for JavaScript errors
   - Check which resolver is failing
   - Note the exact error message

2. **Check Network Tab**
   - Look for failed API calls
   - Check the response format
   - Verify it matches `{ success: true, data: {...} }`

3. **Check Code**
   - Find the failing resolver in the code
   - Verify it returns the standardized format
   - Check frontend code that uses it
   - Verify it accesses `result.data.*` correctly

4. **Common Fixes**
   - If `result.data` is undefined: Check if resolver returns `{ success: true, data: {...} }`
   - If property is undefined: Check if frontend accesses `result.data.property`
   - If success check fails: Verify resolver returns `success: true/false`

---

## Success Criteria

✅ All tests pass
✅ No console errors
✅ All data loads correctly
✅ All saves work correctly
✅ No data loss
✅ Error handling works gracefully

---

## Next Steps After Testing

If all tests pass:
- Continue standardizing remaining resolvers
- Move to next batch (saveExcerpt, getAllExcerpts, etc.)

If tests fail:
- Document the failure
- Fix the issue
- Re-test
- Continue only after all tests pass

