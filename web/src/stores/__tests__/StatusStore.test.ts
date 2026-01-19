import useStatusStore, { hashKey } from "../StatusStore";

describe("StatusStore", () => {
  beforeEach(() => {
    useStatusStore.setState({ statuses: {} });
  });

  describe("initial state", () => {
    it("should have correct initial values", () => {
      const state = useStatusStore.getState();

      expect(state.statuses).toEqual({});
    });
  });

  describe("setStatus", () => {
    it("should set status for a node with workflow ID", () => {
      const { setStatus } = useStatusStore.getState();
      setStatus("workflow-1", "node-1", "running");

      expect(useStatusStore.getState().statuses["workflow-1:node-1"]).toBe("running");
    });

    it("should set status for multiple nodes", () => {
      const { setStatus } = useStatusStore.getState();
      setStatus("workflow-1", "node-1", "completed");
      setStatus("workflow-1", "node-2", "running");

      expect(useStatusStore.getState().statuses["workflow-1:node-1"]).toBe("completed");
      expect(useStatusStore.getState().statuses["workflow-1:node-2"]).toBe("running");
    });

    it("should overwrite existing status", () => {
      const { setStatus } = useStatusStore.getState();
      setStatus("workflow-1", "node-1", "pending");
      setStatus("workflow-1", "node-1", "running");

      expect(useStatusStore.getState().statuses["workflow-1:node-1"]).toBe("running");
    });

    it("should handle different status values", () => {
      const { setStatus } = useStatusStore.getState();
      const statuses = ["running", "completed", "error", "pending", null, "custom"];

      statuses.forEach((status, index) => {
        setStatus("workflow-1", `node-${index}`, status);
        expect(useStatusStore.getState().statuses[`workflow-1:node-${index}`]).toBe(status);
      });
    });

    it("should handle object status values", () => {
      const { setStatus } = useStatusStore.getState();
      const objectStatus = { progress: 50, message: "Processing" };
      setStatus("workflow-1", "node-1", objectStatus);

      expect(useStatusStore.getState().statuses["workflow-1:node-1"]).toEqual(objectStatus);
    });

    it("should isolate statuses for different workflows", () => {
      const { setStatus } = useStatusStore.getState();
      setStatus("workflow-1", "node-1", "running");
      setStatus("workflow-2", "node-1", "completed");

      expect(useStatusStore.getState().statuses["workflow-1:node-1"]).toBe("running");
      expect(useStatusStore.getState().statuses["workflow-2:node-1"]).toBe("completed");
    });
  });

  describe("getStatus", () => {
    it("should get status for a node", () => {
      const { setStatus, getStatus } = useStatusStore.getState();
      setStatus("workflow-1", "node-1", "running");

      expect(getStatus("workflow-1", "node-1")).toBe("running");
    });

    it("should return undefined for non-existent node", () => {
      const { getStatus } = useStatusStore.getState();

      expect(getStatus("workflow-1", "non-existent")).toBeUndefined();
    });

    it("should return undefined for non-existent workflow", () => {
      const { setStatus, getStatus } = useStatusStore.getState();
      setStatus("workflow-1", "node-1", "running");

      expect(getStatus("workflow-2", "node-1")).toBeUndefined();
    });

    it("should return null for cleared status", () => {
      const { setStatus, getStatus } = useStatusStore.getState();
      setStatus("workflow-1", "node-1", null);

      expect(getStatus("workflow-1", "node-1")).toBeNull();
    });
  });

  describe("clearStatuses", () => {
    it("should clear all statuses for a workflow", () => {
      const { setStatus, clearStatuses } = useStatusStore.getState();
      setStatus("workflow-1", "node-1", "completed");
      setStatus("workflow-1", "node-2", "running");
      setStatus("workflow-2", "node-1", "pending");
      clearStatuses("workflow-1");

      const state = useStatusStore.getState();
      expect(state.statuses["workflow-1:node-1"]).toBeUndefined();
      expect(state.statuses["workflow-1:node-2"]).toBeUndefined();
      expect(state.statuses["workflow-2:node-1"]).toBe("pending");
    });

    it("should handle clearing non-existent workflow", () => {
      const { setStatus, clearStatuses } = useStatusStore.getState();
      setStatus("workflow-1", "node-1", "running");
      clearStatuses("non-existent");

      expect(useStatusStore.getState().statuses["workflow-1:node-1"]).toBe("running");
    });

    it("should handle clearing when no statuses exist", () => {
      const { clearStatuses } = useStatusStore.getState();

      expect(() => clearStatuses("workflow-1")).not.toThrow();
      expect(useStatusStore.getState().statuses).toEqual({});
    });
  });

  describe("hashKey", () => {
    it("should generate correct hash key", () => {
      expect(hashKey("workflow-1", "node-1")).toBe("workflow-1:node-1");
    });

    it("should handle special characters in IDs", () => {
      expect(hashKey("wf-1", "nd-1")).toBe("wf-1:nd-1");
      expect(hashKey("workflow_1", "node_1")).toBe("workflow_1:node_1");
    });
  });

  describe("state isolation", () => {
    it("should maintain independent state between operations", () => {
      const { setStatus, getStatus, clearStatuses } = useStatusStore.getState();

      setStatus("workflow-1", "node-1", "running");
      const status = getStatus("workflow-1", "node-1");
      expect(status).toBe("running");

      clearStatuses("workflow-1");
      const clearedStatus = getStatus("workflow-1", "node-1");
      expect(clearedStatus).toBeUndefined();
    });

    it("should handle rapid state changes", () => {
      const { setStatus, getStatus } = useStatusStore.getState();

      setStatus("workflow-1", "node-1", "pending");
      expect(getStatus("workflow-1", "node-1")).toBe("pending");

      setStatus("workflow-1", "node-1", "running");
      expect(getStatus("workflow-1", "node-1")).toBe("running");

      setStatus("workflow-1", "node-1", "completed");
      expect(getStatus("workflow-1", "node-1")).toBe("completed");
    });

    it("should handle multiple workflows independently", () => {
      const { setStatus, getStatus, clearStatuses } = useStatusStore.getState();

      // Set statuses for multiple workflows
      setStatus("workflow-1", "node-1", "running");
      setStatus("workflow-2", "node-1", "pending");
      setStatus("workflow-3", "node-1", "completed");

      expect(getStatus("workflow-1", "node-1")).toBe("running");
      expect(getStatus("workflow-2", "node-1")).toBe("pending");
      expect(getStatus("workflow-3", "node-1")).toBe("completed");

      // Clear one workflow
      clearStatuses("workflow-2");

      expect(getStatus("workflow-1", "node-1")).toBe("running");
      expect(getStatus("workflow-2", "node-1")).toBeUndefined();
      expect(getStatus("workflow-3", "node-1")).toBe("completed");
    });
  });
});
