/**
 * ArchetypeSelector Component
 *
 * Dropdown/card selector for choosing a page archetype.
 * Groups archetypes by category and shows descriptions.
 *
 * @module ArchetypeSelector
 */

import React from 'react';
import {
  Select,
  Stack,
  Text,
  Box,
  Inline,
  Lozenge,
  xcss
} from '@forge/react';

// Styles
const selectedArchetypeStyle = xcss({
  padding: 'space.150',
  backgroundColor: 'color.background.selected',
  borderRadius: 'border.radius',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderColor: 'color.border.selected'
});

const archInfoStyle = xcss({
  paddingTop: 'space.050'
});

/**
 * ArchetypeSelector Component
 *
 * @param {Object} props
 * @param {Array} props.archetypes - Available archetypes
 * @param {string} props.selectedId - Currently selected archetype ID
 * @param {Function} props.onSelect - Handler for selection change
 * @param {boolean} props.isDisabled - Whether selector is disabled
 * @returns {JSX.Element}
 */
export function ArchetypeSelector({
  archetypes = [],
  selectedId,
  onSelect,
  isDisabled = false
}) {
  // Group archetypes by category
  const groupedOptions = [];
  const categories = [...new Set(archetypes.map(a => a.category))];

  for (const category of categories) {
    const categoryArchetypes = archetypes.filter(a => a.category === category);
    groupedOptions.push({
      label: category,
      options: categoryArchetypes.map(a => ({
        label: a.name,
        value: a.id,
        description: a.description
      }))
    });
  }

  // Find selected archetype details
  const selectedArchetype = archetypes.find(a => a.id === selectedId);

  // Handle selection
  const handleChange = (option) => {
    if (option && option.value !== selectedId) {
      onSelect(option.value);
    }
  };

  // Find current value for Select
  const currentValue = selectedId ? {
    label: selectedArchetype?.name || selectedId,
    value: selectedId
  } : null;

  return (
    <Stack space="space.150">
      <Select
        options={groupedOptions}
        value={currentValue}
        onChange={handleChange}
        placeholder="Select a page archetype..."
        isDisabled={isDisabled}
        isClearable={false}
      />

      {/* Show selected archetype info */}
      {selectedArchetype && (
        <Box xcss={selectedArchetypeStyle}>
          <Stack space="space.100">
            <Inline space="space.100" alignBlock="center">
              <Text weight="semibold">{selectedArchetype.name}</Text>
              <Lozenge appearance="success">{selectedArchetype.category}</Lozenge>
            </Inline>
            <Box xcss={archInfoStyle}>
              <Text size="small" color="color.text.subtle">
                {selectedArchetype.description}
              </Text>
            </Box>
            <Text size="small" color="color.text.subtle">
              {selectedArchetype.chapters?.length || 0} chapters available
            </Text>
          </Stack>
        </Box>
      )}
    </Stack>
  );
}

