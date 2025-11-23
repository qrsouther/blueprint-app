/**
 * Redline Resolvers
 *
 * Backend API for the Redlining system - a queue-based review and approval workflow
 * for tracking the completeness/readiness of individual Embed instances.
 *
 * Core Features:
 * - Granular status tracking per Embed instance
 * - Automatic status transitions when approved content is modified
 * - Queue filtering, sorting, and grouping
 * - User avatar integration via Confluence API
 * - Audit trail for all status changes
 *
 * Status Types:
 * - "reviewable" - Ready for initial review
 * - "pre-approved" - Content finalized but not fully approved
 * - "needs-revision" - Requires changes/corrections
 * - "approved" - Fully approved and good-to-go
 *
 * Storage Schema (added to macro-vars:{localId}):
 * {
 *   redlineStatus: "reviewable" | "pre-approved" | "needs-revision" | "approved",
 *   approvedContentHash: "abc123...",  // Hash when status set to "approved"
 *   approvedBy: "5e7f419c...",         // Confluence accountId
 *   approvedAt: "2025-01-15T10:30:00.000Z",
 *   statusHistory: [
 *     { status, changedBy, changedAt, reason }
 *   ]
 * }
 */

import { storage, startsWith } from '@forge/api';
import api, { route } from '@forge/api';
import { listVersions } from '../utils/version-manager.js';
import { logPhase, logSuccess, logFailure, logWarning } from '../utils/forge-logger.js';

/**
 * Get redline queue with filtering, sorting, and grouping
 *
 * @param {Object} req.payload
 * @param {Object} req.payload.filters - Filter criteria { status: [], pageIds: [], excerptIds: [] }
 * @param {string} req.payload.sortBy - Sort field: "status" | "page" | "source" | "updated"
 * @param {string|null} req.payload.groupBy - Group field: "status" | "page" | "source" | null
 * @returns {Object} { embeds: [...], groups: {...} }
 */
