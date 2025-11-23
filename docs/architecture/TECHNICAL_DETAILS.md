# Technical Details

## 📐 Source Macro Technical Details

### Storage and Hashing

- **Storage:** Stores to Forge key-value storage (`excerpt:{id}`)
- **Content Hashing:** SHA-256 content hashing for semantic change detection

## 🔗 Embed Macro Technical Details

### Instance Configuration and Staleness Detection

- **Instance Config:** Instance config stored in `macro-vars:{localId}` (variables, toggles, custom insertions)
- **Staleness Detection:** Hash-based staleness detection (knows when Source has changed)

## 🔧 Admin Page URL Management

The Admin page URL is automatically detected and stored when the admin page first loads. The "Admin View" button in Source macro configuration will use this dynamically stored URL.

**How it works:**
- When the Admin page loads, it automatically stores its URL in Forge storage
- Source macro configuration retrieves this stored URL dynamically
- No manual configuration needed after initial installation

**Fallback behavior:** If the dynamic URL isn't available (e.g., on first load before admin page has been accessed), the system falls back to a default URL. This ensures the "View Admin" button always works, even if the admin page hasn't been visited yet.

---

## 🔧 Refactoring Progress (main branch)

**Current Version:** 7.15.0
**Status:** ALL PHASES COMPLETE ✅ (Phases 1-7) - Merged to main

This branch contains a major refactoring effort to modularize the monolithic `index.js` file into maintainable, organized resolver modules.

### ✅ Completed Phases

#### **Phase 1: Create Utils Module** ✅
- Extracted `generateUUID` utility function to `src/utils.js`
- **Result:** Foundation for modular architecture established

#### **Phase 2: Create Detection Utils Module** ✅
- Extracted `detectVariables` and `detectToggles` to `src/utils/detection-utils.js`
- Extracted `extractTextFromAdf` helper function
- **Result:** Core detection logic separated from business logic

#### **Phase 3: Create Excerpt Resolvers Module** ✅
- Extracted all excerpt CRUD operations to `src/resolvers/excerpt-resolvers.js`:
  - `saveExcerpt` - Create/update excerpts
  - `updateExcerptContent` - Auto-update from Source macro changes
  - `getAllExcerpts` - Fetch all excerpts with details
  - `deleteExcerpt` - Remove excerpts
  - `updateExcerptMetadata` - Edit name/category
  - `massUpdateExcerpts` - Bulk operations
- **Result:** Core business logic cleanly separated (~286 lines extracted)

#### **Phase 4: Create Migration Resolvers Module** ✅
- Extracted all one-time migration operations to `src/resolvers/migration-resolvers.js`:
  - 7 migration functions (~1,644 lines)
  - Hidden migration UI via `SHOW_MIGRATION_TOOLS` feature flag
  - Added comprehensive deletion markers throughout codebase
- **Result:** `index.js` reduced from 2,703 → 1,103 lines (60% reduction!)

#### **Phase 5: Create Verification Resolvers Module** ✅
- Extracted all health-check and verification operations to `src/resolvers/verification-resolvers.js`:
  - `sourceHeartbeat` - Track Source macro activity
  - `checkAllSources` - Verify all Source macros + clean stale entries
  - `checkAllIncludes` - Production "Check All Embeds" feature with progress tracking (~353 lines)
- **Result:** `index.js` reduced from 1,103 → 570 lines (48% reduction!)

#### **Phase 6: Create Usage Resolvers Module** ✅
- Extracted usage tracking and push update operations to `src/resolvers/usage-resolvers.js`:
  - `trackExcerptUsage`, `removeExcerptUsage`, `getExcerptUsage` - Track where excerpts are used
  - `pushUpdatesToAll`, `pushUpdatesToPage` - Force-refresh Embed instances
- **Result:** `index.js` reduced from 570 → 285 lines (50% reduction!)

#### **Phase 7: Create Embed Resolvers Module** ✅
- Extracted Embed instance configuration to `src/resolvers/include-resolvers.js`:
  - `saveVariableValues` - Save Embed configuration (variables, toggles, custom insertions)
- **Result:** `index.js` reduced from 285 → 204 lines (final target achieved!)

### 📊 Impact Summary

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| **index.js size** | 2,703 lines | 204 lines | **-2,499 lines (-92.5%)** |
| **Modular files** | 1 file | 12 files | **+11 files** |
| **Resolver modules** | 1 monolith | 8 organized modules | **Feature-based organization** |
| **Maintainability** | Low | High | **Dramatically improved** |
| **Code discoverability** | Hunt through 2,700 lines | Navigate to 200-line chapter | **13x faster** |

