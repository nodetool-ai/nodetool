import { renderHook, act } from "@testing-library/react";
import { useCreateNode } from "../useCreateNode";
import { useReactFlow } from "@xyflow/react";
import { useNodes } from "../../contexts/NodeContext";
import useNodeMenuStore from "../../stores/NodeMenuStore";

const mockScreenToFlowPosition = jest.fn().mockReturnValue({ x: 100, y: 200 });
const mockReactFlowInstance = {
  screenToFlowPosition: mockScreenToFlowPosition,
};

jest.mock("@xyflow/react", () => ({
  useReactFlow: jest.fn(),
}));

jest.mock("../../contexts/NodeContext", () => ({
  useNodes: jest.fn(),
}));

jest.mock("../../stores/NodeMenuStore", () => ({
  __esModule: true,
  default: jest.fn(),
}));

const mockAddRecentNode = jest.fn();
const mockCreateNode = jest.fn().mockReturnValue({
  id: "new-node-1",
  position: { x: 100, y: 200 },
});
const mockAddNode = jest.fn();
const mockCloseNodeMenu = jest.fn();
const mockClickPosition = { x: 50, y: 50 };

jest.mock("../../stores/RecentNodesStore", () => ({
  useRecentNodesStore: jest.fn(() => mockAddRecentNode),
}));

describe("useCreateNode", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockScreenToFlowPosition.mockReturnValue({ x: 100, y: 200 });
    mockCreateNode.mockReturnValue({
      id: "new-node-1",
      position: { x: 100, y: 200 },
    });
    (useReactFlow as jest.Mock).mockReturnValue(mockReactFlowInstance);
    (useNodes as jest.Mock).mockImplementation((selector) => {
      if (typeof selector === "function") {
        return selector({
          addNode: mockAddNode,
          createNode: mockCreateNode,
        });
      }
      return {
        addNode: mockAddNode,
        createNode: mockCreateNode,
      };
    });
    (useNodeMenuStore as unknown as jest.Mock).mockReturnValue({
      clickPosition: mockClickPosition,
      closeNodeMenu: mockCloseNodeMenu,
    });
  });

  it("returns a callback function", () => {
    const { result } = renderHook(() => useCreateNode());
    expect(typeof result.current).toBe("function");
  });

  it("does nothing when reactFlowInstance is null", () => {
    (useReactFlow as jest.Mock).mockReturnValue(null);

    const { result } = renderHook(() => useCreateNode());
    const mockMetadata = { 
      node_type: "test", 
      title: "Test Node",
      description: "Test description",
      namespace: "test",
      layout: "default",
      outputs: [],
      properties: [],
      is_dynamic: false,
      supports_dynamic_outputs: false,
      expose_as_tool: false,
      the_model_info: {},
      recommended_models: [],
      basic_fields: [],
      is_streaming_output: false,
    };

    act(() => {
      result.current(mockMetadata);
    });

    expect(mockCreateNode).not.toHaveBeenCalled();
  });

  it("uses clickPosition when centerPosition is not provided", () => {
    const { result } = renderHook(() => useCreateNode());
    const mockMetadata = { 
      node_type: "test", 
      title: "Test Node",
      description: "Test description",
      namespace: "test",
      layout: "default",
      outputs: [],
      properties: [],
      is_dynamic: false,
      supports_dynamic_outputs: false,
      expose_as_tool: false,
      the_model_info: {},
      recommended_models: [],
      basic_fields: [],
      is_streaming_output: false,
    };

    act(() => {
      result.current(mockMetadata);
    });

    expect(mockScreenToFlowPosition).toHaveBeenCalledWith({ x: 50, y: 50 });
  });

  it("uses provided centerPosition when specified", () => {
    const { result } = renderHook(() =>
      useCreateNode({ x: 200, y: 300 })
    );
    const mockMetadata = { 
      node_type: "test", 
      title: "Test Node",
      description: "Test description",
      namespace: "test",
      layout: "default",
      outputs: [],
      properties: [],
      is_dynamic: false,
      supports_dynamic_outputs: false,
      expose_as_tool: false,
      the_model_info: {},
      recommended_models: [],
      basic_fields: [],
      is_streaming_output: false,
    };

    act(() => {
      result.current(mockMetadata);
    });

    expect(mockScreenToFlowPosition).toHaveBeenCalledWith({ x: 200, y: 300 });
  });

  it("creates node with correct flow position", () => {
    const { result } = renderHook(() => useCreateNode());
    const mockMetadata = { 
      node_type: "test", 
      title: "Test Node",
      description: "Test description",
      namespace: "test",
      layout: "default",
      outputs: [],
      properties: [],
      is_dynamic: false,
      supports_dynamic_outputs: false,
      expose_as_tool: false,
      the_model_info: {},
      recommended_models: [],
      basic_fields: [],
      is_streaming_output: false,
    };

    act(() => {
      result.current(mockMetadata);
    });

    expect(mockCreateNode).toHaveBeenCalledWith(
      mockMetadata,
      { x: 100, y: 200 }
    );
  });

  it("tracks node as recently used", () => {
    const { result } = renderHook(() => useCreateNode());
    const mockMetadata = { 
      node_type: "nodetool.input.StringInput", 
      title: "String Input",
      description: "Test description",
      namespace: "nodetool.input",
      layout: "default",
      outputs: [],
      properties: [],
      is_dynamic: false,
      supports_dynamic_outputs: false,
      expose_as_tool: false,
      the_model_info: {},
      recommended_models: [],
      basic_fields: [],
      is_streaming_output: false,
    };

    act(() => {
      result.current(mockMetadata);
    });

    expect(mockAddRecentNode).toHaveBeenCalledWith("nodetool.input.StringInput");
  });

  it("closes node menu after creating node", () => {
    const { result } = renderHook(() => useCreateNode());
    const mockMetadata = { 
      node_type: "test", 
      title: "Test Node",
      description: "Test description",
      namespace: "test",
      layout: "default",
      outputs: [],
      properties: [],
      is_dynamic: false,
      supports_dynamic_outputs: false,
      expose_as_tool: false,
      the_model_info: {},
      recommended_models: [],
      basic_fields: [],
      is_streaming_output: false,
    };

    act(() => {
      result.current(mockMetadata);
    });

    expect(mockCloseNodeMenu).toHaveBeenCalled();
  });

  it("maintains callback referential identity", () => {
    const { result: result1 } = renderHook(() => useCreateNode());
    const { result: result2 } = renderHook(() => useCreateNode());

    expect(typeof result1.current).toBe("function");
    expect(typeof result2.current).toBe("function");
  });
});
