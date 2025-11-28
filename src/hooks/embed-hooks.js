/**
 * React Query Hooks for Embed Display
 *
 * Custom hooks for data fetching and mutations in the Blueprint Standard Embed macro.
 * Uses TanStack React Query for state management, caching, and automatic refetching.
 *
 * Key hooks:
 * - useExcerptData: Fetch excerpt/source content
 * - useSaveVariableValues: Save variable values, toggle states, and custom content
 * - useAvailableExcerpts: Fetch list of available excerpts
 * - useVariableValues: Fetch saved variable values for an embed instance
 * - useCachedContent: Fetch cached rendered content with automatic recovery
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@forge/bridge';
import { logger } from '../utils/logger.js';
import {
  filterContentByToggles,
  substituteVariablesInAdf,
  insertCustomParagraphsInAdf,
  insertInternalNotesInAdf
} from '../utils/adf-rendering-utils';

/**
 * Helper function to create an error with error code preservation
 * @param {string} defaultMessage - Default error message
 * @param {Object} result - Resolver result object
 * @returns {Error} Error object with errorCode and details if available
 */
function createErrorWithCode(defaultMessage, result) {
  const error = new Error(result?.error || defaultMessage);
  if (result?.errorCode) {
    error.errorCode = result.errorCode;
    error.details = result.details || {};
  }
  return error;
}

/**
 * Custom hook for fetching excerpt data with React Query
 *
 * Fetches a specific excerpt/source by ID, including its content, variables, and metadata.
 *
 * @param {string} excerptId - The ID of the excerpt to fetch
 * @param {boolean} enabled - Whether the query should run
 * @returns {Object} React Query result with excerpt data
 */
export const useExcerptData = (excerptId, enabled) => {
  return useQuery({
    queryKey: ['excerpt', excerptId],
    queryFn: async () => {
      // This shouldn't run when excerptId is null due to enabled check,
      // but React Query may still initialize - just skip silently
      if (!excerptId) {
        return null;
      }

      const result = await invoke('getExcerpt', { excerptId });

      if (!result.success || !result.data || !result.data.excerpt) {
        throw createErrorWithCode('Failed to load excerpt', result);
      }

      return result.data.excerpt;
    },
    enabled: enabled && !!excerptId,
    staleTime: 0, // Always fetch fresh data (temporarily set to 0 to bust old cache without documentationLinks)
    gcTime: 1000 * 60 * 30, // Keep in cache for 30 minutes (renamed from cacheTime in v5)
    refetchOnMount: 'always', // Always refetch when component mounts or cache is invalidated
    refetchOnWindowFocus: false, // Don't refetch on window focus (only refetch when explicitly invalidated)
    refetchOnReconnect: true, // Refetch when network reconnects (helps catch updates)
  });
};

/**
 * Custom hook for saving variable values with React Query mutation
 *
 * Saves variable values, toggle states, custom insertions, and internal notes
 * for a specific embed instance.
 *
 * @returns {Object} React Query mutation result
 */
export const useSaveVariableValues = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ localId, excerptId, variableValues, toggleStates, customInsertions, internalNotes }) => {
      const result = await invoke('saveVariableValues', {
        localId,
        excerptId,
        variableValues,
        toggleStates,
        customInsertions,
        internalNotes
      });

      if (!result.success) {
        throw createErrorWithCode('Failed to save variable values', result);
      }

      return result;
    },
    onSuccess: (data, variables) => {
      // Invalidate the variableValues query so it refetches with the latest saved data
      // This ensures that when the component re-opens, it loads the saved values
      queryClient.invalidateQueries({ queryKey: ['variableValues', variables.localId] });
    },
    onError: (error) => {
      logger.errors('Save failed:', error);
    }
  });
};

/**
 * Custom hook for fetching available excerpts list with React Query
 *
 * Fetches the list of all available excerpts/sources for selection.
 *
 * @param {boolean} enabled - Whether the query should run
 * @returns {Object} React Query result with excerpts array
 */
