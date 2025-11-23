# Blueprint App - Terminology Reference

**Purpose:** This document provides a reference for the terminology used in the Blueprint App, mapping user-facing terms to internal code terminology and documenting key concepts.

**Status:** Display names rebranded, internal code uses legacy names (intentional backward compatibility)

---

## Core Concept Mapping

| User-Facing Term | Internal Code Term | Description |
|------------------|-------------------|-------------|
| **Blueprint App** | excerpt/include (internal code) | Overall product/app name |
| **Blueprint App - Source** | Excerpt | A reusable content block with variables/toggles |
| **Blueprint App - Embed** | Include | An instance that displays a Source on a page |
| **Source** | Source | The macro where Sources are created/edited |
| **Blueprint App Admin** | admin-page | Admin interface for managing Sources and Embeds |

---

## Macro Names

### User-Facing (Display Titles)
- **Blueprint App - Source** - Create/edit Sources
- **Blueprint App - Embed** - Embed a Source on any page
- **Blueprint App Admin** - Admin interface

### Internal (Module Keys - DO NOT CHANGE)
- `blueprint-standard-source` - Module key for Source macro
- `blueprint-standard-embed` - Module key for Embed macro
- `blueprint-standards-admin` - Module key for Admin page

**IMPORTANT:** Module keys must remain unchanged for backward compatibility with existing page content.

---

## Resolver Functions (Backend API)

### Source Operations (Excerpt Resolvers)

| User-Facing Action | Resolver Function | Purpose |
|-------------------|-------------------|---------|
| Create/Edit Source | `saveExcerpt(req)` | Create or update a Source |
| Update Source content | `updateExcerptContent(req)` | Auto-update content when Source edited |
| Get Source | `getExcerpt(req)` | Fetch Source data |
| List all Sources | `getAllExcerpts(req)` | Get complete list with metadata |
| Delete Source | `deleteExcerpt(req)` | Remove Source |
| Update Source metadata | `updateExcerptMetadata(req)` | Edit name/category |
| Bulk update Sources | `massUpdateExcerpts(req)` | Mass category changes |

### Embed Operations (Include Resolvers)

| User-Facing Action | Resolver Function | Purpose |
|-------------------|-------------------|---------|
| Save Embed configuration | `saveVariableValues(req)` | Save variable values, toggle states, custom insertions |
| Get Embed configuration | `getVariableValues(req)` | Retrieve Embed instance config |

### Usage Tracking

| User-Facing Action | Resolver Function | Purpose |
|-------------------|-------------------|---------|
| Track where Source is used | `trackExcerptUsage(req)` | Register Embed instance usage |
| Remove usage tracking | `removeExcerptUsage(req)` | Cleanup when Embed deleted |
| Get usage report | `getExcerptUsage(req)` | List all pages using a Source |
| Push updates to all Embeds | `pushUpdatesToAll(req)` | Force-refresh all instances |
| Push updates to specific page | `pushUpdatesToPage(req)` | Force-refresh page's instances |

---

## Storage Keys

### Source Data

| What It Stores | Storage Key Pattern | Example |
|----------------|---------------------|---------|
| Source content | `excerpt:{id}` | `excerpt:5e7f419c-e862-478a-a368-8ac9a78e4640` |
| Source index | `excerpt-index` | Single key with array of all IDs |
| Usage tracking | `excerpt-usage:{id}` | `excerpt-usage:5e7f419c-e862-478a-a368-8ac9a78e4640` |

### Embed Configuration Data

| What It Stores | Storage Key Pattern | Example |
|----------------|---------------------|---------|
| Embed instance config | `macro-vars:{localId}` | `macro-vars:abc-123-def` |

**Storage Schema - Source (excerpt:{id}):**
```javascript
{
  id: "5e7f419c-e862-478a-a368-8ac9a78e4640",
  name: "Client Profile",
  category: "General",
  content: { /* ADF document */ },
  contentHash: "139115ae78ee9ba42ce6b49c591991c15e6469afaee27ae732be47ffa92d6ff8",
  variables: [
    { name: "client", description: "Client name", example: "Acme Corp" }
  ],
  toggles: [
    { name: "premium-features", description: "Show premium tier info" }
  ],
  sourcePageId: "80150529",
  sourceSpaceKey: "DEV",
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-05T12:30:00.000Z"
}
```

