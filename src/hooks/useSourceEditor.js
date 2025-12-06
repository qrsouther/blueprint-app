/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                         useSourceEditor Hook                                 ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║                                                                              ║
 * ║  CURRENT USAGE:                                                              ║
 * ║  - ExcerptPreviewModal.jsx uses this hook                                   ║
 * ║  - source-config.jsx does NOT use this hook (uses its own inline logic)     ║
 * ║                                                                              ║
 * ║  WHY source-config.jsx doesn't use this hook:                               ║
 * ║  - source-config.jsx has Forge-specific integrations (useConfig,            ║
 * ║    useProductContext, view.submit) that are tightly coupled                 ║
 * ║  - Refactoring it to use this hook was deemed too risky                     ║
 * ║  - source-config.jsx is the "gold standard" that works correctly            ║
 * ║                                                                              ║
 * ║  IMPORTANT: This hook's behavior should match source-config.jsx             ║
 * ║  If there's ever a discrepancy, source-config.jsx is authoritative.         ║
 * ║                                                                              ║
 * ║  RELATED FILES:                                                              ║
 * ║  - src/source-config.jsx (gold standard, doesn't use this hook)             ║
 * ║  - src/components/admin/ExcerptPreviewModal.jsx (uses this hook)            ║
 * ║                                                                              ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 * 
 * Provides shared Source editing logic for:
 * - Variable detection (with auto-computed 'required' based on toggle context)
 * - Toggle detection  
 * - Metadata loading/saving
 * - Category management
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@forge/bridge';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCategoriesQuery } from './admin-hooks';
import { logger } from '../utils/logger.js';

/**
 * Custom hook for fetching excerpt data with React Query
 * Forces fresh fetch on every component load for Source Config
 */
const useExcerptQuery = (excerptId, enabled, options = {}) => {
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
    staleTime: options.alwaysFresh ? 0 : 1000 * 60 * 5, // 5 minutes unless alwaysFresh
    gcTime: 1000 * 60 * 30, // 30 minutes
    refetchOnMount: options.alwaysFresh ? 'always' : true,
    refetchOnWindowFocus: false,
  });
};

/**
 * Custom hook for saving excerpt with React Query mutation
 */
const useSaveExcerptMutation = (onSuccessCallback) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
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
    }) => {
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
          const errorMessage = result?.error || 'Failed to save Source';
          throw new Error(errorMessage);
        }

        if (!result.data || !result.data.excerptId) {
          throw new Error('Failed to save Source - invalid response');
        }

        return result.data;
      } catch (error) {
        logger.errors('[useSourceEditor] Save error:', error);
        throw error;
      }
    },
    onSuccess: (data) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['excerpt', data.excerptId] });
      queryClient.invalidateQueries({ queryKey: ['excerpts', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['excerpts'] });
      
      // Call the success callback if provided
      if (onSuccessCallback) {
        onSuccessCallback(data);
      }
    },
    onError: (error) => {
      logger.errors('[useSourceEditor] Save failed:', error);
    }
  });
};

/**
 * Main useSourceEditor hook
 * 
 * @param {Object} options
 * @param {string} options.excerptId - The excerpt ID (if editing existing)
 * @param {Object} options.content - The ADF content (from macro body or storage)
 * @param {boolean} options.alwaysFreshData - Force fresh data fetch on every load
 * @param {Function} options.onSaveSuccess - Callback after successful save
 */