export const useAvailableExcerpts = (enabled) => {
  return useQuery({
    queryKey: ['excerpts', 'list'],
    queryFn: async () => {
      const result = await invoke('getExcerpts');

      if (!result.success || !result.data) {
        throw new Error('Failed to load excerpts');
      }

      return result.data.excerpts || [];
    },
    enabled: enabled,
    staleTime: 1000 * 60 * 2, // 2 minutes - excerpt list doesn't change often
    gcTime: 1000 * 60 * 10, // 10 minutes
  });
};

/**
 * Custom hook for fetching variable values with React Query
 *
 * Fetches saved variable values, toggle states, custom insertions, and internal notes
 * for a specific embed instance.
 *
 * @param {string} localId - The local ID of the embed instance
 * @param {boolean} enabled - Whether the query should run
 * @returns {Object} React Query result with variable values data
 */
export const useVariableValues = (localId, enabled) => {
  return useQuery({
    queryKey: ['variableValues', localId],
    queryFn: async () => {
      const result = await invoke('getVariableValues', { localId });

      if (!result.success || !result.data) {
        throw new Error('Failed to load variable values');
      }

      // Return the data object directly (not the wrapper) for backward compatibility
      // React Query caches this, and EmbedContainer expects direct access to properties
      return result.data;
    },
    enabled: enabled && !!localId,
    staleTime: 1000 * 30, // 30 seconds - this changes frequently during editing
    gcTime: 1000 * 60 * 5, // 5 minutes
  });
};

/**
 * Custom hook for fetching cached content in view mode with React Query
 *
 * Fetches cached rendered content or generates it fresh if not cached.
 * Includes automatic recovery for orphaned data (e.g., from drag-to-move operations).
 *
 * @param {string} localId - The local ID of the embed instance
 * @param {string} excerptId - The ID of the excerpt to render
 * @param {boolean} enabled - Whether the query should run
 * @param {Object} context - Forge context object
 * @param {Function} reset - React Hook Form reset function
 * @param {Function} setExcerptForViewMode - State setter for excerpt data
 * @returns {Object} React Query result with cached content
 */
