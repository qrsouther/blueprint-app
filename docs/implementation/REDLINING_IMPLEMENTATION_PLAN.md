# Redlining System - Implementation Plan

**Status:** Planning Phase
**Priority:** High (Quality Control Feature)
**Estimated Total Effort:** XL (4-5 weeks)

---

## Executive Summary

Implement a queue-based review system for tracking the completeness and approval status of individual Embed instances across all Blueprint pages. Features automatic status transitions when approved content is modified, user avatar integration, and a dedicated tab in the Admin UI.

---

## Architecture Overview

### New Components
- **Admin UI Tabs** - First-time tabbed navigation in Admin page
- **Redline Queue Page** - Dedicated review interface with filtering/sorting
- **Redline Resolvers** - Backend API for status management
- **Automatic Status Transitions** - Hash-based change detection

### Storage Additions
- `redlineStatus` - Current approval status
- `approvedContentHash` - Hash of content when approved
- `approvedBy` - Confluence User ID (accountId)
- `approvedAt` - Timestamp of approval

### User Integration
- Confluence REST API v2 for user data
- User avatars via `/wiki/rest/api/user?accountId={id}`
- Display approver names and profile pictures

---

## Phase 1: Storage Schema & Core Resolvers
**Duration:** 1 week
**Risk:** Low
**Dependencies:** None

### 1.1 Update Embed Storage Schema

**File:** `src/resolvers/include-resolvers.js` (saveVariableValues)

Add fields to `macro-vars:{localId}` storage:

```javascript
{
  excerptId: "...",
  variableValues: {...},
  toggleStates: {...},
  customInsertions: [...],
  internalNotes: [...],
  cachedContent: {...},
  syncedContentHash: "...",

  // NEW REDLINE FIELDS
  redlineStatus: "reviewable", // "reviewable" | "pre-approved" | "needs-revision" | "approved"
  approvedContentHash: null,    // Hash when status set to "approved"
  approvedBy: null,             // Confluence accountId (e.g., "5e7f419c...")
  approvedAt: null,             // ISO timestamp
  statusHistory: [              // Audit trail
    {
      status: "reviewable",
      changedBy: "5e7f419c...",
      changedAt: "2025-01-15T10:30:00.000Z",
      reason: "Initial creation"
    }
  ],

  lastSynced: "...",
  updatedAt: "..."
}
```

### 1.2 Create Redline Resolvers Module

**File:** `src/resolvers/redline-resolvers.js` (new file, ~400 lines)

**Functions:**
```javascript
// Get redline queue (all Embeds with filtering/sorting)
async function getRedlineQueue(req) {
  const { filters, sortBy, groupBy } = req.payload;
  // filters: { status: [], pageIds: [], excerptIds: [] }
  // sortBy: "status" | "page" | "source" | "updated"
  // groupBy: "status" | "page" | "source" | null

  // Query all macro-vars:* keys
  // Filter by status, page, source
  // Fetch Embed configs + related data (excerpt name, page title)
  // Return structured queue data
}

// Set redline status for single Embed
async function setRedlineStatus(req) {
  const { localId, status, userId, reason } = req.payload;

  // Load current Embed config
  // Update redlineStatus
  // If status === "approved":
  //   - Calculate current contentHash
  //   - Store as approvedContentHash
  //   - Set approvedBy = userId
  //   - Set approvedAt = now
  // Append to statusHistory
  // Save back to storage
}

// Bulk status update
async function bulkSetRedlineStatus(req) {
  const { localIds, status, userId, reason } = req.payload;
  // Loop through localIds
  // Call setRedlineStatus for each
  // Return success/failure counts
}

// Check if Embed needs re-review (hash comparison)
async function checkRedlineStale(req) {
  const { localId } = req.payload;

  // Load Embed config
  // Calculate current contentHash
  // Compare with approvedContentHash
  // Return { isStale: boolean, currentHash, approvedHash }
}

// Get Confluence user data for avatar display
async function getConfluenceUser(req) {
  const { accountId } = req.payload;

  // Call Confluence REST API v2
  // GET /wiki/rest/api/user?accountId={accountId}
  // Return { displayName, profilePicture: { path, ... } }
}

// Get redline statistics
async function getRedlineStats(req) {
  // Count Embeds by status
  // Return { reviewable: 10, preApproved: 5, needsRevision: 3, approved: 50 }
}
```

