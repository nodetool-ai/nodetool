import {
  PACKAGE_INDEX_URL,
  validateRepoId
} from '../packageManager';

describe('Wheel-based Package Manager', () => {
  describe('Constants', () => {
    test('PACKAGE_INDEX_URL is correctly defined', () => {
      expect(PACKAGE_INDEX_URL).toBe('https://nodetool-ai.github.io/nodetool-registry/simple/');
    });
  });

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
});