export async function getRedlineQueue(req) {
  const { filters = {}, sortBy = 'status', groupBy = null } = req.payload || {};

  try {
    // Input validation
    if (filters !== undefined && (typeof filters !== 'object' || Array.isArray(filters) || filters === null)) {
      logFailure('getRedlineQueue', 'Validation failed: filters must be an object', new Error('Invalid filters type'));
      return {
        success: false,
        error: 'filters must be an object',
        embeds: [],
        groups: {}
      };
    }

    if (sortBy !== undefined && typeof sortBy !== 'string') {
      logFailure('getRedlineQueue', 'Validation failed: sortBy must be a string', new Error('Invalid sortBy type'));
      return {
        success: false,
        error: 'sortBy must be a string',
        embeds: [],
        groups: {}
      };
    }

    if (groupBy !== undefined && groupBy !== null && typeof groupBy !== 'string') {
      logFailure('getRedlineQueue', 'Validation failed: groupBy must be a string or null', new Error('Invalid groupBy type'));
      return {
        success: false,
        error: 'groupBy must be a string or null',
        embeds: [],
        groups: {}
      };
    }
    // Get all macro-vars:* keys (Embed configs)
    // Note: getMany() has a default limit, so we need to paginate through all results
    let allKeys = [];
    let cursor = undefined;

    do {
      const batch = await storage.query()
        .where('key', startsWith('macro-vars:'))
        .limit(100)
        .cursor(cursor)
        .getMany();

      allKeys = allKeys.concat(batch.results);
      cursor = batch.nextCursor;
    } while (cursor);

    logPhase('getRedlineQueue', 'Fetched Embed configs', { count: allKeys.length });

    // Load all Embed configs
    const embedConfigs = await Promise.all(
      allKeys.map(async (item) => {
        const localId = item.key.replace('macro-vars:', '');
        const config = item.value;

        // Fetch excerpt details for display
        let excerptData = null;
        if (config.excerptId) {
          const excerptKey = `excerpt:${config.excerptId}`;
          excerptData = await storage.get(excerptKey);
        }

        // Fetch page details via Confluence API (v2)
        let pageData = null;
        if (config.pageId) {
          try {
            const pageResponse = await api.asApp().requestConfluence(
              route`/wiki/api/v2/pages/${config.pageId}`
            );
            pageData = await pageResponse.json();
          } catch (error) {
            logWarning('getRedlineQueue', 'Failed to fetch page', { pageId: config.pageId, error: error.message });
          }
        }

        return {
          localId,
          excerptId: config.excerptId,
          sourceName: excerptData?.name || 'Unknown Source',
          sourceCategory: excerptData?.category || 'Uncategorized',
          pageId: config.pageId,
          pageTitle: pageData?.title || (config.pageId ? `Page ${config.pageId}` : 'Unknown Page'),
          spaceKey: pageData?.spaceId || 'Unknown',
          variableValues: config.variableValues || {},
          toggleStates: config.toggleStates || {},
          customInsertions: config.customInsertions || [],
          internalNotes: config.internalNotes || [],
          cachedContent: config.cachedContent,
          syncedContent: config.syncedContent,
          redlineStatus: config.redlineStatus || 'reviewable', // Default to reviewable
          approvedContentHash: config.approvedContentHash,
          approvedBy: config.approvedBy,
          approvedAt: config.approvedAt,
          lastSynced: config.lastSynced,
          updatedAt: config.updatedAt
        };
      })
    );

    // Apply filters
    let filteredEmbeds = embedConfigs;

    if (filters.status && filters.status.length > 0 && filters.status[0] !== 'all') {
      filteredEmbeds = filteredEmbeds.filter(embed =>
        filters.status.includes(embed.redlineStatus)
      );
    }

    if (filters.pageIds && filters.pageIds.length > 0) {
      filteredEmbeds = filteredEmbeds.filter(embed =>
        filters.pageIds.includes(embed.pageId)
      );
    }

    if (filters.excerptIds && filters.excerptIds.length > 0) {
      filteredEmbeds = filteredEmbeds.filter(embed =>
        filters.excerptIds.includes(embed.excerptId)
      );
    }

    // Search filter - matches Page Title or Embed UUID
    if (filters.searchTerm && filters.searchTerm.trim()) {
      const searchLower = filters.searchTerm.toLowerCase().trim();
      filteredEmbeds = filteredEmbeds.filter(embed => {
        const pageTitleMatch = embed.pageTitle?.toLowerCase().includes(searchLower);
        const uuidMatch = embed.localId?.toLowerCase().includes(searchLower);
        return pageTitleMatch || uuidMatch;
      });
    }

    // Sort
    filteredEmbeds.sort((a, b) => {
      switch (sortBy) {
        case 'status': {
          // Reviewable is highest priority (appears first)
          const statusOrder = { 'reviewable': 0, 'needs-revision': 1, 'pre-approved': 2, 'approved': 3 };
          return statusOrder[a.redlineStatus] - statusOrder[b.redlineStatus];
        }

        case 'page':
          return a.pageTitle.localeCompare(b.pageTitle);

        case 'source':
          return a.sourceName.localeCompare(b.sourceName);

        case 'updated':
          return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);

        default:
          return 0;
      }
    });

    // Group if requested
    if (groupBy) {
      const groups = {};

      filteredEmbeds.forEach(embed => {
        let groupKey;
        switch (groupBy) {
          case 'status':
            groupKey = embed.redlineStatus;
            break;
          case 'page':
            groupKey = embed.pageTitle;
            break;
          case 'source':
            groupKey = embed.sourceName;
            break;
          default:
            groupKey = 'Other';
        }

        if (!groups[groupKey]) {
          groups[groupKey] = [];
        }
        groups[groupKey].push(embed);
      });

      return { embeds: filteredEmbeds, groups };
    }

    return { embeds: filteredEmbeds, groups: null };

  } catch (error) {
    logFailure('getRedlineQueue', 'Error loading redline queue', error);
    return {
      success: false,
      error: `Failed to load redline queue: ${error.message}`,
      embeds: [],
      groups: null
    };
  }
}

/**
 * Set redline status for a single Embed
 *
 * @param {Object} req.payload
 * @param {string} req.payload.localId - Embed instance ID
 * @param {string} req.payload.status - New status
 * @param {string} req.payload.userId - Confluence accountId of user making change
 * @param {string} req.payload.reason - Reason for status change
 * @returns {Object} { success: true, localId, newStatus }
 */