### 1.3 Register Resolvers

**File:** `src/index.js`

```javascript
import {
  getRedlineQueue,
  setRedlineStatus,
  bulkSetRedlineStatus,
  checkRedlineStale,
  getConfluenceUser,
  getRedlineStats
} from './resolvers/redline-resolvers';

resolver.define('getRedlineQueue', getRedlineQueue);
resolver.define('setRedlineStatus', setRedlineStatus);
resolver.define('bulkSetRedlineStatus', bulkSetRedlineStatus);
resolver.define('checkRedlineStale', checkRedlineStale);
resolver.define('getConfluenceUser', getConfluenceUser);
resolver.define('getRedlineStats', getRedlineStats);
```

### 1.4 Success Criteria
- [ ] Storage schema updated with redline fields
- [ ] All 6 resolvers implemented and registered
- [ ] Manual testing via console: can set/get redline status
- [ ] Confluence user API integration working (fetch avatar URLs)

---

## Phase 2: Admin UI Tabbed Navigation
**Duration:** 3-4 days
**Risk:** Low
**Dependencies:** Phase 1 complete

### 2.1 Add Tabs Component to Admin Page

**File:** `src/admin-page.jsx`

Current structure:
```jsx
<Stack space="space.300">
  <ExcerptListSidebar ... />
  <Box>
    {/* Main content area */}
  </Box>
</Stack>
```

New structure:
```jsx
<Stack space="space.300">
  <Tabs id="admin-tabs" onChange={handleTabChange} selected={selectedTab}>
    <TabList>
      <Tab>📚 Sources</Tab>
      <Tab>📋 Redline Queue</Tab>
      <Tab>⚙️ Settings</Tab> {/* Future */}
    </TabList>

    <TabPanel>
      {/* Current admin content (Sources management) */}
      <ExcerptListSidebar ... />
      {/* ... existing UI ... */}
    </TabPanel>

    <TabPanel>
      <RedlineQueuePage />
    </TabPanel>

    <TabPanel>
      {/* Future: App settings */}
    </TabPanel>
  </Tabs>
</Stack>
```

**State Management:**
```javascript
const [selectedTab, setSelectedTab] = useState(0);

const handleTabChange = (index) => {
  setSelectedTab(index);
  // Clear any active selections when switching tabs
};
```

### 2.2 Create RedlineQueuePage Stub

**File:** `src/components/admin/RedlineQueuePage.jsx` (new file)

```jsx
import React, { useState } from 'react';
import { Box, Stack, Heading, Text } from '@forge/react';

export function RedlineQueuePage() {
  return (
    <Stack space="space.300">
      <Heading size="large">📋 Redline Queue</Heading>
      <Text>Review and approve Embed instances across all Blueprint pages.</Text>
      <Text>Coming soon: Queue view with filtering and status management.</Text>
    </Stack>
  );
}
```

### 2.3 Success Criteria
- [ ] Tabs render correctly in Admin UI
- [ ] Tab switching works smoothly
- [ ] "Sources" tab contains existing admin functionality
- [ ] "Redline Queue" tab shows placeholder content
- [ ] Tab state persists during admin session
- [ ] Deploy and verify in production

---

## Phase 3: React Query Hooks for Redline Data
**Duration:** 2 days
**Risk:** Low
**Dependencies:** Phase 1, Phase 2 complete

### 3.1 Create Redline Hooks

**File:** `src/hooks/redline-hooks.js` (new file, ~250 lines)

