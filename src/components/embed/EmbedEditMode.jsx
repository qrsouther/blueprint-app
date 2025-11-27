/**
 * EmbedEditMode Component
 *
 * Renders the Embed in edit mode with configuration tabs and live preview.
 * Provides tabbed interface for configuring variables, toggles, and custom content.
 *
 * Features:
 * - Standard selector dropdown at top
 * - Header with standard name and "View Source" link
 * - Save status indicator (Saving/Saved)
 * - Publish to Page button (injects content to Confluence page storage)
 * - Three tabs: Toggles, Write (variables), Custom (insertions/notes)
 * - Live preview below tabs (updates as configuration changes)
 * - Preview mode switches based on selected tab (rendered vs raw with markers)
 *
 * @param {Object} props
 * @param {Object} props.excerpt - The selected Blueprint Standard (Source) object
 * @param {Array} props.availableExcerpts - List of all available Standards
 * @param {boolean} props.isLoadingExcerpts - Whether Standards list is loading
 * @param {string} props.selectedExcerptId - ID of currently selected Standard
 * @param {Function} props.handleExcerptSelection - Handler for Standard selection change
 * @param {Object} props.context - Forge context object
 * @param {string} props.saveStatus - Current save status ('saving'|'saved'|null)
 * @param {number} props.selectedTabIndex - Currently selected tab index (0=Toggles, 1=Write, 2=Custom)
 * @param {Function} props.setSelectedTabIndex - Handler to change selected tab
 * @param {Object} props.variableValues - Current variable values
 * @param {Function} props.setVariableValues - Update variable values
 * @param {Object} props.toggleStates - Current toggle states
 * @param {Function} props.setToggleStates - Update toggle states
 * @param {Array} props.customInsertions - Custom paragraph insertions
 * @param {Function} props.setCustomInsertions - Update custom insertions
 * @param {Array} props.internalNotes - Internal notes
 * @param {Function} props.setInternalNotes - Update internal notes
 * @param {string} props.insertionType - Type of insertion being added
 * @param {Function} props.setInsertionType - Update insertion type
 * @param {string} props.selectedPosition - Selected position for insertion
 * @param {Function} props.setSelectedPosition - Update selected position
 * @param {string} props.customText - Custom text input
 * @param {Function} props.setCustomText - Update custom text
 * @param {Function} props.getPreviewContent - Get rendered preview content
 * @param {Function} props.getRawPreviewContent - Get raw preview with markers
 * @param {Object} props.publishStatus - Publish status data from getPublishStatus resolver
 * @param {boolean} props.isPublishing - Whether publish is in progress
 * @param {Function} props.onPublish - Handler for publish button click
 * @param {boolean} props.needsRepublish - Whether content changed since last publish
 * @returns {JSX.Element} - Edit mode JSX
 */

import React, { Fragment, useState } from 'react';
import {
  Text,
  Em,
  Heading,
  Button,
  Stack,
  Inline,
  Box,
  Spinner,
  Select,
  Icon,
  Tabs,
  Tab,
  TabList,
  TabPanel,
  AdfRenderer,
  Lozenge,
  SectionMessage
} from '@forge/react';
import { router, view } from '@forge/bridge';
import { VariableConfigPanel } from '../VariableConfigPanel';
import { ToggleConfigPanel } from '../ToggleConfigPanel';
import { CustomInsertionsPanel } from '../CustomInsertionsPanel';
import { DocumentationLinksDisplay } from './DocumentationLinksDisplay';
import { logger } from '../../utils/logger.js';
import {
  excerptSelectorStyle,
  previewBoxStyle,
  adfContentContainerStyle
} from '../../styles/embed-styles';

