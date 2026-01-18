import { renderHook, act } from "@testing-library/react";
import { useCreateNode } from "../useCreateNode";

const mockNodeContextState = {
  nodes: [],
  addNode: jest.fn(),
  createNode: (metadata: any, position: any) => ({
    id: "node-1",
    type: metadata.node_type,
    position,
    data: metadata,
  }),
};

const mockNodeMenuState = {
  clickPosition: { x: 100, y: 200 },
  closeNodeMenu: jest.fn(),
};

const mockRecentNodesState = {
  addRecentNode: jest.fn(),
};

const mockScreenToFlowPosition = jest.fn((pos: any) => ({ x: pos.x, y: pos.y }));

jest.mock("@xyflow/react", () => ({
  useReactFlow: () => ({
    screenToFlowPosition: mockScreenToFlowPosition,
  }),
}));

jest.mock("../../contexts/NodeContext", () => ({
  useNodes: (selector: (state: any) => any) => selector(mockNodeContextState),
}));

jest.mock("../../stores/NodeMenuStore", () => ({
  __esModule: true,
  default: (selector: (state: any) => any) => selector(mockNodeMenuState),
}));

jest.mock("../../stores/RecentNodesStore", () => ({
  useRecentNodesStore: (selector: (state: any) => any) => selector(mockRecentNodesState),
}));

describe("useCreateNode", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns a callback function", () => {
    const { result } = renderHook(() => useCreateNode());
    
    expect(typeof result.current).toBe("function");
  });

  it("returns callback when centerPosition is provided", () => {
    const { result } = renderHook(() => useCreateNode({ x: 50, y: 50 }));
    
    expect(typeof result.current).toBe("function");
  });

  it("calls screenToFlowPosition with clickPosition when no centerPosition", () => {
    const { result } = renderHook(() => useCreateNode());
    const mockMetadata = { node_type: "test-node", name: "Test Node" };
    
    act(() => {
      result.current(mockMetadata);
    });
    
    expect(mockScreenToFlowPosition).toHaveBeenCalledWith({ x: 100, y: 200 });
  });

  it("calls screenToFlowPosition with centerPosition when provided", () => {
    const { result } = renderHook(() => useCreateNode({ x: 300, y: 400 }));
    const mockMetadata = { node_type: "test-node", name: "Test Node" };
    
    act(() => {
      result.current(mockMetadata);
    });
    
    expect(mockScreenToFlowPosition).toHaveBeenCalledWith({ x: 300, y: 400 });
  });

  it("tracks recently used node", () => {
    const { result } = renderHook(() => useCreateNode());
    const mockMetadata = { node_type: "test-node", name: "Test Node" };
    
    act(() => {
      result.current(mockMetadata);
    });
    
    expect(mockRecentNodesState.addRecentNode).toHaveBeenCalledWith("test-node");
  });

  it("closes node menu after creating node", () => {
    const { result } = renderHook(() => useCreateNode());
    const mockMetadata = { node_type: "test-node", name: "Test Node" };
    
    act(() => {
      result.current(mockMetadata);
    });
    
    expect(mockNodeMenuState.closeNodeMenu).toHaveBeenCalled();
  });
});