```javascript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@forge/bridge';

// Fetch redline queue with filters
export function useRedlineQueueQuery(filters = {}, sortBy = 'status', groupBy = null) {
  return useQuery({
    queryKey: ['redlineQueue', filters, sortBy, groupBy],
    queryFn: async () => {
      return await invoke('getRedlineQueue', { filters, sortBy, groupBy });
    },
    staleTime: 1000 * 30, // 30 seconds
  });
}

// Set redline status for single Embed
export function useSetRedlineStatusMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ localId, status, userId, reason }) => {
      return await invoke('setRedlineStatus', { localId, status, userId, reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['redlineQueue'] });
      queryClient.invalidateQueries({ queryKey: ['redlineStats'] });
    }
  });
}

// Bulk status update
export function useBulkSetRedlineStatusMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ localIds, status, userId, reason }) => {
      return await invoke('bulkSetRedlineStatus', { localIds, status, userId, reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['redlineQueue'] });
      queryClient.invalidateQueries({ queryKey: ['redlineStats'] });
    }
  });
}

// Get Confluence user data
export function useConfluenceUserQuery(accountId) {
  return useQuery({
    queryKey: ['confluenceUser', accountId],
    queryFn: async () => {
      return await invoke('getConfluenceUser', { accountId });
    },
    enabled: !!accountId,
    staleTime: 1000 * 60 * 60, // 1 hour (user data rarely changes)
  });
}

// Get redline statistics
export function useRedlineStatsQuery() {
  return useQuery({
    queryKey: ['redlineStats'],
    queryFn: async () => {
      return await invoke('getRedlineStats');
    },
    staleTime: 1000 * 30, // 30 seconds
  });
}
```

### 3.2 Success Criteria
- [ ] All hooks implemented with proper React Query patterns
- [ ] Cache invalidation works correctly
- [ ] Hooks can be imported and tested in RedlineQueuePage

---

## Phase 4: Queue Filtering & Sorting UI
**Duration:** 3-4 days
**Risk:** Medium
**Dependencies:** Phase 3 complete

### 4.1 Create RedlineFilterBar Component

**File:** `src/components/admin/RedlineFilterBar.jsx` (new file)

```jsx
import React from 'react';
import { Box, Stack, Inline, Select, Button, Textfield } from '@forge/react';

export function RedlineFilterBar({ filters, onFiltersChange, onSortChange, onGroupChange }) {
  return (
    <Box xcss={filterBarStyles}>
      <Stack space="space.200">
        <Inline space="space.200" alignBlock="center">
          {/* Status Filter */}
          <Select
            label="Filter by Status"
            options={[
              { label: 'All Statuses', value: 'all' },
              { label: 'Reviewable', value: 'reviewable' },
              { label: 'Pre-Approved', value: 'pre-approved' },
              { label: 'Needs Revision', value: 'needs-revision' },
              { label: 'Approved', value: 'approved' }
            ]}
            onChange={(e) => onFiltersChange({ ...filters, status: e.target.value })}
          />

          {/* Sort By */}
          <Select
            label="Sort By"
            options={[
              { label: 'Status', value: 'status' },
              { label: 'Page', value: 'page' },
              { label: 'Source', value: 'source' },
              { label: 'Last Updated', value: 'updated' }
            ]}
            onChange={(e) => onSortChange(e.target.value)}
          />

          {/* Group By */}
          <Select
            label="Group By"
            options={[
              { label: 'None', value: 'none' },
              { label: 'Status', value: 'status' },
              { label: 'Page', value: 'page' },
              { label: 'Source', value: 'source' }
            ]}
            onChange={(e) => onGroupChange(e.target.value === 'none' ? null : e.target.value)}
          />

          <Button appearance="subtle" onClick={() => onFiltersChange({})}>
            Clear Filters
          </Button>
        </Inline>
      </Stack>
    </Box>
  );
}
```

### 4.2 Create RedlineStatsBar Component

**File:** `src/components/admin/RedlineStatsBar.jsx` (new file)

