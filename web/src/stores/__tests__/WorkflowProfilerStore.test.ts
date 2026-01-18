import useWorkflowProfilerStore from "../../../src/stores/WorkflowProfilerStore";
import { Edge, Node } from "@xyflow/react";
import { NodeData } from "../../../src/stores/NodeData";

describe("WorkflowProfilerStore", () => {
  let store: typeof useWorkflowProfilerStore;
  beforeEach(() => {
    store = require("../../../src/stores/WorkflowProfilerStore").default;
  });

  const createMockNode = (
    id: string,
    type: string,
    position: { x: number; y: number } = { x: 0, y: 0 }
  ): Node<NodeData> => ({
    id,
    type,
    position,
    data: {
      title: `Node ${id}`,
      properties: {},
      selectable: true,
      dynamic_properties: {},
      workflow_id: "test-workflow",
    },
    width: 100,
    height: 50,
    selected: false,
    dragging: false,
  });

  const createMockEdge = (source: string, target: string): Edge => ({
    id: `edge-${source}-${target}`,
    source,
    target,
    type: "default",
    animated: false,
    selected: false,
  });

  describe("analyzeWorkflow", () => {
    it("should return empty profile for empty workflow", () => {
      const profile = store.getState().analyzeWorkflow("test-1", [], []);

      expect(profile.workflowId).toBe("test-1");
      expect(profile.totalNodes).toBe(0);
      expect(profile.estimatedTotalRuntime).toBe(0);
      expect(profile.nodeProfiles).toHaveLength(0);
    });

    it("should analyze single node workflow", () => {
      const nodes: Node<NodeData>[] = [createMockNode("1", "nodetool.input.StringInput")];
      const edges: Edge[] = [];

      const profile = store.getState().analyzeWorkflow("test-2", nodes, edges);

      expect(profile.totalNodes).toBe(1);
      expect(profile.nodeProfiles).toHaveLength(1);
      expect(profile.nodeProfiles[0].nodeId).toBe("1");
      expect(profile.nodeProfiles[0].estimatedRuntime).toBeGreaterThan(0);
    });

    it("should identify parallelizable nodes in same layer", () => {
      const nodes: Node<NodeData>[] = [
        createMockNode("1", "nodetool.input.StringInput", { x: 0, y: 0 }),
        createMockNode("2", "nodetool.input.IntegerInput", { x: 0, y: 100 }),
        createMockNode("3", "nodetool.output.Output", { x: 200, y: 50 }),
      ];
      const edges: Edge[] = [
        createMockEdge("1", "3"),
        createMockEdge("2", "3"),
      ];

      const profile = store.getState().analyzeWorkflow("test-3", nodes, edges);

      expect(profile.totalNodes).toBe(3);
      expect(profile.parallelizableLayers).toBeGreaterThanOrEqual(1);
    });

    it("should detect LLM nodes as potential bottlenecks", () => {
      const nodes: Node<NodeData>[] = [
        createMockNode("1", "nodetool.input.StringInput"),
        createMockNode("2", "nodetool.llm.LLM"),
      ];
      const edges: Edge[] = [createMockEdge("1", "2")];

      const profile = store.getState().analyzeWorkflow("test-4", nodes, edges);

      expect(profile.nodeProfiles).toHaveLength(2);
      const llmNode = profile.nodeProfiles.find((p) =>
        p.nodeType.includes("llm")
      );
      expect(llmNode).toBeDefined();
      expect(llmNode?.complexity).toBe("high");
    });

    it("should track multiple workflows separately", () => {
      const nodes1: Node<NodeData>[] = [createMockNode("1", "nodetool.input.StringInput")];
      const nodes2: Node<NodeData>[] = [
        createMockNode("1", "nodetool.input.StringInput"),
        createMockNode("2", "nodetool.input.IntegerInput"),
      ];

      const profile1 = store.getState().analyzeWorkflow("wf-1", nodes1, []);
      const profile2 = store.getState().analyzeWorkflow("wf-2", nodes2, []);

      expect(profile1.workflowId).toBe("wf-1");
      expect(profile2.workflowId).toBe("wf-2");
      expect(profile1.totalNodes).toBe(1);
      expect(profile2.totalNodes).toBe(2);
    });
  });

  describe("getProfile", () => {
    it("should return undefined for non-existent workflow", () => {
      const profile = store.getState().getProfile("non-existent");
      expect(profile).toBeUndefined();
    });

    it("should return profile after analysis", () => {
      const nodes: Node<NodeData>[] = [createMockNode("1", "nodetool.input.StringInput")];

      store.getState().analyzeWorkflow("test-wf", nodes, []);
      const profile = store.getState().getProfile("test-wf");

      expect(profile).toBeDefined();
      expect(profile?.workflowId).toBe("test-wf");
    });
  });

  describe("clearProfile", () => {
    it("should remove profile from store", () => {
      const nodes: Node<NodeData>[] = [createMockNode("1", "nodetool.input.StringInput")];

      store.getState().analyzeWorkflow("test-clear", nodes, []);
      expect(store.getState().getProfile("test-clear")).toBeDefined();

      store.getState().clearProfile("test-clear");
      expect(store.getState().getProfile("test-clear")).toBeUndefined();
    });

    it("should not affect other workflow profiles", () => {
      const nodes: Node<NodeData>[] = [createMockNode("1", "nodetool.input.StringInput")];

      store.getState().analyzeWorkflow("wf-a", nodes, []);
      store.getState().analyzeWorkflow("wf-b", nodes, []);

      store.getState().clearProfile("wf-a");

      expect(store.getState().getProfile("wf-a")).toBeUndefined();
      expect(store.getState().getProfile("wf-b")).toBeDefined();
    });
  });

  describe("node complexity detection", () => {
    it("should classify input nodes as low complexity", () => {
      const nodes: Node<NodeData>[] = [createMockNode("1", "nodetool.input.StringInput")];

      const profile = store.getState().analyzeWorkflow("complex-test", nodes, []);

      expect(profile.nodeProfiles[0].complexity).toBe("low");
    });

    it("should classify model nodes as high complexity", () => {
      const nodes: Node<NodeData>[] = [
        createMockNode("1", "nodetool.models.HuggingFacePipeline"),
      ];

      const profile = store.getState().analyzeWorkflow("model-test", nodes, []);

      expect(profile.nodeProfiles[0].complexity).toBe("high");
    });
  });

  describe("bottleneck detection", () => {
    it("should identify LLM nodes as bottlenecks", () => {
      const nodes: Node<NodeData>[] = [createMockNode("1", "nodetool.llm.LLM")];

      const profile = store.getState().analyzeWorkflow("bottleneck-test", nodes, []);

      const llmNode = profile.nodeProfiles.find((p) =>
        p.nodeType.includes("llm")
      );
      expect(llmNode?.bottlenecks.length).toBeGreaterThan(0);
    });

    it("should identify API nodes with relevant bottlenecks", () => {
      const nodes: Node<NodeData>[] = [
        createMockNode("1", "nodetool.models.OpenAI"),
      ];

      const profile = store.getState().analyzeWorkflow("api-test", nodes, []);

      const apiNode = profile.nodeProfiles.find((p) =>
        p.nodeType.includes("OpenAI")
      );
      expect(apiNode?.bottlenecks.some((b) => b.includes("API"))).toBe(true);
    });
  });

  describe("suggestion generation", () => {
    it("should generate suggestions for workflows with many API calls", () => {
      const nodes: Node<NodeData>[] = [
        createMockNode("1", "nodetool.models.OpenAI"),
        createMockNode("2", "nodetool.models.HuggingFacePipeline"),
        createMockNode("3", "nodetool.models.Anthropic"),
      ];
      const edges: Edge[] = [
        createMockEdge("1", "2"),
        createMockEdge("2", "3"),
      ];

      const profile = store.getState().analyzeWorkflow("suggestion-test", nodes, edges);

      expect(
        profile.suggestions.some((s) => s.includes("API"))
      ).toBe(true);
    });

    it("should generate suggestions for multiple LLM nodes", () => {
      const nodes: Node<NodeData>[] = [
        createMockNode("1", "nodetool.llm.LLM"),
        createMockNode("2", "nodetool.llm.ChatModel"),
      ];
      const edges: Edge[] = [createMockEdge("1", "2")];

      const profile = store.getState().analyzeWorkflow("llm-multi-test", nodes, edges);

      expect(
        profile.suggestions.some((s) => s.includes("LLM"))
      ).toBe(true);
    });
  });
});

