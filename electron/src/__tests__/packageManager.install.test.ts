import { installExpectedPackages, installPackage, listInstalledPackages, uninstallPackage } from '../packageManager';
import { EventEmitter } from 'events';
import * as config from '../config';
import * as events from '../events';
import * as utils from '../utils';
import * as torchPlatformCache from '../torchPlatformCache';
import * as torchruntime from '../torchruntime';

jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

jest.mock('https', () => ({ get: jest.fn() }));

// The app version must play no part in which pack versions get installed.
jest.mock('electron', () => ({
  app: {
    getVersion: () => '9.9.9',
    getPath: () => '/tmp',
  },
}));

// Real collaborator modules; only the calls that would read the filesystem or
// a Python/conda install are stubbed on them.
jest.spyOn(config, 'getProcessEnv').mockReturnValue({});
jest.spyOn(config, 'getUVPath').mockReturnValue('/usr/bin/uv');
jest.spyOn(config, 'getPythonPath').mockReturnValue('/usr/bin/python');
jest.spyOn(config, 'getCondaEnvPath').mockReturnValue('/test/conda');

jest.spyOn(events, 'emitServerLog').mockImplementation(() => {});
jest.spyOn(events, 'emitBootMessage').mockImplementation(() => {});

jest.spyOn(utils, 'fileExists').mockResolvedValue(true);

jest.spyOn(torchPlatformCache, 'getSavedTorchPlatform').mockReturnValue(null);
const saveTorchPlatform = jest
  .spyOn(torchPlatformCache, 'saveTorchPlatform')
  .mockImplementation(() => {});
const detectTorchPlatform = jest.spyOn(torchruntime, 'detectTorchPlatform');

const { spawn } = require('child_process');
const https = require('https');

type Installed = Array<{ name: string; version: string }>;

/** Fake `uv`: answers `pip list` with `installed`, fails installs whose spec matches `failOn`. */
function fakeUv(installed: Installed, failOn?: RegExp): void {
  spawn.mockImplementation((_command: string, args: readonly string[]) => {
    const proc = new EventEmitter();
    Object.assign(proc, {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      stdin: { write: jest.fn(), end: jest.fn() },
    });
    const cmd = args.join(' ');
    process.nextTick(() => {
      if (cmd.includes('pip list')) {
        // @ts-expect-error Mocking dynamic property
        proc.stdout.emit('data', Buffer.from(JSON.stringify(installed)));
        proc.emit('exit', 0);
      } else if (failOn && failOn.test(cmd)) {
        // @ts-expect-error Mocking dynamic property
        proc.stderr.emit('data', Buffer.from('No solution found'));
        proc.emit('exit', 1);
      } else {
        proc.emit('exit', 0);
      }
    });
    return proc;
  });
}

/** Fake PyPI simple index listing one wheel of `name` at `version`. */
function fakePyPI(name: string, version: string): void {
  https.get.mockImplementation((_url: string, cb: (res: EventEmitter & { statusCode: number }) => void) => {
    const res = Object.assign(new EventEmitter(), { statusCode: 200 });
    process.nextTick(() => {
      cb(res);
      res.emit('data', `<a href="x">${name.replace(/-/g, '_')}-${version}-py3-none-any.whl</a>`);
      res.emit('end');
    });
    return Object.assign(new EventEmitter(), { setTimeout: jest.fn() });
  });
}

function installCalls(): string[][] {
  return spawn.mock.calls
    .map((call: [string, string[]]) => call[1])
    .filter((args: string[]) => args[0] === 'pip' && args[1] === 'install');
}

beforeEach(() => {
  spawn.mockReset();
  detectTorchPlatform.mockReset();
  saveTorchPlatform.mockClear();
});

