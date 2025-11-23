/**
 * Storage Import Modal Component
 *
 * Provides UI for importing storage data from a JSON export file.
 * Overwrites all existing storage data in the current environment (development).
 *
 * Features:
 * - File upload for JSON export file
 * - Preview of data to be imported (key counts, data types)
 * - Progress indicator during import
 * - Import summary (imported/failed counts)
 * - Warning about data overwrite
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether modal is open
 * @param {Function} props.onClose - Handler to close modal
 * @returns {JSX.Element}
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
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

export function StorageImportModal({ isOpen, onClose }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [progressId, setProgressId] = useState(null);
  const [pollingInterval, setPollingInterval] = useState(null);
  const fileInputRef = useRef(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  const handleFileSelect = useCallback(async (event) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) {
      return;
    }

    setFile(selectedFile);
    setError(null);
    setPreview(null);
    setImportResult(null);

    // Read and preview file
    try {
      const text = await selectedFile.text();
      const jsonData = JSON.parse(text);

      // Validate basic structure
      if (!jsonData.exportVersion || !jsonData.data || jsonData.totalKeys === undefined) {
        setError('Invalid export file format. Missing required fields.');
        return;
      }

      setPreview({
        exportVersion: jsonData.exportVersion,
        exportedAt: jsonData.exportedAt,
        totalKeys: jsonData.totalKeys,
        summary: jsonData.summary || {}
      });
    } catch (err) {
      setError(`Failed to read file: ${err.message}`);
      logger.errors('[StorageImport] File read error:', err);
    }
  }, []);

  // Create file input element directly in DOM to avoid Forge React component issues
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    // Create input and append to document.body (not a Forge component)
    if (!fileInputRef.current) {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.style.display = 'none';
      input.id = 'storage-import-file-input';
      input.addEventListener('change', handleFileSelect);
      document.body.appendChild(input);
      fileInputRef.current = input;
    }

    return () => {
      // Cleanup on unmount
      if (fileInputRef.current) {
        if (fileInputRef.current.parentNode) {
          fileInputRef.current.removeEventListener('change', handleFileSelect);
          fileInputRef.current.parentNode.removeChild(fileInputRef.current);
        }
        fileInputRef.current = null;
      }
    };
  }, [isOpen, handleFileSelect]);

  const handleImport = async () => {
    if (!file || !preview) {
      return;
    }

    // Confirm destructive operation
    const confirmed = confirm(
      '⚠️  WARNING: This will OVERWRITE ALL existing storage data in this environment.\n\n' +
      `This will import ${preview.totalKeys} keys from the export file.\n\n` +
      'Are you absolutely sure you want to proceed?'
    );

    if (!confirmed) {
      return;
    }

    setImporting(true);
    setError(null);
    setImportResult(null);
    setProgress(0);
    setStatusMessage('');

    try {
      // Read file content
      const text = await file.text();
      const jsonLength = text.length;
      const jsonSize = new Blob([text]).size;

      // Chunk size: 120,000 characters per chunk (same as export)
      const CHUNK_SIZE_CHARS = 120000;
      const needsChunking = jsonLength > CHUNK_SIZE_CHARS;

      // Step 1: Initialize import storage
      setProgress(5);
      setStatusMessage('Preparing import data...');
      const chunks = [];
      if (needsChunking) {
        // Split into chunks
        for (let i = 0; i < jsonLength; i += CHUNK_SIZE_CHARS) {
          chunks.push(text.slice(i, i + CHUNK_SIZE_CHARS));
        }
      } else {
        chunks.push(text);
      }

      const initResponse = await invoke('initImportStorage', {
        totalChunks: chunks.length,
        totalSize: jsonSize
      });

      if (!initResponse.success) {
        setError(initResponse.error || 'Failed to initialize import storage');
        return;
      }

      const importKey = initResponse.importKey;

      // Step 2: Store chunks one at a time
      setProgress(10);
      setStatusMessage(`Storing ${chunks.length} chunk${chunks.length > 1 ? 's' : ''}...`);
      for (let i = 0; i < chunks.length; i++) {
        const chunkResponse = await invoke('storeImportChunk', {
          importKey: importKey,
          chunkIndex: i,
          chunkData: chunks[i]
        });

        if (!chunkResponse.success) {
          setError(`Failed to store chunk ${i}: ${chunkResponse.error}`);
          return;
        }

        // Update progress (10% to 40% for chunk storage)
        const chunkProgress = 10 + Math.floor((i + 1) / chunks.length * 30);
        setProgress(chunkProgress);
        setStatusMessage(`Stored chunk ${i + 1} of ${chunks.length}...`);
      }

      // Step 3: Start import job (async worker)
      setProgress(40);
      setStatusMessage('Starting import job...');
      
      const startResponse = await invoke('startStorageImport', {
        importKey: importKey
      });

      if (!startResponse || !startResponse.success) {
        setError(startResponse?.error || 'Failed to start import job');
        return;
      }

      const { progressId: newProgressId } = startResponse;
      setProgressId(newProgressId);
      setStatusMessage('Import job queued...');

      // Step 4: Poll for progress
      const pollProgress = async () => {
        try {
          const progressResponse = await invoke('getImportProgress', {
            progressId: newProgressId
          });

          if (!progressResponse || !progressResponse.success) {
            setError(progressResponse?.error || 'Failed to get import progress');
            return;
          }

          const { progress: progressData } = progressResponse;

          // Update UI with progress
          setProgress(progressData.percent || 0);
          setStatusMessage(progressData.status || 'Processing...');

          // Check if complete
          if (progressData.phase === 'complete' && progressData.results) {
            // Clear polling
            if (pollingInterval) {
              clearInterval(pollingInterval);
              setPollingInterval(null);
            }

            setImportResult(progressData.results);
            setProgress(100);
            setStatusMessage('Import complete!');
            setImporting(false);
          } else if (progressData.phase === 'error') {
            // Clear polling
            if (pollingInterval) {
              clearInterval(pollingInterval);
              setPollingInterval(null);
            }
            setError(progressData.error || 'Import failed');
            setImporting(false);
          }
        } catch (pollError) {
          logger.errors('[StorageImport] Error polling progress:', pollError);
          // Continue polling on error (might be transient)
        }
      };

      // Start polling every 500ms
      const interval = setInterval(pollProgress, 500);
      setPollingInterval(interval);

      // Poll immediately
      await pollProgress();
    } catch (err) {
      const errorMsg = err?.message || String(err) || 'Failed to import storage data';
      setError(errorMsg);
      logger.errors('[StorageImport] Error:', err);
      
      // Clear polling on error
      if (pollingInterval) {
        clearInterval(pollingInterval);
        setPollingInterval(null);
      }
      setImporting(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setPreview(null);
    setImportResult(null);
    setError(null);
    setProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <ModalTransition>
      {isOpen && (
        <Modal onClose={onClose} width="large">
          <ModalHeader>
            <ModalTitle>Import Production Data</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <Stack space="space.300">
              <SectionMessage appearance="warning" title="⚠️ Destructive Operation">
                <Text>
                  This will <Strong>overwrite ALL</Strong> existing storage data in this environment
                  (development) with data from the import file.
                </Text>
                <Text>
                  All current excerpts, includes, usage data, and other storage will be replaced.
                </Text>
              </SectionMessage>

              {!preview && !importing && !importResult && (
                <Stack space="space.200">
                  <Text weight="medium">Select Export File</Text>
                  <Button
                    appearance="default"
                    onClick={() => {
                      // Create input if it doesn't exist yet
                      if (!fileInputRef.current) {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = '.json';
                        input.style.display = 'none';
                        input.id = 'storage-import-file-input';
                        input.addEventListener('change', handleFileSelect);
                        document.body.appendChild(input);
                        fileInputRef.current = input;
                      }
                      
                      if (fileInputRef.current) {
                        fileInputRef.current.click();
                      } else {
                        logger.errors('[StorageImport] File input not available');
                        setError('File input not ready. Please try again.');
                      }
                    }}
                  >
                    Choose JSON File
                  </Button>
                  {file && (
                    <Text size="small" color="color.text.subtlest">
                      Selected: {file.name} ({(file.size / 1024).toFixed(2)} KB)
                    </Text>
                  )}
                </Stack>
              )}

              {error && (
                <SectionMessage appearance="error" title="Error">
                  <Text>{error}</Text>
                </SectionMessage>
              )}

              {preview && !importing && !importResult && (
                <Stack space="space.300">
                  <SectionMessage appearance="info" title="Import Preview">
                    <Text>
                      Ready to import {preview.totalKeys} storage keys from export file.
                    </Text>
                    {preview.exportedAt && (
                      <Text size="small">
                        Exported at: {new Date(preview.exportedAt).toLocaleString()}
                      </Text>
                    )}
                  </SectionMessage>

                  <Box xcss={summaryBoxStyle}>
                    <Stack space="space.200">
                      <Text weight="medium">Data Summary</Text>
                      <Stack space="space.100">
                        <Text size="small">
                          Excerpts: {preview.summary.excerpts || 0}
                        </Text>
                        <Text size="small">
                          Includes: {preview.summary.includes || 0}
                        </Text>
                        <Text size="small">
                          Embed Configs: {preview.summary.macroVars || 0}
                        </Text>
                        <Text size="small">
                          Usage Data: {preview.summary.usage || 0}
                        </Text>
                        <Text size="small">
                          Cache: {preview.summary.cache || 0}
                        </Text>
                        <Text size="small">
                          Backups: {preview.summary.backups || 0}
                        </Text>
                        <Text size="small">
                          Versions: {preview.summary.versions || 0}
                        </Text>
                        <Text size="small">
                          Deleted: {preview.summary.deleted || 0}
                        </Text>
                        <Text size="small">
                          Categories: {preview.summary.categories || 0}
                        </Text>
                        <Text size="small">
                          Metadata: {preview.summary.metadata || 0}
                        </Text>
                        <Text size="small">
                          Other: {preview.summary.other || 0}
                        </Text>
                      </Stack>
                    </Stack>
                  </Box>

                  <Inline space="space.100">
                    <Button
                      appearance="primary"
                      onClick={handleImport}
                    >
                      Import Data
                    </Button>
                    <Button
                      appearance="subtle"
                      onClick={handleReset}
                    >
                      Choose Different File
                    </Button>
                  </Inline>
                </Stack>
              )}

              {importing && (
                <Stack space="space.200">
                  <Text weight="medium">Importing storage data...</Text>
                  <ProgressBar value={progress} />
                  {statusMessage && (
                    <Text size="small" color="color.text.subtlest">
                      {statusMessage}
                    </Text>
                  )}
                  <Text size="small" color="color.text.subtlest">
                    Progress: {Math.round(progress)}%
                  </Text>
                  <Text size="small" color="color.text.subtlest">
                    The import runs in the background with up to 15 minutes timeout.
                  </Text>
                </Stack>
              )}

              {importResult && (
                <Stack space="space.300">
                  <SectionMessage
                    appearance={importResult.success ? "success" : "warning"}
                    title={importResult.success ? "Import Complete" : "Import Completed with Errors"}
                  >
                    <Text>
                      Imported {importResult.imported} keys
                      {importResult.failed > 0 && `, ${importResult.failed} failed`}
                      {importResult.elapsed && ` in ${importResult.elapsed}ms`}.
                    </Text>
                    {importResult.validationErrors && importResult.validationErrors.length > 0 && (
                      <Text size="small">
                        {importResult.validationErrors.length} validation warnings (non-critical)
                      </Text>
                    )}
                  </SectionMessage>

                  {importResult.errors && importResult.errors.length > 0 && (
                    <Box xcss={summaryBoxStyle}>
                      <Stack space="space.200">
                        <Text weight="medium" color="color.text.danger">
                          Import Errors ({importResult.errors.length})
                        </Text>
                        <Stack space="space.050">
                          {importResult.errors.slice(0, 10).map((err, idx) => (
                            <Text key={idx} size="small">
                              {err.key}: {err.error}
                            </Text>
                          ))}
                          {importResult.errors.length > 10 && (
                            <Text size="small" color="color.text.subtlest">
                              ... and {importResult.errors.length - 10} more errors
                            </Text>
                          )}
                        </Stack>
                      </Stack>
                    </Box>
                  )}
                </Stack>
              )}
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Inline space="space.100">
              {importResult && (
                <Button
                  appearance="subtle"
                  onClick={handleReset}
                >
                  Import Another File
                </Button>
              )}
              <Button onClick={onClose}>
                {importResult ? 'Close' : 'Cancel'}
              </Button>
            </Inline>
          </ModalFooter>
        </Modal>
      )}
    </ModalTransition>
  );
}

