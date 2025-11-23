# Embed Orphaning Diagnostic Tests

**Incident:** Two embeds became orphaned after clicking "Check All Embeds" button
**Symptoms:**
- Embeds show as "orphaned" in Admin
- Admin Usage table DOES show stored values correctly (variables, toggles)
- Pages display "No standard selected. Edit this macro to choose one."
- Push Update fails with "No instances found on this page"

**Key Question:** How did the embed macros lose their configuration while storage data remained intact?

---

## Test Suite: Safe Diagnostic Steps

### Phase 1: Understand Current State (Read-Only - SAFE)

#### Test 1.1: Inspect Storage Keys
**Goal:** Verify stored data exists and is intact
**Steps:**
1. Open browser DevTools console on Admin page
2. Run: `await invoke('debugStorageKeys')`
3. Look for keys matching pattern: `macro-vars:{localId}`
4. Verify there are 2 keys (one per orphaned embed)

**Expected Result:** Storage keys exist with intact data
**What This Tells Us:** Storage is fine, problem is in macro-storage linking

---

#### Test 1.2: Check Macro Configuration
**Goal:** See what the embed macro currently knows about itself
**Steps:**
1. Go to page with orphaned embed
2. Click Edit on the embed macro
3. Open browser console
4. Check if `excerptId` is shown in the dropdown/config

**Expected Result:** No excerptId selected (config was reset)
**What This Tells Us:** Macro lost its excerptId reference, but localId may be intact

---

#### Test 1.3: Examine Admin Usage Data Source
**Goal:** Understand how Admin shows "correct" usage data for orphaned embeds
**Steps:**
1. In Admin, click on one of the orphaned standards
2. Open browser console
3. Look at the usage data structure shown
4. Check: Does it show `localId`? Does it show `excerptId`?

**Expected Result:** Usage data has localId and excerptId, but macro doesn't
**What This Tells Us:** Storage keyed by localId is intact, macro just lost excerptId

---

### Phase 2: Identify Root Cause (Read-Only - SAFE)

#### Test 2.1: Review Check All Embeds Logic
**Goal:** Understand what Check All Embeds actually does
**Steps:**
1. Search codebase for `checkAllIncludes` resolver
2. Read the function - does it:
   - Modify macro configurations?
   - Delete storage keys?
   - Update localIds?
3. Look for any "write" operations

**Expected Finding:** Function may be resetting macro configs during scan
**Critical Question:** Does it edit macro bodies or just read them?

---

#### Test 2.2: Review Check All Standards Logic
**Goal:** Understand what Check All Standards does
**Steps:**
1. Search codebase for `checkAllSources` resolver
2. Read the function - same questions as 2.1
3. Compare with checkAllIncludes

**Expected Finding:** One of these may modify macros unintentionally
**Critical Question:** When was each button last clicked?

---

#### Test 2.3: Check Recent Forge Logs
**Goal:** See what happened during the incident
**Steps:**
1. Run: `forge logs --environment production --follow`
2. Look for logs timestamped around the incident
3. Search for: `[VERIFICATION]`, `[CHECK-ALL]`, or error messages

**Expected Finding:** Logs showing what checkAllIncludes did
**What This Tells Us:** Exact sequence of operations that caused orphaning

---

### Phase 3: Test Orphaning Prevention (Controlled - CAUTION)

#### Test 3.1: Create Test Embed (Fresh Start)
**Goal:** Create a controlled test case
**Steps:**
1. Create a NEW test page called "Orphaning Test Page"
2. Add ONE embed macro with test standard
3. Fill in one variable value
4. Save and verify it renders correctly
5. Note the page URL for reference

**Expected Result:** Working embed we can safely test with
**What This Tells Us:** Baseline for comparison

---

#### Test 3.2: Test Check All Embeds on Test Page Only
**Goal:** See if Check All Embeds causes orphaning
**Steps:**
1. DO NOT click "Check All Embeds" (it affects ALL pages)
2. Instead, check if there's a way to check JUST test page
3. If not, we need to create a safer version first

**STOP:** Do not proceed with this test until we understand 2.1-2.2
**Reason:** May orphan more embeds

---

### Phase 4: Recovery Plan (After Understanding Cause)

#### Test 4.1: Manual Re-Link (Single Embed)
**Goal:** Re-establish macro-storage connection
**Steps:**
1. Go to page with orphaned embed
2. Click Edit on embed
3. Re-select the Blueprint Standard from dropdown
4. Do NOT change any variable values
5. Click Save
6. Check if variables are preserved

**Expected Result:** Macro re-linked to storage, values intact
**What This Tells Us:** Whether storage survives re-configuration

---

#### Test 4.2: Verify Recovery
**Goal:** Confirm embed is fully restored
**Steps:**
1. Check Admin - is embed still orphaned?
2. Check page - does content render?
3. Check variables - are values preserved?

**Expected Result:** Fully functional embed with original values
**What This Tells Us:** Recovery process works

---

## Critical Questions to Answer

1. **What does `checkAllIncludes` actually DO to macros?**
   - Does it read-only scan?
   - Does it modify macro bodies?
   - Does it update configurations?

2. **How is the macro-storage link established?**
   - Is it `localId` only?
   - Is it `excerptId` + `localId`?
   - What happens if excerptId is cleared but localId remains?

3. **Why does Admin Usage still work?**
   - Does it query by `pageId` + `excerptId`?
   - Does it query by `localId`?
   - Does it use a separate index?

4. **What's the correct orphaning definition?**
   - Storage exists but macro doesn't reference it? (current state)
   - Macro exists but storage is missing?
   - Both but can't find each other?

---

## Prevention Checklist (After Root Cause Found)

- [ ] Add warning modal before Check All Embeds: "This will scan X embeds. Continue?"
- [ ] Make Check All Embeds read-only (no modifications)
- [ ] Add backup mechanism before any bulk operation
- [ ] Add recovery function: "Re-link Orphaned Embeds"
- [ ] Add test suite for maintenance functions
- [ ] Document exactly what each Check function does

---

## Next Steps

1. **RUN TESTS 1.1 - 1.3** (safe, read-only) to understand current state
2. **RUN TESTS 2.1 - 2.3** (safe, code review) to identify cause
3. **STOP and REPORT FINDINGS** before proceeding to Phase 3
4. Only attempt recovery (Phase 4) after understanding root cause

**DO NOT:**
- Click "Check All Embeds" again
- Click "Check All Standards" until we understand what it does
- Attempt bulk fixes before understanding the problem
- Delete any storage keys

**PRIORITY:** Understand the problem completely before attempting any fixes.
