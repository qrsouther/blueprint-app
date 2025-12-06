/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                    ⚠️  CRITICAL: CLONE COMPONENT WARNING  ⚠️                  ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║                                                                              ║
 * ║  This component (ExcerptPreviewModal.jsx) and source-config.jsx are         ║
 * ║  INTENTIONAL CLONES that must be kept in sync.                              ║
 * ║                                                                              ║
 * ║  WHY THEY'RE SEPARATE:                                                       ║
 * ║  - source-config.jsx uses Forge macro APIs (useConfig, useProductContext,   ║
 * ║    view.submit) that are unavailable in the Admin context                   ║
 * ║  - ExcerptPreviewModal runs inside the Admin UI Modal context               ║
 * ║  - These Forge-specific integrations make true code sharing risky           ║
 * ║                                                                              ║
 * ║  🔴 MANDATORY: When modifying EITHER component:                              ║
 * ║     1. Check if the same change applies to the other                        ║
 * ║     2. Apply identical changes to BOTH to prevent drift                     ║
 * ║     3. Both must call the SAME backend functions for detection/save         ║
 * ║                                                                              ║
 * ║  SHARED BACKEND FUNCTIONS (must be identical in both):                       ║
 * ║  - detectVariablesFromContent → detectVariablesWithToggleContext            ║
 * ║  - detectTogglesFromContent → detectToggles                                 ║
 * ║  - saveExcerpt                                                              ║
 * ║                                                                              ║
 * ║  RELATED FILES:                                                              ║
 * ║  - src/source-config.jsx (the clone / gold standard)                        ║
 * ║  - src/components/common/SourceMetadataTabs.jsx (shared UI component)       ║
 * ║  - src/hooks/useSourceEditor.js (shared hook - used by this component)      ║
 * ║                                                                              ║
 * ║  NOTE: source-config.jsx is the "gold standard" - if behavior differs,      ║
 * ║  this component should be updated to match source-config.jsx, not vice      ║
 * ║  versa.                                                                      ║
 * ║                                                                              ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * Modal dialog for editing Blueprint Standard Source metadata.
 * Uses the shared useSourceEditor hook for consistent behavior with Source Config modal.
 *
 * Note: Content editing must be done in the Source macro on the page itself.
 */

import React, { useEffect } from 'react';
import {
  Text,
  Button,
  Modal,
  ModalTransition,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
  Inline,
  SectionMessage,
  Icon,
  Code
} from '@forge/react';
import { router } from '@forge/bridge';
import { useSourceEditor } from '../../hooks/useSourceEditor';
import { SourceMetadataTabs } from '../common/SourceMetadataTabs';
import { logger } from '../../utils/logger.js';

