/**
 * useOpenProject: error handling for a failed documents fetch, and the race
 * guard that keeps a stale resolution from stealing focus back to it — shared
 * across separately mounted hook instances.
 *
 * useInvalidateProjects: which queries a project mutation invalidates.
 */
import { renderHook, act } from "@testing-library/react";

const restoreTabsQuery = jest.fn();
const openProject = jest.fn();
const addNotification = jest.fn();
const useUtils = jest.fn();
const workspaceState: {
  tabs: Array<{ id: string; type: "script"; ref: string; title: string }>;
  projectSessions: Record<string, { tabIds: string[] }>;
} = { tabs: [], projectSessions: {} };

jest.mock("../../trpc/client", () => ({
  trpcClient: {
    projects: {
      restoreTabs: {
        query: (...args: unknown[]) => restoreTabsQuery(...args)
      }
    }
  },
  trpc: {
    useUtils: (...args: unknown[]) => useUtils(...args)
  }
}));

jest.mock("../../stores/WorkspaceTabsStore", () => ({
  useWorkspaceTabsStore: Object.assign(
    <T,>(selector: (s: { openProject: jest.Mock }) => T) =>
      selector({ openProject }),
    { getState: () => workspaceState }
  ),
  PROJECT_NEW_REF: "new"
}));

jest.mock("../../stores/NotificationStore", () => ({
  useNotificationStore: <T,>(
    selector: (s: { addNotification: jest.Mock }) => T
  ) => selector({ addNotification })
}));

import { useOpenProject, useInvalidateProjects } from "../useProjects";

beforeEach(() => {
  jest.clearAllMocks();
  workspaceState.tabs = [];
  workspaceState.projectSessions = {};
});

describe("useOpenProject", () => {
  it("opens only the overview when there is no saved session", async () => {
    const { result } = renderHook(() => useOpenProject());

    let opened: boolean | undefined;
    await act(async () => {
      opened = await result.current({ id: "p1", name: "Aurora" });
    });

    expect(openProject).toHaveBeenCalledWith({
      id: "p1",
      name: "Aurora",
      documents: undefined
    });
    expect(restoreTabsQuery).not.toHaveBeenCalled();
    expect(addNotification).not.toHaveBeenCalled();
    // Callers that staged something for the project read this.
    expect(opened).toBe(true);
  });

  it("reports a failed fetch instead of silently never opening", async () => {
    workspaceState.tabs = [
      { id: "script:s1", type: "script", ref: "s1", title: "Draft" }
    ];
    workspaceState.projectSessions = { p1: { tabIds: ["script:s1"] } };
    restoreTabsQuery.mockRejectedValue(new Error("network down"));
    const { result } = renderHook(() => useOpenProject());

    let opened: boolean | undefined;
    await act(async () => {
      opened = await result.current({ id: "p1", name: "Aurora" });
    });

    expect(opened).toBe(false);
    expect(openProject).not.toHaveBeenCalled();
    expect(addNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        content: expect.stringContaining("Aurora")
      })
    );
  });

  it("ignores a stale resolution when a newer project was requested since", async () => {
    let resolveA: (value: unknown) => void = () => {};
    const pendingA = new Promise((resolve) => {
      resolveA = resolve;
    });
    workspaceState.tabs = [
      { id: "script:s1", type: "script", ref: "s1", title: "A doc" },
      { id: "script:s2", type: "script", ref: "s2", title: "B doc" }
    ];
    workspaceState.projectSessions = {
      a: { tabIds: ["script:s1"] },
      b: { tabIds: ["script:s2"] }
    };
    restoreTabsQuery.mockImplementationOnce(() => pendingA);
    restoreTabsQuery.mockImplementationOnce(() =>
      Promise.resolve([{ type: "script", ref: "s2", title: "B doc" }])
    );

    const { result } = renderHook(() => useOpenProject());

    const callA = result.current({ id: "a", name: "Project A" });
    await act(async () => {
      await result.current({ id: "b", name: "Project B" });
    });

    expect(openProject).toHaveBeenCalledTimes(1);
    expect(openProject).toHaveBeenCalledWith(
      expect.objectContaining({ id: "b" })
    );

    resolveA([{ type: "script", ref: "s1", name: "A doc" }]);
    let openedA: boolean | undefined;
    await act(async () => {
      openedA = await callA;
    });

    // The A resolution arrived after B was requested, so it must not fire.
    expect(openProject).toHaveBeenCalledTimes(1);
    // And its caller is told the group never opened.
    expect(openedA).toBe(false);
  });

  it("shares the stale-resolution guard across two separately mounted instances", async () => {
    // Two components — e.g. the list surface and the scope chip — each mount
    // their own instance of the hook. A must still no-op when B, requested
    // through the *other* instance, resolves last.
    let resolveA: (value: unknown) => void = () => {};
    const pendingA = new Promise((resolve) => {
      resolveA = resolve;
    });
    workspaceState.tabs = [
      { id: "script:s1", type: "script", ref: "s1", title: "A doc" },
      { id: "script:s2", type: "script", ref: "s2", title: "B doc" }
    ];
    workspaceState.projectSessions = {
      a: { tabIds: ["script:s1"] },
      b: { tabIds: ["script:s2"] }
    };
    restoreTabsQuery.mockImplementationOnce(() => pendingA);
    restoreTabsQuery.mockImplementationOnce(() =>
      Promise.resolve([{ type: "script", ref: "s2", title: "B doc" }])
    );

    const instanceA = renderHook(() => useOpenProject());
    const instanceB = renderHook(() => useOpenProject());

    const callA = instanceA.result.current({ id: "a", name: "Project A" });
    await act(async () => {
      await instanceB.result.current({ id: "b", name: "Project B" });
    });

    expect(openProject).toHaveBeenCalledTimes(1);
    expect(openProject).toHaveBeenCalledWith(
      expect.objectContaining({ id: "b" })
    );

    resolveA([{ type: "script", ref: "s1", name: "A doc" }]);
    await act(async () => {
      await callA;
    });

    // A resolved after B was requested through the other instance, so it
    // must still no-op instead of stealing focus back to A.
    expect(openProject).toHaveBeenCalledTimes(1);
  });
});

describe("useInvalidateProjects", () => {
  it("invalidates projects.get so an open overview tab does not go stale", () => {
    const invalidate = {
      list: { invalidate: jest.fn() },
      archived: { invalidate: jest.fn() },
      summaries: { invalidate: jest.fn() },
      unassigned: { invalidate: jest.fn() },
      get: { invalidate: jest.fn() }
    };
    useUtils.mockReturnValue({ projects: invalidate });

    const { result } = renderHook(() => useInvalidateProjects());
    act(() => {
      result.current();
    });

    expect(invalidate.list.invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate.archived.invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate.summaries.invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate.unassigned.invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate.get.invalidate).toHaveBeenCalledTimes(1);
  });
});
