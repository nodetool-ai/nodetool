import { validateRepoId, isRegistryWheelPackage, selectRegistryWheelUrl } from '../packageManager';

describe('Wheel-based Package Manager', () => {
  describe('validateRepoId', () => {
    test('validates correct repo ID format', () => {
      const result = validateRepoId('nodetool-ai/nodetool-core');
      
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    test('rejects invalid repo ID format', () => {
      const result = validateRepoId('invalid-repo-id');
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid repository ID format');
    });

    test('rejects empty repo ID', () => {
      const result = validateRepoId('');
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Repository ID cannot be empty');
    });
  });

  describe('registry wheel packages', () => {
    test('marks nunchaku as registry wheel package', () => {
      expect(isRegistryWheelPackage('nunchaku')).toBe(true);
      expect(isRegistryWheelPackage('nodetool-huggingface')).toBe(false);
    });

    test('selects cuda and torch matched nunchaku wheel', () => {
      const wheelUrls = [
        'https://github.com/nunchaku-ai/nunchaku/releases/download/v1.2.0/nunchaku-1.2.0+torch2.9-cp311-cp311-win_amd64.whl',
        'https://github.com/nunchaku-ai/nunchaku/releases/download/v1.2.1/nunchaku-1.2.1+cu12.8torch2.9-cp311-cp311-win_amd64.whl',
        'https://github.com/nunchaku-ai/nunchaku/releases/download/v1.2.1/nunchaku-1.2.1+cu13.0torch2.9-cp311-cp311-win_amd64.whl',
      ];

      const selected = selectRegistryWheelUrl(wheelUrls, {
        packageName: 'nunchaku',
        pythonTag: 'cp311',
        platformTag: 'win_amd64',
        torchTag: 'torch2.9',
        cudaTag: 'cu12.8',
      });

      expect(selected).toBe(wheelUrls[1]);
    });
  });
});