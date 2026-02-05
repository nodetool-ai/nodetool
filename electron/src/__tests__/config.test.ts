import {
  getCondaEnvPath,
  getPythonPath,
  getUVPath,
  getOllamaPath,
  getOllamaModelsPath,
  getCondaLockFilePath,
  getProcessEnv,
  srcPath,
  PID_FILE_PATH,
  webPath,
} from '../config';
import { readSettings } from '../settings';
import * as path from 'path';
import { app } from 'electron';

// Mock dependencies
jest.mock('../settings', () => ({
  readSettings: jest.fn(),
  updateSetting: jest.fn()
}));

// Mock process.platform and process.env
const originalPlatform = process.platform;
const originalEnv = process.env;

describe('Config', () => {
  const mockReadSettings = readSettings as jest.MockedFunction<typeof readSettings>;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset process.env and remove CONDA_PREFIX to allow settings mocking
    process.env = { ...originalEnv };
    // Explicitly unset CONDA_PREFIX to allow settings-based path resolution
    delete process.env.CONDA_PREFIX;
  });

  afterEach(() => {
    // Restore original values
    Object.defineProperty(process, 'platform', {
      value: originalPlatform
    });
    process.env = originalEnv;
  });

  describe('exported constants', () => {
    it('should export srcPath', () => {
      expect(srcPath).toBeDefined();
      expect(typeof srcPath).toBe('string');
    });

    it('should export PID_FILE_PATH', () => {
      expect(PID_FILE_PATH).toBeDefined();
      expect(typeof PID_FILE_PATH).toBe('string');
      expect(PID_FILE_PATH).toContain('server.pid');
    });

    it('should export webPath', () => {
      expect(webPath).toBeDefined();
      expect(typeof webPath).toBe('string');
    });

  });

  describe('getCondaEnvPath', () => {
    it('should return path from settings when available', () => {
      const customPath = '/custom/conda/path';
      mockReadSettings.mockReturnValue({ CONDA_ENV: customPath });

      const result = getCondaEnvPath();

      expect(result).toBe(customPath);
      expect(mockReadSettings).toHaveBeenCalled();
    });

    it('should return default path when settings is empty', () => {
      mockReadSettings.mockReturnValue({});

      const result = getCondaEnvPath();

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return default path when CONDA_ENV is empty string', () => {
      mockReadSettings.mockReturnValue({ CONDA_ENV: '  ' });

      const result = getCondaEnvPath();

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should return default path when readSettings throws error', () => {
      mockReadSettings.mockImplementation(() => {
        throw new Error('Settings read error');
      });

      const result = getCondaEnvPath();

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    describe('default conda path - Windows', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', {
          value: 'win32'
        });
        mockReadSettings.mockReturnValue({});
      });

      it('should use ALLUSERSPROFILE when available', () => {
        process.env.ALLUSERSPROFILE = 'C:\\ProgramData';

        const result = getCondaEnvPath();

        expect(result).toContain('C:\\ProgramData');
        expect(result).toContain('nodetool');
        expect(result).toContain('conda_env');
      });

      it('should fallback to APPDATA when ALLUSERSPROFILE not available', () => {
        delete process.env.ALLUSERSPROFILE;
        process.env.APPDATA = 'C:\\Users\\Test\\AppData\\Roaming';

        const result = getCondaEnvPath();

        expect(result).toContain('AppData');
        expect(result).toContain('nodetool');
      });

      it('should fallback to homedir when no env vars available', () => {
        delete process.env.ALLUSERSPROFILE;
        delete process.env.APPDATA;

        const result = getCondaEnvPath();

        expect(result).toContain('nodetool');
        expect(result).toContain('conda_env');
      });
    });

    describe('default conda path - macOS', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', {
          value: 'darwin'
        });
        mockReadSettings.mockReturnValue({});
      });

      it('should use user path when SUDO_USER is set', () => {
        process.env.SUDO_USER = 'testuser';

        const result = getCondaEnvPath();

        // macOS implementation ignores SUDO_USER and always uses ~/nodetool_env
        expect(result.replace(/\\/g, '/')).toContain('nodetool_env');
      });

      it('should use user path when SUDO_USER not set', () => {
        delete process.env.SUDO_USER;

        const result = getCondaEnvPath();

        expect(result.replace(/\\/g, '/')).toContain('nodetool_env');
      });
    });

    describe('default conda path - Linux', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', {
          value: 'linux'
        });
        mockReadSettings.mockReturnValue({});
      });

      it('should use system path when SUDO_USER is set', () => {
        process.env.SUDO_USER = 'testuser';

        const result = getCondaEnvPath();

        expect(result).toBe('/opt/nodetool/conda_env');
      });

      it('should use user path when SUDO_USER not set', () => {
        delete process.env.SUDO_USER;

        const result = getCondaEnvPath();

        // Normalize separators so this is platform-agnostic (Windows runners use `\`)
        expect(result.replace(/\\/g, '/')).toContain('.local/share/nodetool/conda_env');
      });
    });

    describe('default conda path - Other platforms', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', {
          value: 'freebsd'
        });
        mockReadSettings.mockReturnValue({});
      });

      it('should use fallback path for unknown platforms', () => {
        const result = getCondaEnvPath();

        // Normalize separators so this is platform-agnostic (Windows runners use `\`)
        expect(result.replace(/\\/g, '/')).toContain('.nodetool/conda_env');
      });
    });
  });

  describe('getPythonPath', () => {
    beforeEach(() => {
      mockReadSettings.mockReturnValue({ CONDA_ENV: '/test/conda' });
    });

    it('should return Windows python path', () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32'
      });

      const result = getPythonPath();

      expect(result).toBe(path.join('/test/conda', 'python.exe'));
    });

    it('should return Unix python path', () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux'
      });

      const result = getPythonPath();

      expect(result).toBe(path.join('/test/conda', 'bin', 'python'));
    });
  });

  describe('getUVPath', () => {
    beforeEach(() => {
      mockReadSettings.mockReturnValue({ CONDA_ENV: '/test/conda' });
    });

    it('should return Windows uv path', () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32'
      });

      const result = getUVPath();

      expect(result).toBe(path.join('/test/conda', 'Library', 'bin', 'uv.exe'));
    });

    it('should return Unix uv path', () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux'
      });

      const result = getUVPath();

      expect(result).toBe(path.join('/test/conda', 'bin', 'uv'));
    });
  });

  describe('getOllamaPath', () => {
    beforeEach(() => {
      mockReadSettings.mockReturnValue({ CONDA_ENV: '/test/conda' });
    });

    it('should return Windows ollama path', () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32'
      });

      const result = getOllamaPath();

      expect(result).toBe(path.join('/test/conda', 'Scripts', 'ollama.exe'));
    });

    it('should return Unix ollama path', () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux'
      });

      const result = getOllamaPath();

      expect(result).toBe(path.join('/test/conda', 'bin', 'ollama'));
    });
  });

  describe('getOllamaModelsPath', () => {
    it('should return ollama models path', () => {
      const result = getOllamaModelsPath();

      expect(result).toBeDefined();
      expect(result).toContain('.ollama');
      expect(result).toContain('models');
    });
  });

  describe('getCondaLockFilePath', () => {
    const lockFileName = 'environment.lock.yml';
    const originalIsPackaged = app.isPackaged;
    const originalResourcesPath = (process as unknown as { resourcesPath?: string }).resourcesPath;

    afterEach(() => {
      (app as unknown as { isPackaged: boolean }).isPackaged = originalIsPackaged;

      if (typeof originalResourcesPath === 'undefined') {
        delete (process as unknown as { resourcesPath?: string }).resourcesPath;
      } else {
        Object.defineProperty(process, 'resourcesPath', {
          value: originalResourcesPath,
          configurable: true,
          writable: true,
        });
      }
    });

    it('should resolve to packaged resources path when bundled', () => {
      (app as unknown as { isPackaged: boolean }).isPackaged = true;
      Object.defineProperty(process, 'resourcesPath', {
        value: '/mock/resources',
        configurable: true,
        writable: true,
      });

      const result = getCondaLockFilePath();

      expect(result).toBe(path.join('/mock/resources', lockFileName));
    });

    it('should resolve to the local resources path during development', () => {
      (app as unknown as { isPackaged: boolean }).isPackaged = false;

      const expected = path.join(
        path.resolve(__dirname, '..', '..'),
        'resources',
        lockFileName
      );

      const result = getCondaLockFilePath();

      expect(result).toBe(expected);
    });
  });

  describe('getProcessEnv', () => {
    beforeEach(() => {
      mockReadSettings.mockReturnValue({ CONDA_ENV: '/test/conda' });
      process.env = {
        PATH: '/usr/bin:/bin',
        HOME: '/home/user',
        SOME_NUMBER_VAR: '123',
        SOME_UNDEFINED_VAR: undefined
      };
    });

    it('should return process environment with conda paths on Windows', () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32'
      });

      const result = getProcessEnv();
      const normalizedPath = (result.PATH ?? '').replace(/\\/g, '/');

      expect(result.PYTHONPATH).toBeDefined();
      expect(result.PYTHONUNBUFFERED).toBe('1');
      expect(result.PYTHONNOUSERSITE).toBe('1');
      expect(normalizedPath).toContain('/test/conda');
      expect(result.PATH).toContain('Scripts');
      expect(result.PATH).toContain('Library');
      expect(result.HOME).toBe('/home/user');
      expect(result.SOME_NUMBER_VAR).toBe('123');
      expect(result.SOME_UNDEFINED_VAR).toBeUndefined();
      // Verify UV cache environment variables are set
      expect(result.UV_CACHE_DIR).toBeDefined();
      expect(result.UV_CACHE_DIR).toContain('uv-cache');
      expect(result.XDG_CACHE_HOME).toBeDefined();
      expect(result.XDG_CACHE_HOME).toContain('cache');
    });

    it('should return process environment with conda paths on Unix', () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux'
      });

      const result = getProcessEnv();
      const normalizedPath = (result.PATH ?? '').replace(/\\/g, '/');

      expect(result.PYTHONPATH).toBeDefined();
      expect(result.PYTHONUNBUFFERED).toBe('1');
      expect(result.PYTHONNOUSERSITE).toBe('1');
      expect(normalizedPath).toContain('/test/conda/bin');
      expect(normalizedPath).toContain('/test/conda/lib');
      expect(result.HOME).toBe('/home/user');
      // Verify UV cache environment variables are set
      expect(result.UV_CACHE_DIR).toBeDefined();
      expect(result.UV_CACHE_DIR).toContain('uv-cache');
      expect(result.XDG_CACHE_HOME).toBeDefined();
      expect(result.XDG_CACHE_HOME).toContain('cache');
    });

    it('should handle missing PATH environment variable', () => {
      delete process.env.PATH;

      const result = getProcessEnv();
      const normalizedPath = (result.PATH ?? '').replace(/\\/g, '/');

      expect(result.PATH).toBeDefined();
      expect(normalizedPath).toContain('/test/conda');
    });

    it('should filter out non-string environment variables', () => {
      process.env.STRING_VAR = 'test';
      process.env.NUMBER_VAR = 123 as any;
      process.env.OBJECT_VAR = {} as any;

      const result = getProcessEnv();

      expect(result.STRING_VAR).toBe('test');
      expect(result.NUMBER_VAR).toBeUndefined();
      expect(result.OBJECT_VAR).toBeUndefined();
    });

    it('should set HOME from os.homedir() when not in environment', () => {
      delete process.env.HOME;

      const result = getProcessEnv();

      expect(result.HOME).toBeDefined();
      expect(typeof result.HOME).toBe('string');
      expect(result.HOME.length).toBeGreaterThan(0);
    });

    it('should set UV_CACHE_DIR to a writable location inside userData', () => {
      const result = getProcessEnv();

      expect(result.UV_CACHE_DIR).toBeDefined();
      expect(result.UV_CACHE_DIR).toContain('uv-cache');
      // UV_CACHE_DIR should be inside userData directory
      const userDataPath = app.getPath('userData');
      expect(result.UV_CACHE_DIR).toContain(userDataPath);
    });
  });
});
