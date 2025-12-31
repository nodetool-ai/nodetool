import { act } from "@testing-library/react";
import useLogsStore from "../LogStore";

describe("LogStore", () => {
  beforeEach(() => {
    // Reset store to initial state
    useLogsStore.setState({ logs: [] });
  });

  describe("initial state", () => {
    it("has empty logs array", () => {
      const { logs } = useLogsStore.getState();
      expect(logs).toEqual([]);
    });
  });

  describe("appendLog", () => {
    it("appends a log entry", () => {
      const log = {
        workflowId: "workflow1",
        workflowName: "Test Workflow",
        nodeId: "node1",
        nodeName: "Test Node",
        content: "Log message",
        severity: "info" as const,
        timestamp: Date.now()
      };

      act(() => {
        useLogsStore.getState().appendLog(log);
      });

      const { logs } = useLogsStore.getState();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toEqual(log);
    });

    it("appends multiple logs in order", () => {
      const logs = [
        {
          workflowId: "workflow1",
          workflowName: "Test Workflow",
          nodeId: "node1",
          nodeName: "Test Node",
          content: "First log",
          severity: "info" as const,
          timestamp: 1000
        },
        {
          workflowId: "workflow1",
          workflowName: "Test Workflow",
          nodeId: "node1",
          nodeName: "Test Node",
          content: "Second log",
          severity: "warning" as const,
          timestamp: 2000
        },
        {
          workflowId: "workflow1",
          workflowName: "Test Workflow",
          nodeId: "node1",
          nodeName: "Test Node",
          content: "Third log",
          severity: "error" as const,
          timestamp: 3000
        }
      ];

      act(() => {
        logs.forEach((log) => useLogsStore.getState().appendLog(log));
      });

      const { logs: storedLogs } = useLogsStore.getState();
      expect(storedLogs).toHaveLength(3);
      expect(storedLogs[0].content).toBe("First log");
      expect(storedLogs[1].content).toBe("Second log");
      expect(storedLogs[2].content).toBe("Third log");
    });

    it("handles all severity levels", () => {
      const severities = ["info", "warning", "error"] as const;

      act(() => {
        severities.forEach((severity) => {
          useLogsStore.getState().appendLog({
            workflowId: "workflow1",
            workflowName: "Test Workflow",
            nodeId: "node1",
            nodeName: "Test Node",
            content: `${severity} log`,
            severity,
            timestamp: Date.now()
          });
        });
      });

      const { logs } = useLogsStore.getState();
      expect(logs).toHaveLength(3);
      expect(logs.map((l) => l.severity)).toEqual(severities);
    });

    it("truncates content exceeding MAX_LOG_CONTENT_CHARS", () => {
      const longContent = "x".repeat(25000); // Exceeds 20_000 limit

      act(() => {
        useLogsStore.getState().appendLog({
          workflowId: "workflow1",
          workflowName: "Test Workflow",
          nodeId: "node1",
          nodeName: "Test Node",
          content: longContent,
          severity: "info",
          timestamp: Date.now()
        });
      });

      const { logs } = useLogsStore.getState();
      expect(logs[0].content.length).toBeLessThanOrEqual(20000 + 20); // Original + truncation message
      expect(logs[0].content).toContain("… (truncated)");
    });

    it("does not truncate content within limit", () => {
      const normalContent = "x".repeat(1000);

      act(() => {
        useLogsStore.getState().appendLog({
          workflowId: "workflow1",
          workflowName: "Test Workflow",
          nodeId: "node1",
          nodeName: "Test Node",
          content: normalContent,
          severity: "info",
          timestamp: Date.now()
        });
      });

      const { logs } = useLogsStore.getState();
      expect(logs[0].content).toBe(normalContent);
      expect(logs[0].content).not.toContain("… (truncated)");
    });

    it("converts non-string content to string", () => {
      act(() => {
        useLogsStore.getState().appendLog({
          workflowId: "workflow1",
          workflowName: "Test Workflow",
          nodeId: "node1",
          nodeName: "Test Node",
          content: 12345 as unknown as string, // Force non-string
          severity: "info",
          timestamp: Date.now()
        });
      });

      const { logs } = useLogsStore.getState();
      expect(logs[0].content).toBe("12345");
    });

    it("respects MAX_LOGS_TOTAL limit", () => {
      // The limit is 5000, but let's test with a smaller number
      // by checking the trimming behavior
      act(() => {
        for (let i = 0; i < 5010; i++) {
          useLogsStore.getState().appendLog({
            workflowId: "workflow1",
            workflowName: "Test Workflow",
            nodeId: "node1",
            nodeName: "Test Node",
            content: `Log ${i}`,
            severity: "info",
            timestamp: i
          });
        }
      });

      const { logs } = useLogsStore.getState();
      expect(logs).toHaveLength(5000);
      // First log should be trimmed, last logs should be present
      expect(logs[0].content).toBe("Log 10"); // First 10 should be trimmed
      expect(logs[logs.length - 1].content).toBe("Log 5009");
    });

    it("preserves optional data property", () => {
      const logWithData = {
        workflowId: "workflow1",
        workflowName: "Test Workflow",
        nodeId: "node1",
        nodeName: "Test Node",
        content: "Log with data",
        severity: "info" as const,
        timestamp: Date.now(),
        data: { key: "value", count: 42 }
      };

      act(() => {
        useLogsStore.getState().appendLog(logWithData);
      });

      const { logs } = useLogsStore.getState();
      expect(logs[0].data).toEqual({ key: "value", count: 42 });
    });
  });

  describe("getLogs", () => {
    beforeEach(() => {
      // Setup test logs
      const testLogs = [
        {
          workflowId: "workflow1",
          workflowName: "Workflow 1",
          nodeId: "node1",
          nodeName: "Node 1",
          content: "Log 1.1",
          severity: "info" as const,
          timestamp: 1000
        },
        {
          workflowId: "workflow1",
          workflowName: "Workflow 1",
          nodeId: "node2",
          nodeName: "Node 2",
          content: "Log 1.2",
          severity: "info" as const,
          timestamp: 2000
        },
        {
          workflowId: "workflow2",
          workflowName: "Workflow 2",
          nodeId: "node1",
          nodeName: "Node 1",
          content: "Log 2.1",
          severity: "info" as const,
          timestamp: 3000
        }
      ];

      act(() => {
        testLogs.forEach((log) => useLogsStore.getState().appendLog(log));
      });
    });

    it("returns logs for specific workflow and node", () => {
      const logs = useLogsStore.getState().getLogs("workflow1", "node1");
      expect(logs).toHaveLength(1);
      expect(logs[0].content).toBe("Log 1.1");
    });

    it("returns empty array when no matching logs", () => {
      const logs = useLogsStore.getState().getLogs("nonexistent", "node1");
      expect(logs).toEqual([]);
    });

    it("filters by both workflowId and nodeId", () => {
      const logs1 = useLogsStore.getState().getLogs("workflow1", "node1");
      const logs2 = useLogsStore.getState().getLogs("workflow1", "node2");
      const logs3 = useLogsStore.getState().getLogs("workflow2", "node1");

      expect(logs1).toHaveLength(1);
      expect(logs2).toHaveLength(1);
      expect(logs3).toHaveLength(1);
      expect(logs1[0].content).toBe("Log 1.1");
      expect(logs2[0].content).toBe("Log 1.2");
      expect(logs3[0].content).toBe("Log 2.1");
    });

    it("returns multiple logs for same workflow/node", () => {
      act(() => {
        useLogsStore.getState().appendLog({
          workflowId: "workflow1",
          workflowName: "Workflow 1",
          nodeId: "node1",
          nodeName: "Node 1",
          content: "Another log",
          severity: "warning",
          timestamp: 4000
        });
      });

      const logs = useLogsStore.getState().getLogs("workflow1", "node1");
      expect(logs).toHaveLength(2);
    });
  });

  describe("clearLogs", () => {
    it("clears all logs", () => {
      act(() => {
        useLogsStore.getState().appendLog({
          workflowId: "workflow1",
          workflowName: "Test",
          nodeId: "node1",
          nodeName: "Test Node",
          content: "Test log",
          severity: "info",
          timestamp: Date.now()
        });
      });

      expect(useLogsStore.getState().logs).toHaveLength(1);

      act(() => {
        useLogsStore.getState().clearLogs();
      });

      expect(useLogsStore.getState().logs).toHaveLength(0);
    });

    it("works when already empty", () => {
      act(() => {
        useLogsStore.getState().clearLogs();
      });

      expect(useLogsStore.getState().logs).toHaveLength(0);
    });
  });

  describe("edge cases", () => {
    it("handles empty string content", () => {
      act(() => {
        useLogsStore.getState().appendLog({
          workflowId: "workflow1",
          workflowName: "Test",
          nodeId: "node1",
          nodeName: "Test Node",
          content: "",
          severity: "info",
          timestamp: Date.now()
        });
      });

      const { logs } = useLogsStore.getState();
      expect(logs[0].content).toBe("");
    });

    it("handles special characters in content", () => {
      const specialContent = "Test with special chars: <script>alert('xss')</script> & \"quotes\"";

      act(() => {
        useLogsStore.getState().appendLog({
          workflowId: "workflow1",
          workflowName: "Test",
          nodeId: "node1",
          nodeName: "Test Node",
          content: specialContent,
          severity: "info",
          timestamp: Date.now()
        });
      });

      const { logs } = useLogsStore.getState();
      expect(logs[0].content).toBe(specialContent);
    });

    it("handles multiline content", () => {
      const multilineContent = "Line 1\nLine 2\nLine 3";

      act(() => {
        useLogsStore.getState().appendLog({
          workflowId: "workflow1",
          workflowName: "Test",
          nodeId: "node1",
          nodeName: "Test Node",
          content: multilineContent,
          severity: "info",
          timestamp: Date.now()
        });
      });

      const { logs } = useLogsStore.getState();
      expect(logs[0].content).toBe(multilineContent);
    });
  });
});
