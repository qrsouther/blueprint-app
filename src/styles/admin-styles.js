/**
 * Admin Page Styles
 *
 * Centralized xcss style definitions for the Blueprint Standards Admin page.
 * All styles use Forge's xcss() system for type-safe, theme-aware styling.
 *
 * Style Categories:
 * - Card Styles: Shared card container styling for excerpt cards, orphaned items, etc.
 * - Table Styles: Full-width table container styling
 * - Preview Styles: Content preview box styling (matches Embed macro preview)
 * - Form Controls: Select dropdown sizing
 * - Layout Styles: Sidebar and content area sizing/spacing
 *
 * @see https://developer.atlassian.com/platform/forge/ui-kit/xcss/
 */

import { xcss } from '@forge/react';

/**
 * Card container styling
 * Used for: excerpt cards, orphaned items, category cards, etc.
 */
export const cardStyles = xcss({
  padding: 'space.200',
  borderColor: 'color.border',
  borderStyle: 'solid',
  borderWidth: 'border.width',
  borderRadius: 'border.radius',
  boxShadow: 'elevation.shadow.raised',
  backgroundColor: 'color.background.neutral.subtle',
  minWidth: '250px',
  flexGrow: 1,
  flexShrink: 1,
  flexBasis: '250px'
});

/**
 * Full-width table container
 * Used for: includes table, usage tables, etc.
 */
export const fullWidthTableStyle = xcss({
  width: '100%'
});

/**
 * Scrollable table container
 * Used for: usage details table that may have many variable/toggle columns
 * Always shows horizontal scrollbar (even when no overflow)
 * Constrained to parent width to prevent page-level horizontal scrolling
 */
export const tableScrollContainerStyle = xcss({
  width: '100%',
  maxWidth: '100%',
  minWidth: 0, // Critical: Allow flex item to shrink below its content size
  overflowX: 'scroll', // Always show horizontal scrollbar
  overflowY: 'auto', // Show vertical scrollbar only when needed
  boxSizing: 'border-box', // Include padding/borders in width calculation
  display: 'block', // Ensure block-level behavior for proper overflow handling
  position: 'relative' // Establish positioning context for scrollbar and fade indicator
});

/**
 * Table cell separator style
 * Adds subtle vertical separator line to the left of table cells
 * Used to visually separate columns in the Usage table
 */
export const tableCellSeparatorStyle = xcss({
  borderLeftWidth: 'border.width',
  borderLeftStyle: 'solid',
  borderLeftColor: 'color.border',
  paddingLeft: 'space.100'
});

/**
 * Preview content box styling
 * Matches the Embed macro preview styling for consistency
 */
export const previewBoxStyle = xcss({
  borderColor: 'color.border',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderRadius: 'border.radius',
  padding: 'space.200'
});

/**
 * Select dropdown sizing
 * Matches the width of the search input field
 */
export const selectStyles = xcss({
  width: '100%'
});

/**
 * Left sidebar layout
 * Takes up 15% of viewport width for category navigation and filters
 * Height grows and shrinks to match sibling MiddleSection (flex container row)
 * Fixed width to prevent expansion when table content is wide
 */
/**
 * Left sidebar layout
 * Initially (when no excerpt is selected and MiddleSection is not rendered), sidebar should have minimal height.
 * When Main/MiddleSection is shown, the sidebar expands to match sibling's height.
 * Uses a small minHeight on load and grows with content/flex parent after selection.
 */
export const leftSidebarStyles = xcss({
  width: '20%',
  minWidth: '20%',
  flexShrink: 0, // Don't shrink below content size (width)
  flexGrow: 0,    // Don't grow beyond allocated width
  display: 'flex',
  flexDirection: 'column',
  // The key here: Set a small minHeight for initial render before MiddleSection is shown,
  // but let flexbox grow it once its parent is taller.
  minHeight: '1vh',    // Minimal height for initial (page load) render
  height: '100%',      // Will fill parent's height as soon as possible (when flex parent sets height)
  paddingInlineEnd: 'space.200',
  padding: 'space.200',
  borderColor: 'color.border',
  borderStyle: 'solid',
  borderWidth: 'border.width',
  borderRadius: 'border.radius',
  boxSizing: 'border-box' // Include padding in width calculation
});

/**
 * Scrollable excerpt list container
 * ExcerptList grows to fill sidebar height but scrolls if content is long
 */
export const scrollableListStyle = xcss({
  flex: 1,         // Fill vertical available space in LeftSidebar
  minHeight: 0,    // Allow shrinking to fit container if content is small
  overflowY: 'auto',
  padding: 'space.0',
  paddingTop: 'space.200'
});

/**
 * Middle section layout
 * Takes up remaining space after sidebar (flex: 1)
 * Constrained to prevent horizontal overflow - only child table should scroll
 * Maintains consistent width regardless of content visibility
 */
export const middleSectionStyles = xcss({
  flex: '1 1 0%', // Take remaining space, can shrink, don't grow beyond
  minWidth: 0, // Critical: Allow flex item to shrink below its content size
  width: '100%', // Maintain full width of available space
  maxWidth: '100%', // Never exceed container width
  height: '100%', // Fill parent flex row's height, matches LeftSidebar
  overflow: 'hidden', // Prevent container from expanding horizontally (xcss doesn't support overflowX separately)
  boxSizing: 'border-box', // Include padding in width calculation
  paddingInlineEnd: 'space.200',
  paddingInlineStart: 'space.200',
  padding: 'space.200'
});

/**
 * Right content area layout
 * Takes up 45% of viewport width for preview/details panel
 */
export const rightContentStyles = xcss({
  width: '45%',
  paddingInlineStart: 'space.200',
  padding: 'space.200',
  borderColor: 'color.border',
  borderStyle: 'solid',
  borderWidth: 'border.width',
  borderRadius: 'border.radius'
});

/**
 * Section separator styling
 * Used for visual separation between major page sections
 */
export const sectionSeparatorStyles = xcss({
  marginBlockEnd: 'space.300',
  paddingBlockEnd: 'space.200',
  borderBlockEndColor: 'color.border',
  borderBlockEndStyle: 'solid',
  borderBlockEndWidth: 'border.width'
});

/**
 * Standard section margin
 * Used for consistent spacing between sections
 */
export const sectionMarginStyles = xcss({
  marginBlockEnd: 'space.300'
});

/**
 * Tab panel content spacing
 * Adds margin below TabList to separate tabs from content
 */
export const tabPanelContentStyles = xcss({
  marginBlockStart: 'space.200'
});
