import { installExpectedPackages, installPackage, isTorchIndexResolveFailure, listInstalledPackages, uninstallPackage } from '../packageManager';
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

jest.mock('../installer', () => ({ installCondaPackageBySpec: jest.fn() }));

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
const { installCondaPackageBySpec } = jest.requireMock('../installer') as {
  installCondaPackageBySpec: jest.Mock;
};
const https = require('https');

type Installed = Array<{ name: string; version: string }>;

let uvVersion = '0.11.32';

/**
 * Fake `uv`: answers `--version` with `uvVersion` and `pip list` with
 * `installed`, and fails installs whose arguments match `failOn` with
 * `failure` on stderr.
 */
function fakeUv(installed: Installed, failOn?: RegExp, failure = 'No solution found'): void {
  spawn.mockImplementation((_command: string, args: readonly string[]) => {
    const proc = new EventEmitter();
    Object.assign(proc, {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      stdin: { write: jest.fn(), end: jest.fn() },
    });
    const cmd = args.join(' ');
    process.nextTick(() => {
      if (cmd === '--version') {
        // @ts-expect-error Mocking dynamic property
        proc.stdout.emit('data', Buffer.from(`uv ${uvVersion} (x86_64-unknown-linux-gnu)\n`));
        proc.emit('exit', 0);
      } else if (cmd.includes('pip list')) {
        // @ts-expect-error Mocking dynamic property
        proc.stdout.emit('data', Buffer.from(JSON.stringify(installed)));
        proc.emit('exit', 0);
      } else if (failOn && failOn.test(cmd)) {
        // @ts-expect-error Mocking dynamic property
        proc.stderr.emit('data', Buffer.from(failure));
        proc.emit('exit', 1);
      } else {
        proc.emit('exit', 0);
      }
    });
    return proc;
  });
}

