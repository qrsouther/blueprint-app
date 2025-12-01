/**
 * StorageUsageFooter Component
 *
 * Displays current Forge storage usage at the bottom of the Admin page.
 * Shows usage in MB, percentage of 250MB limit, Sources count, and Embeds count.
 * Displays a warning banner when storage exceeds 100 MB (40% of limit).
 *
 * @param {Object} props
 * @param {number} props.totalMB - Total storage used in MB
 * @param {number} props.limitMB - Storage limit in MB (250)
 * @param {number} props.warningThresholdMB - Warning threshold in MB (100)
 * @param {number} props.percentUsed - Percentage of limit used
 * @param {number} props.sourcesCount - Total number of Sources
 * @param {number} props.embedsCount - Total number of Embeds
 * @param {boolean} props.exceedsWarningThreshold - Whether storage exceeds warning threshold
 * @param {boolean} props.isLoading - Whether storage usage is being calculated
 * @param {string|null} props.error - Error message if calculation failed
 * @param {Function} props.onRefresh - Callback function to refresh storage usage data
 * @returns {JSX.Element}
 */

import React from 'react';
import {
  Box,
  Inline,
  Code,
  Button,
  xcss
} from '@forge/react';

// Footer styling with full width, thin top border, and light gray background
// No padding to make it truly edge-to-edge
const footerStyles = xcss({
  width: '100%',
  paddingBlock: 'space.100',
  paddingInlineEnd: 'space.100',
  borderTopWidth: 'border.width',
  borderTopStyle: 'solid',
  borderTopColor: 'color.border',
  backgroundColor: 'color.background.neutral',
  marginBlockStart: 'space.300'
});

export function StorageUsageFooter({
  totalMB,
  limitMB,
  warningThresholdMB,
  percentUsed,
  sourcesCount,
  embedsCount,
  exceedsWarningThreshold,
  isLoading,
  error,
  onRefresh
}) {
  // Don't render anything while loading
  if (isLoading) {
    return null;
  }

  // Show error state if there's an error (instead of hiding completely)
  if (error) {
    return (
      <Box xcss={footerStyles}>
        <Inline space="space.100" alignBlock="center" alignInline="end">
          {onRefresh && (
            <Button
              appearance="subtle"
              iconBefore="refresh"
              onClick={onRefresh}
              isDisabled={isLoading}
            >
              Refresh
            </Button>
          )}
          <Code>Storage Usage: Error loading ({error})</Code>
        </Inline>
      </Box>
    );
  }

  // Don't render if data isn't available yet
  // Use != null to allow 0 values (which are valid)
  if (totalMB == null || limitMB == null || percentUsed == null || sourcesCount == null || embedsCount == null) {
    return null;
  }

  return (
    <Box xcss={footerStyles}>
      <Inline space="space.100" alignBlock="center" alignInline="end">
        {onRefresh && (
          <Button
            appearance="subtle"
            iconBefore="refresh"
            onClick={onRefresh}
            isDisabled={isLoading}
          >
            Refresh
          </Button>
        )}
        <Code>Storage Usage: {totalMB} MB / {limitMB} MB ({percentUsed}%)    •    {sourcesCount} Sources    •    {embedsCount} Embeds</Code>
      </Inline>
    </Box>
  );
}
