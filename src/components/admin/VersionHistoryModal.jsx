/**
 * Version History Modal Component
 *
 * Part of Phase 4 (v7.18.8) - Embed Version Management UI
 *
 * Displays version history for a specific Embed, allowing users to:
 * - View all saved versions with timestamps and change types
 * - See detailed configuration for any version
 * - Restore from a previous version with automatic backup
 *
 * This is a standalone modal opened directly from the Admin usage grid
 * via the "Recovery Options" button.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether modal is open
 * @param {Function} props.onClose - Handler to close modal
 * @param {string} props.embedUuid - Embed UUID (localId) to load version history for
 * @returns {JSX.Element}
 */

import React, { useState, useEffect } from 'react';
import {
  Text,
  Strong,
  Button,
  Box,
  Modal,
  ModalTransition,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
  Stack,
  Inline,
  SectionMessage,
  Lozenge,
  xcss
} from '@forge/react';
import { invoke } from '@forge/bridge';
import { StableTextfield } from '../common/StableTextfield';
import { logger } from '../../utils/logger.js';

// Item container styling (matching Emergency Recovery design)
const deletedItemStyle = xcss({
  padding: 'space.200',
  borderColor: 'color.border',
  borderStyle: 'solid',
  borderWidth: 'border.width',
  borderRadius: 'border.radius',
  backgroundColor: 'color.background.neutral.subtle'
});

// Scrollable list container
const scrollableListStyle = xcss({
  maxHeight: '400px',
  overflowY: 'auto'
});

// JSON preview styling
const jsonPreviewStyle = xcss({
  padding: 'space.100',
  backgroundColor: 'color.background.neutral',
  borderRadius: 'border.radius',
  maxHeight: '200px',
  overflowY: 'auto',
  overflowX: 'auto',
  fontFamily: 'monospace',
  fontSize: '11px',
  whiteSpace: 'pre'
});

/**
 * Version History Modal
 */
