/**
 * Error Code Constants and Helpers
 *
 * Centralized error code constants for consistent error handling across the application.
 * Error codes enable programmatic error handling and better user experience.
 *
 * Error Code Categories:
 * - 1xxx: Validation errors
 * - 2xxx: Not found errors
 * - 3xxx: Storage errors
 * - 4xxx: API errors
 * - 5xxx: Business logic errors
 * - 9xxx: System errors
 */

/**
 * Error code constants
 */
export const ERROR_CODES = {
  // Validation errors (1xxx)
  VALIDATION_REQUIRED: 'VALIDATION_REQUIRED',
  VALIDATION_INVALID_TYPE: 'VALIDATION_INVALID_TYPE',
  VALIDATION_INVALID_FORMAT: 'VALIDATION_INVALID_FORMAT',
  VALIDATION_INVALID_VALUE: 'VALIDATION_INVALID_VALUE',
  
  // Not found errors (2xxx)
  NOT_FOUND_EXCERPT: 'NOT_FOUND_EXCERPT',
  NOT_FOUND_EMBED: 'NOT_FOUND_EMBED',
  NOT_FOUND_PAGE: 'NOT_FOUND_PAGE',
  NOT_FOUND_VERSION: 'NOT_FOUND_VERSION',
  NOT_FOUND_USER: 'NOT_FOUND_USER',
  
  // Storage errors (3xxx)
  STORAGE_READ_FAILED: 'STORAGE_READ_FAILED',
  STORAGE_WRITE_FAILED: 'STORAGE_WRITE_FAILED',
  STORAGE_DELETE_FAILED: 'STORAGE_DELETE_FAILED',
  STORAGE_QUOTA_EXCEEDED: 'STORAGE_QUOTA_EXCEEDED',
  
  // API errors (4xxx)
  API_RATE_LIMIT: 'API_RATE_LIMIT',
  API_UNAUTHORIZED: 'API_UNAUTHORIZED',
  API_FORBIDDEN: 'API_FORBIDDEN',
  API_NOT_FOUND: 'API_NOT_FOUND',
  API_TIMEOUT: 'API_TIMEOUT',
  API_SERVER_ERROR: 'API_SERVER_ERROR',
  
  // Business logic errors (5xxx)
  DUPLICATE_EXCERPT: 'DUPLICATE_EXCERPT',
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  OPERATION_NOT_ALLOWED: 'OPERATION_NOT_ALLOWED',
  DEPENDENCY_EXISTS: 'DEPENDENCY_EXISTS',
  
  // System errors (9xxx)
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR'
};

/**
 * User-friendly error messages mapped to error codes
 * These can be overridden by specific error messages from resolvers
 */
export const ERROR_MESSAGES = {
  [ERROR_CODES.VALIDATION_REQUIRED]: 'This field is required',
  [ERROR_CODES.VALIDATION_INVALID_TYPE]: 'Invalid data type',
  [ERROR_CODES.VALIDATION_INVALID_FORMAT]: 'Invalid format',
  [ERROR_CODES.VALIDATION_INVALID_VALUE]: 'Invalid value',
  
  [ERROR_CODES.NOT_FOUND_EXCERPT]: 'Source not found',
  [ERROR_CODES.NOT_FOUND_EMBED]: 'Embed not found',
  [ERROR_CODES.NOT_FOUND_PAGE]: 'Page not found',
  [ERROR_CODES.NOT_FOUND_VERSION]: 'Version not found',
  [ERROR_CODES.NOT_FOUND_USER]: 'User not found',
  
  [ERROR_CODES.STORAGE_READ_FAILED]: 'Failed to read from storage',
  [ERROR_CODES.STORAGE_WRITE_FAILED]: 'Failed to save to storage',
  [ERROR_CODES.STORAGE_DELETE_FAILED]: 'Failed to delete from storage',
  [ERROR_CODES.STORAGE_QUOTA_EXCEEDED]: 'Storage quota exceeded',
  
  [ERROR_CODES.API_RATE_LIMIT]: 'API rate limit exceeded. Please try again later',
  [ERROR_CODES.API_UNAUTHORIZED]: 'Unauthorized access',
  [ERROR_CODES.API_FORBIDDEN]: 'Access forbidden',
  [ERROR_CODES.API_NOT_FOUND]: 'Resource not found',
  [ERROR_CODES.API_TIMEOUT]: 'Request timed out',
  [ERROR_CODES.API_SERVER_ERROR]: 'Server error occurred',
  
  [ERROR_CODES.DUPLICATE_EXCERPT]: 'A source with this name already exists',
  [ERROR_CODES.INVALID_STATE_TRANSITION]: 'Invalid state transition',
  [ERROR_CODES.OPERATION_NOT_ALLOWED]: 'This operation is not allowed',
  [ERROR_CODES.DEPENDENCY_EXISTS]: 'Cannot delete: dependencies exist',
  
  [ERROR_CODES.UNKNOWN_ERROR]: 'An unexpected error occurred',
  [ERROR_CODES.INTERNAL_ERROR]: 'An internal error occurred',
  [ERROR_CODES.CONFIGURATION_ERROR]: 'Configuration error'
};

/**
 * Create a standardized error response object
 *
 * @param {string} errorCode - Error code constant from ERROR_CODES
 * @param {string} message - Error message (can be more specific than default)
 * @param {Object} details - Additional error details (optional)
 * @returns {Object} Standardized error response
 *
 * @example
 * return createErrorResponse(
 *   ERROR_CODES.VALIDATION_REQUIRED,
 *   'excerptName is required and must be a non-empty string',
 *   { field: 'excerptName' }
 * );
 */
export function createErrorResponse(errorCode, message, details = {}) {
  return {
    success: false,
    error: message,
    errorCode,
    ...details
  };
}

/**
 * Check if an error response has an error code
 *
 * @param {Object} response - Response object to check
 * @returns {boolean} True if response has error code
 */
export function hasErrorCode(response) {
  return !!(response && response.success === false && response.errorCode);
}

/**
 * Get error code from response or error object
 *
 * @param {Object} responseOrError - Response object or Error object
 * @returns {string|undefined} Error code if present
 */
export function getErrorCode(responseOrError) {
  if (responseOrError?.errorCode) {
    return responseOrError.errorCode;
  }
  if (responseOrError?.error?.errorCode) {
    return responseOrError.error.errorCode;
  }
  return undefined;
}

