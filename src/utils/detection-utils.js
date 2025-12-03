/**
 * Content Detection Utility Functions
 *
 * This module provides utilities for detecting variables and toggles
 * within excerpt content using regex pattern matching.
 * 
 * Also includes smart case matching detection for variable occurrences,
 * which pre-computes whether each variable instance appears at the start
 * of a sentence (for automatic capitalization during substitution).
 */

import { extractTextFromAdf } from './adf-utils.js';

/**
 * Check if text position is at the start of a sentence
 * 
 * A position is considered "sentence start" if:
 * - The preceding text is empty (start of paragraph)
 * - The preceding text ends with sentence-ending punctuation (. ! ?)
 *   optionally followed by closing quotes
 * 
 * @param {string} precedingText - Text that comes before the variable
 * @returns {boolean} True if this is a sentence-start position
 */
export function isAtSentenceStart(precedingText) {
  const trimmed = precedingText.trimEnd();
  
  // Empty = start of paragraph = sentence start
  if (trimmed === '') {
    return true;
  }
  
  // Check for sentence-ending punctuation, optionally followed by quotes
  // Matches: "Hello." or "Hello!" or "Hello?" or 'He said, "Hello."'
  return /[.!?]["'""'']?\s*$/.test(precedingText);
}

/**
 * Apply case upgrade to a value if needed
 * 
 * Only upgrades lowercase first character to uppercase at sentence starts.
 * Never downgrades - if value already starts with uppercase, it's unchanged.
 * 
 * @param {string} value - The variable value to potentially upgrade
 * @param {boolean} shouldUpgrade - Whether this is a sentence-start position
 * @returns {string} The value, possibly with first character uppercased
 */
export function maybeUpgradeCase(value, shouldUpgrade) {
  if (!value || typeof value !== 'string' || value.length === 0) {
    return value;
  }
  
  const firstChar = value.charAt(0);
  
  // Only upgrade if:
  // 1. We're at a sentence start position
  // 2. First character is lowercase
  // 3. First character has a case (not a number or symbol)
  if (shouldUpgrade && 
      firstChar === firstChar.toLowerCase() && 
      firstChar !== firstChar.toUpperCase()) {
    return firstChar.toUpperCase() + value.slice(1);
  }
  
  return value;
}

/**
 * Detect variable occurrences with sentence-start context
 * 
 * Walks the ADF tree and finds all variable placeholders, recording
 * whether each occurrence is at the start of a sentence. This enables
 * "smart case matching" where lowercase variable values are automatically
 * capitalized when they appear at sentence starts.
 * 
 * @param {Object} adfContent - ADF document to analyze
 * @returns {Array<Object>} Array of occurrence objects:
 *   { name: string, occurrenceIndex: number, isAtSentenceStart: boolean }
 * 
 * @example
 * const adf = {
 *   type: 'doc',
 *   content: [{
 *     type: 'paragraph',
 *     content: [
 *       { type: 'text', text: 'Buy a {{Product}}. {{Product}} is great.' }
 *     ]
 *   }]
 * };
 * const occurrences = detectVariableOccurrences(adf);
 * // Returns:
 * // [
 * //   { name: 'Product', occurrenceIndex: 0, isAtSentenceStart: false },
 * //   { name: 'Product', occurrenceIndex: 1, isAtSentenceStart: true }
 * // ]
 */
export function detectVariableOccurrences(adfContent) {
  if (!adfContent || typeof adfContent !== 'object') {
    return [];
  }
  
  const occurrences = [];
  const variableCounters = {}; // Track occurrence index per variable name
  const variableRegex = /\{\{([^}]+)\}\}/g;
  
  /**
   * Extract all text from a paragraph node (flattens nested text nodes)
   * Returns the concatenated text content
   */
  function extractParagraphText(node) {
    if (!node) return '';
    
    if (node.type === 'text' && node.text) {
      return node.text;
    }
    
    if (node.content && Array.isArray(node.content)) {
      return node.content.map(child => extractParagraphText(child)).join('');
    }
    
    return '';
  }
  
  /**
   * Process a paragraph node to find variable occurrences
   * Analyzes the full paragraph text to determine sentence context
   */
  function processParagraph(paragraphNode) {
    const fullText = extractParagraphText(paragraphNode);
    
    let match;
    while ((match = variableRegex.exec(fullText)) !== null) {
      const varName = match[1].trim();
      
      // Skip toggle markers
      if (varName.startsWith('toggle:') || varName.startsWith('/toggle:')) {
        continue;
      }
      
      // Get text preceding this variable
      const precedingText = fullText.substring(0, match.index);
      
      // Determine if this is a sentence-start position
      const sentenceStart = isAtSentenceStart(precedingText);
      
      // Track occurrence index for this variable
      if (!(varName in variableCounters)) {
        variableCounters[varName] = 0;
      }
      
      occurrences.push({
        name: varName,
        occurrenceIndex: variableCounters[varName],
        isAtSentenceStart: sentenceStart
      });
      
      variableCounters[varName]++;
    }
  }
  
  /**
   * Recursively traverse ADF tree to find paragraph nodes
   * Also handles headings (always treated as sentence start)
   */
  function traverse(node, depth = 0) {
    // Safety: depth limit
    if (depth > 100) return;
    
    if (!node || typeof node !== 'object') return;
    
    // Process paragraph nodes
    if (node.type === 'paragraph') {
      processParagraph(node);
    }
    
    // Process heading nodes (variables in headings are always "sentence start")
    if (node.type === 'heading') {
      // For headings, extract text but treat all variables as sentence-start
      const fullText = extractParagraphText(node);
      let match;
      const headingRegex = /\{\{([^}]+)\}\}/g;
      
      while ((match = headingRegex.exec(fullText)) !== null) {
        const varName = match[1].trim();
        
        if (varName.startsWith('toggle:') || varName.startsWith('/toggle:')) {
          continue;
        }
        
        if (!(varName in variableCounters)) {
          variableCounters[varName] = 0;
        }
        
        occurrences.push({
          name: varName,
          occurrenceIndex: variableCounters[varName],
          isAtSentenceStart: true // Headings always get capitalization
        });
        
        variableCounters[varName]++;
      }
    }
    
    // Recurse into content
    if (node.content && Array.isArray(node.content)) {
      for (const child of node.content) {
        traverse(child, depth + 1);
      }
    }
  }
  
  traverse(adfContent);
  
  return occurrences;
}

