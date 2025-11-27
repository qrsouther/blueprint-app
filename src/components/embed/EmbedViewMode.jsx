/**
 * EmbedViewMode Component
 *
 * Renders the Embed in view mode (read-only) with cached content.
 * Shows subtle indicator while checking for updates, then progressive disclosure
 * of update banner when user clicks "Review Update" button.
 *
 * For the Compositor + Native Injection model:
 * - When isPublished=true, this component renders nothing by default
 * - Only becomes visible when staleness is detected
 * - Shows Update Available banner to allow republishing
 *
 * Features:
 * - Renders cached ADF or plain text content
 * - Shows subtle "Checking..." indicator during staleness check
 * - Shows green "Review Update" button when stale content detected
 * - Progressive disclosure: banner only appears when user clicks Review button
 * - Cleans ADF for proper rendering
 * - Handles loading states
 * - Optional: Hides completely when content is published (isPublished=true)
 *
 * @param {Object} props
 * @param {Object|string} props.content - Cached content to display (ADF or text)
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
 * @param {Object} props.excerpt - The Source excerpt object with documentationLinks
 * @param {Array} props.internalNotes - Internal notes to apply to content
 * @param {boolean} props.isPublished - Whether content has been published to page (Compositor model)
 * @param {Function} props.onRepublish - Handler for republish button when stale (Compositor model)
 * @param {Function} props.onEditClick - Handler for Edit button (Locked Page Model)
 * @returns {JSX.Element} - View mode JSX
 */

import React, { Fragment, useState } from 'react';
import {
  Text,
  Box,
  AdfRenderer,
  Stack,
  Lozenge,
  Inline,
  xcss,
  Heading,
  Button
} from '@forge/react';

// Subtle border wrapper that appears only when stale
const staleBorderWrapperStyle = xcss({
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderColor: 'color.border',
  borderRadius: 'border.radius',
  padding: 'space.200'
});
import { cleanAdfForRenderer, insertInternalNotesInAdf } from '../../utils/adf-rendering-utils';
import { UpdateAvailableBanner } from './UpdateAvailableBanner';
import { DocumentationLinksDisplay } from './DocumentationLinksDisplay';
import { StalenessCheckIndicator } from './StalenessCheckIndicator';
import { adfContentContainerStyle } from '../../styles/embed-styles';

