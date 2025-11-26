/**
 * Unit Tests for Restore Resolvers
 *
 * Tests Priority 5: Version History & Recovery resolvers
 * Verifies standardized API contract and error handling
 */

import {
  listBackups,
  listDeletedEmbeds,
  previewFromBackup,
  previewDeletedEmbed,
  restoreDeletedEmbed,
  restoreFromBackup
} from '../restore-resolvers.js';
import { ERROR_CODES } from '../../utils/error-codes.js';

// Mock Forge API
const mockStorageGet = jest.fn();
const mockStorageSet = jest.fn();
const mockStorageDelete = jest.fn();
const mockStorageQuery = jest.fn();

jest.mock('@forge/api', () => ({
  storage: {
    get: (...args) => mockStorageGet(...args),
    set: (...args) => mockStorageSet(...args),
    delete: (...args) => mockStorageDelete(...args),
    query: () => mockStorageQuery()
  },
  startsWith: jest.fn((prefix) => ({ startsWith: prefix }))
}));

// Mock logger
jest.mock('../../utils/forge-logger.js', () => ({
  logSuccess: jest.fn(),
  logFailure: jest.fn()
}));

import { storage } from '@forge/api';

describe('listBackups', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should return backup list successfully', async () => {
    const mockBackupResults = {
      results: [
        {
          key: 'backup-20251125-103000:metadata',
          value: {
            createdAt: '2025-11-25T10:30:00Z',
            embedCount: 5,
            operationType: 'restore'
          }
        },
        {
          key: 'backup-20251124-090000:metadata',
          value: {
            createdAt: '2025-11-24T09:00:00Z',
            embedCount: 3,
            operationType: 'manual'
          }
        },
        {
          key: 'backup-20251125-103000:embed:localId-123',
          value: { /* embed data - should be filtered out */ }
        }
      ]
    };

    const mockQuery = {
      where: jest.fn(() => ({
        getMany: jest.fn().mockResolvedValue(mockBackupResults)
      }))
    };

    mockStorageQuery.mockReturnValue(mockQuery);

    const result = await listBackups();

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data.backups).toHaveLength(2); // Only metadata entries
    expect(result.data.count).toBe(2);
    expect(result.data.backups[0].createdAt).toBe('2025-11-25T10:30:00Z'); // Most recent first
    expect(result.data.backups[1].createdAt).toBe('2025-11-24T09:00:00Z');
  });

  test('should return empty list when no backups exist', async () => {
    const mockQuery = {
      where: jest.fn(() => ({
        getMany: jest.fn().mockResolvedValue({ results: [] })
      }))
    };

    mockStorageQuery.mockReturnValue(mockQuery);

    const result = await listBackups();

    expect(result.success).toBe(true);
    expect(result.data.backups).toEqual([]);
    expect(result.data.count).toBe(0);
  });

  test('should return INTERNAL_ERROR when exception occurs', async () => {
    const mockQuery = {
      where: jest.fn(() => ({
        getMany: jest.fn().mockRejectedValue(new Error('Storage query failed'))
      }))
    };

    mockStorageQuery.mockReturnValue(mockQuery);

    const result = await listBackups();

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ERROR_CODES.STORAGE_READ_FAILED);
    expect(result.error).toBe('Storage query failed');
  });
});

