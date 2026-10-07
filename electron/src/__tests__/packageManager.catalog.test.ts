import { fetchAvailablePackages, needsTorchPlatformDetection } from '../packageManager';
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
jest.spyOn(torchPlatformCache, 'getTorchIndexUrl').mockReturnValue(null);
jest.spyOn(torchPlatformCache, 'saveTorchPlatform').mockImplementation(() => {});

jest.spyOn(torchruntime, 'detectTorchPlatform').mockResolvedValue({
  platform: 'cpu',
  indexUrl: 'https://download.pytorch.org/whl/cpu',
});

describe('package catalog', () => {
  test('lists the embedded Python packs without a network call', async () => {
    const { packages } = await fetchAvailablePackages();
    const repoIds = packages.map((p) => p.repo_id);

    expect(repoIds).toContain('nodetool-ai/nodetool-core');
    expect(repoIds).toContain('nodetool-ai/nodetool-wan2gp');
    expect(repoIds).not.toContain('nodetool-ai/nodetool-whispercpp');
    expect(repoIds).not.toContain('nunchaku-tech/nunchaku');
    expect(
      packages.find((p) => p.repo_id === 'nodetool-ai/nodetool-core')?.description
    ).toContain('Essential NodeTool core nodes');
  });

  test('known torch-dependent packages require torch platform detection', () => {
    expect(needsTorchPlatformDetection('nodetool-huggingface')).toBe(true);
    expect(needsTorchPlatformDetection('NodeTool_HuggingFace')).toBe(true);
    expect(needsTorchPlatformDetection('nodetool-core')).toBe(false);
  });
});
