/**
 * Tests for GraphEditorStore — focuses on the pure chain-manipulation actions
 * and metadata fetching. apiService is mocked so no network is involved.
 */

import { useGraphEditorStore } from './GraphEditorStore';
import { apiService } from '../services/api';
import type { NodeMetadata } from '../types/ApiTypes';

jest.mock('../services/api', () => ({
  apiService: {
    getNodeMetadata: jest.fn(),
  },
}));

const mockApi = apiService as jest.Mocked<typeof apiService>;

/** Minimal NodeMetadata fixture; only fields the store reads are populated. */
function meta(
  nodeType: string,
  overrides: Partial<NodeMetadata> = {}
): NodeMetadata {
  return {
    node_type: nodeType,
    title: nodeType,
    description: '',
    namespace: 'test',
    layout: 'default',
    properties: [{ name: 'text', type: { type: 'str' }, default: 'hi' }],
    outputs: [{ name: 'output', type: { type: 'str' } }],
    is_dynamic: false,
    supports_dynamic_inputs: false,
    ...overrides,
  } as unknown as NodeMetadata;
}

function resetStore() {
  useGraphEditorStore.setState({
    allMetadata: [],
    metadataByType: new Map(),
    metadataLoading: false,
    metadataError: null,
    chain: [],
    connections: [],
    workflowId: null,
    workflowName: 'Untitled Workflow',
    nodePickerVisible: false,
    insertAtIndex: -1,
  });
}

describe('GraphEditorStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStore();
  });

  describe('fetchMetadata', () => {
    it('loads metadata and indexes it by type', async () => {
      mockApi.getNodeMetadata.mockResolvedValueOnce([
        meta('a.b.C'),
        meta('a.b.D'),
      ] as never);

      await useGraphEditorStore.getState().fetchMetadata();

      const state = useGraphEditorStore.getState();
      expect(state.allMetadata).toHaveLength(2);
      expect(state.metadataByType.get('a.b.C')).toBeDefined();
      expect(state.metadataLoading).toBe(false);
      expect(state.metadataError).toBeNull();
    });

    it('records an error message on failure', async () => {
      mockApi.getNodeMetadata.mockRejectedValueOnce(new Error('offline'));

      await useGraphEditorStore.getState().fetchMetadata();

      const state = useGraphEditorStore.getState();
      expect(state.metadataError).toBe('offline');
      expect(state.metadataLoading).toBe(false);
    });
  });

  describe('addNode', () => {
    it('appends a node with default properties', () => {
      useGraphEditorStore.getState().addNode(meta('a.b.C'));
      const { chain } = useGraphEditorStore.getState();
      expect(chain).toHaveLength(1);
      expect(chain[0].nodeType).toBe('a.b.C');
      expect(chain[0].properties).toEqual({ text: 'hi' });
      expect(chain[0].selectedOutput).toBe('output');
    });

    it('keeps input nodes ahead of regular nodes', () => {
      const store = useGraphEditorStore.getState();
      store.addNode(meta('a.b.C'));
      store.addNode(meta('pkg.input.StringInput'));
      const chain = useGraphEditorStore.getState().chain;
      expect(chain[0].nodeType).toBe('pkg.input.StringInput');
      expect(chain[1].nodeType).toBe('a.b.C');
    });
  });

  describe('removeNode', () => {
    it('removes the node by id', () => {
      const store = useGraphEditorStore.getState();
      store.addNode(meta('a.b.C'));
      store.addNode(meta('a.b.D'));
      const id = useGraphEditorStore.getState().chain[0].id;

      useGraphEditorStore.getState().removeNode(id);

      const chain = useGraphEditorStore.getState().chain;
      expect(chain).toHaveLength(1);
      expect(chain.find((n) => n.id === id)).toBeUndefined();
    });
  });

  describe('moveNode', () => {
    it('reorders nodes', () => {
      const store = useGraphEditorStore.getState();
      store.addNode(meta('a.b.C'));
      store.addNode(meta('a.b.D'));
      const before = useGraphEditorStore.getState().chain.map((n) => n.nodeType);
      expect(before).toEqual(['a.b.C', 'a.b.D']);

      useGraphEditorStore.getState().moveNode(0, 1);

      const after = useGraphEditorStore.getState().chain.map((n) => n.nodeType);
      expect(after).toEqual(['a.b.D', 'a.b.C']);
    });

    it('ignores out-of-range indices', () => {
      useGraphEditorStore.getState().addNode(meta('a.b.C'));
      const before = useGraphEditorStore.getState().chain;
      useGraphEditorStore.getState().moveNode(0, 5);
      expect(useGraphEditorStore.getState().chain).toBe(before);
    });
  });

  describe('duplicateNode', () => {
    it('inserts a copy with a new id right after the original', () => {
      useGraphEditorStore.getState().addNode(meta('a.b.C'));
      const id = useGraphEditorStore.getState().chain[0].id;

      useGraphEditorStore.getState().duplicateNode(id);

      const chain = useGraphEditorStore.getState().chain;
      expect(chain).toHaveLength(2);
      expect(chain[1].nodeType).toBe('a.b.C');
      expect(chain[1].id).not.toBe(id);
    });

    it('does nothing for an unknown id', () => {
      useGraphEditorStore.getState().addNode(meta('a.b.C'));
      useGraphEditorStore.getState().duplicateNode('nope');
      expect(useGraphEditorStore.getState().chain).toHaveLength(1);
    });
  });

  describe('updateProperty', () => {
    it('updates a single property on the matching node', () => {
      useGraphEditorStore.getState().addNode(meta('a.b.C'));
      const id = useGraphEditorStore.getState().chain[0].id;

      useGraphEditorStore.getState().updateProperty(id, 'text', 'updated');

      expect(useGraphEditorStore.getState().chain[0].properties.text).toBe('updated');
    });
  });

  describe('toggleExpanded / collapseAll', () => {
    it('toggles a single node and collapses all', () => {
      useGraphEditorStore.getState().addNode(meta('a.b.C'));
      const id = useGraphEditorStore.getState().chain[0].id;
      expect(useGraphEditorStore.getState().chain[0].expanded).toBe(true);

      useGraphEditorStore.getState().toggleExpanded(id);
      expect(useGraphEditorStore.getState().chain[0].expanded).toBe(false);

      useGraphEditorStore.getState().toggleExpanded(id);
      expect(useGraphEditorStore.getState().chain[0].expanded).toBe(true);
    });
  });

  describe('node picker', () => {
    it('shows and hides the picker, tracking the insert index', () => {
      useGraphEditorStore.getState().showNodePicker(2);
      expect(useGraphEditorStore.getState().nodePickerVisible).toBe(true);
      expect(useGraphEditorStore.getState().insertAtIndex).toBe(2);

      useGraphEditorStore.getState().hideNodePicker();
      expect(useGraphEditorStore.getState().nodePickerVisible).toBe(false);
    });

    it('defaults insertAtIndex to -1 when none is given', () => {
      useGraphEditorStore.getState().showNodePicker();
      expect(useGraphEditorStore.getState().insertAtIndex).toBe(-1);
    });
  });

  describe('workflow metadata', () => {
    it('newWorkflow resets the chain and name', () => {
      useGraphEditorStore.getState().addNode(meta('a.b.C'));
      useGraphEditorStore.getState().newWorkflow('Fresh');
      const state = useGraphEditorStore.getState();
      expect(state.chain).toHaveLength(0);
      expect(state.workflowId).toBeNull();
      expect(state.workflowName).toBe('Fresh');
    });

  });
});
