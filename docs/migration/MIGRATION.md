# MultiExcerpt to Blueprint Standards Migration Guide

> **⚠️ FUNCTIONALLY IRRELEVANT - HISTORICAL RECORD ONLY**  
> This document describes an ADF-based migration approach that is no longer in use. Migration is now performed through the Migration Tools modal in the Admin UI. This document is preserved only as a historical record of the migration planning and process.

This guide provides step-by-step instructions for migrating MultiExcerpt macros from the old app to Blueprint Standards.

## Overview

The migration process uses ADF (Atlassian Document Format) transformation to create editable Blueprint Standard Source macros on Confluence pages.

**Process:**
1. Extract Forge metadata template from working Blueprint Standard Source page
2. For each MultiExcerpt standard:
   - Convert storage format XML → ADF using Confluence API
   - Transform MultiExcerpt ADF → Blueprint Standard ADF with Forge metadata
   - Create Confluence page with transformed ADF
3. Result: Editable Source macros on real pages

**Key Benefits:**
- Source macros are editable in Confluence (on pages, not just in storage)
- Uses Confluence's conversion API (handles malformed XML gracefully)
- Complete Forge metadata ensures macros load correctly
- One-step automated migration

**Requirements:**
- Admin access to Blueprint Standards app
- At least one working Blueprint Standard Source macro on a page (for template extraction)
- Imported MultiExcerpt standards already in storage (115 standards with excerptIds/names/content)
- Space to store 115 new pages

---

## Migration Process

### Quick Start

**Prerequisites:**
- Admin access to Blueprint Standards app
- At least one working Blueprint Standard Source macro on a page (for metadata template extraction)
- MultiExcerpt standards imported into storage (115 standards with excerptIds, names, and content)

**Steps:**

1. **Trigger Migration Job**
   - Open Blueprint Standards Admin page
   - Click "Start ADF Migration" button
   - Migration worker processes all 115 standards in background (900s timeout)

2. **Monitor Progress**
   - Check forge logs: `forge logs --environment production`
   - Wait for completion message (typically 5-10 minutes for 115 standards)

3. **Verify Results**
   - Check created pages in your Confluence space
   - Verify macros load without "Error loading the extension"
   - Test editing a few Source macros

**What Happens Behind the Scenes:**

```
For each MultiExcerpt standard in storage:
  1. Extract Forge metadata template (once, reused for all)
  2. Convert storage XML → ADF (Confluence API)
  3. Transform ADF structure (MultiExcerpt → Blueprint Standard)
  4. Create page with ADF (REST API v2)
  5. Track success/failures
```

**Expected Results:**
- 115 new pages created with Blueprint Standard Source macros
- All macros editable and functional
- Content preserved from original MultiExcerpts
- Variables/categories maintained

### Technical Implementation Details

**Key Functions (src/index.js):**

1. **`extractForgeMetadataTemplate(workingPageId)`** (lines 308-336)
   - Fetches ADF from a working Blueprint Standard Source page
   - Extracts reusable Forge metadata (extensionKey, extensionId, extensionProperties, etc.)
   - Called once at start of migration, template reused for all standards

2. **`transformToBlueprintStandardAdf(multiExcerptAdf, excerptId, excerptName, category, localId, forgeMetadata)`** (lines 342-378)
   - Takes MultiExcerpt ADF and transforms it to Blueprint Standard ADF structure
   - Wraps custom parameters in `guestParams` object
   - Includes complete Forge metadata from template
   - Returns ADF ready for page creation

**Migration Worker Process (workers/migrationWorker.js):**

```javascript
// Pseudo-code of migration logic:

1. Extract Forge metadata template from page 64880643 (once)

2. For each standard in storage:
   a. Get standard content (storage format XML)

   b. Convert to ADF via Confluence API:
      POST /wiki/rest/api/contentbody/convert/atlas_doc_format
      Body: { value: content, representation: 'storage' }

   c. Parse response JSON: multiExcerptAdf = JSON.parse(response.value)

   d. Transform ADF structure:
      transformToBlueprintStandardAdf(
        multiExcerptAdf,
        standard.excerptId,
        standard.excerptName,
        standard.category,
        generateUUID(),
        forgeMetadata
      )

   e. Create page via REST API v2:
      POST /wiki/api/v2/pages
      Body: {
        spaceId: '163842',
        title: `Blueprint Standard - ${standard.excerptName}`,
        body: {
          representation: 'atlas_doc_format',
          value: JSON.stringify(blueprintAdf)
        }
      }

   f. Track result (success/error)

3. Return migration summary
```

**ADF Structure Comparison:**

