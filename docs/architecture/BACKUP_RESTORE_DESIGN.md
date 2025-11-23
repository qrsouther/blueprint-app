# Backup & Restore System Design

## Problem Statement

The `checkAllIncludes` worker can incorrectly identify valid embeds as orphaned (false positive), then **permanently delete** their configuration data (`macro-vars:{localId}`), causing unrecoverable data loss.

**User Impact:**
- Lost variable values
- Lost toggle states
- Lost custom insertions
- Lost internal notes
- Requires manual re-entry of all configuration

---

## Solution: Multi-Layered Data Protection

### Layer 1: Fix the Root Cause (Bug Fix)
Fix the ADF search logic to prevent false positives → See separate bug fix

### Layer 2: Safety-First Detection (Immediate Protection)
**CRITICAL CHANGE:** Orphan detection no longer automatically deletes data. Instead, Check All Embeds **detects and reports** orphaned embeds, but requires manual intervention to delete them. This prevents accidental data loss if a user accidentally deletes an Embed from their page and an Admin runs Check All Embeds before they can recover it.

### Layer 3: Soft Delete (When Manual Deletion Occurs)
When deletion is explicitly triggered, data is moved to `macro-vars-deleted:*` namespace instead of being permanently deleted.

### Layer 4: Automatic Backups (Safety Net)
Backup before any destructive operation (Check All Embeds creates a full snapshot before running).

### Layer 5: Version History System (Point-in-Time Recovery)
Automatic version snapshots are created before any modification or deletion, allowing restoration to any previous state within a 14-day retention window.

### Layer 6: Recovery UI (User-Facing Restore)
Admin page feature with two recovery modes:
- **Deleted Embeds**: Restore soft-deleted embeds from recovery namespace
- **Version History**: Restore any active embed to a previous version

---

## Current Implementation Status

### ✅ Phase 1: Safety-First Detection (COMPLETE - v7.16.0+)
**Status:** ✅ Implemented and deployed

**Key Change:** Check All Embeds now **detects** orphaned embeds but does **NOT** automatically delete them. Deletion must be done manually via Emergency Recovery UI.

**Implementation:**
- `orphan-detector.js` functions (`handlePageNotFound`, `handleOrphanedMacro`) detect orphans but only remove from usage tracking
- No automatic `storage.delete()` calls
- Orphans are reported in Check All Embeds results for manual review

**Benefits:**
- Prevents accidental data loss
- Gives users time to recover accidentally deleted embeds
- Admin can review before taking action

---

### ✅ Phase 2: Soft Delete System (COMPLETE - v7.16.0+)
**Status:** ✅ Implemented

**Concept:** When deletion is explicitly triggered (manual action), move data to deleted namespace instead of permanent deletion.

#### Storage Structure:
```javascript
// Active data (current)
`macro-vars:{localId}` → {
  excerptId: "abc123",
  variableValues: {...},
  toggleStates: {...},
  customInsertions: [...],
  internalNotes: [...],
  lastSynced: "2025-01-05T19:00:00Z",
  contentHash: "sha256-xyz..."
}

// Soft-deleted data (recoverable)
`macro-vars-deleted:{localId}` → {
  ...originalData,
  deletedAt: "2025-01-05T20:00:00Z",
  deletedBy: "checkAllIncludes",
  deletionReason: "Macro not found in page content",
  canRecover: true,
  pageId: "...",
  pageTitle: "..."
}
```

#### Implementation:
The `softDeleteMacroVars` function in `orphan-detector.js`:
- Creates version snapshot before deletion (Phase 4 integration)
- Moves data to `macro-vars-deleted:*` namespace
- Adds deletion metadata (timestamp, reason, recoverability flag)
- Removes from active namespace only when explicitly called (not automatic)

**Benefits:**
- Data recoverable for 90 days (retention period)
- No performance impact (separate namespace)
- Automatic cleanup after retention period (future enhancement)

---

