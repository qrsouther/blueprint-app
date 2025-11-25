/**
 * Emergency Recovery Modal Component
 *
 * Part of Phase 1 Safety Patch (v7.16.0) - Data Safety & Versioning System
 *
 * Displays soft-deleted Embeds from the `macro-vars-deleted:*` namespace.
 * Allows users to view deletion details and restore accidentally removed data.
 *
 * Features:
 * - Lists recent soft-deleted items (last 50, sorted by deletion time)
 * - Shows deletion reason, timestamp, and recoverable data
 * - Search/filter by localId or deletion reason
 * - Restore button for each item
 * - Bulk restore capability
 *
 * Storage Keys:
 * - `macro-vars-deleted:{localId}` - Soft-deleted Embed configurations
 * - Created by checkIncludesWorker.js when orphans are cleaned up
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether modal is open
 * @param {Function} props.onClose - Handler to close modal
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
  Tabs,
  TabList,
  Tab,
  TabPanel,
  xcss
} from '@forge/react';
import { invoke } from '@forge/bridge';
import { StableTextfield } from '../common/StableTextfield';
import { logger } from '../../utils/logger.js';

// Item container styling
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
 * Emergency Recovery Modal
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether modal is open
 * @param {Function} props.onClose - Handler to close modal
 * @param {string} [props.initialTab] - Optional initial tab ('deleted-embeds' or 'version-history')
 * @param {string} [props.autoLoadEmbedUuid] - Optional UUID to auto-load version history for
 */
