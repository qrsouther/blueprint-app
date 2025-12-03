/**
 * EmbedContainer Component
 *
 * Container component following the Container/Presentational pattern.
 * This is the main entry point for the Blueprint Standard Embed macro in Forge.
 *
 * ARCHITECTURE (Simplified):
 * - Edit Mode: Uses useEmbedEditSession hook for all form management
 * - View Mode: Uses React Query for cached content with staleness detection
 *
 * KEY PRINCIPLE: During editing, React Hook Form (via the hook) is the single
 * source of truth. No bidirectional sync with storage during edit sessions.
 *
 * Data Flow:
 * - Enter Edit: Load from Forge storage → form.reset()
 * - During Edit: Form is truth, localStorage saves on blur (crash recovery)
 * - Exit: Save form to Forge storage (keep localStorage as backup)
 * - Publish: Save form to Forge storage + inject content + clear localStorage
 *
 * @see https://react.dev/learn/thinking-in-react#step-5-add-inverse-data-flow
 */

import React, { Fragment, useState, useEffect } from 'react';
import { useWatch } from 'react-hook-form';
import ForgeReconciler, {
  Text,
  Button,
  ButtonGroup,
  Stack,
  Inline,
  Box,
  Spinner,
  SectionMessage,
  xcss,
  useProductContext
} from '@forge/react';
import { invoke } from '@forge/bridge';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

// Import ADF rendering utilities
import {
  cleanAdfForRenderer,
  filterContentByToggles,
  substituteVariablesInAdf,
  insertCustomParagraphsInAdf,
  insertInternalNotesInAdf
} from './utils/adf-rendering-utils';

// Import React Query hooks
import {
  useExcerptData,
  useVariableValues,
  useCachedContent
} from './hooks/embed-hooks';

// Import the new edit session hook
import { useEmbedEditSession } from './hooks/useEmbedEditSession';

// Import UI components
import { EmbedViewMode } from './components/embed/EmbedViewMode';
import { EmbedEditMode } from './components/embed/EmbedEditMode';
import { DeactivatedEmbedsSelector } from './components/embed/DeactivatedEmbedsSelector';

// Import embed styles
import { editButtonBorderContainerStyle } from './styles/embed-styles';

// Import logger
import { logger } from './utils/logger';
import ErrorBoundary from './components/common/ErrorBoundary.jsx';

/**
 * Check if an Embed is incomplete (missing required variable values)
 * 
 * An Embed is considered incomplete if:
 * - ALL variable values are null/empty, OR
 * - ANY variable marked required: true has null/empty value
 * 
 * Exception: If in freeform mode with content, the Embed is NOT incomplete
 * (freeform mode bypasses the Source structure entirely)
 * 
 * @param {Object} excerpt - The Source excerpt with variables array
 * @param {Object} variableValues - Object of variable name -> value
 * @param {Object} embedConfig - Optional config with isFreeformMode and freeformContent
 * @returns {boolean} True if Embed is incomplete
 */
const isEmbedIncomplete = (excerpt, variableValues, embedConfig = {}) => {
  // If in freeform mode with content, it's NOT incomplete
  // Freeform mode bypasses Source structure, so empty variables are expected
  if (embedConfig.isFreeformMode && embedConfig.freeformContent?.trim()) {
    return false;
  }

  if (!excerpt?.variables || excerpt.variables.length === 0) {
    return false; // No variables = not incomplete
  }

  const values = variableValues || {};
  
  // Check if ALL values are empty
  const allEmpty = excerpt.variables.every(v => {
    const value = values[v.name];
    return !value || value.trim() === '';
  });
  
  if (allEmpty) {
    return true;
  }
  
  // Check if any REQUIRED variable is empty
  const hasEmptyRequired = excerpt.variables.some(v => {
    if (!v.required) return false;
    const value = values[v.name];
    return !value || value.trim() === '';
  });
  
  return hasEmptyRequired;
};

// Create a client for React Query
const styles3 = xcss({ padding: 'space.200', marginBottom: 'space.200' });
const styles2 = xcss({ padding: 'space.050' });
const styles = xcss({ padding: 'space.050' });
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      cacheTime: 1000 * 60 * 30, // 30 minutes
      refetchOnWindowFocus: false,
      retry: 1
    }
  }
});

