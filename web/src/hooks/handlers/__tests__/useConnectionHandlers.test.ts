import { renderHook } from "@testing-library/react";
import { OnConnectStartParams, Connection } from "@xyflow/react";
import useConnectionHandlers from "../useConnectionHandlers";
import useConnectionStore from "../../../stores/ConnectionStore";
import useMetadataStore from "../../../stores/MetadataStore";
import { useNotificationStore } from "../../../stores/NotificationStore";
import { useNodes } from "../../../contexts/NodeContext";
import { NodeMetadata } from "../../../stores/ApiTypes";
import { NodeData } from "../../../stores/NodeData";

// Mock dependencies
jest.mock("../../../stores/ConnectionStore");
jest.mock("../../../stores/MetadataStore");
jest.mock("../../../stores/NotificationStore");
jest.mock("../../../contexts/NodeContext");
const mockOpenContextMenu = jest.fn();

jest.mock("../../../stores/ContextMenuStore", () => ({
  __esModule: true,
  default: jest.fn(() => ({
    openContextMenu: mockOpenContextMenu,
    closeContextMenu: jest.fn(),
    menuPosition: null,
    openMenuType: null
  }))
}));

// Mock the centralized handle functions
jest.mock("../../../utils/handleUtils", () => {
  const actual = jest.requireActual("../../../utils/handleUtils");
  return {
    ...actual,
    findOutputHandle: jest.fn(),
    findInputHandle: jest.fn()
  };
});

// Mock TypeHandler utilities
jest.mock("../../../utils/TypeHandler", () => ({
  isConnectable: jest.fn(),
  Slugify: jest.fn((str) => str),
  typeToString: jest.fn((type) => type?.type ?? "unknown")
}));

import { findOutputHandle, findInputHandle } from "../../../utils/handleUtils";
import { isConnectable } from "../../../utils/TypeHandler";

const mockFindOutputHandle = findOutputHandle as jest.MockedFunction<
  typeof findOutputHandle
>;
const mockFindInputHandle = findInputHandle as jest.MockedFunction<
  typeof findInputHandle
>;
const mockIsConnectable = isConnectable as jest.MockedFunction<
  typeof isConnectable
>;

// Test data
const mockNodeMetadata: NodeMetadata = {
  node_type: "test.node",
  title: "Test Node",
  description: "A test node",
  namespace: "test",
  layout: "default",
  outputs: [
    {
      name: "output",
      type: {
        type: "str",
        optional: false,
        values: null,
        type_args: [],
        type_name: null
      },
      stream: false
    }
  ],
  properties: [
    {
      name: "input",
      type: {
        type: "str",
        optional: false,
        values: null,
        type_args: [],
        type_name: null
      },
      default: "",
      title: "Input",
      description: "Test input",
      required: false
    }
  ],
  is_dynamic: false,
  supports_dynamic_outputs: false,
  expose_as_tool: false,
  the_model_info: {},
  recommended_models: [],
  basic_fields: [],
  is_streaming_output: false,
            required_settings: []
};

const mockDynamicNodeMetadata: NodeMetadata = {
  ...mockNodeMetadata,
  node_type: "test.dynamic",
  is_dynamic: true,
  supports_dynamic_outputs: true
};

const previewNodeMetadata: NodeMetadata = {
  node_type: "nodetool.workflows.base_node.Preview",
  title: "Preview",
  description: "Preview node",
  namespace: "default",
  layout: "default",
  outputs: [],
  properties: [
    {
      name: "value",
      type: {
        type: "any",
        optional: true,
        values: null,
        type_args: [],
        type_name: null
      },
      default: undefined,
      title: "Value",
      description: "Preview value",
      required: false
    }
  ],
  is_dynamic: false,
  supports_dynamic_outputs: false,
  expose_as_tool: false,
  the_model_info: {},
  recommended_models: [],
  basic_fields: [],
  is_streaming_output: false,
            required_settings: []
};

