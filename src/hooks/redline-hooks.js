/**
 * React Query Hooks for Redline System
 *
 * Custom hooks for redlining workflow data fetching and mutations.
 * Uses TanStack React Query for state management, caching, and automatic refetching.
 *
 * Key hooks:
 * - useRedlineQueueQuery: Fetch redline queue with filtering, sorting, grouping
 * - useSetRedlineStatusMutation: Set redline status for single Embed
 * - useBulkSetRedlineStatusMutation: Bulk status update for multiple Embeds
 * - useConfluenceUserQuery: Get Confluence user data for avatar display
 * - useRedlineStatsQuery: Get redline statistics (counts by status)
 *
 * Part of Phase 3 implementation (React Query Hooks for Redline Data)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@forge/bridge';
import { logger } from '../utils/logger.js';

// Module-level timeout ID for delayed queue invalidation
// This allows the user to see comment posting results before the card moves due to re-sorting
let queueInvalidationTimeoutId = null;
const QUEUE_INVALIDATION_DELAY_MS = 60000; // 1 minute

/**
 * Hook for fetching redline queue with filtering, sorting, and grouping
 *
 * Fetches all Embed instances with their redline status, filtered and sorted
 * according to user preferences. Supports grouping by status, page, or source.
 *
 * @param {Object} filters - Filter criteria { status: [], pageIds: [], excerptIds: [] }
 * @param {string} sortBy - Sort field: "status" | "page" | "source" | "updated"
 * @param {string|null} groupBy - Group field: "status" | "page" | "source" | null
 * @returns {Object} React Query result with { embeds, groups }
 */
export const useRedlineQueueQuery = (filters = {}, sortBy = 'status', groupBy = null) => {
  return useQuery({
    queryKey: ['redlineQueue', filters, sortBy, groupBy],
    queryFn: async () => {
      logger.queries('Fetching redline queue:', { filters, sortBy, groupBy });

      const result = await invoke('getRedlineQueue', { filters, sortBy, groupBy });

      if (!result || !result.embeds) {
        throw new Error('Failed to load redline queue');
      }

      logger.queries('Loaded redline queue:', {
        embedCount: result.embeds.length,
        hasGroups: !!result.groups
      });

      return result;
    },
    staleTime: 1000 * 30, // 30 seconds - queue data is fairly dynamic
    gcTime: 1000 * 60 * 5, // 5 minutes
  });
};

/**
 * Hook for setting redline status for a single Embed
 *
 * Mutation for updating the redline status of an individual Embed instance.
 * Automatically invalidates related queries to keep UI in sync.
 *
 * @returns {Object} React Query mutation result
 */
export const useSetRedlineStatusMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ localId, status, userId, reason = '' }) => {
      logger.queries('Setting redline status:', { localId, status, userId });

      const result = await invoke('setRedlineStatus', { localId, status, userId, reason });

      if (!result || !result.success) {
        throw new Error('Failed to set redline status');
      }

      logger.queries('Status updated:', result);

      return result;
    },
    onSuccess: (data, variables) => {
      const { localId, status, userId } = variables;

      // Immediately update the specific card in all cached queue queries
      // This updates the UI without refetching or re-sorting
      queryClient.setQueriesData(
        { queryKey: ['redlineQueue'] },
        (oldData) => {
          if (!oldData) return oldData;

          // Update the specific embed in the embeds array
          const updatedEmbeds = oldData.embeds.map(embed => {
            if (embed.localId === localId) {
              return {
                ...embed,
                redlineStatus: status,
                approvedBy: status === 'approved' ? userId : undefined,
                approvedAt: status === 'approved' ? new Date().toISOString() : undefined,
                lastChangedBy: userId,
                lastChangedAt: new Date().toISOString()
              };
            }
            return embed;
          });

          // If there are groups, update those too
          let updatedGroups = oldData.groups;
          if (updatedGroups) {
            updatedGroups = {};
            Object.keys(oldData.groups).forEach(groupName => {
              updatedGroups[groupName] = oldData.groups[groupName].map(embed => {
                if (embed.localId === localId) {
                  return {
                    ...embed,
                    redlineStatus: status,
                    approvedBy: status === 'approved' ? userId : undefined,
                    approvedAt: status === 'approved' ? new Date().toISOString() : undefined,
                    lastChangedBy: userId,
                    lastChangedAt: new Date().toISOString()
                  };
                }
                return embed;
              });
            });
          }

          return {
            ...oldData,
            embeds: updatedEmbeds,
            groups: updatedGroups
          };
        }
      );

      // Clear any existing timeout to reset the delay
      if (queueInvalidationTimeoutId) {
        clearTimeout(queueInvalidationTimeoutId);
      }

      // Immediately invalidate stats (lightweight, no re-sorting)
      queryClient.invalidateQueries({ queryKey: ['redlineStats'] });

      // Schedule queue invalidation after 1 minute delay
      // This allows users to see comment posting results before cards re-sort
      queueInvalidationTimeoutId = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['redlineQueue'] });
        queueInvalidationTimeoutId = null;
      }, QUEUE_INVALIDATION_DELAY_MS);
    },
    onError: (error) => {
      logger.errors('Failed to set redline status:', error);
    }
  });
};

