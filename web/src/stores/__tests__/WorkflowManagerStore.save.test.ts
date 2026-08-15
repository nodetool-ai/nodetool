/**
 * @jest-environment jsdom
 *
 * First-save behavior: a workflow created in memory (createNew) has only a
 * client-fabricated updated_at. Sending it as expected_updated_at makes the
 * server's update route answer "Workflow not found" instead of running its
 * create-on-first-save upsert — so the first save must omit it, and every
 * save after that must send the server's revision again.
 */
import { QueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import type { Workflow } from "../ApiTypes";

jest.mock("../../trpc/client", () => ({
  trpcClient: {
    workflows: {
      update: { mutate: jest.fn() },
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
        setWorkflowUpdatedAt: (updatedAt: string) =>
          set((state) => ({
            workflow: { ...state.workflow, updated_at: updatedAt }
          })),
        cleanup: jest.fn()
      })
    )
}));

jest.mock("../workflowUpdates", () => ({
  subscribeToWorkflowUpdates: jest.fn(),
  unsubscribeFromWorkflowUpdates: jest.fn(),
  setGetNodeStore: jest.fn()
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

import { trpcClient } from "../../trpc/client";
import { createWorkflowManagerStore } from "../WorkflowManagerStore";

const updateMutate = trpcClient.workflows.update.mutate as jest.Mock;
const versionMutate = trpcClient.workflows.versions.create.mutate as jest.Mock;

describe("saveWorkflow first save", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    versionMutate.mockResolvedValue({});
  });

  it("omits expected_updated_at for a never-persisted workflow, then sends the server revision", async () => {
    const store = createWorkflowManagerStore(new QueryClient());
    const workflow = await store.getState().createNew();

    const serverUpdatedAt = "2026-08-14T12:00:00.000Z";
    updateMutate.mockResolvedValue({
      ...workflow,
      updated_at: serverUpdatedAt
    });

    await store.getState().saveWorkflow(workflow);

    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(updateMutate.mock.calls[0][0].expected_updated_at).toBeUndefined();

    // The workflow is persisted now — the second save must go back to
    // optimistic concurrency.
    const saved = store.getState().getWorkflow(workflow.id);
    expect(saved).toBeDefined();
    await store.getState().saveWorkflow(saved as Workflow);

    expect(updateMutate).toHaveBeenCalledTimes(2);
    expect(updateMutate.mock.calls[1][0].expected_updated_at).toBe(
      serverUpdatedAt
    );
  });

  it("keeps the workflow marked unsaved when the first save fails", async () => {
    const store = createWorkflowManagerStore(new QueryClient());
    const workflow = await store.getState().createNew();

    updateMutate.mockRejectedValueOnce(new Error("network down"));
    await expect(store.getState().saveWorkflow(workflow)).rejects.toThrow(
      "Failed to save workflow"
    );

    updateMutate.mockResolvedValue({ ...workflow });
    await store.getState().saveWorkflow(workflow);

    // The retry is still a first save: no expected_updated_at.
    expect(updateMutate.mock.calls[1][0].expected_updated_at).toBeUndefined();
  });

  it("adopts the server revision even when the user edited during the save", async () => {
    const store = createWorkflowManagerStore(new QueryClient());
    const serverWorkflow: Workflow = {
      id: "wf-edited",
      name: "Existing",
      description: "",
      access: "private",
      graph: { nodes: [], edges: [] },
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-02T00:00:00.000Z"
    };
    store.getState().addWorkflow(serverWorkflow);

    const savedUpdatedAt = "2026-08-03T00:00:00.000Z";
    const nodeStore = store.getState().getNodeStore("wf-edited");
    // Simulate an edit landing while the save is in flight: the mutation
    // replaces the edges array reference before resolving.
    updateMutate.mockImplementation(async () => {
      nodeStore?.setState({ edges: [] });
      return { ...serverWorkflow, updated_at: savedUpdatedAt };
    });

    await store.getState().saveWorkflow(serverWorkflow);

    // The edit survives, but the concurrency token moves to the server's new
    // revision — otherwise every later save conflicts.
    expect(nodeStore?.getState().workflow.updated_at).toBe(savedUpdatedAt);
    await store
      .getState()
      .saveWorkflow(store.getState().getWorkflow("wf-edited") as Workflow);
    expect(updateMutate.mock.calls[1][0].expected_updated_at).toBe(
      savedUpdatedAt
    );
  });

  it("preserves tab metadata when user renames workflow during save", async () => {
  const store = createWorkflowManagerStore(new QueryClient());
  const serverWorkflow: Workflow = {
    id: "wf-rename",
    name: "Original",
    description: "",
    access: "private",
    graph: { nodes: [], edges: [] },
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-02T00:00:00.000Z"
  };
  store.getState().addWorkflow(serverWorkflow);

  const savedUpdatedAt = "2026-08-03T00:00:00.000Z";
  const nodeStore = store.getState().getNodeStore("wf-rename");

  // Simulate a rename arriving during save by mutating the node store edges
  // (triggering editedDuringSave) while the server still returns the old name.
  updateMutate.mockImplementation(async () => {
    nodeStore?.setState({ edges: [] });
    return { ...serverWorkflow, name: "Original", updated_at: savedUpdatedAt };
  });

  // Update the tab name in openWorkflows before save returns
  store.setState((state) => ({
    openWorkflows: state.openWorkflows.map((w) =>
      w.id === "wf-rename" ? { ...w, name: "Renamed" } : w
    )
  }));

  await store.getState().saveWorkflow(serverWorkflow);

  // The tab name change must not be reverted by the server response
  const openTab = store
    .getState()
    .openWorkflows.find((w) => w.id === "wf-rename");
  expect(openTab?.name).toBe("Renamed");
  // But the concurrency token must be updated
  expect(openTab?.updated_at).toBe(savedUpdatedAt);
  });

  it("sends expected_updated_at for a workflow that came from the server", async () => {
    const store = createWorkflowManagerStore(new QueryClient());
    const serverWorkflow: Workflow = {
      id: "wf-server",
      name: "Existing",
      description: "",
      access: "private",
      graph: { nodes: [], edges: [] },
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-02T00:00:00.000Z"
    };
    store.getState().addWorkflow(serverWorkflow);

    updateMutate.mockResolvedValue({ ...serverWorkflow });
    await store.getState().saveWorkflow(serverWorkflow);

    expect(updateMutate.mock.calls[0][0].expected_updated_at).toBe(
      "2026-08-02T00:00:00.000Z"
    );
  });
});

