/**
 * @jest-environment jsdom
 *
 * Deleting an open workflow from the Documents panel must tear it down the way
 * closing its tab does, and drop it the way the workflow list's delete does.
 * Closing only the tab leaves its node store, runner, and favorite behind.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { create } from "zustand";
import type { Workflow } from "../../stores/ApiTypes";

jest.mock("../../trpc/client", () => ({
  trpcClient: {
    workflows: {
      delete: { mutate: jest.fn() },
      get: { query: jest.fn() }
    }
  }
}));

jest.mock("../../stores/NodeStore", () => ({
  createNodeStore: (workflow: Workflow) =>
    create(() => ({
      workflow,
      nodes: [],
      edges: [],
      workflowIsDirty: false,
      getWorkflow: () => workflow,
      cleanup: jest.fn()
    }))
}));

jest.mock("../../stores/workflowUpdates", () => ({
  subscribeToWorkflowUpdates: jest.fn(),
  unsubscribeFromWorkflowUpdates: jest.fn()
}));

jest.mock("../../stores/WorkflowRunner", () => ({
  getWorkflowRunnerStore: jest.fn(() => ({ getState: () => ({}) })),
  disposeWorkflowRunnerStore: jest.fn()
}));

jest.mock("../../stores/runReconciliation", () => ({
  startRunReconciliation: jest.fn(),
  stopRunReconciliation: jest.fn()
}));

jest.mock("../../components/appbuilder/runtime/appRuntimeStore", () => ({
  disposeAppRuntimeStore: jest.fn(),
  workflowInstanceId: (id: string) => id
}));

import type { WorkflowManagerStore } from "../../stores/WorkflowManagerStore";

let mockManager: WorkflowManagerStore;
jest.mock("../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManagerStore: () => mockManager
}));

import { useFavoriteWorkflowsStore } from "../../stores/FavoriteWorkflowsStore";
import { disposeWorkflowRunnerStore } from "../../stores/WorkflowRunner";
import { createWorkflowManagerStore } from "../../stores/WorkflowManagerStore";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { trpcClient } from "../../trpc/client";
import { useDeleteDocument } from "../useDeleteDocument";

const deleteMutate = trpcClient.workflows.delete.mutate as jest.Mock;
const getQuery = trpcClient.workflows.get.query as jest.Mock;

const workflow = {
  id: "0f3a6c2d9b8e4f1a8c7d6e5f4a3b2c1d",
  name: "Brief",
  description: "",
  access: "private",
  graph: { nodes: [], edges: [] },
  settings: { shortcut: "CommandOrControl+Shift+B" },
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z"
} as unknown as Workflow;

const setup = () => {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } }
  });
  const manager = createWorkflowManagerStore(queryClient);
  mockManager = manager;
  manager.getState().addWorkflow(workflow);
  useFavoriteWorkflowsStore.getState().addFavorite(workflow.id);
  const tabId = useWorkspaceTabsStore
    .getState()
    .openTab({ type: "workflow", ref: workflow.id, title: workflow.name });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useDeleteDocument(), { wrapper });
  return { manager, tabId, result };
};

describe("useDeleteDocument for an open workflow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    useFavoriteWorkflowsStore.setState({ favoriteWorkflowIds: [] });
    useWorkspaceTabsStore.setState({ tabs: [], activeTabId: null });
    window.api = {
      onDeleteWorkflow: jest.fn().mockResolvedValue(undefined)
    } as unknown as typeof window.api;
  });

  afterEach(() => {
    delete (window as { api?: unknown }).api;
  });

  it("deletes once and disposes the workflow, its tab, and its favorite", async () => {
    deleteMutate.mockResolvedValue(undefined);
    const { manager, tabId, result } = setup();

    await act(async () => {
      await result.current.mutateAsync({ id: workflow.id, type: "workflow" });
    });

    expect(deleteMutate).toHaveBeenCalledTimes(1);
    expect(deleteMutate).toHaveBeenCalledWith({ id: workflow.id });
    expect(getQuery).not.toHaveBeenCalled();
    expect(manager.getState().getNodeStore(workflow.id)).toBeUndefined();
    expect(
      manager.getState().openWorkflows.some((w) => w.id === workflow.id)
    ).toBe(false);
    expect(disposeWorkflowRunnerStore).toHaveBeenCalledWith(workflow.id);
    expect(useFavoriteWorkflowsStore.getState().isFavorite(workflow.id)).toBe(
      false
    );
    expect(window.api.onDeleteWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ id: workflow.id, settings: workflow.settings })
    );
    expect(
      useWorkspaceTabsStore.getState().tabs.some((tab) => tab.id === tabId)
    ).toBe(false);
  });

  it("leaves the open workflow intact when the server delete fails", async () => {
    deleteMutate.mockRejectedValue(new Error("server down"));
    const { manager, tabId, result } = setup();

    await act(async () => {
      await expect(
        result.current.mutateAsync({ id: workflow.id, type: "workflow" })
      ).rejects.toThrow();
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(manager.getState().getNodeStore(workflow.id)).toBeDefined();
    expect(disposeWorkflowRunnerStore).not.toHaveBeenCalled();
    expect(useFavoriteWorkflowsStore.getState().isFavorite(workflow.id)).toBe(
      true
    );
    expect(
      useWorkspaceTabsStore.getState().tabs.some((tab) => tab.id === tabId)
    ).toBe(true);
  });

  it("loads a closed workflow so the desktop app can release its shortcut", async () => {
    deleteMutate.mockResolvedValue(undefined);
    getQuery.mockResolvedValue(workflow);
    const { manager, result } = setup();
    manager.getState().removeWorkflow(workflow.id);
    jest.mocked(disposeWorkflowRunnerStore).mockClear();

    await act(async () => {
      await result.current.mutateAsync({ id: workflow.id, type: "workflow" });
    });

    expect(getQuery).toHaveBeenCalledWith({ id: workflow.id });
    expect(deleteMutate).toHaveBeenCalledTimes(1);
    expect(window.api.onDeleteWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ settings: workflow.settings })
    );
  });
});
