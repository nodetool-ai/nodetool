import {
  formatDuration,
  formatPercentage,
  getPerformanceGrade,
  analyzePerformance,
  getTimelineData,
  compareProfiles
} from "../../utils/performanceAnalysis";
import type { WorkflowPerformanceProfile, NodePerformanceMetrics } from "../../stores/ProfilerStore";

describe("performanceAnalysis utilities", () => {
  describe("formatDuration", () => {
    it("should format milliseconds", () => {
      expect(formatDuration(100)).toBe("100ms");
      expect(formatDuration(500)).toBe("500ms");
      expect(formatDuration(999)).toBe("999ms");
    });

    it("should format seconds and milliseconds", () => {
      expect(formatDuration(1000)).toBe("1s 0ms");
      expect(formatDuration(1500)).toBe("1s 500ms");
      expect(formatDuration(59999)).toBe("59s 999ms");
    });

    it("should format minutes, seconds, and milliseconds", () => {
      expect(formatDuration(60000)).toBe("1m 0s");
      expect(formatDuration(65000)).toBe("1m 5s");
      expect(formatDuration(125000)).toBe("2m 5s");
    });
  });

  describe("formatPercentage", () => {
    it("should format percentages correctly", () => {
      expect(formatPercentage(50, 100)).toBe("50.0%");
      expect(formatPercentage(25, 100)).toBe("25.0%");
      expect(formatPercentage(33.33, 100)).toBe("33.3%");
    });

    it("should handle zero total", () => {
      expect(formatPercentage(50, 0)).toBe("0%");
    });

    it("should handle values over 100%", () => {
      expect(formatPercentage(150, 100)).toBe("150.0%");
    });
  });

  describe("getPerformanceGrade", () => {
    it("should return A for scores 90 and above", () => {
      const result = getPerformanceGrade(90);
      expect(result.grade).toBe("A");
      expect(result.color).toBe("success.main");
    });

    it("should return B for scores 75-89", () => {
      const result = getPerformanceGrade(75);
      expect(result.grade).toBe("B");
      expect(result.color).toBe("info.main");
    });

    it("should return C for scores 60-74", () => {
      const result = getPerformanceGrade(60);
      expect(result.grade).toBe("C");
      expect(result.color).toBe("warning.main");
    });

    it("should return D for scores 40-59", () => {
      const result = getPerformanceGrade(40);
      expect(result.grade).toBe("D");
      expect(result.color).toBe("warning.dark");
    });

    it("should return F for scores below 40", () => {
      const result = getPerformanceGrade(30);
      expect(result.grade).toBe("F");
      expect(result.color).toBe("error.main");
    });
  });

  describe("analyzePerformance", () => {
    const createMockProfile = (overrides: Partial<WorkflowPerformanceProfile> = {}): WorkflowPerformanceProfile => ({
      workflowId: "workflow1",
      workflowName: "Test Workflow",
      totalDuration: 10000,
      nodeCount: 3,
      completedNodes: 3,
      failedNodes: 0,
      startTime: Date.now() - 10000,
      endTime: Date.now(),
      nodes: {
        node1: {
          nodeId: "node1",
          nodeType: "nodetool.input.StringInput",
          nodeName: "input1",
          executionCount: 1,
          totalDuration: 100,
          averageDuration: 100,
          minDuration: 100,
          maxDuration: 100,
          lastDuration: 100,
          status: "completed"
        },
        node2: {
          nodeId: "node2",
          nodeType: "nodetool.process.LLM",
          nodeName: "llm1",
          executionCount: 1,
          totalDuration: 9500,
          averageDuration: 9500,
          minDuration: 9500,
          maxDuration: 9500,
          lastDuration: 9500,
          status: "completed"
        },
        node3: {
          nodeId: "node3",
          nodeType: "nodetool.output.TextOutput",
          nodeName: "output1",
          executionCount: 1,
          totalDuration: 400,
          averageDuration: 400,
          minDuration: 400,
          maxDuration: 400,
          lastDuration: 400,
          status: "completed"
        }
      },
      bottlenecks: [],
      efficiency: 85,
      ...overrides
    });

    it("should generate summary for successful workflow", () => {
      const profile = createMockProfile();
      const report = analyzePerformance(profile);

      expect(report.summary).toContain("successfully");
    });

    it("should identify bottlenecks", () => {
      const profile = createMockProfile();
      const report = analyzePerformance(profile);

      const bottleneckInsight = report.insights.find((i) => i.type === "bottleneck");
      expect(bottleneckInsight).toBeDefined();
      expect(bottleneckInsight!.nodeId).toBe("node2");
    });

    it("should generate success insight when all nodes complete", () => {
      const profile = createMockProfile({ failedNodes: 0 });
      const report = analyzePerformance(profile);

      const successInsight = report.insights.find((i) => i.type === "success");
      expect(successInsight).toBeDefined();
    });

    it("should include memory estimate", () => {
      const profile = createMockProfile();
      const report = analyzePerformance(profile);

      expect(report.memoryEstimate).toBeDefined();
      expect(typeof report.memoryEstimate).toBe("string");
    });

    it("should return efficiency score", () => {
      const profile = createMockProfile({ efficiency: 85 });
      const report = analyzePerformance(profile);

      expect(report.score).toBe(85);
    });

    it("should generate warning for failed nodes", () => {
      const profile = createMockProfile({
        nodes: {
          node1: {
            nodeId: "node1",
            nodeType: "nodetool.input.StringInput",
            nodeName: "input1",
            executionCount: 1,
            totalDuration: 100,
            averageDuration: 100,
            minDuration: 100,
            maxDuration: 100,
            lastDuration: 100,
            status: "failed"
          }
        },
        nodeCount: 1,
        completedNodes: 0,
        failedNodes: 1
      });
      const report = analyzePerformance(profile);

      const warningInsight = report.insights.find((i) => i.type === "warning");
      expect(warningInsight).toBeDefined();
    });
  });

  describe("getTimelineData", () => {
    it("should return timeline data for nodes", () => {
      const profile: WorkflowPerformanceProfile = {
        workflowId: "workflow1",
        workflowName: "Test Workflow",
        totalDuration: 5000,
        nodeCount: 2,
        completedNodes: 2,
        failedNodes: 0,
        startTime: 0,
        endTime: 5000,
        nodes: {
          node1: {
            nodeId: "node1",
            nodeType: "nodetool.input.StringInput",
            nodeName: "input1",
            executionCount: 1,
            totalDuration: 1000,
            averageDuration: 1000,
            minDuration: 1000,
            maxDuration: 1000,
            lastDuration: 1000,
            status: "completed"
          },
          node2: {
            nodeId: "node2",
            nodeType: "nodetool.output.TextOutput",
            nodeName: "output1",
            executionCount: 1,
            totalDuration: 2000,
            averageDuration: 2000,
            minDuration: 2000,
            maxDuration: 2000,
            lastDuration: 2000,
            status: "completed"
          }
        },
        bottlenecks: [],
        efficiency: 90
      };

      const timeline = getTimelineData(profile);

      expect(timeline).toHaveLength(2);
      expect(timeline[0].nodeId).toBe("node2");
      expect(timeline[1].nodeId).toBe("node1");
      expect(timeline[0].start).toBe(0);
      expect(timeline[0].end).toBe(2000);
      expect(timeline[1].start).toBe(2000);
      expect(timeline[1].end).toBe(3000);
    });

    it("should sort nodes by duration", () => {
      const profile: WorkflowPerformanceProfile = {
        workflowId: "workflow1",
        workflowName: "Test Workflow",
        totalDuration: 3000,
        nodeCount: 2,
        completedNodes: 2,
        failedNodes: 0,
        startTime: 0,
        endTime: 3000,
        nodes: {
          node1: {
            nodeId: "node1",
            nodeType: "nodetool.output.TextOutput",
            nodeName: "output1",
            executionCount: 1,
            totalDuration: 2000,
            averageDuration: 2000,
            minDuration: 2000,
            maxDuration: 2000,
            lastDuration: 2000,
            status: "completed"
          },
          node2: {
            nodeId: "node2",
            nodeType: "nodetool.input.StringInput",
            nodeName: "input1",
            executionCount: 1,
            totalDuration: 1000,
            averageDuration: 1000,
            minDuration: 1000,
            maxDuration: 1000,
            lastDuration: 1000,
            status: "completed"
          }
        },
        bottlenecks: [],
        efficiency: 90
      };

      const timeline = getTimelineData(profile);

      expect(timeline[0].nodeId).toBe("node1");
      expect(timeline[1].nodeId).toBe("node2");
    });
  });

  describe("compareProfiles", () => {
    it("should report improvement when execution time decreases", () => {
      const profileA: WorkflowPerformanceProfile = {
        workflowId: "workflow1",
        workflowName: "Test Workflow",
        totalDuration: 10000,
        nodeCount: 2,
        completedNodes: 2,
        failedNodes: 0,
        startTime: 0,
        endTime: 10000,
        nodes: {},
        bottlenecks: [],
        efficiency: 80
      };

      const profileB: WorkflowPerformanceProfile = {
        ...profileA,
        totalDuration: 7000,
        efficiency: 85
      };

      const result = compareProfiles(profileA, profileB);

      expect(result.improvement).toBeGreaterThan(0);
      expect(result.changes).toContainEqual(expect.stringContaining("reduced"));
    });

    it("should report degradation when execution time increases", () => {
      const profileA: WorkflowPerformanceProfile = {
        workflowId: "workflow1",
        workflowName: "Test Workflow",
        totalDuration: 5000,
        nodeCount: 2,
        completedNodes: 2,
        failedNodes: 0,
        startTime: 0,
        endTime: 5000,
        nodes: {},
        bottlenecks: [],
        efficiency: 90
      };

      const profileB: WorkflowPerformanceProfile = {
        ...profileA,
        totalDuration: 8000,
        efficiency: 75
      };

      const result = compareProfiles(profileA, profileB);

      expect(result.improvement).toBeLessThan(0);
      expect(result.changes).toContainEqual(expect.stringContaining("increased"));
    });

    it("should report efficiency changes", () => {
      const profileA: WorkflowPerformanceProfile = {
        workflowId: "workflow1",
        workflowName: "Test Workflow",
        totalDuration: 5000,
        nodeCount: 2,
        completedNodes: 2,
        failedNodes: 0,
        startTime: 0,
        endTime: 5000,
        nodes: {},
        bottlenecks: [],
        efficiency: 70
      };

      const profileB: WorkflowPerformanceProfile = {
        ...profileA,
        efficiency: 90
      };

      const result = compareProfiles(profileA, profileB);

      expect(result.changes).toContainEqual(expect.stringContaining("improved"));
    });

    it("should handle zero duration profile A", () => {
      const profileA: WorkflowPerformanceProfile = {
        workflowId: "workflow1",
        workflowName: "Test Workflow",
        totalDuration: 0,
        nodeCount: 2,
        completedNodes: 2,
        failedNodes: 0,
        startTime: 0,
        endTime: 0,
        nodes: {},
        bottlenecks: [],
        efficiency: 0
      };

      const profileB: WorkflowPerformanceProfile = {
        ...profileA,
        totalDuration: 5000,
        efficiency: 80
      };

      const result = compareProfiles(profileA, profileB);

      expect(result.improvement).toBe(0);
    });
  });
});
