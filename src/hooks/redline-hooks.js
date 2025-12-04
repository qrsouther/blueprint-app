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

import { useMemo, useState, useEffect, useCallback } from 'react';
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

// Module-level timeout ID for delayed queue invalidation
// This allows the user to see comment posting results before the card moves due to re-sorting
let queueInvalidationTimeoutId = null;
const QUEUE_INVALIDATION_DELAY_MS = 60000; // 1 minute

/**
 * Hook for fetching redline queue with server-side pagination
 *
 * PAGINATION: Uses server-side pagination for efficient loading of large queues.
 * - Status filtering happens server-side
 * - Search term filtering happens client-side (for fast local filtering)
 * - Sorting happens server-side
 * - Supports "Load More" pattern by accumulating pages
 *
 * @param {Object} filters - Filter criteria { status: [], searchTerm: '' }
 * @param {string} sortBy - Sort field: "status" | "page" | "source" | "updated"
 * @param {string|null} groupBy - Group field: "status" | "page" | "source" | null
 * @param {boolean} enabled - Whether the query should run (default: true)
 * @param {number} page - Current page number (1-indexed)
 * @param {number} pageSize - Number of items per page (default: 20)
 * @returns {Object} React Query result with { embeds, groups, pagination, stats }
 */
export const useRedlineQueueQuery = (filters = {}, sortBy = 'status', groupBy = null, enabled = true, page = 1, pageSize = 20) => {
  // Fetch paginated embeds with server-side status filtering and sorting
  const { data: pageData, isLoading, isFetching, error } = useQuery({
    // Query key includes page, status filter, and sort to cache each combination
    queryKey: ['redlineQueue', 'paginated', page, filters.status || ['all'], sortBy, pageSize],
    enabled: enabled,
    queryFn: async () => {
      logger.queries('Fetching redline queue page:', { page, pageSize, status: filters.status, sortBy });

      // Server-side: pagination, status filter, sorting
      const result = await invoke('getRedlineQueue', { 
        page,
        pageSize,
        filters: { status: filters.status || ['all'] }, // Only status filter server-side
        sortBy,
        groupBy: null // Grouping done client-side after all pages loaded
      });

      if (!result.success || !result.data) {
        throw createErrorWithCode('Failed to load redline queue', result);
      }

      logger.queries('Loaded redline queue page:', {
        page,
        embedCount: result.data.embeds.length,
        pagination: result.data.pagination,
        stats: result.data.stats
      });

      return {
        embeds: result.data.embeds,
        stats: result.data.stats,
        pagination: result.data.pagination
      };
    },
    staleTime: 1000 * 30, // 30 seconds
    gcTime: 1000 * 60 * 5, // 5 minutes
  });

  // Client-side processing: search term filtering and grouping
  const processedData = useMemo(() => {
    if (!pageData?.embeds) {
      return { embeds: [], groups: null, stats: null, pagination: null };
    }

    let processed = [...pageData.embeds];

    // Client-side search term filtering (fast, no re-fetch needed)
    if (filters.searchTerm && filters.searchTerm.trim()) {
      const searchLower = filters.searchTerm.toLowerCase().trim();
      processed = processed.filter(embed => 
        embed.pageTitle?.toLowerCase().includes(searchLower) ||
        embed.sourceName?.toLowerCase().includes(searchLower) ||
        embed.sourceCategory?.toLowerCase().includes(searchLower) ||
        embed.localId?.toLowerCase().includes(searchLower)
      );
    }

    // Apply grouping if requested (client-side)
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

      return { 
        embeds: processed, 
        groups, 
        stats: pageData.stats, 
        pagination: pageData.pagination 
      };
    }

    return { 
      embeds: processed, 
      groups: null, 
      stats: pageData.stats, 
      pagination: pageData.pagination 
    };
  }, [pageData, filters.searchTerm, groupBy]);

  return {
    data: processedData,
    isLoading,
    isFetching,
    error
  };
};

/**
 * Hook for managing accumulated embeds across multiple pages (Load More pattern)
 * 
 * This hook manages the state for loading multiple pages and accumulating results.
 * It provides a simple interface for the "Load More" button pattern.
 *
 * @param {Object} filters - Filter criteria { status: [], searchTerm: '' }
 * @param {string} sortBy - Sort field
 * @param {string|null} groupBy - Group field
 * @param {boolean} enabled - Whether queries should run
 * @param {number} pageSize - Items per page (default: 20)
 * @returns {Object} { data, isLoading, isFetching, error, loadMore, hasMore, totalCount }
 */