```jsx
import React from 'react';
import { Box, Inline, Lozenge, Text } from '@forge/react';
import { useRedlineStatsQuery } from '../../hooks/redline-hooks';

export function RedlineStatsBar() {
  const { data: stats, isLoading } = useRedlineStatsQuery();

  if (isLoading) return <Text>Loading stats...</Text>;

  return (
    <Box xcss={statsBarStyles}>
      <Inline space="space.200" alignBlock="center">
        <Text weight="semibold">Queue Summary:</Text>
        <Lozenge appearance="new">Reviewable: {stats.reviewable}</Lozenge>
        <Lozenge appearance="inprogress">Pre-Approved: {stats.preApproved}</Lozenge>
        <Lozenge appearance="removed">Needs Revision: {stats.needsRevision}</Lozenge>
        <Lozenge appearance="success">Approved: {stats.approved}</Lozenge>
      </Inline>
    </Box>
  );
}
```

### 4.3 Success Criteria
- [ ] Filter bar renders with all controls
- [ ] Filter/sort/group state managed correctly
- [ ] Stats bar displays real-time counts
- [ ] UI updates when filters change

---

## Phase 5: Queue Card Component (Embed Preview)
**Duration:** 1 week
**Risk:** Medium
**Dependencies:** Phase 4 complete

### 5.1 Create RedlineQueueCard Component

**File:** `src/components/admin/RedlineQueueCard.jsx` (new file, ~350 lines)

```jsx
import React, { useState } from 'react';
import {
  Box, Stack, Inline, Heading, Text, Button, ButtonGroup,
  Lozenge, AdfRenderer, Modal, ModalTransition, Avatar
} from '@forge/react';
import { useConfluenceUserQuery, useSetRedlineStatusMutation } from '../../hooks/redline-hooks';

export function RedlineQueueCard({ embedData, onStatusChange }) {
  const [showPreview, setShowPreview] = useState(false);
  const setStatusMutation = useSetRedlineStatusMutation();

  // Fetch approver user data if approved
  const { data: approver } = useConfluenceUserQuery(embedData.approvedBy);

  const handleStatusChange = async (newStatus, reason) => {
    // Get current user ID from context
    const userId = await getCurrentUserId();

    await setStatusMutation.mutateAsync({
      localId: embedData.localId,
      status: newStatus,
      userId,
      reason
    });

    onStatusChange?.(embedData.localId, newStatus);
  };

  return (
    <Box xcss={cardStyles}>
      <Stack space="space.200">
        {/* Header: Page + Source */}
        <Inline space="space.100" alignBlock="center" spread="space-between">
          <Stack space="space.050">
            <Text size="small" color="color.text.subtlest">
              📄 {embedData.pageTitle}
            </Text>
            <Heading size="small">{embedData.sourceName}</Heading>
          </Stack>

          <RedlineStatusBadge status={embedData.redlineStatus} />
        </Inline>

        {/* Approval Info (if approved) */}
        {embedData.approvedBy && approver && (
          <Inline space="space.100" alignBlock="center">
            <Avatar
              src={approver.profilePicture?.path}
              name={approver.displayName}
              size="xsmall"
            />
            <Text size="small">
              Approved by {approver.displayName} on {formatDate(embedData.approvedAt)}
            </Text>
          </Inline>
        )}

        {/* Variables Preview */}
        <Box>
          <Text weight="semibold" size="small">Variables:</Text>
          <Stack space="space.050">
            {Object.entries(embedData.variableValues || {}).map(([key, value]) => (
              <Text key={key} size="small">
                • {key}: {value}
              </Text>
            ))}
          </Stack>
        </Box>

        {/* Action Buttons */}
        <ButtonGroup>
          <Button appearance="subtle" onClick={() => setShowPreview(true)}>
            👁️ Preview
          </Button>

          <Button
            appearance="primary"
            onClick={() => handleStatusChange('complete', 'Approved via queue')}
            isDisabled={embedData.redlineStatus === 'complete'}
          >
            ✅ Mark Complete
          </Button>

          <Button
            appearance="warning"
            onClick={() => handleStatusChange('needs-revision', 'Flagged for revision')}
          >
            ⚠️ Needs Revision
          </Button>
        </ButtonGroup>
      </Stack>

      {/* Preview Modal */}
      <ModalTransition>
        {showPreview && (
          <Modal onClose={() => setShowPreview(false)}>
            <ModalHeader>
              <ModalTitle>Embed Preview</ModalTitle>
            </ModalHeader>
            <ModalBody>
              <AdfRenderer document={embedData.cachedContent} />
            </ModalBody>
          </Modal>
        )}
      </ModalTransition>
    </Box>
  );
}

function RedlineStatusBadge({ status }) {
  const appearances = {
    'reviewable': 'new',
    'pre-approved': 'inprogress',
    'needs-revision': 'removed',
    'approved': 'success'
  };

  const labels = {
    'reviewable': 'Reviewable',
    'pre-approved': 'Pre-Approved',
    'needs-revision': 'Needs Revision',
    'complete': 'Complete'
  };

  return <Lozenge appearance={appearances[status]}>{labels[status]}</Lozenge>;
}
```

