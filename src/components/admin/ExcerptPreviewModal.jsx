/**
 * ExcerptPreviewModal Component
 *
 * Modal dialog for editing Blueprint Standard Source metadata.
 * Uses the shared SourceMetadataTabs component with split view layout.
 *
 * Note: Content editing must be done in the Source macro on the page itself.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Text,
  Button,
  Box,
  Modal,
  ModalTransition,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
  Inline,
  SectionMessage,
  Icon,
  Code
} from '@forge/react';
import { invoke, router } from '@forge/bridge';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCategoriesQuery } from '../../hooks/admin-hooks';
import { extractTextFromAdf } from '../../utils/adf-utils';
import { SourceMetadataTabs } from '../common/SourceMetadataTabs';
import { logger } from '../../utils/logger.js';

// Custom hook for fetching excerpt data with React Query
const useExcerptQuery = (excerptId, enabled) => {
  return useQuery({
    queryKey: ['excerpt', excerptId],
    queryFn: async () => {
      const result = await invoke('getExcerpt', { excerptId });

      if (!result.success || !result.data || !result.data.excerpt) {
        throw new Error('Failed to load excerpt');
      }

      return result.data.excerpt;
    },
    enabled: enabled && !!excerptId,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
  });
};

// Custom hook for saving excerpt with React Query mutation
const useSaveExcerptMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ excerptName, category, bespoke, content, excerptId, variableMetadata, toggleMetadata, documentationLinks, sourcePageId, sourcePageTitle, sourceSpaceKey, sourceLocalId }) => {
      try {
        const result = await invoke('saveExcerpt', {
          excerptName,
          category,
          bespoke,
          content,
          excerptId,
          variableMetadata,
          toggleMetadata,
          documentationLinks,
          sourcePageId,
          sourcePageTitle,
          sourceSpaceKey,
          sourceLocalId
        });

        if (!result || !result.success) {
          throw new Error(result.error || 'Failed to save excerpt');
        }

        if (!result.data || !result.data.excerptId) {
          throw new Error('Failed to save excerpt - invalid response');
        }

        return result.data;
      } catch (error) {
        logger.errors('[REACT-QUERY-ADMIN-PREVIEW] Save error:', error);
        throw error;
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['excerpt', data.excerptId] });
      queryClient.invalidateQueries({ queryKey: ['excerpts', 'list'] });
    },
    onError: (error) => {
      logger.errors('[REACT-QUERY-ADMIN-PREVIEW] Save failed:', error);
    }
  });
};

export function ExcerptPreviewModal({
  showPreviewModal,
  setShowPreviewModal,
  excerpts,
  previewBoxStyle
}) {
  const excerptId = showPreviewModal;
  const queryClient = useQueryClient();

  // Use React Query to fetch excerpt data
  const {
    data: excerptData,
    isLoading: isLoadingExcerpt,
    error: excerptError
  } = useExcerptQuery(excerptId, !!excerptId);

  // Use React Query mutation for saving
  const {
    mutate: saveExcerptMutation,
    isPending: isSavingExcerpt
  } = useSaveExcerptMutation();

  // Fetch categories from storage
  const {
    data: categories = ['General', 'Pricing', 'Technical', 'Legal', 'Marketing'],
    isLoading: isLoadingCategories
  } = useCategoriesQuery();

  // State for controlled components
  const [excerptName, setExcerptName] = useState('');
  const [category, setCategory] = useState('General');
  const [editorContent, setEditorContent] = useState(null);
  const [detectedVariables, setDetectedVariables] = useState([]);
  const [variableMetadata, setVariableMetadata] = useState({});
  const [detectedToggles, setDetectedToggles] = useState([]);
  const [toggleMetadata, setToggleMetadata] = useState({});
  const [documentationLinks, setDocumentationLinks] = useState([]);
  const [bespoke, setBespoke] = useState(false);

  // Form state for adding new documentation links
  const [newLinkAnchor, setNewLinkAnchor] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [urlError, setUrlError] = useState('');

  // Track if we've loaded data to prevent infinite loops
  const hasLoadedDataRef = useRef(false);
  const lastExcerptIdRef = useRef(null);

  // Reset state when modal closes
  useEffect(() => {
    if (!showPreviewModal) {
      hasLoadedDataRef.current = false;
      lastExcerptIdRef.current = null;
      setExcerptName('');
      setCategory('General');
      setEditorContent(null);
      setVariableMetadata({});
      setToggleMetadata({});
      setDocumentationLinks([]);
      setBespoke(false);
      setNewLinkAnchor('');
      setNewLinkUrl('');
      setUrlError('');
    }
  }, [showPreviewModal]);

  // Extract text content from ADF for variable/toggle detection
  const contentForDetection = editorContent || excerptData?.content;
  const contentText = contentForDetection ? extractTextFromAdf(contentForDetection) : '';

  // Get initial data from excerpts list for immediate display
  const initialExcerpt = excerpts?.find(e => e.id === excerptId);

  // Load excerpt data from React Query
  useEffect(() => {
    if (lastExcerptIdRef.current !== excerptId) {
      hasLoadedDataRef.current = false;
      lastExcerptIdRef.current = excerptId;
      
      if (initialExcerpt) {
        setExcerptName(initialExcerpt.name || '');
        setCategory(initialExcerpt.category || 'General');
      }
    }

    if (!excerptId || !excerptData) {
      return;
    }

    if (!hasLoadedDataRef.current) {
      const nameToSet = excerptData.name !== undefined && excerptData.name !== null 
        ? String(excerptData.name).trim() 
        : (initialExcerpt?.name || '');
      setExcerptName(nameToSet);
      setCategory(excerptData.category || 'General');
      
      if (excerptData.content) {
        setEditorContent(excerptData.content);
      }

      if (excerptData.variables && Array.isArray(excerptData.variables)) {
        const metadata = {};
        excerptData.variables.forEach(v => {
          metadata[v.name] = {
            description: v.description || '',
            example: v.example || '',
            required: v.required || false
          };
        });
        setVariableMetadata(metadata);
      }

      if (excerptData.toggles && Array.isArray(excerptData.toggles)) {
        const metadata = {};
        excerptData.toggles.forEach(t => {
          metadata[t.name] = {
            description: t.description || ''
          };
        });
        setToggleMetadata(metadata);
      }

      if (excerptData.documentationLinks && Array.isArray(excerptData.documentationLinks)) {
        setDocumentationLinks(excerptData.documentationLinks);
      }

      if (excerptData.bespoke !== undefined) {
        setBespoke(excerptData.bespoke);
      }

      hasLoadedDataRef.current = true;
    }
  }, [excerptId, excerptData, initialExcerpt]);

  // Detect variables from content
  useEffect(() => {
    if (contentText) {
      const variableRegex = /\{\{([a-zA-Z][a-zA-Z0-9_]*)\}\}/g;
      const toggleRegex = /\{\{toggle:([a-zA-Z][a-zA-Z0-9_]*)\}\}/g;
      
      const excludedNames = new Set();
      let toggleMatch;
      while ((toggleMatch = toggleRegex.exec(contentText)) !== null) {
        excludedNames.add(toggleMatch[1]);
      }
      
      const variableMatches = new Set();
      let match;
      while ((match = variableRegex.exec(contentText)) !== null) {
        if (!excludedNames.has(match[1])) {
          variableMatches.add(match[1]);
        }
      }
      
      setDetectedVariables(Array.from(variableMatches).map(name => ({ name })));
    } else {
      setDetectedVariables([]);
    }
  }, [contentText]);

  // Detect toggles from content
  useEffect(() => {
    if (contentText) {
      const toggleRegex = /\{\{toggle:([a-zA-Z][a-zA-Z0-9_]*)\}\}/g;
      const toggleMatches = new Set();
      let match;
      while ((match = toggleRegex.exec(contentText)) !== null) {
        toggleMatches.add(match[1]);
      }
      setDetectedToggles(Array.from(toggleMatches).map(name => ({ name })));
    } else {
      setDetectedToggles([]);
    }
  }, [contentText]);

  // Build category options
  const categoryOptions = categories.map(cat => ({ label: cat, value: cat }));

  // Handle save
  const handleSave = () => {
    const variablesToSave = detectedVariables.map(v => ({
      name: v.name,
      description: variableMetadata[v.name]?.description || '',
      example: variableMetadata[v.name]?.example || '',
      required: variableMetadata[v.name]?.required || false
    }));

    const togglesToSave = detectedToggles.map(t => ({
      name: t.name,
      description: toggleMetadata[t.name]?.description || ''
    }));

    saveExcerptMutation({
      excerptName: excerptName.trim(),
      category,
      bespoke,
      content: contentForDetection,
      excerptId,
      variableMetadata: variablesToSave,
      toggleMetadata: togglesToSave,
      documentationLinks,
      sourcePageId: excerptData?.sourcePageId,
      sourcePageTitle: excerptData?.sourcePageTitle,
      sourceSpaceKey: excerptData?.sourceSpaceKey,
      sourceLocalId: excerptData?.sourceLocalId
    }, {
      onSuccess: () => {
        setShowPreviewModal(null);
      }
    });
  };

  if (!showPreviewModal) {
    return null;
  }

  const excerpt = excerpts.find(e => e.id === showPreviewModal);
  if (!excerpt) {
    return null;
  }

  return (
    <ModalTransition>
      <Modal width="x-large" onClose={() => setShowPreviewModal(null)}>
        <ModalHeader>
          <Inline space="space.100" alignBlock="center" spread="space-between">
            <ModalTitle>{excerpt.name || 'Blueprint Standard'}</ModalTitle>
            {excerptData?.sourcePageId && (
              <Button
                appearance="default"
                onClick={async () => {
                  try {
                    let url = `/wiki/pages/viewpage.action?pageId=${excerptData.sourcePageId}`;
                    if (excerptData.sourceLocalId) {
                      url += `#id-${excerptData.sourceLocalId}`;
                    }
                    await router.open(url);
                  } catch (err) {
                    logger.errors('Navigation error:', err);
                    alert('Error navigating to source page: ' + err.message);
                  }
                }}
                iconAfter={() => <Icon glyph="shortcut" label="Opens in new tab" />}
              >
                Edit Source
              </Button>
            )}
          </Inline>
        </ModalHeader>

        <ModalBody>
          {isLoadingExcerpt ? (
            <Text>Loading...</Text>
          ) : excerptError ? (
            <SectionMessage appearance="error">
              <Text>Error loading excerpt: {excerptError.message}</Text>
            </SectionMessage>
          ) : (
            <SourceMetadataTabs
              excerptName={excerptName}
              setExcerptName={setExcerptName}
              category={category}
              setCategory={setCategory}
              bespoke={bespoke}
              setBespoke={setBespoke}
              categoryOptions={categoryOptions}
              isLoading={isLoadingExcerpt}
              isLoadingCategories={isLoadingCategories}
              detectedVariables={detectedVariables}
              variableMetadata={variableMetadata}
              setVariableMetadata={setVariableMetadata}
              detectedToggles={detectedToggles}
              toggleMetadata={toggleMetadata}
              setToggleMetadata={setToggleMetadata}
              documentationLinks={documentationLinks}
              setDocumentationLinks={setDocumentationLinks}
              newLinkAnchor={newLinkAnchor}
              setNewLinkAnchor={setNewLinkAnchor}
              newLinkUrl={newLinkUrl}
              setNewLinkUrl={setNewLinkUrl}
              urlError={urlError}
              setUrlError={setUrlError}
              hasContent={!!contentForDetection}
              hasDetectedVariables={detectedVariables.length > 0 || !contentForDetection}
              hasDetectedToggles={detectedToggles.length > 0 || !contentForDetection}
              excerptId={excerptId}
              dataLoaded={hasLoadedDataRef.current}
              variant="modal"
              content={contentForDetection}
            />
          )}
        </ModalBody>

        <ModalFooter>
          <Inline space="space.200" alignBlock="center" spread="space-between">
            {excerptId && (
              <Text size="small">
                Source UUID: <Code>{excerptId}</Code>
              </Text>
            )}
            <Inline space="space.200">
              <Button onClick={() => setShowPreviewModal(null)}>
                Cancel
              </Button>
              <Button
                appearance="primary"
                onClick={handleSave}
                isDisabled={isSavingExcerpt || isLoadingExcerpt}
              >
                {isSavingExcerpt ? 'Saving...' : 'Save'}
              </Button>
            </Inline>
          </Inline>
        </ModalFooter>
      </Modal>
    </ModalTransition>
  );
}
