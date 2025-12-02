/**
 * Redline Stats Bar Component
 *
 * Displays aggregate statistics and filter/sort controls for the redline queue.
 * Shows counts of Embeds by status with color-coded Lozenges and inline controls.
 *
 * Part of Phase 5 implementation (Consolidated UI)
 *
 * Features:
 * - Real-time stats via React Query
 * - Color-coded status badges
 * - Inline filter, sort, and group controls
 * - Loading state handling
 * - Error state handling
 *
 * Props:
 * @param {Object} filters - Current filter state
 * @param {Function} onFiltersChange - Callback to update filters
 * @param {string} sortBy - Current sort field
 * @param {Function} onSortChange - Callback to update sort field
 * @param {string|null} groupBy - Current group field
 * @param {Function} onGroupChange - Callback to update group field
 * @param {boolean} isActive - Whether the tab is active (default: true)
 * @param {string|null} embedsCountDisplay - Display string showing embed counts (e.g., "Showing 5 of 10 embeds")
 */

import React, { useCallback } from 'react';
import { Box, Inline, Stack, Lozenge, Text, Spinner, Select, Button, Textfield, xcss } from '@forge/react';
import { useRedlineStatsQuery } from '../../hooks/redline-hooks';

// Full-width style - minWidth ensures it doesn't collapse when content is minimal
const fullWidthStyle = xcss({
  width: '100%',
  minWidth: '100%'
});

// Select dropdown style
const selectStyles = xcss({
  minWidth: '180px'
});

// Search field style
const searchFieldStyle = xcss({
  minWidth: '300px'
});

// Vertical divider style (matching RedlineQueueCard dividers)
const verticalDividerStyle = xcss({
  borderLeftWidth: 'border.width',
  borderLeftStyle: 'solid',
  borderLeftColor: 'color.border',
  height: '100%',
  alignSelf: 'stretch'
});

// Isolated Search Textfield component to prevent cursor jumping
// Uses uncontrolled component pattern with ref to maintain cursor position
const SearchTextfield = React.memo(({ value, onChange, placeholder }) => {
  const textFieldRef = React.useRef(null);
  
  // Sync ref value when value prop changes externally (e.g., when filters reset)
  React.useEffect(() => {
    if (textFieldRef.current && textFieldRef.current.value !== value) {
      textFieldRef.current.value = value;
    }
  }, [value]); // Only sync when value changes externally, not on every render
  
  // Handle change events
  const handleChange = useCallback((e) => {
    if (onChange) {
      onChange(e);
    }
  }, [onChange]);
  
  return (
    <Textfield
      ref={textFieldRef}
      placeholder={placeholder}
      defaultValue={value}
      onChange={handleChange}
    />
  );
}, (prevProps, nextProps) => {
  // Only re-render if placeholder or onChange changes
  // Don't re-render when value changes - let the ref handle it
  return (
    prevProps.placeholder === nextProps.placeholder &&
    prevProps.onChange === nextProps.onChange
  );
});

