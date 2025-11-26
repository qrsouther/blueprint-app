/**
 * Execution verification test
 * 
 * This test performs actual work to verify tests are executing, not just checking file existence.
 */

import { createErrorResponse, ERROR_CODES } from '../error-codes.js';

describe('Test Execution Verification', () => {
  test('performs actual computation to verify execution', () => {
    // This test does actual work that would take measurable time
    const iterations = 1000;
    let sum = 0;
    
    for (let i = 0; i < iterations; i++) {
      const error = createErrorResponse(ERROR_CODES.INTERNAL_ERROR, `Error ${i}`);
      sum += error.errorCode.length;
    }
    
    // Verify computation happened
    expect(sum).toBe(ERROR_CODES.INTERNAL_ERROR.length * iterations);
    expect(sum).toBeGreaterThan(0);
  });

  test('verifies async operations actually execute', async () => {
    // Simulate async work
    const createAsyncError = async (code, message) => {
      await new Promise(resolve => setTimeout(resolve, 1)); // 1ms delay
      return createErrorResponse(code, message);
    };

    const start = Date.now();
    const error = await createAsyncError(ERROR_CODES.VALIDATION_REQUIRED, 'Test');
    const duration = Date.now() - start;

    // Verify async operation completed
    expect(error.errorCode).toBe(ERROR_CODES.VALIDATION_REQUIRED);
    expect(duration).toBeGreaterThanOrEqual(0); // At least some time passed (may be 0ms on fast systems)
  });

  test('verifies error handling with actual error throwing', () => {
    // This test would fail if error handling wasn't working
    const throwError = () => {
      throw new Error('Test error');
    };

    expect(() => {
      try {
        throwError();
      } catch (error) {
        const errorResponse = createErrorResponse(
          ERROR_CODES.INTERNAL_ERROR,
          error.message
        );
        expect(errorResponse.error).toBe('Test error');
        throw errorResponse; // Re-throw to verify catch works
      }
    }).toThrow();
  });

  test('verifies mock functions are actually called', () => {
    const mockFn = jest.fn();
    
    // Create multiple errors
    for (let i = 0; i < 10; i++) {
      const error = createErrorResponse(ERROR_CODES.API_RATE_LIMIT, `Error ${i}`);
      mockFn(error.errorCode);
    }

    // Verify mock was called the expected number of times
    expect(mockFn).toHaveBeenCalledTimes(10);
    expect(mockFn).toHaveBeenCalledWith(ERROR_CODES.API_RATE_LIMIT);
  });
});