const App = () => {
  const context = useProductContext();
  const queryClient = useQueryClient();
  const isEditing = context?.extension?.isEditing;
  const effectiveLocalId = context?.localId;

  // ============================================================================
  // LOCKED PAGE MODEL: Local edit state
  // ============================================================================
  const [isEditingEmbed, setIsEditingEmbed] = useState(false);
  const inEditMode = isEditing || isEditingEmbed;

  // ============================================================================
  // VIEW MODE STATE
  // ============================================================================
  const [content, setContent] = useState(null);
  const [excerptForViewMode, setExcerptForViewMode] = useState(null);
  const [isStale, setIsStale] = useState(false);
  const [isCheckingStaleness, setIsCheckingStaleness] = useState(false);
  const [sourceLastModified, setSourceLastModified] = useState(null);
  const [includeLastSynced, setIncludeLastSynced] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showDiffView, setShowDiffView] = useState(false);
  const [latestRenderedContent, setLatestRenderedContent] = useState(null);
  const [syncedContent, setSyncedContent] = useState(null);

  // ============================================================================
  // PUBLISH STATE
  // ============================================================================
  const [publishStatus, setPublishStatus] = useState(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState(null);

  // ============================================================================
  // DEACTIVATED EMBEDS STATE
  // ============================================================================
  const [deactivatedEmbeds, setDeactivatedEmbeds] = useState([]);
  const [showDeactivatedSelector, setShowDeactivatedSelector] = useState(false);
  const [isLoadingDeactivated, setIsLoadingDeactivated] = useState(false);
  const [isRestoringEmbed, setIsRestoringEmbed] = useState(false);

  // ============================================================================
  // UI STATE
  // ============================================================================
  const [selectedTabIndex, setSelectedTabIndex] = useState(null); // null until excerpt loads
  const [insertionType, setInsertionType] = useState('body');
  const [selectedPosition, setSelectedPosition] = useState(null);
  const [customText, setCustomText] = useState('');

  // ============================================================================
  // EDIT SESSION HOOK
  // ============================================================================
  // This hook manages ALL form state during edit mode:
  // - Form initialization from Forge storage
  // - Draft recovery from localStorage
  // - Blur-based localStorage saves
  // - Source switching with variable preservation
  // - saveAndExit() and saveAndPublish()
  
  const editSession = useEmbedEditSession(effectiveLocalId, {
    onPublishChapter: async (values) => {
      // This is called by the hook's saveAndPublish after saving form values
      // We need to do the actual injection here
      const pageId = context?.contentId || context?.extension?.content?.id;
      
      if (!pageId) {
        return { success: false, error: 'Unable to determine page ID' };
      }

      try {
        const result = await invoke('publishChapter', {
          pageId,
          localId: effectiveLocalId,
          excerptId: values.excerptId,
          heading: values.customHeading || editSession.excerpt?.name || 'Untitled Chapter',
          variableValues: values.variableValues || {},
          toggleStates: values.toggleStates || {},
          customInsertions: values.customInsertions || [],
          internalNotes: values.internalNotes || [],
          complianceLevel: values.complianceLevel || null,
          isFreeformMode: values.isFreeformMode || false,
          freeformContent: values.freeformContent || '',
          smartCasingEnabled: values.smartCasingEnabled !== false
        });

        if (result.success) {
          setPublishStatus({
            isPublished: true,
            publishedAt: result.publishedAt,
            publishedVersion: result.pageVersion,
            chapterId: result.chapterId
          });

          // Don't navigate - let Confluence's toast notification handle page reload
          // User can reload via toast if they want to see the changes

          return { 
            success: true,
            publishedAt: result.publishedAt,
            pageVersion: result.pageVersion,
            chapterId: result.chapterId
          };
        }

        return { success: false, error: result.error };
      } catch (error) {
        logger.errors('[EmbedContainer] Publish error:', error);
        setPublishError(error.message);
        return { success: false, error: error.message };
      }
    },
    context
  });

  // Watch form values directly in EmbedContainer for live preview updates
  // useWatch triggers re-renders when form values change
  const watchedVariableValues = useWatch({ 
    control: editSession.control, 
    name: 'variableValues'
  }) || {};
  const watchedToggleStates = useWatch({ 
    control: editSession.control, 
    name: 'toggleStates'
  }) || {};
  const watchedCustomInsertions = useWatch({ 
    control: editSession.control, 
    name: 'customInsertions'
  }) || [];
  const watchedInternalNotes = useWatch({ 
    control: editSession.control, 
    name: 'internalNotes'
  }) || [];
  const watchedIsFreeformMode = useWatch({ 
    control: editSession.control, 
    name: 'isFreeformMode'
  }) || false;
  const watchedFreeformContent = useWatch({ 
    control: editSession.control, 
    name: 'freeformContent'
  }) || '';
  const watchedSmartCasingEnabled = useWatch({ 
    control: editSession.control, 
    name: 'smartCasingEnabled'
  }) !== false; // Default true
  
  // Set initial tab index based on whether excerpt has toggles
  // Only set once when excerpt first loads
  useEffect(() => {
    if (editSession.excerpt && selectedTabIndex === null) {
      const hasToggles = editSession.excerpt.toggles && editSession.excerpt.toggles.length > 0;
      setSelectedTabIndex(hasToggles ? 0 : 1);
    }
  }, [editSession.excerpt, selectedTabIndex]);

  // For View Mode, we still need to load variable values for staleness detection
  const {
    data: variableValuesData,
    isLoading: isLoadingVariableValues
  } = useVariableValues(effectiveLocalId, !inEditMode);

  // Get the selectedExcerptId - from hook in edit mode, from storage in view mode
  const selectedExcerptId = inEditMode 
    ? editSession.excerptId 
    : variableValuesData?.excerptId;

  // Get excerpt for view mode
  const {
    data: excerptFromQuery,
    isLoading: isLoadingExcerpt,
    error: excerptError
  } = useExcerptData(selectedExcerptId, !inEditMode && !!selectedExcerptId);

  // Use cached content for view mode
  const {
    data: cachedContentData,
    isLoading: isLoadingCachedContent
  } = useCachedContent(
    effectiveLocalId,
    selectedExcerptId,
    !isEditing && !isEditingEmbed,
    context,
    null,
    setExcerptForViewMode
  );

  // Get excerpt - from hook in edit mode, from query in view mode
  const excerpt = inEditMode ? editSession.excerpt : (excerptForViewMode || excerptFromQuery);

  // ============================================================================
  // PUBLISH STATUS FETCH
  // ============================================================================
  useEffect(() => {
    if (!effectiveLocalId) return;

    const fetchPublishStatus = async () => {
      try {
        const result = await invoke('getPublishStatus', { localId: effectiveLocalId });
        if (result.success) {
          setPublishStatus(result.data);
        }
      } catch (error) {
        logger.errors('[EmbedContainer] Error fetching publish status:', error);
      }
    };

    fetchPublishStatus();
  }, [effectiveLocalId]);

  // ============================================================================
  // VIEW MODE: Set content from cached data
  // ============================================================================
  // IMPORTANT: Only set content in view mode if content is NOT published
  // Published content is already on the page natively, so we shouldn't render it again
  useEffect(() => {
    if (!isEditing && !isEditingEmbed && cachedContentData) {
      // Only set content if it's not published (published content is already on the page)
      if (!publishStatus?.isPublished) {
        setContent(cachedContentData.content);
      } else {
        // Content is published, don't set it (it's already on the page natively)
        setContent(null);
      }
    }
  }, [isEditing, isEditingEmbed, cachedContentData, publishStatus?.isPublished]);

  // ============================================================================
  // VIEW MODE: Staleness detection
  // ============================================================================
  useEffect(() => {
    // Don't check staleness while editing
    if (isEditing || isEditingEmbed || !selectedExcerptId || !effectiveLocalId) {
      return;
    }

    // For published content, we don't need content to be set (it's on the page)
    // For non-published content, we need content to be set
    if (!publishStatus?.isPublished && !content) {
      return;
    }

    const jitter = Math.random() * 500;

    const checkStaleness = async () => {
      setIsCheckingStaleness(true);
      try {
        const excerptResult = await invoke('getExcerpt', { excerptId: selectedExcerptId });
        if (!excerptResult.success || !excerptResult.data?.excerpt) {
          setIsCheckingStaleness(false);
          return;
        }

        const varsResult = await invoke('getVariableValues', { localId: effectiveLocalId });
        if (!varsResult.success || !varsResult.data) {
          setIsCheckingStaleness(false);
          return;
        }

        const excerptData = excerptResult.data.excerpt;
        const varsData = varsResult.data;
        const sourceContentHash = excerptData.contentHash;
        
        // For published content, compare Source's current contentHash against 
        // the Source's contentHash at publish time (publishedSourceContentHash)
        // For non-published content, compare against syncedContentHash
        const publishedSourceContentHash = varsData.publishedSourceContentHash;
        const syncedContentHash = varsData.syncedContentHash;
        const comparisonHash = publishStatus?.isPublished ? publishedSourceContentHash : syncedContentHash;

        let stale = false;
        if (sourceContentHash && comparisonHash) {
          stale = sourceContentHash !== comparisonHash;
        } else {
          // Fallback to timestamp comparison
          const sourceUpdatedAt = excerptData.updatedAt;
          const lastSynced = varsData.lastSynced;
          const publishedAt = varsData.publishedAt;
          const comparisonTime = publishStatus?.isPublished ? publishedAt : lastSynced;
          
          if (sourceUpdatedAt && comparisonTime) {
            stale = new Date(sourceUpdatedAt) > new Date(comparisonTime);
          }
        }

        setIsStale(stale);
        setSourceLastModified(excerptData.updatedAt);
        setIncludeLastSynced(varsData.lastSynced);

        if (stale) {
          setLatestRenderedContent(excerptData.content);
          // For published content, use publishedSourceContent (Source ADF at publish time)
          // Fall back to syncedContent if publishedSourceContent is missing (for content published before we added this field)
          // For non-published content, use syncedContent (Source ADF at sync time)
          const oldContent = publishStatus?.isPublished 
            ? (varsData.publishedSourceContent || varsData.syncedContent || null)
            : (varsData.syncedContent || null);
          setSyncedContent(oldContent);
        }

        setIsCheckingStaleness(false);
      } catch (err) {
        logger.errors('[EmbedContainer] Staleness check error:', err);
        setIsCheckingStaleness(false);
      }
    };

    const timeoutId = setTimeout(checkStaleness, jitter);
    return () => clearTimeout(timeoutId);
  }, [content, isEditing, isEditingEmbed, selectedExcerptId, effectiveLocalId, publishStatus?.isPublished]);

  // ============================================================================
  // VIEW MODE: Update to latest
  // ============================================================================
  const handleUpdateToLatest = async () => {
    if (!selectedExcerptId || !effectiveLocalId || isUpdating) return;

    setIsUpdating(true);
    try {
      // For published content, republish with updated Source
      // For non-published content, sync to latest Source
      if (publishStatus?.isPublished) {
        // Republish: Get current variable values and republish
        const varsResult = await invoke('getVariableValues', { localId: effectiveLocalId });
        if (!varsResult.success || !varsResult.data) {
          logger.errors('[EmbedContainer] Failed to get variable values for republish');
          return;
        }

        const pageId = context?.contentId || context?.extension?.content?.id;
        if (!pageId) {
          logger.errors('[EmbedContainer] Unable to determine page ID for republish');
          return;
        }

        const result = await invoke('publishChapter', {
          pageId,
          localId: effectiveLocalId,
          excerptId: selectedExcerptId,
          heading: varsResult.data.customHeading || null,
          variableValues: varsResult.data.variableValues || {},
          toggleStates: varsResult.data.toggleStates || {},
          customInsertions: varsResult.data.customInsertions || [],
          internalNotes: varsResult.data.internalNotes || [],
          smartCasingEnabled: varsResult.data.smartCasingEnabled !== false
        });

        if (result.success) {
          setIsStale(false);
          // Refresh publish status
          const statusResult = await invoke('getPublishStatus', { localId: effectiveLocalId });
          if (statusResult.success) {
            setPublishStatus(statusResult.data);
          }
          await queryClient.invalidateQueries({ queryKey: ['variableValues', effectiveLocalId] });
        }
      } else {
        // Non-published: Use old sync method (if resolver exists)
        // For now, just sync the content hash
        const varsResult = await invoke('getVariableValues', { localId: effectiveLocalId });
        const excerptResult = await invoke('getExcerpt', { excerptId: selectedExcerptId });
        
        if (varsResult.success && excerptResult.success) {
          // Update syncedContentHash and syncedContent
          await invoke('saveVariableValues', {
            localId: effectiveLocalId,
            excerptId: selectedExcerptId,
            variableValues: varsResult.data.variableValues || {},
            toggleStates: varsResult.data.toggleStates || {},
            customInsertions: varsResult.data.customInsertions || [],
            internalNotes: varsResult.data.internalNotes || []
          });
          
          setIsStale(false);
          await queryClient.invalidateQueries({ queryKey: ['cachedContent', effectiveLocalId] });
          await queryClient.invalidateQueries({ queryKey: ['variableValues', effectiveLocalId] });
        }
      }
    } catch (error) {
      logger.errors('[EmbedContainer] Update error:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  // ============================================================================
  // DEACTIVATED EMBEDS DETECTION
  // ============================================================================
  useEffect(() => {
    if (!effectiveLocalId || !isEditing || isLoadingDeactivated) return;
    if (editSession.isLoadingStoredData || !editSession.isInitialized) return;

    // Check if Embed has data
    const hasData = editSession.excerptId || 
      Object.keys(editSession.variableValues || {}).length > 0;

    if (hasData) {
      setShowDeactivatedSelector(false);
      return;
    }

    const checkForDeactivatedEmbeds = async () => {
      setIsLoadingDeactivated(true);
      try {
        const pageId = context?.contentId || context?.extension?.content?.id;
        if (!pageId) {
          setIsLoadingDeactivated(false);
          return;
        }

        const detectionResult = await invoke('detectDeactivatedEmbeds', {
          pageId,
          currentLocalId: context.localId
        });

        if (detectionResult.success && detectionResult.data?.deactivatedEmbeds?.length > 0) {
          setDeactivatedEmbeds(detectionResult.data.deactivatedEmbeds);
          setShowDeactivatedSelector(true);
        } else {
          setDeactivatedEmbeds([]);
          setShowDeactivatedSelector(false);
        }
      } catch (error) {
        logger.errors('[EmbedContainer] Error detecting deactivated Embeds:', error);
        setDeactivatedEmbeds([]);
        setShowDeactivatedSelector(false);
      } finally {
        setIsLoadingDeactivated(false);
      }
    };

    checkForDeactivatedEmbeds();
  }, [effectiveLocalId, isEditing, editSession.isInitialized, editSession.isLoadingStoredData, editSession.excerptId]);

  // Handler for selecting a deactivated Embed
  const handleDeactivatedEmbedSelect = async (sourceLocalId) => {
    if (!sourceLocalId || !effectiveLocalId || isRestoringEmbed) return;

    setIsRestoringEmbed(true);
    try {
      const copyResult = await invoke('copyDeactivatedEmbedData', {
        sourceLocalId,
        targetLocalId: effectiveLocalId
      });

      if (copyResult.success) {
        // Reload the session with new data
        await editSession.resetToOriginal();
        setShowDeactivatedSelector(false);
        setDeactivatedEmbeds([]);
      }
    } catch (error) {
      logger.errors('[EmbedContainer] Error restoring Embed:', error);
    } finally {
      setIsRestoringEmbed(false);
    }
  };

  const handleDeactivatedEmbedDismiss = () => {
    setShowDeactivatedSelector(false);
    setDeactivatedEmbeds([]);
  };

  // ============================================================================
  // PREVIEW CONTENT GENERATION
  // ============================================================================
  // Uses watched values directly for live preview updates
  const getPreviewContent = () => {
    // Handle freeform mode - return simple ADF with the freeform content as paragraphs
    if (watchedIsFreeformMode) {
      const freeformText = watchedFreeformContent || '';
      
      // Split by newlines and create paragraph nodes
      const paragraphs = freeformText.split('\n').filter(line => line.trim() !== '');
      
      if (paragraphs.length === 0) {
        // Return placeholder when empty
        return {
          type: 'doc',
          version: 1,
          content: [{
            type: 'paragraph',
            content: [{
              type: 'text',
              text: 'Your freeform content will appear here...',
              marks: [{ type: 'em' }]
            }]
          }]
        };
      }
      
      return {
        type: 'doc',
        version: 1,
        content: paragraphs.map(text => ({
          type: 'paragraph',
          content: [{
            type: 'text',
            text: text
          }]
        }))
      };
    }
    
    // Standard mode - use Source content with transformations
    if (!editSession.excerpt?.content) return null;

    try {
      let previewAdf = JSON.parse(JSON.stringify(editSession.excerpt.content));

      // Apply toggles (using watched values for live updates)
      if (editSession.excerpt.toggles && Object.keys(watchedToggleStates || {}).length > 0) {
        previewAdf = filterContentByToggles(previewAdf, watchedToggleStates);
      }

      // Apply variables (using watched values for live updates)
      // Pass excerpt.variables for smart case matching (auto-capitalize at sentence starts)
      // Pass disableSmartCase option based on user's Smart Casing toggle preference
      if (editSession.excerpt.variables) {
        previewAdf = substituteVariablesInAdf(
          previewAdf, 
          watchedVariableValues || {}, 
          editSession.excerpt.variables,
          { disableSmartCase: !watchedSmartCasingEnabled }
        );
      }

      // Apply custom insertions (using watched values for live updates)
      if (watchedCustomInsertions?.length > 0) {
        previewAdf = insertCustomParagraphsInAdf(previewAdf, watchedCustomInsertions);
      }

      // Apply internal notes (using watched values for live updates)
      if (watchedInternalNotes?.length > 0) {
        previewAdf = insertInternalNotesInAdf(previewAdf, watchedInternalNotes);
      }

      return cleanAdfForRenderer(previewAdf);
    } catch (error) {
      logger.errors('[EmbedContainer] Error generating preview:', error);
      return null;
    }
  };

  // ============================================================================
  // HANDLERS FOR EDIT MODE
  // ============================================================================
  
  const handleExit = async () => {
    await editSession.saveAndExit();
    setIsEditingEmbed(false);
  };

  const handlePublish = async (customHeading) => {
    setIsPublishing(true);
    setPublishError(null);
    
    try {
      const result = await editSession.saveAndPublish(customHeading);
      if (result?.success) {
        // Close the edit UI after successful publish
        setIsEditingEmbed(false);
      } else {
        setPublishError(result?.error || 'Publish failed');
      }
    } catch (error) {
      setPublishError(error.message);
    } finally {
      setIsPublishing(false);
    }
  };

  const handleReset = async () => {
    await editSession.resetToOriginal();
  };

  // ============================================================================
  // INCOMPLETE STATUS CACHING (must be before conditional returns for hooks rules)
  // ============================================================================
  const cachedIncomplete = variableValuesData?.cachedIncomplete;
  const isUnpublished = !variableValuesData?.publishedAt;
  const step1Loaded = !isLoadingVariableValues && variableValuesData;
  const isEssentialDataLoaded = !isLoadingExcerpt && !isLoadingVariableValues && excerpt;
  
  // Cache the incomplete status for faster subsequent loads (only for unpublished Embeds)
  useEffect(() => {
    if (isEssentialDataLoaded && isUnpublished && effectiveLocalId && cachedIncomplete === undefined) {
      // Only cache if we haven't cached yet (cachedIncomplete is undefined)
      const shouldCache = isEmbedIncomplete(excerpt, variableValuesData?.variableValues, {
        isFreeformMode: variableValuesData?.isFreeformMode,
        freeformContent: variableValuesData?.freeformContent
      });
      if (shouldCache) {
        invoke('cacheIncompleteStatus', { localId: effectiveLocalId, isIncomplete: true });
      }
    }
  }, [isEssentialDataLoaded, isUnpublished, effectiveLocalId, cachedIncomplete, excerpt, variableValuesData?.variableValues]);

  // ============================================================================
  // CONDITIONAL RENDERS
  // ============================================================================

  // View mode with no selectedExcerptId - show loading button
  if (!selectedExcerptId && !isEditing && !isEditingEmbed) {
    return (
      <Box xcss={styles}>
        <Box xcss={editButtonBorderContainerStyle}>
          <Inline space="space.100" alignBlock="center">
            <Button
              appearance="default"
              onClick={undefined}
              shouldFitContainer={true}
              iconAfter="chevron-down"
              spacing="compact"
              isDisabled={true}
            >
              Loading Editor...
            </Button>
          </Inline>
        </Box>
      </Box>
    );
  }

  // Show error if excerpt failed to load
  if (excerptError && selectedExcerptId && !inEditMode) {
    return (
      <SectionMessage title="Failed to Load Blueprint Standard" appearance="error">
        <Text>Unable to load the Blueprint Standard content.</Text>
        {excerptError.message && (
          <Text><Em>Error: {excerptError.message}</Em></Text>
        )}
      </SectionMessage>
    );
  }

  // ============================================================================
  // INCOMPLETE STATUS DETECTION
  // ============================================================================
  const earlyIncomplete = isEssentialDataLoaded && !inEditMode && isEmbedIncomplete(excerpt, variableValuesData?.variableValues, {
    isFreeformMode: variableValuesData?.isFreeformMode,
    freeformContent: variableValuesData?.freeformContent
  });
  
  // Check if freeform mode with content (overrides incomplete status)
  const hasFreeformContent = variableValuesData?.isFreeformMode && variableValuesData?.freeformContent?.trim();
  
  // CACHED INCOMPLETE CHECK: Use cached status for unpublished Embeds
  // If we have cached incomplete status AND the Embed hasn't been published yet,
  // AND we have the excerpt loaded (for the source name), show warning immediately.
  // This skips step 3 (cachedContent) but still needs step 2 (excerpt) for the name.
  // EXCEPTION: Skip if in freeform mode with content (freeform bypasses variables)
  if (step1Loaded && cachedIncomplete === true && isUnpublished && !inEditMode && excerpt && !hasFreeformContent) {
    return (
      <EmbedViewMode
        content={null}
        isStale={false}
        isCheckingStaleness={false}
        showDiffView={false}
        setShowDiffView={() => {}}
        handleUpdateToLatest={() => {}}
        isUpdating={false}
        syncedContent={null}
        latestRenderedContent={null}
        variableValues={variableValuesData?.variableValues || {}}
        toggleStates={variableValuesData?.toggleStates || {}}
        excerpt={excerpt}
        internalNotes={variableValuesData?.internalNotes || []}
        redlineStatus={variableValuesData?.redlineStatus}
        approvedBy={variableValuesData?.approvedBy}
        approvedAt={variableValuesData?.approvedAt}
        lastChangedBy={variableValuesData?.lastChangedBy}
        isPublished={false}
        isIncomplete={true}
        onEditClick={() => setIsEditingEmbed(true)}
      />
    );
  }

  // EARLY INCOMPLETE CHECK: Detect missing required variables after steps 1+2
  // Once we have excerpt (step 2) and variableValuesData (step 1) loaded,
  // immediately check if Embed is incomplete - skips waiting for cachedContent (step 3)
  if (earlyIncomplete) {
    return (
      <EmbedViewMode
        content={content}
        isStale={isStale}
        isCheckingStaleness={isCheckingStaleness}
        showDiffView={showDiffView}
        setShowDiffView={setShowDiffView}
        handleUpdateToLatest={handleUpdateToLatest}
        isUpdating={isUpdating}
        syncedContent={syncedContent}
        latestRenderedContent={latestRenderedContent}
        variableValues={variableValuesData?.variableValues || {}}
        toggleStates={variableValuesData?.toggleStates || {}}
        excerpt={excerpt}
        internalNotes={variableValuesData?.internalNotes || []}
        redlineStatus={variableValuesData?.redlineStatus}
        approvedBy={variableValuesData?.approvedBy}
        approvedAt={variableValuesData?.approvedAt}
        lastChangedBy={variableValuesData?.lastChangedBy}
        isPublished={publishStatus?.isPublished || false}
        isIncomplete={true}
        onEditClick={() => setIsEditingEmbed(true)}
      />
    );
  }

  // View mode loading state - only show when actually loading
  // EXCEPTION: If published or in freeform mode with content, don't treat as incomplete
  const isPublishedOrFreeform = publishStatus?.isPublished || hasFreeformContent;
  
  if (!content && !isEditing && !isEditingEmbed && !isPublishedOrFreeform) {
    const isLoading = isLoadingCachedContent || isLoadingExcerpt;
    
    // If still loading, show loading button
    if (isLoading) {
      return (
        <Box xcss={styles2}>
          <Box xcss={editButtonBorderContainerStyle}>
            <Inline space="space.100" alignBlock="center">
              <Button
                appearance="default"
                onClick={undefined}
                shouldFitContainer={true}
                iconAfter="chevron-down"
                isDisabled={true}
                spacing="compact"
              >
                Loading Editor...
              </Button>
            </Inline>
          </Box>
        </Box>
      );
    }
    
    // Loading done but no content = unpublished Embed
    // Pass to EmbedViewMode with isIncomplete=true to show "under construction" UI
    // This handles freshly deployed Embeds that haven't been published yet
    return (
      <EmbedViewMode
        content={null}
        isStale={false}
        isCheckingStaleness={false}
        showDiffView={false}
        setShowDiffView={() => {}}
        handleUpdateToLatest={() => {}}
        isUpdating={false}
        syncedContent={null}
        latestRenderedContent={null}
        variableValues={{}}
        toggleStates={{}}
        excerpt={excerpt}
        internalNotes={[]}
        isPublished={false}
        isIncomplete={true}
        onEditClick={() => setIsEditingEmbed(true)}
      />
    );
  }

  // ============================================================================
  // EDIT MODE
  // ============================================================================
  const showEditMode = isEditing || isEditingEmbed;

  if (showEditMode) {
    const pageId = context?.contentId || context?.extension?.content?.id;
    const needsRepublish = publishStatus?.isPublished && editSession.isDirty;

    // Determine if we're in Confluence's page edit mode (vs our internal View Mode editing)
    // When isEditing=true but isEditingEmbed=false, user is in Confluence editor
    const isConfluenceEditMode = isEditing && !isEditingEmbed;

    return (
      <Fragment>
        {/* Draft Recovery Banner */}
        {editSession.hasDraftRecovery && (
          <SectionMessage appearance="info">
            <Stack space="space.100">
              <Text>Unsaved changes were found from a previous session.</Text>
              <ButtonGroup>
                <Button onClick={editSession.recoverDraft}>Recover Changes</Button>
                <Button appearance="subtle" onClick={editSession.dismissDraftRecovery}>Discard</Button>
              </ButtonGroup>
            </Stack>
          </SectionMessage>
        )}

        {/* Loading indicator for deactivated Embeds check */}
        {isLoadingDeactivated && (
          <Box xcss={styles3}>
            <Stack space="space.100" alignInline="center">
              <Inline space="space.100" alignBlock="center">
                <Spinner size="small" />
                <Text size="xsmall" color="color.text.subtle">
                  Checking for deactivated Embed data...
                </Text>
              </Inline>
            </Stack>
          </Box>
        )}

        {/* Deactivated Embeds Selector */}
        {showDeactivatedSelector && deactivatedEmbeds.length > 0 && (
          <DeactivatedEmbedsSelector
            localId={effectiveLocalId}
            pageId={pageId}
            deactivatedEmbeds={deactivatedEmbeds}
            onSelect={handleDeactivatedEmbedSelect}
            onDismiss={handleDeactivatedEmbedDismiss}
            isRestoring={isRestoringEmbed}
          />
        )}

        <EmbedEditMode
          excerpt={editSession.excerpt}
          availableExcerpts={editSession.availableExcerpts}
          isLoadingExcerpts={editSession.isLoadingExcerpts}
          selectedExcerptId={editSession.excerptId}
          handleExcerptSelection={editSession.handleSourceChange}
          context={context}
          saveStatus={editSession.saveStatus}
          selectedTabIndex={selectedTabIndex}
          setSelectedTabIndex={setSelectedTabIndex}
          control={editSession.control}
          setValue={editSession.setValue}
          formKey={editSession.formKey}
          customHeading={editSession.customHeading}
          complianceLevel={editSession.complianceLevel}
          // Freeform mode props
          isFreeformMode={watchedIsFreeformMode}
          freeformContent={watchedFreeformContent}
          // Form values for freeform modal warning check
          variableValues={watchedVariableValues}
          toggleStates={watchedToggleStates}
          customInsertions={watchedCustomInsertions}
          internalNotes={watchedInternalNotes}
          insertionType={insertionType}
          setInsertionType={setInsertionType}
          selectedPosition={selectedPosition}
          setSelectedPosition={setSelectedPosition}
          customText={customText}
          setCustomText={setCustomText}
          getPreviewContent={getPreviewContent}
          // Publish props
          publishStatus={publishStatus}
          isPublishing={isPublishing}
          publishProgress={editSession.publishProgress}
          publishError={publishError}
          onPublish={handlePublish}
          needsRepublish={needsRepublish}
          originalExcerptId={editSession.originalExcerptId}
          canReset={editSession.canReset}
          // Close handler for Locked Page Model
          onClose={isEditingEmbed ? handleExit : null}
          // Blur handler for localStorage draft saves
          onBlur={editSession.handleBlur}
          // Reset handler
          onReset={handleReset}
          // Confluence edit mode flag - shows restricted UI with guidance message
          isConfluenceEditMode={isConfluenceEditMode}
        />
      </Fragment>
    );
  }

  // ============================================================================
  // VIEW MODE
  // ============================================================================
  
  // Check if Embed is incomplete (missing required variable values)
  const incomplete = isEmbedIncomplete(excerpt, variableValuesData?.variableValues, {
    isFreeformMode: variableValuesData?.isFreeformMode,
    freeformContent: variableValuesData?.freeformContent
  });
  
  return (
    <EmbedViewMode
      content={content}
      isStale={isStale}
      isCheckingStaleness={isCheckingStaleness}
      showDiffView={showDiffView}
      setShowDiffView={setShowDiffView}
      handleUpdateToLatest={handleUpdateToLatest}
      isUpdating={isUpdating}
      syncedContent={syncedContent}
      latestRenderedContent={latestRenderedContent}
      variableValues={variableValuesData?.variableValues || {}}
      toggleStates={variableValuesData?.toggleStates || {}}
      excerpt={excerpt}
      internalNotes={variableValuesData?.internalNotes || []}
      redlineStatus={variableValuesData?.redlineStatus}
      approvedBy={variableValuesData?.approvedBy}
      approvedAt={variableValuesData?.approvedAt}
      lastChangedBy={variableValuesData?.lastChangedBy}
      isPublished={publishStatus?.isPublished || false}
      isIncomplete={incomplete}
      onEditClick={() => setIsEditingEmbed(true)}
    />
  );
};

ForgeReconciler.render(
  <QueryClientProvider client={queryClient}>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
    <ReactQueryDevtools initialIsOpen={false} />
  </QueryClientProvider>
);
