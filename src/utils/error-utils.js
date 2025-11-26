/**
 * Error Utility Functions
 *
 * Helper functions for working with errors and error codes in the frontend.
 */

import { ERROR_MESSAGES } from './error-codes.js';

/**
 * Get a user-friendly error message from an error object
 *
 * If the error has an errorCode and there's a mapped message, use that.
 * Otherwise, fall back to the error's message property or a default message.
 *
 * @param {Error|Object} error - Error object (may have errorCode property)
 * @returns {string} User-friendly error message
 *
 * @example
 * const error = new Error('Something went wrong');
 * error.errorCode = 'VALIDATION_REQUIRED';
 * const message = getUserFriendlyErrorMessage(error);
 * // Returns: 'This field is required'
 */
export function getUserFriendlyErrorMessage(error) {
  // If error has errorCode, use mapped message
  if (error?.errorCode && ERROR_MESSAGES[error.errorCode]) {
    return ERROR_MESSAGES[error.errorCode];
  }
  
  // Fall back to error message
  if (error?.message) {
    return error.message;
  }
  
  // Final fallback
  return 'An unexpected error occurred';
}

/**
 * Check if an error has an error code
 *
 * @param {Error|Object} error - Error object to check
 * @returns {boolean} True if error has errorCode
 */
export function hasErrorCode(error) {
  return !!(error?.errorCode);
}

/**
 * Get error code from error object
 *
 * @param {Error|Object} error - Error object
 * @returns {string|undefined} Error code if present
 */
export function getErrorCode(error) {
  return error?.errorCode;
}

/**
 * Get error details from error object
 *
 * @param {Error|Object} error - Error object
 * @returns {Object} Error details object (empty object if none)
 */
export function getErrorDetails(error) {
  return error?.details || {};
}

