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
- [🔧 Developer Documentation](#-developer-documentation)
- [🐛 Known Issues](#-known-issues)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)

---

## 📐 Core Components

The Blueprint App consists of three major systems: the **Source** macro, the **Embed** macro, and the **Admin** page.

| <h3>🎯 Embed</h3>*CSS, Implementers, et al.* | <h3>📦 Source</h3>*Architecture* | <h3>⚙️ Admin</h3>*Architecture, CSS Managers, MOps Leadership* |
|:-------------------------------------|:----------------------- |:------------------------------------------------------|
|Macros that inject content from a selected Source directly into the page, personalized for each client's Blueprint.<br><br>[View the Embed macro's detailed features](#-embed-macro-features-and-workflow)|Macros consisting of reusable content templates, written primarily by the Architecture team.<br><br>[View the Source macro's detailed features](#-source-macro-features-and-workflow)|Admin view to manage and report on all Sources and Embeds.<br><br>[View the Admin page's detailed features](#-admin-ui-features)|

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

🚫 Not a static site generator (content is injected into Confluence pages)

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
    <td><Strong>Source selection</Strong></td>
    <td>Dropdown menu to choose from all available Sources, or search by name. After selecting a Source, use the View Source button to go to the page where the Source macro is configured.</td>
  </tr>
  <tr>
    <td><Strong>Toggles tab</Strong></td>
    <td>Enable/disable toggles to display or hide content blocks. Descriptions will often accompany each toggle. Preview panel will live-update when toggles are switched. Toggle positions are auto-saved near-instantly.</td>
  </tr>
  <tr>
    <td><Strong>Write tab (Variables)</Strong></td>
    <td>Text fields are available to input a value into each variable defined at the Source. Variable substitutions will update the preview panel beneath in real-time as you type. <br><br> *️⃣ Asterisks denote required variables (should not be left null). Variables without asterisks can be considered optional, and often are those that exist only within toggle blocks.<br><br>Variables, like Toggles, can have accompanying descriptions -- particularly in cases where the variable's meaning is not-obvious based on its name. Variables can and usually will have generic example text which is displayed as a placeholder, to help users see what the variable input expects (i.e., a single word, versus a standalone sentence, versus a full paragraph).
    <br><br>Variable inputs, like toggle settings, are auto-saved near-instantly.<br><br><Strong>Tip:</Strong> ✅ will appear to the right of variables' input fields as you fill them in. Turn all your variable lines green!</td>
  </tr>
  <tr>
    <td><Strong>Custom tab<br></Strong></td>
    <td>Insert custom, free-written paragraphs of your own content at any position (Placement) within the Embed's content field. You can insert multiple external or internal custom paragraphs, but use discretion -- the more custom content you write, the less standard your client's approach may be.<br><br>Users no longer need to write freeform content outside of/beneath the excerpted content macro, as was the case with MultiExcerpts. Custom insertions are integrated directly into the Embed's content structure at specified positions.<br><br>The preview panel below will show complete rendered content, including custom insertions and internal notes.<br><br>📝 External content paragraphs will appear within the Blueprint document supplied to the client. SeatGeek employees and the client alike can read these custom insertions. <br><br>🔒 Internal Notes will <Strong>not</Strong> be visible to clients at all; they will only be visible within the Confluence page of the Blueprint, and only to other SeatGeek employees. Internal Notes act as inline footnotes, and will be marked with a superscript number in the Embed's rendered view (again, only visible internally); those numbers match to the notes which are saved and shown within the <em>🔒 Internal Notes</em> panel displayed at the bottom of the Embed.<br><br><Strong>Tip:</Strong> Use Internal Notes to stash links to Jira tickets, Slack conversations, or background information that only your SeatGeek teammates need to know about. The reasoning and context behind the ways a SeatGeek client does things is the most valuable part of every Blueprint!</td>
  </tr>
</table>

✅ **Every** action described above -- filling in variable values, toggle switching, inserting custom paragraphs -- auto-saves within half a second of your change and triggers content injection into the page. Check the Saving/Saved indicator at the top-right of the Embed's Edit screen!

### Embed 'View Mode' (Native Content Display)

With content injection, Embed content is displayed as **native Confluence content** directly on the page. There is no iframe or separate rendering context—the content is part of the page itself, just like any manually-written Confluence content.

<table>
  <tr>
    <td><Strong>Native Rendering</Strong></td>
    <td>Content appears instantly as native Confluence content—no loading states, no iframes. The rendered content is stored directly in the page and displayed by Confluence's native rendering engine. This means content is searchable, exportable, and visible in Page History.</td>
  </tr>
  <tr>
    <td><Strong>Staleness Detection</Strong></td>
    <td>When accessing Edit Mode, the system checks if the Source has been updated since the last injection. If changes are detected, a prominent green <Strong>Review Update</Strong> button appears, allowing users to review and accept the update at their convenience.</td>
  </tr>
  <tr>
    <td><Strong>Update Available banner</Strong></td>
    <td>This banner appears in Edit Mode when Source changes are detected. A side-by-side diff view compares current injected content with the updated Source content. All toggle tags—even disabled ones—are visible in the diff view, so writers can see newly-added content and decide whether to enable it.<br><br>Clicking Update re-renders the content with the latest Source and re-injects it into the page.</td>
  </tr>
  <tr>
    <td><Strong>Documentation Links Display</Strong></td>
    <td>Links configured at the Source level are injected at the top of the Embed's chapter content, similar to the gray info boxes traditionally used in MultiExcerpts.</td>
  </tr>
  <tr>
    <td><Strong>Page History Integration</Strong></td>
    <td>Because content is injected into page storage, all rendered Embed content—including custom insertions and internal notes—is captured in Confluence's native Page History. Users can use Confluence's built-in version comparison to see how Blueprint content has changed over time.</td>
  </tr>
</table>

## 📦 Source Macro Features and Workflow

Architects and other Admin users will create and manage Source macros by inserting the **Blueprint App - Source** macro into a Confluence page.

Generally, the Architecture team will maintain Category-specific 'library' pages containing batches of Source macros for each Category.

### Source 'Bodied Macro' Editing

The text content of a Source excerpt is added within what Atlassian calls a 'bodied macro' text area. This is virtually the only workflow/pattern/interface that the Blueprint Standard Source app has in common with the traditional MultiExcerpt macro.

<table>
  <tr>
    <td><Strong>WYSIWYG Editor</Strong></td>
    <td>Edit Source content directly in the Confluence page editor using the macro body. Full formatting support includes bold, italic, links, tables, headings, and all standard Confluence formatting. Identical to configuring a MultiExcerpt macro.</td>
  </tr>
  <tr>
    <td><Strong>Variable Syntax</Strong></td>
    <td>Use <code>{{Variable Name}}</code> syntax to define variables that can be filled in by Embeds.<br><br>Variables are automatically detected from the bodied macro text content when you open the Source macro's config (edit) modal via the Edit pencil at the bottom of the macro's area.<br><br>Variable substitution is functionally very similar to what was supported in the MultiExcerpt app; however, the Blueprint App performs variable substitution via structured tree traversal of the ADF document, preserving formatting and document structure (not simple string replacement).<br><br><Strong>Tip:</Strong> While variable names can contain hyphens (e.g., <code>{{stack-model}}</code>, <code>{{primary-venue}}</code>), we will generally use Title Case, with spaces separating words, to name our variables in a pretty and more readable way; there is no character limit for our variable names now!</td>
  </tr>
  <tr>
    <td><Strong>Toggle Syntax</Strong></td>
    <td>Use <code>{{toggle:name}}content{{/toggle:name}}</code> to create conditional content blocks. Toggles, like variables, are automatically detected from content when you open the Source macro's config/edit modal.<br><br>Toggle-controlled conditional content was not a system that MultiExcerpts supported, which forced the Architecture team into creating distinct, slightly tweaked MultiExcerpts for every basic variation or permutation of a given standard solution. With the Blueprint App, a single Source can contain multiple toggleable content blocks, allowing Embeds to enable or disable specific sections as needed.</td>
  </tr>
</table>

### Source Config modal

<table>
  <tr>
    <td><Strong>Name/Category tab</Strong></td>
    <td>Set a descriptive name for the Source (i.e., <i>Client Profile</i>, <i>Relocations</i>), and assign a Category. The name will generally match the chapter title that will ultimately go into the Client blueprints, but it does not have to match.</td>
  </tr>
  <tr>
    <td><Strong>Variables tab</Strong></td>
    <td>All <code>{{Variables}}</code> detected in the Source body content are listed automatically in his tab. For each variable, assign an optional helpful description, and/or an optional example value. Both of these metadata fields exist as guides for Blueprint writers filling in Embed content.<br><br> The <Strong>Required</Strong> flag marks the variable with an *️⃣ asterisk when editing the Embed.</td>
  </tr>
  <tr>
    <td><Strong>Toggles tab</Strong></td>
    <td>Like Variables, all <code>{{/Toggle}}</code> tags in the Source body content are detected automatically. Add descriptive text explaining what each toggle means and when a user might want to enable it. If two toggles are mutually exclusive by convention, be sure to note that in the Toggle's description.</td>
  </tr>
  <tr>
    <td><Strong>Documentation tab</Strong></td>
    <td>Add links to relevant documentation that will appear at the top of Embeds. Each link includes a URL and anchor text. Links appear at the top of the rendered Embed content in Blueprint pages, similar to the gray links panel that we've historically applied at the top of our MultiExcerpts.<br><br>The main difference is that with MultiExcerpts, these gray panels would be written into the body content text area using the Confluence <a href="https://atlassian.design/components/section-message/examples">SectionMessage component</a>, while the Blueprint App defines these documentation links using a <a href="https://atlassian.design/components/primitives/box/examples">custom Box component</a>.</td>
  </tr>
</table>

❗<Strong>Important:</Strong> After saving and closing the Source config modal, you <u>must</u> publish/update the Confluence page itself to actually save changes to the Source excerpt. The Source macro does not auto-save as you write the way that editing an Embed does!

### Source Management Technical Details

The following details are for nerds but may be interesting to someone wondering how we manage and track Source versions for the purpose of our staleness checking logic.

<table>
  <tr>
    <td><Strong>UUID-Based Identification</Strong></td>
    <td>Each Source has a unique UUID that persists across renames, ensuring stable references even when Sources are renamed. <br><br>MultiExcerpt macros were dangerous to rename because their name was effectively their ID, and renaming a MultiExcerpt macro would in turn break all references to it at the <i>MultiExcerpt Include</i> level.</td>
  </tr>
  <tr>
    <td><Strong>Version Tracking</Strong></td>
    <td>Content changes to Sources are tracked with semantic hashing for staleness detection. This allows Embeds to know when their Source has been updated.</td>
  </tr>
  <tr>
    <td><Strong>Source Page Tracking</Strong></td>
    <td>System tracks which page and space contains each Source, enabling direct navigation and source page management.</td>
  </tr>
  <tr>
    <td><Strong>Automatic Indexing</Strong></td>
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

The **Recovery Options** button provides access to Embed recovery tools. With content injection, rendered content is captured in Confluence's native Page History, so users can use Confluence's built-in version comparison and restore features to recover previous content. The Recovery Options modal provides additional tools for recovering Embed configurations from Forge storage.

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
    <td><Strong>Create Source</Strong><br><br><i>Coming soon</i></td>
    <td>Source creation and editing must be done via the Blueprint Standard - Source macro on Confluence pages. The Admin page is for viewing usage details and managing metadata only.</td>
  </tr>
  <tr>
    <td><Strong>Manage Categories</Strong></td>
    <td>Add, edit, reorder, or delete categories for Sources. Deletion of a category is blocked if any Sources are assigned to it.</td>
  </tr>
  <tr>
    <td><Strong>Check All Sources</Strong></td>
    <td>Actively verifies each Source still exists on its source page. Identifies Sources deleted from pages but still in storage, reports orphaned reasons (page deleted, macro removed, etc.), and provides remediation options: view page history to restore deleted Source, navigate to source page, or permanently delete orphaned Source from storage.</td>
  </tr>
    <tr>
    <td><Strong>Check All Embeds</Strong></td>
    <td>A full-database validator for all Embeds. Refer to the detailed <a href="#check-all-embeds">Check All Embeds</a> section below for a full description.</td>
  </tr>
  <tr>
    <td><Strong>Migration Tools</Strong></td>
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
    <td><Strong>Restore Version</Strong></td>
    <td>
      Opens the Emergency Recovery modal for recovering Embed configurations:
      <ul>
        <li><Strong>Deleted Embeds</Strong>: View and restore soft-deleted Embeds. An Embed becomes soft-deleted when its macro is removed from a Confluence page and then detected as orphaned by an admin cleanup operation. The system preserves all variable values, toggle states, custom insertions, and internal notes in a recovery namespace. Soft-deleted Embeds are recoverable for 90 days.</li>
      </ul>
      <Strong>Note:</Strong> With content injection, rendered content is captured in Confluence's native Page History. To recover previous rendered content, use Confluence's built-in Page History feature. The Emergency Recovery modal is for recovering Embed <em>configurations</em> from Forge storage.
    </td>
  </tr>
</table>

### Orphaned Item Detection

You’ll see the Orphaned Item card and its available remediation steps automatically whenever a Source or Embed check identifies Embeds pointing to non-existent (deleted) data.

<table>
  <tr>
    <td><Strong>Orphaned Embeds</Strong></td>
    <td>Automatically detects Embeds referencing deleted Sources. Shows affected pages and reference counts, and suggests remediation: recreate the Source with same name, update Embeds to reference different Source, or remove Embeds from affected pages.</td>
  </tr>
  <tr>
    <td><Strong>Automatic Cleanup</Strong></td>
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
    <td><Strong>Preview Content</Strong></td>
    <td>Opens a modal displaying the raw Source content with all variables and toggle tags visible. This allows you to review the exact content structure, variable syntax, and toggle blocks without navigating to the source page. Useful for quickly verifying Source content or checking variable/toggle syntax.</td>
  </tr>
  <tr>
    <td><Strong>View Source</Strong></td>
    <td>Navigates directly to the Confluence page containing the Source macro, opening it in a new tab. If the Source macro has a localId, the page will automatically scroll to the macro's location using an anchor link on the page for quick access.</td>
  </tr>
  <tr>
    <td><Strong>Export to CSV</Strong></td>
    <td>Exports all usage data for the selected Source to a CSV file using the same export function as <b>Check All Embeds</b>. The export includes all pages using this Source, along with variable values, toggle states, status information, timestamps, custom insertions content, and rendered content (plain text) for each Embed instance. The CSV file is automatically downloaded with a filename that includes the Source name and current date.</td>
  </tr>
  <tr>
    <td><Strong>Permadelete</Strong></td>
    <td>Permanently removes the Source from the library and all storage indexes. This action cannot be undone. <br><br><Strong>Important:</Strong> This only deletes the Source from the Blueprint App library—the actual content remains stored in the Source macro on its Confluence source page. After deletion, you'll be prompted to view the source page if you want to access the content to delete it from the relevant page.</td>
  </tr>
  <tr>
    <td><Strong>Force Update to All Pages</Strong></td>
    <td>Re-injects the latest Source content to all Embed instances across all pages that use this Source. This button is only enabled when there are stale Embed instances (Source has been modified since Embeds last synced).<br><br>This is generally only going to be used when a Source has been changed and the change was either trivial and completely non-destructive (i.e., fixing a typo), or the change was absolutely necessary and urgently needs to be propagated to all Blueprints.<br><br>This function re-renders each Embed with the current Source content, variable definitions, toggle definitions, and documentation links, then re-injects the content into each page. Requires confirmation before executing.</td>
  </tr>
</table>

---

## 📊 Content Injection Architecture

The Blueprint App uses **native content injection** to deliver Embed content directly into Confluence pages. Unlike traditional Forge apps that render content inside iframes, Blueprint injects fully-rendered content into the page storage itself, making it native Confluence content.

### How Content Injection Works

1. **Edit Mode:** Users configure Embeds using Forge UI (variables, toggles, custom insertions). This configuration is saved to Forge storage.

2. **Content Rendering:** When saved, the system renders the Source content with all substitutions applied (variables filled in, toggles filtered, custom insertions placed).

3. **Page Injection:** The rendered content is injected directly into Confluence page storage via the Content Injection API, appearing as native Confluence content with chapter markers for tracking.

4. **Native Display:** When viewing the page, content is rendered by Confluence itself—not inside an iframe—resulting in instant display with no loading states.

### Performance Benefits

| Aspect | Old Model (Iframes) | New Model (Content Injection) |
|--------|---------------------|-------------------------------|
| Page Load | 5-10s (50 iframes spawning) | Instant (native content) |
| Content Display | Gradual iframe loading | Immediate native render |
| Confluence Search | Not indexed | Fully indexed |
| Page Export/PDF | Inconsistent capture | Full content included |
| Page History | Config only | Full rendered content |
| Copy/Paste | Limited (iframe boundaries) | Native selection |

### What This Means for Users

- **Instant content display:** No "Loading..." messages or gradual iframe population
- **Searchable content:** All Blueprint content appears in Confluence search results
- **Complete exports:** PDF exports and page copies include all Embed content
- **Version history:** Confluence's Page History captures the full rendered content, not just configuration
- **Native experience:** Content behaves like any other Confluence content (selectable, printable, accessible)

---
## Sample Storage Structure

The following are examples of the JSON blobs stored in **Forge key-value storage**. These store Source definitions and Embed configurations.

**Note:** With content injection, there are two storage locations:
- **Forge Storage:** Source definitions (`excerpt:{id}`) and Embed configurations (`macro-vars:{localId}`) — shown below
- **Confluence Page Storage:** Rendered content injected via Content Injection API — stored directly in the page, visible in Page History

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
├── manifest.yml                  # Forge app manifest and module declarations
├── package.json                  # Project dependencies and scripts
├── src/
│   ├── index.js                  # App entry point: registers all resolvers
│   ├── resolvers/
│   │   ├── excerpt-resolvers.js      # CRUD for Source macros
│   │   ├── include-resolvers.js      # CRUD for Embed macros
│   │   ├── injection-resolver.js     # Content injection engine (core)
│   │   ├── compositor-resolvers.js   # Chapter-based composition and archetype management
│   │   ├── redline-resolvers.js      # Redlining/review workflow
│   │   ├── verification-resolvers.js # Source/Embed verification & staleness
│   │   ├── usage-resolvers.js        # Usage tracking and reporting
│   │   └── version-resolvers.js      # Storage versioning & recovery
│   ├── components/
│   │   ├── admin/                    # Admin page components (22 files)
│   │   ├── embed/                    # Embed macro UI components
│   │   │   ├── EmbedEditMode.jsx         # Configuration UI (variables, toggles, etc.)
│   │   │   ├── EmbedViewMode.jsx         # View mode with staleness detection
│   │   │   └── UpdateAvailableBanner.jsx # Diff view for Source updates
│   │   ├── compositor/               # Chapter composition UI
│   │   │   ├── CompositorModal.jsx       # Bulk chapter management
│   │   │   └── ChapterList.jsx           # Chapter ordering and preview
│   │   └── common/                   # Shared UI components
│   ├── utils/
│   │   ├── storage-format-utils.js   # ADF → Storage format conversion
│   │   ├── adf-rendering-utils.js    # ADF manipulation (variables, toggles, etc.)
│   │   ├── storage-validator.js      # Pre-flight integrity checks
│   │   ├── hash-utils.js             # Content hashing for staleness detection
│   │   └── logger.js                 # Centralized logging utility
│   ├── hooks/                        # React hooks for state management
│   ├── styles/                       # xcss style definitions
│   └── workers/                      # Async background job processors
```

*Note: Only core src files are shown. Tests, build artifacts, and documentation files are omitted.*

The Blueprint App is a focused content management solution for Confluence Cloud. It enables SeatGeek to create reusable content blocks called **Sources**, which are then injected into Client-specific Blueprint documents as **Embeds** with configurable variable values. The **Admin** page tabulates the data on Source and Embed usages, and provides a queue-based content review and approval tool.

Designed as an Atlassian Forge serverless application with **native content injection**, it runs securely on Atlassian's infrastructure while delivering content that is fully searchable, exportable, and tracked in Page History.

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

The Blueprint App uses a **content injection architecture** with four layers:

- **Edit UI Layer:** React components in Forge UI (for configuration only)
  - **What it is:** The editing interface (variable inputs, toggle switches, custom insertion fields) runs in Forge UI panels when users click to configure an Embed
  - **Why it matters:** Provides a rich, interactive editing experience while keeping configuration separate from rendered content
  - **Functional impact:** Users configure their Embed settings through this UI; changes trigger content re-rendering and injection into the page
  - **Data perspective:** UI captures configuration state and sends it to backend for processing and injection

- **Injection Engine:** Content rendering and page storage injection
  - **What it is:** Backend resolvers that render Source content with all substitutions applied, then inject the result directly into Confluence page storage
  - **Why it matters:** This is the core innovation—content becomes native Confluence content, not iframe-rendered content
  - **Functional impact:** When a user saves an Embed configuration, the engine renders the content (variables substituted, toggles filtered, custom insertions placed) and injects it into the page with chapter markers
  - **Data perspective:** Transforms Source ADF + Embed configuration → Rendered ADF → Confluence storage format → Page injection

- **Storage Layer:** Forge key-value store for configuration and metadata
  - **What it is:** Encrypted database storing Sources, Embed configurations, usage tracking, and version metadata
  - **Why it matters:** Provides fast configuration storage separate from page content; enables staleness detection via content hashing
  - **Functional impact:** Source definitions, Embed variable values, toggle states, and redline statuses are stored here
  - **Data perspective:** Stores JSON objects like `excerpt:{id}` (Sources) and `macro-vars:{localId}` (Embed configs)

- **Page Storage Layer:** Native Confluence content via Content Injection API
  - **What it is:** The actual rendered Embed content stored directly in Confluence page storage, appearing as native page content
  - **Why it matters:** Content is searchable, exportable, visible in Page History, and renders instantly without iframes
  - **Functional impact:** When viewing a Blueprint page, users see native Confluence content that was injected by the Blueprint App—no loading states, no iframes
  - **Data perspective:** Chapter-marked HTML/storage format content injected between hidden Content Properties macros (`ac:name="details"` with `hidden=true`) that serve as boundary markers

### Data Flow

**Content Creation (Source):**
1. User (i.e., Solutions Architect) writes Source macro body content in Confluence editor (ADF)
2. On page publish → Resolver calculates `contentHash`, stores Source to `excerpt:{id}`
3. Auto-detects `{{variables}}` and `{{toggle:name}}` syntax from content

**Content Configuration & Injection (Embed):**
1. User (i.e., CSS) opens Embed Edit Mode → Selects Source + configures Toggles + inputs Variable values + adds custom insertions/notes
2. On save (500ms debounce as user edits):
   - Configuration is saved to Forge storage (`macro-vars:{localId}`)
   - Content is rendered with all substitutions applied:
     - **Variable substitution:** Structured ADF tree traversal, preserving formatting
     - **Toggle filtering:** Disabled toggle blocks are removed
     - **Custom insertions:** Placed at specified paragraph positions
     - **Internal notes:** Injected with inline markers
   - Rendered content is **injected into page storage** via Content Injection API
3. Page now contains native Confluence content between chapter markers

**Content Injection Details:**
- Rendered content is converted from ADF to Confluence storage format
- Content is wrapped in hidden Content Properties boundary markers (Confluence's `details` macro with `hidden=true` parameter)
- The `id` parameter of each boundary marker stores the Embed's `localId` for reliable chapter detection
- Chapter heading (h2) is injected outside any wrapper macro to enable inline comments
- Body content is injected as native paragraphs (no Section macro wrapper) to support inline comments throughout
- Content appears as native page content—searchable, exportable, in Page History, and fully commentable

**Why Content Properties Macros for Boundaries:**
- Confluence strips HTML comments (`<!-- -->`) and HTML `hidden` attributes from page storage
- The [Content Properties macro](https://support.atlassian.com/confluence-cloud/docs/insert-the-page-properties-macro/) has an officially supported `hidden` parameter that persists
- Boundary markers are invisible to users but reliably detected by the injection engine for chapter updates/removals
- This enables precise chapter boundary detection without visible UI artifacts

**Important:** Embed configuration AND rendered content are both persisted:
- **Configuration** (variable values, toggle states) → Forge storage (`macro-vars:{localId}`)
- **Rendered content** → Confluence page storage (injected via Content Injection API)
- Changes are saved as you edit (with 500ms debounce)
- Page History captures the full rendered content at each injection point
- If you need to recover previous content, use Confluence's native Page History

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

Internal Notes are injected into page storage with two components:
- **Inline markers:** Text nodes with superscript Unicode numbers (¹, ², ³, etc.) displayed at paragraph positions where notes exist
- **Notes panel:** ADF `expand` node with `title: '🔒 Internal Notes'` that contains the full note content
- **Position constraints:** One note per paragraph position (button disabled if position already has a note)

Because Internal Notes are injected into the page, they are visible in Page History and appear in the native Confluence content.

**External Content Filtering:**

Internal Notes are filtered out and hidden from client view via the Salesforce-to-Confluence integration. The filtering logic for the Salesforce representation of the Blueprint document:

*Filter Rules:*
1. Remove all ADF `expand` nodes (type: 'expand') - this hides the entire Internal Notes panel
2. Remove text nodes with `textColor: '#6554C0'` - this removes the inline footnote markers (¹, ², ³)

**Architecture Note:** The actual filtering logic is implemented in a separate Confluence-Salesforce integration app.

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

## 🔧 Developer Documentation

### Error Handling

The codebase uses a standardized error handling system with error codes, user-friendly messages, and error boundaries. See [Error Handling Guide](docs/ERROR_HANDLING_GUIDE.md) for:

- Error code constants and usage
- Resolver error response format
- React Query hook error handling
- Component error handling patterns
- Error boundary usage
- Adding new error codes

### Resolver Return Values

All resolvers follow a consistent return value format. See [Resolver Return Standard](docs/RESOLVER_RETURN_STANDARD.md) for:

- Success response format
- Error response format (with error codes)
- Frontend usage patterns
- Migration checklist

## 🐛 Known Issues

### Known Issues & Bug Tracking

Bugs or deficiencies that are directly related to this app (as opposed to inherent limitations of Confluence or Atlassian Forge) will be filed and tracked in the project's GitHub Issues list: [https://github.com/qrsouther/blueprint-app/issues](https://github.com/qrsouther/blueprint-app/issues).

---

#### ~~Font Size (14px Fixed)~~ — RESOLVED
**Previous Issue:** Embed body text rendered at 14px and could not be changed to 16px or any other size due to Forge UI Kit's `AdfRenderer` component having hardcoded internal styles.

**Resolution:** With the content injection architecture, Embed content is now rendered natively by Confluence, not by Forge UI Kit's AdfRenderer. Content uses Confluence's standard typography, which displays at the expected font sizes.

**Historical Context:** [Atlassian Community Thread - Different font size UI Kits Text vs AdfRenderer](https://community.developer.atlassian.com/t/different-font-size-ui-kits-text-vs-adfrenderer/96454)

## 🤝 Contributing

This is a custom internal Forge app that is specifically designed for SeatGeek's Blueprint program. Questions or bugs can be directed to Quinn on the Architecture team.

---

## 📄 License

For SeatGeek's Internal use only.

<a href="https://www.flaticon.com/free-icons/blueprint" title="blueprint icons">Blueprint icons displayed in the Macro menu in Confluence's editing page created by Freepik - Flaticon</a>

---

**Project TODO:** See [TODO.md](TODO.md) for ongoing tasks and future enhancements.