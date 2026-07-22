import * as path from 'path';
import { app } from 'electron';

// ── fs mock ─────────────────────────────────────────────────────────────
// config.ts uses fs.accessSync, fs.constants.X_OK, and fs.mkdirSync.
// We mock the whole module so the non-configurable accessSync property
// can be overridden per test.
const mockAccessSync = jest.fn();
const mockMkdirSync = jest.fn();

jest.mock('fs', () => ({
  accessSync: (...args: unknown[]) => mockAccessSync(...args),
  mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
  constants: { X_OK: 1 },
}));

// ── other mocks ─────────────────────────────────────────────────────────
jest.mock('../settings', () => ({
  readSettings: jest.fn(),
  updateSetting: jest.fn(),
}));

jest.mock('../systemPaths', () => ({
  getSystemDataPath: jest.fn().mockReturnValue('/mock/system/data/assets'),
}));

import {
  getNodePath,
  getDefaultAssetsPath,
  getOptionalNodeModulesPath,
  _resetCondaEnvCache,
} from '../config';
import { readSettings } from '../settings';
import { getSystemDataPath } from '../systemPaths';

const originalPlatform = process.platform;
const originalEnv = process.env;

describe('Config – node paths', () => {
  const mockReadSettings = readSettings as jest.MockedFunction<typeof readSettings>;
  const mockGetSystemDataPath = getSystemDataPath as jest.MockedFunction<typeof getSystemDataPath>;

  beforeEach(() => {
    jest.clearAllMocks();
    _resetCondaEnvCache();
    process.env = { ...originalEnv };
    delete process.env.CONDA_PREFIX;
    // Default: settings return a known conda path
    mockReadSettings.mockReturnValue({ CONDA_ENV: '/test/conda' });
    mockGetSystemDataPath.mockReturnValue('/mock/system/data/assets');
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    process.env = originalEnv;
  });

  // ── getNodePath ─────────────────────────────────────────────────────

  describe('getNodePath', () => {
    it('should return conda node path when it exists (Unix)', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });

      const condaNode = path.join('/test/conda', 'bin', 'node');
      mockAccessSync.mockImplementation((p: string) => {
        if (p === condaNode) return;
        throw new Error('ENOENT');
      });

      const result = getNodePath();

      expect(result).toBe(condaNode);
      expect(mockAccessSync).toHaveBeenCalledWith(condaNode);
    });

    it('should return conda node path when it exists (Windows)', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });

      const condaNode = path.join('/test/conda', 'node.exe');
      mockAccessSync.mockImplementation((p: string) => {
        if (p === condaNode) return;
        throw new Error('ENOENT');
      });

      const result = getNodePath();

      expect(result).toBe(condaNode);
      expect(mockAccessSync).toHaveBeenCalledWith(condaNode);
    });

    it('should fall back to PATH search when conda node does not exist', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      process.env.PATH = '/usr/local/bin:/usr/bin';

      const condaNode = path.join('/test/conda', 'bin', 'node');
      const pathNode = path.join('/usr/local/bin', 'node');

      mockAccessSync.mockImplementation((p: string, mode?: number) => {
        // Conda node does not exist
        if (p === condaNode) throw new Error('ENOENT');
        // PATH search: found in /usr/local/bin (called with X_OK)
        if (p === pathNode && mode === 1) return;
        throw new Error('ENOENT');
      });

      const result = getNodePath();

      expect(result).toBe(pathNode);
    });

    it('should return bare "node" when nothing is found (Unix)', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      process.env.PATH = '/nonexistent/bin';

      mockAccessSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      const result = getNodePath();

      expect(result).toBe('node');
    });

    it('should return bare "node.exe" when nothing is found (Windows)', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      process.env.PATH = 'C:\\nonexistent\\bin';

      mockAccessSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      const result = getNodePath();

      expect(result).toBe('node.exe');
    });
  });

  // ── getDefaultAssetsPath ────────────────────────────────────────────

  describe('getDefaultAssetsPath', () => {
    it('should use ASSET_FOLDER env var when set', () => {
      process.env.ASSET_FOLDER = '/custom/asset/folder';

      const result = getDefaultAssetsPath();

      expect(result).toBe('/custom/asset/folder');
      expect(mockGetSystemDataPath).not.toHaveBeenCalled();
    });

    it('should use STORAGE_PATH env var as fallback when ASSET_FOLDER is not set', () => {
      delete process.env.ASSET_FOLDER;
      process.env.STORAGE_PATH = '/custom/storage/path';

      const result = getDefaultAssetsPath();

      expect(result).toBe('/custom/storage/path');
      expect(mockGetSystemDataPath).not.toHaveBeenCalled();
    });

    it('should fall back to systemDataPath when no env vars are set', () => {
      delete process.env.ASSET_FOLDER;
      delete process.env.STORAGE_PATH;

      const result = getDefaultAssetsPath();

      expect(result).toBe('/mock/system/data/assets');
      expect(mockGetSystemDataPath).toHaveBeenCalledWith('assets');
    });

    it('should prefer ASSET_FOLDER over STORAGE_PATH when both are set', () => {
      process.env.ASSET_FOLDER = '/asset/folder';
      process.env.STORAGE_PATH = '/storage/path';

      const result = getDefaultAssetsPath();

      expect(result).toBe('/asset/folder');
    });
  });

  // ── getOptionalNodeModulesPath ──────────────────────────────────────

  describe('getOptionalNodeModulesPath', () => {
    it('should return correct path under userData', () => {
      const mockGetPath = app.getPath as jest.MockedFunction<typeof app.getPath>;
      mockGetPath.mockReturnValue('/mock/userData');

      const result = getOptionalNodeModulesPath();

      expect(result).toBe(
        path.join('/mock/userData', 'optional-node', 'node_modules')
      );
      expect(mockGetPath).toHaveBeenCalledWith('userData');
    });
  });
});