export async function setRedlineStatus(req) {
  const { localId, status, userId, reason = '' } = req.payload || {};

  // Input validation
  if (!localId || typeof localId !== 'string' || localId.trim() === '') {
    logFailure('setRedlineStatus', 'Validation failed: localId is required and must be a non-empty string', new Error('Invalid localId'));
    return {
      success: false,
      error: 'localId is required and must be a non-empty string'
    };
  }

  if (!status || typeof status !== 'string') {
    logFailure('setRedlineStatus', 'Validation failed: status is required and must be a string', new Error('Invalid status'));
    return {
      success: false,
      error: 'status is required and must be a string'
    };
  }

  if (!['reviewable', 'pre-approved', 'needs-revision', 'approved'].includes(status)) {
    logFailure('setRedlineStatus', 'Validation failed: status must be one of: reviewable, pre-approved, needs-revision, approved', new Error('Invalid status value'));
    return {
      success: false,
      error: `Invalid status: ${status}. Must be one of: reviewable, pre-approved, needs-revision, approved`
    };
  }

  if (userId !== undefined && userId !== null && (typeof userId !== 'string' || userId.trim() === '')) {
    logFailure('setRedlineStatus', 'Validation failed: userId must be a non-empty string if provided', new Error('Invalid userId'));
    return {
      success: false,
      error: 'userId must be a non-empty string if provided'
    };
  }

  if (reason !== undefined && typeof reason !== 'string') {
    logFailure('setRedlineStatus', 'Validation failed: reason must be a string', new Error('Invalid reason type'));
    return {
      success: false,
      error: 'reason must be a string'
    };
  }

  try {
    // Load current Embed config
    const configKey = `macro-vars:${localId}`;
    const config = await storage.get(configKey);

    if (!config) {
      logFailure('setRedlineStatus', 'Embed config not found', new Error('Embed config not found'), { localId });
      return {
        success: false,
        error: `Embed config not found for localId: ${localId}`
      };
    }

    const now = new Date().toISOString();
    const previousStatus = config.redlineStatus || 'reviewable';

    // Initialize statusHistory if it doesn't exist
    const statusHistory = config.statusHistory || [];

    // If setting to "approved", get contentHash from version system
    let approvedContentHash = config.approvedContentHash;
    let approvedBy = config.approvedBy;
    let approvedAt = config.approvedAt;

    if (status === 'approved') {
      // Query version system for latest Embed version
      const versionsResult = await listVersions(storage, localId);

      if (versionsResult.success && versionsResult.versions.length > 0) {
        // Get latest version's contentHash (versions are sorted newest first)
        const latestVersion = versionsResult.versions[0];
        approvedContentHash = latestVersion.contentHash;

        logPhase('setRedlineStatus', 'Approving Embed with contentHash', { localId, contentHash: approvedContentHash });
      } else {
        logWarning('setRedlineStatus', 'No version history found for Embed', { localId });
        // Still allow approval, but without contentHash tracking
        approvedContentHash = null;
      }

      approvedBy = userId;
      approvedAt = now;
    }

    // Add to status history
    statusHistory.push({
      status,
      previousStatus,
      changedBy: userId,
      changedAt: now,
      reason
    });

    // Update config
    const updatedConfig = {
      ...config,
      redlineStatus: status,
      approvedContentHash,
      approvedBy,
      approvedAt,
      lastChangedBy: userId, // Track who made the current status change
      lastChangedAt: now,
      statusHistory,
      updatedAt: now
    };

    await storage.set(configKey, updatedConfig);

    logSuccess('setRedlineStatus', 'Status updated', { localId, previousStatus, newStatus: status, userId });

    return {
      success: true,
      localId,
      newStatus: status,
      previousStatus,
      approvedContentHash
    };

  } catch (error) {
    logFailure('setRedlineStatus', 'Error setting redline status', error, { localId: req.payload?.localId });
    return {
      success: false,
      error: `Failed to set redline status: ${error.message}`
    };
  }
}

/**
 * Bulk status update for multiple Embeds
 *
 * NOTE: This function exists for backend/internal use only. The Admin UI does NOT
 * support bulk status updates - users can only update one Embed at a time.
 * This function is kept for potential future use or programmatic access.
 *
 * @param {Object} req.payload
 * @param {string[]} req.payload.localIds - Array of Embed instance IDs
 * @param {string} req.payload.status - New status for all
 * @param {string} req.payload.userId - Confluence accountId
 * @param {string} req.payload.reason - Reason for bulk change
 * @returns {Object} { success: true, updated: 10, failed: 2, errors: [...] }
 */
