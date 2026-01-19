import { renderHook, act } from "@testing-library/react";
import { useCreateNode } from "../useCreateNode";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { useReactFlow } from "@xyflow/react";
import { useNodes } from "../../contexts/NodeContext";
import { useRecentNodesStore } from "../../stores/RecentNodesStore";
import { NodeMetadata } from "../../stores/ApiTypes";

jest.mock("../../stores/NodeMenuStore");
jest.mock("@xyflow/react", () => ({
  useReactFlow: jest.fn()
}));
jest.mock("../../contexts/NodeContext");
jest.mock("../../stores/RecentNodesStore");

const mockAddNode = jest.fn();
const mockCreateNode = jest.fn();
const mockAddRecentNode = jest.fn();
const mockCloseNodeMenu = jest.fn();

const createMockMetadata = (nodeType: string): NodeMetadata => ({
  namespace: "default",
  node_type: nodeType,
  title: `Node ${nodeType}`,
  description: "Test node",
  properties: [],
  outputs: [],
  the_model_info: {},
  layout: "default",
  recommended_models: [],
  basic_fields: [],
  is_dynamic: false,
  expose_as_tool: false,
  supports_dynamic_outputs: false,
  is_streaming_output: false
});

describe("useCreateNode", () => {
  const mockScreenToFlowPosition = { x: 100, y: 200 };
  const mockClickPosition = { x: 50, y: 75 };
  const mockCenterPosition = { x: 200, y: 300 };

  beforeEach(() => {
    jest.clearAllMocks();

    (useNodeMenuStore as unknown as jest.Mock).mockImplementation((selector) => {
      const state = {
        clickPosition: mockClickPosition,
        closeNodeMenu: mockCloseNodeMenu
      };
      return selector(state);
    });

    (useReactFlow as jest.Mock).mockReturnValue({
      screenToFlowPosition: jest.fn(() => mockScreenToFlowPosition)
    });

    (useNodes as jest.Mock).mockImplementation((selector) => {
      const state = {
        addNode: mockAddNode,
        createNode: mockCreateNode
      };
      return selector(state);
    });

    (useRecentNodesStore as unknown as jest.Mock).mockImplementation((selector) => {
      const state = {
        addRecentNode: mockAddRecentNode
      };
      return selector(state);
    });
  });

  it("should return a function", () => {
    const { result } = renderHook(() => useCreateNode());
    expect(typeof result.current).toBe("function");
  });

  it("should not create node when reactFlowInstance is null", () => {
    (useReactFlow as jest.Mock).mockReturnValue(null);

    const { result } = renderHook(() => useCreateNode());
    const metadata = createMockMetadata("test-node");

    act(() => {
      result.current(metadata);
    });

    expect(mockCreateNode).not.toHaveBeenCalled();
    expect(mockAddNode).not.toHaveBeenCalled();
    expect(mockCloseNodeMenu).not.toHaveBeenCalled();
  });

  it("should create node using clickPosition when no centerPosition provided", () => {
    const mockNode = { id: "new-node", type: "test-node" };
    mockCreateNode.mockReturnValue(mockNode);

    const { result } = renderHook(() => useCreateNode());
    const metadata = createMockMetadata("test-node");

    act(() => {
      result.current(metadata);
    });

    expect(mockCreateNode).toHaveBeenCalledWith(metadata, mockScreenToFlowPosition);
    expect(mockAddNode).toHaveBeenCalledWith(mockNode);
    expect(mockAddRecentNode).toHaveBeenCalledWith("test-node");
    expect(mockCloseNodeMenu).toHaveBeenCalled();
  });

  it("should use centerPosition when provided", () => {
    const mockNode = { id: "new-node", type: "test-node" };
    mockCreateNode.mockReturnValue(mockNode);

    const { result } = renderHook(() => useCreateNode(mockCenterPosition));
    const metadata = createMockMetadata("test-node");

    act(() => {
      result.current(metadata);
    });

    expect(mockCreateNode).toHaveBeenCalledWith(metadata, mockScreenToFlowPosition);
    expect(useReactFlow).toHaveBeenCalled();
  });

  it("should call screenToFlowPosition with clickPosition", () => {
    const mockNode = { id: "new-node" };
    mockCreateNode.mockReturnValue(mockNode);

    const { result } = renderHook(() => useCreateNode());
    const metadata = createMockMetadata("test-node");

    act(() => {
      result.current(metadata);
    });

    expect(useReactFlow).toHaveBeenCalled();
  });

  it("should close node menu after creating node", () => {
    const mockNode = { id: "new-node" };
    mockCreateNode.mockReturnValue(mockNode);

    const { result } = renderHook(() => useCreateNode());
    const metadata = createMockMetadata("test-node");

    act(() => {
      result.current(metadata);
    });

    expect(mockCloseNodeMenu).toHaveBeenCalled();
  });

  it("should add node type to recent nodes", () => {
    const mockNode = { id: "new-node" };
    mockCreateNode.mockReturnValue(mockNode);

    const { result } = renderHook(() => useCreateNode());
    const metadata = createMockMetadata("my-custom-node");

    act(() => {
      result.current(metadata);
    });

    expect(mockAddRecentNode).toHaveBeenCalledWith("my-custom-node");
  });

  it("should handle different node types", () => {
    const mockNode = { id: "new-node" };
    mockCreateNode.mockReturnValue(mockNode);

    const { result } = renderHook(() => useCreateNode());
    const metadata = createMockMetadata("nodetool.input.TextInput");

    act(() => {
      result.current(metadata);
    });

    expect(mockAddRecentNode).toHaveBeenCalledWith("nodetool.input.TextInput");
  });

  it("should preserve metadata properties when creating node", () => {
    const mockNode = { id: "new-node", type: "custom" };
    mockCreateNode.mockReturnValue(mockNode);

    const { result } = renderHook(() => useCreateNode());
    const metadata: NodeMetadata = {
      namespace: "custom",
      node_type: "custom-node",
      title: "Custom Title",
      description: "Custom description",
      properties: [{ name: "prop1", type: "string" }],
      outputs: [{ id: "out1", type: "text" }],
      the_model_info: { key: "value" },
      layout: "custom-layout",
      recommended_models: [],
      basic_fields: [],
      is_dynamic: true,
      expose_as_tool: true,
      supports_dynamic_outputs: true,
      is_streaming_output: true
    };

    act(() => {
      result.current(metadata);
    });

    expect(mockCreateNode).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: "custom",
        node_type: "custom-node",
        title: "Custom Title",
        is_dynamic: true,
        expose_as_tool: true
      }),
      mockScreenToFlowPosition
    );
  });

  it("should handle rapid node creation", () => {
    const mockNode1 = { id: "node-1" };
    const mockNode2 = { id: "node-2" };
    mockCreateNode
      .mockReturnValueOnce(mockNode1)
      .mockReturnValueOnce(mockNode2);

    const { result } = renderHook(() => useCreateNode());
    const metadata = createMockMetadata("test-node");

    act(() => {
      result.current(metadata);
      result.current(metadata);
    });

    expect(mockCreateNode).toHaveBeenCalledTimes(2);
    expect(mockAddNode).toHaveBeenCalledTimes(2);
    expect(mockCloseNodeMenu).toHaveBeenCalledTimes(2);
  });
});
