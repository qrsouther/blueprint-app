# Terminology Refactoring: Standardize to "Sources" and "Embeds"

## Problem Statement

The codebase currently uses inconsistent terminology:
- **Internal code** uses legacy terms: "Excerpts" and "Includes"
- **User-facing documentation** uses modern terms: "Sources" and "Embeds"
- **Frontend code** mixes both terminologies

This creates cognitive dissonance when switching between documentation and code, making the codebase harder to understand for new developers.

## Terminology Mapping

| Current (Legacy) | Target (Standard) | Context |
|-----------------|-------------------|---------|
| `excerpt` | `source` | Blueprint Standard (the template) |
| `include` | `embed` | Embed instance (usage of a Source) |
| `excerptId` | `sourceId` | ID of a Source |
| `excerptName` | `sourceName` | Name of a Source |
| `excerptIndex` | `sourceIndex` | Index of all Sources |
| `saveExcerpt` | `saveSource` | Resolver function |
| `getExcerpt` | `getSource` | Resolver function |
| `macro-vars` | `macro-vars` | (Keep as-is - this is storage key) |
| `usage:{excerptId}` | `usage:{sourceId}` | Storage key pattern |

## Scope

### Files Requiring Changes

**Backend/Resolvers:**
- `src/index.js` - Resolver registration (80+ resolver definitions)
- `src/resolvers/excerpt-resolvers.js` → `source-resolvers.js` (rename file)
- `src/resolvers/include-resolvers.js` → `embed-resolvers.js` (rename file)
- `src/resolvers/usage-resolvers.js` - Function names and variable names
- `src/resolvers/verification-resolvers.js` - Function names
- `src/resolvers/version-resolvers.js` - Variable names
- `src/resolvers/redline-resolvers.js` - Variable names
- All other resolver files that reference excerpts/includes

**Workers:**
- `src/workers/checkIncludesWorker.js` → `checkEmbedsWorker.js` (rename file)
- `src/workers/checkSourcesWorker.js` - Already correct name, but internal variables
- `src/workers/helpers/orphan-detector.js` - Function names and comments
- `src/workers/helpers/page-scanner.js` - Comments and variable names
- `src/workers/helpers/reference-repairer.js` - Function names
- `src/workers/helpers/usage-collector.js` - Function names and variable names

**Storage Layer:**
- `src/storage.js` - Function names (if used)
- Storage keys: `excerpt:*` → `source:*` (CRITICAL: Migration required)
- Storage keys: `excerpt-index` → `source-index` (CRITICAL: Migration required)
- Storage keys: `usage:{excerptId}` → `usage:{sourceId}` (CRITICAL: Migration required)

**Frontend Components:**
- `src/source-config.jsx` - Variable names (already uses "source" in some places)
- `src/source-display.jsx` - Variable names
- `src/EmbedContainer.jsx` - Variable names (already uses "embed" in some places)
- `src/components/admin/*.jsx` - All admin components
- All React hooks: `src/hooks/*.js`

**Utilities:**
- `src/utils/hash-utils.js` - Function names (`calculateContentHash` for excerpts)
- `src/utils/detection-utils.js` - Variable names
- `src/utils/version-manager.js` - Comments and variable names
- `src/utils/storage-validator.js` - Function names (`validateExcerptData`)

**Documentation:**
- `README.md` - Already uses correct terminology
- `TERMINOLOGY.md` - Update mapping table
- All `.md` files that reference legacy terms

## Migration Strategy

### Phase 1: Preparation (Low Risk)
1. **Audit all occurrences:**
   - Search codebase for `excerpt` (case-insensitive)
   - Search codebase for `include` (case-insensitive, but careful - "include" is a common word)
   - Document all files that need changes
   - Document all storage keys that need migration

2. **Create comprehensive mapping:**
   - List all function names to rename
   - List all variable names to rename
   - List all storage keys to migrate
   - List all file names to rename

3. **Plan storage migration:**
   - Create migration script to rename storage keys
   - Plan rollback strategy
   - Test migration on dev environment

### Phase 2: Backend Refactoring (Medium Risk)
1. **Rename resolver functions:**
   - Add aliases for backward compatibility (e.g., `resolver.define('saveSource', saveExcerptResolver)`)
   - Update all resolver function names
   - Update all internal variable names
   - Keep old names as deprecated aliases initially

2. **Rename utility functions:**
   - Update function names in utils
   - Update all call sites
   - Update JSDoc comments

