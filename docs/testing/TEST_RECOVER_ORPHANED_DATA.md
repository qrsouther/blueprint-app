# Test Plan: Recover Orphaned Data (Drag-and-Drop Fix)

## Overview
Test the `recoverOrphanedData` function to ensure it correctly recovers Embed metadata (variable values, toggle states, custom insertions, internal notes) when a macro is dragged and gets a new `localId`.

## Test Environment
- Development environment (tunneled)
- Confluence page with Edit permissions

---

## Test Case 1: Basic Drag-and-Drop Recovery (Same Page)

**Objective**: Verify that dragging an Embed macro on the same page recovers all metadata.

**Prerequisites**:
- Create a page with at least one Embed macro
- Configure the Embed with:
  - Variable values (e.g., "Client": "Test Company")
  - Toggle states (enable at least one toggle)
  - Custom insertions (if applicable)
  - Internal notes (if applicable)

**Steps**:
1. Open the page in Edit mode
2. Note the current Embed configuration:
   - Variable values
   - Toggle states (which are enabled)
   - Any custom insertions
   - Any internal notes
3. **Drag the Embed macro to a different position on the same page**
4. Wait for the page to reload/render
5. Click Edit on the moved Embed macro

**Expected Result**:
- ✅ All variable values are preserved
- ✅ All toggle states are preserved (same toggles enabled/disabled)
- ✅ Custom insertions are preserved
- ✅ Internal notes are preserved
- ✅ No data loss occurred

**Verification**:
- Check browser console for `recoverOrphanedData` logs (if available)
- Verify all configured values match the original

---

## Test Case 2: Cross-Page Prevention

**Objective**: Verify that recovery does NOT happen across different pages (prevents wrong data recovery).

**Prerequisites**:
- Two different Confluence pages (Page A and Page B)
- Both pages have an Embed macro using the **same Source** (same `excerptId`)
- Page A's Embed has configured variable values and toggle states
- Page B's Embed has different (or no) variable values and toggle states

**Steps**:
1. On Page A:
   - Configure Embed with specific values (e.g., "Client": "Page A Company")
   - Enable specific toggles
   - Save/publish the page
2. On Page B:
   - Configure Embed with different values (e.g., "Client": "Page B Company")
   - Enable different toggles
   - Save/publish the page
3. Go back to Page A
4. **Drag the Embed macro on Page A** to a new position
5. Wait for the page to reload
6. Click Edit on the moved Embed

