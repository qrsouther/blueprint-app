/**
 * EmbedEditMode Component
 *
 * Renders the Embed in edit mode with configuration tabs and live preview.
 * Provides tabbed interface for configuring variables, toggles, and custom content.
 *
 * Features:
 * - Standard selector dropdown at top
 * - Header with standard name and "View Source" link
 * - Draft status indicator (Draft Saving/Draft Saved) - shows during blur, exit, reset, source switch
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
 * @param {string} props.saveStatus - Current draft save status ('saving'|'saved'|'error'|null)
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
 * @param {Function} props.getPreviewContent - Get fully rendered preview content (with variable substitutions, toggles, etc.)
 * @param {Object} props.publishStatus - Publish status data from getPublishStatus resolver
 * @param {boolean} props.isPublishing - Whether publish is in progress
 * @param {number} props.publishProgress - Progress value (0-1) for progress bar
 * @param {string} props.publishError - Error message if publish failed
 * @param {Function} props.onPublish - Handler for publish button click
 * @param {boolean} props.needsRepublish - Whether content changed since last publish
 * @param {string} props.originalExcerptId - Original excerpt ID (for Reset button - either published or initial)
 * @param {boolean} props.canReset - Whether Reset button should be enabled (source changed OR form dirty)
 * @param {Function} props.onClose - Handler for close button (Locked Page Model - null if in Confluence edit mode)
 * @returns {JSX.Element} - Edit mode JSX
 */

import React, { Fragment, useState, useEffect, useRef } from 'react';
import {
  Text,
  Em,
  Strong,
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
  Pressable,
  ButtonGroup,
  Textfield,
  TextArea,
  Label,
  Tooltip,
  ProgressBar,
  xcss
} from '@forge/react';
import { router, view } from '@forge/bridge';
import { VariableConfigPanel } from '../VariableConfigPanel';
import { ToggleConfigPanel } from '../ToggleConfigPanel';
import { CustomInsertionsPanel } from '../CustomInsertionsPanel';
import { DocumentationLinksDisplay } from './DocumentationLinksDisplay';
import { CompositorModal } from '../compositor/CompositorModal';
import { FreeformContentConfirmModal } from './FreeformContentConfirmModal';
import { logger } from '../../utils/logger.js';
import {
  excerptSelectorStyle,
  previewBoxStyle,
  adfContentContainerStyle
} from '../../styles/embed-styles';

/**
 * Check if any required variable is missing a value
 * Used to disable the Publish button until all required variables are filled in.
 * 
 * @param {Object} excerpt - The Source excerpt with variables array
 * @param {Object} variableValues - Object of variable name -> value
 * @param {boolean} isFreeformMode - Whether in freeform content mode
 * @param {string} freeformContent - Freeform content text
 * @returns {boolean} True if any required variable is missing a value
 */