3. **Rename worker files and functions:**
   - Rename files
   - Update imports
   - Update function names
   - Update variable names

### Phase 3: Storage Migration (HIGH RISK - Requires Careful Planning)
1. **Create migration worker:**
   - Script to rename all storage keys
   - `excerpt:*` → `source:*`
   - `excerpt-index` → `source-index`
   - `usage:{excerptId}` → `usage:{sourceId}` (update keys, not just values)

2. **Test migration thoroughly:**
   - Test on dev environment
   - Verify all data is preserved
   - Verify all references are updated
   - Test rollback procedure

3. **Execute migration:**
   - Run during maintenance window
   - Monitor for errors
   - Have rollback plan ready

### Phase 4: Frontend Refactoring (Medium Risk)
1. **Update React components:**
   - Rename variables
   - Update prop names
   - Update state variable names
   - Update function calls to resolvers

2. **Update React hooks:**
   - Rename query keys
   - Update function names
   - Update variable names

3. **Update all imports:**
   - Update file imports (for renamed files)
   - Update function imports

### Phase 5: Cleanup (Low Risk)
1. **Remove deprecated aliases:**
   - After confirming all code uses new names
   - Remove old resolver aliases
   - Remove old function names

2. **Update documentation:**
   - Update all `.md` files
   - Update code comments
   - Update JSDoc

3. **Final verification:**
   - Search for any remaining legacy terms
   - Verify all tests pass
   - Verify all functionality works

## Critical Considerations

### Storage Key Migration
**CRITICAL:** Storage keys are used throughout the system. Changing them requires:
- Migration script to rename all keys
- Update all code that reads/writes these keys
- Coordinate with any running workers
- Plan for zero-downtime migration or maintenance window

### Backward Compatibility
- Consider keeping old resolver names as aliases during transition
- Allows gradual migration
- Reduces risk of breaking changes

### Testing Strategy
- Unit tests for all renamed functions
- Integration tests for storage migration
- End-to-end tests for critical workflows
- Test rollback procedure

### Risk Assessment
- **High Risk:** Storage key migration (data loss risk)
- **Medium Risk:** Resolver function renaming (API contract changes)
- **Medium Risk:** Frontend refactoring (UI breakage risk)
- **Low Risk:** Variable/function name changes (internal only)

## Implementation Notes

### File Renaming
Files to rename:
- `src/resolvers/excerpt-resolvers.js` → `src/resolvers/source-resolvers.js`
- `src/resolvers/include-resolvers.js` → `src/resolvers/embed-resolvers.js`
- `src/workers/checkIncludesWorker.js` → `src/workers/checkEmbedsWorker.js`

### Storage Key Patterns
Storage keys to migrate:
- `excerpt:{id}` → `source:{id}`
- `excerpt-index` → `source-index`
- `usage:{excerptId}` → `usage:{sourceId}` (key itself, not just value)

### Resolver Function Names
Resolver functions to rename:
- `saveExcerpt` → `saveSource`
- `getExcerpt` → `getSource`
- `deleteExcerpt` → `deleteSource`
- `listExcerpts` → `listSources`
- `checkAllSources` → (already correct)
- `saveInclude` → `saveEmbed` (if exists)
- `getInclude` → `getEmbed` (if exists)
- All other resolver functions using legacy terms

## Success Criteria

- [ ] All code uses "Source" instead of "Excerpt"
- [ ] All code uses "Embed" instead of "Include"
- [ ] All storage keys migrated
- [ ] All resolver functions renamed
- [ ] All frontend components updated
- [ ] All documentation updated
- [ ] All tests pass
- [ ] No backward compatibility issues
- [ ] Zero data loss during migration

## Estimated Effort

- **Phase 1 (Preparation):** 4-6 hours
- **Phase 2 (Backend):** 8-12 hours
- **Phase 3 (Storage Migration):** 4-6 hours (plus testing)
- **Phase 4 (Frontend):** 6-8 hours
- **Phase 5 (Cleanup):** 2-4 hours

**Total:** 24-36 hours (3-5 days)

## Dependencies

- Complete current code review improvements first
- Ensure orphan detection is stable before storage migration
- Coordinate with any active development work

## Notes

- This is a **separate task** from the current code review improvements
- Should be done after critical bug fixes are complete
- Requires careful planning due to storage key migration
- Consider doing in phases to reduce risk
- Keep old names as aliases during transition for safety

