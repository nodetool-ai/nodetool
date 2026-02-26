import React from 'react';
import { render, act } from '@testing-library/react';
import RerouteNode from '../RerouteNode';
import { NodeProvider } from '../../../contexts/NodeContext';
import { createNodeStore } from '../../../stores/NodeStore';

// Mock heavy components to avoid dependency chain issues
jest.mock('../../node_types/PlaceholderNode', () => function Placeholder() { return <div>Placeholder</div>; });

// Mock dependencies BEFORE imports
jest.mock('../../../stores/MetadataStore', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { create } = require('zustand');
  return {
  __esModule: true,
  default: create(() => ({
    metadata: {
      'test.node': {
        node_type: 'test.node',
        outputs: [{ name: 'output', type: { type: 'str' } }],
        properties: []
      }
    },
    getMetadata: jest.fn((type: string) => ({
      node_type: type,
      outputs: [{ name: 'output', type: { type: 'str' } }],
      properties: []
    })),
    getState: jest.fn(() => ({
        getMetadata: (type: string) => ({
            node_type: type,
            outputs: [{ name: 'output', type: { type: 'str' } }],
            properties: []
        })
    }))
  })),
  };
});

// Mock @xyflow/react Handle to count renders
let handleRenderCount = 0;
jest.mock('@xyflow/react', () => ({
  Handle: ({ children }: any) => {
    handleRenderCount++;
    return <div>{children}</div>;
  },
  Position: { Left: 'left', Right: 'right' },
  NodeProps: {},
}));

// Mock MUI useTheme
jest.mock('@mui/material/styles', () => {
  const original = jest.requireActual('@mui/material/styles');
  return {
    ...original,
    useTheme: () => ({
      vars: {
        palette: {
          grey: { 400: '#ccc' },
          c_node_bg: '#fff',
          glass: { blur: 'blur(10px)' },
          primary: { main: '#000' }
        }
      }
    }),
  };
});

// Mock useSyncEdgeSelection
jest.mock('../../../hooks/nodes/useSyncEdgeSelection', () => ({
  useSyncEdgeSelection: jest.fn(),
}));

describe('RerouteNode Performance', () => {
  beforeEach(() => {
    handleRenderCount = 0;
  });

  it('should not re-render when unrelated edges are added', () => {
    // Setup store
    const store = createNodeStore();

    // Add initial nodes and edge
    act(() => {
      store.setState({
        nodes: [
            { id: 'reroute1', type: 'nodetool.workflows.base_node.Reroute', data: { title: 'Reroute' }, position: { x: 100, y: 100 }, selected: false } as any,
            { id: 'source1', type: 'test.node', data: { properties: {} }, position: { x: 0, y: 0 }, selected: false } as any
        ],
        edges: [
            { id: 'e1', source: 'source1', sourceHandle: 'output', target: 'reroute1', targetHandle: 'input_value' } as any
        ]
      });
    });

    // Render RerouteNode within provider
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <NodeProvider createStore={() => store}>{children}</NodeProvider>
    );

    render(
      <Wrapper>
        <RerouteNode id="reroute1" data={{ title: 'Reroute' } as any} selected={false} type="nodetool.workflows.base_node.Reroute" zIndex={1} isConnectable={true} dragging={false} positionAbsoluteX={0} positionAbsoluteY={0} draggable={true} deletable={true} selectable={true} />
      </Wrapper>
    );

    // Initial render count
    const initialHandles = handleRenderCount;
    expect(initialHandles).toBeGreaterThan(0);

    // Add an UNRELATED edge
    act(() => {
        const currentEdges = store.getState().edges;
        store.setState({
            edges: [...currentEdges, { id: 'e2', source: 'source1', target: 'other', sourceHandle: 'output', targetHandle: 'input' } as any]
        });
    });

    const afterUnrelated = handleRenderCount;

    // With current unoptimized code, this expectation will FAIL (received > initial)
    // After optimization, it will PASS (received === initial)
    expect(afterUnrelated).toBe(initialHandles);
  });

  it('should re-render when relevant upstream node changes', () => {
    // Setup store
    const store = createNodeStore();

    act(() => {
      store.setState({
        nodes: [
            { id: 'reroute1', type: 'nodetool.workflows.base_node.Reroute', data: { title: 'Reroute' }, position: { x: 100, y: 100 }, selected: false } as any,
            { id: 'source1', type: 'test.node', data: { properties: {} }, position: { x: 0, y: 0 }, selected: false } as any
        ],
        edges: [
            { id: 'e1', source: 'source1', sourceHandle: 'output', target: 'reroute1', targetHandle: 'input_value' } as any
        ]
      });
    });

    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <NodeProvider createStore={() => store}>{children}</NodeProvider>
    );

    render(
      <Wrapper>
        <RerouteNode id="reroute1" data={{ title: 'Reroute' } as any} selected={false} type="nodetool.workflows.base_node.Reroute" zIndex={1} isConnectable={true} dragging={false} positionAbsoluteX={0} positionAbsoluteY={0} draggable={true} deletable={true} selectable={true} />
      </Wrapper>
    );

    const initialHandles = handleRenderCount;

    // Update source node type (should change color)
    act(() => {
        store.getState().updateNode('source1', { type: 'test.node.changed' } as any);
    });

    const afterUpdate = handleRenderCount;
    expect(afterUpdate).toBeGreaterThan(initialHandles);
  });
});
