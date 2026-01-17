import { WorkflowAttributes } from "../ApiTypes";

const determineNextWorkflowId = (
  openWorkflows: WorkflowAttributes[],
  closingWorkflowId: string,
  currentWorkflowId: string | null
): string | null => {
  if (currentWorkflowId !== closingWorkflowId) {
    return currentWorkflowId;
  }

  const remainingWorkflows = openWorkflows.filter(
    (w) => w.id !== closingWorkflowId
  );
  if (remainingWorkflows.length === 0) {
    return null;
  }

  const closingIndex = openWorkflows.findIndex(
    (w) => w.id === closingWorkflowId
  );

  const nextWorkflow =
    remainingWorkflows[closingIndex] ||
    remainingWorkflows[closingIndex - 1] ||
    remainingWorkflows[0];

  return nextWorkflow.id;
};

describe("determineNextWorkflowId", () => {
  const createWorkflowAttr = (id: string): WorkflowAttributes => ({
    id,
    name: `Workflow ${id}`,
    access: "private",
    description: "",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  it("returns currentWorkflowId when closing different workflow", () => {
    const workflows = [createWorkflowAttr("wf1"), createWorkflowAttr("wf2")];
    const result = determineNextWorkflowId(workflows, "wf1", "wf2");

    expect(result).toBe("wf2");
  });

  it("returns next workflow when closing current workflow", () => {
    const workflows = [
      createWorkflowAttr("wf1"),
      createWorkflowAttr("wf2"),
      createWorkflowAttr("wf3"),
    ];
    const result = determineNextWorkflowId(workflows, "wf2", "wf2");

    expect(result).toBe("wf3");
  });

  it("returns previous workflow when closing current and no next", () => {
    const workflows = [
      createWorkflowAttr("wf1"),
      createWorkflowAttr("wf2"),
      createWorkflowAttr("wf3"),
    ];
    const result = determineNextWorkflowId(workflows, "wf3", "wf3");

    expect(result).toBe("wf2");
  });

  it("returns first workflow when closing last and no previous", () => {
    const workflows = [createWorkflowAttr("wf1"), createWorkflowAttr("wf2")];
    const result = determineNextWorkflowId(workflows, "wf2", "wf2");

    expect(result).toBe("wf1");
  });

  it("returns null when removing the only workflow", () => {
    const workflows = [createWorkflowAttr("wf1")];
    const result = determineNextWorkflowId(workflows, "wf1", "wf1");

    expect(result).toBeNull();
  });

  it("returns null when closing non-existent workflow", () => {
    const workflows = [createWorkflowAttr("wf1"), createWorkflowAttr("wf2")];
    const result = determineNextWorkflowId(workflows, "non-existent", "wf1");

    expect(result).toBe("wf1");
  });

  it("handles empty workflow list", () => {
    const result = determineNextWorkflowId([], "wf1", null);
    expect(result).toBeNull();
  });

  it("returns null when currentWorkflowId is null", () => {
    const workflows = [createWorkflowAttr("wf1"), createWorkflowAttr("wf2")];
    const result = determineNextWorkflowId(workflows, "wf1", null);

    expect(result).toBeNull();
  });

  it("selects next workflow at boundary when current is first", () => {
    const workflows = [
      createWorkflowAttr("wf1"),
      createWorkflowAttr("wf2"),
      createWorkflowAttr("wf3"),
    ];
    const result = determineNextWorkflowId(workflows, "wf1", "wf1");

    expect(result).toBe("wf2");
  });
});
