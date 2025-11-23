/**
 * ADF Rendering Utilities
 *
 * Utility functions for manipulating and processing Atlassian Document Format (ADF) content.
 * These functions handle cleaning, filtering, variable substitution, and content insertion
 * for the Blueprint Standard (Blueprint App) application.
 *
 * Key operations:
 * - Cleaning ADF for Forge's AdfRenderer compatibility
 * - Toggle-based conditional content filtering
 * - Variable substitution with visual indicators for unset variables
 * - Custom paragraph and internal note insertions
 */

/**
 * Clean ADF for Forge's AdfRenderer
 *
 * Removes unsupported attributes and normalizes ADF structure for rendering.
 * Handles:
 * - localId removal (not supported by Forge)
 * - Null panel attributes
 * - Null table cell attributes
 * - Unsupported table attributes
 *
 * Note: AdfRenderer uses hardcoded 14px font size that cannot be overridden.
 * This is a known limitation of Forge UI Kit's AdfRenderer component.
 *
 * @param {Object} adfNode - ADF node to clean
 * @returns {Object} Cleaned ADF node
 */
export const cleanAdfForRenderer = (adfNode) => {
  if (!adfNode || typeof adfNode !== 'object') return adfNode;

  const cleaned = { ...adfNode };

  if (cleaned.attrs) {
    const cleanedAttrs = { ...cleaned.attrs };

    // Remove localId (not supported by Forge AdfRenderer)
    delete cleanedAttrs.localId;

    // Handle panels - remove null attributes
    if (cleaned.type === 'panel') {
      if (cleanedAttrs.panelIconId === null) delete cleanedAttrs.panelIconId;
      if (cleanedAttrs.panelIcon === null) delete cleanedAttrs.panelIcon;
      if (cleanedAttrs.panelIconText === null) delete cleanedAttrs.panelIconText;
      if (cleanedAttrs.panelColor === null) delete cleanedAttrs.panelColor;
    }

    // Remove null-valued table cell attributes
    if (cleaned.type === 'tableCell' || cleaned.type === 'tableHeader') {
      if (cleanedAttrs.background === null) delete cleanedAttrs.background;
      if (cleanedAttrs.colwidth === null) delete cleanedAttrs.colwidth;
    }

    // Remove unsupported table attributes
    if (cleaned.type === 'table') {
      if (cleanedAttrs.displayMode === null) delete cleanedAttrs.displayMode;
      delete cleanedAttrs.width;
      delete cleanedAttrs.__autoSize;
      delete cleanedAttrs.isNumberColumnEnabled;
      delete cleanedAttrs.layout;
    }

    cleaned.attrs = cleanedAttrs;
  }

  // Recursively clean content array
  if (cleaned.content && Array.isArray(cleaned.content)) {
    cleaned.content = cleaned.content.map(child => cleanAdfForRenderer(child));
  }

  return cleaned;
};

/**
 * Clean up empty or invalid nodes
 *
 * Removes empty text nodes and nodes with no content after toggle filtering.
 * Preserves certain node types that should remain even when empty (hardBreak, etc.).
 *
 * @param {Object} adfNode - ADF node to clean up
 * @returns {Object|null} Cleaned node or null if should be removed
 */
export const cleanupEmptyNodes = (adfNode) => {
  if (!adfNode) return null;

  // If it's a text node with empty text, remove it
  if (adfNode.type === 'text' && (!adfNode.text || adfNode.text.trim() === '')) {
    return null;
  }

  // Recursively process content array
  if (adfNode.content && Array.isArray(adfNode.content)) {
    const cleanedContent = adfNode.content
      .map(child => cleanupEmptyNodes(child))
      .filter(child => child !== null);  // Remove null nodes

    // If this node has no content left after cleanup, remove it
    // Exception: Keep certain nodes even if empty (like hardBreak, etc)
    const keepEvenIfEmpty = ['hardBreak', 'rule', 'emoji', 'mention', 'date'];
    if (cleanedContent.length === 0 && !keepEvenIfEmpty.includes(adfNode.type)) {
      return null;
    }

    return {
      ...adfNode,
      content: cleanedContent
    };
  }

  return adfNode;
};

