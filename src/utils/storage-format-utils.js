/**
 * Storage Format Utilities
 *
 * Helpers for converting ADF content to Confluence storage format
 * and building chapter structures for native content injection.
 *
 * Used by the injection resolver to publish Blueprint chapters
 * directly into Confluence page storage.
 *
 * @module storage-format-utils
 */

import api, { route } from '@forge/api';
import { logPhase, logSuccess, logFailure } from './forge-logger.js';

/**
 * Convert ADF document to Confluence storage format via REST API
 *
 * Uses Confluence's built-in converter to transform ADF (Atlassian Document Format)
 * into XHTML storage format that can be written to page body.
 *
 * @param {Object} adfContent - ADF document object (must have type: 'doc')
 * @returns {Promise<string|null>} Storage format HTML or null on error
 */
export async function convertAdfToStorage(adfContent) {
  logPhase('convertAdfToStorage', 'Converting ADF to storage format', {});

  try {
    // Validate input
    if (!adfContent || typeof adfContent !== 'object') {
      logFailure('convertAdfToStorage', 'Invalid ADF content', new Error('Content is not an object'));
      return null;
    }

    if (adfContent.type !== 'doc') {
      logFailure('convertAdfToStorage', 'Invalid ADF type', new Error(`Expected type "doc", got "${adfContent.type}"`));
      return null;
    }

    const response = await api.asApp().requestConfluence(
      route`/wiki/rest/api/contentbody/convert/storage`,
      {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          value: JSON.stringify(adfContent),
          representation: 'atlas_doc_format'
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      logFailure('convertAdfToStorage', 'API conversion failed', new Error(errorText), {
        status: response.status
      });
      return null;
    }

    const result = await response.json();
    logSuccess('convertAdfToStorage', 'Conversion successful', {
      contentLength: result.value?.length || 0
    });

    return result.value;
  } catch (error) {
    logFailure('convertAdfToStorage', 'Unexpected error', error);
    return null;
  }
}

/**
 * Escape HTML special characters to prevent XSS and parsing issues
 *
 * @param {string} text - Raw text to escape
 * @returns {string} Escaped HTML-safe text
 */
export function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Strip leading heading tags from storage format HTML
 *
 * Removes any h1-h6 heading element that appears at the start of the content.
 * Used to prevent duplicate headings when we inject our own heading above the Section macro.
 *
 * @param {string} storageHtml - Storage format HTML content
 * @returns {string} HTML with leading heading removed
 */
export function stripLeadingHeading(storageHtml) {
  if (!storageHtml || typeof storageHtml !== 'string') {
    return storageHtml || '';
  }

  // Match any heading tag (h1-h6) at the start, with optional whitespace/newlines before it
  // Also match the closing tag and any whitespace/newlines after it
  // Pattern: optional whitespace, <h[1-6][^>]*>content</h[1-6]>, optional whitespace
  const headingPattern = /^\s*<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>\s*/i;
  
  const cleaned = storageHtml.replace(headingPattern, '');
  
  return cleaned;
}

/**
 * Build a hidden Content Properties (details) macro as a chapter boundary marker
 *
 * Uses Confluence's official Content Properties macro with hidden=true parameter.
 * This is the only reliable way to persist invisible boundary markers in Confluence
 * storage format, as HTML comments and hidden HTML attributes are stripped.
 *
 * Per Confluence docs: https://support.atlassian.com/confluence-cloud/docs/insert-the-page-properties-macro/
 * - The `hidden` parameter hides the macro visually but preserves it in storage
 * - The `id` parameter identifies specific macros (we use localId)
 * - A table with key-value structure is required inside the macro
 *
 * @param {string} localId - Embed macro localId (stored in the id parameter)
 * @param {string} markerType - Either 'START' or 'END'
 * @returns {string} Hidden Content Properties macro XML
 */
function buildBoundaryMarker(localId, markerType) {
  return `<ac:structured-macro ac:name="details" ac:schema-version="1">
<ac:parameter ac:name="hidden">true</ac:parameter>
<ac:parameter ac:name="id">blueprint-${markerType.toLowerCase()}-${localId}</ac:parameter>
<ac:rich-text-body>
<table><tbody><tr><th><p>blueprint-chapter</p></th><td><p>${markerType}</p></td></tr></tbody></table>
</ac:rich-text-body>
</ac:structured-macro>`;
}

/**
 * Compliance level configuration mapping
 * Maps compliance level values to emoji and label for injected content
 */
const COMPLIANCE_LEVEL_CONFIG = {
  'standard': { emoji: '🟢', label: 'STANDARD' },
  'bespoke': { emoji: '🟣', label: 'BESPOKE' },
  'semi-standard': { emoji: '🟡', label: 'SEMI-STANDARD' },
  'non-standard': { emoji: '🔴', label: 'NON-STANDARD' },
  'tbd': { emoji: '⚪', label: 'TBD' },
  'na': { emoji: '⚪', label: 'N/A' }
};

/**
 * Build compliance indicator (emoji + label) for injected content
 *
 * @param {string} complianceLevel - The compliance level (standard, bespoke, semi-standard, non-standard, tbd, na)
 * @param {boolean} isBespoke - Fallback: Whether the Source is bespoke (used when complianceLevel is null)
 * @returns {string} Emoji and label text for the heading
 */
function buildStatusMacro(complianceLevel, isBespoke = false) {
  // Determine effective compliance level
  const effectiveLevel = complianceLevel || (isBespoke ? 'bespoke' : 'standard');
  const config = COMPLIANCE_LEVEL_CONFIG[effectiveLevel] || COMPLIANCE_LEVEL_CONFIG['standard'];
  
  return `${config.emoji}`;
}

/**
 * Build complete chapter HTML structure using hidden Content Properties boundary markers
 *
 * Creates the full chapter structure:
 * - START boundary (hidden Content Properties macro with localId)
 * - H2 heading (native, TOC-readable, supports inline comments)
 * - Body content (NOT wrapped in Section macro - allows inline comments everywhere)
 * - END boundary (hidden Content Properties macro with localId)
 *
 * Why Content Properties macro for boundaries:
 * - Confluence strips HTML comments, hidden HTML attributes, and other markers
 * - Content Properties macro has official `hidden` parameter that persists
 * - The `id` parameter stores our localId for reliable identification
 * - This is the Confluence-sanctioned way to store invisible metadata
 *
 * Why no Section macro wrapper:
 * - Content inside Section macros cannot receive inline comments
 * - Without Section, all body content supports inline Redline comments
 * - Confluence TOC still picks up the heading (it's native <h2>)
 *
 * @param {Object} options
 * @param {string} options.chapterId - Unique chapter identifier (unused with new approach but kept for compatibility)
 * @param {string} options.localId - Embed macro localId (used in boundary markers)
 * @param {string} options.heading - Chapter heading text
 * @param {string} options.bodyContent - Rendered body content (storage format)
 * @param {string} options.complianceLevel - Compliance level (standard, bespoke, semi-standard, non-standard, tbd, na)
 * @param {boolean} options.isBespoke - Fallback for when complianceLevel is null
 * @returns {string} Complete chapter HTML with boundary markers
 */
export function buildChapterStructure({ chapterId, localId, heading, bodyContent, complianceLevel = null, isBespoke = false }) {
  if (!chapterId || !localId) {
    throw new Error('buildChapterStructure requires chapterId and localId');
  }

  const escapedHeading = escapeHtml(heading || 'Untitled Chapter');
  const statusMacro = buildStatusMacro(complianceLevel, isBespoke);

  // Build chapter with hidden Content Properties boundary markers
  const startMarker = buildBoundaryMarker(localId, 'START');
  const endMarker = buildBoundaryMarker(localId, 'END');

  return `${startMarker}
<h2>${statusMacro} ${escapedHeading}</h2>
${bodyContent || ''}
${endMarker}`;
}

/**
 * Build placeholder HTML for unpublished chapter
 *
 * Creates a "Under Construction" placeholder that appears when a chapter
 * has been added via Compositor but not yet configured/published.
 *
 * Uses hidden Content Properties boundary markers (no Section macro wrapper).
 *
 * @param {Object} options
 * @param {string} options.chapterId - Unique chapter identifier (unused but kept for compatibility)
 * @param {string} options.localId - Embed macro localId (used in boundary markers)
 * @param {string} options.heading - Chapter heading text
 * @param {string} options.complianceLevel - Compliance level (standard, bespoke, semi-standard, non-standard, tbd, na)
 * @param {boolean} options.isBespoke - Fallback for when complianceLevel is null
 * @returns {string} Placeholder HTML with boundary markers
 */
export function buildChapterPlaceholder({ chapterId, localId, heading, complianceLevel = null, isBespoke = false }) {
  if (!chapterId || !localId) {
    throw new Error('buildChapterPlaceholder requires chapterId and localId');
  }

  const escapedHeading = escapeHtml(heading || 'New Chapter');
  const statusMacro = buildStatusMacro(complianceLevel, isBespoke);

  const placeholderContent = `<ac:structured-macro ac:name="info" ac:schema-version="1">
<ac:rich-text-body>
<p><strong>📝 Chapter Under Construction</strong></p>
<p>This chapter has not been configured yet. Click the Edit button to set up variables and publish content.</p>
</ac:rich-text-body>
</ac:structured-macro>`;

  // Build chapter with hidden Content Properties boundary markers
  const startMarker = buildBoundaryMarker(localId, 'START');
  const endMarker = buildBoundaryMarker(localId, 'END');

  return `${startMarker}
<h2>${statusMacro} ${escapedHeading}</h2>
${placeholderContent}
<hr />
${endMarker}`;
}

/**
 * Build chapter HTML for freeform content mode
 *
 * Creates a chapter structure with user-written freeform content (plain text)
 * instead of Source-based content. Used when user selects non-standard, tbd, or na
 * compliance levels and chooses to write their own content.
 *
 * Converts plain text into <p> tags, handling newlines as paragraph breaks.
 * Uses hidden Content Properties boundary markers (no Section macro wrapper).
 *
 * @param {Object} options
 * @param {string} options.chapterId - Unique chapter identifier (unused but kept for compatibility)
 * @param {string} options.localId - Embed macro localId (used in boundary markers)
 * @param {string} options.heading - Chapter heading text
 * @param {string} options.freeformContent - Raw text content (newlines create paragraph breaks)
 * @param {string} options.complianceLevel - Compliance level (non-standard, tbd, na)
 * @returns {string} Complete chapter HTML with boundary markers
 */
export function buildFreeformChapter({ chapterId, localId, heading, freeformContent = '', complianceLevel }) {
  if (!chapterId || !localId) {
    throw new Error('buildFreeformChapter requires chapterId and localId');
  }

  const escapedHeading = escapeHtml(heading || 'Untitled Chapter');
  // For freeform mode, always use the compliance level (no bespoke fallback)
  const statusMacro = buildStatusMacro(complianceLevel, false);

  // Convert freeform text to paragraphs
  // Split by newlines and wrap each non-empty line in <p> tags
  const lines = freeformContent.split('\n');
  const paragraphs = lines
    .map(line => line.trim())
    .filter(line => line !== '')
    .map(line => `<p>${escapeHtml(line)}</p>`)
    .join('\n');

  // If no content, show a placeholder message
  const bodyContent = paragraphs || '<p><em>No content provided.</em></p>';

  // Build chapter with hidden Content Properties boundary markers
  const startMarker = buildBoundaryMarker(localId, 'START');
  const endMarker = buildBoundaryMarker(localId, 'END');

  return `${startMarker}
<h2>${statusMacro} ${escapedHeading}</h2>
${bodyContent}
${endMarker}`;
}

/**
 * Find and extract chapter content from page body
 *
 * Locates a chapter by its localId within the page storage content
 * and returns its position and content.
 *
 * NEW chapter structure (Content Properties boundaries):
 * - START boundary: hidden details macro with id="blueprint-start-${localId}"
 * - H2 heading
 * - Body content (no Section wrapper)
 * - END boundary: hidden details macro with id="blueprint-end-${localId}"
 *
 * LEGACY chapter structure (Section macro - for backwards compatibility):
 * - <h2> heading
 * - Section macro with blueprint-chapter and blueprint-local parameters
 *
 * Detection logic:
 * 1. Primary: Look for Content Properties boundaries by localId
 * 2. Fallback: Look for Section macro with blueprint-local parameter
 *
 * @param {string} pageBody - Full page storage content
 * @param {string} localId - Embed localId to find
 * @returns {Object|null} { startIndex, endIndex, content, localId } or null if not found
 */
export function findChapter(pageBody, localId) {
  if (!pageBody || !localId) return null;

  // PRIMARY: Look for new Content Properties boundary markers
  // The START marker has: <ac:parameter ac:name="id">blueprint-start-${localId}</ac:parameter>
  const startMarkerId = `blueprint-start-${localId}`;
  const endMarkerId = `blueprint-end-${localId}`;
  
  const startIdPattern = `<ac:parameter ac:name="id">${startMarkerId}</ac:parameter>`;
  const endIdPattern = `<ac:parameter ac:name="id">${endMarkerId}</ac:parameter>`;
  
  console.log('[findChapter] DEBUG - searching for start marker:', startIdPattern);
  
  const startIdIndex = pageBody.indexOf(startIdPattern);
  const endIdIndex = pageBody.indexOf(endIdPattern);
  
  if (startIdIndex !== -1 && endIdIndex !== -1) {
    console.log('[findChapter] DEBUG - found Content Properties boundaries');
    
    // Find the opening of the START details macro (search backwards from the id parameter)
    const beforeStartId = pageBody.substring(0, startIdIndex);
    const startMacroOpen = beforeStartId.lastIndexOf('<ac:structured-macro');
    
    if (startMacroOpen === -1) {
      console.log('[findChapter] DEBUG - could not find START macro opening');
      return null;
    }
    
    // Find the closing of the END details macro
    // Search forward from endIdIndex for </ac:structured-macro>
    const afterEndId = pageBody.indexOf('</ac:structured-macro>', endIdIndex);
    if (afterEndId === -1) {
      console.log('[findChapter] DEBUG - could not find END macro closing');
      return null;
    }
    const endMacroClose = afterEndId + '</ac:structured-macro>'.length;
    
    const chapterContent = pageBody.substring(startMacroOpen, endMacroClose);
    
    console.log('[findChapter] DEBUG - found chapter via Content Properties boundaries:', {
      startIndex: startMacroOpen,
      endIndex: endMacroClose,
      contentLength: chapterContent.length
    });
    
    return {
      startIndex: startMacroOpen,
      endIndex: endMacroClose,
      content: chapterContent,
      localId: localId
    };
  }
  
  console.log('[findChapter] DEBUG - Content Properties boundaries not found, trying legacy Section macro');

  // FALLBACK: Look for legacy Section macro structure
  // Look for: <ac:parameter ac:name="blueprint-local">${localId}</ac:parameter>
  const legacyParamPattern = `<ac:parameter ac:name="blueprint-local">${localId}</ac:parameter>`;
  const legacyParamIndex = pageBody.indexOf(legacyParamPattern);
  
  if (legacyParamIndex === -1) {
    console.log('[findChapter] DEBUG - no legacy blueprint-local parameter found');
    return null;
  }

  // Find the opening <ac:structured-macro tag (search backwards from parameter)
  const beforeParam = pageBody.substring(0, legacyParamIndex);
  const macroStart = beforeParam.lastIndexOf('<ac:structured-macro');
  if (macroStart === -1) {
    console.log('[findChapter] DEBUG - no opening macro tag found');
    return null;
  }

  // Verify this is a section macro
  const macroTagEnd = pageBody.indexOf('>', macroStart);
  const macroTag = pageBody.substring(macroStart, macroTagEnd + 1);
  if (!macroTag.includes('ac:name="section"')) {
    console.log('[findChapter] DEBUG - macro is not a section:', macroTag);
    return null;
  }

  // Find the closing </ac:structured-macro> tag
  // Need to handle nested macros - count opening and closing tags
  let depth = 1;
  let searchPos = macroTagEnd + 1;
  let macroEnd = -1;
  
  while (depth > 0 && searchPos < pageBody.length) {
    const nextOpen = pageBody.indexOf('<ac:structured-macro', searchPos);
    const nextClose = pageBody.indexOf('</ac:structured-macro>', searchPos);
    
    if (nextClose === -1) {
      console.log('[findChapter] DEBUG - no closing tag found');
      break;
    }
    
    if (nextOpen !== -1 && nextOpen < nextClose) {
      // Found another opening tag before the close
      depth++;
      searchPos = nextOpen + 1;
    } else {
      // Found a closing tag
      depth--;
      if (depth === 0) {
        macroEnd = nextClose + '</ac:structured-macro>'.length;
      }
      searchPos = nextClose + 1;
    }
  }
  
  if (macroEnd === -1) {
    console.log('[findChapter] DEBUG - could not find matching closing tag');
    return null;
  }

  // Now find the chapter START (heading before Section macro)
  let chapterStart = macroStart;
  
  // Look for <h2> tag immediately before the Section macro
  const h2Pattern = /<h2[^>]*>/gi;
  let lastH2Index = -1;
  let match;
  
  // Find all <h2> tags before the Section macro
  while ((match = h2Pattern.exec(beforeParam)) !== null) {
    lastH2Index = match.index;
  }
  
  if (lastH2Index !== -1) {
    // Check if this <h2> is "close enough" to the Section macro (within 500 chars)
    const distanceToMacro = macroStart - lastH2Index;
    if (distanceToMacro < 500) {
      chapterStart = lastH2Index;
      console.log('[findChapter] DEBUG - found <h2> at', lastH2Index, 'distance:', distanceToMacro);
    }
  }

  const content = pageBody.substring(chapterStart, macroEnd);
  console.log('[findChapter] DEBUG - found chapter from', chapterStart, 'to', macroEnd);

  return {
    startIndex: chapterStart,
    endIndex: macroEnd,
    content,
    localId
  };
}

/**
 * Remove a chapter from page body
 *
 * Completely removes a chapter and its content from the page.
 * Used when user opts out of a chapter via Compositor.
 *
 * @param {string} pageBody - Full page storage content
 * @param {string} localId - Embed localId to remove
 * @returns {string} Updated page body with chapter removed
 */
export function removeChapter(pageBody, localId) {
  if (!pageBody || !localId) return pageBody;

  const chapter = findChapter(pageBody, localId);
  if (!chapter) return pageBody;

  // Remove the chapter and any surrounding whitespace
  const before = pageBody.substring(0, chapter.startIndex).trimEnd();
  const after = pageBody.substring(chapter.endIndex).trimStart();

  // Join with double newline to maintain spacing
  return before + (before && after ? '\n\n' : '') + after;
}

/**
 * Check if a chapter exists in the page body
 *
 * @param {string} pageBody - Full page storage content
 * @param {string} localId - Embed localId to check
 * @returns {boolean} True if chapter exists
 */
export function chapterExists(pageBody, localId) {
  return findChapter(pageBody, localId) !== null;
}

/**
 * Get all chapter IDs from page body
 *
 * Scans the page for all Blueprint chapter markers and returns
 * their IDs in order of appearance.
 *
 * Looks for section macros with blueprint-chapter parameter.
 *
 * @param {string} pageBody - Full page storage content
 * @returns {string[]} Array of chapter IDs
 */
export function getAllChapterIds(pageBody) {
  if (!pageBody) return [];

  // Match <ac:parameter ac:name="blueprint-chapter">{chapterId}</ac:parameter>
  // Only match those within section macros (not other macro types)
  const ids = [];
  const pattern = /<ac:parameter ac:name="blueprint-chapter">([^<]+)<\/ac:parameter>/g;
  let match;

  while ((match = pattern.exec(pageBody)) !== null) {
    const chapterId = match[1];
    if (!ids.includes(chapterId)) {
      ids.push(chapterId);
    }
  }

  return ids;
}

/**
 * Extract the macro ID from an ADF extension node
 *
 * Checks multiple possible locations for the macro's ID parameter.
 * The id parameter is used for our boundary markers (blueprint-start-{localId}).
 *
 * @param {Object} node - ADF extension node
 * @returns {string|null} The macro ID or null if not found
 */
function getMacroIdFromExtension(node) {
  if (!node || !node.attrs) return null;

  // Check various parameter locations
  // Format 1: attrs.parameters.macroParams.id.value (Forge macro format)
  if (node.attrs.parameters?.macroParams?.id?.value) {
    return node.attrs.parameters.macroParams.id.value;
  }

  // Format 2: attrs.parameters.id (simple parameter format)
  if (node.attrs.parameters?.id) {
    return node.attrs.parameters.id;
  }

  // Format 3: Direct in attrs (less common)
  if (node.attrs.id) {
    return node.attrs.id;
  }

  // Format 4: Check for Confluence native macro parameters
  // Native macros like details/page-properties store params in macroParams without .value wrapper
  if (node.attrs.parameters?.macroParams?.id) {
    const idParam = node.attrs.parameters.macroParams.id;
    if (typeof idParam === 'string') {
      return idParam;
    }
  }

  return null;
}

/**
 * Check if an ADF node is a details macro with matching ID
 *
 * @param {Object} node - ADF node to check
 * @param {string} markerId - Expected marker ID (e.g., "blueprint-start-abc123")
 * @returns {boolean} True if this is the matching boundary marker
 */
function isBoundaryMarker(node, markerId) {
  if (!node) return false;

  // Extension nodes represent macros in ADF
  if (node.type !== 'extension' && node.type !== 'bodiedExtension') {
    return false;
  }

  // Get macro ID from various possible locations
  const nodeId = getMacroIdFromExtension(node);
  
  // Direct ID match
  if (nodeId === markerId) {
    return true;
  }

  return false;
}

/**
 * Extract chapter body content from ADF page content
 *
 * Finds the content between blueprint-start-{localId} and blueprint-end-{localId}
 * boundary markers and returns it as a valid ADF document.
 *
 * Chapter ADF structure:
 * - extension node (blueprint-start-{localId} marker)
 * - heading node (h2 with chapter title)
 * - body content nodes (paragraphs, tables, etc.)
 * - extension node (blueprint-end-{localId} marker)
 *
 * This function extracts just the body content (excluding markers and heading).
 *
 * @param {Object} adfContent - Full page ADF content (type: 'doc')
 * @param {string} localId - Embed localId to find
 * @returns {Object|null} ADF document with chapter body content, or null if not found
 */
export function extractChapterBodyFromAdf(adfContent, localId) {
  if (!adfContent || !localId) return null;

  // Ensure we have a doc with content array
  if (adfContent.type !== 'doc' || !Array.isArray(adfContent.content)) {
    return null;
  }

  const startMarkerId = `blueprint-start-${localId}`;
  const endMarkerId = `blueprint-end-${localId}`;

  const topLevelContent = adfContent.content;
  let startIndex = -1;
  let endIndex = -1;

  // Find start and end markers in top-level content
  for (let i = 0; i < topLevelContent.length; i++) {
    const node = topLevelContent[i];

    if (startIndex === -1 && isBoundaryMarker(node, startMarkerId)) {
      startIndex = i;
    } else if (startIndex !== -1 && isBoundaryMarker(node, endMarkerId)) {
      endIndex = i;
      break;
    }
  }

  // If markers not found at top level, search recursively
  if (startIndex === -1 || endIndex === -1) {
    return extractChapterBodyRecursive(adfContent, startMarkerId, endMarkerId);
  }

  // Extract content between markers (exclusive of markers)
  // Skip the first node after start marker if it's a heading (chapter title)
  let bodyStartIndex = startIndex + 1;
  const firstContentNode = topLevelContent[bodyStartIndex];
  
  if (firstContentNode && firstContentNode.type === 'heading') {
    bodyStartIndex++;
  }

  // Extract body nodes (from after heading to before end marker)
  const bodyNodes = topLevelContent.slice(bodyStartIndex, endIndex);

  if (bodyNodes.length === 0) {
    return null;
  }

  // Return as valid ADF document
  return {
    type: 'doc',
    version: 1,
    content: bodyNodes
  };
}

/**
 * Recursively search for chapter content in nested ADF structures
 *
 * Used when boundary markers are not at the top level (e.g., inside layouts).
 *
 * @param {Object} node - ADF node to search
 * @param {string} startMarkerId - Start marker ID
 * @param {string} endMarkerId - End marker ID
 * @returns {Object|null} ADF document with chapter body content, or null if not found
 */
function extractChapterBodyRecursive(node, startMarkerId, endMarkerId) {
  if (!node || typeof node !== 'object') return null;

  // If this node has content, search within it
  if (Array.isArray(node.content)) {
    let startIndex = -1;
    let endIndex = -1;

    // Look for markers in this content array
    for (let i = 0; i < node.content.length; i++) {
      const child = node.content[i];

      if (startIndex === -1 && isBoundaryMarker(child, startMarkerId)) {
        startIndex = i;
      } else if (startIndex !== -1 && isBoundaryMarker(child, endMarkerId)) {
        endIndex = i;
        break;
      }
    }

    // Found markers in this content array
    if (startIndex !== -1 && endIndex !== -1) {
      let bodyStartIndex = startIndex + 1;
      const firstContentNode = node.content[bodyStartIndex];

      if (firstContentNode && firstContentNode.type === 'heading') {
        bodyStartIndex++;
      }

      const bodyNodes = node.content.slice(bodyStartIndex, endIndex);

      if (bodyNodes.length > 0) {
        return {
          type: 'doc',
          version: 1,
          content: bodyNodes
        };
      }
    }

    // Not found in this array, search children recursively
    for (const child of node.content) {
      const result = extractChapterBodyRecursive(child, startMarkerId, endMarkerId);
      if (result) return result;
    }
  }

  return null;
}

