import useErrorStore from "../ErrorStore";

describe("ErrorStore", () => {
  beforeEach(() => {
    useErrorStore.setState({ errors: {} });
  });

  describe("initial state", () => {
    it("should have correct initial values", () => {
      const state = useErrorStore.getState();

      expect(state.errors).toEqual({});
    });
  });

  describe("setError", () => {
    it("should set error for a node with workflow ID", () => {
      const { setError } = useErrorStore.getState();
      setError("workflow-1", "node-1", "Test error message");

      expect(useErrorStore.getState().errors["workflow-1:node-1"]).toBe("Test error message");
    });

    it("should set error for multiple nodes", () => {
      const { setError } = useErrorStore.getState();
      setError("workflow-1", "node-1", "Error 1");
      setError("workflow-1", "node-2", "Error 2");

      expect(useErrorStore.getState().errors["workflow-1:node-1"]).toBe("Error 1");
      expect(useErrorStore.getState().errors["workflow-1:node-2"]).toBe("Error 2");
    });

    it("should overwrite existing error", () => {
      const { setError } = useErrorStore.getState();
      setError("workflow-1", "node-1", "First error");
      setError("workflow-1", "node-1", "Second error");

      expect(useErrorStore.getState().errors["workflow-1:node-1"]).toBe("Second error");
    });

    it("should handle different error types", () => {
      const { setError } = useErrorStore.getState();

      setError("workflow-1", "node-1", "String error");
      setError("workflow-1", "node-2", new Error("Error object"));
      setError("workflow-1", "node-3", { detail: "Object error" });
      setError("workflow-1", "node-4", null);

      expect(useErrorStore.getState().errors["workflow-1:node-1"]).toBe("String error");
      expect(useErrorStore.getState().errors["workflow-1:node-2"]).toBeInstanceOf(Error);
      expect(useErrorStore.getState().errors["workflow-1:node-3"]).toEqual({ detail: "Object error" });
      expect(useErrorStore.getState().errors["workflow-1:node-4"]).toBeNull();
    });

    it("should isolate errors for different workflows", () => {
      const { setError } = useErrorStore.getState();
      setError("workflow-1", "node-1", "Error in workflow 1");
      setError("workflow-2", "node-1", "Error in workflow 2");

      expect(useErrorStore.getState().errors["workflow-1:node-1"]).toBe("Error in workflow 1");
      expect(useErrorStore.getState().errors["workflow-2:node-1"]).toBe("Error in workflow 2");
    });
  });

  describe("getError", () => {
    it("should get error for a node", () => {
      const { setError, getError } = useErrorStore.getState();
      setError("workflow-1", "node-1", "Test error");

      expect(getError("workflow-1", "node-1")).toBe("Test error");
    });

    it("should return undefined for non-existent node", () => {
      const { getError } = useErrorStore.getState();

      expect(getError("workflow-1", "non-existent")).toBeUndefined();
    });

    it("should return undefined for non-existent workflow", () => {
      const { setError, getError } = useErrorStore.getState();
      setError("workflow-1", "node-1", "Error");

      expect(getError("workflow-2", "node-1")).toBeUndefined();
    });

    it("should return null for cleared error", () => {
      const { setError, getError } = useErrorStore.getState();
      setError("workflow-1", "node-1", null);

      expect(getError("workflow-1", "node-1")).toBeNull();
    });
  });

  describe("clearNodeErrors", () => {
    it("should clear error for a specific node", () => {
      const { setError, clearNodeErrors } = useErrorStore.getState();
      setError("workflow-1", "node-1", "Error");
      setError("workflow-1", "node-2", "Error 2");
      clearNodeErrors("workflow-1", "node-1");

      const state = useErrorStore.getState();
      expect(state.errors["workflow-1:node-1"]).toBeUndefined();
      expect(state.errors["workflow-1:node-2"]).toBe("Error 2");
    });

    it("should handle clearing non-existent node", () => {
      const { clearNodeErrors } = useErrorStore.getState();

      expect(() => clearNodeErrors("workflow-1", "non-existent")).not.toThrow();
    });
  });

  describe("clearErrors", () => {
    it("should clear all errors for a workflow", () => {
      const { setError, clearErrors } = useErrorStore.getState();
      setError("workflow-1", "node-1", "Error 1");
      setError("workflow-1", "node-2", "Error 2");
      setError("workflow-2", "node-1", "Error 3");
      clearErrors("workflow-1");

      const state = useErrorStore.getState();
      expect(state.errors["workflow-1:node-1"]).toBeUndefined();
      expect(state.errors["workflow-1:node-2"]).toBeUndefined();
      expect(state.errors["workflow-2:node-1"]).toBe("Error 3");
    });

    it("should handle clearing non-existent workflow", () => {
      const { setError, clearErrors } = useErrorStore.getState();
      setError("workflow-1", "node-1", "Error");
      clearErrors("non-existent");

      expect(useErrorStore.getState().errors["workflow-1:node-1"]).toBe("Error");
    });

    it("should handle clearing when no errors exist", () => {
      const { clearErrors } = useErrorStore.getState();

      expect(() => clearErrors("workflow-1")).not.toThrow();
      expect(useErrorStore.getState().errors).toEqual({});
    });
  });

  describe("state isolation", () => {
    it("should maintain independent state between operations", () => {
      const { setError, getError, clearErrors } = useErrorStore.getState();

      setError("workflow-1", "node-1", "Error");
      const error = getError("workflow-1", "node-1");
      expect(error).toBe("Error");

      clearErrors("workflow-1");
      const clearedError = getError("workflow-1", "node-1");
      expect(clearedError).toBeUndefined();
    });

    it("should handle rapid state changes", () => {
      const { setError, getError } = useErrorStore.getState();

      setError("workflow-1", "node-1", "Error 1");
      expect(getError("workflow-1", "node-1")).toBe("Error 1");

      setError("workflow-1", "node-1", "Error 2");
      expect(getError("workflow-1", "node-1")).toBe("Error 2");

      setError("workflow-1", "node-1", null);
      expect(getError("workflow-1", "node-1")).toBeNull();
    });

    it("should handle multiple workflows independently", () => {
      const { setError, getError, clearErrors } = useErrorStore.getState();

      setError("workflow-1", "node-1", "Error 1");
      setError("workflow-2", "node-1", "Error 2");
      setError("workflow-3", "node-1", "Error 3");

      expect(getError("workflow-1", "node-1")).toBe("Error 1");
      expect(getError("workflow-2", "node-1")).toBe("Error 2");
      expect(getError("workflow-3", "node-1")).toBe("Error 3");

      clearErrors("workflow-2");

      expect(getError("workflow-1", "node-1")).toBe("Error 1");
      expect(getError("workflow-2", "node-1")).toBeUndefined();
      expect(getError("workflow-3", "node-1")).toBe("Error 3");
    });
  });
});
