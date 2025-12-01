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
 * Build complete chapter HTML structure using Confluence Section macro
 *
 * Creates the full chapter structure wrapped in a Section macro:
 * - Section macro as container with blueprint parameters (these are preserved!)
 * - Status lozenge based on compliance level, followed by H2 heading (native, TOC-readable)
 * - Body content
 * - Simple <hr> divider at end for visual separation
 *
 * Why Section macro:
 * - Confluence preserves ac:parameter elements on structured macros
 * - Section renders invisibly (no visual box/border)
 * - Divider macro doesn't actually support parameters (just renders <hr>)
 * - data-* attributes, class names, and custom attributes are all stripped
 *
 * @param {Object} options
 * @param {string} options.chapterId - Unique chapter identifier
 * @param {string} options.localId - Embed macro localId
 * @param {string} options.heading - Chapter heading text
 * @param {string} options.bodyContent - Rendered body content (storage format)
 * @param {string} options.complianceLevel - Compliance level (standard, bespoke, semi-standard, non-standard, tbd, na)
 * @param {boolean} options.isBespoke - Fallback for when complianceLevel is null
 * @returns {string} Complete chapter HTML wrapped in section macro
 */
export function buildChapterStructure({ chapterId, localId, heading, bodyContent, complianceLevel = null, isBespoke = false }) {
  if (!chapterId || !localId) {
    throw new Error('buildChapterStructure requires chapterId and localId');
  }

  const escapedHeading = escapeHtml(heading || 'Untitled Chapter');
  const statusMacro = buildStatusMacro(complianceLevel, isBespoke);

  // Use Section macro as container - parameters are preserved!
  // Section macro itself forms the boundary, no need for <hr />
  return `<ac:structured-macro ac:name="section" ac:schema-version="1">
<ac:parameter ac:name="blueprint-chapter">${chapterId}</ac:parameter>
<ac:parameter ac:name="blueprint-local">${localId}</ac:parameter>
<ac:rich-text-body>
<h2>${statusMacro} ${escapedHeading}</h2>
${bodyContent || ''}
</ac:rich-text-body>
</ac:structured-macro>`;
}

/**
 * Build placeholder HTML for unpublished chapter
 *
 * Creates a "Under Construction" placeholder that appears when a chapter
 * has been added via Compositor but not yet configured/published.
 *
 * Uses Section macro as container with parameters.
 *
 * @param {Object} options
 * @param {string} options.chapterId - Unique chapter identifier
 * @param {string} options.localId - Embed macro localId
 * @param {string} options.heading - Chapter heading text
 * @param {string} options.complianceLevel - Compliance level (standard, bespoke, semi-standard, non-standard, tbd, na)
 * @param {boolean} options.isBespoke - Fallback for when complianceLevel is null
 * @returns {string} Placeholder HTML wrapped in section macro
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

  // Use Section macro as container - parameters are preserved!
  return `<ac:structured-macro ac:name="section" ac:schema-version="1">
<ac:parameter ac:name="blueprint-chapter">${chapterId}</ac:parameter>
<ac:parameter ac:name="blueprint-local">${localId}</ac:parameter>
<ac:rich-text-body>
<h2>${statusMacro} ${escapedHeading}</h2>
${placeholderContent}
<hr />
</ac:rich-text-body>
</ac:structured-macro>`;
}

/**
 * Build chapter HTML for freeform content mode
 *
 * Creates a chapter structure with user-written freeform content (plain text)
 * instead of Source-based content. Used when user selects non-standard, tbd, or na
 * compliance levels and chooses to write their own content.
 *
 * Converts plain text into <p> tags, handling newlines as paragraph breaks.
 * Uses Section macro as container to maintain redlining capability.
 *
 * @param {Object} options
 * @param {string} options.chapterId - Unique chapter identifier
 * @param {string} options.localId - Embed macro localId
 * @param {string} options.heading - Chapter heading text
 * @param {string} options.freeformContent - Raw text content (newlines create paragraph breaks)
 * @param {string} options.complianceLevel - Compliance level (non-standard, tbd, na)
 * @returns {string} Complete chapter HTML wrapped in section macro
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

  // Use Section macro as container - same structure as standard chapters
  return `<ac:structured-macro ac:name="section" ac:schema-version="1">
<ac:parameter ac:name="blueprint-chapter">${chapterId}</ac:parameter>
<ac:parameter ac:name="blueprint-local">${localId}</ac:parameter>
<ac:parameter ac:name="blueprint-freeform">true</ac:parameter>
<ac:rich-text-body>
<h2>${statusMacro} ${escapedHeading}</h2>
${bodyContent}
</ac:rich-text-body>
</ac:structured-macro>`;
}

/**
 * Find and extract chapter content from page body
 *
 * Locates a chapter by its ID within the page storage content
 * and returns its position and content.
 *
 * Searches for Section macro with blueprint-chapter parameter matching chapterId.
 * The entire section macro (from opening to closing tag) is the chapter.
 *
 * @param {string} pageBody - Full page storage content
 * @param {string} chapterId - Chapter ID to find
 * @returns {Object|null} { startIndex, endIndex, content, localId } or null if not found
 */
export function findChapter(pageBody, chapterId) {
  if (!pageBody || !chapterId) return null;

  // Look for our parameter: <ac:parameter ac:name="blueprint-chapter">{chapterId}</ac:parameter>
  const paramPattern = `<ac:parameter ac:name="blueprint-chapter">${chapterId}</ac:parameter>`;
  console.log('[findChapter] DEBUG - searching for pattern:', paramPattern);
  
  const paramIndex = pageBody.indexOf(paramPattern);
  console.log('[findChapter] DEBUG - paramIndex:', paramIndex);
  
  if (paramIndex === -1) {
    // Debug: try to find any blueprint-chapter param to see what's there
    const anyBlueprintParam = pageBody.indexOf('ac:parameter ac:name="blueprint-chapter"');
    console.log('[findChapter] DEBUG - any blueprint-chapter param at:', anyBlueprintParam);
    if (anyBlueprintParam !== -1) {
      console.log('[findChapter] DEBUG - surrounding content:', pageBody.substring(anyBlueprintParam, anyBlueprintParam + 150));
    }
    return null;
  }

  // Find the opening <ac:structured-macro tag (search backwards from parameter)
  const beforeParam = pageBody.substring(0, paramIndex);
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

  // Extract localId from blueprint-local parameter if present
  const content = pageBody.substring(macroStart, macroEnd);
  let localId = null;
  const localParamMatch = content.match(/<ac:parameter ac:name="blueprint-local">([^<]+)<\/ac:parameter>/);
  if (localParamMatch) {
    localId = localParamMatch[1];
  }

  console.log('[findChapter] DEBUG - found chapter from', macroStart, 'to', macroEnd);

  return {
    startIndex: macroStart,
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
 * @param {string} chapterId - Chapter ID to remove
 * @returns {string} Updated page body with chapter removed
 */
export function removeChapter(pageBody, chapterId) {
  if (!pageBody || !chapterId) return pageBody;

  const chapter = findChapter(pageBody, chapterId);
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
 * @param {string} chapterId - Chapter ID to check
 * @returns {boolean} True if chapter exists
 */
export function chapterExists(pageBody, chapterId) {
  return findChapter(pageBody, chapterId) !== null;
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

