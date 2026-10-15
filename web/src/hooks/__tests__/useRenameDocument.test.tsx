import { act, renderHook } from "@testing-library/react";

import { useRenameDocument } from "../useRenameDocument";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { trpcClient } from "../../trpc/client";

const mockWorkflowManager = {
  getWorkflow: jest.fn(),
  updateWorkflow: jest.fn(),
  saveWorkflow: jest.fn(),
  queryClient: { invalidateQueries: jest.fn() }
};
const mockWorkflowManagerStore = { getState: () => mockWorkflowManager };
jest.mock("../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManagerStore: () => mockWorkflowManagerStore
}));

const mockInvalidate = {
  documentsIndex: jest.fn(),
  documentPage: jest.fn(),
  summaries: jest.fn(),
  storyboards: jest.fn()
};
const mockUtils = {
  documents: { index: { invalidate: mockInvalidate.documentsIndex } },
  projects: {
    documentPage: { invalidate: mockInvalidate.documentPage },
    summaries: { invalidate: mockInvalidate.summaries },
    list: { invalidate: jest.fn() }
  },
  storyboards: { list: { invalidate: mockInvalidate.storyboards } },
  scripts: { list: { invalidate: jest.fn() } },
  skills: {
    get: { getData: jest.fn(), fetch: jest.fn(), setData: jest.fn() },
    list: { invalidate: jest.fn() }
  }
};
jest.mock("../../trpc/client", () => ({
  trpc: { useUtils: () => mockUtils },
  trpcClient: {
    workflows: { update: { mutate: jest.fn() } },
    timeline: { update: { mutate: jest.fn() } },
    sketch: { update: { mutate: jest.fn() } },
    storyboards: {
      get: { query: jest.fn() },
      update: { mutate: jest.fn() }
    },
    scripts: { get: { query: jest.fn() }, update: { mutate: jest.fn() } }
  }
}));

// tRPC returns a new mutation object on every render; its `mutateAsync` is stable.
const mockUpdateApplicationAsync = jest.fn();
jest.mock("../useApplications", () => ({
  useUpdateApplication: () => ({ mutateAsync: mockUpdateApplicationAsync })
}));

const mockSketchSession = { documentId: "other-sketch" };
jest.mock("../../stores/sketch/SketchInstance", () => ({
  getActiveSketchInstance: () => ({
    session: { getState: () => mockSketchSession }
  })
}));
jest.mock("../../stores/sketch/SketchSessionStore", () => ({
  renameSketchDocument: jest.fn()
}));

const timelineUpdate = jest.mocked(trpcClient.timeline.update.mutate);
const workflowUpdate = jest.mocked(trpcClient.workflows.update.mutate);
const storyboardGet = jest.mocked(trpcClient.storyboards.get.query);
const storyboardUpdate = jest.mocked(trpcClient.storyboards.update.mutate);

const tabTitle = (id: string) =>
  useWorkspaceTabsStore.getState().tabs.find((tab) => tab.id === id)?.title;

const expectListsRefreshed = () => {
  expect(mockInvalidate.documentsIndex).toHaveBeenCalled();
  expect(mockInvalidate.documentPage).toHaveBeenCalled();
  expect(mockInvalidate.summaries).toHaveBeenCalled();
};

beforeEach(() => {
  jest.clearAllMocks();
  useWorkspaceTabsStore.setState({ tabs: [], activeTabId: null });
  useNotificationStore.setState({ notifications: [] });
  mockWorkflowManager.getWorkflow.mockReturnValue(undefined);
});

const renderRename = () => renderHook(() => useRenameDocument()).result;

// The Documents panel memoizes its rows and passes this function to each one,
// so a new function on every render re-renders hundreds of rows.
it("returns the same function across renders", () => {
  const { result, rerender } = renderHook(() => useRenameDocument());
  const first = result.current;
  rerender();
  expect(result.current).toBe(first);
});

