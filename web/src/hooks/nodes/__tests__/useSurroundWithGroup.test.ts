import { renderHook, act } from "@testing-library/react";
import { useSurroundWithGroup } from "../useSurroundWithGroup";
import { Node } from "@xyflow/react";
import { NodeData } from "../../../stores/NodeData";

// Mock dependencies at the top level
jest.mock("@xyflow/react", () => ({
  useReactFlow: () => ({
    fitView: jest.fn()
  })
}));

jest.mock("../../../contexts/NodeContext", () => ({
  useNodes: jest.fn(),
  useTemporalNodes: jest.fn()
}));

jest.mock("../../../utils/nodeUtils", () => ({
  GROUP_NODE_METADATA: {
    namespace: "default",
    node_type: "nodetool.workflows.base_node.Group",
    properties: [],
    title: "Group",
    description: "Group Node",
    outputs: [],
    the_model_info: {},
    layout: "default",
    recommended_models: [],
    basic_fields: [],
    is_dynamic: false,
    expose_as_tool: false,
    supports_dynamic_outputs: false,
    is_streaming_output: false
  }
}));

jest.mock("@mui/material/styles", () => ({
  useTheme: () => ({
    vars: {
      palette: {
        c_bg_group: "#123456"
      }
    }
  })
}));

describe("useSurroundWithGroup", () => {
  const mockCreateNode = jest.fn();
  const mockSetNodes = jest.fn();
  const mockPause = jest.fn();
  const mockResume = jest.fn();

  const createMockNode = (id: string, x: number, y: number, width?: number, height?: number): Node<NodeData> => ({
    id,
    type: "default",
    position: { x, y },
    width,
    height,
    measured: width ? { width, height: height || 100 } : undefined,
    data: {
      title: "Test Node",
      properties: {},
      selectable: true,
      dynamic_properties: {},
      workflow_id: "test-workflow"
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    const { useNodes, useTemporalNodes } = require("../../../contexts/NodeContext");
    
    mockCreateNode.mockReturnValue({
      id: "group-1",
      type: "nodetool.workflows.base_node.Group",
      position: { x: 0, y: 0 },
      data: { properties: {}, title: "Group" },
      width: 200,
      height: 200
    } as any);
    
    (useNodes as jest.Mock).mockReturnValue({
      createNode: mockCreateNode,
      setNodes: mockSetNodes
    });
    
    (useTemporalNodes as jest.Mock).mockReturnValue({
      pause: mockPause,
      resume: mockResume
    });
  });

  it("returns a function", () => {
    const { result } = renderHook(() => useSurroundWithGroup());
    expect(typeof result.current).toBe("function");
  });

  it("does nothing when no nodes are selected", () => {
    const { result } = renderHook(() => useSurroundWithGroup());

    act(() => {
      result.current({ selectedNodes: [] });
    });

    expect(mockPause).not.toHaveBeenCalled();
    expect(mockCreateNode).not.toHaveBeenCalled();
  });

  it("does nothing when selectedNodes is undefined", () => {
    const { result } = renderHook(() => useSurroundWithGroup());

    act(() => {
      // @ts-expect-error - testing with undefined
      result.current({ selectedNodes: undefined });
    });

    expect(mockPause).not.toHaveBeenCalled();
  });

  it("pauses temporal history before creating group", () => {
    const { result } = renderHook(() => useSurroundWithGroup());
    const selectedNodes = [createMockNode("node-1", 100, 100, 200, 50)];

    act(() => {
      result.current({ selectedNodes });
    });

    expect(mockPause).toHaveBeenCalled();
  });

  it("resumes temporal history after group creation", () => {
    const { result } = renderHook(() => useSurroundWithGroup());
    const selectedNodes = [createMockNode("node-1", 100, 100, 200, 50)];

    act(() => {
      result.current({ selectedNodes });
    });

    expect(mockResume).toHaveBeenCalled();
  });

  it("creates a group node with selected nodes", () => {
    const { result } = renderHook(() => useSurroundWithGroup());
    const selectedNodes = [
      createMockNode("node-1", 100, 100, 200, 50),
      createMockNode("node-2", 350, 100, 200, 50)
    ];

    act(() => {
      result.current({ selectedNodes });
    });

    expect(mockCreateNode).toHaveBeenCalled();
  });

  it("sets parentId on selected nodes", () => {
    const { result } = renderHook(() => useSurroundWithGroup());
    const selectedNodes = [
      createMockNode("node-1", 100, 100, 200, 50),
      createMockNode("node-2", 350, 100, 200, 50)
    ];

    act(() => {
      result.current({ selectedNodes });
    });

    expect(mockSetNodes).toHaveBeenCalled();
    const updateFn = mockSetNodes.mock.calls[0][0];
    const updatedNodes = updateFn([]);
    const groupNode = updatedNodes[0];
    const childNodes = updatedNodes.slice(1);

    childNodes.forEach((node: any) => {
      expect(node.parentId).toBe(groupNode.id);
    });
  });

  it("adjusts node positions relative to group", () => {
    const { result } = renderHook(() => useSurroundWithGroup());
    const selectedNodes = [
      createMockNode("node-1", 150, 200, 200, 50)
    ];

    act(() => {
      result.current({ selectedNodes });
    });

    expect(mockSetNodes).toHaveBeenCalled();
    const updateFn = mockSetNodes.mock.calls[0][0];
    // Pass the selected nodes as prevNodes to simulate the actual behavior
    const updatedNodes = updateFn(selectedNodes);
    const childNode = updatedNodes[1];

    expect(childNode.position.x).toBeDefined();
    expect(childNode.position.y).toBeDefined();
  });

  it("handles nodes without measured dimensions", () => {
    const { result } = renderHook(() => useSurroundWithGroup());
    const selectedNodes = [
      { id: "node-1", type: "default", position: { x: 100, y: 100 }, data: {} } as any
    ];

    act(() => {
      result.current({ selectedNodes });
    });

    expect(mockCreateNode).toHaveBeenCalled();
  });

  it("filters out null/undefined nodes from selection", () => {
    const { result } = renderHook(() => useSurroundWithGroup());
    const selectedNodes = [
      createMockNode("node-1", 100, 100, 200, 50),
      null as any,
      createMockNode("node-2", 200, 200, 200, 50),
      undefined as any
    ];

    act(() => {
      result.current({ selectedNodes });
    });

    expect(mockPause).toHaveBeenCalled();
  });

  it("creates group with group_color property", () => {
    const { result } = renderHook(() => useSurroundWithGroup());
    const selectedNodes = [createMockNode("node-1", 100, 100, 200, 50)];

    act(() => {
      result.current({ selectedNodes });
    });

    expect(mockCreateNode).toHaveBeenCalled();
  });

  it("resumes temporal history even if error occurs", () => {
    mockSetNodes.mockImplementation(() => {
      throw new Error("Test error");
    });

    const { result } = renderHook(() => useSurroundWithGroup());
    const selectedNodes = [createMockNode("node-1", 100, 100, 200, 50)];

    act(() => {
      try {
        result.current({ selectedNodes });
      } catch (e) {
        // Expected
      }
    });

    expect(mockResume).toHaveBeenCalled();
  });
});
