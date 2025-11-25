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

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@forge/bridge';
import { logger } from '../utils/logger.js';

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
 * Hook for fetching all excerpts with orphaned data
 *
 * Fetches all Blueprint Standards and orphaned usage data, with sanitization
 * of variables and toggles to ensure data integrity.
 *
 * @returns {Object} React Query result with { excerpts, orphanedUsage }
 */
export const useExcerptsQuery = () => {
  return useQuery({
    queryKey: ['excerpts', 'list'],
    queryFn: async () => {
      const result = await invoke('getAllExcerpts');

      if (!result || !result.success || !result.data) {
        throw new Error(result.error || 'Failed to load excerpts');
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

      // Load orphaned usage data
      let orphanedUsage = [];
      try {
        const orphanedResult = await invoke('getOrphanedUsage');
        if (orphanedResult && orphanedResult.success && orphanedResult.data) {
          orphanedUsage = orphanedResult.data.orphanedUsage || [];
        }
      } catch (err) {
        logger.errors('Failed to load orphaned usage:', err);
      }

      return { excerpts: sanitized, orphanedUsage };
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
 * Fetches detailed usage data (which pages use this excerpt) for a single excerpt.
 * Only runs when enabled and excerptId is provided.
 *
 * @param {string} excerptId - The ID of the excerpt to fetch usage for
 * @param {boolean} enabled - Whether the query should run
 * @returns {Object} React Query result with usage array
 */
export const useExcerptUsageQuery = (excerptId, enabled = true) => {
  return useQuery({
    queryKey: ['excerpt', excerptId, 'usage'],
    queryFn: async () => {
      const result = await invoke('getExcerptUsage', { excerptId });
      if (result && result.success && result.data) {
        return result.data.usage || [];
      }
      throw new Error(result.error || 'Failed to load usage data');
    },
    enabled: enabled && !!excerptId,
    staleTime: 1000 * 60 * 2, // 2 minutes for usage data
    gcTime: 1000 * 60 * 10, // 10 minutes
  });
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
        throw new Error(result.error || 'Failed to delete excerpt');
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
        throw new Error(result.error || 'Check failed');
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
        throw new Error(result.error || 'Check failed');
      }
      return result;
    },
    onSuccess: () => {
      // Invalidate excerpts list to refresh orphaned usage data
      queryClient.invalidateQueries({ queryKey: ['excerpts', 'list'] });
      // Also invalidate individual excerpt usage queries
      queryClient.invalidateQueries({ queryKey: ['excerpt'] });
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
        throw new Error(result.error || 'Failed to push updates');
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
        throw new Error(result.error || 'Failed to push updates');
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
 * @returns {Object} React Query result with usageCounts object
 */
export const useAllUsageCountsQuery = () => {
  return useQuery({
    queryKey: ['usageCounts', 'all'],
    queryFn: async () => {
      const result = await invoke('getAllUsageCounts');
      if (result && result.success && result.data) {
        // Returns object like { excerptId1: 5, excerptId2: 12, ... }
        return result.data.usageCounts || {};
      }
      throw new Error(result.error || 'Failed to load usage counts');
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
        throw new Error(result.error || 'Failed to create test page');
      }
      return result;
    },
    onError: (error) => {
      logger.errors('Create Test Page failed:', error);
    }
  });
};