function RedlineStatsBarComponent({
  filters,
  onFiltersChange,
  sortBy,
  onSortChange,
  groupBy,
  onGroupChange,
  onManualRefresh,
  isActive = true,
  embedsCountDisplay
}) {
  const { data: stats, isLoading, error } = useRedlineStatsQuery(isActive);
  
  // Use ref to access current filters without causing callback recreation
  const filtersRef = React.useRef(filters);
  React.useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  // Filter/sort options
  const statusOptions = [
    { label: 'All Statuses', value: 'all' },
    { label: 'Reviewable', value: 'reviewable' },
    { label: 'Pre-Approved', value: 'pre-approved' },
    { label: 'Needs Revision', value: 'needs-revision' },
    { label: 'Approved', value: 'approved' }
  ];

  const sortOptions = [
    { label: 'Sort: Status', value: 'status' },
    { label: 'Sort: Page', value: 'page' },
    { label: 'Sort: Source', value: 'source' },
    { label: 'Sort: Last Updated', value: 'updated' }
  ];

  const groupOptions = [
    { label: 'Group: None', value: 'none' },
    { label: 'Group: Status', value: 'status' },
    { label: 'Group: Page', value: 'page' },
    { label: 'Group: Source', value: 'source' }
  ];

  // Get current values
  const currentStatus = (filters.status && filters.status.length > 0 && filters.status[0] !== 'all')
    ? filters.status[0]
    : 'all';
  const currentStatusLabel = statusOptions.find(opt => opt.value === currentStatus)?.label || 'All Statuses';
  const currentSortLabel = sortOptions.find(opt => opt.value === sortBy)?.label || 'Sort: Status';
  const currentGroupValue = groupBy || 'none';
  const currentGroupLabel = groupOptions.find(opt => opt.value === currentGroupValue)?.label || 'Group: None';

  // Handlers
  const handleStatusChange = (e) => {
    const newStatus = e.value;
    if (newStatus === 'all') {
      onFiltersChange({ ...filters, status: ['all'] });
    } else {
      onFiltersChange({ ...filters, status: [newStatus] });
    }
  };

  const handleSortChange = (e) => {
    onSortChange(e.value);
  };

  const handleGroupChange = (e) => {
    const newGroup = e.value;
    onGroupChange(newGroup === 'none' ? null : newGroup);
  };

  // Memoize onChange handler to prevent Textfield recreation
  // Use ref to access current filters without recreating callback on every keystroke
  const handleSearchChange = useCallback((e) => {
    const newSearchTerm = e.target.value;
    // Update filters with search term using ref to get current filters
    onFiltersChange({
      ...filtersRef.current,
      searchTerm: newSearchTerm || undefined
    });
  }, [onFiltersChange]);

  const handleClearFilters = () => {
    onFiltersChange({ status: ['all'], searchTerm: '' });
    onSortChange('status');
    onGroupChange(null);
  };

  if (isLoading) {
    return (
      <Box backgroundColor="color.background.neutral" padding="space.200" xcss={fullWidthStyle}>
        <Inline space="space.100" alignBlock="center">
          <Spinner size="small" />
          <Text>Loading queue statistics...</Text>
        </Inline>
      </Box>
    );
  }

  if (error) {
    return (
      <Box backgroundColor="color.background.danger" padding="space.200" xcss={fullWidthStyle}>
        <Text color="color.text.danger">
          Failed to load statistics: {error.message}
        </Text>
      </Box>
    );
  }

  if (!stats) {
    return null;
  }

  return (
    <Box backgroundColor="color.background.neutral" padding="space.100" xcss={fullWidthStyle}>
      <Stack space="space.100">
        {/* Search row */}
        <Box xcss={searchFieldStyle}>
          <SearchTextfield
            value={filters.searchTerm || ''}
            onChange={handleSearchChange}
            placeholder="Search by Page Title or Embed UUID..."
          />
        </Box>

        {/* Main row: Controls on left, divider, stats on right */}
        <Inline space="space.200" alignBlock="center" spread="space-between">
          {/* Left side: Controls */}
          <Inline space="space.100" alignBlock="center" spread="space-between">
            <Box xcss={selectStyles}>
              <Select
                options={statusOptions}
                value={{ label: currentStatusLabel, value: currentStatus }}
                onChange={handleStatusChange}
              />
            </Box>
            <Box xcss={selectStyles}>
              <Select
                options={sortOptions}
                value={{ label: currentSortLabel, value: sortBy }}
                onChange={handleSortChange}
              />
            </Box>
            <Box xcss={selectStyles}>
              <Select
                options={groupOptions}
                value={{ label: currentGroupLabel, value: currentGroupValue }}
                onChange={handleGroupChange}
              />
            </Box>
            <Button appearance="subtle" onClick={handleClearFilters}>
              Clear Filters
            </Button>
            {onManualRefresh && (
              <Button appearance="default" onClick={onManualRefresh}>
                🔄 Refresh Queue
              </Button>
            )}
            {embedsCountDisplay && (
              <Text as="em" align='center'>
                {embedsCountDisplay}
              </Text>
            )}
          </Inline>

          {/* Vertical divider */}
          <Box xcss={verticalDividerStyle} />

          {/* Right side: Stats */}
          <Inline space="space.100" alignBlock="center" spread="space-between">
            <Lozenge appearance="new">
              Reviewable: {stats.reviewable}
            </Lozenge>
            <Lozenge appearance="inprogress">
              Pre-Approved: {stats.preApproved}
            </Lozenge>
            <Lozenge appearance="removed">
              Needs Revision: {stats.needsRevision}
            </Lozenge>
            <Lozenge appearance="success">
              Approved: {stats.approved}
            </Lozenge>
          </Inline>
        </Inline>
      </Stack>
    </Box>
  );
}

// Memoize component to prevent re-renders when filters object reference changes
// but the actual filter values remain the same
export const RedlineStatsBar = React.memo(RedlineStatsBarComponent, (prevProps, nextProps) => {
  // Only re-render if actual filter values change, not just object reference
  const prevSearchTerm = prevProps.filters?.searchTerm || '';
  const nextSearchTerm = nextProps.filters?.searchTerm || '';
  const prevStatus = prevProps.filters?.status?.[0] || 'all';
  const nextStatus = nextProps.filters?.status?.[0] || 'all';
  
  return (
    prevSearchTerm === nextSearchTerm &&
    prevStatus === nextStatus &&
    prevProps.sortBy === nextProps.sortBy &&
    prevProps.groupBy === nextProps.groupBy &&
    prevProps.onFiltersChange === nextProps.onFiltersChange &&
    prevProps.onSortChange === nextProps.onSortChange &&
    prevProps.onGroupChange === nextProps.onGroupChange &&
    prevProps.onManualRefresh === nextProps.onManualRefresh &&
    prevProps.embedsCountDisplay === nextProps.embedsCountDisplay
  );
});
