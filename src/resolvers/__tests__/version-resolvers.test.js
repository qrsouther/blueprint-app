/**
 * Unit Tests for Version Resolvers
 *
 * Tests Priority 5: Version History & Recovery resolvers
 * Verifies standardized API contract and error handling
 */

import {
  getVersionHistory,
  getVersionDetails,
  restoreFromVersion,
  getVersioningStatsResolver
} from '../version-resolvers.js';
import { ERROR_CODES } from '../../utils/error-codes.js';

// Mock Forge API
jest.mock('@forge/api', () => ({
  storage: {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    query: jest.fn(() => ({
      where: jest.fn(() => ({
        getMany: jest.fn()
      }))
    }))
  }
}));

// Mock version-manager utilities
const mockListVersions = jest.fn();
const mockGetVersion = jest.fn();
const mockRestoreVersion = jest.fn();
const mockGetVersioningStats = jest.fn();

jest.mock('../../utils/version-manager.js', () => ({
  listVersions: (...args) => mockListVersions(...args),
  getVersion: (...args) => mockGetVersion(...args),
  restoreVersion: (...args) => mockRestoreVersion(...args),
  getVersioningStats: (...args) => mockGetVersioningStats(...args),
  pruneExpiredVersions: jest.fn()
}));

// Mock logger
jest.mock('../../utils/forge-logger.js', () => ({
  logFunction: jest.fn(),
  logPhase: jest.fn(),
  logSuccess: jest.fn(),
  logFailure: jest.fn(),
  logWarning: jest.fn()
}));

import { storage } from '@forge/api';

describe('getVersionHistory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should return version history successfully', async () => {
    const mockVersions = [
      {
        versionId: 'version:embed-123:1699564800000',
        timestamp: '2025-11-25T10:00:00Z',
        changeType: 'UPDATE',
        contentHash: 'abc123def456',
        size: 1024
      },
      {
        versionId: 'version:embed-123:1699564700000',
        timestamp: '2025-11-25T09:50:00Z',
        changeType: 'CREATE',
        contentHash: 'xyz789ghi012',
        size: 512
      }
    ];

    mockListVersions.mockResolvedValue({
      success: true,
      versions: mockVersions,
      totalCount: 2
    });

    const req = {
      payload: {
        entityId: 'embed-123'
      }
    };

    const result = await getVersionHistory(req);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data.versions).toHaveLength(2);
    expect(result.data.totalCount).toBe(2);
    expect(result.data.entityId).toBe('embed-123');
    
    // Verify versions are sorted newest first
    expect(result.data.versions[0].timestamp).toBe('2025-11-25T10:00:00Z');
    expect(result.data.versions[1].timestamp).toBe('2025-11-25T09:50:00Z');
    
    // Verify enriched fields
    expect(result.data.versions[0].formattedTimestamp).toBeDefined();
    expect(result.data.versions[0].shortHash).toBe('abc123de');
    expect(result.data.versions[0].sizeKB).toBe('1.00');
  });

  test('should return VALIDATION_REQUIRED error for missing entityId', async () => {
    const req = {
      payload: {}
    };

    const result = await getVersionHistory(req);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ERROR_CODES.VALIDATION_REQUIRED);
    expect(result.error).toContain('entityId is required');
    expect(result.field).toBe('entityId');
    expect(result.versions).toEqual([]);
    expect(result.totalCount).toBe(0);
  });

  test('should return VALIDATION_REQUIRED error for empty entityId', async () => {
    const req = {
      payload: {
        entityId: '   '
      }
    };

    const result = await getVersionHistory(req);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ERROR_CODES.VALIDATION_REQUIRED);
    expect(result.error).toContain('entityId is required');
    expect(result.field).toBe('entityId');
  });

  test('should return error when listVersions fails', async () => {
    mockListVersions.mockResolvedValue({
      success: false,
      error: 'Storage error'
    });

    const req = {
      payload: {
        entityId: 'embed-123'
      }
    };

    const result = await getVersionHistory(req);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ERROR_CODES.STORAGE_READ_FAILED);
    expect(result.error).toBe('Storage error');
    expect(result.entityId).toBe('embed-123');
    expect(result.versions).toEqual([]);
    expect(result.totalCount).toBe(0);
  });

  test('should return INTERNAL_ERROR when exception occurs', async () => {
    mockListVersions.mockRejectedValue(new Error('Unexpected error'));

    const req = {
      payload: {
        entityId: 'embed-123'
      }
    };

    const result = await getVersionHistory(req);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ERROR_CODES.INTERNAL_ERROR);
    expect(result.error).toBe('Unexpected error');
    expect(result.entityId).toBe('embed-123');
  });

  test('should handle empty version list gracefully', async () => {
    mockListVersions.mockResolvedValue({
      success: true,
      versions: [],
      totalCount: 0
    });

    const req = {
      payload: {
        entityId: 'new-embed-456'
      }
    };

    const result = await getVersionHistory(req);

    expect(result.success).toBe(true);
    expect(result.data.versions).toEqual([]);
    expect(result.data.totalCount).toBe(0);
  });
});

