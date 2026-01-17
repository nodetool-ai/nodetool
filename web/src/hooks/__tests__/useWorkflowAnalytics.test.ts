import { renderHook } from "@testing-library/react";
import { useWorkflowAnalytics, formatDuration } from "../useWorkflowAnalytics";

jest.mock("@xyflow/react", () => ({
  useReactFlow: jest.fn(() => ({
    getNodes: jest.fn(() => []),
    getEdges: jest.fn(() => [])
  }))
}));

jest.mock("../../contexts/NodeContext", () => ({
  useNodes: jest.fn()
}));

jest.mock("../../stores/ExecutionTimeStore", () => ({
  __esModule: true,
  default: jest.fn()
}));

jest.mock("../../stores/StatusStore", () => ({
  __esModule: true,
  default: jest.fn()
}));

import { useNodes } from "../../contexts/NodeContext";
import useExecutionTimeStore from "../../stores/ExecutionTimeStore";
import useStatusStore from "../../stores/StatusStore";

describe("useWorkflowAnalytics", () => {
  const mockNodes = [
    { id: "node1", type: "test", data: { label: "Node 1" }, selected: false, measured: { width: 100, height: 50 } },
    { id: "node2", type: "test", data: { label: "Node 2" }, selected: false, measured: { width: 100, height: 50 } },
    { id: "node3", type: "test", data: { label: "Node 3" }, selected: false, measured: { width: 100, height: 50 } }
  ];

  const mockEdges = [
    { id: "edge1", source: "node1", target: "node2", sourceHandle: "output", targetHandle: "input" },
    { id: "edge2", source: "node2", target: "node3", sourceHandle: "output", targetHandle: "input" }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (useNodes as jest.Mock).mockImplementation((sel: any) =>
      sel({
        nodes: mockNodes,
        edges: mockEdges
      })
    );
    (useExecutionTimeStore as unknown as jest.Mock).mockImplementation((sel: any) =>
      sel({
        timings: {},
        getDuration: jest.fn(() => undefined)
      })
    );
    (useStatusStore as unknown as jest.Mock).mockImplementation((sel: any) =>
      sel({
        statuses: {},
        getStatus: jest.fn(() => undefined)
      })
    );
  });

  describe("formatDuration", () => {
    it("formats milliseconds correctly", () => {
      expect(formatDuration(500)).toBe("500ms");
      expect(formatDuration(999)).toBe("999ms");
    });

    it("formats seconds correctly", () => {
      expect(formatDuration(1000)).toBe("1s");
      expect(formatDuration(1500)).toBe("1s 500ms");
      expect(formatDuration(59999)).toBe("59s 999ms");
    });

    it("formats minutes correctly", () => {
      expect(formatDuration(60000)).toBe("1m");
      expect(formatDuration(90000)).toBe("1m 30s");
      expect(formatDuration(3600000)).toBe("1h");
    });

    it("formats hours correctly", () => {
      expect(formatDuration(3600000)).toBe("1h");
      expect(formatDuration(5400000)).toBe("1h 30m");
    });
  });

  describe("useWorkflowAnalytics", () => {
    it("returns empty analytics for no nodes", () => {
      (useNodes as jest.Mock).mockImplementation((sel: any) =>
        sel({ nodes: [], edges: [] })
      );

      const { result } = renderHook(() =>
        useWorkflowAnalytics({ workflowId: "test-workflow" })
      );

      expect(result.current.nodeCount).toBe(0);
      expect(result.current.edgeCount).toBe(0);
      expect(result.current.executedNodes).toBe(0);
      expect(result.current.totalDuration).toBeUndefined();
      expect(result.current.completionPercentage).toBe(0);
    });

    it("calculates analytics with execution times", () => {
      (useExecutionTimeStore as unknown as jest.Mock).mockImplementation((sel: any) =>
        sel({
          timings: {
            "test-workflow:node1": { startTime: 0, endTime: 1000 },
            "test-workflow:node2": { startTime: 1000, endTime: 2500 },
            "test-workflow:node3": { startTime: 2500, endTime: 3000 }
          },
          getDuration: jest.fn((workflowId, nodeId) => {
            const durations: Record<string, number> = {
              "test-workflow:node1": 1000,
              "test-workflow:node2": 1500,
              "test-workflow:node3": 500
            };
            return durations[`${workflowId}:${nodeId}`];
          })
        })
      );

      const { result } = renderHook(() =>
        useWorkflowAnalytics({ workflowId: "test-workflow" })
      );

      expect(result.current.nodeCount).toBe(3);
      expect(result.current.edgeCount).toBe(2);
      expect(result.current.executedNodes).toBe(3);
      expect(result.current.totalDuration).toBe(3000);
      expect(result.current.averageNodeDuration).toBe(1000);
      expect(result.current.completionPercentage).toBe(100);
      expect(result.current.slowestNode?.id).toBe("node2");
      expect(result.current.fastestNode?.id).toBe("node3");
    });

    it("detects errors in workflow", () => {
      (useStatusStore as unknown as jest.Mock).mockImplementation((sel: any) =>
        sel({
          statuses: {
            "test-workflow:node1": "completed",
            "test-workflow:node2": "error",
            "test-workflow:node3": "running"
          },
          getStatus: jest.fn((workflowId, nodeId) => {
            const statuses: Record<string, string> = {
              "test-workflow:node1": "completed",
              "test-workflow:node2": "error",
              "test-workflow:node3": "running"
            };
            return statuses[`${workflowId}:${nodeId}`];
          })
        })
      );

      const { result } = renderHook(() =>
        useWorkflowAnalytics({ workflowId: "test-workflow" })
      );

      expect(result.current.hasErrors).toBe(true);
    });

    it("sorts nodes by duration", () => {
      (useExecutionTimeStore as unknown as jest.Mock).mockImplementation((sel: any) =>
        sel({
          timings: {},
          getDuration: jest.fn((workflowId, nodeId) => {
            const durations: Record<string, number> = {
              "test-workflow:node1": 500,
              "test-workflow:node2": 3000,
              "test-workflow:node3": 1500
            };
            return durations[`${workflowId}:${nodeId}`];
          })
        })
      );

      const { result } = renderHook(() =>
        useWorkflowAnalytics({ workflowId: "test-workflow" })
      );

      expect(result.current.nodesByDuration).toHaveLength(3);
      expect(result.current.nodesByDuration[0].id).toBe("node2");
      expect(result.current.nodesByDuration[1].id).toBe("node3");
      expect(result.current.nodesByDuration[2].id).toBe("node1");
    });

    it("calculates partial completion", () => {
      (useExecutionTimeStore as unknown as jest.Mock).mockImplementation((sel: any) =>
        sel({
          timings: {
            "test-workflow:node1": { startTime: 0, endTime: 1000 }
          },
          getDuration: jest.fn((workflowId, nodeId) => {
            if (nodeId === "node1") {
              return 1000;
            }
            return undefined;
          })
        })
      );
      (useStatusStore as unknown as jest.Mock).mockImplementation((sel: any) =>
        sel({
          statuses: {
            "test-workflow:node1": "completed",
            "test-workflow:node2": "pending",
            "test-workflow:node3": "pending"
          },
          getStatus: jest.fn((workflowId, nodeId) => {
            const statuses: Record<string, string> = {
              "test-workflow:node1": "completed",
              "test-workflow:node2": "pending",
              "test-workflow:node3": "pending"
            };
            return statuses[`${workflowId}:${nodeId}`];
          })
        })
      );

      const { result } = renderHook(() =>
        useWorkflowAnalytics({ workflowId: "test-workflow" })
      );

      expect(result.current.executedNodes).toBe(1);
      expect(result.current.completionPercentage).toBe(33);
    });
  });
});
