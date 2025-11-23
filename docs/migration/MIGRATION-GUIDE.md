# 🔄 MultiExcerpt to Blueprint Standard Migration Guide

> **⚠️ FUNCTIONALLY IRRELEVANT - HISTORICAL RECORD ONLY**  
> This document describes the script-based migration process that has been replaced by the Migration Tools modal in the Admin UI. The scripts referenced in this guide (e.g., `clone-macros.js`) are no longer in use. Migration is now performed through the UI via the Migration Tools modal. This document is preserved only as a historical record of the migration planning and process.

## Overview

This guide describes the **definitive approach** for migrating existing Confluence pages from the MultiExcerpt macro plugin to Blueprint Standard Source macros.

**Migration Status:** Successfully tested with 147 MultiExcerpt macros
**Last Updated:** 2025-11-09 (v7.15.0)
**Page ID:** 99909654

---

## What the Migration Does

1. **Clones all MultiExcerpt macros** → Creates Blueprint Standard Source macros on the same page
2. **Preserves all content** → Copies rich text, tables, nested macros, and formatting
3. **Generates unique IDs** → Assigns UUID to each Blueprint Standard Source
4. **Maintains editability** → All migrated macros have Edit buttons and full Forge functionality

---

## Prerequisites

### Required Tools
- Node.js (v18+)
- Confluence API token

### Setup Environment Variables
```bash
export CONFLUENCE_EMAIL="your.email@example.com"
export CONFLUENCE_API_TOKEN="your-api-token-here"
```

> **Get API Token:** https://id.atlassian.com/manage-profile/security/api-tokens

