/**
 * DeployArchetypeModal Component
 *
 * Modal for deploying an Archetype to a Confluence page.
 * Inserts Blueprint Embed macros for each Source in the archetype's
 * sourceOrder, with toggle defaults from sourceDefaults.
 *
 * Features:
 * - Archetype selection dropdown
 * - Preview of Sources that will be deployed
 * - Detection of existing Blueprint macros on the page
 * - Options: Apply defaults only vs Replace all content
 * - Progress indicator during deployment
 *
 * @module DeployArchetypeModal
 */

import React, { useState, useEffect, Fragment } from 'react';
import {
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalTransition,
  Button,
  ButtonGroup,
  Stack,
  Inline,
  Text,
  Heading,
  Spinner,
  SectionMessage,
  Select,
  Box,
  ProgressBar,
  RadioGroup,
  xcss
} from '@forge/react';
import { invoke } from '@forge/bridge';
import { logger } from '../../utils/logger.js';

// Styles
const modalContentStyle = xcss({
  minHeight: '300px'
});

const sourceListStyle = xcss({
  maxHeight: '200px',
  overflowY: 'auto',
  padding: 'space.100',
  backgroundColor: 'color.background.neutral',
  borderRadius: 'border.radius'
});

const sourceItemStyle = xcss({
  padding: 'space.050',
  borderBottomWidth: 'border.width',
  borderBottomStyle: 'solid',
  borderBottomColor: 'color.border'
});

/**
 * DeployArchetypeModal Component
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether modal is open
 * @param {Function} props.onClose - Handler for closing modal
 * @param {Function} props.onDeployComplete - Handler when deployment completes
 * @param {string} props.pageId - Confluence page ID
 * @returns {JSX.Element}
 */