export function EmergencyRecoveryModal({ isOpen, onClose, initialTab = 'deleted-embeds', autoLoadEmbedUuid = null }) {
  const [deletedItems, setDeletedItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [restoring, setRestoring] = useState({});
  const [error, setError] = useState(null);
  const [expandedItems, setExpandedItems] = useState({});

  // Delete orphaned Embeds section
  const [deletePageIds, setDeletePageIds] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteResult, setDeleteResult] = useState(null);

  // Tab state (Phase 4 - v7.18.0)
  const [activeTab, setActiveTab] = useState(initialTab);

  // Version History state (Phase 4 - v7.18.0)
  const [versionLocalId, setVersionLocalId] = useState(autoLoadEmbedUuid || '');
  const [versions, setVersions] = useState([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [versionError, setVersionError] = useState(null);
  const [restoringVersion, setRestoringVersion] = useState(false);

  // Load deleted items when modal opens
  useEffect(() => {
    if (isOpen) {
      loadDeletedItems();
    }
  }, [isOpen]);

  // Update active tab when modal opens with new initialTab
  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Update version localId when UUID is provided
  useEffect(() => {
    if (isOpen && autoLoadEmbedUuid) {
      setVersionLocalId(autoLoadEmbedUuid);
    }
  }, [isOpen, autoLoadEmbedUuid]);

  // Auto-load version history when UUID is provided
  useEffect(() => {
    if (isOpen && autoLoadEmbedUuid && initialTab === 'version-history') {
      // Small delay to ensure state is set
      setTimeout(() => {
        handleLoadVersions();
      }, 100);
    }
  }, [isOpen, autoLoadEmbedUuid, initialTab]);

  /**
   * Load all soft-deleted items from storage
   */
  const loadDeletedItems = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await invoke('getDeletedItems');
      if (response.success) {
        setDeletedItems(response.items || []);
      } else {
        setError(response.error || 'Failed to load deleted items');
      }
    } catch (err) {
      setError(err.message);
      logger.errors('Error loading deleted items:', err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Restore a single deleted item
   */
  const handleRestore = async (item) => {
    const { localId, pageTitle, pageId } = item;
    setRestoring(prev => ({ ...prev, [localId]: true }));
    setError(null);

    try {
      const response = await invoke('restoreDeletedItem', { localId });
      if (response.success) {
        // Show success message with page details before removing from list
        const pageInfo = pageTitle
          ? `${pageTitle}${pageId ? ` (Page ID: ${pageId})` : ''}`
          : pageId
            ? `Page ID: ${pageId}`
            : 'its original page';
        alert(`✅ Successfully restored Embed: ${localId}\n\nThe Embed has been moved back to active storage and is now available on ${pageInfo}.`);
        // Remove from list after successful restore
        setDeletedItems(prev => prev.filter(item => item.localId !== localId));
      } else {
        setError(`Failed to restore ${localId}: ${response.error}`);
      }
    } catch (err) {
      setError(`Error restoring ${localId}: ${err.message}`);
      logger.errors('Error restoring item:', err, { localId });
    } finally {
      setRestoring(prev => ({ ...prev, [localId]: false }));
    }
  };

  /**
   * Delete orphaned Embeds by page ID
   */
  const handleDeleteOrphanedEmbeds = async () => {
    if (!deletePageIds.trim()) {
      setDeleteResult({ success: false, error: 'Please enter at least one page ID' });
      return;
    }

    setDeleting(true);
    setDeleteResult(null);

    try {
      // Split by comma and trim whitespace
      const pageIds = deletePageIds.split(',').map(id => id.trim()).filter(Boolean);

      const response = await invoke('deleteOrphanedEmbedsByPage', { pageIds });
      setDeleteResult(response);

      if (response.success) {
        setDeletePageIds(''); // Clear input on success
      }
    } catch (err) {
      setDeleteResult({ success: false, error: err.message });
      logger.errors('Error deleting orphaned Embeds:', err);
    } finally {
      setDeleting(false);
    }
  };

  /**
   * Load version history for a specific Embed localId
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
        logger.errors('Response not successful:', response.error);
        setVersionError(response.error || 'Failed to load version history');
      }
    } catch (err) {
      logger.errors('Error loading versions:', err, { localId: versionLocalId });
      setVersionError(err.message);
    } finally {
      setLoadingVersions(false);
    }
  };

  /**
   * Load full details for a specific version
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
      logger.errors('Error loading version details:', err, { versionId });
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
        logger.errors('Error restoring version:', err, { versionId });
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

  /**
   * Filter items by search term
   */
  const filteredItems = deletedItems.filter(item => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      item.localId?.toLowerCase().includes(search) ||
      item.deletionReason?.toLowerCase().includes(search) ||
      item.pageTitle?.toLowerCase().includes(search)
    );
  });

  return (
    <ModalTransition>
      {isOpen && (
        <Modal onClose={onClose} width="xlarge">
          <ModalHeader>
            <ModalTitle>🚨 Emergency Recovery</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <Tabs key={`${initialTab}-${autoLoadEmbedUuid || 'none'}`} selected={activeTab} onChange={setActiveTab}>
              <TabList>
                <Tab value="deleted-embeds">Deleted Embeds</Tab>
                <Tab value="version-history">Version History</Tab>
              </TabList>

              <TabPanel value="deleted-embeds">
                <Stack space="space.200">
                  {/* Info message */}
              <SectionMessage appearance="information">
                <Text>
                  This tool displays Embeds that were soft-deleted by Check All Embeds or other cleanup operations.
                  You can search for specific items and restore them if they were removed by mistake.
                </Text>
              </SectionMessage>

              {/* Error message */}
              {error && (
                <SectionMessage appearance="error">
                  <Text><Strong>Error:</Strong> {error}</Text>
                </SectionMessage>
              )}

              {/* Search field */}
              <StableTextfield
                stableKey="emergency-recovery-search"
                placeholder="Search by localId, page title, or deletion reason..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                width="full"
              />

              {/* Loading state */}
              {loading && (
                <Text>Loading deleted items...</Text>
              )}

              {/* Empty state - no deleted items */}
              {!loading && deletedItems.length === 0 && (
                <SectionMessage appearance="success">
                  <Stack space="space.050">
                    <Text><Strong>✅ No deleted items found!</Strong></Text>
                    <Text>All Embeds are active. Nothing has been soft-deleted recently.</Text>
                  </Stack>
                </SectionMessage>
              )}

              {/* Empty state - no matches */}
              {!loading && deletedItems.length > 0 && filteredItems.length === 0 && (
                <Text>No deleted items match your search.</Text>
              )}

              {/* List of deleted items */}
              {!loading && filteredItems.length > 0 && (
                <Box xcss={scrollableListStyle}>
                  <Stack space="space.150">
                    <Text>
                      <Strong>Found {filteredItems.length} deleted item{filteredItems.length !== 1 ? 's' : ''}</Strong>
                      {filteredItems.length !== deletedItems.length && ` (filtered from ${deletedItems.length} total)`}
                    </Text>

                    {filteredItems.map((item) => (
                      <Box key={item.localId} xcss={deletedItemStyle}>
                        <Stack space="space.100">
                          <Inline space="space.100" alignBlock="center" spread="space-between">
                            <Inline space="space.100" alignBlock="center">
                              <Text><Strong>localId:</Strong></Text>
                              <Text>{item.localId}</Text>
                              {item.canRecover && (
                                <Lozenge appearance="success">Recoverable</Lozenge>
                              )}
                            </Inline>

                            <Button
                              appearance="primary"
                              onClick={() => handleRestore(item)}
                              isDisabled={restoring[item.localId]}
                            >
                              {restoring[item.localId] ? 'Restoring...' : '↺ Restore'}
                            </Button>
                          </Inline>

                          {/* Deletion info */}
                          <Stack space="space.050">
                            <Text>
                              <Strong>Deleted:</Strong> {formatTimestamp(item.deletedAt)}
                            </Text>
                            <Text>
                              <Strong>Reason:</Strong> {item.deletionReason}
                            </Text>
                            {item.pageTitle && (
                              <Text>
                                <Strong>Page:</Strong> {item.pageTitle}
                                {item.pageId && ` (${item.pageId})`}
                              </Text>
                            )}
                            {item.excerptId && (
                              <Text>
                                <Strong>Referenced Source:</Strong> {item.excerptId}
                              </Text>
                            )}
                          </Stack>

                          {/* Preview of stored data (collapsed by default) */}
                          {item.data && (
                            <Stack space="space.050">
                              <Button
                                appearance="subtle"
                                onClick={() => setExpandedItems(prev => ({
                                  ...prev,
                                  [item.localId]: !prev[item.localId]
                                }))}
                              >
                                {expandedItems[item.localId] ? '▼' : '▶'} View stored data
                              </Button>
                              {expandedItems[item.localId] && (
                                <Box xcss={jsonPreviewStyle}>
                                  <Text>{JSON.stringify(item.data, null, 2)}</Text>
                                </Box>
                              )}
                            </Stack>
                          )}
                        </Stack>
                      </Box>
                    ))}
                  </Stack>
                </Box>
              )}

              {/* Delete Orphaned Embeds Section */}
              <Box xcss={xcss({
                marginTop: 'space.300',
                paddingTop: 'space.300',
                borderTopColor: 'color.border',
                borderTopStyle: 'solid',
                borderTopWidth: 'border.width'
              })}>
                <Stack space="space.200">
                  <Text><Strong>Delete Orphaned Embeds (Permanent)</Strong></Text>
                  <SectionMessage appearance="warning">
                    <Text>
                      Permanently delete Embeds by page ID. Enter numeric page IDs (e.g., 12345678) separated by commas. This is useful for cleaning up test data or truly broken Embeds with invalid Source references. This action cannot be undone (unless you have CSV log backups).
                    </Text>
                  </SectionMessage>

                  <StableTextfield
                    stableKey="emergency-recovery-delete-page-ids"
                    placeholder="Enter page IDs (comma-separated, e.g., 12345678, 87654321)"
                    value={deletePageIds}
                    onChange={(e) => setDeletePageIds(e.target.value)}
                    width="full"
                  />

                  <Button
                    appearance="danger"
                    onClick={handleDeleteOrphanedEmbeds}
                    isDisabled={deleting || !deletePageIds.trim()}
                  >
                    {deleting ? 'Deleting...' : 'Delete Orphaned Embeds'}
                  </Button>

                  {deleteResult && deleteResult.success && (
                    <SectionMessage appearance="success">
                      <Stack space="space.050">
                        <Text><Strong>{deleteResult.summary}</Strong></Text>
                        {deleteResult.deleted && deleteResult.deleted.length > 0 && (
                          <Text>Deleted: {deleteResult.deleted.map(item => item.localId).join(', ')}</Text>
                        )}
                        {deleteResult.notFound && deleteResult.notFound.length > 0 && (
                          <Text>Not found: {deleteResult.notFound.join(', ')}</Text>
                        )}
                      </Stack>
                    </SectionMessage>
                  )}

                  {deleteResult && !deleteResult.success && (
                    <SectionMessage appearance="error">
                      <Text><Strong>Error:</Strong> {deleteResult.error}</Text>
                    </SectionMessage>
                  )}
                </Stack>
              </Box>
                </Stack>
              </TabPanel>

              <TabPanel value="version-history">
                <Stack space="space.200">
                  {/* Info message */}
                  <SectionMessage appearance="information">
                    <Text>
                      <Strong>Version History</Strong> - Look up any Embed by its UUID (localId) to view and restore previous versions.
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
                        stableKey="emergency-recovery-version-uuid"
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
                      Find the UUID in the Admin page under "All Embeds" or in an Embed's settings.
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
              </TabPanel>
            </Tabs>
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
