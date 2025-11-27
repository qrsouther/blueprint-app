# Forge Realtime Synchronization Testing Plan

## Overview

This testing plan validates the Forge Realtime synchronization feature that keeps Sources, Embeds, and Admin perfectly synchronized through real-time event publishing and subscription.

**Feature Branch**: `forge-realtime-verification`  
**Testing Status**: ⏳ In Progress

---

## Test Environment Setup

### Prerequisites
1. Deploy the feature branch to a development environment
2. Ensure Forge Realtime is enabled (requires @forge/bridge 5.9.0+)
3. Have at least 3-5 test Sources and 5-10 test Embeds available
4. Open Admin page in one browser tab
5. Have access to Confluence pages with Source and Embed macros

### Test Data Requirements
- **Sources**: At least 3 Sources on different pages
- **Embeds**: At least 5 Embeds referencing different Sources
- **Orphaned Items**: Create test cases by manually deleting macros from pages

---

## Phase 1: Unit Tests ✅

### Status: Complete

**File**: `src/utils/__tests__/realtime-events.test.js`

**Tests Completed**:
- ✅ Channel name definitions
- ✅ publishSourceCheckIn with correct payload
- ✅ publishSourceCheckIn error handling
- ✅ publishEmbedCheckIn with correct payload
- ✅ publishEmbedCheckIn error handling
- ✅ publishOrphanDetected for embeds
- ✅ publishOrphanDetected for sources
- ✅ publishOrphanDetected error handling

**Result**: All 8 tests passing

---

## Phase 2: Integration Tests

### 2.1 Source Check-In Events

**Objective**: Verify Sources publish Realtime events when loaded/updated

**Test Steps**:
1. Open Admin page and note current Source count
2. Navigate to a Confluence page with a Source macro
3. Wait 2-3 seconds
4. Return to Admin page (should auto-refresh)
5. Verify the Source's `lastSeenAt` timestamp is updated
6. Check browser console for Realtime subscription logs

**Expected Results**:
- ✅ Source check-in event is published
- ✅ Admin page receives event and invalidates cache
- ✅ Source list refreshes automatically
- ✅ `lastSeenAt` timestamp is current (within last minute)

**Test Cases**:
- [ ] Load Source page with unchanged content (should still update lastSeenAt)
- [ ] Load Source page with changed content (should update contentHash + lastSeenAt)
- [ ] Load multiple Source pages in succession (verify all events received)

---

### 2.2 Embed Check-In Events

**Objective**: Verify Embeds publish Realtime events when saved

**Test Steps**:
1. Open Admin page
2. Navigate to a Confluence page with an Embed macro
3. Edit the Embed (change variable values or toggle states)
4. Save the Embed
5. Return to Admin page
6. Verify Embed usage data is updated

**Expected Results**:
- ✅ Embed check-in event is published on save
- ✅ Admin page receives event
- ✅ Usage data for the Source refreshes automatically
- ✅ Redline queue refreshes if applicable
- ✅ `lastSeenAt` timestamp is updated

**Test Cases**:
- [ ] Save Embed with variable changes
- [ ] Save Embed with toggle state changes
- [ ] Save Embed with custom insertions
- [ ] Auto-save triggers (verify event published on debounced save)

---

### 2.3 Orphan Detection Events

**Objective**: Verify orphan detection publishes Realtime events

**Test Steps**:
1. Open Admin page
2. Note a Source or Embed that exists
3. Navigate to the Confluence page containing that macro
4. Delete the macro from the page (manually remove it)
5. Run "Check All Sources" or "Check All Embeds" from Admin
6. Monitor Admin page for real-time updates

**Expected Results**:
- ✅ Orphan detection event is published when macro not found
- ✅ Admin page receives event immediately
- ✅ Relevant caches are invalidated (excerpts, redlineQueue, usageCounts)
- ✅ Orphaned item appears in results without manual refresh

**Test Cases**:
- [ ] Delete Source macro → Run Check All Sources → Verify event
- [ ] Delete Embed macro → Run Check All Embeds → Verify event
- [ ] Delete multiple macros → Verify all events received
- [ ] Verify event includes correct reason message

---

### 2.4 getOrphanCandidates Resolver

**Objective**: Verify threshold-based orphan detection works

**Test Steps**:
1. Use Forge CLI or Admin resolver tester to call `getOrphanCandidates`
2. Test with default threshold (7 days)
3. Test with custom threshold (1 day, 30 days)
4. Verify results include Sources and Embeds with old `lastSeenAt`

**Expected Results**:
- ✅ Returns Sources where `lastSeenAt` is older than threshold
- ✅ Returns Embeds where `lastSeenAt` is older than threshold
- ✅ Includes metadata (excerptName, pageId, pageTitle for Embeds)
- ✅ Handles missing `lastSeenAt` (treats as orphaned)