export const useAccumulatedRedlineQueue = (filters = {}, sortBy = 'status', groupBy = null, enabled = true, pageSize = 20) => {
  const queryClient = useQueryClient();
  const [currentPage, setCurrentPage] = useState(1);
  const [accumulatedEmbeds, setAccumulatedEmbeds] = useState([]);
  
  // Fetch current page
  const { data: pageData, isLoading, isFetching, error } = useRedlineQueueQuery(
    filters, 
    sortBy, 
    groupBy, 
    enabled, 
    currentPage, 
    pageSize
  );

  // Accumulate embeds when new page data arrives
  useEffect(() => {
    if (pageData?.embeds && pageData.pagination) {
      if (currentPage === 1) {
        // First page - replace all
        setAccumulatedEmbeds(pageData.embeds);
      } else {
        // Subsequent pages - append (avoiding duplicates by localId)
        setAccumulatedEmbeds(prev => {
          const existingIds = new Set(prev.map(e => e.localId));
          const newEmbeds = pageData.embeds.filter(e => !existingIds.has(e.localId));
          return [...prev, ...newEmbeds];
        });
      }
    }
  }, [pageData, currentPage]);

  // Reset to page 1 when filters or sort change
  useEffect(() => {
    setCurrentPage(1);
    setAccumulatedEmbeds([]);
  }, [filters.status, filters.searchTerm, sortBy]);

  // Load more handler
  const loadMore = useCallback(() => {
    if (pageData?.pagination?.hasNextPage) {
      setCurrentPage(prev => prev + 1);
    }
  }, [pageData?.pagination?.hasNextPage]);

  // Refresh handler - invalidate all pages and refetch
  // Directly updates accumulatedEmbeds after refetch to avoid stale-while-revalidate flash
  const refresh = useCallback(async () => {
    setCurrentPage(1);
    // Invalidate cache
    await queryClient.invalidateQueries({ queryKey: ['redlineQueue', 'paginated'] });
    // Refetch and get fresh data
    const result = await queryClient.fetchQuery({
      queryKey: ['redlineQueue', 'paginated', 1, filters.status || ['all'], sortBy, pageSize],
      queryFn: async () => {
        const response = await invoke('getRedlineQueue', { 
          page: 1,
          pageSize,
          filters: { status: filters.status || ['all'] },
          sortBy,
          groupBy: null
        });
        if (!response.success || !response.data) {
          throw new Error(response?.error || 'Failed to load redline queue');
        }
        return {
          embeds: response.data.embeds,
          stats: response.data.stats,
          pagination: response.data.pagination
        };
      }
    });
    // Directly update accumulated embeds with fresh data
    if (result?.embeds) {
      setAccumulatedEmbeds(result.embeds);
    }
  }, [queryClient, filters.status, sortBy, pageSize]);

  // Apply client-side search filter to accumulated embeds
  const filteredEmbeds = useMemo(() => {
    if (!filters.searchTerm?.trim()) return accumulatedEmbeds;
    
    const searchLower = filters.searchTerm.toLowerCase().trim();
    return accumulatedEmbeds.filter(embed => 
      embed.pageTitle?.toLowerCase().includes(searchLower) ||
      embed.sourceName?.toLowerCase().includes(searchLower) ||
      embed.sourceCategory?.toLowerCase().includes(searchLower) ||
      embed.localId?.toLowerCase().includes(searchLower)
    );
  }, [accumulatedEmbeds, filters.searchTerm]);

  // Apply grouping if needed
  const processedData = useMemo(() => {
    if (groupBy) {
      const groups = {};
      filteredEmbeds.forEach(embed => {
        let groupKey;
        switch (groupBy) {
          case 'status': groupKey = embed.redlineStatus; break;
          case 'page': groupKey = embed.pageTitle || 'Unknown Page'; break;
          case 'source': groupKey = embed.sourceName || 'Unknown Source'; break;
          default: groupKey = 'Other';
        }
        if (!groups[groupKey]) groups[groupKey] = [];
        groups[groupKey].push(embed);
      });
      return { embeds: filteredEmbeds, groups, stats: pageData?.stats };
    }
    return { embeds: filteredEmbeds, groups: null, stats: pageData?.stats };
  }, [filteredEmbeds, groupBy, pageData?.stats]);

  return {
    data: processedData,
    isLoading: isLoading && currentPage === 1, // Only show loading on first page
    isFetching,
    error,
    loadMore,
    refresh,
    hasMore: pageData?.pagination?.hasNextPage || false,
    totalCount: pageData?.pagination?.totalCount || 0,
    loadedCount: accumulatedEmbeds.length,
    currentPage
  };
};

