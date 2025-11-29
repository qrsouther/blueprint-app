/**
 * Toggle Configuration Panel
 *
 * Component for the "Toggles" tab that displays conditional content toggles.
 * Allows users to enable/disable content blocks within a Blueprint Standard embed.
 *
 * Features:
 * - Toggle switches for each conditional section
 * - Toggle names and descriptions
 * - Empty state when no toggles defined
 * - Auto-saving via parent component
 */

import React from 'react';
import { useWatch } from 'react-hook-form';
import {
  Text,
  Strong,
  Em,
  Toggle,
  DynamicTable,
  Box,
  xcss
} from '@forge/react';

// Style for full-width variable table container
const variableBoxStyle = xcss({
  width: '100%',
  backgroundColor: 'color.background.neutral',
  paddingBlockStart: 'space.200',
  paddingBlockEnd: 'space.100',
  paddingInline: 'space.100'
});

/**
 * ToggleConfigPanel Component
 *
 * @param {Object} props
 * @param {Object} props.excerpt - The Blueprint Standard/excerpt object containing toggles
 * @param {Object} props.control - React Hook Form control from parent form
 * @returns {JSX.Element}
 */
export const ToggleConfigPanel = ({ excerpt, control, setValue, onBlur }) => {
  // Watch toggle states from parent form
  const toggleStates = useWatch({
    control,
    name: 'toggleStates'
  }) || {};
  // Handle null excerpt (template context where user hasn't selected a source yet)
  if (!excerpt) {
    return <Text>Please select a Source first to configure toggles.</Text>;
  }
  
  // If no toggles defined, show empty state
  if (!excerpt.toggles || excerpt.toggles.length === 0) {
    return (
      <Box paddingTop="space.10" paddingBottom="space.100">
        <Text as="em">No Toggles defined for this Source.</Text>
      </Box>
    );
  }

  return (
    <Box xcss={variableBoxStyle}>
      <DynamicTable
        head={{
          cells: [
            {
              key: 'toggle',
              content: '',
              width: 5
            },
            {
              key: 'name',
              content: 'Toggle',
              width: 30
            },
            {
              key: 'description',
              content: 'Description',
              width: 65
            }
          ]
        }}
        rows={excerpt.toggles.map(toggle => {
          const fieldName = `toggleStates.${toggle.name}`;
          const currentValue = toggleStates[toggle.name] || false;

          return {
            key: toggle.name,
            cells: [
              {
                key: 'toggle',
                content: (
                  <Toggle
                    isChecked={currentValue}
                    onChange={(e) => {
                      setValue(fieldName, e.target.checked, { shouldDirty: true });
                      // Trigger draft save after toggle change
                      if (onBlur) onBlur();
                    }}
                  />
                )
              },
              {
                key: 'name',
                content: <Text><Strong>{toggle.name}</Strong></Text>
              },
              {
                key: 'description',
                content: toggle.description ? <Text><Em>{toggle.description}</Em></Text> : <Text>—</Text>
              }
            ]
          };
        })}
      />
    </Box>
  );
};
