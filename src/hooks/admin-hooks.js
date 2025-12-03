/**
 * React Query Hooks for Admin Page
 *
 * Custom hooks for data fetching and mutations in the Blueprint Standards Admin page.
 * Uses TanStack React Query for state management, caching, and automatic refetching.
 *
 * Key hooks:
 * - useExcerptsQuery: Fetch all excerpts with orphaned data
 * - useCategoriesQuery: Fetch category list
 * - useSaveCategoriesMutation: Save updated categories
 * - useExcerptUsageQuery: Fetch usage data for specific excerpt
 * - useDeleteExcerptMutation: Delete an excerpt with optimistic updates
 * - useCheckAllSourcesMutation: Run maintenance check on all sources
 * - useCheckAllIncludesMutation: Run maintenance check on all embeds
 * - usePushUpdatesToPageMutation: Push updates to specific page
 * - usePushUpdatesToAllMutation: Push updates to all pages
 * - useAllUsageCountsQuery: Fetch usage counts for sorting
 */

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@forge/bridge';
import { logger } from '../utils/logger.js';

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
 * Hook for fetching current user context
 *
 * Fetches the current user's accountId from Forge context.
 * Used for redline status changes and other user-specific actions.
 *
 * @returns {Object} React Query result with accountId
 */
export const useCurrentUserQuery = () => {
  return useQuery({
    queryKey: ['currentUser'],
    queryFn: async () => {
      const result = await invoke('getCurrentUser');
      if (!result || !result.success) {
        throw new Error('Failed to get current user context');
      }
      return result.accountId;
    },
    staleTime: 1000 * 60 * 60, // 1 hour - user context rarely changes during session
    gcTime: 1000 * 60 * 60 * 2, // 2 hours
  });
};

/**
 * Hook for polling Sources last-modified timestamp
 *
 * Polls the sources-last-modified timestamp every 30 seconds.
 * When this timestamp changes (because pageSyncWorker detected Source changes),
 * the excerpts query will be invalidated to refresh the sidebar.
 *
 * This enables real-time Source existence tracking:
 * 1. User deletes a Source from a page and publishes
 * 2. pageSyncWorker detects the removal and soft-deletes the Source
 * 3. pageSyncWorker updates sources-last-modified timestamp
 * 4. This hook detects the timestamp change
 * 5. useExcerptsQuery is invalidated, sidebar refreshes, Source disappears
 *
 * @returns {Object} React Query result with timestamp
 */
export const useSourcesLastModified = () => {
  return useQuery({
    queryKey: ['sources', 'lastModified'],
    queryFn: async () => {
      const result = await invoke('getSourcesLastModified');
      if (result && result.success && result.data) {
        return result.data.timestamp || 0;
      }
      return 0;
    },
    refetchInterval: 30000, // Poll every 30 seconds
    staleTime: 10000, // Consider stale after 10 seconds
    gcTime: 1000 * 60 * 5, // 5 minutes
  });
};

/**
 * Hook for fetching all excerpts with automatic refresh on Source changes
 *
 * Fetches all Blueprint Standards and orphaned usage data, with sanitization
 * of variables and toggles to ensure data integrity.
 * 
 * This hook is automatically invalidated when:
 * - The sources-last-modified timestamp changes (via useSourcesLastModified polling)
 * - This happens when pageSyncWorker soft-deletes Sources removed from pages
 *
 * @param {boolean} enabled - Whether the query should run (default: true)
 * @returns {Object} React Query result with { excerpts, orphanedUsage }
 */
