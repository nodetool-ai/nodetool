import { renderHook } from "@testing-library/react";
import useSelectedNodesInfo from "../useSelectedNodesInfo";
import { useNodes } from "../../contexts/NodeContext";
import { useEdges } from "@xyflow/react";
import useMetadataStore from "../../stores/MetadataStore";
import useResultsStore from "../../stores/ResultsStore";
import useErrorStore from "../../stores/ErrorStore";
import { NodeData } from "../../stores/NodeData";

// Mock all dependencies
jest.mock("../../contexts/NodeContext", () => ({
  useNodes: jest.fn()
}));

jest.mock("@xyflow/react", () => ({
  useEdges: jest.fn(),
  Position: {
    Left: "left",
    Right: "right",
    Top: "top",
    Bottom: "bottom"
  }
}));

jest.mock("../../stores/MetadataStore", () => ({
  __esModule: true,
  default: jest.fn()
}));

jest.mock("../../stores/ResultsStore", () => ({
  __esModule: true,
  default: jest.fn()
}));

jest.mock("../../stores/ErrorStore", () => ({
  __esModule: true,
  default: jest.fn()
}));

const mockUseNodes = useNodes as jest.MockedFunction<typeof useNodes>;
const mockUseEdges = useEdges as jest.MockedFunction<typeof useEdges>;
const mockUseMetadataStore = useMetadataStore as jest.MockedFunction<typeof useMetadataStore>;
const mockUseResultsStore = useResultsStore as jest.MockedFunction<typeof useResultsStore>;
const mockUseErrorStore = useErrorStore as jest.MockedFunction<typeof useErrorStore>;

interface MockNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: NodeData;
}

const createMockNode = (
  id: string,
  type = "test.Node",
  position = { x: 0, y: 0 },
  properties: Record<string, unknown> = {}
): MockNode => ({
  id,
  type,
  position,
  data: {
    properties,
    dynamic_properties: {},
    selectable: true,
    workflow_id: "test-workflow"
  }
});