export function DeployArchetypeModal({ isOpen, onClose, onDeployComplete, pageId }) {
  // State
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [archetypes, setArchetypes] = useState([]);
  const [selectedArchetypeId, setSelectedArchetypeId] = useState(null);
  const [selectedArchetype, setSelectedArchetype] = useState(null);
  const [sources, setSources] = useState([]);
  const [existingMacros, setExistingMacros] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [deployMode, setDeployMode] = useState('full'); // 'full' or 'toggles_only'
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployProgress, setDeployProgress] = useState(0);
  const [deployResult, setDeployResult] = useState(null);

  // Load archetypes when modal opens
  useEffect(() => {
    if (isOpen && pageId) {
      loadArchetypes();
      scanForExistingMacros();
    }
  }, [isOpen, pageId]);

  // Load full archetype when selection changes
  useEffect(() => {
    if (selectedArchetypeId) {
      loadArchetypeDetails(selectedArchetypeId);
    } else {
      setSelectedArchetype(null);
      setSources([]);
    }
  }, [selectedArchetypeId]);

  // Load archetypes list
  const loadArchetypes = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await invoke('getArchetypes', {});
      if (result.success) {
        setArchetypes(result.data || []);
      } else {
        setError(result.error || 'Failed to load archetypes');
      }
    } catch (err) {
      logger.errors('Error loading archetypes:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Scan page for existing Blueprint macros
  const scanForExistingMacros = async () => {
    setIsScanning(true);
    try {
      const result = await invoke('scanPageForMacros', { pageId });
      if (result.success) {
        setExistingMacros(result.data?.macros || []);
      }
    } catch (err) {
      logger.errors('Error scanning for macros:', err);
      // Non-fatal - continue without existing macro info
    } finally {
      setIsScanning(false);
    }
  };

  // Load archetype details including sources
  const loadArchetypeDetails = async (archetypeId) => {
    try {
      const result = await invoke('getArchetype', { archetypeId });
      if (result.success && result.data) {
        setSelectedArchetype(result.data);
        
        // Load source names for the sourceOrder
        if (result.data.sourceOrder && result.data.sourceOrder.length > 0) {
          const sourcesResult = await invoke('getAllExcerpts', {});
          if (sourcesResult.success && sourcesResult.data?.excerpts) {
            const allSources = sourcesResult.data.excerpts;
            const orderedSources = result.data.sourceOrder
              .map(id => allSources.find(s => s.id === id))
              .filter(Boolean);
            setSources(orderedSources);
          }
        } else {
          setSources([]);
        }
      }
    } catch (err) {
      logger.errors('Error loading archetype details:', err);
      setError(err.message);
    }
  };

  // Handle archetype selection
  // Forge Select passes the option object { label, value }, not an event
  const handleArchetypeChange = (option) => {
    const archetypeId = option?.value || null;
    setSelectedArchetypeId(archetypeId);
    setDeployResult(null);
  };

  // Handle deploy
  const handleDeploy = async () => {
    if (!selectedArchetypeId || !pageId) return;

    setIsDeploying(true);
    setDeployProgress(0.1);
    setError(null);
    setDeployResult(null);

    try {
      const result = await invoke('deployArchetype', {
        pageId,
        archetypeId: selectedArchetypeId,
        mode: deployMode
      });

      setDeployProgress(1);

      if (result.success) {
        setDeployResult({
          success: true,
          message: `Successfully deployed ${result.data?.deployedCount || sources.length} Embed(s) to the page.`,
          deployedCount: result.data?.deployedCount
        });
        
        // Auto-close after short delay
        setTimeout(() => {
          if (onDeployComplete) {
            onDeployComplete();
          }
        }, 2000);
      } else {
        setError(result.error || 'Deployment failed');
        setDeployResult({ success: false, error: result.error });
      }
    } catch (err) {
      logger.errors('Error deploying archetype:', err);
      setError(err.message);
      setDeployResult({ success: false, error: err.message });
    } finally {
      setIsDeploying(false);
    }
  };

  // Build archetype options for Select
  const archetypeOptions = archetypes.map(a => ({
    label: a.name || 'Unnamed Archetype',
    value: a.id
  }));

  // Check if page has existing content
  const hasExistingMacros = existingMacros.length > 0;

  return (
    <ModalTransition>
      {isOpen && (
        <Modal onClose={onClose} width="large">
          <ModalHeader>
            <ModalTitle>
              <Inline space="space.100" alignBlock="center">
                <Text>Deploy Blueprint</Text>
              </Inline>
            </ModalTitle>
          </ModalHeader>

          <ModalBody>
            <Box xcss={modalContentStyle}>
              {isLoading ? (
                <Stack space="space.200" alignInline="center">
                  <Spinner size="large" />
                  <Text>Loading archetypes...</Text>
                </Stack>
              ) : error && !deployResult ? (
                <SectionMessage appearance="error" title="Error">
                  <Text>{error}</Text>
                  <Button appearance="link" onClick={loadArchetypes}>
                    Retry
                  </Button>
                </SectionMessage>
              ) : (
                <Stack space="space.300">
                  {/* Archetype Selection */}
                  <Stack space="space.100">
                    <Heading size="small">Select Archetype</Heading>
                    <Select
                      options={archetypeOptions}
                      value={selectedArchetypeId ? archetypeOptions.find(o => o.value === selectedArchetypeId) : null}
                      onChange={handleArchetypeChange}
                      placeholder="Select an archetype..."
                      isDisabled={isDeploying}
                    />
                  </Stack>

                  {/* Source Preview */}
                  {selectedArchetype && sources.length > 0 && (
                    <Stack space="space.100">
                      <Inline space="space.100" alignBlock="center">
                        <Heading size="small">Sources to Deploy</Heading>
                        <Text color="color.text.subtle">({sources.length})</Text>
                      </Inline>
                      <Box xcss={sourceListStyle}>
                        <Stack space="space.0">
                          {sources.map((source, index) => (
                            <Box key={source.id} xcss={sourceItemStyle}>
                              <Inline space="space.100" alignBlock="center">
                                <Text color="color.text.subtle">{index + 1}.</Text>
                                <Text>{source.name || 'Unnamed Source'}</Text>
                              </Inline>
                            </Box>
                          ))}
                        </Stack>
                      </Box>
                    </Stack>
                  )}

                  {/* No sources warning */}
                  {selectedArchetype && sources.length === 0 && (
                    <SectionMessage appearance="warning" title="No Sources Configured">
                      <Text>
                        This archetype has no sources in its source order. 
                        Configure sources in the Admin Archetypes tab first.
                      </Text>
                    </SectionMessage>
                  )}

                  {/* Existing macros warning */}
                  {hasExistingMacros && selectedArchetype && sources.length > 0 && (
                    <Stack space="space.100">
                      <SectionMessage appearance="warning" title="Page Has Existing Embeds">
                        <Text>
                          This page already has {existingMacros.length} Blueprint Embed(s).
                          Choose how to proceed:
                        </Text>
                      </SectionMessage>
                      <RadioGroup
                        name="deploy-mode"
                        value={deployMode}
                        onChange={(e) => setDeployMode(e.target.value)}
                        isDisabled={isDeploying}
                        options={[
                          {
                            label: 'Apply toggle defaults only (keep existing Embeds)',
                            value: 'toggles_only'
                          },
                          {
                            label: 'Replace all content (remove existing, deploy fresh)',
                            value: 'full'
                          }
                        ]}
                      />
                    </Stack>
                  )}

                  {/* Deployment Progress */}
                  {isDeploying && (
                    <Stack space="space.100">
                      <Text>Deploying {sources.length} Embed(s)...</Text>
                      <ProgressBar value={deployProgress} />
                    </Stack>
                  )}

                  {/* Deployment Result */}
                  {deployResult && (
                    <SectionMessage 
                      appearance={deployResult.success ? 'success' : 'error'} 
                      title={deployResult.success ? 'Deployment Complete' : 'Deployment Failed'}
                    >
                      <Text>
                        {deployResult.success 
                          ? deployResult.message 
                          : deployResult.error}
                      </Text>
                      {deployResult.success && (
                        <Text color="color.text.subtle">
                          Refresh the page to see the deployed Embeds.
                        </Text>
                      )}
                    </SectionMessage>
                  )}
                </Stack>
              )}
            </Box>
          </ModalBody>

          <ModalFooter>
            <ButtonGroup>
              <Button appearance="subtle" onClick={onClose} isDisabled={isDeploying}>
                {deployResult?.success ? 'Close' : 'Cancel'}
              </Button>
              {selectedArchetype && sources.length > 0 && !deployResult?.success && (
                <Button
                  appearance="primary"
                  onClick={handleDeploy}
                  isDisabled={isDeploying || isLoading}
                >
                  {isDeploying ? (
                    <Fragment>
                      <Spinner size="small" />
                      <Text> Deploying...</Text>
                    </Fragment>
                  ) : (
                    `Deploy ${sources.length} Embed${sources.length > 1 ? 's' : ''}`
                  )}
                </Button>
              )}
            </ButtonGroup>
          </ModalFooter>
        </Modal>
      )}
    </ModalTransition>
  );
}