export async function bulkSetRedlineStatus(req) {
  const { localIds, status, userId, reason = 'Bulk status update' } = req.payload || {};

  // Input validation
  if (!localIds || !Array.isArray(localIds) || localIds.length === 0) {
    logFailure('bulkSetRedlineStatus', 'Validation failed: localIds is required and must be a non-empty array', new Error('Invalid localIds'));
    return {
      success: false,
      error: 'localIds is required and must be a non-empty array',
      updated: 0,
      failed: 0,
      errors: []
    };
  }

  // Validate each localId in the array
  for (let i = 0; i < localIds.length; i++) {
    if (!localIds[i] || typeof localIds[i] !== 'string' || localIds[i].trim() === '') {
      logFailure('bulkSetRedlineStatus', 'Validation failed: all localIds must be non-empty strings', new Error('Invalid localId in array'));
      return {
        success: false,
        error: `localIds[${i}] must be a non-empty string`,
        updated: 0,
        failed: 0,
        errors: []
      };
    }
  }

  if (!status || typeof status !== 'string') {
    logFailure('bulkSetRedlineStatus', 'Validation failed: status is required and must be a string', new Error('Invalid status'));
    return {
      success: false,
      error: 'status is required and must be a string',
      updated: 0,
      failed: 0,
      errors: []
    };
  }

  if (!['reviewable', 'pre-approved', 'needs-revision', 'approved'].includes(status)) {
    logFailure('bulkSetRedlineStatus', 'Validation failed: status must be one of: reviewable, pre-approved, needs-revision, approved', new Error('Invalid status value'));
    return {
      success: false,
      error: `Invalid status: ${status}. Must be one of: reviewable, pre-approved, needs-revision, approved`,
      updated: 0,
      failed: 0,
      errors: []
    };
  }

  if (userId !== undefined && userId !== null && (typeof userId !== 'string' || userId.trim() === '')) {
    logFailure('bulkSetRedlineStatus', 'Validation failed: userId must be a non-empty string if provided', new Error('Invalid userId'));
    return {
      success: false,
      error: 'userId must be a non-empty string if provided',
      updated: 0,
      failed: 0,
      errors: []
    };
  }

  if (reason !== undefined && typeof reason !== 'string') {
    logFailure('bulkSetRedlineStatus', 'Validation failed: reason must be a string', new Error('Invalid reason type'));
    return {
      success: false,
      error: 'reason must be a string',
      updated: 0,
      failed: 0,
      errors: []
    };
  }

  const results = {
    success: true,
    updated: 0,
    failed: 0,
    errors: []
  };

  for (const localId of localIds) {
    try {
      const result = await setRedlineStatus({
        payload: { localId, status, userId, reason }
      });
      if (result.success) {
        results.updated++;
      } else {
        results.failed++;
        results.errors.push({
          localId,
          error: result.error || 'Unknown error'
        });
        logFailure('bulkSetRedlineStatus', 'Failed to update status', new Error(result.error), { localId });
      }
    } catch (error) {
      results.failed++;
      results.errors.push({
        localId,
        error: error.message
      });
      logFailure('bulkSetRedlineStatus', 'Failed to update status', error, { localId });
    }
  }

  logSuccess('bulkSetRedlineStatus', 'Bulk update completed', { updated: results.updated, failed: results.failed });

  return results;
}

/**
 * Check if an Embed needs re-review (content changed after approval)
 *
 * @param {Object} req.payload
 * @param {string} req.payload.localId - Embed instance ID
 * @returns {Object} { isStale: boolean, currentHash, approvedHash }
 */
export async function checkRedlineStale(req) {
  const { localId } = req.payload || {};

  // Input validation
  if (!localId || typeof localId !== 'string' || localId.trim() === '') {
    logFailure('checkRedlineStale', 'Validation failed: localId is required and must be a non-empty string', new Error('Invalid localId'));
    return {
      success: false,
      error: 'localId is required and must be a non-empty string'
    };
  }

  try {
    // Load Embed config
    const configKey = `macro-vars:${localId}`;
    const config = await storage.get(configKey);

    if (!config) {
      logFailure('setRedlineStatus', 'Embed config not found', new Error('Embed config not found'), { localId });
      return {
        success: false,
        error: `Embed config not found for localId: ${localId}`
      };
    }

    // If not approved, can't be stale
    if (config.redlineStatus !== 'approved' || !config.approvedContentHash) {
      return {
        isStale: false,
        reason: 'Not approved yet',
        currentHash: null,
        approvedHash: null
      };
    }

    // Query version system for latest Embed version
    const versionsResult = await listVersions(storage, localId);

    if (!versionsResult.success || versionsResult.versions.length === 0) {
      logWarning('checkRedlineStale', 'No version history found for Embed', { localId });
      return {
        isStale: false,
        reason: 'No version history available',
        currentHash: null,
        approvedHash: config.approvedContentHash
      };
    }

    // Get latest version's contentHash
    const latestVersion = versionsResult.versions[0];
    const currentHash = latestVersion.contentHash;

    const isStale = currentHash !== config.approvedContentHash;

    return {
      isStale,
      currentHash,
      approvedHash: config.approvedContentHash,
      reason: isStale ? 'Content modified after approval' : 'Content unchanged'
    };

  } catch (error) {
    logFailure('checkRedlineStale', 'Error checking redline staleness', error, { localId: req.payload?.localId });
    return {
      success: false,
      error: `Failed to check redline staleness: ${error.message}`
    };
  }
}

