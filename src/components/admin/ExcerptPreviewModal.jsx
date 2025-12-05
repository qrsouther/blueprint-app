/**
 * ExcerptPreviewModal Component
 *
 * Modal dialog for editing Blueprint Standard Source metadata.
 * Provides the same tab-based editing interface as source-config.jsx,
 * allowing admins to edit name, category, variables, toggles, and documentation.
 *
 * Note: Content editing must be done in the Source macro on the page itself.
 *
 * @param {Object} props
 * @param {string|null} props.showPreviewModal - Excerpt ID to edit, or null if modal is closed
 * @param {Function} props.setShowPreviewModal - Callback to update preview state
 * @param {Array} props.excerpts - Array of all excerpt objects
 * @param {Object} props.previewBoxStyle - xcss style for the preview content box
 * @returns {JSX.Element}
 */

import React, { Fragment, useState, useEffect, useRef, useMemo } from 'react';
import { useForm as useReactHookForm, useWatch } from 'react-hook-form';
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
  AdfRenderer,
  xcss
} from '@forge/react';
import { invoke, router } from '@forge/bridge';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCategoriesQuery } from '../../hooks/admin-hooks';
import { extractTextFromAdf } from '../../utils/adf-utils';
import { StableTextfield } from '../common/StableTextfield';
import { SourceMetadataTabs } from '../common/SourceMetadataTabs';
import { VariableConfigPanel } from '../VariableConfigPanel';
import { ToggleConfigPanel } from '../ToggleConfigPanel';
import { DocumentationLinksDisplay } from '../embed/DocumentationLinksDisplay';
import { logger } from '../../utils/logger.js';
import {
  cleanAdfForRenderer,
  filterContentByToggles,
  substituteVariablesInAdf
} from '../../utils/adf-rendering-utils';

// Split view layout styles
const splitContainerStyle = xcss({
  display: 'flex',
  flexDirection: 'row',
  gap: 'space.300',
  minHeight: '400px'
});

const leftPanelStyle = xcss({
  width: '25%',
  minWidth: '200px',
  flexShrink: 0
});

const rightPanelStyle = xcss({
  width: '75%',
  flexGrow: 1,
  borderColor: 'color.border',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderRadius: 'border.radius',
  padding: 'space.200',
  backgroundColor: 'color.background.neutral.subtle',
  overflow: 'auto'
});

const testerTabsStyle = xcss({
  marginBottom: 'space.200'
});

