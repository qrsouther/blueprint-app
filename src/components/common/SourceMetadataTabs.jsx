/**
 * SourceMetadataTabs Component
 *
 * Shared component for editing Source metadata across both:
 * - source-config.jsx (Forge macro config modal)
 * - ExcerptPreviewModal.jsx (Admin UI modal)
 *
 * Contains the four tabs: Name/Category, Variables, Toggles, Documentation
 *
 * @param {Object} props - All the state and handlers needed for the tabs
 */

import React, { Fragment } from 'react';
import {
  Text,
  Strong,
  Em,
  Code,
  Button,
  Box,
  Stack,
  Inline,
  SectionMessage,
  Tabs,
  Tab,
  TabList,
  TabPanel,
  Select,
  Toggle,
  Icon,
  Label,
  FormSection,
  xcss
} from '@forge/react';
import { StableTextfield } from './StableTextfield';

/**
 * SourceMetadataTabs - Shared tabs for Source metadata editing
 *
 * @param {Object} props
 * @param {string} props.excerptName - Source name
 * @param {Function} props.setExcerptName - Setter for source name
 * @param {string} props.category - Selected category
 * @param {Function} props.setCategory - Setter for category
 * @param {boolean} props.bespoke - Whether source is bespoke
 * @param {Function} props.setBespoke - Setter for bespoke
 * @param {Array} props.categoryOptions - Options for category select
 * @param {boolean} props.isLoading - Whether data is loading
 * @param {boolean} props.isLoadingCategories - Whether categories are loading
 * @param {Array} props.detectedVariables - Detected variables from content
 * @param {Object} props.variableMetadata - Variable metadata (description, example, required)
 * @param {Function} props.setVariableMetadata - Setter for variable metadata
 * @param {Array} props.detectedToggles - Detected toggles from content
 * @param {Object} props.toggleMetadata - Toggle metadata (description)
 * @param {Function} props.setToggleMetadata - Setter for toggle metadata
 * @param {Array} props.documentationLinks - Documentation links
 * @param {Function} props.setDocumentationLinks - Setter for documentation links
 * @param {string} props.newLinkAnchor - New link anchor text
 * @param {Function} props.setNewLinkAnchor - Setter for new link anchor
 * @param {string} props.newLinkUrl - New link URL
 * @param {Function} props.setNewLinkUrl - Setter for new link URL
 * @param {string} props.urlError - URL validation error
 * @param {Function} props.setUrlError - Setter for URL error
 * @param {boolean} props.hasContent - Whether content exists (for "no variables" messaging)
 * @param {boolean} props.hasDetectedVariables - Whether variable detection has run
 * @param {boolean} props.hasDetectedToggles - Whether toggle detection has run
 * @param {Function} props.onTabChange - Optional callback when tab changes
 * @param {Function} props.getFieldId - Optional function to get field IDs (for Forge forms)
 * @param {string} props.excerptId - Optional excerpt ID for stable keys
 * @param {boolean} props.dataLoaded - Optional flag for stable key generation
 * @param {Object} props.validationErrors - Optional validation errors object
 * @param {Function} props.setValidationErrors - Optional setter for validation errors
 * @param {string} props.variant - 'modal' (ExcerptPreviewModal) or 'config' (source-config)
 * @param {boolean} props.showContentPreview - Whether to show content preview section
 * @param {React.ReactNode} props.contentPreviewNode - Optional content preview node
 */
