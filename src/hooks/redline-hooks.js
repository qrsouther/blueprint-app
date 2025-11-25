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

import { useMemo } from 'react';
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
 * OPTIMIZATION: Fetches ALL embeds once (unfiltered, unsorted), then does
 * filtering/sorting/grouping client-side to avoid unnecessary API calls.
 *
 * @param {Object} filters - Filter criteria { status: [], pageIds: [], excerptIds: [], searchTerm: '' }
 * @param {string} sortBy - Sort field: "status" | "page" | "source" | "updated"
 * @param {string|null} groupBy - Group field: "status" | "page" | "source" | null
 * @returns {Object} React Query result with { embeds, groups }
 */
export const useRedlineQueueQuery = (filters = {}, sortBy = 'status', groupBy = null) => {
  // Fetch ALL embeds once (unfiltered, unsorted) - this is cached and reused
  const { data: allEmbedsData, isLoading, error } = useQuery({
    queryKey: ['redlineQueue', 'all'], // Single query key for all embeds
    queryFn: async () => {
      logger.queries('Fetching all redline queue embeds (unfiltered)');

      // Fetch all embeds without filters/sort/group
      const result = await invoke('getRedlineQueue', { 
        filters: {}, 
        sortBy: 'status', // Default sort, will be re-sorted client-side
        groupBy: null 
      });

      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to load redline queue');
      }

      logger.queries('Loaded all redline queue embeds:', {
        embedCount: result.data.embeds.length
      });

      return result.data.embeds; // Return just the embeds array
    },
    staleTime: 1000 * 30, // 30 seconds - queue data is fairly dynamic
    gcTime: 1000 * 60 * 5, // 5 minutes
  });

  // Client-side filtering, sorting, and grouping
  const processedData = useMemo(() => {
    if (!allEmbedsData) {
      return { embeds: [], groups: null };
    }

    let processed = [...allEmbedsData];

    // Apply filters
    if (filters.status && filters.status.length > 0 && !filters.status.includes('all')) {
      processed = processed.filter(embed => filters.status.includes(embed.redlineStatus));
    }

    if (filters.pageIds && filters.pageIds.length > 0) {
      processed = processed.filter(embed => filters.pageIds.includes(embed.pageId));
    }

    if (filters.excerptIds && filters.excerptIds.length > 0) {
      processed = processed.filter(embed => filters.excerptIds.includes(embed.excerptId));
    }

    if (filters.searchTerm && filters.searchTerm.trim()) {
      const searchLower = filters.searchTerm.toLowerCase().trim();
      processed = processed.filter(embed => 
        embed.pageTitle?.toLowerCase().includes(searchLower) ||
        embed.sourceName?.toLowerCase().includes(searchLower) ||
        embed.sourceCategory?.toLowerCase().includes(searchLower)
      );
    }

    // Apply sorting
    switch (sortBy) {
      case 'status': {
        // Sort by status priority: reviewable > pre-approved > needs-revision > approved
        const statusPriority = { 'reviewable': 0, 'pre-approved': 1, 'needs-revision': 2, 'approved': 3 };
        processed.sort((a, b) => {
          const aPriority = statusPriority[a.redlineStatus] ?? 999;
          const bPriority = statusPriority[b.redlineStatus] ?? 999;
          if (aPriority !== bPriority) return aPriority - bPriority;
          // Within same status, sort by lastChangedAt (FIFO)
          const aTime = a.lastChangedAt || a.updatedAt || a.lastSynced || '0';
          const bTime = b.lastChangedAt || b.updatedAt || b.lastSynced || '0';
          return new Date(aTime) - new Date(bTime);
        });
        break;
      }
      case 'page':
        processed.sort((a, b) => {
          const aTitle = a.pageTitle || 'Unknown Page';
          const bTitle = b.pageTitle || 'Unknown Page';
          return aTitle.localeCompare(bTitle);
        });
        break;
      case 'source':
        processed.sort((a, b) => {
          const aName = a.sourceName || 'Unknown Source';
          const bName = b.sourceName || 'Unknown Source';
          return aName.localeCompare(bName);
        });
        break;
      case 'updated':
        processed.sort((a, b) => {
          const aTime = a.updatedAt || a.lastSynced || '0';
          const bTime = b.updatedAt || b.lastSynced || '0';
          return new Date(bTime) - new Date(aTime); // DESC = newest first
        });
        break;
    }

    // Apply grouping if requested
    if (groupBy) {
      const groups = {};
      processed.forEach(embed => {
        let groupKey;
        switch (groupBy) {
          case 'status':
            groupKey = embed.redlineStatus;
            break;
          case 'page':
            groupKey = embed.pageTitle || 'Unknown Page';
            break;
          case 'source':
            groupKey = embed.sourceName || 'Unknown Source';
            break;
          default:
            groupKey = 'Other';
        }

        if (!groups[groupKey]) {
          groups[groupKey] = [];
        }
        groups[groupKey].push(embed);
      });

      return { embeds: processed, groups };
    }

    return { embeds: processed, groups: null };
  }, [allEmbedsData, filters, sortBy, groupBy]);

  return {
    data: processedData,
    isLoading,
    error
  };
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
        throw new Error(result.error || 'Failed to set redline status');
      }

      logger.queries('Status updated:', result.data);

      return result.data;
    },
    onSuccess: (data, variables) => {
      const { localId, status, userId } = variables;

      // Update cache immediately - the transitioning state will override it during the 1 second linger
      // This ensures the cache has the full updated data (including approvedBy, approvedAt, etc.)
      // ready for when the transitioning state is removed
      queryClient.setQueriesData(
        { queryKey: ['redlineQueue', 'all'] },
        (oldEmbeds) => {
          if (!oldEmbeds || !Array.isArray(oldEmbeds)) return oldEmbeds;

          // Update the specific embed in the embeds array
          return oldEmbeds.map(embed => {
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
      // Note: With client-side filtering, we invalidate the base 'all' query
      // Also delay to allow fade-out animation to complete (2 seconds)
      queueInvalidationTimeoutId = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['redlineQueue', 'all'] });
        queueInvalidationTimeoutId = null;
      }, Math.max(QUEUE_INVALIDATION_DELAY_MS, 2000)); // At least 2 seconds for fade-out
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
      // Note: With client-side filtering, we invalidate the base 'all' query
      queueInvalidationTimeoutId = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['redlineQueue', 'all'] });
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
 * Hook for checking if an Embed still exists on its page
 *
 * Lightweight existence check for individual embeds. Used by Redline Queue
 * to verify embeds as they come into view. Results are cached to avoid
 * re-checking the same embed.
 *
 * @param {string} localId - Embed instance localId
 * @param {string} pageId - Confluence page ID
 * @param {boolean} enabled - Whether the query should run (default: true)
 * @returns {Object} React Query result with { exists: boolean, pageTitle?: string }
 */