### ✅ Phase 3: Snapshot Backups Before Destructive Ops (COMPLETE - v7.16.0+)
**Status:** ✅ Implemented

**Concept:** Take full backup before Check All Embeds runs

#### Storage Structure:
```javascript
`backup-{timestamp}:metadata` → {
  backupId: "backup-2025-01-05T20:00:00Z",
  createdAt: "2025-01-05T20:00:00Z",
  operation: "checkAllIncludes",
  totalEmbeds: 150,
  canRestore: true,
  version: "1.0"
}

`backup-{timestamp}:embed:{localId}` → {
  // Full snapshot of macro-vars data
  excerptId: "abc123",
  variableValues: {...},
  toggleStates: {...},
  // ... full config
}
```

#### Implementation:
- `backup-manager.js` provides `createBackupSnapshot()` function
- Called automatically in `checkIncludesWorker.js` before processing (Phase 1.5, 5-10% progress)
- Backup ID stored in progress results for recovery reference
- Backup creation failure is logged but doesn't block the check operation

**Benefits:**
- Full system state snapshot before risky operations
- Can restore entire system if check goes wrong
- Stored with operation metadata for audit trail

---

### ✅ Phase 4: Version History System (COMPLETE - v7.18.0+)
**Status:** ✅ Implemented and deployed

**Concept:** Automatic version snapshots with 14-day retention, allowing point-in-time restoration of any embed.

#### Storage Structure:
```javascript
`version:{entityId}:{timestamp}` → {
  versionId: "version:abc123:1704567890123",
  entityId: "abc123",
  entityType: "macro-vars",
  storageKey: "macro-vars:abc123",
  timestamp: "2025-01-05T20:00:00Z",
  contentHash: "sha256-xyz...",
  data: { /* full embed config */ },
  metadata: {
    changeType: "UPDATE" | "DELETE" | "CREATE",
    changedBy: "checkAllIncludes" | "user" | "migration",
    deletionReason: "...", // if DELETE
    ...
  }
}

`version-index:{entityId}` → {
  versions: [
    { versionId: "...", timestamp: "...", contentHash: "..." },
    ...
  ]
}
```

#### Implementation:
- `version-manager.js` provides `saveVersion()`, `listVersions()`, `getVersionDetails()`, `restoreFromVersion()`
- Automatic snapshots created before:
  - Embed deletions (via `softDeleteMacroVars`)
  - Source format conversions (via `checkAllSources`)
  - Any manual restore operations (creates backup of current state)
- 14-day retention period (configurable)
- Content hash-based deduplication (skips snapshot if content unchanged)
- Automatic pruning of expired versions (once per day)

**Benefits:**
- Point-in-time recovery for any embed
- Automatic protection without user intervention
- 14-day recovery window
- Content hash prevents duplicate snapshots

---

### ✅ Phase 5: Restore Functions (COMPLETE - v7.16.0+)
**Status:** ✅ Implemented

#### Function 1: Restore Single Embed from Soft Delete
**Location:** `src/resolvers/restore-resolvers.js` → `restoreDeletedEmbed()`

- Retrieves data from `macro-vars-deleted:*` namespace
- Validates `canRecover` flag
- Checks for conflicts (existing active embed)
- Restores to active namespace
- Removes deletion metadata
- Restores usage tracking
- Removes from deleted namespace

#### Function 2: Restore from Backup Snapshot
**Location:** `src/resolvers/restore-resolvers.js` → `restoreFromBackup()`

- Can restore specific embeds or all embeds from a backup
- Validates backup metadata
- Checks for conflicts (existing active embeds)
- Supports force overwrite option
- Returns detailed results (restored count, skipped count)

#### Function 3: List Available Backups
**Location:** `src/resolvers/restore-resolvers.js` → `listBackups()`

- Queries all backup metadata entries
- Returns sorted list (most recent first)
- Includes backup ID, timestamp, operation, embed count

#### Function 4: Restore from Version History
**Location:** `src/resolvers/version-resolvers.js` → `restoreFromVersion()`

