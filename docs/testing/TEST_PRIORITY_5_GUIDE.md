# Test Priority 5: Version History & Recovery - Testing Guide

**Date:** 2025-11-25  
**Status:** Ready for Testing  
**Estimated Time:** 30-45 minutes

---

## Prerequisites

1. **Access to Admin Page** - You need admin access to the Blueprint App
2. **Test Embed with History** - You need an Embed that has been modified at least once (to have version history)
3. **Browser Console Open** - Keep DevTools open to check for errors

---

## Quick Test Checklist

### ✅ Test 5.1: View Version History

**Location:** Admin Page → Usage Details → "Recovery Options" button → Version History tab

**Steps:**
1. Open Admin page in Confluence
2. Click on a Source in the sidebar that has Embeds
3. In the Usage Details panel, find an Embed row
4. Click the "Recovery Options" button (or "Version History" button if available)
5. The Version History modal should open with the Embed UUID pre-filled
6. Click "Load History" (or it may auto-load)

**What to Check:**
- [ ] Modal opens without errors
- [ ] Version list displays (may be empty if no versions exist)
- [ ] Each version shows: timestamp, change type (CREATE/UPDATE/DELETE), size
- [ ] Versions are sorted newest first
- [ ] No console errors
- [ ] Response format in console: `{ success: true, data: { versions: [...], totalCount: number } }`

**If No Versions:**
- [ ] Error message displays: "No version history found for this Embed UUID"
- [ ] No crash, graceful handling

**Expected Console Output:**
```javascript
// Check Network tab or console for:
{
  success: true,
  data: {
    versions: [
      {
        versionId: "version:abc123:1699564800000",
        timestamp: "2025-11-25T...",
        changeType: "UPDATE",
        contentHash: "...",
        size: 1234,
        formattedTimestamp: "11/25/2025, 10:30:00 AM",
        shortHash: "abc12345",
        sizeKB: "1.21"
      },
      // ... more versions
    ],
    totalCount: 3,
    entityId: "embed-uuid-here"
  }
}
```

---

### ✅ Test 5.2: View Version Details

**Steps:**
1. From Test 5.1, click "View Details →" on any version
2. Review the detailed version information

**What to Check:**
- [ ] Version details load successfully
- [ ] Shows full version data: timestamp, contentHash, changeType, data payload
- [ ] Data preview shows structure (excerpt or macro-vars)
- [ ] "Restore from this Version" button is visible
- [ ] No console errors
- [ ] Response format: `{ success: true, data: { version: {...} } }`

**Expected Console Output:**
```javascript
{
  success: true,
  data: {
    version: {
      versionId: "version:abc123:1699564800000",
      timestamp: "2025-11-25T...",
      changeType: "UPDATE",
      contentHash: "...",
      data: {
        // Full Embed or Source data
        excerptId: "...",
        variableValues: {...},
        toggleStates: {...}
      },
      formattedTimestamp: "11/25/2025, 10:30:00 AM",
      shortHash: "abc12345",
      sizeBytes: 1234,
      sizeKB: "1.21",
      dataPreview: {
        type: "macro-vars",
        excerptId: "...",
        variableCount: 3,
        toggleCount: 2
      }
    }
  }
}
```

---

### ✅ Test 5.3: Restore from Version

**⚠️ WARNING:** This will modify live data. Test on a non-critical Embed first.

**Steps:**
1. From Test 5.2, click "Restore from this Version" button
2. Confirm the restore action in the dialog
3. Wait for restore to complete
4. Verify the Embed was restored (check the Embed on the page)

**What to Check:**
- [ ] Confirmation dialog appears with clear warning
- [ ] Restore operation completes successfully
- [ ] Success message displays with backup information
- [ ] Version list refreshes (showing new backup version)
- [ ] Embed on page reflects restored data
- [ ] No console errors
- [ ] Response format: `{ success: true, data: { storageKey: string, versionId: string, backupVersionId: string, message: string } }`

**Expected Console Output:**
```javascript
{
  success: true,
  data: {
    storageKey: "macro-vars:embed-uuid",
    versionId: "version:abc123:1699564800000",
    backupVersionId: "version:abc123:1732564800000", // New backup created
    message: "Successfully restored from version"
  }
}
```

**After Restore:**
- [ ] Check that a new version entry appears in the version list (the backup)
- [ ] Verify the Embed content matches the restored version

---

