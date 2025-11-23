# SeatGeek CSS Quick Guide to Blueprint Embeds

An **Embed** is an instance of reusable content (called a **Source**) that you personalize for a specific client. Think of it like:
- **Source** = Template (created by Architecture team)
- **Embed** = Your personalized version for a client

Most Embeds are pre-inserted into Blueprint page templates, so you typically won't need to insert new ones manually.

---

## Accessing an Embed

1. Open a Blueprint page and click **Edit** to open the Confluence page editor 
2. Find the **Blueprint App - Embed** macro on the page
3. Click the **Edit** button (pencil icon) at the bottom of the Embed

You'll see the Embed's **Edit Mode** with three tabs: **Toggles**, **Write**, and **Custom**.

---

## Core Workflow: Configuring an Embed

### Step 1: Select a Source (if needed)

At the top of the Embed editor, you'll see a dropdown to select a Source:

- **If the Embed already has a Source selected:** You can skip this step
- **If you need to change the Source:** Use the dropdown to search and select a different one
- Click **View Source** to see the original Source content on its library page

---

### Step 2: Configure Toggles

Click the **Toggles** tab.

**What are Toggles?**
- Toggles show or hide specific content blocks within the Source
- Each toggle has a description explaining what it does
- Enable toggles that apply to your client's situation

**How to use:**
1. Read each toggle's description
2. Toggle ON the features that apply to your client
3. Toggle OFF the features that don't apply
4. The preview panel below updates automatically as you toggle

**Example:** If a Source has a "Premium Features" toggle, enable it only if your client uses premium features.

---

### Step 3: Fill in Variables

Click the **Write** tab.

**What are Variables?**
- Variables are placeholders in the Source content (like `{{Client Name}}`)
- You fill in the actual values for your client
- Required variables are marked with an asterisk (*)

**How to use:**
1. Look for variables marked with *️⃣ — these are required
2. Fill in each variable with your client's specific information
3. A ✅ checkmark appears next to variables as you complete them
4. The preview panel updates in real-time as you type
5. **Goal:** Turn all variable lines green (all filled in)

**Tips:**
- Variable descriptions and examples help guide you
- Variables auto-save as you type (watch the "Saving..." indicator)
- Optional variables (no asterisk) can be left empty if they don't apply

---

### Step 4: Add Custom Content (Optional)

Click the **Custom** tab.

**External Content (📝):**
- Add custom paragraphs that appear in the client-facing Blueprint
- Select a **Placement** position (where in the content it appears)
- Write your custom paragraph
- Click **Add External Content**

**Internal Notes (🔒):**
- Add staff-only notes that clients won't see
- Useful for: Jira links, Slack conversations, background context
- Appears as a superscript number (¹, ², ³) in the Embed
- Full notes appear in the **🔒 Internal Notes** panel at the bottom

**When to use:**
- Use sparingly — too much custom content makes the Blueprint less standard
- External content: Client-specific details that aren't in the Source
- Internal notes: Context only SeatGeek employees need to know

---

## Understanding the Preview

The preview panel at the bottom shows:
- **Toggles tab:** Raw content with toggle markers visible
- **Write tab:** Fully rendered content (what the client will see)
- **Custom tab:** Raw content with markers (including your custom insertions)

The preview updates automatically as you make changes. Use it to verify your content looks correct.

---

## Auto-Save

**Important:** All changes auto-save within half a second:
- Variable values
- Toggle states
- Custom insertions
- Internal notes

Watch the **Saving/Saved** indicator at the top-right:
- **Saving...** = Changes are being saved
- **Saved** ✓ = All changes are saved

You don't need to click "Save" — your work is automatically preserved even if you close the page.

---

## View Mode: What Clients See

When you're not editing (View Mode), the Embed displays:
- ✅ Fully rendered content with all variables filled in
- ✅ Documentation links at the top (if configured in the Source)
- ✅ Custom external content you added
- ❌ Internal notes are hidden from clients (only visible to SeatGeek employees)

Content appears instantly thanks to caching. A background check runs 2-3 seconds after page load to see if the Source has been updated.

---

## Handling Source Updates

If the Source content changes, you'll see:

1. **Subtle indicator:** "Checking for Source updates..." appears briefly
2. **Review Update button:** A green button appears if updates are available
3. **Click to review:** Opens a side-by-side diff view showing:
   - Current content (left) vs. Updated content (right)
   - All toggle tags visible (even ones you haven't enabled)
4. **Accept update:** Click **Update** to sync to the latest Source content

**Important:** Updates are not automatic. You choose when to accept them after reviewing the changes.

---

## Quick Reference

| Task | Location | Notes |
|------|----------|-------|
| Select Source | Top dropdown | Usually pre-selected in templates |
| Enable/disable features | **Toggles** tab | Read descriptions carefully |
| Fill in client info | **Write** tab | Required fields marked with *️⃣ |
| Add custom paragraphs | **Custom** tab → External Content | Use sparingly |
| Add staff notes | **Custom** tab → Internal Notes | Clients won't see these |
| Preview content | Bottom panel | Updates automatically |
| Check save status | Top-right indicator | Auto-saves as you work |
| Review Source updates | Green "Review Update" button | Appears when Source changes |

---

## Common Workflow

1. Open Blueprint page in Edit mode
2. Click Edit on an Embed macro
3. Go to **Toggles** tab → Enable/disable features
4. Go to **Write** tab → Fill in all required variables (*️⃣)
5. Check preview to verify content looks correct
6. (Optional) Go to **Custom** tab → Add any client-specific content or internal notes
7. Close the Embed editor
8. Publish the Confluence page

That's it! The Embed is now configured for your client.

---

## Tips

- ✅ **Complete all required variables** — Look for the *️⃣ asterisk and green checkmarks to ensure your work is done
- ✅ **Read toggle descriptions** — They explain when to enable each feature
- ✅ **Check the preview** — Verify your content looks good and flows well before closing the editor
- ✅ **Internal notes are your friend** — Use them to document context for your team
- ⚠️ **Custom content sparingly** — Too much custom content reduces standardization
- ⚠️ **Review updates carefully** — Check the diff view before accepting Source updates

---

## Need Help?

- **View Source:** Click the "View Source" button to see the original template
- **Questions:** Contact the Architecture team
- **Issues:** Check the main [README.md](README.md) for detailed documentation

