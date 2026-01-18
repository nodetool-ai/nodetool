import useErrorStore from "../ErrorStore";

describe("ErrorStore", () => {
  beforeEach(() => {
    useErrorStore.setState({ errors: {} });
  });

  it("initializes with empty errors", () => {
    expect(useErrorStore.getState().errors).toEqual({});
  });

  it("sets an error for a node", () => {
    useErrorStore.getState().setError("workflow-1", "node-1", "Test error");
    expect(useErrorStore.getState().errors["workflow-1:node-1"]).toBe("Test error");
  });

  it("sets multiple errors for different nodes", () => {
    useErrorStore.getState().setError("workflow-1", "node-1", "Error 1");
    useErrorStore.getState().setError("workflow-1", "node-2", "Error 2");
    useErrorStore.getState().setError("workflow-2", "node-1", "Error 3");

    expect(useErrorStore.getState().errors["workflow-1:node-1"]).toBe("Error 1");
    expect(useErrorStore.getState().errors["workflow-1:node-2"]).toBe("Error 2");
    expect(useErrorStore.getState().errors["workflow-2:node-1"]).toBe("Error 3");
  });

  it("sets Error object as error", () => {
    const error = new Error("Test error message");
    useErrorStore.getState().setError("workflow-1", "node-1", error);
    expect(useErrorStore.getState().errors["workflow-1:node-1"]).toBe(error);
  });

  it("sets object as error", () => {
    const errorObj = { detail: "Detailed error", code: 500 };
    useErrorStore.getState().setError("workflow-1", "node-1", errorObj);
    expect(useErrorStore.getState().errors["workflow-1:node-1"]).toEqual(errorObj);
  });

  it("gets error for a node", () => {
    useErrorStore.getState().setError("workflow-1", "node-1", "Test error");
    expect(useErrorStore.getState().getError("workflow-1", "node-1")).toBe("Test error");
  });

  it("returns undefined for non-existent error", () => {
    expect(useErrorStore.getState().getError("workflow-1", "node-999")).toBeUndefined();
  });

  it("clears node errors for specific node", () => {
    useErrorStore.getState().setError("workflow-1", "node-1", "Error 1");
    useErrorStore.getState().setError("workflow-1", "node-2", "Error 2");

    useErrorStore.getState().clearNodeErrors("workflow-1", "node-1");

    expect(useErrorStore.getState().errors["workflow-1:node-1"]).toBeUndefined();
    expect(useErrorStore.getState().errors["workflow-1:node-2"]).toBe("Error 2");
  });

  it("clears all errors for a workflow", () => {
    useErrorStore.getState().setError("workflow-1", "node-1", "Error 1");
    useErrorStore.getState().setError("workflow-1", "node-2", "Error 2");
    useErrorStore.getState().setError("workflow-2", "node-1", "Error 3");

    useErrorStore.getState().clearErrors("workflow-1");

    expect(useErrorStore.getState().errors["workflow-1:node-1"]).toBeUndefined();
    expect(useErrorStore.getState().errors["workflow-1:node-2"]).toBeUndefined();
    expect(useErrorStore.getState().errors["workflow-2:node-1"]).toBe("Error 3");
  });

  it("overwrites existing error with new error", () => {
    useErrorStore.getState().setError("workflow-1", "node-1", "Old error");
    useErrorStore.getState().setError("workflow-1", "node-1", "New error");

    expect(useErrorStore.getState().errors["workflow-1:node-1"]).toBe("New error");
  });

  it("handles null error", () => {
    useErrorStore.getState().setError("workflow-1", "node-1", null);
    expect(useErrorStore.getState().errors["workflow-1:node-1"]).toBeNull();
  });
});