**Storage Schema - Embed Config (macro-vars:{localId}):**
```javascript
{
  excerptId: "5e7f419c-e862-478a-a368-8ac9a78e4640",
  variableValues: {
    "client": "Acme Corp"
  },
  toggleStates: {
    "premium-features": true
  },
  customInsertions: [
    { position: 2, content: "Custom paragraph text" }
  ],
  internalNotes: [
    { position: 1, content: "Internal note for staff only" }
  ],
  cachedContent: { /* Rendered ADF */ },
  syncedContentHash: "139115ae78ee9ba42ce6b49c591991c15e6469afaee27ae732be47ffa92d6ff8",
  lastSynced: "2025-01-05T12:30:00.000Z",
  updatedAt: "2025-01-05T12:30:00.000Z"
}
```

---

## Key Concepts

### Content Hash System
**Purpose:** Detect actual content changes (not just page views/republishing)

**How it works:**
1. When Source is saved → `contentHash` calculated via SHA256
2. When Embed syncs → stores `syncedContentHash` matching current Source
3. When checking staleness → compare `contentHash` vs `syncedContentHash`
4. Hash includes: content, name, category, variables, toggles
5. Hash excludes: id, timestamps, source metadata

**Files involved:**
- `src/utils/hash-utils.js` - Core hashing utilities
- `src/resolvers/excerpt-resolvers.js:145-148` - Skip save if hash unchanged
- `src/resolvers/include-resolvers.js:33` - Store syncedContentHash
- `src/EmbedContainer.jsx` - Hash-based staleness detection

---

## Variable System

**Syntax:** `{{variable-name}}` in Source content

**How it works:**
1. Source content includes variables like `{{client}}`
2. Embed configuration provides values: `client: "Acme Corp"`
3. Rendered content substitutes: "Acme Corp is a valued customer"

**Variable metadata:**
- `name` - Variable identifier
- `description` - User-facing help text
- `example` - Sample value

---

## Toggle System

**Syntax:** `{{toggle:name}}` surrounding content in Source

**How it works:**
1. Source includes toggleable sections
2. Embed configuration enables/disables toggles
3. Disabled toggle content is hidden in rendered output
4. Toggle state stored per-Embed instance

**Toggle metadata:**
- `name` - Toggle identifier
- `description` - User-facing help text

---

## Free Write / Custom Insertions

**Purpose:** Add custom paragraph content at specific positions in Embeds

**How it works:**
1. User selects paragraph position from dropdown
2. Adds custom paragraph text
3. Custom content inserted at that position during rendering
4. Stored in Embed config's `customInsertions` array

---

## Internal Notes

**Purpose:** Add staff-only annotations that are hidden from external clients

**How it works:**
1. Superscript markers (¹, ², ³) appear inline
2. Collapsible panel at bottom shows all notes
3. External content filtering removes notes for client-facing displays
4. Stored in Embed config's `internalNotes` array

---

## Future Phases

### Phase 1: Display-Only Rename ✅ (v8.0.0 - Complete)
- ✅ Update manifest.yml display titles
- ✅ Update all UI strings in components
- ✅ Update README documentation
- ✅ Simplified nomenclature: "Blueprint App - Source", "Blueprint App - Embed", "Blueprint App Admin"
- **Keep unchanged:** module keys, storage keys, resolver names (backward compatibility)

### Phase 2: Internal Code Gradual Rename (Future)
- Rename variables and comments during refactoring work
- Add JSDoc aliases to functions
- **Keep unchanged:** module keys, storage keys (backward compatibility)

### Phase 3: File Name Alignment (Optional Future)
- ✅ Rename `include-display.jsx` → `EmbedContainer.jsx` (Complete)
- Rename `excerpt-resolvers.js` → `source-resolvers.js` (Optional)
- Only after all other work is stable

---

**Last Updated:** 2025-01-XX
**Version:** 8.0.0+ (simplified nomenclature)
