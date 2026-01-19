/**
 * WorkflowProfilerStore Tests
 */

import { renderHook, act } from "@testing-library/react";
import { useProfileStore, WorkflowProfile } from "../../stores/WorkflowProfilerStore";
import { Node, Edge } from "@xyflow/react";

const mockNodes: Node[] = [
  { id: "1", type: "input", position: { x: 0, y: 0 }, data: {} },
  { id: "2", type: "LLM", position: { x: 100, y: 0 }, data: {} },
  { id: "3", type: "output", position: { x: 200, y: 0 }, data: {} }
];

const mockEdges: Edge[] = [
  { id: "e1-2", source: "1", target: "2", type: "default" },
  { id: "e2-3", source: "2", target: "3", type: "default" }
];

describe("WorkflowProfilerStore", () => {
  beforeEach(() => {
    useProfileStore.setState({
      currentProfile: null,
      isAnalyzing: false,
      lastAnalyzedWorkflowId: null
    });
  });

  describe("analyzeWorkflow", () => {
    it("should analyze a simple workflow", () => {
      const { result } = renderHook(() => useProfileStore());
      
      const profile = result.current.analyzeWorkflow(mockNodes, mockEdges, "test-workflow");
      
      expect(profile).toBeDefined();
      expect(profile.nodeCount).toBe(3);
      expect(profile.edgeCount).toBe(2);
      expect(profile.complexityScore).toBeGreaterThan(0);
    });

    it("should detect correct metrics for simple workflow", () => {
      const { result } = renderHook(() => useProfileStore());
      
      const profile = result.current.analyzeWorkflow(mockNodes, mockEdges, "test-workflow");
      
      expect(profile.metrics.totalNodes).toBe(3);
      expect(profile.metrics.inputNodes).toBe(1);
      expect(profile.metrics.outputNodes).toBe(1);
      expect(profile.metrics.processingNodes).toBe(1);
    });

    it("should detect LLM nodes as potential bottlenecks", () => {
      const llmNodes: Node[] = [
        { id: "1", type: "input", position: { x: 0, y: 0 }, data: {} },
        { id: "2", type: "nodetool.llm.LLModel", position: { x: 100, y: 0 }, data: {} },
        { id: "3", type: "output", position: { x: 200, y: 0 }, data: {} }
      ];
      const { result } = renderHook(() => useProfileStore());
      
      const profile = result.current.analyzeWorkflow(llmNodes, mockEdges, "test-workflow");
      
      const hasLLMBottleneck = profile.bottlenecks.some(b => 
        b.nodeType.includes("LLM")
      );
      expect(hasLLMBottleneck).toBe(true);
    });

    it("should detect high fan-out nodes", () => {
      const highFanOutNodes: Node[] = [
        { id: "1", type: "input", position: { x: 0, y: 0 }, data: {} },
        { id: "2", type: "processing", position: { x: 100, y: 0 }, data: {} },
        { id: "3", type: "output", position: { x: 200, y: 0 }, data: {} },
        { id: "4", type: "output", position: { x: 200, y: 100 }, data: {} },
        { id: "5", type: "output", position: { x: 200, y: 200 }, data: {} },
        { id: "6", type: "output", position: { x: 200, y: 300 }, data: {} },
        { id: "7", type: "output", position: { x: 200, y: 400 }, data: {} },
        { id: "8", type: "output", position: { x: 200, y: 500 }, data: {} }
      ];
      const highFanOutEdges: Edge[] = [
        { id: "e1-2", source: "1", target: "2", type: "default" },
        { id: "e2-3", source: "2", target: "3", type: "default" },
        { id: "e2-4", source: "2", target: "4", type: "default" },
        { id: "e2-5", source: "2", target: "5", type: "default" },
        { id: "e2-6", source: "2", target: "6", type: "default" },
        { id: "e2-7", source: "2", target: "7", type: "default" },
        { id: "e2-8", source: "2", target: "8", type: "default" }
      ];
      
      const { result } = renderHook(() => useProfileStore());
      
      const profile = result.current.analyzeWorkflow(highFanOutNodes, highFanOutEdges, "test-workflow");
      
      const hasHighFanOutBottleneck = profile.bottlenecks.some(b => 
        b.nodeId === "2" && b.severity === "high"
      );
      expect(hasHighFanOutBottleneck).toBe(true);
    });

    it("should generate suggestions for complex workflows", () => {
      const complexNodes: Node[] = Array.from({ length: 60 }, (_, i) => ({
        id: `${i}`,
        type: i === 0 ? "input" : i === 59 ? "output" : "processing",
        position: { x: i * 50, y: 0 },
        data: {}
      }));
      
      const complexEdges: Edge[] = Array.from({ length: 59 }, (_, i) => ({
        id: `e${i}-${i + 1}`,
        source: `${i}`,
        target: `${i + 1}`,
        type: "default"
      }));
      
      const { result } = renderHook(() => useProfileStore());
      
      const profile = result.current.analyzeWorkflow(complexNodes, complexEdges, "test-workflow");
      
      expect(profile.suggestions.length).toBeGreaterThan(0);
      expect(profile.suggestions.some(s => s.includes("sub-workflows"))).toBe(true);
    });

    it("should update store state after analysis", () => {
      const { result } = renderHook(() => useProfileStore());
      
      act(() => {
        result.current.analyzeWorkflow(mockNodes, mockEdges, "test-workflow");
      });
      
      expect(result.current.currentProfile).toBeDefined();
      expect(result.current.currentProfile?.nodeCount).toBe(3);
      expect(result.current.lastAnalyzedWorkflowId).toBe("test-workflow");
      expect(result.current.isAnalyzing).toBe(false);
    });
  });

  describe("clearProfile", () => {
    it("should clear the profile from store", () => {
      const { result } = renderHook(() => useProfileStore());
      
      act(() => {
        result.current.analyzeWorkflow(mockNodes, mockEdges, "test-workflow");
      });
      
      expect(result.current.currentProfile).toBeDefined();
      
      act(() => {
        result.current.clearProfile();
      });
      
      expect(result.current.currentProfile).toBeNull();
      expect(result.current.lastAnalyzedWorkflowId).toBeNull();
    });
  });

  describe("setAnalyzing", () => {
    it("should update analyzing state", () => {
      const { result } = renderHook(() => useProfileStore());
      
      expect(result.current.isAnalyzing).toBe(false);
      
      act(() => {
        result.current.setAnalyzing(true);
      });
      
      expect(result.current.isAnalyzing).toBe(true);
      
      act(() => {
        result.current.setAnalyzing(false);
      });
      
      expect(result.current.isAnalyzing).toBe(false);
    });
  });

  describe("empty workflow", () => {
    it("should handle empty nodes array", () => {
      const { result } = renderHook(() => useProfileStore());
      
      const profile = result.current.analyzeWorkflow([], [], "empty-workflow");
      
      expect(profile.nodeCount).toBe(0);
      expect(profile.edgeCount).toBe(0);
      expect(profile.metrics.totalNodes).toBe(0);
    });

    it("should handle nodes without edges", () => {
      const nodesWithoutEdges: Node[] = [
        { id: "1", type: "input", position: { x: 0, y: 0 }, data: {} },
        { id: "2", type: "output", position: { x: 100, y: 0 }, data: {} }
      ];
      
      const { result } = renderHook(() => useProfileStore());
      
      const profile = result.current.analyzeWorkflow(nodesWithoutEdges, [], "test-workflow");
      
      expect(profile.edgeCount).toBe(0);
      expect(profile.metrics.branchingFactor).toBe(0);
    });
  });

  describe("complexity score calculation", () => {
    it("should increase complexity with more nodes and edges", () => {
      const { result } = renderHook(() => useProfileStore());
      
      const simpleProfile = result.current.analyzeWorkflow(
        mockNodes.slice(0, 2),
        mockEdges.slice(0, 1),
        "test"
      );
      
      const complexProfile = result.current.analyzeWorkflow(
        mockNodes,
        mockEdges,
        "test"
      );
      
      expect(complexProfile.complexityScore).toBeGreaterThan(simpleProfile.complexityScore);
    });
  });
});
