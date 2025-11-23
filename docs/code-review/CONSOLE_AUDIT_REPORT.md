# Console Statement Audit Report

**Date:** 2025-11-22  
**Total Console Statements:** 1,036  
**Files with Console Statements:** 51

## Summary

After initial cleanup of critical files, we have 1,036 console statements remaining across 51 files.

## Files Already Cleaned ✅

1. `src/resolvers/excerpt-resolvers.js` - ✅ Cleaned (replaced with forge-logger)
2. `src/resolvers/verification-resolvers.js` - ✅ Partially cleaned (active functions done)
3. `src/workers/helpers/page-scanner.js` - ✅ Cleaned (removed all verbose logging)
4. `src/source-config.jsx` - ✅ Cleaned (removed DEBUG logs)
5. `src/components/common/StableTextfield.jsx` - ✅ Cleaned (removed update logs)

## Files to Clean (Prioritized)

### High Priority (Production Code - Frequent Execution)

1. **`src/admin-page.jsx`** - 93 statements
   - Admin UI component, fires frequently
   - Priority: HIGH

2. **`src/resolvers/simple-resolvers.js`** - 43 statements
   - Core resolver functions
   - Priority: HIGH

3. **`src/workers/checkSourcesWorker.js`** - 42 statements
   - Background worker, runs frequently
   - Priority: HIGH

4. **`src/index.js`** - 34 statements
   - Entry point, resolver registration
   - Priority: MEDIUM

5. **`src/resolvers/redline-resolvers.js`** - 30 statements
   - Redline queue operations
   - Priority: MEDIUM

6. **`src/hooks/redline-hooks.js`** - 28 statements
   - React Query hooks, fire on every render
   - Priority: HIGH

7. **`src/resolvers/storage-import-resolvers.js`** - 27 statements
   - Storage import operations
   - Priority: MEDIUM

8. **`src/workers/checkIncludesWorker.js`** - 20 statements
   - Background worker, runs frequently
   - Priority: HIGH

9. **`src/components/admin/EmergencyRecoveryModal.jsx`** - 17 statements
   - Admin UI component
   - Priority: MEDIUM

10. **`src/resolvers/excerpt-resolvers.js`** - 16 statements
    - Already partially cleaned, remaining are in other functions
    - Priority: MEDIUM

### Medium Priority (Production Code - Less Frequent)

11. **`src/workers/helpers/backup-manager.js`** - 13 statements
12. **`src/hooks/admin-hooks.js`** - 13 statements
13. **`src/components/admin/VersionHistoryModal.jsx`** - 13 statements
14. **`src/workers/storageImportWorker.js`** - 13 statements
15. **`src/workers/helpers/orphan-detector.js`** - 14 statements
16. **`src/workers/helpers/reference-repairer.js`** - 11 statements
17. **`src/resolvers/usage-resolvers.js`** - 12 statements
18. **`src/resolvers/storage-export-resolvers.js`** - 19 statements
19. **`src/workers/storageExportWorker.js`** - 11 statements
20. **`src/resolvers/restore-resolvers.js`** - 20 statements

### Low Priority (One-Time Use / Migration Code)

21. **`src/resolvers/migration-resolvers.js`** - 172 statements
    - Migration code, marked for deletion after production migration
    - Priority: LOW (will be deleted)

22. **`src/workers/migrationWorker.js`** - 28 statements
    - Migration worker, one-time use
    - Priority: LOW

23. **`src/resolvers/redline-migration.js`** - 7 statements
    - Migration code
    - Priority: LOW

### Expected Console Usage (No Action Needed)

- **`src/utils/forge-logger.js`** - 14 statements
  - ✅ Expected - This is the logging utility itself
  
- **`src/utils/logger.js`** - 2 statements
  - ✅ Expected - This is the logging utility itself
  
- **`src/utils/performance-logger.js`** - 14 statements
  - ✅ Expected - Performance logging utility

### Backup Files (Ignore)

- `src/embed-display.jsx.backup` - 6 statements
- `src/admin-page.jsx.backup` - 60 statements
- `src/resolvers/verification-resolvers.js.bak` - 79 statements

### Unused/Abandoned Code (Low Priority)

- `src/resolvers/injection-resolver.js` - 51 statements
- `src/resolvers/poc-injection-resolver.js` - 14 statements

## Recommended Cleanup Strategy

### Phase 1: High Priority Files (Immediate)
1. `src/admin-page.jsx` (93 statements)
2. `src/hooks/redline-hooks.js` (28 statements)
3. `src/workers/checkSourcesWorker.js` (42 statements)
4. `src/workers/checkIncludesWorker.js` (20 statements)
5. `src/resolvers/simple-resolvers.js` (43 statements)

### Phase 2: Medium Priority Files
6. `src/resolvers/redline-resolvers.js` (30 statements)
7. `src/index.js` (34 statements)
8. `src/resolvers/storage-import-resolvers.js` (27 statements)
9. `src/components/admin/EmergencyRecoveryModal.jsx` (17 statements)
10. Remaining worker helpers and admin components

### Phase 3: Low Priority / Deferred
- Migration code (will be deleted)
- Abandoned code (injection-resolvers)
- Backup files (ignore)

## Cleanup Guidelines

1. **Replace `console.log` with structured logging:**
   - Backend: Use `forge-logger.js` (logFunction, logPhase, logSuccess, logFailure, logWarning)
   - Frontend: Use `logger.js` with namespaces (logger.errors, logger.saves, etc.)

2. **Keep `console.error` for critical errors** (or replace with logFailure)

3. **Remove DEBUG logs** entirely (don't just comment them out)

4. **Gate verbose logging** behind debug flags if needed for troubleshooting

5. **Use rate limiting** for frequently-fired logs (already implemented in logger.js)

## Progress Tracking

- ✅ Critical files cleaned: 5 files
- 🔄 In progress: verification-resolvers.js (old function remaining)
- ⏳ Remaining: ~45 files with console statements

## Next Steps

1. Continue with Phase 1 high-priority files
2. Add ESLint rule to prevent new console.log statements
3. Document logging strategy in README

