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
import type { Workflow } from "../ApiTypes";

jest.mock("../../trpc/client", () => ({
  trpcClient: {
    workflows: {
      create: { mutate: jest.fn() },
      update: { mutate: jest.fn() },
      versions: { create: { mutate: jest.fn() } }
    }
  }
}));

jest.mock("../NodeStore", () =>
  jest.requireActual("../../test-utils/workflowManagerMocks").nodeStoreMock()
);

jest.mock("../workflowUpdates", () =>
  jest.requireActual("../../test-utils/workflowManagerMocks").workflowUpdatesMock()
);

jest.mock("../WorkflowRunner", () =>
  jest.requireActual("../../test-utils/workflowManagerMocks").workflowRunnerMock()
);

jest.mock("../runReconciliation", () =>
  jest.requireActual("../../test-utils/workflowManagerMocks").runReconciliationMock()
);

jest.mock("../../components/appbuilder/runtime/appRuntimeStore", () =>
  jest.requireActual("../../test-utils/workflowManagerMocks").appRuntimeStoreMock()
);

import { trpcClient } from "../../trpc/client";
import { createWorkflowManagerStore } from "../WorkflowManagerStore";

const updateMutate = trpcClient.workflows.update.mutate as jest.Mock;
const createMutate = trpcClient.workflows.create.mutate as jest.Mock;
const versionMutate = trpcClient.workflows.versions.create.mutate as jest.Mock;

describe("saveWorkflow first save", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    versionMutate.mockResolvedValue({});
  });

  it("omits expected_updated_at for a never-persisted workflow, then sends the server revision", async () => {
    const store = createWorkflowManagerStore(new QueryClient());
    const workflow = await store.getState().createNew("project-a");
    expect(workflow.project_id).toBe("project-a");

    const serverUpdatedAt = "2026-08-14T12:00:00.000Z";
    updateMutate.mockResolvedValue({
      ...workflow,
      updated_at: serverUpdatedAt
    });

    await store.getState().saveWorkflow(workflow);

    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(updateMutate.mock.calls[0][0].expected_updated_at).toBeUndefined();
    expect(updateMutate.mock.calls[0][0].project_id).toBe("project-a");

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

  it("keeps a workflow copy in the source project", async () => {
    const store = createWorkflowManagerStore(new QueryClient());
    const original = await store.getState().createNew("project-a");
    const copy = await store.getState().copy(original);
    createMutate.mockResolvedValue(copy);

    await store.getState().create(copy);

    expect(copy.project_id).toBe("project-a");
    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: "project-a" })
    );
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

  // UX study 3 (D13): a run saves the workflow, and while that save is in
  // flight React Flow re-measures the nodes the results grew. That replaces
  // the node array but is no edit, so the unsaved dot must still clear.
  it("marks the workflow clean when only a re-measure landed during the save", async () => {
    const store = createWorkflowManagerStore(new QueryClient());
    const serverWorkflow: Workflow = {
      id: "wf-measured",
      name: "Trip summary",
      description: "",
      access: "private",
      graph: { nodes: [], edges: [] },
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-02T00:00:00.000Z"
    };
    store.getState().addWorkflow(serverWorkflow);
    const nodeStore = store.getState().getNodeStore("wf-measured");
    nodeStore?.setState({ editGeneration: 3 });

    updateMutate.mockImplementation(async () => {
      nodeStore?.setState({ nodes: [] });
      return { ...serverWorkflow, updated_at: "2026-08-03T00:00:00.000Z" };
    });
    await store.getState().saveWorkflow(serverWorkflow);

    expect(nodeStore?.getState().setWorkflowDirty).toHaveBeenCalledWith(false);
  });

  it("keeps the workflow dirty when the user edited during the save", async () => {
    const store = createWorkflowManagerStore(new QueryClient());
    const serverWorkflow: Workflow = {
      id: "wf-user-edit",
      name: "Trip summary",
      description: "",
      access: "private",
      graph: { nodes: [], edges: [] },
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-02T00:00:00.000Z"
    };
    store.getState().addWorkflow(serverWorkflow);
    const nodeStore = store.getState().getNodeStore("wf-user-edit");
    nodeStore?.setState({ editGeneration: 3 });

    updateMutate.mockImplementation(async () => {
      nodeStore?.setState({ editGeneration: 4 });
      return { ...serverWorkflow, updated_at: "2026-08-03T00:00:00.000Z" };
    });
    await store.getState().saveWorkflow(serverWorkflow);

    expect(nodeStore?.getState().setWorkflowDirty).not.toHaveBeenCalledWith(
      false
    );
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

  it("runs overlapping saves one at a time and coalesces the waiting ones", async () => {
    const store = createWorkflowManagerStore(new QueryClient());
    const serverWorkflow: Workflow = {
      id: "wf-queue",
      name: "Existing",
      description: "",
      access: "private",
      graph: { nodes: [], edges: [] },
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-02T00:00:00.000Z"
    };
    store.getState().addWorkflow(serverWorkflow);

    let releaseFirst: (value: Workflow) => void = () => {};
    updateMutate.mockImplementationOnce(
      () =>
        new Promise<Workflow>((resolve) => {
          releaseFirst = resolve;
        })
    );
    updateMutate.mockImplementation(async (input: { name: string }) => ({
      ...serverWorkflow,
      name: input.name,
      updated_at: "2026-08-04T00:00:00.000Z"
    }));

    const first = store.getState().saveWorkflow(serverWorkflow);
    const second = store
      .getState()
      .saveWorkflow({ ...serverWorkflow, name: "Second" });
    const third = store
      .getState()
      .saveWorkflow({ ...serverWorkflow, name: "Third" });
    expect(second).toBe(third);
    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(store.getState().isSavingWorkflow("wf-queue")).toBe(true);

    releaseFirst({ ...serverWorkflow, updated_at: "2026-08-03T00:00:00.000Z" });
    await Promise.all([first, second, third]);

    // One request for the two waiting saves, carrying the newest input and
    // the token the first save left in the editor.
    expect(updateMutate).toHaveBeenCalledTimes(2);
    expect(updateMutate.mock.calls[1][0].name).toBe("Third");
    expect(updateMutate.mock.calls[1][0].expected_updated_at).toBe(
      "2026-08-03T00:00:00.000Z"
    );
  });

  it("still runs a queued save after the one before it fails", async () => {
    const store = createWorkflowManagerStore(new QueryClient());
    const serverWorkflow: Workflow = {
      id: "wf-retry",
      name: "Existing",
      description: "",
      access: "private",
      graph: { nodes: [], edges: [] },
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-02T00:00:00.000Z"
    };
    store.getState().addWorkflow(serverWorkflow);
    updateMutate.mockRejectedValueOnce(new Error("network down"));
    updateMutate.mockResolvedValue({ ...serverWorkflow });

    const first = store.getState().saveWorkflow(serverWorkflow);
    const second = store.getState().saveWorkflow(serverWorkflow);

    await expect(first).rejects.toThrow("Failed to save workflow");
    await expect(second).resolves.toBeUndefined();
    expect(updateMutate).toHaveBeenCalledTimes(2);
  });

  it("adds a version row unless the save asks for none", async () => {
    const store = createWorkflowManagerStore(new QueryClient());
    const serverWorkflow: Workflow = {
      id: "wf-versions",
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
    expect(versionMutate).toHaveBeenCalledTimes(1);

    await store.getState().saveWorkflow(serverWorkflow, { snapshot: false });
    expect(updateMutate).toHaveBeenCalledTimes(2);
    expect(versionMutate).toHaveBeenCalledTimes(1);
  });
});