/**
 * Split text nodes that contain toggle markers into separate nodes
 * This preprocessing step makes toggle filtering much simpler and more reliable.
 *
 * Example:
 *   Input:  {type: 'text', text: 'before {{toggle:foo}}inside'}
 *   Output: [
 *     {type: 'text', text: 'before '},
 *     {type: 'text', text: '{{toggle:foo}}'},
 *     {type: 'text', text: 'inside'}
 *   ]
 *
 * @param {Object} textNode - Text node that may contain toggle markers
 * @returns {Array} Array of text nodes (original node if no markers found)
 */
function splitTextNodeByToggleMarkers(textNode) {
  if (textNode.type !== 'text' || !textNode.text) {
    return [textNode];
  }

  // Check if this text contains toggle markers (don't use test() as it modifies regex state)
  const hasToggleMarkers = /\{\{toggle:[^}]+\}\}|\{\{\/toggle:[^}]+\}\}/.test(textNode.text);

  if (!hasToggleMarkers) {
    // No toggle markers, return original node
    return [textNode];
  }

  // Split by markers, preserving the markers themselves
  // IMPORTANT: Create fresh regex for split (can't reuse after test())
  const toggleMarkerRegex = /(\{\{toggle:[^}]+\}\}|\{\{\/toggle:[^}]+\}\})/g;
  const parts = textNode.text.split(toggleMarkerRegex).filter(part => part !== '');

  // Create separate text nodes for each part, preserving marks
  return parts.map(part => ({
    type: 'text',
    text: part,
    ...(textNode.marks && textNode.marks.length > 0 ? { marks: [...textNode.marks] } : {})
  }));
}

/**
 * Filter content based on toggle states
 *
 * Two-phase approach:
 * 1. Split text nodes so toggle markers are isolated in their own nodes
 * 2. Track toggle state as we traverse, removing content in disabled toggles
 *
 * This is much more reliable than trying to handle partial overlaps.
 *
 * Toggle syntax: {{toggle:name}}content{{/toggle:name}}
 *
 * @param {Object} adfNode - ADF node to filter
 * @param {Object} toggleStates - Map of toggle names to boolean states
 * @returns {Object|null} Filtered ADF node
 */
export const filterContentByToggles = (adfNode, toggleStates) => {
  if (!adfNode) return null;

  // For container nodes (paragraph, doc, etc.), process children
  if (adfNode.content && Array.isArray(adfNode.content)) {
    // Phase 1: Split text nodes so toggle markers are in separate nodes
    const expandedContent = [];

    for (const child of adfNode.content) {
      if (child.type === 'text') {
        // Split this text node by toggle markers
        const splitNodes = splitTextNodeByToggleMarkers(child);
        expandedContent.push(...splitNodes);
      } else if (child.content && Array.isArray(child.content)) {
        // Recursively process container nodes first
        const processed = filterContentByToggles(child, toggleStates);
        if (processed) {
          expandedContent.push(processed);
        }
      } else {
        // Keep other nodes as-is
        expandedContent.push(child);
      }
    }

    // Phase 2: Walk through nodes tracking toggle state, filter disabled content
    const filteredContent = [];
    const toggleStack = []; // Stack of {name, enabled} for nested toggles

    for (const node of expandedContent) {
      // Check if this is a toggle marker
      if (node.type === 'text' && node.text) {
        const openMatch = node.text.match(/^\{\{toggle:([^}]+)\}\}$/);
        const closeMatch = node.text.match(/^\{\{\/toggle:([^}]+)\}\}$/);

        if (openMatch) {
          // Opening toggle marker
          const toggleName = openMatch[1].trim();
          const isEnabled = toggleStates?.[toggleName] === true;
          toggleStack.push({ name: toggleName, enabled: isEnabled });
          // Don't add marker node to output
          continue;
        } else if (closeMatch) {
          // Closing toggle marker
          toggleStack.pop();
          // Don't add marker node to output
          continue;
        }
      }

      // Check if we're currently inside any disabled toggle
      const inDisabledToggle = toggleStack.some(t => !t.enabled);

      if (!inDisabledToggle) {
        // Keep this node (not in disabled toggle)
        filteredContent.push(node);
      }
      // else: skip this node (inside disabled toggle)
    }

    if (filteredContent.length === 0 && adfNode.type !== 'doc') {
      return null;
    }

    return {
      ...adfNode,
      content: filteredContent
    };
  }

  return adfNode;
};

