import { renderHook, act } from "@testing-library/react";

const listFetch = jest.fn();
const listUseQuery = jest.fn();
const createApp = jest.fn();
const openApplication = jest.fn();
const saveWorkflow = jest.fn();
const addNotification = jest.fn();

const workflow = { id: "wf-1", name: "Poster maker", description: "Posters" };

jest.mock("../../trpc/client", () => ({
  trpc: {
    useUtils: () => ({ applications: { list: { fetch: listFetch } } }),
    applications: { list: { useQuery: listUseQuery } }
  }
}));
jest.mock("../../contexts/NodeContext", () => ({
  useNodes: (selector: (state: { workflow: typeof workflow }) => unknown) =>
    selector({ workflow })
}));
jest.mock("../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: (
    selector: (state: {
      getWorkflow: (id: string) => unknown;
      saveWorkflow: typeof saveWorkflow;
    }) => unknown
  ) =>
    selector({
      getWorkflow: (id: string) => (id === workflow.id ? workflow : undefined),
      saveWorkflow
    })
}));
jest.mock("../../stores/NotificationStore", () => ({
  useNotificationStore: (
    selector: (state: { addNotification: typeof addNotification }) => unknown
  ) => selector({ addNotification })
}));
jest.mock("../../stores/WorkspaceTabsStore", () => ({
  creationProjectId: () => "default-project",
  useWorkspaceTabsStore: (
    selector: (state: {
      tabs: { type: string; ref: string; projectId?: string }[];
    }) => unknown
  ) =>
    selector({ tabs: [{ type: "workflow", ref: "wf-1", projectId: "proj-1" }] })
}));
jest.mock("../useApplications", () => ({
  useCreateApplication: () => ({ mutateAsync: createApp })
}));
jest.mock("../useOpenApplication", () => ({
  UNTITLED_APP: "Untitled app",
  useOpenApplication: () => openApplication
}));

import { useWorkflowApp } from "../useWorkflowApp";

beforeEach(() => {
  jest.clearAllMocks();
  listUseQuery.mockReturnValue({ data: [] });
});

describe("useWorkflowApp", () => {
  it("opens the most recently edited app that runs the workflow", async () => {
    listUseQuery.mockReturnValue({ data: [{ id: "old" }] });
    listFetch.mockResolvedValue([
      { id: "old", name: "Old", projectId: "p", updatedAt: "2026-01-01" },
      { id: "new", name: "New", projectId: "p", updatedAt: "2026-02-01" }
    ]);
    const { result } = renderHook(() => useWorkflowApp());

    expect(result.current.hasApp).toBe(true);
    await act(() => result.current.openWorkflowApp());

    expect(listFetch).toHaveBeenCalledWith({ workflowId: "wf-1" });
    expect(openApplication).toHaveBeenCalledWith("new", "New", "p");
    expect(createApp).not.toHaveBeenCalled();
    expect(saveWorkflow).not.toHaveBeenCalled();
  });

  it("saves the graph, then creates an app from the workflow when none runs it", async () => {
    listFetch.mockResolvedValue([]);
    createApp.mockResolvedValue({
      id: "app-1",
      name: "Poster maker",
      projectId: "proj-1"
    });
    const { result } = renderHook(() => useWorkflowApp());

    expect(result.current.hasApp).toBe(false);
    await act(() => result.current.openWorkflowApp());

    expect(saveWorkflow).toHaveBeenCalledWith(workflow);
    expect(saveWorkflow.mock.invocationCallOrder[0]).toBeLessThan(
      createApp.mock.invocationCallOrder[0]
    );
    expect(createApp).toHaveBeenCalledWith({
      name: "Poster maker",
      description: "Posters",
      projectId: "proj-1",
      fromWorkflowId: "wf-1"
    });
    expect(openApplication).toHaveBeenCalledWith(
      "app-1",
      "Poster maker",
      "proj-1"
    );
  });

  it("reports a failed create instead of opening anything", async () => {
    listFetch.mockResolvedValue([]);
    createApp.mockRejectedValue(new Error("Workflow not found"));
    const { result } = renderHook(() => useWorkflowApp());

    await act(() => result.current.openWorkflowApp());

    expect(openApplication).not.toHaveBeenCalled();
    expect(addNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        content: expect.stringContaining("Workflow not found")
      })
    );
  });
});
