import usePropertyValidationStore from "../PropertyValidationStore";

describe("PropertyValidationStore", () => {
  beforeEach(() => {
    usePropertyValidationStore.setState({ errors: {} });
  });

  it("starts with empty errors", () => {
    expect(usePropertyValidationStore.getState().errors).toEqual({});
  });

  describe("setIssues", () => {
    it("stores issues keyed by workflowId:nodeId:property", () => {
      usePropertyValidationStore.getState().setIssues("wf1", [
        { node_id: "n1", property: "prompt", message: "required" }
      ]);

      expect(
        usePropertyValidationStore.getState().errors["wf1:n1:prompt"]
      ).toBe("required");
    });

    it("replaces all issues for the same workflow", () => {
      usePropertyValidationStore.getState().setIssues("wf1", [
        { node_id: "n1", property: "a", message: "err1" }
      ]);
      usePropertyValidationStore.getState().setIssues("wf1", [
        { node_id: "n2", property: "b", message: "err2" }
      ]);

      const errors = usePropertyValidationStore.getState().errors;
      expect(errors["wf1:n1:a"]).toBeUndefined();
      expect(errors["wf1:n2:b"]).toBe("err2");
    });

    it("preserves issues from other workflows", () => {
      usePropertyValidationStore.getState().setIssues("wf1", [
        { node_id: "n1", property: "a", message: "err1" }
      ]);
      usePropertyValidationStore.getState().setIssues("wf2", [
        { node_id: "n2", property: "b", message: "err2" }
      ]);

      const errors = usePropertyValidationStore.getState().errors;
      expect(errors["wf1:n1:a"]).toBe("err1");
      expect(errors["wf2:n2:b"]).toBe("err2");
    });

    it("skips issues with empty node_id or property", () => {
      usePropertyValidationStore.getState().setIssues("wf1", [
        { node_id: "", property: "a", message: "skip1" },
        { node_id: "n1", property: "", message: "skip2" },
        { node_id: "n1", property: "a", message: "keep" }
      ]);

      const errors = usePropertyValidationStore.getState().errors;
      expect(Object.keys(errors)).toHaveLength(1);
      expect(errors["wf1:n1:a"]).toBe("keep");
    });

    it("handles multiple issues for the same workflow", () => {
      usePropertyValidationStore.getState().setIssues("wf1", [
        { node_id: "n1", property: "a", message: "err1" },
        { node_id: "n1", property: "b", message: "err2" },
        { node_id: "n2", property: "c", message: "err3" }
      ]);

      const errors = usePropertyValidationStore.getState().errors;
      expect(Object.keys(errors)).toHaveLength(3);
    });
  });

  describe("clearWorkflow", () => {
    it("removes all errors for a workflow", () => {
      usePropertyValidationStore.getState().setIssues("wf1", [
        { node_id: "n1", property: "a", message: "err1" },
        { node_id: "n2", property: "b", message: "err2" }
      ]);
      usePropertyValidationStore.getState().setIssues("wf2", [
        { node_id: "n3", property: "c", message: "err3" }
      ]);

      usePropertyValidationStore.getState().clearWorkflow("wf1");

      const errors = usePropertyValidationStore.getState().errors;
      expect(errors["wf1:n1:a"]).toBeUndefined();
      expect(errors["wf1:n2:b"]).toBeUndefined();
      expect(errors["wf2:n3:c"]).toBe("err3");
    });

    it("is a no-op when workflow has no errors", () => {
      usePropertyValidationStore.getState().setIssues("wf1", [
        { node_id: "n1", property: "a", message: "err1" }
      ]);

      usePropertyValidationStore.getState().clearWorkflow("wf999");

      expect(
        usePropertyValidationStore.getState().errors["wf1:n1:a"]
      ).toBe("err1");
    });
  });

  describe("clearNode", () => {
    it("removes errors only for the specified node", () => {
      usePropertyValidationStore.getState().setIssues("wf1", [
        { node_id: "n1", property: "a", message: "err1" },
        { node_id: "n1", property: "b", message: "err2" },
        { node_id: "n2", property: "c", message: "err3" }
      ]);

      usePropertyValidationStore.getState().clearNode("wf1", "n1");

      const errors = usePropertyValidationStore.getState().errors;
      expect(errors["wf1:n1:a"]).toBeUndefined();
      expect(errors["wf1:n1:b"]).toBeUndefined();
      expect(errors["wf1:n2:c"]).toBe("err3");
    });
  });

  describe("getError", () => {
    it("returns the error message for a known key", () => {
      usePropertyValidationStore.getState().setIssues("wf1", [
        { node_id: "n1", property: "prompt", message: "required field" }
      ]);

      expect(
        usePropertyValidationStore.getState().getError("wf1", "n1", "prompt")
      ).toBe("required field");
    });

    it("returns undefined for an unknown key", () => {
      expect(
        usePropertyValidationStore.getState().getError("wf1", "n1", "nope")
      ).toBeUndefined();
    });
  });
});
