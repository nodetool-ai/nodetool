import { fetchAvailablePackages, installPackage, needsTorchPlatformDetection } from '../packageManager';
import * as config from '../config';
import * as events from '../events';
import * as utils from '../utils';
import * as torchPlatformCache from '../torchPlatformCache';
import * as torchruntime from '../torchruntime';

jest.mock('electron', () => ({
  app: {
    getVersion: () => '1.0.0',
    getPath: () => '/tmp',
  },
}));

// Every collaborator below is the real module; only the methods that would
// reach the filesystem, a Python install, or the GPU probe are stubbed on it.
jest.spyOn(config, 'getProcessEnv').mockReturnValue({});
jest.spyOn(config, 'getPythonPath').mockReturnValue('/usr/bin/python');
jest.spyOn(config, 'getCondaEnvPath').mockReturnValue('/test/conda');

jest.spyOn(events, 'emitServerLog').mockImplementation(() => {});
jest.spyOn(events, 'emitBootMessage').mockImplementation(() => {});

jest.spyOn(utils, 'fileExists').mockResolvedValue(true);

jest.spyOn(torchPlatformCache, 'getSavedTorchPlatform').mockReturnValue(null);
jest.spyOn(torchPlatformCache, 'saveTorchPlatform').mockImplementation(() => {});

jest.spyOn(torchruntime, 'detectTorchPlatform').mockResolvedValue({
  platform: 'cpu',
  backend: 'cpu',
  indexUrl: 'https://download.pytorch.org/whl/cpu',
});

function withPlatform(platform: string, arch: string, run: () => Promise<void>): Promise<void> {
  const original = { platform: process.platform, arch: process.arch };
  Object.defineProperty(process, 'platform', { value: platform });
  Object.defineProperty(process, 'arch', { value: arch });
  return run().finally(() => {
    Object.defineProperty(process, 'platform', { value: original.platform });
    Object.defineProperty(process, 'arch', { value: original.arch });
  });
}

describe('package catalog', () => {
  test('lists the embedded Python packs without a network call', async () => {
    const { packages } = await fetchAvailablePackages();
    const repoIds = packages.map((p) => p.repo_id);

    expect(repoIds).toContain('nodetool-ai/nodetool-core');
    expect(repoIds).toContain('nodetool-ai/nodetool-wan2gp');
    expect(repoIds).not.toContain('nodetool-ai/nodetool-whispercpp');
    expect(
      packages.find((p) => p.repo_id === 'nodetool-ai/nodetool-core')?.description
    ).toContain('Essential NodeTool core nodes');
  });

  test('lists no pack that is missing from PyPI', async () => {
    const { packages } = await fetchAvailablePackages();
    const repoIds = packages.map((p) => p.repo_id);
    expect(repoIds).not.toContain('nodetool-ai/nodetool-apple');
    expect(repoIds).not.toContain('nodetool-ai/nodetool-lib-ml');
  });

  test('offers MLX only on Apple Silicon and HuggingFace not on Intel Macs', async () => {
    const repoIdsOn = async (platform: string, arch: string): Promise<string[]> => {
      let ids: string[] = [];
      await withPlatform(platform, arch, async () => {
        ids = (await fetchAvailablePackages()).packages.map((p) => p.repo_id);
      });
      return ids;
    };
    expect(await repoIdsOn('darwin', 'arm64')).toEqual(
      expect.arrayContaining(['nodetool-ai/nodetool-mlx', 'nodetool-ai/nodetool-huggingface'])
    );
    const intelMac = await repoIdsOn('darwin', 'x64');
    expect(intelMac).not.toContain('nodetool-ai/nodetool-mlx');
    expect(intelMac).not.toContain('nodetool-ai/nodetool-huggingface');
    for (const [platform, arch] of [['win32', 'x64'], ['linux', 'x64']]) {
      const ids = await repoIdsOn(platform, arch);
      expect(ids).not.toContain('nodetool-ai/nodetool-mlx');
      expect(ids).toContain('nodetool-ai/nodetool-huggingface');
    }
  });

  test('refuses to install MLX off Apple Silicon without running uv', async () => {
    await withPlatform('win32', 'x64', async () => {
      const result = await installPackage('nodetool-ai/nodetool-mlx');
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/Apple Silicon/);
    });
    await withPlatform('darwin', 'x64', async () => {
      const result = await installPackage('nodetool-ai/nodetool-huggingface');
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/Intel Macs/);
    });
  });

  test('known torch-dependent packages require torch platform detection', () => {
    expect(needsTorchPlatformDetection('nodetool-huggingface')).toBe(true);
    expect(needsTorchPlatformDetection('NodeTool_HuggingFace')).toBe(true);
    expect(needsTorchPlatformDetection('nodetool-core')).toBe(false);
  });
});
