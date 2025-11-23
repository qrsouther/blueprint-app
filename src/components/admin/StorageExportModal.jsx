/**
 * Storage Export Modal Component
 *
 * Provides UI for exporting all storage data from production to a JSON file.
 * Allows downloading the complete storage state for import into development.
 *
 * Features:
 * - Export all storage data to JSON
 * - Progress indicator during export
 * - Download button for JSON file
 * - Export summary (key counts, total size)
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
  ProgressBar,
  xcss
} from '@forge/react';
import { invoke } from '@forge/bridge';
import { logger } from '../../utils/logger.js';

const summaryBoxStyle = xcss({
  padding: 'space.200',
  backgroundColor: 'color.background.neutral.subtle',
  borderRadius: 'border.radius',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderColor: 'color.border'
});

export function StorageExportModal({ isOpen, onClose }) {
  const [exporting, setExporting] = useState(false);
  const [exportData, setExportData] = useState(null);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);
  const [progressStatus, setProgressStatus] = useState('');
  const [progressId, setProgressId] = useState(null);
  const [pollingInterval, setPollingInterval] = useState(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    setExportData(null);
    setProgress(0);
    setProgressStatus('Starting export...');
    setProgressId(null);

    try {
      // Step 1: Start the export job (async worker)
      const startResponse = await invoke('startStorageExport', {});

      if (!startResponse || !startResponse.success) {
        setError(startResponse?.error || 'Failed to start export job');
        return;
      }

      const { progressId: newProgressId, exportId } = startResponse;
      setProgressId(newProgressId);
      setProgressStatus('Export job queued...');

      // Step 2: Poll for progress
      const pollProgress = async () => {
        try {
          const progressResponse = await invoke('getExportProgress', {
            progressId: newProgressId
          });

          if (!progressResponse || !progressResponse.success) {
            setError(progressResponse?.error || 'Failed to get export progress');
            return;
          }

          const { progress: progressData } = progressResponse;

          // Update UI with progress
          setProgress(progressData.percent || 0);
          setProgressStatus(progressData.status || 'Processing...');

          // Check if complete
          if (progressData.phase === 'complete' && progressData.results) {
            // Clear polling
            if (pollingInterval) {
              clearInterval(pollingInterval);
              setPollingInterval(null);
            }

            // Fetch the actual export data
            await fetchExportData(progressData.results.exportKey, progressData.results);
          } else if (progressData.phase === 'error') {
            // Clear polling
            if (pollingInterval) {
              clearInterval(pollingInterval);
              setPollingInterval(null);
            }
            setError(progressData.error || 'Export failed');
            setExporting(false);
          }
        } catch (pollError) {
          logger.errors('[StorageExport] Error polling progress:', pollError);
          // Continue polling on error (might be transient)
        }
      };

      // Start polling every 500ms
      const interval = setInterval(pollProgress, 500);
      setPollingInterval(interval);

      // Poll immediately
      await pollProgress();

    } catch (err) {
      const errorMsg = err?.message || String(err) || 'Failed to start export';
      setError(errorMsg);
      logger.errors('[StorageExport] Error:', err);
      setExporting(false);
    }
  };

  const fetchExportData = async (exportKey, exportResults) => {
    try {
      setProgressStatus('Fetching export data...');

      // Get export metadata to determine if chunked
      const metadataResponse = await invoke('getExportMetadata', {
        exportKey
      });

      if (!metadataResponse || !metadataResponse.success) {
        setError(metadataResponse?.error || 'Failed to get export metadata');
        return;
      }

      // Fetch all chunks and assemble
      const chunks = [];
      
      for (let i = 0; i < metadataResponse.totalChunks; i++) {
        const chunkResponse = await invoke('getExportChunk', {
          exportKey,
          chunkIndex: i
        });

        if (!chunkResponse || !chunkResponse.success) {
          setError(`Failed to fetch chunk ${i}: ${chunkResponse?.error || 'Unknown error'}`);
          return;
        }

        chunks.push(chunkResponse.data);
        
        // Update progress
        const chunkProgress = 95 + Math.floor((i + 1) / metadataResponse.totalChunks * 5);
        setProgress(chunkProgress);
        setProgressStatus(`Fetching chunks... ${i + 1}/${metadataResponse.totalChunks}`);
      }

      setProgress(100);

      // Assemble full JSON string
      const fullJsonString = chunks.join('');
      
      // Combine export metadata with the actual JSON data
      setExportData({
        ...exportResults,
        data: fullJsonString
      });

      setExporting(false);
    } catch (err) {
      setError(`Failed to fetch export data: ${err.message}`);
      logger.errors('[StorageExport] Error fetching export data:', err);
      setExporting(false);
    }
  };

  const handleDownload = () => {
    if (!exportData || !exportData.data) {
      return;
    }

    // Create blob and download
    const blob = new Blob([exportData.data], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `blueprint-storage-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <ModalTransition>
      {isOpen && (
        <Modal onClose={onClose} width="large">
          <ModalHeader>
            <ModalTitle>Export Production Data</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <Stack space="space.300">
              <SectionMessage appearance="info" title="Export All Storage Data">
                <Text>
                  This will export <Strong>all</Strong> storage data from the current environment
                  (production) to a JSON file. The export includes excerpts, includes, usage data,
                  categories, cache, backups, versions, and any other stored data.
                </Text>
                <Text>
                  Use this export file to import data into your development environment for testing.
                </Text>
              </SectionMessage>

              {!exportData && !exporting && (
                <Box>
                  <Button
                    appearance="primary"
                    onClick={handleExport}
                  >
                    Start Export
                  </Button>
                </Box>
              )}

              {exporting && (
                <Stack space="space.200">
                  <Text weight="medium">Exporting storage data...</Text>
                  <ProgressBar value={progress} />
                  <Text size="small" color="color.text.subtlest">
                    {progressStatus || 'Processing...'}
                  </Text>
                  <Text size="small" color="color.text.subtlest">
                    This may take a moment for large datasets. The export runs in the background with up to 15 minutes timeout.
                  </Text>
                </Stack>
              )}

              {error && (
                <SectionMessage appearance="error" title="Export Failed">
                  <Text>{error}</Text>
                </SectionMessage>
              )}

              {exportData && exportData.success && (
                <Stack space="space.300">
                  <SectionMessage appearance="success" title="Export Complete">
                    <Text>
                      Successfully exported {exportData.totalKeys} storage keys
                      ({formatBytes(exportData.jsonSize)}) in {exportData.elapsed}ms.
                    </Text>
                  </SectionMessage>

                  <Box xcss={summaryBoxStyle}>
                    <Stack space="space.200">
                      <Text weight="medium">Export Summary</Text>
                      <Stack space="space.100">
                        {exportData.summary && (
                          <>
                            <Text size="small">
                              Excerpts: {exportData.summary.excerpts || 0}
                            </Text>
                            <Text size="small">
                              Includes: {exportData.summary.includes || 0}
                            </Text>
                            <Text size="small">
                              Embed Configs: {exportData.summary.macroVars || 0}
                            </Text>
                            <Text size="small">
                              Usage Data: {exportData.summary.usage || 0}
                            </Text>
                            <Text size="small">
                              Cache: {exportData.summary.cache || 0}
                            </Text>
                            <Text size="small">
                              Backups: {exportData.summary.backups || 0}
                            </Text>
                            <Text size="small">
                              Versions: {exportData.summary.versions || 0}
                            </Text>
                            <Text size="small">
                              Deleted: {exportData.summary.deleted || 0}
                            </Text>
                            <Text size="small">
                              Categories: {exportData.summary.categories || 0}
                            </Text>
                            <Text size="small">
                              Metadata: {exportData.summary.metadata || 0}
                            </Text>
                            <Text size="small">
                              Other: {exportData.summary.other || 0}
                            </Text>
                          </>
                        )}
                      </Stack>
                    </Stack>
                  </Box>

                  <Button
                    appearance="primary"
                    onClick={handleDownload}
                  >
                    Download JSON File
                  </Button>
                </Stack>
              )}
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button onClick={onClose}>
              {exportData ? 'Close' : 'Cancel'}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </ModalTransition>
  );
}

