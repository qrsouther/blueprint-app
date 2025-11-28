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
 * @param {string} props.publishError - Error message if publish failed
 * @param {Function} props.onPublish - Handler for publish button click
 * @param {boolean} props.needsRepublish - Whether content changed since last publish
 * @param {string} props.originalExcerptId - Original excerpt ID (for Reset button - either published or initial)
 * @param {Function} props.onClose - Handler for close button (Locked Page Model - null if in Confluence edit mode)
 * @returns {JSX.Element} - Edit mode JSX
 */

import React, { Fragment, useState, useEffect, useRef } from 'react';
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
  SectionMessage,
  InlineEdit,
  ButtonGroup,
  Textfield,
  Tooltip,
  xcss
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
  publishError,
  onPublish,
  needsRepublish,
  originalExcerptId,
  // Locked Page Model props
  onClose
}) {
  const [copySuccess, setCopySuccess] = useState(false);
  const [customHeading, setCustomHeading] = useState(excerpt?.name || 'Untitled Chapter');
  const previousExcerptNameRef = useRef(excerpt?.name);

  // Get localId from context
  const localId = context?.localId || context?.extension?.localId;

  // Sync custom heading with excerpt name when excerpt changes
  // Only update if the heading hasn't been customized (still matches previous excerpt name)
  useEffect(() => {
    const currentExcerptName = excerpt?.name || 'Untitled Chapter';
    const previousExcerptName = previousExcerptNameRef.current || 'Untitled Chapter';
    
    // If excerpt name changed
    if (currentExcerptName !== previousExcerptName) {
      // Only update customHeading if it still matches the previous excerpt name
      // (meaning user hasn't customized it yet)
      if (customHeading === previousExcerptName || 
          (previousExcerptName === 'Untitled Chapter' && customHeading === 'Untitled Chapter')) {
        setCustomHeading(currentExcerptName);
      }
      
      // Update the ref to track the new excerpt name
      previousExcerptNameRef.current = currentExcerptName;
    } else if (!previousExcerptNameRef.current && excerpt?.name) {
      // First time setting excerpt name
      setCustomHeading(excerpt.name);
      previousExcerptNameRef.current = excerpt.name;
    }
  }, [excerpt?.name]);

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

  // Check if toggles are defined
  const hasToggles = excerpt?.toggles && excerpt.toggles.length > 0;

  // Wrapper function for publish that includes custom heading
  const handlePublishWithHeading = () => {
    if (onPublish) {
      onPublish(customHeading);
    }
  };

  // Handler for Reset button - resets to original source
  const handleReset = () => {
    if (originalExcerptId && handleExcerptSelection) {
      // Find the original excerpt to get its name for heading reset
      const originalExcerpt = availableExcerpts.find(ex => ex.id === originalExcerptId);
      if (originalExcerpt) {
        // Reset heading to original source name
        setCustomHeading(originalExcerpt.name);
      }
      // Reset source selection
      handleExcerptSelection({ value: originalExcerptId });
    }
  };

  return (
    <Stack space="space.100">
      {/* Top Section - Single Inline with Source Selector, Status, and ButtonGroup */}
      <Inline space="space.100" alignBlock="center" spread="space-between">
        {/* Source Selector - 50% width */}
        <Box xcss={[excerptSelectorStyle, xcss({ width: '100%' })]}>
          <Select
            options={isLoadingExcerpts ? [] : availableExcerpts.map(ex => ({
              label: `${ex.name}${ex.category ? ` (${ex.category})` : ''}`,
              value: ex.id
            }))}
            value={isLoadingExcerpts ? undefined : availableExcerpts.map(ex => ({
              label: `${ex.name}${ex.category ? ` (${ex.category})` : ''}`,
              value: ex.id
            })).find(opt => opt.value === selectedExcerptId)}
            onChange={isLoadingExcerpts ? undefined : handleExcerptSelection}
            placeholder="Loading..."
            isDisabled={isLoadingExcerpts}
          />
        </Box>

        {/* Status Indicators and ButtonGroup */}
        <Inline space="space.100" alignBlock="center">
          {/* Last published timestamp */}
          {publishStatus?.isPublished && !needsRepublish && publishStatus.publishedAt && (
            <Text size="small" color="color.text.subtle">
              Last published: {new Date(publishStatus.publishedAt).toLocaleString()}
            </Text>
          )}

          {/* Saving/Saved indicator */}
          {saveStatus === 'saving' && (
            <Fragment>
              <Spinner size="small" label="Saving" />
              <Text size="small"><Em>Saving...</Em></Text>
            </Fragment>
          )}
          {saveStatus === 'saved' && (
            <Fragment>
              <Icon glyph="check-circle" color="success" size="small" label="Saved" />
              <Text size="small"><Em>Saved</Em></Text>
            </Fragment>
          )}

          {/* ButtonGroup: GUID copy, Exit, Reset, Publish */}
          <ButtonGroup>
            {/* GUID copy button */}
            {localId && (
              <Button
                appearance="default"
                onClick={handleCopyUuid}
                iconBefore="angle-brackets"
                alignBlock="center"
              >
                {copySuccess ? 'Copied!' : ''}
              </Button>
            )}
            {/* Exit button (renamed from Done) */}
            {onClose && (
              <Button appearance="default" onClick={onClose}>
                Exit
              </Button>
            )}
            {/* Reset button - only show if original excerpt exists and current is different */}
            {originalExcerptId && originalExcerptId !== selectedExcerptId && (
              <Button 
                appearance="default" 
                onClick={handleReset}
                isDisabled={isLoadingExcerpts}
              >
                Reset
              </Button>
            )}
            {/* Publish button */}
            {excerpt && onPublish && (
              <Button
                appearance="primary"
                onClick={handlePublishWithHeading}
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
            )}
          </ButtonGroup>
        </Inline>
      </Inline>

      {/* Publish Error Message */}
      {publishError && (
        <SectionMessage appearance="error" title="Publish Failed">
          <Text>{publishError}</Text>
          <Text size="small" color="color.text.subtle">
            If you recently changed the Source, try refreshing the page and publishing again.
          </Text>
        </SectionMessage>
      )}

      <Tabs 
        onChange={(index) => setSelectedTabIndex(index)}
        defaultSelected={hasToggles ? 0 : 1}
        id="embed-edit-tabs"
      >
        <TabList>
          {hasToggles ? (
            <Tab>
              <Heading size="medium" color="color.text.subtler">Toggles
              </Heading>
            </Tab>
          ) : (
            <Tooltip content="No Toggles defined for this Source.">
              <Tab>
                <Heading size="medium" color="color.text.subtle">Toggles</Heading>
              </Tab>
            </Tooltip>
          )}
          <Tab>
            <Heading size="medium" color="color.text.subtle">Write</Heading>
          </Tab>
          <Tab>
            <Heading size="medium" color="color.text.subtle">Custom
            </Heading>
          </Tab>
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
      <Stack space="space.0">
        <DocumentationLinksDisplay documentationLinks={excerpt?.documentationLinks} />
        <Box xcss={xcss({
          borderColor: 'color.border',
          borderWidth: 'border.width',
          borderStyle: 'solid',
          borderRadius: 'border.radius',
          paddingTop: 'space.0',
          paddingBottom: 'space.0'
        })}>
          <Stack space="space.0">
            {/* Chapter Heading - Editable above Preview */}
            {excerpt && (
              <Box xcss={xcss({ 
                margin: 'space.0',
                paddingLeft: 'space.150'
                })}
                >
                <Inline space="space.025" alignBlock="baseline" alignInline="start">
                  <Icon glyph="edit" label="Edit heading" size="medium" />
                  <InlineEdit
                    defaultValue={customHeading || excerpt?.name || 'Untitled Chapter'}
                    editView={({ errorMessage, ...fieldProps }) => (
                      <Textfield {...fieldProps} autoFocus placeholder="Enter chapter heading..." />
                    )}
                    readView={() => (
                      <Box xcss={xcss({ padding: 'space.0', margin: 'space.0' })}>
                        <Heading size="large">{customHeading || excerpt?.name || 'Untitled Chapter'}</Heading>
                      </Box>
                    )}
                    onConfirm={(value) => setCustomHeading(value || excerpt?.name || 'Untitled Chapter')}
                  />
                </Inline>
              </Box>
            )}
            {/* Preview Content */}
            {isAdf ? (
              <Box xcss={adfContentContainerStyle}>
                <AdfRenderer document={previewContent} />
              </Box>
            ) : (
              <Text>{previewContent || 'No content'}</Text>
            )}
          </Stack>
        </Box>
      </Stack>
    </Stack>
  );
}
