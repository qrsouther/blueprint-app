/**
 * CreateEditSourceModal Component
 *
 * Modal dialog for creating and editing Blueprint Standard Sources.
 * Note: Content editing must be done in the Source macro on the page itself.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the modal is open
 * @param {Function} props.onClose - Callback to close the modal
 * @param {string|null} props.editingExcerptId - Excerpt ID to edit, or null for create mode
 * @returns {JSX.Element}
 */

import React, { Fragment, useState, useEffect, useRef } from 'react';
import {
  Text,
  Strong,
  Em,
  Code,
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
  Tabs,
  Tab,
  TabList,
  TabPanel,
  Select,
  Toggle,
  Icon,
  Label,
  FormSection,
  TextArea,
  xcss
} from '@forge/react';
import { invoke } from '@forge/bridge';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCategoriesQuery } from '../../hooks/admin-hooks';
import { extractTextFromAdf } from '../../utils/adf-utils';
import { StableTextfield } from '../common/StableTextfield';
import { middleSectionStyles } from '../../styles/admin-styles';
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
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 30, // 30 minutes
    refetchOnMount: true, // Always refetch when component mounts (modal opens)
  });
};

// Custom hook for saving excerpt with React Query mutation
const useSaveExcerptMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ excerptName, category, content, excerptId, variableMetadata, toggleMetadata, documentationLinks, existingSourcePageId, existingSourceSpaceKey, existingSourceLocalId }) => {
      try {
        // Use existing virtual page references if editing, otherwise generate new ones
        let virtualPageId, virtualSpaceKey, virtualLocalId;
        
        if (excerptId && existingSourcePageId && existingSourcePageId.startsWith('virtual-')) {
          // Preserve existing virtual references when editing
          virtualPageId = existingSourcePageId;
          virtualSpaceKey = existingSourceSpaceKey || 'virtual-blueprint-source';
          virtualLocalId = existingSourceLocalId || `virtual-${excerptId}`;
        } else {
          // Generate new virtual page references for new Sources
          const virtualExcerptId = excerptId || `temp-${Date.now()}`;
          virtualPageId = `virtual-${virtualExcerptId}`;
          virtualSpaceKey = 'virtual-blueprint-source';
          virtualLocalId = `virtual-${virtualExcerptId}`;
        }
        
        const result = await invoke('saveExcerpt', {
          excerptName,
          category,
          content,
          excerptId,
          variableMetadata,
          toggleMetadata,
          documentationLinks,
          sourcePageId: virtualPageId,
          sourcePageTitle: excerptName || 'Blueprint Source',
          sourceSpaceKey: virtualSpaceKey,
          sourceLocalId: virtualLocalId
        });

        // Handle backend validation errors (new format)
        if (result && result.success === false && result.error) {
          throw new Error(result.error);
        }

        // Backend returns excerpt data directly on success (no success wrapper)
        // NOTE: Return format will be standardized in Phase 4 (API Consistency)
        if (!result || !result.excerptId) {
          throw new Error('Failed to save excerpt - invalid response');
        }

        return result;
      } catch (error) {
        logger.errors('[REACT-QUERY-CREATE-EDIT] Save error:', error);
        throw error;
      }
    },
    // Note: Cache invalidation is handled in the component's onSuccess callback
    // to allow awaiting refetch completion before closing the modal
    onSuccess: (data) => {
      // Mutation hook onSuccess - no invalidation here, handled in component
      // This allows the component to await refetch completion
    },
    onError: (error) => {
      logger.errors('[REACT-QUERY-CREATE-EDIT] Save failed:', error);
    }
  });
};