describe('listDeletedEmbeds', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should return deleted embeds list successfully', async () => {
    const mockDeletedResults = {
      results: [
        {
          key: 'macro-vars-deleted:localId-123',
          value: {
            excerptId: 'excerpt-456',
            deletedAt: '2025-11-25T10:00:00Z',
            deletedBy: 'user-123',
            deletionReason: 'Orphaned',
            canRecover: true,
            pageId: 'page-789',
            pageTitle: 'Test Page',
            variableValues: { client: 'Acme' },
            toggleStates: { premium: true }
          }
        },
        {
          key: 'macro-vars-deleted:localId-456',
          value: {
            excerptId: 'excerpt-789',
            deletedAt: '2025-11-24T09:00:00Z',
            deletedBy: 'user-456',
            deletionReason: 'Manual deletion',
            canRecover: true,
            pageId: 'page-012',
            pageTitle: 'Another Page'
          }
        }
      ]
    };

    const mockQuery = {
      where: jest.fn(() => ({
        getMany: jest.fn().mockResolvedValue(mockDeletedResults)
      }))
    };

    mockStorageQuery.mockReturnValue(mockQuery);

    const result = await listDeletedEmbeds();

    expect(result.success).toBe(true);
    expect(result.deletedEmbeds).toHaveLength(2);
    expect(result.count).toBe(2);
    expect(result.deletedEmbeds[0].localId).toBe('localId-123');
    expect(result.deletedEmbeds[0].hasVariableValues).toBe(true);
    expect(result.deletedEmbeds[0].hasToggleStates).toBe(true);
    expect(result.deletedEmbeds[1].localId).toBe('localId-456');
    // Sorted by deletion date (most recent first)
    expect(result.deletedEmbeds[0].deletedAt).toBe('2025-11-25T10:00:00Z');
  });

  test('should return empty list when no deleted embeds exist', async () => {
    const mockQuery = {
      where: jest.fn(() => ({
        getMany: jest.fn().mockResolvedValue({ results: [] })
      }))
    };

    mockStorageQuery.mockReturnValue(mockQuery);

    const result = await listDeletedEmbeds();

    expect(result.success).toBe(true);
    expect(result.deletedEmbeds).toEqual([]);
    expect(result.count).toBe(0);
  });

  test('should return INTERNAL_ERROR when exception occurs', async () => {
    const mockQuery = {
      where: jest.fn(() => ({
        getMany: jest.fn().mockRejectedValue(new Error('Storage error'))
      }))
    };

    mockStorageQuery.mockReturnValue(mockQuery);

    const result = await listDeletedEmbeds();

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ERROR_CODES.STORAGE_READ_FAILED);
    expect(result.error).toBe('Storage error');
    expect(result.deletedEmbeds).toEqual([]);
  });
});

describe('previewFromBackup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should return backup preview successfully', async () => {
    const mockBackupData = {
      excerptId: 'excerpt-123',
      variableValues: { client: 'Acme Corp' },
      toggleStates: { premium: true },
      customInsertions: [],
      internalNotes: [],
      lastSynced: '2025-11-25T10:00:00Z',
      contentHash: 'abc123'
    };

    const mockCurrentData = {
      excerptId: 'excerpt-123',
      variableValues: { client: 'New Corp' },
      toggleStates: { premium: false }
    };

    mockStorageGet
      .mockResolvedValueOnce(mockBackupData) // backup data
      .mockResolvedValueOnce(mockCurrentData); // current data

    const req = {
      payload: {
        backupId: 'backup-20251125-103000',
        localId: 'localId-123'
      }
    };

    const result = await previewFromBackup(req);

    expect(result.success).toBe(true);
    expect(result.preview).toBeDefined();
    expect(result.preview.localId).toBe('localId-123');
    expect(result.preview.backupId).toBe('backup-20251125-103000');
    expect(result.preview.backupData.excerptId).toBe('excerpt-123');
    expect(result.preview.currentData).toBeDefined();
    expect(result.preview.hasConflict).toBe(true);
    expect(result.preview.canRestore).toBe(true);
  });

  test('should return error when backup not found', async () => {
    mockStorageGet.mockResolvedValue(null);

    const req = {
      payload: {
        backupId: 'backup-20251125-103000',
        localId: 'localId-123'
      }
    };

    const result = await previewFromBackup(req);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ERROR_CODES.NOT_FOUND_EMBED);
    expect(result.error).toContain('No backup found');
    expect(result.localId).toBe('localId-123');
    expect(result.backupId).toBe('backup-20251125-103000');
  });

  test('should handle missing current data gracefully', async () => {
    const mockBackupData = {
      excerptId: 'excerpt-123',
      variableValues: { client: 'Acme Corp' }
    };

    mockStorageGet
      .mockResolvedValueOnce(mockBackupData)
      .mockResolvedValueOnce(null); // No current data

    const req = {
      payload: {
        backupId: 'backup-20251125-103000',
        localId: 'localId-123'
      }
    };

    const result = await previewFromBackup(req);

    expect(result.success).toBe(true);
    expect(result.preview.currentData).toBe(null);
    expect(result.preview.hasConflict).toBe(false);
  });

  test('should return INTERNAL_ERROR when exception occurs', async () => {
    mockStorageGet.mockRejectedValue(new Error('Storage read failed'));

    const req = {
      payload: {
        backupId: 'backup-20251125-103000',
        localId: 'localId-123'
      }
    };

    const result = await previewFromBackup(req);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ERROR_CODES.INTERNAL_ERROR);
    expect(result.error).toBe('Storage read failed');
    expect(result.backupId).toBe('backup-20251125-103000');
    expect(result.localId).toBe('localId-123');
  });
});

