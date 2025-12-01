/**
 * FreeformContentConfirmModal Component
 *
 * Modal that appears when user selects non-standard, tbd, or na compliance levels.
 * Prompts user to either:
 * - Keep the standardized Embed structure (with toggles, variables, custom insertions)
 * - Switch to freeform mode where they write entirely custom content
 *
 * If user has existing config (variables, toggles, custom insertions), shows a warning
 * before clearing.
 *
 * @module FreeformContentConfirmModal
 */

import React, { useState } from 'react';
import { 
  Modal, 
  ModalBody, 
  ModalFooter, 
  ModalHeader, 
  ModalTitle, 
  ModalTransition, 
  Button, 
  ButtonGroup, 
  Stack, 
  Text, 
  Strong, 
  SectionMessage, 
  Box, 
  xcss 
} from '@forge/react';

// Compliance level display config
const COMPLIANCE_DISPLAY = {
  'non-standard': { emoji: '🔴', label: 'Non-Standard' },
  'tbd': { emoji: '⚪', label: 'TBD' },
  'na': { emoji: '⚪', label: 'N/A' }
};

/**
 * Check if user has existing configuration that would be lost
 * @param {Object} variableValues - Current variable values
 * @param {Object} toggleStates - Current toggle states
 * @param {Array} customInsertions - Current custom insertions
 * @param {Array} internalNotes - Current internal notes
 * @returns {boolean} True if user has meaningful configuration
 */
function hasExistingConfig(variableValues, toggleStates, customInsertions, internalNotes) {
  // Check if any variables have values
  const hasVariables = variableValues && 
    Object.values(variableValues).some(v => v && v.trim && v.trim() !== '');
  
  // Check if any toggles are set (different from default true)
  const hasToggles = toggleStates && 
    Object.values(toggleStates).some(v => v === false);
  
  // Check for custom insertions
  const hasInsertions = customInsertions && customInsertions.length > 0;
  
  // Check for internal notes
  const hasNotes = internalNotes && internalNotes.length > 0;
  
  return hasVariables || hasToggles || hasInsertions || hasNotes;
}

/**
 * FreeformContentConfirmModal Component
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether modal is open
 * @param {Function} props.onClose - Handler for closing modal (user chose "No, keep the Embed")
 * @param {Function} props.onConfirm - Handler for confirming freeform mode
 * @param {string} props.sourceName - Name of the current Source/Standard
 * @param {string} props.complianceLevel - The selected compliance level (non-standard, tbd, na)
 * @param {Object} props.variableValues - Current variable values
 * @param {Object} props.toggleStates - Current toggle states
 * @param {Array} props.customInsertions - Current custom insertions
 * @param {Array} props.internalNotes - Current internal notes
 * @returns {JSX.Element}
 */
export function FreeformContentConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  sourceName,
  complianceLevel,
  variableValues = {},
  toggleStates = {},
  customInsertions = [],
  internalNotes = []
}) {
  const [showWarning, setShowWarning] = useState(false);
  
  const displayConfig = COMPLIANCE_DISPLAY[complianceLevel] || COMPLIANCE_DISPLAY['tbd'];
  const hasConfig = hasExistingConfig(variableValues, toggleStates, customInsertions, internalNotes);
  
  const handleYesClick = () => {
    if (hasConfig && !showWarning) {
      // Show warning first
      setShowWarning(true);
    } else {
      // Confirmed - proceed with freeform mode
      onConfirm();
      setShowWarning(false);
    }
  };
  
  const handleNoClick = () => {
    setShowWarning(false);
    onClose();
  };
  
  const handleBackClick = () => {
    setShowWarning(false);
  };

  return (
    <ModalTransition>
      {isOpen && (
        <Modal onClose={handleNoClick} width="medium">
          <ModalHeader>
            <ModalTitle>
              {displayConfig.emoji} Switch to Freeform Content?
            </ModalTitle>
          </ModalHeader>

          <ModalBody>
            <Stack space="space.200">
              {!showWarning ? (
                // Initial confirmation message
                <Text>
                  You've indicated that the client's approach to <Strong>{sourceName || 'this Standard'}</Strong> is{' '}
                  <Strong>{displayConfig.label}</Strong>. Would you like to fully remove the standardized 
                  content of this Embed and write all your own content?
                </Text>
              ) : (
                // Warning about losing existing config
                <Stack space="space.200">
                  <SectionMessage appearance="warning" title="Existing Configuration Will Be Cleared">
                    <Text>
                      You have existing variable values, toggle settings, or custom insertions configured. 
                      Switching to freeform mode will clear this configuration and cannot be undone.
                    </Text>
                  </SectionMessage>
                  <Text>
                    Are you sure you want to proceed?
                  </Text>
                </Stack>
              )}
            </Stack>
          </ModalBody>

          <ModalFooter>
            <ButtonGroup>
              {showWarning ? (
                // Warning state buttons
                <>
                  <Button appearance="subtle" onClick={handleBackClick}>
                    Back
                  </Button>
                  <Button appearance="warning" onClick={handleYesClick}>
                    Yes, Clear and Continue
                  </Button>
                </>
              ) : (
                // Initial state buttons
                <>
                  <Button appearance="default" onClick={handleNoClick}>
                    No, keep the Embed
                  </Button>
                  <Button appearance="primary" onClick={handleYesClick}>
                    Yes, write my own
                  </Button>
                </>
              )}
            </ButtonGroup>
          </ModalFooter>
        </Modal>
      )}
    </ModalTransition>
  );
}

export default FreeformContentConfirmModal;