export function CreateEditSourceModal({
  isOpen,
  onClose,
  editingExcerptId,
  initialExcerptData = null // Optional: excerpt data from list to show immediately
}) {
  const queryClient = useQueryClient();
  const isCreateMode = !editingExcerptId;

  // Use React Query to fetch excerpt data (only in edit mode)
  const {
    data: excerptData,
    isLoading: isLoadingExcerpt,
    error: excerptError
  } = useExcerptQuery(editingExcerptId, !!editingExcerptId);

  // Use React Query mutation for saving
  const {
    mutate: saveExcerptMutation,
    isPending: isSavingExcerpt,
    isSuccess: isSaveSuccess,
    isError: isSaveError
  } = useSaveExcerptMutation();

  // Fetch categories from storage (shared with Admin UI)
  const {
    data: categories = ['General', 'Pricing', 'Technical', 'Legal', 'Marketing'],
    isLoading: isLoadingCategories
  } = useCategoriesQuery();

  // Use state for controlled components
  const [excerptName, setExcerptName] = useState('');
  const [category, setCategory] = useState('General');
  const [editorContent, setEditorContent] = useState(null);
  const [selectedTabIndex, setSelectedTabIndex] = useState(0);
  const [detectedVariables, setDetectedVariables] = useState([]);
  const [variableMetadata, setVariableMetadata] = useState({});
  const [detectedToggles, setDetectedToggles] = useState([]);
  const [toggleMetadata, setToggleMetadata] = useState({});
  const [documentationLinks, setDocumentationLinks] = useState([]);
  
  // Validation state for Forge UI Kit components
  const [validationErrors, setValidationErrors] = useState({});

  // Form state for adding new documentation links
  const [newLinkAnchor, setNewLinkAnchor] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [urlError, setUrlError] = useState('');

  // Track detection flags to prevent re-detection on every render
  const hasDetectedVariablesRef = useRef(false);
  const hasDetectedTogglesRef = useRef(false);
  const hasLoadedDataRef = useRef(false);
  const lastExcerptIdRef = useRef(null);

  // Reset state when modal closes or switches between create/edit
  useEffect(() => {
    if (!isOpen) {
      hasDetectedVariablesRef.current = false;
      hasDetectedTogglesRef.current = false;
      hasLoadedDataRef.current = false;
      lastExcerptIdRef.current = null;
      setExcerptName('');
      setCategory('General');
      setEditorContent(isCreateMode ? { type: 'doc', version: 1, content: [] } : null);
      setSelectedTabIndex(0);
      setDetectedVariables([]);
      setVariableMetadata({});
      setDetectedToggles([]);
      setToggleMetadata({});
      setDocumentationLinks([]);
      setNewLinkAnchor('');
      setNewLinkUrl('');
      setUrlError('');
    }
  }, [isOpen, isCreateMode]);

  // Load excerpt data - using same pattern as source-config.jsx
  // Show initial data immediately, then update with storage values when they load
  useEffect(() => {
    // Reset flag if excerptId changed
    if (lastExcerptIdRef.current !== editingExcerptId) {
      hasLoadedDataRef.current = false;
      lastExcerptIdRef.current = editingExcerptId;
    }

    if (!editingExcerptId || !isOpen) {
      return;
    }

    // Always show initial data immediately when modal opens (before storage loads)
    // This ensures the name is visible even while data is loading
    // This matches the pattern in source-config.jsx (lines 190-199)
    if (!hasLoadedDataRef.current && initialExcerptData) {
      if (initialExcerptData.name) {
        setExcerptName(initialExcerptData.name);
      }
      if (initialExcerptData.category) {
        setCategory(initialExcerptData.category);
      }
    }

    // Once storage data loads, update with authoritative values
    // This matches the pattern in source-config.jsx (lines 201-237)
    if (excerptData && !hasLoadedDataRef.current && !isLoadingExcerpt) {
      // Load name and category from storage, with fallback to initial data
      setExcerptName(excerptData.name || initialExcerptData?.name || '');
      setCategory(excerptData.category || initialExcerptData?.category || 'General');
      
      // Load editor content (ADF format)
      // Handle both object and string (JSON) formats
      if (excerptData.content) {
        let content = excerptData.content;
        // If content is a string, try to parse it as JSON
        if (typeof content === 'string') {
          try {
            content = JSON.parse(content);
          } catch (parseErr) {
            logger.errors('Failed to parse excerpt content as JSON:', parseErr);
            content = { type: 'doc', version: 1, content: [] };
          }
        }
        setEditorContent(content);
      } else {
        setEditorContent({ type: 'doc', version: 1, content: [] });
      }

      // Load variable metadata
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

      // Load toggle metadata
      if (excerptData.toggles && Array.isArray(excerptData.toggles)) {
        const metadata = {};
        excerptData.toggles.forEach(t => {
          metadata[t.name] = {
            description: t.description || ''
          };
        });
        setToggleMetadata(metadata);
      }

      // Load documentation links
      if (excerptData.documentationLinks && Array.isArray(excerptData.documentationLinks)) {
        setDocumentationLinks(excerptData.documentationLinks);
      }

      hasLoadedDataRef.current = true;
    }
  }, [editingExcerptId, excerptData, isLoadingExcerpt, isOpen, initialExcerptData]);

  // Initialize editor content for create mode
  useEffect(() => {
    if (isOpen && isCreateMode && !editorContent) {
      setEditorContent({ type: 'doc', version: 1, content: [] });
    }
  }, [isOpen, isCreateMode, editorContent]);

  // Detect variables when navigating to Variables tab
  useEffect(() => {
    if (selectedTabIndex === 1 && editorContent && !hasDetectedVariablesRef.current) {
      hasDetectedVariablesRef.current = true;
      
      const detectVars = async () => {
        try {
          // Ensure editorContent is a valid ADF object
          // Handle case where content might be a string (JSON) that needs parsing
          let contentToDetect = editorContent;
          
          if (typeof editorContent === 'string') {
            try {
              contentToDetect = JSON.parse(editorContent);
            } catch (parseErr) {
              logger.errors('Failed to parse content as JSON:', parseErr);
              setDetectedVariables([]);
              return;
            }
          }
          
          // Validate it's an object and not an array
          if (!contentToDetect || typeof contentToDetect !== 'object' || Array.isArray(contentToDetect)) {
            logger.errors('Invalid content format for variable detection:', { 
              type: typeof contentToDetect, 
              isArray: Array.isArray(contentToDetect),
              hasType: !!contentToDetect?.type,
              contentPreview: JSON.stringify(contentToDetect).substring(0, 200)
            });
            setDetectedVariables([]);
            return;
          }

          // Log what we're sending for debugging
          logger.info('Detecting variables with content:', { 
            hasType: !!contentToDetect.type,
            hasContent: !!contentToDetect.content,
            contentIsArray: Array.isArray(contentToDetect.content)
          });

          const result = await invoke('detectVariablesFromContent', { content: contentToDetect });
          if (result.success) {
            setDetectedVariables(result.variables);
          } else {
            logger.errors('Failed to detect variables:', result.error);
            setDetectedVariables([]);
          }
        } catch (err) {
          logger.errors('Error detecting variables:', err);
          setDetectedVariables([]);
        }
      };

      detectVars();
    }
  }, [selectedTabIndex, editorContent]);

  // Detect toggles when navigating to Toggles tab
  useEffect(() => {
    if (selectedTabIndex === 2 && editorContent && !hasDetectedTogglesRef.current) {
      hasDetectedTogglesRef.current = true;
      
      const detectToggs = async () => {
        try {
          // Ensure editorContent is a valid ADF object
          // Handle case where content might be a string (JSON) that needs parsing
          let contentToDetect = editorContent;
          
          if (typeof editorContent === 'string') {
            try {
              contentToDetect = JSON.parse(editorContent);
            } catch (parseErr) {
              logger.errors('Failed to parse content as JSON:', parseErr);
              setDetectedToggles([]);
              return;
            }
          }
          
          // Validate it's an object and not an array
          if (!contentToDetect || typeof contentToDetect !== 'object' || Array.isArray(contentToDetect)) {
            logger.errors('Invalid content format for toggle detection:', { 
              type: typeof contentToDetect, 
              isArray: Array.isArray(contentToDetect),
              content: contentToDetect 
            });
            setDetectedToggles([]);
            return;
          }

          const result = await invoke('detectTogglesFromContent', { content: contentToDetect });
          if (result.success) {
            setDetectedToggles(result.toggles);
          } else {
            logger.errors('Failed to detect toggles:', result.error);
            setDetectedToggles([]);
          }
        } catch (err) {
          logger.errors('Error detecting toggles:', err);
          setDetectedToggles([]);
        }
      };

      detectToggs();
    }
  }, [selectedTabIndex, editorContent]);

  // Convert categories array to options format for Select component
  const categoryOptions = categories.map(cat => ({
    label: cat,
    value: cat
  }));

  // Extract text content from ADF for display
  const contentText = editorContent ? extractTextFromAdf(editorContent) : '';

  const handleSave = async () => {
    // Frontend validation (works with Forge UI Kit components)
    const errors = {};
    
    // Validate excerptName - handle null, undefined, empty string, and whitespace
    const nameValue = excerptName;
    if (!nameValue || typeof nameValue !== 'string' || nameValue.trim() === '') {
      errors.excerptName = 'Source name is required and must be a non-empty string';
    }

    // Validate category if provided
    if (category !== undefined && category !== null && typeof category !== 'string') {
      errors.category = 'Category must be a string';
    }

    // Validate documentationLinks if provided
    if (documentationLinks !== undefined && documentationLinks !== null && !Array.isArray(documentationLinks)) {
      errors.documentationLinks = 'Documentation links must be an array';
    }

    // Set validation errors to display in UI
    setValidationErrors(errors);

    // If there are validation errors, don't proceed - show errors in UI
    if (Object.keys(errors).length > 0) {
      // Scroll to first error field if needed
      return;
    }

    // For edit mode, use existing content from excerptData
    // For create mode, content must be added via the Source macro on a page first
    const contentToSave = editingExcerptId 
      ? (excerptData?.content || { type: 'doc', version: 1, content: [] })
      : { type: 'doc', version: 1, content: [] };

    if (isCreateMode) {
      alert('To create a Source, add a Blueprint Standard - Source macro to a Confluence page and configure it there.');
      return;
    }

    // Merge detected variables with their metadata
    const variablesWithMetadata = detectedVariables.map(v => ({
      name: v.name,
      description: variableMetadata[v.name]?.description || '',
      example: variableMetadata[v.name]?.example || '',
      required: variableMetadata[v.name]?.required || false
    }));

    // Merge detected toggles with their metadata
    const togglesWithMetadata = detectedToggles.map(t => ({
      name: t.name,
      description: toggleMetadata[t.name]?.description || ''
    }));

    // Clear validation errors before save attempt
    setValidationErrors({});

    // Capture current values to ensure we use the latest state
    const currentExcerptName = excerptName.trim();
    const currentCategory = category;
    const currentContent = contentToSave;
    const currentExcerptId = editingExcerptId || null;

    // Use React Query mutation to save
    saveExcerptMutation({
      excerptName: currentExcerptName,
      category: currentCategory,
      content: currentContent,
      excerptId: currentExcerptId,
      variableMetadata: variablesWithMetadata,
      toggleMetadata: togglesWithMetadata,
      documentationLinks,
      existingSourcePageId: excerptData?.sourcePageId,
      existingSourceSpaceKey: excerptData?.sourceSpaceKey,
      existingSourceLocalId: excerptData?.sourceLocalId
    }, {
      onMutate: async (variables) => {
        // CRITICAL: Use mutation variables instead of closure values to avoid race conditions
        // The variables parameter contains the exact values being sent to the server
        const mutationExcerptName = variables.excerptName;
        const mutationCategory = variables.category;
        const mutationExcerptId = variables.excerptId || editingExcerptId;
        
        // Optimistically update the cache immediately for instant UI feedback
        // Cancel any outgoing refetches to avoid overwriting our optimistic update
        await queryClient.cancelQueries({ queryKey: ['excerpts', 'list'] });
        await queryClient.cancelQueries({ queryKey: ['excerpt', mutationExcerptId] });

        // Snapshot the previous value for rollback if mutation fails
        const previousExcerptsList = queryClient.getQueryData(['excerpts', 'list']);
        const previousExcerpt = mutationExcerptId 
          ? queryClient.getQueryData(['excerpt', mutationExcerptId])
          : null;

        // Prepare optimistic update data using mutation variables (not closure values)
        const optimisticExcerpt = {
          id: mutationExcerptId || `temp-${Date.now()}`,
          excerptId: mutationExcerptId || `temp-${Date.now()}`,
          name: mutationExcerptName,
          excerptName: mutationExcerptName,
          category: mutationCategory || 'General',
          content: variables.content,
          // Use mutation variables to ensure consistency with what's being sent to server
          variables: variables.variableMetadata || [],
          toggles: variables.toggleMetadata || [],
          documentationLinks: variables.documentationLinks || [],
          sourcePageId: excerptData?.sourcePageId || `virtual-${mutationExcerptId || 'new'}`,
          sourceSpaceKey: excerptData?.sourceSpaceKey || 'virtual-blueprint-source',
          sourceLocalId: excerptData?.sourceLocalId || `virtual-${mutationExcerptId || 'new'}`,
          updatedAt: new Date().toISOString(),
          createdAt: excerptData?.createdAt || new Date().toISOString()
        };

        // Optimistically update the excerpts list
        queryClient.setQueryData(['excerpts', 'list'], (old) => {
          if (!old || !old.excerpts) return old;
          
          const excerpts = [...old.excerpts];
          // Find by both id and excerptId to handle different data structures
          const existingIndex = excerpts.findIndex(e => 
            (e.id === mutationExcerptId) || (e.excerptId === mutationExcerptId)
          );
          
          if (existingIndex >= 0) {
            // Update existing excerpt - preserve all existing fields, only update changed ones
            // Use mutation variables to ensure we have the latest values
            const existing = excerpts[existingIndex];
            excerpts[existingIndex] = {
              ...existing,
              name: mutationExcerptName,
              excerptName: mutationExcerptName,
              category: mutationCategory || existing.category || 'General',
              updatedAt: new Date().toISOString(),
              // Preserve other fields like variables, toggles, etc.
            };
          }
          
          // Return new object to ensure React Query detects the change
          return { ...old, excerpts };
        });

        // Optimistically update individual excerpt cache if editing
        if (mutationExcerptId) {
          queryClient.setQueryData(['excerpt', mutationExcerptId], optimisticExcerpt);
        }

        // Return context for rollback
        return { previousExcerptsList, previousExcerpt };
      },
      onError: (error, variables, context) => {
        // Rollback optimistic update on error
        if (context?.previousExcerptsList) {
          queryClient.setQueryData(['excerpts', 'list'], context.previousExcerptsList);
        }
        if (context?.previousExcerpt) {
          queryClient.setQueryData(['excerpt', editingExcerptId], context.previousExcerpt);
        }
        
        logger.errors('[REACT-QUERY-CREATE-EDIT] Failed to save:', error);
        // Display backend validation errors
        setValidationErrors({ 
          general: error.message || 'Failed to save. Please check your input and try again.'
        });
      },
      onSuccess: async (data) => {
        // Clear validation errors on success
        setValidationErrors({});
        
        // Update cache with actual server response data (more accurate than optimistic update)
        // This ensures the UI reflects the exact data returned from the server
        if (data && data.excerptId) {
          // Update excerpts list with server response
          queryClient.setQueryData(['excerpts', 'list'], (old) => {
            if (!old || !old.excerpts) return old;
            
            const excerpts = [...old.excerpts];
            const existingIndex = excerpts.findIndex(e => e.id === data.excerptId || e.excerptId === data.excerptId);
            
            // Use the actual server response data, ensuring field names match
            const updatedExcerpt = {
              ...excerpts[existingIndex >= 0 ? existingIndex : 0],
              ...data,
              id: data.excerptId,
              name: data.excerptName || data.name,
              excerptName: data.excerptName || data.name,
              category: data.category || 'General',
              updatedAt: data.updatedAt || new Date().toISOString()
            };
            
            if (existingIndex >= 0) {
              excerpts[existingIndex] = updatedExcerpt;
            } else {
              excerpts.push(updatedExcerpt);
            }
            
            return { ...old, excerpts };
          });
          
          // Update individual excerpt cache
          queryClient.setQueryData(['excerpt', data.excerptId], {
            ...data,
            id: data.excerptId,
            name: data.excerptName || data.name
          });
        }
        
        // Close modal IMMEDIATELY after updating cache
        // The modal appears to block re-renders of the underlying page in Forge,
        // so closing it first allows the page to update once the modal is gone
        onClose();
        
        // Refetch in the background after modal closes (non-blocking)
        // This ensures data consistency with the server
        queryClient.refetchQueries({ queryKey: ['excerpt', data.excerptId] });
        queryClient.refetchQueries({ queryKey: ['excerpts', 'list'] });
        queryClient.refetchQueries({ queryKey: ['excerpts'] });
      }
    });
  };

  if (!isOpen) {
    return null;
  }

  return (
    <ModalTransition>
      <Modal width="x-large" onClose={onClose}>
        <ModalHeader>
          <ModalTitle>
            {isCreateMode ? 'Create Source' : `Edit: ${excerptName || 'Source'}`}
          </ModalTitle>
        </ModalHeader>

        <ModalBody>
          {isLoadingExcerpt && editingExcerptId ? (
            <Text>Loading...</Text>
          ) : excerptError ? (
            <SectionMessage appearance="error">
              <Text>Error loading excerpt: {excerptError.message}</Text>
            </SectionMessage>
          ) : (
            <>
              {/* Display validation errors from backend */}
              {validationErrors.general && (
                <SectionMessage appearance="error" title="Validation Error">
                  <Text>{validationErrors.general}</Text>
                </SectionMessage>
              )}
            <Tabs onChange={(index) => setSelectedTabIndex(index)}>
              <TabList space="space.200">
                <Tab>Name/Category</Tab>
                <Tab>Variables</Tab>
                <Tab>Toggles</Tab>
                <Tab>Documentation</Tab>
              </TabList>

              <TabPanel>
                <FormSection>
                  <Box xcss={xcss({ width: '700px' })}>
                    <Inline space="space.200" alignBlock="start" shouldWrap={false}>
                      <Box xcss={xcss({ width: '75%' })}>
                        <Label labelFor="excerptName">
                          Blueprint Source Name
                        </Label>
                        <StableTextfield
                          id="excerptName"
                          stableKey="create-edit-excerpt-name-input"
                          value={excerptName}
                          placeholder={isLoadingExcerpt ? 'Loading...' : 'Enter Source name'}
                          isDisabled={isLoadingExcerpt}
                          isInvalid={!!validationErrors.excerptName}
                          onChange={(e) => {
                            setExcerptName(e.target.value);
                            // Clear error when user starts typing
                            if (validationErrors.excerptName) {
                              setValidationErrors(prev => {
                                const next = { ...prev };
                                delete next.excerptName;
                                return next;
                              });
                            }
                          }}
                        />
                        {validationErrors.excerptName && (
                          <Text color="color.text.danger" size="small">
                            {validationErrors.excerptName}
                          </Text>
                        )}
                      </Box>
                      <Box xcss={xcss({ width: '25%' })}>
                        <Label labelFor="category">
                          Blueprint Source Category
                        </Label>
                        <Select
                          id="category"
                          options={categoryOptions}
                          value={(isLoadingExcerpt || isLoadingCategories) ? undefined : categoryOptions.find(opt => opt.value === category)}
                          placeholder={(isLoadingExcerpt || isLoadingCategories) ? 'Loading...' : undefined}
                          isDisabled={isLoadingExcerpt || isLoadingCategories}
                          onChange={(e) => setCategory(e.value)}
                        />
                      </Box>
                    </Inline>
                  </Box>

                  <Text>{' '}</Text>
                  <SectionMessage appearance="information">
                    <Text><Strong>Content Editing</Strong></Text>
                    <Text>To edit Source content, navigate to the Source macro on its page and edit it there. This modal is for editing metadata (name, category, variables, toggles, documentation) only.</Text>
                  </SectionMessage>
                  {editorContent && (
                    <Box paddingTop="space.200">
                      <Label>
                        Content Preview
                      </Label>
                      <Box paddingTop="space.100" xcss={xcss({ width: '700px', borderColor: 'color.border', borderStyle: 'solid', borderWidth: 'border.width', borderRadius: 'border.radius', padding: 'space.200', backgroundColor: 'color.background.neutral.subtle' })}>
                        <Text><Em>Content is stored in ADF format. Edit the Source macro on its page to modify content.</Em></Text>
                      </Box>
                    </Box>
                  )}
                </FormSection>
              </TabPanel>

              <TabPanel>
                <FormSection>
                  {contentText && detectedVariables.length === 0 && hasDetectedVariablesRef.current && (
                    <Text><Em>No variables detected.</Em></Text>
                  )}

                  {!hasDetectedVariablesRef.current && contentText && (
                    <Text><Em>Checking for variables...</Em></Text>
                  )}

                  {detectedVariables.length === 0 && !contentText && (
                    <Text>No variables detected. Add {'{{variable}}'} syntax to your Source content to create variables.</Text>
                  )}

                  {detectedVariables.length > 0 && (
                    <Fragment>
                      {detectedVariables.map((variable) => (
                        <Fragment key={variable.name}>
                          <Text>{' '}</Text>
                          <Inline space="space.300" alignBlock="center" spread="space-between">
                            <Text><Strong><Code>{`{{${variable.name}}}`}</Code></Strong></Text>
                            <Inline space="space.100" alignBlock="center">
                              <Text>Required</Text>
                              <Toggle
                                id={`required-${variable.name}`}
                                isChecked={variableMetadata[variable.name]?.required || false}
                                isDisabled={isLoadingExcerpt}
                                onChange={(e) => {
                                  setVariableMetadata({
                                    ...variableMetadata,
                                    [variable.name]: {
                                      ...variableMetadata[variable.name],
                                      required: e.target.checked
                                    }
                                  });
                                }}
                              />
                            </Inline>
                          </Inline>
                          <StableTextfield
                            id={`var-desc-${variable.name}`}
                            stableKey={`create-edit-var-desc-${variable.name}`}
                            label="Description"
                            placeholder={isLoadingExcerpt ? 'Loading...' : 'Description'}
                            value={variableMetadata[variable.name]?.description || ''}
                            isDisabled={isLoadingExcerpt}
                            onChange={(e) => {
                              setVariableMetadata({
                                ...variableMetadata,
                                [variable.name]: {
                                  ...variableMetadata[variable.name],
                                  description: e.target.value
                                }
                              });
                            }}
                          />
                          <StableTextfield
                            id={`var-example-${variable.name}`}
                            stableKey={`create-edit-var-example-${variable.name}`}
                            label="Example"
                            placeholder={isLoadingExcerpt ? 'Loading...' : 'Example'}
                            value={variableMetadata[variable.name]?.example || ''}
                            isDisabled={isLoadingExcerpt}
                            onChange={(e) => {
                              setVariableMetadata({
                                ...variableMetadata,
                                [variable.name]: {
                                  ...variableMetadata[variable.name],
                                  example: e.target.value
                                }
                              });
                            }}
                          />
                        </Fragment>
                      ))}
                    </Fragment>
                  )}
                </FormSection>
              </TabPanel>

              <TabPanel>
                <FormSection>
                  {contentText && detectedToggles.length === 0 && hasDetectedTogglesRef.current && (
                    <Text><Em>No toggles detected.</Em></Text>
                  )}

                  {!hasDetectedTogglesRef.current && contentText && (
                    <Text><Em>Checking for toggles...</Em></Text>
                  )}

                  {detectedToggles.length === 0 && !contentText && (
                    <Text>No toggles detected. Add {'{{toggle:name}}'} ... {'{{/toggle:name}}'} syntax to your Source content to create toggles.</Text>
                  )}

                  {detectedToggles.length > 0 && (
                    <Fragment>
                      {detectedToggles.map((toggle) => (
                        <Fragment key={toggle.name}>
                          <Text>{' '}</Text>
                          <Text><Strong><Code>{`{{toggle:${toggle.name}}}`}</Code></Strong></Text>
                          <StableTextfield
                            id={`toggle-desc-${toggle.name}`}
                            stableKey={`create-edit-toggle-desc-${toggle.name}`}
                            label="Description"
                            placeholder={isLoadingExcerpt ? 'Loading...' : 'Description'}
                            value={toggleMetadata[toggle.name]?.description || ''}
                            isDisabled={isLoadingExcerpt}
                            onChange={(e) => {
                              setToggleMetadata({
                                ...toggleMetadata,
                                [toggle.name]: {
                                  description: e.target.value
                                }
                              });
                            }}
                          />
                        </Fragment>
                      ))}
                    </Fragment>
                  )}
                </FormSection>
              </TabPanel>

              <TabPanel>
                <FormSection>
                  {/* Existing documentation links */}
                  {documentationLinks.length > 0 && (
                    <Fragment>
                      <Text><Strong>Documentation Links</Strong></Text>
                      <Text>{' '}</Text>
                      {documentationLinks.map((link, index) => (
                        <Box key={index} padding="space.100" backgroundColor="color.background.neutral.subtle" style={{ marginBottom: '8px', borderRadius: '3px' }}>
                          <Inline space="space.200" alignBlock="center" spread="space-between">
                            <Stack space="space.050">
                              <Text><Strong>{link.anchor}</Strong></Text>
                              <Text size="small"><Em>{link.url}</Em></Text>
                            </Stack>
                            <Inline space="space.100">
                              <Button
                                appearance="subtle"
                                iconBefore={<Icon glyph="arrow-up" label="Move up" />}
                                isDisabled={index === 0 || isLoadingExcerpt}
                                onClick={() => {
                                  const newLinks = [...documentationLinks];
                                  [newLinks[index - 1], newLinks[index]] = [newLinks[index], newLinks[index - 1]];
                                  setDocumentationLinks(newLinks);
                                }}
                              />
                              <Button
                                appearance="subtle"
                                iconBefore={<Icon glyph="arrow-down" label="Move down" />}
                                isDisabled={index === documentationLinks.length - 1 || isLoadingExcerpt}
                                onClick={() => {
                                  const newLinks = [...documentationLinks];
                                  [newLinks[index], newLinks[index + 1]] = [newLinks[index + 1], newLinks[index]];
                                  setDocumentationLinks(newLinks);
                                }}
                              />
                              <Button
                                appearance="danger"
                                iconBefore={<Icon glyph="trash" label="Delete" />}
                                isDisabled={isLoadingExcerpt}
                                onClick={() => {
                                  setDocumentationLinks(documentationLinks.filter((_, i) => i !== index));
                                }}
                              />
                            </Inline>
                          </Inline>
                        </Box>
                      ))}
                      <Text>{' '}</Text>
                    </Fragment>
                  )}

                  {/* Add new documentation link form */}
                  <Text><Strong>Add New Documentation Link</Strong></Text>
                  <Text>{' '}</Text>
                  <StableTextfield
                    stableKey="create-edit-doc-link-anchor"
                    label="Anchor Text"
                    placeholder={isLoadingExcerpt ? 'Loading...' : 'e.g., API Reference'}
                    value={newLinkAnchor}
                    isDisabled={isLoadingExcerpt}
                    onChange={(e) => setNewLinkAnchor(e.target.value)}
                  />
                  <StableTextfield
                    stableKey="create-edit-doc-link-url"
                    label="URL"
                    placeholder={isLoadingExcerpt ? 'Loading...' : 'https://example.com/docs'}
                    value={newLinkUrl}
                    isDisabled={isLoadingExcerpt}
                    onChange={(e) => {
                      setNewLinkUrl(e.target.value);
                      // Basic URL validation
                      const url = e.target.value.trim();
                      if (url && !url.match(/^https?:\/\/.+/i)) {
                        setUrlError('URL must start with http:// or https://');
                      } else {
                        setUrlError('');
                      }
                    }}
                  />
                  {urlError && (
                    <SectionMessage appearance="error">
                      <Text>{urlError}</Text>
                    </SectionMessage>
                  )}
                  <Button
                    appearance="primary"
                    isDisabled={!newLinkAnchor.trim() || !newLinkUrl.trim() || !!urlError || isLoadingExcerpt}
                    onClick={() => {
                      if (newLinkAnchor.trim() && newLinkUrl.trim() && !urlError) {
                        setDocumentationLinks([
                          ...documentationLinks,
                          { anchor: newLinkAnchor.trim(), url: newLinkUrl.trim() }
                        ]);
                        setNewLinkAnchor('');
                        setNewLinkUrl('');
                      }
                    }}
                  >
                    Add Link
                  </Button>

                  <Text>{' '}</Text>
                  <SectionMessage appearance="discovery">
                    <Text>Add documentation links that will appear in all Embed instances using this Source. Links open in a new tab.</Text>
                  </SectionMessage>
                </FormSection>
              </TabPanel>
            </Tabs>
            </>
          )}
        </ModalBody>

        <ModalFooter>
          <Inline space="space.200" alignBlock="center" spread="space-between">
            {editingExcerptId && (
              <Text size="small">
                Source UUID: <Code>{editingExcerptId}</Code>
              </Text>
            )}
            <Inline space="space.200">
              <Button onClick={onClose}>
                Cancel
              </Button>
              <Button
                appearance="primary"
                onClick={handleSave}
                isDisabled={isSavingExcerpt || isLoadingExcerpt || !excerptName.trim()}
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

