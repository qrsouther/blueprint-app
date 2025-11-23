# Obsolete Migration Details

> **⚠️ FUNCTIONALLY IRRELEVANT - HISTORICAL RECORD ONLY**  
> This migration workflow was used for the initial production installation. It is preserved here for historical reference but is no longer needed for ongoing operations. Migration is now performed through the Migration Tools modal in the Admin UI.

## 🔄 MultiExcerpt to Blueprint App Migration

### Migration Overview

This project includes tools to migrate existing Confluence pages from the MultiExcerpt macro plugin to Blueprint App. The migration was successfully completed for a test page with 147 MultiExcerpt macros.

### What the Migration Does

1. **Clones MultiExcerpt Macros** - Creates Blueprint App Source macros alongside existing MultiExcerpt macros
2. **Preserves Content** - Copies all content, including rich text formatting, from MultiExcerpt to Blueprint App
3. **Assigns UUIDs** - Generates unique identifiers for each excerpt for ID-based referencing
4. **Bulk Initialization** - Populates Forge storage with all excerpt data and metadata
5. **Enables Admin Features** - Makes all excerpts available in the Admin UI with full functionality

### Migration Scripts

The following scripts are included in the project root:

#### Core Migration Scripts
- **`clone-macros.js`** - Clones MultiExcerpt macros to Blueprint App Source macros on a page
- **`migrate-content.js`** - Updates page content via Confluence API (optional migration path)
- **`migrate-macros.js`** - Main migration orchestrator (combines clone + content operations)
- **`fix-excerpt-ids.js`** - Assigns unique UUIDs to cloned excerpts

#### Reference Data
- **`blueprint-app-name-uuid-mapping.csv`** - Critical mapping file containing excerpt names, UUIDs, and categories for all 147 migrated excerpts

### Migration Process for Corporate Deployment

When ready to migrate to your corporate Confluence instance (seatgeek.atlassian.net), follow these steps:

#### Prerequisites
```bash
# Required environment variables
export CONFLUENCE_EMAIL="your.email@company.com"
export CONFLUENCE_API_TOKEN="your-api-token"
```

#### Step 1: Clone Macros to Target Page
```bash
# Clone all MultiExcerpt macros to Blueprint App Source macros
node clone-macros.js --page-id YOUR_CORPORATE_PAGE_ID
```

#### Step 2: Assign UUIDs
```bash
# Generate and assign unique IDs to each excerpt
node fix-excerpt-ids.js --page-id YOUR_CORPORATE_PAGE_ID
```

This will create a new CSV mapping file with your corporate page's excerpts.

#### Step 3: Bulk Initialize Excerpts in Forge Storage

1. **Add bulk initialization resolver to `src/index.js`** (if not already present)
2. **Update the UUID mapping** in the resolver with your new CSV data
3. **Update `sourcePageId`** from test page ID `80150529` to your corporate page ID
4. **Deploy to production:**
   ```bash
   forge deploy --environment production
   ```

5. **Access the Admin UI** in your corporate Confluence
6. **Click "Bulk Initialize All Excerpts"** button
7. **Verify** all 147 excerpts appear in the Admin page list

#### Step 4: Verify Migration Success

After bulk initialization:
- ✅ Admin page should list all 147 excerpts
- ✅ "View Source" buttons should navigate to corporate page
- ✅ Excerpt categories should be properly assigned
- ✅ Check All Sources should show all excerpts as active

### Important Notes for Corporate Migration

1. **Page ID Hardcoding** - The test implementation hardcodes page ID `80150529` (qrsouther.atlassian.net). You must update this to your corporate page ID in:
   - `bulkInitializeAllExcerpts` resolver in `src/index.js`
   - Any other references to sourcePageId

2. **Environment Differences** - Test instance is on `qrsouther.atlassian.net`, production will be on `seatgeek.atlassian.net`

3. **UUID Preservation** - Keep the `blueprint-app-name-uuid-mapping.csv` file as a backup reference for all excerpt UUIDs

4. **Content Format** - Migration scripts handle Confluence Storage Format (XML) to ADF conversion automatically

5. **Bulk Init Considerations** - The bulk initialization resolver:
   - Creates individual `excerpt:{uuid}` storage entries
   - Updates the central `excerpt-index` for Admin UI listing
   - Sets `sourcePageId` for "View Source" functionality
   - Assigns categories from the mapping CSV

### Migration Script Details

#### `clone-macros.js`
- Fetches page content via Confluence REST API v2
- Parses Confluence Storage Format XML
- Finds all `multiexcerpt-macro` instances
- Creates corresponding `blueprint-app-source` macros
- Preserves all content formatting

#### `fix-excerpt-ids.js`
- Scans page for Blueprint App Source macros without UUIDs
- Generates UUID v4 for each excerpt
- Extracts excerpt names from macro parameters
- Creates CSV mapping file for bulk initialization
- Updates page with assigned UUIDs

#### Bulk Initialization Resolver
Located in `src/index.js`, the `bulkInitializeAllExcerpts` resolver:
- Reads UUID mappings from embedded CSV data
- Creates storage entries for each excerpt
- Populates excerpt metadata (name, category, sourcePageId)
- Updates excerpt-index for Admin UI
- Returns success/failure counts

### Troubleshooting Migration

**If Admin page shows 0 excerpts after initialization:**
- Ensure `excerpt-index` is updated in bulk init resolver
- Check browser console for storage errors
- Verify bulk init resolver returned success count

**If "View Source" doesn't work:**
- Verify `sourcePageId` is set correctly in excerpt entries
- Check that page ID matches your corporate page

**If content preview is blank:**
- This is expected - content preview requires Confluence Storage Format to ADF conversion
- Users can still edit content on source page via "View Source"

### CSV Mapping File Format

```csv
Excerpt Name,UUID,Category
"Project Evaluation","a1b2c3d4-e5f6-7890-1234-567890abcdef","General"
"Technical Stack","f1e2d3c4-b5a6-9870-4321-fedcba098765","Technical"
...
```

Each row contains:
- **Excerpt Name** - The name from the MultiExcerpt macro
- **UUID** - Unique identifier (generated by fix-excerpt-ids.js)
- **Category** - Organization category (General, Technical, etc.)