/**
 * Hook for bulk status update for multiple Embeds
 *
 * NOTE: This hook exists for backend/internal use only. The Admin UI does NOT
 * support bulk status updates - users can only update one Embed at a time.
 * This hook is kept for potential future use or programmatic access.
 *
 * @returns {Object} React Query mutation result
 */
export const useBulkSetRedlineStatusMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ localIds, status, userId, reason = 'Bulk status update' }) => {
      logger.queries('Bulk setting redline status:', {
        count: localIds.length,
        status,
        userId
      });

      const result = await invoke('bulkSetRedlineStatus', { localIds, status, userId, reason });

      if (!result || !result.success) {
        throw new Error('Bulk status update failed');
      }

      logger.queries('Bulk update complete:', {
        updated: result.updated,
        failed: result.failed
      });

      return result;
    },
    onSuccess: (data) => {
      // Clear any existing timeout to reset the delay
      if (queueInvalidationTimeoutId) {
        clearTimeout(queueInvalidationTimeoutId);
      }

      // Immediately invalidate stats (lightweight, no re-sorting)
      queryClient.invalidateQueries({ queryKey: ['redlineStats'] });

      // Schedule queue invalidation after 1 minute delay
      queueInvalidationTimeoutId = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['redlineQueue'] });
        queueInvalidationTimeoutId = null;
      }, QUEUE_INVALIDATION_DELAY_MS);

      // Show warning if there were failures
      if (data.failed > 0) {
        logger.errors('Some items failed to update in bulk status update:', data.errors);
      }
    },
    onError: (error) => {
      logger.errors('Bulk status update failed:', error);
    }
  });
};

/**
 * Hook for fetching Confluence user data
 *
 * Fetches user information including display name and avatar URL from Confluence API.
 * Used to display approver information in the redline queue.
 * Aggressively cached since user data rarely changes.
 *
 * @param {string} accountId - Confluence user accountId
 * @returns {Object} React Query result with user data
 */
export const useConfluenceUserQuery = (accountId) => {
  return useQuery({
    queryKey: ['confluenceUser', accountId],
    queryFn: async () => {
      logger.queries('Fetching user data for:', accountId);

      const result = await invoke('getConfluenceUser', { accountId });

      if (!result || !result.accountId) {
        throw new Error('Failed to load user data');
      }

      logger.queries('User data loaded:', result.displayName);

      return result;
    },
    enabled: !!accountId, // Only run if accountId is provided
    staleTime: 1000 * 60 * 60, // 1 hour - user data rarely changes
    gcTime: 1000 * 60 * 60 * 24, // 24 hours - keep in cache for a long time
  });
};

/**
 * Hook for fetching redline statistics
 *
 * Fetches aggregate counts of Embeds by redline status.
 * Used to display queue summary stats in the UI.
 *
 * @returns {Object} React Query result with stats { reviewable, preApproved, needsRevision, approved, total }
 */
export const useRedlineStatsQuery = () => {
  return useQuery({
    queryKey: ['redlineStats'],
    queryFn: async () => {
      logger.queries('Fetching redline stats');

      const result = await invoke('getRedlineStats');

      if (!result) {
        throw new Error('Failed to load redline stats');
      }

      logger.queries('Stats loaded:', result);

      return result;
    },
    staleTime: 1000 * 30, // 30 seconds - stats change as status updates occur
    gcTime: 1000 * 60 * 5, // 5 minutes
  });
};

/**
 * Hook for checking if an Embed needs re-review
 *
 * Checks if an approved Embed's content has changed since approval,
 * requiring re-review. Uses contentHash comparison.
 *
 * @param {string} localId - Embed instance ID
 * @param {boolean} enabled - Whether the query should run
 * @returns {Object} React Query result with { isStale, currentHash, approvedHash }
 */
export const useCheckRedlineStaleQuery = (localId, enabled = true) => {
  return useQuery({
    queryKey: ['redlineStale', localId],
    queryFn: async () => {
      logger.queries('Checking staleness for:', localId);

      const result = await invoke('checkRedlineStale', { localId });

      if (!result) {
        throw new Error('Failed to check redline staleness');
      }

      logger.queries('Staleness check:', {
        localId,
        isStale: result.isStale,
        reason: result.reason
      });

      return result;
    },
    enabled: enabled && !!localId,
    staleTime: 1000 * 60 * 2, // 2 minutes - staleness can change as content is edited
    gcTime: 1000 * 60 * 10, // 10 minutes
  });
};

/**
 * Hook for posting inline comment to Confluence page
 *
 * Mutation for posting an inline comment on the Confluence page near the Embed macro.
 * Used when marking an Embed as "needs-revision" to provide feedback.
 *
 * @returns {Object} React Query mutation result
 */
export const usePostRedlineCommentMutation = () => {
  return useMutation({
    mutationFn: async ({ localId, pageId, commentText, userId }) => {
      logger.queries('Posting inline comment:', { localId, pageId });

      const result = await invoke('postRedlineComment', { localId, pageId, commentText, userId });

      if (!result || !result.success) {
        throw new Error('Failed to post inline comment');
      }

      logger.queries('Comment posted:', {
        commentId: result.commentId,
        location: result.location
      });

      return result;
    },
    onSuccess: () => {
      // No need to invalidate queries - comment posting is independent
    },
    onError: (error) => {
      logger.errors('Failed to post comment:', error);
    }
  });
};
