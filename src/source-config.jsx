import React, { Fragment, useState, useEffect, useCallback } from 'react';
import ForgeReconciler, {
  Form,
  FormSection,
  FormFooter,
  Label,
  Select,
  Text,
  Strong,
  Em,
  Code,
  Button,
  SectionMessage,
  Toggle,
  Tabs,
  Tab,
  TabList,
  TabPanel,
  Inline,
  Stack,
  Box,
  Icon,
  useForm,
  useConfig,
  useProductContext
} from '@forge/react';
import { invoke, view, router } from '@forge/bridge';
import { QueryClient, QueryClientProvider, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCategoriesQuery } from './hooks/admin-hooks';
import { StableTextfield } from './components/common/StableTextfield';
import { logger } from './utils/logger.js';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30, // 30 minutes (renamed from cacheTime in v5)
    },
  },
});

// Custom hook for fetching excerpt data with React Query
// Always forces fresh fetch from storage on every component load
const useExcerptQuery = (excerptId, enabled) => {
  return useQuery({
    queryKey: ['excerpt', excerptId],
    queryFn: async () => {
      const result = await invoke('getExcerpt', { excerptId });

      if (!result.success || !result.excerpt) {
        throw new Error('Failed to load excerpt');
      }

      return result.excerpt;
    },
    enabled: enabled && !!excerptId,
    staleTime: 0, // Always consider data stale - force refetch every time
    gcTime: 1000 * 60 * 30, // Keep in cache for 30 minutes (for other components)
    refetchOnMount: 'always', // Always refetch when component mounts (modal opens)
    refetchOnWindowFocus: false, // Don't refetch on window focus (we want fresh data on mount only)
  });
};

// Custom hook for fetching admin URL
const useAdminUrlQuery = () => {
  return useQuery({
    queryKey: ['adminUrl'],
    queryFn: async () => {
      const result = await invoke('getAdminUrl');
      if (result.success && result.adminUrl) {
        return result.adminUrl;
      }
      return null;
    },
    staleTime: 1000 * 60 * 60, // 1 hour - admin URL rarely changes
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
  });
};

// Custom hook for saving excerpt with React Query mutation
const useSaveExcerptMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ excerptName, category, content, excerptId, variableMetadata, toggleMetadata, documentationLinks, sourcePageId, sourcePageTitle, sourceSpaceKey, sourceLocalId }) => {
      try {
        const result = await invoke('saveExcerpt', {
          excerptName,
          category,
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

        // Backend returns excerpt data directly (no success wrapper)
        if (!result || !result.excerptId) {
          throw new Error('Failed to save excerpt - invalid response');
        }

        return result;
      } catch (error) {
        logger.errors('Save error:', error);
        throw error;
      }
    },
    onSuccess: (data) => {
      // Invalidate the excerpt cache so it refetches with updated data
      queryClient.invalidateQueries({ queryKey: ['excerpt', data.excerptId] });
      // Also invalidate the excerpts list (for Include macro dropdowns)
      queryClient.invalidateQueries({ queryKey: ['excerpts', 'list'] });
    },
    onError: (error) => {
      logger.errors('Save failed:', error);
    }
  });
};