// Style for the Edit button container (positioned at top-right)
const editButtonContainerStyle = xcss({
  position: 'absolute',
  top: 'space.100',
  right: 'space.100',
  zIndex: 'layer'
});

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
  // COMPOSITOR MODEL: Minimal UI when content is published natively
  // ============================================================================
  // When content has been published to the page (isPublished=true), we don't need
  // to render the preview content - it's already on the page natively.
  // We only show:
  // 1. Edit button (always, for Locked Page Model)
  // 2. Update Available banner (only when stale, with Review button)
  if (isPublished) {
    return (
      <Box xcss={xcss({ padding: 'space.050' })}>
        {/* Edit button - always visible in Locked Page Model */}
        {onEditClick && (
          <Inline space="space.100" alignBlock="center">
            <Button appearance="subtle" onClick={onEditClick}>
              Edit ✏️
            </Button>
            {/* Show subtle "Update Available" indicator when stale */}
            {isStale && !isCheckingStaleness && !showUpdateBanner && (
              <Button appearance="warning" onClick={handleReviewClick}>
                Update Available
              </Button>
            )}
          </Inline>
        )}
        
        {/* Full Update banner - only shown after clicking "Update Available" */}
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
  // LEGACY MODE: Render full iframe content (current behavior)
  // ============================================================================
  
  // Loading state
  if (!content) {
    return <Text>Loading content...</Text>;
  }

  const isAdf = content && typeof content === 'object' && content.type === 'doc';

  // Wrapper content - either with border (when stale and checking is complete) or without
  // Border only appears AFTER checking completes AND staleness is detected
  const wrapperContent = (children) => {
    if (isStale && !isCheckingStaleness) {
      return <Box xcss={staleBorderWrapperStyle}>{children}</Box>;
    }
    return <Fragment>{children}</Fragment>;
  };

  // ADF content
  if (isAdf) {
    // Apply internal notes if they exist (cached content might be stale)
    // Check if content already has internal note markers by looking for #505258 color text nodes
    let contentWithNotes = content;
    if (internalNotes && internalNotes.length > 0) {
      // Check if markers already exist by searching for light gray-colored text nodes
      const hasExistingMarkers = (() => {
        const checkNode = (node) => {
          if (!node) return false;
          if (node.type === 'text' && node.marks) {
            const hasLightGrayColor = node.marks.some(mark => 
              mark.type === 'textColor' && mark.attrs?.color === '#505258'
            );
            if (hasLightGrayColor) return true;
          }
          if (node.content && Array.isArray(node.content)) {
            return node.content.some(child => checkNode(child));
          }
          return false;
        };
        return checkNode(content);
      })();
      
      // Only apply if markers don't already exist (prevents duplicates)
      if (!hasExistingMarkers) {
        contentWithNotes = insertInternalNotesInAdf(content, internalNotes);
      }
    }
    
    const cleaned = cleanAdfForRenderer(contentWithNotes);

    if (!cleaned) {
      return <Text>Error: Content cleaning failed</Text>;
    }

    return wrapperContent(
      <Box xcss={xcss({ position: 'relative', width: '100%' })}>
        {/* Edit button for Locked Page Model */}
        {onEditClick && (
          <Box xcss={editButtonContainerStyle}>
            <Button appearance="subtle" onClick={onEditClick}>
              Edit ✏️
            </Button>
          </Box>
        )}
        {/* Only show Review Update button when stale (not when just checking) */}
        {isStale && !isCheckingStaleness && (
          <StalenessCheckIndicator
            isCheckingStaleness={false}
            isStale={isStale}
            showUpdateBanner={showUpdateBanner}
            onReviewClick={handleReviewClick}
          />
        )}
        <Stack space="space.150">
          {showUpdateBanner && (
            <UpdateAvailableBanner
              isStale={isStale}
              showDiffView={showDiffView}
              setShowDiffView={setShowDiffView}
              handleUpdateToLatest={handleUpdateToLatest}
              isUpdating={isUpdating}
              syncedContent={syncedContent}
              latestRenderedContent={latestRenderedContent}
              variableValues={variableValues}
              toggleStates={toggleStates}
            />
          )}
          {/* Hidden from rendering within Embed itself for now as Confluence's Table of Contents macro cannot detect/parse content within iframes, which the Embed macro is.
          <Inline space="space.100" alignBlock="center"> <Lozenge appearance="success">Standard</Lozenge>
            <Heading level={2}>{excerpt?.name || excerpt?.category}</Heading>
          </Inline>
          */}
          <DocumentationLinksDisplay
            documentationLinks={excerpt?.documentationLinks}
            isCheckingStaleness={isCheckingStaleness}
            redlineStatus={redlineStatus}
            approvedBy={approvedBy}
            approvedAt={approvedAt}
            lastChangedBy={lastChangedBy}
          />
          <Box xcss={adfContentContainerStyle}>
            <AdfRenderer document={cleaned} />
          </Box>
        </Stack>
      </Box>
    );
  }

  // Plain text content
  return wrapperContent(
    <Box xcss={xcss({ position: 'relative', width: '100%' })}>
      {/* Edit button for Locked Page Model */}
      {onEditClick && (
        <Box xcss={editButtonContainerStyle}>
          <Button appearance="subtle" onClick={onEditClick}>
            Edit ✏️
          </Button>
        </Box>
      )}
      {/* Only show Review Update button when stale (not when just checking) */}
      {isStale && !isCheckingStaleness && (
        <StalenessCheckIndicator
          isCheckingStaleness={false}
          isStale={isStale}
          showUpdateBanner={showUpdateBanner}
          onReviewClick={handleReviewClick}
        />
      )}
      <Stack space="space.200">
        {showUpdateBanner && (
          <UpdateAvailableBanner
            isStale={isStale}
            showDiffView={showDiffView}
            setShowDiffView={setShowDiffView}
            handleUpdateToLatest={handleUpdateToLatest}
            isUpdating={isUpdating}
            syncedContent={syncedContent}
            latestRenderedContent={latestRenderedContent}
            variableValues={variableValues}
            toggleStates={toggleStates}
          />
        )}
        {/* Hidden from rendering within Embed itself for now as Confluence's Table of Contents macro cannot detect/parse content within iframes, which the Embed macro is.
        <Inline space="space.100" alignBlock="center"> <Lozenge appearance="success">Standard</Lozenge>
          <Heading level={2}>{excerpt?.name || excerpt?.category}</Heading>
        </Inline>
        */}
        <DocumentationLinksDisplay
          documentationLinks={excerpt?.documentationLinks}
          isCheckingStaleness={isCheckingStaleness}
          redlineStatus={redlineStatus}
          approvedBy={approvedBy}
          approvedAt={approvedAt}
          lastChangedBy={lastChangedBy}
        />
        <Box xcss={adfContentContainerStyle}>
          {content && typeof content === 'object' && content.type === 'doc' ? (
            <AdfRenderer document={content} />
          ) : (
            <Text>{content}</Text>
          )}
        </Box>
      </Stack>
    </Box>
  );
}
