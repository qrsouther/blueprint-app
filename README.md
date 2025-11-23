# Blueprint App - Confluence Forge App

SeatGeek's in-house Blueprint drafting, maintenance, and reporting platform. It is a drop-in, free replacement to the paid third-party [MultiExcerpt](https://marketplace.atlassian.com/apps/169/multiexcerpt) app.

This app was built by the SeatGeek Architecture team using a combination of Claude Code and Cursor IDE.

### 📑 Table of Contents

- [📐 Core Components](#-core-components)
- [🏗️ System Architecture](#-system-architecture)
  - [📁 Project Structure](#-project-structure)
- [📊 Performance Expectations and Mitigations](#-performance-expectations-and-mitigations)
- [📦 Source Macro Features and Workflow](#-source-macro-features-and-workflow)
- [🎯 Embed Macro Features and Workflow](#-embed-macro-features-and-workflow)
- [📘 ⚙️ Admin UI Features](#-admin-ui-features)
- [🐛 Known Issues](#-known-issues)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)

---

## 📐 Core Components

The Blueprint App consists of three major systems: the **Source** macro, the **Embed** macro, and the **Admin** page.

| <h3>🎯 Embed</h3>*CSS, Implementers, et al.* | <h3>📦 Source</h3>*Architecture* | <h3>⚙️ Admin</h3>*Architecture, CSS Managers, MOps Leadership* |
|:-------------------------------------|:----------------------- |:------------------------------------------------------|
|Macros that render content from a selected Source, to be personalized and displayed on a client's Blueprint page.<br><br>[View the Embed macro's detailed features](#-embed-macro-features-and-workflow)|Macros consisting of reusable content templates, written primarily by the Architecture team.<br><br>[View the Source macro's detailed features](#-source-macro-features-and-workflow)|Admin view to manage and report on all Sources and Embeds.<br><br>[View the Admin page's detailed features](#-admin-ui-features)|

🤔 If you're familiar with the following technologies, the Blueprint App is...

**Kinda like...**

➰ **Confluence's native *Excerpt/Include* macros** Like native "Excerpt" and "Excerpt Embed" macros, but with variables, change detection, and centralized management

➰ **WordPress**  
  Sources are like "Reusable Blocks"  
  Embeds are instances  
  Admin is the block library

➰ **React**  
  Sources are component definitions  
  Embeds are component instances with props

➰ **Mail merge**  
  Sources are templates  
  Embeds are merged documents with variable values

**But, it's...**

🚫 Not a page builder (doesn't control full page layout)

🚫 Not a static site generator (renders dynamically in Confluence)

🚫 Not a headless CMS (tightly coupled to Confluence)

🚫 Not optimized for real-time collaboration

---

## 🎯 Embed Macro Features and Workflow

Access Embed macros by inserting the **Blueprint App - Embed** macro on any Confluence page. 

In most cases, Embeds will usually be pre-inserted into client-vertical-specific Confluence Page Templates when every new Blueprint is spun up, so it will rarely fall on CSS or other Embed writers to manually insert new Embeds into their Blueprints.

### Embed 'Edit Mode'

This is the editing for the Embed macro.

<table>
  <tr>
    <td><strong>Source selection</strong></td>
    <td>Dropdown menu to choose from all available Sources, or search by name. After selecting a Source, use the View Source button to go to the page where the Source macro is configured.</td>
  </tr>
  <tr>
    <td><strong>Toggles tab</strong></td>
    <td>Enable/disable toggles to display or hide content blocks. Descriptions will often accompany each toggle. Preview panel will live-update when toggles are switched. Toggle positions are auto-saved near-instantly.</td>
  </tr>
  <tr>
    <td><strong>Write tab (Variables)</strong></td>
    <td>Text fields are available to input a value into each variable defined at the Source. Variable substitutions will update the preview panel beneath in real-time as you type. <br><br> *️⃣ Asterisks denote required variables (should not be left null). Variables without asterisks can be considered optional, and often are those that exist only within toggle blocks.<br><br>Variables, like Toggles, can have accompanying descriptions -- particularly in cases where the variable's meaning is not-obvious based on its name. Variables can and usually will have generic example text which is displayed as a placeholder, to help users see what the variable input expects (i.e., a single word, versus a standalone sentence, versus a full paragraph).
    <br><br>Variable inputs, like toggle settings, are auto-saved near-instantly.<br><br><strong>Tip:</strong> ✅ will appear to the right of variables' input fields as you fill them in. Turn all your variable lines green!</td>
  </tr>
  <tr>
    <td><strong>Custom tab<br></strong></td>
    <td>Insert custom, free-written paragraphs of your own content at any position (Placement) within the Embed's content field. You can insert multiple external or internal custom paragraphs, but use discretion -- the more custom content you write, the less standard your client's approach may be.<br><br>Users no longer need to write freeform content outside of/beneath the excerpted content macro, as was the case with MultiExcerpts. Custom insertions are integrated directly into the Embed's content structure at specified positions.<br><br>The preview panel below will show complete rendered content, including custom insertions and internal notes.<br><br>📝 External content paragraphs will appear within the Blueprint document supplied to the client. SeatGeek employees and the client alike can read these custom insertions. <br><br>🔒 Internal Notes will <strong>not</strong> be visible to clients at all; they will only be visible within the Confluence page of the Blueprint, and only to other SeatGeek employees. Internal Notes act as inline footnotes, and will be marked with a superscript number in the Embed's rendered view (again, only visible internally); those numbers match to the notes which are saved and shown within the <em>🔒 Internal Notes</em> panel displayed at the bottom of the Embed.<br><br><strong>Tip:</strong> Use Internal Notes to stash links to Jira tickets, Slack conversations, or background information that only your SeatGeek teammates need to know about. The reasoning and context behind the ways a SeatGeek client does things is the most valuable part of every Blueprint!</td>
  </tr>
</table>

✅ **Every** action described above -- filling in variable values, toggle switching, inserting custom paragraphs -- auto-saves within half a second of your change. Check the Saving/Saved indicator at the top-right of the Embed's Edit screen!

### Embed 'View Mode'

This is the view that is displayed on the Blueprint page when _reading_ it, rather than editing it. With the exception of Internal Notes, it is what a client will see and read when we provide them their Blueprint.

<table>
  <tr>
    <td><strong>Optimistic Rendering</strong></td>
    <td>Cached content appears immediately (no "Loading..." messages). Fresh content fetched and compared in background. Display updates automatically if Source has changed. Users see content instantly, then freshest content appears within seconds — seamless experience.</td>
  </tr>
  <tr>
    <td><strong>Staleness Detection</strong></td>
    <td> Subtle <em>Checking for Source updates...</em> indicator appears during staleness check upon page load. When Source has changed, a prominent green <strong>Review Update</strong> button appears.<br><br>Staleness check happens 2-3 seconds after page loads. Prior to and during the check, cached content displays while the check runs in background.</td>
  </tr>
  <tr>
    <td><strong>Update Available banner</strong></td>
    <td>This banner appears only when user clicks the Review Update button — if the user doesn't have time to check the available update, they can get to it later or work on other Embeds if they like, until they're ready to review and accept the update.<br><br>A side-by-side diff view compares current (cached) Embed content with updated content from the Source level. All toggle tags -- even those that the writer hasn't enabled in the Embed -- are visible in the diff view, so that the writer can be aware of newly-added or changed toggle content and decide whether they wish to enable it now.<br><br>Users can click the Update button to get their Embed onto the new version immediately after reviewing how it will change their Embed's rendered output.</td>
  </tr>
  <tr>
    <td><strong>Documentation Links Display</strong></td>
    <td>Links that are configured at the Source level are displayed at the top of rendered Embed content, similar to the gray boxes traditionally used in MultiExcerpts.</td>
  </tr>
</table>

## 📦 Source Macro Features and Workflow

Architects and other Admin users will create and manage Source macros by inserting the **Blueprint App - Source** macro into a Confluence page.

Generally, the Architecture team will maintain Category-specific 'library' pages containing batches of Source macros for each Category.

### Source 'Bodied Macro' Editing

The text content of a Source excerpt is added within what Atlassian calls a 'bodied macro' text area. This is virtually the only workflow/pattern/interface that the Blueprint Standard Source app has in common with the traditional MultiExcerpt macro.

<table>
  <tr>
    <td><strong>WYSIWYG Editor</strong></td>
    <td>Edit Source content directly in the Confluence page editor using the macro body. Full formatting support includes bold, italic, links, tables, headings, and all standard Confluence formatting. Identical to configuring a MultiExcerpt macro.</td>
  </tr>
  <tr>
    <td><strong>Variable Syntax</strong></td>
    <td>Use <code>{{Variable Name}}</code> syntax to define variables that can be filled in by Embeds.<br><br>Variables are automatically detected from the bodied macro text content when you open the Source macro's config (edit) modal via the Edit pencil at the bottom of the macro's area.<br><br>Variable substitution is functionally very similar to what was supported in the MultiExcerpt app; however, the Blueprint App performs variable substitution via structured tree traversal of the ADF document, preserving formatting and document structure (not simple string replacement).<br><br><strong>Tip:</strong> While variable names can contain hyphens (e.g., <code>{{stack-model}}</code>, <code>{{primary-venue}}</code>), we will generally use Title Case, with spaces separating words, to name our variables in a pretty and more readable way; there is no character limit for our variable names now!</td>
  </tr>
  <tr>
    <td><strong>Toggle Syntax</strong></td>
    <td>Use <code>{{toggle:name}}content{{/toggle:name}}</code> to create conditional content blocks. Toggles, like variables, are automatically detected from content when you open the Source macro's config/edit modal.<br><br>Toggle-controlled conditional content was not a system that MultiExcerpts supported, which forced the Architecture team into creating distinct, slightly tweaked MultiExcerpts for every basic variation or permutation of a given standard solution. With the Blueprint App, a single Source can contain multiple toggleable content blocks, allowing Embeds to enable or disable specific sections as needed.</td>
  </tr>
</table>

### Source Config modal

<table>
  <tr>
    <td><strong>Name/Category tab</strong></td>
    <td>Set a descriptive name for the Source (i.e., <i>Client Profile</i>, <i>Relocations</i>), and assign a Category. The name will generally match the chapter title that will ultimately go into the Client blueprints, but it does not have to match.</td>
  </tr>
  <tr>
    <td><strong>Variables tab</strong></td>
    <td>All <code>{{Variables}}</code> detected in the Source body content are listed automatically in his tab. For each variable, assign an optional helpful description, and/or an optional example value. Both of these metadata fields exist as guides for Blueprint writers filling in Embed content.<br><br> The <strong>Required</strong> flag marks the variable with an *️⃣ asterisk when editing the Embed.</td>
  </tr>
  <tr>
    <td><strong>Toggles tab</strong></td>
    <td>Like Variables, all <code>{{/Toggle}}</code> tags in the Source body content are detected automatically. Add descriptive text explaining what each toggle means and when a user might want to enable it. If two toggles are mutually exclusive by convention, be sure to note that in the Toggle's description.</td>
  </tr>
  <tr>
    <td><strong>Documentation tab</strong></td>
    <td>Add links to relevant documentation that will appear at the top of Embeds. Each link includes a URL and anchor text. Links appear at the top of the rendered Embed content in Blueprint pages, similar to the gray links panel that we've historically applied at the top of our MultiExcerpts.<br><br>The main difference is that with MultiExcerpts, these gray panels would be written into the body content text area using the Confluence <a href="https://atlassian.design/components/section-message/examples">SectionMessage component</a>, while the Blueprint App defines these documentation links using a <a href="https://atlassian.design/components/primitives/box/examples">custom Box component</a>.</td>
  </tr>
</table>

❗<strong>Important:</strong> After saving and closing the Source config modal, you <u>must</u> publish/update the Confluence page itself to actually save changes to the Source excerpt. The Source macro does not auto-save as you write the way that editing an Embed does!

### Source Management Technical Details

The following details are for nerds but may be interesting to someone wondering how we manage and track Source versions for the purpose of our staleness checking logic.

<table>
  <tr>
    <td><strong>UUID-Based Identification</strong></td>
    <td>Each Source has a unique UUID that persists across renames, ensuring stable references even when Sources are renamed. <br><br>MultiExcerpt macros were dangerous to rename because their name was effectively their ID, and renaming a MultiExcerpt macro would in turn break all references to it at the <i>MultiExcerpt Include</i> level.</td>
  </tr>
  <tr>
    <td><strong>Version Tracking</strong></td>
    <td>Content changes to Sources are tracked with semantic hashing for staleness detection. This allows Embeds to know when their Source has been updated.</td>
  </tr>
  <tr>
    <td><strong>Source Page Tracking</strong></td>
    <td>System tracks which page and space contains each Source, enabling direct navigation and source page management.</td>
  </tr>
  <tr>
    <td><strong>Automatic Indexing</strong></td>
    <td>Sources are automatically added to the master index for Admin page visibility, making them searchable and manageable from the Admin page.</td>
  </tr>
</table>

## 📘 ⚙️ Admin page Features

The Admin page can be accessed via **Settings → Manage apps → Blueprint App Admin**, or by clicking the 'View Admin' button in the Source macro's config modal.

### Search, Filter & Sort

The Admin page consists of three tabs:

**📦 Sources | ☑️ Redlines | 💾 Storage**

The **📦 Sources** tab is for looking up, managing, and viewing the usage details of all Source macros.

It contains a left-side nav to quickly find specific Sources using a keyword search by Name, filtering by Category (or a combination of the two). The resulting list of Sources can be sorted alphabetically, grouped by category, or sorted by usage rates (highest or lowest).

The main and most important portion of the **Sources** tab is the **Usage table**. Click on any Source within the left-side nav to view detailed usage information. Shows all pages containing Embeds of the Source, those pages' toggle states, variable values, and staleness information. Heading anchors provide direct navigation to the nearest place within the page for the selected Embed.

The Status column for each Embed in the Usage table will show _Up to date_ or _Update Available_ with timestamps. A stale Embed can be force-updated from within the Usage table.

The **Recovery Options** button will be clickable if an Embed has multiple historic saved versions. We temporarily (for 14 days) store the raw content of historic versions of every Embed, in case a user accidentally erases or deletes an Embed from a page and cannot recover it themselves. Clicking this button opens a modal which lists out all recoverable historic versions and their save timestamps, and previews their stored values/metadata.

The **🧑🏻‍🏫 Redlines** tab provides a queue-based interface for reading and approving system for reviewing recently updated Embeds on Blueprint pages.

The top of the tab allows searching, sorting, and grouping across Embeds. It also aggregated counts of Embeds by status:
- Reviewable
- Pre-Approved
- Needs Revision
- Approved

Each status is displayed with a color-coded badge for quick visual scanning of the overall queue state.

The main and most important portion of the Redlines tab is the queue.

Embeds are displayed in cards, which are color-coded by status. Each card displays an Embed's metadata (page title, Source name, Embed UUID, Last Updated time), and its current review status.

In the middle of the card will be a full preview of the current content of the embed.

On the right side of the card, you can mark an Embed as Approved, flag it as Needs Revision, or change its status to Pre-Approved. Picking a status will reveal an optional comment editor, and you can submit a comment upon the Embed in question as you submit its status change. This comment is saved into the page where the Embed exists, and is automatically applied as an inline comment in the nearest Heading element above the Embed on the page.

The system automatically detects when an already-approved Embed's content has since been modified by a user (by comparing content hashes) and transitions its status back to _Reviewabl_. This ensures that any changes to already-approved content are subject to re-review.

The **💾 Storage** tab is a debugging and inspection tool for querying Forge storage directly by key. This is useful for troubleshooting data issues, inspecting Embeds and sources' raw configurations, and other metadata.

- **Embed Config (macro-vars):** Lets you quickly inspect or debug all the variables, toggle states, and notes for a specific Embed instance.
- **Source (excerpt):** Use this to view or troubleshoot the complete template and metadata of a Source macro stored in the system.
- **Usage Tracking (usage):** Shows where and how a Source is being used across pages, helping with audits and impact analysis.
- **Master Index (excerpt-index):** Allows you to check the master list of all Sources and Embeds, useful for verifying system-wide consistency or identifying missing entries.

Select a key type, then paste the UUID of the record you want to inspect and click Query.

The **Query Results** display shows whether the record was found, its data type, and the size in bytes. If found, the full JSON data is displayed in a formatted, syntax-highlighted code block with line numbers for easy reading. A Copy button allows you to copy the entire JSON to your clipboard for further analysis or sharing.

### Admin Toolbar

<table>
  <tr>
    <td><strong>Create Source</strong><br><br><i>Coming soon</i></td>
    <td>Source creation and editing must be done via the Blueprint Standard - Source macro on Confluence pages. The Admin page is for viewing usage details and managing metadata only.</td>
  </tr>
  <tr>
    <td><strong>Manage Categories</strong></td>
    <td>Add, edit, reorder, or delete categories for Sources. Deletion of a category is blocked if any Sources are assigned to it.</td>
  </tr>
  <tr>
    <td><strong>Check All Sources</strong></td>
    <td>Actively verifies each Source still exists on its source page. Identifies Sources deleted from pages but still in storage, reports orphaned reasons (page deleted, macro removed, etc.), and provides remediation options: view page history to restore deleted Source, navigate to source page, or permanently delete orphaned Source from storage.</td>
  </tr>
    <tr>
    <td><strong>Check All Embeds</strong></td>
    <td>A full-database validator for all Embeds. Refer to the detailed <a href="#check-all-embeds">Check All Embeds</a> section below for a full description.</td>
  </tr>
  <tr>
    <td><strong>Migration Tools</strong></td>
    <td>
      Opens a modal for migrating excerpt (Source) content from the MultiExcerpt app to the Blueprint app as Source macros. Provides a 4-step migration process:
      <ol>
        <li>Clone Blueprint Standard Source macros</li>
        <li>Migrate content from MultiExcerpt</li>
        <li>Generate unique UUIDs for each Source</li>
        <li>Initialize Forge storage entries</li>
      </ol>
      Used for one-time bulk import/migration of existing MultiExcerpt content into the Blueprint App system.
    </td>
  </tr>
  <tr>
    <td><strong>Restore Version</strong></td>
    <td>
      Opens the Emergency Recovery modal which contains two tabs:
      <ul>
        <li><strong>Deleted Embeds</strong>: View and restore soft-deleted Embeds. An Embed becomes soft-deleted when its macro is removed from a Confluence page (either accidentally or intentionally) and then detected as orphaned by an admin cleanup operation. Instead of permanently deleting the configuration, the system moves it to a recovery namespace, preserving all variable values, toggle states, custom insertions, and internal notes. Soft-deleted Embeds are recoverable for 90 days.</li>
        <li><strong>Version History</strong>: View and restore previous versions of active Embeds (Embeds that still exist on their pages). Every time an Embed's configuration is modified (variable values, toggle states, custom insertions, etc.), a version snapshot is automatically created. These version snapshots are retained for 14 days, allowing you to restore an active Embed to any previous state within that window.</li>
      </ul>
      Use this to recover Embeds that were accidentally deleted or restore an Embed to a previous version. Creates a backup snapshot before restoring to ensure the current version is preserved.
    </td>
  </tr>
</table>

### Orphaned Item Detection

You’ll see the Orphaned Item card and its available remediation steps automatically whenever a Source or Embed check identifies Embeds pointing to non-existent (deleted) data.

<table>
  <tr>
    <td><strong>Orphaned Embeds</strong></td>
    <td>Automatically detects Embeds referencing deleted Sources. Shows affected pages and reference counts, and suggests remediation: recreate the Source with same name, update Embeds to reference different Source, or remove Embeds from affected pages.</td>
  </tr>
  <tr>
    <td><strong>Automatic Cleanup</strong></td>
    <td>Removes stale Embed usage entries during Source checking. Verifies Embed instances still exist on their pages. Maintains data integrity across the system.</td>
  </tr>
</table>

### Check All Embeds

The **Check All Embeds** feature provides comprehensive verification of all Embed macros across your Confluence space. It checks that every Embed macro still exists on its respective page and ensures all Embeds point to valid Sources. The system automatically detects Embeds that require updates, such as when their Source has been modified since the Embed was last synced. 

Check All Embeds does **not** automatically delete storage entries for Embeds that have been removed from their pages. This prevents accidental data loss if a user accidentally deletes an Embed and an Admin runs Check All Embeds before they can recover it. Orphaned Embed storage entries are preserved and can be manually cleaned up via the Emergency Recovery modal (**Restore Version** toolbar button) if needed.

During the checking process, you'll see a real-time progress bar showing the percentage completed, detailed status messages (for example, "Checking page 5/12..."), an up-to-date processed items count like "120 / 200 Embeds processed," and an estimated time to completion (ETA) that updates dynamically. You'll also be shown a reminder to keep the Admin page open while the operation is running, as the results of the operation will not be made available if you reload the page or return to it later.

When the check is complete, you can export a CSV report containing detailed information, including:
- Page URL and title
- Source name and category
- Status (active/stale)
- Timestamps for last synced and last modified
- All variable values and toggle states for each Embed
- Custom insertions content (all custom insertion text concatenated with " | " delimiter)

### Source-specific Toolbar

After selecting a Source from the left-side nav, the following toolbar buttons are available for the selected Source:

<table>
  <tr>
    <td><strong>Preview Content</strong></td>
    <td>Opens a modal displaying the raw Source content with all variables and toggle tags visible. This allows you to review the exact content structure, variable syntax, and toggle blocks without navigating to the source page. Useful for quickly verifying Source content or checking variable/toggle syntax.</td>
  </tr>
  <tr>
    <td><strong>View Source</strong></td>
    <td>Navigates directly to the Confluence page containing the Source macro, opening it in a new tab. If the Source macro has a localId, the page will automatically scroll to the macro's location using an anchor link on the page for quick access.</td>
  </tr>
  <tr>
    <td><strong>Export to CSV</strong></td>
    <td>Exports all usage data for the selected Source to a CSV file using the same export function as <b>Check All Embeds</b>. The export includes all pages using this Source, along with variable values, toggle states, status information, timestamps, custom insertions content, and rendered content (plain text) for each Embed instance. The CSV file is automatically downloaded with a filename that includes the Source name and current date.</td>
  </tr>
  <tr>
    <td><strong>Permadelete</strong></td>
    <td>Permanently removes the Source from the library and all storage indexes. This action cannot be undone. <br><br><strong>Important:</strong> This only deletes the Source from the Blueprint App library—the actual content remains stored in the Source macro on its Confluence source page. After deletion, you'll be prompted to view the source page if you want to access the content to delete it from the relevant page.</td>
  </tr>
  <tr>
    <td><strong>Force Update to All Pages</strong></td>
    <td>Pushes the latest Source content to all Embed instances across all pages that use this Source. This button is only enabled when there are stale Embed instances (Source has been modified since Embeds last synced).<br><br>This is generally only going to be used when a Source has been changed and the change was either trivial and completely non-destructive (i.e., fixing a typo), or the change was absolutely necessary and urgently needs to be propagated to all Blueprints.<br><br>This function updates all cached Embed configurations with the current Source content, variable definitions, toggle definitions, and documentation links. Requires confirmation before executing.</td>
  </tr>
</table>

---

## 📊 Performance Expectations and Mitigations

Confluence Forge apps are instantiated as individual iframes, and as such each Embed macro on a Blueprint page runs in its own isolated iframe. Without caching, each iframe would independently fetch data from Forge storage on every page load.

We anticipate that each Blueprint will contain somewhere between 30 and 60 Embeds, depending on the client vertical and their business' complexity.

In order to reduce loadtimes and create the appearance of near-immediate loading, we've implemented an **optimistic rendering strategy** with aggressive caching specifically within the 'Embed View' (the rendered iframe shown within a Published Blueprint page).

### Caching Mechanisms

1. **On First Load (Uncached):** Each Embed fetches data from Forge storage, processes it, and stores the rendered content in cache (`macro-cache:{localId}`). An initial load of a Blueprint page with no cached content may take 5-10 seconds to gradually load and render all iframes, similar to MultiExcerpt Include macros on traditional Blueprint pages.

2. **On Subsequent Loads (Cached):** Each Embed (nearly) immediately displays cached content from storage, then performs a background refresh to check for updates. This creates the appearance of instant loading while ensuring content stays current.

### Performance Expectations

Thanks to our optimistic rendering strategy, we estimate the following performance characteristics for **cached** Blueprint pages:

| # Embeds | Performance |
|----------|-------------|
| 1 Embed | Instant display (~100ms) + 500ms-1s background refresh |
| 5 Embeds | Instant display (~100ms) + 1-2s background refresh |
| 20 Embeds | Instant display (~100ms) + 3-5s background refresh |
| 50+ Embeds | Instant display (~100ms) + 5-10s background refresh |

**Key Points:**
- **Instant display** shows cached content near immediately -- readers should rarely see any 'Loading...' messages for long, if at all
- **Background refresh** happens _after_ content is already visible, with a 2-3 second delay (plus randomized jitter) to prevent network bursts
- If the Source has data that isn't reflected in the Embed's cached version, the Embed will automatically update its display once the background refresh completes
- No user action is required - readers see cached content instantly, then the freshest content appears within a few seconds

---
## Sample Storage Structure

The following are examples of the JSON blobs that store Source and Embed content in Forge key-value storage.

#### Source (excerpt:{id}):
```javascript
{
  "id": "73f77d48-f4b3-4666-9463-d699421b21de",
  "name": "Relocations",
  "category": "Season Tickets",
  "content": {
    "type": "doc",
    "version": 1,
    "content": [
      {
        "type": "paragraph",
        "content": [
          {
            "type": "text",
            "text": "{{Client}} offer a window in {{Month}} of every year in which full {{Subscriber}}s can "
          },
          {
            "type": "text",
            "marks": [{ "type": "strong" }],
            "text": "relocate"
          },
          {
            "type": "text",
            "text": " their {{Subscription}} packages through {{toggle:SeatGeek Relocations}}SeatGeek's "
          }
          // ... (full ADF document structure)
        ]
      }
      // ... (additional paragraphs)
    ]
  },
  "contentHash": "5b961d030a180921608842373cd789f1542eadf14de05e05b6c3320e53d757c4",
  "variables": [
    {
      "name": "Client",
      "description": "",
      "required": true,
      "example": ""
    },
    {
      "name": "Month",
      "description": "The month of the year in which the client's Relocation window opens.",
      "required": true,
      "example": "March"
    },
    {
      "name": "Subscriber",
      "description": "",
      "required": true,
      "example": "season ticket member"
    },
    {
      "name": "Subscription",
      "description": "",
      "required": true,
      "example": "season ticket"
    },
    {
      "name": "Add-On Price Type",
      "description": "If the client allows STMs to purchase add-ons in the Relocations flow, which Price Type do those add-ons sell at?",
      "required": false,
      "example": "Season Add-On"
    }
  ],
  "toggles": [
    {
      "name": "SeatGeek Relocations",
      "description": "Enable if the client uses SeatGeek 'native' Relocations. Effectively mutually exclusive with the 'MMC' toggle."
    },
    {
      "name": "MMC",
      "description": "Enable if the client uses MMC as their Relocations provider. Effectively mutually exclusive with the 'SeatGeek Relocations' toggle."
    },
    {
      "name": "Add-Ons",
      "description": "Enable if the client allows fans to purchase additional season tickets in the Relocations flow. This is an option with both SeatGeek Relocations and MMC."
    },
    {
      "name": "Upgrade Pay-in-Full requirement",
      "description": "Enable if fans must pay in full for their relocation as they relocate. Mutually exclusive with the 'Upgrade Payment Plan available' toggle."
    },
    {
      "name": "Upgrade Payment Plan available",
      "description": "Enable if fans can pay for their upgrade with their existing, open payment plan. Mutually exclusive with the 'Upgrade Pay-in-Full requirement' toggle."
    },
    {
      "name": "Deposit",
      "description": "Enable if the client calls a deposit a 'deposit'"
    },
    {
      "name": "Account Credit",
      "description": "Enable if the client calls a deposit an 'account credit'"
    },
    {
      "name": "Back office relocations",
      "description": "Enable if the client's ticket office/reps process relocations for fans via the back office, in addition to an online Relocations app."
    }
  ],
  "documentationLinks": [
    {
      "url": "https://support.enterprise.seatgeek.com/s/article/Relocations-Overview",
      "anchor": "Relocations: Offering upgrades and downgrades to season ticket holders"
    }
  ],
  "sourcePageId": "103383041",
  "sourceSpaceKey": "~5bb22d3a0958e968ce8153a3",
  "sourceLocalId": "abb6ae75-6138-4cce-86f5-b2258f811b47",
  "createdAt": "2025-11-11T00:17:09.501Z",
  "updatedAt": "2025-11-11T02:28:15.936Z"
}
```

#### Embed (macro-vars:{localId}):
```javascript
{
  "excerptId": "73f77d48-f4b3-4666-9463-d699421b21de",
  "variableValues": {
    "Month": "May",
    "Subscriber": "STM",
    "client": "Rockford Peaches",
    "Add-On Price Type": "Season New Add-On price type",
    "Client": "Rockford Peaches",
    "Subscribers": "",
    "Subscription": "season ticket"
  },
  "toggleStates": {
    "Deposit": false,
    "MMC": false,
    "Account Credit": true,
    "Add-Ons": true,
    "Upgrade Payment Plan available": true,
    "SeatGeek Relocations": true,
    "Back office relocations": true
  },
  "customInsertions": [
    {
      "position": 0,
      "text": "The offer is visible to all STMs."
    }
  ],
  "internalNotes": [
    {
      "position": 2,
      "content": "This price type is exclusively used for add-on tickets, and will change year over year."
    }
  ],
  "syncedContentHash": "5b961d030a180921608842373cd789f1542eadf14de05e05b6c3320e53d757c4",
  "syncedContent": {
    "type": "doc",
    "version": 1,
    "content": [
      {
        "type": "paragraph",
        "content": [
          {
            "type": "text",
            "text": "{{Client}} offer a window in {{Month}} of every year in which full {{Subscriber}}s can "
          }
          // ... (full Source ADF document at sync time)
        ]
      }
      // ... (additional paragraphs)
    ]
  },
  "lastSynced": "2025-11-13T18:59:41.687Z",
  "updatedAt": "2025-11-14T08:14:16.131Z",
  "redlineStatus": "approved",
  "approvedContentHash": "8e589ea7a01df17a4cf15fd1662b23ede418c967e82d14357abd2703aaf007ca",
  "approvedBy": "5bb22d3a0958e968ce8153a3",
  "approvedAt": "2025-11-14T08:14:16.131Z",
  "lastChangedBy": "5bb22d3a0958e968ce8153a3",
  "lastChangedAt": "2025-11-14T08:14:16.131Z",
  "statusHistory": [
    {
      "status": "needs-revision",
      "previousStatus": "reviewable",
      "reason": "Flagged for revision: needs some work",
      "changedBy": "5bb22d3a0958e968ce8153a3",
      "changedAt": "2025-11-14T06:45:58.837Z"
    },
    {
      "status": "content-complete",
      "previousStatus": "needs-revision",
      "reason": "Marked as content-complete: Looks good, but is it true?",
      "changedBy": "5bb22d3a0958e968ce8153a3",
      "changedAt": "2025-11-14T06:50:13.902Z"
    },
    {
      "status": "needs-revision",
      "previousStatus": "content-complete",
      "reason": "Flagged for revision: Not sure ab",
      "changedBy": "5bb22d3a0958e968ce8153a3",
      "changedAt": "2025-11-14T07:19:58.013Z"
    },
    {
      "status": "needs-revision",
      "previousStatus": "needs-revision",
      "reason": "Flagged for revision: I dunno about this one it needs some work",
      "changedBy": "5bb22d3a0958e968ce8153a3",
      "changedAt": "2025-11-14T07:59:06.265Z"
    },
    {
      "status": "approved",
      "previousStatus": "needs-revision",
      "reason": "Approved: Nicely done!",
      "changedBy": "5bb22d3a0958e968ce8153a3",
      "changedAt": "2025-11-14T08:14:16.131Z"
    }
  ],
  "pageId": "102924290"
}
```

---

## 🏗️ System Architecture

### Project Structure

The Blueprint App is organized for clarity, modularity, and maintainability. 

Each component (Sources, Embeds, Admin) is a distinct domain of the app which has its own logic separated into resolvers (back-end functions), React components (front-end Forge UI), and utility modules, in order to minimize the risk of cross-feature regressions. 

This structure aims to make this app easier to update, extend, and debug.

```
blueprint-app/
├── manifest.yml                # Forge app manifest and module declarations
├── package.json                # Project dependencies and scripts
├── src/
│   ├── index.js                # App entry point: registers all resolvers
│   ├── resolvers/
│   │   ├── source-resolvers.js   # CRUD for Source macros
│   │   ├── embed-resolvers.js    # CRUD for Embed macros
│   │   ├── admin-resolvers.js    # Admin and reporting endpoints
│   │   └── version-resolvers.js  # Storage versioning & recovery
│   ├── components/
│   │   ├── SourceDisplay.jsx       # Source macro display
│   │   ├── SourceConfig.jsx        # Source macro configuration UI
│   │   ├── EmbedDisplay.jsx        # Embed macro display (– with variable/toggle substitution)
│   │   ├── EmbedConfig.jsx         # Embed macro configuration UI (with preview, free write, notes)
│   │   ├── AdminDashboard.jsx      # Main admin dashboard (includes verification)
│   │   ├── ExcerptPreviewModal.jsx # Preview and recovery for excerpt content
│   │   └── EmergencyRecoveryModal.jsx  # Admin UI for version restore and recovery
│   ├── utils/
│   │   ├── storage-validator.js    # Pre-flight and integrity checks for storage writes
│   │   ├── logger.js               # Centralized logging utility
│   │   └── version-manager.js      # Snapshot/restore and version pruning logic
│   └── constants.js                # App-wide constants (storage keys, limits, etc.)
```

*Note: Only core src files and main configuration files are shown. Tests, build artifacts, and auxiliary markdown documents are omitted here.*

The Blueprint App is a focused content management solution for Confluence Cloud. It enables SeatGeek to create reusable content blocks called **Sources**, which are then inserted into Client-specific Blueprint documents as **Embeds** with configurable variable values. The **Admin** page tabulates the data on Source and Embed usages, and provides a queue-based content review and approval tool.

Designed as an Atlassian Forge serverless application, it runs securely on Atlassian's infrastructure.

**Front end:**
- React 18 with Forge UI Kit components (@forge/react)
- React Query (TanStack) for state management and caching
- ADF (Atlassian Document Format) for rich text content

**Back end:**
- Node.js serverless functions (Forge resolvers)
- Forge key-value storage (encrypted)
- Forge Events API v2 for async background jobs
- Confluence REST API for page operations

**Architecture Pattern:**

The Blueprint App uses a four-layer architecture that separates concerns and ensures security:

- **UI Layer:** React components in Forge iframes (sandboxed, cannot directly access Confluence)
  - **What it is:** The user interface (buttons, forms, previews) runs in isolated iframe containers embedded in Confluence pages
  - **Why it matters:** This isolation prevents the UI from directly accessing or modifying Confluence data, ensuring security and preventing conflicts with other apps
  - **Functional impact:** The UI can display data and capture user input, but must request all Confluence operations through the backend
  - **Data perspective:** UI components hold temporary state (form values, selected options) but don't store persistent data

- **Bridge Layer:** `invoke()` calls from frontend to backend resolvers
  - **What it is:** A secure communication channel that allows the UI to request operations from backend functions
  - **Why it matters:** This is the only way the sandboxed UI can request data or trigger actions—all requests are validated and controlled
  - **Functional impact:** When a user clicks "Save" or selects a Source, the UI calls `invoke('saveExcerpt', {...})` which triggers a backend function
  - **Data perspective:** Data flows one-way: UI → invoke() → backend resolver (requests) and backend → invoke() → UI (responses)

- **Storage Layer:** Key-value store with structured JSON documents
  - **What it is:** Encrypted database where all Blueprint data is stored (Sources, Embed configurations, usage tracking)
  - **Why it matters:** Provides fast, secure persistence without requiring Confluence page edits for every change
  - **Functional impact:** When you save a Source or configure an Embed, the data is stored here immediately, enabling instant lookups and updates
  - **Data perspective:** Stores structured JSON objects like `{id: "...", name: "Relocations", content: {...}, variables: [...]}` under keys like `excerpt:{id}`

- **API Layer:** Resolvers call Confluence REST API when needed (page reads/writes)
  - **What it is:** Backend functions (resolvers) that have permission to read from and write to Confluence pages via Atlassian's REST API
  - **Why it matters:** Only the backend can safely interact with Confluence—it handles authentication, rate limiting, and data validation
  - **Functional impact:** When you publish a page with a Source macro, the resolver reads the page content, processes it, and stores it. When viewing an Embed, the resolver fetches the latest Source data
  - **Data perspective:** Converts between Confluence's page format (ADF documents) and the app's internal storage format, ensuring data consistency

### Data Flow

**Content Creation:**
1. User (i.e., Solutions Architect) writes Source macro body content in Confluence editor (ADF)
2. On save → Resolver calculates `contentHash`, stores to `excerpt:{id}`
3. Auto-detects `{{variables}}` and `{{toggle:name}}` syntax

**Content Instantiation:**
1. User (i.e., CSS) configures Embed macro → Selects Source (if not already selected within a preconfigured Confluence Template) + opts into or out of Toggles + inputs Variable values
2. On auto-save (500ms debounce as user edits) → Resolver stores config to `macro-vars:{localId}`, renders content
   - **Variable substitution:** Performed via structured tree traversal of the ADF document, preserving formatting and document structure (not simple string replacement)
3. Cached rendered ADF stored for fast view-mode display

**Important:** Embed configuration changes are saved automatically to Forge storage as a user types or makes changes in the Embed editor. This data is persisted independently of Confluence page publishing actions. This means:
- Changes are saved as you edit (with 500ms debounce), _even if you don't click "Update" or "Publish" on the Confluence page_
- If you close the page or navigate away without publishing, your Embed configuration changes __were__ still saved
- When the page is viewed later (or published later), the saved Embed configuration will still be used

This is expected behavior—Embed data is stored in Forge storage, not in the Confluence page content itself, and SeatGeek developed this app in a specific way to ensure that users do NOT lose data as they work.

**Staleness Detection:**
1. Embed stores `syncedContentHash` (copy of Source's `contentHash` at time of sync)
   - Source's `contentHash` includes: body text content (ADF), name, category, variables, toggles, documentationLinks
   - Source's `contentHash` excludes: id, timestamps (createdAt, updatedAt), source metadata
2. On render → Compare Source's current `contentHash` vs Embed's `syncedContentHash`
3. If different → Show [Update Available banner], to indicate that the Source content has changed in some way since the last time the Embed synced to it. 
    - Embeds are **not** automatically updated when Sources change, unless a user [triggers a Force Update from the Admin page](#source-specific-toolbar).
    - Blueprint writers can view a side-by-side Diff View of their current Embed content compared to the latest Source content, to see how it will change before they accept the update.
    - All toggles/tags are visible in the diff for full context. Changes to Documentation Links is **not** shown, although updates can be available in cases where only Documentation Links have changed at the Source level.
    - The banner is only shown after user action; a 'stale' Embed will still be rendered and readable in the Blueprint and the user can accept the update at their convenience. Users will be encouraged to accept updates, and important updates will be announced (or, in some cases, [forced by Admins.](#source-specific-toolbar))

**Usage Tracking:**
1. Embed update auto-saves → Registers new usage entry in `excerpt-usage:{excerptId}`
2. Admin UI → Queries all usage entries automatically to show where, and how, every Source is referenced as an Embed across the SeatGeek Confluence space
3. Force Update (To All Pages, or on a specific Embed) → Runs through all registered usages, then updates each Embed instance with the latest content

**Async Architecture:**
- Long-running operations (Check All Embeds) use Forge Events queue
- Job triggers return immediately with `progressId`
- Background worker processes queue, updates progress storage
- Frontend polls progress via resolver

**Hash-Based Change Detection:**

**How It Works:**
1. **Content Hashing:** Each excerpt stores a SHA256 `contentHash` representing its semantic content (content, name, category, variables, toggles)
2. **Synced Hash:** Each Embed stores the `syncedContentHash` it last synced with
3. **Comparison:** Compares Source `contentHash` with Embed's `syncedContentHash`
4. **Detection:** If hashes differ, content has actually changed (not just timestamps)
5. **Fallback:** Uses timestamp comparison for backward compatibility with pre-hash Embeds

**Technical Details:**
- **Hash includes:** Content (ADF), name, category, variables (with descriptions), toggles (with descriptions)
- **Hash excludes:** ID, timestamps, source metadata (sourcePageId, sourceSpaceKey, sourceLocalId)
- **Normalization:** Recursive JSON key sorting ensures consistent hashing regardless of ADF key ordering
- **Algorithm:** SHA256 for cryptographic-strength comparison
- **False Positive Prevention:** Publishing pages without changes doesn't trigger updates (see `src/utils/hash-utils.js`)

**Why Hash-Based Detection:**
- **Eliminates false positives:** Prevents "Update Available" when content hasn't actually changed
- **ADF key ordering immunity:** Confluence may reorder JSON keys during publish - hash normalization handles this
- **Semantic comparison:** Only meaningful changes trigger updates (not just page views or republishing)
- **Performance:** Fast hash comparison without deep content inspection
- **Deterministic hashing:** Same content = same hash, regardless of when it was published

**Internal Notes Rendering & Filtering:**

Internal Notes are rendered in ADF format with two components:
- **Inline markers:** Text nodes with superscript Unicode numbers (¹, ², ³, etc.) displayed at paragraph positions where notes exist
- **Notes panel:** ADF `expand` node with `title: '🔒 Internal Notes'` that contains the full note content
- **Position constraints:** One note per paragraph position (button disabled if position already has a note)

**External Content Filtering:**

Internal Notes will ultimately be filtered out and hidden from client view via the coming Salesforce-to-Confluence custom integration. The filtering logic for the Salesforce representation of the Blueprint document:

*Filter Rules:*
1. Remove all ADF `expand` nodes (type: 'expand') - this hides the entire Internal Notes panel
2. Remove text nodes with `textColor: '#6554C0'` - this removes the inline footnote markers (¹, ², ³)

**Architecture Note:** The actual filtering logic will be implemented in a separate Confluence-Salesforce integration app. The filtering rules are documented in `/Users/quinnsouther/Documents/Code projects/confluence-salesforce-integration/ARCHITECTURAL_OPTIONS.md`.

### Centralized Logging System

Blueprint App uses a centralized logging utility built on the industry-standard [`debug`](https://www.npmjs.com/package/debug) library. This provides namespace-based filtering and rate limiting to prevent console floods.

**How to Use:**

All logging is disabled by default. To enable logging during development, use your browser console:

```javascript
// Enable all logs
localStorage.setItem('debug', 'app:*');

// Enable specific categories
localStorage.setItem('debug', 'app:saves');           // Save operations only
localStorage.setItem('debug', 'app:errors');          // Errors only
localStorage.setItem('debug', 'app:cache');           // Cache operations only

// Enable multiple categories
localStorage.setItem('debug', 'app:saves,app:cache'); // Saves and cache

// Disable all logs
localStorage.setItem('debug', '');
```

After setting the debug preference, **refresh the page** for changes to take effect.

**Available Namespaces:**

| Namespace | Description | Rate Limit |
|-----------|-------------|------------|
| `app:saves` | Save operations (auto-save, cache updates) | 5/second |
| `app:errors` | Error conditions and failures | No limit |
| `app:queries` | React Query operations | 10/second |
| `app:cache` | Cache operations (hits, misses, invalidation) | 10/second |
| `app:verification` | Source/Embed verification checks | 5/second |
| `app:restore` | Backup/restore operations | No limit |

**Rate Limiting:**

The logger automatically limits log output to prevent console floods. When rate limits are exceeded, you'll see a message like:
```
[RATE LIMIT] Suppressed 47 logs in last second
```

**Error Logging:**

Critical errors are always logged to the console, regardless of debug settings, using `console.error()`. These include:
- API failures
- Storage operation errors
- React Query mutation failures
- Unexpected exceptions

**Implementation Details:**

The logging utility is located in `src/utils/logger.js` and can be imported in any file:

```javascript
import { logger, logError } from '../utils/logger';

// Use namespaced loggers
logger.saves('Content saved successfully');
logger.cache('Cache hit for:', localId);

// Log errors with context
logError('API call failed', error, { pageId, excerptId });
```

---

## 🐛 Known Issues

### Known Issues & Bug Tracking

Bugs or deficiencies that are directly related to this app (as opposed to inherent limitations of Confluence or Atlassian Forge) will be filed and tracked in the project's GitHub Issues list: [https://github.com/qrsouther/blueprint-app/issues](https://github.com/qrsouther/blueprint-app/issues).

---

#### Font Size (14px Fixed)
**Issue:** Embed body text renders at 14px and cannot be changed to 16px or any other size.

**Root Cause:** Forge UI Kit's `AdfRenderer` component has hardcoded internal styles that ignore parent container font-size CSS. The ADF specification doesn't include a fontSize mark type, making it impossible to override this behavior through styling or ADF manipulation.

**Workaround:** None available with current Forge UI Kit architecture.

**Future Resolution:** This limitation will be resolved in the planned "Custom UI" rewrite, which will use a single iframe/compositor model with full CSS control. In that architecture, 16px body text will be the standard.

**Community Discussion:** [Atlassian Community Thread - Different font size UI Kits Text vs AdfRenderer](https://community.developer.atlassian.com/t/different-font-size-ui-kits-text-vs-adfrenderer/96454)

## 🤝 Contributing

This is a custom internal Forge app that is specifically designed for SeatGeek's Blueprint program. Questions or bugs can be directed to Quinn on the Architecture team.

---

## 📄 License

For SeatGeek's Internal use only.

<a href="https://www.flaticon.com/free-icons/blueprint" title="blueprint icons">Blueprint icons displayed in the Macro menu in Confluence's editing page created by Freepik - Flaticon</a>

---

**Project TODO:** See [TODO.md](TODO.md) for ongoing tasks and future enhancements.