describe('previewDeletedEmbed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should return deleted embed preview successfully', async () => {
    const mockDeletedData = {
      excerptId: 'excerpt-123',
      variableValues: { client: 'Acme Corp' },
      toggleStates: { premium: true },
      customInsertions: [],
      internalNotes: [],
      deletedAt: '2025-11-25T10:00:00Z',
      deletedBy: 'user-123',
      deletionReason: 'Orphaned',
      canRecover: true
    };

    mockStorageGet
      .mockResolvedValueOnce(mockDeletedData)
      .mockResolvedValueOnce(null); // No current data

    const req = {
      payload: {
        localId: 'localId-123'
      }
    };

    const result = await previewDeletedEmbed(req);

    expect(result.success).toBe(true);
    expect(result.preview).toBeDefined();
    expect(result.preview.localId).toBe('localId-123');
    expect(result.preview.deletedData.excerptId).toBe('excerpt-123');
    expect(result.preview.deletedData.deletedAt).toBe('2025-11-25T10:00:00Z');
    expect(result.preview.canRecover).toBe(true);
  });

  test('should return error when deleted embed not found', async () => {
    mockStorageGet.mockResolvedValue(null);

    const req = {
      payload: {
        localId: 'localId-123'
      }
    };

    const result = await previewDeletedEmbed(req);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ERROR_CODES.NOT_FOUND_EMBED);
    expect(result.error).toContain('No soft-deleted data found');
    expect(result.localId).toBe('localId-123');
  });

  test('should return INTERNAL_ERROR when exception occurs', async () => {
    mockStorageGet.mockRejectedValue(new Error('Storage error'));

    const req = {
      payload: {
        localId: 'localId-123'
      }
    };

    const result = await previewDeletedEmbed(req);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ERROR_CODES.INTERNAL_ERROR);
    expect(result.error).toBe('Storage error');
    expect(result.localId).toBe('localId-123');
  });
});

