import { renderHook } from '@testing-library/react';
import { useInputMinMax } from '../useInputMinMax';
import { NodeContext } from '../../contexts/NodeContext';
import { Node } from '@xyflow/react';
import { NodeData } from '../../stores/NodeData';

const createMockNode = (id: string, overrides: Partial<Node<NodeData>> = {}): Node<NodeData> => {
  const defaultData: NodeData = {
    properties: {},
    dynamic_properties: {},
    selectable: true,
    workflow_id: 'test-workflow',
  };
  
  return {
    id,
    type: 'test',
    position: { x: 0, y: 0 },
    data: overrides.data ? { ...defaultData, ...overrides.data } : defaultData,
    ...overrides,
  };
};

const createMockStore = (nodes: Node<NodeData>[]) => ({
  subscribe: () => () => {},
  getState: () => ({ nodes }),
});

describe('useInputMinMax', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return default min=0 and max=100 when no context', () => {
    const { result } = renderHook(() => 
      useInputMinMax({
        nodeId: 'node-123',
        propertyName: 'value',
      })
    );

    expect(result.current).toEqual({ min: 0, max: 100 });
  });

  it('should return default min=0 and max=100 when nodeType is not FloatInput or IntegerInput', () => {
    const { result } = renderHook(() => 
      useInputMinMax({
        nodeType: 'other.Type',
        nodeId: 'node-123',
        propertyName: 'value',
      })
    );

    expect(result.current).toEqual({ min: 0, max: 100 });
  });

  it('should return default min=0 and max=100 when propertyName is not value', () => {
    const { result } = renderHook(() => 
      useInputMinMax({
        nodeType: 'nodetool.input.FloatInput',
        nodeId: 'node-123',
        propertyName: 'other',
      })
    );

    expect(result.current).toEqual({ min: 0, max: 100 });
  });

  it('should use propertyMin and propertyMax when provided', () => {
    const { result } = renderHook(() => 
      useInputMinMax({
        nodeType: 'nodetool.input.FloatInput',
        nodeId: 'node-123',
        propertyName: 'value',
        propertyMin: 10,
        propertyMax: 200,
      })
    );

    expect(result.current).toEqual({ min: 10, max: 200 });
  });

  it('should prefer node min/max over property min/max', () => {
    const mockContext = createMockStore([
      createMockNode('node-123', {
        data: {
          properties: { min: 5, max: 50 },
          selectable: true,
          dynamic_properties: {},
          workflow_id: 'test-workflow',
        },
      }),
    ]);

    const { result } = renderHook(() => 
      useInputMinMax({
        nodeType: 'nodetool.input.FloatInput',
        nodeId: 'node-123',
        propertyName: 'value',
        propertyMin: 10,
        propertyMax: 200,
      }),
      {
        wrapper: ({ children }) => (
          <NodeContext.Provider value={mockContext as any}>
            {children}
          </NodeContext.Provider>
        ),
      }
    );

    expect(result.current).toEqual({ min: 5, max: 50 });
  });

  it('should fallback to propertyMin when nodeMin is not a number', () => {
    const mockContext = createMockStore([
      createMockNode('node-123', {
        data: {
          properties: { min: 'invalid', max: null },
          selectable: true,
          dynamic_properties: {},
          workflow_id: 'test-workflow',
        },
      }),
    ]);

    const { result } = renderHook(() => 
      useInputMinMax({
        nodeType: 'nodetool.input.FloatInput',
        nodeId: 'node-123',
        propertyName: 'value',
        propertyMin: 10,
        propertyMax: 200,
      }),
      {
        wrapper: ({ children }) => (
          <NodeContext.Provider value={mockContext as any}>
            {children}
          </NodeContext.Provider>
        ),
      }
    );

    expect(result.current).toEqual({ min: 10, max: 200 });
  });

  it('should handle IntegerInput node type', () => {
    const { result } = renderHook(() => 
      useInputMinMax({
        nodeType: 'nodetool.input.IntegerInput',
        nodeId: 'node-123',
        propertyName: 'value',
        propertyMin: 1,
        propertyMax: 50,
      })
    );

    expect(result.current).toEqual({ min: 1, max: 50 });
  });

  it('should return correct values when no node is found', () => {
    const mockContext = createMockStore([
      createMockNode('other-node'),
    ]);

    const { result } = renderHook(() => 
      useInputMinMax({
        nodeType: 'nodetool.input.FloatInput',
        nodeId: 'node-123',
        propertyName: 'value',
        propertyMin: 10,
        propertyMax: 200,
      }),
      {
        wrapper: ({ children }) => (
          <NodeContext.Provider value={mockContext as any}>
            {children}
          </NodeContext.Provider>
        ),
      }
    );

    expect(result.current).toEqual({ min: 10, max: 200 });
  });

  it('should handle null propertyMin and propertyMax', () => {
    const { result } = renderHook(() => 
      useInputMinMax({
        nodeType: 'nodetool.input.FloatInput',
        nodeId: 'node-123',
        propertyName: 'value',
        propertyMin: null,
        propertyMax: null,
      })
    );

    expect(result.current).toEqual({ min: 0, max: 100 });
  });

  it('should handle undefined propertyMin and propertyMax', () => {
    const { result } = renderHook(() => 
      useInputMinMax({
        nodeType: 'nodetool.input.FloatInput',
        nodeId: 'node-123',
        propertyName: 'value',
      })
    );

    expect(result.current).toEqual({ min: 0, max: 100 });
  });
});
