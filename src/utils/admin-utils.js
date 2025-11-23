/**
 * Admin Utility Functions
 *
 * Utility functions for the Blueprint Standards Admin page.
 * Includes CSV generation, data escaping, filtering, sorting, and other helper functions.
 *
 * Key functions:
 * - escapeCSV: Escape values for CSV format
 * - generateIncludesCSV: Generate CSV export for embed instances
 * - generateMultiExcerptCSV: Generate CSV for MultiExcerpt migration data
 * - filterExcerpts: Filter excerpts by search term and category
 * - sortExcerpts: Sort excerpts by various criteria
 * - calculateStalenessStatus: Determine if an embed is stale
 */

import { extractTextFromAdf } from './adf-utils.js';

/**
 * Escape a value for CSV format
 *
 * Handles quotes, commas, and newlines according to CSV spec.
 * Wraps values in quotes if they contain special characters.
 *
 * @param {*} value - The value to escape
 * @returns {string} Escaped CSV value
 */
export const escapeCSV = (value) => {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes('"') || str.includes(',') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

/**
 * Generate CSV export for embed instances
 *
 * Creates a CSV file with all embed data including:
 * - Page info (URL, title, anchor)
 * - Standard info (name, category, status)
 * - Variable values
 * - Toggle states
 * - Custom insertions
 * - Rendered content
 *
 * @param {Array} includesData - Array of embed instance objects
 * @returns {string} CSV string ready for download
 */
export const generateIncludesCSV = (includesData) => {
  if (!includesData || includesData.length === 0) {
    return '';
  }

  // Collect all unique variable names and toggle names
  const allVariableNames = new Set();
  const allToggleNames = new Set();

  includesData.forEach(inc => {
    if (inc.variables) {
      inc.variables.forEach(v => allVariableNames.add(v.name));
    }
    if (inc.toggles) {
      inc.toggles.forEach(t => allToggleNames.add(t.name));
    }
  });

  const variableColumns = Array.from(allVariableNames).sort();
  const toggleColumns = Array.from(allToggleNames).sort();

  // Build CSV header
  const headers = [
    'Page URL',
    'Page Title',
    'Heading Anchor',
    'Standard Name',
    'Standard Category',
    'Status',
    'Last Synced',
    'Standard Last Modified',
    ...variableColumns.map(v => `Variable: ${v}`),
    ...toggleColumns.map(t => `Toggle: ${t}`),
    'Custom Insertions',
    'Rendered Content (Plain Text)'
  ];

  // Build CSV rows
  const rows = includesData.map(inc => {
    const row = [
      escapeCSV(inc.pageUrl || ''),
      escapeCSV(inc.pageTitle || ''),
      escapeCSV(inc.headingAnchor || ''),
      escapeCSV(inc.excerptName || ''),
      escapeCSV(inc.excerptCategory || ''),
      escapeCSV(inc.status || ''),
      escapeCSV(inc.lastSynced || ''),
      escapeCSV(inc.excerptLastModified || '')
    ];

    // Add variable values
    variableColumns.forEach(varName => {
      const value = inc.variableValues?.[varName] || '';
      row.push(escapeCSV(value));
    });

    // Add toggle states
    toggleColumns.forEach(toggleName => {
      const state = inc.toggleStates?.[toggleName] || false;
      row.push(escapeCSV(state ? 'Enabled' : 'Disabled'));
    });

    // Add custom insertions text (concatenated with " | " delimiter)
    const customInsertionsText = (inc.customInsertions || [])
      .map(insertion => insertion.text || '')
      .filter(text => text.length > 0)
      .join(' | ');
    row.push(escapeCSV(customInsertionsText));

    // Add rendered content (convert ADF to plain text)
    let renderedText = '';
    if (inc.renderedContent) {
      // If renderedContent is an ADF object, extract text
      if (typeof inc.renderedContent === 'object') {
        renderedText = extractTextFromAdf(inc.renderedContent);
      } else {
        // If it's already a string, use it directly
        renderedText = inc.renderedContent;
      }
    }
    row.push(escapeCSV(renderedText));

    return row.join(',');
  });

  // Combine header and rows
  return [headers.join(','), ...rows].join('\n');
};

/**
 * Generate CSV export for a single Source's usage data
 *
 * Creates a CSV file with all embed instances for a specific Source.
 * Similar to generateIncludesCSV but works with the usage data structure
 * from the Usage details table.
 *
 * @param {Array} usageData - Array of usage reference objects from getExcerptUsage
 * @param {Object} excerpt - The Source excerpt object (contains name, category, variables, toggles)
 * @returns {string} CSV string ready for download
 */
export const generateSourceUsageCSV = (usageData, excerpt) => {
  if (!usageData || usageData.length === 0) {
    return '';
  }

  const excerptName = excerpt?.name || 'Unknown Source';
  const excerptCategory = excerpt?.category || 'General';
  const excerptLastModified = excerpt?.updatedAt || '';
  const variables = Array.isArray(excerpt?.variables) ? excerpt.variables : [];
  const toggles = Array.isArray(excerpt?.toggles) ? excerpt.toggles : [];

  // Build page URL from pageId
  const buildPageUrl = (pageId, headingAnchor) => {
    let url = `/wiki/pages/viewpage.action?pageId=${pageId}`;
    if (headingAnchor) {
      url += `#${headingAnchor}`;
    }
    return url;
  };

  // Determine status (stale or up-to-date)
  const getStatus = (ref) => {
    const sourceDate = new Date(excerptLastModified || 0);
    const embedDate = ref.lastSynced ? new Date(ref.lastSynced) : new Date(0);
    return sourceDate > embedDate ? 'Stale' : 'Up-to-date';
  };

  // Build CSV header
  const headers = [
    'Page URL',
    'Page Title',
    'Heading Anchor',
    'Standard Name',
    'Standard Category',
    'Status',
    'Last Synced',
    'Standard Last Modified',
    ...variables.map(v => `Variable: ${v.name}`),
    ...toggles.map(t => `Toggle: ${t.name}`),
    'Embed UUID'
  ];

  // Build CSV rows
  const rows = usageData.map(ref => {
    const row = [
      escapeCSV(buildPageUrl(ref.pageId, ref.headingAnchor)),
      escapeCSV(ref.pageTitle || 'Unknown Page'),
      escapeCSV(ref.headingAnchor || ''),
      escapeCSV(excerptName),
      escapeCSV(excerptCategory),
      escapeCSV(getStatus(ref)),
      escapeCSV(ref.lastSynced || ''),
      escapeCSV(excerptLastModified)
    ];

    // Add variable values
    variables.forEach(variable => {
      const value = ref.variableValues?.[variable.name] || '';
      row.push(escapeCSV(value));
    });

    // Add toggle states
    toggles.forEach(toggle => {
      const state = ref.toggleStates?.[toggle.name] || false;
      row.push(escapeCSV(state ? 'Enabled' : 'Disabled'));
    });

    // Add Embed UUID
    row.push(escapeCSV(ref.localId || ''));

    return row.join(',');
  });

  // Combine header and rows
  return [headers.join(','), ...rows].join('\n');
};

/**
 * Generate CSV export for MultiExcerpt migration data
 *
 * Creates a CSV file for legacy MultiExcerpt macro data to aid in migration.
 * Includes page info, macro name, source page, and variable values.
 *
 * @param {Array} includeData - Array of MultiExcerpt include objects
 * @returns {string} CSV string ready for download
 */
export const generateMultiExcerptCSV = (includeData) => {
  if (!includeData || includeData.length === 0) {
    return '';
  }

  // Collect all unique variable names across all includes
  const allVariables = new Set();
  includeData.forEach(inc => {
    if (inc.variableValues && Array.isArray(inc.variableValues)) {
      inc.variableValues.forEach(varObj => {
        if (varObj.k) {
          allVariables.add(varObj.k);
        }
      });
    }
  });

  const variableColumns = Array.from(allVariables).sort();

  // Build CSV header
  const baseHeaders = [
    'Page ID',
    'Page Title',
    'Page URL',
    'MultiStandard Name',
    'Source Page Title'
  ];

  // Add variable columns
  const variableHeaders = variableColumns.map(varName => `Variable: ${varName}`);

  const headers = [...baseHeaders, ...variableHeaders];

  // Build CSV rows
  const rows = includeData.map(inc => {
    const row = [
      escapeCSV(inc.pageId || ''),
      escapeCSV(inc.pageTitle || ''),
      escapeCSV(inc.pageUrl || ''),
      escapeCSV(inc.multiExcerptName || ''),
      escapeCSV(inc.sourcePageTitle || '')
    ];

    // Add variable values
    variableColumns.forEach(varName => {
      const varObj = inc.variableValues?.find(v => v.k === varName);
      const value = varObj?.v || '';
      row.push(escapeCSV(value));
    });

    return row.join(',');
  });

  // Combine header and rows
  return [headers.join(','), ...rows].join('\n');
};

/**
 * Filter excerpts by search term and category
 *
 * @param {Array} excerpts - Array of excerpt objects
 * @param {string} searchTerm - Search string to filter by name (case-insensitive)
 * @param {string} categoryFilter - Category to filter by ('All' for no filter)
 * @returns {Array} Filtered array of excerpts
 */
export const filterExcerpts = (excerpts, searchTerm, categoryFilter) => {
  if (!Array.isArray(excerpts)) return [];

  return excerpts.filter(excerpt => {
    const matchesSearch = excerpt.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'All' || excerpt.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });
};

/**
 * Sort excerpts by specified criteria
 *
 * @param {Array} excerpts - Array of excerpt objects to sort
 * @param {string} sortBy - Sort criteria: 'name-asc', 'name-desc', 'usage-high', 'usage-low', 'category'
 * @param {Object} usageCounts - Map of excerpt IDs to usage counts (for usage sorting)
 * @returns {Array} Sorted array of excerpts (creates new array, doesn't mutate original)
 */
export const sortExcerpts = (excerpts, sortBy, usageCounts = {}) => {
  if (!Array.isArray(excerpts)) return [];

  return [...excerpts].sort((a, b) => {
    switch (sortBy) {
      case 'name-asc':
        return a.name.localeCompare(b.name);
      case 'name-desc':
        return b.name.localeCompare(a.name);
      case 'usage-high': {
        const usageA = usageCounts[a.id] || 0;
        const usageB = usageCounts[b.id] || 0;
        return usageB - usageA;
      }
      case 'usage-low': {
        const usageALow = usageCounts[a.id] || 0;
        const usageBLow = usageCounts[b.id] || 0;
        return usageALow - usageBLow;
      }
      case 'category':
        return (a.category || 'General').localeCompare(b.category || 'General');
      default:
        return 0;
    }
  });
};

/**
 * Calculate staleness status for an embed instance
 *
 * Determines if an embed is out of sync with its source by comparing timestamps.
 *
 * @param {string|Date} sourceLastModified - When the source was last modified
 * @param {string|Date|null} embedLastSynced - When the embed last synced with source
 * @returns {boolean} True if the embed is stale (source modified after last sync)
 */
export const calculateStalenessStatus = (sourceLastModified, embedLastSynced) => {
  const sourceDate = new Date(sourceLastModified || 0);
  const embedDate = embedLastSynced ? new Date(embedLastSynced) : new Date(0);
  return sourceDate > embedDate;
};
