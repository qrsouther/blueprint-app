/**
 * Deploy Archetype Action Entry Point
 *
 * This is the Forge UI Kit entry point for the Deploy Blueprint action.
 * It appears in Confluence's page actions menu (...) and opens
 * the DeployArchetypeModal when clicked.
 *
 * Module: confluence:contentAction
 *
 * @module deploy-archetype-action
 */

import React, { useState } from 'react';
import ForgeReconciler, {
  Button,
  Text,
  Inline,
  useProductContext
} from '@forge/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { DeployArchetypeModal } from './components/deploy/DeployArchetypeModal';
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
 * DeployArchetypeAction App
 *
 * Renders the content action that opens the Deploy Archetype modal.
 * Content actions automatically open when clicked from the page menu.
 */
const App = () => {
  const context = useProductContext();
  const [isModalOpen, setIsModalOpen] = useState(true); // Auto-open on action click

  // Get page ID from context
  const pageId = context?.contentId || context?.extension?.content?.id;

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  const handleDeployComplete = () => {
    setIsModalOpen(false);
    // Page will need to be refreshed to see the deployed Embeds
  };

  return (
    <DeployArchetypeModal
      isOpen={isModalOpen}
      onClose={handleCloseModal}
      onDeployComplete={handleDeployComplete}
      pageId={pageId}
    />
  );
};

ForgeReconciler.render(
  <QueryClientProvider client={queryClient}>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </QueryClientProvider>
);

