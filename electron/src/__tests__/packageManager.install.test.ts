import { installExpectedPackages, installPackage } from '../packageManager';
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
