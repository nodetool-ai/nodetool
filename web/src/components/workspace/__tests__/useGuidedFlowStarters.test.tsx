/**
 * The `+ New` menu's guided starters ask where the flow should live before
 * creating anything: "current" files into the open project, "new" makes a
 * project row first and opens its group. The menu suites mock this hook
 * wholesale; this suite drives the real one through that choice.
 */
import { act, renderHook, waitFor } from "@testing-library/react";

const createStoryboard = jest.fn(async () => ({
  id: "b1",
  projectId: "p-current",
  name: "Untitled storyboard"
}));
jest.mock("../../../hooks/storyboard/useStoryboards", () => ({
  useCreateStoryboard: () => ({ mutateAsync: createStoryboard })
}));

const createScript = jest.fn(async () => ({ id: "s1" }));
jest.mock("../../../hooks/script/useScripts", () => ({
  useCreateScript: () => ({ mutateAsync: createScript })
}));

const createTimeline = jest.fn(async () => ({ id: "seq-1" }));
const seedTimelineDetail = jest.fn();
jest.mock("../../../hooks/useTimelineSequence", () => ({
  useCreateTimeline: () => ({ mutateAsync: createTimeline }),
  useSeedTimelineDetail: () => seedTimelineDetail
}));

const managerCreate = jest.fn(async () => ({ id: "wf-1" }));
jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: <T,>(selector: (s: { create: jest.Mock }) => T): T =>
    selector({ create: managerCreate })
}));

const addNotification = jest.fn();
jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: <T,>(
    selector: (s: { addNotification: jest.Mock }) => T
  ): T => selector({ addNotification })
}));

const openTab = jest.fn();
jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  creationProjectId: () => "p-current",
  useWorkspaceTabsStore: <T,>(
    selector: (s: {
      openTab: jest.Mock;
      activeProjectId: string | null;
      personalProjectId: string | null;
    }) => T
  ): T =>
    selector({
      openTab,
      activeProjectId: "p-current",
      personalProjectId: null
    }),
  LOOSE_PROJECT_ID: "default"
}));

const createProject = jest.fn(async () => ({
  id: "p-new",
  name: "New storyboard"
}));
const openProject = jest.fn(async () => true);
jest.mock("../../../hooks/useProjects", () => ({
  useCreateProject: () => ({ mutateAsync: createProject }),
  useOpenProject: () => openProject,
  useProjects: () => ({
    data: [{ id: "p-current", name: "Aurora launch", isPersonal: false }]
  })
}));

jest.mock("../../../stores/useAuth", () => ({
  useAuth: <T,>(selector: (s: { user: null }) => T): T =>
    selector({ user: null })
}));

jest.mock("../../setup/image/startImageFlow", () => ({
  startImageFlow: jest.fn()
}));

const timelineUpdate = jest.fn();
jest.mock("../../../trpc/client", () => ({
  trpcClient: { timeline: { update: { mutate: timelineUpdate } } }
}));

const openPageTab = jest.fn();
jest.mock("../openPageTab", () => ({
  openPageTab: (key: string) => openPageTab(key)
}));

import { useGuidedFlowStarters } from "../useGuidedFlowStarters";

const renderStarters = (onStarted = jest.fn()) => {
  const hook = renderHook(
    (started: jest.Mock) => useGuidedFlowStarters(started),
    { initialProps: onStarted }
  );
  const storyboard = () =>
    hook.result.current.starters.find((entry) => entry.id === "storyboard")!;
  return { hook, storyboard, onStarted };
};

beforeEach(() => {
  jest.clearAllMocks();
  openProject.mockResolvedValue(true);
});

describe("useGuidedFlowStarters destinations", () => {
  it("holds the flow as pending instead of creating", () => {
    const { hook, storyboard } = renderStarters();
    act(() => {
      void storyboard().start();
    });

    expect(hook.result.current.pendingDestination).toEqual({
      id: "storyboard",
      title: "Storyboard"
    });
    expect(createStoryboard).not.toHaveBeenCalled();
    expect(createProject).not.toHaveBeenCalled();
  });

  it("closes the menu when the picker takes over", () => {
    const { storyboard, onStarted } = renderStarters();
    act(() => {
      void storyboard().start();
    });

    expect(onStarted).toHaveBeenCalledTimes(1);
  });

  it("names the open project for the picker", () => {
    const { hook } = renderStarters();
    expect(hook.result.current.currentProject).toEqual({
      id: "p-current",
      name: "Aurora launch"
    });
  });

  it("files into the open project on current, and closes the menu", async () => {
    const { hook, storyboard, onStarted } = renderStarters();
    act(() => {
      void storyboard().start();
    });
    act(() => {
      hook.result.current.pickDestination("current");
    });

    await waitFor(() =>
      expect(createStoryboard).toHaveBeenCalledWith({
        name: "Untitled storyboard",
        projectId: "p-current",
        document: expect.objectContaining({ setupStage: "idea" })
      })
    );
    expect(createProject).not.toHaveBeenCalled();
    expect(openProject).not.toHaveBeenCalled();
    expect(hook.result.current.pendingDestination).toBeNull();
    expect(onStarted).toHaveBeenCalled();
  });

  it("makes a project row and opens its group on new", async () => {
    const { hook, storyboard, onStarted } = renderStarters();
    act(() => {
      void storyboard().start();
    });
    act(() => {
      hook.result.current.pickDestination("new");
    });

    await waitFor(() =>
      expect(createProject).toHaveBeenCalledWith({
        name: "New storyboard",
        kind: "storyboard"
      })
    );
    expect(openProject).toHaveBeenCalledWith(
      expect.objectContaining({ id: "p-new" })
    );
    await waitFor(() =>
      expect(createStoryboard).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: "p-new" })
      )
    );
    expect(hook.result.current.pendingDestination).toBeNull();
    expect(onStarted).toHaveBeenCalled();
  });

  it("drops the wait when the picker closes", () => {
    const { hook, storyboard } = renderStarters();
    act(() => {
      void storyboard().start();
    });
    act(() => {
      hook.result.current.cancelDestination();
    });

    expect(hook.result.current.pendingDestination).toBeNull();
    expect(createStoryboard).not.toHaveBeenCalled();
    expect(createProject).not.toHaveBeenCalled();
  });

  it("starts the entity flow straight away — there is no document to file", async () => {
    const { hook } = renderStarters();
    const entity = hook.result.current.starters.find(
      (entry) => entry.id === "entity"
    )!;
    act(() => {
      void entity.start();
    });

    expect(hook.result.current.pendingDestination).toBeNull();
    await waitFor(() => expect(openPageTab).toHaveBeenCalledWith("entities"));
  });
});
