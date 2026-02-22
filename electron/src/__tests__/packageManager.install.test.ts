
import { installExpectedPackages } from '../packageManager';
import { EventEmitter } from 'events';

// Mock child_process
jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

// Mock electron app version
jest.mock('electron', () => ({
  app: {
    getVersion: () => '1.0.0',
    getPath: () => '/tmp',
  },
}));

// Mock config
jest.mock('../config', () => ({
  getProcessEnv: () => ({}),
  getUVPath: () => '/usr/bin/uv',
  getPythonPath: () => '/usr/bin/python',
}));

// Mock logger
jest.mock('../logger', () => ({
  logMessage: jest.fn(),
}));

// Mock events
jest.mock('../events', () => ({
  emitServerLog: jest.fn(),
  emitBootMessage: jest.fn(),
}));

// Mock utils
jest.mock('../utils', () => ({
  fileExists: jest.fn().mockResolvedValue(true),
}));

// Mock torchPlatformCache
jest.mock('../torchPlatformCache', () => ({
  getTorchIndexUrl: jest.fn().mockReturnValue('https://download.pytorch.org/whl/cpu'),
}));

const { spawn } = require('child_process');

describe('installExpectedPackages Performance Benchmark', () => {
  const MOCK_PACKAGES = Array.from({ length: 10 }, (_, i) => ({
    packageName: `nodetool-pkg-${i}`,
    currentVersion: '0.9.0',
    expectedVersion: '1.0.0',
  }));

  test('measures installation time', async () => {
    // Setup spawn mock
    spawn.mockImplementation((command: any, args: any) => {
      const proc = new EventEmitter();
      // Use Object.assign to avoid TS casting syntax issues in case of parser config mismatch
      Object.assign(proc, {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        stdin: { write: jest.fn(), end: jest.fn() }
      });

      const cmdStr = args.join(' ');

      if (cmdStr.includes('pip list')) {
         const pkgs = MOCK_PACKAGES.map(p => ({ name: p.packageName, version: p.currentVersion }));
         process.nextTick(() => {
             // @ts-expect-error Mocking dynamic property
             proc.stdout.emit('data', Buffer.from(JSON.stringify(pkgs)));
             proc.emit('exit', 0);
         });
      } else if (cmdStr.includes('pip show')) {
          const pkgName = args[2];
          const pkg = MOCK_PACKAGES.find(p => p.packageName === pkgName);
          const ver = pkg ? pkg.currentVersion : '0.0.0';
          process.nextTick(() => {
              // @ts-expect-error Mocking dynamic property
              proc.stdout.emit('data', Buffer.from(`Version: ${ver}`));
              proc.emit('exit', 0);
          });
      } else if (cmdStr.includes('pip install')) {
          // The install command - simulate delay
          setTimeout(() => {
            proc.emit('exit', 0);
          }, 50);
      } else {
          process.nextTick(() => proc.emit('exit', 0));
      }

      return proc;
    });

    const result = await installExpectedPackages();

    // Verify results
    expect(result.packagesUpdated).toBe(10);
    expect(result.success).toBe(true);

    // Verify batching behavior
    const installCalls = spawn.mock.calls.filter((call: any) => call[1].includes('install') && !call[1].includes('pip list'));
    expect(installCalls.length).toBe(1);

    // Verify command content
    const commandArgs = installCalls[0][1].join(' ');
    expect(commandArgs).toContain('nodetool-pkg-0==1.0.0');
    expect(commandArgs).toContain('nodetool-pkg-9==1.0.0');
    expect(commandArgs).toContain('unsafe-best-match');
  });
});