export function VersionHistoryModal({ isOpen, onClose, embedUuid }) {
  const [versionLocalId, setVersionLocalId] = useState(embedUuid || '');
  const [versions, setVersions] = useState([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [versionError, setVersionError] = useState(null);
  const [restoringVersion, setRestoringVersion] = useState(false);
  const [expandedItems, setExpandedItems] = useState({});

  // Update versionLocalId when embedUuid prop changes
  useEffect(() => {
    if (isOpen && embedUuid) {
      setVersionLocalId(embedUuid);
    }
  }, [isOpen, embedUuid]);

  // Auto-load version history when UUID is provided
  useEffect(() => {
    if (isOpen && embedUuid) {
      // Small delay to ensure state is set
      setTimeout(() => {
        handleLoadVersions();
      }, 100);
    }
  }, [isOpen, embedUuid]);

  /**
   * Load version history from backend
   */
  const handleLoadVersions = async () => {
    if (!versionLocalId.trim()) {
      setVersionError('Please enter a valid Embed UUID (localId)');
      return;
    }

    setLoadingVersions(true);
    setVersionError(null);
    setVersions([]);
    setSelectedVersion(null);

    try {
      const entityId = versionLocalId.trim(); // Just the UUID, not the storage key

      const response = await invoke('getVersionHistory', { entityId });

      if (response.success && response.data) {
        setVersions(response.data.versions || []);
        if (response.data.versions.length === 0) {
          setVersionError('No version history found for this Embed UUID');
        }
      } else {
        logger.errors('[VersionHistory] Response not successful:', response.error);
        setVersionError(response.error || 'Failed to load version history');
      }
    } catch (err) {
      logger.errors('[VersionHistory] Error loading versions:', err);
      setVersionError(err.message);
    } finally {
      setLoadingVersions(false);
    }
  };

  /**
   * Load details for a specific version
   */
  const handleSelectVersion = async (versionId) => {
    setVersionError(null);

    try {
      const response = await invoke('getVersionDetails', { versionId });

      if (response.success && response.data) {
        setSelectedVersion(response.data.version);
      } else {
        setVersionError(`Failed to load version details: ${response.error}`);
      }
    } catch (err) {
      setVersionError(`Error loading version: ${err.message}`);
      logger.errors('[VersionHistory] Error loading version details:', err);
    }
  };

  /**
   * Restore an Embed from a version snapshot
   */
  const handleRestoreVersion = async (versionId) => {
    const confirmed = confirm(
      '⚠️  Restore this version?\n\n' +
      'This will:\n' +
      '1. Create a backup snapshot of the current Embed state\n' +
      '2. Restore all data from the selected version\n' +
      '3. Update the live Embed immediately\n\n' +
      'The current version will be preserved in version history.\n\n' +
      'Continue?'
    );

    if (!confirmed) return;

    setRestoringVersion(true);
    setVersionError(null);

    try {
      const response = await invoke('restoreFromVersion', { versionId });

      if (response.success && response.data) {
        alert(`✅ Successfully restored Embed!\n\nRestored from: ${formatTimestamp(response.data.versionId)}\nBackup created: ${response.data.backupVersionId}\n\nThe Embed is now live with the restored data.`);
        setSelectedVersion(null);
        // Refresh version list to show new backup
        handleLoadVersions();
      } else {
        setVersionError(`Failed to restore version: ${response.error}`);
      }
    } catch (err) {
      setVersionError(`Error restoring version: ${err.message}`);
      logger.errors('[VersionHistory] Error restoring version:', err);
    } finally {
      setRestoringVersion(false);
    }
  };

  /**
   * Format timestamp for display
   */
  const formatTimestamp = (isoString) => {
    if (!isoString) return 'Unknown';
    const date = new Date(isoString);
    return date.toLocaleString();
  };

  return (
    <ModalTransition>
      {isOpen && (
        <Modal onClose={onClose} width="xlarge">
          <ModalHeader>
            <ModalTitle>↺ Embed Version History</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <Stack space="space.200">
              {/* Info message */}
              <SectionMessage appearance="information">
                <Text>
                  <Strong>Version History</Strong> - View and restore previous versions of this Embed. All changes are automatically saved.
                </Text>
              </SectionMessage>

              {/* Error message */}
              {versionError && (
                <SectionMessage appearance="error">
                  <Text><Strong>Error:</Strong> {versionError}</Text>
                </SectionMessage>
              )}

              {/* Lookup input */}
              <Stack space="space.100">
                <Text><Strong>Embed UUID (localId)</Strong></Text>
                <Inline space="space.100" alignBlock="center">
                  <StableTextfield
                    stableKey="version-history-uuid-input"
                    placeholder="Enter Embed UUID (e.g., 1a2b3c4d-5e6f-7g8h-9i0j-1k2l3m4n5o6p)"
                    value={versionLocalId}
                    onChange={(e) => setVersionLocalId(e.target.value)}
                    width="full"
                  />
                  <Button
                    appearance="primary"
                    onClick={handleLoadVersions}
                    isDisabled={loadingVersions || !versionLocalId.trim()}
                  >
                    {loadingVersions ? 'Loading...' : 'Load History'}
                  </Button>
                </Inline>
                <Text appearance="subtle">
                  The UUID should already be filled in from the Admin usage grid.
                </Text>
              </Stack>

              {/* Version list */}
              {versions.length > 0 && !selectedVersion && (
                <Box xcss={scrollableListStyle}>
                  <Stack space="space.150">
                    <Text>
                      <Strong>Found {versions.length} version{versions.length !== 1 ? 's' : ''}</Strong> for Embed: {versionLocalId}
                    </Text>

                    {versions.map((version) => (
                      <Box key={version.versionId} xcss={deletedItemStyle}>
                        <Stack space="space.100">
                          <Inline space="space.100" alignBlock="center" spread="space-between">
                            <Stack space="space.050">
                              <Text><Strong>{formatTimestamp(version.timestamp)}</Strong></Text>
                              <Inline space="space.100" alignBlock="center">
                                <Lozenge appearance={
                                  version.changeType === 'CREATE' ? 'success' :
                                  version.changeType === 'UPDATE' ? 'default' :
                                  version.changeType === 'DELETE' ? 'removed' :
                                  'moved'
                                }>
                                  {version.changeType}
                                </Lozenge>
                                <Text appearance="subtle">Size: {version.size} bytes</Text>
                                {version.changedBy && (
                                  <Text appearance="subtle">by {version.changedBy}</Text>
                                )}
                              </Inline>
                            </Stack>

                            <Button
                              appearance="default"
                              onClick={() => handleSelectVersion(version.versionId)}
                            >
                              View Details →
                            </Button>
                          </Inline>
                        </Stack>
                      </Box>
                    ))}
                  </Stack>
                </Box>
              )}

              {/* Selected version details */}
              {selectedVersion && (
                <Box xcss={xcss({
                  padding: 'space.300',
                  borderColor: 'color.border',
                  borderStyle: 'solid',
                  borderWidth: 'border.width',
                  borderRadius: 'border.radius',
                  backgroundColor: 'color.background.neutral.subtle'
                })}>
                  <Stack space="space.200">
                    {/* Header with back button */}
                    <Inline space="space.100" alignBlock="center" spread="space-between">
                      <Text><Strong>Timestamp:</Strong> {formatTimestamp(selectedVersion.timestamp)}</Text>
                      <Inline space="space.100" alignBlock="center">
                        <Button
                          appearance="subtle"
                          onClick={() => setSelectedVersion(null)}
                        >
                          ← Back to List
                        </Button>
                        <Button
                          appearance="primary"
                          onClick={() => handleRestoreVersion(selectedVersion.versionId)}
                          isDisabled={restoringVersion}
                        >
                          {restoringVersion ? 'Restoring...' : '↺ Restore This Version'}
                        </Button>
                      </Inline>
                    </Inline>

                    {/* Version metadata */}
                    <Stack space="space.050">
                      <Text><Strong>Changed By:</Strong> {selectedVersion.changedBy}</Text>
                    </Stack>

                    {/* Stored data */}
                    {selectedVersion.data && (
                      <Stack space="space.100">
                        {/* Key metadata fields */}
                        <Box xcss={jsonPreviewStyle}>
                          <Stack space="space.100">
                            {/* Variable values */}
                            {selectedVersion.data.variableValues && Object.keys(selectedVersion.data.variableValues).length > 0 && (
                              <Box>
                                <Text><Strong>Variable Values:</Strong></Text>
                                <Box xcss={xcss({ paddingInlineStart: 'space.200' })}>
                                  {Object.entries(selectedVersion.data.variableValues).map(([key, value]) => (
                                    <Text key={key}><Strong>{key}</Strong>: {value}</Text>
                                  ))}
                                </Box>
                              </Box>
                            )}

                            {/* Toggle states */}
                            {selectedVersion.data.toggleStates && Object.keys(selectedVersion.data.toggleStates).length > 0 && (
                              <Box>
                                <Text><Strong>Toggle States:</Strong></Text>
                                <Box xcss={xcss({ paddingInlineStart: 'space.200' })}>
                                  {Object.entries(selectedVersion.data.toggleStates).map(([key, value]) => (
                                    <Text key={key}><Strong>{key}</Strong>: {value ? 'TRUE' : 'FALSE'}</Text>
                                  ))}
                                </Box>
                              </Box>
                            )}

                            {/* Custom paragraphs */}
                            {selectedVersion.data.customParagraphs && Object.keys(selectedVersion.data.customParagraphs).length > 0 && (
                              <Box>
                                <Text><Strong>Custom Paragraphs:</Strong></Text>
                                <Box xcss={xcss({ paddingInlineStart: 'space.200' })}>
                                  {Object.entries(selectedVersion.data.customParagraphs).map(([key, adfContent]) => (
                                    <Text key={key}>• {key}: {JSON.stringify(adfContent).substring(0, 100)}...</Text>
                                  ))}
                                </Box>
                              </Box>
                            )}

                            {/* Internal notes */}
                            {selectedVersion.data.internalNotes && (
                              <Box>
                                <Text><Strong>Internal Notes:</Strong></Text>
                                <Text appearance="subtle">{JSON.stringify(selectedVersion.data.internalNotes).substring(0, 200)}...</Text>
                              </Box>
                            )}
                          </Stack>
                        </Box>

                        {/* Full JSON preview (collapsed by default) */}
                        <Stack space="space.050">
                          <Button
                            appearance="subtle"
                            onClick={() => setExpandedItems(prev => ({
                              ...prev,
                              [selectedVersion.versionId]: !prev[selectedVersion.versionId]
                            }))}
                          >
                            {expandedItems[selectedVersion.versionId] ? '▼' : '▶'} View full JSON
                          </Button>
                          {expandedItems[selectedVersion.versionId] && (
                            <Box xcss={jsonPreviewStyle}>
                              <Text>{JSON.stringify(selectedVersion.data, null, 2)}</Text>
                            </Box>
                          )}
                        </Stack>
                      </Stack>
                    )}
                  </Stack>
                </Box>
              )}
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button appearance="subtle" onClick={onClose}>
              Close
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </ModalTransition>
  );
}
