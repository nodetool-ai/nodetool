import { renderHook, act } from "@testing-library/react";

const navigate = jest.fn();
const createNew = jest.fn();
const openTab = jest.fn(() => "tab-1");
const openForegroundTab = jest.fn(() => "tab-2");
const setActiveTab = jest.fn();
const addNotification = jest.fn();
const requestFitNode = jest.fn();

const savedWorkflow = { id: "wf-1", name: "Portrait", project_id: "proj-1" };

jest.mock("react-router-dom", () => ({
  useNavigate: () => navigate
}));
jest.mock("../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: (
    selector: (state: {
      getWorkflow: (id: string) => unknown;
      createNew: typeof createNew;
    }) => unknown
  ) =>
    selector({
      getWorkflow: (id: string) =>
        id === savedWorkflow.id ? savedWorkflow : undefined,
      createNew
    })
}));
jest.mock("../../stores/NotificationStore", () => ({
  useNotificationStore: (
    selector: (state: { addNotification: typeof addNotification }) => unknown
  ) => selector({ addNotification })
}));
jest.mock("../../stores/WorkspaceTabsStore", () => ({
  creationProjectId: () => "active-project",
  useWorkspaceTabsStore: (
    selector: (state: {
      openTab: typeof openTab;
      openForegroundTab: typeof openForegroundTab;
      setActiveTab: typeof setActiveTab;
    }) => unknown
  ) => selector({ openTab, openForegroundTab, setActiveTab })
}));
jest.mock("../useFitNodeEvent", () => ({
  requestFitNode: (request: unknown) => requestFitNode(request)
}));

import { useOpenAssetWorkflow } from "../useOpenAssetWorkflow";
import type { Asset } from "../../stores/ApiTypes";
import type { JobSnapshot } from "../../serverState/useJobSnapshot";

const asset = {
  id: "asset-1",
  workflow_id: "wf-1",
  node_id: "gen",
  job_id: "job-1"
} as Asset;

const graph = {
  nodes: [{ id: "gen", type: "x.Gen", data: { prompt: "a fox" } }],
  edges: []
};

const snapshot: JobSnapshot = {
  id: "job-1",
  workflow_id: "wf-1",
  name: "Run",
  started_at: "2026-10-06T10:00:00.000Z",
  graph,
  params: {}
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("useOpenAssetWorkflow", () => {
  it("opens the saved workflow and reveals the asset's node", () => {
    const { result } = renderHook(() => useOpenAssetWorkflow());

    act(() => result.current.openWorkflow(asset));

    expect(openTab).toHaveBeenCalledWith({
      type: "workflow",
      ref: "wf-1",
      mode: "edit",
      title: "Portrait",
      projectId: "proj-1"
    });
    expect(setActiveTab).toHaveBeenCalledWith("tab-1");
    expect(navigate).toHaveBeenCalledWith("/workspace");
    expect(requestFitNode).toHaveBeenCalledWith({
      workflowId: "wf-1",
      nodeId: "gen"
    });
  });

  it("does nothing for an asset no workflow made", () => {
    const { result } = renderHook(() => useOpenAssetWorkflow());

    act(() => result.current.openWorkflow({ ...asset, workflow_id: null }));

    expect(openTab).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("opens the run's graph as a new unsaved workflow", async () => {
    createNew.mockResolvedValue({ id: "new-wf", name: "Portrait (as made)" });
    const { result } = renderHook(() => useOpenAssetWorkflow());

    await act(() => result.current.openSnapshot(asset, snapshot));

    expect(createNew).toHaveBeenCalledWith("active-project", {
      name: expect.stringMatching(/^Portrait \(as made .+\)$/),
      graph
    });
    expect(openForegroundTab).toHaveBeenCalledWith({
      type: "workflow",
      ref: "new-wf",
      mode: "edit",
      title: "Portrait (as made)",
      projectId: "active-project"
    });
    expect(requestFitNode).toHaveBeenCalledWith({
      workflowId: "new-wf",
      nodeId: "gen"
    });
  });

  it("opens nothing when the job stored no graph", async () => {
    const { result } = renderHook(() => useOpenAssetWorkflow());

    await act(() =>
      result.current.openSnapshot(asset, { ...snapshot, graph: null })
    );

    expect(createNew).not.toHaveBeenCalled();
  });
});
