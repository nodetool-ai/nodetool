import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { fakeHost } from "./fake-host.js";
import * as path from 'path';
import { Wan2GPRuntimePackage } from "../src/packages/Wan2GPRuntimePackage.js";
import type { RuntimeContext, RuntimeProgress } from "../src/packages/types.js";

vi.mock('@nodetool-ai/config/wan2gp-runtime', () => ({
  WAN2GP_VERSION: 'v19.02',
  installWan2GP: vi.fn(),
  uninstallWan2GP: vi.fn(),
  wan2gpInstallStatus: vi.fn(),
}));

import * as wan2gpRuntime from '@nodetool-ai/config/wan2gp-runtime';

const runtime = vi.mocked(wan2gpRuntime) as unknown as {
  installWan2GP: Mock;
  uninstallWan2GP: Mock;
  wan2gpInstallStatus: Mock;
};

const ctx = (platform: NodeJS.Platform): RuntimeContext => ({
  host: fakeHost(),
  userDataDir: '/home/u/.nodetool',
  condaEnvPath: '/opt/conda/envs/nodetool',
  optionalNodeRoot: '/opt/node',
  platform,
  arch: 'x64',
  log: vi.fn(),
});

async function collect(events: AsyncIterable<RuntimeProgress>): Promise<RuntimeProgress[]> {
  const out: RuntimeProgress[] = [];
  for await (const event of events) out.push(event);
  return out;
}

describe('Wan2GPRuntimePackage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('needs the Python runtime and reports the pinned release', async () => {
    runtime.wan2gpInstallStatus.mockResolvedValue({ installed: true, version: 'v19.01' });
    const pkg = new Wan2GPRuntimePackage();
    expect(pkg.dependsOn).toEqual(['python']);
    expect(await pkg.status(ctx('linux'))).toEqual({
      installed: true,
      installedVersion: 'v19.01',
      latestVersion: 'v19.02',
      updateAvailable: true,
    });
    expect(runtime.wan2gpInstallStatus).toHaveBeenCalledWith(path.join('/home/u/.nodetool', 'wan2gp'), 'linux');
  });

  it.each([
    ['linux' as const, path.join('/opt/conda/envs/nodetool', 'bin', 'python'), path.join('/opt/conda/envs/nodetool', 'bin', 'uv')],
    ['win32' as const, path.join('/opt/conda/envs/nodetool', 'python.exe'), path.join('/opt/conda/envs/nodetool', 'Library', 'bin', 'uv.exe')],
  ])('runs Wan2GP\'s installer with the Python runtime on %s', async (platform, python, uv) => {
    runtime.installWan2GP.mockImplementation(async (options: { onEvent: (event: unknown) => void }) => {
      options.onEvent({ type: 'stage', label: 'Downloading Wan2GP v19.02' });
      return { installed: true };
    });
    const events = await collect(new Wan2GPRuntimePackage().install(ctx(platform), new AbortController().signal));
    expect(runtime.installWan2GP).toHaveBeenCalledWith(
      expect.objectContaining({ installDir: path.join('/home/u/.nodetool', 'wan2gp'), platform, python, uv })
    );
    expect(events).toEqual([{ type: 'stage', label: 'Downloading Wan2GP v19.02' }, { type: 'done' }]);
  });

  it('reports the installer\'s error', async () => {
    runtime.installWan2GP.mockRejectedValue(new Error("No automatic profile for 'Unknown'"));
    const events = await collect(new Wan2GPRuntimePackage().install(ctx('linux'), new AbortController().signal));
    expect(events).toEqual([{ type: 'error', message: "No automatic profile for 'Unknown'" }]);
  });

  it('resolves the environment interpreter once installed', async () => {
    runtime.wan2gpInstallStatus.mockResolvedValueOnce({ installed: false });
    expect(await new Wan2GPRuntimePackage().resolve(ctx('linux'))).toBeNull();
    runtime.wan2gpInstallStatus.mockResolvedValueOnce({ installed: true, python: '/w/env_uv/bin/python' });
    expect(await new Wan2GPRuntimePackage().resolve(ctx('linux'))).toEqual({ binaries: { 'wan2gp-python': '/w/env_uv/bin/python' } });
  });
});
