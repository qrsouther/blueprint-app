/**
 * Content Detection Utility Functions
 *
 * This module provides utilities for detecting variables and toggles
 * within excerpt content using regex pattern matching.
 * 
 * Also includes smart case matching detection for variable occurrences,
 * which pre-computes whether each variable instance appears at the start
 * of a sentence (for automatic capitalization during substitution).
 * 
 * Uses wink-nlp for accurate sentence boundary detection, handling
 * abbreviations like "Dr.", "U.S.", "Inc." correctly (~98% accuracy).
 */

import { extractTextFromAdf } from './adf-utils.js';

// Initialize wink-nlp for sentence boundary detection
// This provides ~98% accuracy vs ~85% for regex-based detection
let nlp = null;
let nlpInitialized = false;

/**
 * Lazily initialize wink-nlp (only when needed)
 * This avoids the cold start penalty when NLP isn't used
 */
function getNlp() {
  if (!nlpInitialized) {
    try {
      // Dynamic require to support both Node and bundled environments
      const winkNLP = require('wink-nlp');
      const model = require('wink-eng-lite-web-model');
      nlp = winkNLP(model);
      nlpInitialized = true;
    } catch (e) {
      // Fallback: if wink-nlp isn't available, we'll use regex
      console.warn('wink-nlp not available, falling back to regex-based sentence detection');
      nlpInitialized = true;
      nlp = null;
    }
  }
  return nlp;
}

/**
 * Get sentence boundaries from text using wink-nlp
 * Returns an array of sentence start positions
 * 
 * @param {string} text - The text to analyze
 * @returns {number[]} Array of character indices where sentences start
 */
function getSentenceBoundaries(text) {
  const nlpInstance = getNlp();
  
  if (!nlpInstance || !text) {
    return [0]; // Fallback: just the start of text
  }
  
  try {
    const doc = nlpInstance.readDoc(text);
    const sentences = doc.sentences();
    const boundaries = [];
    
    // Track position in original text
    let searchStart = 0;
    
    sentences.each((sentence) => {
      const sentenceText = sentence.out();
      // Find where this sentence starts in the original text
      const sentenceStart = text.indexOf(sentenceText, searchStart);
      if (sentenceStart !== -1) {
        boundaries.push(sentenceStart);
        searchStart = sentenceStart + sentenceText.length;
      }
    });
    
    // Always include 0 if not already present (start of text is a sentence start)
    if (boundaries.length === 0 || boundaries[0] !== 0) {
      boundaries.unshift(0);
    }
    
    return boundaries;
  } catch (e) {
    console.warn('wink-nlp sentence detection failed:', e.message);
    return [0];
  }
}

/**
 * Known words that should always be capitalized but may not be detected
 * by NLP due to ambiguity (e.g., "march" can be a verb, "may" is a modal)
 */
const ALWAYS_CAPITALIZE_WORDS = new Set([
  // Months that are ambiguous
  'march', 'may',
  // Add other known proper nouns that NLP might miss here
]);

/**
 * Check if a value should be capitalized as a proper noun using NLP
 * 
 * Uses wink-nlp to detect if the value is a proper noun (month, day, 
 * location, person name, organization, etc.) that should be capitalized
 * regardless of its position in the sentence.
 * 
 * Also includes a fallback list for ambiguous words that NLP might
 * not recognize (like "march" and "may" which can be verbs).
 * 
 * @param {string} value - The variable value to check
 * @returns {boolean} True if value should be capitalized as proper noun
 */
