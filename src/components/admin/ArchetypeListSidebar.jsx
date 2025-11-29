/**
 * ArchetypeListSidebar Component
 *
 * Displays the left sidebar (25% width) with a list of Archetypes.
 * Includes TextField + Add button at the top for creating new archetypes.
 * Uses Stack component to list archetypes below.
 *
 * @param {Object} props
 * @param {string|null} props.selectedArchetypeId - Currently selected archetype ID
 * @param {Function} props.setSelectedArchetypeId - Callback to update selected archetype
 * @returns {JSX.Element}
 */

import React, { useState, useEffect } from 'react';
import {
  Text,
  Box,
  Stack,
  Inline,
  Textfield,
  Button,
  Pressable,
  Spinner,
  SectionMessage,
  xcss
} from '@forge/react';
import { invoke } from '@forge/bridge';
import { logger } from '../../utils/logger.js';
import { StableTextfield } from '../common/StableTextfield.jsx';
import { scrollableListStyle } from '../../styles/admin-styles.js';

// Pressable item styling for archetype list items
const archetypeItemStyle = (isSelected) => xcss({
  padding: 'space.100',
  textAlign: 'left',
  borderRadius: 'border.radius',
  backgroundColor: isSelected ? 'color.background.selected' : 'color.background.neutral.subtle',
  ':hover': {
    backgroundColor: 'color.background.neutral.hovered'
  }
});

export function ArchetypeListSidebar({
  selectedArchetypeId,
  setSelectedArchetypeId
}) {
  const [archetypes, setArchetypes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newArchetypeName, setNewArchetypeName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Load archetypes on mount
  useEffect(() => {
    loadArchetypes();
  }, []);

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

  const handleCreateArchetype = async () => {
    if (!newArchetypeName.trim()) {
      return;
    }

    setIsCreating(true);
    try {
      const result = await invoke('createArchetype', {
        name: newArchetypeName.trim()
      });

      if (result.success) {
        // Add new archetype to list
        setArchetypes(prev => [...prev, result.data]);
        // Select the newly created archetype
        setSelectedArchetypeId(result.data.id);
        // Clear input
        setNewArchetypeName('');
      } else {
        setError(result.error || 'Failed to create archetype');
      }
    } catch (err) {
      logger.errors('Error creating archetype:', err);
      setError(err.message);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Box xcss={xcss({
      width: '20%',
      maxWidth: '20%',
      minWidth: '20%',
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      height: '50em',
      overflow: 'scroll',
      paddingInlineEnd: 'space.200',
      padding: 'space.200',
      borderRightWidth: 'border.width',
      borderRightStyle: 'solid',
      borderRightColor: 'color.border',
      boxSizing: 'border-box'
    })}>
      <Box xcss={xcss({ flexShrink: 0 })}>
        <Stack space="space.200">
          {/* Create New Archetype */}
          <Stack space="space.100">
            <Inline space="space.100" alignBlock="center" shouldWrap={false} xcss={xcss({ width: '100%', minWidth: 0 })}>
              <Box xcss={xcss({ flex: 1, minWidth: 0, maxWidth: '100%' })}>
                <StableTextfield
                  placeholder="New archetype"
                  value={newArchetypeName}
                  onChange={(e) => setNewArchetypeName(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !isCreating) {
                      handleCreateArchetype();
                    }
                  }}
                  isDisabled={isCreating}
                />
              </Box>
              <Button
                appearance="primary"
                onClick={handleCreateArchetype}
                isDisabled={!newArchetypeName.trim() || isCreating}
                xcss={xcss({ flexShrink: 0 })}
              >
                Add
              </Button>
            </Inline>
          </Stack>

          {/* Error Message */}
          {error && (
            <SectionMessage appearance="error">
              <Text>{error}</Text>
            </SectionMessage>
          )}
        </Stack>
      </Box>

      {/* Archetype List */}
      <Box xcss={scrollableListStyle}>
        {isLoading ? (
          <Stack space="space.200" alignInline="center">
            <Spinner size="medium" />
            <Text>Loading archetypes...</Text>
          </Stack>
        ) : archetypes.length === 0 ? (
          <Text color="color.text.subtle">No archetypes yet. Create one above.</Text>
        ) : (
          <Stack space="space.050">
            {archetypes.map((archetype) => (
              <Pressable
                key={archetype.id}
                onClick={() => setSelectedArchetypeId(archetype.id)}
                xcss={archetypeItemStyle(selectedArchetypeId === archetype.id)}
              >
                <Text weight={selectedArchetypeId === archetype.id ? 'semibold' : 'regular'}>
                  {archetype.name}
                </Text>
              </Pressable>
            ))}
          </Stack>
        )}
      </Box>
    </Box>
  );
}

