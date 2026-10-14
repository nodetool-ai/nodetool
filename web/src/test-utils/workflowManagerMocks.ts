/**
 * Module-mock factories shared by the WorkflowManagerStore suites. Jest hoists
 * `jest.mock` per test file, so each suite still calls it with its own
 * relative path and delegates the factory here:
 *
 *   jest.mock("../workflowUpdates", () =>
 *     jest.requireActual("<rel>/test-utils/workflowManagerMocks").workflowUpdatesMock()
 *   );
 */
import type { Workflow } from "../stores/ApiTypes";

export const workflowUpdatesMock = () => ({
  subscribeToWorkflowUpdates: jest.fn(),
  unsubscribeFromWorkflowUpdates: jest.fn()
});

export const workflowRunnerMock = () => ({
  getWorkflowRunnerStore: jest.fn(() => ({ getState: () => ({}) })),
  disposeWorkflowRunnerStore: jest.fn()
});

export const runReconciliationMock = () => ({
  startRunReconciliation: jest.fn(),
  stopRunReconciliation: jest.fn()
});

export const appRuntimeStoreMock = () => ({
  disposeAppRuntimeStore: jest.fn(),
  workflowInstanceId: (id: string) => id
});

/** A node store whose workflow can be replaced and re-stamped, as after a save. */
export const nodeStoreMock = () => {
  const { create } = jest.requireActual("zustand");
  return {
    createNodeStore: (workflow: Workflow) =>
      create(
        (
          set: (fn: (state: { workflow: Workflow }) => object) => void,
          get: () => { workflow: Workflow }
        ) => ({
          workflow,
          nodes: [],
          edges: [],
          workflowIsDirty: false,
          getWorkflow: () => get().workflow,
          setWorkflowDirty: jest.fn(),
          setWorkflowUpdatedAt: (updatedAt: string, etag?: string | null) =>
            set((state) => ({
              workflow: {
                ...state.workflow,
                updated_at: updatedAt,
                etag: etag ?? state.workflow.etag
              }
            })),
          adoptSavedWorkflow: (saved: Workflow) =>
            set(() => ({ workflow: saved })),
          cleanup: jest.fn()
        })
      )
  };
};
