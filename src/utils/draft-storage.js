/**
 * Draft Storage Utility
 * 
 * Provides localStorage-based draft storage for Embed edit sessions.
 * Used for crash/accidental-close recovery - saves form state on blur,
 * allowing users to recover unsaved work if they close the browser
 * without explicitly exiting or publishing.
 * 
 * Key behaviors:
 * - Save on blur (async, non-blocking)
 * - Clear on Publish or Reset (not on Exit - Exit saves to Forge storage)
 * - Auto-cleanup of stale drafts (> 7 days old)
 * 
 * @module draft-storage
 */

import { logger } from './logger';

const DRAFT_PREFIX = 'embed-draft-';

/**
 * Draft storage utilities for localStorage-based crash recovery
 */
export const draftStorage = {
  /**
   * Save form data to localStorage as a draft
   * Called on blur from form inputs
   * 
   * @param {string} localId - The Embed's local ID
   * @param {Object} data - Form data to save (excerptId, variableValues, toggleStates, etc.)
   */
  save: (localId, data) => {
    try {
      localStorage.setItem(`${DRAFT_PREFIX}${localId}`, JSON.stringify({
        ...data,
        savedAt: Date.now()
      }));
    } catch (error) {
      // localStorage might be full or disabled - fail silently
      logger.errors('[draft-storage] Failed to save draft:', error.message);
    }
  },

  /**
   * Load a draft from localStorage
   * 
   * @param {string} localId - The Embed's local ID
   * @returns {Object|null} The saved draft data, or null if not found
   */
  load: (localId) => {
    try {
      const raw = localStorage.getItem(`${DRAFT_PREFIX}${localId}`);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      logger.errors('[draft-storage] Failed to load draft:', error.message);
      return null;
    }
  },

  /**
   * Clear a draft from localStorage
   * Called on Publish (content committed) or Reset (user discards changes)
   * 
   * @param {string} localId - The Embed's local ID
   */
  clear: (localId) => {
    try {
      localStorage.removeItem(`${DRAFT_PREFIX}${localId}`);
    } catch (error) {
      logger.errors('[draft-storage] Failed to clear draft:', error.message);
    }
  },

  /**
   * Check if a draft exists for an Embed
   * 
   * @param {string} localId - The Embed's local ID
   * @returns {boolean} True if a draft exists
   */
  exists: (localId) => {
    try {
      return localStorage.getItem(`${DRAFT_PREFIX}${localId}`) !== null;
    } catch (error) {
      return false;
    }
  },

  /**
   * Clear all drafts older than maxAgeMs
   * Called on app mount to clean up abandoned drafts
   * 
   * @param {number} maxAgeMs - Maximum age in milliseconds (default: 7 days)
   */
  clearStale: (maxAgeMs = 7 * 24 * 60 * 60 * 1000) => {
    try {
      const keysToRemove = [];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(DRAFT_PREFIX)) {
          try {
            const draft = JSON.parse(localStorage.getItem(key));
            if (draft && draft.savedAt && (Date.now() - draft.savedAt > maxAgeMs)) {
              keysToRemove.push(key);
            }
          } catch {
            // Invalid JSON - remove it
            keysToRemove.push(key);
          }
        }
      }
      
      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      if (keysToRemove.length > 0) {
        logger.saves(`[draft-storage] Cleared ${keysToRemove.length} stale draft(s)`);
      }
    } catch (error) {
      logger.errors('[draft-storage] Failed to clear stale drafts:', error.message);
    }
  },

  /**
   * Get all draft keys (for debugging)
   * 
   * @returns {string[]} Array of localIds with saved drafts
   */
  getAllDraftIds: () => {
    const ids = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(DRAFT_PREFIX)) {
          ids.push(key.replace(DRAFT_PREFIX, ''));
        }
      }
    } catch (error) {
      logger.errors('[draft-storage] Failed to get draft IDs:', error.message);
    }
    return ids;
  }
};

export default draftStorage;