/** Fake PyPI simple index listing one wheel of `name` per version. */
function fakePyPI(name: string, ...versions: string[]): void {
  https.get.mockImplementation((_url: string, cb: (res: EventEmitter & { statusCode: number }) => void) => {
    const res = Object.assign(new EventEmitter(), { statusCode: 200 });
    process.nextTick(() => {
      cb(res);
      for (const version of versions) {
        res.emit('data', `<a href="x">${name.replace(/-/g, '_')}-${version}-py3-none-any.whl</a>\n`);
      }
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
  uvVersion = '0.11.32';
  installCondaPackageBySpec.mockReset();
  spawn.mockReset();
  detectTorchPlatform.mockReset();
  saveTorchPlatform.mockClear();
});

describe('installExpectedPackages', () => {
  test('does nothing when every pack is at or above its floor, whatever the app version', async () => {
    fakeUv([
      { name: 'nodetool-core', version: '0.8.2' },
      { name: 'nodetool-huggingface', version: '0.8.1' },
      { name: 'nodetool-mlx', version: '0.7.2' },
    ]);

    const result = await installExpectedPackages();

    expect(result).toMatchObject({ success: true, packagesChecked: 0, packagesUpdated: 0 });
    expect(installCalls()).toHaveLength(0);
  });

  test('raises core to the protocol floor and keeps the other packs in the resolve', async () => {
    fakeUv([
      { name: 'nodetool-core', version: '0.8.1' },
      { name: 'nodetool-huggingface', version: '0.8.1' },
    ]);

    const result = await installExpectedPackages();

    expect(result).toMatchObject({ success: true, packagesUpdated: 1 });
    const [args] = installCalls();
    expect(args).toEqual(
      expect.arrayContaining(['nodetool-core>=0.8.2', 'nodetool-huggingface>=0.8.1'])
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
      { name: 'nodetool-core', version: '0.8.2' },
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
        'nodetool-core>=0.8.2',
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

  test('installs the newest final release, never a pre-release or dev release', async () => {
    fakeUv([{ name: 'nodetool-core', version: '0.8.2' }]);
    fakePyPI('nodetool-huggingface', '0.8.2', '0.9.0', '0.9.1.post1', '0.10.0rc1', '0.10.0b2', '0.10.0.dev3', '0.10.0a1');
    detectTorchPlatform.mockResolvedValue({ platform: 'cpu', backend: 'cpu', indexUrl: null });

    const result = await installPackage('nodetool-ai/nodetool-huggingface');

    expect(result.success).toBe(true);
    const [args] = installCalls();
    expect(args).toContain('nodetool-huggingface==0.9.1.post1');
  });

  const TORCHCODEC_MISSING =
    'No solution found when resolving dependencies:\n' +
    '  Because torchcodec was not found in the package registry and nodetool-huggingface==0.8.2 depends on torchcodec>=0.17, ' +
    'we can conclude that your requirements are unsatisfiable.';

  test('retries on the CPU index with a warning when the GPU index has no build', async () => {
    fakeUv([{ name: 'nodetool-core', version: '0.8.2' }], /--torch-backend rocm7\.2/, TORCHCODEC_MISSING);
    fakePyPI('nodetool-huggingface', '0.8.2');
    detectTorchPlatform.mockResolvedValue({ platform: 'rocm6.2', backend: 'rocm7.2', indexUrl: null });

    const result = await installPackage('nodetool-ai/nodetool-huggingface');

    expect(result.success).toBe(true);
    expect(result.message).toContain('CPU');
    const calls = installCalls();
    expect(calls).toHaveLength(2);
    expect(calls[0].join(' ')).toContain('--torch-backend rocm7.2');
    expect(calls[1].join(' ')).toContain('--torch-backend cpu');
    expect(events.emitBootMessage).toHaveBeenCalledWith(expect.stringContaining('CPU'));
  });

  test('does not retry on the CPU index for a failure unrelated to torch', async () => {
    fakeUv([{ name: 'nodetool-core', version: '0.8.2' }], /nodetool-huggingface/, 'error: Failed to fetch: connection reset');
    fakePyPI('nodetool-huggingface', '0.8.2');
    detectTorchPlatform.mockResolvedValue({ platform: 'cu130', backend: 'cu130', indexUrl: null });

    const result = await installPackage('nodetool-ai/nodetool-huggingface');

    expect(result.success).toBe(false);
    expect(installCalls()).toHaveLength(1);
  });

  test('updates an old uv that rejects the backend before installing', async () => {
    uvVersion = '0.9.0';
    installCondaPackageBySpec.mockImplementation(async () => {
      uvVersion = '0.12.24';
    });
    fakeUv([{ name: 'nodetool-core', version: '0.8.2' }]);
    fakePyPI('nodetool-huggingface', '0.8.2');
    detectTorchPlatform.mockResolvedValue({ platform: 'rocm6.2', backend: 'rocm7.2', indexUrl: null });

    const result = await installPackage('nodetool-ai/nodetool-huggingface');

    expect(result.success).toBe(true);
    expect(installCondaPackageBySpec).toHaveBeenCalledWith('/test/conda', ['uv>=0.11.3'], expect.any(String));
    expect(installCalls()[0].join(' ')).toContain('--torch-backend rocm7.2');
  });

  test('installs without a backend when an old uv cannot be updated', async () => {
    uvVersion = '0.8.0';
    installCondaPackageBySpec.mockRejectedValue(new Error('micromamba failed'));
    fakeUv([{ name: 'nodetool-core', version: '0.8.2' }]);
    fakePyPI('nodetool-huggingface', '0.8.2');
    detectTorchPlatform.mockResolvedValue({ platform: 'cu130', backend: 'cu130', indexUrl: null });

    const result = await installPackage('nodetool-ai/nodetool-huggingface');

    expect(result.success).toBe(true);
    expect(installCalls()[0]).not.toContain('--torch-backend');
  });

  test('keeps an old uv that already accepts the backend', async () => {
    uvVersion = '0.7.0';
    fakeUv([{ name: 'nodetool-core', version: '0.8.2' }]);
    fakePyPI('nodetool-huggingface', '0.8.2');
    detectTorchPlatform.mockResolvedValue({ platform: 'cu128', backend: 'cu128', indexUrl: null });

    await installPackage('nodetool-ai/nodetool-huggingface');

    expect(installCondaPackageBySpec).not.toHaveBeenCalled();
    expect(installCalls()[0].join(' ')).toContain('--torch-backend cu128');
  });
});

describe('isTorchIndexResolveFailure', () => {
  test.each([
    ['Because torchcodec was not found in the package registry, we can conclude that your requirements are unsatisfiable.', true],
    ['No solution found when resolving dependencies: Because there is no version of torch==2.14.*', true],
    ['No solution found when resolving dependencies: Because there is no version of numpy>=9', false],
    ['error: Failed to download torch-2.14.1.whl: connection reset', false],
  ])('%s -> %s', (message, expected) => {
    expect(isTorchIndexResolveFailure(message)).toBe(expected);
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
