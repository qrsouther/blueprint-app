/**
 * SourceMetadataTabs Component
 *
 * Shared component for editing Source metadata across both:
 * - source-config.jsx (Forge macro config modal)
 * - ExcerptPreviewModal.jsx (Admin UI modal)
 *
 * Features a split view layout:
 * - Left panel (30%): Tabs for editing metadata (Name/Category, Variables, Toggles, Documentation)
 * - Right panel (70%): Live preview with ephemeral tester inputs
 */

import React, { Fragment, useState, useMemo } from 'react';
import { useForm as useReactHookForm, useWatch } from 'react-hook-form';
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
  AdfRenderer,
  xcss
} from '@forge/react';
import { StableTextfield } from './StableTextfield';
import { VariableConfigPanel } from '../VariableConfigPanel';
import { ToggleConfigPanel } from '../ToggleConfigPanel';
import { DocumentationLinksDisplay } from '../embed/DocumentationLinksDisplay';
import {
  cleanAdfForRenderer,
  filterContentByToggles,
  substituteVariablesInAdf
} from '../../utils/adf-rendering-utils';

// Split view layout styles
const rightPanelStyle = xcss({
  borderColor: 'color.border',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderRadius: 'border.radius',
  padding: 'space.200',
  backgroundColor: 'color.background.neutral.subtle'
});

const testerTabsStyle = xcss({
  marginBottom: 'space.200'
});

const previewContentStyle = xcss({
  padding: 'space.200',
  borderColor: 'color.border',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderRadius: 'border.radius',
  backgroundColor: 'color.background.input'
});

