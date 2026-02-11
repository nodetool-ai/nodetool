import { renderHook, act } from "@testing-library/react";
import { useCreateNode } from "../useCreateNode";
import { useReactFlow } from "@xyflow/react";

const mockAddNode = jest.fn();
const mockCreateNode = jest.fn().mockReturnValue({
  id: "new-node-1",
  position: { x: 100, y: 200 },
});

jest.mock("../../contexts/NodeContext", () => ({
  useNodes: jest.fn((selector) => {
    const mockState = {
      addNode: mockAddNode,
      createNode: mockCreateNode,
    };
    if (typeof selector === "function") {
      return selector(mockState);
    }
    return mockState;
  }),
}));

const mockClickPosition = { x: 50, y: 50 };
const mockCloseNodeMenu = jest.fn();

jest.mock("../../stores/NodeMenuStore", () => ({
  __esModule: true,
  default: jest.fn((selector) => {
    const mockState = {
      clickPosition: mockClickPosition,
      closeNodeMenu: mockCloseNodeMenu,
    };
    if (typeof selector === "function") {
      return selector(mockState);
    }
    return mockState;
  }),
}));

const mockAddRecentNode = jest.fn();
jest.mock("../../stores/RecentNodesStore", () => ({
  useRecentNodesStore: (selector: (state: { addRecentNode: typeof mockAddRecentNode }) => unknown) => {
    const mockState = { addRecentNode: mockAddRecentNode };
    if (typeof selector === "function") {
      return selector(mockState);
    }
    return mockState;
  },
}));

describe("useCreateNode", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useReactFlow as jest.Mock).mockReturnValue({
      screenToFlowPosition: jest.fn().mockReturnValue({ x: 100, y: 200 }),
    });
  });

  it("returns a callback function", () => {
    const { result } = renderHook(() => useCreateNode());
    expect(typeof result.current).toBe("function");
  });

  it("does nothing when reactFlowInstance is null", () => {
    (useReactFlow as jest.Mock).mockReturnValueOnce(null);

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

    const mockScreenToFlowPosition = (useReactFlow as jest.Mock).mock.results[0]?.value?.screenToFlowPosition;
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

    const mockScreenToFlowPosition = (useReactFlow as jest.Mock).mock.results[0]?.value?.screenToFlowPosition;
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
    const { result, rerender } = renderHook(() => useCreateNode());
    const initialCallback = result.current;

    rerender();

    expect(result.current).toBe(initialCallback);
  });
});