export function useSourceEditor({ 
  excerptId, 
  content: initialContent,
  alwaysFreshData = false,
  onSaveSuccess
}) {
  // Refs for tracking state
  const hasLoadedDataRef = useRef(false);
  const lastExcerptIdRef = useRef(null);

  // Form state
  const [excerptName, setExcerptName] = useState('');
  const [category, setCategory] = useState('General');
  const [bespoke, setBespoke] = useState(false);
  const [headless, setHeadless] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Detection state
  const [detectedVariables, setDetectedVariables] = useState([]);
  const [detectedToggles, setDetectedToggles] = useState([]);

  // Metadata state
  const [variableMetadata, setVariableMetadata] = useState({});
  const [toggleMetadata, setToggleMetadata] = useState({});
  const [documentationLinks, setDocumentationLinks] = useState([]);

  // Link form state
  const [newLinkAnchor, setNewLinkAnchor] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [urlError, setUrlError] = useState('');

  // Queries
  const { 
    data: excerptData, 
    isLoading: isLoadingExcerpt, 
    error: excerptError 
  } = useExcerptQuery(excerptId, !!excerptId, { alwaysFresh: alwaysFreshData });

  const { 
    data: categories = ['General'], 
    isLoading: isLoadingCategories 
  } = useCategoriesQuery();

  // Mutation
  const saveExcerptMutation = useSaveExcerptMutation(onSaveSuccess);

  // Content to use for detection (from prop or loaded data)
  const content = initialContent || excerptData?.content;

  // Reset state when excerptId changes
  useEffect(() => {
    if (lastExcerptIdRef.current !== excerptId) {
      hasLoadedDataRef.current = false;
      lastExcerptIdRef.current = excerptId;
      
      // Reset all state
      setExcerptName('');
      setCategory('General');
      setBespoke(false);
      setHeadless(false);
      setVariableMetadata({});
      setToggleMetadata({});
      setDocumentationLinks([]);
      setDetectedVariables([]);
      setDetectedToggles([]);
      setDataLoaded(false);
    }
  }, [excerptId]);

  // Load data from excerpt when available
  useEffect(() => {
    if (!excerptId || !excerptData || hasLoadedDataRef.current) return;

    // Set form fields from loaded data
    if (excerptData.name) setExcerptName(excerptData.name);
    if (excerptData.category) setCategory(excerptData.category);
    if (excerptData.bespoke !== undefined) setBespoke(excerptData.bespoke);
    if (excerptData.headless !== undefined) setHeadless(excerptData.headless);

    // Load variable metadata (description and example only - required is auto-computed)
    if (excerptData.variables && Array.isArray(excerptData.variables)) {
      const metadata = {};
      excerptData.variables.forEach(v => {
        metadata[v.name] = {
          description: v.description || '',
          example: v.example || ''
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
    setDataLoaded(true);
  }, [excerptId, excerptData]);

  // Detect variables from content - calls backend for auto-computed 'required'
  useEffect(() => {
    if (!content) {
      setDetectedVariables([]);
      return;
    }

    const detectVars = async () => {
      try {
        const result = await invoke('detectVariablesFromContent', { content });
        if (result.success && result.data) {
          setDetectedVariables(result.data.variables);
        }
      } catch (err) {
        logger.errors('[useSourceEditor] Error detecting variables:', err);
        setDetectedVariables([]);
      }
    };

    detectVars();
  }, [content]);

  // Detect toggles from content - calls backend for consistency
  useEffect(() => {
    if (!content) {
      setDetectedToggles([]);
      return;
    }

    const detectToggs = async () => {
      try {
        const result = await invoke('detectTogglesFromContent', { content });
        if (result.success && result.data) {
          setDetectedToggles(result.data.toggles);
        }
      } catch (err) {
        logger.errors('[useSourceEditor] Error detecting toggles:', err);
        setDetectedToggles([]);
      }
    };

    detectToggs();
  }, [content]);

  // Build save payload
  const buildSavePayload = useCallback((additionalData = {}) => {
    // Merge detected variables with their metadata
    const variablesWithMetadata = detectedVariables.map(v => ({
      name: v.name,
      description: variableMetadata[v.name]?.description || '',
      example: variableMetadata[v.name]?.example || ''
      // Note: 'required' is NOT sent - it's auto-computed by backend
    }));

    // Merge detected toggles with their metadata
    const togglesWithMetadata = detectedToggles.map(t => ({
      name: t.name,
      description: toggleMetadata[t.name]?.description || ''
    }));

    return {
      excerptName,
      category,
      bespoke,
      headless,
      content,
      excerptId,
      variableMetadata: variablesWithMetadata,
      toggleMetadata: togglesWithMetadata,
      documentationLinks,
      ...additionalData
    };
  }, [
    excerptName, 
    category, 
    bespoke, 
    headless, 
    content, 
    excerptId, 
    detectedVariables, 
    variableMetadata, 
    detectedToggles, 
    toggleMetadata, 
    documentationLinks
  ]);

  // Save function
  const save = useCallback(async (additionalData = {}) => {
    const payload = buildSavePayload(additionalData);
    return saveExcerptMutation.mutateAsync(payload);
  }, [buildSavePayload, saveExcerptMutation]);

  // Category options for Select
  const categoryOptions = categories.map(cat => ({
    label: cat,
    value: cat
  }));

  return {
    // Form state
    excerptName,
    setExcerptName,
    category,
    setCategory,
    bespoke,
    setBespoke,
    headless,
    setHeadless,

    // Detection state
    detectedVariables,
    detectedToggles,

    // Metadata state
    variableMetadata,
    setVariableMetadata,
    toggleMetadata,
    setToggleMetadata,
    documentationLinks,
    setDocumentationLinks,

    // Link form state
    newLinkAnchor,
    setNewLinkAnchor,
    newLinkUrl,
    setNewLinkUrl,
    urlError,
    setUrlError,

    // Loading states
    isLoadingExcerpt,
    isLoadingCategories,
    excerptError,
    dataLoaded,

    // Data
    excerptData,
    categories,
    categoryOptions,
    content,

    // Actions
    save,
    buildSavePayload,
    isSaving: saveExcerptMutation.isPending,
    saveError: saveExcerptMutation.error,

    // Computed flags
    hasContent: !!content,
    hasDetectedVariables: detectedVariables.length > 0 || !content,
    hasDetectedToggles: detectedToggles.length > 0 || !content
  };
}

