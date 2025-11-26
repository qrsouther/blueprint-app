# Test Priority 5: Version History & Recovery

**Status:** 🔄 IN PROGRESS  
**Date:** 2025-11-25  
**Priority:** High  
**Goal:** Verify standardized API contract works for all version history resolvers

---

## Test Cases

### Test 5.1: View Version History ✅
**Status:** ⏳ Pending  
**Resolvers tested:** `getVersionHistory`

**Steps:**
1. Open Admin page
2. Navigate to Usage Details for a Source that has Embeds
3. Click "Recovery Options" button on an Embed row
4. Click "Version History" tab (or use VersionHistoryModal directly)
5. Enter an Embed UUID (localId) or use the auto-filled UUID
6. Click "Load History"

**Expected Results:**
- ✅ Version list loads successfully
- ✅ No console errors
- ✅ Response format: `{ success: true, data: { versions: [...], totalCount: number, entityId: string } }`
- ✅ Versions display with timestamps, change types, and sizes
- ✅ Versions sorted by timestamp (newest first)

**Actual Results:**
- [ ] _To be filled after test_

---

### Test 5.2: View Version Details ✅
**Status:** ⏳ Pending  
**Resolvers tested:** `getVersionDetails`

**Steps:**
1. From Test 5.1, click "View Details →" on any version
2. Review the version details displayed

**Expected Results:**
- ✅ Version details load successfully
- ✅ Response format: `{ success: true, data: { version: {...} } }`
- ✅ Version data includes: timestamp, contentHash, changeType, data payload
- ✅ Data preview shows excerpt/macro-vars structure
- ✅ No console errors

**Actual Results:**
- [ ] _To be filled after test_

---

### Test 5.3: Restore from Version ✅
**Status:** ⏳ Pending  
**Resolvers tested:** `restoreFromVersion`

**Steps:**
1. From Test 5.2, click "Restore from this Version" button
2. Confirm the restore action
3. Verify the Embed was restored

**Expected Results:**
- ✅ Restore operation completes successfully
- ✅ Response format: `{ success: true, data: { storageKey: string, versionId: string, backupVersionId: string, message: string } }`
- ✅ Current version is backed up before restore (backupVersionId present)
- ✅ Embed configuration restored to selected version
- ✅ No console errors
- ✅ Success message displayed

**Actual Results:**
- [ ] _To be filled after test_

---

### Test 5.4: List Backups ✅
**Status:** ⏳ Pending  
**Resolvers tested:** `listBackups`

**Steps:**
1. Open Admin page
2. Navigate to Emergency Recovery modal (if accessible)
3. Or call resolver directly via browser console: `await invoke('listBackups')`

**Expected Results:**
- ✅ Backup list loads successfully
- ✅ Response format: `{ success: true, data: { backups: [...], count: number } }`
- ✅ Backups sorted by creation date (most recent first)
- ✅ Each backup includes metadata (timestamp, embed count, operation type)
- ✅ No console errors

**Actual Results:**
- [ ] _To be filled after test_

---

## Error Scenarios to Test

### Test E.1: Invalid Entity ID
**Steps:**
1. Try to load version history with empty/invalid UUID
2. Try to load version history with non-existent UUID

**Expected Results:**
- ✅ Validation error returned: `{ success: false, error: "entityId is required and must be a non-empty string" }`
- ✅ Error code: `VALIDATION_REQUIRED` (if using error codes)
- ✅ User-friendly error message displayed

**Actual Results:**
- [ ] _To be filled after test_

---

### Test E.2: No Version History
**Steps:**
1. Load version history for an Embed that has never been modified (no versions)

**Expected Results:**
- ✅ Graceful handling: `{ success: false, error: "No version history found" }` or empty array
- ✅ No crash, user-friendly message displayed
- ✅ No console errors

**Actual Results:**
- [ ] _To be filled after test_

---

### Test E.3: Invalid Version ID
**Steps:**
1. Try to get version details with invalid versionId

**Expected Results:**
- ✅ Validation error: `{ success: false, error: "versionId is required and must be a non-empty string" }`
- ✅ Or not found error if versionId format is valid but doesn't exist
- ✅ User-friendly error message

**Actual Results:**
- [ ] _To be filled after test_

---

## Success Criteria

✅ **All Priority 5 tests pass** - Version history functionality works  
✅ **All resolvers return standardized format** - `{ success: true, data: {...} }` or `{ success: false, error: "..." }`  
✅ **Error codes present** - Error responses include `errorCode` field where applicable  
✅ **No console errors** - Clean error handling  
✅ **Version history and restore functionality works as expected** - Users can view and restore versions

---

## Notes

- Focus on verifying the standardized API contract
- Check that error codes are returned correctly
- Verify user-friendly error messages are displayed
- Test both success and error paths
- Check browser console for any errors or warnings

---

## Test Results Summary

**Overall Status:** ⏳ Pending  
**Tests Passed:** 0 / 4  
**Tests Failed:** 0 / 4  
**Date Completed:** _To be filled_

