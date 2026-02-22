
import { installExpectedPackages, checkExpectedPackageVersions } from '../packageManager';
import * as packageManager from '../packageManager';
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

  beforeEach(() => {
    jest.clearAllMocks();

    // Attempt to spy on the internal function if possible
    // Note: This might not work if the call is direct, but we'll try to intercept via spawn if needed.
  });

  test('measures installation time', async () => {
    // Setup spawn mock to handle both scenarios (spy works vs spy fails)
    spawn.mockImplementation((command: string, args: string[]) => {
      const proc = new EventEmitter();
      (proc as any).stdout = new EventEmitter();
      (proc as any).stderr = new EventEmitter();
      (proc as any).stdin = { write: jest.fn(), end: jest.fn() };

      const cmdStr = args.join(' ');

      if (cmdStr.includes('pip list')) {
         // Fallback if spy doesn't work: provide list
         const pkgs = MOCK_PACKAGES.map(p => ({ name: p.packageName, version: p.currentVersion }));
         process.nextTick(() => {
             proc.stdout.emit('data', Buffer.from(JSON.stringify(pkgs)));
             proc.emit('exit', 0);
         });
      } else if (cmdStr.includes('pip show')) {
          // Fallback if spy doesn't work: provide version
          const pkgName = args[2]; // pip show <pkg>
          const pkg = MOCK_PACKAGES.find(p => p.packageName === pkgName);
          const ver = pkg ? pkg.currentVersion : '0.0.0';
          process.nextTick(() => {
              proc.stdout.emit('data', Buffer.from(`Version: ${ver}`));
              proc.emit('exit', 0);
          });
      } else if (cmdStr.includes('pip install')) {
          // The install command - simulate delay
          setTimeout(() => {
            proc.emit('exit', 0);
          }, 50);
      } else {
          // Unknown command
          process.nextTick(() => proc.emit('exit', 0));
      }

      return proc;
    });

    const start = Date.now();
    const result = await installExpectedPackages();
    const end = Date.now();
    const duration = end - start;

    console.log(`Installation took ${duration}ms`);
    console.log(`Packages updated: ${result.packagesUpdated}`);
    console.log(`Spawn calls: ${spawn.mock.calls.length}`);

    // Check if we did sequential installs (baseline)
    const installCalls = spawn.mock.calls.filter((call: any[]) => call[1].includes('install') && !call[1].includes('pip list'));
    console.log(`Install commands count: ${installCalls.length}`);
  });

  test('falls back to sequential installation on batch failure', async () => {
    let installCallCount = 0;

    // Setup spawn mock to simulate failure on first install (batch), success on others (sequential)
    spawn.mockImplementation((command: string, args: string[]) => {
      const proc = new EventEmitter();
      (proc as any).stdout = new EventEmitter();
      (proc as any).stderr = new EventEmitter();
      (proc as any).stdin = { write: jest.fn(), end: jest.fn() };

      const cmdStr = args.join(' ');

      if (cmdStr.includes('install')) {
          installCallCount++;
          if (installCallCount === 1) {
              // Fail the batch command
              setTimeout(() => {
                  (proc as any).stderr.emit('data', Buffer.from('Dependency conflict'));
                  proc.emit('exit', 1);
              }, 10);
              return proc;
          }
          // Succeed sequential commands
          setTimeout(() => {
              proc.emit('exit', 0);
          }, 10);
          return proc;
      }

      // Other commands resolve immediately
      process.nextTick(() => {
          if (cmdStr.includes('pip list')) {
              const output = JSON.stringify(MOCK_PACKAGES.map(p => ({ name: p.packageName, version: p.currentVersion })));
              proc.stdout.emit('data', Buffer.from(output));
          } else if (cmdStr.includes('pip show')) {
               const pkgName = args[2];
               const pkg = MOCK_PACKAGES.find(p => p.packageName === pkgName);
               if (pkg) proc.stdout.emit('data', Buffer.from(`Version: ${pkg.currentVersion}`));
          }
          proc.emit('exit', 0);
      });

      return proc;
    });

    const result = await installExpectedPackages();

    // Should have updated all packages eventually (via sequential fallback)
    expect(result.packagesUpdated).toBe(10);

    // Check call counts
    const installCalls = spawn.mock.calls.filter((call: any[]) => call[1].includes('install') && !call[1].includes('pip list'));
    // 1 batch (failed) + 10 sequential (succeeded) = 11 calls
    console.log(`Fallback install commands count: ${installCalls.length}`);
    expect(installCalls.length).toBe(11);
  });
});