export function SourceMetadataTabs({
  excerptName,
  setExcerptName,
  category,
  setCategory,
  bespoke,
  setBespoke,
  categoryOptions,
  isLoading = false,
  isLoadingCategories = false,
  detectedVariables = [],
  variableMetadata = {},
  setVariableMetadata,
  detectedToggles = [],
  toggleMetadata = {},
  setToggleMetadata,
  documentationLinks = [],
  setDocumentationLinks,
  newLinkAnchor = '',
  setNewLinkAnchor,
  newLinkUrl = '',
  setNewLinkUrl,
  urlError = '',
  setUrlError,
  hasContent = false,
  hasDetectedVariables = true,
  hasDetectedToggles = true,
  onTabChange,
  getFieldId,
  excerptId,
  dataLoaded = true,
  validationErrors = {},
  setValidationErrors,
  variant = 'config',
  showContentPreview = false,
  contentPreviewNode = null
}) {
  // Helper to get field ID - use provided function or generate basic ID
  const fieldId = (name) => getFieldId ? getFieldId(name) : name;
  
  // Generate stable keys for textfields
  const stableKeyPrefix = variant === 'modal' ? 'create-edit' : 'source';
  
  // Determine content message based on variant
  const contentMessage = variant === 'modal'
    ? 'To edit Source content, navigate to the Source macro on its page and edit it there. This modal is for editing metadata (name, category, variables, toggles, documentation) only.'
    : "Edit macro body in the page editor. Use {{variable}} syntax for variables. IMPORTANT: After clicking \"Save\", you MUST publish the page to persist changes!";

  return (
    <Tabs onChange={onTabChange}>
      <TabList>
        <Tab>Name/Category</Tab>
        <Tab>Variables</Tab>
        <Tab>Toggles</Tab>
        <Tab>Documentation</Tab>
      </TabList>

      {/* Name/Category Tab */}
      <TabPanel>
        <FormSection>
          {variant === 'modal' ? (
            // Modal variant: side-by-side layout with width constraints
            <Box xcss={xcss({ width: '700px' })}>
              <Inline space="space.200" alignBlock="start" shouldWrap={false}>
                <Box xcss={xcss({ width: '75%' })}>
                  <Label labelFor={fieldId('excerptName')}>
                    Blueprint Source Name
                  </Label>
                  <StableTextfield
                    id={fieldId('excerptName')}
                    stableKey={`${stableKeyPrefix}-excerpt-name-input`}
                    value={excerptName}
                    placeholder={isLoading ? 'Loading...' : 'Enter Source name'}
                    isDisabled={isLoading}
                    isInvalid={!!validationErrors?.excerptName}
                    onChange={(e) => {
                      setExcerptName(e.target.value);
                      if (validationErrors?.excerptName && setValidationErrors) {
                        setValidationErrors(prev => {
                          const next = { ...prev };
                          delete next.excerptName;
                          return next;
                        });
                      }
                    }}
                  />
                  {validationErrors?.excerptName && (
                    <Text color="color.text.danger" size="small">
                      {validationErrors.excerptName}
                    </Text>
                  )}
                </Box>
                <Box xcss={xcss({ width: '25%' })}>
                  <Label labelFor={fieldId('category')}>
                    Blueprint Source Category
                  </Label>
                  <Select
                    id={fieldId('category')}
                    options={categoryOptions}
                    value={(isLoading || isLoadingCategories) ? undefined : categoryOptions.find(opt => opt.value === category)}
                    placeholder={(isLoading || isLoadingCategories) ? 'Loading...' : undefined}
                    isDisabled={isLoading || isLoadingCategories}
                    onChange={(e) => setCategory(e.value)}
                  />
                </Box>
              </Inline>
            </Box>
          ) : (
            // Config variant: stacked layout
            <>
              <Label labelFor={fieldId('excerptName')}>
                Blueprint Source Name
              </Label>
              <StableTextfield
                id={fieldId('excerptName')}
                stableKey={`${stableKeyPrefix}-excerpt-name-${excerptId || 'new'}-${dataLoaded ? 'loaded' : 'empty'}`}
                value={excerptName || ''}
                placeholder=""
                isDisabled={false}
                onChange={(e) => setExcerptName(e.target.value)}
              />

              <Label labelFor={fieldId('category')}>
                Blueprint Standard Category
              </Label>
              <Select
                id={fieldId('category')}
                options={categoryOptions}
                value={isLoadingCategories ? undefined : categoryOptions.find(opt => opt.value === category)}
                placeholder={isLoadingCategories ? 'Loading...' : undefined}
                onChange={(e) => setCategory(e.value)}
              />
            </>
          )}

          <Text>{' '}</Text>
          <Inline space="space.200" alignBlock="center">
            <Text>Bespoke Source</Text>
            <Toggle
              id={fieldId('bespoke')}
              isChecked={bespoke}
              isDisabled={isLoading}
              onChange={(e) => setBespoke(e.target.checked)}
            />
          </Inline>

          <Text>{' '}</Text>
          <SectionMessage appearance={variant === 'modal' ? 'information' : 'discovery'}>
            {variant === 'modal' && <Text><Strong>Content Editing</Strong></Text>}
            <Text>{contentMessage}</Text>
          </SectionMessage>

          {showContentPreview && contentPreviewNode}
        </FormSection>
      </TabPanel>

      {/* Variables Tab */}
      <TabPanel>
        <FormSection>
          {hasContent && detectedVariables.length === 0 && hasDetectedVariables && (
            <Text><Em>No variables detected.</Em></Text>
          )}

          {!hasDetectedVariables && hasContent && (
            <Text><Em>Checking for variables...</Em></Text>
          )}

          {detectedVariables.length === 0 && !hasContent && (
            <Text>No variables detected. Add {'{{variable}}'} syntax to your {variant === 'modal' ? 'Source content' : 'macro body'} to create variables.</Text>
          )}

          {detectedVariables.length > 0 && (
            <Fragment>
              {detectedVariables.map((variable) => (
                <Fragment key={variable.name}>
                  <Text>{' '}</Text>
                  <Inline space="space.300" alignBlock="center" spread="space-between">
                    <Text><Strong><Code>{`{{${variable.name}}}`}</Code></Strong></Text>
                    <Inline space="space.100" alignBlock="center">
                      <Text>Required</Text>
                      <Toggle
                        id={`required-${variable.name}`}
                        isChecked={variableMetadata[variable.name]?.required || false}
                        isDisabled={isLoading}
                        onChange={(e) => {
                          setVariableMetadata({
                            ...variableMetadata,
                            [variable.name]: {
                              ...variableMetadata[variable.name],
                              required: e.target.checked
                            }
                          });
                        }}
                      />
                    </Inline>
                  </Inline>
                  <StableTextfield
                    id={`var-desc-${variable.name}`}
                    stableKey={`${stableKeyPrefix}-var-desc-${variable.name}`}
                    label="Description"
                    placeholder={isLoading ? 'Loading...' : 'Description'}
                    value={variableMetadata[variable.name]?.description || ''}
                    isDisabled={isLoading}
                    onChange={(e) => {
                      setVariableMetadata({
                        ...variableMetadata,
                        [variable.name]: {
                          ...variableMetadata[variable.name],
                          description: e.target.value
                        }
                      });
                    }}
                  />
                  <StableTextfield
                    id={`var-example-${variable.name}`}
                    stableKey={`${stableKeyPrefix}-var-example-${variable.name}`}
                    label="Example"
                    placeholder={isLoading ? 'Loading...' : 'Example'}
                    value={variableMetadata[variable.name]?.example || ''}
                    isDisabled={isLoading}
                    onChange={(e) => {
                      setVariableMetadata({
                        ...variableMetadata,
                        [variable.name]: {
                          ...variableMetadata[variable.name],
                          example: e.target.value
                        }
                      });
                    }}
                  />
                </Fragment>
              ))}
            </Fragment>
          )}

          {variant === 'config' && (
            <>
              <Text>{' '}</Text>
              <SectionMessage appearance="discovery">
                <Text>Edit macro body in the page editor. Use {'{{variable}}'} syntax for variables. IMPORTANT: After clicking "Save", you MUST publish the page to persist changes!</Text>
              </SectionMessage>
            </>
          )}
        </FormSection>
      </TabPanel>

      {/* Toggles Tab */}
      <TabPanel>
        <FormSection>
          {hasContent && detectedToggles.length === 0 && hasDetectedToggles && (
            <Text><Em>No toggles detected.</Em></Text>
          )}

          {!hasDetectedToggles && hasContent && (
            <Text><Em>Checking for toggles...</Em></Text>
          )}

          {detectedToggles.length === 0 && !hasContent && (
            <Text>No toggles detected. Add {'{{toggle:name}}'} ... {'{{/toggle:name}}'} syntax to your {variant === 'modal' ? 'Source content' : 'macro body'} to create toggles.</Text>
          )}

          {detectedToggles.length > 0 && (
            <Fragment>
              {detectedToggles.map((toggle) => (
                <Fragment key={toggle.name}>
                  <Text>{' '}</Text>
                  <Text><Strong><Code>{`{{toggle:${toggle.name}}}`}</Code></Strong></Text>
                  <StableTextfield
                    id={`toggle-desc-${toggle.name}`}
                    stableKey={`${stableKeyPrefix}-toggle-desc-${toggle.name}`}
                    label="Description"
                    placeholder={isLoading ? 'Loading...' : 'Description'}
                    value={toggleMetadata[toggle.name]?.description || ''}
                    isDisabled={isLoading}
                    onChange={(e) => {
                      setToggleMetadata({
                        ...toggleMetadata,
                        [toggle.name]: {
                          description: e.target.value
                        }
                      });
                    }}
                  />
                </Fragment>
              ))}
            </Fragment>
          )}

          {variant === 'config' && (
            <>
              <Text>{' '}</Text>
              <SectionMessage appearance="discovery">
                <Text>Edit macro body in the page editor. Use {'{{toggle:name}}'} and {'{{/toggle:name}}'} to wrap content that can be toggled on/off. IMPORTANT: After clicking "Save", you MUST publish the page to persist changes!</Text>
              </SectionMessage>
            </>
          )}
        </FormSection>
      </TabPanel>

      {/* Documentation Tab */}
      <TabPanel>
        <FormSection>
          {/* Existing documentation links */}
          {documentationLinks.length > 0 && (
            <Fragment>
              <Text><Strong>Documentation Links</Strong></Text>
              <Text>{' '}</Text>
              {documentationLinks.map((link, index) => (
                <Box key={index} padding="space.100" backgroundColor="color.background.neutral.subtle" style={{ marginBottom: '8px', borderRadius: '3px' }}>
                  <Inline space="space.200" alignBlock="center" spread="space-between">
                    <Stack space="space.050">
                      <Text><Strong>{link.anchor}</Strong></Text>
                      <Text size="small"><Em>{link.url}</Em></Text>
                    </Stack>
                    <Inline space="space.100">
                      <Button
                        appearance="subtle"
                        iconBefore={<Icon glyph="arrow-up" label="Move up" />}
                        isDisabled={index === 0 || isLoading}
                        onClick={() => {
                          const newLinks = [...documentationLinks];
                          [newLinks[index - 1], newLinks[index]] = [newLinks[index], newLinks[index - 1]];
                          setDocumentationLinks(newLinks);
                        }}
                      />
                      <Button
                        appearance="subtle"
                        iconBefore={<Icon glyph="arrow-down" label="Move down" />}
                        isDisabled={index === documentationLinks.length - 1 || isLoading}
                        onClick={() => {
                          const newLinks = [...documentationLinks];
                          [newLinks[index], newLinks[index + 1]] = [newLinks[index + 1], newLinks[index]];
                          setDocumentationLinks(newLinks);
                        }}
                      />
                      <Button
                        appearance="danger"
                        iconBefore={<Icon glyph="trash" label="Delete" />}
                        isDisabled={isLoading}
                        onClick={() => {
                          setDocumentationLinks(documentationLinks.filter((_, i) => i !== index));
                        }}
                      />
                    </Inline>
                  </Inline>
                </Box>
              ))}
              <Text>{' '}</Text>
            </Fragment>
          )}

          {/* Add new documentation link form */}
          <Text><Strong>Add New Documentation Link</Strong></Text>
          <Text>{' '}</Text>
          <StableTextfield
            stableKey={`${stableKeyPrefix}-doc-link-anchor`}
            label="Anchor Text"
            placeholder={isLoading ? 'Loading...' : 'e.g., API Reference'}
            value={newLinkAnchor}
            isDisabled={isLoading}
            onChange={(e) => setNewLinkAnchor(e.target.value)}
          />
          <StableTextfield
            stableKey={`${stableKeyPrefix}-doc-link-url`}
            label="URL"
            placeholder={isLoading ? 'Loading...' : 'https://example.com/docs'}
            value={newLinkUrl}
            isDisabled={isLoading}
            onChange={(e) => {
              setNewLinkUrl(e.target.value);
              // Basic URL validation
              const url = e.target.value.trim();
              if (url && !url.match(/^https?:\/\/.+/i)) {
                setUrlError('URL must start with http:// or https://');
              } else {
                setUrlError('');
              }
            }}
          />
          {urlError && (
            <SectionMessage appearance="error">
              <Text>{urlError}</Text>
            </SectionMessage>
          )}
          <Text>{' '}</Text>
          <Button
            appearance="primary"
            isDisabled={!newLinkAnchor.trim() || !newLinkUrl.trim() || !!urlError || isLoading}
            onClick={() => {
              if (newLinkAnchor.trim() && newLinkUrl.trim() && !urlError) {
                setDocumentationLinks([
                  ...documentationLinks,
                  { anchor: newLinkAnchor.trim(), url: newLinkUrl.trim() }
                ]);
                setNewLinkAnchor('');
                setNewLinkUrl('');
              }
            }}
          >
            Add Link
          </Button>

          <Text>{' '}</Text>
          <SectionMessage appearance="discovery">
            <Text>Add documentation links that will appear in all Embed instances using this Source. Links open in a new tab.</Text>
          </SectionMessage>
        </FormSection>
      </TabPanel>
    </Tabs>
  );
}

