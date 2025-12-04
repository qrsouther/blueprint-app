/**
 * Redline Queue Page
 *
 * Admin UI component for reviewing and approving Embed instances across all Blueprint pages.
 * Part of Phase 5 implementation - Queue cards with preview and actions.
 *
 * This component displays:
 * - Queue statistics (counts by status) ✓ Phase 3
 * - Filter/sort/group controls ✓ Phase 4
 * - List of Embed instances with status badges ✓ Phase 5
 * - Status change actions ✓ Phase 5
 *
 * Implementation phases:
 * - Phase 2: Stub component ✓
 * - Phase 3: React Query hooks integration ✓
 * - Phase 4: Filter bar + stats bar ✓
 * - Phase 5: Queue cards with Embed previews ✓
 * - Phase 6: Complete queue view with grouping (next)
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Box, Stack, Heading, Text, Spinner, Inline, Button, xcss } from '@forge/react';
import { useQueryClient } from '@tanstack/react-query';
import { RedlineStatsBar } from './RedlineStatsBar';
import { RedlineQueueCard } from './RedlineQueueCard';
import { useAccumulatedRedlineQueue, useSourceNamesQuery } from '../../hooks/redline-hooks';
import { useCurrentUserQuery } from '../../hooks/admin-hooks';
import { logger } from '../../utils/logger.js';

// Full-width container style - minWidth ensures it doesn't collapse when content is minimal
const fullWidthContainerStyle = xcss({
  width: '100%',
  minWidth: '100%',
  maxWidth: '100%',
  flexGrow: 1,
  display: 'block'
});

export function RedlineQueuePage({ isActive = true }) {
  // Phase 4: Filter, sort, and group state management
  const [filters, setFilters] = useState({ status: ['all'], searchTerm: '' });
  const [sortBy, setSortBy] = useState('status');
  const [groupBy, setGroupBy] = useState(null);

  // Server-side pagination config
  const PAGE_SIZE = 20;

  // Track transitioning cards (cards that just changed status and are lingering)
  // Format: Map<localId, { newStatus: string, embedData: Object }>
  const [transitioningCards, setTransitioningCards] = useState(new Map());
  const transitioningTimeoutsRef = useRef(new Map()); // Track timeouts for cleanup

  // Query client for manual refresh
  const queryClient = useQueryClient();

  // Phase 5: Fetch queue data with server-side pagination
  // Uses accumulated query hook for "Load More" pattern
  const { 
    data: queueData, 
    isLoading: queueLoading, 
    isFetching: queueFetching, 
    error: queueError,
    loadMore,
    refresh,
    hasMore,
    totalCount,
    loadedCount
  } = useAccumulatedRedlineQueue(
    filters,
    sortBy,
    groupBy,
    isActive, // enabled flag
    PAGE_SIZE
  );
  const { data: currentUserId, isLoading: userLoading } = useCurrentUserQuery();

  // Progressive source name loading - collect all excerptIds from loaded embeds
  const excerptIds = useMemo(() => {
    if (!queueData?.embeds) return [];
    return queueData.embeds
      .map(embed => embed.excerptId)
      .filter(id => id);
  }, [queueData?.embeds]);

  // Fetch source names progressively (after initial queue load)
  const { data: sourceNames } = useSourceNamesQuery(excerptIds, isActive && excerptIds.length > 0);

  const isLoading = queueLoading || userLoading;
  const isRefreshing = queueFetching && !queueLoading; // True during background refetch (not initial load)

  // Compute the embeds count display string for the stats bar
  const embedsCountDisplay = useMemo(() => {
    if (isLoading || !queueData) return null;
    
    // Use server-provided total count for accurate display
    const displayedCount = loadedCount + transitioningCards.size;
    const serverTotalCount = totalCount || displayedCount;
    
    return `Showing ${Math.min(displayedCount, serverTotalCount)} of ${serverTotalCount} embeds`;
  }, [queueData, totalCount, loadedCount, transitioningCards.size, isLoading]);

  // Handle filter changes (pagination resets automatically in the hook)
  const handleFiltersChange = (newFilters) => {
    setFilters(newFilters);
  };

  const handleSortChange = (newSort) => {
    setSortBy(newSort);
  };

  const handleGroupChange = (newGroup) => {
    setGroupBy(newGroup);
  };

  // Use the loadMore function from the hook for server-side pagination
  const handleLoadMore = () => {
    loadMore();
  };

  // Handle status change - add card to transitioning state for visual feedback
  const handleStatusChange = (localId, newStatus) => {
    // Get the embed data from the current loaded embeds
    const embedData = queueData?.embeds?.find(e => e.localId === localId);
    
    if (embedData) {
      // Store full embed data with updated status
      const transitioningEmbed = {
        ...embedData,
        redlineStatus: newStatus,
        isTransitioning: true
      };
      
      // Add to transitioning cards
      setTransitioningCards(prev => {
        const updated = new Map(prev);
        updated.set(localId, { 
          newStatus,
          embedData: transitioningEmbed
        });
        return updated;
      });

      // Remove from transitioning state after linger period
      const timeoutId = setTimeout(() => {
        setTransitioningCards(prev => {
          const updated = new Map(prev);
          updated.delete(localId);
          return updated;
        });
        transitioningTimeoutsRef.current.delete(localId);
      }, 2000); // Show transitioning state for 2 seconds

      // Store timeout for cleanup
      transitioningTimeoutsRef.current.set(localId, timeoutId);
    }
  };

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      transitioningTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
      transitioningTimeoutsRef.current.clear();
    };
  }, []);

  // Manual refresh handler - resets pagination and refetches from server
  // Note: Page content caching uses version-based invalidation, so explicit cache clear is unnecessary
  // The backend will re-fetch page content if the page version changed since last fetch
  const handleManualRefresh = () => {
    refresh(); // Use the refresh function from the paginated hook
    queryClient.invalidateQueries({ queryKey: ['redlineStats'] });
    queryClient.invalidateQueries({ queryKey: ['sourceNames'] });
  };

  // Enrich embeds with source names from progressive loading
  const enrichedEmbeds = useMemo(() => {
    if (!queueData?.embeds) return [];
    if (!sourceNames) return queueData.embeds;
    
    return queueData.embeds.map(embed => {
      if (embed.sourceName) return embed; // Already has source name
      if (!embed.excerptId) return embed; // No excerptId to look up
      
      const sourceData = sourceNames[embed.excerptId];
      if (!sourceData) return embed; // Not loaded yet
      
      return {
        ...embed,
        sourceName: sourceData.name,
        sourceCategory: sourceData.category
      };
    });
  }, [queueData?.embeds, sourceNames]);

  return (
    <Box xcss={fullWidthContainerStyle}>
      <Stack space="space.200">
        {/* Phase 3-4: Queue statistics with inline filter controls */}
        <RedlineStatsBar
          filters={filters}
          onFiltersChange={handleFiltersChange}
          sortBy={sortBy}
          onSortChange={handleSortChange}
          groupBy={groupBy}
          onGroupChange={handleGroupChange}
          onManualRefresh={handleManualRefresh}
          isRefreshing={isRefreshing}
          isActive={isActive}
          embedsCountDisplay={embedsCountDisplay}
          stats={queueData?.stats}
          isLoading={isLoading}
          error={queueError}
        />

        {/* Phase 5: Queue display */}
        {isLoading && (
          <Box backgroundColor="color.background.neutral" padding="space.400">
            <Inline space="space.100" alignBlock="center">
              <Spinner size="small" />
              <Text>Loading redline queue...</Text>
            </Inline>
          </Box>
        )}

        {queueError && (
          <Box backgroundColor="color.background.danger" padding="space.200">
            <Text color="color.text.danger">
              Failed to load queue: {queueError.message}
            </Text>
          </Box>
        )}

        {!isLoading && !queueError && queueData && (() => {
          // Include transitioning cards in the display (even if they don't match filters)
          // This allows them to remain visible during the 1 second linger
          const transitioningEmbedsMap = new Map();
          transitioningCards.forEach((transitionInfo, localId) => {
            // Use stored embed data (from cache before filtering)
            if (transitionInfo.embedData) {
              // Enrich transitioning embed with source name if available
              const sourceData = sourceNames?.[transitionInfo.embedData.excerptId];
              transitioningEmbedsMap.set(localId, {
                ...transitionInfo.embedData,
                redlineStatus: transitionInfo.newStatus, // Use new status
                isTransitioning: true,
                sourceName: sourceData?.name || transitionInfo.embedData.sourceName,
                sourceCategory: sourceData?.category || transitionInfo.embedData.sourceCategory
              });
            }
          });

          // Combine regular embeds with transitioning embeds
          // Transitioning embeds should appear in their original position
          // Use enrichedEmbeds for source name enrichment
          const allEmbedsToShow = [...enrichedEmbeds];
          
          // Transitioning embeds take priority - they keep their new status during linger
          transitioningEmbedsMap.forEach((transitioningEmbed, localId) => {
            const existingIndex = allEmbedsToShow.findIndex(e => e.localId === localId);
            if (existingIndex >= 0) {
              // Replace with transitioning embed (keeps new status)
              allEmbedsToShow[existingIndex] = transitioningEmbed;
            } else {
              // Card was filtered out - insert at the beginning to keep it visible during linger
              allEmbedsToShow.unshift(transitioningEmbed);
            }
          });

          return (
            <>
              {/* Flat view (no grouping) */}
              {!groupBy && (
                <Stack space="space.200">
                  {allEmbedsToShow.length === 0 ? (
                    <Box backgroundColor="color.background.neutral" padding="space.300">
                      <Text>No Embeds match the current filters.</Text>
                    </Box>
                  ) : (
                    <>
                      {allEmbedsToShow.map(embed => {
                        const isTransitioning = transitioningCards.has(embed.localId);
                        const transitionInfo = transitioningCards.get(embed.localId);
                        
                        // If transitioning, use the transitioning embed data (with new status)
                        let displayEmbed = embed;
                        if (isTransitioning && transitionInfo) {
                          displayEmbed = {
                            ...transitionInfo.embedData,
                            redlineStatus: transitionInfo.newStatus
                          };
                        }

                        return (
                          <RedlineQueueCard
                            key={displayEmbed.localId}
                            embedData={displayEmbed}
                            currentUserId={currentUserId}
                            onStatusChange={handleStatusChange}
                          />
                        );
                      })}

                      {/* Load More button - server-side pagination */}
                      {hasMore && (
                        <Box backgroundColor="color.background.neutral" padding="space.200">
                          <Inline space="space.200" alignBlock="center" alignInline="center">
                            <Button 
                              appearance="primary" 
                              onClick={handleLoadMore}
                              isDisabled={queueFetching}
                            >
                              {queueFetching ? 'Loading...' : `Load More (${totalCount - loadedCount} remaining)`}
                            </Button>
                          </Inline>
                        </Box>
                      )}
                    </>
                  )}
                </Stack>
              )}

              {/* Grouped view */}
              {groupBy && queueData.groups && (
                <Stack space="space.400">
                  {Object.keys(queueData.groups).length === 0 ? (
                    <Box backgroundColor="color.background.neutral" padding="space.300">
                      <Text>No Embeds match the current filters.</Text>
                    </Box>
                  ) : (
                    <>
                      {Object.entries(queueData.groups).map(([groupName, embeds]) => {
                        // Include transitioning embeds in this group if they match
                        const transitioningInGroup = Array.from(transitioningCards.entries())
                          .filter(([localId, transitionInfo]) => {
                            if (!transitionInfo.embedData) return false;
                            // Check if embed would be in this group with new status
                            let groupKey;
                            switch (groupBy) {
                              case 'status':
                                groupKey = transitionInfo.newStatus;
                                break;
                              case 'page':
                                groupKey = transitionInfo.embedData.pageTitle || 'Unknown Page';
                                break;
                              case 'source':
                                groupKey = transitionInfo.embedData.sourceName || 'Unknown Source';
                                break;
                              default:
                                return false;
                            }
                            return groupKey === groupName;
                          })
                          .map(([localId, transitionInfo]) => transitionInfo.embedData)
                          .filter(Boolean);

                        const allGroupEmbeds = [...embeds, ...transitioningInGroup];

                        return (
                          <Box key={groupName}>
                            <Stack space="space.200">
                              <Heading size="medium">
                                {groupName} ({allGroupEmbeds.length})
                              </Heading>
                              {allGroupEmbeds.map(embed => {
                                const isTransitioning = transitioningCards.has(embed.localId);
                                const transitionInfo = transitioningCards.get(embed.localId);
                                
                                // If transitioning, use the transitioning embed data (with new status)
                                let displayEmbed = embed;
                                if (isTransitioning && transitionInfo) {
                                  displayEmbed = {
                                    ...transitionInfo.embedData,
                                    redlineStatus: transitionInfo.newStatus
                                  };
                                }

                                return (
                                  <RedlineQueueCard
                                    key={displayEmbed.localId}
                                    embedData={displayEmbed}
                                    currentUserId={currentUserId}
                                    onStatusChange={handleStatusChange}
                                  />
                                );
                              })}
                            </Stack>
                          </Box>
                        );
                      })}

                      {/* Load More button for grouped view - server-side pagination */}
                      {hasMore && (
                        <Box backgroundColor="color.background.neutral" padding="space.200">
                          <Inline space="space.200" alignBlock="center" alignInline="center">
                            <Button 
                              appearance="primary" 
                              onClick={handleLoadMore}
                              isDisabled={queueFetching}
                            >
                              {queueFetching ? 'Loading...' : `Load More (${totalCount - loadedCount} remaining)`}
                            </Button>
                          </Inline>
                        </Box>
                      )}
                    </>
                  )}
                </Stack>
              )}
            </>
          );
        })()}
      </Stack>
    </Box>
  );
}
