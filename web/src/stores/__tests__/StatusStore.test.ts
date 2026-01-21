import useStatusStore from "../StatusStore";

describe("StatusStore", () => {
  beforeEach(() => {
    useStatusStore.setState(useStatusStore.getInitialState());
  });

  afterEach(() => {
    useStatusStore.setState(useStatusStore.getInitialState());
  });

  describe("initial state", () => {
    it("has empty statuses initially", () => {
      expect(useStatusStore.getState().statuses).toEqual({});
    });
  });

  describe("setStatus", () => {
    it("sets status for a node", () => {
      useStatusStore.getState().setStatus("workflow-1", "node-1", "running");

      const status = useStatusStore.getState().statuses["workflow-1:node-1"];
      expect(status).toBe("running");
    });

    it("overwrites existing status", () => {
      useStatusStore.getState().setStatus("workflow-1", "node-1", "pending");
      useStatusStore.getState().setStatus("workflow-1", "node-1", "running");

      const status = useStatusStore.getState().statuses["workflow-1:node-1"];
      expect(status).toBe("running");
    });

    it("stores status as object", () => {
      const statusObj = { message: "Processing", progress: 50 };
      useStatusStore.getState().setStatus("workflow-1", "node-1", statusObj);

      const status = useStatusStore.getState().statuses["workflow-1:node-1"];
      expect(status).toEqual(statusObj);
    });

    it("stores null status", () => {
      useStatusStore.getState().setStatus("workflow-1", "node-1", null);

      const status = useStatusStore.getState().statuses["workflow-1:node-1"];
      expect(status).toBeNull();
    });

    it("stores different workflows separately", () => {
      useStatusStore.getState().setStatus("workflow-1", "node-1", "running");
      useStatusStore.getState().setStatus("workflow-2", "node-1", "completed");

      const status1 = useStatusStore.getState().statuses["workflow-1:node-1"];
      const status2 = useStatusStore.getState().statuses["workflow-2:node-1"];
      expect(status1).toBe("running");
      expect(status2).toBe("completed");
    });

    it("stores multiple nodes in same workflow", () => {
      useStatusStore.getState().setStatus("workflow-1", "node-1", "running");
      useStatusStore.getState().setStatus("workflow-1", "node-2", "completed");

      const status1 = useStatusStore.getState().statuses["workflow-1:node-1"];
      const status2 = useStatusStore.getState().statuses["workflow-1:node-2"];
      expect(status1).toBe("running");
      expect(status2).toBe("completed");
    });
  });

  describe("getStatus", () => {
    it("returns status for existing node", () => {
      useStatusStore.getState().setStatus("workflow-1", "node-1", "completed");

      const status = useStatusStore.getState().getStatus("workflow-1", "node-1");
      expect(status).toBe("completed");
    });

    it("returns undefined for non-existing node", () => {
      const status = useStatusStore.getState().getStatus("workflow-1", "non-existent");
      expect(status).toBeUndefined();
    });

    it("returns undefined for non-existing workflow", () => {
      const status = useStatusStore.getState().getStatus("non-existent", "node-1");
      expect(status).toBeUndefined();
    });

    it("returns status after multiple sets", () => {
      useStatusStore.getState().setStatus("workflow-1", "node-1", "pending");
      useStatusStore.getState().setStatus("workflow-1", "node-1", "running");

      const status = useStatusStore.getState().getStatus("workflow-1", "node-1");
      expect(status).toBe("running");
    });
  });

  describe("clearStatuses", () => {
    it("clears statuses for specific workflow", () => {
      useStatusStore.getState().setStatus("workflow-1", "node-1", "running");
      useStatusStore.getState().setStatus("workflow-1", "node-2", "completed");
      useStatusStore.getState().setStatus("workflow-2", "node-1", "running");

      useStatusStore.getState().clearStatuses("workflow-1");

      expect(useStatusStore.getState().statuses["workflow-1:node-1"]).toBeUndefined();
      expect(useStatusStore.getState().statuses["workflow-1:node-2"]).toBeUndefined();
      expect(useStatusStore.getState().statuses["workflow-2:node-1"]).toBe("running");
    });

    it("clears all statuses when workflow has no nodes", () => {
      useStatusStore.getState().clearStatuses("workflow-1");

      expect(useStatusStore.getState().statuses).toEqual({});
    });

    it("does not affect other workflows", () => {
      useStatusStore.getState().setStatus("workflow-1", "node-1", "running");
      useStatusStore.getState().setStatus("workflow-2", "node-1", "completed");

      useStatusStore.getState().clearStatuses("workflow-1");

      expect(useStatusStore.getState().statuses["workflow-2:node-1"]).toBe("completed");
    });

    it("handles clearing non-existent workflow", () => {
      useStatusStore.getState().setStatus("workflow-1", "node-1", "running");
      
      expect(() => {
        useStatusStore.getState().clearStatuses("non-existent");
      }).not.toThrow();
    });
  });

  describe("hashKey", () => {
    it("creates correct hash key format", () => {
      expect(useStatusStore.getState().statuses["workflow-1:node-1"]).toBeUndefined();
    });
  });

  describe("status value types", () => {
    it("handles string status", () => {
      useStatusStore.getState().setStatus("workflow-1", "node-1", "running");
      expect(useStatusStore.getState().getStatus("workflow-1", "node-1")).toBe("running");
    });

    it("handles object status", () => {
      const statusObj = { code: 200, message: "Success" };
      useStatusStore.getState().setStatus("workflow-1", "node-1", statusObj);
      expect(useStatusStore.getState().getStatus("workflow-1", "node-1")).toEqual(statusObj);
    });

    it("handles undefined status", () => {
      useStatusStore.getState().setStatus("workflow-1", "node-1", undefined);
      expect(useStatusStore.getState().getStatus("workflow-1", "node-1")).toBeUndefined();
    });

    it("handles null status", () => {
      useStatusStore.getState().setStatus("workflow-1", "node-1", null);
      expect(useStatusStore.getState().getStatus("workflow-1", "node-1")).toBeNull();
    });
  });

  describe("workflow isolation", () => {
    it("maintains isolation between workflows", () => {
      useStatusStore.getState().setStatus("wf-a", "node-1", "status-a");
      useStatusStore.getState().setStatus("wf-b", "node-1", "status-b");
      useStatusStore.getState().clearStatuses("wf-a");

      expect(useStatusStore.getState().getStatus("wf-a", "node-1")).toBeUndefined();
      expect(useStatusStore.getState().getStatus("wf-b", "node-1")).toBe("status-b");
    });

    it("handles many nodes in workflow", () => {
      for (let i = 0; i < 10; i++) {
        useStatusStore.getState().setStatus("workflow-1", `node-${i}`, `status-${i}`);
      }

      expect(useStatusStore.getState().getStatus("workflow-1", "node-5")).toBe("status-5");
      expect(useStatusStore.getState().getStatus("workflow-1", "node-9")).toBe("status-9");
    });
  });
});
