import * as path from 'path';

// Mock dependencies before importing the module
jest.mock('../logger', () => ({
  logMessage: jest.fn(),
}));

jest.mock('../settings', () => ({
  readSettings: jest.fn().mockReturnValue({}),
  updateSetting: jest.fn(),
}));

jest.mock('../config', () => ({
  getPythonPath: jest.fn().mockReturnValue('/mock/conda/bin/python'),
  getProcessEnv: jest.fn().mockReturnValue({
    PATH: '/mock/conda/bin:/usr/bin',
    PYTHONPATH: '/mock/src',
    PYTHONUNBUFFERED: '1',
    PYTHONNOUSERSITE: '1',
  }),
  webPath: '/mock/web/dist',
  getCondaEnvPath: jest.fn().mockReturnValue('/mock/conda'),
  getOllamaModelsPath: jest.fn().mockReturnValue('/mock/.ollama/models'),
}));

jest.mock('child_process', () => ({
  exec: jest.fn(),
  execSync: jest.fn(),
}));

jest.mock('util', () => ({
  ...jest.requireActual('util'),
  promisify: jest.fn((fn) => jest.fn().mockResolvedValue({ stdout: '', stderr: '' })),
}));

jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
    unlink: jest.fn().mockResolvedValue(undefined),
    access: jest.fn().mockRejectedValue({ code: 'ENOENT' }),
  },
}));

import {
  installLaunchAgent,
  uninstallLaunchAgent,
  startLaunchAgent,
  stopLaunchAgent,
  getServiceStatus,
  isPlistInstalled,
  getLaunchAgentLogPaths,
  AGENT_LABEL,
  PLIST_PATH,
  LOG_DIR,
} from '../launchAgentService';
import { promises as fsPromises } from 'fs';
import { promisify } from 'util';

const originalPlatform = process.platform;

describe('LaunchAgentService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default to macOS
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true,
    });
  });

  describe('Constants', () => {
    it('should export AGENT_LABEL', () => {
      expect(AGENT_LABEL).toBe('ai.nodetool.server');
    });

    it('should export PLIST_PATH', () => {
      expect(PLIST_PATH).toBeDefined();
      expect(PLIST_PATH).toContain('ai.nodetool.server.plist');
    });

    it('should export LOG_DIR', () => {
      expect(LOG_DIR).toBeDefined();
      expect(LOG_DIR).toContain('Logs/nodetool');
    });
  });

  describe('getLaunchAgentLogPaths', () => {
    it('should return stdout and stderr log paths', () => {
      const paths = getLaunchAgentLogPaths();

      expect(paths.stdout).toContain('server.out.log');
      expect(paths.stderr).toContain('server.err.log');
      expect(paths.stdout).toContain('Logs/nodetool');
      expect(paths.stderr).toContain('Logs/nodetool');
    });
  });

  describe('isPlistInstalled', () => {
    it('should return false when plist does not exist', async () => {
      (fsPromises.access as jest.Mock).mockRejectedValue({ code: 'ENOENT' });

      const result = await isPlistInstalled();

      expect(result).toBe(false);
    });

    it('should return true when plist exists', async () => {
      (fsPromises.access as jest.Mock).mockResolvedValue(undefined);

      const result = await isPlistInstalled();

      expect(result).toBe(true);
    });
  });

  describe('getServiceStatus on non-macOS platforms', () => {
    it('should return error on Windows', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
      });

      const status = await getServiceStatus();

      expect(status.installed).toBe(false);
      expect(status.running).toBe(false);
      expect(status.error).toBe('LaunchAgent is only supported on macOS');
    });

    it('should return error on Linux', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        configurable: true,
      });

      const status = await getServiceStatus();

      expect(status.installed).toBe(false);
      expect(status.running).toBe(false);
      expect(status.error).toBe('LaunchAgent is only supported on macOS');
    });
  });

  describe('getServiceStatus on macOS', () => {
    it('should return not installed when plist does not exist', async () => {
      (fsPromises.access as jest.Mock).mockRejectedValue({ code: 'ENOENT' });

      const status = await getServiceStatus();

      expect(status.installed).toBe(false);
      expect(status.running).toBe(false);
      expect(status.label).toBe('ai.nodetool.server');
    });
  });

  describe('installLaunchAgent on non-macOS platforms', () => {
    it('should return error on Windows', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
      });

      const result = await installLaunchAgent();

      expect(result.success).toBe(false);
      expect(result.message).toBe('LaunchAgent installation is only supported on macOS');
    });

    it('should return error on Linux', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        configurable: true,
      });

      const result = await installLaunchAgent();

      expect(result.success).toBe(false);
      expect(result.message).toBe('LaunchAgent installation is only supported on macOS');
    });
  });

  describe('uninstallLaunchAgent on non-macOS platforms', () => {
    it('should return error on Windows', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
      });

      const result = await uninstallLaunchAgent();

      expect(result.success).toBe(false);
      expect(result.message).toBe('LaunchAgent uninstallation is only supported on macOS');
    });
  });

  describe('startLaunchAgent on non-macOS platforms', () => {
    it('should return error on Windows', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
      });

      const result = await startLaunchAgent();

      expect(result.success).toBe(false);
      expect(result.message).toBe('LaunchAgent is only supported on macOS');
    });
  });

  describe('stopLaunchAgent on non-macOS platforms', () => {
    it('should return error on Windows', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
      });

      const result = await stopLaunchAgent();

      expect(result.success).toBe(false);
      expect(result.message).toBe('LaunchAgent is only supported on macOS');
    });
  });

  describe('uninstallLaunchAgent when not installed', () => {
    it('should return success when not installed', async () => {
      (fsPromises.access as jest.Mock).mockRejectedValue({ code: 'ENOENT' });

      const result = await uninstallLaunchAgent();

      expect(result.success).toBe(true);
      expect(result.message).toBe('LaunchAgent is not installed');
    });
  });

  describe('startLaunchAgent when not installed', () => {
    it('should return error when not installed', async () => {
      (fsPromises.access as jest.Mock).mockRejectedValue({ code: 'ENOENT' });

      const result = await startLaunchAgent();

      expect(result.success).toBe(false);
      expect(result.message).toBe('LaunchAgent is not installed. Please install it first.');
    });
  });

  describe('stopLaunchAgent when not installed', () => {
    it('should return error when not installed', async () => {
      (fsPromises.access as jest.Mock).mockRejectedValue({ code: 'ENOENT' });

      const result = await stopLaunchAgent();

      expect(result.success).toBe(false);
      expect(result.message).toBe('LaunchAgent is not installed');
    });
  });
});
