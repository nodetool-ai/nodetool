/**
 * @jest-environment jsdom
 *
 * A workflow deleted outside the editor (REST, MCP) must not stay focused:
 * a clean tab is dropped on the next refresh, and saving a deleted workflow
 * fails with a message that names it.
 */
import { QueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import type { Workflow } from "../ApiTypes";

const updateMutate = jest.fn();
jest.mock("../../trpc/client", () => ({
  trpcClient: {
    workflows: {
      update: { mutate: (...args: unknown[]) => updateMutate(...args) },
      versions: { create: { mutate: jest.fn() } }
    }
  }
}));

jest.mock("../NodeStore", () => ({
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
        adoptSavedWorkflow: (saved: Workflow) => set(() => ({ workflow: saved })),
        cleanup: jest.fn()
      })
    )
}));

jest.mock("../workflowUpdates", () => ({
  subscribeToWorkflowUpdates: jest.fn(),
  unsubscribeFromWorkflowUpdates: jest.fn()
}));

jest.mock("../WorkflowRunner", () => ({
  getWorkflowRunnerStore: jest.fn(() => ({ getState: () => ({}) })),
  disposeWorkflowRunnerStore: jest.fn()
}));

jest.mock("../runReconciliation", () => ({
  startRunReconciliation: jest.fn(),
  stopRunReconciliation: jest.fn()
}));

jest.mock("../../components/appbuilder/runtime/appRuntimeStore", () => ({
  disposeAppRuntimeStore: jest.fn(),
  workflowInstanceId: (id: string) => id
}));

const fetchWorkflowById = jest.fn();
jest.mock("../../serverState/useWorkflow", () => ({
  fetchWorkflowById: (...args: unknown[]) => fetchWorkflowById(...args),
  workflowQueryKey: (id: string): [string, string] => ["workflow", id]
}));

import { createWorkflowManagerStore } from "../WorkflowManagerStore";

const workflow = (id: string, name: string): Workflow =>
  ({
    id,
    name,
    description: "",
    access: "private",
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-10T00:00:00Z",
    graph: { nodes: [], edges: [] }
  }) as unknown as Workflow;

const notFound = () => ({ data: { code: "NOT_FOUND" }, message: "Workflow not found" });

describe("workflow deleted outside the editor", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  it("drops the clean deleted tab and moves focus to a live one", async () => {
    const store = createWorkflowManagerStore(new QueryClient());
    store.getState().addWorkflow(workflow("live", "Live"));
    store.getState().addWorkflow(workflow("gone", "Gone"));
    store.getState().setCurrentWorkflowId("gone");
    fetchWorkflowById.mockRejectedValue(notFound());

    await store.getState().refreshWorkflow("gone");

    const state = store.getState();
    expect(state.openWorkflows.map((w) => w.id)).toEqual(["live"]);
    expect(state.currentWorkflowId).toBe("live");
    expect(state.nodeStores["gone"]).toBeUndefined();
  });

  it("keeps a dirty draft open when its refresh finds it deleted", async () => {
    const store = createWorkflowManagerStore(new QueryClient());
    store.getState().addWorkflow(workflow("gone", "Gone"));
    store.getState().getNodeStore("gone")!.setState({ workflowIsDirty: true });
    fetchWorkflowById.mockRejectedValue(notFound());

    await store.getState().refreshWorkflow("gone");

    expect(store.getState().openWorkflows.map((w) => w.id)).toEqual(["gone"]);
  });

  it("refuses to save a deleted workflow and names it", async () => {
    const store = createWorkflowManagerStore(new QueryClient());
    const gone = workflow("gone", "Movie Posters");
    store.getState().addWorkflow(gone);
    updateMutate.mockRejectedValue(notFound());

    await expect(store.getState().saveWorkflow(gone)).rejects.toThrow(
      /"Movie Posters" was deleted/
    );
  });
});
