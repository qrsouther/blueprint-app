/**
 * AdminToolbar Component
 *
 * Top toolbar for the Admin page containing action buttons only:
 * - Migration Tools button (if enabled)
 * - Manage Categories button
 *
 * Note: Check All Sources and Check All Embeds buttons have been moved to the Storage tab.
 *
 * @param {Object} props
 * @param {Function} props.onOpenMigrationModal - Handler for Migration Tools button
 * @param {boolean} props.showMigrationTools - Feature flag for migration tools
 * @param {Function} props.onOpenCategoryModal - Handler for Manage Categories button
 * @param {Function} props.onOpenStorageExport - Handler for Export Production Data button
 * @param {Function} props.onOpenStorageImport - Handler for Import Production Data button
 * @returns {JSX.Element}
 */

import React from 'react';
import {
  Button,
  ButtonGroup,
  Tooltip,
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
  onOpenStorageExport,
  onOpenStorageImport
}) {
  return (
    <ButtonGroup>
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
    </ButtonGroup>
  );
}
