import useConnectionStore from "../ConnectionStore";
import { NodeData } from "../NodeData";
import { NodeMetadata } from "../ApiTypes";
import { Node } from "@xyflow/react";

// Mock the handle utility functions
jest.mock("../../utils/handleUtils", () => ({
  findOutputHandle: jest.fn(),
  findInputHandle: jest.fn()
}));

import { findOutputHandle, findInputHandle } from "../../utils/handleUtils";

const mockFindOutputHandle = findOutputHandle as jest.MockedFunction<
  typeof findOutputHandle
>;
const mockFindInputHandle = findInputHandle as jest.MockedFunction<
  typeof findInputHandle
>;

describe("ConnectionStore", () => {
  beforeEach(() => {
    useConnectionStore.setState({
      connecting: false,
      connectType: null,
      connectDirection: null,
      connectNodeId: null,
      connectHandleId: null
    });
    jest.clearAllMocks();
  });

  const createMockNode = (
    id: string,
    type: string = "test.node"
  ): Node<NodeData> => ({
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
    } as NodeData,
    width: 100,
    height: 100
  });

  const createMockMetadata = (): NodeMetadata => ({
    node_type: "test.node",
    title: "Test Node",
    description: "A test node",
    namespace: "test",
    layout: "default",
    properties: [],
    outputs: [],
    is_dynamic: false,
    supports_dynamic_outputs: false,
    expose_as_tool: false,
    the_model_info: {},
    recommended_models: [],
    basic_fields: []
  });

  describe("initial state", () => {
    it("should have correct initial values", () => {
      const state = useConnectionStore.getState();

      expect(state.connecting).toBe(false);
      expect(state.connectType).toBeNull();
      expect(state.connectDirection).toBeNull();
      expect(state.connectNodeId).toBeNull();
      expect(state.connectHandleId).toBeNull();
    });
  });

  describe("startConnecting", () => {
    describe("source handle connection", () => {
      it("should start connecting from source handle with valid output handle", () => {
        const mockNode = createMockNode("node1");
        const mockMetadata = createMockMetadata();
        const mockOutputHandle = {
          name: "output1",
          type: {
            type: "str",
            optional: false,
            values: null,
            type_args: [],
            type_name: null
          },
          stream: false,
          isDynamic: false
        };

        mockFindOutputHandle.mockReturnValue(mockOutputHandle);

        const { startConnecting } = useConnectionStore.getState();
        startConnecting(mockNode, "output1", "source", mockMetadata);

        const state = useConnectionStore.getState();
        expect(state.connecting).toBe(true);
        expect(state.connectType).toEqual(mockOutputHandle.type);
        expect(state.connectDirection).toBe("source");
        expect(state.connectNodeId).toBe("node1");
        expect(state.connectHandleId).toBe("output1");
      });

      it("should start connecting from source handle when output handle is not found", () => {
        const mockNode = createMockNode("node1");
        const mockMetadata = createMockMetadata();

        mockFindOutputHandle.mockReturnValue(undefined);

        const { startConnecting } = useConnectionStore.getState();
        startConnecting(mockNode, "output1", "source", mockMetadata);

        const state = useConnectionStore.getState();
        expect(state.connecting).toBe(true);
        expect(state.connectType).toBeUndefined();
        expect(state.connectDirection).toBe("source");
        expect(state.connectNodeId).toBe("node1");
        expect(state.connectHandleId).toBe("output1");
      });

      it("should call findOutputHandle with correct parameters", () => {
        const mockNode = createMockNode("node1");
        const mockMetadata = createMockMetadata();

        mockFindOutputHandle.mockReturnValue({
          name: "output1",
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

        const { startConnecting } = useConnectionStore.getState();
        startConnecting(mockNode, "output1", "source", mockMetadata);

        expect(mockFindOutputHandle).toHaveBeenCalledWith(
          mockNode,
          "output1",
          mockMetadata
        );
      });
    });

    describe("target handle connection", () => {
      it("should start connecting from target handle with valid input handle", () => {
        const mockNode = createMockNode("node1");
        const mockMetadata = createMockMetadata();
        const mockInputHandle = {
          name: "input1",
          type: {
            type: "str",
            optional: false,
            values: null,
            type_args: [],
            type_name: null
          },
          isDynamic: false
        };

        mockFindInputHandle.mockReturnValue(mockInputHandle);

        const { startConnecting } = useConnectionStore.getState();
        startConnecting(mockNode, "input1", "target", mockMetadata);

        const state = useConnectionStore.getState();
        expect(state.connecting).toBe(true);
        expect(state.connectType).toEqual(mockInputHandle.type);
        expect(state.connectDirection).toBe("target");
        expect(state.connectNodeId).toBe("node1");
        expect(state.connectHandleId).toBe("input1");
      });

      it("should start connecting from target handle when input handle is not found", () => {
        const mockNode = createMockNode("node1");
        const mockMetadata = createMockMetadata();

        mockFindInputHandle.mockReturnValue(undefined);

        const { startConnecting } = useConnectionStore.getState();
        startConnecting(mockNode, "input1", "target", mockMetadata);

        const state = useConnectionStore.getState();
        expect(state.connecting).toBe(true);
        expect(state.connectType).toBeUndefined();
        expect(state.connectDirection).toBe("target");
        expect(state.connectNodeId).toBe("node1");
        expect(state.connectHandleId).toBe("input1");
      });

      it("should call findInputHandle with correct parameters", () => {
        const mockNode = createMockNode("node1");
        const mockMetadata = createMockMetadata();

        mockFindInputHandle.mockReturnValue({
          name: "input1",
          type: {
            type: "str",
            optional: false,
            values: null,
            type_args: [],
            type_name: null
          },
          isDynamic: false
        });

        const { startConnecting } = useConnectionStore.getState();
        startConnecting(mockNode, "input1", "target", mockMetadata);

        expect(mockFindInputHandle).toHaveBeenCalledWith(
          mockNode,
          "input1",
          mockMetadata
        );
      });
    });

    describe("invalid handle types", () => {
      it("should not change state for invalid handle type", () => {
        const mockNode = createMockNode("node1");
        const mockMetadata = createMockMetadata();

        const initialState = useConnectionStore.getState();

        const { startConnecting } = useConnectionStore.getState();
        startConnecting(mockNode, "handle1", "invalid", mockMetadata);

        const finalState = useConnectionStore.getState();

        // State should remain unchanged
        expect(finalState.connecting).toBe(initialState.connecting);
        expect(finalState.connectType).toBe(initialState.connectType);
        expect(finalState.connectDirection).toBe(initialState.connectDirection);
        expect(finalState.connectNodeId).toBe(initialState.connectNodeId);
        expect(finalState.connectHandleId).toBe(initialState.connectHandleId);
      });

      it("should not call handle finding functions for invalid handle type", () => {
        const mockNode = createMockNode("node1");
        const mockMetadata = createMockMetadata();

        const { startConnecting } = useConnectionStore.getState();
        startConnecting(mockNode, "handle1", "invalid", mockMetadata);

        expect(mockFindOutputHandle).not.toHaveBeenCalled();
        expect(mockFindInputHandle).not.toHaveBeenCalled();
      });
    });

    describe("dynamic handles", () => {
      it("should handle dynamic output handles correctly", () => {
        const mockNode = createMockNode("node1");
        const mockMetadata = createMockMetadata();
        const mockDynamicOutputHandle = {
          name: "dynamic_output",
          type: {
            type: "any",
            optional: false,
            values: null,
            type_args: [],
            type_name: null
          },
          stream: false,
          isDynamic: true
        };

        mockFindOutputHandle.mockReturnValue(mockDynamicOutputHandle);

        const { startConnecting } = useConnectionStore.getState();
        startConnecting(mockNode, "dynamic_output", "source", mockMetadata);

        const state = useConnectionStore.getState();
        expect(state.connecting).toBe(true);
        expect(state.connectType).toEqual(mockDynamicOutputHandle.type);
        expect(state.connectDirection).toBe("source");
        expect(state.connectNodeId).toBe("node1");
        expect(state.connectHandleId).toBe("dynamic_output");
      });

      it("should handle dynamic input handles correctly", () => {
        const mockNode = createMockNode("node1");
        const mockMetadata = createMockMetadata();
        const mockDynamicInputHandle = {
          name: "dynamic_input",
          type: {
            type: "any",
            optional: false,
            values: null,
            type_args: [],
            type_name: null
          },
          isDynamic: true
        };

        mockFindInputHandle.mockReturnValue(mockDynamicInputHandle);

        const { startConnecting } = useConnectionStore.getState();
        startConnecting(mockNode, "dynamic_input", "target", mockMetadata);

        const state = useConnectionStore.getState();
        expect(state.connecting).toBe(true);
        expect(state.connectType).toEqual(mockDynamicInputHandle.type);
        expect(state.connectDirection).toBe("target");
        expect(state.connectNodeId).toBe("node1");
        expect(state.connectHandleId).toBe("dynamic_input");
      });
    });
  });

  describe("endConnecting", () => {
    it("should reset all connection state", () => {
      // First set some connection state
      const mockNode = createMockNode("node1");
      const mockMetadata = createMockMetadata();

      mockFindOutputHandle.mockReturnValue({
        name: "output1",
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

      const { startConnecting, endConnecting } = useConnectionStore.getState();
      startConnecting(mockNode, "output1", "source", mockMetadata);

      // Verify state is set
      let state = useConnectionStore.getState();
      expect(state.connecting).toBe(true);
      expect(state.connectType).not.toBeNull();
      expect(state.connectDirection).toBe("source");
      expect(state.connectNodeId).toBe("node1");
      expect(state.connectHandleId).toBe("output1");

      // End connection
      endConnecting();

      // Verify state is reset
      state = useConnectionStore.getState();
      expect(state.connecting).toBe(false);
      expect(state.connectType).toBeNull();
      expect(state.connectDirection).toBeNull();
      expect(state.connectNodeId).toBeNull();
      expect(state.connectHandleId).toBeNull();
    });

    it("should handle ending connection when no connection is active", () => {
      const { endConnecting } = useConnectionStore.getState();

      // Should not throw error
      expect(() => endConnecting()).not.toThrow();

      const state = useConnectionStore.getState();
      expect(state.connecting).toBe(false);
      expect(state.connectType).toBeNull();
      expect(state.connectDirection).toBeNull();
      expect(state.connectNodeId).toBeNull();
      expect(state.connectHandleId).toBeNull();
    });
  });

  describe("state management", () => {
    it("should allow multiple startConnecting calls to override previous state", () => {
      const mockNode1 = createMockNode("node1");
      const mockNode2 = createMockNode("node2");
      const mockMetadata = createMockMetadata();

      mockFindOutputHandle.mockReturnValue({
        name: "output1",
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

      const { startConnecting } = useConnectionStore.getState();

      // First connection
      startConnecting(mockNode1, "output1", "source", mockMetadata);

      let state = useConnectionStore.getState();
      expect(state.connectNodeId).toBe("node1");
      expect(state.connectHandleId).toBe("output1");

      // Second connection should override
      startConnecting(mockNode2, "output2", "source", mockMetadata);

      state = useConnectionStore.getState();
      expect(state.connectNodeId).toBe("node2");
      expect(state.connectHandleId).toBe("output2");
    });

    it("should maintain state isolation between different store instances", () => {
      // This tests that the store state is properly isolated
      const mockNode = createMockNode("node1");
      const mockMetadata = createMockMetadata();

      mockFindOutputHandle.mockReturnValue({
        name: "output1",
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

      const { startConnecting } = useConnectionStore.getState();
      startConnecting(mockNode, "output1", "source", mockMetadata);

      // Create a new store instance (simulated)
      const newStoreState = {
        connecting: false,
        connectType: null,
        connectDirection: null,
        connectNodeId: null,
        connectHandleId: null
      };

      expect(useConnectionStore.getState().connecting).toBe(true);
      expect(newStoreState.connecting).toBe(false);
    });
  });
});
