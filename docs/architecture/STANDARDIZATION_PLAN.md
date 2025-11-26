# Resolver Standardization Plan

## Strategy: Complete Backend First, Then Frontend

**Approach:**
1. ✅ Standardize ALL resolvers (backend only) - IN PROGRESS
2. ⏳ Update ALL frontend code to use new format - PENDING
3. ⏳ Comprehensive testing - PENDING

This avoids partial-state bugs and React Query cache mismatches.

---

## Progress Tracking

### ✅ Completed Resolvers
- `getCategories()` - ✅ Standardized
- `getAdminUrl()` - ✅ Standardized
- `setAdminUrl()` - ✅ Standardized
- `getExcerpts()` - ✅ Standardized
- `getExcerpt()` - ✅ Standardized
- `getPageTitle()` - ✅ Standardized
- `getVariableValues()` - ✅ Standardized

### 🔄 In Progress
- None

### ⏳ Remaining Resolvers to Standardize

#### simple-resolvers.js
- [ ] `saveCategories()` - Returns `{ success: true }`, needs `{ success: true, data: {} }`
- [ ] `queryStorage()` - Returns `{ success: true, exists, key, data, ... }`, needs wrapping
- [ ] `queryStorageMultiple()` - Returns `{ success: true, results, count }`, needs wrapping
- [ ] `getCachedContent()` - Needs checking
- [ ] `recoverOrphanedData()` - Partially standardized, needs review
- [ ] `detectVariablesFromContent()` - Needs checking
- [ ] `detectTogglesFromContent()` - Needs checking
- [ ] `getCanonicalLocalId()` - Needs checking
- [ ] `detectDeactivatedEmbeds()` - Needs checking
- [ ] `copyDeactivatedEmbedData()` - Needs checking
- [ ] `checkVersionStaleness()` - Needs checking
- [ ] `getCheckProgress()` - Needs checking
- [ ] `getMigrationStatus()` - Needs checking
- [ ] `getMultiExcerptScanProgress()` - Needs checking
- [ ] `saveCachedContent()` - Needs checking
- [ ] `getOrphanedUsage()` - Needs checking
- [ ] `getLastVerificationTime()` - Needs checking
- [ ] `setLastVerificationTime()` - Needs checking
- [ ] `getCurrentUser()` - Needs checking
- [ ] `getForgeEnvironment()` - Needs checking
- [ ] `bulkUpdateStorage()` - Needs checking
- [ ] `debugExcerpt()` - Needs checking

#### excerpt-resolvers.js
- [ ] `saveExcerpt()` - Returns data directly, needs `{ success: true, data: {...} }`
- [ ] `getAllExcerpts()` - Returns `{ success: true, excerpts: [...] }`, needs wrapping
- [ ] `updateExcerptContent()` - Needs checking
- [ ] `deleteExcerpt()` - Needs checking

#### include-resolvers.js
- [ ] `saveVariableValues()` - Returns `{ success: true }`, needs `{ success: true, data: {} }`
- [ ] `getCachedContent()` - Needs checking (might be duplicate)

#### usage-resolvers.js
- [ ] `trackExcerptUsage()` - Needs checking
- [ ] `removeExcerptUsage()` - Needs checking
- [ ] `getExcerptUsage()` - Needs checking
- [ ] `getExcerptUsageForCSV()` - Needs checking
- [ ] `getAllUsageCounts()` - Needs checking
- [ ] `pushUpdatesToPage()` - Needs checking

#### redline-resolvers.js
- [ ] `getRedlineQueue()` - Returns `{ embeds: [...], groups: {...} }`, needs wrapping
- [ ] `setRedlineStatus()` - Returns `{ success: true, localId, newStatus }`, needs wrapping
- [ ] `bulkSetRedlineStatus()` - Needs checking
- [ ] `checkRedlineStale()` - Needs checking
- [ ] `getConfluenceUser()` - Returns user object directly, needs wrapping
- [ ] `getRedlineStats()` - Returns stats object directly, needs wrapping
- [ ] `postRedlineComment()` - Returns `{ success: true, commentId, ... }`, needs wrapping

#### version-resolvers.js
- [ ] `getVersionHistory()` - Returns `{ success: true, versions, totalCount, entityId }`, needs wrapping
- [ ] `getVersionDetails()` - Returns `{ success: true, version: {...} }`, needs wrapping
- [ ] `restoreFromVersion()` - Returns `{ success: true, storageKey, versionId, ... }`, needs wrapping
- [ ] `startPruneVersions()` - Returns `{ success: true, jobId, progressId, ... }`, needs wrapping
- [ ] `pruneVersionsNow()` - Returns `{ success: true, prunedCount, ... }`, needs wrapping
- [ ] `getVersioningStatsResolver()` - Returns `{ success: true, stats: {...} }`, needs wrapping

#### restore-resolvers.js
- [ ] `listBackups()` - Returns `{ success: true, backups, count }`, needs wrapping
- [ ] `restoreDeletedEmbed()` - Needs checking

#### verification-resolvers.js
- [ ] `startCheckAllSources()` - Needs checking
- [ ] `startCheckAllIncludes()` - Needs checking
- [ ] `getCheckProgress()` - Needs checking (might be duplicate)

---

## Frontend Update Checklist

After all resolvers are standardized, update:

### Hooks (src/hooks/)
- [ ] `admin-hooks.js` - Update all hooks
- [ ] `embed-hooks.js` - Update all hooks (partially done)
- [ ] `redline-hooks.js` - Update all hooks

### Components (src/components/)
- [ ] All admin components
- [ ] All embed components
- [ ] All common components

### Direct invoke() calls
- [ ] Search for all `invoke()` calls
- [ ] Update to use `result.data.*` format

---

## Testing Plan

After all changes:
1. Admin page - Sources list, editing, categories
2. Embed macro - Variables, toggles, custom insertions
3. Redline queue - Status updates, queue loading
4. Version history - Viewing, restoring
5. Usage tracking - CSV export, usage counts
6. Storage browser - Query operations