### ✅ Test 5.4: List Backups

**Steps:**
1. Open browser console (F12)
2. Run: `await invoke('listBackups')`
3. Check the response

**What to Check:**
- [ ] Backup list loads successfully
- [ ] Response format: `{ success: true, data: { backups: [...], count: number } }`
- [ ] Backups sorted by creation date (most recent first)
- [ ] Each backup includes metadata
- [ ] No console errors

**Expected Console Output:**
```javascript
{
  success: true,
  data: {
    backups: [
      {
        key: "backup-20251125-103000:metadata",
        createdAt: "2025-11-25T10:30:00Z",
        embedCount: 5,
        operationType: "restore"
      },
      // ... more backups
    ],
    count: 3
  }
}
```

---

## Error Scenario Tests

### ❌ Test E.1: Invalid Entity ID

**Steps:**
1. Open Version History modal
2. Leave UUID field empty, click "Load History"
3. Or enter invalid UUID (non-existent)

**What to Check:**
- [ ] Validation error displayed: "Please enter a valid Embed UUID" (frontend)
- [ ] Or backend error: "entityId is required and must be a non-empty string"
- [ ] Error code present: `VALIDATION_REQUIRED` (if using error codes)
- [ ] No crash, graceful error handling

**Expected Response:**
```javascript
{
  success: false,
  error: "entityId is required and must be a non-empty string",
  errorCode: "VALIDATION_REQUIRED", // If error codes implemented
  versions: [],
  totalCount: 0
}
```

---

### ❌ Test E.2: No Version History

**Steps:**
1. Load version history for a brand new Embed (never modified)

**What to Check:**
- [ ] Graceful handling: Empty array or "No version history found" message
- [ ] No crash
- [ ] User-friendly message displayed

**Expected Response:**
```javascript
{
  success: true,
  data: {
    versions: [],
    totalCount: 0,
    entityId: "new-embed-uuid"
  }
}
```

Or:
```javascript
{
  success: false,
  error: "No version history found for this Embed UUID"
}
```

---

### ❌ Test E.3: Invalid Version ID

**Steps:**
1. In browser console, run: `await invoke('getVersionDetails', { versionId: '' })`
2. Or: `await invoke('getVersionDetails', { versionId: 'invalid-version-id' })`

**What to Check:**
- [ ] Validation error for empty versionId
- [ ] Or "Version not found" error for invalid but formatted versionId
- [ ] User-friendly error message
- [ ] Error code present (if using error codes)

**Expected Response:**
```javascript
// Empty versionId
{
  success: false,
  error: "versionId is required and must be a non-empty string",
  errorCode: "VALIDATION_REQUIRED" // If implemented
}

// Invalid versionId
{
  success: false,
  error: "Version not found: invalid-version-id",
  errorCode: "NOT_FOUND_VERSION" // If implemented
}
```

---

## Success Criteria Checklist

- [ ] **All 4 main tests pass** (5.1, 5.2, 5.3, 5.4)
- [ ] **All error scenarios handled gracefully** (E.1, E.2, E.3)
- [ ] **Standardized response format** - All resolvers return `{ success: true, data: {...} }` or `{ success: false, error: "..." }`
- [ ] **Error codes present** - Error responses include `errorCode` field (where implemented)
- [ ] **No console errors** - Clean error handling, no uncaught exceptions
- [ ] **User-friendly messages** - Errors display clearly to users
- [ ] **Version history works** - Users can view and restore versions successfully

---

## Notes

- **Test on non-critical data first** - Restore operations modify live data
- **Check browser console** - Look for errors, warnings, or unexpected responses
- **Verify data persistence** - After restore, refresh page to ensure changes persisted
- **Test with real data** - Use actual Embeds with version history for accurate results

---

## Reporting Results

After completing tests, update:
- `docs/testing/TEST_PRIORITY_5_VERSION_HISTORY.md` with actual results
- Mark each test as ✅ PASSED or ❌ FAILED
- Note any issues or unexpected behavior
- Document any error codes that are missing

---

## Next Steps After Testing

1. **If all tests pass:** Mark Priority 5 as complete in TODO.md
2. **If tests fail:** Document issues and create follow-up tasks
3. **If error codes missing:** Add error codes to validation errors in version-resolvers.js
4. **Update test plan:** Mark Priority 5 as tested in TESTING_PLAN_STANDARDIZED_RESOLVERS.md

