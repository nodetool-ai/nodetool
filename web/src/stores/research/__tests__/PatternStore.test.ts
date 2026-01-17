import { renderHook, act } from '@testing-library/react';
import { usePatternStore, WorkflowPattern, PatternNode, PatternEdge } from '../PatternStore';

describe('PatternStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('Initial State', () => {
    it('should have default patterns', async () => {
      const { result } = renderHook(() => usePatternStore());
      await act(async () => {});
      expect(result.current.patterns.length).toBeGreaterThan(0);
    });

    it('should have empty search query', async () => {
      const { result } = renderHook(() => usePatternStore());
      await act(async () => {});
      expect(result.current.searchQuery).toBe('');
    });

    it('should have null selected category', async () => {
      const { result } = renderHook(() => usePatternStore());
      await act(async () => {});
      expect(result.current.selectedCategory).toBeNull();
    });
  });

  describe('addPattern', () => {
    it('should add a new pattern', async () => {
      const { result } = renderHook(() => usePatternStore());

      let patternId: string = '';
      await act(async () => {
        patternId = await result.current.addPattern({
          name: 'Test Pattern',
          description: 'A test pattern',
          category: 'Test',
          tags: ['test'],
          nodes: [],
          edges: [],
        });
      });

      expect(patternId).toBeTruthy();
      const pattern = result.current.getPatternById(patternId);
      expect(pattern).toBeDefined();
      expect(pattern?.name).toBe('Test Pattern');
    });

    it('should set createdAt and updatedAt timestamps', async () => {
      const { result } = renderHook(() => usePatternStore());
      const now = Date.now();

      let patternId: string = '';
      await act(async () => {
        patternId = await result.current.addPattern({
          name: 'Timed Pattern',
          description: '',
          category: 'Test',
          tags: [],
          nodes: [],
          edges: [],
        });
      });

      const pattern = result.current.getPatternById(patternId);
      expect(pattern?.createdAt).toBeGreaterThanOrEqual(now);
      expect(pattern?.updatedAt).toBeGreaterThanOrEqual(now);
    });

    it('should initialize usageCount to 0', async () => {
      const { result } = renderHook(() => usePatternStore());

      let patternId: string = '';
      await act(async () => {
        patternId = await result.current.addPattern({
          name: 'Usage Pattern',
          description: '',
          category: 'Test',
          tags: [],
          nodes: [],
          edges: [],
        });
      });

      const pattern = result.current.getPatternById(patternId);
      expect(pattern?.usageCount).toBe(0);
    });
  });

  describe('updatePattern', () => {
    it('should update pattern fields', async () => {
      const { result } = renderHook(() => usePatternStore());

      let patternId: string = '';
      await act(async () => {
        patternId = await result.current.addPattern({
          name: 'Original Name',
          description: 'Original description',
          category: 'Test',
          tags: [],
          nodes: [],
          edges: [],
        });
      });

      await act(async () => {
        await result.current.updatePattern(patternId, {
          name: 'Updated Name',
          description: 'Updated description',
        });
      });

      const pattern = result.current.getPatternById(patternId);
      expect(pattern?.name).toBe('Updated Name');
      expect(pattern?.description).toBe('Updated description');
    });

    it('should update updatedAt timestamp', async () => {
      const { result } = renderHook(() => usePatternStore());

      let patternId: string = '';
      await act(async () => {
        patternId = await result.current.addPattern({
          name: 'Update Test',
          description: '',
          category: 'Test',
          tags: [],
          nodes: [],
          edges: [],
        });
      });

      const originalPattern = result.current.getPatternById(patternId);
      const originalUpdatedAt = originalPattern?.updatedAt;

      await act(async () => {
        await result.current.updatePattern(patternId, { name: 'New Name' });
      });

      const updatedPattern = result.current.getPatternById(patternId);
      expect(updatedPattern?.updatedAt).toBeGreaterThan(originalUpdatedAt!);
    });
  });

  describe('deletePattern', () => {
    it('should remove pattern from store', async () => {
      const { result } = renderHook(() => usePatternStore());

      let patternId: string = '';
      await act(async () => {
        patternId = await result.current.addPattern({
          name: 'To Delete',
          description: '',
          category: 'Test',
          tags: [],
          nodes: [],
          edges: [],
        });
      });

      await act(async () => {
        await result.current.deletePattern(patternId);
      });

      const pattern = result.current.getPatternById(patternId);
      expect(pattern).toBeUndefined();
    });
  });

  describe('duplicatePattern', () => {
    it('should create a copy with modified name', async () => {
      const { result } = renderHook(() => usePatternStore());

      let originalId: string = '';
      await act(async () => {
        originalId = await result.current.addPattern({
          name: 'Original',
          description: 'Description',
          category: 'Test',
          tags: ['tag1', 'tag2'],
          nodes: [{ id: 'n1', type: 'test', position: { x: 0, y: 0 }, data: {} }],
          edges: [],
        });
      });

      let duplicateId: string = '';
      await act(async () => {
        duplicateId = await result.current.duplicatePattern(originalId);
      });

      expect(duplicateId).not.toBe(originalId);

      const original = result.current.getPatternById(originalId);
      const duplicate = result.current.getPatternById(duplicateId);

      expect(duplicate?.name).toBe('Original (Copy)');
      expect(duplicate?.description).toBe(original?.description);
      expect(duplicate?.tags).toEqual(original?.tags);
      expect(duplicate?.nodes.length).toBe(original?.nodes.length);
    });
  });

  describe('incrementUsage', () => {
    it('should increase usage count', async () => {
      const { result } = renderHook(() => usePatternStore());

      let patternId: string = '';
      await act(async () => {
        patternId = await result.current.addPattern({
          name: 'Usage Test',
          description: '',
          category: 'Test',
          tags: [],
          nodes: [],
          edges: [],
        });
      });

      await act(async () => {
        result.current.incrementUsage(patternId);
      });

      const pattern = result.current.getPatternById(patternId);
      expect(pattern?.usageCount).toBe(1);

      await act(async () => {
        result.current.incrementUsage(patternId);
      });

      const updatedPattern = result.current.getPatternById(patternId);
      expect(updatedPattern?.usageCount).toBe(2);
    });
  });

  describe('getCategories', () => {
    it('should return unique categories', async () => {
      const { result } = renderHook(() => usePatternStore());

      await act(async () => {
        await result.current.addPattern({
          name: 'Pattern A',
          description: '',
          category: 'Category1',
          tags: [],
          nodes: [],
          edges: [],
        });
        await result.current.addPattern({
          name: 'Pattern B',
          description: '',
          category: 'Category2',
          tags: [],
          nodes: [],
          edges: [],
        });
        await result.current.addPattern({
          name: 'Pattern C',
          description: '',
          category: 'Category1',
          tags: [],
          nodes: [],
          edges: [],
        });
      });

      const categories = result.current.getCategories();
      expect(categories).toContain('Category1');
      expect(categories).toContain('Category2');
      expect(categories.length).toBe(2);
    });
  });

  describe('searchPatterns', () => {
    beforeEach(async () => {
      const { result } = renderHook(() => usePatternStore());
      await act(async () => {
        await result.current.addPattern({
          name: 'Image Processor',
          description: 'Process images',
          category: 'Media',
          tags: ['image', 'processing'],
          nodes: [],
          edges: [],
        });
        await result.current.addPattern({
          name: 'Text Summarizer',
          description: 'Summarize text',
          category: 'Text',
          tags: ['text', 'llm'],
          nodes: [],
          edges: [],
        });
      });
    });

    it('should search by name', async () => {
      const { result } = renderHook(() => usePatternStore());

      const results = result.current.searchPatterns('image');
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('Image Processor');
    });

    it('should search by description', async () => {
      const { result } = renderHook(() => usePatternStore());

      const results = result.current.searchPatterns('summarize');
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('Text Summarizer');
    });

    it('should search by tags', async () => {
      const { result } = renderHook(() => usePatternStore());

      const results = result.current.searchPatterns('llm');
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('Text Summarizer');
    });

    it('should be case insensitive', async () => {
      const { result } = renderHook(() => usePatternStore());

      const results = result.current.searchPatterns('IMAGE');
      expect(results.length).toBe(1);
    });

    it('should return all patterns for empty search', async () => {
      const { result } = renderHook(() => usePatternStore());

      const results = result.current.searchPatterns('');
      expect(results.length).toBeGreaterThan(1);
    });
  });
});
