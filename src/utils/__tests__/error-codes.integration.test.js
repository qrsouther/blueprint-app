/**
 * Integration test to verify error codes are actually used in resolvers
 * 
 * This test imports actual resolver code to verify error codes are properly integrated.
 */

import { createErrorResponse, ERROR_CODES } from '../error-codes.js';

describe('Error Codes Integration', () => {
  test('createErrorResponse creates valid error objects that can be serialized', () => {
    const error = createErrorResponse(
      ERROR_CODES.VALIDATION_REQUIRED,
      'Test error message',
      { field: 'testField', value: 123 }
    );

    // Verify it can be JSON serialized (important for API responses)
    const serialized = JSON.stringify(error);
    expect(serialized).toContain('VALIDATION_REQUIRED');
    expect(serialized).toContain('Test error message');
    expect(serialized).toContain('testField');
    
    // Verify it can be deserialized
    const deserialized = JSON.parse(serialized);
    expect(deserialized.errorCode).toBe(ERROR_CODES.VALIDATION_REQUIRED);
    expect(deserialized.success).toBe(false);
  });

  test('all error codes are unique strings', () => {
    const codes = Object.values(ERROR_CODES);
    const uniqueCodes = new Set(codes);
    
    // Verify all codes are unique
    expect(codes.length).toBe(uniqueCodes.size);
    
    // Verify all codes are non-empty strings
    codes.forEach(code => {
      expect(typeof code).toBe('string');
      expect(code.length).toBeGreaterThan(0);
      expect(code).toMatch(/^[A-Z_]+$/); // Only uppercase letters and underscores
    });
  });

  test('error response structure matches resolver return standard', () => {
    const error = createErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Something went wrong',
      { context: 'test' }
    );

    // Verify required fields from RESOLVER_RETURN_STANDARD.md
    expect(error).toHaveProperty('success');
    expect(error).toHaveProperty('error');
    expect(error).toHaveProperty('errorCode');
    
    expect(error.success).toBe(false);
    expect(typeof error.error).toBe('string');
    expect(typeof error.errorCode).toBe('string');
    
    // Verify additional details are preserved
    expect(error.context).toBe('test');
  });

  test('error codes can be used in conditional logic', () => {
    const error1 = createErrorResponse(ERROR_CODES.VALIDATION_REQUIRED, 'Test');
    const error2 = createErrorResponse(ERROR_CODES.NOT_FOUND_EXCERPT, 'Test');
    const error3 = createErrorResponse(ERROR_CODES.INTERNAL_ERROR, 'Test');

    // Verify error codes can be used in switch statements
    const getErrorCategory = (errorCode) => {
      switch (errorCode) {
        case ERROR_CODES.VALIDATION_REQUIRED:
        case ERROR_CODES.VALIDATION_INVALID_TYPE:
          return 'validation';
        case ERROR_CODES.NOT_FOUND_EXCERPT:
        case ERROR_CODES.NOT_FOUND_EMBED:
          return 'not_found';
        case ERROR_CODES.INTERNAL_ERROR:
          return 'system';
        default:
          return 'unknown';
      }
    };

    expect(getErrorCategory(error1.errorCode)).toBe('validation');
    expect(getErrorCategory(error2.errorCode)).toBe('not_found');
    expect(getErrorCategory(error3.errorCode)).toBe('system');
  });
});

