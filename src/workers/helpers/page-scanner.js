/**
 * Page Scanner Module
 *
 * Handles fetching Confluence pages and detecting macros in ADF content.
 * Used by checkIncludesWorker to verify that Embed macros still exist on pages.
 */

import api, { route } from '@forge/api';

/**
 * Fetch page content from Confluence API with retry logic for transient failures
 * 
 * CRITICAL: Distinguishes between error types to prevent false positives:
 * - HTTP 404 = Could be page deleted OR permission issue (app credentials may not have access)
 *   NOTE: We do NOT mark as orphaned on 404 because we can't distinguish between these cases
 * - HTTP 403 = permission denied (may be temporary, don't mark orphaned)
 * - HTTP 401 = unauthorized (may be temporary, don't mark orphaned)
 * - HTTP 500/network error = transient failure (retry, don't mark orphaned)
 * 
 * @param {string} pageId - Confluence page ID
 * @param {number} maxRetries - Maximum number of retry attempts (default: 3)
 * @param {number} retryDelay - Initial retry delay in ms (default: 1000, exponential backoff)
 * @returns {Promise<{success: boolean, pageData?: Object, adfContent?: Object, error?: string, errorType?: string, httpStatus?: number}>}
 */
export async function fetchPageContent(pageId, maxRetries = 3, retryDelay = 1000) {
  let lastError = null;
  let lastStatus = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await api.asApp().requestConfluence(
        route`/wiki/api/v2/pages/${pageId}?body-format=atlas_doc_format`
      );

      lastStatus = response.status;

      // HTTP 404 = Page not found (legitimate deletion)
      if (response.status === 404) {
        return {
          success: false,
          error: `Page ${pageId} not found (HTTP 404)`,
          errorType: 'page_deleted',
          httpStatus: 404
        };
      }

      // HTTP 403 = Permission denied (may be temporary, don't mark as orphaned)
      if (response.status === 403) {
        return {
          success: false,
          error: `Page ${pageId} access denied (HTTP 403)`,
          errorType: 'permission_denied',
          httpStatus: 403
        };
      }

      // HTTP 401 = Unauthorized (may be temporary)
      if (response.status === 401) {
        return {
          success: false,
          error: `Page ${pageId} unauthorized (HTTP 401)`,
          errorType: 'unauthorized',
          httpStatus: 401
        };
      }

      // HTTP 5xx = Server error (transient, should retry)
      if (response.status >= 500 && response.status < 600) {
        lastError = new Error(`Server error (HTTP ${response.status})`);
        // Will retry below
      } else if (!response.ok) {
        // Other 4xx errors (except 404, 403, 401)
        return {
          success: false,
          error: `Page ${pageId} request failed (HTTP ${response.status})`,
          errorType: 'client_error',
          httpStatus: response.status
        };
      } else {
        // Success (HTTP 200-299)
        const pageData = await response.json();
        const adfContent = JSON.parse(pageData.body?.atlas_doc_format?.value || '{}');

        return {
          success: true,
          pageData,
          adfContent
        };
      }
    } catch (error) {
      lastError = error;
      // Network errors, timeouts, etc. - will retry
    }

    // If we get here, we need to retry (server error or network error)
    if (attempt < maxRetries) {
      // Exponential backoff: delay increases with each retry
      const delay = retryDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // All retries exhausted
  return {
    success: false,
    error: lastError?.message || `Failed to fetch page ${pageId} after ${maxRetries} retries`,
    errorType: 'transient_failure',
    httpStatus: lastStatus || null
  };
}

/**
 * Check if a macro with given localId exists in ADF content
 * Recursively searches through ADF structure for extension nodes with matching localId
 *
 * CRITICAL: This function determines if an embed is orphaned. False negatives
 * cause data deletion. Must check ALL possible locations for localId.
 *
 * @param {Object} node - ADF node to search
 * @param {string} targetLocalId - localId to find
 * @param {number} depth - Current recursion depth (internal use)
 * @param {Set} visited - Set of visited node references for cycle detection (internal use)
 * @returns {boolean} True if macro exists in ADF
 */
