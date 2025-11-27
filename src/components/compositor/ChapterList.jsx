/**
 * ChapterList Component
 *
 * List of chapters with toggle switches for enabling/disabling.
 * Shows chapter details and required indicators.
 *
 * @module ChapterList
 */

import React from 'react';
import {
  Stack,
  Inline,
  Text,
  Toggle,
  Lozenge,
  Box,
  xcss
} from '@forge/react';

// Styles
const chapterListStyle = xcss({
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderColor: 'color.border',
  borderRadius: 'border.radius',
  overflow: 'hidden'
});

const chapterItemStyle = xcss({
  padding: 'space.150',
  borderBottomWidth: 'border.width',
  borderBottomStyle: 'solid',
  borderBottomColor: 'color.border',
  ':last-child': {
    borderBottomWidth: '0'
  }
});

const chapterItemDisabledStyle = xcss({
  padding: 'space.150',
  borderBottomWidth: 'border.width',
  borderBottomStyle: 'solid',
  borderBottomColor: 'color.border',
  backgroundColor: 'color.background.disabled',
  opacity: 0.7,
  ':last-child': {
    borderBottomWidth: '0'
  }
});

const chapterDetailsStyle = xcss({
  flex: '1'
});

/**
 * ChapterList Component
 *
 * @param {Object} props
 * @param {Array} props.chapters - List of chapter definitions
 * @param {Object} props.chapterStates - Current chapter enabled states
 * @param {Function} props.onToggle - Handler for toggle change
 * @param {boolean} props.isDisabled - Whether toggles are disabled
 * @returns {JSX.Element}
 */
export function ChapterList({
  chapters = [],
  chapterStates = {},
  onToggle,
  isDisabled = false
}) {
  // Sort chapters by order
  const sortedChapters = [...chapters].sort((a, b) => a.order - b.order);

  if (sortedChapters.length === 0) {
    return (
      <Box padding="space.200">
        <Text color="color.text.subtle">No chapters available</Text>
      </Box>
    );
  }

  return (
    <Box xcss={chapterListStyle}>
      <Stack space="space.0">
        {sortedChapters.map((chapter) => {
          const isEnabled = chapterStates[chapter.id]?.enabled ?? chapter.defaultEnabled;
          const isRequired = chapter.required === true;

          return (
            <Box
              key={chapter.id}
              xcss={isEnabled ? chapterItemStyle : chapterItemDisabledStyle}
            >
              <Inline space="space.200" alignBlock="center" spread="space-between">
                <Box xcss={chapterDetailsStyle}>
                  <Stack space="space.050">
                    <Inline space="space.100" alignBlock="center">
                      <Text weight="medium">{chapter.name}</Text>
                      {isRequired && (
                        <Lozenge appearance="removed">Required</Lozenge>
                      )}
                      {!isEnabled && !isRequired && (
                        <Lozenge appearance="default">Disabled</Lozenge>
                      )}
                    </Inline>
                    <Text size="small" color="color.text.subtle">
                      {chapter.description}
                    </Text>
                  </Stack>
                </Box>

                <Toggle
                  id={`chapter-toggle-${chapter.id}`}
                  isChecked={isEnabled}
                  onChange={() => onToggle(chapter.id, !isEnabled)}
                  isDisabled={isDisabled || isRequired}
                  label={isEnabled ? 'Enabled' : 'Disabled'}
                />
              </Inline>
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}

