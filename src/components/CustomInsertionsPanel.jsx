/**
 * Custom Insertions Panel
 *
 * Component for the "Custom" tab that allows users to insert custom paragraphs
 * and internal notes at specific positions within the rendered content.
 *
 * Features:
 * - Add custom paragraphs (visible to clients)
 * - Add internal notes (visible only internally, marked with 🔏)
 * - Position selection relative to source paragraphs
 * - Toggle between paragraph and note mode
 * - View and delete existing custom content
 * - Prevents multiple notes at same position
 * - Auto-saving via parent component
 */

import React from 'react';
import { useWatch, useFieldArray } from 'react-hook-form';
import {
  Text,
  Strong,
  Em,
  Toggle,
  Button,
  Select,
  Lozenge,
  Inline,
  Tooltip,
  Icon,
  DynamicTable,
  Box,
  xcss
} from '@forge/react';
import { StableTextfield } from './common/StableTextfield';

import {
  filterContentByToggles,
  substituteVariablesInAdf,
  extractParagraphsFromAdf
} from '../utils/adf-rendering-utils';

// Style for full-width variable table container
const variableBoxStyle = xcss({
  width: '100%',
  backgroundColor: 'color.background.neutral',
  paddingBlockStart: 'space.200',
  paddingBlockEnd: 'space.100',
  paddingInline: 'space.100'
});

/**
 * CustomInsertionsPanel Component
 *
 * @param {Object} props
 * @param {Object} props.excerpt - The Blueprint Standard/excerpt object
 * @param {Object} props.control - React Hook Form control from parent form
 * @param {string} props.insertionType - Current insertion type ('body' or 'note')
 * @param {Function} props.setInsertionType - Function to update insertion type
 * @param {number|null} props.selectedPosition - Currently selected position for insertion
 * @param {Function} props.setSelectedPosition - Function to update selected position
 * @param {string} props.customText - Current text for new insertion
 * @param {Function} props.setCustomText - Function to update custom text
 * @returns {JSX.Element}
 */