- Retrieves version snapshot by versionId
- Creates backup of current state before restoring
- Restores embed to exact state from version snapshot
- Updates version history with restore operation
- Returns both restored version ID and backup version ID

#### Function 5: Get Version History
**Location:** `src/resolvers/version-resolvers.js` → `getVersionHistory()`

- Lists all versions for a given embed (by entityId)
- Returns sorted list (most recent first)
- Includes version metadata (timestamp, changeType, contentHash, size)

#### Function 6: Get Version Details
**Location:** `src/resolvers/version-resolvers.js` → `getVersionDetails()`

- Retrieves full version snapshot data
- Includes complete embed configuration
- Returns formatted for UI display

---

### ✅ Phase 6: Admin UI for Recovery (COMPLETE - v7.16.0+)
**Status:** ✅ Implemented and deployed

**Location:** `src/components/admin/EmergencyRecoveryModal.jsx`

#### Tab 1: Deleted Embeds
**Features:**
1. **View Soft-Deleted Embeds**
   - Lists all `macro-vars-deleted:*` entries (last 50, sorted by deletion time)
   - Shows: localId, excerptId, deletedAt, deletionReason, pageTitle, pageId
   - Displays recoverability status
   - Search/filter by localId, page title, or deletion reason

2. **Restore Functionality**
   - Individual restore button for each deleted embed
   - Shows success message with page details
   - Automatically removes from list after successful restore
   - Handles conflicts (embed already exists)

3. **Delete Orphaned Embeds by Page ID**
   - Permanent deletion tool for cleaning up test data
   - Enter comma-separated page IDs
   - Permanently deletes embeds on specified pages
   - Useful for cleaning up truly broken embeds

#### Tab 2: Version History (v7.18.0+)
**Features:**
1. **Lookup by Embed UUID**
   - Enter Embed UUID (localId) to view version history
   - Auto-loads when modal opens with `autoLoadEmbedUuid` prop
   - Shows helpful hint about finding UUID in Admin page

2. **Version List Display**
   - Lists all versions for the embed (sorted newest first)
   - Shows timestamp, change type (CREATE/UPDATE/DELETE), size, changedBy
   - Color-coded lozenges for change types
   - Click "View Details" to see full version data

3. **Version Details View**
   - Displays full version snapshot data
   - Shows variable values, toggle states, custom paragraphs, internal notes
   - Expandable JSON preview for full data inspection
   - "Restore This Version" button

4. **Restore from Version**
   - Creates automatic backup of current state before restoring
   - Confirmation dialog explains the restore process
   - Restores embed to exact state from selected version
   - Shows success message with backup version ID
   - Refreshes version list to show new backup

#### Integration Points:
- **Admin Toolbar**: "⤴️ Restore Version" button opens modal
- **Usage Grid**: "Recovery Options" button opens modal with version history tab pre-selected
- **Auto-load**: Can open directly to version history for a specific embed UUID

---

## Implementation Details

### Safety-First Workflow

1. **Check All Embeds Runs:**
   - Creates backup snapshot (Phase 1.5)
   - Detects orphaned embeds (does NOT delete)
   - Reports orphans in results
   - Removes from usage tracking only (safe operation)

2. **Admin Reviews Results:**
   - Sees list of orphaned embeds
   - Can investigate each one
   - Decides which ones to delete

3. **Manual Deletion (if needed):**
   - Admin uses Emergency Recovery UI
   - Selects embeds to delete
   - System creates version snapshot
   - Moves to soft-delete namespace
   - Removes from active namespace

4. **Recovery (if needed):**
   - Admin opens Emergency Recovery UI
   - Views soft-deleted embeds or version history
   - Restores desired embed/version
   - System restores to active namespace

### Version History Integration

Version snapshots are automatically created:
- **Before deletions**: When `softDeleteMacroVars()` is called
- **Before format conversions**: When `checkAllSources()` converts Storage Format → ADF JSON
- **Before restores**: When restoring from backup or version (creates backup of current state)