**Expected Result**:
- ✅ Page A's Embed recovers Page A's data (not Page B's data)
- ✅ Variable values match Page A's original values
- ✅ Toggle states match Page A's original states
- ✅ No cross-contamination from Page B

**Verification**:
- Confirm "Client" value is "Page A Company" (not "Page B Company")
- Confirm toggles match Page A's configuration

---

## Test Case 3: Time Window (30 Minutes)

**Objective**: Verify that recovery works within the 30-minute window.

**Prerequisites**:
- Page with an Embed macro that has configured values

**Steps**:
1. Configure an Embed with variable values and toggle states
2. **Wait 15 minutes** (or use a test that simulates time passage)
3. Drag the Embed macro to a new position
4. Wait for the page to reload
5. Click Edit on the moved Embed

**Expected Result**:
- ✅ Data is recovered successfully (within 30-minute window)
- ✅ All metadata is preserved

**Note**: Testing the full 30-minute window may be impractical. This test verifies the extended window works for reasonable timeframes.

---

## Test Case 4: Immediate Drag (Before Auto-Save Completes)

**Objective**: Verify recovery works even if auto-save hasn't completed yet.

**Prerequisites**:
- Page with an Embed macro

**Steps**:
1. Open Edit mode on an Embed
2. Make a change (e.g., change a variable value or toggle a toggle)
3. **Immediately drag the Embed macro** (before "Saving..." completes)
4. Wait for the page to reload
5. Click Edit on the moved Embed

**Expected Result**:
- ✅ Data is recovered (including the most recent changes)
- ✅ The change made in step 2 is preserved
- ✅ No data loss occurred

**Verification**:
- Check that the variable value or toggle state from step 2 is present

---

## Test Case 5: Multiple Embeds on Same Page (Same Source)

**Objective**: Verify recovery picks the correct Embed when multiple Embeds use the same Source.

**Prerequisites**:
- Page with **2-3 Embed macros** all using the **same Source** (`excerptId`)
- Each Embed has different variable values and toggle states

**Steps**:
1. Configure Embed #1:
   - Variable: "Client": "Embed One"
   - Enable Toggle A
2. Configure Embed #2:
   - Variable: "Client": "Embed Two"
   - Enable Toggle B
3. Configure Embed #3:
   - Variable: "Client": "Embed Three"
   - Enable Toggle C
4. **Drag Embed #2** to a new position
5. Wait for the page to reload
6. Click Edit on the moved Embed #2

**Expected Result**:
- ✅ Embed #2 recovers Embed #2's data (not Embed #1 or #3)
- ✅ "Client" value is "Embed Two"
- ✅ Toggle B is enabled (not Toggle A or C)
- ✅ Most recent candidate is selected correctly

**Verification**:
- Confirm the recovered data matches Embed #2's original configuration

---

## Test Case 6: No Recovery (No Candidates)

**Objective**: Verify graceful handling when no orphaned data exists to recover.

**Prerequisites**:
- Page with a **brand new Embed macro** (never configured)

**Steps**:
1. Add a new Embed macro to a page
2. **Do NOT configure it** (leave it with default/empty values)
3. Drag the Embed macro to a new position
4. Wait for the page to reload
5. Click Edit on the moved Embed

**Expected Result**:
- ✅ Embed loads normally (no errors)
- ✅ No recovery attempt fails (graceful degradation)
- ✅ Embed shows default/empty state (as expected for new Embed)

**Verification**:
- Check browser console for any errors
- Verify Embed is functional (can be configured normally)

---

## Test Case 7: Recovery After Long Time (>30 Minutes)

**Objective**: Verify that recovery does NOT happen after the 30-minute window expires.

**Prerequisites**:
- Page with an Embed macro that was configured more than 30 minutes ago

**Steps**:
1. Configure an Embed with variable values and toggle states
2. **Wait more than 30 minutes** (or simulate this scenario)
3. Drag the Embed macro to a new position
4. Wait for the page to reload
5. Click Edit on the moved Embed

**Expected Result**:
- ⚠️ Recovery may not occur (outside time window)
- ✅ Embed loads without errors
- ✅ Embed shows default/empty state (data not recovered due to age)

**Note**: This is expected behavior - very old data should not be recovered to prevent stale data issues.

---

## Test Case 8: Cache Migration

**Objective**: Verify that cached content is also migrated during recovery.

**Prerequisites**:
- Page with an Embed macro that has been saved (has cached content)

**Steps**:
1. Configure an Embed with variable values
2. Wait for auto-save to complete (cache is generated)
3. View the Embed in View Mode (verify cached content displays)
4. Drag the Embed macro to a new position
5. Wait for the page to reload
6. View the moved Embed in View Mode

**Expected Result**:
- ✅ Cached content is displayed correctly
- ✅ Variable substitutions are present in the rendered content
- ✅ No need to regenerate cache (it was migrated)

**Verification**:
- View Mode should show rendered content immediately (not empty/loading)

---

## Success Criteria

All test cases should pass with:
- ✅ No data loss during drag-and-drop operations
- ✅ Correct data recovery (same page, same Source)
- ✅ No cross-page contamination
- ✅ Graceful handling of edge cases
- ✅ Cache migration works correctly

---

## Regression Prevention

After these tests pass, the following scenarios should continue to work:
- Normal Embed configuration (without dragging)
- Multiple Embeds on the same page
- Embeds on different pages
- Auto-save functionality
- View Mode rendering