**Test Cases**:
- [ ] Call with default threshold (7 days)
- [ ] Call with 1 day threshold (should catch more items)
- [ ] Call with 30 day threshold (should catch fewer items)
- [ ] Verify items with recent `lastSeenAt` are excluded
- [ ] Verify items with null `lastSeenAt` are included

**Test Command**:
```javascript
// In Forge CLI or browser console
invoke('getOrphanCandidates', { thresholdDays: 7 })
```

---

## Phase 3: Manual Testing Scenarios

### 3.1 Real-Time Synchronization

**Scenario**: Multiple users/contexts viewing Admin simultaneously

**Test Steps**:
1. Open Admin page in Tab 1
2. Open Admin page in Tab 2 (same browser or different)
3. In Tab 1, navigate to a Source page
4. Observe Tab 2 for automatic refresh
5. Repeat with Embed edits

**Expected Results**:
- ✅ Both Admin tabs receive Realtime events
- ✅ Both tabs update simultaneously
- ✅ No manual refresh required
- ✅ Cache invalidation works across tabs

**Test Cases**:
- [ ] Two Admin tabs open → Source loads → Both tabs update
- [ ] Two Admin tabs open → Embed saves → Both tabs update
- [ ] Admin tab + Source page open → Source loads → Admin updates
- [ ] Multiple Admin tabs (3+) → Verify all receive events

---

### 3.2 Staleness vs Orphan Detection

**Objective**: Verify staleness detection is separate from orphan detection

**Test Steps**:
1. Create an Embed that references a Source
2. Update the Source content (change text)
3. Verify Embed shows as "stale" (not orphaned)
4. Verify Embed's `lastSeenAt` is still recent
5. Delete the Embed macro from its page
6. Run Check All Embeds
7. Verify Embed is now marked as orphaned

**Expected Results**:
- ✅ Staleness: Source content changed, Embed needs sync (user must explicitly update)
- ✅ Orphan: Macro deleted from page (detected via missing check-in)
- ✅ Both systems work independently
- ✅ `lastSeenAt` tracking doesn't interfere with staleness detection

**Test Cases**:
- [ ] Stale Embed (content changed) → Still shows recent lastSeenAt
- [ ] Orphaned Embed (macro deleted) → Shows old/missing lastSeenAt
- [ ] Embed can be both stale AND orphaned (edge case)

---

### 3.3 Performance Testing

**Objective**: Verify Realtime events don't add significant latency

**Test Steps**:
1. Measure Source load time (with Realtime publish)
2. Measure Embed save time (with Realtime publish)
3. Compare to baseline (if available)
4. Test with rapid succession of events

**Expected Results**:
- ✅ Source load adds < 50ms latency for Realtime publish
- ✅ Embed save adds < 50ms latency for Realtime publish
- ✅ Admin can handle rapid succession of events (10+ per second)
- ✅ Cache invalidation doesn't cause unnecessary API calls