export function checkMacroExistsInADF(node, targetLocalId, depth = 0, visited = new Set()) {
  // CRITICAL: Validate targetLocalId to prevent false positives
  // If localId is invalid, we should return false (macro not found) but this should
  // be caught by validation in the calling code before reaching here
  if (!targetLocalId || typeof targetLocalId !== 'string' || targetLocalId.trim() === '') {
    // Invalid localId - can't search for it, return false
    // NOTE: This should be validated in calling code, but defensive check here prevents crashes
    return false;
  }

  // Safety: Maximum depth limit to prevent stack overflow
  const MAX_DEPTH = 100;
  if (depth > MAX_DEPTH) {
    return false;
  }

  if (!node || typeof node !== 'object') {
    return false;
  }

  // Safety: Cycle detection
  if (visited.has(node)) {
    return false;
  }
  visited.add(node);

  /**
   * Check ALL possible locations for localId in a node
   * ADF structure can vary, so we check multiple possible paths
   */
  function checkLocalIdInNode(nodeToCheck) {
    if (!nodeToCheck || typeof nodeToCheck !== 'object') {
      return false;
    }

    // Primary location: node.attrs.localId
    if (nodeToCheck.attrs?.localId === targetLocalId) {
      return true;
    }

    // Alternative location: node.attrs.parameters.localId
    if (nodeToCheck.attrs?.parameters?.localId === targetLocalId) {
      return true;
    }

    // Alternative location: node.attrs.parameters.macroParams.localId
    if (nodeToCheck.attrs?.parameters?.macroParams?.localId === targetLocalId) {
      return true;
    }

    // Alternative location: node.attrs.parameters.macroParams.localId.value
    if (nodeToCheck.attrs?.parameters?.macroParams?.localId?.value === targetLocalId) {
      return true;
    }

    return false;
  }

  // Check if this node is an extension or bodiedExtension (macro)
  if (node.type === 'extension' || node.type === 'bodiedExtension') {
    // First, check if localId matches in any location
    if (checkLocalIdInNode(node)) {
      visited.delete(node);
      return true;
    }

    // Also check for Blueprint Standard Embed macro by extensionKey
    // NOTE: Forge apps use full path in extensionKey like:
    // "be1ff96b-.../static/blueprint-standard-embed"
    // So we check if the key CONTAINS or ENDS WITH our macro name
    const extensionKey = node.attrs?.extensionKey || '';
    const isOurMacro = extensionKey.includes('blueprint-standard-embed') ||
                       extensionKey.includes('smart-excerpt-include') || // Legacy name
                       extensionKey.includes('blueprint-standard-embed-poc') || // POC version
                       extensionKey === 'blueprint-standard-embed' || // Exact match (just in case)
                       extensionKey === 'smart-excerpt-include' || // Exact match legacy
                       extensionKey === 'blueprint-standard-embed-poc'; // Exact match POC

    if (isOurMacro) {
      // If it's our macro and localId matches, return true
      if (checkLocalIdInNode(node)) {
        visited.delete(node);
        return true;
      }
    }

    // Also check if extensionType matches (broader check for any Confluence/Forge macro)
    if (node.attrs?.extensionType === 'com.atlassian.confluence.macro.core' ||
        node.attrs?.extensionType === 'com.atlassian.ecosystem') {
      // This is a Confluence or Forge macro - check if localId matches regardless of extensionKey
      if (checkLocalIdInNode(node)) {
        visited.delete(node);
        return true;
      }
    }
  }

  // Recursively check content array
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      if (checkMacroExistsInADF(child, targetLocalId, depth + 1, visited)) {
        visited.delete(node);
        return true;
      }
    }
  }

  // Remove from visited when backtracking (allows same node in different branches)
  visited.delete(node);

  // Note: Marks array typically doesn't contain macros, but we keep the check
  // for completeness. However, we don't recurse into marks to avoid false positives
  // from nested structures that aren't actually macros.

  return false;
}

/**
 * Group includes by pageId for efficient batch processing
 * @param {Array} includes - Array of include references
 * @returns {Object} Map of pageId -> array of includes on that page
 */
export function groupIncludesByPage(includes) {
  const includesByPage = {};
  includes.forEach(include => {
    if (!includesByPage[include.pageId]) {
      includesByPage[include.pageId] = [];
    }
    includesByPage[include.pageId].push(include);
  });
  return includesByPage;
}
