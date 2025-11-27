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
 * - Hidden div with chapter start marker (data attributes)
 * - H2 heading (native, TOC-readable)
 * - Managed content zone with hidden div markers
 * - Chapter divider (HR with data attributes)
 * - Hidden div with chapter end marker
 *
 * Uses hidden divs with data attributes instead of HTML comments
 * for more reliable detection (simple indexOf, no regex needed).
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

  return `<div style="display:none" data-blueprint-chapter="${chapterId}" data-marker="start"></div>
<h2>${escapedHeading}</h2>

<div style="display:none" data-blueprint-managed="${localId}" data-marker="start"></div>
${bodyContent || ''}
<div style="display:none" data-blueprint-managed="${localId}" data-marker="end"></div>

<hr class="blueprint-chapter-divider" data-chapter="${chapterId}" data-local-id="${localId}" />
<div style="display:none" data-blueprint-chapter="${chapterId}" data-marker="end"></div>`;
}

/**
 * Build placeholder HTML for unpublished chapter
 *
 * Creates a "Under Construction" placeholder that appears when a chapter
 * has been added via Compositor but not yet configured/published.
 *
 * Uses hidden divs with data attributes for reliable marker detection.
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

  return `<div style="display:none" data-blueprint-chapter="${chapterId}" data-marker="start"></div>
<h2>${escapedHeading}</h2>

<div style="display:none" data-blueprint-managed="${localId}" data-marker="start"></div>
${placeholderContent}
<div style="display:none" data-blueprint-managed="${localId}" data-marker="end"></div>

<hr class="blueprint-chapter-divider" data-chapter="${chapterId}" data-local-id="${localId}" />
<div style="display:none" data-blueprint-chapter="${chapterId}" data-marker="end"></div>`;
}

/**
 * Find and extract chapter content from page body
 *
 * Locates a chapter by its ID within the page storage content
 * and returns its position and content.
 *
 * Uses hidden div markers with data attributes for reliable detection.
 * Simple indexOf matching - no regex needed!
 *
 * @param {string} pageBody - Full page storage content
 * @param {string} chapterId - Chapter ID to find
 * @returns {Object|null} { startIndex, endIndex, content } or null if not found
 */
export function findChapter(pageBody, chapterId) {
  if (!pageBody || !chapterId) return null;

  // Look for data attribute markers - simple string matching, no regex!
  const startMarker = `data-blueprint-chapter="${chapterId}" data-marker="start"`;
  const endMarker = `data-blueprint-chapter="${chapterId}" data-marker="end"`;

  const startMarkerIndex = pageBody.indexOf(startMarker);
  if (startMarkerIndex === -1) return null;

  const endMarkerIndex = pageBody.indexOf(endMarker, startMarkerIndex);
  if (endMarkerIndex === -1) return null;

  // Find the actual start of the start div (search backwards for '<div')
  const divSearchStart = Math.max(0, startMarkerIndex - 100); // Look back up to 100 chars
  const beforeStartMarker = pageBody.substring(divSearchStart, startMarkerIndex);
  const lastDivIndex = beforeStartMarker.lastIndexOf('<div');
  if (lastDivIndex === -1) return null;
  const startIndex = divSearchStart + lastDivIndex;

  // Find the end of the end div (search forward for '</div>')
  const afterEndMarker = pageBody.indexOf('</div>', endMarkerIndex);
  if (afterEndMarker === -1) return null;
  const endIndex = afterEndMarker + '</div>'.length;

  return {
    startIndex,
    endIndex,
    content: pageBody.substring(startIndex, endIndex)
  };
}

/**
 * Find managed content zone within a chapter
 *
 * Locates the managed zone by localId, which contains the
 * Source-derived content that gets replaced on republish.
 *
 * Uses hidden div markers with data attributes for reliable detection.
 * Simple indexOf matching - no regex needed!
 *
 * @param {string} pageBody - Full page storage content
 * @param {string} localId - Embed localId
 * @returns {Object|null} { startIndex, endIndex, contentStart, contentEnd, content } or null
 */
export function findManagedZone(pageBody, localId) {
  if (!pageBody || !localId) return null;

  // Look for data attribute markers - simple string matching!
  const startMarker = `data-blueprint-managed="${localId}" data-marker="start"`;
  const endMarker = `data-blueprint-managed="${localId}" data-marker="end"`;

  const startMarkerIndex = pageBody.indexOf(startMarker);
  if (startMarkerIndex === -1) return null;

  const endMarkerIndex = pageBody.indexOf(endMarker, startMarkerIndex);
  if (endMarkerIndex === -1) return null;

  // Find the actual start of the start div
  const divSearchStart = Math.max(0, startMarkerIndex - 100);
  const beforeStartMarker = pageBody.substring(divSearchStart, startMarkerIndex);
  const lastDivIndex = beforeStartMarker.lastIndexOf('<div');
  if (lastDivIndex === -1) return null;
  const startIndex = divSearchStart + lastDivIndex;

  // Find the end of the start div (where content begins)
  const startDivEnd = pageBody.indexOf('</div>', startMarkerIndex);
  if (startDivEnd === -1) return null;
  const contentStart = startDivEnd + '</div>'.length;

  // Find the start of the end div (where content ends)
  const endDivSearchStart = Math.max(0, endMarkerIndex - 100);
  const beforeEndMarker = pageBody.substring(endDivSearchStart, endMarkerIndex);
  const endDivStart = beforeEndMarker.lastIndexOf('<div');
  if (endDivStart === -1) return null;
  const contentEnd = endDivSearchStart + endDivStart;

  // Find the full end of the end div
  const endDivEnd = pageBody.indexOf('</div>', endMarkerIndex);
  if (endDivEnd === -1) return null;
  const endIndex = endDivEnd + '</div>'.length;

  return {
    startIndex,
    endIndex,
    contentStart,
    contentEnd,
    content: pageBody.substring(contentStart, contentEnd).trim()
  };
}

/**
 * Replace managed zone content, preserving structure
 *
 * Updates the content within a managed zone without affecting
 * the chapter structure or other page content.
 *
 * Uses hidden div markers with data attributes.
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

  // Build new managed zone with hidden div markers
  const startMarker = `<div style="display:none" data-blueprint-managed="${localId}" data-marker="start"></div>`;
  const endMarker = `<div style="display:none" data-blueprint-managed="${localId}" data-marker="end"></div>`;

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
 * Uses simple regex to extract data attribute values.
 *
 * @param {string} pageBody - Full page storage content
 * @returns {string[]} Array of chapter IDs
 */
export function getAllChapterIds(pageBody) {
  if (!pageBody) return [];

  // Match data-blueprint-chapter="X" data-marker="start" pattern
  const pattern = /data-blueprint-chapter="([^"]+)"\s+data-marker="start"/g;
  const ids = [];
  let match;

  while ((match = pattern.exec(pageBody)) !== null) {
    ids.push(match[1]);
  }

  return ids;
}