describe('installExpectedPackages', () => {
  test('does nothing when every pack is at or above its floor, whatever the app version', async () => {
    fakeUv([
      { name: 'nodetool-core', version: '0.8.1' },
      { name: 'nodetool-huggingface', version: '0.8.1' },
      { name: 'nodetool-mlx', version: '0.7.2' },
    ]);

    const result = await installExpectedPackages();

    expect(result).toMatchObject({ success: true, packagesChecked: 0, packagesUpdated: 0 });
    expect(installCalls()).toHaveLength(0);
  });

  test('raises core to the protocol floor and keeps the other packs in the resolve', async () => {
    fakeUv([
      { name: 'nodetool-core', version: '0.6.0' },
      { name: 'nodetool-huggingface', version: '0.8.1' },
    ]);

    const result = await installExpectedPackages();

    expect(result).toMatchObject({ success: true, packagesUpdated: 1 });
    const [args] = installCalls();
    expect(args).toEqual(
      expect.arrayContaining(['nodetool-core>=0.7.0', 'nodetool-huggingface>=0.8.1'])
    );
    expect(args).not.toContain('--prerelease=allow');
    expect(args).not.toContain('unsafe-best-match');
    expect(args.join(' ')).not.toContain('9.9.9');
  });

  test('reports a failed install without throwing', async () => {
    fakeUv([{ name: 'nodetool-core', version: '0.6.0' }], /nodetool-core>=/);

    const result = await installExpectedPackages();

    expect(result.success).toBe(false);
    expect(result.failures).toEqual([
      expect.objectContaining({ packageName: 'nodetool-core' }),
    ]);
  });
});

describe('installPackage', () => {
  test('resolves the new pack together with the installed packs on the detected torch backend', async () => {
    fakeUv([
      { name: 'nodetool-core', version: '0.8.1' },
      { name: 'nodetool-mlx', version: '0.7.2' },
    ]);
    fakePyPI('nodetool-huggingface', '0.8.1');
    detectTorchPlatform.mockResolvedValue({
      platform: 'cu124',
      backend: 'cu126',
      indexUrl: 'https://download.pytorch.org/whl/cu126',
    });

    const result = await installPackage('nodetool-ai/nodetool-huggingface');

    expect(result.success).toBe(true);
    const [args] = installCalls();
    expect(args).toEqual(
      expect.arrayContaining([
        'nodetool-huggingface==0.8.1',
        'nodetool-core>=0.8.1',
        'nodetool-mlx>=0.7.2',
        '--torch-backend',
        'cu126',
      ])
    );
    expect(args).not.toContain('--prerelease=allow');
    expect(args).not.toContain('--extra-index-url');
    expect(saveTorchPlatform).toHaveBeenCalled();
  });

  test('does not save a failed detection', async () => {
    fakeUv([{ name: 'nodetool-core', version: '0.8.1' }]);
    fakePyPI('nodetool-huggingface', '0.8.1');
    detectTorchPlatform.mockResolvedValue({
      platform: 'unknown',
      backend: 'auto',
      indexUrl: null,
      error: 'nvidia-smi not found',
    });

    await installPackage('nodetool-ai/nodetool-huggingface');

    expect(saveTorchPlatform).not.toHaveBeenCalled();
    const [args] = installCalls();
    expect(args).toEqual(expect.arrayContaining(['--torch-backend', 'auto']));
  });
});