/**
 * Strip toggle markers from text nodes
 *
 * Removes {{toggle:name}} and {{/toggle:name}} markers from rendered content.
 * This is applied AFTER filterContentByToggles to ensure markers are never visible.
 *
 * @param {Object} adfNode - ADF node to process
 * @returns {Object} ADF node with markers removed
 */
export const stripToggleMarkers = (adfNode) => {
  if (!adfNode) return adfNode;

  // If it's a text node, strip markers
  if (adfNode.type === 'text' && adfNode.text) {
    let text = adfNode.text;
    // Remove opening toggle markers
    text = text.replace(/\{\{toggle:[^}]+\}\}/g, '');
    // Remove closing toggle markers
    text = text.replace(/\{\{\/toggle:[^}]+\}\}/g, '');
    return { ...adfNode, text };
  }

  // Recursively process content array
  if (adfNode.content && Array.isArray(adfNode.content)) {
    return {
      ...adfNode,
      content: adfNode.content.map(child => stripToggleMarkers(child))
    };
  }

  return adfNode;
};

/**
 * Perform variable substitution in ADF content
 *
 * Replaces {{variableName}} placeholders with actual values.
 * Unset variables (empty values) are wrapped in code marks for visual distinction.
 *
 * @param {Object} adfNode - ADF node to process
 * @param {Object} variableValues - Map of variable names to values
 * @returns {Object} ADF node with variables substituted
 */
export const substituteVariablesInAdf = (adfNode, variableValues) => {
  if (!adfNode) return adfNode;

  // If it's a text node, perform substitution
  if (adfNode.type === 'text' && adfNode.text) {
    let text = adfNode.text;
    const regex = /\{\{([^}]+)\}\}/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      // Add text before the variable
      if (match.index > lastIndex) {
        const part = {
          type: 'text',
          text: text.substring(lastIndex, match.index)
        };
        // Preserve original marks
        if (adfNode.marks && adfNode.marks.length > 0) {
          part.marks = [...adfNode.marks];
        }
        parts.push(part);
      }

      const varName = match[1].trim();
      const value = variableValues?.[varName];

      if (value) {
        // Variable has a value - substitute it
        const part = {
          type: 'text',
          text: value
        };
        // Preserve original marks
        if (adfNode.marks && adfNode.marks.length > 0) {
          part.marks = [...adfNode.marks];
        }
        parts.push(part);
      } else {
        // Variable is unset - keep as code/monospace, merged with original marks
        // CRITICAL: Check if code mark already exists to avoid duplicates
        // If text is already in a code block, preserve existing marks; otherwise add code mark
        const hasCodeMark = adfNode.marks && adfNode.marks.some(mark => mark.type === 'code');
        const part = {
          type: 'text',
          text: match[0]
        };
        if (hasCodeMark) {
          // Already in code block - preserve existing marks without adding duplicate
          part.marks = [...adfNode.marks];
        } else {
          // Not in code block - add code mark, merging with any existing marks
          part.marks = adfNode.marks && adfNode.marks.length > 0
            ? [...adfNode.marks, { type: 'code' }]
            : [{ type: 'code' }];
        }
        parts.push(part);
      }

      lastIndex = regex.lastIndex;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      const part = {
        type: 'text',
        text: text.substring(lastIndex)
      };
      // Preserve original marks
      if (adfNode.marks && adfNode.marks.length > 0) {
        part.marks = [...adfNode.marks];
      }
      parts.push(part);
    }

    // If we found variables, return a content array, otherwise return the original node
    if (parts.length === 0) {
      return adfNode;
    } else if (parts.length === 1 && !parts[0].marks) {
      return { ...adfNode, text: parts[0].text };
    } else {
      // Need to return multiple text nodes - caller must handle this
      return { ...adfNode, _parts: parts };
    }
  }

  // Recursively process content array
  if (adfNode.content && Array.isArray(adfNode.content)) {
    const newContent = [];
    adfNode.content.forEach(child => {
      const processed = substituteVariablesInAdf(child, variableValues);
      if (processed._parts) {
        // Expand parts into multiple text nodes
        newContent.push(...processed._parts);
        delete processed._parts;
      } else {
        newContent.push(processed);
      }
    });
    return {
      ...adfNode,
      content: newContent
    };
  }

  return adfNode;
};

