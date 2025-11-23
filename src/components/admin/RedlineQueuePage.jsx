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

import React, { useState } from 'react';
import { Box, Stack, Heading, Text, Spinner, Inline, Button, xcss } from '@forge/react';
import { useQueryClient } from '@tanstack/react-query';
import { RedlineStatsBar } from './RedlineStatsBar';
import { RedlineQueueCard } from './RedlineQueueCard';
import { useRedlineQueueQuery } from '../../hooks/redline-hooks';
import { useCurrentUserQuery } from '../../hooks/admin-hooks';
import { logger } from '../../utils/logger.js';

// Full-width container style
const fullWidthContainerStyle = xcss({
  width: '100%',
  maxWidth: '100%'
});

export function RedlineQueuePage() {
  // Phase 4: Filter, sort, and group state management
  const [filters, setFilters] = useState({ status: ['all'], searchTerm: '' });
  const [sortBy, setSortBy] = useState('status');
  const [groupBy, setGroupBy] = useState(null);

  // Phase 5: Pagination state
  const [itemsToShow, setItemsToShow] = useState(10);
  const ITEMS_PER_PAGE = 10;

  // Query client for manual refresh
  const queryClient = useQueryClient();

  // Phase 5: Fetch queue data and current user
  const { data: queueData, isLoading: queueLoading, error: queueError } = useRedlineQueueQuery(
    filters,
    sortBy,
    groupBy
  );
  const { data: currentUserId, isLoading: userLoading } = useCurrentUserQuery();

  const isLoading = queueLoading || userLoading;

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

  // Manual refresh handler - immediately invalidates queue to see updated sort order
  const handleManualRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['redlineQueue'] });
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
        />

        {/* Phase 5: Queue display */}
        {isLoading && (
          <Box backgroundColor="color.background.neutral" padding="space.400">
            <Inline space="space.100" alignBlock="center">
              <Spinner size="medium" />
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

        {!isLoading && !queueError && queueData && (
          <>
            {/* Flat view (no grouping) */}
            {!groupBy && (
              <Stack space="space.200">
                {queueData.embeds.length === 0 ? (
                  <Box backgroundColor="color.background.neutral" padding="space.300">
                    <Text>No Embeds match the current filters.</Text>
                  </Box>
                ) : (
                  <>
                    <Text weight="semibold">
                      Showing {Math.min(itemsToShow, queueData.embeds.length)} of {queueData.embeds.length} Embed{queueData.embeds.length !== 1 ? 's' : ''}
                    </Text>
                    {queueData.embeds.slice(0, itemsToShow).map(embed => (
                      <RedlineQueueCard
                        key={embed.localId}
                        embedData={embed}
                        currentUserId={currentUserId}
                      />
                    ))}

                    {/* Load More button */}
                    {itemsToShow < queueData.embeds.length && (
                      <Box backgroundColor="color.background.neutral" padding="space.200">
                        <Inline space="space.200" alignBlock="center" alignInline="center">
                          <Button appearance="primary" onClick={handleLoadMore}>
                            Load More ({queueData.embeds.length - itemsToShow} remaining)
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
                      const visibleEmbeds = embeds.slice(0, itemsToShow);
                      const hasMore = embeds.length > itemsToShow;

                      return (
                        <Box key={groupName}>
                          <Stack space="space.200">
                            <Heading size="medium">
                              {groupName} (Showing {visibleEmbeds.length} of {embeds.length})
                            </Heading>
                            {visibleEmbeds.map(embed => (
                              <RedlineQueueCard
                                key={embed.localId}
                                embedData={embed}
                                currentUserId={currentUserId}
                              />
                            ))}
                          </Stack>
                        </Box>
                      );
                    })}

                    {/* Load More button for grouped view */}
                    {(() => {
                      const totalItems = Object.values(queueData.groups).reduce((sum, embeds) => sum + embeds.length, 0);
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
        )}

        <Text size="small" color="color.text.subtlest">
          Phase 5 of 8 - Queue cards and actions complete. Advanced features coming in Phase 6.
        </Text>
      </Stack>
    </Box>
  );
}