describe("saveExample updated_at adoption", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    versionMutate.mockResolvedValue({});
  });

  it("adopts server updated_at after saveExample so next saveWorkflow sends correct token", async () => {
    const store = createWorkflowManagerStore(new QueryClient());
    const wf: Workflow = {
      id: "wf-example",
      name: "My Workflow",
      description: "",
      access: "private",
      graph: { nodes: [], edges: [] },
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-02T00:00:00.000Z"
    };
    store.getState().addWorkflow(wf);
    store.setState({ currentWorkflowId: "wf-example" });

    const exampleUpdatedAt = "2026-08-04T00:00:00.000Z";
    updateMutate.mockResolvedValue({ ...wf, updated_at: exampleUpdatedAt });

    await store.getState().saveExample("my-package");

    // The node store must carry the server's new token
    const nodeStore = store.getState().getNodeStore("wf-example");
    expect(nodeStore?.getState().workflow.updated_at).toBe(exampleUpdatedAt);

    // openWorkflows must also be updated so tab metadata is consistent
    const openTab = store
      .getState()
      .openWorkflows.find((w) => w.id === "wf-example");
    expect(openTab?.updated_at).toBe(exampleUpdatedAt);

    // A subsequent saveWorkflow must send the new token, not the stale one
    jest.clearAllMocks();
    versionMutate.mockResolvedValue({});
    updateMutate.mockResolvedValue({ ...wf, updated_at: exampleUpdatedAt });
    await store.getState().saveWorkflow(
      store.getState().getWorkflow("wf-example") as Workflow
    );
    expect(updateMutate.mock.calls[0][0].expected_updated_at).toBe(
      exampleUpdatedAt
    );
  });
});
