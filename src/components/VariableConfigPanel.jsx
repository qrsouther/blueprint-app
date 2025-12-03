/**
 * Variable Configuration Panel
 *
 * Component for the "Write" tab that displays variable input fields.
 * Allows users to fill in required and optional variables for a Blueprint Standard embed.
 *
 * Features:
 * - Required field indicators with asterisks
 * - Warning icons for missing required fields
 * - Tooltips for variable descriptions
 * - Visual status indicators (filled/empty/required)
 * - Auto-saving via parent React Hook Form
 *
 * MIGRATED TO REACT HOOK FORM (v8.0.0):
 * - Uses parent form control from EmbedContainer
 * - Eliminates race conditions with debounce/auto-save
 * - Status checkmarks update immediately using useWatch()
 * - No manual state sync needed
 */

import React from 'react';
import { useWatch } from 'react-hook-form';
import {
  Text,
  Strong,
  Code,
  Inline,
  Tooltip,
  Icon,
  DynamicTable,
  Box,
  Toggle,
  xcss
} from '@forge/react';
import { StableTextfield } from './common/StableTextfield';

// Style for full-width variable table container
const variableBoxStyle = xcss({
  width: '100%',
  maxWidth: '100%',
  backgroundColor: 'color.background.neutral',
  paddingBlockStart: 'space.200',
  paddingBlockEnd: 'space.100',
  paddingInline: 'space.100'
});

// Style for DynamicTable to ensure full width
const tableContainerStyle = xcss({
  width: '100%',
  maxWidth: '100%'
});

// Style for required field warning border
const requiredFieldStyle = xcss({
  borderColor: 'color.border.warning',
  borderWidth: 'border.width.outline',
  borderStyle: 'solid',
  borderRadius: 'border.radius',
  padding: 'space.050'
});

// Style to ensure caret/cursor is visible in text inputs
// NOTE: This fixes cursor visibility but NOT text selection highlighting
// Text selection is broken in Forge Textfield due to missing ::selection styles
// and CSP prevents workarounds. This is a known Forge/UI Kit bug.
const textfieldWrapperStyle = xcss({
  caretColor: 'color.text'
});

// Style for the Smart Casing toggle footer row
const toggleFooterStyle = xcss({
  paddingBlockStart: 'space.150',
  paddingBlockEnd: 'space.050',
  paddingInline: 'space.100',
  borderTopWidth: 'border.width',
  borderTopStyle: 'solid',
  borderTopColor: 'color.border'
});

/**
 * VariableConfigPanel Component
 *
 * @param {Object} props
 * @param {Object} props.excerpt - The Blueprint Standard/excerpt object containing variables
 * @param {Object} props.control - React Hook Form control from parent form
 * @param {Function} props.setValue - React Hook Form setValue function
 * @param {Function} props.onBlur - Handler for blur events (draft saving)
 * @param {number} props.formKey - Key to force re-mount of inputs on reset
 * @returns {JSX.Element}
 */
export const VariableConfigPanel = ({ excerpt, control, setValue, onBlur, formKey }) => {
  // Watch variable values from parent form for status checkmarks
  const watchedValues = useWatch({
    control,
    name: 'variableValues'
  }) || {};

  // Watch smart casing setting
  const smartCasingEnabled = useWatch({
    control,
    name: 'smartCasingEnabled'
  }) !== false; // Default true for backwards compatibility

  // Handle null excerpt (template context where user hasn't selected a source yet)
  if (!excerpt) {
    return <Text>Please select a Source first to configure variables.</Text>;
  }
  
  // If no variables defined, show empty state
  if (!excerpt.variables || excerpt.variables.length === 0) {
    return <Text>No variables defined for this standard.</Text>;
  }

  return (
    <Box xcss={variableBoxStyle}>
      <Box xcss={tableContainerStyle}>
        <DynamicTable
          head={{
            cells: [
              {
                key: 'variable',
                content: 'Variable',
                width: 20
              },
              {
                key: 'value',
                content: 'Value',
                width: 75
              },
              {
                key: 'status',
                content: 'Status',
                width: 5
              }
            ]
          }}
          rows={excerpt.variables.map(variable => {
            const isRequired = variable.required || false;
            
            // Get current value from watched form state (updates immediately)
            const currentValue = watchedValues[variable.name] || '';
            
            // Robust empty check - handle null, undefined, empty string, and whitespace-only values
            const isEmpty = currentValue === null || 
                           currentValue === undefined || 
                           currentValue === '' || 
                           (typeof currentValue === 'string' && currentValue.trim() === '');
            const showWarning = isRequired && isEmpty;

            // Field name for React Hook Form
            const fieldName = `variableValues.${variable.name}`;

            return {
              key: variable.name,
              cells: [
                {
                  key: 'variable',
                  content: (
                    <Inline space="space.050" alignBlock="center">
                      {isRequired && <Text><Strong>*</Strong></Text>}
                      <Text><Code>{variable.name}</Code></Text>
                      {variable.description && (
                        <Tooltip content={variable.description} position="right">
                          <Icon glyph="question-circle" size="small" label="" />
                        </Tooltip>
                      )}
                      {showWarning && (
                        <Tooltip content="This field is required. Please provide a value." position="right">
                          <Icon glyph="warning" size="small" label="Required field" color="color.icon.warning" />
                        </Tooltip>
                      )}
                    </Inline>
                  )
                },
                {
                  key: 'value',
                  content: (
                    <Box xcss={showWarning ? requiredFieldStyle : undefined}>
                      <Box xcss={textfieldWrapperStyle}>
                        <StableTextfield
                          appearance="standard"
                          id={`var-value-${variable.name}`}
                          stableKey={`var-value-${variable.name}-${formKey || 0}`}
                          placeholder={variable.example ? `e.g., ${variable.example}` : `Enter value for ${variable.name}`}
                          value={currentValue}
                          onChange={(e) => {
                            const newValue = e.target.value;
                            // Normalize empty values to empty string
                            const normalizedValue = newValue === '' ? '' : newValue;
                            // Update form value (triggers watch() update immediately)
                            setValue(fieldName, normalizedValue, { shouldDirty: true });
                          }}
                          onBlur={onBlur}
                        />
                      </Box>
                    </Box>
                  )
                },
                {
                  key: 'status',
                  content: (
                    isEmpty ? (
                      isRequired ? (
                        <Icon glyph="checkbox-unchecked" label="Required - Empty" color="color.icon.danger" />
                      ) : (
                        <Icon glyph="checkbox-unchecked" label="Optional - Empty" color="color.icon.subtle" />
                      )
                    ) : (
                      <Icon glyph="check-circle" label="Filled" color="color.icon.success" />
                    )
                  )
                }
              ]
            };
          })}
        />
      </Box>
      
      {/* Smart Casing Toggle - allows users to disable auto-capitalization */}
      <Box xcss={toggleFooterStyle}>
        <Inline alignInline="end" alignBlock="center" space="space.100">
          <Tooltip 
            content="When enabled, lowercase variable values are automatically capitalized at sentence starts. Disable to use your exact input values."
            position="top"
          >
            <Inline alignBlock="center" space="space.050">
              <Text size="small" color="color.text.subtle">Smart Casing</Text>
              <Icon glyph="question-circle" size="small" label="Smart casing info" />
            </Inline>
          </Tooltip>
          <Toggle
            id="smart-casing-toggle"
            isChecked={smartCasingEnabled}
            onChange={() => {
              setValue('smartCasingEnabled', !smartCasingEnabled, { shouldDirty: true });
              if (onBlur) onBlur(); // Trigger draft save
            }}
          />
        </Inline>
      </Box>
    </Box>
  );
};
