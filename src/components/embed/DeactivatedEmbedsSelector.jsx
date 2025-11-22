/**
 * DeactivatedEmbedsSelector Component
 *
 * Allows users to restore data from deactivated Embeds when creating a new Embed.
 * Shows a banner that opens a modal with:
 * - The most recent deactivated Embed (initially shown)
 * - A search box to find other deactivated Embeds
 * - Results showing "Source name + LastUpdatedAt datetime"
 *
 * @param {Object} props
 * @param {string} props.localId - Current Embed's localId
 * @param {string} props.pageId - Current page ID
 * @param {Array} props.deactivatedEmbeds - List of deactivated Embed objects
 * @param {Function} props.onSelect - Callback when user selects a deactivated Embed (sourceLocalId)
 * @param {Function} props.onDismiss - Callback when user dismisses the selector
 * @param {boolean} props.isRestoring - Whether a restore operation is in progress
 * @returns {JSX.Element} - Selector component JSX
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  Text,
  Button,
  Stack,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Textfield,
  Box,
  xcss
} from '@forge/react';
import { invoke } from '@forge/bridge';

export function DeactivatedEmbedsSelector({ localId, pageId, deactivatedEmbeds, onSelect, onDismiss, isRestoring = false }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [restoringLocalId, setRestoringLocalId] = useState(null); // Track which embed is being restored
  const [wasRestoring, setWasRestoring] = useState(false); // Track previous restore state

  // Reset restoring state when restore finishes
  // Note: Modal will auto-close on success because parent hides the selector component
  // On error, modal stays open so user can try again
  useEffect(() => {
    if (wasRestoring && !isRestoring) {
      // Restore just completed - reset restoring state
      // If successful, parent will hide selector (unmounting this component)
      // If error, modal stays open for user to retry
      setRestoringLocalId(null);
    }
    setWasRestoring(isRestoring);
  }, [isRestoring, wasRestoring]);

  // Get the most recent deactivated Embed (first in sorted list)
  const mostRecentEmbed = deactivatedEmbeds.length > 0 ? deactivatedEmbeds[0] : null;

  // Filter deactivated Embeds by search query (case-insensitive partial match on excerptName)
  const filteredEmbeds = useMemo(() => {
    if (!searchQuery.trim()) {
      // If no search query, return all (but we'll only show the most recent initially)
      return deactivatedEmbeds;
    }

    const query = searchQuery.toLowerCase().trim();
    return deactivatedEmbeds.filter(embed => {
      const excerptName = (embed.excerptName || 'Unknown Source').toLowerCase();
      return excerptName.includes(query);
    });
  }, [deactivatedEmbeds, searchQuery]);

  // Format datetime for display
  const formatDateTime = (isoString) => {
    if (!isoString) return 'Unknown date';
    try {
      const date = new Date(isoString);
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      return 'Invalid date';
    }
  };

  const handleSelect = async (sourceLocalId) => {
    // Don't allow multiple simultaneous restores
    if (isRestoring) {
      return;
    }

    // Set restoring state before calling onSelect
    setRestoringLocalId(sourceLocalId);
    // Call onSelect - parent will handle the restore operation
    // Modal will auto-close when isRestoring becomes false (handled by useEffect)
    onSelect(sourceLocalId);
  };

  const handleDismiss = () => {
    // Only allow dismiss if not restoring
    if (!isRestoring) {
      setIsModalOpen(false);
      setSearchQuery(''); // Reset search
      setRestoringLocalId(null);
      onDismiss();
    }
  };

  // Don't render if no deactivated Embeds
  if (!deactivatedEmbeds || deactivatedEmbeds.length === 0) {
    return null;
  }

  return (
    <>
      {/* Banner/Button - Non-blocking */}
      <Box xcss={xcss({ padding: 'space.100', marginBottom: 'space.100' })}>
        <Button
          appearance="subtle"
          onClick={() => setIsModalOpen(true)}>
            ♻️ Restore data from a deactivated Embed?
        </Button>
      </Box>

      {/* Modal */}
      {isModalOpen && (
        <Modal onClose={isRestoring ? undefined : handleDismiss}>
          <ModalHeader>
            <Text weight="bold">Restore Data from Deactivated Embed</Text>
          </ModalHeader>
          <ModalBody>
            <Stack space="space.300">
              {/* Search Box */}
              <Textfield
                label="Search by Source name"
                placeholder="Type to search..."
                defaultValue={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />

              {/* Most Recent Embed (shown when no search query) */}
              {!searchQuery.trim() && mostRecentEmbed && (
                <Box xcss={xcss({ padding: 'space.200', backgroundColor: 'color.background.neutral.subtle', borderRadius: 'radius.200' })}>
                  <Stack space="space.100">
                    <Text weight="medium">Most Recent:</Text>
                    <Text>
                      {mostRecentEmbed.excerptName} - Last updated: {formatDateTime(mostRecentEmbed.lastUpdatedAt)}
                    </Text>
                    <Button
                      appearance="primary"
                      onClick={() => handleSelect(mostRecentEmbed.localId)}
                      isLoading={isRestoring && restoringLocalId === mostRecentEmbed.localId}
                      isDisabled={isRestoring}
                    >
                      {isRestoring && restoringLocalId === mostRecentEmbed.localId ? 'Restoring...' : 'Use this Embed'}
                    </Button>
                  </Stack>
                </Box>
              )}

              {/* Search Results */}
              {searchQuery.trim() && (
                <Stack space="space.200">
                  <Text weight="medium">
                    {filteredEmbeds.length > 0 
                      ? `Found ${filteredEmbeds.length} deactivated Embed(s):`
                      : 'No deactivated Embeds found'}
                  </Text>
                  {filteredEmbeds.length > 0 && (
                    <Stack space="space.100">
                      {filteredEmbeds.slice(0, 20).map((embed) => {
                        const isRestoringThis = isRestoring && restoringLocalId === embed.localId;
                        return (
                          <Box
                            key={embed.localId}
                            xcss={xcss({
                              padding: 'space.200',
                              border: '1px solid',
                              borderColor: 'color.border',
                              borderRadius: 'radius.200',
                              cursor: isRestoringThis ? 'default' : 'pointer',
                              opacity: isRestoringThis ? 0.6 : 1,
                              ':hover': isRestoringThis ? {} : {
                                backgroundColor: 'color.background.neutral.subtle'
                              }
                            })}
                            onClick={() => !isRestoringThis && handleSelect(embed.localId)}
                          >
                            <Stack space="space.050">
                              <Text weight="medium">{embed.excerptName}</Text>
                              <Text color="color.text.subtle">
                                Last updated: {formatDateTime(embed.lastUpdatedAt)}
                              </Text>
                              {isRestoringThis && (
                                <Text color="color.text.subtle">
                                  <Em>Restoring...</Em>
                                </Text>
                              )}
                            </Stack>
                          </Box>
                        );
                      })}
                      {filteredEmbeds.length > 20 && (
                        <Text color="color.text.subtle">
                          Showing first 20 results. Refine your search to see more.
                        </Text>
                      )}
                    </Stack>
                  )}
                </Stack>
              )}
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button 
              appearance="subtle" 
              onClick={handleDismiss}
              isDisabled={isRestoring}
            >
              Cancel
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </>
  );
}