### 5.2 Success Criteria
- [ ] Card displays all Embed info correctly
- [ ] Status badges render with correct colors
- [ ] User avatars display (with fallback if user data unavailable)
- [ ] Preview modal works
- [ ] Status change buttons trigger mutations
- [ ] Cards update after status change

---

## Phase 6: Complete RedlineQueuePage Implementation
**Duration:** 1 week
**Risk:** Medium
**Dependencies:** Phase 5 complete

### 6.1 Implement Full Queue View

**File:** `src/components/admin/RedlineQueuePage.jsx` (expand from stub)

```jsx
import React, { useState } from 'react';
import { Box, Stack, Heading, Text, Spinner } from '@forge/react';
import { useRedlineQueueQuery } from '../../hooks/redline-hooks';
import { RedlineFilterBar } from './RedlineFilterBar';
import { RedlineStatsBar } from './RedlineStatsBar';
import { RedlineQueueCard } from './RedlineQueueCard';

export function RedlineQueuePage() {
  const [filters, setFilters] = useState({});
  const [sortBy, setSortBy] = useState('status');
  const [groupBy, setGroupBy] = useState(null);

  const { data: queueData, isLoading, error } = useRedlineQueueQuery(filters, sortBy, groupBy);

  if (isLoading) return <Spinner size="large" />;
  if (error) return <Text>Error loading queue: {error.message}</Text>;

  return (
    <Stack space="space.300">
      <Heading size="large">📋 Redline Queue</Heading>

      <RedlineStatsBar />

      <RedlineFilterBar
        filters={filters}
        onFiltersChange={setFilters}
        onSortChange={setSortBy}
        onGroupChange={setGroupBy}
      />

      {/* Queue Cards */}
      {groupBy ? (
        // Grouped view
        Object.entries(queueData.groups).map(([groupName, embeds]) => (
          <Box key={groupName}>
            <Heading size="medium">{groupName}</Heading>
            <Stack space="space.200">
              {embeds.map(embed => (
                <RedlineQueueCard key={embed.localId} embedData={embed} />
              ))}
            </Stack>
          </Box>
        ))
      ) : (
        // Flat view
        <Stack space="space.200">
          {queueData.embeds.map(embed => (
            <RedlineQueueCard key={embed.localId} embedData={embed} />
          ))}
        </Stack>
      )}

      {queueData.embeds.length === 0 && (
        <Text>No Embeds match the current filters.</Text>
      )}
    </Stack>
  );
}
```

### 6.2 Success Criteria
- [ ] Full queue renders with all Embeds
- [ ] Filtering works correctly
- [ ] Sorting works correctly
- [ ] Grouping works correctly
- [ ] Cards display in proper order
- [ ] Empty state shows when no matches

---

## Phase 7: Automatic Status Transitions (Hash-Based)
**Duration:** 3-4 days
**Risk:** Medium
**Dependencies:** Phase 1-6 complete

### 7.1 Modify saveVariableValues to Detect Changes

