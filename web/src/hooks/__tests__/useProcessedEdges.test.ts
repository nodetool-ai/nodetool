import { renderHook } from "@testing-library/react";
import { useProcessedEdges } from "../useProcessedEdges";
import { Edge, Node, Position } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";

describe("useProcessedEdges", () => {
  const createMockNode = (id: string, type: string = "test"): Node<NodeData> => ({
    id,
    type,
    position: { x: 0, y: 0 },
    targetPosition: Position.Left,
    sourcePosition: Position.Right,
    data: {
      properties: {},
      dynamic_properties: {},
      dynamic_outputs: {},
      selectable: true,
      workflow_id: "test"
    }
  });

  const createMockEdge = (id: string, source: string, target: string): Edge => ({
    id,
    source,
    target,
    sourceHandle: null,
    targetHandle: null,
    type: "default",
    animated: false,
    style: {},
    markerEnd: { type: "arrowclosed" }
  });

  const mockGetMetadata = (_nodeType: string) => undefined;

  const createWrapper = () => {
    return ({ children }: { children: React.ReactNode }) => children;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("initial state", () => {
    it("returns empty processed edges for empty input", () => {
      const { result } = renderHook(
        () => useProcessedEdges({
          edges: [],
          nodes: [],
          dataTypes: [],
          getMetadata: mockGetMetadata
        }),
        { wrapper: createWrapper() }
      );
      
      expect(result.current.processedEdges).toEqual([]);
      expect(result.current.activeGradientKeys.size).toBe(0);
    });

    it("returns empty gradient keys initially", () => {
      const { result } = renderHook(
        () => useProcessedEdges({
          edges: [],
          nodes: [],
          dataTypes: [],
          getMetadata: mockGetMetadata
        }),
        { wrapper: createWrapper() }
      );
      
      expect(result.current.activeGradientKeys).toBeInstanceOf(Set);
      expect(result.current.activeGradientKeys.size).toBe(0);
    });
  });

  describe("edge processing", () => {
    it("processes edges with default styling", () => {
      const edges = [createMockEdge("e1", "source1", "target1")];
      const nodes = [createMockNode("source1"), createMockNode("target1")];
      
      const { result } = renderHook(
        () => useProcessedEdges({
          edges,
          nodes,
          dataTypes: [],
          getMetadata: mockGetMetadata
        }),
        { wrapper: createWrapper() }
      );
      
      expect(result.current.processedEdges).toHaveLength(1);
      const edge = result.current.processedEdges[0];
      expect(edge).toBeDefined();
      expect(edge?.style).toBeDefined();
      expect(edge?.style?.strokeWidth).toBe(2);
    });

    it("adds 'any' class when no metadata available", () => {
      const edges = [createMockEdge("e1", "source1", "target1")];
      const nodes = [createMockNode("source1"), createMockNode("target1")];
      
      const { result } = renderHook(
        () => useProcessedEdges({
          edges,
          nodes,
          dataTypes: [],
          getMetadata: mockGetMetadata
        }),
        { wrapper: createWrapper() }
      );
      
      expect(result.current.processedEdges[0]?.className).toContain("any");
    });
  });

  describe("status tracking", () => {
    it("adds status data to edges", () => {
      const edges = [createMockEdge("e1", "source1", "target1")];
      const nodes = [createMockNode("source1"), createMockNode("target1")];
      
      const { result } = renderHook(
        () => useProcessedEdges({
          edges,
          nodes,
          dataTypes: [],
          getMetadata: mockGetMetadata,
          workflowId: "workflow-1",
          edgeStatuses: { "workflow-1:e1": { status: "message_sent", counter: 5 } }
        }),
        { wrapper: createWrapper() }
      );
      
      const processedEdge = result.current.processedEdges[0];
      expect(processedEdge).toBeDefined();
      expect(processedEdge?.data).toBeDefined();
      if (processedEdge?.data) {
        expect(processedEdge.data.status).toBe("message_sent");
        expect(processedEdge.data.counter).toBe(5);
      }
    });

    it("adds message-sent class for message_sent status", () => {
      const edges = [createMockEdge("e1", "source1", "target1")];
      const nodes = [createMockNode("source1"), createMockNode("target1")];
      
      const { result } = renderHook(
        () => useProcessedEdges({
          edges,
          nodes,
          dataTypes: [],
          getMetadata: mockGetMetadata,
          workflowId: "workflow-1",
          edgeStatuses: { "workflow-1:e1": { status: "message_sent", counter: 3 } }
        }),
        { wrapper: createWrapper() }
      );
      
      const processedEdge = result.current.processedEdges[0];
      expect(processedEdge).toBeDefined();
      expect(processedEdge?.className).toContain("message-sent");
    });

    it("displays counter as edge label", () => {
      const edges = [createMockEdge("e1", "source1", "target1")];
      const nodes = [createMockNode("source1"), createMockNode("target1")];
      
      const { result } = renderHook(
        () => useProcessedEdges({
          edges,
          nodes,
          dataTypes: [],
          getMetadata: mockGetMetadata,
          workflowId: "workflow-1",
          edgeStatuses: { "workflow-1:e1": { status: "message_sent", counter: 10 } }
        }),
        { wrapper: createWrapper() }
      );
      
      const processedEdge = result.current.processedEdges[0];
      expect(processedEdge).toBeDefined();
      expect(processedEdge?.label).toBe("10");
    });
  });

  describe("bypassed node handling", () => {
    it("adds from-bypassed class when source node is bypassed", () => {
      const bypassedNode = createMockNode("source1");
      bypassedNode.data.bypassed = true;
      
      const edges = [createMockEdge("e1", "source1", "target1")];
      const nodes = [bypassedNode, createMockNode("target1")];
      
      const { result } = renderHook(
        () => useProcessedEdges({
          edges,
          nodes,
          dataTypes: [],
          getMetadata: mockGetMetadata
        }),
        { wrapper: createWrapper() }
      );
      
      expect(result.current.processedEdges[0]?.className).toContain("from-bypassed");
    });

    it("adds from-bypassed class when target node is bypassed", () => {
      const bypassedNode = createMockNode("target1");
      bypassedNode.data.bypassed = true;
      
      const edges = [createMockEdge("e1", "source1", "target1")];
      const nodes = [createMockNode("source1"), bypassedNode];
      
      const { result } = renderHook(
        () => useProcessedEdges({
          edges,
          nodes,
          dataTypes: [],
          getMetadata: mockGetMetadata
        }),
        { wrapper: createWrapper() }
      );
      
      expect(result.current.processedEdges[0]?.className).toContain("from-bypassed");
    });
  });

  describe("selection optimization", () => {
    it("caches results during selection drag", () => {
      const edges = [createMockEdge("e1", "source1", "target1")];
      const nodes = [createMockNode("source1"), createMockNode("target1")];
      
      const { result, rerender } = renderHook(
        (props: { isSelecting?: boolean }) => useProcessedEdges({
          edges,
          nodes,
          dataTypes: [],
          getMetadata: mockGetMetadata,
          isSelecting: props.isSelecting
        }),
        { 
          wrapper: createWrapper(),
          initialProps: { isSelecting: false }
        }
      );
      
      const firstResult = result.current.processedEdges;
      
      rerender({ isSelecting: true });
      
      const secondResult = result.current.processedEdges;
      
      expect(firstResult).toEqual(secondResult);
    });
  });

  describe("edge cases", () => {
    it("handles edges to non-existent nodes", () => {
      const edges = [createMockEdge("e1", "source1", "nonexistent")];
      const nodes = [createMockNode("source1")];
      
      const { result } = renderHook(
        () => useProcessedEdges({
          edges,
          nodes,
          dataTypes: [],
          getMetadata: mockGetMetadata
        }),
        { wrapper: createWrapper() }
      );
      
      expect(result.current.processedEdges).toHaveLength(1);
      expect(result.current.processedEdges[0]?.className).toContain("any");
    });

    it("handles nodes without metadata", () => {
      const edges = [createMockEdge("e1", "unknown1", "unknown2")];
      const nodes = [createMockNode("unknown1", "unknown"), createMockNode("unknown2", "unknown")];
      
      const { result } = renderHook(
        () => useProcessedEdges({
          edges,
          nodes,
          dataTypes: [],
          getMetadata: () => undefined
        }),
        { wrapper: createWrapper() }
      );
      
      expect(result.current.processedEdges).toHaveLength(1);
      expect(result.current.processedEdges[0]?.className).toContain("any");
    });

    it("handles empty dataTypes array", () => {
      const edges = [createMockEdge("e1", "source1", "target1")];
      const nodes = [createMockNode("source1"), createMockNode("target1")];
      
      const { result } = renderHook(
        () => useProcessedEdges({
          edges,
          nodes,
          dataTypes: [],
          getMetadata: mockGetMetadata
        }),
        { wrapper: createWrapper() }
      );
      
      expect(result.current.processedEdges).toHaveLength(1);
      expect(result.current.activeGradientKeys.size).toBe(0);
    });

    it("preserves original edge labelStyle", () => {
      const originalEdge = createMockEdge("e1", "source1", "target1");
      originalEdge.labelStyle = { fill: "red", fontWeight: 700 };
      
      const edges = [originalEdge];
      const nodes = [createMockNode("source1"), createMockNode("target1")];
      
      const { result } = renderHook(
        () => useProcessedEdges({
          edges,
          nodes,
          dataTypes: [],
          getMetadata: mockGetMetadata
        }),
        { wrapper: createWrapper() }
      );
      
      expect(result.current.processedEdges[0]?.labelStyle).toEqual({ fill: "white", fontWeight: 600, fontSize: "10px" });
    });

    it("preserves original edge labelBgStyle", () => {
      const originalEdge = createMockEdge("e1", "source1", "target1");
      originalEdge.labelBgStyle = { fill: "blue" };
      
      const edges = [originalEdge];
      const nodes = [createMockNode("source1"), createMockNode("target1")];
      
      const { result } = renderHook(
        () => useProcessedEdges({
          edges,
          nodes,
          dataTypes: [],
          getMetadata: mockGetMetadata
        }),
        { wrapper: createWrapper() }
      );
      
      expect(result.current.processedEdges[0]?.labelBgStyle).toEqual({
        fill: "rgba(0, 0, 0, 0.4)",
        fillOpacity: 1,
        rx: 10,
        ry: 10
      });
    });

    it("preserves original edge className", () => {
      const originalEdge = createMockEdge("e1", "source1", "target1");
      originalEdge.className = "custom-class";
      
      const edges = [originalEdge];
      const nodes = [createMockNode("source1"), createMockNode("target1")];
      
      const { result } = renderHook(
        () => useProcessedEdges({
          edges,
          nodes,
          dataTypes: [],
          getMetadata: mockGetMetadata
        }),
        { wrapper: createWrapper() }
      );
      
      expect(result.current.processedEdges[0]?.className).toContain("custom-class");
    });

    it("preserves original edge style", () => {
      const originalEdge = createMockEdge("e1", "source1", "target1");
      originalEdge.style = { strokeDasharray: "5,5" };
      
      const edges = [originalEdge];
      const nodes = [createMockNode("source1"), createMockNode("target1")];
      
      const { result } = renderHook(
        () => useProcessedEdges({
          edges,
          nodes,
          dataTypes: [],
          getMetadata: mockGetMetadata
        }),
        { wrapper: createWrapper() }
      );
      
      const processedEdge = result.current.processedEdges[0];
      expect(processedEdge).toBeDefined();
      expect(processedEdge?.style?.strokeDasharray).toBe("5,5");
    });

    it("handles multiple edges", () => {
      const edges = [
        createMockEdge("e1", "source1", "target1"),
        createMockEdge("e2", "source2", "target2"),
        createMockEdge("e3", "source3", "target3")
      ];
      const nodes = [
        createMockNode("source1"),
        createMockNode("target1"),
        createMockNode("source2"),
        createMockNode("target2"),
        createMockNode("source3"),
        createMockNode("target3")
      ];
      
      const { result } = renderHook(
        () => useProcessedEdges({
          edges,
          nodes,
          dataTypes: [],
          getMetadata: mockGetMetadata
        }),
        { wrapper: createWrapper() }
      );
      
      expect(result.current.processedEdges).toHaveLength(3);
    });

    it("handles edgeStatuses without matching edge", () => {
      const edges = [createMockEdge("e1", "source1", "target1")];
      const nodes = [createMockNode("source1"), createMockNode("target1")];
      
      const { result } = renderHook(
        () => useProcessedEdges({
          edges,
          nodes,
          dataTypes: [],
          getMetadata: mockGetMetadata,
          workflowId: "workflow-1",
          edgeStatuses: { "workflow-1:e2": { status: "message_sent", counter: 1 } }
        }),
        { wrapper: createWrapper() }
      );
      
      const processedEdge = result.current.processedEdges[0];
      expect(processedEdge).toBeDefined();
      expect(processedEdge?.data).toBeDefined();
      if (processedEdge?.data) {
        expect(processedEdge.data.status).toBeNull();
        expect(processedEdge.data.counter).toBeNull();
      }
    });
  });

  describe("Reroute node handling", () => {
    it("processes edges through Reroute nodes", () => {
      const edges = [
        createMockEdge("e1", "source1", "reroute1"),
        createMockEdge("e2", "reroute1", "target1")
      ];
      const nodes = [
        createMockNode("source1"),
        createMockNode("reroute1", "nodetool.control.Reroute"),
        createMockNode("target1")
      ];
      
      const { result } = renderHook(
        () => useProcessedEdges({
          edges,
          nodes,
          dataTypes: [],
          getMetadata: mockGetMetadata
        }),
        { wrapper: createWrapper() }
      );
      
      expect(result.current.processedEdges).toHaveLength(2);
    });

    it("adds any class when Reroute has no incoming edge", () => {
      const edges = [
        createMockEdge("e1", "reroute1", "target1")
      ];
      const nodes = [
        createMockNode("reroute1", "nodetool.control.Reroute"),
        createMockNode("target1")
      ];
      
      const { result } = renderHook(
        () => useProcessedEdges({
          edges,
          nodes,
          dataTypes: [],
          getMetadata: mockGetMetadata
        }),
        { wrapper: createWrapper() }
      );
      
      expect(result.current.processedEdges[0]?.className).toContain("any");
    });
  });
});
