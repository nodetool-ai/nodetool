import { getPackageDescription, needsTorchPlatformDetection } from '../packageManager';
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

describe('package descriptions', () => {
  test('overrides nunchaku description with user-focused guidance', () => {
    const description = getPackageDescription({
      repo_id: 'nunchaku-tech/nunchaku',
      description: 'Nunchaku quantization library for efficient inference',
    });

    expect(description).toContain('FLUX and Qwen image models');
    expect(description).toContain('Nunchaku-optimized HuggingFace models');
  });

  test('overrides nodetool core description with clearer text', () => {
    const description = getPackageDescription({
      repo_id: 'nodetool-ai/nodetool-core',
      description: 'Core system',
    });

    expect(description).toContain('Essential NodeTool core nodes');
  });

  test('keeps non-overridden registry descriptions trimmed', () => {
    const description = getPackageDescription({
      repo_id: 'nodetool-ai/nodetool-huggingface',
      description: '  Existing description  ',
    });

    expect(description).toBe('Existing description');
  });

  test('known torch-dependent packages require torch platform detection', () => {
    expect(needsTorchPlatformDetection('nodetool-huggingface')).toBe(true);
    expect(needsTorchPlatformDetection('NodeTool_HuggingFace')).toBe(true);
    expect(needsTorchPlatformDetection('nunchaku')).toBe(true);
    expect(needsTorchPlatformDetection('nodetool-core')).toBe(false);
  });

});
