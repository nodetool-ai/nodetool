import { renderHook, act } from '@testing-library/react';
import { useSnippetsStore } from '../SnippetsStore';

describe('SnippetsStore', () => {
  beforeEach(() => {
    useSnippetsStore.setState({ snippets: [] });
  });

  describe('addSnippet', () => {
    it('should add a new snippet with generated id and defaults', () => {
      const snippetData = {
        name: 'Test Snippet',
        description: 'A test snippet',
        nodeType: 'nodetool.test.TestNode',
        nodeLabel: 'Test Node',
        properties: { prop1: 'value1' },
      };

      const { result } = renderHook(() => useSnippetsStore());
      act(() => {
        result.current.addSnippet(snippetData);
      });

      const snippets = result.current.getSnippets();
      expect(snippets).toHaveLength(1);
      expect(snippets[0].name).toBe('Test Snippet');
      expect(snippets[0].description).toBe('A test snippet');
      expect(snippets[0].nodeType).toBe('nodetool.test.TestNode');
      expect(snippets[0].nodeLabel).toBe('Test Node');
      expect(snippets[0].properties).toEqual({ prop1: 'value1' });
      expect(snippets[0].id).toBeDefined();
      expect(typeof snippets[0].id).toBe('string');
      expect(snippets[0].createdAt).toBeDefined();
      expect(snippets[0].updatedAt).toBeDefined();
      expect(snippets[0].usageCount).toBe(0);
    });

    it('should prepend new snippets to the list', () => {
      const { result } = renderHook(() => useSnippetsStore());
      act(() => {
        result.current.addSnippet({
          name: 'First Snippet',
          nodeType: 'nodetool.test.Node1',
          nodeLabel: 'Node 1',
          properties: {},
        });
        result.current.addSnippet({
          name: 'Second Snippet',
          nodeType: 'nodetool.test.Node2',
          nodeLabel: 'Node 2',
          properties: {},
        });
      });

      const snippets = result.current.getSnippets();
      expect(snippets).toHaveLength(2);
      expect(snippets[0].name).toBe('Second Snippet');
      expect(snippets[1].name).toBe('First Snippet');
    });

    it('should limit snippets to MAX_SNIPPETS (50)', () => {
      const { result } = renderHook(() => useSnippetsStore());

      act(() => {
        for (let i = 0; i < 60; i++) {
          result.current.addSnippet({
            name: `Snippet ${i}`,
            nodeType: `nodetool.test.Node${i}`,
            nodeLabel: `Node ${i}`,
            properties: {},
          });
        }
      });

      const snippets = result.current.getSnippets();
      expect(snippets).toHaveLength(50);
    });
  });

  describe('updateSnippet', () => {
    it('should update snippet properties', () => {
      const { result } = renderHook(() => useSnippetsStore());
      let snippetId: string;
      act(() => {
        snippetId = result.current.addSnippet({
          name: 'Original Name',
          nodeType: 'nodetool.test.Node',
          nodeLabel: 'Node',
          properties: {},
        });
      });

      act(() => {
        result.current.updateSnippet(snippetId, {
          name: 'Updated Name',
          description: 'New description',
        });
      });

      const updatedSnippet = result.current.getSnippet(snippetId);
      expect(updatedSnippet).toMatchObject({
        name: 'Updated Name',
        description: 'New description',
      });
    });
  });

  describe('deleteSnippet', () => {
    it('should remove snippet by id', () => {
      const { result } = renderHook(() => useSnippetsStore());
      let snippetId: string;
      act(() => {
        snippetId = result.current.addSnippet({
          name: 'To Delete',
          nodeType: 'nodetool.test.Node',
          nodeLabel: 'Node',
          properties: {},
        });
      });

      expect(result.current.getSnippet(snippetId)).toBeDefined();

      act(() => {
        result.current.deleteSnippet(snippetId);
      });

      expect(result.current.getSnippet(snippetId)).toBeUndefined();
      expect(result.current.getSnippets()).toHaveLength(0);
    });
  });

  describe('incrementUsage', () => {
    it('should increment usage count', () => {
      const { result } = renderHook(() => useSnippetsStore());
      let snippetId: string;
      act(() => {
        snippetId = result.current.addSnippet({
          name: 'Popular Snippet',
          nodeType: 'nodetool.test.Node',
          nodeLabel: 'Node',
          properties: {},
        });
      });

      act(() => {
        result.current.incrementUsage(snippetId);
        result.current.incrementUsage(snippetId);
        result.current.incrementUsage(snippetId);
      });

      const snippet = result.current.getSnippet(snippetId);
      expect(snippet?.usageCount).toBe(3);
    });
  });

  describe('clearSnippets', () => {
    it('should remove all snippets', () => {
      const { result } = renderHook(() => useSnippetsStore());

      act(() => {
        result.current.addSnippet({
          name: 'Snippet 1',
          nodeType: 'nodetool.test.Node1',
          nodeLabel: 'Node 1',
          properties: {},
        });
        result.current.addSnippet({
          name: 'Snippet 2',
          nodeType: 'nodetool.test.Node2',
          nodeLabel: 'Node 2',
          properties: {},
        });
      });

      expect(result.current.getSnippets()).toHaveLength(2);

      act(() => {
        result.current.clearSnippets();
      });

      expect(result.current.getSnippets()).toHaveLength(0);
    });
  });

  describe('getSnippet', () => {
    it('should return undefined for non-existent snippet', () => {
      const { result } = renderHook(() => useSnippetsStore());

      expect(result.current.getSnippet('non-existent-id')).toBeUndefined();
    });

    it('should return correct snippet', () => {
      const { result } = renderHook(() => useSnippetsStore());
      let snippetId: string;
      act(() => {
        snippetId = result.current.addSnippet({
          name: 'Find Me',
          nodeType: 'nodetool.test.Node',
          nodeLabel: 'Node',
          properties: {},
        });
      });

      const snippet = result.current.getSnippet(snippetId);
      expect(snippet?.name).toBe('Find Me');
    });
  });
});
