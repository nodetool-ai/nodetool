/**
 * useWorkflowProfiler Hook Tests
 */
import { renderHook, act } from "@testing-library/react";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { useWorkflowProfiler } from "../useWorkflowProfiler";
import useWorkflowProfilerStore from "../../stores/WorkflowProfilerStore";

describe("useWorkflowProfiler", () => {
  const workflowId = "test-workflow-hook";

  const createMockNodeData = (): NodeData => ({
    properties: {},
    selectable: true,
    dynamic_properties: {},
    workflow_id: workflowId,
  });

  const createMockNodes = (
    overrides: Partial<Node<NodeData>>[] = []
  ): Node<NodeData>[] => {
    const defaultNode: Partial<Node<NodeData>> = {
      id: "node-1",
      type: "nodetool.input.StringInput",
      position: { x: 0, y: 0 },
      data: createMockNodeData(),
    };
    return overrides.map((o, i) => ({
      ...defaultNode,
      ...o,
      id: o.id || `node-${i + 1}`,
      data: createMockNodeData(),
    })) as Node<NodeData>[];
  };

  const createMockEdges = (overrides: Partial<Edge>[] = []): Edge[] => {
    return overrides.map((o, i) => ({
      id: `edge-${i + 1}`,
      source: o.source || "node-1",
      target: o.target || "node-2",
      ...o,
    }));
  };

  beforeEach(() => {
    useWorkflowProfilerStore.getState().clearProfile(workflowId);
  });

  describe("formatTime", () => {
    it("should format milliseconds correctly", () => {
      const { result } = renderHook(() => useWorkflowProfiler(workflowId));

      expect(result.current.formatTime(500)).toBe("500ms");
      expect(result.current.formatTime(1000)).toBe("1s 0ms");
      expect(result.current.formatTime(1500)).toBe("1s 500ms");
      expect(result.current.formatTime(65000)).toBe("1m 5s");
    });
  });

  describe("getSeverityColor", () => {
    it("should return correct colors for severity levels", () => {
      const { result } = renderHook(() => useWorkflowProfiler(workflowId));

      expect(result.current.getSeverityColor("high")).toBe("error.main");
      expect(result.current.getSeverityColor("medium")).toBe("warning.main");
      expect(result.current.getSeverityColor("low")).toBe("info.main");
      expect(result.current.getSeverityColor("unknown")).toBe("text.secondary");
    });
  });

  describe("getTypeIcon", () => {
    it("should return correct icons for suggestion types", () => {
      const { result } = renderHook(() => useWorkflowProfiler(workflowId));

      expect(result.current.getTypeIcon("bottleneck")).toBe("⚠️");
      expect(result.current.getTypeIcon("parallelization")).toBe("⚡");
      expect(result.current.getTypeIcon("memory")).toBe("💾");
      expect(result.current.getTypeIcon("caching")).toBe("📦");
      expect(result.current.getTypeIcon("general")).toBe("💡");
      expect(result.current.getTypeIcon("unknown")).toBe("📊");
    });
  });

  describe("analyze", () => {
    it("should analyze workflow and return profile", () => {
      const { result } = renderHook(() => useWorkflowProfiler(workflowId));
      const nodes = createMockNodes([
        { id: "node-1", type: "nodetool.input.StringInput" },
        { id: "node-2", type: "nodetool.output.StringOutput" },
      ]);
      const edges = createMockEdges([
        { source: "node-1", target: "node-2" },
      ]);

      act(() => {
        result.current.analyze(nodes, edges);
      });

      expect(result.current.profile).toBeDefined();
      expect(result.current.profile?.nodeCount).toBe(2);
    });

    it("should update profile when analyzed", () => {
      const { result } = renderHook(() => useWorkflowProfiler(workflowId));
      const nodes = createMockNodes([
        { id: "node-1", type: "nodetool.models.LLM" },
      ]);
      const edges: Edge[] = [];

      act(() => {
        result.current.analyze(nodes, edges);
      });

      expect(result.current.profile).toBeDefined();
      expect(result.current.profile?.totalEstimatedTime).toBeGreaterThan(0);
    });
  });

  describe("getSuggestions", () => {
    it("should return empty array before analysis", () => {
      const { result } = renderHook(() => useWorkflowProfiler(workflowId));

      expect(result.current.getSuggestions()).toEqual([]);
    });

    it("should return suggestions after analysis", () => {
      const { result } = renderHook(() => useWorkflowProfiler(workflowId));
      const nodes = createMockNodes([
        { id: "node-1", type: "nodetool.models.LLM" },
        { id: "node-2", type: "nodetool.output.StringOutput" },
      ]);
      const edges = createMockEdges([
        { source: "node-1", target: "node-2" },
      ]);

      act(() => {
        result.current.analyze(nodes, edges);
      });

      const suggestions = result.current.getSuggestions();
      expect(suggestions.length).toBeGreaterThan(0);
    });
  });

  describe("updateNodeTiming", () => {
    it("should update node timing in profile", () => {
      const { result } = renderHook(() => useWorkflowProfiler(workflowId));
      const nodes = createMockNodes([
        { id: "node-1", type: "nodetool.input.StringInput" },
      ]);
      const edges: Edge[] = [];

      act(() => {
        result.current.analyze(nodes, edges);
      });

      act(() => {
        result.current.updateNodeTiming("node-1", 1000);
      });

      expect(result.current.profile?.totalActualTime).toBe(1000);
    });
  });

  describe("clearProfile", () => {
    it("should clear the profile", () => {
      const { result } = renderHook(() => useWorkflowProfiler(workflowId));
      const nodes = createMockNodes();
      const edges: Edge[] = [];

      act(() => {
        result.current.analyze(nodes, edges);
      });

      expect(result.current.profile).toBeDefined();

      act(() => {
        result.current.clearProfile();
      });

      expect(result.current.profile).toBeUndefined();
    });
  });
});
