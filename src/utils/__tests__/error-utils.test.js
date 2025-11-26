/**
 * Tests for error-utils.js
 *
 * Tests user-friendly error message generation and error code extraction.
 */

import {
  getUserFriendlyErrorMessage,
  hasErrorCode,
  getErrorCode,
  getErrorDetails
} from '../error-utils.js';
import { ERROR_CODES } from '../error-codes.js';

describe('getUserFriendlyErrorMessage', () => {
  test('should return mapped message for error with error code', () => {
    const error = new Error('Technical error message');
    error.errorCode = ERROR_CODES.VALIDATION_REQUIRED;

    const message = getUserFriendlyErrorMessage(error);
    expect(message).toBe('This field is required');
  });

  test('should return error message if no error code mapping', () => {
    const error = new Error('Custom error message');
    error.errorCode = 'UNKNOWN_CODE';

    const message = getUserFriendlyErrorMessage(error);
    expect(message).toBe('Custom error message');
  });

  test('should return error message if no error code', () => {
    const error = new Error('Simple error message');

    const message = getUserFriendlyErrorMessage(error);
    expect(message).toBe('Simple error message');
  });

  test('should return default message if no error message', () => {
    const error = {};

    const message = getUserFriendlyErrorMessage(error);
    expect(message).toBe('An unexpected error occurred');
  });

  test('should return default message for null/undefined', () => {
    expect(getUserFriendlyErrorMessage(null)).toBe('An unexpected error occurred');
    expect(getUserFriendlyErrorMessage(undefined)).toBe('An unexpected error occurred');
  });

  test('should handle error object with message property', () => {
    const error = {
      message: 'Object error message'
    };

    const message = getUserFriendlyErrorMessage(error);
    expect(message).toBe('Object error message');
  });

  test('should prioritize error code mapping over error message', () => {
    const error = new Error('Technical: validation failed');
    error.errorCode = ERROR_CODES.NOT_FOUND_EXCERPT;

    const message = getUserFriendlyErrorMessage(error);
    expect(message).toBe('Source not found'); // From ERROR_MESSAGES, not error.message
  });
});

describe('hasErrorCode', () => {
  test('should return true for error with error code', () => {
    const error = new Error('Test');
    error.errorCode = ERROR_CODES.VALIDATION_REQUIRED;

    expect(hasErrorCode(error)).toBe(true);
  });

  test('should return false for error without error code', () => {
    const error = new Error('Test');

    expect(hasErrorCode(error)).toBe(false);
  });

  test('should return false for null/undefined', () => {
    expect(hasErrorCode(null)).toBe(false);
    expect(hasErrorCode(undefined)).toBe(false);
  });

  test('should handle error object', () => {
    const error = {
      errorCode: ERROR_CODES.INTERNAL_ERROR
    };

    expect(hasErrorCode(error)).toBe(true);
  });
});

describe('getErrorCode', () => {
  test('should extract error code from error object', () => {
    const error = new Error('Test');
    error.errorCode = ERROR_CODES.API_RATE_LIMIT;

    expect(getErrorCode(error)).toBe(ERROR_CODES.API_RATE_LIMIT);
  });

  test('should return undefined if no error code', () => {
    const error = new Error('Test');

    expect(getErrorCode(error)).toBeUndefined();
  });

  test('should return undefined for null/undefined', () => {
    expect(getErrorCode(null)).toBeUndefined();
    expect(getErrorCode(undefined)).toBeUndefined();
  });
});

describe('getErrorDetails', () => {
  test('should extract details from error object', () => {
    const error = {
      errorCode: ERROR_CODES.VALIDATION_REQUIRED,
      details: { field: 'excerptName', value: null }
    };

    const details = getErrorDetails(error);
    expect(details).toEqual({ field: 'excerptName', value: null });
  });

  test('should return empty object if no details', () => {
    const error = {
      errorCode: ERROR_CODES.INTERNAL_ERROR
    };

    const details = getErrorDetails(error);
    expect(details).toEqual({});
  });

  test('should return empty object for null/undefined', () => {
    expect(getErrorDetails(null)).toEqual({});
    expect(getErrorDetails(undefined)).toEqual({});
  });
});