const rerouteNodeMetadata: NodeMetadata = {
  node_type: "nodetool.control.Reroute",
  title: "Reroute",
  description: "Reroute node",
  namespace: "control",
  layout: "default",
  outputs: [
    {
      name: "output",
      type: {
        type: "str",
        optional: false,
        values: null,
        type_args: [],
        type_name: null
      },
      stream: false
    }
  ],
  properties: [
    {
      name: "input_value",
      type: {
        type: "str",
        optional: false,
        values: null,
        type_args: [],
        type_name: null
      },
      default: "",
      title: "Input value",
      description: "Reroute input",
      required: false
    }
  ],
  is_dynamic: false,
  supports_dynamic_outputs: false,
  expose_as_tool: false,
  the_model_info: {},
  recommended_models: [],
  basic_fields: [],
  is_streaming_output: false,
            required_settings: []
};

const createMockNode = (id: string, type: string = "test.node") => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data: {
    properties: {},
    collapsed: false,
    selectable: true,
    workflow_id: "test-workflow",
    dynamic_properties: {},
    dynamic_outputs: {}
  } as NodeData
});

describe("useConnectionHandlers", () => {
  const mockStartConnecting = jest.fn();
  const mockEndConnecting = jest.fn();
  const mockGetMetadata = jest.fn();
  const mockFindNode = jest.fn();
  const mockOnConnect = jest.fn();
  const mockAddNotification = jest.fn();
  const mockSetConnectionAttempted = jest.fn();
  const mockUpdateNodeData = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockOpenContextMenu.mockReset();

    // Mock useConnectionStore
    (useConnectionStore as unknown as jest.Mock).mockReturnValue({
      connecting: false,
      startConnecting: mockStartConnecting,
      endConnecting: mockEndConnecting
    });

    // Mock useMetadataStore
    (useMetadataStore as unknown as jest.Mock).mockReturnValue(mockGetMetadata);

    // Mock useNotificationStore
    (useNotificationStore as unknown as jest.Mock).mockReturnValue(
      mockAddNotification
    );

    // Mock useNodes
    (useNodes as unknown as jest.Mock).mockReturnValue({
      findNode: mockFindNode,
      onConnect: mockOnConnect,
      edges: [],
      setConnectionAttempted: mockSetConnectionAttempted,
      updateNodeData: mockUpdateNodeData
    });

    // Mock isConnectable to return true by default (override in specific tests)
    mockIsConnectable.mockReturnValue(true);
  });

  describe("onConnectStart", () => {
    it("should start connecting with valid parameters", () => {
      const { result } = renderHook(() => useConnectionHandlers());

      const sourceNode = createMockNode("node1");
      mockFindNode.mockReturnValue(sourceNode);
      mockGetMetadata.mockReturnValue(mockNodeMetadata);

      const connectStartParams: OnConnectStartParams = {
        nodeId: "node1",
        handleId: "output",
        handleType: "source"
      };

      result.current.onConnectStart({} as any, connectStartParams);

      expect(mockFindNode).toHaveBeenCalledWith("node1");
      expect(mockGetMetadata).toHaveBeenCalledWith("test.node");
      expect(mockStartConnecting).toHaveBeenCalledWith(
        sourceNode,
        "output",
        "source",
        mockNodeMetadata
      );
    });

    it("should handle missing node gracefully", () => {
      const { result } = renderHook(() => useConnectionHandlers());

      mockFindNode.mockReturnValue(undefined);
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();

      const connectStartParams: OnConnectStartParams = {
        nodeId: "nonexistent",
        handleId: "output",
        handleType: "source"
      };

      result.current.onConnectStart({} as any, connectStartParams);

      expect(consoleSpy).toHaveBeenCalledWith(
        "Node with id nonexistent not found"
      );
      expect(mockStartConnecting).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("should handle missing metadata gracefully", () => {
      const { result } = renderHook(() => useConnectionHandlers());

      const sourceNode = createMockNode("node1");
      mockFindNode.mockReturnValue(sourceNode);
      mockGetMetadata.mockReturnValue(undefined);
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();

      const connectStartParams: OnConnectStartParams = {
        nodeId: "node1",
        handleId: "output",
        handleType: "source"
      };

      result.current.onConnectStart({} as any, connectStartParams);

      expect(consoleSpy).toHaveBeenCalledWith(
        "Metadata for node type test.node not found"
      );
      expect(mockStartConnecting).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("should handle missing required parameters", () => {
      const { result } = renderHook(() => useConnectionHandlers());

      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();

      // Missing nodeId
      result.current.onConnectStart(
        {} as any,
        {
          nodeId: "",
          handleId: "output",
          handleType: "source"
        } as OnConnectStartParams
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        "Missing required data for connection start"
      );
      expect(mockStartConnecting).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe("handleOnConnect", () => {
    it("should connect nodes with valid handles", () => {
      const { result } = renderHook(() => useConnectionHandlers());

      const sourceNode = createMockNode("source", "test.node");
      const targetNode = createMockNode("target", "test.node");

      mockFindNode
        .mockReturnValueOnce(sourceNode)
        .mockReturnValueOnce(targetNode);
      mockGetMetadata
        .mockReturnValueOnce(mockNodeMetadata)
        .mockReturnValueOnce(mockNodeMetadata);

      // Mock handle finding
      mockFindOutputHandle.mockReturnValue({
        name: "output",
        type: {
          type: "str",
          optional: false,
          values: null,
          type_args: [],
          type_name: null
        },
        stream: false,
        isDynamic: false
      });

      mockFindInputHandle.mockReturnValue({
        name: "input",
        type: {
          type: "str",
          optional: false,
          values: null,
          type_args: [],
          type_name: null
        },
        isDynamic: false
      });

      const connection: Connection = {
        source: "source",
        target: "target",
        sourceHandle: "output",
        targetHandle: "input"
      };

      result.current.handleOnConnect(connection);

      expect(mockFindOutputHandle).toHaveBeenCalledWith(
        sourceNode,
        "output",
        mockNodeMetadata
      );
      expect(mockFindInputHandle).toHaveBeenCalledWith(
        targetNode,
        "input",
        mockNodeMetadata
      );
      expect(mockOnConnect).toHaveBeenCalledWith({
        ...connection,
        className: "str" // Slugified type
      });
    });

    it("should handle dynamic properties connections", () => {
      const { result } = renderHook(() => useConnectionHandlers());

      const sourceNode = createMockNode("source", "test.node");
      const targetNode = createMockNode("target", "test.dynamic");
      targetNode.data.dynamic_properties = { dynamic_input: "test_value" };

      mockFindNode
        .mockReturnValueOnce(sourceNode)
        .mockReturnValueOnce(targetNode);

      // Mock getMetadata to return proper metadata for both source and target
      mockGetMetadata.mockReturnValueOnce(mockNodeMetadata); // Source metadata
      mockGetMetadata.mockReturnValueOnce({
        node_type: "test.dynamic",
        title: "Dynamic Node",
        description: "A dynamic node",
        namespace: "test",
        layout: "default",
        properties: [],
        outputs: [],
        is_dynamic: true
      }); // Target metadata

      // Mock the handle finding functions to return proper handle objects
      mockFindOutputHandle.mockReturnValue({
        name: "output",
        type: {
          type: "str",
          optional: false,
          values: null,
          type_args: [],
          type_name: null
        },
        stream: false,
        isDynamic: false
      });

      mockFindInputHandle.mockReturnValue(undefined); // Dynamic property, so input handle is undefined

      mockIsConnectable.mockReturnValue(true);

      const connection: Connection = {
        source: "source",
        target: "target",
        sourceHandle: "output",
        targetHandle: "dynamic_input"
      };

      result.current.handleOnConnect(connection);

      expect(mockOnConnect).toHaveBeenCalledWith({
        ...connection,
        className: "str" // Uses source handle type, not target
      });
    });

    it("should reject connections with missing handles", () => {
      const { result } = renderHook(() => useConnectionHandlers());

      const sourceNode = createMockNode("source", "test.node");
      const targetNode = createMockNode("target", "test.node");

      mockFindNode
        .mockReturnValueOnce(sourceNode)
        .mockReturnValueOnce(targetNode);
      mockGetMetadata
        .mockReturnValueOnce(mockNodeMetadata)
        .mockReturnValueOnce(mockNodeMetadata);

      // Mock handle finding to return undefined (handles not found)
      mockFindOutputHandle.mockReturnValue(undefined);
      mockFindInputHandle.mockReturnValue(undefined);

      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();

      const connection: Connection = {
        source: "source",
        target: "target",
        sourceHandle: "invalid_output",
        targetHandle: "invalid_input"
      };

      result.current.handleOnConnect(connection);

      expect(consoleSpy).toHaveBeenCalledWith(
        "Invalid source handle. Source: invalid_output"
      );
      expect(mockOnConnect).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("should reject incompatible type connections", () => {
      const { result } = renderHook(() => useConnectionHandlers());

      const sourceNode = createMockNode("source", "test.node");
      const targetNode = createMockNode("target", "test.node");

      mockFindNode
        .mockReturnValueOnce(sourceNode)
        .mockReturnValueOnce(targetNode);
      mockGetMetadata
        .mockReturnValueOnce(mockNodeMetadata)
        .mockReturnValueOnce(mockNodeMetadata);

      // Mock incompatible types
      mockFindOutputHandle.mockReturnValue({
        name: "output",
        type: {
          type: "int",
          optional: false,
          values: null,
          type_args: [],
          type_name: null
        },
        stream: false,
        isDynamic: false
      });

      mockFindInputHandle.mockReturnValue({
        name: "input",
        type: {
          type: "str",
          optional: false,
          values: null,
          type_args: [],
          type_name: null
        },
        isDynamic: false
      });

      // Mock isConnectable to return false for this specific test
      mockIsConnectable.mockReturnValue(false);

      const connection: Connection = {
        source: "source",
        target: "target",
        sourceHandle: "output",
        targetHandle: "input"
      };

      result.current.handleOnConnect(connection);

      expect(mockAddNotification).toHaveBeenCalledWith({
        type: "warning",
        alert: true,
        content: "Cannot connect these types"
      });
      expect(mockOnConnect).not.toHaveBeenCalled();
    });

    it("should handle missing nodes gracefully", () => {
      const { result } = renderHook(() => useConnectionHandlers());

      mockFindNode.mockReturnValue(undefined);

      const connection: Connection = {
        source: "nonexistent",
        target: "target",
        sourceHandle: "output",
        targetHandle: "input"
      };

      result.current.handleOnConnect(connection);

      expect(mockOnConnect).not.toHaveBeenCalled();
    });

    it("should handle missing targetHandle gracefully", () => {
      const { result } = renderHook(() => useConnectionHandlers());

      const connection: Connection = {
        source: "source",
        target: "target",
        sourceHandle: "output",
        targetHandle: null
      };

      result.current.handleOnConnect(connection);

      expect(mockOnConnect).not.toHaveBeenCalled();
    });
  });

  describe("integration with centralized handle functions", () => {
    it("should use findOutputHandle for source handle validation", () => {
      const { result } = renderHook(() => useConnectionHandlers());

      const sourceNode = createMockNode("source", "test.node");
      const targetNode = createMockNode("target", "test.node");

      mockFindNode
        .mockReturnValueOnce(sourceNode)
        .mockReturnValueOnce(targetNode);
      mockGetMetadata
        .mockReturnValueOnce(mockNodeMetadata)
        .mockReturnValueOnce(mockNodeMetadata);

      mockFindOutputHandle.mockReturnValue({
        name: "output",
        type: {
          type: "str",
          optional: false,
          values: null,
          type_args: [],
          type_name: null
        },
        stream: false,
        isDynamic: false
      });

      mockFindInputHandle.mockReturnValue({
        name: "input",
        type: {
          type: "str",
          optional: false,
          values: null,
          type_args: [],
          type_name: null
        },
        isDynamic: false
      });

      const connection: Connection = {
        source: "source",
        target: "target",
        sourceHandle: "output",
        targetHandle: "input"
      };

      result.current.handleOnConnect(connection);

      expect(mockFindOutputHandle).toHaveBeenCalledWith(
        sourceNode,
        "output",
        mockNodeMetadata
      );
      expect(mockFindInputHandle).toHaveBeenCalledWith(
        targetNode,
        "input",
        mockNodeMetadata
      );
    });

    it("should handle dynamic outputs through findOutputHandle", () => {
      const { result } = renderHook(() => useConnectionHandlers());

      const sourceNode = createMockNode("source", "test.dynamic");
      const targetNode = createMockNode("target", "test.node");

      mockFindNode
        .mockReturnValueOnce(sourceNode)
        .mockReturnValueOnce(targetNode);
      mockGetMetadata
        .mockReturnValueOnce(mockDynamicNodeMetadata)
        .mockReturnValueOnce(mockNodeMetadata);

      // Mock finding a dynamic output
      mockFindOutputHandle.mockReturnValue({
        name: "dynamic_output",
        type: {
          type: "bool",
          optional: false,
          values: null,
          type_args: [],
          type_name: null
        },
        stream: false,
        isDynamic: true
      });

      mockFindInputHandle.mockReturnValue({
        name: "input",
        type: {
          type: "str",
          optional: false,
          values: null,
          type_args: [],
          type_name: null
        },
        isDynamic: false
      });

      const connection: Connection = {
        source: "source",
        target: "target",
        sourceHandle: "dynamic_output",
        targetHandle: "input"
      };

      result.current.handleOnConnect(connection);

      expect(mockFindOutputHandle).toHaveBeenCalledWith(
        sourceNode,
        "dynamic_output",
        mockDynamicNodeMetadata
      );
      expect(mockOnConnect).toHaveBeenCalledWith({
        ...connection,
        className: "bool"
      });
    });
  });

  describe("onConnectEnd", () => {
    it("auto connects when dropping onto a Preview node body", () => {
      const mockedConnectionStore = useConnectionStore as unknown as jest.Mock & {
        getState?: jest.Mock;
      };
      mockedConnectionStore.getState = jest.fn(() => ({
        connectDirection: "source",
        connectNodeId: "sourceNode",
        connectHandleId: "output",
        connectType: {
          type: "str",
          optional: false,
          values: null,
          type_args: [],
          type_name: null
        }
      }));

      const sourceNode = createMockNode("sourceNode", "test.node");
      const previewNode = createMockNode(
        "previewNode",
        "nodetool.workflows.base_node.Preview"
      );

      mockFindNode.mockImplementation((id: string) => {
        if (id === "sourceNode") {
          return sourceNode;
        }
        if (id === "previewNode") {
          return previewNode;
        }
        return undefined;
      });

      mockGetMetadata.mockImplementation((type: string) => {
        if (type === "nodetool.workflows.base_node.Preview") {
          return previewNodeMetadata;
        }
        return mockNodeMetadata;
      });

      mockFindOutputHandle.mockReturnValue({
        name: "output",
        type: mockNodeMetadata.outputs[0].type,
        stream: false,
        isDynamic: false
      });

      mockFindInputHandle.mockReturnValue({
        name: "value",
        type: previewNodeMetadata.properties[0].type,
        isDynamic: false
      });

      const mockNodeElement = { dataset: { id: "previewNode" } };
      const mockEvent = {
        target: {
          classList: {
            contains: jest.fn(() => false)
          },
          closest: jest.fn((selector: string) =>
            selector === ".react-flow__node" ? mockNodeElement : null
          ),
          parentElement: null
        },
        clientX: 0,
        clientY: 0
      };

      const { result } = renderHook(() => useConnectionHandlers());

      result.current.onConnectEnd(mockEvent as any, {} as any);

      expect(mockOnConnect).toHaveBeenCalledWith({
        source: "sourceNode",
        target: "previewNode",
        sourceHandle: "output",
        targetHandle: "value",
        className: "str"
      });
      expect(mockEndConnecting).toHaveBeenCalled();
    });

    it("auto connects to reroute input when dragging from a source handle", () => {
      const mockedConnectionStore = useConnectionStore as unknown as jest.Mock & {
        getState?: jest.Mock;
      };
      mockedConnectionStore.getState = jest.fn(() => ({
        connectDirection: "source",
        connectNodeId: "sourceNode",
        connectHandleId: "output",
        connectType: {
          type: "str",
          optional: false,
          values: null,
          type_args: [],
          type_name: null
        }
      }));

      const sourceNode = createMockNode("sourceNode", "test.node");
      const rerouteNode = createMockNode(
        "rerouteNode",
        "nodetool.control.Reroute"
      );

      mockFindNode.mockImplementation((id: string) => {
        if (id === "sourceNode") {
          return sourceNode;
        }
        if (id === "rerouteNode") {
          return rerouteNode;
        }
        return undefined;
      });

      mockGetMetadata.mockImplementation((type: string) => {
        if (type === "nodetool.control.Reroute") {
          return rerouteNodeMetadata;
        }
        return mockNodeMetadata;
      });

      mockFindOutputHandle.mockReturnValue({
        name: "output",
        type: mockNodeMetadata.outputs[0].type,
        stream: false,
        isDynamic: false
      });

      mockFindInputHandle.mockReturnValue({
        name: "input_value",
        type: rerouteNodeMetadata.properties[0].type,
        isDynamic: false
      });

      const mockNodeElement = { dataset: { id: "rerouteNode" } };
      const mockEvent = {
        target: {
          classList: {
            contains: jest.fn(() => false)
          },
          closest: jest.fn((selector: string) =>
            selector === ".react-flow__node" ? mockNodeElement : null
          ),
          parentElement: null
        },
        clientX: 0,
        clientY: 0
      };

      const { result } = renderHook(() => useConnectionHandlers());

      result.current.onConnectEnd(mockEvent as any, {} as any);

      expect(mockOnConnect).toHaveBeenCalledWith({
        source: "sourceNode",
        target: "rerouteNode",
        sourceHandle: "output",
        targetHandle: "input_value",
        className: "str"
      });
      expect(mockEndConnecting).toHaveBeenCalled();
    });

    it("auto connects from reroute output when dragging towards an input handle", () => {
      const mockedConnectionStore = useConnectionStore as unknown as jest.Mock & {
        getState?: jest.Mock;
      };
      mockedConnectionStore.getState = jest.fn(() => ({
        connectDirection: "target",
        connectNodeId: "targetNode",
        connectHandleId: "input",
        connectType: {
          type: "str",
          optional: false,
          values: null,
          type_args: [],
          type_name: null
        }
      }));

      const rerouteNode = createMockNode(
        "rerouteNode",
        "nodetool.control.Reroute"
      );
      const targetNode = createMockNode("targetNode", "test.node");

      mockFindNode.mockImplementation((id: string) => {
        if (id === "rerouteNode") {
          return rerouteNode;
        }
        if (id === "targetNode") {
          return targetNode;
        }
        return undefined;
      });

      mockGetMetadata.mockImplementation((type: string) => {
        if (type === "nodetool.control.Reroute") {
          return rerouteNodeMetadata;
        }
        return mockNodeMetadata;
      });

      mockFindOutputHandle.mockReturnValue({
        name: "output",
        type: rerouteNodeMetadata.outputs[0].type,
        stream: false,
        isDynamic: false
      });

      mockFindInputHandle.mockReturnValue({
        name: "input",
        type: mockNodeMetadata.properties[0].type,
        isDynamic: false
      });

      const mockNodeElement = { dataset: { id: "rerouteNode" } };
      const mockEvent = {
        target: {
          classList: {
            contains: jest.fn(() => false)
          },
          closest: jest.fn((selector: string) =>
            selector === ".react-flow__node" ? mockNodeElement : null
          ),
          parentElement: null
        },
        clientX: 0,
        clientY: 0
      };

      const { result } = renderHook(() => useConnectionHandlers());

      result.current.onConnectEnd(mockEvent as any, {} as any);

      expect(mockOnConnect).toHaveBeenCalledWith({
        source: "rerouteNode",
        target: "targetNode",
        sourceHandle: "output",
        targetHandle: "input",
        className: "str"
      });
      expect(mockEndConnecting).toHaveBeenCalled();
    });

    it("opens selection menu when multiple compatible inputs exist", () => {
      const mockedConnectionStore = useConnectionStore as unknown as jest.Mock & {
        getState?: jest.Mock;
      };
      mockedConnectionStore.getState = jest.fn(() => ({
        connectDirection: "source",
        connectNodeId: "sourceNode",
        connectHandleId: "output",
        connectType: {
          type: "str",
          optional: false,
          values: null,
          type_args: [],
          type_name: null
        }
      }));

      const sourceNode = createMockNode("sourceNode", "test.node");
      const targetNode = createMockNode("targetNode", "test.node");

      mockFindNode.mockImplementation((id: string) => {
        if (id === "sourceNode") {
          return sourceNode;
        }
        if (id === "targetNode") {
          return targetNode;
        }
        return undefined;
      });

      const multiInputMetadata: NodeMetadata = {
        ...mockNodeMetadata,
        properties: [
          ...mockNodeMetadata.properties,
          {
            ...mockNodeMetadata.properties[0],
            name: "input_two",
            title: "Input Two"
          }
        ]
      };

      mockGetMetadata.mockImplementation(() => multiInputMetadata);

      mockFindOutputHandle.mockReturnValue({
        name: "output",
        type: mockNodeMetadata.outputs[0].type,
        stream: false,
        isDynamic: false
      });

      mockFindInputHandle.mockReturnValue({
        name: "input",
        type: mockNodeMetadata.properties[0].type,
        isDynamic: false
      });

      const mockNodeElement = { dataset: { id: "targetNode" } };
      const mockEvent = {
        target: {
          classList: {
            contains: jest.fn(() => false)
          },
          closest: jest.fn((selector: string) =>
            selector === ".react-flow__node" ? mockNodeElement : null
          ),
          parentElement: null
        },
        clientX: 0,
        clientY: 0
      };

      const { result } = renderHook(() => useConnectionHandlers());

      result.current.onConnectEnd(mockEvent as any, {} as any);

      expect(mockOnConnect).not.toHaveBeenCalled();
      expect(mockOpenContextMenu).toHaveBeenCalledTimes(1);
      expect(mockOpenContextMenu.mock.calls[0][0]).toBe(
        "connection-match-menu"
      );
      const payload = mockOpenContextMenu.mock.calls[0][9];
      expect(payload.options).toHaveLength(2);
    });

    it("opens selection menu when multiple compatible outputs exist", () => {
      const mockedConnectionStore = useConnectionStore as unknown as jest.Mock & {
        getState?: jest.Mock;
      };
      mockedConnectionStore.getState = jest.fn(() => ({
        connectDirection: "target",
        connectNodeId: "targetNode",
        connectHandleId: "input",
        connectType: {
          type: "str",
          optional: false,
          values: null,
          type_args: [],
          type_name: null
        }
      }));

      const sourceNode = createMockNode("sourceNode", "test.node");
      const targetNode = createMockNode("targetNode", "test.node");

      mockFindNode.mockImplementation((id: string) => {
        if (id === "sourceNode") {
          return sourceNode;
        }
        if (id === "targetNode") {
          return targetNode;
        }
        return undefined;
      });

      const multiOutputMetadata: NodeMetadata = {
        ...mockNodeMetadata,
        outputs: [
          ...mockNodeMetadata.outputs,
          {
            ...mockNodeMetadata.outputs[0],
            name: "output_two"
          }
        ]
      };

      mockGetMetadata.mockImplementation(() => multiOutputMetadata);

      mockFindOutputHandle.mockReturnValue({
        name: "output",
        type: mockNodeMetadata.outputs[0].type,
        stream: false,
        isDynamic: false
      });

      mockFindInputHandle.mockReturnValue({
        name: "input",
        type: mockNodeMetadata.properties[0].type,
        isDynamic: false
      });

      const mockNodeElement = { dataset: { id: "sourceNode" } };
      const mockEvent = {
        target: {
          classList: {
            contains: jest.fn(() => false)
          },
          closest: jest.fn((selector: string) =>
            selector === ".react-flow__node" ? mockNodeElement : null
          ),
          parentElement: null
        },
        clientX: 0,
        clientY: 0
      };

      const { result } = renderHook(() => useConnectionHandlers());

      result.current.onConnectEnd(mockEvent as any, {} as any);

      expect(mockOnConnect).not.toHaveBeenCalled();
      expect(mockOpenContextMenu).toHaveBeenCalledTimes(1);
      expect(mockOpenContextMenu.mock.calls[0][0]).toBe(
        "connection-match-menu"
      );
      const payload = mockOpenContextMenu.mock.calls[0][9];
      expect(payload.options).toHaveLength(2);
    });

    it("generates unique key when connecting second node of same type to dynamic output node", () => {
      const mockedConnectionStore = useConnectionStore as unknown as jest.Mock & {
        getState?: jest.Mock;
      };
      mockedConnectionStore.getState = jest.fn(() => ({
        connectDirection: "target",
        connectNodeId: "inputNode",
        connectHandleId: "input",
        connectType: {
          type: "str",
          optional: false,
          values: null,
          type_args: [],
          type_name: null
        }
      }));

      // inputNode has type "test.node", so the base key would be "node"
      const inputNode = createMockNode("inputNode", "test.node");
      // dynamicNode already has a dynamic output keyed "node"
      const dynamicNode = {
        ...createMockNode("dynamicNode", "test.dynamic"),
        data: {
          ...createMockNode("dynamicNode", "test.dynamic").data,
          dynamic_outputs: {
            node: {
              type: "str",
              optional: false,
              type_args: [],
              type_name: ""
            }
          }
        }
      };

      mockFindNode.mockImplementation((id: string) => {
        if (id === "inputNode") {
          return inputNode;
        }
        if (id === "dynamicNode") {
          return dynamicNode;
        }
        return undefined;
      });

      mockGetMetadata.mockImplementation((type: string) => {
        if (type === "test.dynamic") {
          return mockDynamicNodeMetadata;
        }
        return mockNodeMetadata;
      });

      const mockNodeElement = { dataset: { id: "dynamicNode" } };
      const mockEvent = {
        target: {
          classList: {
            contains: jest.fn(() => false)
          },
          closest: jest.fn((selector: string) =>
            selector === ".react-flow__node" ? mockNodeElement : null
          ),
          parentElement: null
        },
        clientX: 0,
        clientY: 0
      };

      const { result } = renderHook(() => useConnectionHandlers());

      result.current.onConnectEnd(mockEvent as any, {} as any);

      // updateNodeData should be called with key "node_1" (not "node" which already exists)
      expect(mockUpdateNodeData).toHaveBeenCalledWith("dynamicNode", {
        dynamic_outputs: {
          node: expect.any(Object),
          node_1: {
            type: "str",
            optional: false,
            type_args: [],
            type_name: ""
          }
        }
      });
      // The connection should use the unique key "node_1"
      expect(mockOnConnect).toHaveBeenCalledWith({
        source: "dynamicNode",
        sourceHandle: "node_1",
        target: "inputNode",
        targetHandle: "input",
        className: "str"
      });
    });
  });
});