export const CustomInsertionsPanel = ({
  excerpt,
  control,
  insertionType,
  setInsertionType,
  selectedPosition,
  setSelectedPosition,
  customText,
  setCustomText,
  onBlur
}) => {
  // Watch form values from parent form
  const variableValues = useWatch({ control, name: 'variableValues' }) || {};
  const toggleStates = useWatch({ control, name: 'toggleStates' }) || {};
  const smartCasingEnabled = useWatch({ control, name: 'smartCasingEnabled' }) !== false;
  
  // Use useFieldArray for customInsertions and internalNotes
  const { fields: customInsertionFields, append: appendCustomInsertion, remove: removeCustomInsertion } = useFieldArray({
    control,
    name: 'customInsertions'
  });
  
  const { fields: internalNoteFields, append: appendInternalNote, remove: removeInternalNote } = useFieldArray({
    control,
    name: 'internalNotes'
  });
  
  // Convert fields to arrays for compatibility with existing code
  const customInsertions = customInsertionFields || [];
  const internalNotes = internalNoteFields || [];
  // Extract paragraphs from ORIGINAL excerpt content only (not preview with custom insertions)
  // This ensures users can only position custom content relative to source content
  let originalContent = excerpt?.content;
  if (originalContent && typeof originalContent === 'object' && originalContent.type === 'doc') {
    // Fix for GitHub issue #2 - Free Write paragraph insertion position with enabled toggles
    // FIX: Extract paragraphs from ORIGINAL content (before toggle filtering) so paragraph indices
    // match the original structure. This allows insertions to be placed inside toggle blocks.
    // Only apply variable substitution for display purposes, but don't filter toggles yet.
    // Pass excerpt.variables for smart case matching (auto-capitalize at sentence starts)
    // Pass disableSmartCase option based on user's Smart Casing toggle preference
    originalContent = substituteVariablesInAdf(
      originalContent, 
      variableValues, 
      excerpt?.variables,
      { disableSmartCase: !smartCasingEnabled }
    );
    // Don't filter toggles here - extract from original structure
  }

  const paragraphs = extractParagraphsFromAdf(originalContent);

  // If no paragraphs available, show empty state
  if (paragraphs.length === 0) {
    return <Text><Em>No paragraphs available for insertion. Please add content first.</Em></Text>;
  }

  // Create dropdown options from ONLY original source paragraphs
  const paragraphOptions = paragraphs.map(p => ({
    label: `After paragraph ${p.index + 1}: "${p.lastSentence}"`,
    value: p.index
  }));

  // Combine existing content and sort by position
  const existingContent = [
    ...customInsertions.map((item, idx) => ({
      type: 'paragraph',
      position: item.position,
      content: item.text,
      originalIndex: idx
    })),
    ...internalNotes.map((item, idx) => ({
      type: 'note',
      position: item.position,
      content: item.content,
      originalIndex: idx
    }))
  ].sort((a, b) => a.position - b.position);

  // Since selectedPosition comes from the dropdown which uses original paragraph indices,
  // we can use it directly as the target position
  const targetPosition = selectedPosition;

  const hasNoteAtPosition = targetPosition !== null && internalNotes.some(n => n.position === targetPosition);

  // Build table rows: "Add New" row + existing content rows
  const tableRows = [
    // Add New row
    {
      key: 'add-new',
      cells: [
        {
          key: 'type-toggle',
          content: (
            <Inline space="space.050" alignBlock="center">
              <Text>📝</Text>
              <Tooltip content="📝 is saved as a custom paragraph that is visible to clients, 🔏 is saved as an Internal Note that is visible only to SeatGeek employees.">
                <Toggle
                  isChecked={insertionType === 'note'}
                  onChange={(e) => {
                    setInsertionType(e.target.checked ? 'note' : 'body');
                    setSelectedPosition(null);
                    setCustomText('');
                  }}
                />
              </Tooltip>
              <Text>🔏</Text>
            </Inline>
          )
        },
        {
          key: 'position',
          content: (
            <Select
              options={paragraphOptions}
              value={paragraphOptions.find(opt => opt.value === selectedPosition)}
              placeholder="After paragraph..."
              onChange={(e) => setSelectedPosition(e.value)}
            />
          )
        },
        {
          key: 'content',
          content: (
            <StableTextfield
              id={`custom-text-${insertionType}`}
              stableKey={`custom-text-${insertionType}`}
              placeholder={insertionType === 'body' ? "Enter paragraph text..." : "Enter internal note..."}
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              isDisabled={selectedPosition === null}
              onBlur={onBlur}
            />
          )
        },
        {
          key: 'action',
          content: (
            <Button
              appearance="primary"
              isDisabled={selectedPosition === null || !customText.trim() || (insertionType === 'note' && hasNoteAtPosition)}
              onClick={() => {
                if (insertionType === 'body') {
                  const newInsertion = {
                    position: targetPosition,
                    text: customText.trim()
                  };
                  appendCustomInsertion(newInsertion);
                } else {
                  if (!hasNoteAtPosition) {
                    const newNote = {
                      position: targetPosition,
                      content: customText.trim()
                    };
                    appendInternalNote(newNote);
                  }
                }

                setSelectedPosition(null);
                setCustomText('');
                
                // Trigger draft save after adding content
                if (onBlur) onBlur();
              }}
            >
              Add
            </Button>
          )
        }
      ]
    },
    // Existing content rows
    ...existingContent.map((item, idx) => {
      // Get the paragraph text preview for the position
      const targetParagraph = paragraphs.find(p => p.index === item.position);
      const positionPreview = targetParagraph
        ? targetParagraph.lastSentence.substring(0, 30) + (targetParagraph.lastSentence.length > 30 ? '...' : '')
        : `¶${item.position + 1}`;

      return {
        key: `existing-${idx}`,
        cells: [
          {
            key: 'type-indicator',
            content: (
              <Inline space="space.075" alignBlock="center">
                <Text>{item.type === 'paragraph' ? '📝' : '🔏'}</Text>
                <Lozenge appearance={item.type === 'paragraph' ? 'success' : 'moved'}>
                  {item.type === 'paragraph' ? 'External' : 'Internal'}
                </Lozenge>
              </Inline>
            )
          },
          {
            key: 'position-display',
            content: <Text><Em>After: "{positionPreview}"</Em></Text>
          },
          {
            key: 'content-display',
            content: <Text>{item.content.substring(0, 100)}{item.content.length > 100 ? '...' : ''}</Text>
          },
          {
            key: 'delete-action',
            content: (
              <Button
                appearance="subtle"
                onClick={() => {
                  if (item.type === 'paragraph') {
                    removeCustomInsertion(item.originalIndex);
                  } else {
                    removeInternalNote(item.originalIndex);
                  }
                  // Trigger draft save after deleting content
                  if (onBlur) onBlur();
                }}
              >
                <Icon glyph="trash" size="small" label="Delete" />
              </Button>
            )
          }
        ]
      };
    })
  ];

  return (
    <Box xcss={variableBoxStyle}>
      <DynamicTable
        head={{
          cells: [
            {
              key: 'type',
              content: 'Internal? 🔏',
              width: 12
            },
            {
              key: 'position',
              content: 'Placement',
              width: 18
            },
            {
              key: 'content',
              content: 'Content',
              width: 65
            },
            {
              key: 'action',
              content: '',
              width: 5
            }
          ]
        }}
        rows={tableRows}
      />
    </Box>
  );
};
