/**
 * ADF (Atlassian Document Format) Utility Functions
 *
 * This module provides utilities for parsing and extracting data from
 * Confluence's ADF (Atlassian Document Format) structure.
 */

/**
 * Extract variable names from an ADF document
 *
 * Recursively traverses the ADF tree structure and finds all variable placeholders
 * in the format {{variableName}}. Returns an array of variable objects.
 *
 * @param {Object} adfDoc - The ADF document to extract variables from
 * @returns {Array<Object>} Array of variable objects with name, defaultValue, and description
 *
 * @example
 * const adfDoc = {
 *   type: 'doc',
 *   content: [
 *     { type: 'paragraph', content: [{ type: 'text', text: 'Hello {{name}}' }] }
 *   ]
 * };
 * const variables = extractVariablesFromAdf(adfDoc);
 * // Returns: [{ name: 'name', defaultValue: '', description: '' }]
 */
export function extractVariablesFromAdf(adfDoc) {
  const variables = new Set();
  const variableRegex = /\{\{([^}]+)\}\}/g;

  const extractFromNode = (node) => {
    // Check text content
    if (node.text) {
      let match;
      while ((match = variableRegex.exec(node.text)) !== null) {
        variables.add(match[1]);
      }
    }

    // Recurse into content
    if (node.content) {
      for (const child of node.content) {
        extractFromNode(child);
      }
    }
  };

  extractFromNode(adfDoc);

  return Array.from(variables).map(name => ({
    name,
    defaultValue: '',
    description: ''
  }));
}

/**
 * Extract plain text from an ADF (Atlassian Document Format) node
 *
 * Recursively traverses the ADF tree structure and concatenates all text nodes
 * into a single string. Used for content analysis, variable detection, and search.
 *
 * SAFETY: Includes depth limit and cycle detection to prevent stack overflow
 * on malformed ADF structures.
 *
 * @param {Object} adfNode - The ADF node to extract text from
 * @param {number} depth - Current recursion depth (internal use)
 * @param {Set} visited - Set of visited node references for cycle detection (internal use)
 * @returns {string} Concatenated plain text from all text nodes
 *
 * @example
 * const adfDoc = {
 *   type: 'doc',
 *   content: [
 *     { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }
 *   ]
 * };
 * const text = extractTextFromAdf(adfDoc); // Returns: "Hello"
 */
export function extractTextFromAdf(adfNode, depth = 0, visited = new Set()) {
  // Safety: Maximum depth limit to prevent stack overflow
  const MAX_DEPTH = 100;
  if (depth > MAX_DEPTH) {
    // Silently truncate - this is expected for very deep structures
    return '';
  }

  if (!adfNode || typeof adfNode !== 'object') {
    return '';
  }

  // Safety: Cycle detection - prevent infinite loops on circular references
  // Use object reference as key (works for same object instances)
  if (visited.has(adfNode)) {
    // Silently skip - this is expected for circular references
    return '';
  }
  visited.add(adfNode);

  let text = '';

  // If it's a text node, return its text
  if (adfNode.text) {
    text += adfNode.text;
  }

  // Recursively process content array
  if (adfNode.content && Array.isArray(adfNode.content)) {
    for (const child of adfNode.content) {
      text += extractTextFromAdf(child, depth + 1, visited);
    }
  }

  // Remove from visited set when backtracking (allows same node in different branches)
  visited.delete(adfNode);

  return text;
}

/**
 * Find the heading that appears directly before a macro with a specific localId
 *
 * Traverses the ADF document to find the last heading that appears before the
 * target macro. Used for creating heading anchors in usage tracking and navigation.
 *
 * SAFETY: Includes depth limit and cycle detection to prevent stack overflow
 * on malformed ADF structures.
 *
 * @param {Object} adfDoc - The complete ADF document structure
 * @param {string} targetLocalId - The localId of the macro to find
 * @returns {string|null} The text of the heading before the macro, or null if not found
 *
 * @example
 * const heading = findHeadingBeforeMacro(adfDoc, 'macro-123');
 * // Returns: "Section Title" or null
 */
export function findHeadingBeforeMacro(adfDoc, targetLocalId) {
  if (!adfDoc || !adfDoc.content) return null;

  let lastHeading = null;

  // Safety: Maximum depth limit to prevent stack overflow
  const MAX_DEPTH = 100;
  const visited = new Set(); // Cycle detection

  // Recursively traverse the ADF structure
  function traverse(nodes, depth = 0) {
    // Safety: Check depth limit
    if (depth > MAX_DEPTH) {
      // Silently truncate - this is expected for very deep structures
      return null;
    }

    for (const node of nodes) {
      // Safety: Cycle detection
      if (visited.has(node)) {
        // Silently skip - this is expected for circular references
        continue;
      }
      visited.add(node);

      // Track the most recent heading
      if (node.type === 'heading' && node.content) {
        lastHeading = extractTextFromAdf(node);
      }

      // Check if this is the target macro (extension or bodiedExtension)
      if ((node.type === 'extension' || node.type === 'bodiedExtension') &&
          node.attrs?.localId === targetLocalId) {
        visited.delete(node); // Clean up before returning
        return lastHeading;
      }

      // Recursively check children
      if (node.content && Array.isArray(node.content)) {
        const result = traverse(node.content, depth + 1);
        if (result !== null && result !== undefined) {
          visited.delete(node); // Clean up before returning
          return result;
        }
      }

      // Remove from visited when backtracking (allows same node in different branches)
      visited.delete(node);
    }
    return null;
  }

  return traverse(adfDoc.content);
}
