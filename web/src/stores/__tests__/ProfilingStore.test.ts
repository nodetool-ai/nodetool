import useProfilingStore from "../ProfilingStore";
import { Node } from "@xyflow/react";
import { NodeData } from "../NodeData";
import useMetadataStore from "../MetadataStore";
import { NodeMetadata } from "../ApiTypes";

describe("ProfilingStore", () => {
  const createMockNode = (id: string, type: string): Node<NodeData> => ({
    id,
    type,
    position: { x: 0, y: 0 },
    data: {
      properties: {},
      selectable: true,
      dynamic_properties: {},
      workflow_id: "wf1"
    }
  });

  const mockNodes: Node<NodeData>[] = [
    createMockNode("node1", "input"),
    createMockNode("node2", "process"),
    createMockNode("node3", "output")
  ];

  const mockEdges = [
    { id: "e1", source: "node1", target: "node2" },
    { id: "e2", source: "node2", target: "node3" }
  ];

  const mockMetadata: Record<string, NodeMetadata> = {
    input: {
      node_type: "nodetool.input.Text",
      title: "Input Node",
      description: "Input node",
      namespace: "nodetool",
      properties: [],
      outputs: [],
      the_model_info: {},
      layout: "vertical",
      recommended_models: [],
      basic_fields: [],
      is_dynamic: false,
      expose_as_tool: false,
      supports_dynamic_outputs: false,
      is_streaming_output: false
    },
    process: {
      node_type: "nodetool.process.TextProcessing",
      title: "Process Node",
      description: "Process node",
      namespace: "nodetool",
      properties: [],
      outputs: [],
      the_model_info: {},
      layout: "vertical",
      recommended_models: [],
      basic_fields: [],
      is_dynamic: false,
      expose_as_tool: false,
      supports_dynamic_outputs: false,
      is_streaming_output: false
    },
    output: {
      node_type: "nodetool.output.Text",
      title: "Output Node",
      description: "Output node",
      namespace: "nodetool",
      properties: [],
      outputs: [],
      the_model_info: {},
      layout: "vertical",
      recommended_models: [],
      basic_fields: [],
      is_dynamic: false,
      expose_as_tool: false,
      supports_dynamic_outputs: false,
      is_streaming_output: false
    }
  };

  beforeEach(() => {
    useProfilingStore.getState().clearAllProfiles();
    jest.spyOn(useMetadataStore.getState(), "getMetadata").mockImplementation((nodeType: string) => {
      return mockMetadata[nodeType as keyof typeof mockMetadata];
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("startProfiling", () => {
    it("should create a new profile with workflow data", () => {
      useProfilingStore.getState().startProfiling("wf1", "Test Workflow", mockNodes, mockEdges);

      const profile = useProfilingStore.getState().getProfile("wf1");

      expect(profile).toBeDefined();
      expect(profile?.workflowId).toBe("wf1");
      expect(profile?.workflowName).toBe("Test Workflow");
      expect(profile?.nodeCount).toBe(3);
      expect(profile?.layers.length).toBeGreaterThan(0);
    });

    it("should initialize all nodes with empty timing data", () => {
      useProfilingStore.getState().startProfiling("wf1", "Test Workflow", mockNodes, mockEdges);

      const profile = useProfilingStore.getState().getProfile("wf1");

      expect(profile?.nodes["node1"]).toBeDefined();
      expect(profile?.nodes["node1"].startTime).toBe(0);
      expect(profile?.nodes["node1"].endTime).toBe(0);
      expect(profile?.nodes["node1"].duration).toBe(0);
    });

    it("should set correct layer and dependency information", () => {
      useProfilingStore.getState().startProfiling("wf1", "Test Workflow", mockNodes, mockEdges);

      const profile = useProfilingStore.getState().getProfile("wf1");

      expect(profile?.nodes["node1"].layer).toBe(0);
      expect(profile?.nodes["node1"].blockedBy).toEqual([]);
      expect(profile?.nodes["node2"].blockedBy).toEqual(["node1"]);
      expect(profile?.nodes["node3"].blockedBy).toEqual(["node2"]);
    });

    it("should track parallel nodes in same layer", () => {
      const parallelNodes: Node<NodeData>[] = [
        createMockNode("n1", "process"),
        createMockNode("n2", "process"),
        createMockNode("n3", "output")
      ];
      const parallelEdges = [
        { id: "e1", source: "n1", target: "n3" },
        { id: "e2", source: "n2", target: "n3" }
      ];

      useProfilingStore.getState().startProfiling("wf2", "Parallel Workflow", parallelNodes, parallelEdges);

      const profile = useProfilingStore.getState().getProfile("wf2");

      expect(profile?.nodes["n1"].parallelWith).toContain("n2");
      expect(profile?.nodes["n2"].parallelWith).toContain("n1");
    });
  });

  describe("recordNodeStart", () => {
    it("should record node start time", () => {
      useProfilingStore.getState().startProfiling("wf1", "Test Workflow", mockNodes, mockEdges);

      const startTime = Date.now();
      useProfilingStore.getState().recordNodeStart("wf1", "node2", "Process Node", "process");

      const profile = useProfilingStore.getState().getProfile("wf1");

      expect(profile?.nodes["node2"].startTime).toBeGreaterThanOrEqual(startTime);
      expect(profile?.nodes["node2"].nodeName).toBe("Process Node");
      expect(profile?.nodes["node2"].nodeType).toBe("process");
    });
  });

  describe("recordNodeEnd", () => {
    it("should record node end time and calculate duration", () => {
      useProfilingStore.getState().startProfiling("wf1", "Test Workflow", mockNodes, mockEdges);

      useProfilingStore.getState().recordNodeStart("wf1", "node2", "Process Node", "process");

      const beforeEnd = Date.now();
      useProfilingStore.getState().recordNodeEnd("wf1", "node2", "completed");

      const profile = useProfilingStore.getState().getProfile("wf1");

      expect(profile?.nodes["node2"].endTime).toBeGreaterThanOrEqual(beforeEnd);
      expect(profile?.nodes["node2"].duration).toBeGreaterThanOrEqual(0);
      expect(profile?.nodes["node2"].status).toBe("completed");
    });

    it("should handle error status", () => {
      useProfilingStore.getState().startProfiling("wf1", "Test Workflow", mockNodes, mockEdges);
      useProfilingStore.getState().recordNodeStart("wf1", "node2", "Process Node", "process");
      useProfilingStore.getState().recordNodeEnd("wf1", "node2", "error");

      const profile = useProfilingStore.getState().getProfile("wf1");

      expect(profile?.nodes["node2"].status).toBe("error");
    });
  });

  describe("finishProfiling", () => {
    it("should calculate total duration and identify bottlenecks", () => {
      useProfilingStore.getState().startProfiling("wf1", "Test Workflow", mockNodes, mockEdges);

      useProfilingStore.getState().recordNodeStart("wf1", "node1", "Input", "input");
      useProfilingStore.getState().recordNodeEnd("wf1", "node1", "completed");

      useProfilingStore.getState().recordNodeStart("wf1", "node2", "Process", "process");
      useProfilingStore.getState().recordNodeEnd("wf1", "node2", "completed");

      useProfilingStore.getState().recordNodeStart("wf1", "node3", "Output", "output");
      useProfilingStore.getState().recordNodeEnd("wf1", "node3", "completed");

      useProfilingStore.getState().finishProfiling("wf1", "job-123");

      const profile = useProfilingStore.getState().getProfile("wf1");

      expect(profile?.jobId).toBe("job-123");
      expect(profile?.finishedAt ?? 0).toBeGreaterThanOrEqual(profile?.startedAt ?? 0);
      expect(profile?.totalDuration ?? 0).toBeGreaterThanOrEqual(0);
      expect(profile?.bottleneckNodes).toBeDefined();
    });

    it("should calculate parallelization efficiency", () => {
      useProfilingStore.getState().startProfiling("wf1", "Test Workflow", mockNodes, mockEdges);

      useProfilingStore.getState().recordNodeStart("wf1", "node1", "Input", "input");
      useProfilingStore.getState().recordNodeEnd("wf1", "node1", "completed");

      useProfilingStore.getState().recordNodeStart("wf1", "node2", "Process", "process");
      useProfilingStore.getState().recordNodeEnd("wf1", "node2", "completed");

      useProfilingStore.getState().recordNodeStart("wf1", "node3", "Output", "output");
      useProfilingStore.getState().recordNodeEnd("wf1", "node3", "completed");

      useProfilingStore.getState().finishProfiling("wf1", "job-123");

      const profile = useProfilingStore.getState().getProfile("wf1");

      expect(profile?.parallelizationEfficiency).toBeDefined();
      expect(profile?.parallelizationEfficiency).toBeGreaterThanOrEqual(0);
      expect(profile?.parallelizationEfficiency).toBeLessThanOrEqual(1);
    });

    it("should identify critical path", () => {
      useProfilingStore.getState().startProfiling("wf1", "Test Workflow", mockNodes, mockEdges);

      useProfilingStore.getState().recordNodeStart("wf1", "node1", "Input", "input");
      useProfilingStore.getState().recordNodeEnd("wf1", "node1", "completed");

      useProfilingStore.getState().recordNodeStart("wf1", "node2", "Process", "process");
      useProfilingStore.getState().recordNodeEnd("wf1", "node2", "completed");

      useProfilingStore.getState().recordNodeStart("wf1", "node3", "Output", "output");
      useProfilingStore.getState().recordNodeEnd("wf1", "node3", "completed");

      useProfilingStore.getState().finishProfiling("wf1", "job-123");

      const profile = useProfilingStore.getState().getProfile("wf1");

      expect(profile?.criticalPath).toBeDefined();
      expect(profile?.criticalPath.length).toBeGreaterThan(0);
    });
  });

  describe("clearProfile", () => {
    it("should remove a specific profile", () => {
      useProfilingStore.getState().startProfiling("wf1", "Test Workflow", mockNodes, mockEdges);
      expect(useProfilingStore.getState().getProfile("wf1")).toBeDefined();

      useProfilingStore.getState().clearProfile("wf1");

      expect(useProfilingStore.getState().getProfile("wf1")).toBeUndefined();
    });
  });

  describe("clearAllProfiles", () => {
    it("should remove all profiles", () => {
      useProfilingStore.getState().startProfiling("wf1", "Workflow 1", mockNodes, mockEdges);
      useProfilingStore.getState().startProfiling("wf2", "Workflow 2", mockNodes, mockEdges);

      expect(useProfilingStore.getState().getProfile("wf1")).toBeDefined();
      expect(useProfilingStore.getState().getProfile("wf2")).toBeDefined();

      useProfilingStore.getState().clearAllProfiles();

      expect(useProfilingStore.getState().getProfile("wf1")).toBeUndefined();
      expect(useProfilingStore.getState().getProfile("wf2")).toBeUndefined();
    });
  });

  describe("getCurrentProfile", () => {
    it("should return the current profiling session", () => {
      useProfilingStore.getState().startProfiling("wf1", "Test Workflow", mockNodes, mockEdges);

      const current = useProfilingStore.getState().getCurrentProfile();

      expect(current).toBeDefined();
      expect(current?.workflowId).toBe("wf1");
    });
  });
});
