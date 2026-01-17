import { renderHook, act } from '@testing-library/react';
import { useApplyPattern } from '../useApplyPattern';

describe('useApplyPattern', () => {
  const mockAddNode = jest.fn();
  const mockAddEdge = jest.fn();
  const mockGenerateNodeId = jest.fn();
  const mockGetPatternById = jest.fn();
  const mockIncrementUsage = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    mockGenerateNodeId.mockImplementation(() => `node-${Math.random().toString(36).substr(2, 9)}`);

    jest.doMock('../../../stores/NodeStore', () => ({
      useNodeStore: (selector: any) => {
        const state = {
          nodes: [],
          edges: [],
          addNode: mockAddNode,
          addEdge: mockAddEdge,
          generateNodeId: mockGenerateNodeId,
        };
        return selector(state);
      },
    }));

    jest.doMock('../../../stores/research/PatternStore', () => ({
      usePatternStore: (selector: any) => {
        const state = {
          getPatternById: mockGetPatternById,
          incrementUsage: mockIncrementUsage,
        };
        return selector(state);
      },
    }));
  });

  afterEach(() => {
    jest.resetModules();
  });

  it('should apply pattern nodes and edges', async () => {
    const patternNodes = [
      { id: 'n1', type: 'testNode', position: { x: 100, y: 100 }, data: { value: 'test' } },
      { id: 'n2', type: 'testNode2', position: { x: 300, y: 100 }, data: {} },
    ];
    const patternEdges = [
      { id: 'e1', source: 'n1', target: 'n2' },
    ];

    mockGetPatternById.mockReturnValue({
      id: 'pattern-1',
      name: 'Test Pattern',
      nodes: patternNodes,
      edges: patternEdges,
    });

    const { result } = renderHook(() => useApplyPattern());

    await act(async () => {
      result.current('pattern-1', { x: 50, y: 50 });
    });

    expect(mockGetPatternById).toHaveBeenCalledWith('pattern-1');
    expect(mockIncrementUsage).toHaveBeenCalledWith('pattern-1');
    expect(mockAddNode).toHaveBeenCalledTimes(2);
    expect(mockAddEdge).toHaveBeenCalledTimes(1);
  });

  it('should use default position if not provided', async () => {
    const patternNodes = [
      { id: 'n1', type: 'testNode', position: { x: 0, y: 0 }, data: {} },
    ];
    const patternEdges: any[] = [];

    mockGetPatternById.mockReturnValue({
      id: 'pattern-2',
      name: 'Default Position Pattern',
      nodes: patternNodes,
      edges: patternEdges,
    });

    const { result } = renderHook(() => useApplyPattern());

    await act(async () => {
      result.current('pattern-2');
    });

    expect(mockAddNode).toHaveBeenCalledWith(
      expect.objectContaining({
        position: { x: 200, y: 200 },
      })
    );
  });

  it('should throw error if pattern not found', async () => {
    mockGetPatternById.mockReturnValue(undefined);

    const { result } = renderHook(() => useApplyPattern());

    await expect(result.current('non-existent')).rejects.toThrow('Pattern not found');
  });

  it('should generate new IDs for nodes and edges', async () => {
    const patternNodes = [
      { id: 'original-1', type: 'test', position: { x: 100, y: 100 }, data: {} },
    ];
    const patternEdges = [
      { id: 'original-edge', source: 'original-1', target: 'original-1' },
    ];

    mockGetPatternById.mockReturnValue({
      id: 'pattern-3',
      name: 'ID Test',
      nodes: patternNodes,
      edges: patternEdges,
    });

    const { result } = renderHook(() => useApplyPattern());

    await act(async () => {
      result.current('pattern-3');
    });

    expect(mockAddNode).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.stringMatching(/^node-/),
        type: 'test',
      })
    );

    expect(mockAddEdge).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.stringContaining('e-'),
        source: expect.stringMatching(/^node-/),
        target: expect.stringMatching(/^node-/),
      })
    );
  });
});