describe("useSelectedNodesInfo", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default mocks
    mockUseNodes.mockImplementation((selector: any) => {
      const state = {
        getSelectedNodes: () => [],
        workflow: { id: "workflow-1" }
      };
      return selector(state);
    });

    mockUseEdges.mockReturnValue([]);

    mockUseMetadataStore.mockImplementation((selector: any) => {
      const state = {
        getMetadata: () => undefined
      };
      return selector(state);
    });

    mockUseResultsStore.mockImplementation((selector: any) => {
      return selector({ results: {} });
    });

    mockUseErrorStore.mockImplementation((selector: any) => {
      return selector({ errors: {} });
    });
  });

  describe("empty selection", () => {
    it("returns empty nodesInfo when no nodes are selected", () => {
      const { result } = renderHook(() => useSelectedNodesInfo());

      expect(result.current.nodesInfo).toEqual([]);
      expect(result.current.totalSelected).toBe(0);
      expect(result.current.hasSingleNode).toBe(false);
      expect(result.current.hasMultipleNodes).toBe(false);
    });
  });

  describe("single node selection", () => {
    it("returns correct info for a single selected node", () => {
      const selectedNode = createMockNode("node-1", "test.TextNode", { x: 100, y: 200 });

      mockUseNodes.mockImplementation((selector: any) => {
        const state = {
          getSelectedNodes: () => [selectedNode],
          workflow: { id: "workflow-1" }
        };
        return selector(state);
      });

      mockUseMetadataStore.mockImplementation((selector: any) => {
        const state = {
          getMetadata: (nodeType: string) => {
            if (nodeType === "test.TextNode") {
              return {
                title: "Text Node",
                namespace: "test",
                description: "A text processing node",
                properties: [{ name: "input" }],
                outputs: [{ name: "output" }]
              };
            }
            return undefined;
          }
        };
        return selector(state);
      });

      const { result } = renderHook(() => useSelectedNodesInfo());

      expect(result.current.totalSelected).toBe(1);
      expect(result.current.hasSingleNode).toBe(true);
      expect(result.current.hasMultipleNodes).toBe(false);
      expect(result.current.nodesInfo).toHaveLength(1);

      const nodeInfo = result.current.nodesInfo[0];
      expect(nodeInfo.id).toBe("node-1");
      expect(nodeInfo.type).toBe("test.TextNode");
      expect(nodeInfo.label).toBe("Text Node");
      expect(nodeInfo.namespace).toBe("test");
      expect(nodeInfo.description).toBe("A text processing node");
      expect(nodeInfo.position).toEqual({ x: 100, y: 200 });
    });

    it("uses property name as label when available", () => {
      const selectedNode = createMockNode(
        "node-1",
        "test.Node",
        { x: 0, y: 0 },
        { name: "Custom Node Name" }
      );

      mockUseNodes.mockImplementation((selector: any) => {
        const state = {
          getSelectedNodes: () => [selectedNode],
          workflow: { id: "workflow-1" }
        };
        return selector(state);
      });

      const { result } = renderHook(() => useSelectedNodesInfo());

      expect(result.current.nodesInfo[0].label).toBe("Custom Node Name");
    });

    it("falls back to node type for label when no metadata", () => {
      const selectedNode = createMockNode("node-1", "test.UnknownNode");

      mockUseNodes.mockImplementation((selector: any) => {
        const state = {
          getSelectedNodes: () => [selectedNode],
          workflow: { id: "workflow-1" }
        };
        return selector(state);
      });

      const { result } = renderHook(() => useSelectedNodesInfo());

      expect(result.current.nodesInfo[0].label).toBe("UnknownNode");
    });
  });

  describe("multiple node selection", () => {
    it("returns correct info for multiple selected nodes", () => {
      const selectedNodes = [
        createMockNode("node-1", "test.NodeA", { x: 0, y: 0 }),
        createMockNode("node-2", "test.NodeB", { x: 100, y: 100 }),
        createMockNode("node-3", "test.NodeC", { x: 200, y: 200 })
      ];

      mockUseNodes.mockImplementation((selector: any) => {
        const state = {
          getSelectedNodes: () => selectedNodes,
          workflow: { id: "workflow-1" }
        };
        return selector(state);
      });

      const { result } = renderHook(() => useSelectedNodesInfo());

      expect(result.current.totalSelected).toBe(3);
      expect(result.current.hasSingleNode).toBe(false);
      expect(result.current.hasMultipleNodes).toBe(true);
      expect(result.current.nodesInfo).toHaveLength(3);
    });
  });

  describe("connection counting", () => {
    it("counts connected inputs and outputs", () => {
      const selectedNode = createMockNode("node-2", "test.Node");

      mockUseNodes.mockImplementation((selector: any) => {
        const state = {
          getSelectedNodes: () => [selectedNode],
          workflow: { id: "workflow-1" }
        };
        return selector(state);
      });

      mockUseEdges.mockReturnValue([
        { id: "e1", source: "node-1", target: "node-2", sourceHandle: "out", targetHandle: "in1" },
        { id: "e2", source: "node-1", target: "node-2", sourceHandle: "out", targetHandle: "in2" },
        { id: "e3", source: "node-2", target: "node-3", sourceHandle: "out1", targetHandle: "in" }
      ]);

      mockUseMetadataStore.mockImplementation((selector: any) => {
        const state = {
          getMetadata: () => ({
            title: "Node",
            namespace: "test",
            properties: [{ name: "in1" }, { name: "in2" }, { name: "in3" }],
            outputs: [{ name: "out1" }, { name: "out2" }]
          })
        };
        return selector(state);
      });

      const { result } = renderHook(() => useSelectedNodesInfo());

      const nodeInfo = result.current.nodesInfo[0];
      expect(nodeInfo.connections.connectedInputs).toBe(2);
      expect(nodeInfo.connections.connectedOutputs).toBe(1);
      expect(nodeInfo.connections.totalInputs).toBe(3);
      expect(nodeInfo.connections.totalOutputs).toBe(2);
    });
  });

  describe("execution status", () => {
    it("shows completed status when node has results", () => {
      const selectedNode = createMockNode("node-1", "test.Node");

      mockUseNodes.mockImplementation((selector: any) => {
        const state = {
          getSelectedNodes: () => [selectedNode],
          workflow: { id: "workflow-1" }
        };
        return selector(state);
      });

      mockUseResultsStore.mockImplementation((selector: any) => {
        return selector({
          results: {
            "node-1": { output: "result data", timestamp: "2024-01-01T00:00:00Z" }
          }
        });
      });

      const { result } = renderHook(() => useSelectedNodesInfo());

      expect(result.current.nodesInfo[0].executionStatus).toBe("completed");
      expect(result.current.nodesInfo[0].lastExecutedAt).toBe("2024-01-01T00:00:00Z");
    });

    it("shows error status when node has errors", () => {
      const selectedNode = createMockNode("node-1", "test.Node");

      mockUseNodes.mockImplementation((selector: any) => {
        const state = {
          getSelectedNodes: () => [selectedNode],
          workflow: { id: "workflow-1" }
        };
        return selector(state);
      });

      mockUseErrorStore.mockImplementation((selector: any) => {
        return selector({
          errors: {
            "workflow-1:node-1": { message: "Something went wrong" }
          }
        });
      });

      const { result } = renderHook(() => useSelectedNodesInfo());

      expect(result.current.nodesInfo[0].executionStatus).toBe("error");
      expect(result.current.nodesInfo[0].hasError).toBe(true);
      expect(result.current.nodesInfo[0].errorMessage).toBe("Something went wrong");
    });

    it("shows undefined status when no results or errors", () => {
      const selectedNode = createMockNode("node-1", "test.Node");

      mockUseNodes.mockImplementation((selector: any) => {
        const state = {
          getSelectedNodes: () => [selectedNode],
          workflow: { id: "workflow-1" }
        };
        return selector(state);
      });

      const { result } = renderHook(() => useSelectedNodesInfo());

      expect(result.current.nodesInfo[0].executionStatus).toBeUndefined();
      expect(result.current.nodesInfo[0].hasError).toBe(false);
    });

    it("handles string error format", () => {
      const selectedNode = createMockNode("node-1", "test.Node");

      mockUseNodes.mockImplementation((selector: any) => {
        const state = {
          getSelectedNodes: () => [selectedNode],
          workflow: { id: "workflow-1" }
        };
        return selector(state);
      });

      mockUseErrorStore.mockImplementation((selector: any) => {
        return selector({
          errors: {
            "workflow-1:node-1": "String error message"
          }
        });
      });

      const { result } = renderHook(() => useSelectedNodesInfo());

      expect(result.current.nodesInfo[0].errorMessage).toBe("String error message");
    });
  });

  describe("edge cases", () => {
    it("handles node with undefined type", () => {
      const selectedNode = {
        id: "node-1",
        type: undefined,
        position: { x: 0, y: 0 },
        data: {
          properties: {},
          dynamic_properties: {},
          selectable: true,
          workflow_id: "test-workflow"
        }
      } as any;

      mockUseNodes.mockImplementation((selector: any) => {
        const state = {
          getSelectedNodes: () => [selectedNode],
          workflow: { id: "workflow-1" }
        };
        return selector(state);
      });

      const { result } = renderHook(() => useSelectedNodesInfo());

      expect(result.current.nodesInfo[0].type).toBe("unknown");
    });

    it("handles empty workflow id", () => {
      const selectedNode = createMockNode("node-1", "test.Node");

      mockUseNodes.mockImplementation((selector: any) => {
        const state = {
          getSelectedNodes: () => [selectedNode],
          workflow: null
        };
        return selector(state);
      });

      mockUseErrorStore.mockImplementation((selector: any) => {
        return selector({
          errors: {
            ":node-1": "Error without workflow"
          }
        });
      });

      const { result } = renderHook(() => useSelectedNodesInfo());

      // Should not crash and should not find errors
      expect(result.current.nodesInfo[0].hasError).toBe(false);
    });
  });
});