**Test Cases**:
- [ ] Load 10 Sources in rapid succession → Verify all events processed
- [ ] Save 10 Embeds in rapid succession → Verify all events processed
- [ ] Admin page receives 20+ events in 5 seconds → No performance degradation
- [ ] Verify debouncing works (multiple saves don't spam events)

---

### 3.4 Error Handling

**Objective**: Verify graceful degradation when Realtime fails

**Test Steps**:
1. Simulate Realtime publish failure (if possible)
2. Verify Source/Embed operations still succeed
3. Verify error is logged but doesn't block operation
4. Test with Realtime subscription failures

**Expected Results**:
- ✅ Source/Embed operations succeed even if Realtime publish fails
- ✅ Errors are logged but non-blocking
- ✅ Admin page degrades gracefully (falls back to manual refresh)
- ✅ System continues to function without Realtime

**Test Cases**:
- [ ] Realtime publish fails → Operation still succeeds
- [ ] Realtime subscription fails → Admin still works (manual refresh)
- [ ] Network issues → Verify error handling
- [ ] Verify error messages are logged appropriately

---

## Phase 4: Edge Cases

### 4.1 Missing lastSeenAt

**Test**: Items without `lastSeenAt` should be treated as orphaned

**Steps**:
1. Manually set a Source's `lastSeenAt` to null in storage
2. Call `getOrphanCandidates`
3. Verify it's included in results

**Expected**: ✅ Items with null `lastSeenAt` are considered orphaned

---

### 4.2 Throttled Updates

**Test**: Verify 1-minute throttling for unchanged content

**Steps**:
1. Load a Source page (updates `lastSeenAt`)
2. Immediately reload the same page (< 1 minute)
3. Verify `lastSeenAt` is NOT updated again
4. Wait 1+ minute and reload
5. Verify `lastSeenAt` IS updated

**Expected**: ✅ Throttling prevents excessive storage writes

---

### 4.3 Concurrent Operations

**Test**: Multiple operations happening simultaneously

**Steps**:
1. Open 5 Source pages simultaneously
2. Edit 5 Embeds simultaneously
3. Run Check All Sources while Check All Embeds is running
4. Verify all events are processed correctly

**Expected**: ✅ No race conditions, all events received

---

### 4.4 Large Scale Testing

**Test**: System behavior with many Sources/Embeds

**Steps**:
1. Test with 50+ Sources
2. Test with 100+ Embeds
3. Verify `getOrphanCandidates` handles large datasets
4. Verify Admin page handles many simultaneous events

**Expected**: ✅ Performance remains acceptable at scale

---

## Phase 5: Regression Testing

### 5.1 Existing Functionality

**Objective**: Ensure new feature doesn't break existing functionality

**Test Areas**:
- [ ] Source CRUD operations still work
- [ ] Embed save/load still works
- [ ] Check All Sources still works
- [ ] Check All Embeds still works
- [ ] Staleness detection still works
- [ ] Redline queue still works
- [ ] Usage tracking still works

---

## Test Checklist

### Pre-Deployment
- [ ] All unit tests passing
- [ ] Integration tests completed
- [ ] Manual testing scenarios verified
- [ ] Performance benchmarks met
- [ ] Error handling verified
- [ ] Edge cases tested
- [ ] Regression tests passed

### Post-Deployment
- [ ] Monitor Forge logs for Realtime errors
- [ ] Verify Admin page receives events in production
- [ ] Check storage usage (lastSeenAt shouldn't significantly increase)
- [ ] Monitor performance metrics
- [ ] Collect user feedback

---

## Success Criteria

✅ **Feature is considered complete when**:
1. All unit tests pass
2. Integration tests show Sources/Embeds publish events correctly
3. Admin page receives and processes events in real-time
4. Orphan detection works via both Check All functions and threshold-based detection
5. Performance impact is minimal (< 50ms per operation)
6. Error handling is graceful (non-blocking)
7. Existing functionality remains intact
8. No significant increase in storage usage

---

## Known Limitations

1. **Realtime is Preview Feature**: May have limitations or changes in future Forge versions
2. **Cross-Browser**: Realtime events work within same browser context (not across different browsers)
3. **Network Dependency**: Requires active network connection for events to propagate
4. **Throttling**: 1-minute throttle on unchanged content updates (by design)

---

## Rollback Plan

If critical issues are found:

1. **Immediate**: Remove `publish` calls from resolvers (Realtime disabled, system still works)
2. **Short-term**: Remove `useRealtimeSubscription` hook (Admin reverts to manual refresh)
3. **Long-term**: `lastSeenAt` tracking can remain (useful for future features)

**Rollback Steps**:
```bash
# Remove Realtime publishing (keeps lastSeenAt tracking)
git revert <commit-hash> --no-commit
# Manually remove publish calls from resolvers
# Remove useRealtimeSubscription from admin-page.jsx
```

---

## Test Results Log

| Test ID | Test Case | Status | Notes | Date |
|---------|-----------|--------|-------|------|
| UT-1 | Unit tests - realtime-events.js | ✅ Pass | All 8 tests passing | |
| IT-1 | Source check-in events | ⏳ Pending | | |
| IT-2 | Embed check-in events | ⏳ Pending | | |
| IT-3 | Orphan detection events | ⏳ Pending | | |
| IT-4 | getOrphanCandidates resolver | ⏳ Pending | | |
| MT-1 | Real-time synchronization | ⏳ Pending | | |
| MT-2 | Staleness vs Orphan | ⏳ Pending | | |
| MT-3 | Performance testing | ⏳ Pending | | |
| MT-4 | Error handling | ⏳ Pending | | |
| EC-1 | Missing lastSeenAt | ⏳ Pending | | |
| EC-2 | Throttled updates | ⏳ Pending | | |
| EC-3 | Concurrent operations | ⏳ Pending | | |
| EC-4 | Large scale testing | ⏳ Pending | | |
| RT-1 | Regression - Source CRUD | ⏳ Pending | | |
| RT-2 | Regression - Embed operations | ⏳ Pending | | |
| RT-3 | Regression - Check All functions | ⏳ Pending | | |

---

## Notes

- **Testing Priority**: Focus on integration tests (IT-1 through IT-4) first, as these validate core functionality
- **Manual Testing**: Can be done in parallel with integration tests
- **Performance**: Use browser DevTools Network tab to measure latency
- **Logging**: Check Forge logs for Realtime publish/subscribe errors

---

**Last Updated**: [Date]  
**Tested By**: [Name]  
**Status**: ⏳ In Progress