export const useExcerptsQuery = (enabled = true) => {
  const queryClient = useQueryClient();
  const { data: lastModified } = useSourcesLastModified();
  const lastModifiedRef = useRef(lastModified);

  // Invalidate excerpts cache when lastModified changes
  // This ensures the sidebar refreshes when Sources are added/removed
  useEffect(() => {
    // Skip if this is the initial mount (no previous value) or if query is disabled
    if (!enabled) return;
    if (lastModifiedRef.current !== undefined && lastModified !== lastModifiedRef.current) {
      logger.queries('Sources last-modified changed, invalidating excerpts cache', {
        previous: lastModifiedRef.current,
        current: lastModified
      });
      queryClient.invalidateQueries({ queryKey: ['excerpts', 'list'] });
    }
    lastModifiedRef.current = lastModified;
  }, [lastModified, queryClient, enabled]);

  return useQuery({
    queryKey: ['excerpts', 'list'],
    enabled: enabled,
    queryFn: async () => {
      const result = await invoke('getAllExcerpts');

      if (!result || !result.success || !result.data) {
        throw createErrorWithCode('Failed to load excerpts', result);
      }

      // Sanitize excerpts
      const sanitized = (result.data.excerpts || []).map(excerpt => {
        const cleanVariables = Array.isArray(excerpt.variables)
          ? excerpt.variables.filter(v => v && typeof v === 'object' && v.name)
          : [];
        const cleanToggles = Array.isArray(excerpt.toggles)
          ? excerpt.toggles.filter(t => t && typeof t === 'object' && t.name)
          : [];

        return {
          ...excerpt,
          variables: cleanVariables,
          toggles: cleanToggles,
          category: String(excerpt.category || 'General'),
          updatedAt: excerpt.updatedAt ? String(excerpt.updatedAt) : null
        };
      });

      // Load orphaned usage data (for Embeds)
      let orphanedUsage = [];
      try {
        const orphanedResult = await invoke('getOrphanedUsage');
        if (orphanedResult && orphanedResult.success && orphanedResult.data) {
          orphanedUsage = orphanedResult.data.orphanedUsage || [];
        }
      } catch (err) {
        logger.errors('Failed to load orphaned usage:', err);
      }

      // Note: Sources are now soft-deleted immediately by pageSyncWorker
      // when they're removed from pages, so they won't appear in getAllExcerpts.
      // No need to filter by orphaned status - the source of truth is storage.

      logger.queries('Loaded excerpts', {
        total: sanitized.length
      });

      return { 
        excerpts: sanitized, 
        orphanedUsage
      };
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 30, // 30 minutes
  });
};

/**
 * Hook for fetching categories
 *
 * Fetches the list of available categories for organizing excerpts.
 * Returns default categories if none are stored.
 *
 * @returns {Object} React Query result with categories array
 */
export const useCategoriesQuery = () => {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const result = await invoke('getCategories');
      if (result.success && result.data && result.data.categories) {
        return result.data.categories;
      }
      // Default categories if none stored or on error
      return ['General', 'Pricing', 'Technical', 'Legal', 'Marketing'];
    },
    staleTime: 1000 * 60 * 10, // 10 minutes - categories change rarely
    gcTime: 1000 * 60 * 60, // 1 hour
  });
};

/**
 * Hook for saving categories
 *
 * Mutation for updating the categories list with proper optimistic updates.
 * Implements the 6-step optimistic update pattern:
 * 1. Cancel outgoing queries
 * 2. Snapshot previous state
 * 3. Optimistically update cache
 * 4. Return rollback context
 * 5. Rollback on error
 * 6. Invalidate on success/error
 *
 * @returns {Object} React Query mutation result
 */
export const useSaveCategoriesMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (categories) => {
      await invoke('saveCategories', { categories });
      return categories;
    },
    // STEP 1-4: onMutate runs before mutation, sets optimistic state
    onMutate: async (newCategories) => {
      // STEP 1: Cancel any outgoing refetches (prevents race conditions)
      await queryClient.cancelQueries({ queryKey: ['categories'] });

      // STEP 2: Snapshot the previous value
      const previousCategories = queryClient.getQueryData(['categories']);

      // STEP 3: Optimistically update to the new value
      queryClient.setQueryData(['categories'], newCategories);

      // STEP 4: Return context with rollback data
      return { previousCategories };
    },
    // STEP 5: Rollback on error
    onError: (error, newCategories, context) => {
      logger.errors('Mutation failed, rolling back:', error);
      if (context?.previousCategories) {
        queryClient.setQueryData(['categories'], context.previousCategories);
      }
    },
    // STEP 6: Always refetch after error or success to ensure sync with server
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    }
  });
};

/**
 * Hook for lazy-loading usage data for a specific excerpt
 *
 * Implements stale-while-revalidate pattern:
 * 1. Returns cached published embeds data immediately from publication cache
 * 2. If data is stale, triggers background refresh via refreshExcerptUsage
 * 3. Exposes isRefreshing flag for UI to show "Updating..." indicator
 *
 * The publication cache is maintained by:
 * - pageSyncWorker (real-time, triggered by page publish events)
 * - Daily scheduled job (safety net at 10 AM UTC)
 * - This hook's background refresh (on-demand when stale)
 *
 * @param {string} excerptId - The ID of the excerpt to fetch usage for
 * @param {boolean} enabled - Whether the query should run
 * @returns {Object} React Query result with usage array + isRefreshing flag
 */
