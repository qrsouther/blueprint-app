/**
 * UpdateAvailableBanner Component
 *
 * Displays a notification banner when the Blueprint Standard Source has been updated
 * since the Embed was last edited. Provides actions to update content and view diff.
 *
 * Features:
 * - Green success banner (SectionMessage appearance="success")
 * - Update button to sync with latest Source content
 * - View/Hide Diff button to toggle EnhancedDiffView
 * - Integrated EnhancedDiffView component for showing changes
 *
 * @param {Object} props
 * @param {boolean} props.isStale - Whether Source content has changed since last sync
 * @param {boolean} props.showDiffView - Whether diff view is currently visible
 * @param {Function} props.setShowDiffView - Toggle diff view visibility
 * @param {Function} props.handleUpdateToLatest - Handler for Update button
 * @param {boolean} props.isUpdating - Whether update operation is in progress
 * @param {Object} props.syncedContent - Previously synced Source content (for diff old side)
 * @param {Object} props.latestRenderedContent - Latest Source content (for diff new side)
 * @param {Object} props.variableValues - Current variable values for diff rendering
 * @param {Object} props.toggleStates - Current toggle states for diff rendering
 * @returns {JSX.Element|null} - Banner JSX or null if not stale
 */

import React, { Fragment } from 'react';
import {
  Text,
  Heading,
  Button,
  ButtonGroup,
  Stack,
  Inline,
  Box,
  SectionMessage
} from '@forge/react';
import { EnhancedDiffView } from '../EnhancedDiffView';
import { updateBannerStyle, sectionContentStyle } from '../../styles/embed-styles';

export function UpdateAvailableBanner({
  isStale,
  showDiffView,
  setShowDiffView,
  handleUpdateToLatest,
  isUpdating,
  syncedContent,
  latestRenderedContent,
  variableValues,
  toggleStates
}) {
  if (!isStale) {
    return null;
  }

  return (
    <Box xcss={updateBannerStyle}>
      <SectionMessage appearance="success">
        <Stack space="space.100">
          {/* Compact heading section with inline buttons */}
          <Inline spread="space-between" alignBlock="center" xcss={sectionContentStyle}>
            <Stack space="space.050">
              <Heading size="medium">Update Available</Heading>
              <Text>Source content has been updated since this Embed was last published.</Text>
            </Stack>
            <ButtonGroup>
              <Button
                appearance="primary"
                onClick={handleUpdateToLatest}
                isDisabled={isUpdating}
              >
                {isUpdating ? 'Updating...' : 'Update and Publish'}
              </Button>
              <Button
                appearance="default"
                onClick={() => setShowDiffView(!showDiffView)}
              >
                {showDiffView ? 'Hide' : 'View'} Diff
              </Button>
            </ButtonGroup>
          </Inline>

          {/* Enhanced diff view - inside green box, full width */}
          {showDiffView && (
            <EnhancedDiffView
              oldSourceContent={syncedContent}
              newSourceContent={latestRenderedContent}
              variableValues={variableValues}
              toggleStates={toggleStates}
            />
          )}
        </Stack>
      </SectionMessage>
    </Box>
  );
}