export function EmbedEditMode({
  excerpt,
  availableExcerpts,
  isLoadingExcerpts,
  selectedExcerptId,
  handleExcerptSelection,
  context,
  saveStatus,
  selectedTabIndex,
  setSelectedTabIndex,
  control,
  setValue,
  insertionType,
  setInsertionType,
  selectedPosition,
  setSelectedPosition,
  customText,
  setCustomText,
  getPreviewContent,
  getRawPreviewContent,
  // New publish props
  publishStatus,
  isPublishing,
  onPublish,
  needsRepublish
}) {
  const [copySuccess, setCopySuccess] = useState(false);

  // Get localId from context
  const localId = context?.localId || context?.extension?.localId;

  // Handler for copying UUID to clipboard using native Clipboard API
  const handleCopyUuid = async () => {
    if (!localId) return;

    // Focus the window first to satisfy Clipboard API requirements
    try {
      window.focus();
    } catch (e) {
      // Focus failed, continue anyway
    }

    try {
      await navigator.clipboard.writeText(localId);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      // Fallback to legacy method if Clipboard API fails
      try {
        const textarea = document.createElement('textarea');
        textarea.value = localId;
        textarea.style.position = 'fixed';
        textarea.style.top = '0';
        textarea.style.left = '0';
        textarea.style.width = '2em';
        textarea.style.height = '2em';
        textarea.style.padding = '0';
        textarea.style.border = 'none';
        textarea.style.outline = 'none';
        textarea.style.boxShadow = 'none';
        textarea.style.background = 'transparent';
        document.body.appendChild(textarea);

        textarea.focus();
        textarea.select();

        const successful = document.execCommand('copy');
        document.body.removeChild(textarea);

        if (successful) {
          setCopySuccess(true);
          setTimeout(() => setCopySuccess(false), 2000);
        }
      } catch (fallbackError) {
        // Both methods failed, silently fail
      }
    }
  };

  // Use different preview based on selected tab
  // Toggles tab (0): Raw with markers
  // Write tab (1): Rendered without markers
  // Custom tab (2): Raw with markers
  const previewContent = (selectedTabIndex === 0 || selectedTabIndex === 2)
    ? getRawPreviewContent()
    : getPreviewContent();
  const isAdf = previewContent && typeof previewContent === 'object' && previewContent.type === 'doc';

  return (
    <Stack space="space.100">
      {/* Excerpt Selector - always visible at top of edit mode */}
      <Box xcss={excerptSelectorStyle}>
        {isLoadingExcerpts ? (
          <Spinner size="small" label="Loading..." />
        ) : (
          <Select
            options={availableExcerpts.map(ex => ({
              label: `${ex.name}${ex.category ? ` (${ex.category})` : ''}`,
              value: ex.id
            }))}
            value={availableExcerpts.map(ex => ({
              label: `${ex.name}${ex.category ? ` (${ex.category})` : ''}`,
              value: ex.id
            })).find(opt => opt.value === selectedExcerptId)}
            onChange={handleExcerptSelection}
            placeholder="Select a Source to Embed..."
          />
        )}
      </Box>

      <Inline space="space.300" alignBlock="center" spread="space-between">
        <Inline space="space.100" alignBlock="center">
          <Heading size="large">{excerpt?.name || 'Select a Source'}</Heading>
          {/* // Hidden for now as Embed workflow doesn't need this, but wired up for future use
          <Button
            appearance="link"
            onClick={async () => {
              try {
                // Navigate to the source page where this excerpt is defined
                const pageId = excerpt.sourcePageId || excerpt.pageId;
                // Use excerpt's space key, or fallback to current space key
                const spaceKey = excerpt.sourceSpaceKey || context?.extension?.space?.key || context?.spaceKey;

                if (pageId && spaceKey) {
                  // Build the URL manually since we have both pageId and spaceKey
                  const url = `/wiki/spaces/${spaceKey}/pages/${pageId}`;
                  await router.open(url);
                } else if (pageId) {
                  // Fallback: Try using view.createContentLink if we only have pageId
                  const contentLink = await view.createContentLink({
                    contentType: 'page',
                    contentId: pageId
                  });
                  await router.open(contentLink);
                }
              } catch (err) {
                logger.errors('[VIEW-SOURCE] Navigation error:', err);
              }
            }}
          >
            View Source
          </Button>
          */}
          {localId && (
            <Button
              appearance="subtle"
              onClick={handleCopyUuid}
              iconBefore={copySuccess ? undefined : <Text>📋</Text>}
            >
              {copySuccess ? '✓ Copied!' : `${localId.substring(0, 8)}...`}
            </Button>
          )}
        </Inline>
        <Inline space="space.100" alignBlock="center">
          {saveStatus === 'saving' && (
            <Fragment>
              <Spinner size="small" label="Saving" />
              <Text><Em>Saving...</Em></Text>
            </Fragment>
          )}
          {saveStatus === 'saved' && (
            <Fragment>
              <Icon glyph="check-circle" color="success" size="small" label="Saved" />
              <Text><Em>Saved</Em></Text>
            </Fragment>
          )}
        </Inline>
      </Inline>

      {/* Publish Status and Button */}
      {excerpt && onPublish && (
        <Box padding="space.100">
          <Inline space="space.200" alignBlock="center" spread="space-between">
            <Inline space="space.100" alignBlock="center">
              {publishStatus?.isPublished ? (
                <Fragment>
                  <Lozenge appearance={needsRepublish ? 'moved' : 'success'}>
                    {needsRepublish ? 'Changes Pending' : 'Published'}
                  </Lozenge>
                  <Text>
                    {needsRepublish 
                      ? 'Changes saved but not yet published to page'
                      : `Last published: ${publishStatus.publishedAt ? new Date(publishStatus.publishedAt).toLocaleString() : 'Unknown'}`}
                  </Text>
                </Fragment>
              ) : (
                <Fragment>
                  <Lozenge appearance="new">Not Published</Lozenge>
                  <Text>Content not yet on page</Text>
                </Fragment>
              )}
            </Inline>
            <Button
              appearance={needsRepublish || !publishStatus?.isPublished ? 'primary' : 'default'}
              onClick={onPublish}
              isDisabled={isPublishing || !selectedExcerptId}
            >
              {isPublishing 
                ? 'Publishing...' 
                : needsRepublish 
                  ? 'Publish Changes' 
                  : publishStatus?.isPublished 
                    ? 'Republish' 
                    : 'Publish to Page'}
            </Button>
          </Inline>
        </Box>
      )}

      <Tabs onChange={(index) => setSelectedTabIndex(index)}>
        <TabList>
          <Tab>Toggles</Tab>
          <Tab>Write</Tab>
          <Tab>Custom</Tab>
        </TabList>
        {/* Toggles Tab */}
        <TabPanel>
          <ToggleConfigPanel
            excerpt={excerpt}
            control={control}
            setValue={setValue}
          />
        </TabPanel>

        {/* Write Tab - Variables */}
        <TabPanel>
          <VariableConfigPanel
            excerpt={excerpt}
            control={control}
            setValue={setValue}
          />
        </TabPanel>

        {/* Custom Tab - Custom paragraph insertions and internal notes */}
        <TabPanel>
          <CustomInsertionsPanel
            excerpt={excerpt}
            control={control}
            insertionType={insertionType}
            setInsertionType={setInsertionType}
            selectedPosition={selectedPosition}
            setSelectedPosition={setSelectedPosition}
            customText={customText}
            setCustomText={setCustomText}
          />
        </TabPanel>
      </Tabs>

      {/* Preview - Always visible below tabs */}
      <Stack space="space.100">
        <DocumentationLinksDisplay documentationLinks={excerpt?.documentationLinks} />
        <Box xcss={previewBoxStyle}>
          {isAdf ? (
            <Box xcss={adfContentContainerStyle}>
              <AdfRenderer document={previewContent} />
            </Box>
          ) : (
            <Text>{previewContent || 'No content'}</Text>
          )}
        </Box>
      </Stack>
    </Stack>
  );
}
