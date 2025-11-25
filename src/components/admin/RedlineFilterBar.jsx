/**
 * Redline Filter Bar Component
 *
 * Provides filtering, sorting, and grouping controls for the redline queue.
 * Allows users to filter by status, sort by various fields, and group results.
 *
 * Part of Phase 4 implementation (Queue Filtering & Sorting UI)
 *
 * Features:
 * - Status filter dropdown (all, reviewable, pre-approved, needs-revision, approved)
 * - Sort dropdown (status, page, source, updated)
 * - Group dropdown (none, status, page, source)
 * - Clear filters button
 *
 * Props:
 * @param {Object} filters - Current filter state { status: [] }
 * @param {Function} onFiltersChange - Callback to update filters
 * @param {string} sortBy - Current sort field
 * @param {Function} onSortChange - Callback to update sort field
 * @param {string|null} groupBy - Current group field
 * @param {Function} onGroupChange - Callback to update group field
 */

import React, { useCallback } from 'react';
import { Box, Stack, Inline, Select, Button, Textfield, xcss } from '@forge/react';

// Styles for select dropdowns
const selectStyles = xcss({
  minWidth: '200px'
});

const filterBarStyles = xcss({
  backgroundColor: 'color.background.input',
  padding: 'space.050',
  borderRadius: 'border.radius',
  width: '100%'
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

export function RedlineFilterBar({
  filters,
  onFiltersChange,
  sortBy,
  onSortChange,
  groupBy,
  onGroupChange,
  onManualRefresh
}) {
  // Search term state
  const [searchTerm, setSearchTerm] = React.useState(filters.searchTerm || '');
  
  // Use ref to access current filters without causing callback recreation
  const filtersRef = React.useRef(filters);
  React.useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  // Sync search term state when filters change externally (e.g., reset)
  React.useEffect(() => {
    setSearchTerm(filters.searchTerm || '');
  }, [filters.searchTerm]);
  // Status filter options
  const statusOptions = [
    { label: 'All Statuses', value: 'all' },
    { label: 'Reviewable', value: 'reviewable' },
    { label: 'Pre-Approved', value: 'pre-approved' },
    { label: 'Needs Revision', value: 'needs-revision' },
    { label: 'Approved', value: 'approved' }
  ];

  // Sort options
  const sortOptions = [
    { label: 'Sort: Status', value: 'status' },
    { label: 'Sort: Page', value: 'page' },
    { label: 'Sort: Source', value: 'source' },
    { label: 'Sort: Last Updated', value: 'updated' }
  ];

  // Group options
  const groupOptions = [
    { label: 'Group: None', value: 'none' },
    { label: 'Group: Status', value: 'status' },
    { label: 'Group: Page', value: 'page' },
    { label: 'Group: Source', value: 'source' }
  ];

  // Get current status filter value (default to 'all')
  const currentStatus = (filters.status && filters.status.length > 0 && filters.status[0] !== 'all')
    ? filters.status[0]
    : 'all';

  // Get current status label
  const currentStatusLabel = statusOptions.find(opt => opt.value === currentStatus)?.label || 'All Statuses';

  // Get current sort label
  const currentSortLabel = sortOptions.find(opt => opt.value === sortBy)?.label || 'Sort: Status';

  // Get current group value and label
  const currentGroupValue = groupBy || 'none';
  const currentGroupLabel = groupOptions.find(opt => opt.value === currentGroupValue)?.label || 'Group: None';

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
    setSearchTerm(newSearchTerm);
    // Update filters with search term using ref to get current filters
    onFiltersChange({
      ...filtersRef.current,
      searchTerm: newSearchTerm || undefined
    });
  }, [onFiltersChange]);

  const handleResetFilters = () => {
    setSearchTerm('');
    onFiltersChange({ status: ['all'], searchTerm: '' });
    onSortChange('status');
    onGroupChange(null);
  };

  return (
    <Box xcss={filterBarStyles}>
      <Stack space="space.050">
        <Inline space="space.050" alignBlock="center">
          {/* Status Filter */}
          <Box xcss={selectStyles}>
            <Select
              options={statusOptions}
              value={{ label: currentStatusLabel, value: currentStatus }}
              onChange={handleStatusChange}
            />
          </Box>

          {/* Sort By */}
          <Box xcss={selectStyles}>
            <Select
              options={sortOptions}
              value={{ label: currentSortLabel, value: sortBy }}
              onChange={handleSortChange}
            />
          </Box>

          {/* Group By */}
          <Box xcss={selectStyles}>
            <Select
              options={groupOptions}
              value={{ label: currentGroupLabel, value: currentGroupValue }}
              onChange={handleGroupChange}
            />
          </Box>

          {/* Search Box */}
          <Box xcss={xcss({ minWidth: '250px' })}>
            <SearchTextfield
              value={searchTerm}
              onChange={handleSearchChange}
              placeholder="Search by Page Title or Embed UUID..."
            />
          </Box>

          {/* Reset Filters Button */}
          <Button appearance="subtle" onClick={handleResetFilters}>
            Reset Filters
          </Button>

          {/* Refresh Queue Button */}
          {onManualRefresh && (
            <Button 
            appearance="default" 
            iconBefore='refresh'
            onClick={onManualRefresh}>
              Refresh
            </Button>
          )}
        </Inline>
      </Stack>
    </Box>
  );
}
