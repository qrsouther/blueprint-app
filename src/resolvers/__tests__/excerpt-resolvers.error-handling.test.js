/**
 * Tests for error handling in excerpt-resolvers.js
 *
 * Tests that resolvers return proper error codes for various error scenarios.
 * Note: These tests mock the Forge storage API.
 */

import {
  saveExcerpt,
  updateExcerptContent,
  deleteExcerpt
} from '../excerpt-resolvers.js';
import { ERROR_CODES } from '../../utils/error-codes.js';

// Mock Forge API
jest.mock('@forge/api', () => ({
  storage: {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn()
  },
  default: {
    asApp: jest.fn(() => ({
      requestConfluence: jest.fn()
    }))
  },
  route: jest.fn((strings, ...values) => {
    return strings.reduce((result, str, i) => {
      return result + str + (values[i] || '');
    }, '');
  })
}));

// Mock other dependencies
jest.mock('../../utils/forge-logger.js', () => ({
  logFunction: jest.fn(),
  logPhase: jest.fn(),
  logSuccess: jest.fn(),
  logFailure: jest.fn(),
  logWarning: jest.fn()
}));

jest.mock('../../utils/storage-utils.js', () => ({
  updateExcerptIndex: jest.fn()
}));

jest.mock('../../utils/storage-validator.js', () => ({
  validateExcerptData: jest.fn(() => ({ valid: true, errors: [] }))
}));

jest.mock('../../utils/hash-utils.js', () => ({
  calculateContentHash: jest.fn(() => 'test-hash')
}));

jest.mock('../../utils/detection-utils.js', () => ({
  detectVariables: jest.fn(() => []),
  detectToggles: jest.fn(() => [])
}));

jest.mock('../../utils.js', () => ({
  generateUUID: jest.fn(() => 'test-uuid-123')
}));

import { storage } from '@forge/api';
import { validateExcerptData } from '../../utils/storage-validator.js';

describe('saveExcerpt - Error Handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    validateExcerptData.mockReturnValue({ valid: true, errors: [] });
    storage.get.mockResolvedValue({ excerpts: [] });
    storage.set.mockResolvedValue(undefined);
  });

  test('should return VALIDATION_REQUIRED error code for missing excerptName', async () => {
    const req = {
      payload: {
        category: 'General',
        content: { type: 'doc', version: 1, content: [] }
      }
    };

    // Verify the function is actually called (not just mocked)
    const result = await saveExcerpt(req);

    // Verify the result structure
    expect(result).toBeDefined();
    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('errorCode');
    expect(result).toHaveProperty('error');
    
    // Verify error code is correct
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ERROR_CODES.VALIDATION_REQUIRED);
    expect(result.error).toContain('excerptName');
    expect(result.field).toBe('excerptName');
    
    // Verify storage.get was NOT called (validation failed before storage access)
    expect(storage.get).not.toHaveBeenCalled();
  });

  test('should return VALIDATION_INVALID_TYPE error code for invalid content type', async () => {
    const req = {
      payload: {
        excerptName: 'Test Source',
        category: 'General',
        content: 'not an object' // Invalid: should be ADF object
      }
    };

    const result = await saveExcerpt(req);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ERROR_CODES.VALIDATION_INVALID_TYPE);
    expect(result.error).toContain('content');
    expect(result.field).toBe('content');
  });

  test('should return VALIDATION_INVALID_TYPE error code for array content', async () => {
    const req = {
      payload: {
        excerptName: 'Test Source',
        category: 'General',
        content: [] // Invalid: array instead of object
      }
    };

    const result = await saveExcerpt(req);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ERROR_CODES.VALIDATION_INVALID_TYPE);
    expect(result.field).toBe('content');
  });

  test('should return VALIDATION_INVALID_VALUE error code for validation failure', async () => {
    validateExcerptData.mockReturnValue({
      valid: false,
      errors: ['Invalid excerpt structure', 'Missing required field']
    });

    const req = {
      payload: {
        excerptName: 'Test Source',
        category: 'General',
        content: { type: 'doc', version: 1, content: [] }
      }
    };

    storage.get.mockResolvedValue({ excerpts: [] });

    const result = await saveExcerpt(req);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ERROR_CODES.VALIDATION_INVALID_VALUE);
    expect(result.error).toContain('Validation failed');
    expect(result.errors).toEqual(['Invalid excerpt structure', 'Missing required field']);
  });
});

describe('updateExcerptContent - Error Handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    validateExcerptData.mockReturnValue({ valid: true, errors: [] });
    storage.set.mockResolvedValue(undefined);
  });

  test('should return VALIDATION_REQUIRED error code for missing excerptId', async () => {
    const req = {
      payload: {
        content: { type: 'doc', version: 1, content: [] }
      }
    };

    const result = await updateExcerptContent(req);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ERROR_CODES.VALIDATION_REQUIRED);
    expect(result.field).toBe('excerptId');
  });

  test('should return NOT_FOUND_EXCERPT error code when excerpt does not exist', async () => {
    storage.get.mockResolvedValue(null);

    const req = {
      payload: {
        excerptId: 'non-existent-id',
        content: { type: 'doc', version: 1, content: [] }
      }
    };

    const result = await updateExcerptContent(req);

    // Verify the function actually executed and checked storage
    expect(storage.get).toHaveBeenCalled();
    expect(storage.get).toHaveBeenCalledWith('excerpt:non-existent-id');
    
    // Verify error response
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ERROR_CODES.NOT_FOUND_EXCERPT);
    expect(result.excerptId).toBe('non-existent-id');
  });

  test('should return INTERNAL_ERROR error code for unexpected errors', async () => {
    storage.get.mockRejectedValue(new Error('Storage error'));

    const req = {
      payload: {
        excerptId: 'test-id',
        content: { type: 'doc', version: 1, content: [] }
      }
    };

    const result = await updateExcerptContent(req);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ERROR_CODES.INTERNAL_ERROR);
    expect(result.error).toBe('Storage error');
    expect(result.excerptId).toBe('test-id');
  });
});

describe('deleteExcerpt - Error Handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    storage.delete.mockResolvedValue(undefined);
    storage.get.mockResolvedValue({ excerpts: [] });
    storage.set.mockResolvedValue(undefined);
  });

  test('should return VALIDATION_REQUIRED error code for missing excerptId', async () => {
    const req = {
      payload: {}
    };

    const result = await deleteExcerpt(req);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ERROR_CODES.VALIDATION_REQUIRED);
    expect(result.field).toBe('excerptId');
  });

  test('should return INTERNAL_ERROR error code for storage failures', async () => {
    storage.delete.mockRejectedValue(new Error('Delete failed'));

    const req = {
      payload: {
        excerptId: 'test-id'
      }
    };

    const result = await deleteExcerpt(req);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ERROR_CODES.INTERNAL_ERROR);
    expect(result.excerptId).toBe('test-id');
  });
});

// Note: getExcerpt is not exported from excerpt-resolvers.js
// It may be in simple-resolvers.js or handled differently
// Skipping this test for now - can be added when getExcerpt is found