export const useExcerptUsageQuery = (excerptId, enabled = true) => {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshInProgressRef = useRef(false);

  const query = useQuery({
    queryKey: ['excerpt', excerptId, 'usage'],
    queryFn: async () => {
      const result = await invoke('getExcerptUsage', { excerptId });
      if (result && result.success && result.data) {
        return {
          usage: result.data.usage || [],
          isStale: result.data.isStale || false,
          cacheAge: result.data.cacheAge,
          source: result.data.source,
          warning: result.data.warning
        };
      }
      throw createErrorWithCode('Failed to load usage data', result);
    },
    enabled: enabled && !!excerptId,
    staleTime: 0, // Always consider stale to check isStale flag
    gcTime: 1000 * 60 * 10, // 10 minutes
  });

  // Trigger background refresh if data is stale
  useEffect(() => {
    const data = query.data;
    
    // Only refresh if:
    // - Query succeeded
    // - Data is marked as stale
    // - Not already refreshing
    // - Not currently fetching
    if (data?.isStale && !refreshInProgressRef.current && !query.isFetching && excerptId) {
      refreshInProgressRef.current = true;
      setIsRefreshing(true);
      
      logger.queries('Starting background refresh for excerpt usage', { excerptId, source: data.source });
      
      invoke('refreshExcerptUsage', { excerptId })
        .then(freshResult => {
          if (freshResult?.success && freshResult.data) {
            // Update the cache with fresh data
            queryClient.setQueryData(['excerpt', excerptId, 'usage'], {
              usage: freshResult.data.usage || [],
              isStale: false,
              cacheAge: freshResult.data.refreshedAt,
              source: freshResult.data.source
            });
            logger.queries('Background refresh complete', { 
              excerptId, 
              embedCount: freshResult.data.usage?.length || 0 
            });
          }
        })
        .catch(error => {
          logger.errors('Background refresh failed', { excerptId, error: error.message });
        })
        .finally(() => {
          refreshInProgressRef.current = false;
          setIsRefreshing(false);
        });
    }
  }, [query.data, query.isFetching, excerptId, queryClient]);

  return {
    ...query,
    // Expose just the usage array for backwards compatibility
    data: query.data?.usage,
    // Additional metadata
    isRefreshing,
    isStale: query.data?.isStale || false,
    cacheAge: query.data?.cacheAge,
    dataSource: query.data?.source,
    warning: query.data?.warning
  };
};

/**
 * Hook for deleting an excerpt
 *
 * Mutation with optimistic updates - removes excerpt from UI immediately,
 * then rolls back if the deletion fails.
 *
 * @returns {Object} React Query mutation result
 */
export const useDeleteExcerptMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (excerptId) => {
      const result = await invoke('deleteExcerpt', { excerptId });
      if (!result.success) {
        throw createErrorWithCode('Failed to delete excerpt', result);
      }
      return excerptId;
    },
    // Optimistic update: remove excerpt from UI immediately
    onMutate: async (excerptId) => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({ queryKey: ['excerpts', 'list'] });

      // Snapshot the previous value
      const previousExcerpts = queryClient.getQueryData(['excerpts', 'list']);

      // Optimistically update to the new value
      queryClient.setQueryData(['excerpts', 'list'], (old) => {
        if (!old) return old;
        return {
          ...old,
          excerpts: (old.excerpts || []).filter(excerpt => excerpt.id !== excerptId)
        };
      });

      // Return context with previous value for rollback
      return { previousExcerpts };
    },
    onSuccess: (excerptId) => {
      // Remove usage data for this excerpt
      queryClient.removeQueries({ queryKey: ['excerpt', excerptId, 'usage'] });
    },
    onError: (error, excerptId, context) => {
      logger.errors('Delete failed:', error);
      // Rollback optimistic update on error
      if (context?.previousExcerpts) {
        queryClient.setQueryData(['excerpts', 'list'], context.previousExcerpts);
      }
    },
    // Always refetch after error or success to ensure data consistency
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['excerpts', 'list'] });
    }
  });
};

/**
 * Hook for Check All Sources maintenance operation
 *
 * Runs a maintenance check on all source macros to identify orphaned sources.
 *
 * @returns {Object} React Query mutation result
 */
