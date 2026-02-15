import { spawn } from 'child_process';
import { installExpectedPackages } from '../packageManager';
import { EventEmitter } from 'events';

// Mocks
jest.mock('electron', () => ({
  app: {
    getVersion: () => '1.0.0',
    getPath: () => '/tmp',
    isPackaged: false,
  },
}));

jest.mock('../logger', () => ({
  logMessage: jest.fn(),
}));

jest.mock('../events', () => ({
  emitServerLog: jest.fn(),
}));

jest.mock('../config', () => ({
  getProcessEnv: () => ({}),
  getUVPath: () => '/mock/uv',
  getPythonPath: () => '/mock/python',
}));

jest.mock('../torchPlatformCache', () => ({
  getTorchIndexUrl: () => 'https://mock.torch/index',
}));

jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

jest.mock('../utils', () => ({
  fileExists: jest.fn().mockResolvedValue(true),
}));

describe('installExpectedPackages Performance', () => {
  let spawnMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    spawnMock = spawn as unknown as jest.Mock;
  });

  test('should batch install packages', async () => {
    // 1. Setup the scenario: 5 packages need update.
    const installedPackages = [
      { name: 'nodetool-pkg1', version: '0.9.0' },
      { name: 'nodetool-pkg2', version: '0.9.0' },
      { name: 'nodetool-pkg3', version: '0.9.0' },
      { name: 'nodetool-pkg4', version: '0.9.0' },
      { name: 'nodetool-pkg5', version: '0.9.0' },
    ];

    spawnMock.mockImplementation((command, args) => {
        const proc = new EventEmitter() as any;
        proc.stdout = new EventEmitter();
        proc.stderr = new EventEmitter();
        proc.stdin = { write: jest.fn(), end: jest.fn() };

        // Simulate async behavior
        setTimeout(() => {
            let output = '';
            // Note: args is an array like ['pip', 'list', ...]
            const argsStr = args.join(' ');

            if (args.includes('list')) {
                output = JSON.stringify(installedPackages);
            } else if (args.includes('show')) {
                // When checking version, return old version so it triggers update
                // extracting package name might be needed if logic depends on it, but here all are 0.9.0 vs expected 1.0.0
                output = 'Version: 0.9.0';
            } else if (args.includes('install')) {
                output = 'Successfully installed...';
            }

            proc.stdout.emit('data', Buffer.from(output));
            proc.emit('exit', 0);
        }, 10);

        return proc;
    });

    // Run the function
    const start = Date.now();
    await installExpectedPackages();
    const end = Date.now();

    // Verification
    // Identify calls to install
    // args start with pip, install, ...
    const installCalls = spawnMock.mock.calls.filter(call =>
        call[1].includes('install') && !call[1].includes('git+') && !call[1].includes('check') // just to be safe
    );

    // Expectation:
    // Optimized behavior: 1 call (batched)
    expect(installCalls.length).toBe(1);

    const args = installCalls[0][1];
    expect(args).toContain('nodetool-pkg1==1.0.0');
    expect(args).toContain('nodetool-pkg5==1.0.0');
  });
});
