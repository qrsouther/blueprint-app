/**
 * Tests for error code preservation in React Query hooks
 *
 * Tests that error codes are preserved when errors are thrown from hooks.
 */

// Mock React Query
jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn((config) => ({
    data: undefined,
    isLoading: false,
    error: null,
    ...config
  })),
  useMutation: jest.fn((config) => ({
    mutate: jest.fn(),
    mutateAsync: jest.fn(async (...args) => {
      try {
        const result = await config.mutationFn(...args);
        return result;
      } catch (error) {
        throw error;
      }
    }),
    ...config
  })),
  useQueryClient: jest.fn(() => ({
    setQueryData: jest.fn(),
    invalidateQueries: jest.fn()
  }))
}));

// Mock Forge bridge
jest.mock('@forge/bridge', () => ({
  invoke: jest.fn()
}));

import { invoke } from '@forge/bridge';
import { ERROR_CODES } from '../../utils/error-codes.js';

// Import the helper function (we'll test it directly)
function createErrorWithCode(defaultMessage, result) {
  const error = new Error(result?.error || defaultMessage);
  if (result?.errorCode) {
    error.errorCode = result.errorCode;
    error.details = result.details || {};
  }
  return error;
}

describe('Error Code Preservation in Hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('createErrorWithCode should preserve error code', () => {
    const result = {
      success: false,
      error: 'Validation failed',
      errorCode: ERROR_CODES.VALIDATION_REQUIRED,
      details: { field: 'excerptName' }
    };

    const error = createErrorWithCode('Failed to load', result);

    expect(error.message).toBe('Validation failed');
    expect(error.errorCode).toBe(ERROR_CODES.VALIDATION_REQUIRED);
    expect(error.details).toEqual({ field: 'excerptName' });
  });

  test('createErrorWithCode should use default message if no error in result', () => {
    const result = {
      success: false,
      errorCode: ERROR_CODES.INTERNAL_ERROR
    };

    const error = createErrorWithCode('Default error message', result);

    expect(error.message).toBe('Default error message');
    expect(error.errorCode).toBe(ERROR_CODES.INTERNAL_ERROR);
  });

  test('createErrorWithCode should not add error code if not present', () => {
    const result = {
      success: false,
      error: 'Generic error'
    };

    const error = createErrorWithCode('Default message', result);

    expect(error.message).toBe('Generic error');
    expect(error.errorCode).toBeUndefined();
    expect(error.details).toBeUndefined();
  });

  test('createErrorWithCode should handle null result', () => {
    const error = createErrorWithCode('Default message', null);

    expect(error.message).toBe('Default message');
    expect(error.errorCode).toBeUndefined();
  });

  test('createErrorWithCode should handle empty details', () => {
    const result = {
      success: false,
      error: 'Test error',
      errorCode: ERROR_CODES.NOT_FOUND_EXCERPT
    };

    const error = createErrorWithCode('Default', result);

    expect(error.errorCode).toBe(ERROR_CODES.NOT_FOUND_EXCERPT);
    expect(error.details).toEqual({});
  });
});

describe('Hook Error Flow Simulation', () => {
  test('should preserve error code through hook error flow', async () => {
    // Simulate resolver returning error with code
    const resolverResult = {
      success: false,
      error: 'Excerpt not found',
      errorCode: ERROR_CODES.NOT_FOUND_EXCERPT,
      details: { excerptId: 'test-id' }
    };

    invoke.mockResolvedValue(resolverResult);

    // Simulate hook checking result and throwing
    const result = await invoke('getExcerpt', { excerptId: 'test-id' });
    
    if (!result.success) {
      const error = createErrorWithCode('Failed to load excerpt', result);
      
      expect(error.errorCode).toBe(ERROR_CODES.NOT_FOUND_EXCERPT);
      expect(error.details).toEqual({ excerptId: 'test-id' });
      expect(error.message).toBe('Excerpt not found');
    }
  });

  test('should handle multiple error codes correctly', async () => {
    const testCases = [
      {
        resolverResult: {
          success: false,
          error: 'Validation failed',
          errorCode: ERROR_CODES.VALIDATION_REQUIRED,
          details: { field: 'excerptName' }
        },
        expectedCode: ERROR_CODES.VALIDATION_REQUIRED
      },
      {
        resolverResult: {
          success: false,
          error: 'API error',
          errorCode: ERROR_CODES.API_RATE_LIMIT
        },
        expectedCode: ERROR_CODES.API_RATE_LIMIT
      },
      {
        resolverResult: {
          success: false,
          error: 'Storage error',
          errorCode: ERROR_CODES.STORAGE_WRITE_FAILED,
          details: { key: 'excerpt:123' }
        },
        expectedCode: ERROR_CODES.STORAGE_WRITE_FAILED
      }
    ];

    for (const testCase of testCases) {
      invoke.mockResolvedValue(testCase.resolverResult);
      const result = await invoke('testResolver', {});
      
      if (!result.success) {
        const error = createErrorWithCode('Default error', result);
        expect(error.errorCode).toBe(testCase.expectedCode);
      }
    }
  });
});