export const useCheckAllSourcesMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const result = await invoke('checkAllSources');
      if (!result.success) {
        throw createErrorWithCode('Check failed', result);
      }
      return result;
    },
    onSuccess: () => {
      // Invalidate excerpts to show updated orphan status
      queryClient.invalidateQueries({ queryKey: ['excerpts', 'list'] });
    },
    onError: (error) => {
      logger.errors('Check All Sources failed:', error);
    }
  });
};

/**
 * Hook for Check All Includes maintenance operation
 *
 * Runs a maintenance check on all embed macros to identify stale/orphaned embeds.
 *
 * @returns {Object} React Query mutation result
 */
export const useCheckAllIncludesMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const result = await invoke('checkAllIncludes');
      if (!result.success) {
        throw createErrorWithCode('Check failed', result);
      }
      return result;
    },
    onSuccess: () => {
      // Invalidate excerpts list to refresh orphaned usage data
      queryClient.invalidateQueries({ queryKey: ['excerpts', 'list'] });
      // Also invalidate individual excerpt usage queries
      queryClient.invalidateQueries({ queryKey: ['excerpt'] });
      // Invalidate redline queue to refresh with latest embed data
      // (embeds may have been soft-deleted, orphaned status updated, etc.)
      queryClient.invalidateQueries({ queryKey: ['redlineQueue', 'all'] });
      queryClient.invalidateQueries({ queryKey: ['redlineStats'] });
    },
    onError: (error) => {
      logger.errors('Check All Includes failed:', error);
    }
  });
};

/**
 * Hook for pushing updates to a specific page
 *
 * Pushes latest excerpt content to a single page that uses it.
 *
 * @returns {Object} React Query mutation result
 */
export const usePushUpdatesToPageMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ excerptId, pageId }) => {
      const result = await invoke('pushUpdatesToPage', { excerptId, pageId });
      if (!result.success) {
        throw createErrorWithCode('Failed to push updates', result);
      }
      return { excerptId, result };
    },
    onSuccess: ({ excerptId }) => {
      // Invalidate usage data for this excerpt
      queryClient.invalidateQueries({ queryKey: ['excerpt', excerptId, 'usage'] });
    }
  });
};

/**
 * Hook for pushing updates to all pages
 *
 * Pushes latest excerpt content to all pages that use it.
 *
 * @returns {Object} React Query mutation result
 */
export const usePushUpdatesToAllMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (excerptId) => {
      const result = await invoke('pushUpdatesToAll', { excerptId });
      if (!result.success) {
        throw createErrorWithCode('Failed to push updates', result);
      }
      return { excerptId, result };
    },
    onSuccess: ({ excerptId }) => {
      // Invalidate usage data for this excerpt
      queryClient.invalidateQueries({ queryKey: ['excerpt', excerptId, 'usage'] });
    }
  });
};

/**
 * Hook for fetching usage counts for all excerpts
 *
 * Fetches lightweight usage count data (just counts, not full details)
 * for sorting excerpts by popularity.
 *
 * @param {boolean} enabled - Whether the query should run (default: true)
 * @returns {Object} React Query result with usageCounts object
 */
export const useAllUsageCountsQuery = (enabled = true) => {
  return useQuery({
    queryKey: ['usageCounts', 'all'],
    enabled: enabled,
    queryFn: async () => {
      const result = await invoke('getAllUsageCounts');
      if (result && result.success && result.data) {
        // Returns object like { excerptId1: 5, excerptId2: 12, ... }
        return result.data.usageCounts || {};
      }
      throw createErrorWithCode('Failed to load usage counts', result);
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
    gcTime: 1000 * 60 * 10, // 10 minutes
  });
};

/**
 * Hook for creating test page with 148 Embeds
 *
 * Creates a test page with all 148 Source macros embedded with random variable values
 * for performance testing (3x realistic maximum load).
 *
 * @returns {Object} React Query mutation result
 */
export const useCreateTestPageMutation = () => {
  return useMutation({
    mutationFn: async ({ pageId }) => {
      const result = await invoke('createTestEmbedsPage', { pageId });
      if (!result.success) {
        throw createErrorWithCode('Failed to create test page', result);
      }
      return result;
    },
    onError: (error) => {
      logger.errors('Create Test Page failed:', error);
    }
  });
};
