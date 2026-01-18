import useStatusStore, { hashKey } from "../StatusStore";

describe("StatusStore", () => {
  beforeEach(() => {
    useStatusStore.setState({ statuses: {} });
  });

  it("initializes with empty statuses", () => {
    expect(useStatusStore.getState().statuses).toEqual({});
  });

  it("sets a status for a node", () => {
    useStatusStore.getState().setStatus("workflow-1", "node-1", "running");
    expect(useStatusStore.getState().statuses["workflow-1:node-1"]).toBe("running");
  });

  it("sets multiple statuses for different nodes", () => {
    useStatusStore.getState().setStatus("workflow-1", "node-1", "running");
    useStatusStore.getState().setStatus("workflow-1", "node-2", "completed");
    useStatusStore.getState().setStatus("workflow-2", "node-1", "pending");

    expect(useStatusStore.getState().statuses["workflow-1:node-1"]).toBe("running");
    expect(useStatusStore.getState().statuses["workflow-1:node-2"]).toBe("completed");
    expect(useStatusStore.getState().statuses["workflow-2:node-1"]).toBe("pending");
  });

  it("sets object as status", () => {
    const statusObj = { progress: 50, message: "Processing" };
    useStatusStore.getState().setStatus("workflow-1", "node-1", statusObj);
    expect(useStatusStore.getState().statuses["workflow-1:node-1"]).toEqual(statusObj);
  });

  it("gets status for a node", () => {
    useStatusStore.getState().setStatus("workflow-1", "node-1", "completed");
    expect(useStatusStore.getState().getStatus("workflow-1", "node-1")).toBe("completed");
  });

  it("returns undefined for non-existent status", () => {
    expect(useStatusStore.getState().getStatus("workflow-1", "node-999")).toBeUndefined();
  });

  it("clears all statuses for a workflow", () => {
    useStatusStore.getState().setStatus("workflow-1", "node-1", "running");
    useStatusStore.getState().setStatus("workflow-1", "node-2", "completed");
    useStatusStore.getState().setStatus("workflow-2", "node-1", "pending");

    useStatusStore.getState().clearStatuses("workflow-1");

    expect(useStatusStore.getState().statuses["workflow-1:node-1"]).toBeUndefined();
    expect(useStatusStore.getState().statuses["workflow-1:node-2"]).toBeUndefined();
    expect(useStatusStore.getState().statuses["workflow-2:node-1"]).toBe("pending");
  });

  it("overwrites existing status with new status", () => {
    useStatusStore.getState().setStatus("workflow-1", "node-1", "pending");
    useStatusStore.getState().setStatus("workflow-1", "node-1", "running");

    expect(useStatusStore.getState().statuses["workflow-1:node-1"]).toBe("running");
  });

  it("handles null status", () => {
    useStatusStore.getState().setStatus("workflow-1", "node-1", null);
    expect(useStatusStore.getState().statuses["workflow-1:node-1"]).toBeNull();
  });

  it("handles undefined status", () => {
    useStatusStore.getState().setStatus("workflow-1", "node-1", undefined);
    expect(useStatusStore.getState().statuses["workflow-1:node-1"]).toBeUndefined();
  });

  describe("hashKey", () => {
    it("creates correct hash key", () => {
      expect(hashKey("workflow-1", "node-1")).toBe("workflow-1:node-1");
    });

    it("handles special characters in IDs", () => {
      expect(hashKey("wf-1", "nd-1")).toBe("wf-1:nd-1");
    });
  });
});
