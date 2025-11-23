# Phase 2: Console Cleanup & Validation - Status

## Current Status

### 2.1 Console Cleanup - Partially Complete

**Files with console statements:**
1. ✅ **`src/utils/adf-utils.js`** - Has `console.warn` for safety warnings (appropriate, keep)
2. ⚠️ **`src/resolvers/migration-resolvers.js`** - Has 167 console.log/error statements (needs cleanup)
3. ✅ **`src/utils/storage-validator.js`** - Has 1 console.error in example comment (fine)
4. ✅ **`src/utils/forge-logger.js`** - Logging utility (intentional)
5. ✅ **`src/utils/logger.js`** - Logging utility (intentional)
6. ✅ **Backup files** (`.backup`, `.bak`) - Not active code

**Action Needed:**
- `migration-resolvers.js` already imports `forge-logger` but still uses `console.log/error` in many places
- These are one-time migration tools, but should still use structured logging
- **Recommendation:** Replace console statements with `forge-logger` functions (already imported)

### 2.2 Centralized Logging Strategy - Already Implemented ✅

**Good news:** The codebase already has a centralized logging strategy!

1. **Frontend logging:** `src/utils/logger.js`
   - Uses `debug` library with namespaces
   - Rate limiting built-in
   - Can be enabled/disabled via localStorage

2. **Backend logging:** `src/utils/forge-logger.js`
   - Structured logging with timestamps
   - Success/failure indicators
   - Function entry/exit tracking

**Action Needed:**
- Audit remaining console statements and migrate to appropriate logger
- Add ESLint rule to prevent new console.log statements (optional)

### 3.1 Input Validation - Not Started

**Status:** Need to add input validation to critical resolvers

**Priority files:**
- `src/resolvers/excerpt-resolvers.js` - `saveExcerpt()`
- `src/resolvers/include-resolvers.js` - `saveVariableValues()`, `saveInclude()`

**Action Needed:**
- Add validation at start of each resolver
- Use `validateExcerptData()` from `storage-validator.js`
- Return consistent error format

### 3.2 Storage.js Decision - Needs Decision

**Status:** `storage.js` IS being used, but inconsistently

**Current usage:**
- `src/pagePublishedHandler.js` - imports `getExcerpt` from `storage.js`
- `src/resolvers/injection-resolver.js` - imports `getExcerpt` from `storage.js`
- Most other resolvers use `storage` from `@forge/api` directly

**Decision needed:**
- **Option A:** Keep `storage.js`, refactor all code to use it consistently
- **Option B:** Remove `storage.js`, update 2 files to use storage directly

**Recommendation:** Option B (simpler, less code to maintain)

## Recommended Next Steps

### Immediate (This Session)
1. ✅ Document current status (this file)
2. ⏳ Add input validation to `saveExcerpt()` resolver
3. ⏳ Make decision on `storage.js` and implement

### Short Term
1. Clean up console statements in `migration-resolvers.js`
2. Add ESLint rule to prevent new console.log (optional)
3. Add input validation to other critical resolvers

### Long Term
1. Standardize all resolvers to use consistent patterns
2. Complete resolver return value standardization (Phase 4)

## Files to Review

- `src/resolvers/excerpt-resolvers.js` - Add input validation
- `src/resolvers/include-resolvers.js` - Add input validation  
- `src/resolvers/migration-resolvers.js` - Replace console statements
- `src/storage.js` - Decision: keep or remove
- `src/pagePublishedHandler.js` - Update if removing storage.js
- `src/resolvers/injection-resolver.js` - Update if removing storage.js

