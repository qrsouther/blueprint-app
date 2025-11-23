# Blueprint App Performance Testing Guide

You now have **three versions** of Blueprint App to compare:

## 1. Original (smart-excerpt)
**Location:** `/Users/quinnsouther/Documents/Code projects/smart-excerpt`
**Status:** ✅ Already registered and deployed (v3.53.0)

**How it works:**
- Include macro loads → calls backend → fetches from storage → performs variable substitution → displays
- **Full round-trip every time**

**Performance:** Baseline (shows "Loading excerpt..." while fetching)

---

## 2. Option 1 - Pre-rendered Content (smart-excerpt-option1)
**Location:** `/Users/quinnsouther/Documents/Code projects/smart-excerpt-option1`
**Status:** ⏳ Needs registration

**How it works:**
- When saving Include config → generates fully substituted content and stores it in config
- When loading page → reads `renderedContent` directly from config (NO backend call)
- **Zero network delay, instant display**

**Performance:** 🚀 **Fastest possible** - Should feel instant

**Trade-off:** ⚠️ If you edit a Source excerpt, existing Includes won't update until you re-edit each one

### To test Option 1:
```bash
cd "/Users/quinnsouther/Documents/Code projects/smart-excerpt-option1"
forge register
# Name it: Blueprint Apps-Option1
forge deploy
forge install
```

---

## 3. Option 4 - Optimistic Rendering (smart-excerpt-option4)
**Location:** `/Users/quinnsouther/Documents/Code projects/smart-excerpt-option4`
**Status:** ⏳ Needs registration

**How it works:**
- When saving Include config → generates and stores `cachedContent`
- When loading page → **immediately displays cached content** (instant!)
- Simultaneously fetches fresh content in background
- If content changed → silently updates display
- **Best of both worlds: instant display + auto-updates**

**Performance:** 🚀 **Instant perceived performance** + always up-to-date

**Trade-off:** Might briefly show stale content if Source was edited (but updates within ~1 second)

### To test Option 4:
```bash
cd "/Users/quinnsouther/Documents/Code projects/smart-excerpt-option4"
forge register
# Name it: Blueprint Apps-Option4
forge deploy
forge install
```

---

## Testing Methodology

### 1. Install all three versions
Register and install all three apps in your Confluence development site.

### 2. Create test excerpts
In each app, create the same test excerpt with variables.

### 3. Create test page
Create a page with Includes from all three apps side-by-side:
- Original Include
- Option 1 Include
- Option 4 Include

### 4. Performance metrics to observe:

**Initial Load:**
- How long does "Loading..." appear?
- How quickly does content appear?

**Reload page:**
- Press Cmd+R (hard refresh)
- Time from page load to content visible

**Source excerpt edits:**
- Edit the Source excerpt content
- Reload pages with Includes
- Which ones show updated content?
- How quickly?

### 5. Browser DevTools
- Open Network tab
- Note number of requests
- Check timing for `invoke` calls

---

## Expected Results

| Version | Initial Display | After Source Edit | Network Calls |
|---------|----------------|-------------------|---------------|
| Original | ~1-2 seconds | ✅ Shows updates immediately | 1 per Include |
| Option 1 | 🚀 Instant | ❌ Shows old content until re-edited | 0 |
| Option 4 | 🚀 Instant | ✅ Updates within ~1 second | 1 per Include (background) |

---

## Recommendation

Based on your requirements:
- If **performance is critical** and you don't mind manually refreshing Includes → **Option 1**
- If you want **both performance AND auto-updates** → **Option 4** ⭐ (Recommended)
- If you want **maximum reliability** with acceptable performance → **Original**

---

## Next Steps

1. Register and deploy Option 1 and Option 4
2. Test all three side-by-side
3. Choose your preferred approach
4. We can then merge the chosen approach back into the main app
5. Continue with adding new features
