import { shouldApplyWorkflowRefresh } from "../workflowRefreshPolicy";

function store(updatedAt: string, dirty = false) {
  return {
    getState: () => ({
      workflowIsDirty: dirty,
      getWorkflow: () => ({ updated_at: updatedAt })
    })
  };
}

describe("shouldApplyWorkflowRefresh", () => {
  it("replaces an unchanged clean store with a newer revision", () => {
    const current = store("old");
    expect(shouldApplyWorkflowRefresh(current, current, "new")).toBe(true);
  });

  it("does not overwrite a dirty store", () => {
    const current = store("old", true);
    expect(shouldApplyWorkflowRefresh(current, current, "new")).toBe(false);
  });

  it("does not overwrite a store replaced while the fetch was in flight", () => {
    expect(shouldApplyWorkflowRefresh(store("old"), store("old"), "new")).toBe(
      false
    );
  });

  it("ignores an already-current revision", () => {
    const current = store("same");
    expect(shouldApplyWorkflowRefresh(current, current, "same")).toBe(false);
  });
});