describe('torch build upgrades', () => {
  const detected = (backend: string) => ({
    platform: backend,
    backend,
    indexUrl: `https://download.pytorch.org/whl/${backend}`,
  });

  test('reinstalls CPU torch when the detected backend is a GPU build', async () => {
    fakeUv([
      { name: 'nodetool-core', version: '0.8.1' },
      { name: 'torch', version: '2.9.0+cpu' },
      { name: 'torchvision', version: '0.24.0+cpu' },
    ]);
    fakePyPI('nodetool-huggingface', '0.8.1');
    detectTorchPlatform.mockResolvedValue(detected('cu128'));

    await installPackage('nodetool-ai/nodetool-huggingface');

    const [args] = installCalls();
    expect(args).toEqual(
      expect.arrayContaining([
        '--reinstall-package',
        'torch',
        '--reinstall-package',
        'torchvision',
        '--torch-backend',
        'cu128',
      ])
    );
  });

  test('leaves torch alone when it already matches the detected backend', async () => {
    fakeUv([
      { name: 'nodetool-core', version: '0.8.1' },
      { name: 'torch', version: '2.9.0+cu128' },
    ]);
    fakePyPI('nodetool-huggingface', '0.8.1');
    detectTorchPlatform.mockResolvedValue(detected('cu128'));

    await installPackage('nodetool-ai/nodetool-huggingface');

    const [args] = installCalls();
    expect(args).not.toContain('--reinstall-package');
  });
});

describe('installPackage guards', () => {
  test('refuses a repo id outside the pack catalog', async () => {
    fakeUv([]);
    fakePyPI('requests', '2.32.0');

    const result = await installPackage('nodetool-ai/requests');

    expect(result).toEqual({ success: false, message: 'nodetool-ai/requests is not a NodeTool package.' });
    expect(spawn).not.toHaveBeenCalled();
  });

  test('aborts instead of resolving without the installed packs when pip list fails', async () => {
    spawn.mockImplementation((_command: string, args: readonly string[]) => {
      const proc = new EventEmitter();
      Object.assign(proc, {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        stdin: { write: jest.fn(), end: jest.fn() },
      });
      process.nextTick(() => proc.emit('exit', args.includes('list') ? 2 : 0));
      return proc;
    });
    fakePyPI('nodetool-huggingface', '0.8.1');

    const result = await installPackage('nodetool-ai/nodetool-huggingface');

    expect(result.success).toBe(false);
    expect(result.message).toContain('Could not list the installed Python packages');
    expect(installCalls()).toHaveLength(0);
  });

  test('installs the newest release, not a newer pre-release', async () => {
    fakeUv([{ name: 'nodetool-core', version: '0.8.1' }]);
    https.get.mockImplementation((_url: string, cb: (res: EventEmitter & { statusCode: number }) => void) => {
      const res = Object.assign(new EventEmitter(), { statusCode: 200 });
      process.nextTick(() => {
        cb(res);
        for (const version of ['0.8.1', '0.9.0rc1', '0.9.0', '0.9.1b2']) {
          res.emit('data', `<a href="x">nodetool_huggingface-${version}-py3-none-any.whl</a>\n`);
        }
        res.emit('end');
      });
      return Object.assign(new EventEmitter(), { setTimeout: jest.fn() });
    });
    detectTorchPlatform.mockResolvedValue({ platform: 'cpu', backend: 'cpu', indexUrl: null });

    await installPackage('nodetool-ai/nodetool-huggingface');

    const [args] = installCalls();
    expect(args).toContain('nodetool-huggingface==0.9.0');
  });
});

describe('uninstallPackage guards', () => {
  test('refuses to remove a distribution that is not a nodetool pack', async () => {
    fakeUv([]);

    const result = await uninstallPackage('pytorch/torch');

    expect(result.success).toBe(false);
    expect(spawn).not.toHaveBeenCalled();
  });
});

describe('listInstalledPackages without a Python runtime', () => {
  test('lists nothing and installs nothing when uv is absent', async () => {
    const fileExists = jest.mocked(utils.fileExists);
    fileExists.mockResolvedValue(false);
    try {
      fakeUv([]);
      fakePyPI('nodetool-core', '0.8.1');

      const result = await listInstalledPackages();

      expect(result.packages.filter((pkg) => pkg.name.startsWith('nodetool-'))).toEqual([]);
      expect(spawn).not.toHaveBeenCalled();
      expect(events.emitBootMessage).not.toHaveBeenCalledWith(
        expect.stringContaining('Setting up Python runtime')
      );
    } finally {
      fileExists.mockResolvedValue(true);
    }
  });
});
