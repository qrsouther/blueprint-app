/**
 * ExcerptListSidebar Component
 *
 * Displays the left sidebar with a filterable, sortable list of Blueprint Standard Sources.
 * Includes search/filter controls at the top.
 * Handles excerpt selection for displaying usage details in the main panel.
 *
 * @param {Object} props
 * @param {Array} props.sortedExcerpts - Sorted and filtered array of excerpt objects
 * @param {string} props.searchTerm - Current search filter value
 * @param {Function} props.setSearchTerm - Callback to update search term
 * @param {string} props.categoryFilter - Current category filter value
 * @param {Function} props.setCategoryFilter - Callback to update category filter
 * @param {string} props.sortBy - Current sort order
 * @param {Function} props.setSortBy - Callback to update sort order
 * @param {Array<string>} props.categories - List of available categories
 * @param {Object|null} props.selectedExcerptForDetails - Currently selected excerpt
 * @param {Function} props.setSelectedExcerptForDetails - Callback to update selected excerpt
 * @param {Object} props.xcss - xcss style object for the sidebar container
 * @param {Object} props.selectStyles - xcss styles for select dropdowns
 * @returns {JSX.Element}
 */

import React, { Fragment } from 'react';
import {
  Text,
  Strong,
  Em,
  Box,
  Stack,
  Inline,
  Lozenge,
  Pressable,
  Select,
  xcss
} from '@forge/react';
import { StableTextfield } from '../common/StableTextfield';
import { logger } from '../../utils/logger.js';

// Pressable item styling for excerpt list items
const excerptItemStyle = (isSelected) => xcss({
  padding: 'space.100',
  textAlign: 'left',
  borderRadius: 'border.radius',
  backgroundColor: isSelected ? 'color.background.selected' : 'color.background.neutral.subtle',
  ':hover': {
    backgroundColor: 'color.background.neutral.hovered'
  }
});

export function ExcerptListSidebar({
  sortedExcerpts,
  totalExcerptCount,
  searchTerm,
  setSearchTerm,
  categoryFilter,
  setCategoryFilter,
  sortBy,
  setSortBy,
  categories,
  selectedExcerptForDetails,
  setSelectedExcerptForDetails,
  xcss: containerStyle,
  selectStyles,
  scrollableListStyle
}) {
  return (
    <Box xcss={xcss({
      ...containerStyle,
      display: 'flex',
      flexDirection: 'column',
      height: '50em',
      width: '20%',
      minWidth: '20%',
      overflow: 'scroll'
    })}>
      <Box xcss={xcss({ flexShrink: 0 })}>
        <Stack space="space.200">
          {/* Search and Filter Controls */}
          <Stack space="space.100">
            <StableTextfield
              stableKey="excerpt-search-input"
              placeholder="Search by name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />

            <Box xcss={selectStyles}>
              <Select
                options={[
                  { label: 'All Categories', value: 'All' },
                  ...categories.map(cat => ({ label: cat, value: cat }))
                ]}
                value={{ label: categoryFilter === 'All' ? 'All Categories' : categoryFilter, value: categoryFilter }}
                onChange={(e) => setCategoryFilter(e.value)}
              />
            </Box>

            <Box xcss={selectStyles}>
              <Select
                options={[
                  { label: 'Sort: Name (A-Z)', value: 'name-asc' },
                  { label: 'Sort: Name (Z-A)', value: 'name-desc' },
                  { label: 'Sort: Most Used', value: 'usage-high' },
                  { label: 'Sort: Least Used', value: 'usage-low' },
                  { label: 'Sort: Category', value: 'category' }
                ]}
                value={{
                  label: sortBy === 'name-asc' ? 'Sort: Name (A-Z)' :
                         sortBy === 'name-desc' ? 'Sort: Name (Z-A)' :
                         sortBy === 'usage-high' ? 'Sort: Most Used' :
                         sortBy === 'usage-low' ? 'Sort: Least Used' :
                         'Sort: Category',
                  value: sortBy
                }}
                onChange={(e) => setSortBy(e.value)}
              />
            </Box>
          </Stack>

          {/* Filtered Results Indicator */}
          {totalExcerptCount > 0 && (searchTerm || categoryFilter !== 'All') && sortedExcerpts.length < totalExcerptCount && (
            <Box>
              <Text>
                <Em>Showing {sortedExcerpts.length} of {totalExcerptCount} Sources</Em>
              </Text>
            </Box>
          )}

          {/* Empty State - No Matches */}
          {sortedExcerpts.length === 0 && (searchTerm || categoryFilter !== 'All') && (
            <Text>No Blueprint Standards match your filters</Text>
          )}

          {/* Empty State - No Excerpts */}
          {sortedExcerpts.length === 0 && !searchTerm && categoryFilter === 'All' && (
            <Fragment>
              <Text>No Blueprint Standard Sources found.</Text>
              <Text>Create a Blueprint Standard - Source macro on a page to get started.</Text>
            </Fragment>
          )}
        </Stack>
      </Box>

      {/* Excerpt List - Scrollable */}
      <Box xcss={scrollableListStyle}>
        <Stack space="space.100">
          {sortedExcerpts.map((excerpt) => {
            const category = String(excerpt.category || 'General');
            const isSelected = selectedExcerptForDetails?.id === excerpt.id;

            return (
              <Pressable
                key={excerpt.id}
                onClick={() => {
                  setSelectedExcerptForDetails(excerpt);
                }}
                xcss={excerptItemStyle(isSelected)}
              >
                <Inline space="space.100" alignBlock="center" shouldWrap>
                  <Text><Strong>{excerpt.name}</Strong></Text>
                  <Lozenge isBold>{category}</Lozenge>
                </Inline>
              </Pressable>
            );
          })}
        </Stack>
      </Box>
    </Box>
  );
}
