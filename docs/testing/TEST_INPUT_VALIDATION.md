# Input Validation Test Cases

## Test Environment Setup

**Before testing:**
1. Open browser DevTools Console (to see validation errors)
2. Open browser DevTools Network tab (to see API calls)
3. Have a test Confluence page ready with at least one Source macro

---

## Test Suite 1: Backend Validation - saveExcerpt()

### Test 1.1: Missing excerptName
**Action:**
1. Open Admin UI
2. Click "Create Source" or edit existing Source
3. Leave "Blueprint Source Name" field empty
4. Click "Save"

**Expected Result:**
- ❌ Save fails
- Error message: "excerptName is required and must be a non-empty string"
- Error appears in console (backend log)
- Error displayed in UI (SectionMessage with error appearance)

**Actual Result:** _[Fill in after test]_

---

### Test 1.2: excerptName is not a string
**Action:**
1. Open browser console
2. Manually call resolver with invalid data:
   ```javascript
   await invoke('saveExcerpt', {
     excerptName: 12345,  // Number instead of string
     category: 'General',
     content: { type: 'doc', version: 1, content: [] }
   });
   ```

**Expected Result:**
- ❌ Save fails
- Error: "excerptName is required and must be a non-empty string"
- Error logged in console

**Actual Result:** _[Fill in after test]_

---

### Test 1.3: excerptName is empty string (whitespace only)
**Action:**
1. Open Create/Edit Source modal
2. Enter only spaces in "Blueprint Source Name" field: `"   "`
3. Click "Save"