describe('restoreDeletedEmbed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should restore deleted embed successfully', async () => {
    const mockDeletedData = {
      excerptId: 'excerpt-123',
      variableValues: { client: 'Acme Corp' },
      toggleStates: { premium: true },
      canRecover: true,
      pageId: 'page-456'
    };

    mockStorageGet
      .mockResolvedValueOnce(mockDeletedData) // deleted data
      .mockResolvedValueOnce(null); // no current data

    mockStorageSet.mockResolvedValue(undefined);
    mockStorageDelete.mockResolvedValue(undefined);

    const req = {
      payload: {
        localId: 'localId-123',
        force: false
      }
    };

    const result = await restoreDeletedEmbed(req);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data.localId).toBe('localId-123');
    expect(result.data.restoredAt).toBeDefined();
    expect(result.data.restoredFrom).toBe('soft-delete');
    expect(mockStorageSet).toHaveBeenCalledWith('macro-vars:localId-123', expect.objectContaining({
      excerptId: 'excerpt-123',
      restoredAt: expect.any(String),
      restoredFrom: 'soft-delete'
    }));
    expect(mockStorageDelete).toHaveBeenCalledWith('macro-vars-deleted:localId-123');
  });

  test('should return VALIDATION_REQUIRED error for missing localId', async () => {
    const req = {
      payload: {}
    };

    const result = await restoreDeletedEmbed(req);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ERROR_CODES.VALIDATION_REQUIRED);
    expect(result.error).toContain('localId is required');
    expect(result.field).toBe('localId');
  });

  test('should return error when deleted data not found', async () => {
    mockStorageGet.mockResolvedValue(null);

    const req = {
      payload: {
        localId: 'localId-123'
      }
    };

    const result = await restoreDeletedEmbed(req);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ERROR_CODES.NOT_FOUND_EMBED);
    expect(result.error).toContain('No deleted data found');
    expect(result.localId).toBe('localId-123');
  });

  test('should return error when canRecover is false', async () => {
    const mockDeletedData = {
      excerptId: 'excerpt-123',
      canRecover: false
    };

    mockStorageGet.mockResolvedValue(mockDeletedData);

    const req = {
      payload: {
        localId: 'localId-123'
      }
    };

    const result = await restoreDeletedEmbed(req);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ERROR_CODES.OPERATION_NOT_ALLOWED);
    expect(result.error).toContain('non-recoverable');
    expect(result.localId).toBe('localId-123');
  });

  test('should return error when current data exists and force=false', async () => {
    const mockDeletedData = {
      excerptId: 'excerpt-123',
      canRecover: true
    };

    const mockCurrentData = {
      excerptId: 'excerpt-123',
      variableValues: {}
    };

    mockStorageGet
      .mockResolvedValueOnce(mockDeletedData)
      .mockResolvedValueOnce(mockCurrentData);

    const req = {
      payload: {
        localId: 'localId-123',
        force: false
      }
    };

    const result = await restoreDeletedEmbed(req);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ERROR_CODES.DEPENDENCY_EXISTS);
    expect(result.error).toContain('already exists');
    expect(result.hasConflict).toBe(true);
    expect(result.localId).toBe('localId-123');
  });

  test('should restore with force=true when current data exists', async () => {
    const mockDeletedData = {
      excerptId: 'excerpt-123',
      variableValues: { client: 'Acme' },
      canRecover: true
    };

    const mockCurrentData = {
      excerptId: 'excerpt-123',
      variableValues: { client: 'New Corp' }
    };

    mockStorageGet
      .mockResolvedValueOnce(mockDeletedData)
      .mockResolvedValueOnce(mockCurrentData);

    mockStorageSet.mockResolvedValue(undefined);
    mockStorageDelete.mockResolvedValue(undefined);

    const req = {
      payload: {
        localId: 'localId-123',
        force: true
      }
    };

    const result = await restoreDeletedEmbed(req);

    expect(result.success).toBe(true);
    expect(mockStorageSet).toHaveBeenCalled();
  });

  test('should return INTERNAL_ERROR when exception occurs', async () => {
    mockStorageGet.mockRejectedValue(new Error('Storage error'));

    const req = {
      payload: {
        localId: 'localId-123'
      }
    };

    const result = await restoreDeletedEmbed(req);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ERROR_CODES.INTERNAL_ERROR);
    expect(result.error).toBe('Storage error');
    expect(result.localId).toBe('localId-123');
  });
});

