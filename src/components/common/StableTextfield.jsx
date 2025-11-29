/**
 * StableTextfield Component
 *
 * A wrapper around Forge's Textfield component that prevents cursor jumping
 * by using an uncontrolled component pattern with ref synchronization.
 *
 * Based on the pattern used in RedlineQueueCard's CommentTextArea component.
 *
 * This component:
 * - Uses uncontrolled pattern (defaultValue) to prevent re-renders on every keystroke
 * - Syncs ref value when value prop changes externally (e.g., when parent state resets)
 * - Uses React.memo with custom comparison to prevent unnecessary re-renders
 * - Maintains a stable key to prevent component recreation
 *
 * Usage:
 * <StableTextfield
 *   value={value}
 *   onChange={(e) => setValue(e.target.value)}
 *   placeholder="Enter text..."
 *   stableKey="unique-field-id"
 *   // ... other Textfield props
 * />
 *
 * @param {Object} props - All props are passed through to Textfield
 * @param {string} props.stableKey - Unique key for this field (required for proper memoization)
 * @param {string} props.value - Controlled value (synced to ref when changed externally)
 * @param {Function} props.onChange - Change handler
 * @returns {JSX.Element}
 */

import React, { useCallback, useRef, useEffect } from 'react';
import { Textfield } from '@forge/react';

// Isolated Textfield component to prevent cursor jumping
// Uses uncontrolled component pattern with ref to maintain cursor position
const StableTextfieldComponent = React.forwardRef(({ 
  stableKey,
  value,
  onChange,
  onBlur,
  ...otherProps 
}, ref) => {
  const textFieldRef = useRef(null);
  
  // Combine internal ref with forwarded ref
  React.useImperativeHandle(ref, () => textFieldRef.current, []);
  
  // Track previous value to detect changes
  const prevValueRef = useRef(value);
  const isInitialMountRef = useRef(true);
  
  // Sync ref value when value prop changes externally (e.g., when parent state resets)
  // Only sync when value actually changes, not on every render
  useEffect(() => {
    const newValue = value || '';
    const prevValue = prevValueRef.current || '';
    
    // On initial mount, set the ref value immediately
    if (isInitialMountRef.current) {
      if (textFieldRef.current) {
        textFieldRef.current.value = newValue;
      }
      prevValueRef.current = newValue;
      isInitialMountRef.current = false;
      return;
    }
    
    // Update ref if value changed
    if (textFieldRef.current && newValue !== prevValue) {
      const currentValue = textFieldRef.current.value || '';
      // Update if values differ (handles empty string, null, undefined cases)
      if (currentValue !== newValue) {
        textFieldRef.current.value = newValue;
        
        // Force a visual update by dispatching input and change events
        // Some components need these events to update the display
        try {
          const inputEvent = new Event('input', { bubbles: true, cancelable: true });
          textFieldRef.current.dispatchEvent(inputEvent);
          
          const changeEvent = new Event('change', { bubbles: true, cancelable: true });
          textFieldRef.current.dispatchEvent(changeEvent);
        } catch (e) {
          // Ignore errors if events can't be dispatched
        }
        
        // Double-check with a small delay
        setTimeout(() => {
          if (textFieldRef.current && textFieldRef.current.value !== newValue) {
            textFieldRef.current.value = newValue;
          }
        }, 10);
      }
      prevValueRef.current = newValue;
    } else if (newValue !== prevValue) {
      // Value changed but ref not ready yet - update ref for next render
      prevValueRef.current = newValue;
    }
  }, [value, stableKey]); // Only sync when value or stableKey changes
  
  // Handle change events
  const handleChange = useCallback((e) => {
    if (onChange) {
      onChange(e);
    }
  }, [onChange]);
  
  // Handle blur events (for draft saving)
  const handleBlur = useCallback((e) => {
    if (onBlur) {
      onBlur(e);
    }
  }, [onBlur]);
  
  return (
    <Textfield
      key={stableKey || `stable-textfield-${otherProps.id || otherProps.name || 'default'}`}
      ref={textFieldRef}
      placeholder={otherProps.placeholder}
      defaultValue={value}
      onChange={handleChange}
      onBlur={handleBlur}
      {...otherProps}
    />
  );
});

StableTextfieldComponent.displayName = 'StableTextfieldComponent';

// Memoize component to prevent re-renders when value changes during typing
// But allow re-renders when value changes significantly (e.g., form reset)
export const StableTextfield = React.memo(StableTextfieldComponent, (prevProps, nextProps) => {
  // Check structural props first
  const structuralEqual = (
    prevProps.stableKey === nextProps.stableKey &&
    prevProps.id === nextProps.id &&
    prevProps.name === nextProps.name &&
    prevProps.placeholder === nextProps.placeholder &&
    prevProps.isDisabled === nextProps.isDisabled &&
    prevProps.label === nextProps.label &&
    prevProps.onChange === nextProps.onChange &&
    prevProps.onBlur === nextProps.onBlur
  );
  
  if (!structuralEqual) return false;
  
  // For value changes: allow re-render if the change is "significant"
  // (more than 2 characters different - indicates reset, not typing)
  const prevValue = prevProps.value || '';
  const nextValue = nextProps.value || '';
  const lengthDiff = Math.abs(prevValue.length - nextValue.length);
  
  // If values differ by more than 2 chars, or are completely different, re-render
  if (lengthDiff > 2 || (prevValue !== nextValue && !nextValue.startsWith(prevValue) && !prevValue.startsWith(nextValue))) {
    return false; // Don't skip re-render - values changed significantly
  }
  
  // Small change (typing) - skip re-render, let ref handle it
  return true;
});

StableTextfield.displayName = 'StableTextfield';

