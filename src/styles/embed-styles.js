/**
 * Embed Display Styles
 *
 * Centralized xcss style definitions for the Blueprint Standard Embed macro.
 * All styles use Forge's xcss() system for type-safe, theme-aware styling.
 *
 * Style Categories:
 * - Preview Styles: Content preview box styling
 * - Variable Styles: Variable configuration table styling
 * - Form Styles: Required field warnings
 * - Banner Styles: Update Available banner styling
 * - Content Styles: ADF content container styling
 *
 * @see https://developer.atlassian.com/platform/forge/ui-kit/xcss/
 */

import { xcss } from '@forge/react';

/**
 * Preview box styling
 * Used for: rendered content preview in edit mode
 */
export const previewBoxStyle = xcss({
  borderColor: 'color.border',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderRadius: 'border.radius',
  padding: 'space.200'
});

/**
 * Variable table container styling
 * Full-width container for variable configuration table
 */
export const variableBoxStyle = xcss({
  width: '100%',
  backgroundColor: 'color.background.neutral',
  paddingBlockStart: 'space.200',
  paddingBlockEnd: 'space.100',
  paddingInline: 'space.100'
});

/**
 * Required field warning border
 * Highlights fields that require user input
 */
export const requiredFieldStyle = xcss({
  borderColor: 'color.border.warning',
  borderWidth: 'border.width.outline',
  borderStyle: 'solid',
  borderRadius: 'border.radius',
  padding: 'space.050'
});

/**
 * Update Available banner margin
 * Only applies margin, SectionMessage has its own padding
 */
export const updateBannerStyle = xcss({
  marginBottom: 'space.100'
});

/**
 * Section message content padding
 * Adds right padding to balance icon column on left
 */
export const sectionContentStyle = xcss({
  paddingRight: 'space.300'  // 24px - matches SectionMessage icon column width
});

/**
 * ADF content container width constraint
 * Prevents horizontal scrollbar by constraining expand panels and other ADF elements
 */
export const adfContentContainerStyle = xcss({
  width: '100%',
  maxWidth: '100%',
  paddingTop: 'space.050',
  paddingBottom: 'space.100',
  paddingLeft: 'space.150',
  paddingRight: 'space.150',
  margin: 'space.0',
  overflow: 'hidden'
});

/**
 * Excerpt selector container styling
 * Background and padding for the dropdown at top of edit mode
 */
export const excerptSelectorStyle = xcss({
  paddingBlock: 'space.100',
  paddingInline: 'space.100',
  backgroundColor: 'color.background.neutral.subtle'
});

/**
 * Textfield wrapper style with explicit caret color
 * Ensures cursor is visible when editing text fields
 */
export const textfieldWrapperStyle = xcss({
  caretColor: 'color.text'
});

/**
 * Edit button border container styling
 * Top border container for Edit buttons in all states (loading, active, etc.)
 * Used by: EmbedViewMode, EmbedContainer
 */
export const editButtonBorderContainerStyle = xcss({
  borderTopWidth: '1px',
  borderTopStyle: 'solid',
  borderTopColor: 'color.border',
  paddingTop: 'space.100',
  marginTop: '-space.050' // pull border to edge of container
});
