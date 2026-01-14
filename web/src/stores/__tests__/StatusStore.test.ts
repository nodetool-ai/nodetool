import useStatusStore, { hashKey } from "../StatusStore";

describe("StatusStore", () => {
  beforeEach(() => {
    useStatusStore.setState({ statuses: {} });
  });

  describe("hashKey", () => {
    it("should create a unique key from workflowId and nodeId", () => {
      expect(hashKey("workflow1", "node1")).toBe("workflow1:node1");
      expect(hashKey("workflow2", "node2")).toBe("workflow2:node2");
    });
  });

  describe("setStatus", () => {
    it("should set status for a specific workflow and node", () => {
      const { setStatus, getStatus } = useStatusStore.getState();

      setStatus("workflow1", "node1", "running");

      expect(getStatus("workflow1", "node1")).toBe("running");
    });

    it("should update existing status", () => {
      const { setStatus, getStatus } = useStatusStore.getState();

      setStatus("workflow1", "node1", "running");
      expect(getStatus("workflow1", "node1")).toBe("running");

      setStatus("workflow1", "node1", "completed");
      expect(getStatus("workflow1", "node1")).toBe("completed");
    });

    it("should handle different workflows and nodes independently", () => {
      const { setStatus, getStatus } = useStatusStore.getState();

      setStatus("workflow1", "node1", "running");
      setStatus("workflow1", "node2", "pending");
      setStatus("workflow2", "node1", "completed");

      expect(getStatus("workflow1", "node1")).toBe("running");
      expect(getStatus("workflow1", "node2")).toBe("pending");
      expect(getStatus("workflow2", "node1")).toBe("completed");
    });

    it("should handle complex status objects", () => {
      const { setStatus, getStatus } = useStatusStore.getState();

      const statusObject = {
        progress: 75,
        message: "Processing...",
        timestamp: new Date()
      };

      setStatus("workflow1", "node1", statusObject);

      expect(getStatus("workflow1", "node1")).toEqual(statusObject);
    });
  });

  describe("getStatus", () => {
    it("should return undefined for non-existent status", () => {
      const { getStatus } = useStatusStore.getState();

      expect(getStatus("workflow1", "node1")).toBeUndefined();
    });

    it("should return the correct status for existing entries", () => {
      const { setStatus, getStatus } = useStatusStore.getState();

      setStatus("workflow1", "node1", "running");
      setStatus("workflow1", "node2", "completed");

      expect(getStatus("workflow1", "node1")).toBe("running");
      expect(getStatus("workflow1", "node2")).toBe("completed");
    });
  });

  describe("clearStatuses", () => {
    it("should clear all statuses for a specific workflow", () => {
      const { setStatus, getStatus, clearStatuses } = useStatusStore.getState();

      setStatus("workflow1", "node1", "running");
      setStatus("workflow1", "node2", "completed");
      setStatus("workflow2", "node1", "pending");

      expect(getStatus("workflow1", "node1")).toBe("running");
      expect(getStatus("workflow1", "node2")).toBe("completed");
      expect(getStatus("workflow2", "node1")).toBe("pending");

      clearStatuses("workflow1");

      expect(getStatus("workflow1", "node1")).toBeUndefined();
      expect(getStatus("workflow1", "node2")).toBeUndefined();
      expect(getStatus("workflow2", "node1")).toBe("pending");
    });

    it("should handle clearing non-existent workflow", () => {
      const { clearStatuses } = useStatusStore.getState();

      // Should not throw error
      expect(() => clearStatuses("non-existent")).not.toThrow();
    });

    it("should handle workflows with special characters in names", () => {
      const { setStatus, getStatus, clearStatuses } = useStatusStore.getState();

      const workflowId = "workflow:with:colons";
      setStatus(workflowId, "node1", "running");

      expect(getStatus(workflowId, "node1")).toBe("running");

      clearStatuses(workflowId);

      expect(getStatus(workflowId, "node1")).toBeUndefined();
    });
  });

  describe("store state management", () => {
    it("should maintain state across multiple operations", () => {
      const { setStatus, getStatus, clearStatuses } = useStatusStore.getState();

      // Set multiple statuses
      setStatus("workflow1", "node1", "running");
      setStatus("workflow1", "node2", "pending");
      setStatus("workflow2", "node1", "completed");

      // Verify all statuses are set
      expect(getStatus("workflow1", "node1")).toBe("running");
      expect(getStatus("workflow1", "node2")).toBe("pending");
      expect(getStatus("workflow2", "node1")).toBe("completed");

      // Clear one workflow
      clearStatuses("workflow1");

      // Verify correct statuses remain
      expect(getStatus("workflow1", "node1")).toBeUndefined();
      expect(getStatus("workflow1", "node2")).toBeUndefined();
      expect(getStatus("workflow2", "node1")).toBe("completed");
    });

    it("should handle empty state correctly", () => {
      const { getStatus } = useStatusStore.getState();

      expect(getStatus("any-workflow", "any-node")).toBeUndefined();
    });
  });

  describe("edge cases", () => {
    it("should handle empty strings as workflowId and nodeId", () => {
      const { setStatus, getStatus } = useStatusStore.getState();

      setStatus("", "", "pending");

      expect(getStatus("", "")).toBe("pending");
      expect(hashKey("", "")).toBe(":");
    });

    it("should handle special characters in workflowId and nodeId", () => {
      const { setStatus, getStatus } = useStatusStore.getState();

      const workflowId = "workflow@#$%^&*()";
      const nodeId = "node@#$%^&*()";

      setStatus(workflowId, nodeId, "pending");

      expect(getStatus(workflowId, nodeId)).toBe("pending");
    });

    it("should handle null values", () => {
      const { setStatus, getStatus } = useStatusStore.getState();

      setStatus("workflow1", "node1", null);

      expect(getStatus("workflow1", "node1")).toBeNull();
    });
  });
});