This ensures every destructive operation has a recovery path.

---

## Storage Impact Analysis

### Current State:
- ~2-3 embeds × ~1KB each = ~3KB total
- Negligible storage usage

### With Backup System:
- **Soft delete**: 2× current (3KB → 6KB) - persists until manual cleanup
- **Backups**: 1 full snapshot per Check All Embeds run
  - Assume 1 backup/week × 52 weeks = 52 backups/year
  - Each backup: ~3KB
  - Total: ~156KB/year
- **Version history**: 
  - 1 snapshot per embed modification
  - 14-day retention
  - Content hash deduplication reduces duplicates
  - Estimated: ~10-20KB for typical usage patterns
- **Total**: ~170KB/year - Very manageable for Forge storage limits

### Optimization:
- Content hash deduplication (version system)
- Automatic pruning of expired versions (14-day retention)
- Manual cleanup of old backups (future enhancement)

---

## Testing Plan

### Test 1: Safety-First Detection
1. Create test embed with variables
2. Delete embed macro from page
3. Run Check All Embeds
4. Verify embed is detected as orphaned but NOT deleted
5. Verify data still exists in `macro-vars:*` namespace
6. Manually delete via Emergency Recovery UI
7. Verify soft delete occurred

### Test 2: Soft Delete Recovery
1. Create test embed with variables
2. Manually trigger soft delete (via Emergency Recovery UI)
3. Verify data in `macro-vars-deleted:*`
4. Verify version snapshot was created
5. Call `restoreDeletedEmbed`
6. Verify full restoration
7. Verify usage tracking restored

### Test 3: Backup & Restore
1. Create 3 test embeds with different configs
2. Run Check All Embeds (creates backup)
3. Manually delete all 3 embeds
4. Restore from backup
5. Verify all 3 restored correctly

### Test 4: Version History Recovery
1. Create embed, save → generates version snapshot
2. Modify embed (variables, toggles)
3. Save → generates new version snapshot
4. Look up version history via Emergency Recovery UI
5. Restore to previous version
6. Verify embed restored to previous state
7. Verify backup of current state was created

---

## Future Enhancements

### Potential Improvements:
1. **Automatic Backup Cleanup**
   - Expire old backups after 90 days
   - Keep only last 10 backups (configurable)

2. **Backup Export/Import**
   - Download backups as JSON
   - Import backups from other environments

3. **Audit Log System**
   - Track all configuration changes
   - Filter by date, operation, embed
   - Export audit trail

4. **Scheduled Automatic Backups**
   - Daily/weekly automatic backups
   - Configurable schedule

5. **ContentHash-Based Recovery**
   - Store historical snapshots by contentHash
   - Deduplication across embeds
   - Point-in-time recovery by hash

---

## Documentation References

- **Emergency Recovery UI**: `src/components/admin/EmergencyRecoveryModal.jsx`
- **Version Manager**: `src/utils/version-manager.js`
- **Restore Resolvers**: `src/resolvers/restore-resolvers.js`
- **Version Resolvers**: `src/resolvers/version-resolvers.js`
- **Backup Manager**: `src/workers/helpers/backup-manager.js`
- **Orphan Detector**: `src/workers/helpers/orphan-detector.js`
- **Emergency Recovery Resolvers**: `src/resolvers/emergency-recovery-resolvers.js`

---

## Summary

The backup and restore system provides comprehensive data protection through multiple layers:

1. **Safety-First Detection**: Orphans are detected but not automatically deleted
2. **Soft Delete**: Manual deletions move data to recovery namespace
3. **Automatic Backups**: Full snapshots before risky operations
4. **Version History**: Automatic snapshots with 14-day retention
5. **Recovery UI**: Two-tab interface for deleted embeds and version history
6. **Restore Functions**: Complete API for all recovery scenarios

All phases are **COMPLETE** and deployed to production (v7.16.0 - v7.18.0+).
