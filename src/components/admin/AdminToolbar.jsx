/**
 * AdminToolbar Component
 *
 * Top toolbar for the Admin page containing action buttons only:
 * - Migration Tools button (if enabled)
 * - Manage Categories button
 * - Check All Sources button
 * - Check All Embeds button
 *
 * Shows last verification timestamp as tooltip on button hover.
 *
 * @param {Object} props
 * @param {Function} props.onOpenMigrationModal - Handler for Migration Tools button
 * @param {boolean} props.showMigrationTools - Feature flag for migration tools
 * @param {Function} props.onOpenCategoryModal - Handler for Manage Categories button
 * @param {Function} props.onCheckAllSources - Handler for Check All Sources button
 * @param {boolean} props.isCheckingAllSources - Whether Check All Sources is running
 * @param {Function} props.onCheckAllIncludes - Handler for Check All Embeds button
 * @param {boolean} props.isCheckingIncludes - Whether Check All Embeds is running
 * @param {string|null} props.lastVerificationTime - ISO timestamp of last verification
 * @param {Function} props.formatTimestamp - Function to format timestamp for display
 * @param {Function} props.onOpenStorageExport - Handler for Export Production Data button
 * @param {Function} props.onOpenStorageImport - Handler for Import Production Data button
 * @returns {JSX.Element}
 */

import React from 'react';
import {
  Button,
  ButtonGroup,
  Tooltip,
  Icon,
  xcss
} from '@forge/react';

// Button styling for equal widths and darker borders
const buttonStyles = xcss({
  minWidth: '180px',
  borderWidth: 'border.width.outline',
  borderColor: 'color.border.bold'
});

export function AdminToolbar({
  onOpenMigrationModal,
  showMigrationTools = true,
  onOpenCategoryModal,
  onCheckAllSources,
  isCheckingAllSources,
  onCheckAllIncludes,
  isCheckingIncludes,
  lastVerificationTime,
  formatTimestamp,
  onCreateTestPage,
  isCreatingTestPage,
  onCreateSource,
  onOpenStorageExport,
  onOpenStorageImport
}) {
  const verificationTooltip = lastVerificationTime
    ? `Last verified: ${formatTimestamp(lastVerificationTime)}`
    : 'Not yet verified';

  return (
    <ButtonGroup>
      {/* Hidden but wired up for future use
      <Button
        appearance="primary"
        onClick={onCreateSource}
        xcss={buttonStyles}
      >
        Create Source (Experimental)
      </Button>
      */}

      {showMigrationTools && (
        <Button
          appearance="default"
          onClick={onOpenMigrationModal}
          xcss={buttonStyles}
        >
          🔀 Migration Tools
        </Button>
      )}

      <Button
        appearance="default"
        iconBefore='shapes'
        onClick={onOpenCategoryModal}
        xcss={buttonStyles}
      >
        Categories
      </Button>

      <Tooltip content={verificationTooltip}>
        <Button
          appearance="default"
          iconBefore='data-flow'
          onClick={onCheckAllSources}
          isDisabled={isCheckingAllSources}
          xcss={buttonStyles}
        >
          {isCheckingAllSources ? 'Checking...' : 'Check Sources'}
        </Button>
      </Tooltip>

      <Tooltip content={`${verificationTooltip}\n\nVerifies all Embed macros: checks if they exist on their pages, references valid standards, and have up-to-date content. Automatically cleans up orphaned entries and generates a complete CSV-exportable report with usage data, variable values, and rendered content.`}>
        <Button
          appearance="default"
          iconBefore='eye-open'
          onClick={onCheckAllIncludes}
          isDisabled={isCheckingIncludes}
          xcss={buttonStyles}
        >
          {isCheckingIncludes ? 'Checking...' : 'Check Embeds'}
        </Button>
      </Tooltip>

      <Tooltip content="Export all storage data from this environment (production) to a JSON file for import into development.">
        <Button
          iconBefore='download'
          appearance="default"
          onClick={onOpenStorageExport}
          xcss={buttonStyles}
        >
          Export
        </Button>
      </Tooltip>

      <Tooltip content="Import storage data from a production export file. This will overwrite ALL existing data in this environment (development).">
        <Button
          appearance="default"
          iconBefore='upload'
          onClick={onOpenStorageImport}
          xcss={buttonStyles}
        >
          Import
        </Button>
      </Tooltip>

      {/* Hidden but wired up for future use */}
      {/* <Tooltip content="Creates a test page with 148 Embed macros (3x realistic max) with random variable values for performance testing">
        <Button
          appearance="warning"
          onClick={onCreateTestPage}
          isDisabled={isCreatingTestPage}
          xcss={buttonStyles}
        >
          {isCreatingTestPage ? 'Creating...' : '🧪 Create Test Page'}
        </Button>
      </Tooltip> */}
    </ButtonGroup>
  );
}
