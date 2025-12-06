/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                    ⚠️  CRITICAL: CLONE COMPONENT WARNING  ⚠️                  ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║                                                                              ║
 * ║  This component (source-config.jsx) and ExcerptPreviewModal.jsx are         ║
 * ║  INTENTIONAL CLONES that must be kept in sync.                              ║
 * ║                                                                              ║
 * ║  WHY THEY'RE SEPARATE:                                                       ║
 * ║  - source-config.jsx uses Forge macro APIs (useConfig, useProductContext,   ║
 * ║    view.submit) that are unavailable in the Admin context                   ║
 * ║  - ExcerptPreviewModal runs inside the Admin UI Modal context               ║
 * ║  - These Forge-specific integrations make true code sharing risky           ║
 * ║                                                                              ║
 * ║  🔴 MANDATORY: When modifying EITHER component:                              ║
 * ║     1. Check if the same change applies to the other                        ║
 * ║     2. Apply identical changes to BOTH to prevent drift                     ║
 * ║     3. Both must call the SAME backend functions for detection/save         ║
 * ║                                                                              ║
 * ║  SHARED BACKEND FUNCTIONS (must be identical in both):                       ║
 * ║  - detectVariablesFromContent → detectVariablesWithToggleContext            ║
 * ║  - detectTogglesFromContent → detectToggles                                 ║
 * ║  - saveExcerpt                                                              ║
 * ║                                                                              ║
 * ║  RELATED FILES:                                                              ║
 * ║  - src/components/admin/ExcerptPreviewModal.jsx (the clone)                 ║
 * ║  - src/components/common/SourceMetadataTabs.jsx (shared UI component)       ║
 * ║  - src/hooks/useSourceEditor.js (shared hook - used by ExcerptPreviewModal) ║
 * ║                                                                              ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import React, { Fragment, useState, useEffect } from 'react';
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
import { SourceMetadataTabs } from './components/common/SourceMetadataTabs';
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

      if (!result.success || !result.data?.excerpt) {
        throw new Error(result.error || 'Failed to load excerpt');
      }

      return result.data.excerpt;
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
      if (result.success && result.data && result.data.adminUrl) {
        return result.data.adminUrl;
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
    mutationFn: async ({ excerptName, category, bespoke, headless, content, excerptId, variableMetadata, toggleMetadata, documentationLinks, sourcePageId, sourcePageTitle, sourceSpaceKey, sourceLocalId }) => {
      try {
        const result = await invoke('saveExcerpt', {
          excerptName,
          category,
          bespoke,
          headless,
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
  const [bespoke, setBespoke] = useState(false); // Track whether Source is bespoke (custom) vs standard
  const [headless, setHeadless] = useState(false); // Track whether Source is headless (no heading/emoji)
  const [dataLoaded, setDataLoaded] = useState(false); // Track when data has been loaded for key generation
  const [detectedVariables, setDetectedVariables] = useState([]);
  const [variableMetadata, setVariableMetadata] = useState({});
  const [detectedToggles, setDetectedToggles] = useState([]);
  const [toggleMetadata, setToggleMetadata] = useState({});
  const [documentationLinks, setDocumentationLinks] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false); // Track when save is in progress until modal closes

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

        // Load variable metadata, toggle metadata, documentation links, and bespoke only once per excerptId
        if (!hasLoadedDataRef.current) {
          // Load bespoke and headless flags
          setBespoke(excerptData.bespoke || false);
          setHeadless(excerptData.headless || false);

          // Load variable metadata (description and example only)
          // Note: 'required' is now auto-computed from toggle context, not stored in metadata
          if (excerptData.variables && Array.isArray(excerptData.variables)) {
            const metadata = {};
            excerptData.variables.forEach(v => {
              metadata[v.name] = {
                description: v.description || '',
                example: v.example || ''
                // 'required' is auto-computed from toggle context, not user-editable
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
        if (result.success && result.data) {
          setDetectedVariables(result.data.variables);
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
        if (result.success && result.data) {
          setDetectedToggles(result.data.toggles);
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
    // Merge detected variables with their metadata (description/example only)
    // Note: 'required' is NOT sent - it's auto-computed from toggle context on the backend
    const variablesWithMetadata = detectedVariables.map(v => ({
      name: v.name,
      description: variableMetadata[v.name]?.description || '',
      example: variableMetadata[v.name]?.example || ''
      // 'required' is auto-computed by backend based on toggle context
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
    setIsSubmitting(true); // Set submitting state immediately
    return new Promise((resolve, reject) => {
      saveExcerptMutation({
        excerptName,
        category,
        bespoke,
        headless,
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
            // result is from saveExcerpt mutation which now returns result.data
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
            // Keep isSubmitting true - modal will close and component will unmount
            resolve();
          } catch (error) {
            logger.errors('Error submitting config:', error);
            setIsSubmitting(false); // Reset on error so user can try again
            // Still resolve to allow modal to close even if submit fails
            // The data is already saved to storage, so this is just updating the macro config
            resolve();
          }
        },
        onError: (error) => {
          logger.errors('Failed to save excerpt:', error);
          setIsSubmitting(false); // Reset on error so user can try again
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
      <SourceMetadataTabs
        excerptName={excerptName}
        setExcerptName={setExcerptName}
        category={category}
        setCategory={setCategory}
        bespoke={bespoke}
        setBespoke={setBespoke}
        headless={headless}
        setHeadless={setHeadless}
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
        hasContent={!!macroBody}
        hasDetectedVariables={detectedVariables.length > 0 || !macroBody}
        hasDetectedToggles={detectedToggles.length > 0 || !macroBody}
        getFieldId={getFieldId}
        excerptId={excerptId}
        dataLoaded={dataLoaded}
        variant="config"
        content={macroBody}
      />

      <FormFooter>
        <Inline space="space.200" alignBlock="center" spread="space-between">
          {excerptId && (
            <Text size="small">
              ID: <Code>{excerptId}</Code>
            </Text>
          )}
          <Inline space="space.200">
            <Button 
              appearance="primary" 
              type="submit"
              isDisabled={isSavingExcerpt || isSubmitting}
              isLoading={isSavingExcerpt || isSubmitting}
            >
              {(isSavingExcerpt || isSubmitting) ? 'Saving...' : 'Save'}
            </Button>
            <Button
              appearance="link"
              isDisabled={isSavingExcerpt}
              onClick={async () => {
                try {
                  // Use hardcoded URL
                  const urlToUse = 'https://seatgeek.atlassian.net/wiki/admin/forge/apps/be1ff96b-d44d-4975-98d3-25b80a813bdd/bbebcb82-f8af-4cd4-8ddb-38c88a94d142/blueprint-standards-admin';
                  await router.open(urlToUse);
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
