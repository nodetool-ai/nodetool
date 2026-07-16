import { act } from "@testing-library/react";
import { useWorkflowShareDialogStore } from "../WorkflowShareDialogStore";

describe("WorkflowShareDialogStore", () => {
  beforeEach(() => {
    act(() => {
      useWorkflowShareDialogStore.getState().close();
    });
  });

  it("starts with no target", () => {
    expect(useWorkflowShareDialogStore.getState().target).toBeNull();
  });

  describe("open", () => {
    it("sets the target workflow", () => {
      act(() => {
        useWorkflowShareDialogStore.getState().open({
          workflowId: "wf-1",
          workflowName: "My Workflow"
        });
      });
      const { target } = useWorkflowShareDialogStore.getState();
      expect(target).toEqual({
        workflowId: "wf-1",
        workflowName: "My Workflow"
      });
    });

    it("replaces a previously open target", () => {
      act(() => {
        useWorkflowShareDialogStore.getState().open({
          workflowId: "wf-1",
          workflowName: "First"
        });
        useWorkflowShareDialogStore.getState().open({
          workflowId: "wf-2",
          workflowName: "Second"
        });
      });
      expect(useWorkflowShareDialogStore.getState().target?.workflowId).toBe(
        "wf-2"
      );
    });
  });

  describe("close", () => {
    it("clears the target", () => {
      act(() => {
        useWorkflowShareDialogStore.getState().open({
          workflowId: "wf-1",
          workflowName: "Test"
        });
      });
      expect(useWorkflowShareDialogStore.getState().target).not.toBeNull();

      act(() => {
        useWorkflowShareDialogStore.getState().close();
      });
      expect(useWorkflowShareDialogStore.getState().target).toBeNull();
    });

    it("is idempotent when already closed", () => {
      act(() => {
        useWorkflowShareDialogStore.getState().close();
        useWorkflowShareDialogStore.getState().close();
      });
      expect(useWorkflowShareDialogStore.getState().target).toBeNull();
    });
  });
});