/**
 * Insert custom paragraphs into ADF content
 *
 * Inserts custom paragraph nodes at specified positions in the content.
 * Recursively traverses nested structures (panels, tables, etc.) to match
 * how extractParagraphsFromAdf counts paragraphs.
 *
 * @param {Object} adfNode - ADF node to process
 * @param {Array} customInsertions - Array of {position: number, text: string}
 * @returns {Object} ADF node with custom paragraphs inserted
 */
export const insertCustomParagraphsInAdf = (adfNode, customInsertions) => {
  if (!adfNode || !adfNode.content || !customInsertions || customInsertions.length === 0) {
    return adfNode;
  }

  // Use a shared counter object so it persists across recursive calls
  const paragraphIndex = { value: 0 };

  /**
   * Recursively process nodes and insert custom paragraphs
   * @param {Object} node - Current ADF node
   * @returns {Object} Processed node with insertions
   */
  const processNode = (node) => {
    if (!node) return node;

    // Create a copy of the node
    const processedNode = { ...node };

    // If this node has content array, process it and insert custom paragraphs
    if (processedNode.content && Array.isArray(processedNode.content)) {
      const newContent = [];

      processedNode.content.forEach(childNode => {
        // Process the child node recursively first (depth-first traversal)
        // This matches how extractParagraphsFromAdf counts paragraphs
        const processedChild = processNode(childNode);
        newContent.push(processedChild);

        // CRITICAL: Check if the processed child is a paragraph AFTER processing it
        // This ensures we're checking at the correct nesting level
        // For example, if a paragraph is inside a tableCell, we check here (at the tableCell level)
        // and insert into the tableCell's content array, not the tableRow's content array
        if (processedChild.type === 'paragraph') {
          // Find all insertions for this position
          const insertionsHere = customInsertions.filter(ins => ins.position === paragraphIndex.value);

          insertionsHere.forEach(insertion => {
            // Create a new paragraph node with the custom text
            // Insert it into the parent's content array (which is the correct nesting level)
            newContent.push({
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: insertion.text
                }
              ]
            });
          });

          paragraphIndex.value++;
        }
      });

      processedNode.content = newContent;
    }

    return processedNode;
  };

  return processNode(adfNode);
};

/**
 * Insert internal note markers inline in ADF content
 *
 * Uses footnote-style numbering with content collected at the bottom.
 * Recursively traverses nested structures (panels, tables, etc.) to match
 * how extractParagraphsFromAdf counts paragraphs.
 *
 * All internal note elements use distinctive gray color (#2B2C2E) for:
 * 1. CSS styling in Confluence (distinctive appearance)
 * 2. External filtering (hide from external users)
 *
 * @param {Object} adfNode - ADF node to process
 * @param {Array} internalNotes - Array of {position: number, content: string}
 * @returns {Object} ADF node with internal notes inserted
 */
