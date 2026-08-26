import { renderHook, act } from "@testing-library/react";

import { useWorkspaceExplorer } from "../useWorkspaceExplorer";
import { useWorkspaceExplorerStore } from "../../stores/WorkspaceExplorerStore";

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
let isLoading = false;

jest.mock("../useWorkspaces", () => ({
  useWorkspaces: () => ({
    workspaces,
    canManage: true,
    defaultWorkspace: workspaces.find((w) => w.is_default) ?? workspaces[0],
    isLoading,
    error: null
  })
}));

describe("useWorkspaceExplorer", () => {
  beforeEach(() => {
    workspaces = [defaultWorkspace, renders];
    isLoading = false;
    act(() => {
      useWorkspaceExplorerStore.getState().setBrowsedWorkspaceId(null);
    });
  });

  it("browses the default workspace until the user picks one", () => {
    const { result } = renderHook(() => useWorkspaceExplorer());
    expect(result.current.workspaceId).toBe("ws-default");
    expect(result.current.workspace?.name).toBe("Default");
  });

  it("remembers the picked workspace", () => {
    const { result } = renderHook(() => useWorkspaceExplorer());
    act(() => {
      result.current.setWorkspaceId("ws-renders");
    });
    expect(result.current.workspaceId).toBe("ws-renders");
    expect(useWorkspaceExplorerStore.getState().browsedWorkspaceId).toBe(
      "ws-renders"
    );
  });

  it("ignores a remembered workspace that no longer exists", () => {
    act(() => {
      useWorkspaceExplorerStore.getState().setBrowsedWorkspaceId("ws-deleted");
    });
    const { result } = renderHook(() => useWorkspaceExplorer());
    expect(result.current.workspaceId).toBe("ws-default");
  });

  it("reports no workspace only while the list is empty", () => {
    workspaces = [];
    const { result } = renderHook(() => useWorkspaceExplorer());
    expect(result.current.workspaceId).toBeUndefined();
  });

  it("reports the list's loading state", () => {
    isLoading = true;
    const { result } = renderHook(() => useWorkspaceExplorer());
    expect(result.current.isLoading).toBe(true);
  });
});