export const useCachedContent = (
  localId,
  excerptId,
  enabled,
  context,
  reset,
  setExcerptForViewMode
) => {
  return useQuery({
    queryKey: ['cachedContent', localId],
    queryFn: async () => {
      // First, try to get cached content
      const cachedResult = await invoke('getCachedContent', { localId });

      if (cachedResult.success && cachedResult.data?.content) {
        return { content: cachedResult.data.content, fromCache: true };
      }

      // No cached content - fetch fresh and process

      const excerptResult = await invoke('getExcerpt', { excerptId });
      if (!excerptResult.success || !excerptResult.data || !excerptResult.data.excerpt) {
        throw new Error(`Failed to load excerpt: ${excerptResult.error || 'Excerpt not found'}`);
      }

      const excerpt = excerptResult.data.excerpt;
      
      // Validate excerpt has valid content
      if (!excerpt.content) {
        throw new Error('Excerpt has no content');
      }
      
      // Validate ADF structure if it's an ADF document
      if (excerpt.content && typeof excerpt.content === 'object' && excerpt.content.type === 'doc') {
        if (!excerpt.content.content || !Array.isArray(excerpt.content.content)) {
          throw new Error('Invalid ADF structure: missing or invalid content array');
        }
      }

      setExcerptForViewMode(excerpt);

      // Load variable values and check for orphaned data
      let varsResult = await invoke('getVariableValues', { localId });

      // CRITICAL: Check if data is missing - attempt recovery from drag-to-move
      const varsData = varsResult.success && varsResult.data ? varsResult.data : {};
      const hasNoData = !varsData.lastSynced &&
                        Object.keys(varsData.variableValues || {}).length === 0 &&
                        Object.keys(varsData.toggleStates || {}).length === 0 &&
                        (varsData.customInsertions || []).length === 0 &&
                        (varsData.internalNotes || []).length === 0;

      if (varsResult.success && hasNoData && excerptId) {
        const pageId = context?.contentId || context?.extension?.content?.id;

        const recoveryResult = await invoke('recoverOrphanedData', {
          pageId: pageId,
          excerptId: excerptId,
          currentLocalId: context.localId
        });

        if (recoveryResult.success && recoveryResult.data?.recovered) {
          // Reload the data
          varsResult = await invoke('getVariableValues', { localId });
        }
      }

      const finalVarsData = varsResult.success && varsResult.data ? varsResult.data : {};
      const loadedVariableValues = finalVarsData.variableValues || {};
      const loadedToggleStates = finalVarsData.toggleStates || {};
      const loadedCustomInsertions = finalVarsData.customInsertions || [];
      const loadedInternalNotes = finalVarsData.internalNotes || [];

      // Update form with loaded values
      if (reset) {
        const { normalizeVariableValues } = require('../schemas/form-schemas');
        reset({
          variableValues: normalizeVariableValues(loadedVariableValues),
          toggleStates: loadedToggleStates,
          customInsertions: loadedCustomInsertions,
          internalNotes: loadedInternalNotes
        }, { keepDefaultValues: false });
      }

      // Generate and cache the content
      // IMPORTANT: Create a deep copy to avoid mutating the original excerpt content
      let freshContent = excerpt.content;
      if (typeof freshContent === 'object' && freshContent !== null) {
        freshContent = JSON.parse(JSON.stringify(freshContent));
      }
      
      const isAdf = freshContent && typeof freshContent === 'object' && freshContent.type === 'doc';

      if (isAdf) {
        try {
          // Fix for GitHub issue #2 - Free Write paragraph insertion position with enabled toggles
          // FIX: Insert custom paragraphs BEFORE toggle filtering (same as EmbedContainer.jsx fix above)
          // Insert custom paragraphs and internal notes into original content (before toggle filtering)
          freshContent = substituteVariablesInAdf(freshContent, loadedVariableValues);
          freshContent = insertCustomParagraphsInAdf(freshContent, loadedCustomInsertions);
          // Pass customInsertions to adjust internal note positions
          freshContent = insertInternalNotesInAdf(freshContent, loadedInternalNotes, loadedCustomInsertions);
          // Then filter toggles (this will preserve insertions inside enabled toggles)
          freshContent = filterContentByToggles(freshContent, loadedToggleStates);
          
          // Validate the processed ADF structure before caching
          if (!freshContent.content || !Array.isArray(freshContent.content)) {
            throw new Error('ADF processing resulted in invalid structure: missing content array');
          }
        } catch (processingError) {
          logger.errors('[useCachedContent] Error processing ADF content:', processingError);
          throw new Error(`Failed to process content: ${processingError.message}`);
        }
      } else {
        // For plain text, filter toggles
        const toggleRegex = /\{\{toggle:([^}]+)\}\}([\s\S]*?)\{\{\/toggle:\1\}\}/g;
        freshContent = freshContent.replace(toggleRegex, (match, toggleName, content) => {
          const trimmedName = toggleName.trim();
          return loadedToggleStates?.[trimmedName] === true ? content : '';
        });
        // Strip any remaining markers
        freshContent = freshContent.replace(/\{\{toggle:[^}]+\}\}/g, '');
        freshContent = freshContent.replace(/\{\{\/toggle:[^}]+\}\}/g, '');

        // Substitute variables
        const escapeRegex = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (excerptResult.excerpt.variables) {
          excerptResult.excerpt.variables.forEach(variable => {
            const value = loadedVariableValues[variable.name] || `{{${variable.name}}}`;
            const regex = new RegExp(`\\{\\{${escapeRegex(variable.name)}\\}\\}`, 'g');
            freshContent = freshContent.replace(regex, value);
          });
        }
      }

      // Cache it for next time
      await invoke('saveCachedContent', {
        localId,
        renderedContent: freshContent,
        syncedContentHash: excerpt.contentHash,
        syncedContent: excerpt.content
      });

      return { content: freshContent, fromCache: false };
    },
    enabled: enabled && !!localId && !!excerptId,
    staleTime: 1000 * 60 * 5, // 5 minutes - cached content should be stable
    gcTime: 1000 * 60 * 30, // 30 minutes
  });
};
