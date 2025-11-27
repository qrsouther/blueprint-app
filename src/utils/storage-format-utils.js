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
 * Build complete chapter HTML structure with markers
 *
 * Creates the full chapter structure that gets injected into the page:
 * - Chapter start marker
 * - H2 heading (native, TOC-readable)
 * - Managed content zone with markers
 * - Chapter divider (HR)
 * - Chapter end marker
 *
 * @param {Object} options
 * @param {string} options.chapterId - Unique chapter identifier
 * @param {string} options.localId - Embed macro localId
 * @param {string} options.heading - Chapter heading text
 * @param {string} options.bodyContent - Rendered body content (storage format)
 * @returns {string} Complete chapter HTML with markers
 */
export function buildChapterStructure({ chapterId, localId, heading, bodyContent }) {
  if (!chapterId || !localId) {
    throw new Error('buildChapterStructure requires chapterId and localId');
  }

  const escapedHeading = escapeHtml(heading || 'Untitled Chapter');

  return `<!-- BLUEPRINT-CHAPTER-START: ${chapterId} -->
<h2>${escapedHeading}</h2>

<!-- BLUEPRINT-MANAGED-START: ${localId} -->
${bodyContent || ''}
<!-- BLUEPRINT-MANAGED-END: ${localId} -->

<hr class="blueprint-chapter-divider" data-chapter="${chapterId}" data-local-id="${localId}" />
<!-- BLUEPRINT-CHAPTER-END: ${chapterId} -->`;
}

/**
 * Build placeholder HTML for unpublished chapter
 *
 * Creates a "Under Construction" placeholder that appears when a chapter
 * has been added via Compositor but not yet configured/published.
 *
 * @param {Object} options
 * @param {string} options.chapterId - Unique chapter identifier
 * @param {string} options.localId - Embed macro localId
 * @param {string} options.heading - Chapter heading text
 * @returns {string} Placeholder HTML with info macro
 */
export function buildChapterPlaceholder({ chapterId, localId, heading }) {
  if (!chapterId || !localId) {
    throw new Error('buildChapterPlaceholder requires chapterId and localId');
  }

  const escapedHeading = escapeHtml(heading || 'New Chapter');

  const placeholderContent = `<ac:structured-macro ac:name="info" ac:schema-version="1">
  <ac:rich-text-body>
    <p><strong>📝 Chapter Under Construction</strong></p>
    <p>This chapter has not been configured yet. Click the Edit button to set up variables and publish content.</p>
  </ac:rich-text-body>
</ac:structured-macro>`;

  return `<!-- BLUEPRINT-CHAPTER-START: ${chapterId} -->
<h2>${escapedHeading}</h2>

<!-- BLUEPRINT-MANAGED-START: ${localId} -->
${placeholderContent}
<!-- BLUEPRINT-MANAGED-END: ${localId} -->

<hr class="blueprint-chapter-divider" data-chapter="${chapterId}" data-local-id="${localId}" />
<!-- BLUEPRINT-CHAPTER-END: ${chapterId} -->`;
}

/**
 * Escape regex special characters
 * @param {string} string - String to escape
 * @returns {string} Escaped string safe for use in RegExp
 */
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Find and extract chapter content from page body
 *
 * Locates a chapter by its ID within the page storage content
 * and returns its position and content.
 *
 * Uses flexible regex matching to handle cases where Confluence
 * may add/modify whitespace within HTML comments.
 *
 * @param {string} pageBody - Full page storage content
 * @param {string} chapterId - Chapter ID to find
 * @returns {Object|null} { startIndex, endIndex, content } or null if not found
 */
export function findChapter(pageBody, chapterId) {
  if (!pageBody || !chapterId) return null;

  // Use flexible regex to handle potential whitespace variations from Confluence
  const escapedChapterId = escapeRegex(chapterId);
  const pattern = new RegExp(
    `<!--\\s*BLUEPRINT-CHAPTER-START:\\s*${escapedChapterId}\\s*-->[\\s\\S]*?<!--\\s*BLUEPRINT-CHAPTER-END:\\s*${escapedChapterId}\\s*-->`,
    'g'
  );

  const match = pattern.exec(pageBody);
  if (!match) return null;

  return {
    startIndex: match.index,
    endIndex: match.index + match[0].length,
    content: match[0]
  };
}

/**
 * Find managed content zone within a chapter
 *
 * Locates the managed zone by localId, which contains the
 * Source-derived content that gets replaced on republish.
 *
 * Uses flexible regex matching to handle cases where Confluence
 * may add/modify whitespace within HTML comments.
 *
 * @param {string} pageBody - Full page storage content
 * @param {string} localId - Embed localId
 * @returns {Object|null} { startIndex, endIndex, startMarkerEnd, endMarkerStart, content } or null
 */
export function findManagedZone(pageBody, localId) {
  if (!pageBody || !localId) return null;

  // Use flexible regex to handle potential whitespace variations
  const escapedLocalId = escapeRegex(localId);
  
  // Match start marker
  const startPattern = new RegExp(
    `<!--\\s*BLUEPRINT-MANAGED-START:\\s*${escapedLocalId}\\s*-->`,
    'g'
  );
  const startMatch = startPattern.exec(pageBody);
  if (!startMatch) return null;

  // Match end marker (search from after start marker)
  const endPattern = new RegExp(
    `<!--\\s*BLUEPRINT-MANAGED-END:\\s*${escapedLocalId}\\s*-->`,
    'g'
  );
  endPattern.lastIndex = startMatch.index + startMatch[0].length;
  const endMatch = endPattern.exec(pageBody);
  if (!endMatch) return null;

  const startIndex = startMatch.index;
  const startMarkerEnd = startMatch.index + startMatch[0].length;
  const endMarkerStart = endMatch.index;
  const endIndex = endMatch.index + endMatch[0].length;

  return {
    startIndex,
    endIndex,
    startMarkerEnd,
    endMarkerStart,
    content: pageBody.substring(startMarkerEnd, endMarkerStart).trim()
  };
}

/**
 * Replace managed zone content, preserving markers
 *
 * Updates the content within a managed zone without affecting
 * the chapter structure or other page content.
 *
 * Rebuilds the markers to ensure consistent format regardless of
 * how Confluence may have modified them.
 *
 * @param {string} pageBody - Full page storage content
 * @param {string} localId - Embed localId
 * @param {string} newContent - New content to inject
 * @returns {string|null} Updated page body or null if zone not found
 */
export function replaceManagedZone(pageBody, localId, newContent) {
  if (!pageBody || !localId) return null;

  const zone = findManagedZone(pageBody, localId);
  if (!zone) return null;

  // Rebuild markers in consistent format
  const startMarker = `<!-- BLUEPRINT-MANAGED-START: ${localId} -->`;
  const endMarker = `<!-- BLUEPRINT-MANAGED-END: ${localId} -->`;

  return (
    pageBody.substring(0, zone.startIndex) +
    startMarker + '\n' +
    (newContent || '') + '\n' +
    endMarker +
    pageBody.substring(zone.endIndex)
  );
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
 * Uses flexible regex to handle whitespace variations.
 *
 * @param {string} pageBody - Full page storage content
 * @returns {string[]} Array of chapter IDs
 */
export function getAllChapterIds(pageBody) {
  if (!pageBody) return [];

  // Flexible pattern to handle potential whitespace variations
  const pattern = /<!--\s*BLUEPRINT-CHAPTER-START:\s*([^\s>]+)\s*-->/g;
  const ids = [];
  let match;

  while ((match = pattern.exec(pageBody)) !== null) {
    ids.push(match[1].trim());
  }

  return ids;
}