export const insertInternalNotesInAdf = (adfNode, internalNotes) => {
  if (!adfNode || !adfNode.content || !internalNotes || internalNotes.length === 0) {
    return adfNode;
  }

  // Sort notes by position to assign sequential footnote numbers
  const sortedNotes = [...internalNotes].sort((a, b) => a.position - b.position);

  // Create a map of position -> footnote number
  const positionToNumber = {};
  sortedNotes.forEach((note, index) => {
    positionToNumber[note.position] = index + 1;
  });

  // Unicode superscript numbers
  const superscriptNumbers = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
  const toSuperscript = (num) => {
    return num.toString().split('').map(digit => superscriptNumbers[parseInt(digit)]).join('');
  };

  // Use a shared counter object so it persists across recursive calls
  const paragraphIndex = { value: 0 };

  /**
   * Recursively process nodes and add inline note markers to paragraphs
   * @param {Object} node - Current ADF node
   * @returns {Object} Processed node with markers
   */
  const processNode = (node) => {
    if (!node) return node;

    // Create a copy of the node
    const processedNode = { ...node };

    // First, recursively process children (if any)
    // This ensures all nested content is processed before we add markers
    if (node.content && Array.isArray(node.content)) {
      processedNode.content = node.content.map(childNode => processNode(childNode));
    }

    // If this is a paragraph, check if we need to add a note marker
    // We do this AFTER processing children so the marker is added to already-processed content
    if (node.type === 'paragraph') {
      const noteNumber = positionToNumber[paragraphIndex.value];

      if (noteNumber) {
        // Add the paragraph with an inline footnote marker at the end
        // Use processedNode.content (already processed children) instead of node.content
        const paragraphContent = [...(processedNode.content || [])];

        // Add inline marker with distinctive color for internal notes
        paragraphContent.push({
          type: 'text',
          text: toSuperscript(noteNumber),
          marks: [
            {
              type: 'textColor',
              attrs: {
                color: '#505258' // dark gray marks internal note references
              }
            },
            {
              type: 'strong'
            }
          ]
        });

        processedNode.content = paragraphContent;
      }

      paragraphIndex.value++;
    }

    return processedNode;
  };

  // Process the entire tree recursively
  const processedAdf = processNode(adfNode);
  const newContent = [...processedAdf.content];

  // Add footnotes section at the bottom wrapped in an expand node
  if (sortedNotes.length > 0) {
    // Wrap entire footnotes section in an expandable/collapsible section
    // External filtering app will hide all expand nodes
    const footnotesContent = [];

    // Add "Internal Notes" heading with lock icon
    footnotesContent.push({
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: '🔏 Internal Notes',
          marks: [
            {
              type: 'strong'
            },
            {
              type: 'em'
            }
          ]
        }
      ]
    });

    // Add each footnote with its number
    sortedNotes.forEach((note, index) => {
      const footnoteNumber = index + 1;
      footnotesContent.push({
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: `${toSuperscript(footnoteNumber)} `,
            marks: [
              {
                type: 'strong'
              }
            ]
          },
          {
            type: 'text',
            text: note.content,
            marks: [
              {
                type: 'em'
              }
            ]
          }
        ]
      });
    });

    // Use an expand (collapsible section) for internal notes
    // This gives us a cleaner appearance without forced panel icons
    // External filtering app should hide expand nodes with title '🔏 Internal Notes'
    newContent.push({
      type: 'expand',
      attrs: {
        title: '🔏 Internal Notes'
      },
      content: footnotesContent.slice(1) // Skip the heading since expand already has a title
    });
  }

  return {
    ...adfNode,
    content: newContent
  };
};

/**
 * Extract paragraphs from ADF content
 *
 * Returns array of paragraph metadata for UI display and position selection.
 *
 * @param {Object} adfNode - ADF node to process
 * @returns {Array} Array of {index, lastSentence, fullText}
 */