export const useCheckEmbedExistsQuery = (localId, pageId, enabled = true) => {
  return useQuery({
    queryKey: ['embedExists', localId, pageId],
    queryFn: async () => {
      logger.queries('Checking embed existence:', { localId, pageId });

      const result = await invoke('checkEmbedExists', { localId, pageId });

      if (!result || !result.success || !result.data) {
        throw new Error(result.error || 'Failed to check embed existence');
      }

      logger.queries('Embed existence check result:', {
        localId,
        exists: result.data.exists
      });

      return result.data;
    },
    enabled: enabled && !!localId && !!pageId,
    staleTime: 1000 * 60 * 5, // 5 minutes - embeds don't change frequently
    gcTime: 1000 * 60 * 10, // 10 minutes - keep in cache
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

      if (!result || !result.success || !result.data) {
        throw new Error(result.error || 'Failed to load user data');
      }

      logger.queries('User data loaded:', result.data.displayName);

      return result.data;
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

      if (!result || !result.success || !result.data) {
        throw new Error(result.error || 'Failed to load redline stats');
      }

      logger.queries('Stats loaded:', result.data);

      return result.data;
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

      if (!result || !result.success || !result.data) {
        throw new Error(result.error || 'Failed to check redline staleness');
      }

      logger.queries('Staleness check:', {
        localId,
        isStale: result.data.isStale,
        reason: result.data.reason
      });

      return result.data;
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

      if (!result || !result.success || !result.data) {
        throw new Error(result.error || 'Failed to post inline comment');
      }

      logger.queries('Comment posted:', {
        commentId: result.data.commentId,
        location: result.data.location
      });

      return result.data;
    },
    onSuccess: () => {
      // No need to invalidate queries - comment posting is independent
    },
    onError: (error) => {
      logger.errors('Failed to post comment:', error);
    }
  });
};
