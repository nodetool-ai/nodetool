import { getPackageDescription } from '../packageManager';

jest.mock('electron', () => ({
  app: {
    getVersion: () => '1.0.0',
    getPath: () => '/tmp',
  },
}));

jest.mock('../config', () => ({
  getProcessEnv: () => ({}),
  getPythonPath: () => '/usr/bin/python',
  getCondaEnvPath: () => '/test/conda',
}));

jest.mock('../logger', () => ({
  logMessage: jest.fn(),
}));

jest.mock('../events', () => ({
  emitServerLog: jest.fn(),
  emitBootMessage: jest.fn(),
}));

jest.mock('../utils', () => ({
  fileExists: jest.fn().mockResolvedValue(true),
}));

jest.mock('../torchPlatformCache', () => ({
  getTorchIndexUrl: jest.fn().mockReturnValue(null),
}));

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
});