describe("workflow", () => {
  it("saves an open workflow through the workflow manager", async () => {
    const workflow = { id: "wf-1", name: "Old flow" };
    mockWorkflowManager.getWorkflow.mockReturnValue(workflow);
    mockWorkflowManager.saveWorkflow.mockResolvedValue(undefined);
    const rename = renderRename();

    await act(() =>
      rename.current(
        { type: "workflow", ref: "wf-1", currentName: "Old flow" },
        "  New flow "
      )
    );

    expect(mockWorkflowManager.updateWorkflow).toHaveBeenCalledWith({
      id: "wf-1",
      name: "New flow"
    });
    expect(mockWorkflowManager.saveWorkflow).toHaveBeenCalledWith({
      id: "wf-1",
      name: "New flow"
    });
    expect(workflowUpdate).not.toHaveBeenCalled();
    expectListsRefreshed();
  });

  it("restores an open workflow when its save fails", async () => {
    const workflow = { id: "wf-1", name: "Old flow" };
    mockWorkflowManager.getWorkflow.mockReturnValue(workflow);
    mockWorkflowManager.saveWorkflow.mockRejectedValue(new Error("Offline"));
    const rename = renderRename();

    await act(() =>
      rename.current(
        { type: "workflow", ref: "wf-1", currentName: "Old flow" },
        "New flow"
      )
    );

    expect(mockWorkflowManager.updateWorkflow).toHaveBeenLastCalledWith(
      workflow
    );
    expect(useNotificationStore.getState().notifications[0]?.content).toBe(
      "Failed to rename workflow: Offline"
    );
  });

  it("renames a workflow no tab has open on the server", async () => {
    workflowUpdate.mockResolvedValue(
      {} as Awaited<ReturnType<typeof workflowUpdate>>
    );
    const rename = renderRename();

    await act(() =>
      rename.current(
        { type: "workflow", ref: "wf-2", currentName: "Closed flow" },
        "Renamed flow"
      )
    );

    expect(workflowUpdate).toHaveBeenCalledWith({
      id: "wf-2",
      name: "Renamed flow"
    });
    expectListsRefreshed();
  });
});

describe("timeline", () => {
  it("updates the open tab title and the server", async () => {
    useWorkspaceTabsStore.getState().openTab({
      type: "timeline",
      ref: "tl-1",
      title: "Cut 1"
    });
    timelineUpdate.mockResolvedValue(
      {} as Awaited<ReturnType<typeof timelineUpdate>>
    );
    const rename = renderRename();

    await act(() =>
      rename.current(
        { type: "timeline", ref: "tl-1", currentName: "Cut 1" },
        "Final cut"
      )
    );

    expect(timelineUpdate).toHaveBeenCalledWith({
      id: "tl-1",
      name: "Final cut"
    });
    expect(tabTitle("timeline:tl-1")).toBe("Final cut");
    expectListsRefreshed();
  });

  it("rolls the tab title back when the server refuses", async () => {
    useWorkspaceTabsStore.getState().openTab({
      type: "timeline",
      ref: "tl-1",
      title: "Cut 1"
    });
    timelineUpdate.mockRejectedValue(new Error("Denied"));
    const rename = renderRename();

    await act(() =>
      rename.current(
        { type: "timeline", ref: "tl-1", currentName: "Cut 1" },
        "Final cut"
      )
    );

    expect(tabTitle("timeline:tl-1")).toBe("Cut 1");
    expect(useNotificationStore.getState().notifications[0]?.content).toBe(
      "Failed to rename document: Denied"
    );
    expect(mockInvalidate.documentPage).not.toHaveBeenCalled();
  });
});

describe("storyboard", () => {
  it("renames a storyboard no editor has loaded at its server revision", async () => {
    storyboardGet.mockResolvedValue({ updatedAt: "rev-1" } as Awaited<
      ReturnType<typeof storyboardGet>
    >);
    storyboardUpdate.mockResolvedValue({ updatedAt: "rev-2" } as Awaited<
      ReturnType<typeof storyboardUpdate>
    >);
    const rename = renderRename();

    await act(() =>
      rename.current(
        { type: "storyboard", ref: "board-9", currentName: "Board" },
        "Launch board"
      )
    );

    expect(storyboardUpdate).toHaveBeenCalledWith({
      id: "board-9",
      name: "Launch board",
      baseUpdatedAt: "rev-1"
    });
    expect(mockInvalidate.storyboards).toHaveBeenCalled();
    expectListsRefreshed();
  });
});

it("renames a sketch that is not in the active editor on the server", async () => {
  const sketchUpdate = jest.mocked(trpcClient.sketch.update.mutate);
  sketchUpdate.mockResolvedValue(
    {} as Awaited<ReturnType<typeof sketchUpdate>>
  );
  const rename = renderRename();

  await act(() =>
    rename.current(
      { type: "sketch", ref: "sketch-1", currentName: "Sketch" },
      "Poster"
    )
  );

  expect(sketchUpdate).toHaveBeenCalledWith({ id: "sketch-1", name: "Poster" });
});

it.each([
  ["an unchanged name", "Cut 1"],
  ["an empty name", "   "]
])("skips %s", async (_label, name) => {
  const rename = renderRename();
  await act(() =>
    rename.current(
      { type: "timeline", ref: "tl-1", currentName: "Cut 1" },
      name
    )
  );
  expect(timelineUpdate).not.toHaveBeenCalled();
});

it("does nothing for a type that cannot be renamed", async () => {
  const rename = renderRename();
  await act(() =>
    rename.current({ type: "game", ref: "g-1", currentName: "Game" }, "New")
  );
  expect(mockInvalidate.documentPage).not.toHaveBeenCalled();
});
