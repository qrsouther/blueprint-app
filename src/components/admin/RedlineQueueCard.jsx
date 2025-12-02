/**
 * Redline Queue Card Component
 *
 * Displays individual Embed instance card with status, approval info, and actions.
 * Part of Phase 5 implementation (Queue Card Component).
 *
 * Features:
 * - Embed metadata (page title, source name, local ID)
 * - Status badge (color-coded by status)
 * - Approval info with user avatar (if approved)
 * - Variables preview
 * - Action buttons (Preview, Mark Approved, Needs Revision)
 * - Preview modal with ADF content
 *
 * Props:
 * @param {Object} embedData - Embed instance data from queue
 * @param {string} currentUserId - Current user's Confluence accountId
 * @param {Function} onStatusChange - Optional callback when status changes
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  Box,
  Code,
  Stack,
  Inline,
  Heading,
  Text,
  Button,
  Link,
  LinkButton,
  ButtonGroup,
  Lozenge,
  Modal,
  ModalTransition,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
  AdfRenderer,
  Icon,
  xcss,
  Pressable,
  TextArea,
  User
} from '@forge/react';
import { router } from '@forge/bridge';
import { useSetRedlineStatusMutation, usePostRedlineCommentMutation } from '../../hooks/redline-hooks';
import { logger } from '../../utils/logger.js';
import { cleanAdfForRenderer } from '../../utils/adf-rendering-utils';

// Card styling - dynamic background based on status
const getCardStyles = (status) => {
  // Map status to background colors matching lozenge appearances
  const backgroundColors = {
    'reviewable': 'color.background.discovery',
    'pre-approved': 'color.background.information',
    'needs-revision': 'color.background.danger',
    'approved': 'color.background.success'
  };

  return xcss({
    backgroundColor: backgroundColors[status] || 'color.background.neutral',
    padding: 'space.200',
    borderRadius: 'border.radius',
    borderWidth: 'border.width',
    borderStyle: 'solid',
    borderColor: 'color.border',
    width: '100%',
    display: 'block',
    marginBottom: 'space.100',
    marginTop: 'space.100'
  });
};

// Button styling for darker borders, same as AdminToolbar
const buttonStyles = xcss({
  minWidth: '180px',
  borderWidth: 'border.width',
  borderColor: 'color.border.bold',
  borderStyle: 'solid',
  borderRadius: 'border.radius',
  backgroundColor: 'color.background.input',
  color: 'color.link'
});

// Left side container (metadata only) - 17% width
const leftSideStyles = xcss({
  width: '17%',
  minWidth: '17%',
  paddingRight: 'space.200'
});

// Middle container (preview) - 66% width, scrollable
// minWidth ensures column doesn't collapse when empty
const middleSideStyles = xcss({
  width: '66%',
  minWidth: '66%',
  paddingLeft: 'space.200',
  paddingRight: 'space.200',
  borderLeftWidth: 'border.width',
  borderLeftStyle: 'solid',
  borderLeftColor: 'color.border',
  borderRightWidth: 'border.width',
  borderRightStyle: 'solid',
  borderRightColor: 'color.border',
  maxHeight: '500px',
  overflowY: 'scroll'
});

// Right side container (action buttons) - 17% width
const rightSideStyles = xcss({
  width: '17%',
  minWidth: '17%',
  paddingLeft: 'space.200'
});

// Card content row - ensures full width
const cardContentRowStyles = xcss({
  width: '100%'
});

// Preview placeholder when no content
const previewPlaceholderStyles = xcss({
  padding: 'space.200',
  backgroundColor: 'color.background.input',
  borderRadius: 'border.radius',
  textAlign: 'center'
});

// Format date helper
function formatDate(isoString) {
  if (!isoString) return 'Unknown';

  try {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch (e) {
    return 'Invalid date';
  }
}

// Status badge component
function RedlineStatusBadge({ status }) {
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

// Isolated TextArea component to prevent cursor jumping
// Uses internal state to track the current value reliably
// Exposes getValue() via forwardRef so parent can read the actual current value
const CommentTextAreaComponent = React.forwardRef(({ value, onChange, placeholder, localId, actionType }, ref) => {
  // Track the current value internally - this is always up to date
  const currentValueRef = React.useRef(value || '');
  
  // Expose getValue method to parent via ref
  // This ensures parent always gets the actual current value, not stale state
  React.useImperativeHandle(ref, () => ({
    getValue: () => currentValueRef.current,
    // Also expose value property for backwards compatibility
    value: currentValueRef.current
  }));
  
  // Reset internal value when action changes (new comment form)
  React.useEffect(() => {
    currentValueRef.current = value || '';
  }, [localId, actionType]); // Only reset when these change
  
  // Handle change events - update internal ref immediately
  const handleChange = React.useCallback((e) => {
    // Update our internal ref immediately - this is synchronous
    currentValueRef.current = e.target.value;
    // Also notify parent (for any UI state needs)
    if (onChange) {
      onChange(e);
    }
  }, [onChange]);
  
  return (
    <TextArea
      key={`comment-${localId}-${actionType}`}
      placeholder={placeholder}
      defaultValue={value}
      onChange={handleChange}
      resize="vertical"
    />
  );
});

const CommentTextArea = React.memo(CommentTextAreaComponent, (prevProps, nextProps) => {
  // Only re-render if identity changes (localId or actionType)
  // Don't re-render when value changes - let the ref handle it
  return (
    prevProps.localId === nextProps.localId &&
    prevProps.actionType === nextProps.actionType &&
    prevProps.placeholder === nextProps.placeholder &&
    prevProps.onChange === nextProps.onChange
  );
});

function RedlineQueueCardComponent({ embedData, currentUserId, onStatusChange }) {
  const [showExpandedModal, setShowExpandedModal] = useState(false);
  const [activeCommentAction, setActiveCommentAction] = useState(null); // 'approved' | 'pre-approved' | 'needs-revision' | null
  const [commentText, setCommentText] = useState('');
  const [postedCommentId, setPostedCommentId] = useState(null); // Track successfully posted comment
  const [commentError, setCommentError] = useState(null); // Track comment posting errors
  const setStatusMutation = useSetRedlineStatusMutation();
  const postCommentMutation = usePostRedlineCommentMutation();
  
  // Ref to access TextArea DOM element directly to read current value
  const commentTextAreaRef = React.useRef(null);

  // Note: User component handles avatar/name display directly from accountId

  // Reset comment text, posted comment ID, and error when action changes
  useEffect(() => {
    setCommentText('');
    setPostedCommentId(null);
    setCommentError(null);
  }, [activeCommentAction]);

  // Memoize onChange handler to prevent TextArea recreation
  const handleCommentChange = useCallback((e) => {
    setCommentText(e.target.value);
  }, []);

  const handleStatusChange = async (newStatus, reason) => {
    try {
      // CRITICAL: Notify parent of status change IMMEDIATELY (before mutation)
      // This ensures the card is added to transitioning state before it gets filtered out
      // Note: This is called from handleSubmitWithComment which already calls onStatusChange,
      // but we also call it here in case handleStatusChange is called directly
      if (onStatusChange) {
        onStatusChange(embedData.localId, newStatus);
      }

      await setStatusMutation.mutateAsync({
        localId: embedData.localId,
        status: newStatus,
        userId: currentUserId,
        reason
      });

      // Note: onStatusChange is already called above, so we don't need to call it again
    } catch (error) {
      logger.errors('[RedlineQueueCard] Failed to set status:', error);
      // Error handling is done by the mutation hook
      // Note: Card will still fade out even if mutation fails (already in transitioning state)
    }
  };

  // Handler for submitting status change with optional comment
  const handleSubmitWithComment = async (status) => {
    try {
      let commentResult = null;

      // Read current value directly from TextArea ref via getValue()
      // This ensures we get the actual current value, not stale React state
      const currentCommentText = commentTextAreaRef.current?.getValue?.() || commentTextAreaRef.current?.value || commentText || '';
      const trimmedCommentText = currentCommentText.trim();

      // CRITICAL: Notify parent of status change IMMEDIATELY (before mutation)
      // This ensures the card is added to transitioning state before it gets filtered out
      if (onStatusChange) {
        onStatusChange(embedData.localId, status);
      }

      // Post inline comment if comment text provided
      if (trimmedCommentText) {
        try {
          commentResult = await postCommentMutation.mutateAsync({
            localId: embedData.localId,
            pageId: embedData.pageId,
            commentText: trimmedCommentText,
            userId: currentUserId
          });

          // Store the comment ID for "View Comment" link
          if (commentResult && commentResult.commentId) {
            setPostedCommentId(commentResult.commentId);
            setCommentError(null); // Clear any previous errors
          }
        } catch (commentErr) {
          // Check if error is due to missing text placement
          const errorMessage = commentErr.message || String(commentErr);
          logger.errors('[RedlineQueueCard] Comment posting failed:', errorMessage);

          if (errorMessage.includes('Could not find suitable text near Embed')) {
            // Show specific error for missing text placement
            setCommentError('NO_PLACEMENT_TEXT');
          } else {
            // Show generic error for other failures
            setCommentError('GENERIC');
          }

          // Don't proceed with status change if comment was required but failed
          // User can see the error and try again
          // Remove from transitioning state since it failed
          if (onStatusChange) {
            // Could add a cleanup callback, but for now just let it fade out naturally
          }
          return;
        }
      }

      // Then update redline status
      const reason = trimmedCommentText
        ? `${status === 'approved' ? 'Approved' : status === 'pre-approved' ? 'Marked as pre-approved' : 'Flagged for revision'}: ${trimmedCommentText}`
        : `${status === 'approved' ? 'Approved' : status === 'pre-approved' ? 'Marked as pre-approved' : 'Flagged for revision'} via redline queue`;

      await handleStatusChange(status, reason);

      // Only clear form if no comment was posted (if comment was posted, keep form to show "View Comment" link)
      if (!commentResult) {
        setActiveCommentAction(null);
        setCommentText('');
      }
    } catch (error) {
      logger.errors('[RedlineQueueCard] Failed to submit with comment:', error);
      // Still clear form even if status change failed
      setActiveCommentAction(null);
      setCommentText('');
      setPostedCommentId(null);
      setCommentError(null);
    }
  };

  // Handler for viewing posted comment
  const handleViewComment = useCallback(async () => {
    if (postedCommentId && embedData.pageId) {
      try {
        // Navigate to the page with the comment focused
        const url = `/wiki/pages/viewpage.action?pageId=${embedData.pageId}&focusedCommentId=${postedCommentId}`;
        await router.open(url);

        // Clear form after navigation
        setActiveCommentAction(null);
        setCommentText('');
        setPostedCommentId(null);
      } catch (error) {
        logger.errors('[RedlineQueueCard] Failed to navigate to comment:', error);
      }
    }
  }, [postedCommentId, embedData.pageId]);

  // Render preview content using AdfRenderer
  // ONLY shows content that's actually published (injected) on the Confluence page
  const renderPreview = () => {
    // Check if we have injected content from the actual page
    const hasInjectedContent = embedData.injectedContent && 
                               typeof embedData.injectedContent === 'object' && 
                               embedData.injectedContent.type === 'doc';
    
    // If no injected content found, show "not published" message
    // Do NOT fall back to syncedContent/cachedContent as that's misleading
    if (!hasInjectedContent) {
      return (
        <Box xcss={previewPlaceholderStyles}>
          <Text color="color.text.subtlest">Content not published to page</Text>
          <Text size="small" color="color.text.subtlest">
            This chapter has not been published or was removed from the page
          </Text>
        </Box>
      );
    }

    // Use the injected content from the page (already transformed)
    let processedContent = cleanAdfForRenderer(embedData.injectedContent);

    // Render content using AdfRenderer directly
    return (
      <Stack space="space.100">
        <Box
          backgroundColor="elevation.surface.overlay"
          padding="space.200"
          borderRadius="border.radius"
          borderColor="color.border.accent.gray"
          borderWidth="border.width"
        >
          <AdfRenderer document={processedContent} />
        </Box>
      </Stack>
    );
  };

  const cardStyle = getCardStyles(embedData.redlineStatus);

  return (
    <>
      <Box xcss={cardStyle}>
        <Inline space="space.0" alignBlock="start" shouldWrap={false} xcss={cardContentRowStyles}>
          {/* Left side: Metadata only (25%) */}
          <Box xcss={leftSideStyles}>
            <Stack space="space.200">
              <Stack space="space.100">
                {/* Status Badge */}
                <Box>
                  <Inline space="space.100" alignBlock="center">
                    <RedlineStatusBadge space="space.100" status={embedData.redlineStatus} />
                  </Inline>
                </Box>

                {/* Page Title link in small heading */}
                <Heading size="small" space="space.200">
                  <Link openNewTab={true} href={`/wiki/pages/viewpage.action?pageId=${embedData.pageId}`}>{embedData.pageTitle || 'Unknown Page'}</Link>
                </Heading>

                {/* Source Name */}
                <Heading size="small" space="space.100"> {embedData.sourceName || 'Unknown Source'}</Heading>

                {/* Local ID */}
                <Code>
                  Embed UUID: {embedData.localId}
                </Code>

                {/* Last updated */}
                <Text size="small" color="color.text.subtlest">
                  Updated: {embedData.lastSynced ? formatDate(embedData.lastSynced) : 'Never'}
                </Text>

                {/* Status Info with Icon + User */}
                {embedData.redlineStatus === 'approved' && embedData.approvedBy && (
                  <Box backgroundColor="color.background.success.subtle" padding="space.100">
                    <Stack space="space.050">
                      <Inline space="space.100" alignBlock="center">
                        <Icon glyph="check-circle" label="Approved" color="color.icon.success" />
                        <User accountId={embedData.approvedBy} />
                      </Inline>
                    </Stack>
                  </Box>
                )}

                {embedData.redlineStatus === 'pre-approved' && embedData.lastChangedBy && (
                  <Box backgroundColor="color.background.information.subtle" padding="space.100">
                    <Stack space="space.050">
                      <Inline space="space.100" alignBlock="center">
                        <Icon glyph="check-circle" label="Pre-Approved" color="color.icon.information" />
                        <User accountId={embedData.lastChangedBy} />
                      </Inline>
                    </Stack>
                  </Box>
                )}

                {embedData.redlineStatus === 'needs-revision' && embedData.lastChangedBy && (
                  <Box backgroundColor="color.background.danger.subtle" padding="space.100">
                    <Stack space="space.050">
                      <Inline space="space.100" alignBlock="center">
                        <Icon glyph="cross-circle" label="Needs Revision" color="color.icon.danger" />
                        <User accountId={embedData.lastChangedBy} />
                      </Inline>
                    </Stack>
                  </Box>
                )}
              </Stack>

              {/* Loading state for mutations */}
              {setStatusMutation.isPending && (
                <Text size="small" color="color.text.subtlest">
                  Updating status...
                </Text>
              )}
            </Stack>
          </Box>

          {/* Middle: Preview content (50%, scrollable) */}
          <Box xcss={middleSideStyles}>
            {renderPreview()}
          </Box>

          {/* Right side: Action buttons (25%) */}
          <Box xcss={rightSideStyles}>
            {!activeCommentAction ? (
              // Show all action buttons when no comment form is active
              <Stack space="space.100" alignBlock="stretch">
                <Button
                  appearance="primary"
                  iconBefore="check-circle"
                  onClick={() => setActiveCommentAction('approved')}
                  isDisabled={embedData.redlineStatus === 'approved' || setStatusMutation.isPending}
                >
                  Approve
                </Button>

                <Button
                  appearance="subtle"
                  iconBefore='theme'
                  onClick={() => setActiveCommentAction('pre-approved')}
                  isDisabled={embedData.redlineStatus === 'pre-approved' || setStatusMutation.isPending}
                >
                  Pre-Approve
                </Button>

                <Button
                  appearance="danger"
                  iconBefore='cross-circle'
                  onClick={() => setActiveCommentAction('needs-revision')}
                  isDisabled={embedData.redlineStatus === 'needs-revision' || setStatusMutation.isPending}
                >
                  Needs Revision
                </Button>
              </Stack>
            ) : (
              // Show comment form for active action
              <Stack space="space.100">
                {commentError ? (
                  // Show error state after failed comment posting
                  <>
                    <Text size="small" color="color.text.danger" weight="semibold">
                      {commentError === 'NO_PLACEMENT_TEXT' && '❌ Comment Failed: No text found near Embed for comment placement'}
                      {commentError === 'GENERIC' && '❌ Comment Failed: See console for details'}
                    </Text>
                    <Button
                      appearance="subtle"
                      onClick={() => {
                        setActiveCommentAction(null);
                        setCommentText('');
                        setPostedCommentId(null);
                        setCommentError(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </>
                ) : !postedCommentId ? (
                  // Show normal input form
                  <>
                     <Text size="small" weight="semibold">
                       {activeCommentAction === 'approved' && 'Add approval comment (optional):'}
                       {activeCommentAction === 'pre-approved' && 'Add comment (optional):'}
                       {activeCommentAction === 'needs-revision' && 'Add revision comment (optional):'}
                     </Text>
                    <CommentTextArea
                      ref={commentTextAreaRef}
                      value={commentText}
                      onChange={handleCommentChange}
                      placeholder="Enter comment to post on Confluence page..."
                      localId={embedData.localId}
                      actionType={activeCommentAction}
                    />
                     <Button
                       appearance={
                         activeCommentAction === 'approved' ? 'primary' :
                         activeCommentAction === 'pre-approved' ? 'default' :
                         'danger'
                       }
                       iconBefore={
                         activeCommentAction === 'approved' ? 'check-circle' :
                         activeCommentAction === 'pre-approved' ? 'theme' :
                         'cross-circle'
                       }
                       onClick={() => handleSubmitWithComment(activeCommentAction)}
                       isDisabled={setStatusMutation.isPending || postCommentMutation.isPending}
                     >
                       {postCommentMutation.isPending ? 'Posting...' :
                        activeCommentAction === 'approved' ? 'Approve' :
                        activeCommentAction === 'pre-approved' ? 'Pre-Approve' :
                        'Request Revision'}
                     </Button>
                    <Button
                      appearance="subtle"
                      onClick={() => {
                        setActiveCommentAction(null);
                        setCommentText('');
                        setPostedCommentId(null);
                        setCommentError(null);
                      }}
                      isDisabled={setStatusMutation.isPending || postCommentMutation.isPending}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  // Show "View Comment" link after successful posting
                  <>
                    <Text size="small" color="color.text.success" weight="semibold">
                      ✅ Comment posted successfully!
                    </Text>
                    <Button
                      appearance="link"
                      onClick={handleViewComment}
                      iconAfter={() => <Icon glyph="shortcut" label="Opens comment" />}
                    >
                      View Comment
                    </Button>
                    <Button
                      appearance="subtle"
                      onClick={() => {
                        setActiveCommentAction(null);
                        setCommentText('');
                        setPostedCommentId(null);
                        setCommentError(null);
                      }}
                    >
                      Done
                    </Button>
                  </>
                )}
              </Stack>
            )}
          </Box>
        </Inline>
      </Box>

      {/* Expanded Modal (optional for full-screen view) */}
      <ModalTransition>
        {showExpandedModal && (
          <Modal onClose={() => setShowExpandedModal(false)} width="x-large">
            <ModalHeader>
              <ModalTitle>
                Embed Details: {embedData.sourceName}
              </ModalTitle>
            </ModalHeader>
            <ModalBody>
              <Stack space="space.200">
                <Box>
                  <Text weight="semibold">Page:</Text>
                  <Text>{embedData.pageTitle}</Text>
                </Box>
                <Box>
                  <Text weight="semibold">Source:</Text>
                  <Text>{embedData.sourceName}</Text>
                </Box>
                <Box>
                  <Text weight="semibold">Category:</Text>
                  <Text>{embedData.sourceCategory || 'Uncategorized'}</Text>
                </Box>
                <Box>
                  <Text weight="semibold">Local ID:</Text>
                  <Text>{embedData.localId}</Text>
                </Box>
                {renderPreview()}
              </Stack>
            </ModalBody>
            <ModalFooter>
              <Button appearance="subtle" onClick={() => setShowExpandedModal(false)}>
                Close
              </Button>
            </ModalFooter>
          </Modal>
        )}
      </ModalTransition>
    </>
  );
}

// Memoize component to prevent unnecessary re-renders that cause cursor jumping
// Custom comparison: only re-render if the data we actually care about changes
// This prevents re-renders when React Query creates new object references with the same data
export const RedlineQueueCard = React.memo(RedlineQueueCardComponent, (prevProps, nextProps) => {
  // Compare the actual values we care about, not object references
  const prevEmbed = prevProps.embedData;
  const nextEmbed = nextProps.embedData;
  
  // If localId changed, definitely re-render (different embed)
  if (prevEmbed.localId !== nextEmbed.localId) return false;
  
  // Compare the fields that actually affect the UI
  return (
    prevEmbed.redlineStatus === nextEmbed.redlineStatus &&
    prevEmbed.pageTitle === nextEmbed.pageTitle &&
    prevEmbed.sourceName === nextEmbed.sourceName &&
    prevEmbed.approvedBy === nextEmbed.approvedBy &&
    prevEmbed.approvedAt === nextEmbed.approvedAt &&
    prevEmbed.lastSynced === nextEmbed.lastSynced &&
    prevProps.currentUserId === nextProps.currentUserId &&
    prevProps.onStatusChange === nextProps.onStatusChange
  );
  // Return true means "props are equal, skip re-render"
  // Return false means "props changed, re-render"
});