const previewContentStyle = xcss({
  padding: 'space.200',
  borderColor: 'color.border',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderRadius: 'border.radius',
  backgroundColor: 'color.background.input'
});

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

        // Handle backend validation errors
        if (!result || !result.success) {
          throw new Error(result.error || 'Failed to save excerpt');
        }

        // Return data from standardized format
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
      // Invalidate the excerpt cache so it refetches with updated data
      queryClient.invalidateQueries({ queryKey: ['excerpt', data.excerptId] });
      // Also invalidate the excerpts list (for Admin UI and Include macro dropdowns)
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

  // ============================================================================
  // EPHEMERAL TESTER STATE (for live preview with sample values)
  // Values are NOT persisted - discarded when modal closes
  // ============================================================================
  const [testerTabIndex, setTesterTabIndex] = useState(0); // 0 = Toggles, 1 = Variables

  // Separate React Hook Form for tester (ephemeral, never saved)
  const testerForm = useReactHookForm({
    defaultValues: {
      variableValues: {},
      toggleStates: {}
    }
  });

  const { control: testerControl, setValue: setTesterValue, reset: resetTesterForm } = testerForm;

  // Watch tester form values for live preview
  const watchedTesterVariables = useWatch({
    control: testerControl,
    name: 'variableValues'
  }) || {};

  const watchedTesterToggles = useWatch({
    control: testerControl,
    name: 'toggleStates'
  }) || {};

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
      // Reset ephemeral tester form
      setTesterTabIndex(0);
      resetTesterForm({ variableValues: {}, toggleStates: {} });
    }
  }, [showPreviewModal, resetTesterForm]);

  // Extract text content from ADF for variable/toggle detection
  // Use editorContent if available (user has edited), otherwise use excerptData.content
  const contentForDetection = editorContent || excerptData?.content;
  const contentText = contentForDetection ? extractTextFromAdf(contentForDetection) : '';

  // Build mock excerpt object for tester config panels
  // Converts detected variables/toggles to format expected by VariableConfigPanel/ToggleConfigPanel
  const mockExcerptForTester = useMemo(() => ({
    variables: detectedVariables.map(v => ({
      name: v.name,
      description: variableMetadata[v.name]?.description || '',
      example: variableMetadata[v.name]?.example || '',
      required: variableMetadata[v.name]?.required || false
    })),
    toggles: detectedToggles.map(t => ({
      name: t.name,
      description: toggleMetadata[t.name]?.description || ''
    })),
    content: contentForDetection
  }), [detectedVariables, variableMetadata, detectedToggles, toggleMetadata, contentForDetection]);

  // Generate preview content with substitutions applied
  const testerPreviewContent = useMemo(() => {
    if (!contentForDetection) return null;

    try {
      // Deep clone the ADF content
      let preview = JSON.parse(JSON.stringify(contentForDetection));

      // Build variables and toggles arrays inline
      const variables = detectedVariables.map(v => ({
        name: v.name,
        description: variableMetadata[v.name]?.description || '',
        example: variableMetadata[v.name]?.example || '',
        required: variableMetadata[v.name]?.required || false
      }));

      const toggles = detectedToggles.map(t => ({
        name: t.name,
        description: toggleMetadata[t.name]?.description || ''
      }));

      // Apply toggle filtering
      if (toggles.length > 0) {
        preview = filterContentByToggles(preview, watchedTesterToggles);
      }

      // Apply variable substitutions
      if (variables.length > 0) {
        preview = substituteVariablesInAdf(preview, watchedTesterVariables, variables);
      }

      // Clean for AdfRenderer compatibility
      return cleanAdfForRenderer(preview);
    } catch (error) {
      logger.errors('Error generating tester preview:', error);
      return null;
    }
  }, [contentForDetection, watchedTesterVariables, watchedTesterToggles, detectedVariables, detectedToggles, variableMetadata, toggleMetadata]);

  // Get initial data from excerpts list for immediate display
  const initialExcerpt = excerpts?.find(e => e.id === excerptId);

  // Load excerpt data from React Query (only once per excerptId)
  useEffect(() => {
    // Reset flag if excerptId changed
    if (lastExcerptIdRef.current !== excerptId) {
      hasLoadedDataRef.current = false;
      lastExcerptIdRef.current = excerptId;
      
      // Immediately set initial data from excerpts list while waiting for React Query
      if (initialExcerpt) {
        setExcerptName(initialExcerpt.name || '');
        setCategory(initialExcerpt.category || 'General');
      }
    }

    if (!excerptId || !excerptData) {
      return;
    }

    if (!hasLoadedDataRef.current) {
      // Load name and category from React Query data (authoritative source)
      const nameToSet = excerptData.name !== undefined && excerptData.name !== null 
        ? String(excerptData.name).trim() 
        : (initialExcerpt?.name || '');
      setExcerptName(nameToSet);
      setCategory(excerptData.category || 'General');
      
      // Load editor content (ADF format)
      if (excerptData.content) {
        setEditorContent(excerptData.content);
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

      // Load bespoke flag
      setBespoke(excerptData.bespoke || false);

      hasLoadedDataRef.current = true;
    }
  }, [excerptId, excerptData, initialExcerpt]);

  // Detect variables whenever content text changes
  useEffect(() => {
    if (!contentText) {
      setDetectedVariables([]);
      return;
    }

    // Call backend to detect variables
    const detectVars = async () => {
      try {
        const result = await invoke('detectVariablesFromContent', { content: contentText });
        if (result.success && result.data) {
          setDetectedVariables(result.data.variables);
        }
      } catch (err) {
        logger.errors('Error detecting variables:', err);
      }
    };

    detectVars();
  }, [contentText]);

  // Detect toggles whenever content text changes
  useEffect(() => {
    if (!contentText) {
      setDetectedToggles([]);
      return;
    }

    // Call backend to detect toggles
    const detectToggs = async () => {
      try {
        const result = await invoke('detectTogglesFromContent', { content: contentText });
        if (result.success && result.data) {
          setDetectedToggles(result.data.toggles);
        }
      } catch (err) {
        logger.errors('Error detecting toggles:', err);
      }
    };

    detectToggs();
  }, [contentText]);

  // Convert categories array to options format for Select component
  const categoryOptions = categories.map(cat => ({
    label: cat,
    value: cat
  }));

  const handleSave = async () => {
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

    // Use editorContent if available (user edited), otherwise use excerptData.content
    const contentToSave = editorContent || excerptData?.content;

    // Use React Query mutation to save
    // NOTE: saveExcerpt updates contentHash and updatedAt in storage, which Embed macros
    // use for staleness detection. This ensures staleness detection works correctly when
    // Source content is updated from the Admin modal.
    saveExcerptMutation({
      excerptName,
      category,
      bespoke,
      content: contentToSave,
      excerptId,
      variableMetadata: variablesWithMetadata,
      toggleMetadata: togglesWithMetadata,
      documentationLinks,
      sourcePageId: excerptData?.sourcePageId,
      sourcePageTitle: excerptData?.sourcePageTitle,
      sourceSpaceKey: excerptData?.sourceSpaceKey,
      sourceLocalId: excerptData?.sourceLocalId
    }, {
      onSuccess: async () => {
        // If editorContent was changed and we have source page info, update the macro body on the page
        // NOTE: We update storage first (via saveExcerpt above), then update the page.
        // When the page is saved, source-display.jsx will detect the change and call
        // updateExcerptContent, which will see the hash matches and skip the update.
        // This ensures storage and page stay in sync while preserving staleness detection.
        if (editorContent && editorContent !== excerptData?.content && excerptData?.sourcePageId) {
          try {
            const updateResult = await invoke('updateSourceMacroBody', {
              pageId: excerptData.sourcePageId,
              excerptId: excerptId,
              localId: excerptData.sourceLocalId,
              content: editorContent
            });

            if (!updateResult.success) {
              logger.errors('[REACT-QUERY-ADMIN-PREVIEW] Failed to update macro body:', updateResult.error);
              alert('Saved to storage, but failed to update macro on page: ' + updateResult.error);
              return;
            }
          } catch (error) {
            logger.errors('[REACT-QUERY-ADMIN-PREVIEW] Error updating macro body:', error);
            alert('Saved to storage, but failed to update macro on page: ' + error.message);
            return;
          }
        }

        // Close modal after successful save
        setShowPreviewModal(null);
      },
      onError: (error) => {
        logger.errors('[REACT-QUERY-ADMIN-PREVIEW] Failed to save:', error);
        alert('Failed to save: ' + error.message);
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
      <Modal width="75%" onClose={() => setShowPreviewModal(null)}>
        <ModalHeader>
          <Inline space="space.100" alignBlock="center" spread="space-between">
            <ModalTitle>{excerpt.name || 'Blueprint Standard'}</ModalTitle>
            {excerptData?.sourcePageId && (
              <Button
                appearance="default"
                onClick={async () => {
                  try {
                    let url = `/wiki/pages/viewpage.action?pageId=${excerptData.sourcePageId}`;
                    // Use Confluence's built-in anchor for bodied macros (format: #id-{localId})
                    if (excerptData.sourceLocalId) {
                      url += `#id-${excerptData.sourceLocalId}`;
                    }
                    // Use open() to open in new tab
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
            <Tabs>
              <TabList space="space.200">
                <Tab>Main</Tab>
                <Tab>Toggles</Tab>
                <Tab>Variables</Tab>
                <Tab>Documentation</Tab>
              </TabList>

              {/* Main TabPanel */}
              <TabPanel>
                <Box xcss={splitContainerStyle}>
                  {/* LEFT PANEL (25%) - Form Controls */}
                  <Box xcss={leftPanelStyle}>
                    <Stack space="space.200">
                      {/* Name field */}
                      <Stack space="space.050">
                        <Label labelFor="excerptName">Source Name</Label>
                        <StableTextfield
                          id="excerptName"
                          stableKey="excerpt-name-input"
                          value={excerptName}
                          placeholder={isLoadingExcerpt ? 'Loading...' : ''}
                          isDisabled={isLoadingExcerpt}
                          onChange={(e) => setExcerptName(e.target.value)}
                        />
                      </Stack>
                      {/* Category field */}
                      <Stack space="space.050">
                        <Label labelFor="category">Category</Label>
                        <Select
                          id="category"
                          options={categoryOptions}
                          value={(isLoadingExcerpt || isLoadingCategories) ? undefined : categoryOptions.find(opt => opt.value === category)}
                          placeholder={(isLoadingExcerpt || isLoadingCategories) ? 'Loading...' : undefined}
                          onChange={(e) => setCategory(e.value)}
                        />
                      </Stack>
                      {/* Bespoke toggle */}
                      <Inline space="space.100" alignBlock="center">
                        <Label labelFor="bespoke-toggle">Bespoke</Label>
                        <Toggle
                          id="bespoke-toggle"
                          isChecked={bespoke}
                          isDisabled={isLoadingExcerpt}
                          onChange={(e) => setBespoke(e.target.checked)}
                        />
                      </Inline>
                    </Stack>
                  </Box>

                  {/* RIGHT PANEL (75%) - Live Preview */}
                  <Box xcss={rightPanelStyle}>
                    <Stack space="space.200">
                      {/* Ephemeral tester tabs */}
                      <Box xcss={testerTabsStyle}>
                        <Tabs
                          onChange={(index) => setTesterTabIndex(index)}
                          selected={testerTabIndex}
                          id="tester-tabs-main"
                        >
                          <TabList>
                            <Tab>Test Toggles</Tab>
                            <Tab>Test Variables</Tab>
                          </TabList>
                          <TabPanel>
                            {detectedToggles.length > 0 ? (
                              <ToggleConfigPanel
                                excerpt={mockExcerptForTester}
                                control={testerControl}
                                setValue={setTesterValue}
                                onBlur={() => {}}
                              />
                            ) : (
                              <Text><Em>No toggles in this Source</Em></Text>
                            )}
                          </TabPanel>
                          <TabPanel>
                            {detectedVariables.length > 0 ? (
                              <VariableConfigPanel
                                excerpt={mockExcerptForTester}
                                control={testerControl}
                                setValue={setTesterValue}
                                onBlur={() => {}}
                                formKey={0}
                              />
                            ) : (
                              <Text><Em>No variables in this Source</Em></Text>
                            )}
                          </TabPanel>
                        </Tabs>
                      </Box>

                      {/* Documentation Links Display */}
                      {documentationLinks.length > 0 && (
                        <DocumentationLinksDisplay documentationLinks={documentationLinks} />
                      )}

                      {/* Live ADF Preview */}
                      <Box xcss={previewContentStyle}>
                        <Stack space="space.100">
                          <Text><Strong>Live Preview</Strong></Text>
                          {testerPreviewContent ? (
                            <AdfRenderer document={testerPreviewContent} />
                          ) : (
                            <Text color="color.text.subtle"><Em>No content to preview</Em></Text>
                          )}
                        </Stack>
                      </Box>
                    </Stack>
                  </Box>
                </Box>
              </TabPanel>

              {/* Toggles TabPanel */}
              <TabPanel>
                <Box xcss={splitContainerStyle}>
                  {/* LEFT PANEL (25%) - Toggle Metadata Editors */}
                  <Box xcss={leftPanelStyle}>
                    <Stack space="space.200">
                      {contentText && detectedToggles.length === 0 && (
                        <Text><Em>Checking for toggles...</Em></Text>
                      )}

                      {detectedToggles.length === 0 && !contentText && (
                        <Text>No toggles detected. Add {'{{toggle:name}}'} ... {'{{/toggle:name}}'} syntax.</Text>
                      )}

                      {detectedToggles.length > 0 && (
                        <Fragment>
                          {detectedToggles.map((toggle) => (
                            <Stack key={toggle.name} space="space.100">
                              <Text><Strong><Code>{`{{toggle:${toggle.name}}}`}</Code></Strong></Text>
                              <StableTextfield
                                id={`toggle-desc-${toggle.name}`}
                                stableKey={`toggle-desc-${toggle.name}`}
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
                            </Stack>
                          ))}
                        </Fragment>
                      )}
                    </Stack>
                  </Box>

                  {/* RIGHT PANEL (75%) - Live Preview */}
                  <Box xcss={rightPanelStyle}>
                    <Stack space="space.200">
                      {/* Ephemeral tester tabs */}
                      <Box xcss={testerTabsStyle}>
                        <Tabs
                          onChange={(index) => setTesterTabIndex(index)}
                          selected={testerTabIndex}
                          id="tester-tabs-toggles"
                        >
                          <TabList>
                            <Tab>Test Toggles</Tab>
                            <Tab>Test Variables</Tab>
                          </TabList>
                          <TabPanel>
                            {detectedToggles.length > 0 ? (
                              <ToggleConfigPanel
                                excerpt={mockExcerptForTester}
                                control={testerControl}
                                setValue={setTesterValue}
                                onBlur={() => {}}
                              />
                            ) : (
                              <Text><Em>No toggles in this Source</Em></Text>
                            )}
                          </TabPanel>
                          <TabPanel>
                            {detectedVariables.length > 0 ? (
                              <VariableConfigPanel
                                excerpt={mockExcerptForTester}
                                control={testerControl}
                                setValue={setTesterValue}
                                onBlur={() => {}}
                                formKey={1}
                              />
                            ) : (
                              <Text><Em>No variables in this Source</Em></Text>
                            )}
                          </TabPanel>
                        </Tabs>
                      </Box>

                      {/* Documentation Links Display */}
                      {documentationLinks.length > 0 && (
                        <DocumentationLinksDisplay documentationLinks={documentationLinks} />
                      )}

                      {/* Live ADF Preview */}
                      <Box xcss={previewContentStyle}>
                        <Stack space="space.100">
                          <Text><Strong>Live Preview</Strong></Text>
                          {testerPreviewContent ? (
                            <AdfRenderer document={testerPreviewContent} />
                          ) : (
                            <Text color="color.text.subtle"><Em>No content to preview</Em></Text>
                          )}
                        </Stack>
                      </Box>
                    </Stack>
                  </Box>
                </Box>
              </TabPanel>

              {/* Variables TabPanel */}
              <TabPanel>
                <Box xcss={splitContainerStyle}>
                  {/* LEFT PANEL (25%) - Variable Metadata Editors */}
                  <Box xcss={leftPanelStyle}>
                    <Stack space="space.200">
                      {contentText && detectedVariables.length === 0 && (
                        <Text><Em>Checking for variables...</Em></Text>
                      )}

                      {detectedVariables.length === 0 && !contentText && (
                        <Text>No variables detected. Add {'{{variable}}'} syntax.</Text>
                      )}

                      {detectedVariables.length > 0 && (
                        <Fragment>
                          {detectedVariables.map((variable) => (
                            <Stack key={variable.name} space="space.100">
                              <Inline space="space.100" alignBlock="center" spread="space-between">
                                <Text><Strong><Code>{`{{${variable.name}}}`}</Code></Strong></Text>
                                <Inline space="space.050" alignBlock="center">
                                  <Text size="small">Req</Text>
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
                                stableKey={`var-desc-${variable.name}`}
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
                                stableKey={`var-example-${variable.name}`}
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
                            </Stack>
                          ))}
                        </Fragment>
                      )}
                    </Stack>
                  </Box>

                  {/* RIGHT PANEL (75%) - Live Preview */}
                  <Box xcss={rightPanelStyle}>
                    <Stack space="space.200">
                      {/* Ephemeral tester tabs */}
                      <Box xcss={testerTabsStyle}>
                        <Tabs
                          onChange={(index) => setTesterTabIndex(index)}
                          selected={testerTabIndex}
                          id="tester-tabs-variables"
                        >
                          <TabList>
                            <Tab>Test Toggles</Tab>
                            <Tab>Test Variables</Tab>
                          </TabList>
                          <TabPanel>
                            {detectedToggles.length > 0 ? (
                              <ToggleConfigPanel
                                excerpt={mockExcerptForTester}
                                control={testerControl}
                                setValue={setTesterValue}
                                onBlur={() => {}}
                              />
                            ) : (
                              <Text><Em>No toggles in this Source</Em></Text>
                            )}
                          </TabPanel>
                          <TabPanel>
                            {detectedVariables.length > 0 ? (
                              <VariableConfigPanel
                                excerpt={mockExcerptForTester}
                                control={testerControl}
                                setValue={setTesterValue}
                                onBlur={() => {}}
                                formKey={2}
                              />
                            ) : (
                              <Text><Em>No variables in this Source</Em></Text>
                            )}
                          </TabPanel>
                        </Tabs>
                      </Box>

                      {/* Documentation Links Display */}
                      {documentationLinks.length > 0 && (
                        <DocumentationLinksDisplay documentationLinks={documentationLinks} />
                      )}

                      {/* Live ADF Preview */}
                      <Box xcss={previewContentStyle}>
                        <Stack space="space.100">
                          <Text><Strong>Live Preview</Strong></Text>
                          {testerPreviewContent ? (
                            <AdfRenderer document={testerPreviewContent} />
                          ) : (
                            <Text color="color.text.subtle"><Em>No content to preview</Em></Text>
                          )}
                        </Stack>
                      </Box>
                    </Stack>
                  </Box>
                </Box>
              </TabPanel>

              {/* Documentation TabPanel */}
              <TabPanel>
                <Box xcss={splitContainerStyle}>
                  {/* LEFT PANEL (25%) - Documentation Link Editors */}
                  <Box xcss={leftPanelStyle}>
                    <Stack space="space.200">
                      {/* Existing documentation links */}
                      {documentationLinks.length > 0 && (
                        <Fragment>
                          <Text><Strong>Doc Links</Strong></Text>
                          {documentationLinks.map((link, index) => (
                            <Box key={index} padding="space.100" backgroundColor="color.background.neutral.subtle" xcss={{ borderRadius: 'border.radius' }}>
                              <Stack space="space.050">
                                <Text size="small"><Strong>{link.anchor}</Strong></Text>
                                <Inline space="space.050">
                                  <Button
                                    appearance="subtle"
                                    spacing="compact"
                                    iconBefore={<Icon glyph="arrow-up" label="Move up" size="small" />}
                                    isDisabled={index === 0 || isLoadingExcerpt}
                                    onClick={() => {
                                      const newLinks = [...documentationLinks];
                                      [newLinks[index - 1], newLinks[index]] = [newLinks[index], newLinks[index - 1]];
                                      setDocumentationLinks(newLinks);
                                    }}
                                  />
                                  <Button
                                    appearance="subtle"
                                    spacing="compact"
                                    iconBefore={<Icon glyph="arrow-down" label="Move down" size="small" />}
                                    isDisabled={index === documentationLinks.length - 1 || isLoadingExcerpt}
                                    onClick={() => {
                                      const newLinks = [...documentationLinks];
                                      [newLinks[index], newLinks[index + 1]] = [newLinks[index + 1], newLinks[index]];
                                      setDocumentationLinks(newLinks);
                                    }}
                                  />
                                  <Button
                                    appearance="danger"
                                    spacing="compact"
                                    iconBefore={<Icon glyph="trash" label="Delete" size="small" />}
                                    isDisabled={isLoadingExcerpt}
                                    onClick={() => {
                                      setDocumentationLinks(documentationLinks.filter((_, i) => i !== index));
                                    }}
                                  />
                                </Inline>
                              </Stack>
                            </Box>
                          ))}
                        </Fragment>
                      )}

                      {/* Add new documentation link form */}
                      <Text><Strong>Add Link</Strong></Text>
                      <StableTextfield
                        stableKey="doc-link-anchor"
                        label="Anchor"
                        placeholder={isLoadingExcerpt ? 'Loading...' : 'e.g., API Ref'}
                        value={newLinkAnchor}
                        isDisabled={isLoadingExcerpt}
                        onChange={(e) => setNewLinkAnchor(e.target.value)}
                      />
                      <StableTextfield
                        stableKey="doc-link-url"
                        label="URL"
                        placeholder={isLoadingExcerpt ? 'Loading...' : 'https://...'}
                        value={newLinkUrl}
                        isDisabled={isLoadingExcerpt}
                        onChange={(e) => {
                          setNewLinkUrl(e.target.value);
                          const url = e.target.value.trim();
                          if (url && !url.match(/^https?:\/\/.+/i)) {
                            setUrlError('Must start with http(s)://');
                          } else {
                            setUrlError('');
                          }
                        }}
                      />
                      {urlError && (
                        <Text color="color.text.danger" size="small">{urlError}</Text>
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
                        Add
                      </Button>
                    </Stack>
                  </Box>

                  {/* RIGHT PANEL (75%) - Live Preview */}
                  <Box xcss={rightPanelStyle}>
                    <Stack space="space.200">
                      {/* Ephemeral tester tabs */}
                      <Box xcss={testerTabsStyle}>
                        <Tabs
                          onChange={(index) => setTesterTabIndex(index)}
                          selected={testerTabIndex}
                          id="tester-tabs-docs"
                        >
                          <TabList>
                            <Tab>Test Toggles</Tab>
                            <Tab>Test Variables</Tab>
                          </TabList>
                          <TabPanel>
                            {detectedToggles.length > 0 ? (
                              <ToggleConfigPanel
                                excerpt={mockExcerptForTester}
                                control={testerControl}
                                setValue={setTesterValue}
                                onBlur={() => {}}
                              />
                            ) : (
                              <Text><Em>No toggles in this Source</Em></Text>
                            )}
                          </TabPanel>
                          <TabPanel>
                            {detectedVariables.length > 0 ? (
                              <VariableConfigPanel
                                excerpt={mockExcerptForTester}
                                control={testerControl}
                                setValue={setTesterValue}
                                onBlur={() => {}}
                                formKey={3}
                              />
                            ) : (
                              <Text><Em>No variables in this Source</Em></Text>
                            )}
                          </TabPanel>
                        </Tabs>
                      </Box>

                      {/* Documentation Links Display */}
                      {documentationLinks.length > 0 && (
                        <DocumentationLinksDisplay documentationLinks={documentationLinks} />
                      )}

                      {/* Live ADF Preview */}
                      <Box xcss={previewContentStyle}>
                        <Stack space="space.100">
                          <Text><Strong>Live Preview</Strong></Text>
                          {testerPreviewContent ? (
                            <AdfRenderer document={testerPreviewContent} />
                          ) : (
                            <Text color="color.text.subtle"><Em>No content to preview</Em></Text>
                          )}
                        </Stack>
                      </Box>
                    </Stack>
                  </Box>
                </Box>
              </TabPanel>
            </Tabs>
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
