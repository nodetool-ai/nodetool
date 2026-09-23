/**
 * The `+ New` menu's guided starters file into the selected project directly.
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

describe("useGuidedFlowStarters", () => {
  it("starts a storyboard in the selected project without making a project", async () => {
    const { hook, storyboard, onStarted } = renderStarters();
    await act(async () => {
      await storyboard().start();
    });

    expect(createStoryboard).toHaveBeenCalledWith({
      name: "Untitled storyboard",
      projectId: "p-current",
      document: expect.objectContaining({ setupStage: "idea" })
    });
    expect(openTab).toHaveBeenCalledWith(
      expect.objectContaining({ type: "storyboard", projectId: "p-current" })
    );
    expect(createProject).not.toHaveBeenCalled();
    expect(openProject).not.toHaveBeenCalled();
    expect(onStarted).toHaveBeenCalledTimes(1);
    expect(hook.result.current.starting).toBeNull();
  });

  it("uses an explicitly supplied project id", async () => {
    const { storyboard } = renderStarters();
    await act(async () => {
      await storyboard().start("p-other");
    });

    expect(createStoryboard).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "p-other" })
    );
  });

  it("opens the entity library directly", async () => {
    const { hook } = renderStarters();
    const entity = hook.result.current.starters.find(
      (entry) => entry.id === "entity"
    )!;
    act(() => {
      void entity.start();
    });

    await waitFor(() => expect(openPageTab).toHaveBeenCalledWith("entities"));
    expect(createProject).not.toHaveBeenCalled();
  });
});