const hasEmptyRequiredVariables = (excerpt, variableValues, isFreeformMode, freeformContent) => {
  // If in freeform mode with content, required variables don't apply
  // (freeform mode bypasses the Source structure entirely)
  if (isFreeformMode && freeformContent?.trim()) {
    return false;
  }

  // No variables defined = no required variables missing
  if (!excerpt?.variables || excerpt.variables.length === 0) {
    return false;
  }

  const values = variableValues || {};

  // Check if any REQUIRED variable is empty/null
  return excerpt.variables.some(v => {
    if (!v.required) return false;
    const value = values[v.name];
    return !value || value.trim() === '';
  });
};

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
  formKey,
  customHeading, // From form, not local state
  complianceLevel, // From form - compliance level selection
  // Freeform mode props
  isFreeformMode = false, // From form - whether in freeform content mode
  freeformContent = '', // From form - raw freeform content text
  // Form values needed for freeform modal warning check
  variableValues = {},
  toggleStates = {},
  customInsertions = [],
  internalNotes = [],
  insertionType,
  setInsertionType,
  selectedPosition,
  setSelectedPosition,
  customText,
  setCustomText,
  getPreviewContent,
  // New publish props
  publishStatus,
  isPublishing,
  publishProgress = 0, // 0-1 for progress bar
  publishError,
  onPublish,
  needsRepublish,
  originalExcerptId,
  canReset,
  // Locked Page Model props
  onClose,
  // New props for simplified architecture
  onBlur,  // Handler for localStorage draft saves on blur
  onReset,  // Handler for resetting to original state
  // Confluence edit mode flag - when true, show restricted UI with guidance message
  isConfluenceEditMode = false,
  // Redline status for approval workflow indicator
  redlineStatus = null
}) {
  const [copySuccess, setCopySuccess] = useState(false);
  const [isCompositorModalOpen, setIsCompositorModalOpen] = useState(false);
  const [isEditingHeading, setIsEditingHeading] = useState(false);
  const [editingHeadingValue, setEditingHeadingValue] = useState('');
  const previousExcerptNameRef = useRef(excerpt?.name);
  
  // Freeform content modal state
  const [isFreeformModalOpen, setIsFreeformModalOpen] = useState(false);
  const [pendingComplianceLevel, setPendingComplianceLevel] = useState(null);

  // Get localId and pageId from context
  const localId = context?.localId || context?.extension?.localId;
  const pageId = context?.contentId || context?.extension?.content?.id;

  // Build compliance level options based on Source's bespoke property
  // Only show Standard when bespoke=false, only show Bespoke when bespoke=true
  const isBespoke = excerpt?.bespoke || false;
  
  // Map compliance level to Lozenge appearance
  const complianceAppearanceMap = {
    'standard': 'success',
    'bespoke': 'new',
    'semi-standard': 'moved',
    'non-standard': 'removed',
    'tbd': 'default',
    'na': 'default'
  };
  
  // Build options with color circle emojis and Title Case labels
  // Values injected into Lozenges will be ALL CAPS
  const complianceLevelOptions = [
    // Conditional options based on bespoke
    ...(isBespoke 
      ? [{ label: '🟣 Bespoke', value: 'bespoke', appearance: 'new' }]
      : [{ label: '🟢 Standard', value: 'standard', appearance: 'success' }]
    ),
    // Always available options
    { label: '🟡 Semi-Standard', value: 'semi-standard', appearance: 'moved' },
    { label: '🔴 Non-Standard', value: 'non-standard', appearance: 'removed' },
    { label: '⚪ TBD', value: 'tbd', appearance: 'default' },
    { label: '⚪ N/A', value: 'na', appearance: 'default' }
  ];
  
  // Get the default compliance level based on bespoke
  const defaultComplianceLevel = isBespoke ? 'bespoke' : 'standard';
  const effectiveComplianceLevel = complianceLevel || defaultComplianceLevel;

  // Initialize ref on mount
  useEffect(() => {
    if (excerpt?.name && !previousExcerptNameRef.current) {
      previousExcerptNameRef.current = excerpt.name;
    }
  }, [excerpt?.name]);

  // Sync custom heading with excerpt name when excerpt changes
  // Only update if the heading hasn't been customized (still matches previous excerpt name)
  useEffect(() => {
    const currentExcerptName = excerpt?.name;
    const previousExcerptName = previousExcerptNameRef.current;
    
    // Only run if excerpt name actually changed (not on initial mount)
    if (!currentExcerptName || currentExcerptName === previousExcerptName) {
      return;
    }
    
    // Excerpt name changed - only update customHeading if:
    // 1. It's undefined/null (not set yet), OR
    // 2. It still matches the previous excerpt name (user hasn't customized it)
    // Don't overwrite if it's a custom value (doesn't match current or previous excerpt name)
    // Don't overwrite empty string - that means user cleared it intentionally
    const isUnset = customHeading === undefined || customHeading === null;
    const matchesPrevious = customHeading === previousExcerptName;
    const matchesCurrent = customHeading === currentExcerptName;
    
    // Only update if unset or matches previous (meaning it wasn't customized)
    // Never update if it matches current (already correct) or is empty (user cleared it)
    if (isUnset || (matchesPrevious && !matchesCurrent)) {
      setValue('customHeading', currentExcerptName, { shouldDirty: true });
    }
    
    // Update the ref to track the new excerpt name
    previousExcerptNameRef.current = currentExcerptName;
  }, [excerpt?.name, setValue]); // Removed customHeading from deps to prevent overwriting on load

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

  // Always show fully substituted content (toggles + variables + custom insertions)
  // regardless of which tab is selected
  const previewContent = getPreviewContent();
  
  const isAdf = previewContent && typeof previewContent === 'object' && previewContent.type === 'doc';

  // Check if toggles are defined
  const hasToggles = excerpt?.toggles && excerpt.toggles.length > 0;

  // Publish handler - heading comes from form, not parameter
  const handlePublishWithHeading = () => {
    if (onPublish) {
      // Pass null - saveAndPublish will get heading from form values
      onPublish(null);
    }
  };

  // Handler for Reset button - resets to original state
  const handleReset = async () => {
    // If onReset is provided (from useEmbedEditSession), use it
    if (onReset) {
      await onReset();
      // Reset heading to match the original source (form will be reset by onReset)
      const originalExcerpt = availableExcerpts.find(ex => ex.id === originalExcerptId);
      if (originalExcerpt) {
        previousExcerptNameRef.current = originalExcerpt.name;
      }
      return;
    }
    
    // Fallback to old behavior if onReset not provided
    if (originalExcerptId && handleExcerptSelection) {
      const originalExcerpt = availableExcerpts.find(ex => ex.id === originalExcerptId);
      if (originalExcerpt) {
        setValue('customHeading', originalExcerpt.name, { shouldDirty: true });
      }
      handleExcerptSelection({ value: originalExcerptId });
    }
  };

  // Handler for freeform modal - user chose "No, keep the Embed"
  const handleFreeformModalClose = () => {
    setIsFreeformModalOpen(false);
    setPendingComplianceLevel(null);
    // Don't change compliance level - keep current value
  };

  // Handler for freeform modal - user chose "Yes, write my own"
  const handleFreeformModalConfirm = () => {
    if (pendingComplianceLevel) {
      // Set the compliance level
      setValue('complianceLevel', pendingComplianceLevel, { shouldDirty: true });
      // Enable freeform mode
      setValue('isFreeformMode', true, { shouldDirty: true });
      // Clear existing config (variables, toggles, custom insertions, internal notes)
      setValue('variableValues', {}, { shouldDirty: true });
      setValue('toggleStates', {}, { shouldDirty: true });
      setValue('customInsertions', [], { shouldDirty: true });
      setValue('internalNotes', [], { shouldDirty: true });
      // Trigger draft save
      if (onBlur) {
        setTimeout(() => onBlur(), 0);
      }
    }
    setIsFreeformModalOpen(false);
    setPendingComplianceLevel(null);
  };

  return (
    <Stack space="space.100">
      {/* Top Section - Single Inline with Source Selector, Status, and ButtonGroup */}
      <Inline space="space.100" alignBlock="center" spread="space-between">
        {/* Source Selector - 50% width */}
        <Box xcss={[excerptSelectorStyle, xcss({ width: '100%' })]}>
          <Select
            options={isLoadingExcerpts ? [] : availableExcerpts.map(ex => ({
              label: ex.name,
              value: ex.id
            }))}
            value={isLoadingExcerpts ? undefined : availableExcerpts.map(ex => ({
              label: ex.name,
              value: ex.id
            })).find(opt => opt.value === selectedExcerptId)}
            onChange={isLoadingExcerpts ? undefined : handleExcerptSelection}
            placeholder="Loading..."
            isDisabled={isLoadingExcerpts}
          />
        </Box>

        {/* Status Indicators and ButtonGroup */}
        <Inline space="space.100" alignBlock="center">
          {/* Last published timestamp - hidden in Confluence edit mode */}
          {publishStatus?.isPublished && !needsRepublish && publishStatus.publishedAt && !isConfluenceEditMode && (
            <Text size="small" color="color.text.subtle">
              Last published: {new Date(publishStatus.publishedAt).toLocaleString()}
            </Text>
          )}

          {/* Draft status indicator - shows during blur, exit, reset, source switch (NOT during publish, hidden in Confluence edit mode) */}
          {saveStatus === 'saving' && !isPublishing && !isConfluenceEditMode && (
            <Fragment>
              <Spinner size="small" label="Saving draft" />
              <Text size="small"><Em>Draft Saving...</Em></Text>
            </Fragment>
          )}
          {saveStatus === 'saved' && !isPublishing && !isConfluenceEditMode && (
            <Fragment>
              <Icon glyph="check-circle" color="success" size="small" label="Draft saved" />
              <Text size="small"><Em>Draft Saved</Em></Text>
            </Fragment>
          )}

          {/* Redline status indicator - shows approval workflow status */}
          {redlineStatus && (
            <Lozenge 
              appearance={
                redlineStatus === 'reviewable' ? 'new' :
                redlineStatus === 'pre-approved' ? 'inprogress' :
                redlineStatus === 'needs-revision' ? 'removed' :
                redlineStatus === 'approved' ? 'success' : 'default'
              }
            >
              {redlineStatus === 'reviewable' ? 'Reviewable' :
               redlineStatus === 'pre-approved' ? 'Pre-Approved' :
               redlineStatus === 'needs-revision' ? 'Needs Revision' :
               redlineStatus === 'approved' ? 'Approved' : redlineStatus}
            </Lozenge>
          )}

          {/* ButtonGroup: GUID copy, Exit, Reset, Publish (some hidden in Confluence edit mode) */}
          <ButtonGroup>
            {/* GUID copy button - always available */}
            {localId && (
              <Button
                appearance="default"
                onClick={handleCopyUuid}
                iconBefore="angle-brackets"
                alignBlock="center"
              >
                {copySuccess ? 'Copied!' : 'Copy GUID'}
              </Button>
            )}
            {/* Exit button (renamed from Done) - only in View Mode editing */}
            {onClose && !isConfluenceEditMode && (
              <Button appearance="default" onClick={onClose}>
                Exit
              </Button>
            )}
            {/* Reset button - hidden in Confluence edit mode */}
            {canReset && !isConfluenceEditMode && (
              <Button 
                appearance="default" 
                onClick={handleReset}
                isDisabled={isLoadingExcerpts}
              >
                Reset
              </Button>
            )}
            {/* Blueprint Settings button - hidden in Confluence edit mode
            {pageId && !isConfluenceEditMode && (
              <Button
                appearance="subtle"
                onClick={() => setIsCompositorModalOpen(true)}
              >
                Blueprint Settings
              </Button>
            )}
            */}
            {/* Publish button - hidden in Confluence edit mode */}
            {excerpt && onPublish && !isConfluenceEditMode && (
              <Button
                appearance="primary"
                onClick={handlePublishWithHeading}
                isDisabled={isPublishing || !selectedExcerptId || hasEmptyRequiredVariables(excerpt, variableValues, isFreeformMode, freeformContent)}
              >
                {isPublishing ? 'Publishing...' : 'Publish'}
              </Button>
            )}
          </ButtonGroup>
        </Inline>
      </Inline>

      {/* Publish Progress Indicator - hidden in Confluence edit mode */}
      {isPublishing && !isConfluenceEditMode && (
        <Box xcss={xcss({ marginTop: 'space.200' })}>
          <ProgressBar
            ariaLabel="Publishing chapter to page"
            value={publishProgress}
            appearance={publishProgress >= 1 ? 'success' : 'default'}
          />
          <Text size="small" color="color.text.subtle" xcss={xcss({ marginTop: 'space.100' })}>
            {publishProgress >= 1 
              ? 'Publish complete!' 
              : 'Publishing your changes to the page...'}
          </Text>
        </Box>
      )}

      {/* Publish Error Message */}
      {publishError && (
        <SectionMessage appearance="error" title="Publish Failed">
          <Text>{publishError}</Text>
          <Text size="small" color="color.text.subtle">
            If you recently changed the Source, try refreshing the page and publishing again.
          </Text>
        </SectionMessage>
      )}

      {/* Confluence Edit Mode: Show guidance message instead of full editing UI */}
      {isConfluenceEditMode ? (
        <Box xcss={xcss({ marginTop: 'space.200', marginBottom: 'space.200' })}>
          <SectionMessage title="Edit Embeds in View Mode" appearance="information">
            <Stack space="space.150">
              <Text>
                To edit this Embed's content, please exit the page editor and use View Mode instead.
              </Text>
              <Text>
                In View Mode, click the <Strong>"Edit the Chapter"</Strong> button below the Embed to configure variables, toggles, and custom insertions.
              </Text>
              <Text size="small" color="color.text.subtle">
                This ensures your changes are properly saved and published.
              </Text>
            </Stack>
          </SectionMessage>
        </Box>
      ) : isFreeformMode ? (
        /* Freeform Content Mode UI */
        <Stack space="space.200">
          <SectionMessage appearance="information" title="Freeform Content Mode">
            <Text>
              You are writing fully custom content for this chapter. The standardized 
              Source structure (toggles, variables) is not being used.
            </Text>
          </SectionMessage>
          
          <Stack space="space.100">
            <Label labelFor="freeform-content">Your Custom Content</Label>
            <TextArea
              id="freeform-content"
              name="freeformContent"
              placeholder="Write your custom content here. This will be published as the entire body of this chapter..."
              value={freeformContent}
              onChange={(e) => {
                setValue('freeformContent', e.target.value, { shouldDirty: true });
              }}
              onBlur={() => {
                if (onBlur) {
                  onBlur();
                }
              }}
              minimumRows={8}
              resize="vertical"
            />
          </Stack>
          
          <Inline space="space.100" alignBlock="center">
            <Button
              appearance="subtle"
              onClick={() => {
                // Exit freeform mode but keep compliance level
                setValue('isFreeformMode', false, { shouldDirty: true });
                if (onBlur) {
                  setTimeout(() => onBlur(), 0);
                }
              }}
            >
              Exit Freeform Mode
            </Button>
            <Text size="small" color="color.text.subtle">
              (Returns to standard Embed editing)
            </Text>
          </Inline>
        </Stack>
      ) : (
        /* Standard Tabs UI */
        <Tabs 
          onChange={(index) => setSelectedTabIndex(index)}
          selected={selectedTabIndex ?? 1}
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
              onBlur={onBlur}
            />
          </TabPanel>

          {/* Write Tab - Variables */}
          <TabPanel>
            <VariableConfigPanel
              excerpt={excerpt}
              control={control}
              setValue={setValue}
              formKey={formKey}
              onBlur={onBlur}
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
              onBlur={onBlur}
            />
          </TabPanel>
        </Tabs>
      )}

      {/* Preview - Always visible below tabs (hidden in Confluence edit mode) */}
      {!isConfluenceEditMode && (
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
              {/* Chapter Heading with Compliance Level - Editable above Preview */}
              {excerpt && (
                <Box xcss={xcss({ 
                  marginBottom: 'space.100',
                  paddingLeft: 'space.150',
                  paddingTop: 'space.100'
                  })}
                  >
                  <Inline space="space.100" alignBlock="center" alignInline="start">
                    {/* Compliance Level Select with color emoji indicators */}
                    <Box xcss={xcss({ width: '150px', paddingBottom: 'space.0' })}>
                      <Select
                        inputId="compliance-level-select"
                        options={complianceLevelOptions}
                        value={complianceLevelOptions.find(opt => opt.value === effectiveComplianceLevel)}
                        onChange={(selected) => {
                          const newLevel = selected.value;
                          const freeformTriggerLevels = ['non-standard', 'tbd', 'na'];
                          
                          // Check if selecting a freeform-trigger level
                          if (freeformTriggerLevels.includes(newLevel)) {
                            // Store pending level and open confirmation modal
                            setPendingComplianceLevel(newLevel);
                            setIsFreeformModalOpen(true);
                          } else {
                            // Standard/bespoke/semi-standard - set directly and exit freeform mode if active
                            setValue('complianceLevel', newLevel, { shouldDirty: true });
                            if (isFreeformMode) {
                              setValue('isFreeformMode', false, { shouldDirty: true });
                            }
                            if (onBlur) {
                              setTimeout(() => onBlur(), 0);
                            }
                          }
                        }}
                        spacing="compact"
                        isSearchable={false}
                        menuPlacement="auto"
                      />
                    </Box>
                    {/* Custom editable heading - Pressable switches to Textfield on click */}
                    {isEditingHeading ? (
                      <Inline space="space.050" alignBlock="center">
                        <Box xcss={xcss({ minWidth: '400px', flexGrow: '1' })}>
                          <Textfield
                            value={editingHeadingValue}
                            onChange={(e) => setEditingHeadingValue(e.target.value)}
                            placeholder="Enter chapter heading..."
                            autoFocus
                          />
                        </Box>
                        <Button
                          appearance="subtle"
                          iconBefore="check-circle"
                          onClick={() => {
                            // Save the new heading value
                            const headingValue = editingHeadingValue || '';
                            setValue('customHeading', headingValue, { shouldDirty: true });
                            setIsEditingHeading(false);
                            // Trigger draft save
                            if (onBlur) {
                              setTimeout(() => onBlur(), 0);
                            }
                          }}
                        />
                        <Button
                          appearance="subtle"
                          iconBefore="cross-circle"
                          onClick={() => {
                            // Cancel editing without saving
                            setIsEditingHeading(false);
                            setEditingHeadingValue(customHeading || excerpt?.name || '');
                          }}
                        />
                      </Inline>
                    ) : (
                      <Pressable
                        onClick={() => {
                          setEditingHeadingValue(customHeading || excerpt?.name || '');
                          setIsEditingHeading(true);
                        }}
                        xcss={xcss({
                          backgroundColor: 'color.background.neutral.subtle',
                          padding: 'space.050',
                          borderRadius: 'border.radius.100',
                          cursor: 'pointer'
                        })}
                      >
                        <Inline space="space.050" alignBlock="center">
                          <Heading size="large">{customHeading || excerpt?.name || ''}</Heading>
                          <Text>✏️</Text>
                        </Inline>
                      </Pressable>
                    )}
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
      )}

      {/* Compositor Modal */}
      {pageId && (
        <CompositorModal
          isOpen={isCompositorModalOpen}
          onClose={() => setIsCompositorModalOpen(false)}
          pageId={pageId}
        />
      )}

      {/* Freeform Content Confirmation Modal */}
      <FreeformContentConfirmModal
        isOpen={isFreeformModalOpen}
        onClose={handleFreeformModalClose}
        onConfirm={handleFreeformModalConfirm}
        sourceName={excerpt?.name}
        complianceLevel={pendingComplianceLevel}
        variableValues={variableValues}
        toggleStates={toggleStates}
        customInsertions={customInsertions}
        internalNotes={internalNotes}
      />
    </Stack>
  );
}