/**
 * Get Confluence user data for avatar/name display
 *
 * @param {Object} req.payload
 * @param {string} req.payload.accountId - Confluence user accountId
 * @returns {Object} User data with avatar URL
 */
export async function getConfluenceUser(req) {
  const { accountId } = req.payload || {};

  // Input validation
  if (!accountId || typeof accountId !== 'string' || accountId.trim() === '') {
    logFailure('getConfluenceUser', 'Validation failed: accountId is required and must be a non-empty string', new Error('Invalid accountId'));
    return {
      accountId: accountId || 'unknown',
      displayName: 'Unknown User',
      publicName: 'Unknown User',
      profilePicture: {
        path: null,
        isDefault: true
      },
      error: 'accountId is required and must be a non-empty string'
    };
  }

  // System user (for automatic transitions)
  if (accountId === 'system') {
    return {
      accountId: 'system',
      displayName: 'System',
      publicName: 'System',
      profilePicture: {
        path: null,
        isDefault: true
      }
    };
  }

  try {
    const response = await api.asApp().requestConfluence(
      route`/wiki/rest/api/user?accountId=${accountId}`
    );

    if (!response.ok) {
      const error = new Error(`Confluence API returned ${response.status}: ${response.statusText}`);
      logFailure('getConfluenceUser', 'Confluence API error', error, { accountId, status: response.status });
      // Return fallback data instead of throwing
      return {
        accountId,
        displayName: 'Unknown User',
        publicName: 'Unknown User',
        profilePicture: {
          path: null,
          isDefault: true
        },
        error: error.message
      };
    }

    const userData = await response.json();

    return {
      accountId: userData.accountId,
      displayName: userData.displayName || userData.publicName,
      publicName: userData.publicName,
      email: userData.email,
      profilePicture: userData.profilePicture || {
        path: null,
        isDefault: true
      }
    };

  } catch (error) {
    logFailure('getConfluenceUser', 'Error fetching Confluence user', error, { accountId });
    // Return fallback data instead of throwing
    return {
      accountId,
      displayName: 'Unknown User',
      publicName: 'Unknown User',
      profilePicture: {
        path: null,
        isDefault: true
      },
      error: error.message
    };
  }
}

/**
 * Get redline statistics (counts by status)
 *
 * @returns {Object} { reviewable: 10, preApproved: 5, needsRevision: 3, approved: 50, total: 68 }
 */
export async function getRedlineStats() {
  try {
    // Get all macro-vars:* keys with pagination
    let allKeys = [];
    let cursor = undefined;

    do {
      const batch = await storage.query()
        .where('key', startsWith('macro-vars:'))
        .limit(100)
        .cursor(cursor)
        .getMany();

      allKeys = allKeys.concat(batch.results);
      cursor = batch.nextCursor;
    } while (cursor);

    const stats = {
      reviewable: 0,
      preApproved: 0,
      needsRevision: 0,
      approved: 0,
      total: 0
    };

    // Count by status
    for (const item of allKeys) {
      const config = item.value;
      const status = config.redlineStatus || 'reviewable';

      stats.total++;

      switch (status) {
        case 'reviewable':
          stats.reviewable++;
          break;
        case 'pre-approved':
          stats.preApproved++;
          break;
        case 'needs-revision':
          stats.needsRevision++;
          break;
        case 'approved':
          stats.approved++;
          break;
      }
    }

    return stats;

  } catch (error) {
    logFailure('getRedlineStats', 'Error getting redline stats', error);
    return {
      success: false,
      error: `Failed to get redline stats: ${error.message}`,
      reviewable: 0,
      preApproved: 0,
      needsRevision: 0,
      approved: 0,
      total: 0
    };
  }
}

