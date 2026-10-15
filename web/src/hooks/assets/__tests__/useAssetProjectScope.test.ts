import { renderHook } from "@testing-library/react";

import {
  ALL_PROJECTS,
  useAssetGridStore
} from "../../../stores/AssetGridStore";
import { useWorkspaceTabsStore } from "../../../stores/WorkspaceTabsStore";
import { useAssetProjectScope } from "../useAssetProjectScope";

describe("useAssetProjectScope", () => {
  beforeEach(() => {
    useWorkspaceTabsStore.setState({
      activeProjectId: "project-a",
      personalProjectId: "personal:user-1"
    });
    useAssetGridStore.setState({ projectFilter: null });
  });

  it("follows the workspace's project without a filter", () => {
    const { result } = renderHook(() => useAssetProjectScope());
    expect(result.current).toEqual({
      projectId: "project-a",
      scopeKey: "project-a",
      activeProjectId: "project-a"
    });
  });

  it("lists a pinned project", () => {
    useAssetGridStore.setState({ projectFilter: "project-b" });
    const { result } = renderHook(() => useAssetProjectScope());
    expect(result.current.projectId).toBe("project-b");
    expect(result.current.activeProjectId).toBe("project-a");
  });

  it("drops the project for every project", () => {
    useAssetGridStore.setState({ projectFilter: ALL_PROJECTS });
    const { result } = renderHook(() => useAssetProjectScope());
    expect(result.current.projectId).toBeUndefined();
    expect(result.current.scopeKey).toBe(ALL_PROJECTS);
  });
});
