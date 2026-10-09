import {
  getCondaEnvPath,
  getPythonPath,
  getUVPath,
  getProcessEnv,
  getLocalFileRootsEnv,
  _resetCondaEnvCache,
  srcPath,
  PID_FILE_PATH,
  webPath,
} from '../config';
import { readSettings } from '../settings';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
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
  const mockReadSettings = jest.mocked(readSettings);

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the module-level conda path cache so each test starts fresh
    _resetCondaEnvCache();
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
      expect(srcPath).toEqual(expect.any(String));
    });

    it('should export PID_FILE_PATH', () => {
      expect(PID_FILE_PATH).toBeDefined();
      expect(PID_FILE_PATH).toEqual(expect.any(String));
      expect(PID_FILE_PATH).toContain('server.pid');
    });

    it('should export webPath', () => {
      expect(webPath).toBeDefined();
      expect(webPath).toEqual(expect.any(String));
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

    it('should ignore activated conda env outside dev mode', () => {
      const customPath = '/custom/conda/path';
      process.env.CONDA_PREFIX = '/active/conda/env';
      delete process.env.NT_ELECTRON_DEV_MODE;
      mockReadSettings.mockReturnValue({ CONDA_ENV: customPath });

      const result = getCondaEnvPath();

      expect(result).toBe(customPath);
    });

    it('should use activated conda env in explicit dev mode', () => {
      process.env.CONDA_PREFIX = '/active/conda/env';
      process.env.NT_ELECTRON_DEV_MODE = '1';
      mockReadSettings.mockReturnValue({ CONDA_ENV: '/custom/conda/path' });

      const result = getCondaEnvPath();

      expect(result).toBe('/active/conda/env');
    });

    it('should return default path when settings is empty', () => {
      mockReadSettings.mockReturnValue({});

      const result = getCondaEnvPath();

      expect(result).toBeDefined();
      expect(result).toEqual(expect.any(String));
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return default path when CONDA_ENV is empty string', () => {
      mockReadSettings.mockReturnValue({ CONDA_ENV: '  ' });

      const result = getCondaEnvPath();

      expect(result).toBeDefined();
      expect(result).toEqual(expect.any(String));
    });

    it('should return default path when readSettings throws error', () => {
      mockReadSettings.mockImplementation(() => {
        throw new Error('Settings read error');
      });

      const result = getCondaEnvPath();

      expect(result).toBeDefined();
      expect(result).toEqual(expect.any(String));
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
      expect(result.XDG_CACHE_HOME).toBeUndefined();
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
      expect(result.XDG_CACHE_HOME).toBeUndefined();
    });

    it('places HF_HOME where huggingface_hub would, honouring XDG_CACHE_HOME', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      expect(getProcessEnv().HF_HOME).toBe(path.join('/home/user', '.cache', 'huggingface'));

      const xdg = fs.mkdtempSync(path.join(os.tmpdir(), 'nt-xdg-'));
      process.env.XDG_CACHE_HOME = xdg;
      const withXdg = getProcessEnv();
      expect(withXdg.HF_HOME).toBe(path.join(xdg, 'huggingface'));
      // The user's XDG_CACHE_HOME passes through unchanged.
      expect(withXdg.XDG_CACHE_HOME).toBe(xdg);

      process.env.HF_HOME = path.join(xdg, 'explicit-hf');
      expect(getProcessEnv().HF_HOME).toBe(path.join(xdg, 'explicit-hf'));
      fs.rmSync(xdg, { recursive: true, force: true });
    });

    it('keeps the ~/.cache model caches when only they hold data (Flatpak XDG_CACHE_HOME)', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nt-home-'));
      const xdg = path.join(home, '.var', 'app', 'ai.nodetool.NodeTool', 'cache');
      fs.mkdirSync(path.join(home, '.cache', 'huggingface', 'hub', 'models--a--b'), { recursive: true });
      fs.mkdirSync(path.join(home, '.cache', 'llama.cpp'), { recursive: true });
      fs.writeFileSync(path.join(home, '.cache', 'llama.cpp', 'model.gguf'), '');
      process.env.HOME = home;
      process.env.XDG_CACHE_HOME = xdg;

      const legacy = getProcessEnv();
      expect(legacy.HF_HOME).toBe(path.join(home, '.cache', 'huggingface'));
      expect(legacy.LLAMA_CACHE).toBe(path.join(home, '.cache', 'llama.cpp'));

      // Once the XDG caches hold data, they win.
      fs.mkdirSync(path.join(xdg, 'huggingface', 'hub', 'models--c--d'), { recursive: true });
      fs.mkdirSync(path.join(xdg, 'llama.cpp'), { recursive: true });
      fs.writeFileSync(path.join(xdg, 'llama.cpp', 'other.gguf'), '');
      const current = getProcessEnv();
      expect(current.HF_HOME).toBe(path.join(xdg, 'huggingface'));
      expect(current.LLAMA_CACHE).toBe(path.join(xdg, 'llama.cpp'));

      // A user's LLAMA_CACHE is left alone.
      process.env.LLAMA_CACHE = '/models/gguf';
      expect(getProcessEnv().LLAMA_CACHE).toBe('/models/gguf');
      fs.rmSync(home, { recursive: true, force: true });
    });

    it('does not set LLAMA_CACHE without XDG_CACHE_HOME or off Linux', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      expect(getProcessEnv().LLAMA_CACHE).toBeUndefined();
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      process.env.XDG_CACHE_HOME = '/tmp/xdg';
      expect(getProcessEnv().LLAMA_CACHE).toBeUndefined();
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

    it('should remove inherited conda and virtualenv markers', () => {
      process.env.CONDA_PREFIX = '/active/conda/env';
      process.env.CONDA_DEFAULT_ENV = 'base';
      process.env.VIRTUAL_ENV = '/venv/path';
      process.env.UV_PYTHON = '/wrong/python';

      const result = getProcessEnv();

      expect(result.CONDA_PREFIX).toBeUndefined();
      expect(result.CONDA_DEFAULT_ENV).toBeUndefined();
      expect(result.VIRTUAL_ENV).toBeUndefined();
      expect(result.UV_PYTHON).toBeUndefined();
    });

    it('should set HOME from os.homedir() when not in environment', () => {
      delete process.env.HOME;

      const result = getProcessEnv();

      expect(result.HOME).toBeDefined();
      expect(result.HOME).toEqual(expect.any(String));
      expect(result.HOME.length).toBeGreaterThan(0);
    });

    it('puts the bundled runtime directory first on PATH when packaged', () => {
      // npm lifecycle scripts run `sh -c node …`; a Finder-launched macOS app
      // has no node on PATH — nodetool-ai/nodetool#6090.
      const resources = fs.mkdtempSync(path.join(os.tmpdir(), 'nt-res-'));
      const runtimeDir = path.join(resources, 'backend', 'runtime');
      fs.mkdirSync(runtimeDir, { recursive: true });
      fs.writeFileSync(path.join(runtimeDir, 'node'), '#!/bin/sh\n', { mode: 0o755 });
      Object.defineProperty(process, 'platform', { value: 'linux' });
      const originalPackaged = app.isPackaged;
      const originalResources = (process as any).resourcesPath;
      (app as any).isPackaged = true;
      (process as any).resourcesPath = resources;
      try {
        const result = getProcessEnv();
        expect((result.PATH ?? '').split(path.delimiter)[0]).toBe(runtimeDir);
      } finally {
        (app as any).isPackaged = originalPackaged;
        (process as any).resourcesPath = originalResources;
        fs.rmSync(resources, { recursive: true, force: true });
      }
    });

    it('lets lifecycle scripts run node and nested npm commands with the bundled runtime', () => {
      // Only node was on PATH, so an install script that reached
      // `npm run build` failed with exit 127 — nodetool-ai/nodetool#6090.
      if (process.platform === 'win32') return;
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "nt npm '"));
      const runtimeDir = path.join(root, 'resources', 'backend', 'runtime');
      fs.mkdirSync(runtimeDir, { recursive: true });
      fs.symlinkSync(process.execPath, path.join(runtimeDir, 'node'));
      const npmPackage = path.join(
        path.dirname(path.dirname(process.execPath)),
        'lib',
        'node_modules',
        'npm'
      );
      fs.symlinkSync(npmPackage, path.join(runtimeDir, 'npm'));
      const project = path.join(root, 'project');
      fs.mkdirSync(project);
      fs.writeFileSync(
        path.join(project, 'package.json'),
        JSON.stringify({
          name: 'lifecycle-fixture',
          version: '1.0.0',
          scripts: {
            postinstall: 'node --version && npm run smoke-child',
            'smoke-child': "node -e \"require('fs').writeFileSync('child-ran', 'ok')\""
          }
        })
      );
      const userData = path.join(root, 'userData');
      const originalPackaged = app.isPackaged;
      const originalResources = (process as any).resourcesPath;
      const getPath = jest.mocked(app.getPath);
      const originalGetPath = getPath.getMockImplementation();
      (app as any).isPackaged = true;
      (process as any).resourcesPath = path.join(root, 'resources');
      getPath.mockImplementation((name: string) =>
        name === 'userData' ? userData : `/mock/${name}`
      );
      // The launchd PATH of a Finder-launched app: a shell, no node or npm.
      process.env.PATH = '/usr/bin:/bin';
      try {
        const env = getProcessEnv();
        const install = spawnSync(
          path.join(runtimeDir, 'node'),
          [path.join(runtimeDir, 'npm', 'bin', 'npm-cli.js'), 'install', '--offline', '--no-audit', '--no-fund'],
          {
            cwd: project,
            env: { ...env, npm_config_cache: path.join(root, 'npm-cache') },
            encoding: 'utf8'
          }
        );
        expect({ status: install.status, stderr: install.stderr }).toEqual({
          status: 0,
          stderr: expect.any(String)
        });
        expect(fs.readFileSync(path.join(project, 'child-ran'), 'utf8')).toBe('ok');
      } finally {
        (app as any).isPackaged = originalPackaged;
        (process as any).resourcesPath = originalResources;
        getPath.mockImplementation(originalGetPath);
        fs.rmSync(root, { recursive: true, force: true });
      }
    }, 60000);

    it('should set UV_CACHE_DIR to a writable location inside userData', () => {
      const result = getProcessEnv();

      expect(result.UV_CACHE_DIR).toBeDefined();
      expect(result.UV_CACHE_DIR).toContain('uv-cache');
      // UV_CACHE_DIR should be inside userData directory
      const userDataPath = app.getPath('userData').replace(/\\/g, '/');
      expect((result.UV_CACHE_DIR ?? '').replace(/\\/g, '/')).toContain(userDataPath);
    });
  });

  describe('getLocalFileRootsEnv', () => {
    // The server's own default is the home directory. That refused the preview
    // of an image dragged in from a folder outside home while the runner read
    // it happily — nodetool-ai/nodetool#4999.
    it('lifts the containment check for the desktop app', () => {
      expect(getLocalFileRootsEnv({})).toBe('*');
    });

    it('keeps roots the launching environment configured', () => {
      expect(
        getLocalFileRootsEnv({ NODETOOL_LOCAL_FILE_ROOTS: '/srv/media' })
      ).toBe('/srv/media');
    });

    it('ignores an empty setting', () => {
      expect(getLocalFileRootsEnv({ NODETOOL_LOCAL_FILE_ROOTS: '' })).toBe('*');
    });
  });
});
