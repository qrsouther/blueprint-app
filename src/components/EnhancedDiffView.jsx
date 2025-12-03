/**
 * Enhanced Diff View Component
 *
 * Provides a line-by-line diff view that shows:
 * - Text diff with green/red highlighting (GitHub-style)
 * - All toggle content visible (including disabled toggles) with markers
 *
 * This solves the "apples to oranges" problem by comparing text with toggle markers,
 * ensuring changes in disabled toggles are visible even if they're not currently enabled.
 *
 * Key Features:
 * - Shows changes in disabled toggles (prevents "looks identical" false negatives)
 * - Line-level highlighting for precise change detection
 * - Toggle markers indicate which content is in enabled vs disabled toggles
 */

import React from 'react';
import { Box, Text, Em, Stack, Inline, Tabs, TabList, Tab, TabPanel, xcss } from '@forge/react';
import { diffLines } from 'diff';
import {
  substituteVariablesInAdf,
  extractTextWithToggleMarkers
} from '../utils/adf-rendering-utils.js';

// Container styles (no background - now inside green SectionMessage)
const containerStyle = xcss({
  paddingTop: 'space.050',
  width: '100%'
});

// Helper text spacing - more top padding, no bottom padding
const helperTextStyle = xcss({
  paddingTop: 'space.200',
  paddingBottom: 'space.0'
});

const diffContainerStyle = xcss({
  marginBlock: 'space.200',
  marginTop: 'space.0',  // No top margin since helper text provides spacing
  width: '100%',
  borderRadius: 'border.radius',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderColor: 'color.border',
  overflow: 'hidden',
  backgroundColor: 'elevation.surface' // White/neutral background for diff content
});

// SOLUTION: Separate background from padding using nested Boxes
// Outer Box: background color ONLY (no padding)
// Inner Box: padding, text-indent, font styles (no background)

// Background colors - only neutral lines alternate
const lineAddedBgStyle = xcss({
  backgroundColor: 'color.background.success'  // Consistent light green for all added
});

const lineRemovedBgStyle = xcss({
  backgroundColor: 'color.background.danger'  // Consistent light red for all removed
});

// Neutral lines alternate between light gray and slightly darker gray
const lineUnchangedBgStyle = xcss({
  backgroundColor: 'elevation.surface'  // White/very light
});

const lineUnchangedBgStyleAlt = xcss({
  backgroundColor: 'elevation.surface.sunken'  // Slightly darker gray
});

// Compact padding for the line container
const linePaddingStyle = xcss({
  padding: 'space.050',
  fontFamily: 'monospace',
  fontSize: '12px'
});

// Prefix symbol (+/-/space) - just basic styling
const prefixStyle = xcss({
  fontFamily: 'monospace',
  fontSize: '12px',
  minWidth: '2em'
});

// Text content that can wrap - using Box so it can have specific styling
// flexGrow: 1 makes it take remaining space, containing wrapped text
const contentWrapperStyle = xcss({
  fontFamily: 'monospace',
  fontSize: '12px',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  flexGrow: 1,
  minWidth: 0  // Allows flex item to shrink below content size
});

/**
 * Render line-based diff with color coding
 * Green background = added lines
 * Red background = removed lines
 * Gray background = unchanged lines
 */
function renderLineDiff(oldText, newText) {
  const differences = diffLines(oldText || '', newText || '');

  // Track neutral line number for alternating backgrounds (only neutral lines alternate)
  let neutralLineNumber = 0;

  return (
    <Stack space="space.0">
      {differences.map((part, index) => {
        // Split into individual lines for rendering
        const lines = part.value.split('\n');

        return lines.map((line, lineIndex) => {
          // Skip empty last line from split
          if (lineIndex === lines.length - 1 && line === '') {
            return null;
          }

          const key = `${index}-${lineIndex}`;

          if (part.added) {
            return (
              <Box key={key} xcss={lineAddedBgStyle}>
                <Box xcss={linePaddingStyle}>
                  <Inline space="space.0" alignBlock="start">
                    <Box xcss={prefixStyle}>
                      <Text>+</Text>
                    </Box>
                    <Box xcss={contentWrapperStyle}>
                      <Text>{line}</Text>
                    </Box>
                  </Inline>
                </Box>
              </Box>
            );
          } else if (part.removed) {
            return (
              <Box key={key} xcss={lineRemovedBgStyle}>
                <Box xcss={linePaddingStyle}>
                  <Inline space="space.0" alignBlock="start">
                    <Box xcss={prefixStyle}>
                      <Text>-</Text>
                    </Box>
                    <Box xcss={contentWrapperStyle}>
                      <Text>{line}</Text>
                    </Box>
                  </Inline>
                </Box>
              </Box>
            );
          } else {
            // Unchanged lines alternate
            const isEvenLine = neutralLineNumber % 2 === 0;
            neutralLineNumber++;

            return (
              <Box key={key} xcss={isEvenLine ? lineUnchangedBgStyle : lineUnchangedBgStyleAlt}>
                <Box xcss={linePaddingStyle}>
                  <Inline space="space.0" alignBlock="start">
                    <Box xcss={prefixStyle}>
                      <Text> </Text>
                    </Box>
                    <Box xcss={contentWrapperStyle}>
                      <Text>{line}</Text>
                    </Box>
                  </Inline>
                </Box>
              </Box>
            );
          }
        });
      })}
    </Stack>
  );
}

/**
 * Enhanced Diff View Component
 *
 * @param {Object} props
 * @param {Object} props.oldSourceContent - ADF from Source at last sync (stored in syncedContent)
 * @param {Object} props.newSourceContent - Current ADF from Source (latest excerpt.content)
 * @param {Object} props.variableValues - User's current variable values
 * @param {Object} props.toggleStates - User's current toggle states (enabled/disabled)
 * @returns {JSX.Element}
 */
export function EnhancedDiffView({
  oldSourceContent,
  newSourceContent,
  variableValues = {},
  toggleStates = {}
}) {
  // For line-based diff: apply variables and mark toggles, then extract text
  const renderForLineDiff = (content) => {
    if (!content) return '';
    try {
      // Apply variable substitutions
      let rendered = substituteVariablesInAdf(content, variableValues);
      // Extract text with toggle markers (shows ALL toggles including disabled)
      return extractTextWithToggleMarkers(rendered, toggleStates);
    } catch (error) {
      console.error('[EnhancedDiffView] Error processing content:', error);
      return '[Error: Unable to process content for diff]';
    }
  };

  const oldText = renderForLineDiff(oldSourceContent);
  const newText = renderForLineDiff(newSourceContent);

  return (
    <Box id="enhanced-diff-view-container" xcss={containerStyle}>
      <Stack space="space.200">
        {/* Native Tabs component with proper TabList and TabPanel structure */}
        <Tabs id="diff-view-tabs">
          <TabList>
            <Tab>Line Diff</Tab>
          </TabList>

          <TabPanel>
            <Box xcss={xcss({ width: '100%', paddingRight: 'space.300' })}>
              <Stack id="line-diff-tab-panel" space="space.0">
                <Box id="line-diff-helper-text" xcss={helperTextStyle}>
                  <Text>
                    <Em>Line-by-line comparison showing additions (green), removals (red), and unchanged content (gray/white).</Em>
                  </Text>
                </Box>
                <Box id="line-diff-container" xcss={diffContainerStyle}>
                  {renderLineDiff(oldText, newText)}
                </Box>
              </Stack>
            </Box>
          </TabPanel>
        </Tabs>
      </Stack>
    </Box>
  );
}
