/**
 * Tests for error-codes.js
 *
 * Tests error code constants, error response creation, and helper functions.
 */

import {
  ERROR_CODES,
  ERROR_MESSAGES,
  createErrorResponse,
  hasErrorCode,
  getErrorCode
} from '../error-codes.js';

describe('ERROR_CODES', () => {
  test('should have all expected error code constants', () => {
    // This test verifies the constants are actually defined and have correct values
    expect(ERROR_CODES.VALIDATION_REQUIRED).toBe('VALIDATION_REQUIRED');
    expect(ERROR_CODES.NOT_FOUND_EXCERPT).toBe('NOT_FOUND_EXCERPT');
    expect(ERROR_CODES.STORAGE_READ_FAILED).toBe('STORAGE_READ_FAILED');
    expect(ERROR_CODES.API_RATE_LIMIT).toBe('API_RATE_LIMIT');
    expect(ERROR_CODES.DUPLICATE_EXCERPT).toBe('DUPLICATE_EXCERPT');
    expect(ERROR_CODES.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
    
    // Verify these are strings, not undefined
    expect(typeof ERROR_CODES.VALIDATION_REQUIRED).toBe('string');
    expect(ERROR_CODES.VALIDATION_REQUIRED.length).toBeGreaterThan(0);
  });

  test('should have error codes for all categories', () => {
    // Validation errors
    expect(ERROR_CODES.VALIDATION_REQUIRED).toBeDefined();
    expect(ERROR_CODES.VALIDATION_INVALID_TYPE).toBeDefined();
    
    // Not found errors
    expect(ERROR_CODES.NOT_FOUND_EXCERPT).toBeDefined();
    expect(ERROR_CODES.NOT_FOUND_EMBED).toBeDefined();
    
    // Storage errors
    expect(ERROR_CODES.STORAGE_READ_FAILED).toBeDefined();
    expect(ERROR_CODES.STORAGE_WRITE_FAILED).toBeDefined();
    
    // API errors
    expect(ERROR_CODES.API_RATE_LIMIT).toBeDefined();
    expect(ERROR_CODES.API_UNAUTHORIZED).toBeDefined();
    
    // Business logic errors
    expect(ERROR_CODES.DUPLICATE_EXCERPT).toBeDefined();
    expect(ERROR_CODES.OPERATION_NOT_ALLOWED).toBeDefined();
    
    // System errors
    expect(ERROR_CODES.INTERNAL_ERROR).toBeDefined();
    expect(ERROR_CODES.UNKNOWN_ERROR).toBeDefined();
  });
});

describe('ERROR_MESSAGES', () => {
  test('should have messages for all error codes', () => {
    expect(ERROR_MESSAGES[ERROR_CODES.VALIDATION_REQUIRED]).toBe('This field is required');
    expect(ERROR_MESSAGES[ERROR_CODES.NOT_FOUND_EXCERPT]).toBe('Source not found');
    expect(ERROR_MESSAGES[ERROR_CODES.INTERNAL_ERROR]).toBe('An internal error occurred');
  });

  test('should have user-friendly messages', () => {
    const message = ERROR_MESSAGES[ERROR_CODES.API_RATE_LIMIT];
    expect(message).toBe('API rate limit exceeded. Please try again later');
    expect(typeof message).toBe('string');
    expect(message.length).toBeGreaterThan(0);
  });
});

describe('createErrorResponse', () => {
  test('should create error response with required fields', () => {
    const response = createErrorResponse(
      ERROR_CODES.VALIDATION_REQUIRED,
      'Field is required'
    );

    expect(response).toEqual({
      success: false,
      error: 'Field is required',
      errorCode: ERROR_CODES.VALIDATION_REQUIRED
    });
  });

  test('should include details in error response', () => {
    const response = createErrorResponse(
      ERROR_CODES.VALIDATION_REQUIRED,
      'Field is required',
      { field: 'excerptName', value: null }
    );

    expect(response.success).toBe(false);
    expect(response.error).toBe('Field is required');
    expect(response.errorCode).toBe(ERROR_CODES.VALIDATION_REQUIRED);
    expect(response.field).toBe('excerptName');
    expect(response.value).toBe(null);
  });

  test('should handle empty details object', () => {
    const response = createErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Something went wrong',
      {}
    );

    expect(response.success).toBe(false);
    expect(response.error).toBe('Something went wrong');
    expect(response.errorCode).toBe(ERROR_CODES.INTERNAL_ERROR);
  });

  test('should merge details correctly', () => {
    const response = createErrorResponse(
      ERROR_CODES.NOT_FOUND_EXCERPT,
      'Excerpt not found',
      { excerptId: '123', pageId: '456' }
    );

    expect(response.excerptId).toBe('123');
    expect(response.pageId).toBe('456');
  });
});

describe('hasErrorCode', () => {
  test('should return true for error response with error code', () => {
    const response = {
      success: false,
      error: 'Test error',
      errorCode: ERROR_CODES.VALIDATION_REQUIRED
    };

    expect(hasErrorCode(response)).toBe(true);
  });

  test('should return false for success response', () => {
    const response = {
      success: true,
      data: {}
    };

    expect(hasErrorCode(response)).toBe(false);
  });

  test('should return false for error without error code', () => {
    const response = {
      success: false,
      error: 'Test error'
    };

    expect(hasErrorCode(response)).toBe(false);
  });

  test('should return false for null/undefined', () => {
    expect(hasErrorCode(null)).toBe(false);
    expect(hasErrorCode(undefined)).toBe(false);
  });
});

describe('getErrorCode', () => {
  test('should extract error code from response', () => {
    const response = {
      success: false,
      error: 'Test error',
      errorCode: ERROR_CODES.NOT_FOUND_EXCERPT
    };

    expect(getErrorCode(response)).toBe(ERROR_CODES.NOT_FOUND_EXCERPT);
  });

  test('should extract error code from nested error object', () => {
    const response = {
      error: {
        errorCode: ERROR_CODES.API_RATE_LIMIT
      }
    };

    expect(getErrorCode(response)).toBe(ERROR_CODES.API_RATE_LIMIT);
  });

  test('should return undefined if no error code', () => {
    const response = {
      success: false,
      error: 'Test error'
    };

    expect(getErrorCode(response)).toBeUndefined();
  });

  test('should return undefined for null/undefined', () => {
    expect(getErrorCode(null)).toBeUndefined();
    expect(getErrorCode(undefined)).toBeUndefined();
  });
});