### Prepare the Page
1. Navigate to your Confluence page containing MultiExcerpt macros
2. **Manually create ONE Blueprint Standard Source macro** on the page:
   - Click `/` in the editor
   - Type "Blueprint Standard"
   - Select "Blueprint Standard - Source"
   - Fill in any name/category (we'll overwrite these)
   - Save the page
3. Note the page ID from the URL

---

## Migration Process

### Step 1: Clone Macros

This script clones your single Blueprint Standard Source macro N times (once for each MultiExcerpt macro), updating each clone's name to match the corresponding MultiExcerpt.

#### Dry Run (Recommended First)
```bash
# Using defaults (page ID: 99909654, URL: qrsouther.atlassian.net)
node scripts/clone-macros.js --dry-run

# For corporate Confluence instance
node scripts/clone-macros.js \
  --page-id=YOUR_PAGE_ID \
  --base-url=https://seatgeek.atlassian.net \
  --dry-run
```

This saves the updated page content to `./updated-page-storage.xml` for review.

#### Execute Migration
```bash
# Using defaults (page ID: 99909654, URL: qrsouther.atlassian.net)
node scripts/clone-macros.js

# For corporate Confluence instance
node scripts/clone-macros.js \
  --page-id=YOUR_PAGE_ID \
  --base-url=https://seatgeek.atlassian.net
```

**What it does:**
- ✅ Fetches page 99909654
- ✅ Finds all MultiExcerpt macros (by name parameter)
- ✅ Finds the Blueprint Standard Source template macro
- ✅ Clones it N times with updated names
- ✅ Inserts all clones into page
- ✅ Updates page via Confluence API

**Expected output:**
```
🚀 Blueprint Standard Source Macro Cloning Script Starting...

📡 Fetching page storage...
✓ Page storage fetched (version 42)

🔍 Extracting MultiExcerpt names...
✓ Found 147 MultiExcerpt macros
   First: "[ALL] Merchandise"
   Last: "Zoo Parking"

🔍 Finding Blueprint Standard Source macro template...
✓ Found Blueprint Standard Source macro template

📝 Cloning Blueprint Standard Source macros...
✓ Created 147 cloned macros

📝 Inserting clones into page storage...
✓ Macros inserted into storage

🚀 Updating page via API...
✓ Page updated successfully!

✅ SUCCESS!

🎉 147 Blueprint Standard Source macros have been cloned!

⚠️  NEXT STEPS:
   1. Refresh the Confluence page in your browser
   2. Verify all Blueprint Standard Source macros appear correctly
   3. Run migrate-content.js to copy content from MultiExcerpt macros
   4. Run fix-excerpt-ids.js to generate unique IDs
   5. Delete the old MultiExcerpt macros
```

---

### Step 2: Migrate Content

This script copies the body content from each MultiExcerpt macro into its corresponding Blueprint Standard Source macro (matched by name).

#### Dry Run (Recommended First)
```bash
# Using defaults (page ID: 99909654, URL: qrsouther.atlassian.net)
node scripts/migrate-content.js --dry-run

# For corporate Confluence instance
node scripts/migrate-content.js \
  --page-id=YOUR_PAGE_ID \
  --base-url=https://seatgeek.atlassian.net \
  --dry-run
```

#### Execute Migration
```bash
# Using defaults (page ID: 99909654, URL: qrsouther.atlassian.net)
node scripts/migrate-content.js

# For corporate Confluence instance
node scripts/migrate-content.js \
  --page-id=YOUR_PAGE_ID \
  --base-url=https://seatgeek.atlassian.net
```

**What it does:**
- ✅ Extracts content from all MultiExcerpt macros (including nested macros, tables, etc.)
- ✅ Finds matching Blueprint Standard Source macros by name
- ✅ Copies content into `<ac:adf-content>` tags
- ✅ Updates page via Confluence API

**Expected output:**
```
🚀 Content Migration Script Starting...

📡 Fetching page storage...
✓ Page storage fetched (version 43)

🔍 Extracting MultiExcerpt macros...
✓ Found 147 MultiExcerpt macros with content

📝 Updating Blueprint Standard Source content...
  ✓ Updating "[ALL] Merchandise"
  ✓ Updating "[ALL] Parking"
  ...
  ✓ Updating "Zoo Parking"

✓ Updated 147 Blueprint Standard Source macros

🚀 Updating page via API...
✓ Page updated successfully!

✅ SUCCESS!

🎉 147 Blueprint Standard Source macros have been updated with content!

⚠️  NEXT STEPS:
   1. Refresh the Confluence page in your browser
   2. Verify all Blueprint Standard Source macros show the correct content
   3. Run fix-excerpt-ids.js to generate unique IDs
   4. Delete the old MultiExcerpt macros
```

---

### Step 3: Fix Excerpt IDs

This script generates a unique UUID for each Blueprint Standard Source macro. Without this step, all macros share the same ID and won't work correctly in the Edit modal.

#### Dry Run (Recommended First)
```bash
# Using defaults (page ID: 99909654, URL: qrsouther.atlassian.net)
node scripts/fix-excerpt-ids.js --dry-run

# For corporate Confluence instance
node scripts/fix-excerpt-ids.js \
  --page-id=YOUR_PAGE_ID \
  --base-url=https://seatgeek.atlassian.net \
  --dry-run
```

#### Execute Migration
```bash
# Using defaults (page ID: 99909654, URL: qrsouther.atlassian.net)
node scripts/fix-excerpt-ids.js

# For corporate Confluence instance
node scripts/fix-excerpt-ids.js \
  --page-id=YOUR_PAGE_ID \
  --base-url=https://seatgeek.atlassian.net
```

**What it does:**
- ✅ Finds all Blueprint Standard Source macros
- ✅ Generates unique UUID for each
- ✅ Updates `excerpt-id` parameter
- ✅ Updates page via Confluence API

**Expected output:**
```
🚀 Excerpt ID Fix Script Starting...

📡 Fetching page storage...
✓ Page storage fetched (version 44)

🔧 Generating unique IDs for each Blueprint Standard Source...
  ✓ Updated "[ALL] Merchandise" with ID: a1b2c3d4-...
  ✓ Updated "[ALL] Parking" with ID: e5f6g7h8-...
  ...
  ✓ Updated "Zoo Parking" with ID: i9j0k1l2-...
✓ Generated 147 unique IDs

🚀 Updating page via API...
✓ Page updated successfully!

✅ SUCCESS!

🎉 147 Blueprint Standard Source macros now have unique IDs!

⚠️  NEXT STEPS:
   1. Close and reopen the edit page
   2. Click Edit on a Blueprint Standard Source macro
   3. Verify it now shows the correct name
   4. Delete the old MultiExcerpt macros
```

---

### Step 4: Verify Migration

1. **Refresh the Confluence page** in your browser
2. **Check each Blueprint Standard Source macro:**
   - Should display content correctly
   - Should have an "Edit" button (hover over macro)
   - Edit button should open config modal with correct name
3. **Delete old MultiExcerpt macros** (optional, but recommended to clean up)

---

## Script Details

### `scripts/clone-macros.js`

**Purpose:** Clones a single Blueprint Standard Source template macro N times

**Key Functions:**
- `extractMultiExcerptNames()` - Finds all MultiExcerpt names from storage XML
- `findBlueprintStandardMacro()` - Locates the template macro
- `cloneBlueprintStandardWithName()` - Clones and updates `excerpt-name` parameter

**Technical Details:**
- Uses Confluence REST API v2 (`/wiki/api/v2/pages/{id}`)
- Parses Confluence Storage Format (XML)
- Regex pattern: `/<ac:adf-extension><ac:adf-node type="bodied-extension">[\s\S]*?blueprint-standard-source[\s\S]*?<\/ac:adf-node><\/ac:adf-extension>/`
- Updates page with versioning (prevents concurrent edit conflicts)

---

### `scripts/migrate-content.js`

**Purpose:** Copies content from MultiExcerpt to Blueprint Standard Source macros

**Key Functions:**
- `extractMultiExcerpts()` - Extracts content using depth-counting XML parser
- `updateBlueprintStandardContent()` - Matches by name and copies content

**Technical Details:**
- Handles nested `<ac:rich-text-body>` tags correctly
- Preserves complex nested content (tables, SectionMessage macros, etc.)
- Updates `<ac:adf-content>` sections within Blueprint Standard macros

---

### `scripts/fix-excerpt-ids.js`

**Purpose:** Generates unique UUIDs for each Blueprint Standard Source macro

**Key Functions:**
- `generateUUID()` - Uses Node.js `crypto.randomUUID()`
- `updateExcerptIds()` - Finds and updates `excerpt-id` parameters

**Technical Details:**
- Updates both top-level `excerpt-id` parameter
- Updates nested `excerpt-id` within `guest-params`
- Required for Edit modal functionality

---

## Troubleshooting

### Problem: "No Blueprint Standard Source macro found!"

**Solution:** Create one manually on the page first (see Prerequisites)

### Problem: "No matching MultiExcerpt found for X"

**Cause:** Blueprint Standard macro name doesn't match any MultiExcerpt name

**Solution:** Manually rename the Blueprint Standard macro to match

### Problem: Edit button doesn't work after migration

**Cause:** Excerpt IDs not fixed

**Solution:** Run `fix-excerpt-ids.js`

### Problem: Content missing or truncated

**Cause:** Nested macro parsing error

**Solution:**
1. Check the dry-run XML output
2. Look for unclosed tags
3. Manually copy content for problematic macros

---

## Why This Approach Works

### Previous Attempts (Failed)

1. **ADF Conversion API** - Confluence's storage→ADF conversion API fails for complex nested content
2. **Server-side ADF generation** - Cannot create proper Forge macros without full Forge metadata
3. **Browser automation** - Confluence editor (ProseMirror) doesn't respond to synthetic events

### Current Approach (Successful)

1. **Direct XML manipulation** - Bypasses conversion API entirely
2. **Template cloning** - Preserves all Forge metadata from working macro
3. **Storage format preservation** - Keeps complex nested content intact
4. **Three-phase process** - Clone → Migrate content → Fix IDs

---

## Important Notes

### Runtime Configuration

The scripts support runtime parameters for maximum portability:

**Parameters:**
- `--page-id=` - Confluence page ID (default: `99909654`)
- `--base-url=` - Confluence instance URL (default: `https://qrsouther.atlassian.net`)
- `--dry-run` - Preview changes without updating (saves to local file)

**Examples:**

```bash
# Test instance (using defaults)
node scripts/clone-macros.js --dry-run
node scripts/migrate-content.js --dry-run
node scripts/fix-excerpt-ids.js --dry-run

# Corporate instance (SeatGeek)
export CONFLUENCE_EMAIL="qsouther@seatgeek.com"
export CONFLUENCE_API_TOKEN="your-token-here"

node scripts/clone-macros.js \
  --page-id=YOUR_CORPORATE_PAGE_ID \
  --base-url=https://seatgeek.atlassian.net

node scripts/migrate-content.js \
  --page-id=YOUR_CORPORATE_PAGE_ID \
  --base-url=https://seatgeek.atlassian.net

node scripts/fix-excerpt-ids.js \
  --page-id=YOUR_CORPORATE_PAGE_ID \
  --base-url=https://seatgeek.atlassian.net
```

**Bulk Initialize (Step 4):**

After running the scripts, initialize Forge storage via the Admin UI:
1. Go to Blueprint Standards Admin page
2. Enter the Page ID in the text field (e.g., `YOUR_CORPORATE_PAGE_ID`)
3. Click "Bulk Initialize All Standards"

### Backup Recommendation

**Before running migration:**
1. Export the page to PDF or HTML
2. Or simply copy the page as a backup
3. Migration is reversible (just delete the new macros)

### Content Limitations

**Works with:**
- ✅ Plain text
- ✅ Rich formatting (bold, italic, links, etc.)
- ✅ Tables
- ✅ Nested Confluence macros (expand, note, info, etc.)
- ✅ Images and attachments
- ✅ Code blocks

**May have issues with:**
- ⚠️ Deeply nested macros (3+ levels)
- ⚠️ Custom HTML
- ⚠️ Very large content blocks (>100KB)

---

## Post-Migration

### Clean Up

After successful migration:
1. Delete all MultiExcerpt macros from the page
2. Test Blueprint Standard Source macros work correctly
3. Archive the migration scripts (keep for future reference)

### Storage Population

Blueprint Standard Source macros store configuration in Forge storage. The migration scripts only update page content, not Forge storage. To populate storage:

1. Open the Blueprint Standards Admin page
2. Use the admin UI to verify/update each Source
3. Or create a bulk initialization script (see `bulkInitializeAllExcerpts` resolver in earlier versions)

---

## Version History

- **v7.15.0** (2025-11-09) - Updated for Blueprint Standard macros
- **v4.300.1** (2024) - Original Blueprint App migration
- Scripts updated to use `blueprint-standard-source` instead of `smart-excerpt-source`
- Page ID updated from `80150529` to `99909654`

---

## Questions?

If you encounter issues:
1. Check the dry-run output first
2. Review the Troubleshooting section above
3. Check the migration logs for detailed error messages
4. Reach out for support with specific error messages and page IDs