describe('restoreFromBackup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should restore specific embeds from backup successfully', async () => {
    const mockMetadata = {
      canRestore: true,
      createdAt: '2025-11-25T10:00:00Z'
    };

    const mockBackupData1 = {
      excerptId: 'excerpt-123',
      variableValues: { client: 'Acme Corp' }
    };

    const mockBackupData2 = {
      excerptId: 'excerpt-456',
      variableValues: { client: 'Beta Inc' }
    };

    mockStorageGet
      .mockResolvedValueOnce(mockMetadata)
      .mockResolvedValueOnce(mockBackupData1)
      .mockResolvedValueOnce(null) // No current data for localId-1
      .mockResolvedValueOnce(mockBackupData2)
      .mockResolvedValueOnce(null); // No current data for localId-2

    mockStorageSet.mockResolvedValue(undefined);

    const mockQuery = {
      where: jest.fn(() => ({
        getMany: jest.fn().mockResolvedValue({
          results: [
            { key: 'backup-20251125-103000:embed:localId-1' },
            { key: 'backup-20251125-103000:embed:localId-2' }
          ]
        })
      }))
    };

    mockStorageQuery.mockReturnValue(mockQuery);

    const req = {
      payload: {
        backupId: 'backup-20251125-103000',
        localIds: ['localId-1', 'localId-2'],
        force: false
      }
    };

    const result = await restoreFromBackup(req);

    expect(result.success).toBe(true);
    expect(result.backupId).toBe('backup-20251125-103000');
    expect(result.restored).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.details.restored).toContain('localId-1');
    expect(result.details.restored).toContain('localId-2');
  });

  test('should restore all embeds from backup when localIds not specified', async () => {
    const mockMetadata = {
      canRestore: true
    };

    const mockBackupData = {
      excerptId: 'excerpt-123',
      variableValues: { client: 'Acme Corp' }
    };

    mockStorageGet
      .mockResolvedValueOnce(mockMetadata)
      .mockResolvedValueOnce(mockBackupData)
      .mockResolvedValueOnce(null); // No current data

    mockStorageSet.mockResolvedValue(undefined);

    const mockQuery = {
      where: jest.fn(() => ({
        getMany: jest.fn().mockResolvedValue({
          results: [
            { key: 'backup-20251125-103000:embed:localId-1' }
          ]
        })
      }))
    };

    mockStorageQuery.mockReturnValue(mockQuery);

    const req = {
      payload: {
        backupId: 'backup-20251125-103000',
        force: false
      }
    };

    const result = await restoreFromBackup(req);

    expect(result.success).toBe(true);
    expect(result.restored).toBe(1);
  });

  test('should skip embeds that already exist when force=false', async () => {
    const mockMetadata = {
      canRestore: true
    };

    const mockBackupData = {
      excerptId: 'excerpt-123',
      variableValues: { client: 'Acme Corp' }
    };

    const mockCurrentData = {
      excerptId: 'excerpt-123',
      variableValues: { client: 'New Corp' }
    };

    mockStorageGet
      .mockResolvedValueOnce(mockMetadata)
      .mockResolvedValueOnce(mockBackupData)
      .mockResolvedValueOnce(mockCurrentData); // Current data exists

    const req = {
      payload: {
        backupId: 'backup-20251125-103000',
        localIds: ['localId-1'],
        force: false
      }
    };

    const result = await restoreFromBackup(req);

    expect(result.success).toBe(true);
    expect(result.restored).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.details.skipped[0].reason).toContain('Already exists');
  });

  test('should return error when backup not found', async () => {
    mockStorageGet.mockResolvedValue(null);

    const req = {
      payload: {
        backupId: 'backup-20251125-103000',
        localIds: ['localId-1']
      }
    };

    const result = await restoreFromBackup(req);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ERROR_CODES.NOT_FOUND_EMBED);
    expect(result.error).toContain('Backup not found');
    expect(result.backupId).toBe('backup-20251125-103000');
  });

  test('should return INTERNAL_ERROR when exception occurs', async () => {
    mockStorageGet.mockRejectedValue(new Error('Storage error'));

    const req = {
      payload: {
        backupId: 'backup-20251125-103000',
        localIds: ['localId-1']
      }
    };

    const result = await restoreFromBackup(req);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ERROR_CODES.INTERNAL_ERROR);
    expect(result.error).toBe('Storage error');
    expect(result.backupId).toBe('backup-20251125-103000');
  });
});

