/**
 * Migration Utility Functions
 *
 * This module provides utilities for migrating content from MultiExcerpt
 * plugin to Blueprint App, including data decoding, XML parsing, and content cleaning.
 */

/**
 * Decode MultiExcerpt templateData (base64 + zlib compressed JSON)
 *
 * MultiExcerpt stores variable values in a base64-encoded, zlib-compressed JSON string.
 * This function decodes that data to extract variable values during migration.
 *
 * @param {string} templateDataString - Base64-encoded, zlib-compressed JSON string
 * @returns {Object|null} Parsed JSON object or null if decoding fails
 *
 * @example
 * const encoded = "eJyrVkrLz1eyUlAqS8wpTlWyMjYxMDAyNTAzAQCVewZQ";
 * const data = decodeTemplateData(encoded);
 * // Returns: [{ name: 'variable', value: 'value' }] or null
 */
export function decodeTemplateData(templateDataString) {
  try {
    // Remove any whitespace
    const cleaned = templateDataString.trim();

    // Base64 decode
    const compressed = Buffer.from(cleaned, 'base64');

    // Zlib decompress
    const zlib = require('zlib');
    const decompressed = zlib.inflateSync(compressed);

    // Parse JSON
    const parsed = JSON.parse(decompressed.toString('utf-8'));

    return parsed;
  } catch (error) {
    // Silently return null on decode failure (expected during migration)
    return null;
  }
}

/**
 * Convert Confluence Storage Format XML to plain text
 *
 * Strips XML tags and decodes HTML entities to produce plain text suitable
 * for Blueprint App content display and search. Used during MultiExcerpt migration.
 *
 * @param {string} storageContent - Confluence Storage Format XML content
 * @returns {string} Plain text with tags removed and entities decoded
 *
 * @example
 * const xml = '<p>Hello &amp; welcome</p>';
 * const text = storageToPlainText(xml);
 * // Returns: "Hello & welcome"
 */
export function storageToPlainText(storageContent) {
  if (!storageContent) return '';

  let text = storageContent;

  // Remove XML tags
  text = text.replace(/<[^>]+>/g, ' ');

  // Decode HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');

  // Normalize whitespace
  text = text.replace(/\s+/g, ' ');

  return text.trim();
}

/**
 * Clean MultiExcerpt-specific macros from storage format content
 *
 * Removes MultiExcerpt macro tags from Confluence Storage Format XML while
 * preserving the actual content. Handles nested macros and orphaned closing tags.
 * Used when creating Blueprint App Source macros from migrated content.
 *
 * @param {string} storageContent - Confluence Storage Format XML with MultiExcerpt macros
 * @returns {string} Cleaned XML with MultiExcerpt macros removed
 *
 * @example
 * const withMulti = '<ac:structured-macro ac:name="multiexcerpt-macro">...</ac:structured-macro>';
 * const cleaned = cleanMultiExcerptMacros(withMulti);
 * // Returns: Content without MultiExcerpt wrapper
 */
export function cleanMultiExcerptMacros(storageContent) {
  if (!storageContent) return '';

  let cleaned = storageContent;

  // Count opening and closing structured-macro tags before cleaning
  // Step 1: Remove multiexcerpt macro opening tags (with parameters)
  // This regex finds the opening tag and all parameters up to the rich-text-body
  cleaned = cleaned.replace(/<ac:structured-macro[^>]*ac:name="multiexcerpt-macro"[^>]*>[\s\S]*?<ac:rich-text-body>/g, '');
  cleaned = cleaned.replace(/<ac:structured-macro ac:name="multiexcerpt-macro"[^>]*>[\s\S]*?<ac:rich-text-body>/g, '');

  // Remove multiexcerpt-include-macro opening tags (usually self-contained or with parameters)
  cleaned = cleaned.replace(/<ac:structured-macro[^>]*ac:name="multiexcerpt-include-macro"[^>]*>[\s\S]*?<\/ac:structured-macro>/g, '');
  cleaned = cleaned.replace(/<ac:structured-macro ac:name="multiexcerpt-include-macro"[^>]*>[\s\S]*?<\/ac:structured-macro>/g, '');

  // Step 2: Remove any remaining multiexcerpt opening tags (without trying to match content)
  cleaned = cleaned.replace(/<ac:structured-macro[^>]*ac:name="multiexcerpt-macro"[^>]*>/g, '');
  cleaned = cleaned.replace(/<ac:structured-macro ac:name="multiexcerpt-macro"[^>]*>/g, '');
  cleaned = cleaned.replace(/<ac:structured-macro[^>]*ac:name="multiexcerpt-include-macro"[^>]*>/g, '');
  cleaned = cleaned.replace(/<ac:structured-macro ac:name="multiexcerpt-include-macro"[^>]*>/g, '');

  // Step 3: Remove orphaned </ac:rich-text-body> tags left from multiexcerpt removal
  const finalOpenCount = (cleaned.match(/<ac:structured-macro/g) || []).length;
  const finalCloseCount = (cleaned.match(/<\/ac:structured-macro>/g) || []).length;

  // If we now have more closing tags than opening tags (orphaned closes from multiexcerpts)
  if (finalCloseCount > finalOpenCount) {
    const orphanedCount = finalCloseCount - finalOpenCount;
    // Remove that many closing tags from the end
    for (let i = 0; i < orphanedCount; i++) {
      const lastCloseIndex = cleaned.lastIndexOf('</ac:structured-macro>');
      if (lastCloseIndex !== -1) {
        cleaned = cleaned.substring(0, lastCloseIndex) + cleaned.substring(lastCloseIndex + '</ac:structured-macro>'.length);
      }
    }
  }

  // Also remove orphaned rich-text-body closing tags
  cleaned = cleaned.replace(/<\/ac:rich-text-body>\s*<\/ac:structured-macro>/g, '</ac:structured-macro>');
  cleaned = cleaned.replace(/<\/ac:rich-text-body>/g, '');

  return cleaned;
}