const App = () => {
  const config = useConfig() || {};
  const context = useProductContext();
  const { handleSubmit, getFieldId } = useForm();
  const excerptId = config.excerptId || null;

  // Access the macro body (rich text content)
  const macroBody = context?.extension?.macro?.body;

  // Use state for controlled components
  const [excerptName, setExcerptName] = useState('');
  const [category, setCategory] = useState('General');
  const [dataLoaded, setDataLoaded] = useState(false); // Track when data has been loaded for key generation
  const [detectedVariables, setDetectedVariables] = useState([]);
  const [variableMetadata, setVariableMetadata] = useState({});
  const [detectedToggles, setDetectedToggles] = useState([]);
  const [toggleMetadata, setToggleMetadata] = useState({});
  const [documentationLinks, setDocumentationLinks] = useState([]);

  // Form state for adding new documentation links
  const [newLinkAnchor, setNewLinkAnchor] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [urlError, setUrlError] = useState('');

  // Track if we've loaded data to prevent infinite loops
  const hasLoadedDataRef = React.useRef(false);
  const lastExcerptIdRef = React.useRef(null);
  
  // Get query client for cache invalidation
  const queryClient = useQueryClient();


  // Invalidate cache on mount to ensure we always fetch fresh data from storage
  useEffect(() => {
    if (excerptId) {
      // Invalidate the cache for this excerpt to force fresh fetch
      queryClient.invalidateQueries({ queryKey: ['excerpt', excerptId] });
    }
  }, [excerptId, queryClient]);

  // Use React Query to fetch excerpt data
  const {
    data: excerptData,
    isLoading: isLoadingExcerpt,
    error: excerptError
  } = useExcerptQuery(excerptId, !!excerptId);

  // Fetch admin URL dynamically
  const { data: adminUrl } = useAdminUrlQuery();

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

  // Load excerpt data from React Query
  // This effect only runs after data has been fetched (loading guard prevents rendering during load)
  useEffect(() => {
    // Reset flag if excerptId changed
    if (lastExcerptIdRef.current !== excerptId) {
      hasLoadedDataRef.current = false;
      setDataLoaded(false); // Reset data loaded flag when excerptId changes
      lastExcerptIdRef.current = excerptId;
    }

    if (!excerptId) {
      // No excerpt ID, load from config if available (only once)
      if (!hasLoadedDataRef.current) {
        setExcerptName(config.excerptName || '');
        setCategory(config.category || 'General');
        hasLoadedDataRef.current = true;
      }
      return;
    }

    // Only process data when loading is complete (loading guard ensures this)
    // When excerpt data is available, always use storage values (authoritative source)
    if (!isLoadingExcerpt) {
      if (excerptData) {
        // Data loaded successfully - use storage values (authoritative source)
        const storageName = excerptData.name;
        const storageCategory = excerptData.category;
        
        // Determine the name to use - always prefer storage value
        let nameToSet = '';
        if (storageName !== undefined && storageName !== null && String(storageName).trim() !== '') {
          nameToSet = String(storageName).trim();
        } else if (config.excerptName) {
          nameToSet = String(config.excerptName).trim();
        }
        
        // Always update state (React will handle batching and only update if different)
        // This ensures the field always reflects the current data from storage
        setExcerptName(nameToSet);
        
        // Mark that data has been loaded (for key generation to force remount)
        if (!dataLoaded && nameToSet) {
          setDataLoaded(true);
        }
        
        // Determine the category to use
        let categoryToSet = 'General';
        if (storageCategory && String(storageCategory).trim() !== '') {
          categoryToSet = String(storageCategory).trim();
        } else if (config.category) {
          categoryToSet = String(config.category).trim();
        }
        
        // Always update state
        setCategory(categoryToSet);

        // Load variable metadata, toggle metadata, and documentation links only once per excerptId
        if (!hasLoadedDataRef.current) {
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
      } else {
        // Loading complete but no data found - excerpt doesn't exist in storage
        // Fall back to config values
        setExcerptName(config.excerptName || '');
        setCategory(config.category || 'General');
      }
    }
  }, [excerptId, excerptData, isLoadingExcerpt, config.excerptName, config.category]);

  // Detect variables whenever macro body changes
  useEffect(() => {
    if (!macroBody) {
      setDetectedVariables([]);
      return;
    }

    // Call backend to detect variables
    const detectVars = async () => {
      try {
        const result = await invoke('detectVariablesFromContent', { content: macroBody });
        if (result.success) {
          setDetectedVariables(result.variables);
        }
      } catch (err) {
        logger.errors('Error detecting variables:', err);
      }
    };

    detectVars();
  }, [macroBody]);

  // Detect toggles whenever macro body changes
  useEffect(() => {
    if (!macroBody) {
      setDetectedToggles([]);
      return;
    }

    // Call backend to detect toggles
    const detectToggs = async () => {
      try {
        const result = await invoke('detectTogglesFromContent', { content: macroBody });
        if (result.success) {
          setDetectedToggles(result.toggles);
        }
      } catch (err) {
        logger.errors('Error detecting toggles:', err);
      }
    };

    detectToggs();
  }, [macroBody]);

  // Convert categories array to options format for Select component
  const categoryOptions = categories.map(cat => ({
    label: cat,
    value: cat
  }));

  const onSubmit = async (formData) => {
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

    // Extract page info from context (router.getContext() not available in config context)
    const sourcePageId = context?.contentId || context?.extension?.content?.id;
    const sourcePageTitle = context?.contentTitle || context?.extension?.content?.title;
    const sourceSpaceKey = context?.spaceKey || context?.extension?.space?.key;

    // Use React Query mutation to save
    return new Promise((resolve, reject) => {
      saveExcerptMutation({
        excerptName,
        category,
        content: macroBody,
        excerptId,
        variableMetadata: variablesWithMetadata,
        toggleMetadata: togglesWithMetadata,
        documentationLinks,
        sourcePageId,
        sourcePageTitle,
        sourceSpaceKey,
        sourceLocalId: context?.localId
      }, {
        onSuccess: async (result) => {
          try {
            // Only submit the config fields (not the content, which is in the body)
            const configToSubmit = {
              excerptId: result.excerptId,
              excerptName: excerptName,
              category: category,
              variables: result.variables,
              toggles: result.toggles
            };

            // Save the configuration to the macro using view.submit()
            // Use a small delay to ensure the mutation completes before modal closes
            await new Promise(resolve => setTimeout(resolve, 100));
            await view.submit({ config: configToSubmit });
            resolve();
          } catch (error) {
            logger.errors('Error submitting config:', error);
            // Still resolve to allow modal to close even if submit fails
            // The data is already saved to storage, so this is just updating the macro config
            resolve();
          }
        },
        onError: (error) => {
          logger.errors('Failed to save excerpt:', error);
          reject(error);
        }
      });
    });
  };

  // Show loading state while fetching data from storage (only for existing excerpts)
  // For new excerpts (no excerptId), we can show the form immediately
  if (excerptId && isLoadingExcerpt) {
    return (
      <Form>
        <FormSection>
          <Text>Loading source data from storage...</Text>
        </FormSection>
      </Form>
    );
  }

  // Show error state if fetch failed
  if (excerptId && excerptError) {
    return (
      <Form>
        <FormSection>
          <SectionMessage appearance="error">
            <Text>Failed to load source data: {excerptError.message}</Text>
          </SectionMessage>
        </FormSection>
      </Form>
    );
  }

  return (
    <Form onSubmit={handleSubmit(onSubmit)}>
      <Tabs>
        <TabList>
          <Tab>Name/Category</Tab>
          <Tab>Variables</Tab>
          <Tab>Toggles</Tab>
          <Tab>Documentation</Tab>
        </TabList>

        <TabPanel>
          <FormSection>
            <Label labelFor={getFieldId('excerptName')}>
              Blueprint Standard Source Name
            </Label>
            <StableTextfield
              id={getFieldId('excerptName')}
              stableKey={`source-excerpt-name-${excerptId || 'new'}-${dataLoaded ? 'loaded' : 'empty'}`}
              value={excerptName || ''}
              placeholder=""
              isDisabled={false}
              onChange={(e) => setExcerptName(e.target.value)}
            />

            <Label labelFor={getFieldId('category')}>
              Blueprint Standard Category
            </Label>
            <Select
              id={getFieldId('category')}
              options={categoryOptions}
              value={isLoadingCategories ? undefined : categoryOptions.find(opt => opt.value === category)}
              placeholder={isLoadingCategories ? 'Loading...' : undefined}
              onChange={(e) => setCategory(e.value)}
            />

            <Text>{' '}</Text>
            <SectionMessage appearance="discovery">
              <Text>Edit macro body in the page editor. Use {'{{variable}}'} syntax for variables. IMPORTANT: After clicking "Save", you MUST publish the page to persist changes!</Text>
            </SectionMessage>
          </FormSection>
        </TabPanel>

        <TabPanel>
          <FormSection>
            {macroBody && detectedVariables.length === 0 && (
              <Text><Em>Checking for variables...</Em></Text>
            )}

            {detectedVariables.length === 0 && !macroBody && (
              <Text>No variables detected. Add {'{{variable}}'} syntax to your macro body to create variables.</Text>
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
                      stableKey={`source-var-desc-${variable.name}`}
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
                      stableKey={`source-var-example-${variable.name}`}
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

            <Text>{' '}</Text>
            <SectionMessage appearance="discovery">
              <Text>Edit macro body in the page editor. Use {'{{variable}}'} syntax for variables. IMPORTANT: After clicking "Save", you MUST publish the page to persist changes!</Text>
            </SectionMessage>
          </FormSection>
        </TabPanel>

        <TabPanel>
          <FormSection>
            {macroBody && detectedToggles.length === 0 && (
              <Text><Em>Checking for toggles...</Em></Text>
            )}

            {detectedToggles.length === 0 && !macroBody && (
              <Text>No toggles detected. Add {'{{toggle:name}}'} ... {'{{/toggle:name}}'} syntax to your macro body to create toggles.</Text>
            )}

            {detectedToggles.length > 0 && (
              <Fragment>
                {detectedToggles.map((toggle) => (
                  <Fragment key={toggle.name}>
                    <Text>{' '}</Text>
                    <Text><Strong><Code>{`{{toggle:${toggle.name}}}`}</Code></Strong></Text>
                    <StableTextfield
                      id={`toggle-desc-${toggle.name}`}
                      stableKey={`source-toggle-desc-${toggle.name}`}
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

            <Text>{' '}</Text>
            <SectionMessage appearance="discovery">
              <Text>Edit macro body in the page editor. Use {'{{toggle:name}}'} and {'{{/toggle:name}}'} to wrap content that can be toggled on/off. IMPORTANT: After clicking "Save", you MUST publish the page to persist changes!</Text>
            </SectionMessage>
          </FormSection>
        </TabPanel>

        {/* Documentation Tab - Links */}
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
              stableKey="source-doc-link-anchor"
              label="Anchor Text"
              placeholder={isLoadingExcerpt ? 'Loading...' : 'e.g., API Reference'}
              value={newLinkAnchor}
              isDisabled={isLoadingExcerpt}
              onChange={(e) => setNewLinkAnchor(e.target.value)}
            />
            <StableTextfield
              stableKey="source-doc-link-url"
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
            <Text>{' '}</Text>
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

      <FormFooter>
        <Inline space="space.200" alignBlock="center" spread="space-between">
          {excerptId && (
            <Text size="small">
              ID: <Code>{excerptId}</Code>
            </Text>
          )}
          <Inline space="space.200">
            <Button appearance="primary" type="submit">
              Save
            </Button>
            <Button
              appearance="link"
              onClick={async () => {
                try {
                  // Use dynamically fetched admin URL, or fallback to hardcoded URL
                  const urlToUse = adminUrl || '/wiki/admin/forge?id=ari%3Acloud%3Aecosystem%3A%3Aextension%2Fbe1ff96b-d44d-4975-98d3-25b80a813bdd%2Fbbebcb82-f8af-4cd4-8ddb-38c88a94d142%2Fstatic%2Fblueprint-standards-admin';
                  
                  // Extract just the path and query from the full URL if needed
                  let pathToNavigate = urlToUse;
                  if (urlToUse.startsWith('http://') || urlToUse.startsWith('https://')) {
                    // Extract path and query from full URL
                    const urlObj = new URL(urlToUse);
                    pathToNavigate = urlObj.pathname + urlObj.search;
                  }
                  
                  await router.open(pathToNavigate);
                } catch (err) {
                  logger.errors('Navigation error:', err);
                }
              }}
            >
              View Admin
            </Button>
          </Inline>
        </Inline>
      </FormFooter>
    </Form>
  );
};

ForgeReconciler.render(
  <QueryClientProvider client={queryClient}>
    <React.StrictMode>
      <App />
    </React.StrictMode>
  </QueryClientProvider>
);