MultiExcerpt ADF (from conversion API):
```json
{
  "type": "doc",
  "content": [{
    "type": "bodiedExtension",
    "attrs": {
      "extensionKey": "com.atlassian.confluence.plugins.confluence-multiexcerpt:multiexcerpt-macro",
      "parameters": { "name": "Test0", "hidden": "false" }
    },
    "content": [/* actual content */]
  }]
}
```

Blueprint Standard ADF (after transformation):
```json
{
  "type": "doc",
  "content": [{
    "type": "bodiedExtension",
    "attrs": {
      "extensionKey": "be1ff96b-d44d-4975-98d3-25b80a813bdd/bbebcb82-f8af-4cd4-8ddb-38c88a94d142/static/blueprint-standard-source",
      "text": "Blueprint Standard - Source",
      "parameters": {
        "layout": "bodiedExtension",
        "guestParams": {
          "excerptId": "01ea4f7a-265c-4972-8e70-de92a50d4d6e",
          "excerptName": "Test0",
          "category": "General",
          "variables": [],
          "toggles": []
        },
        "forgeEnvironment": "PRODUCTION",
        "extensionProperties": {/* extensive Forge app metadata */},
        "extensionId": "ari:cloud:ecosystem::extension/...",
        "render": "native",
        "extensionTitle": "Blueprint Standard - Source"
      }
    },
    "content": [/* actual content - preserved from MultiExcerpt */]
  }]
}
```

**Why This Works:**

1. **Forge Metadata Extraction**: All Blueprint Standard Source macros share the same environment-level metadata. By extracting from one working macro, we get the template that works for all.

2. **Confluence Conversion API**: Handles malformed XML gracefully. Original MultiExcerpt storage format may have unclosed tags or entity issues - the API normalizes it to valid ADF.

3. **ADF Transformation**: We preserve the content (innerContent) from the converted MultiExcerpt, but wrap it with proper Forge extension metadata so Confluence knows how to load the macro.

4. **REST API v2**: Modern endpoint that accepts ADF directly via `atlas_doc_format` representation.

**Error Handling:**

- Conversion failures: Logged with standard name, original content preserved in error report
- Page creation failures: Logged with standard name, ADF preserved for debugging
- Metadata extraction failure: Stops migration immediately (all macros need template)

---

## Troubleshooting

### Issue: Migration job fails immediately

**Cause:** Cannot extract Forge metadata template from working page

**Solution:**
- Verify page ID 64880643 exists and has a Blueprint Standard Source macro
- Check the macro loads correctly (no "Error loading the extension")
- Update `extractForgeMetadataTemplate()` call with correct page ID if needed

### Issue: Conversion API fails for some standards

**Cause:** Malformed storage format XML in original MultiExcerpt content

**Solution:**
- Check forge logs for specific standard names that failed
- Review original MultiExcerpt content for unclosed tags or invalid XML
- Fix storage format XML manually in storage, then retry migration for that standard

### Issue: Pages created but macros show "Error loading the extension"

**Cause:** Missing or incorrect Forge metadata in transformed ADF

**Solution:**
- Verify the working page used for template extraction has correct metadata
- Check that `forgeMetadata` object includes all required fields:
  - extensionKey (full path with environment ID)
  - extensionId
  - extensionTitle
  - extensionProperties
  - forgeEnvironment
  - render
- Re-run migration after fixing metadata extraction

### Issue: Created pages are not editable

**Cause:** ADF structure is incorrect or missing content

**Solution:**
- Verify the page ADF contains a valid `bodiedExtension` node
- Check that the content array is not empty
- Compare with working page ADF structure using `comparePageAdf` resolver
- Verify `guestParams` includes excerptId and excerptName

### Issue: Migration worker times out

**Cause:** Processing 115 standards takes longer than 900s timeout

**Solution:**
- Check forge logs to see how many standards were processed before timeout
- Note which standards succeeded (logged in worker)
- Manually trigger migration again, skipping already-migrated standards
- Consider increasing worker timeout in manifest.yml if needed

---

## Additional Resources

- **Confluence REST API Docs:** https://developer.atlassian.com/cloud/confluence/rest/v1/api-group-content/
- **ADF Format Docs:** https://developer.atlassian.com/cloud/confluence/adf/
- **Storage Format Docs:** https://confluence.atlassian.com/doc/confluence-storage-format-790796544.html
- **Forge Events API:** https://developer.atlassian.com/platform/forge/events-reference/

## Support

For issues or questions:
1. Review this migration guide
2. Check troubleshooting section
3. Review forge logs for detailed error messages
4. Contact development team

