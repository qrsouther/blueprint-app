/**
 * EmbedViewMode Component
 *
 * Renders the Embed in view mode (control interface only).
 * 
 * IMPORTANT: This component NEVER renders content preview. For Embed macros,
 * content is already injected into the page natively, so we only show control buttons.
 * 
 * Features:
 * - Shows "Edit the chapter below" button (various states: loading, enabled, disabled)
 * - Shows "Update Available" button when content is stale
 * - Shows "under construction" SectionMessage when required variables are missing
 * - Shows Update Available banner with diff view (after clicking Update Available)
 * - Handles loading states
 *
 * @param {Object} props
 * @param {Object|string} props.content - Cached content (not rendered, only used for loading state)
 * @param {boolean} props.isStale - Whether Source content has changed
 * @param {boolean} props.isCheckingStaleness - Whether staleness check is running
 * @param {boolean} props.showDiffView - Whether diff view is visible
 * @param {Function} props.setShowDiffView - Toggle diff view
 * @param {Function} props.handleUpdateToLatest - Update to latest content
 * @param {boolean} props.isUpdating - Whether update is in progress
 * @param {Object} props.syncedContent - Previously synced Source content
 * @param {Object} props.latestRenderedContent - Latest Source content
 * @param {Object} props.variableValues - Current variable values
 * @param {Object} props.toggleStates - Current toggle states
 * @param {Object} props.excerpt - The Source excerpt object
 * @param {Array} props.internalNotes - Internal notes (not used in view mode)
 * @param {boolean} props.isPublished - Whether content has been published to page
 * @param {Function} props.onRepublish - Handler for republish button when stale
 * @param {Function} props.onEditClick - Handler for Edit button (Locked Page Model)
 * @param {boolean} props.isIncomplete - Whether required variables are missing
 * @returns {JSX.Element} - View mode JSX (buttons and messages only, no content)
 */

import React, { useState } from 'react';
import {
  Text,
  Box,
  Inline,
  xcss,
  Heading,
  Button,
  Strong,
  SectionMessage,
  Lozenge
} from '@forge/react';
import { UpdateAvailableBanner } from './UpdateAvailableBanner';
import { editButtonBorderContainerStyle } from '../../styles/embed-styles';

/**
 * RedlineStatusLozenge - Displays the redline approval status as a colored lozenge
 * @param {string} status - The redline status value
 */
function RedlineStatusLozenge({ status }) {
  if (!status) return null;
  
  const appearances = {
    'reviewable': 'new',
    'pre-approved': 'inprogress',
    'needs-revision': 'removed',
    'approved': 'success'
  };
  
  const labels = {
    'reviewable': 'Reviewable',
    'pre-approved': 'Pre-Approved',
    'needs-revision': 'Needs Revision',
    'approved': 'Approved'
  };
  
  return (
    <Lozenge appearance={appearances[status] || 'default'}>
      {labels[status] || status}
    </Lozenge>
  );
}


