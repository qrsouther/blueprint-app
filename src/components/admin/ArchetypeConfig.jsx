/**
 * ArchetypeConfig Component
 *
 * Main panel (75% width) for configuring an Archetype.
 * Split into two subpanels:
 * - Left subpanel: DynamicTable showing all Sources with Actions
 * - Right subpanel: (Future - archetype-specific config)
 *
 * @param {Object} props
 * @param {string|null} props.selectedArchetypeId - Currently selected archetype ID
 * @returns {JSX.Element}
 */

import React, { useState, useEffect, memo, useCallback } from 'react';
import {
  Box,
  Text,
  Heading,
  DynamicTable,
  Button,
  ButtonGroup,
  Inline,
  Spinner,
  SectionMessage,
  Stack,
  Textfield,
  Toggle,
  Strong,
  Em,
  Modal,
  ModalTransition,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
  xcss
} from '@forge/react';
import { invoke } from '@forge/bridge';
import { logger } from '../../utils/logger.js';
import { StableTextfield } from '../common/StableTextfield.jsx';

// Wrap in React.memo to prevent re-renders from parent Admin page polling
export const ArchetypeConfig = memo(function ArchetypeConfig({ selectedArchetypeId, onArchetypeUpdated, onArchetypeDeleted, onArchetypeCopied }) {
  const [sources, setSources] = useState([]);
  const [isLoadingSources, setIsLoadingSources] = useState(true);
  const [archetype, setArchetype] = useState(null);
  const [isLoadingArchetype, setIsLoadingArchetype] = useState(false);
  const [error, setError] = useState(null);
  const [selectedSourceId, setSelectedSourceId] = useState(null);
  const [selectedSourceExcerpt, setSelectedSourceExcerpt] = useState(null);
  const [isLoadingExcerpt, setIsLoadingExcerpt] = useState(false);
  const [toggleDefaults, setToggleDefaults] = useState({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalToggleStates, setModalToggleStates] = useState({});

  // Load archetype and sources when component mounts or archetype changes
  useEffect(() => {
    if (selectedArchetypeId) {
      loadArchetype();
      loadSources();
    } else {
      setArchetype(null);
      setSources([]);
      setSelectedSourceId(null);
      setSelectedSourceExcerpt(null);
      setToggleDefaults({});
    }
  }, [selectedArchetypeId]);

  const loadArchetype = async () => {
    setIsLoadingArchetype(true);
    setError(null);
    try {
      const result = await invoke('getArchetype', { archetypeId: selectedArchetypeId });
      if (result.success) {
        setArchetype(result.data);
        // Initialize toggle defaults from archetype metadata
        if (result.data.sourceDefaults) {
          setToggleDefaults(result.data.sourceDefaults);
        }
      } else {
        setError(result.error || 'Failed to load archetype');
      }
    } catch (err) {
      logger.errors('Error loading archetype:', err);
      setError(err.message);
    } finally {
      setIsLoadingArchetype(false);
    }
  };

  const loadSources = async () => {
    setIsLoadingSources(true);
    setError(null);
    try {
      const result = await invoke('getAllExcerpts', {});
      if (result.success && result.data) {
        setSources(result.data.excerpts || []);
      } else {
        setError(result.error || 'Failed to load sources');
      }
    } catch (err) {
      logger.errors('Error loading sources:', err);
      setError(err.message);
    } finally {
      setIsLoadingSources(false);
    }
  };

  const handleOpenDefaultsModal = async (sourceId) => {
    // Open modal immediately for instant feedback
    setSelectedSourceId(sourceId);
    setSelectedSourceExcerpt(null);
    setIsLoadingExcerpt(true);
    setError(null);
    setIsModalOpen(true);

    try {
      const result = await invoke('getExcerpt', { excerptId: sourceId });
      if (result.success && result.data.excerpt) {
        setSelectedSourceExcerpt(result.data.excerpt);
        
        // Load existing toggle defaults for this source from archetype
        const sourceDefaults = archetype?.sourceDefaults?.[sourceId] || {};
        const existingToggleStates = sourceDefaults.toggleStates || {};
        
        // Set modal toggle states (local copy for editing)
        setModalToggleStates(existingToggleStates);
        
        // Also update the main toggleDefaults state
        setToggleDefaults(prev => ({
          ...prev,
          [sourceId]: {
            toggleStates: existingToggleStates
          }
        }));
      } else {
        setError(result.error || 'Failed to load source details');
      }
    } catch (err) {
      logger.errors('Error loading source excerpt:', err);
      setError(err.message);
    } finally {
      setIsLoadingExcerpt(false);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedSourceId(null);
    setSelectedSourceExcerpt(null);
    setModalToggleStates({});
  };

  const handleSaveModal = () => {
    if (!selectedSourceId) return;

    // Capture values before closing modal
    const sourceIdToSave = selectedSourceId;
    const toggleStatesToSave = { ...modalToggleStates };

    // Update local state immediately
    const newToggleDefaults = {
      ...toggleDefaults,
      [sourceIdToSave]: {
        toggleStates: toggleStatesToSave
      }
    };
    setToggleDefaults(newToggleDefaults);

    // Close modal immediately for instant feedback
    handleCloseModal();

    // Fire and forget: save to backend asynchronously
    invoke('updateArchetypeSourceDefaults', {
      archetypeId: selectedArchetypeId,
      sourceId: sourceIdToSave,
      toggleStates: toggleStatesToSave
    })
      .then((result) => {
        if (result.success) {
          setArchetype(result.data);
          if (onArchetypeUpdated) {
            onArchetypeUpdated(result.data);
          }
        } else {
          logger.errors('Failed to save toggle defaults:', result.error);
          // Optionally show a toast/notification here
        }
      })
      .catch((err) => {
        logger.errors('Error saving toggle defaults:', err);
        // Optionally show a toast/notification here
      });
  };

  const handleModalToggleChange = (toggleName, isChecked) => {
    setModalToggleStates(prev => ({
      ...prev,
      [toggleName]: isChecked
    }));
  };

  const handleRemoveFromArchetype = (sourceId) => {
    // TODO: Implement in next instructions
    logger.saves('Remove from archetype for source:', sourceId);
  };

  // Handle drag-and-drop reordering from DynamicTable
  const handleRankEnd = ({ sourceIndex, sourceKey, destination }) => {
    if (!destination || destination.index === undefined) {
      return; // No valid destination
    }

    // DynamicTable handles the visual reordering, we just need to update our state
    // destination.index is the target position in the ORIGINAL array
    let destinationIndex = destination.index;
    
    // If dragging down (sourceIndex < destinationIndex), adjust because
    // removing the source shifts all subsequent items down by 1
    if (sourceIndex < destinationIndex) {
      destinationIndex = destinationIndex - 1;
    }

    // Reorder sources array
    const newSources = [...sources];
    const [removed] = newSources.splice(sourceIndex, 1);
    newSources.splice(destinationIndex, 0, removed);

    // Update local state
    setSources(newSources);

    // TODO: Save the new order to the archetype (store sourceOrder array)
    logger.saves('Reordered sources:', {
      sourceId: sourceKey,
      fromIndex: sourceIndex,
      toIndex: destinationIndex
    });
  };

  // Local state for name editing - using onChange to track value
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameInitialValue, setEditNameInitialValue] = useState('');
  const [editNameValue, setEditNameValue] = useState('');

  // Start editing - capture current name as initial value and current value
  const handleStartEditName = useCallback(() => {
    const currentName = archetype?.name || '';
    setEditNameInitialValue(currentName);
    setEditNameValue(currentName);
    setIsEditingName(true);
  }, [archetype?.name]);

  // Cancel editing
  const handleCancelEditName = useCallback(() => {
    setIsEditingName(false);
  }, []);

  // Track input changes - StableTextfield is memoized so this won't cause re-renders
  const handleNameChange = useCallback((e) => {
    setEditNameValue(e.target.value);
  }, []);

  // Save name - use tracked value, fire and forget
  const handleSaveName = useCallback(() => {
    if (!selectedArchetypeId || !editNameValue.trim()) {
      return;
    }

    const trimmedName = editNameValue.trim();
    setIsEditingName(false);

    // Fire and forget: save to backend asynchronously
    invoke('updateArchetype', {
      archetypeId: selectedArchetypeId,
      name: trimmedName
    })
      .then((result) => {
        if (result.success) {
          setArchetype(result.data);
          if (onArchetypeUpdated) {
            onArchetypeUpdated(result.data);
          }
        } else {
          logger.errors('Failed to update archetype name:', result.error);
        }
      })
      .catch((err) => {
        logger.errors('Error updating archetype name:', err);
      });
  }, [selectedArchetypeId, editNameValue, onArchetypeUpdated]);

  const handleCopyArchetype = async () => {
    if (!selectedArchetypeId || !archetype) {
      return;
    }

    try {
      const result = await invoke('copyArchetype', {
        archetypeId: selectedArchetypeId
      });

      if (result.success) {
        // Notify parent to refresh list and select the new archetype
        if (onArchetypeCopied) {
          onArchetypeCopied(result.data);
        }
        logger.saves('Archetype copied:', result.data.id);
      } else {
        setError(result.error || 'Failed to copy archetype');
      }
    } catch (err) {
      logger.errors('Error copying archetype:', err);
      setError(err.message);
    }
  };

  const handleDeleteArchetype = async () => {
    if (!selectedArchetypeId || !window.confirm(`Are you sure you want to delete "${archetype?.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const result = await invoke('deleteArchetype', {
        archetypeId: selectedArchetypeId
      });

      if (result.success) {
        if (onArchetypeDeleted) {
          onArchetypeDeleted(selectedArchetypeId);
        }
        setArchetype(null);
      } else {
        setError(result.error || 'Failed to delete archetype');
      }
    } catch (err) {
      logger.errors('Error deleting archetype:', err);
      setError(err.message);
    }
  };

  // Build DynamicTable rows
  const tableRows = sources.map((source) => ({
    key: source.id,
    cells: [
      {
        key: 'source',
        content: (
          <Text weight="medium">{source.name || 'Unnamed Source'}</Text>
        )
      },
      {
        key: 'actions',
        content: (
          <Box xcss={xcss({
            display: 'flex',
            justifyContent: 'space-between',
            width: '100%'
          })}>
            <Inline space="space.100">
              <Button
                iconBefore="theme"
                appearance="primary"
                onClick={() => handleOpenDefaultsModal(source.id)}
              >
                Defaults
              </Button>
              <Button
                iconBefore="trash"
                appearance="danger"
                onClick={() => handleRemoveFromArchetype(source.id)}
              >
                Remove
              </Button>
            </Inline>
          </Box>
        )
      }
    ]
  }));

  if (!selectedArchetypeId) {
    return (
      <Box xcss={xcss({
        width: '100%',
        padding: 'space.100',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '50em'
      })}>
        <Text color="color.text.subtle">
          Select an archetype from the list to configure it.
        </Text>
      </Box>
    );
  }

  return (
    <Box xcss={xcss({
      width: '100%',
      padding: 'space.100',
      display: 'flex',
      flexDirection: 'column',
      minHeight: '50em'
    })}>
      <Stack space="space.300">
        {/* Archetype Name with Edit Toggle and Delete Button */}
        <Inline space="space.200" alignBlock="center" spread="space-between">
          <Box xcss={xcss({ flex: 1, minWidth: 0 })}>
            {isLoadingArchetype ? (
              <Spinner size="small" />
            ) : archetype ? (
              isEditingName ? (
                <Inline space="space.100" alignBlock="center">
                  <StableTextfield
                    key={`archetype-name-input-${selectedArchetypeId}`}
                    stableKey={`archetype-name-${selectedArchetypeId}`}
                    value={editNameInitialValue}
                    onChange={handleNameChange}
                    placeholder="Enter archetype name..."
                    autoFocus
                  />
                  <Button appearance="primary" onClick={handleSaveName}>
                    Save
                  </Button>
                  <Button appearance="subtle" onClick={handleCancelEditName}>
                    Cancel
                  </Button>
                </Inline>
              ) : (
                <Inline space="space.100" alignBlock="center">
                  <Heading size="medium">{archetype.name || 'Unnamed Archetype'}</Heading>
                  <Button appearance="subtle" iconBefore="edit" onClick={handleStartEditName}>
                    Edit
                  </Button>
                </Inline>
              )
            ) : (
              <Heading size="medium">Archetype Configuration</Heading>
            )}
          </Box>
          {archetype && (
            <ButtonGroup>
              <Button
                appearance="default"
                onClick={handleCopyArchetype}
              >
                Copy Archetype
              </Button>
              <Button
                appearance="danger"
                onClick={handleDeleteArchetype}
              >
                Delete Archetype
              </Button>
            </ButtonGroup>
          )}
        </Inline>

        {/* Error Message */}
        {error && (
          <SectionMessage appearance="error">
            <Text>{error}</Text>
          </SectionMessage>
        )}

        {/* Sources DynamicTable - Full Width */}
        <Stack 
          space="space.200"
          spread="space-between"
        >
          {isLoadingSources ? (
            <Stack space="space.200" alignInline="center">
              <Spinner size="medium" />
              <Text>Loading sources...</Text>
            </Stack>
          ) : sources.length === 0 ? (
            <Text color="color.text.subtle">No sources found.</Text>
          ) : (
            <DynamicTable
              isRankable
              onRankEnd={handleRankEnd}
              rows={tableRows}
            />
          )}
        </Stack>
      </Stack>

      {/* Toggle Defaults Modal */}
      <ModalTransition>
        {isModalOpen && (
          <Modal onClose={handleCloseModal} width="medium">
            <ModalHeader>
              <ModalTitle>
                Configure Toggle Defaults
                {(selectedSourceExcerpt?.name || sources.find(s => s.id === selectedSourceId)?.name) && (
                  <Text color="color.text.subtle" size="small">
                    {' '}for {selectedSourceExcerpt?.name || sources.find(s => s.id === selectedSourceId)?.name}
                  </Text>
                )}
              </ModalTitle>
            </ModalHeader>

            <ModalBody>
              {isLoadingExcerpt ? (
                <Stack space="space.200" alignInline="center">
                  <Spinner size="medium" />
                  <Text>Loading source details...</Text>
                </Stack>
              ) : !selectedSourceExcerpt ? (
                <Text color="color.text.subtle">
                  Failed to load source details.
                </Text>
              ) : !selectedSourceExcerpt.toggles || selectedSourceExcerpt.toggles.length === 0 ? (
                <Text color="color.text.subtle" as="em">
                  No toggles defined for this source.
                </Text>
              ) : (
                <Box xcss={xcss({
                  width: '100%',
                  backgroundColor: 'color.background.neutral',
                  paddingBlockStart: 'space.200',
                  paddingBlockEnd: 'space.100',
                  paddingInline: 'space.100'
                })}>
                  <DynamicTable
                    head={{
                      cells: [
                        {
                          key: 'toggle',
                          content: '',
                          width: 5
                        },
                        {
                          key: 'name',
                          content: 'Toggle',
                          width: 30
                        },
                        {
                          key: 'description',
                          content: 'Description',
                          width: 65
                        }
                      ]
                    }}
                    rows={selectedSourceExcerpt.toggles.map(toggle => {
                      const currentToggleState = modalToggleStates[toggle.name] || false;

                      return {
                        key: toggle.name,
                        cells: [
                          {
                            key: 'toggle',
                            content: (
                              <Toggle
                                isChecked={currentToggleState}
                                onChange={(e) => {
                                  handleModalToggleChange(toggle.name, e.target.checked);
                                }}
                              />
                            )
                          },
                          {
                            key: 'name',
                            content: <Text><Strong>{toggle.name}</Strong></Text>
                          },
                          {
                            key: 'description',
                            content: toggle.description ? (
                              <Text><Em>{toggle.description}</Em></Text>
                            ) : (
                              <Text color="color.text.subtle">—</Text>
                            )
                          }
                        ]
                      };
                    })}
                  />
                </Box>
              )}
            </ModalBody>

            <ModalFooter>
              <ButtonGroup>
                <Button
                  appearance="default"
                  onClick={handleCloseModal}
                >
                  Cancel
                </Button>
                <Button
                  appearance="primary"
                  onClick={handleSaveModal}
                  isDisabled={isLoadingExcerpt || !selectedSourceExcerpt}
                >
                  Save
                </Button>
              </ButtonGroup>
            </ModalFooter>
          </Modal>
        )}
      </ModalTransition>
    </Box>
  );
});
