import { checkExpectedPackageVersions } from '../packageManager';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { app, BrowserWindow } from 'electron';
import * as config from '../config';
import * as events from '../events';
import * as utils from '../utils';
import * as torchPlatformCache from '../torchPlatformCache';

// Mock child_process
jest.mock('child_process', () => ({
  spawn: jest.fn(),
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
jest
  .spyOn(utils, 'checkPermissions')
  .mockResolvedValue({ accessible: true, error: null });

jest.spyOn(torchPlatformCache, 'getTorchBackend').mockReturnValue('cpu');

describe('checkExpectedPackageVersions', () => {
  let spawnMock: jest.Mock;

  function listing(packages: Array<{ name: string; version: string }>): void {
    spawnMock.mockImplementation(() => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.stdin = { write: jest.fn(), end: jest.fn() };
      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from(JSON.stringify(packages)));
        mockProcess.emit('exit', 0);
        mockProcess.emit('close', 0);
      }, 10);
      return mockProcess;
    });
  }

  beforeEach(() => {
    // `child_process` is jest-mocked in this file, so `spawn` is a `jest.fn()`.
    spawnMock = jest.mocked(spawn);
    spawnMock.mockReset();
    (app as any).getVersion = jest.fn().mockReturnValue('1.0.0');
    (BrowserWindow as any).getAllWindows = jest.fn().mockReturnValue([]);
  });

  test('reads the installed set with one uv call', async () => {
    listing([{ name: 'nodetool-core', version: '0.8.1' }]);

    await checkExpectedPackageVersions();

    expect(spawnMock.mock.calls.length).toBe(1);
  });

  test('never pins packs to the app version', async () => {
    listing([
      { name: 'nodetool-core', version: '0.8.2' },
      { name: 'nodetool-huggingface', version: '0.8.1' },
      { name: 'nodetool-mlx', version: '0.7.2' },
      { name: 'nodetool-wan2gp', version: '0.1.0' },
    ]);

    expect(await checkExpectedPackageVersions()).toEqual([]);
  });

  test('flags core below the bridge protocol floor', async () => {
    listing([
      { name: 'nodetool-core', version: '0.8.1' },
      { name: 'nodetool-huggingface', version: '0.5.0' },
    ]);

    expect(await checkExpectedPackageVersions()).toEqual([
      { packageName: 'nodetool-core', currentVersion: '0.8.1', expectedVersion: '>=0.8.2' },
    ]);
  });
});