### 📁 Final File Structure

```
src/
├── index.js (204 lines) ← 92.5% smaller! Pure routing/registration
├── utils.js - Core utilities
├── utils/
│   ├── detection-utils.js - Variable/toggle detection
│   ├── adf-utils.js - ADF parsing utilities
│   ├── storage-utils.js - Storage operations
│   └── migration-utils.js - Migration helpers
└── resolvers/
    ├── simple-resolvers.js (300 lines) - Simple getters/setters
    ├── excerpt-resolvers.js (286 lines) - Excerpt CRUD operations
    ├── verification-resolvers.js (547 lines) - Health checks & verification
    ├── usage-resolvers.js (380 lines) - Usage tracking & push updates
    ├── include-resolvers.js (116 lines) - Embed instance configuration
    └── migration-resolvers.js (1,644 lines) - One-time migration tools ⚠️
```

### 🗑️ Ready for Deletion (Post-Production Migration)

All one-time migration code is clearly marked with `⚠️ ONE-TIME USE` warnings and ready for deletion after production setup:
- `src/resolvers/migration-resolvers.js` (entire file)
- Migration-related code in `index.js`, `simple-resolvers.js`, and `admin-page.jsx`
- See `migration-resolvers.js:10-16` for complete deletion checklist

### 🎯 Benefits Achieved

1. **Dramatically improved code organization** - Related functions grouped logically
2. **Easier maintenance** - Changes isolated to specific modules
3. **Better testing potential** - Modules can be tested independently
4. **Reduced cognitive load** - Developers can focus on one concern at a time
5. **Clear migration path** - One-time code clearly marked for future deletion

---

## 🚀 Performance Strategy Evolution

We evaluated three approaches to optimize Embed macro rendering:

#### **Original Approach (Baseline)**
- Each Embed calls backend on page load
- Fetches excerpt from storage, performs variable substitution
- Performance: ~1-2 second initial load per Embed

#### **Option 1: Pre-rendered Content (Not Implemented)**
- Store fully rendered content in Embed config
- Zero backend calls, instant display
- **Trade-off:** Manual refresh needed when Source changes
- **Performance:** Instant (0ms) - best possible
- **Use case:** Ideal when Sources rarely change

#### **Option 4: Optimistic Rendering (Current Implementation)** ⭐
- Store cached content in Embed config
- Display cached content immediately
- Refresh from source in background
- **Trade-off:** Brief network activity after initial display
- **Performance:** Instant perceived load (~100ms) + background refresh
- **Use case:** Balance of performance and maintainability

---

## 🎯 Current Implementation

**Version:** 7.12.0
**Architecture:** Option 4 - Optimistic Rendering with Background Refresh

### How It Works

1. **Blueprint App Source Macro** - Create reusable content blocks with variables
2. **Blueprint App Embed Macro** - Reference and display excerpts with variable substitution
3. **Performance Strategy:**
   - Cached content stored in Embed config for instant display
   - Background refresh from source ensures content stays up-to-date
   - Best of both worlds: instant rendering + automatic updates

### On Page Load (Detailed Flow)

When a page with Embed macros loads, here's exactly what happens:

#### 1. **Instant Display (0-100ms)**
   - Embed macro reads `cachedContent` from its config
   - Immediately displays the cached content
   - **User sees content right away** - no "Loading..." message
   - Page is interactive and ready to use

#### 2. **Background Check (happens simultaneously, doesn't block display)**
   - Embed calls `invoke('getExcerpt', { excerptId })` in the background
   - Fetches the latest Source excerpt from storage
   - Performs variable substitution with current variable values
   - Compares the fresh content to the cached content

#### 3. **Conditional Update (if needed)**
   - **If content unchanged:** Does nothing, keeps showing cached version
   - **If content changed:** Silently updates the display with fresh content
   - User might briefly see old content (~500ms-1s), then it smoothly updates

### Example Timeline

```
0ms:    Page loads
100ms:  Include displays cached "They are a full stack client." ← User sees this
100ms:  Background fetch starts (doesn't block anything)
500ms:  Source excerpt fetched and compared
600ms:  Content changed! Update display to "They are a full-stack agency."
```

### What Gets Cached

When you save an Embed config, it stores:
```javascript
{
  excerptId: "abc-123",
  variableValues: {
    "stack-model": "full stack",
    "client": "Acme"
  },
  cachedContent: "Acme is a full stack organization."  // ← Pre-rendered result
}
```

The `cachedContent` is the fully rendered excerpt with all variables substituted, ready for instant display.

