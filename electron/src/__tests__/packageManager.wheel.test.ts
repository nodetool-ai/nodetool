import { validateRepoId } from '../packageManager';

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
});