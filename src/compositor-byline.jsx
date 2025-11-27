/**
 * Compositor Byline Entry Point
 *
 * This is the Forge UI Kit entry point for the Compositor.
 * It renders as a button in the Confluence page byline that opens
 * the CompositorModal when clicked.
 *
 * Module: confluence:contentBylineItem
 *
 * @module compositor-byline
 */

import React, { useState } from 'react';
import ForgeReconciler, {
  Button,
  Text,
  Inline,
  useProductContext
} from '@forge/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { CompositorModal } from './components/compositor/CompositorModal';
import ErrorBoundary from './components/common/ErrorBoundary.jsx';

// Create a client for React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      cacheTime: 1000 * 60 * 30, // 30 minutes
      refetchOnWindowFocus: false,
      retry: 1
    }
  }
});

/**
 * CompositorByline App
 *
 * Renders a button in the page byline that opens the Compositor modal.
 */
const App = () => {
  const context = useProductContext();
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Get page ID from context
  const pageId = context?.contentId || context?.extension?.content?.id;

  // Handle button click
  const handleOpenModal = () => {
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  return (
    <>
      <Button
        appearance="subtle"
        onClick={handleOpenModal}
        iconBefore={<Text>📘</Text>}
      >
        Blueprint Compositor
      </Button>

      <CompositorModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        pageId={pageId}
      />
    </>
  );
};

ForgeReconciler.render(
  <QueryClientProvider client={queryClient}>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </QueryClientProvider>
);

