/**
 * Scroll Arrow Indicators Component
 *
 * Displays left and right arrow buttons on the edges of a scrollable container
 * to indicate horizontal scrolling is available. Arrows appear/disappear based
 * on scroll position and allow users to scroll by clicking.
 *
 * @param {Object} props
 * @param {React.RefObject} props.scrollContainerRef - Ref to the scrollable container element
 * @returns {JSX.Element|null} - Arrow indicators JSX or null if no overflow
 */

import React, { useState, useEffect } from 'react';
import { Box, Icon, Pressable, xcss } from '@forge/react';
import { logger } from '../../utils/logger.js';

// Arrow button container style
// Note: transform and cursor must be inline styles as xcss doesn't support them
const arrowButtonStyle = xcss({
  position: 'absolute',
  top: '50%',
  zIndex: 10,
  backgroundColor: 'color.background.neutral.subtle',
  borderRadius: 'border.radius',
  padding: 'space.100',
  boxShadow: 'elevation.shadow.raised',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
});

// Left arrow positioning
const leftArrowStyle = xcss({
  left: 'space.100'
});

// Right arrow positioning
const rightArrowStyle = xcss({
  right: 'space.100'
});

export function ScrollArrowIndicators({ scrollContainerRef }) {
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);

  // Check scroll position and overflow
  const updateArrowVisibility = () => {
    if (!scrollContainerRef?.current) {
      setShowLeftArrow(false);
      setShowRightArrow(false);
      setHasOverflow(false);
      return;
    }

    const container = scrollContainerRef.current;

    // Ensure container is a DOM element
    if (!(container instanceof Element)) {
      setShowLeftArrow(false);
      setShowRightArrow(false);
      setHasOverflow(false);
      return;
    }

    const { scrollLeft, scrollWidth, clientWidth } = container;
    const hasHorizontalOverflow = scrollWidth > clientWidth;

    setHasOverflow(hasHorizontalOverflow);
    setShowLeftArrow(hasHorizontalOverflow && scrollLeft > 0);
    setShowRightArrow(hasHorizontalOverflow && scrollLeft < scrollWidth - clientWidth - 1);
  };

  // Check on mount and when container size changes
  useEffect(() => {
    let resizeObserver = null;
    let container = null;
    let handleScroll = null;
    let rafId = null;
    let isCleanedUp = false;

    // Use requestAnimationFrame to ensure DOM is ready
    const setupObserver = () => {
      if (isCleanedUp) return;

      if (!scrollContainerRef?.current) {
        // Retry if ref not ready yet
        rafId = requestAnimationFrame(setupObserver);
        return;
      }

      container = scrollContainerRef.current;

      // Ensure container is a DOM element
      // HTMLElement extends Element, so just check Element
      if (!(container instanceof Element)) {
        // Retry if not a DOM element yet (might be a React component wrapper)
        rafId = requestAnimationFrame(setupObserver);
        return;
      }

      updateArrowVisibility();

      // Listen to scroll events
      handleScroll = () => {
        updateArrowVisibility();
      };

      // Listen to resize events (content might change)
      resizeObserver = new ResizeObserver(() => {
        updateArrowVisibility();
      });

      try {
        resizeObserver.observe(container);
        container.addEventListener('scroll', handleScroll);

        // Also check on window resize
        window.addEventListener('resize', updateArrowVisibility);
      } catch (error) {
        logger.errors('ScrollArrowIndicators: Failed to setup observers', error);
      }
    };

    rafId = requestAnimationFrame(setupObserver);

    return () => {
      isCleanedUp = true;
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      if (resizeObserver && container) {
        try {
          resizeObserver.disconnect();
        } catch (e) {
          // Ignore errors during cleanup
        }
      }
      if (container && handleScroll) {
        try {
          container.removeEventListener('scroll', handleScroll);
        } catch (e) {
          // Ignore errors during cleanup
        }
      }
      window.removeEventListener('resize', updateArrowVisibility);
    };
  }, [scrollContainerRef]);

  // Scroll handlers
  const scrollLeft = () => {
    if (!scrollContainerRef?.current) return;
    const container = scrollContainerRef.current;
    if (!(container instanceof Element)) return;
    const scrollAmount = 200; // pixels to scroll
    container.scrollTo({
      left: container.scrollLeft - scrollAmount,
      behavior: 'smooth'
    });
  };

  const scrollRight = () => {
    if (!scrollContainerRef?.current) return;
    const container = scrollContainerRef.current;
    if (!(container instanceof Element)) return;
    const scrollAmount = 200; // pixels to scroll
    container.scrollTo({
      left: container.scrollLeft + scrollAmount,
      behavior: 'smooth'
    });
  };

  // Don't render if no overflow
  if (!hasOverflow) {
    return null;
  }

  return (
    <>
      {showLeftArrow && (
        <Pressable onClick={scrollLeft}>
          <Box
            xcss={[arrowButtonStyle, leftArrowStyle]}
            style={{ transform: 'translateY(-50%)', cursor: 'pointer' }}
          >
            <Icon glyph="chevron-left" label="Scroll left" />
          </Box>
        </Pressable>
      )}
      {showRightArrow && (
        <Pressable onClick={scrollRight}>
          <Box
            xcss={[arrowButtonStyle, rightArrowStyle]}
            style={{ transform: 'translateY(-50%)', cursor: 'pointer' }}
          >
            <Icon glyph="chevron-right" label="Scroll right" />
          </Box>
        </Pressable>
      )}
    </>
  );
}

