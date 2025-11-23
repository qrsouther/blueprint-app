# storage.js Analysis: Keep or Remove?

## What storage.js Does (Simple Terms)

`storage.js` is a **wrapper/helper layer** that sits on top of Forge's storage API. Think of it like this:

**Without storage.js (what most code does now):**
```javascript
// Direct access - you do everything manually
const excerpt = await storage.get(`excerpt:${id}`);
await storage.set(`excerpt:${id}`, newExcerpt);
await storage.set('excerpt-index', index); // Manual index update
```

**With storage.js (what it's supposed to do):**
```javascript
// Helper functions - automatic caching, index updates, etc.
const excerpt = await getExcerpt(id); // Checks cache first!
await saveExcerpt(newExcerpt); // Automatically updates index
```

### Features storage.js Provides:

1. **Caching** - `getExcerpt()` checks cache first, then storage
2. **Automatic Index Updates** - `saveExcerpt()` automatically updates the excerpt-index
3. **Usage Tracking** - `saveInclude()` automatically tracks where excerpts are used
4. **Batch Operations** - `batchGetExcerpts()` for fetching multiple at once
5. **Helper Functions** - `getAllExcerpts()`, `searchExcerpts()`, etc.

## The Problem: It's Not Being Used

### Current Usage:
- ✅ **2 files use it:**
  - `src/pagePublishedHandler.js` - uses `getExcerpt()`
  - `src/resolvers/injection-resolver.js` - uses `getExcerpt()`

- ❌ **Most code doesn't use it:**
  - `src/resolvers/excerpt-resolvers.js` - uses `storage.get/set` directly
  - `src/resolvers/include-resolvers.js` - uses `storage.get/set` directly
  - All other resolvers - use `storage` directly

### The Mismatch:

**storage.js structure:**
```javascript
{
  id,
  name,
  pageId,
  spaceKey,
  category,
  content,
  variables: [],
  variants: [],  // ← Not used in actual code
  metadata: {    // ← Different structure
    createdAt,
    updatedAt,
    createdBy,
    version
  }
}
```

**Actual code structure (excerpt-resolvers.js):**
```javascript
{
  id,
  name,
  category,
  content,
  variables: [],
  toggles: [],   // ← storage.js doesn't have this
  documentationLinks: [], // ← storage.js doesn't have this
  sourcePageId,  // ← Different field name
  sourceSpaceKey, // ← Different field name
  createdAt,    // ← Flat, not in metadata
  updatedAt,    // ← Flat, not in metadata
  contentHash   // ← storage.js doesn't have this
}
```

**They don't match!** The actual code has evolved, but `storage.js` hasn't been updated.

## Why Remove It?

### 1. **Confusion - Two Ways to Do the Same Thing**
- New developers see `storage.js` and think "this is the right way"
- But most code uses `storage` directly
- Which one is correct? 🤷

### 2. **Outdated Structure**
- `storage.js` uses old data structure (metadata object, variants, etc.)
- Actual code uses new structure (flat fields, toggles, documentationLinks, etc.)
- If you use `storage.js`, you'd get the wrong structure

### 3. **Maintenance Burden**
- Two code paths to maintain
- Changes need to be made in two places
- Easy to forget to update `storage.js`

### 4. **Inconsistent Behavior**
- Code using `storage.js` gets caching (good!)
- Code using `storage` directly doesn't get caching (inconsistent!)
- Some code gets automatic index updates, some doesn't

### 5. **Only 2 Files Use It**
- Not worth maintaining a whole abstraction layer for 2 files
- Easy to update those 2 files to use `storage` directly

## Why Keep It?

### 1. **Useful Features**
- Caching could be beneficial
- Automatic index updates are convenient
- Batch operations are nice

### 2. **Future-Proofing**
- Could refactor all code to use it consistently
- Would provide a clean abstraction layer

### 3. **Less Code Duplication**
- Helper functions reduce repetition
- Centralized logic is easier to change

## Recommendation: **Remove It** (Option B)

### Why?

1. **It's outdated** - Structure doesn't match actual code
2. **It's confusing** - Two ways to do the same thing
3. **It's barely used** - Only 2 files, easy to update
4. **The features aren't critical** - Caching and index updates are already handled elsewhere

### What to Do:

1. **Update the 2 files** that use it:
   - `src/pagePublishedHandler.js` - Replace `getExcerpt()` with `storage.get()`
   - `src/resolvers/injection-resolver.js` - Replace `getExcerpt()` with `storage.get()`

2. **Delete `storage.js`**

3. **Document the decision** - Add a note in README explaining why we use `storage` directly

### Alternative: **Refactor Everything to Use It** (Option A)

If you want to keep the abstraction:

1. **Update `storage.js`** to match current data structure
2. **Refactor all resolvers** to use `storage.js` functions
3. **Add missing features** (toggles, documentationLinks, contentHash, etc.)
4. **Maintain consistency** going forward

**Effort:** Large (refactor ~20+ files)
**Benefit:** Clean abstraction, consistent behavior
**Risk:** Breaking changes, more code to maintain

## My Recommendation

**Remove it** because:
- ✅ Quick win (update 2 files, delete 1)
- ✅ Reduces confusion
- ✅ Eliminates maintenance burden
- ✅ Actual code already works fine without it
- ✅ Features (caching, index updates) are handled elsewhere in the codebase

The caching and index update features that `storage.js` provides are already implemented in other parts of the codebase (like `storage-utils.js`), so we're not losing functionality.

## Decision Needed

Which do you prefer?
- **Option A:** Keep and refactor everything to use it (large effort)
- **Option B:** Remove it and update 2 files (small effort, recommended)

