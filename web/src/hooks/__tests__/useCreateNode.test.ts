import { renderHook, act } from "@testing-library/react";
import { useCreateNode } from "../useCreateNode";
import { useNodeMenuStore } from "../../stores/NodeMenuStore";
import { useReactFlow } from "@xyflow/react";
import { useNodes } from "../../contexts/NodeContext";

const mockAddRecentNode = jest.fn();

jest.mock("@xyflow/react");
jest.mock("../../contexts/NodeContext");
jest.mock("../../stores/NodeMenuStore");
jest.mock("../../stores/RecentNodesStore", () => ({
  useRecentNodesStore: jest.fn((selector) => {
    if (typeof selector === "function") {
      return selector({ addRecentNode: mockAddRecentNode });
    }
    return { addRecentNode: mockAddRecentNode };
  })
}));

describe("useCreateNode", () => {
  const mockAddNode = jest.fn();
  const mockCreateNode = jest.fn();
  const mockCloseNodeMenu = jest.fn();
  const mockScreenToFlowPosition = jest.fn().mockReturnValue({ x: 150, y: 250 });

  const mockClickPosition = { x: 100, y: 200 };

  const setupMocks = () => {
    (useNodeMenuStore as unknown as jest.Mock).mockReturnValue({
      clickPosition: mockClickPosition,
      closeNodeMenu: mockCloseNodeMenu
    });

    (useReactFlow as jest.Mock).mockReturnValue({
      screenToFlowPosition: mockScreenToFlowPosition
    });

    (useNodes as jest.Mock).mockImplementation((selector) => {
      if (typeof selector === "function") {
        return selector({
          addNode: mockAddNode,
          createNode: mockCreateNode
        });
      }
      return {
        addNode: mockAddNode,
        createNode: mockCreateNode
      };
    });
  };

  beforeEach(() => {
    mockAddNode.mockClear();
    mockCreateNode.mockClear();
    mockCloseNodeMenu.mockClear();
    mockScreenToFlowPosition.mockClear();
    mockScreenToFlowPosition.mockReturnValue({ x: 150, y: 250 });
    setupMocks();
  });

  it("returns a callback function", () => {
    const { result } = renderHook(() => useCreateNode());
    expect(typeof result.current).toBe("function");
  });

  it("does nothing when reactFlowInstance is null", () => {
    (useReactFlow as jest.Mock).mockReturnValue(null);

    const { result } = renderHook(() => useCreateNode());

    act(() => {
      result.current({ node_type: "test", title: "Test" });
    });

    expect(mockCreateNode).not.toHaveBeenCalled();
    expect(mockAddNode).not.toHaveBeenCalled();
  });

  it("creates node at click position when no centerPosition provided", () => {
    const mockNode = { id: "new-node", type: "test" };
    mockCreateNode.mockReturnValue(mockNode);

    const { result } = renderHook(() => useCreateNode());

    act(() => {
      result.current({ node_type: "test", title: "Test Node" });
    });

    expect(mockScreenToFlowPosition).toHaveBeenCalledWith(mockClickPosition);
    expect(mockCreateNode).toHaveBeenCalledWith(
      { node_type: "test", title: "Test Node" },
      { x: 150, y: 250 }
    );
    expect(mockAddNode).toHaveBeenCalledWith(mockNode);
    expect(mockCloseNodeMenu).toHaveBeenCalled();
  });

  it("creates node at provided centerPosition", () => {
    const centerPosition = { x: 300, y: 400 };
    const mockNode = { id: "new-node", type: "test" };
    mockCreateNode.mockReturnValue(mockNode);

    const { result } = renderHook(() => useCreateNode(centerPosition));

    act(() => {
      result.current({ node_type: "test", title: "Test Node" });
    });

    expect(mockScreenToFlowPosition).toHaveBeenCalledWith(centerPosition);
    expect(mockCreateNode).toHaveBeenCalledWith(
      { node_type: "test", title: "Test Node" },
      { x: 150, y: 250 }
    );
    expect(mockAddNode).toHaveBeenCalledWith(mockNode);
  });

  it("handles node creation with complex metadata", () => {
    const mockNode = { id: "complex-node", type: "complex" };
    mockCreateNode.mockReturnValue(mockNode);

    const metadata = {
      node_type: "nodetool.llm.LLM",
      title: "LLM Node",
      namespace: "llm",
      description: "A language model node",
      properties: [],
      outputs: [],
      the_model_info: {},
      recommended_models: [],
      layout: "default"
    };

    const { result } = renderHook(() => useCreateNode());

    act(() => {
      result.current(metadata);
    });

    expect(mockCreateNode).toHaveBeenCalledWith(metadata, { x: 150, y: 250 });
    expect(mockAddNode).toHaveBeenCalledWith(mockNode);
  });
});
