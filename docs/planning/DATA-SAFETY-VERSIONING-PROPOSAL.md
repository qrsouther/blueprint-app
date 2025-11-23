# Data Safety & Versioning System Proposal

## Overview
4-phase implementation to eliminate data loss risk through versioning, validation, and automatic rollback capabilities.

## Phase 1: IMMEDIATE SAFETY PATCH (v7.16.0 - Deploy ASAP)
**Goal**: Make Check functions safe RIGHT NOW while versioning system is built

### Changes:
1. **Disable dangerous auto-conversion in Check All Sources**
   - Comment out lines 228-316 (Storage Format → ADF conversion)
   - Add warning log: "Conversion disabled pending versioning system"
   - Check function becomes pure checker (reports orphaned Sources only)

2. **Add pre-flight validation to all storage writes**
   - New `src/utils/storage-validator.js` utility
   - Validates ADF structure before storage.set()
   - Validates variable arrays are not empty when expected
   - Rejects write if validation fails

3. **Add Emergency Recovery UI**
   - New "🚨 Emergency Recovery" button in Admin Toolbar
   - Displays recent storage operations from logs
   - Manual rollback capability using soft-delete namespace

**Files Modified**:
- `src/resolvers/verification-resolvers.js` (disable conversion)
- `src/utils/storage-validator.js` (NEW - validation utility)
- `src/components/admin/AdminToolbar.jsx` (emergency recovery button)
- `src/admin-page.jsx` (wire up recovery modal)

**Deployment**: Immediately after approval (v7.16.0)

---

## Phase 2: VERSIONING INFRASTRUCTURE (v7.17.0 - 1-2 weeks)
**Goal**: Build contentHash-based versioning system with 14-day retention

### Architecture:

**Version Storage Keys**:
```
excerpt-version:{excerptId}:history → Array of version metadata
excerpt-version:{excerptId}:{contentHash} → Full version snapshot
macro-vars-version:{localId}:history → Array of version metadata
macro-vars-version:{localId}:{timestamp} → Full version snapshot
```

**Version Metadata Structure**:
```javascript
{
  versionId: "excerpt:abc123:hash456",
  excerptId: "abc123",
  contentHash: "hash456",
  createdAt: "2025-11-11T...",
  expiresAt: "2025-11-25T...", // 14 days from creation
  trigger: "checkAllSources_conversion",
  previousHash: "hash789",
  snapshot: { /* full excerpt data */ },
  integrity: {
    validated: true,
    variableCount: 5,
    adfValid: true
  }
}
```

### New Utilities (`src/utils/version-manager.js`):

**Core Functions**:
1. `saveVersion(type, id, data, trigger)` - Creates version snapshot
2. `listVersions(type, id)` - Lists all versions (within 14 days)
3. `getVersion(type, id, contentHash)` - Retrieves specific version
4. `restoreVersion(type, id, contentHash)` - Rolls back to version
5. `pruneExpiredVersions()` - Removes versions >14 days old
6. `validateIntegrity(data)` - Comprehensive data validation

**Integrity Validation Checks**:
- ADF structure valid (type: 'doc', version: 1, content array)
- Variables array not empty when variablePlaceholders exist in content
- contentHash matches actual content hash
- Required fields present (id, name, content, etc.)
- Usage references point to existing excerpts

**Auto-Pruning Strategy**:
- Run on app startup (resolver initialization)
- Run before creating new versions
- Deletes versions where `expiresAt < now()`
- Logs pruned count for monitoring

### New Resolver Functions:
- `getVersionHistory(req)` - Returns version list for UI
- `restoreFromVersion(req)` - User-triggered restore
- `validateAllData(req)` - Health check across all data

**Files Created**:
- `src/utils/version-manager.js` (NEW - 400-500 lines)
- `src/resolvers/version-resolvers.js` (NEW - 200-300 lines)

**Testing**: Deploy to staging environment, create test versions, verify 14-day pruning

---

## Phase 3: VERSIONED CHECK FUNCTIONS (v7.18.0 - After Phase 2)
**Goal**: Re-enable Check functions with automatic versioning & rollback

### Check All Sources Enhancement:

