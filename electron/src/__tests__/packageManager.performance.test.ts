
import { checkExpectedPackageVersions } from '../packageManager';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { app, BrowserWindow } from 'electron';

// Mock child_process
jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

// Mock utils
jest.mock('../utils', () => ({
  fileExists: jest.fn().mockResolvedValue(true),
  checkPermissions: jest.fn().mockResolvedValue({ accessible: true, error: null }),
}));

describe('Performance Optimization', () => {
  let spawnMock: jest.Mock;

  beforeEach(() => {
    spawnMock = spawn as unknown as jest.Mock;
    spawnMock.mockReset();
    (app as any).getVersion = jest.fn().mockReturnValue('1.0.0');
    (BrowserWindow as any).getAllWindows = jest.fn().mockReturnValue([]);
  });

  test('checkExpectedPackageVersions should only spawn process once', async () => {
    // Mock spawn implementation
    spawnMock.mockImplementation((command, args) => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.stdin = { write: jest.fn(), end: jest.fn() };

      setTimeout(() => {
        if (args.includes('list') && args.includes('--format=json')) {
             const packages = Array.from({ length: 5 }, (_, i) => ({
                name: `nodetool-pkg-${i}`,
                version: '0.9.0'
            }));
            // Add a matching version package
            packages.push({ name: 'nodetool-ok', version: '1.0.0' });

            mockProcess.stdout.emit('data', Buffer.from(JSON.stringify(packages)));
        } else if (args.includes('show')) {
            // This would happen in the unoptimized version
             mockProcess.stdout.emit('data', Buffer.from('Version: 0.9.0\n'));
        }
        mockProcess.emit('exit', 0);
      }, 10);

      return mockProcess;
    });

    const result = await checkExpectedPackageVersions();

    // Optimized version: 1 call for list
    expect(spawnMock.mock.calls.length).toBe(1);

    // Verify result length. 5 packages need update (0.9.0 vs 1.0.0), 1 matches (1.0.0).
    expect(result.length).toBe(5);
  });
});
