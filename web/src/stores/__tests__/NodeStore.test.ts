jest.mock('../../components/node_types/PlaceholderNode', () => () => null);

import { Position, Node, Edge } from '@xyflow/react';
import { createNodeStore } from '../NodeStore';
import { NodeData } from '../NodeData';
import useErrorStore from '../ErrorStore';
import useResultsStore from '../ResultsStore';

const makeNode = (id: string, workflowId: string): Node<NodeData> => ({
  id,
  type: 'test',
  position: { x: 0, y: 0 },
  targetPosition: Position.Left,
  data: { properties: {}, dynamic_properties: {}, selectable: true, workflow_id: workflowId },
});

const makeEdge = (source: string, target: string): Edge => ({
  id: `${source}-${target}`,
  source,
  target,
  sourceHandle: null,
  targetHandle: null,
});

describe('NodeStore node management', () => {
  const originalError = useErrorStore.getState();
  const originalResults = useResultsStore.getState();
  let store: ReturnType<typeof createNodeStore>;

  beforeEach(() => {
    store = createNodeStore();
    useErrorStore.setState({ ...originalError, clearErrors: jest.fn() }, true);
    useResultsStore.setState({ ...originalResults, clearResults: jest.fn() }, true);
  });

  afterEach(() => {
    useErrorStore.setState(originalError, true);
    useResultsStore.setState(originalResults, true);
  });

  test('addNode adds a node and sets workflow dirty', () => {
    const node = makeNode('a', store.getState().workflow.id);
    store.getState().addNode(node);
    expect(store.getState().findNode('a')).toBeDefined();
    expect(store.getState().workflowIsDirty).toBe(true);
    expect(store.getState().nodes[0].expandParent).toBe(true);
    expect(store.getState().nodes[0].data.workflow_id).toBe(store.getState().workflow.id);
  });

  test('addNode ignores duplicate ids', () => {
    const node = makeNode('a', store.getState().workflow.id);
    store.getState().addNode(node);
    store.getState().addNode(node);
    expect(store.getState().nodes).toHaveLength(1);
  });

  test('updateNode and updateNodeData', () => {
    const node = makeNode('a', store.getState().workflow.id);
    store.getState().addNode(node);
    store.getState().updateNode('a', { position: { x: 5, y: 5 } });
    store.getState().updateNodeData('a', { title: 'test' });
    const updated = store.getState().findNode('a')!;
    expect(updated.position).toEqual({ x: 5, y: 5 });
    expect(updated.data.title).toBe('test');
  });

  test('deleteNode removes node and edges', () => {
    const a = makeNode('a', store.getState().workflow.id);
    const b = makeNode('b', store.getState().workflow.id);
    store.getState().addNode(a);
    store.getState().addNode(b);
    const edge = makeEdge('a', 'b');
    store.getState().addEdge(edge as Edge);
    store.getState().deleteNode('a');
    expect(store.getState().findNode('a')).toBeUndefined();
    expect(store.getState().edges).toHaveLength(0);
    expect((useErrorStore.getState().clearErrors as jest.Mock)).toHaveBeenCalledWith('a');
    expect((useResultsStore.getState().clearResults as jest.Mock)).toHaveBeenCalledWith('a');
  });

  test('undo and redo revert node changes', () => {
    const node = makeNode('a', store.getState().workflow.id);
    store.getState().addNode(node);
    expect(store.getState().nodes).toHaveLength(1);
    store.temporal.getState().undo();
    expect(store.getState().nodes).toHaveLength(0);
    store.temporal.getState().redo();
    expect(store.getState().nodes).toHaveLength(1);
  });
});