/**
 * SourceMetadataTabs - Shared tabs for Source metadata editing with live preview
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
  // Content for live preview
  content = null
}) {
  // Helper to get field ID
  const fieldId = (name) => getFieldId ? getFieldId(name) : name;
  const stableKeyPrefix = variant === 'modal' ? 'create-edit' : 'source';

  // ============================================================================
  // EPHEMERAL TESTER STATE (for live preview)
  // ============================================================================
  const [testerTabIndex, setTesterTabIndex] = useState(0);

  const testerForm = useReactHookForm({
    defaultValues: {
      variableValues: {},
      toggleStates: {}
    }
  });

  const { control: testerControl, setValue: setTesterValue } = testerForm;

  const watchedTesterVariables = useWatch({
    control: testerControl,
    name: 'variableValues'
  }) || {};

  const watchedTesterToggles = useWatch({
    control: testerControl,
    name: 'toggleStates'
  }) || {};

  // Build mock excerpt for tester panels
  const mockExcerptForTester = useMemo(() => ({
    variables: detectedVariables.map(v => ({
      name: v.name,
      description: variableMetadata[v.name]?.description || '',
      example: variableMetadata[v.name]?.example || '',
      required: variableMetadata[v.name]?.required || false
    })),
    toggles: detectedToggles.map(t => ({
      name: t.name,
      description: toggleMetadata[t.name]?.description || ''
    })),
    content: content
  }), [detectedVariables, variableMetadata, detectedToggles, toggleMetadata, content]);

  // Generate preview content with substitutions
  const testerPreviewContent = useMemo(() => {
    if (!content) return null;

    try {
      let preview = JSON.parse(JSON.stringify(content));

      const variables = detectedVariables.map(v => ({
        name: v.name,
        description: variableMetadata[v.name]?.description || '',
        example: variableMetadata[v.name]?.example || '',
        required: variableMetadata[v.name]?.required || false
      }));

      const toggles = detectedToggles.map(t => ({
        name: t.name,
        description: toggleMetadata[t.name]?.description || ''
      }));

      if (toggles.length > 0) {
        preview = filterContentByToggles(preview, watchedTesterToggles);
      }

      if (variables.length > 0) {
        preview = substituteVariablesInAdf(preview, watchedTesterVariables, variables);
      }

      return cleanAdfForRenderer(preview);
    } catch (error) {
      return null;
    }
  }, [content, watchedTesterVariables, watchedTesterToggles, detectedVariables, detectedToggles, variableMetadata, toggleMetadata]);

  // ============================================================================
  // RENDER
  // ============================================================================
  return (
    <Inline space="space.300" alignBlock="stretch" spread="space-between">
      {/* LEFT PANEL - Metadata Editing Tabs */}
      <Box>
        <Tabs onChange={onTabChange}>
          <TabList>
            <Tab>Main</Tab>
            <Tab>Toggles</Tab>
            <Tab>Variables</Tab>
            <Tab>Docs</Tab>
          </TabList>

          {/* Main Tab */}
          <TabPanel>
            <Stack space="space.150">
              <Stack space="space.050">
                <Label labelFor={fieldId('excerptName')}>Source Name</Label>
                <StableTextfield
                  id={fieldId('excerptName')}
                  stableKey={`${stableKeyPrefix}-excerpt-name-${excerptId || 'new'}-${dataLoaded ? 'loaded' : 'empty'}`}
                  value={excerptName || ''}
                  placeholder={isLoading ? 'Loading...' : ''}
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
                  <Text color="color.text.danger" size="small">{validationErrors.excerptName}</Text>
                )}
              </Stack>

              <Stack space="space.050">
                <Label labelFor={fieldId('category')}>Category</Label>
                <Select
                  id={fieldId('category')}
                  options={categoryOptions}
                  value={isLoadingCategories ? undefined : categoryOptions.find(opt => opt.value === category)}
                  placeholder={isLoadingCategories ? 'Loading...' : undefined}
                  isDisabled={isLoading || isLoadingCategories}
                  onChange={(e) => setCategory(e.value)}
                />
              </Stack>

              <Inline space="space.100" alignBlock="center">
                <Label labelFor={fieldId('bespoke')}>Bespoke</Label>
                <Toggle
                  id={fieldId('bespoke')}
                  isChecked={bespoke}
                  isDisabled={isLoading}
                  onChange={(e) => setBespoke(e.target.checked)}
                />
              </Inline>
            </Stack>
          </TabPanel>

          {/* Toggles Tab */}
          <TabPanel>
            <Stack space="space.150">
              {hasContent && detectedToggles.length === 0 && hasDetectedToggles && (
                <Text><Em>No toggles detected.</Em></Text>
              )}

              {!hasDetectedToggles && hasContent && (
                <Text><Em>Checking for toggles...</Em></Text>
              )}

              {detectedToggles.length === 0 && !hasContent && (
                <Text size="small">No toggles. Use {'{{toggle:name}}...{{/toggle:name}}'} syntax.</Text>
              )}

              {detectedToggles.length > 0 && detectedToggles.map((toggle) => (
                <Stack key={toggle.name} space="space.100">
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
                        [toggle.name]: { description: e.target.value }
                      });
                    }}
                  />
                </Stack>
              ))}
            </Stack>
          </TabPanel>

          {/* Variables Tab */}
          <TabPanel>
            <Stack space="space.150">
              {hasContent && detectedVariables.length === 0 && hasDetectedVariables && (
                <Text><Em>No variables detected.</Em></Text>
              )}

              {!hasDetectedVariables && hasContent && (
                <Text><Em>Checking for variables...</Em></Text>
              )}

              {detectedVariables.length === 0 && !hasContent && (
                <Text size="small">No variables. Use {'{{variable}}'} syntax.</Text>
              )}

              {detectedVariables.length > 0 && detectedVariables.map((variable) => (
                <Stack key={variable.name} space="space.100">
                  <Inline space="space.100" alignBlock="center" spread="space-between">
                    <Text><Strong><Code>{`{{${variable.name}}}`}</Code></Strong></Text>
                    <Inline space="space.050" alignBlock="center">
                      <Text size="small">Req</Text>
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
                </Stack>
              ))}
            </Stack>
          </TabPanel>

          {/* Documentation Tab */}
          <TabPanel>
            <Stack space="space.150">
              {documentationLinks.length > 0 && (
                <Fragment>
                  <Text><Strong>Links</Strong></Text>
                  {documentationLinks.map((link, index) => (
                    <Box key={index} padding="space.100" backgroundColor="color.background.neutral.subtle" xcss={{ borderRadius: 'border.radius' }}>
                      <Stack space="space.050">
                        <Text size="small"><Strong>{link.anchor}</Strong></Text>
                        <Inline space="space.050">
                          <Button
                            appearance="subtle"
                            spacing="compact"
                            iconBefore={<Icon glyph="arrow-up" label="Up" size="small" />}
                            isDisabled={index === 0 || isLoading}
                            onClick={() => {
                              const newLinks = [...documentationLinks];
                              [newLinks[index - 1], newLinks[index]] = [newLinks[index], newLinks[index - 1]];
                              setDocumentationLinks(newLinks);
                            }}
                          />
                          <Button
                            appearance="subtle"
                            spacing="compact"
                            iconBefore={<Icon glyph="arrow-down" label="Down" size="small" />}
                            isDisabled={index === documentationLinks.length - 1 || isLoading}
                            onClick={() => {
                              const newLinks = [...documentationLinks];
                              [newLinks[index], newLinks[index + 1]] = [newLinks[index + 1], newLinks[index]];
                              setDocumentationLinks(newLinks);
                            }}
                          />
                          <Button
                            appearance="danger"
                            spacing="compact"
                            iconBefore={<Icon glyph="trash" label="Delete" size="small" />}
                            isDisabled={isLoading}
                            onClick={() => {
                              setDocumentationLinks(documentationLinks.filter((_, i) => i !== index));
                            }}
                          />
                        </Inline>
                      </Stack>
                    </Box>
                  ))}
                </Fragment>
              )}

              <Text><Strong>Add Link</Strong></Text>
              <StableTextfield
                stableKey={`${stableKeyPrefix}-doc-link-anchor`}
                label="Anchor"
                placeholder={isLoading ? 'Loading...' : 'e.g., API Ref'}
                value={newLinkAnchor}
                isDisabled={isLoading}
                onChange={(e) => setNewLinkAnchor(e.target.value)}
              />
              <StableTextfield
                stableKey={`${stableKeyPrefix}-doc-link-url`}
                label="URL"
                placeholder={isLoading ? 'Loading...' : 'https://...'}
                value={newLinkUrl}
                isDisabled={isLoading}
                onChange={(e) => {
                  setNewLinkUrl(e.target.value);
                  const url = e.target.value.trim();
                  if (url && !url.match(/^https?:\/\/.+/i)) {
                    setUrlError('Must start with http(s)://');
                  } else {
                    setUrlError('');
                  }
                }}
              />
              {urlError && (
                <Text color="color.text.danger" size="small">{urlError}</Text>
              )}
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
                Add
              </Button>
            </Stack>
          </TabPanel>
        </Tabs>
      </Box>

      {/* RIGHT PANEL - Live Preview (grows to fill remaining space) */}
      <Box xcss={rightPanelStyle} grow="fill">
        <Stack space="space.200">
          {/* Ephemeral Tester Tabs */}
          <Box xcss={testerTabsStyle}>
            <Tabs
              onChange={(index) => setTesterTabIndex(index)}
              selected={testerTabIndex}
              id="source-tester-tabs"
            >
              <TabList>
                <Tab>Test Toggles</Tab>
                <Tab>Test Variables</Tab>
              </TabList>
              <TabPanel>
                {detectedToggles.length > 0 ? (
                  <ToggleConfigPanel
                    excerpt={mockExcerptForTester}
                    control={testerControl}
                    setValue={setTesterValue}
                    onBlur={() => {}}
                  />
                ) : (
                  <Text><Em>No toggles in this Source</Em></Text>
                )}
              </TabPanel>
              <TabPanel>
                {detectedVariables.length > 0 ? (
                  <VariableConfigPanel
                    excerpt={mockExcerptForTester}
                    control={testerControl}
                    setValue={setTesterValue}
                    onBlur={() => {}}
                    formKey={0}
                  />
                ) : (
                  <Text><Em>No variables in this Source</Em></Text>
                )}
              </TabPanel>
            </Tabs>
          </Box>

          {/* Documentation Links Display */}
          {documentationLinks.length > 0 && (
            <DocumentationLinksDisplay documentationLinks={documentationLinks} />
          )}

          {/* Live ADF Preview */}
          <Box xcss={previewContentStyle}>
            <Stack space="space.100">
              <Text><Strong>Live Preview</Strong></Text>
              {testerPreviewContent ? (
                <AdfRenderer document={testerPreviewContent} />
              ) : (
                <Text color="color.text.subtle"><Em>No content to preview</Em></Text>
              )}
            </Stack>
          </Box>
        </Stack>
      </Box>
    </Inline>
  );
}