describe('getVersionDetails', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should return version details successfully', async () => {
    const mockVersion = {
      versionId: 'version:embed-123:1699564800000',
      timestamp: '2025-11-25T10:00:00Z',
      changeType: 'UPDATE',
      contentHash: 'abc123def456',
      data: {
        excerptId: 'excerpt-456',
        variableValues: { client: 'Acme Corp' },
        toggleStates: { premium: true }
      }
    };

    mockGetVersion.mockResolvedValue({
      success: true,
      version: mockVersion
    });

    const req = {
      payload: {
        versionId: 'version:embed-123:1699564800000'
      }
    };

    const result = await getVersionDetails(req);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data.version).toBeDefined();
    expect(result.data.version.versionId).toBe('version:embed-123:1699564800000');
    expect(result.data.version.formattedTimestamp).toBeDefined();
    expect(result.data.version.shortHash).toBe('abc123de');
    expect(result.data.version.sizeBytes).toBeGreaterThan(0);
    expect(result.data.version.sizeKB).toBeDefined();
    expect(result.data.version.dataPreview).toBeDefined();
  });

  test('should return VALIDATION_REQUIRED error for missing versionId', async () => {
    const req = {
      payload: {}
    };

    const result = await getVersionDetails(req);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ERROR_CODES.VALIDATION_REQUIRED);
    expect(result.error).toContain('versionId is required');
    expect(result.field).toBe('versionId');
  });

  test('should return error when getVersion fails', async () => {
    mockGetVersion.mockResolvedValue({
      success: false,
      error: 'Version not found'
    });

    const req = {
      payload: {
        versionId: 'version:embed-123:1699564800000'
      }
    };

    const result = await getVersionDetails(req);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ERROR_CODES.NOT_FOUND_VERSION);
    expect(result.error).toBe('Version not found');
    expect(result.versionId).toBe('version:embed-123:1699564800000');
  });

  test('should return error when exception occurs', async () => {
    mockGetVersion.mockRejectedValue(new Error('Storage error'));

    const req = {
      payload: {
        versionId: 'version:embed-123:1699564800000'
      }
    };

    const result = await getVersionDetails(req);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ERROR_CODES.INTERNAL_ERROR);
    expect(result.error).toBe('Storage error');
    expect(result.versionId).toBe('version:embed-123:1699564800000');
  });
});

describe('restoreFromVersion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should restore version successfully', async () => {
    mockRestoreVersion.mockResolvedValue({
      success: true,
      storageKey: 'macro-vars:embed-123',
      versionId: 'version:embed-123:1699564800000',
      backupVersionId: 'version:embed-123:1699564900000',
      message: 'Successfully restored from version'
    });

    const req = {
      payload: {
        versionId: 'version:embed-123:1699564800000'
      }
    };

    const result = await restoreFromVersion(req);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data.storageKey).toBe('macro-vars:embed-123');
    expect(result.data.versionId).toBe('version:embed-123:1699564800000');
    expect(result.data.backupVersionId).toBe('version:embed-123:1699564900000');
    expect(result.data.message).toBe('Successfully restored from version');
  });

  test('should return VALIDATION_REQUIRED error for missing versionId', async () => {
    const req = {
      payload: {}
    };

    const result = await restoreFromVersion(req);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ERROR_CODES.VALIDATION_REQUIRED);
    expect(result.error).toContain('versionId is required');
    expect(result.field).toBe('versionId');
  });

  test('should return error when restoreVersion fails', async () => {
    mockRestoreVersion.mockResolvedValue({
      success: false,
      error: 'Version not found'
    });

    const req = {
      payload: {
        versionId: 'version:embed-123:1699564800000'
      }
    };

    const result = await restoreFromVersion(req);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ERROR_CODES.STORAGE_WRITE_FAILED);
    expect(result.error).toBe('Version not found');
    expect(result.versionId).toBe('version:embed-123:1699564800000');
  });

  test('should return error when exception occurs', async () => {
    mockRestoreVersion.mockRejectedValue(new Error('Storage write failed'));

    const req = {
      payload: {
        versionId: 'version:embed-123:1699564800000'
      }
    };

    const result = await restoreFromVersion(req);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ERROR_CODES.INTERNAL_ERROR);
    expect(result.error).toBe('Storage write failed');
    expect(result.versionId).toBe('version:embed-123:1699564800000');
  });
});

describe('getVersioningStatsResolver', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should return versioning stats successfully', async () => {
    const mockStats = {
      totalVersions: 50,
      totalSizeMB: 2.5,
      oldestVersion: '2025-11-11T00:00:00Z',
      newestVersion: '2025-11-25T10:00:00Z',
      retentionDays: 14
    };

    mockGetVersioningStats.mockResolvedValue({
      success: true,
      stats: mockStats
    });

    const req = {};

    const result = await getVersioningStatsResolver(req);

    expect(result.success).toBe(true);
    expect(result.stats).toBeDefined();
    expect(result.stats.totalVersions).toBe(50);
    expect(result.stats.totalSizeMB).toBe(2.5);
  });

  test('should return error when getVersioningStats fails', async () => {
    mockGetVersioningStats.mockResolvedValue({
      success: false,
      error: 'Storage query failed'
    });

    const req = {};

    const result = await getVersioningStatsResolver(req);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ERROR_CODES.STORAGE_READ_FAILED);
    expect(result.error).toBe('Storage query failed');
  });

  test('should return error when exception occurs', async () => {
    mockGetVersioningStats.mockRejectedValue(new Error('Unexpected error'));

    const req = {};

    const result = await getVersioningStatsResolver(req);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ERROR_CODES.INTERNAL_ERROR);
    expect(result.error).toBe('Unexpected error');
  });
});