/**
 * Merge occurrence data into existing variable definitions
 * 
 * Takes the occurrence array from detectVariableOccurrences and merges
 * the isAtSentenceStart data into the variable objects (grouped by name).
 * 
 * @param {Array} variables - Existing variable definitions [{name, required, ...}]
 * @param {Array} occurrences - Occurrence data from detectVariableOccurrences
 * @returns {Array} Variables with occurrences property added
 */
export function mergeOccurrencesIntoVariables(variables, occurrences) {
  if (!variables || !Array.isArray(variables)) {
    return variables;
  }
  
  // Group occurrences by variable name
  const occurrencesByName = {};
  for (const occ of occurrences) {
    if (!occurrencesByName[occ.name]) {
      occurrencesByName[occ.name] = [];
    }
    occurrencesByName[occ.name].push({
      index: occ.occurrenceIndex,
      isAtSentenceStart: occ.isAtSentenceStart
    });
  }
  
  // Merge into variable definitions
  return variables.map(variable => ({
    ...variable,
    occurrences: occurrencesByName[variable.name] || []
  }));
}

/**
 * Detect variables in content using {{variable}} syntax
 *
 * Searches for variable placeholders in the format {{variable-name}} and returns
 * an array of unique variables found. Excludes toggle markers ({{toggle:...}}).
 * Supports both plain text strings and ADF format objects.
 *
 * @param {string|Object} content - The content to scan (plain text or ADF object)
 * @returns {Array<Object>} Array of variable objects with name, description, and example
 *
 * @example
 * const content = "Hello {{name}}, your {{role}} is important.";
 * const vars = detectVariables(content);
 * // Returns: [
 * //   { name: 'name', description: '', example: '' },
 * //   { name: 'role', description: '', example: '' }
 * // ]
 */
export function detectVariables(content) {
  const variables = [];
  const variableRegex = /\{\{([^}]+)\}\}/g;
  let match;

  // Extract text from content (handle both string and ADF object)
  let textContent = '';
  if (typeof content === 'string') {
    textContent = content;
  } else if (content && typeof content === 'object') {
    // ADF format
    textContent = extractTextFromAdf(content);
  }

  while ((match = variableRegex.exec(textContent)) !== null) {
    const varName = match[1].trim();
    // Skip toggle markers (they start with "toggle:" or "/toggle:")
    if (varName.startsWith('toggle:') || varName.startsWith('/toggle:')) {
      continue;
    }
    if (!variables.find(v => v.name === varName)) {
      variables.push({
        name: varName,
        description: '',
        example: ''
      });
    }
  }

  return variables;
}

/**
 * Detect toggle blocks in content using {{toggle:name}} syntax
 *
 * Searches for toggle markers in the format {{toggle:name}} and returns an array
 * of unique toggles found. Toggles allow show/hide sections within excerpts.
 * Supports both plain text strings and ADF format objects.
 *
 * @param {string|Object} content - The content to scan (plain text or ADF object)
 * @returns {Array<Object>} Array of toggle objects with name and description
 *
 * @example
 * const content = "{{toggle:advanced}}Advanced content here{{/toggle:advanced}}";
 * const toggles = detectToggles(content);
 * // Returns: [
 * //   { name: 'advanced', description: '' }
 * // ]
 */
export function detectToggles(content) {
  const toggles = [];
  const toggleRegex = /\{\{toggle:([^}]+)\}\}/g;
  let match;

  // Extract text from content (handle both string and ADF object)
  let textContent = '';
  if (typeof content === 'string') {
    textContent = content;
  } else if (content && typeof content === 'object') {
    // ADF format
    textContent = extractTextFromAdf(content);
  }

  while ((match = toggleRegex.exec(textContent)) !== null) {
    const toggleName = match[1].trim();
    if (!toggles.find(t => t.name === toggleName)) {
      toggles.push({
        name: toggleName,
        description: ''
      });
    }
  }

  return toggles;
}
