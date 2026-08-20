import { renderHook, act } from "@testing-library/react";

import { useCurrentWorkspace } from "../useCurrentWorkspace";
import { useCurrentWorkspaceStore } from "../../stores/CurrentWorkspaceStore";

const defaultWorkspace = {
  id: "ws-default",
  name: "Default",
  path: "/data/workspaces/u1",
  is_default: true
};
const renders = {
  id: "ws-renders",
  name: "Renders",
  path: "/home/me/renders",
  is_default: false
};

let workspaces: Array<typeof defaultWorkspace> = [];
let currentWorkflow: { id: string; workspace_id: string | null } | null = null;

jest.mock("../useWorkspaces", () => ({
  useWorkspaces: () => ({
    workspaces,
    canManage: true,
    defaultWorkspace: workspaces.find((w) => w.is_default) ?? workspaces[0],
    isLoading: false,
    error: null
  })
}));

jest.mock("../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: (selector: (state: unknown) => unknown) =>
    selector({
      currentWorkflowId: currentWorkflow?.id ?? null,
      getCurrentWorkflow: () => currentWorkflow,
      updateWorkflow: jest.fn(),
      saveWorkflow: jest.fn(),
      openWorkflows: currentWorkflow ? [currentWorkflow] : []
    })
}));

describe("useCurrentWorkspace", () => {
  beforeEach(() => {
    workspaces = [defaultWorkspace, renders];
    currentWorkflow = null;
    act(() => {
      useCurrentWorkspaceStore.getState().setLastUsedWorkspaceId(null);
    });
  });

  it("falls back to the default workspace with no workflow open", () => {
    const { result } = renderHook(() => useCurrentWorkspace());
    expect(result.current.workspaceId).toBe("ws-default");
    expect(result.current.workspace?.name).toBe("Default");
  });

  it("prefers the workflow's own workspace", () => {
    currentWorkflow = { id: "wf-1", workspace_id: "ws-renders" };
    const { result } = renderHook(() => useCurrentWorkspace());
    expect(result.current.workspaceId).toBe("ws-renders");
  });

  it("uses the last-used workspace when the workflow names none", () => {
    act(() => {
      useCurrentWorkspaceStore.getState().setLastUsedWorkspaceId("ws-renders");
    });
    currentWorkflow = { id: "wf-1", workspace_id: null };
    const { result } = renderHook(() => useCurrentWorkspace());
    expect(result.current.workspaceId).toBe("ws-renders");
  });

  it("ignores a remembered workspace that no longer exists", () => {
    act(() => {
      useCurrentWorkspaceStore.getState().setLastUsedWorkspaceId("ws-deleted");
    });
    const { result } = renderHook(() => useCurrentWorkspace());
    expect(result.current.workspaceId).toBe("ws-default");
  });

  it("reports no workspace only while the list is empty", () => {
    workspaces = [];
    const { result } = renderHook(() => useCurrentWorkspace());
    expect(result.current.workspaceId).toBeUndefined();
  });
});
