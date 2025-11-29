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

import React, { useState, useEffect } from 'react';
import {
  Box,
  Text,
  Heading,
  DynamicTable,
  Button,
  Inline,
  Spinner,
  SectionMessage,
  Stack,
  InlineEdit,
  Textfield,
  xcss
} from '@forge/react';
import { invoke } from '@forge/bridge';
import { logger } from '../../utils/logger.js';
import { StableTextfield } from '../common/StableTextfield.jsx';

export function ArchetypeConfig({ selectedArchetypeId, onArchetypeUpdated, onArchetypeDeleted }) {
  const [sources, setSources] = useState([]);
  const [isLoadingSources, setIsLoadingSources] = useState(true);
  const [archetype, setArchetype] = useState(null);
  const [isLoadingArchetype, setIsLoadingArchetype] = useState(false);
  const [error, setError] = useState(null);

  // Load archetype and sources when component mounts or archetype changes
  useEffect(() => {
    if (selectedArchetypeId) {
      loadArchetype();
      loadSources();
    } else {
      setArchetype(null);
      setSources([]);
    }
  }, [selectedArchetypeId]);

  const loadArchetype = async () => {
    setIsLoadingArchetype(true);
    setError(null);
    try {
      const result = await invoke('getArchetype', { archetypeId: selectedArchetypeId });
      if (result.success) {
        setArchetype(result.data);
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

  const handleSetEmbedDefaults = (sourceId) => {
    // TODO: Implement in next instructions
    logger.saves('Set Embed defaults for source:', sourceId);
  };

  const handleRemoveFromArchetype = (sourceId) => {
    // TODO: Implement in next instructions
    logger.saves('Remove from archetype for source:', sourceId);
  };

  const handleUpdateName = async (newName) => {
    if (!selectedArchetypeId || !newName || !newName.trim()) {
      return;
    }

    try {
      const result = await invoke('updateArchetype', {
        archetypeId: selectedArchetypeId,
        name: newName.trim()
      });

      if (result.success) {
        setArchetype(result.data);
        if (onArchetypeUpdated) {
          onArchetypeUpdated(result.data);
        }
      } else {
        setError(result.error || 'Failed to update archetype name');
      }
    } catch (err) {
      logger.errors('Error updating archetype name:', err);
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
          <Inline space="space.100">
            <Button
              appearance="default"
              onClick={() => handleSetEmbedDefaults(source.id)}
            >
              Set Embed defaults
            </Button>
            <Button
              appearance="subtle"
              onClick={() => handleRemoveFromArchetype(source.id)}
            >
              Remove from Archetype
            </Button>
          </Inline>
        )
      }
    ]
  }));

  if (!selectedArchetypeId) {
    return (
      <Box xcss={xcss({
        width: '75%',
        padding: 'space.300',
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
      width: '75%',
      padding: 'space.300',
      display: 'flex',
      flexDirection: 'column',
      minHeight: '50em'
    })}>
      <Stack space="space.300">
        {/* Archetype Name with InlineEdit and Delete Button */}
        <Inline space="space.200" alignBlock="center" spread="space-between">
          <Box xcss={xcss({ flex: 1, minWidth: 0 })}>
            {isLoadingArchetype ? (
              <Spinner size="small" />
            ) : archetype ? (
              <InlineEdit
                defaultValue={archetype.name || ''}
                editView={({ errorMessage, ...fieldProps }) => (
                  <StableTextfield
                    {...fieldProps}
                    autoFocus
                    placeholder="Enter archetype name..."
                  />
                )}
                readView={() => (
                  <Heading size="medium">{archetype.name || 'Unnamed Archetype'}</Heading>
                )}
                onConfirm={handleUpdateName}
              />
            ) : (
              <Heading size="medium">Archetype Configuration</Heading>
            )}
          </Box>
          {archetype && (
            <Button
              appearance="danger"
              onClick={handleDeleteArchetype}
            >
              Delete Archetype
            </Button>
          )}
        </Inline>

        {/* Error Message */}
        {error && (
          <SectionMessage appearance="error">
            <Text>{error}</Text>
          </SectionMessage>
        )}

        {/* Split into two subpanels */}
        <Inline
          space="space.200"
          alignBlock="start"
          shouldWrap={false}
          xcss={xcss({
            width: '100%',
            alignItems: 'flex-start'
          })}
        >
          {/* Left Subpanel - Sources DynamicTable */}
          <Box xcss={xcss({
            width: '50%',
            flexShrink: 0
          })}>
            <Stack space="space.200">
              <Heading size="small">Sources</Heading>
              
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
                  defaultSortKey='source'
                  defaultSortDirection='desc'
                  head={{
                    cells: [
                      {
                        key: 'source',
                        content: 'Source',
                        width: 50
                      },
                      {
                        key: 'actions',
                        content: 'Actions',
                        width: 50
                      }
                    ]
                  }}
                  rows={tableRows}
                />
              )}
            </Stack>
          </Box>

          {/* Right Subpanel - Future config panel */}
          <Box xcss={xcss({
            width: '50%',
            flexShrink: 0
          })}>
            <Stack space="space.200">
              <Heading size="small">Configuration</Heading>
              <Text color="color.text.subtle">
                Additional configuration options will be available here.
              </Text>
            </Stack>
          </Box>
        </Inline>
      </Stack>
    </Box>
  );
}

