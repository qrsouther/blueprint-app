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
import { useRedlineQueueQuery } from '../../hooks/redline-hooks';
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

  // Phase 5: Pagination state
  const [itemsToShow, setItemsToShow] = useState(10);
  const ITEMS_PER_PAGE = 10;

  // Track transitioning cards (cards that just changed status and are lingering)
  // Format: Map<localId, { newStatus: string, embedData: Object }>
  const [transitioningCards, setTransitioningCards] = useState(new Map());
  const transitioningTimeoutsRef = useRef(new Map()); // Track timeouts for cleanup

  // Query client for manual refresh
  const queryClient = useQueryClient();

  // Phase 5: Fetch queue data and current user
  // Only fetch when tab is active to avoid unnecessary API calls
  const { data: queueData, isLoading: queueLoading, error: queueError } = useRedlineQueueQuery(
    filters,
    sortBy,
    groupBy,
    isActive // Pass enabled flag
  );
  const { data: currentUserId, isLoading: userLoading } = useCurrentUserQuery();

  const isLoading = queueLoading || userLoading;

  // Compute the embeds count display string for the stats bar
  const embedsCountDisplay = useMemo(() => {
    if (isLoading || !queueData) return null;
    
    let totalCount;
    if (groupBy && queueData.groups) {
      totalCount = Object.values(queueData.groups).reduce((sum, embeds) => sum + embeds.length, 0) + transitioningCards.size;
    } else {
      // For flat view, include transitioning cards that may have been filtered out
      const baseCount = queueData.embeds?.length || 0;
      // Count transitioning cards not already in embeds
      const additionalTransitioning = Array.from(transitioningCards.keys()).filter(
        localId => !queueData.embeds?.some(e => e.localId === localId)
      ).length;
      totalCount = baseCount + additionalTransitioning;
    }
    
    const visibleCount = Math.min(itemsToShow, totalCount);
    return `Showing ${visibleCount} of ${totalCount} embeds`;
  }, [queueData, groupBy, transitioningCards, itemsToShow, isLoading]);

  // Reset pagination when filters/sort/group changes
  const resetPagination = () => {
    setItemsToShow(10);
  };

  // Handle filter changes with pagination reset
  const handleFiltersChange = (newFilters) => {
    setFilters(newFilters);
    resetPagination();
  };

  const handleSortChange = (newSort) => {
    setSortBy(newSort);
    resetPagination();
  };

  const handleGroupChange = (newGroup) => {
    setGroupBy(newGroup);
    resetPagination();
  };

  const handleLoadMore = () => {
    setItemsToShow(prev => prev + ITEMS_PER_PAGE);
  };

  // Handle status change - add card to transitioning state for 1 second linger
  const handleStatusChange = (localId, newStatus) => {
    // Get the current embed data from the query cache (unfiltered)
    const queryData = queryClient.getQueryData(['redlineQueue', 'all']);
    const embedData = queryData?.embeds?.find(e => e.localId === localId);
    
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
      // Check that the cache has been updated with the new status before removing
      // This prevents the card from reverting to the old status
      const timeoutId = setTimeout(() => {
        // Verify the cache has the new status before removing from transitioning state
        const currentCache = queryClient.getQueryData(['redlineQueue', 'all']);
        const cachedEmbed = currentCache?.embeds?.find(e => e.localId === localId);
        
        // Only remove from transitioning state if cache has been updated with new status
        // Otherwise, check again in 100ms
        if (cachedEmbed && cachedEmbed.redlineStatus === newStatus) {
          setTransitioningCards(prev => {
            const updated = new Map(prev);
            updated.delete(localId);
            return updated;
          });
          transitioningTimeoutsRef.current.delete(localId);
        } else {
          // Cache not updated yet, check again in 100ms (up to 2 seconds total)
          const retryTimeoutId = setTimeout(() => {
            const retryCache = queryClient.getQueryData(['redlineQueue', 'all']);
            const retryEmbed = retryCache?.embeds?.find(e => e.localId === localId);
            
            if (retryEmbed && retryEmbed.redlineStatus === newStatus) {
              setTransitioningCards(prev => {
                const updated = new Map(prev);
                updated.delete(localId);
                return updated;
              });
            } else {
              // Force remove after max wait time (cache should be updated by now)
              setTransitioningCards(prev => {
                const updated = new Map(prev);
                updated.delete(localId);
                return updated;
              });
            }
            transitioningTimeoutsRef.current.delete(localId);
          }, 100);
          transitioningTimeoutsRef.current.set(localId, retryTimeoutId);
        }
      }, 2000); // Initial check after 2 seconds

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

  // Manual refresh handler - immediately invalidates queue to see updated data
  // Note: With client-side filtering, we invalidate the base 'all' query
  const handleManualRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['redlineQueue', 'all'] });
    queryClient.invalidateQueries({ queryKey: ['redlineStats'] });
  };

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
              transitioningEmbedsMap.set(localId, {
                ...transitionInfo.embedData,
                redlineStatus: transitionInfo.newStatus, // Use new status
                isTransitioning: true
              });
            }
          });

          // Combine regular embeds with transitioning embeds
          // Transitioning embeds should appear in their original position
          const allEmbedsToShow = [...queueData.embeds];
          
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
                      {allEmbedsToShow.slice(0, itemsToShow).map(embed => {
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

                      {/* Load More button */}
                      {itemsToShow < allEmbedsToShow.length && (
                        <Box backgroundColor="color.background.neutral" padding="space.200">
                          <Inline space="space.200" alignBlock="center" alignInline="center">
                            <Button appearance="primary" onClick={handleLoadMore}>
                              Load More ({allEmbedsToShow.length - itemsToShow} remaining)
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
                        const visibleEmbeds = allGroupEmbeds.slice(0, itemsToShow);
                        const hasMore = allGroupEmbeds.length > itemsToShow;

                        return (
                          <Box key={groupName}>
                            <Stack space="space.200">
                              <Heading size="medium">
                                {groupName} (Showing {visibleEmbeds.length} of {allGroupEmbeds.length})
                              </Heading>
                              {visibleEmbeds.map(embed => {
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

                      {/* Load More button for grouped view */}
                      {(() => {
                        const totalItems = Object.values(queueData.groups).reduce((sum, embeds) => sum + embeds.length, 0) + transitioningCards.size;
                        const visibleItems = Math.min(itemsToShow, totalItems);

                        return visibleItems < totalItems && (
                          <Box backgroundColor="color.background.neutral" padding="space.200">
                            <Inline space="space.200" alignBlock="center" alignInline="center">
                              <Button appearance="primary" onClick={handleLoadMore}>
                                Load More ({totalItems - visibleItems} remaining)
                              </Button>
                            </Inline>
                          </Box>
                        );
                      })()}
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