/**
 * Post inline comment to Confluence page near the Embed macro
 *
 * @param {Object} req.payload
 * @param {string} req.payload.localId - Embed instance ID
 * @param {string} req.payload.pageId - Confluence page ID where Embed is located
 * @param {string} req.payload.commentText - Comment text to post
 * @param {string} req.payload.userId - Confluence accountId of user posting comment
 * @returns {Object} { success: true, commentId, location }
 */
export async function postRedlineComment(req) {
  const { localId, pageId, commentText } = req.payload || {};

  // Input validation
  if (!localId || typeof localId !== 'string' || localId.trim() === '') {
    logFailure('postRedlineComment', 'Validation failed: localId is required and must be a non-empty string', new Error('Invalid localId'));
    return {
      success: false,
      error: 'localId is required and must be a non-empty string'
    };
  }

  if (!pageId || typeof pageId !== 'string' || pageId.trim() === '') {
    logFailure('postRedlineComment', 'Validation failed: pageId is required and must be a non-empty string', new Error('Invalid pageId'));
    return {
      success: false,
      error: 'pageId is required and must be a non-empty string'
    };
  }

  if (!commentText || typeof commentText !== 'string' || !commentText.trim()) {
    logFailure('postRedlineComment', 'Validation failed: commentText is required and must be a non-empty string', new Error('Invalid commentText'));
    return {
      success: false,
      error: 'commentText is required and must be a non-empty string'
    };
  }

  try {
    // Step 1: Fetch page content (ADF) from Confluence
    logPhase('postRedlineComment', 'Fetching page content', { pageId });

    const pageResponse = await api.asUser().requestConfluence(
      route`/wiki/api/v2/pages/${pageId}?body-format=atlas_doc_format`
    );

    if (!pageResponse.ok) {
      const error = new Error(`Failed to fetch page: ${pageResponse.status} ${pageResponse.statusText}`);
      logFailure('postRedlineComment', 'Failed to fetch page', error, { pageId, status: pageResponse.status });
      return {
        success: false,
        error: error.message
      };
    }

    const pageData = await pageResponse.json();

    // The ADF value is returned as a JSON string, so we need to parse it
    const adfString = pageData.body?.atlas_doc_format?.value;

    if (!adfString) {
      logFailure('postRedlineComment', 'Page ADF content not found in API response', new Error('Missing ADF content'), { pageId });
      return {
        success: false,
        error: 'Page ADF content not found in API response'
      };
    }

    let adfContent;
    try {
      adfContent = JSON.parse(adfString);
    } catch (parseError) {
      logFailure('postRedlineComment', 'Failed to parse ADF content', parseError, { pageId });
      return {
        success: false,
        error: `Failed to parse ADF content: ${parseError.message}`
      };
    }

    logPhase('postRedlineComment', 'Fetched and parsed page ADF', { pageTitle: pageData.title, nodeCount: adfContent?.content?.length || 0 });

    // Step 2: Navigate ADF to find the Embed macro and nearby text for inline comment
    const { textSelection, matchCount, matchIndex } = findTextNearEmbed(adfContent, localId);

    if (!textSelection) {
      logFailure('postRedlineComment', 'Could not find suitable text near Embed', new Error('No text selection found'), { localId, pageId });
      return {
        success: false,
        error: `Could not find suitable text near Embed ${localId} for inline comment`
      };
    }

    logPhase('postRedlineComment', 'Found text selection for inline comment', { textSelection, matchIndex: matchIndex + 1, matchCount });

    // Step 3: Post inline comment to Confluence
    const commentBody = {
      pageId,
      body: {
        representation: 'storage',
        value: `<p>${commentText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`
      },
      inlineCommentProperties: {
        textSelection,
        textSelectionMatchCount: matchCount,
        textSelectionMatchIndex: matchIndex
      }
    };

    const commentResponse = await api.asUser().requestConfluence(
      route`/wiki/api/v2/inline-comments`,
      {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(commentBody)
      }
    );

    if (!commentResponse.ok) {
      const errorText = await commentResponse.text();
      const error = new Error(`Failed to post comment: ${commentResponse.status} ${commentResponse.statusText} - ${errorText}`);
      logFailure('postRedlineComment', 'Failed to post comment', error, { pageId, localId, status: commentResponse.status });
      return {
        success: false,
        error: error.message
      };
    }

    const commentData = await commentResponse.json();

    logSuccess('postRedlineComment', 'Successfully posted inline comment', { commentId: commentData.id, pageId, localId });

    return {
      success: true,
      commentId: commentData.id,
      textSelection,
      location: `match ${matchIndex + 1} of ${matchCount}`
    };

  } catch (error) {
    logFailure('postRedlineComment', 'Error posting inline comment', error, { pageId, localId });
    return {
      success: false,
      error: `Failed to post inline comment: ${error.message}`
    };
  }
}