describe("formatDuration", () => {
  it("should format milliseconds correctly", () => {
    const { formatDuration } = require("../../../src/hooks/useWorkflowProfiler");

    expect(formatDuration(100)).toBe("100ms");
    expect(formatDuration(500)).toBe("500ms");
    expect(formatDuration(999)).toBe("999ms");
  });

  it("should format seconds correctly", () => {
    const { formatDuration } = require("../../../src/hooks/useWorkflowProfiler");

    expect(formatDuration(1000)).toBe("1.0s 0ms");
    expect(formatDuration(2500)).toBe("2.5s 500ms");
    expect(formatDuration(59999)).toBe("60.0s 999ms");
  });

  it("should format minutes correctly", () => {
    const { formatDuration } = require("../../../src/hooks/useWorkflowProfiler");

    expect(formatDuration(60000)).toBe("1m 0s");
    expect(formatDuration(125000)).toBe("2m 5s");
  });
});

describe("getComplexityColor", () => {
  it("should return correct colors for complexity levels", () => {
    const { getComplexityColor } = require("../../../src/hooks/useWorkflowProfiler");

    expect(getComplexityColor("low")).toBe("success.main");
    expect(getComplexityColor("medium")).toBe("warning.main");
    expect(getComplexityColor("high")).toBe("error.main");
  });
});

describe("getComplexityLabel", () => {
  it("should return correct labels for complexity levels", () => {
    const { getComplexityLabel } = require("../../../src/hooks/useWorkflowProfiler");

    expect(getComplexityLabel("low")).toBe("Low");
    expect(getComplexityLabel("medium")).toBe("Medium");
    expect(getComplexityLabel("high")).toBe("High");
  });
});
