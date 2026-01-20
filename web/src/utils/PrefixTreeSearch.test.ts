import { PrefixTreeSearch, SearchField } from './PrefixTreeSearch';

describe('PrefixTreeSearch', () => {
  let searcher: PrefixTreeSearch;

  beforeEach(() => {
    searcher = new PrefixTreeSearch();
  });

  const createMockNode = (overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> => ({
    node_type: 'test_node',
    title: 'Test Node',
    namespace: 'test',
    description: 'A test node',
    layout: { w: 100, h: 100 },
    properties: {},
    outputs: [],
    the_model_info: undefined,
    default_value: undefined,
    tags: [],
    use_cases: [],
    examples: [],
    source: undefined,
    recommended_models: [],
    basic_fields: [],
    is_dynamic: false,
    is_streaming_output: false,
    input_types: [],
    output_type: undefined,
    ...overrides
  });

  describe('Constructor', () => {
    it('initializes with default search fields', () => {
      const defaultSearcher = new PrefixTreeSearch();
      const stats = defaultSearcher.getStats();
      expect(stats.fields).toContain('title');
      expect(stats.fields).toContain('namespace');
      expect(stats.fields).toContain('tags');
      expect(stats.fields).toContain('description');
    });

    it('initializes with custom search fields', () => {
      const customFields: SearchField[] = [
        { field: 'title', weight: 1.0 },
        { field: 'description', weight: 0.5 }
      ];
      const customSearcher = new PrefixTreeSearch(customFields);
      const stats = customSearcher.getStats();
      expect(stats.fields).toEqual(['title', 'description']);
    });
  });

  describe('indexNodes', () => {
    it('indexes nodes for searching', () => {
      const mockNodes = [
        createMockNode({ node_type: 'text_input', title: 'Text Input', namespace: 'input.text' }),
        createMockNode({ node_type: 'image_input', title: 'Image Input', namespace: 'input.image' }),
      ];
      searcher.indexNodes(mockNodes as any);
      const stats = searcher.getStats();
      expect(stats.nodeCount).toBe(2);
    });

    it('replaces previous index when re-indexing', () => {
      searcher.indexNodes([createMockNode()] as any);
      expect(searcher.getStats().nodeCount).toBe(1);

      searcher.indexNodes([createMockNode(), createMockNode()] as any);
      expect(searcher.getStats().nodeCount).toBe(2);
    });

    it('handles empty node array', () => {
      searcher.indexNodes([]);
      const stats = searcher.getStats();
      expect(stats.nodeCount).toBe(0);
    });
  });

  describe('search', () => {
    beforeEach(() => {
      const mockNodes = [
        createMockNode({ node_type: 'text_input', title: 'Text Input', namespace: 'input.text' }),
        createMockNode({ node_type: 'image_input', title: 'Image Input', namespace: 'input.image' }),
        createMockNode({ node_type: 'llm_node', title: 'LLM Node', namespace: 'model.llm' }),
      ];
      searcher.indexNodes(mockNodes as any);
    });

    it('finds nodes by title prefix', () => {
      const results = searcher.search('text');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => (r.node as any).title.includes('Text'))).toBe(true);
    });

    it('is case-insensitive', () => {
      const lowerResults = searcher.search('text');
      const upperResults = searcher.search('TEXT');
      expect(lowerResults.length).toBe(upperResults.length);
    });

    it('returns empty array for no match', () => {
      const results = searcher.search('xyznonexistent');
      expect(results).toEqual([]);
    });

    it('returns empty array for empty query', () => {
      const results = searcher.search('');
      expect(results).toEqual([]);
    });

    it('limits results with maxResults option', () => {
      const results = searcher.search('e', { maxResults: 2 });
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('returns results with correct structure', () => {
      const results = searcher.search('text');
      if (results.length > 0) {
        const first = results[0];
        expect(first).toHaveProperty('node');
        expect(first).toHaveProperty('score');
        expect(first).toHaveProperty('matchedField');
        expect(first).toHaveProperty('matchType');
      }
    });
  });

  describe('fuzzySearch', () => {
    beforeEach(() => {
      const mockNodes = [
        createMockNode({ node_type: 'text_input', title: 'Text Input', namespace: 'input.text' }),
        createMockNode({ node_type: 'image_input', title: 'Image Input', namespace: 'input.image' }),
      ];
      searcher.indexNodes(mockNodes as any);
    });

    it('finds nodes containing substring', () => {
      const results = searcher.fuzzySearch('put');
      expect(results.length).toBeGreaterThan(0);
    });

    it('returns empty array for no match', () => {
      const results = searcher.fuzzySearch('xyznonexistent');
      expect(results).toEqual([]);
    });
  });

  describe('clear', () => {
    it('clears all indexed data', () => {
      searcher.indexNodes([createMockNode()] as any);
      expect(searcher.getStats().nodeCount).toBe(1);

      searcher.clear();
      expect(searcher.getStats().nodeCount).toBe(0);

      const results = searcher.search('test');
      expect(results).toEqual([]);
    });
  });

  describe('getStats', () => {
    it('returns correct node count', () => {
      searcher.indexNodes([createMockNode(), createMockNode()] as any);
      const stats = searcher.getStats();
      expect(stats.nodeCount).toBe(2);
    });

    it('returns indexed fields', () => {
      const customFields: SearchField[] = [
        { field: 'title', weight: 1.0 },
        { field: 'namespace', weight: 0.8 }
      ];
      const customSearcher = new PrefixTreeSearch(customFields);
      customSearcher.indexNodes([createMockNode()] as any);
      const stats = customSearcher.getStats();
      expect(stats.fields).toEqual(['title', 'namespace']);
    });
  });

  describe('Namespace Indexing', () => {
    it('indexes both full namespace and parts', () => {
      searcher.indexNodes([createMockNode({ namespace: 'input.image.generation' })] as any);

      const fullResults = searcher.search('input.image.generation');
      const partialResults = searcher.search('input');
      const middleResults = searcher.search('image');

      expect(fullResults.length).toBeGreaterThan(0);
      expect(partialResults.length).toBeGreaterThan(0);
      expect(middleResults.length).toBeGreaterThan(0);
    });
  });

  describe('Performance', () => {
    it('handles large node sets efficiently', () => {
      const largeNodeSet = Array.from({ length: 1000 }, (_, i) =>
        createMockNode({
          node_type: `node_${i}`,
          title: `Node ${i}`,
          namespace: `category.${i % 10}.${i}`,
        })
      );

      searcher.indexNodes(largeNodeSet as any);
      const stats = searcher.getStats();
      expect(stats.nodeCount).toBe(1000);

      const results = searcher.search('Node');
      expect(results.length).toBeGreaterThan(0);
    });
  });
});