export function shouldCapitalizeAsProperNoun(value) {
  if (!value || typeof value !== 'string' || value.length === 0) {
    return false;
  }
  
  // Check fallback list first (handles ambiguous words like "march", "may")
  if (ALWAYS_CAPITALIZE_WORDS.has(value.toLowerCase())) {
    return true;
  }
  
  const nlpInstance = getNlp();
  if (!nlpInstance) {
    return false; // Can't determine without NLP
  }
  
  try {
    // Capitalize the first letter to help NLP recognize it
    // (e.g., "january" → "January" for better recognition)
    const capitalizedValue = value.charAt(0).toUpperCase() + value.slice(1);
    
    // Analyze with wink-nlp
    const doc = nlpInstance.readDoc(capitalizedValue);
    
    // Check for named entities (DATE, GPE, ORG, PERSON, etc.)
    const entities = doc.entities().out();
    if (entities && entities.length > 0) {
      // If the value is recognized as a named entity, it should be capitalized
      return true;
    }
    
    // For now, rely primarily on entity detection which is more reliable
    // for known proper nouns like months, days, etc.
    // POS tagging alone isn't reliable since wink-nlp tags all capitalized
    // words as PROPN even when they're common nouns.
    return false;
  } catch (e) {
    console.warn('Proper noun detection failed:', e.message);
    return false;
  }
}

/**
 * Check if text position is at the start of a sentence (regex fallback)
 * 
 * This is the fallback implementation used when wink-nlp is unavailable.
 * For better accuracy with abbreviations, use isAtSentenceStartNlp().
 * 
 * A position is considered "sentence start" if:
 * - The preceding text is empty (start of paragraph)
 * - The preceding text ends with sentence-ending punctuation (. ! ?)
 *   optionally followed by closing quotes
 * 
 * @param {string} precedingText - Text that comes before the variable
 * @returns {boolean} True if this is a sentence-start position
 */
export function isAtSentenceStartRegex(precedingText) {
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
 * Check if a position in text is at the start of a sentence using wink-nlp
 * 
 * Uses NLP-based sentence boundary detection for ~98% accuracy,
 * correctly handling abbreviations like "Dr.", "U.S.", "Inc.", etc.
 * 
 * @param {string} fullText - The complete paragraph text
 * @param {number} position - Character position to check
 * @returns {boolean} True if this position is at a sentence start
 */
export function isAtSentenceStartNlp(fullText, position) {
  // Empty or start of text = sentence start
  if (!fullText || position === 0) {
    return true;
  }
  
  const boundaries = getSentenceBoundaries(fullText);
  
  // Check if position matches a sentence boundary (with some tolerance for whitespace)
  for (const boundary of boundaries) {
    // Allow for whitespace between boundary and variable
    const textBetween = fullText.substring(boundary, position);
    if (textBetween.trim() === '') {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if text position is at the start of a sentence
 * 
 * Primary API - uses wink-nlp when available, falls back to regex.
 * 
 * @param {string} precedingText - Text that comes before the variable
 * @param {string} [fullText] - Optional full text for NLP analysis
 * @param {number} [position] - Optional position in full text
 * @returns {boolean} True if this is a sentence-start position
 */
export function isAtSentenceStart(precedingText, fullText = null, position = null) {
  // If we have full text and position, try NLP first
  if (fullText !== null && position !== null && getNlp()) {
    return isAtSentenceStartNlp(fullText, position);
  }
  
  // Fall back to regex-based detection
  return isAtSentenceStartRegex(precedingText);
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
  
  // Check if first character is lowercase and has a case
  const isLowercase = firstChar === firstChar.toLowerCase() && 
                      firstChar !== firstChar.toUpperCase();
  
  if (!isLowercase) {
    // Already capitalized or not a letter - return as-is
    return value;
  }
  
  // Upgrade case if:
  // 1. We're at a sentence start position, OR
  // 2. The value is a proper noun (month, day, location, name, etc.)
  if (shouldUpgrade || shouldCapitalizeAsProperNoun(value)) {
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
   * Uses wink-nlp for accurate sentence boundary detection
   */
  function processParagraph(paragraphNode) {
    const fullText = extractParagraphText(paragraphNode);
    
    // Get sentence boundaries using wink-nlp
    const boundaries = getSentenceBoundaries(fullText);
    
    let match;
    while ((match = variableRegex.exec(fullText)) !== null) {
      const varName = match[1].trim();
      
      // Skip toggle markers
      if (varName.startsWith('toggle:') || varName.startsWith('/toggle:')) {
        continue;
      }
      
      const position = match.index;
      
      // Use NLP-based detection with full context
      const sentenceStart = isAtSentenceStart(
        fullText.substring(0, position), // precedingText for fallback
        fullText,                          // full text for NLP
        position                           // position for NLP
      );
      
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