/**
 * Hook for setting redline status for a single Embed
 *
 * Mutation for updating the redline status of an individual Embed instance.
 * Uses optimistic updates to immediately reflect changes in the UI before server confirms.
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
        throw createErrorWithCode('Failed to set redline status', result);
      }

      logger.queries('Status updated:', result.data);

      return result.data;
    },
    // OPTIMISTIC UPDATE: Update cache immediately before server responds
    onMutate: async (variables) => {
      const { localId, status, userId } = variables;
      
      // Cancel any outgoing refetches to prevent overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ['redlineQueue', 'paginated'] });
      
      // Snapshot all paginated query data for potential rollback
      const previousQueries = queryClient.getQueriesData({ queryKey: ['redlineQueue', 'paginated'] });
      
      // Helper function to update an embed in a data structure
      const updateEmbed = (embed) => {
        if (embed.localId !== localId) return embed;
        return {
          ...embed,
          redlineStatus: status,
          approvedBy: status === 'approved' ? userId : embed.approvedBy,
          approvedAt: status === 'approved' ? new Date().toISOString() : embed.approvedAt,
          lastChangedBy: userId,
          lastChangedAt: new Date().toISOString()
        };
      };
      
      // Optimistically update all paginated queries that might contain this embed
      queryClient.setQueriesData(
        { queryKey: ['redlineQueue', 'paginated'] },
        (oldData) => {
          if (!oldData?.embeds) return oldData;
          
          return {
            ...oldData,
            embeds: oldData.embeds.map(updateEmbed),
            // Update stats optimistically
            stats: oldData.stats ? {
              ...oldData.stats,
              // Decrement old status, increment new status (rough approximation)
            } : oldData.stats
          };
        }
      );
      
      logger.queries('Optimistic update applied:', { localId, status });
      
      // Return context for potential rollback
      return { previousQueries };
    },
    onSuccess: (data, variables) => {
      const { localId, status, userId } = variables;

      // Clear any existing timeout to reset the delay
      if (queueInvalidationTimeoutId) {
        clearTimeout(queueInvalidationTimeoutId);
      }

      // Immediately invalidate stats (lightweight, ensures accurate counts)
      queryClient.invalidateQueries({ queryKey: ['redlineStats'] });

      // Schedule queue invalidation after delay to allow UI transitions
      // This gives time for visual feedback before data re-sorts
      queueInvalidationTimeoutId = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['redlineQueue', 'paginated'] });
        queueInvalidationTimeoutId = null;
      }, Math.max(QUEUE_INVALIDATION_DELAY_MS, 2000)); // At least 2 seconds for fade-out
    },
    onError: (error, variables, context) => {
      logger.errors('Failed to set redline status:', error);
      
      // ROLLBACK: Restore previous query data on error
      if (context?.previousQueries) {
        context.previousQueries.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
        logger.queries('Rolled back optimistic update due to error');
      }
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
      // Note: With pagination, we invalidate all paginated queries
      queueInvalidationTimeoutId = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['redlineQueue', 'paginated'] });
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
        throw createErrorWithCode('Failed to check embed existence', result);
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
        throw createErrorWithCode('Failed to load user data', result);
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
 * @param {boolean} enabled - Whether the query should run (default: true)
 * @returns {Object} React Query result with stats { reviewable, preApproved, needsRevision, approved, total }
 */
export const useRedlineStatsQuery = (enabled = true) => {
  return useQuery({
    queryKey: ['redlineStats'],
    enabled: enabled, // Only fetch when tab is active
    queryFn: async () => {
      logger.queries('Fetching redline stats');

      const result = await invoke('getRedlineStats');

      if (!result || !result.success || !result.data) {
        throw createErrorWithCode('Failed to load redline stats', result);
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
        throw createErrorWithCode('Failed to check redline staleness', result);
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
        throw createErrorWithCode('Failed to post inline comment', result);
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

/**
 * Hook for clearing redline page cache
 * 
 * Mutation for clearing cached page content. Called when user clicks "Refresh Queue"
 * to ensure fresh data is fetched from Confluence.
 *
 * @returns {Object} React Query mutation result
 */
export const useClearCacheMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      logger.queries('Clearing redline cache');

      const result = await invoke('clearRedlineCache');

      if (!result || !result.success) {
        throw createErrorWithCode('Failed to clear cache', result);
      }

      logger.queries('Cache cleared:', { clearedCount: result.clearedCount });

      return result;
    },
    onSuccess: () => {
      // Invalidate all redline queries to force fresh fetch
      queryClient.invalidateQueries({ queryKey: ['redlineQueue'] });
      queryClient.invalidateQueries({ queryKey: ['redlineStats'] });
    },
    onError: (error) => {
      logger.errors('Failed to clear cache:', error);
    }
  });
};

/**
 * Hook for fetching source names (progressive enrichment)
 * 
 * Fetches source names and categories for a batch of excerptIds.
 * Called after initial queue load to progressively enrich embed data.
 *
 * @param {string[]} excerptIds - Array of excerptIds to fetch names for
 * @param {boolean} enabled - Whether the query should run
 * @returns {Object} React Query result with { [excerptId]: { name, category } }
 */
export const useSourceNamesQuery = (excerptIds = [], enabled = true) => {
  // Filter out null/undefined and deduplicate
  const validIds = useMemo(() => {
    return [...new Set(excerptIds.filter(id => id))];
  }, [excerptIds]);

  return useQuery({
    queryKey: ['sourceNames', validIds.sort().join(',')],
    queryFn: async () => {
      if (validIds.length === 0) {
        return {};
      }

      logger.queries('Fetching source names:', { count: validIds.length });

      const result = await invoke('getSourceNames', { excerptIds: validIds });

      if (!result || !result.success) {
        throw createErrorWithCode('Failed to fetch source names', result);
      }

      logger.queries('Source names loaded:', { count: Object.keys(result.data).length });

      return result.data;
    },
    enabled: enabled && validIds.length > 0,
    staleTime: 1000 * 60 * 5, // 5 minutes - source names rarely change
    gcTime: 1000 * 60 * 30, // 30 minutes
  });
};