export function ExcerptPreviewModal({
  showPreviewModal,
  setShowPreviewModal,
  excerpts
}) {
  const excerptId = showPreviewModal;

  // Use the shared source editor hook
  const editor = useSourceEditor({
    excerptId,
    content: null, // Will be loaded from storage via excerptId
    alwaysFreshData: false,
    onSaveSuccess: () => {
      setShowPreviewModal(null);
    }
  });

  // Get initial excerpt from list for immediate display
  const initialExcerpt = excerpts?.find(e => e.id === excerptId);

  // Set initial name from excerpts list while loading
  useEffect(() => {
    if (initialExcerpt && !editor.excerptName && !editor.isLoadingExcerpt) {
      editor.setExcerptName(initialExcerpt.name || '');
    }
  }, [initialExcerpt, editor.excerptName, editor.isLoadingExcerpt, editor.setExcerptName]);

  // Handle save
  const handleSave = async () => {
    try {
      await editor.save({
        sourcePageId: editor.excerptData?.sourcePageId,
        sourcePageTitle: editor.excerptData?.sourcePageTitle,
        sourceSpaceKey: editor.excerptData?.sourceSpaceKey,
        sourceLocalId: editor.excerptData?.sourceLocalId
      });
    } catch (err) {
      logger.errors('[ExcerptPreviewModal] Save error:', err);
    }
  };

  if (!showPreviewModal) {
    return null;
  }

  const excerpt = excerpts?.find(e => e.id === showPreviewModal);
  if (!excerpt) {
    return null;
  }

  return (
    <ModalTransition>
      <Modal width="x-large" onClose={() => setShowPreviewModal(null)}>
        <ModalHeader>
          <Inline space="space.100" alignBlock="center" spread="space-between">
            <ModalTitle>{excerpt.name || 'Blueprint Standard'}</ModalTitle>
            {editor.excerptData?.sourcePageId && (
              <Button
                appearance="default"
                onClick={async () => {
                  try {
                    let url = `/wiki/pages/viewpage.action?pageId=${editor.excerptData.sourcePageId}`;
                    if (editor.excerptData.sourceLocalId) {
                      url += `#id-${editor.excerptData.sourceLocalId}`;
                    }
                    await router.open(url);
                  } catch (err) {
                    logger.errors('Navigation error:', err);
                    alert('Error navigating to source page: ' + err.message);
                  }
                }}
                iconAfter={() => <Icon glyph="shortcut" label="Opens in new tab" />}
              >
                Edit Source
              </Button>
            )}
          </Inline>
        </ModalHeader>

        <ModalBody>
          {editor.isLoadingExcerpt ? (
            <Text>Loading...</Text>
          ) : editor.excerptError ? (
            <SectionMessage appearance="error">
              <Text>Error loading excerpt: {editor.excerptError.message}</Text>
            </SectionMessage>
          ) : (
            <SourceMetadataTabs
              excerptName={editor.excerptName}
              setExcerptName={editor.setExcerptName}
              category={editor.category}
              setCategory={editor.setCategory}
              bespoke={editor.bespoke}
              setBespoke={editor.setBespoke}
              headless={editor.headless}
              setHeadless={editor.setHeadless}
              categoryOptions={editor.categoryOptions}
              isLoading={editor.isLoadingExcerpt}
              isLoadingCategories={editor.isLoadingCategories}
              detectedVariables={editor.detectedVariables}
              variableMetadata={editor.variableMetadata}
              setVariableMetadata={editor.setVariableMetadata}
              detectedToggles={editor.detectedToggles}
              toggleMetadata={editor.toggleMetadata}
              setToggleMetadata={editor.setToggleMetadata}
              documentationLinks={editor.documentationLinks}
              setDocumentationLinks={editor.setDocumentationLinks}
              newLinkAnchor={editor.newLinkAnchor}
              setNewLinkAnchor={editor.setNewLinkAnchor}
              newLinkUrl={editor.newLinkUrl}
              setNewLinkUrl={editor.setNewLinkUrl}
              urlError={editor.urlError}
              setUrlError={editor.setUrlError}
              hasContent={editor.hasContent}
              hasDetectedVariables={editor.hasDetectedVariables}
              hasDetectedToggles={editor.hasDetectedToggles}
              excerptId={excerptId}
              dataLoaded={editor.dataLoaded}
              variant="modal"
              content={editor.content}
            />
          )}
        </ModalBody>

        <ModalFooter>
          <Inline space="space.200" alignBlock="center" spread="space-between">
            {excerptId && (
              <Text size="small">
                Source UUID: <Code>{excerptId}</Code>
              </Text>
            )}
            <Inline space="space.200">
              <Button onClick={() => setShowPreviewModal(null)}>
                Cancel
              </Button>
              <Button
                appearance="primary"
                onClick={handleSave}
                isDisabled={editor.isSaving || editor.isLoadingExcerpt}
              >
                {editor.isSaving ? 'Saving...' : 'Save'}
              </Button>
            </Inline>
          </Inline>
        </ModalFooter>
      </Modal>
    </ModalTransition>
  );
}