export const extractParagraphsFromAdf = (adfNode) => {
  const paragraphs = [];

  if (!adfNode || !adfNode.content) return paragraphs;

  const traverseContent = (node, paragraphIndex = { value: 0 }) => {
    if (!node) return;

    // If this is a paragraph node, extract text
    if (node.type === 'paragraph') {
      let fullText = '';

      // Recursively extract text from paragraph content
      const extractText = (contentNode) => {
        if (!contentNode) return '';

        if (contentNode.type === 'text') {
          return contentNode.text || '';
        }

        if (contentNode.content && Array.isArray(contentNode.content)) {
          return contentNode.content.map(child => extractText(child)).join('');
        }

        return '';
      };

      if (node.content && Array.isArray(node.content)) {
        fullText = node.content.map(child => extractText(child)).join('');
      }

      // Extract last sentence (rough heuristic: split by period/question/exclamation)
      const sentences = fullText.split(/[.!?]+/).filter(s => s.trim());
      const lastSentence = sentences.length > 0 ? sentences[sentences.length - 1].trim() : fullText.trim();

      if (fullText.trim()) {
        paragraphs.push({
          index: paragraphIndex.value,
          lastSentence: lastSentence.substring(0, 60) + (lastSentence.length > 60 ? '...' : ''),
          fullText: fullText
        });
        paragraphIndex.value++;
      }
    }

    // Recursively traverse content
    if (node.content && Array.isArray(node.content)) {
      node.content.forEach(child => traverseContent(child, paragraphIndex));
    }
  };

  traverseContent(adfNode);
  return paragraphs;
};

/**
 * Render ADF content with ALL toggles visible (ghost mode)
 *
 * Unlike filterContentByToggles which removes disabled content entirely,
 * this function keeps ALL content but marks disabled toggle blocks with metadata
 * so they can be styled differently (gray text, etc.)
 *
 * Used for diff view where users need to see changes in disabled toggles.
 *
 * @param {Object} adfContent - ADF content to render
 * @param {Object} variableValues - Variable values for substitution
 * @param {Object} toggleStates - Toggle states (enabled/disabled)
 * @returns {Object} Rendered ADF with all content visible, disabled toggles marked
 */
export function renderContentWithGhostToggles(adfContent, variableValues, toggleStates) {
  if (!adfContent) return adfContent;

  // Step 1: Apply variable substitutions
  let rendered = substituteVariablesInAdf(adfContent, variableValues);

  // Step 2: Mark disabled toggle blocks (DON'T remove them)
  rendered = markDisabledToggleBlocks(rendered, toggleStates);

  return rendered;
}

/**
 * Mark disabled toggle blocks with metadata
 *
 * Walks ADF tree and adds 'data-disabled-toggle' attribute to expand nodes
 * that represent disabled toggles. This allows visual styling without removing content.
 *
 * @param {Object} adfContent - ADF content to process
 * @param {Object} toggleStates - Toggle states (enabled/disabled)
 * @returns {Object} ADF with disabled toggle blocks marked
 */
function markDisabledToggleBlocks(adfContent, toggleStates) {
  function processNode(node) {
    if (!node) return node;

    const processedNode = { ...node };

    // Check if this is a toggle block (expand node with {{toggle:name}} title)
    if (node.type === 'expand' && node.attrs?.title?.includes('{{toggle:')) {
      const toggleMatch = node.attrs.title.match(/\{\{toggle:([^}]+)\}\}/);
      const toggleName = toggleMatch ? toggleMatch[1] : null;

      if (toggleName) {
        const isDisabled = !toggleStates[toggleName];

        if (isDisabled) {
          // Add metadata to mark this as a disabled toggle
          processedNode.attrs = {
            ...processedNode.attrs,
            'data-disabled-toggle': true,
            'data-toggle-name': toggleName
          };
        }
      }
    }

    // Recursively process children
    if (processedNode.content && Array.isArray(processedNode.content)) {
      processedNode.content = processedNode.content.map(processNode);
    }

    return processedNode;
  }

  return processNode(adfContent);
}