**Expected Result:**
- ❌ Frontend validation catches it (doesn't send to backend)
- Error: "Source name is required and must be a non-empty string"
- Field shows red border (`isInvalid` prop)

**Actual Result:** _[Fill in after test]_

---

### Test 1.4: Invalid content type
**Action:**
1. Open browser console
2. Manually call resolver:
   ```javascript
   await invoke('saveExcerpt', {
     excerptName: 'Test Source',
     category: 'General',
     content: "not an object"  // String instead of ADF object
   });
   ```

**Expected Result:**
- ❌ Save fails
- Error: "content must be an ADF object"
- Error logged in console

**Actual Result:** _[Fill in after test]_

---

### Test 1.5: Content is array (not object)
**Action:**
1. Open browser console
2. Manually call resolver:
   ```javascript
   await invoke('saveExcerpt', {
     excerptName: 'Test Source',
     category: 'General',
     content: []  // Array instead of object
   });
   ```

**Expected Result:**
- ❌ Save fails
- Error: "content must be an ADF object"
- Error logged in console

**Actual Result:** _[Fill in after test]_

---

### Test 1.6: Invalid variableMetadata type
**Action:**
1. Open browser console
2. Manually call resolver:
   ```javascript
   await invoke('saveExcerpt', {
     excerptName: 'Test Source',
     category: 'General',
     content: { type: 'doc', version: 1, content: [] },
     variableMetadata: "not an array"  // String instead of array
   });
   ```

**Expected Result:**
- ❌ Save fails
- Error: "variableMetadata must be an array"
- Error logged in console

**Actual Result:** _[Fill in after test]_

---

### Test 1.7: Valid data (should succeed)
**Action:**
1. Open Create/Edit Source modal
2. Enter valid data:
   - Name: "Test Source"
   - Category: "General"
   - Content: (any valid ADF or empty)
3. Click "Save"

**Expected Result:**
- ✅ Save succeeds
- No validation errors
- Source is created/updated
- Modal closes (if create mode) or stays open (if edit mode)

**Actual Result:** _[Fill in after test]_

---

## Test Suite 2: Backend Validation - saveVariableValues()

### Test 2.1: Missing localId
**Action:**
1. Open browser console
2. Manually call resolver:
   ```javascript
   await invoke('saveVariableValues', {
     excerptId: 'some-excerpt-id',
     variableValues: {}
   });
   ```

**Expected Result:**
- ❌ Save fails
- Error: "localId is required and must be a non-empty string"
- Error logged in console

**Actual Result:** _[Fill in after test]_

---

### Test 2.2: Missing excerptId
**Action:**
1. Open browser console
2. Manually call resolver:
   ```javascript
   await invoke('saveVariableValues', {
     localId: 'some-local-id',
     variableValues: {}
   });
   ```

**Expected Result:**
- ❌ Save fails
- Error: "excerptId is required and must be a non-empty string"
- Error logged in console

**Actual Result:** _[Fill in after test]_

---

### Test 2.3: Invalid variableValues type
**Action:**
1. Open browser console
2. Manually call resolver:
   ```javascript
   await invoke('saveVariableValues', {
     localId: 'some-local-id',
     excerptId: 'some-excerpt-id',
     variableValues: []  // Array instead of object
   });
   ```

**Expected Result:**
- ❌ Save fails
- Error: "variableValues must be an object"
- Error logged in console

**Actual Result:** _[Fill in after test]_

---

### Test 2.4: Invalid customInsertions type
**Action:**
1. Open browser console
2. Manually call resolver:
   ```javascript
   await invoke('saveVariableValues', {
     localId: 'some-local-id',
     excerptId: 'some-excerpt-id',
     variableValues: {},
     customInsertions: "not an array"  // String instead of array
   });
   ```

**Expected Result:**
- ❌ Save fails
- Error: "customInsertions must be an array"
- Error logged in console

**Actual Result:** _[Fill in after test]_

---

### Test 2.5: Valid data (should succeed)
**Action:**
1. Open an Embed macro configuration
2. Fill in variable values
3. Click "Save" or auto-save triggers

**Expected Result:**
- ✅ Save succeeds
- No validation errors
- Variable values are saved
- UI updates to show saved values

**Actual Result:** _[Fill in after test]_

---

## Test Suite 3: Frontend Validation - CreateEditSourceModal

### Test 3.1: Empty name field (frontend validation)
**Action:**
1. Open Create/Edit Source modal
2. Leave "Blueprint Source Name" field empty
3. Click "Save"

**Expected Result:**
- ❌ Save button click is blocked (frontend validation)
- Field shows red border (`isInvalid={true}`)
- Error text appears below field: "Source name is required and must be a non-empty string"
- No API call is made (check Network tab)

**Actual Result:** _[Fill in after test]_

---

### Test 3.2: Whitespace-only name (frontend validation)
**Action:**
1. Open Create/Edit Source modal
2. Enter only spaces in name field: `"   "`
3. Click "Save"

**Expected Result:**
- ❌ Frontend validation catches it
- Field shows red border
- Error text appears
- No API call is made

**Actual Result:** _[Fill in after test]_

---

### Test 3.3: Error clears when typing
**Action:**
1. Open Create/Edit Source modal
2. Leave name field empty
3. Click "Save" (should show error)
4. Start typing in name field

**Expected Result:**
- ✅ Error text disappears immediately
- Red border disappears
- Field returns to normal state

**Actual Result:** _[Fill in after test]_

---

### Test 3.4: Backend error displayed in UI
**Action:**
1. Open Create/Edit Source modal
2. Enter valid name
3. Use browser console to manually trigger backend validation error:
   ```javascript
   // This would require modifying the payload to send invalid content
   // Or wait for a real backend validation error
   ```

**Expected Result:**
- ❌ If backend returns `{ success: false, error: '...' }`
- Error appears in `SectionMessage` with `appearance="error"`
- Error message is displayed to user
- Modal does not close

**Actual Result:** _[Fill in after test]_

---

### Test 3.5: Valid data saves successfully
**Action:**
1. Open Create/Edit Source modal
2. Enter valid data:
   - Name: "Test Source"
   - Category: "General"
3. Click "Save"

**Expected Result:**
- ✅ No validation errors
- Save succeeds
- Modal closes (or stays open in edit mode)
- Source appears in list

**Actual Result:** _[Fill in after test]_

---

## Test Suite 4: Backend Validation - updateExcerptContent()

### Test 4.1: Missing excerptId
**Action:**
1. Open browser console
2. Manually call resolver:
   ```javascript
   await invoke('updateExcerptContent', {
     content: { type: 'doc', version: 1, content: [] }
   });
   ```

**Expected Result:**
- ❌ Update fails
- Error: "excerptId is required and must be a non-empty string"
- Error logged in console

**Actual Result:** _[Fill in after test]_

---

### Test 4.2: Missing content
**Action:**
1. Open browser console
2. Manually call resolver:
   ```javascript
   await invoke('updateExcerptContent', {
     excerptId: 'some-excerpt-id'
   });
   ```

**Expected Result:**
- ❌ Update fails
- Error: "content is required"
- Error logged in console

**Actual Result:** _[Fill in after test]_

---

### Test 4.3: Invalid content type
**Action:**
1. Open browser console
2. Manually call resolver:
   ```javascript
   await invoke('updateExcerptContent', {
     excerptId: 'some-excerpt-id',
     content: "not an object"
   });
   ```

**Expected Result:**
- ❌ Update fails
- Error: "content must be an ADF object"
- Error logged in console

**Actual Result:** _[Fill in after test]_

---

### Test 4.4: Valid data (should succeed)
**Action:**
1. Edit a Source macro on a page
2. Change the content
3. Save (this triggers updateExcerptContent automatically)

**Expected Result:**
- ✅ Update succeeds
- No validation errors
- Content is updated
- Version snapshot is created

**Actual Result:** _[Fill in after test]_

---

## Test Suite 5: Backend Validation - deleteExcerpt()

### Test 5.1: Missing excerptId
**Action:**
1. Open browser console
2. Manually call resolver:
   ```javascript
   await invoke('deleteExcerpt', {});
   ```

**Expected Result:**
- ❌ Delete fails
- Error: "excerptId is required and must be a non-empty string"
- Error logged in console

**Actual Result:** _[Fill in after test]_

---

### Test 5.2: Invalid excerptId type
**Action:**
1. Open browser console
2. Manually call resolver:
   ```javascript
   await invoke('deleteExcerpt', {
     excerptId: 12345  // Number instead of string
   });
   ```

**Expected Result:**
- ❌ Delete fails
- Error: "excerptId is required and must be a non-empty string"
- Error logged in console

**Actual Result:** _[Fill in after test]_

---

### Test 5.3: Valid excerptId (should succeed)
**Action:**
1. Open Admin UI
2. Find an existing Source
3. Delete it

**Expected Result:**
- ✅ Delete succeeds (if excerpt exists)
- No validation errors
- Source is removed from list

**Actual Result:** _[Fill in after test]_

---

## Test Suite 6: Backend Validation - updateExcerptMetadata()

### Test 6.1: Missing excerptId
**Action:**
1. Open browser console
2. Manually call resolver:
   ```javascript
   await invoke('updateExcerptMetadata', {
     name: 'New Name'
   });
   ```

**Expected Result:**
- ❌ Update fails
- Error: "excerptId is required and must be a non-empty string"
- Error logged in console

**Actual Result:** _[Fill in after test]_

---

### Test 6.2: Invalid name type
**Action:**
1. Open browser console
2. Manually call resolver:
   ```javascript
   await invoke('updateExcerptMetadata', {
     excerptId: 'some-excerpt-id',
     name: 12345  // Number instead of string
   });
   ```

**Expected Result:**
- ❌ Update fails
- Error: "name must be a non-empty string"
- Error logged in console

**Actual Result:** _[Fill in after test]_

---

### Test 6.3: Valid data (should succeed)
**Action:**
1. Open Admin UI
2. Edit a Source's name or category
3. Save

**Expected Result:**
- ✅ Update succeeds
- No validation errors
- Metadata is updated
- Changes are reflected in UI

**Actual Result:** _[Fill in after test]_

---

## Test Suite 7: Backend Validation - massUpdateExcerpts()

### Test 7.1: Missing excerptIds
**Action:**
1. Open browser console
2. Manually call resolver:
   ```javascript
   await invoke('massUpdateExcerpts', {
     category: 'New Category'
   });
   ```

**Expected Result:**
- ❌ Update fails
- Error: "excerptIds is required and must be a non-empty array"
- Error logged in console

**Actual Result:** _[Fill in after test]_

---

### Test 7.2: excerptIds is not an array
**Action:**
1. Open browser console
2. Manually call resolver:
   ```javascript
   await invoke('massUpdateExcerpts', {
     excerptIds: "not an array",
     category: 'New Category'
   });
   ```

**Expected Result:**
- ❌ Update fails
- Error: "excerptIds is required and must be a non-empty array"
- Error logged in console

**Actual Result:** _[Fill in after test]_

---

### Test 7.3: Empty excerptIds array
**Action:**
1. Open browser console
2. Manually call resolver:
   ```javascript
   await invoke('massUpdateExcerpts', {
     excerptIds: [],
     category: 'New Category'
   });
   ```

**Expected Result:**
- ❌ Update fails
- Error: "excerptIds is required and must be a non-empty array"
- Error logged in console

**Actual Result:** _[Fill in after test]_

---

### Test 7.4: Invalid excerptId in array
**Action:**
1. Open browser console
2. Manually call resolver:
   ```javascript
   await invoke('massUpdateExcerpts', {
     excerptIds: [12345, 'valid-id'],  // First one is number
     category: 'New Category'
   });
   ```

**Expected Result:**
- ❌ Update fails
- Error: "All excerptIds must be non-empty strings"
- Error logged in console

**Actual Result:** _[Fill in after test]_

---

### Test 7.5: Valid data (should succeed)
**Action:**
1. Open Admin UI
2. Select multiple Sources
3. Change their category (if bulk update feature exists)

**Expected Result:**
- ✅ Update succeeds
- No validation errors
- All selected Sources are updated

**Actual Result:** _[Fill in after test]_

---

## Test Suite 8: Backend Validation - updateSourceMacroBody()

### Test 8.1: Missing pageId
**Action:**
1. Open browser console
2. Manually call resolver:
   ```javascript
   await invoke('updateSourceMacroBody', {
     excerptId: 'some-excerpt-id',
     content: { type: 'doc', version: 1, content: [] }
   });
   ```

**Expected Result:**
- ❌ Update fails
- Error: "pageId is required and must be a non-empty string"
- Error logged in console

**Actual Result:** _[Fill in after test]_

---

### Test 8.2: Missing excerptId
**Action:**
1. Open browser console
2. Manually call resolver:
   ```javascript
   await invoke('updateSourceMacroBody', {
     pageId: '12345',
     content: { type: 'doc', version: 1, content: [] }
   });
   ```

**Expected Result:**
- ❌ Update fails
- Error: "excerptId is required and must be a non-empty string"
- Error logged in console

**Actual Result:** _[Fill in after test]_

---

### Test 8.3: Missing content
**Action:**
1. Open browser console
2. Manually call resolver:
   ```javascript
   await invoke('updateSourceMacroBody', {
     pageId: '12345',
     excerptId: 'some-excerpt-id'
   });
   ```

**Expected Result:**
- ❌ Update fails
- Error: "content is required"
- Error logged in console

**Actual Result:** _[Fill in after test]_

---

### Test 8.4: Invalid content type
**Action:**
1. Open browser console
2. Manually call resolver:
   ```javascript
   await invoke('updateSourceMacroBody', {
     pageId: '12345',
     excerptId: 'some-excerpt-id',
     content: "not an object"
   });
   ```

**Expected Result:**
- ❌ Update fails
- Error: "content must be an ADF object"
- Error logged in console

**Actual Result:** _[Fill in after test]_

---

### Test 8.5: Valid data (should succeed)
**Action:**
1. Edit a Source macro on a page
2. Change the macro body content
3. Save

**Expected Result:**
- ✅ Update succeeds
- No validation errors
- Macro body is updated on page

**Actual Result:** _[Fill in after test]_

---

## Test Suite 9: Integration Tests - Frontend + Backend

### Test 9.1: Frontend catches error, backend never called
**Action:**
1. Open Create/Edit Source modal
2. Leave name field empty
3. Click "Save"
4. Check Network tab

**Expected Result:**
- ❌ Frontend validation prevents save
- No API call to `saveExcerpt` in Network tab
- Error shown in UI immediately
- Backend validation never runs

**Actual Result:** _[Fill in after test]_

---

### Test 9.2: Frontend passes, backend catches error
**Action:**
1. Open Create/Edit Source modal
2. Enter valid name
3. Use browser console to modify the payload to send invalid content:
   ```javascript
   // This would require intercepting the invoke call
   // Or modifying the component code temporarily
   ```

**Expected Result:**
- ✅ Frontend validation passes
- API call is made
- ❌ Backend validation catches error
- Error returned: `{ success: false, error: '...' }`
- Error displayed in UI via SectionMessage

**Actual Result:** _[Fill in after test]_

---

### Test 9.3: Both validations pass
**Action:**
1. Open Create/Edit Source modal
2. Enter all valid data
3. Click "Save"

**Expected Result:**
- ✅ Frontend validation passes
- ✅ Backend validation passes
- Save succeeds
- Data is stored correctly
- UI updates to show success

**Actual Result:** _[Fill in after test]_

---

## Test Suite 10: Edge Cases

### Test 10.1: null vs undefined
**Action:**
1. Test with `null` values:
   ```javascript
   await invoke('saveExcerpt', {
     excerptName: null,
     category: null,
     content: null
   });
   ```

**Expected Result:**
- ❌ Validation catches null values
- Appropriate error messages

**Actual Result:** _[Fill in after test]_

---

### Test 10.2: Empty arrays vs undefined
**Action:**
1. Test with empty arrays (should be valid):
   ```javascript
   await invoke('saveExcerpt', {
     excerptName: 'Test',
     category: 'General',
     content: { type: 'doc', version: 1, content: [] },
     documentationLinks: []  // Empty array should be valid
   });
   ```

**Expected Result:**
- ✅ Empty arrays are valid (validation only checks if provided, not if empty)
- Save succeeds

**Actual Result:** _[Fill in after test]_

---

### Test 10.3: Very long strings
**Action:**
1. Enter a very long name (1000+ characters)
2. Try to save

**Expected Result:**
- ✅ Validation passes (no length limit currently)
- Save succeeds (or fails for other reasons like storage limits)

**Actual Result:** _[Fill in after test]_

---

### Test 10.4: Special characters in name
**Action:**
1. Enter name with special characters: `"Test & Source <with> tags"`
2. Try to save

**Expected Result:**
- ✅ Validation passes (no character restrictions)
- Save succeeds

**Actual Result:** _[Fill in after test]_

---

## Test Summary

**Total Test Cases:** 40+

**Categories:**
- Backend validation: 25+ tests
- Frontend validation: 5+ tests
- Integration: 3+ tests
- Edge cases: 4+ tests

**Priority:**
- **High Priority:** Tests 1.1-1.7, 2.1-2.5, 3.1-3.5 (core functionality)
- **Medium Priority:** Tests 4.1-4.4, 5.1-5.3, 6.1-6.3 (update/delete operations)
- **Low Priority:** Tests 7.1-7.5, 8.1-8.5, 9.1-9.3, 10.1-10.4 (edge cases and integration)

---

## Notes for Testing

1. **Browser Console Testing:**
   - Use `invoke()` function directly in console
   - Check for error responses
   - Verify error format: `{ success: false, error: '...' }`

2. **UI Testing:**
   - Watch for red borders on invalid fields
   - Check for error messages below fields
   - Verify SectionMessage appears for general errors

3. **Network Tab:**
   - Verify API calls are made (or not made) as expected
   - Check response format matches expectations

4. **Console Logs:**
   - Backend validation errors are logged via `logFailure()`
   - Check Forge logs for validation messages

---

## Expected Outcomes

**All tests should:**
- ✅ Catch invalid data before it's saved
- ✅ Display clear, user-friendly error messages
- ✅ Prevent data corruption
- ✅ Provide good user experience (errors clear when typing)

**If any test fails:**
- Note which test failed
- Note the actual vs expected behavior
- Check console for error messages
- Check Network tab for API calls