**File:** `src/resolvers/include-resolvers.js`

```javascript
export async function saveVariableValues(req) {
  const { localId, /* ... */ } = req.payload;

  // Load existing Embed config
  const existingConfig = await storage.get(`macro-vars:${localId}`);

  // Calculate new contentHash
  const newContentHash = calculateEmbedContentHash({
    variableValues,
    toggleStates,
    customInsertions,
    internalNotes,
    excerptId
  });

  // Check if Embed was previously "complete"
  if (existingConfig?.redlineStatus === 'complete' && existingConfig?.approvedContentHash) {
    // Compare hashes
    if (newContentHash !== existingConfig.approvedContentHash) {
      // Content changed after approval → auto-transition to "needs-review"
      console.log(`[REDLINE AUTO-TRANSITION] Embed ${localId} modified after approval. Status: complete → needs-revision`);

      // Update status
      await setRedlineStatus({
        payload: {
          localId,
          status: 'needs-revision',
          userId: 'system',
          reason: 'Content modified after approval'
        }
      });
    }
  }

  // Continue with normal save logic...
  await storage.set(`macro-vars:${localId}`, {
    ...existingConfig,
    variableValues,
    toggleStates,
    customInsertions,
    internalNotes,
    cachedContent,
    syncedContentHash,
    // Don't overwrite redlineStatus here - it's managed separately
    updatedAt: new Date().toISOString()
  });

  return { success: true };
}
```

### 7.2 Create Content Hash Utility for Embeds

**File:** `src/utils/hash-utils.js` (add function)

```javascript
import crypto from 'crypto';

// Existing calculateContentHash for Sources...

/**
 * Calculate content hash for Embed instance
 * Includes: variable values, toggle states, custom insertions, internal notes, excerpt reference
 * Excludes: timestamps, status fields, approver info
 */
export function calculateEmbedContentHash(embedData) {
  const hashInput = {
    excerptId: embedData.excerptId,
    variableValues: embedData.variableValues || {},
    toggleStates: embedData.toggleStates || {},
    customInsertions: (embedData.customInsertions || []).map(c => ({
      position: c.position,
      content: c.content
    })),
    internalNotes: (embedData.internalNotes || []).map(n => ({
      position: n.position,
      content: n.content
    }))
  };

  // Normalize keys for consistent hashing
  const normalized = JSON.stringify(hashInput, Object.keys(hashInput).sort());

  return crypto.createHash('sha256').update(normalized).digest('hex');
}
```

### 7.3 Success Criteria
- [ ] Embed content hash calculation works correctly
- [ ] Auto-transition triggers when approved Embed is modified
- [ ] Status history records automatic transitions
- [ ] Manual testing confirms behavior
- [ ] No false positives (only real changes trigger transition)

---

## Phase 8: Testing, Polish & Documentation
**Duration:** 3-4 days
**Risk:** Low
**Dependencies:** All previous phases complete

### 8.1 Integration Testing

Test scenarios:
1. **Queue Display**
   - [ ] All Embeds appear in queue
   - [ ] Filtering by status works
   - [ ] Sorting by page/source/status works
   - [ ] Grouping organizes cards correctly

2. **Status Transitions**
   - [ ] Manual status changes work
   - [ ] Automatic "approved" → "needs-revision" triggers on edit
   - [ ] Status history tracks all changes
   - [ ] Bulk status updates work

3. **User Avatar Integration**
   - [ ] Avatars display for approvers
   - [ ] Fallback works if user data unavailable
   - [ ] User names display correctly

4. **Admin Tab Navigation**
   - [ ] Switching between Sources and Redline Queue works smoothly
   - [ ] State preserved when switching tabs
   - [ ] No performance issues

### 8.2 Edge Cases

Test:
- [ ] Embed with no status (defaults to "reviewable")
- [ ] Embed approved then Source updated (should still be "approved" - only Embed edits trigger change)
- [ ] Embed approved then deleted from page (cleanup via Check All Embeds)
- [ ] Large queue (100+ Embeds) - pagination needed?