/**
 * Extract plain text from ADF with visual toggle markers
 *
 * Converts ADF to plain text but adds visual markers (🔲/✓) to show
 * which toggle blocks are enabled vs disabled. Used for text-based diff view.
 *
 * Output example:
 * ```
 * Regular paragraph text here.
 *
 * ✓ [ENABLED TOGGLE: premium-features]
 * Content inside enabled toggle.
 * ✓ [END ENABLED TOGGLE]
 *
 * 🔲 [DISABLED TOGGLE: enterprise-options]
 * Content inside disabled toggle (shown in gray in UI).
 * 🔲 [END DISABLED TOGGLE]
 * ```
 *
 * @param {Object} adfContent - ADF content to convert
 * @param {Object} toggleStates - Toggle states (enabled/disabled)
 * @returns {string} Plain text with toggle markers
 */
export function extractTextWithToggleMarkers(adfContent, toggleStates) {
  let text = '';

  function processNode(node) {
    if (!node) return;

    // Extract text from paragraphs
    if (node.type === 'paragraph') {
      const paragraphText = node.content
        ?.map(c => {
          if (c.type === 'text') return c.text || '';
          if (c.type === 'hardBreak') return '\n';
          return '';
        })
        .join('');
      if (paragraphText.trim()) {
        text += paragraphText + '\n';
      }
    }

    // Handle headings
    if (node.type === 'heading') {
      const headingText = node.content
        ?.map(c => c.text || '')
        .join('');
      if (headingText.trim()) {
        text += '\n' + '#'.repeat(node.attrs?.level || 1) + ' ' + headingText + '\n\n';
      }
    }

    // Handle toggle blocks (expand nodes)
    if (node.type === 'expand') {
      const toggleMatch = node.attrs?.title?.match(/\{\{toggle:([^}]+)\}\}/);
      const toggleName = toggleMatch ? toggleMatch[1] : node.attrs?.title || 'unknown';
      const isDisabled = node.attrs?.['data-disabled-toggle'] || !toggleStates[toggleName];

      // Add visual marker for toggle
      if (isDisabled) {
        text += `\n🔲 [DISABLED TOGGLE: ${toggleName}]\n`;
      } else {
        text += `\n✓ [ENABLED TOGGLE: ${toggleName}]\n`;
      }

      // Process content inside toggle
      if (node.content && Array.isArray(node.content)) {
        node.content.forEach(processNode);
      }

      // Close marker
      if (isDisabled) {
        text += `🔲 [END DISABLED TOGGLE]\n\n`;
      } else {
        text += `✓ [END ENABLED TOGGLE]\n\n`;
      }

      return; // Don't process children again
    }

    // Handle panels
    if (node.type === 'panel') {
      text += '\n[PANEL]\n';
      if (node.content && Array.isArray(node.content)) {
        node.content.forEach(processNode);
      }
      text += '[END PANEL]\n\n';
      return;
    }

    // Handle lists
    if (node.type === 'bulletList' || node.type === 'orderedList') {
      text += '\n';
      if (node.content && Array.isArray(node.content)) {
        node.content.forEach((listItem, idx) => {
          const bullet = node.type === 'bulletList' ? '•' : `${idx + 1}.`;
          text += `${bullet} `;
          processNode(listItem);
        });
      }
      text += '\n';
      return;
    }

    if (node.type === 'listItem') {
      if (node.content && Array.isArray(node.content)) {
        node.content.forEach(processNode);
      }
      return;
    }

    // Recursively process children for other node types
    if (node.content && Array.isArray(node.content)) {
      node.content.forEach(processNode);
    }
  }

  processNode(adfContent);
  return text.trim();
}
