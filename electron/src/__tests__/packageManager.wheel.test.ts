import {
  getPackageInstallationInfo,
  getInstallCommandForPackage,
  PACKAGE_INDEX_URL,
  validateRepoId
} from '../packageManager';

describe('Wheel-based Package Manager', () => {
  describe('Constants', () => {
    test('PACKAGE_INDEX_URL is correctly defined', () => {
      expect(PACKAGE_INDEX_URL).toBe('https://nodetool-ai.github.io/nodetool-registry/simple/');
    });
  });

  describe('getPackageInstallationInfo', () => {
    test('returns correct installation info for valid repo ID', () => {
      const repoId = 'nodetool-ai/nodetool-core';
      const info = getPackageInstallationInfo(repoId);

      expect(info).toEqual({
        packageName: 'nodetool-core',
        repoId: 'nodetool-ai/nodetool-core',
        wheelCommand: 'uv pip install --index-url https://pypi.org/simple --extra-index-url https://nodetool-ai.github.io/nodetool-registry/simple/ nodetool-core',
        gitCommand: 'uv pip install git+https://github.com/nodetool-ai/nodetool-core.git',
        packageIndexUrl: 'https://nodetool-ai.github.io/nodetool-registry/simple/'
      });
    });

    test('extracts package name correctly from complex repo IDs', () => {
      const repoId = 'nodetool-ai/nodetool-huggingface';
      const info = getPackageInstallationInfo(repoId);

      expect(info.packageName).toBe('nodetool-huggingface');
    });
  });

  describe('getInstallCommandForPackage', () => {
    test('returns correct wheel-based install command', () => {
      const command = getInstallCommandForPackage('nodetool-ai/nodetool-core');
      
      expect(command).toBe('uv pip install --index-url https://pypi.org/simple --extra-index-url https://nodetool-ai.github.io/nodetool-registry/simple/ nodetool-core');
    });

    test('works with different package names', () => {
      const command = getInstallCommandForPackage('nodetool-ai/nodetool-huggingface');
      
      expect(command).toBe('uv pip install --index-url https://pypi.org/simple --extra-index-url https://nodetool-ai.github.io/nodetool-registry/simple/ nodetool-huggingface');
    });
  });

  describe('validateRepoId (unchanged)', () => {
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
});