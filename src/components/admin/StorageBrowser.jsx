/**
 * Storage Browser Component
 *
 * Debugging tool for querying Forge storage directly by key.
 * Useful for inspecting Embed configs, excerpts, usage data, etc.
 *
 * Features:
 * - View Mode: Query single storage key by UUID
 * - Edit Mode: Query multiple keys by prefix, filter by field values, edit JSON directly
 *
 * Usage:
 * View Mode:
 * - Enter a storage key (e.g., macro-vars:{uuid}, excerpt:{id}, usage:{id})
 * - Click Query to fetch the data
 * - View formatted JSON output
 *
 * Edit Mode:
 * - Select key type (excerpt, macro-vars, usage)
 * - Optionally filter by field value (e.g., name contains '[ALL]')
 * - Load all matching objects
 * - Edit JSON directly in the textarea
 * - Validate and save changes
 *
 * Common key patterns:
 * - macro-vars:{localId} - Embed instance configuration
 * - excerpt:{id} - Source/Blueprint Standard definition
 * - usage:{excerptId} - Usage tracking data
 * - excerpt-index - Master index of all excerpts
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Box,
  Stack,
  Inline,
  Heading,
  Text,
  CodeBlock,
  Button,
  Select,
  TextArea,
  xcss,
  Strong,
  SectionMessage,
  ProgressBar
} from '@forge/react';
import { invoke } from '@forge/bridge';
import { useQueryClient } from '@tanstack/react-query';
import { StableTextfield } from '../common/StableTextfield';
import { logger } from '../../utils/logger.js';

// Controlled TextArea wrapper for JSON editing
// TextArea from @forge/react uses defaultValue (uncontrolled), so we need to sync via ref
const ControlledTextArea = React.forwardRef(({ value, onChange, placeholder, isDisabled, stableKey, onDomNodeReady }, ref) => {
  const internalRef = useRef(null);
  const textAreaRef = ref || internalRef;
  const prevValueRef = useRef(value);
  const containerRef = useRef(null);

  // Aggressively search for the actual textarea DOM element using MutationObserver
  useEffect(() => {
    if (!onDomNodeReady) return;

    let found = false;
    const findTextarea = () => {
      if (found) return;

      // Search all textareas in document
      const allTextareas = Array.from(document.querySelectorAll('textarea'));
      
      if (allTextareas.length > 0 && value) {
        // Strategy 1: Match by content (first 100 chars)
        const jsonStart = value.substring(0, Math.min(100, value.length));
        for (const ta of allTextareas) {
          if (ta.value && ta.value.length > 0) {
            const taStart = ta.value.substring(0, Math.min(100, ta.value.length));
            if (taStart === jsonStart) {
              found = true;
              onDomNodeReady(ta);
              return;
            }
          }
        }

        // Strategy 2: Match by content (first 50 chars)
        const jsonStart50 = value.substring(0, Math.min(50, value.length));
        for (const ta of allTextareas) {
          if (ta.value && ta.value.length > 0) {
            const taStart50 = ta.value.substring(0, Math.min(50, ta.value.length));
            if (taStart50 === jsonStart50) {
              found = true;
              onDomNodeReady(ta);
              return;
            }
          }
        }
      }

      // Strategy 3: Find by height (our textarea is 600px)
      for (const ta of allTextareas) {
        try {
          const style = window.getComputedStyle(ta);
          const height = parseFloat(style.height);
          if (height >= 500 && height <= 700 && ta.offsetParent !== null) {
            found = true;
            onDomNodeReady(ta);
            return;
          }
        } catch (e) {
          // Ignore errors
        }
      }

      // Strategy 4: Find largest visible textarea with content
      const visibleTextareas = allTextareas
        .filter(ta => {
          try {
            return ta.offsetParent !== null && ta.value && ta.value.length > 100;
          } catch (e) {
            return false;
          }
        })
        .sort((a, b) => b.value.length - a.value.length);
      
      if (visibleTextareas.length > 0) {
        found = true;
        onDomNodeReady(visibleTextareas[0]);
      }
    };

    // Try immediately and with delays
    findTextarea();
    const timeouts = [
      setTimeout(findTextarea, 100),
      setTimeout(findTextarea, 500),
      setTimeout(findTextarea, 1000),
      setTimeout(findTextarea, 2000)
    ];

    // Use MutationObserver to watch for textarea additions
    const observer = new MutationObserver(() => {
      if (!found) {
        findTextarea();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    return () => {
      timeouts.forEach(clearTimeout);
      observer.disconnect();
    };
  }, [value, onDomNodeReady]);

  // Sync ref value when value prop changes externally
  useEffect(() => {
    const newValue = value || '';
    const prevValue = prevValueRef.current || '';

    if (textAreaRef.current && newValue !== prevValue) {
      const currentValue = textAreaRef.current.value || '';
      if (currentValue !== newValue) {
        textAreaRef.current.value = newValue;
      }
      prevValueRef.current = newValue;
    } else if (newValue !== prevValue) {
      prevValueRef.current = newValue;
    }
  }, [value, stableKey]);

  // Set textarea height and styles via DOM manipulation
  useEffect(() => {
    const findAndStyleTextarea = () => {
      // Try to find the actual textarea DOM element
      let textareaElement = null;
      
      // Strategy 1: Search in container (most reliable)
      if (containerRef.current) {
        const container = containerRef.current;
        // Check if container is a DOM element
        if (container && typeof container.querySelector === 'function') {
          textareaElement = container.querySelector('textarea');
        }
      }
      
      // Strategy 2: Check if ref points to textarea directly (unlikely but possible)
      if (!textareaElement && textAreaRef.current) {
        const refValue = textAreaRef.current;
        // Check if it's already a textarea DOM element
        if (refValue && refValue.tagName === 'TEXTAREA') {
          textareaElement = refValue;
        }
      }
      
      // Strategy 3: Search all textareas and match by content
      if (!textareaElement && value) {
        const allTextareas = Array.from(document.querySelectorAll('textarea'));
        const jsonStart = value.substring(0, Math.min(50, value.length));
        for (const ta of allTextareas) {
          if (ta.value && ta.value.substring(0, Math.min(50, ta.value.length)) === jsonStart) {
            textareaElement = ta;
            break;
          }
        }
      }
      
      // Strategy 4: Find largest visible textarea (fallback)
      if (!textareaElement) {
        const allTextareas = Array.from(document.querySelectorAll('textarea'));
        const visibleTextareas = allTextareas
          .filter(ta => {
            try {
              return ta.offsetParent !== null && ta.value && ta.value.length > 100;
            } catch (e) {
              return false;
            }
          })
          .sort((a, b) => b.value.length - a.value.length);
        
        if (visibleTextareas.length > 0) {
          textareaElement = visibleTextareas[0];
        }
      }
      
      // Apply styles if found
      if (textareaElement && textareaElement.tagName === 'TEXTAREA') {
        try {
          textareaElement.style.height = '600px';
          textareaElement.style.minHeight = '600px';
          textareaElement.style.fontFamily = 'monospace';
          textareaElement.style.fontSize = '14px';
          textareaElement.style.lineHeight = '1.5';
        } catch (e) {
          // Ignore style errors
          logger.errors('[ControlledTextArea] Could not apply styles:', e);
        }
      }
    };

    // Try immediately and with delays to catch textarea after render
    findAndStyleTextarea();
    const timeouts = [
      setTimeout(findAndStyleTextarea, 100),
      setTimeout(findAndStyleTextarea, 300),
      setTimeout(findAndStyleTextarea, 500)
    ];

    return () => {
      timeouts.forEach(clearTimeout);
    };
  }, [value, stableKey]);

  const handleChange = useCallback((e) => {
    if (onChange) {
      onChange(e);
    }
  }, [onChange]);

  return (
    <Box 
      ref={containerRef}
      xcss={xcss({
        width: '100%',
        height: '600px'
      })}
    >
      <TextArea
        key={stableKey || 'json-editor'}
        ref={textAreaRef}
        placeholder={placeholder}
        defaultValue={value}
        onChange={handleChange}
        isDisabled={isDisabled}
        resize="vertical"
      />
    </Box>
  );
});

ControlledTextArea.displayName = 'ControlledTextArea';

const containerStyles = xcss({
  padding: 'space.300',
  backgroundColor: 'color.background.neutral',
  borderRadius: 'border.radius',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderColor: 'color.border',
  width: '100%',
  maxWidth: '100%',
  boxSizing: 'border-box',
  display: 'block',
  marginBlockStart: 'space.200'
});

const codeBlockContainerStyles = xcss({
  maxHeight: '600px',
  minHeight: '600px',
  overflowY: 'auto',
  paddingRight: 'space.200',
  marginRight: 'space.100'
});

const textareaContainerStyles = xcss({
  width: '100%',
  height: '600px'
});

const selectStyles = xcss({
  minWidth: '200px'
});

const warningBannerStyles = xcss({
  padding: 'space.200',
  backgroundColor: 'color.background.warning.subtle',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderColor: 'color.border.warning',
  borderRadius: 'border.radius'
});

export function StorageBrowser() {
  // Get query client for cache invalidation
  const queryClient = useQueryClient();

  // View Mode state
  const [keyType, setKeyType] = useState({ label: 'Embed Config', value: 'macro-vars' });
  const [keyValue, setKeyValue] = useState('');
  const [isQuerying, setIsQuerying] = useState(false);
  const [result, setResult] = useState(null);
  const [copySuccess, setCopySuccess] = useState(false);

  // Edit Mode state
  const [editMode, setEditMode] = useState(false);
  const [editKeyType, setEditKeyType] = useState({ label: 'Source UUID', value: 'excerpt' });
  const [filterField, setFilterField] = useState('');
  const [filterValue, setFilterValue] = useState('');
  const [isLoadingMultiple, setIsLoadingMultiple] = useState(false);
  const [multipleResults, setMultipleResults] = useState(null);
  const [editedJson, setEditedJson] = useState('');
  const [jsonValidationError, setJsonValidationError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveResult, setSaveResult] = useState(null);
  const [isSuccessMessageDismissed, setIsSuccessMessageDismissed] = useState(false);
  const [saveProgress, setSaveProgress] = useState(0); // 0-100 for progress percentage
  
  // Find and Replace state - DISABLED (user will use external editor like Sublime Text)
  // const [findText, setFindText] = useState('');
  // const [replaceText, setReplaceText] = useState('');
  // const [showFindReplace, setShowFindReplace] = useState(false);
  const textAreaRef = useRef(null);
  // const textareaDomRef = useRef(null); // Store the actual DOM textarea element

  const keyTypeOptions = [
    { label: 'Embed UUID', value: 'macro-vars' },
    { label: 'Source UUID', value: 'excerpt' },
    { label: 'Usage Tracking UUID', value: 'usage' },
    { label: 'Master Index', value: 'excerpt-index' }
  ];

  const editKeyTypeOptions = [
    { label: 'Source UUID', value: 'excerpt' },
    { label: 'Embed UUID', value: 'macro-vars' },
    { label: 'Usage Tracking UUID', value: 'usage' }
  ];

  const handleCopyJson = async (jsonData) => {
    if (!jsonData) return;

    // Focus the window first to satisfy Clipboard API requirements
    try {
      window.focus();
    } catch (e) {
      // Focus failed, continue anyway
    }

    const jsonString = JSON.stringify(jsonData, null, 2);

    try {
      await navigator.clipboard.writeText(jsonString);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      // Fallback to legacy method if Clipboard API fails
      try {
        const textarea = document.createElement('textarea');
        textarea.value = jsonString;
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

  const handleQuery = async () => {
    // Build the full storage key
    let fullKey;
    if (keyType.value === 'excerpt-index') {
      // Master index doesn't need a suffix
      fullKey = 'excerpt-index';
    } else {
      // Other types need the value appended with colon
      if (!keyValue.trim()) {
        setResult({ error: 'Please enter a key value' });
        return;
      }
      fullKey = `${keyType.value}:${keyValue.trim()}`;
    }

    setIsQuerying(true);
    setResult(null);

    try {
      const response = await invoke('queryStorage', { key: fullKey });
      setResult(response);
    } catch (error) {
      setResult({ error: error.message });
    } finally {
      setIsQuerying(false);
    }
  };

  const handleLoadMultiple = async () => {
    const prefix = editKeyType.value === 'excerpt-index' ? 'excerpt-index' : `${editKeyType.value}:`;
    
    setIsLoadingMultiple(true);
    setMultipleResults(null);
    setEditedJson('');
    setJsonValidationError(null);
    setSaveResult(null);

    try {
      const response = await invoke('queryStorageMultiple', {
        prefix,
        filterField: filterField.trim() || null,
        filterValue: filterValue.trim() || null
      });

      if (response.success) {
        setMultipleResults(response);
        
        // Format as array of objects for editing
        const formattedData = response.results.map(r => ({
          key: r.key,
          value: r.value
        }));
        
        setEditedJson(JSON.stringify(formattedData, null, 2));
      } else {
        setMultipleResults({ error: response.error });
      }
    } catch (error) {
      setMultipleResults({ error: error.message });
    } finally {
      setIsLoadingMultiple(false);
    }
  };

  const validateJson = useCallback((jsonString) => {
    if (!jsonString.trim()) {
      setJsonValidationError('JSON cannot be empty');
      return null;
    }

    try {
      const parsed = JSON.parse(jsonString);
      
      // Validate it's an array
      if (!Array.isArray(parsed)) {
        setJsonValidationError('JSON must be an array of { key, value } objects');
        return null;
      }

      // Validate each entry has key and value
      for (let i = 0; i < parsed.length; i++) {
        const entry = parsed[i];
        if (!entry || typeof entry !== 'object') {
          setJsonValidationError(`Entry at index ${i} must be an object`);
          return null;
        }
        if (!entry.key || typeof entry.key !== 'string') {
          setJsonValidationError(`Entry at index ${i} must have a string "key" property`);
          return null;
        }
        if (entry.value === undefined || entry.value === null) {
          setJsonValidationError(`Entry at index ${i} must have a "value" property`);
          return null;
        }
      }

      setJsonValidationError(null);
      return parsed;
    } catch (error) {
      setJsonValidationError(`JSON syntax error: ${error.message}`);
      return null;
    }
  }, []);

  const handleJsonChange = (e) => {
    const newValue = e.target.value;
    setEditedJson(newValue);
    validateJson(newValue);
  };

  // Find and Replace handlers - DISABLED (user will use external editor like Sublime Text)
  /*
  const handleFind = () => {
    if (!findText) {
      alert('Please enter text to find');
      return;
    }
    
    const actualTextarea = getTextareaElement();
    
    if (!actualTextarea || actualTextarea.tagName !== 'TEXTAREA') {
      logger.errors('[Find] Could not find textarea element', {
        ref: textAreaRef.current,
        allTextareas: Array.from(document.querySelectorAll('textarea')).map(ta => ({
          height: window.getComputedStyle(ta).height,
          valueLength: ta.value?.length || 0,
          visible: ta.offsetParent !== null
        }))
      });
      alert('Could not access text editor. Please try clicking in the text area first.');
      return;
    }
    
    const text = actualTextarea.value || editedJson;
    
    if (!text) {
      alert('No content to search');
      return;
    }
    
    const index = text.indexOf(findText);
    
    if (index === -1) {
      alert(`"${findText}" not found`);
      return;
    }
    
    // Focus the textarea
    actualTextarea.focus();
    
    // Set selection to highlight the found text
    actualTextarea.setSelectionRange(index, index + findText.length);
    
    // Calculate scroll position
    // Count lines before the selection
    const textBeforeSelection = text.substring(0, index);
    const lineCount = (textBeforeSelection.match(/\n/g) || []).length;
    
    // Estimate line height (most textareas use ~20px line height)
    const computedStyle = window.getComputedStyle(actualTextarea);
    const lineHeight = parseFloat(computedStyle.lineHeight) || 20;
    
    // Calculate scroll position to center the selection in view
    const estimatedScrollPosition = (lineCount * lineHeight) - (actualTextarea.clientHeight / 2);
    
    // Scroll to the selection
    actualTextarea.scrollTop = Math.max(0, Math.min(
      estimatedScrollPosition, 
      actualTextarea.scrollHeight - actualTextarea.clientHeight
    ));
    
    // Ensure selection is still set after scroll
    setTimeout(() => {
      actualTextarea.focus();
      actualTextarea.setSelectionRange(index, index + findText.length);
    }, 50);
  };

  // Helper function to get the actual textarea DOM element
  const getTextareaElement = () => {
    // First, try the stored DOM node ref
    if (textareaDomRef.current && textareaDomRef.current.tagName === 'TEXTAREA') {
      return textareaDomRef.current;
    }
    
    let actualTextarea = null;
    
    // Strategy 1: Try to get from ref - check if it's already a DOM element
    if (textAreaRef.current) {
      const refValue = textAreaRef.current;
      
      // Check if it's a DOM element directly
      if (refValue && typeof refValue === 'object') {
        if (refValue.tagName === 'TEXTAREA' || refValue.nodeName === 'TEXTAREA') {
          actualTextarea = refValue;
        }
        // Try React Fiber structure (React 16+)
        else if (refValue._reactInternalFiber) {
          let fiber = refValue._reactInternalFiber;
          while (fiber) {
            if (fiber.stateNode) {
              if (fiber.stateNode.tagName === 'TEXTAREA') {
                actualTextarea = fiber.stateNode;
                break;
              }
              // Also check children
              if (fiber.stateNode.querySelector) {
                const ta = fiber.stateNode.querySelector('textarea');
                if (ta) {
                  actualTextarea = ta;
                  break;
                }
              }
            }
            fiber = fiber.child || fiber.return;
          }
        }
        // Try React internal instance (React < 16)
        else if (refValue._reactInternalInstance) {
          let instance = refValue._reactInternalInstance;
          while (instance) {
            if (instance._hostNode && instance._hostNode.tagName === 'TEXTAREA') {
              actualTextarea = instance._hostNode;
              break;
            }
            instance = instance._renderedComponent || instance._currentElement;
          }
        }
        // Try to find textarea in the component's rendered tree
        else if (refValue.querySelector && typeof refValue.querySelector === 'function') {
          actualTextarea = refValue.querySelector('textarea');
        }
        // Check if there's a way to access the underlying input/textarea
        else if (refValue.input || refValue.textarea) {
          actualTextarea = refValue.input || refValue.textarea;
        }
      }
    }
    
    // Strategy 2: Search all iframes and shadow DOMs for textareas
    if (!actualTextarea || actualTextarea.tagName !== 'TEXTAREA') {
      // Search in main document
      let allTextareas = Array.from(document.querySelectorAll('textarea'));
      
      // Search in all iframes
      try {
        const iframes = Array.from(document.querySelectorAll('iframe'));
        for (const iframe of iframes) {
          try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
            if (iframeDoc) {
              allTextareas = allTextareas.concat(Array.from(iframeDoc.querySelectorAll('textarea')));
            }
          } catch (e) {
            // Cross-origin iframe, skip
          }
        }
      } catch (e) {
        // Ignore iframe access errors
      }
      
      // Search by content match
      if (editedJson && editedJson.length > 0) {
        const jsonStart = editedJson.substring(0, Math.min(100, editedJson.length));
        for (const ta of allTextareas) {
          if (ta.value && ta.value.length > 0) {
            const taStart = ta.value.substring(0, Math.min(100, ta.value.length));
            if (taStart === jsonStart) {
              actualTextarea = ta;
              break;
            }
          }
        }
        
        // Try partial match (first 50 chars)
        if (!actualTextarea || actualTextarea.tagName !== 'TEXTAREA') {
          const jsonStart50 = editedJson.substring(0, Math.min(50, editedJson.length));
          for (const ta of allTextareas) {
            if (ta.value && ta.value.length > 0) {
              const taStart50 = ta.value.substring(0, Math.min(50, ta.value.length));
              if (taStart50 === jsonStart50) {
                actualTextarea = ta;
                break;
              }
            }
          }
        }
      }
      
      // Strategy 3: Find by height (our textarea is 600px)
      if (!actualTextarea || actualTextarea.tagName !== 'TEXTAREA') {
        for (const ta of allTextareas) {
          const style = window.getComputedStyle(ta);
          const height = parseFloat(style.height);
          if (height >= 500 && height <= 700) {
            if (ta.offsetParent !== null && ta.value && ta.value.length > 0) {
              actualTextarea = ta;
              break;
            }
          }
        }
      }
      
      // Strategy 4: Find the largest visible textarea with content
      if (!actualTextarea || actualTextarea.tagName !== 'TEXTAREA') {
        const visibleTextareas = allTextareas
          .filter(ta => {
            try {
              return ta.offsetParent !== null && ta.value && ta.value.length > 100;
            } catch (e) {
              return false;
            }
          })
          .sort((a, b) => b.value.length - a.value.length);
        
        if (visibleTextareas.length > 0) {
          actualTextarea = visibleTextareas[0];
        }
      }
    }
    
    return actualTextarea;
  };

  const handleReplace = () => {
    if (!findText) return;
    
    const textarea = getTextareaElement();
    if (!textarea) {
      alert('Text editor not ready');
      return;
    }
    
    const text = textarea.value || editedJson;
    
    if (!text.includes(findText)) {
      alert(`"${findText}" not found`);
      return;
    }
    
    const newText = text.replace(findText, replaceText);
    setEditedJson(newText);
    
    // Update the textarea value directly
    textarea.value = newText;
    
    // Trigger onChange to sync state
    const event = new Event('input', { bubbles: true });
    textarea.dispatchEvent(event);
    
    validateJson(newText);
  };

  const handleReplaceAll = () => {
    if (!findText) return;
    
    const textarea = getTextareaElement();
    if (!textarea) {
      alert('Text editor not ready');
      return;
    }
    
    const text = textarea.value || editedJson;
    
    if (!text.includes(findText)) {
      alert(`"${findText}" not found`);
      return;
    }
    
    const regex = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const newText = text.replace(regex, replaceText);
    const replacementCount = (text.match(regex) || []).length;
    
    setEditedJson(newText);
    
    // Update the textarea value directly
    textarea.value = newText;
    
    // Trigger onChange to sync state
    const event = new Event('input', { bubbles: true });
    textarea.dispatchEvent(event);
    
    validateJson(newText);
    alert(`Replaced ${replacementCount} occurrence${replacementCount === 1 ? '' : 's'}`);
  };
  */

  const handleSave = async () => {
    const parsed = validateJson(editedJson);
    if (!parsed) {
      return;
    }

    // Confirm before saving
    if (!window.confirm(`Are you sure you want to save changes to ${parsed.length} storage entries? This action cannot be undone.`)) {
      return;
    }

    setIsSaving(true);
    setSaveResult(null);
    setSaveProgress(0);

    try {
      // Simulate progress updates during save
      // Since we don't have real-time progress from the backend,
      // we'll show indeterminate progress and then update based on results
      const progressInterval = setInterval(() => {
        setSaveProgress(prev => {
          // Gradually increase progress, but cap at 90% until we get results
          if (prev < 90) {
            return Math.min(prev + 10, 90);
          }
          return prev;
        });
      }, 200);

      const response = await invoke('bulkUpdateStorage', {
        updates: parsed
      });

      clearInterval(progressInterval);
      setSaveProgress(100);

      setSaveResult(response);
      
      if (response.success) {
        // Show success message (reset dismissed state)
        setIsSuccessMessageDismissed(false);
        
        // Reload the data to show updated values
        await handleLoadMultiple();
        
        // Invalidate all React Query caches that might be affected by the storage changes
        // This ensures the Admin page and other components immediately reflect the changes
        queryClient.invalidateQueries({ queryKey: ['excerpts', 'list'] }); // Main excerpts list
        queryClient.invalidateQueries({ queryKey: ['excerpt'] }); // All individual excerpt queries
        queryClient.invalidateQueries({ queryKey: ['usageCounts', 'all'] }); // Usage counts
        
        // Check if any excerpts were updated and invalidate their usage queries
        const updatedExcerptIds = parsed
          .filter(entry => entry.key?.startsWith('excerpt:'))
          .map(entry => entry.key.replace('excerpt:', ''));
        
        for (const excerptId of updatedExcerptIds) {
          queryClient.invalidateQueries({ queryKey: ['excerpt', excerptId, 'usage'] });
        }
        
      } else {
        // Hide success message on failure
        setIsSuccessMessageDismissed(true);
      }

      // Reset progress after a short delay to show completion
      setTimeout(() => {
        setSaveProgress(0);
      }, 1000);
    } catch (error) {
      setSaveResult({
        success: false,
        error: error.message,
        updated: 0,
        failed: 0,
        errors: []
      });
      setSaveProgress(0);
    } finally {
      setIsSaving(false);
    }
  };

  const renderResult = () => {
    if (!result) return null;

    if (result.error) {
      return (
        <Box backgroundColor="color.background.danger" padding="space.200">
          <Text color="color.text.danger">Error: {result.error}</Text>
        </Box>
      );
    }

    if (!result.exists) {
      return (
        <Box backgroundColor="color.background.warning" padding="space.200">
          <Text color="color.text.warning">
            <Strong>Not Found:</Strong> {result.message}
          </Text>
        </Box>
      );
    }

    // Pretty format the JSON with proper indentation
    const formattedJson = JSON.stringify(result.data, null, 2);

    return (
      <Stack space="space.100">
        <Inline space="space.100" alignBlock="center" spread="space-between">
          <Text size="small" weight="medium">
            ✅ Found • Type: {result.dataType} • Size: {result.dataSize} bytes
          </Text>
          <Button
            appearance="subtle"
            onClick={() => handleCopyJson(result.data)}
          >
            {copySuccess ? '✓ Copied!' : '📋 Copy Full JSON'}
          </Button>
        </Inline>
        <Box xcss={codeBlockContainerStyles}>
          <CodeBlock
            language="json"
            text={formattedJson}
            showLineNumbers={true}
            shouldWrapLongLines={true}
          />
        </Box>
      </Stack>
    );
  };

  const renderEditMode = () => {
    return (
      <Stack space="space.300">
        {/* Warning Banner */}
        <Box xcss={warningBannerStyles}>
          <Text weight="medium" color="color.text.warning">
            ⚠️ Warning: Direct storage editing can cause data corruption. Always validate JSON before saving.
          </Text>
        </Box>

        {/* Search/Filter UI */}
        <Stack space="space.200">
          <Heading size="small">Search & Filter</Heading>
          <Stack space="space.100">
            <Inline space="space.100" alignBlock="center">
              <Box xcss={selectStyles}>
                <Select
                  options={editKeyTypeOptions}
                  value={editKeyType}
                  onChange={(selected) => setEditKeyType(selected)}
                />
              </Box>
              <StableTextfield
                stableKey="edit-filter-field"
                placeholder="Filter field (e.g., 'name')"
                value={filterField}
                onChange={(e) => setFilterField(e.target.value)}
                width="medium"
              />
              <StableTextfield
                stableKey="edit-filter-value"
                placeholder="Filter value (contains, e.g., '[ALL]')"
                value={filterValue}
                onChange={(e) => setFilterValue(e.target.value)}
                width="medium"
              />
              <Button
                appearance="primary"
                onClick={handleLoadMultiple}
                isDisabled={isLoadingMultiple}
              >
                {isLoadingMultiple ? 'Loading...' : 'Load All'}
              </Button>
            </Inline>
            {multipleResults && !multipleResults.error && (
              <Text size="small" color="color.text.subtlest">
                Found {multipleResults.count} matching {multipleResults.count === 1 ? 'object' : 'objects'}
                {filterField && filterValue && ` (filtered by ${filterField} contains "${filterValue}")`}
              </Text>
            )}
          </Stack>
        </Stack>

        {/* Results Display */}
        {multipleResults && (
          <Stack space="space.200">
            {multipleResults.error ? (
              <Box backgroundColor="color.background.danger" padding="space.200">
                <Text color="color.text.danger">Error: {multipleResults.error}</Text>
              </Box>
            ) : (
              <>
                <Stack space="space.100">
                  <Inline space="space.100" alignBlock="center" spread="space-between">
                    <Text size="small" weight="medium">
                      {multipleResults.count} {multipleResults.count === 1 ? 'object' : 'objects'} loaded
                    </Text>
                    <Button
                      appearance="subtle"
                      onClick={() => handleCopyJson(JSON.parse(editedJson || '[]'))}
                    >
                      📋 Copy JSON
                    </Button>
                  </Inline>
                </Stack>

                {/* JSON Editor */}
                <Stack space="space.100">
                  <Inline space="space.100" alignBlock="center" spread="space-between">
                    <Heading size="small">Edit JSON</Heading>
                    {/* Find and Replace button - DISABLED (user will use external editor like Sublime Text) */}
                    {/*
                    <Button
                      appearance="subtle"
                      onClick={() => setShowFindReplace(!showFindReplace)}
                    >
                      {showFindReplace ? '▼ Hide' : '▶ Show'} Find & Replace
                    </Button>
                    */}
                  </Inline>
                  
                  {/* Find and Replace Panel - DISABLED (user will use external editor like Sublime Text) */}
                  {/*
                  {showFindReplace && (
                    <Box 
                      xcss={xcss({
                        padding: 'space.200',
                        backgroundColor: 'color.background.neutral.subtle',
                        borderRadius: 'border.radius',
                        borderWidth: 'border.width',
                        borderStyle: 'solid',
                        borderColor: 'color.border'
                      })}
                    >
                      <Stack space="space.100">
                        <Text size="small" weight="medium">Find & Replace</Text>
                        <Inline space="space.100" alignBlock="center">
                          <Box xcss={xcss({ flex: '1 1 0', minWidth: '200px' })}>
                            <StableTextfield
                              stableKey="find-replace-find-field"
                              label="Find"
                              value={findText}
                              onChange={(e) => setFindText(e.target.value)}
                              placeholder="Text to find..."
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && e.ctrlKey) {
                                  e.preventDefault();
                                  handleFind();
                                }
                              }}
                            />
                          </Box>
                          <Box xcss={xcss({ flex: '1 1 0', minWidth: '200px' })}>
                            <StableTextfield
                              stableKey="find-replace-replace-field"
                              label="Replace"
                              value={replaceText}
                              onChange={(e) => setReplaceText(e.target.value)}
                              placeholder="Replacement text..."
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && e.ctrlKey) {
                                  e.preventDefault();
                                  handleReplace();
                                }
                              }}
                            />
                          </Box>
                        </Inline>
                        <Inline space="space.100">
                          <Button
                            appearance="default"
                            onClick={handleFind}
                            isDisabled={!findText}
                          >
                            Find
                          </Button>
                          <Button
                            appearance="default"
                            onClick={handleReplace}
                            isDisabled={!findText}
                          >
                            Replace
                          </Button>
                          <Button
                            appearance="default"
                            onClick={handleReplaceAll}
                            isDisabled={!findText}
                          >
                            Replace All
                          </Button>
                        </Inline>
                      </Stack>
                    </Box>
                  )}
                  */}
                  
                  <Box xcss={textareaContainerStyles}>
                    <ControlledTextArea
                      ref={textAreaRef}
                      value={editedJson}
                      onChange={handleJsonChange}
                      placeholder="JSON will appear here after loading..."
                      isDisabled={!multipleResults || multipleResults.error}
                      stableKey="storage-browser-json-editor"
                    />
                  </Box>
                  
                  {/* Validation Status */}
                  {editedJson && (
                    <Box>
                      {jsonValidationError ? (
                        <Box backgroundColor="color.background.danger" padding="space.100">
                          <Text size="small" color="color.text.danger">
                            ❌ {jsonValidationError}
                          </Text>
                        </Box>
                      ) : (
                        <Box backgroundColor="color.background.success.subtle" padding="space.100">
                          <Text size="small" color="color.text.success">
                            ✅ JSON is valid
                          </Text>
                        </Box>
                      )}
                    </Box>
                  )}

                  {/* Save Button and Progress */}
                  <Stack space="space.100">
                    <Inline space="space.100">
                      <Button
                        appearance="primary"
                        onClick={handleSave}
                        isDisabled={!editedJson || !!jsonValidationError || isSaving || !multipleResults || multipleResults.error}
                      >
                        {isSaving ? 'Saving...' : 'Save Changes'}
                      </Button>
                    </Inline>
                    
                    {/* Progress Indicator */}
                    {isSaving && (
                      <Box>
                        <Stack space="space.050">
                          <ProgressBar 
                            value={saveProgress} 
                            isIndeterminate={saveProgress === 0}
                          />
                          <Text size="small" color="color.text.subtlest">
                            {saveProgress === 0 
                              ? 'Preparing to save...' 
                              : saveProgress < 100
                              ? `Saving to Forge storage... ${saveProgress}%`
                              : 'Finalizing...'}
                          </Text>
                        </Stack>
                      </Box>
                    )}
                  </Stack>

                  {/* Success Message - Persistent and Dismissable */}
                  {saveResult && saveResult.success && !isSuccessMessageDismissed && (
                    <SectionMessage
                      appearance="success"
                      title="Save Successful"
                      actions={[
                        {
                          key: 'dismiss',
                          text: 'Dismiss',
                          onClick: () => setIsSuccessMessageDismissed(true)
                        }
                      ]}
                    >
                      <Stack space="space.100">
                        <Text>
                          Successfully updated {saveResult.updated} storage {saveResult.updated === 1 ? 'entry' : 'entries'}.
                          {saveResult.failed > 0 && ` ${saveResult.failed} ${saveResult.failed === 1 ? 'entry' : 'entries'} failed.`}
                        </Text>
                        <Text size="small" color="color.text.subtlest">
                          All React Query caches have been invalidated. The Sources tab and other components will automatically refresh with the updated data.
                        </Text>
                      </Stack>
                    </SectionMessage>
                  )}

                  {/* Error Message */}
                  {saveResult && !saveResult.success && (
                    <SectionMessage appearance="error" title="Save Failed">
                      <Stack space="space.100">
                        <Text>
                          Updated: {saveResult.updated} • Failed: {saveResult.failed}
                        </Text>
                        {saveResult.errors && saveResult.errors.length > 0 && (
                          <Box>
                            <Text size="small" weight="medium">Errors:</Text>
                            <Stack space="space.050" xcss={xcss({ marginBlockStart: 'space.050' })}>
                              {saveResult.errors.map((err, idx) => (
                                <Text key={idx} size="small">
                                  • {err.key}: {err.error}
                                </Text>
                              ))}
                            </Stack>
                          </Box>
                        )}
                        {saveResult.error && (
                          <Text size="small">{saveResult.error}</Text>
                        )}
                      </Stack>
                    </SectionMessage>
                  )}
                </Stack>
              </>
            )}
          </Stack>
        )}
      </Stack>
    );
  };

  return (
    <Box xcss={containerStyles}>
      <Stack space="space.200">
        <Inline space="space.100" alignBlock="center" spread="space-between">
          <Heading size="medium">Storage Browser</Heading>
          <Button
            appearance={editMode ? "default" : "primary"}
            onClick={() => {
              setEditMode(!editMode);
              setResult(null);
              setMultipleResults(null);
              setEditedJson('');
              setJsonValidationError(null);
              setSaveResult(null);
            }}
          >
            {editMode ? 'Switch to View Mode' : 'Switch to Edit Mode'}
          </Button>
        </Inline>

        {editMode ? (
          renderEditMode()
        ) : (
          <>
            <Text size="small" color="color.text.subtlest">
              Select the key type and paste the UUID. Use the Copy button from Embed edit view for Embed Config queries.
            </Text>

            <Inline space="space.100" alignBlock="center">
              <Box xcss={selectStyles}>
                <Select
                  options={keyTypeOptions}
                  value={keyType}
                  onChange={(selected) => setKeyType(selected)}
                />
              </Box>
              <StableTextfield
                stableKey="storage-browser-key-value"
                placeholder={keyType.value === 'excerpt-index' ? 'No value needed for Master Index' : 'Paste UUID here...'}
                value={keyValue}
                onChange={(e) => setKeyValue(e.target.value)}
                isDisabled={keyType.value === 'excerpt-index'}
                width="large"
              />
              <Button
                appearance="primary"
                onClick={handleQuery}
                isDisabled={isQuerying || (keyType.value !== 'excerpt-index' && !keyValue.trim())}
              >
                {isQuerying ? 'Querying...' : 'Query'}
              </Button>
            </Inline>

            {renderResult()}
          </>
        )}
      </Stack>
    </Box>
  );
}
