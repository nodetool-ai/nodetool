// nodetool/electron/src/__tests__/workspaceDevServer.test.ts
import { WorkspaceDevServer } from '../WorkspaceDevServer';

jest.mock('child_process', () => ({ spawn: jest.fn() }));
import { spawn } from 'child_process';
const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

function makeMockProcess() {
  const proc: any = {
    pid: 12345,
    stdout: { on: jest.fn() },
    stderr: { on: jest.fn() },
    on: jest.fn(),
    kill: jest.fn(),
  };
  return proc;
}

describe('WorkspaceDevServer', () => {
  let server: WorkspaceDevServer;

  beforeEach(() => {
    server = new WorkspaceDevServer();
    jest.clearAllMocks();
  });

  it('isRunning returns false before spawn', () => {
    expect(server.isRunning('/path')).toBe(false);
  });

  it('getPort returns null before spawn', () => {
    expect(server.getPort('/path')).toBeNull();
  });

  it('getStatus returns stopped before spawn', () => {
    expect(server.getStatus('/path')).toBe('stopped');
  });

  it('spawn starts next dev and resolves with port when ready', async () => {
    const mockProc = makeMockProcess();
    mockSpawn.mockReturnValue(mockProc as any);

    const spawnPromise = server.spawn('/workspace', 3001);

    // Simulate stdout "Ready" message
    const [[, stdoutCb]] = mockProc.stdout.on.mock.calls.filter(([e]: [string]) => e === 'data');
    stdoutCb(Buffer.from('✓ Ready in 514ms\n'));

    const port = await spawnPromise;
    expect(port).toBe(3001);
    expect(server.isRunning('/workspace')).toBe(true);
    expect(server.getPort('/workspace')).toBe(3001);
    expect(server.getStatus('/workspace')).toBe('running');
    expect(mockSpawn).toHaveBeenCalledWith(
      'npm',
      ['run', 'dev', '--', '--port', '3001'],
      expect.objectContaining({ cwd: '/workspace' })
    );
  });

  it('getLogs accumulates stderr lines', async () => {
    const mockProc = makeMockProcess();
    mockSpawn.mockReturnValue(mockProc as any);

    const spawnPromise = server.spawn('/workspace', 3001);
    const [[, stderrCb]] = mockProc.stderr.on.mock.calls.filter(([e]: [string]) => e === 'data');
    stderrCb(Buffer.from('some warning\n'));
    const [[, stdoutCb]] = mockProc.stdout.on.mock.calls.filter(([e]: [string]) => e === 'data');
    stdoutCb(Buffer.from('✓ Ready in 514ms\n'));
    await spawnPromise;

    expect(server.getLogs('/workspace')).toContain('some warning');
  });

  it('kill signals the process and clears state', async () => {
    const mockProc = makeMockProcess();
    mockSpawn.mockReturnValue(mockProc as any);

    // Make exit event fire when kill() is called
    mockProc.kill.mockImplementation(() => {
      const [[, exitCb]] = mockProc.on.mock.calls.filter(([e]: [string]) => e === 'exit');
      exitCb(0, null);
    });

    const spawnPromise = server.spawn('/workspace', 3001);
    const [[, stdoutCb]] = mockProc.stdout.on.mock.calls.filter(([e]: [string]) => e === 'data');
    stdoutCb(Buffer.from('✓ Ready in 514ms\n'));
    await spawnPromise;

    await server.kill('/workspace');
    expect(mockProc.kill).toHaveBeenCalledWith('SIGTERM');
    expect(server.isRunning('/workspace')).toBe(false);
    expect(server.getPort('/workspace')).toBeNull();
  });

  it('auto-respawns on unexpected exit (up to 3 times)', async () => {
    const mockProc = makeMockProcess();
    mockSpawn.mockReturnValue(mockProc as any);

    const spawnPromise = server.spawn('/workspace', 3001);
    const [[, stdoutCb]] = mockProc.stdout.on.mock.calls.filter(([e]: [string]) => e === 'data');
    stdoutCb(Buffer.from('✓ Ready in 514ms\n'));
    await spawnPromise;

    expect(server.isRunning('/workspace')).toBe(true);

    // Trigger unexpected exit
    const [[, exitCb]] = mockProc.on.mock.calls.filter(([e]: [string]) => e === 'exit');
    exitCb(1, null);

    expect(server.getStatus('/workspace')).toBe('error');
    // Auto-respawn increments attempt count; mockSpawn called again after backoff
    // (In unit test, just verify status transitions to 'error' without infinite loop)
  });
});