**New Workflow**:
```
1. Create version snapshot for each Source (before conversion)
2. Perform Storage Format → ADF conversion
3. Validate converted data (integrity checks)
4. If validation FAILS:
   - Auto-rollback to version snapshot
   - Log corruption details
   - Mark Source as "conversion-failed"
   - Continue to next Source
5. If validation PASSES:
   - Write converted data
   - Update contentHash
   - Mark conversion successful
6. Return summary: {converted: 5, failed: 2, rolledBack: 2}
```

**Integrity Checks After Conversion**:
- Variable count matches variablePlaceholder count in ADF
- Content is valid JSON ADF structure
- Content is not empty
- Variable names are unique
- contentHash verifies correctly

**Rollback Triggers**:
- ADF validation fails
- Variable extraction returns 0 when content has placeholders
- Content becomes empty/null
- JSON parse error
- contentHash mismatch after re-hashing

### Check All Embeds Enhancement:

**Add Versioning to Repair Operations**:
```
1. Before repairing broken reference:
   - Save version of current usage:{excerptId} data
2. Perform repair (update usage tracking)
3. Validate repair succeeded:
   - excerptId now present
   - excerpt actually exists in storage
4. If validation fails:
   - Rollback usage tracking to version
   - Log repair failure
```

**New "Validate Health" Function**:
- Separate from Check All Embeds
- Runs integrity checks on ALL data
- Non-destructive (no modifications)
- Reports: orphans, broken refs, integrity issues, staleness

**Files Modified**:
- `src/resolvers/verification-resolvers.js` (add versioning to checkAllSources)
- `src/workers/checkIncludesWorker.js` (add versioning to repairs)
- `src/resolvers/verification-resolvers.js` (new validateHealth function)

**UI Changes**:
- Check buttons show detailed results: "5 converted, 2 failed & rolled back"
- New "Validate Health" button (pure checker, no modifications)
- Rollback notifications with reason displayed

---

## Phase 4: VERSION MANAGEMENT UI (v7.19.0 - After Phase 3)
**Goal**: Give users visibility and control over versions

### New Admin Panel Section: "Data Health & Recovery"

**Version History Viewer**:
- Left panel: Select Source/Embed
- Right panel: Version timeline (last 14 days)
- Each version shows:
  - Timestamp
  - Trigger operation (user edit, check function, etc.)
  - Content hash
  - Integrity status
  - Restore button

**Health Dashboard**:
- Total Sources/Embeds count
- Integrity status (✅ all healthy / ⚠️ issues found)
- Version storage usage (MB)
- Last pruning timestamp
- "Run Health Check" button (non-destructive scan)

**Corruption Alerts**:
- New banner at top of Admin page if corruption detected
- Shows: "⚠️ 2 Sources recovered from corruption (auto-rollback)"
- Link to view recovery details
- Dismissible after review

**Manual Restore Flow**:
1. User selects Source in Version History
2. Sees timeline of versions
3. Clicks version to preview content
4. "Restore This Version" button
5. Confirmation modal showing diff
6. Restore creates new version (for undo capability)

**Files Created**:
- `src/components/admin/VersionHistoryPanel.jsx` (NEW)
- `src/components/admin/HealthDashboard.jsx` (NEW)
- `src/components/admin/CorruptionAlert.jsx` (NEW)

**Files Modified**:
- `src/admin-page.jsx` (add new panels/sections)
- `src/components/admin/AdminToolbar.jsx` (add health check button)

---

## Storage Impact Analysis

**Per-Source Storage**:
- Current: ~10KB (typical Source with ADF content)
- With versioning: ~70KB average over 14 days (assumes ~1 edit/week)
- 100 Sources: ~7MB for versions

**Per-Embed Storage**:
- Current: ~2KB (macro-vars config)
- With versioning: ~10KB average over 14 days (fewer edits)
- 1000 Embeds: ~10MB for versions

**Total for Typical Customer** (100 Sources, 1000 Embeds):
- Current: ~3MB
- With versioning: ~20MB
- Well within Forge storage limits (250MB per environment)

**Pruning Frequency**: Daily at midnight UTC (runs in background)

---

## Rollout Timeline

| Phase | Version | Timeline | Risk Level |
|-------|---------|----------|-----------|
| Phase 1: Safety Patch | v7.16.0 | Deploy this week | LOW - Only disabling dangerous code |
| Phase 2: Versioning Infrastructure | v7.17.0 | 1-2 weeks | MEDIUM - New storage patterns |
| Phase 3: Versioned Check Functions | v7.18.0 | +1 week | MEDIUM - Re-enabling with protection |
| Phase 4: Version UI | v7.19.0 | +1 week | LOW - UI only |

