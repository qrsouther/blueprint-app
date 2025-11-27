/**
 * CompositorModal Component
 *
 * Main modal for the page-level Blueprint Compositor.
 * Provides interface for selecting an archetype and toggling chapters.
 *
 * Features:
 * - Archetype selection (one per page)
 * - Chapter toggles (enable/disable sections)
 * - Bulk publish all enabled chapters
 * - Visual indication of publish status
 *
 * @module CompositorModal
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
  Lozenge,
  Box,
  xcss
} from '@forge/react';
import { invoke } from '@forge/bridge';

import { ArchetypeSelector } from './ArchetypeSelector';
import { ChapterList } from './ChapterList';

// Styles
const modalContentStyle = xcss({
  minHeight: '400px'
});

const publishStatusStyle = xcss({
  paddingTop: 'space.100',
  paddingBottom: 'space.100',
  borderTopWidth: 'border.width',
  borderTopStyle: 'solid',
  borderTopColor: 'color.border'
});

/**
 * CompositorModal Component
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether modal is open
 * @param {Function} props.onClose - Handler for closing modal
 * @param {string} props.pageId - Confluence page ID
 * @returns {JSX.Element}
 */
export function CompositorModal({ isOpen, onClose, pageId }) {
  // State
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [archetypes, setArchetypes] = useState([]);
  const [config, setConfig] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  // Load data when modal opens
  useEffect(() => {
    if (isOpen && pageId) {
      loadData();
    }
  }, [isOpen, pageId]);

  // Load archetypes and current config
  const loadData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Fetch archetypes and config in parallel
      const [archetypesResult, configResult] = await Promise.all([
        invoke('getArchetypes', {}),
        invoke('getCompositorConfig', { pageId })
      ]);

      if (!archetypesResult.success) {
        throw new Error(archetypesResult.error || 'Failed to load archetypes');
      }

      setArchetypes(archetypesResult.data);

      if (configResult.success) {
        setConfig(configResult.data);

        // If archetype is selected, load chapters
        if (configResult.data.archetypeId) {
          const chaptersResult = await invoke('getArchetypeChapters', {
            archetypeId: configResult.data.archetypeId
          });
          if (chaptersResult.success) {
            setChapters(chaptersResult.data);
          }
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle archetype selection
  const handleArchetypeSelect = async (archetypeId) => {
    setIsSaving(true);
    setPublishResult(null);

    try {
      // Initialize page with selected archetype
      const result = await invoke('initializePageWithArchetype', {
        pageId,
        archetypeId,
        createPlaceholders: false
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      setConfig(result.data);
      setChapters(result.chapters);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle chapter toggle
  const handleChapterToggle = async (chapterId, enabled) => {
    setIsSaving(true);
    setPublishResult(null);

    try {
      const result = await invoke('toggleChapter', {
        pageId,
        chapterId,
        enabled
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      setConfig(result.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle bulk publish
  const handlePublishAll = async () => {
    setIsPublishing(true);
    setPublishResult(null);

    try {
      const result = await invoke('bulkPublishChapters', { pageId });

      if (!result.success) {
        throw new Error(result.error);
      }

      setPublishResult(result);
    } catch (err) {
      setError(err.message);
      setPublishResult({ success: false, error: err.message });
    } finally {
      setIsPublishing(false);
    }
  };

  // Count enabled chapters
  const enabledCount = chapters.filter(ch => 
    config?.chapterStates?.[ch.id]?.enabled
  ).length;

  // Get selected archetype name
  const selectedArchetype = archetypes.find(a => a.id === config?.archetypeId);

  return (
    <ModalTransition>
      {isOpen && (
        <Modal onClose={onClose} width="large">
          <ModalHeader>
            <ModalTitle>
              <Inline space="space.100" alignBlock="center">
                <Text>📘</Text>
                <Text>Blueprint Compositor</Text>
              </Inline>
            </ModalTitle>
          </ModalHeader>

          <ModalBody>
            <Box xcss={modalContentStyle}>
              {isLoading ? (
                <Stack space="space.200" alignInline="center">
                  <Spinner size="large" />
                  <Text>Loading compositor configuration...</Text>
                </Stack>
              ) : error ? (
                <SectionMessage appearance="error" title="Error">
                  <Text>{error}</Text>
                  <Button appearance="link" onClick={loadData}>
                    Retry
                  </Button>
                </SectionMessage>
              ) : (
                <Stack space="space.300">
                  {/* Archetype Selection */}
                  <Stack space="space.100">
                    <Heading size="small">Page Archetype</Heading>
                    <ArchetypeSelector
                      archetypes={archetypes}
                      selectedId={config?.archetypeId}
                      onSelect={handleArchetypeSelect}
                      isDisabled={isSaving}
                    />
                  </Stack>

                  {/* Chapter List (only show if archetype selected) */}
                  {config?.archetypeId && chapters.length > 0 && (
                    <Stack space="space.100">
                      <Inline space="space.200" alignBlock="center" spread="space-between">
                        <Heading size="small">Chapters</Heading>
                        <Lozenge appearance="inprogress">
                          {enabledCount} of {chapters.length} enabled
                        </Lozenge>
                      </Inline>
                      <ChapterList
                        chapters={chapters}
                        chapterStates={config?.chapterStates || {}}
                        onToggle={handleChapterToggle}
                        isDisabled={isSaving || isPublishing}
                      />
                    </Stack>
                  )}

                  {/* Publish Status */}
                  {publishResult && (
                    <Box xcss={publishStatusStyle}>
                      {publishResult.publishedCount > 0 ? (
                        <SectionMessage appearance="success" title="Published Successfully">
                          <Text>
                            Published {publishResult.publishedCount} chapter(s) to the page.
                            Refresh the page to see the updated content.
                          </Text>
                        </SectionMessage>
                      ) : publishResult.error ? (
                        <SectionMessage appearance="error" title="Publish Failed">
                          <Text>{publishResult.error}</Text>
                        </SectionMessage>
                      ) : (
                        <SectionMessage appearance="warning" title="Nothing to Publish">
                          <Text>No chapters are enabled. Enable at least one chapter to publish.</Text>
                        </SectionMessage>
                      )}
                    </Box>
                  )}
                </Stack>
              )}
            </Box>
          </ModalBody>

          <ModalFooter>
            <ButtonGroup>
              <Button appearance="subtle" onClick={onClose}>
                Close
              </Button>
              {config?.archetypeId && enabledCount > 0 && (
                <Button
                  appearance="primary"
                  onClick={handlePublishAll}
                  isDisabled={isPublishing || isSaving}
                >
                  {isPublishing ? (
                    <Fragment>
                      <Spinner size="small" />
                      <Text> Publishing...</Text>
                    </Fragment>
                  ) : (
                    `Publish ${enabledCount} Chapter${enabledCount > 1 ? 's' : ''}`
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