### 8.3 Documentation Updates

**Files to update:**
- [ ] `README.md` - Add Redlining section to features
- [ ] `TODO.md` - Mark Redlining as complete
- [ ] `TERMINOLOGY.md` - Add redline terminology mappings
- [ ] Create `REDLINING_USER_GUIDE.md` - User-facing documentation

### 8.4 Success Criteria
- [ ] All integration tests pass
- [ ] Edge cases handled gracefully
- [ ] Documentation complete
- [ ] Code reviewed
- [ ] Ready for production deployment

---

## Technical Notes

### Confluence User API

**Endpoint:** `GET /wiki/rest/api/user`
**Query Parameter:** `accountId` (User's Atlassian account ID)

**Response:**
```json
{
  "type": "known",
  "accountId": "5e7f419c-...",
  "accountType": "atlassian",
  "email": "user@example.com",
  "publicName": "John Doe",
  "profilePicture": {
    "path": "/wiki/aa-avatar/5e7f419c...",
    "width": 48,
    "height": 48,
    "isDefault": false
  },
  "displayName": "John Doe"
}
```

**Integration:**
```javascript
// In redline-resolvers.js
import api, { route } from '@forge/api';

async function getConfluenceUser({ accountId }) {
  const response = await api.asUser().requestConfluence(
    route`/wiki/rest/api/user?accountId=${accountId}`
  );

  return await response.json();
}
```

### Getting Current User ID

**From Context:**
```javascript
import { useProductContext } from '@forge/react';

function MyComponent() {
  const context = useProductContext();
  const currentUserId = context?.accountId; // Atlassian account ID

  // Use for approvedBy field when setting status
}
```

### Performance Considerations

**Queue Query Optimization:**
- Limit initial query to 50-100 Embeds
- Implement pagination if queue > 100 items
- Use React Query's `keepPreviousData` for smooth transitions
- Consider indexing by status for faster filtering

**Avatar Caching:**
- Cache user data in React Query for 1 hour
- Batch user lookups where possible
- Show placeholder avatar immediately, load real avatar async

---

## Risk Assessment

### High Risk Items
- **Queue performance with large data sets** - Mitigation: Pagination, indexing
- **Automatic status transitions causing confusion** - Mitigation: Clear UI notifications, status history
- **Confluence API rate limits for user lookups** - Mitigation: Aggressive caching, batch requests

### Medium Risk Items
- **Tab navigation UX** - First-time implementation of tabs in Admin UI
- **Hash collision** (extremely unlikely with SHA256) - Mitigation: Include multiple fields in hash

### Low Risk Items
- Storage schema changes (additive only, backward compatible)
- Resolver additions (isolated, don't affect existing code)

---

## Deployment Strategy

### Version: 8.0.0 (Major Feature Release)

**Phase 1-3:** Deploy storage schema + resolvers + tabs (no visible UI changes yet)
**Phase 4-5:** Deploy filter bar + queue cards (functional but incomplete)
**Phase 6-7:** Deploy complete queue + auto-transitions (full feature live)
**Phase 8:** Polish, documentation, bug fixes

**Rollback Plan:**
- If issues arise, hide Redline Queue tab (fallback to Sources-only view)
- Storage fields are additive (safe to leave in place)
- Can disable auto-transitions via feature flag if needed

---

## Success Metrics

### User Adoption
- [ ] 80% of Embeds have redline status assigned within 2 weeks
- [ ] Average time to review an Embed: <5 minutes
- [ ] Users report improved quality control workflow

### Technical
- [ ] Queue loads in <2 seconds for 100 Embeds
- [ ] Zero data loss during status transitions
- [ ] <5% false positive auto-transitions

### Business
- [ ] Reduced "approved content accidentally changed" incidents
- [ ] Better audit trail for compliance
- [ ] Improved content quality across Blueprints

---

**Last Updated:** 2025-11-11
**Author:** Claude Code
**Approved By:** Pending user review