**Total Duration**: 3-4 weeks to full implementation

**Incremental Value**:
- Week 1: Immediate safety (no more corruption risk)
- Week 2-3: Versioning infrastructure (recovery capability)
- Week 3-4: Enhanced Check functions (safe auto-conversion)
- Week 4-5: Full UI control (user visibility)

---

## Testing Strategy

**Phase 1 Testing**:
- Verify Check All Sources reports orphans only (no conversion)
- Test validation utility rejects malformed ADF
- Test emergency recovery UI loads recent operations

**Phase 2 Testing**:
- Create 20+ versions, verify storage/retrieval
- Wait 15 days, verify auto-pruning works
- Test restore on staging environment
- Integrity validation catches known corruption patterns

**Phase 3 Testing**:
- Intentionally create malformed conversion (mock bug)
- Verify auto-rollback triggers
- Verify rollback restores correct version
- Test with 100+ Sources to verify performance

**Phase 4 Testing**:
- UI testing on version history navigation
- Test restore flow end-to-end
- Verify corruption alerts display correctly

---

## Success Metrics

**Primary Goal**: Zero data loss events
- Track: Corruption detection count
- Track: Auto-rollback success rate (target: 100%)
- Track: User-reported data loss incidents (target: 0)

**Secondary Goals**:
- Check All Sources conversion success rate >99%
- Version restore operations complete <2 seconds
- Storage overhead <25MB for typical customer

---

## Risk Mitigation

**What if versioning system itself has bugs?**
- Phase 1 safety patch protects you BEFORE versioning is live
- Phase 2 deployed to staging first for testing
- Versioning is additive (doesn't change existing storage patterns)

**What if rollback fails?**
- Emergency recovery UI (Phase 1) provides manual fallback
- Soft-delete namespace still available (existing pattern)
- Backup snapshots in Check All Embeds worker still run

**What if 14-day retention isn't enough?**
- Configurable in version-manager.js (change RETENTION_DAYS constant)
- Can export versions to external backup before pruning
- Can increase to 30/60 days if storage allows

**What if performance degrades?**
- Version saves run async (non-blocking)
- Pruning runs during low-usage times
- Version retrieval is direct lookup (no scanning)

---

## Open Questions

1. Should Phase 1 be deployed immediately or wait for staging testing?
2. Should we add export/import for versions (for external backup)?
3. Should corruption detection send webhook notifications (for monitoring)?

---

## Background Context

### Investigation Summary

**Critical Finding**: Both "Check All Sources" and "Check All Embeds" functions modify data in potentially dangerous ways.

**Check All Sources** (verification-resolvers.js:83-377):
- ⚠️ NOT NON-DESTRUCTIVE - Performs automatic data migration
- Automatically converts old Storage Format (XML string) to new ADF JSON format
- This conversion happens silently whenever a Source with string content is found
- Modifies: `excerpt.content`, `excerpt.variables`, `excerpt.contentHash`, `excerpt.updatedAt`
- **This is the likely source of past corruption issues** - if variable extraction has bugs, Sources get silently corrupted

**Check All Embeds** (checkIncludesWorker.js:1-725):
- ✅ SAFE BY DEFAULT (dry-run mode)
- Has two modes: dry-run (default, preview only) and live (deletes orphans)
- Creates backup snapshots before deletions
- Even in dry-run mode, actively repairs broken usage tracking
- Less risky than Check All Sources but still modifies data

### Corruption Patterns Observed

Based on user feedback, the following corruption patterns have been observed:
1. **Variables disappear or get duplicated** - Variable extraction from ADF produces wrong results
2. **Content becomes empty or malformed** - After Check runs, Source content is blank or has broken ADF structure
3. **Embeds lose their Source references** - Embeds become orphaned even though Source exists, usage tracking corrupted

### User Requirements

- **Priority**: Hybrid approach (quick safety patch first, then comprehensive versioning)
- **Auto-conversion**: Keep but add versioning/validation (safe auto-conversion with rollback)
- **Retention**: 14-day time-based retention (not version count)
- **Protection**: Designed to prevent all observed corruption patterns

---

**Last Updated**: 2025-11-11
**Status**: Approved - Ready for Phase 1 implementation
**Estimated Completion**: 3-4 weeks for all phases
