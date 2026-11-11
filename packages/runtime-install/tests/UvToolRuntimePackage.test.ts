import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { fakeHost } from "./fake-host.js";
import { EventEmitter } from 'events';
import * as path from 'path';
import { UvToolRuntimePackage } from "../src/packages/UvToolRuntimePackage.js";
import type { RuntimeContext, RuntimeProgress } from "../src/packages/types.js";

vi.mock("../src/fs.js", () => ({
  fileExists: vi.fn(),
}));
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

import { fileExists as fileExistsImpl } from "../src/fs.js";
const fileExists = vi.mocked(fileExistsImpl);
import { spawn as spawnImpl } from 'node:child_process';
const spawn = vi.mocked(spawnImpl) as unknown as Mock;

const ctx: RuntimeContext = {
  host: fakeHost({ processEnv: () => ({ PATH: '/usr/bin', PYTHONPATH: '/opt/conda/lib', HOME: '/home/u' }) }),
  userDataDir: '/home/u/.nodetool',
  condaEnvPath: '/opt/conda/envs/nodetool',
  optionalNodeRoot: '/opt/node',
  platform: 'linux',
  arch: 'x64',
  log: vi.fn(),
};

const BIN = path.join('/home/u/.nodetool', 'uv-tools', 'bin', 'manimgx');

const makePackage = () =>
  new UvToolRuntimePackage({
    id: 'manimgx',
    name: 'ManimGX',
    description: 'test',
    category: 'tool',
    versionRange: '*',
    toolSpec: 'manimgx>=0.1',
    python: '3.13',
    verifyBinary: 'manimgx',
  });

/** A fake child that prints `lines` and exits with `code`. */
function fakeChild(code: number, lines: string[] = []) {
  const child = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    kill: vi.fn(),
  });
  setImmediate(() => {
    for (const line of lines) child.stderr.emit('data', Buffer.from(`${line}\n`));
    child.emit('close', code);
  });
  return child;
}

async function collect(events: AsyncIterable<RuntimeProgress>): Promise<RuntimeProgress[]> {
  const out: RuntimeProgress[] = [];
  for await (const event of events) out.push(event);
  return out;
}

describe('UvToolRuntimePackage', () => {
  beforeEach(() => {
    fileExists.mockReset();
    spawn.mockReset();
  });

  it('depends on the Python runtime, which ships uv', () => {
    expect(makePackage().dependsOn).toEqual(['python']);
  });

  it('is installed when the tool binary exists in the uv tool bin dir', async () => {
    fileExists.mockResolvedValue(true);
    expect(await makePackage().status(ctx)).toEqual({ installed: true });
    expect(fileExists).toHaveBeenCalledWith(BIN);
  });

  it('installs with the conda uv into the app data, on a managed Python', async () => {
    spawn.mockImplementation(() => fakeChild(0, ['Installed 1 executable: manimgx']));
    fileExists.mockResolvedValue(true);
    const events = await collect(makePackage().install(ctx, new AbortController().signal));

    expect(events.at(-1)).toEqual({ type: 'done' });
    const [command, args, options] = spawn.mock.calls[0];
    expect(command).toBe(path.join('/opt/conda/envs/nodetool', 'bin', 'uv'));
    expect(args).toEqual(['tool', 'install', '--force', '--python', '3.13', 'manimgx>=0.1']);
    expect(options.env).toMatchObject({
      UV_TOOL_DIR: path.join('/home/u/.nodetool', 'uv-tools', 'tools'),
      UV_TOOL_BIN_DIR: path.join('/home/u/.nodetool', 'uv-tools', 'bin'),
      UV_PYTHON_INSTALL_DIR: path.join('/home/u/.nodetool', 'uv-tools', 'python'),
      UV_PYTHON_PREFERENCE: 'only-managed',
      PATH: '/usr/bin',
    });
    expect(options.env.PYTHONPATH).toBeUndefined();
  });

  it("reports uv's output when the install fails", async () => {
    spawn.mockImplementation(() => fakeChild(2, ['error: No solution found']));
    const events = await collect(makePackage().install(ctx, new AbortController().signal));
    expect(events.at(-1)).toMatchObject({ type: 'error', message: expect.stringContaining('No solution found') });
  });

  it('fails an install that exits cleanly without the binary', async () => {
    spawn.mockImplementation(() => fakeChild(0));
    fileExists.mockResolvedValue(false);
    const events = await collect(makePackage().install(ctx, new AbortController().signal));
    expect(events.at(-1)).toMatchObject({ type: 'error', message: expect.stringContaining('is missing') });
  });

  it('upgrades and uninstalls the tool by its bare name', async () => {
    spawn.mockImplementation(() => fakeChild(0));
    fileExists.mockResolvedValue(true);
    const pkg = makePackage();
    await collect(pkg.update(ctx, new AbortController().signal));
    await pkg.uninstall(ctx);
    expect(spawn.mock.calls.map((call) => call[1])).toEqual([
      ['tool', 'upgrade', 'manimgx'],
      ['tool', 'uninstall', 'manimgx'],
    ]);
  });

  it('resolves to the uv tool bin dir', async () => {
    fileExists.mockResolvedValue(true);
    expect(await makePackage().resolve(ctx)).toEqual({
      binPaths: [path.join('/home/u/.nodetool', 'uv-tools', 'bin')],
      binaries: { manimgx: BIN },
    });
  });

  it('uses uv.exe and manimgx.exe on Windows', async () => {
    spawn.mockImplementation(() => fakeChild(0));
    fileExists.mockResolvedValue(true);
    const win = { ...ctx, platform: 'win32' as const };
    await collect(makePackage().install(win, new AbortController().signal));
    expect(spawn.mock.calls[0][0]).toBe(path.join('/opt/conda/envs/nodetool', 'Library', 'bin', 'uv.exe'));
    expect(fileExists).toHaveBeenCalledWith(path.join('/home/u/.nodetool', 'uv-tools', 'bin', 'manimgx.exe'));
  });
});
