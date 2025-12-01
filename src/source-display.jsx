import React, { 
  Fragment, 
  useEffect, 
  useRef
} 
from 'react';
import ForgeReconciler, { 
  Box,
  Text,
  useConfig,
  useProductContext,
  Inline, 
  Lozenge,
  Heading,
  Stack, 
  AdfRenderer,
  Spinner,
  xcss
} from '@forge/react';
import { invoke } from '@forge/bridge';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import { DocumentationLinksDisplay } from './components/embed/DocumentationLinksDisplay';
import { logger } from './utils/logger.js';

// Create a client for React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30, // 30 minutes
      refetchOnWindowFocus: false,
      retry: 1
    }
  }
});

// Memoized AdfRenderer to prevent re-renders
const MemoizedAdfRenderer = React.memo(({ document }) => {
  return <AdfRenderer document={document} />;
});

// Loading container style - centers spinner and prevents scrollbar flicker
const loadingContainerStyle = xcss({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '200px', // Fixed height to prevent size changes
  width: '100%',
  overflow: 'hidden', // Hide scrollbars
  padding: 'space.400'
});

const App = () => {
  const config = useConfig();
  const context = useProductContext();
  const queryClient = useQueryClient();

  // Access the macro body (rich text content)
  const macroBody = context?.extension?.macro?.body;

  // Capture macroBody on first render and NEVER update it (to prevent re-render loops in view mode)
  const [frozenMacroBody, setFrozenMacroBody] = React.useState(null);
  const hasInitialized = useRef(false);

  // Track last content hash to detect actual changes
  const lastContentHashRef = useRef(null);
  // Track if update is in progress to prevent duplicates
  const updateInProgressRef = useRef(false);
  
  // Use React Query to fetch excerpt data with aggressive caching for source-display
  // This caches the entire unit (Lozenges, Heading, body content) aggressively
  const {
    data: excerptData,
    isLoading: isLoadingExcerpt,
    error: excerptError
  } = useQuery({
    queryKey: ['excerpt', config?.excerptId],
    queryFn: async () => {
      if (!config?.excerptId) {
        return null;
      }

      const result = await invoke('getExcerpt', { excerptId: config.excerptId });

      if (!result.success || !result.data?.excerpt) {
        throw new Error(result.error || 'Failed to load excerpt');
      }

      return result.data.excerpt;
    },
    enabled: !!config?.excerptId,
    staleTime: 1000 * 60 * 60, // 1 hour - aggressive caching
    gcTime: 1000 * 60 * 60 * 24, // 24 hours - keep in cache for a long time
    refetchOnWindowFocus: false,
    retry: 1
  });

  React.useEffect(() => {
    if (macroBody && !hasInitialized.current) {
      setFrozenMacroBody(macroBody);
      hasInitialized.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount

  // Re-enabled body change detection with proper safeguards for staleness tracking
  // This updates the excerpt timestamp when body content changes (after page publish/save)
  useEffect(() => {
    // Don't check during editing or if config not ready
    if (!config?.excerptId || !macroBody || context?.extension?.isEditing || updateInProgressRef.current) {
      return;
    }

    const checkAndUpdateContent = async () => {
      try {
        // Calculate content hash to detect actual changes (not just re-renders)
        const contentStr = JSON.stringify(macroBody);
        const currentHash = contentStr.length + '-' + contentStr.slice(0, 50); // Simple hash

        // Skip if content hasn't changed
        if (lastContentHashRef.current === currentHash) {
          return;
        }

        // Mark update in progress to prevent duplicates
        updateInProgressRef.current = true;

        // Call updateExcerptContent to update timestamp if content changed
        const result = await invoke('updateExcerptContent', {
          excerptId: config.excerptId,
          content: macroBody
        });

        if (result.success) {
          // Update our hash tracker
          lastContentHashRef.current = currentHash;
          
          // If content actually changed (not just a re-render), invalidate the cache
          // This forces a re-fetch with the new contentHash
          if (!result.unchanged) {
            await queryClient.invalidateQueries({ 
              queryKey: ['excerpt', config.excerptId] 
            });
          }
        }
        // Silently handle failures - don't spam console for expected errors
      } catch (err) {
        // Only log unexpected errors
        if (err && err.message && !err.message.includes('not found')) {
          logger.errors('Error:', err);
        }
      } finally {
        updateInProgressRef.current = false;
      }
    };

    // Debounce: wait 1 second after content settles before checking
    const timeoutId = setTimeout(checkAndUpdateContent, 1000);
    return () => clearTimeout(timeoutId);
  }, [config?.excerptId, macroBody, context?.extension?.isEditing, queryClient]);

  // Track the last known contentHash to detect changes
  const lastKnownContentHashRef = useRef(null);
  
  // Update lastKnownContentHash when excerptData loads
  useEffect(() => {
    if (excerptData?.contentHash) {
      lastKnownContentHashRef.current = excerptData.contentHash;
    }
  }, [excerptData?.contentHash]);

  // If no configuration yet, show placeholder
  if (!config || !config.excerptName) {
    return (
      <Box xcss={loadingContainerStyle}>
        <Spinner size="large" label="Loading source..." />
      </Box>
    );
  }

  // Use frozen body to prevent re-renders with normalized ADF
  const bodyToRender = frozenMacroBody || macroBody;

  // Show loading state while fetching excerpt data or if no body content
  if (isLoadingExcerpt || !bodyToRender) {
    return (
      <Box xcss={loadingContainerStyle}>
        <Spinner size="large" label="Loading source..." />
      </Box>
    );
  }

  // Show error state if excerpt fetch failed
  if (excerptError) {
    logger.errors('Error loading excerpt:', excerptError);
    // Still render body content even if metadata failed
  }

  return (
    <Fragment>
      <Box paddingBlockEnd="space.100">
        <Stack space="space.100">
          {excerptData && (
            <Inline space="space.100" alignBlock="baseline">
              <Text>{excerptData.bespoke ? '🟣' : '🟢'}</Text>
              <Heading size="medium">{excerptData.name || excerptData.category}</Heading>
              <Lozenge appearance="default">{excerptData.category}</Lozenge>
            </Inline>
          )}
          <DocumentationLinksDisplay documentationLinks={excerptData?.documentationLinks} />
          {typeof bodyToRender === 'object' ? (
              <MemoizedAdfRenderer document={bodyToRender} />
          ) : (
            <Text>{bodyToRender || 'No content yet. Edit the macro body to add content.'}</Text>
          )}
        </Stack>
      </Box>
    </Fragment>
  );
};

ForgeReconciler.render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>
);
