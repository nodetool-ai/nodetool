import usePerformanceStore, { NodePerformanceData } from "../../stores/PerformanceStore";

describe("PerformanceStore", () => {
  beforeEach(() => {
    usePerformanceStore.setState({ profiles: {}, executionHistory: {}, thresholds: { slow: 2000, verySlow: 5000 } });
  });

  describe("analyzeWorkflow", () => {
    it("should create a performance profile for a workflow", () => {
      const workflowId = "workflow-1";
      const nodeIds = ["node-1", "node-2"];

      const getNodeDuration = (nodeId: string) => {
        if (nodeId === "node-1") { return 1000; }
        if (nodeId === "node-2") { return 2000; }
        return undefined;
      };

      const getNodeStatus = (nodeId: string) => "completed" as const;
      const getNodeType = (nodeId: string) => `nodetool.process.${nodeId}`;
      const getNodeLabel = (nodeId: string) => `Node ${nodeId}`;

      const profile = usePerformanceStore.getState().analyzeWorkflow(
        workflowId,
        nodeIds,
        getNodeDuration,
        getNodeStatus,
        getNodeType,
        getNodeLabel
      );

      expect(profile.workflowId).toBe(workflowId);
      expect(profile.nodeCount).toBe(2);
      expect(profile.completedCount).toBe(2);
      expect(profile.totalDuration).toBe(3000);
      expect(profile.nodes).toHaveLength(2);
    });

    it("should identify bottlenecks correctly", () => {
      const workflowId = "workflow-2";
      const nodeIds = ["fast-node", "slow-node", "very-slow-node"];

      const getNodeDuration = (nodeId: string) => {
        if (nodeId === "fast-node") { return 100; }
        if (nodeId === "slow-node") { return 3000; }
        if (nodeId === "very-slow-node") { return 8000; }
        return undefined;
      };

      const getNodeStatus = () => "completed" as const;
      const getNodeType = (nodeId: string) => `nodetool.process.${nodeId}`;
      const getNodeLabel = (nodeId: string) => nodeId;

      const profile = usePerformanceStore.getState().analyzeWorkflow(
        workflowId,
        nodeIds,
        getNodeDuration,
        getNodeStatus,
        getNodeType,
        getNodeLabel
      );

      expect(profile.bottlenecks.length).toBeGreaterThan(0);
      const bottleneckIds = profile.bottlenecks.map((b) => b.nodeId);
      expect(bottleneckIds).toContain("very-slow-node");
    });

    it("should calculate average duration from execution history", () => {
      const workflowId = "workflow-3";
      const nodeIds = ["node-1"];

      const getNodeDuration = () => 1500;
      const getNodeStatus = () => "completed" as const;
      const getNodeType = () => "nodetool.process.test";
      const getNodeLabel = () => "Test Node";

      usePerformanceStore.getState().analyzeWorkflow(
        workflowId,
        nodeIds,
        getNodeDuration,
        getNodeStatus,
        getNodeType,
        getNodeLabel
      );

      const profile = usePerformanceStore.getState().profiles[workflowId];
      expect(profile.nodes[0].executionCount).toBe(1);
      expect(profile.nodes[0].avgDuration).toBe(1500);

      usePerformanceStore.getState().analyzeWorkflow(
        workflowId,
        nodeIds,
        getNodeDuration,
        getNodeStatus,
        getNodeType,
        getNodeLabel
      );

      const updatedProfile = usePerformanceStore.getState().profiles[workflowId];
      expect(updatedProfile.nodes[0].executionCount).toBe(2);
      expect(updatedProfile.nodes[0].avgDuration).toBe(1500);
    });
  });

  describe("getProfile", () => {
    it("should return undefined for non-existent workflow", () => {
      const profile = usePerformanceStore.getState().getProfile("non-existent");
      expect(profile).toBeUndefined();
    });
  });

  describe("clearProfile", () => {
    it("should remove a workflow profile", () => {
      const workflowId = "workflow-to-clear";
      const nodeIds = ["node-1"];

      const getNodeDuration = () => 1000;
      const getNodeStatus = () => "completed" as const;
      const getNodeType = () => "nodetool.process.test";
      const getNodeLabel = () => "Test Node";

      usePerformanceStore.getState().analyzeWorkflow(
        workflowId,
        nodeIds,
        getNodeDuration,
        getNodeStatus,
        getNodeType,
        getNodeLabel
      );

      expect(usePerformanceStore.getState().profiles[workflowId]).toBeDefined();

      usePerformanceStore.getState().clearProfile(workflowId);

      expect(usePerformanceStore.getState().profiles[workflowId]).toBeUndefined();
    });
  });

  describe("setThresholds", () => {
    it("should update performance thresholds", () => {
      usePerformanceStore.getState().setThresholds({ slow: 1000, verySlow: 3000 });

      const thresholds = usePerformanceStore.getState().thresholds;
      expect(thresholds.slow).toBe(1000);
      expect(thresholds.verySlow).toBe(3000);
    });
  });

  describe("calculateBottlenecks", () => {
    it("should return empty array for pending nodes", () => {
      const nodes: NodePerformanceData[] = [
        {
          nodeId: "node-1",
          nodeType: "test",
          nodeLabel: "Test",
          duration: 10000,
          status: "pending",
          executionCount: 0,
          avgDuration: 0,
          isBottleneck: false
        }
      ];

      const bottlenecks = usePerformanceStore.getState().calculateBottlenecks(nodes);
      expect(bottlenecks).toHaveLength(0);
    });

    it("should identify nodes above threshold as bottlenecks", () => {
      const nodes: NodePerformanceData[] = [
        {
          nodeId: "fast-node",
          nodeType: "test",
          nodeLabel: "Fast",
          duration: 100,
          status: "completed",
          executionCount: 1,
          avgDuration: 100,
          isBottleneck: false
        },
        {
          nodeId: "slow-node",
          nodeType: "test",
          nodeLabel: "Slow",
          duration: 6000,
          status: "completed",
          executionCount: 1,
          avgDuration: 6000,
          isBottleneck: false
        }
      ];

      const bottlenecks = usePerformanceStore.getState().calculateBottlenecks(nodes);
      expect(bottlenecks.length).toBeGreaterThan(0);
      expect(bottlenecks[0].nodeId).toBe("slow-node");
    });
  });
});