export function EmbedViewMode({
  content,
  isStale,
  isCheckingStaleness,
  showDiffView,
  setShowDiffView,
  handleUpdateToLatest,
  isUpdating,
  syncedContent,
  latestRenderedContent,
  variableValues,
  toggleStates,
  excerpt,
  internalNotes = [],
  redlineStatus,
  approvedBy,
  approvedAt,
  lastChangedBy,
  // Compositor + Native Injection model props
  isPublished = false,
  isIncomplete = false,
  onRepublish,
  // Locked Page Model props
  onEditClick
}) {
  // State for progressive disclosure - only show banner when user clicks Review button
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);

  // Handler for when user clicks "Review Update" button on indicator
  // Auto-expands diff view so user sees comparison immediately
  const handleReviewClick = () => {
    setShowUpdateBanner(true);
    setShowDiffView(true);
  };

  // ============================================================================
  // INCOMPLETE EMBED: Show placeholder when required variables are missing
  // ============================================================================
  // When an Embed has unfilled required variables, show a placeholder instead
  // of blank content. This appears for both published and unpublished states.
  if (isIncomplete) {
    const sourceName = excerpt?.name || 'Untitled';
    return (
      <Box xcss={xcss({ padding: 'space.050' })}>
        {/* Edit button */}
        {onEditClick && (
          <Box xcss={editButtonBorderContainerStyle}>
            <Inline space="space.100" alignBlock="center">
              <Button 
                appearance="default" 
                onClick={onEditClick}
                shouldFitContainer={false}
                iconBefore="chevron-down"
                spacing="compact"
              >
                Edit the chapter below
              </Button>
              <RedlineStatusLozenge status={redlineStatus} />
            </Inline>
          </Box>
        )}
        
        {/* Source name heading */}
        <Box xcss={xcss({ marginTop: 'space.150', marginBottom: 'space.100' })}>
          <Heading size="medium">{sourceName}</Heading>
        </Box>
        
        {/* Warning message */}
        <SectionMessage appearance="warning">
          <Text>
            The <Strong>{sourceName}</Strong> chapter of this Blueprint is currently being drafted. Check back later.
          </Text>
        </SectionMessage>
      </Box>
    );
  }

  // ============================================================================
  // COMPOSITOR MODEL: Minimal UI when content is published natively
  // ============================================================================
  // When content has been published to the page (isPublished=true), we don't need
  // to render the preview content - it's already on the page natively.
  // We only show:
  // 1. Edit button (when NOT stale, for Locked Page Model)
  // 2. Update Available button (when stale, replaces Edit button)
  // 3. Update Available banner with diff view (after clicking Update Available)
  if (isPublished) {
    return (
      <Box xcss={xcss({ padding: 'space.050' })}>
        {/* Show Edit button when NOT stale (keep visible while checking staleness) */}
        {onEditClick && !isStale && (
          <Box xcss={editButtonBorderContainerStyle}>
            <Inline space="space.100" alignBlock="center">
              <Button 
                appearance="default" 
                onClick={onEditClick}
                shouldFitContainer={false}
                iconBefore="chevron-down"
                spacing="compact"
                isDisabled={isCheckingStaleness}
              >
                Edit the chapter below
              </Button>
              <RedlineStatusLozenge status={redlineStatus} />
            </Inline>
          </Box>
        )}
        
        {/* Show Update Available button when stale (replaces Edit button) */}
        {isStale && !isCheckingStaleness && !showUpdateBanner && (
          <Box xcss={editButtonBorderContainerStyle}>
            <Button 
              appearance="warning" 
              onClick={handleReviewClick}
              shouldFitContainer={true}
              spacing="compact"
            >
              Update Available for chapter below
            </Button>
          </Box>
        )}
        
        {/* Full Update banner with diff view - shown after clicking "Update Available" */}
        {showUpdateBanner && isStale && (
          <Box xcss={xcss({ marginTop: 'space.100' })}>
            <UpdateAvailableBanner
              isStale={isStale}
              showDiffView={showDiffView}
              setShowDiffView={setShowDiffView}
              handleUpdateToLatest={onRepublish || handleUpdateToLatest}
              isUpdating={isUpdating}
              syncedContent={syncedContent}
              latestRenderedContent={latestRenderedContent}
              variableValues={variableValues}
              toggleStates={toggleStates}
            />
          </Box>
        )}
      </Box>
    );
  }

  // ============================================================================
  // EMBED MACRO VIEW MODE: Never render content (content is injected natively)
  // ============================================================================
  // For Embed macros, content is already injected into the page natively.
  // View mode should only show control buttons, never render content preview.
  
  // Loading state - show Edit button disabled while loading
  const isLoading = !content && !isPublished;
  
  if (isLoading) {
    return (
      <Box xcss={xcss({ padding: 'space.050' })}>
        <Box xcss={editButtonBorderContainerStyle}>
          <Inline 
            space="space.100" 
            alignBlock="center"
          >
            <Button 
              appearance="default" 
              onClick={onEditClick}
              shouldFitContainer={false}
              iconBefore="chevron-down"
              spacing="compact"
              isDisabled={true}
            >
              Loading Editor...
            </Button>
            <RedlineStatusLozenge status={redlineStatus} />
          </Inline>
        </Box>
      </Box>
    );
  }

  // For unpublished content (legacy mode), still show Edit button but no content
  // Content rendering is removed - Embed macros never render content in view mode
  return (
    <Box xcss={xcss({ padding: 'space.050' })}>
      {/* Edit button for Locked Page Model */}
      {onEditClick && (
        <Box xcss={editButtonBorderContainerStyle}>
          <Inline 
            space="space.100" 
            alignBlock="center"
          >
            <Button 
              appearance="default" 
              onClick={onEditClick}
              shouldFitContainer={false}
              iconBefore="chevron-down"
              spacing="compact"
              isDisabled={isCheckingStaleness}
            >
              Edit the Chapter below
            </Button>
            <RedlineStatusLozenge status={redlineStatus} />
          </Inline>
        </Box>
      )}
      
      {/* Show Update Available button when stale (replaces Edit button) */}
      {isStale && !isCheckingStaleness && !showUpdateBanner && (
        <Box xcss={editButtonBorderContainerStyle}>
          <Button 
            appearance="warning" 
            onClick={handleReviewClick}
            shouldFitContainer={true}
            spacing="compact"
          >
            Update Available for chapter below
          </Button>
        </Box>
      )}
      
      {/* Update banner with diff view - shown after clicking "Update Available" */}
      {showUpdateBanner && isStale && (
        <Box xcss={xcss({ marginTop: 'space.100' })}>
          <UpdateAvailableBanner
            isStale={isStale}
            showDiffView={showDiffView}
            setShowDiffView={setShowDiffView}
            handleUpdateToLatest={onRepublish || handleUpdateToLatest}
            isUpdating={isUpdating}
            syncedContent={syncedContent}
            latestRenderedContent={latestRenderedContent}
            variableValues={variableValues}
            toggleStates={toggleStates}
          />
        </Box>
      )}
    </Box>
  );
}