/**
 * Find suitable text near an Embed macro for inline comment targeting
 *
 * Strategy:
 * 1. Find the Embed macro (extension node) with matching localId
 * 2. Look for the closest heading before the macro
 * 3. If no heading, look for the first text paragraph after the macro
 * 4. Count occurrences of that text in the document
 *
 * @param {Object} adfContent - ADF document
 * @param {string} targetLocalId - Embed localId to find
 * @returns {Object} { textSelection, matchCount, matchIndex } or { textSelection: null }
 */
function findTextNearEmbed(adfContent, targetLocalId) {
  // Track all content nodes in order for finding previous/next elements
  const contentNodes = [];
  let embedNodeIndex = -1;
  let extensionNodesFound = 0;

  // Recursively walk the ADF tree to collect all content nodes
  function walkAdf(node, depth = 0) {
    if (!node || typeof node !== 'object') return;

    // Count extension nodes
    if (node.type === 'extension') {
      extensionNodesFound++;
    }

    // Check if this is our target Embed macro
    // The localId can be in multiple locations depending on macro type
    const nodeLocalId = node.attrs?.localId ||
                        node.attrs?.parameters?.localId ||
                        node.attrs?.parameters?.macroParams?.localId?.value;

    if (
      node.type === 'extension' &&
      nodeLocalId === targetLocalId
    ) {
      embedNodeIndex = contentNodes.length;
    }

    // Collect this node if it has useful content
    contentNodes.push(node);

    // Recurse into content array
    if (Array.isArray(node.content)) {
      node.content.forEach(child => walkAdf(child, depth + 1));
    }
  }

  walkAdf(adfContent);

  if (embedNodeIndex === -1) {
    logWarning('findTextNearEmbed', 'Could not find Embed with localId', { targetLocalId, extensionNodesFound });
    return { textSelection: null };
  }

  // Strategy 1: Look backwards for the closest heading
  for (let i = embedNodeIndex - 1; i >= 0; i--) {
    const node = contentNodes[i];
    if (node.type === 'heading' && node.content && node.content.length > 0) {
      const headingText = extractText(node);
      if (headingText && headingText.trim().length > 0) {
        const { matchCount, matchIndex } = countTextOccurrences(adfContent, headingText);
        return { textSelection: headingText, matchCount, matchIndex };
      }
    }
  }

  // Strategy 2: Look forward for the first paragraph with text
  for (let i = embedNodeIndex + 1; i < contentNodes.length; i++) {
    const node = contentNodes[i];
    if (node.type === 'paragraph' && node.content && node.content.length > 0) {
      const paraText = extractText(node);
      if (paraText && paraText.trim().length > 0) {
        const { matchCount, matchIndex } = countTextOccurrences(adfContent, paraText);
        return { textSelection: paraText, matchCount, matchIndex };
      }
    }
  }

  logWarning('findTextNearEmbed', 'Could not find suitable text near Embed', { targetLocalId });
  return { textSelection: null };
}

/**
 * Extract plain text from an ADF node
 */
function extractText(node) {
  if (!node) return '';

  if (node.type === 'text') {
    return node.text || '';
  }

  if (Array.isArray(node.content)) {
    return node.content.map(extractText).join('');
  }

  return '';
}

/**
 * Count how many times text appears in ADF document and find the index of the first occurrence
 */
function countTextOccurrences(adfContent, targetText) {
  const allText = extractText(adfContent);
  let count = 0;
  let matchIndex = 0;
  let lastIndex = 0;

  // Count occurrences
  while ((lastIndex = allText.indexOf(targetText, lastIndex)) !== -1) {
    if (count === 0) {
      matchIndex = count; // First occurrence
    }
    count++;
    lastIndex += targetText.length;
  }

  return { matchCount: count, matchIndex };
}
