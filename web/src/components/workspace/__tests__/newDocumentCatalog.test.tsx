import { act, renderHook } from "@testing-library/react";
import { useNewDocumentCatalog, TEXT_FILE_TEMPLATES } from "../newDocumentCatalog";
import { isTabInScope, useWorkspaceTabsStore } from "../../../stores/WorkspaceTabsStore";

const createAsset = jest.fn();
const createNew = jest.fn();
const createNewThread = jest.fn();
const mutateAsync = jest.fn();
jest.mock("../../../stores/AssetStore", () => ({ useAssetStore: (select: (state: unknown) => unknown) => select({ createAsset }) }));
jest.mock("../../../contexts/WorkflowManagerContext", () => ({ useWorkflowManager: (select: (state: unknown) => unknown) => select({ createNew }) }));
jest.mock("../../../stores/GlobalChatStore", () => ({ __esModule: true, default: (select: (state: unknown) => unknown) => select({ createNewThread }) }));
jest.mock("../../../stores/NotificationStore", () => ({ useNotificationStore: (select: (state: unknown) => unknown) => select({ addNotification: jest.fn() }) }));
jest.mock("../../../hooks/useTimelineSequence", () => ({ useCreateTimeline: () => ({ mutateAsync }) }));
jest.mock("../../../hooks/storyboard/useStoryboards", () => ({ useCreateStoryboard: () => ({ mutateAsync }), useInstallExampleStoryboard: () => ({ mutateAsync }) }));
jest.mock("../../../hooks/script/useScripts", () => ({ useCreateScript: () => ({ mutateAsync }) }));
jest.mock("../../../hooks/jsScript/useJsScripts", () => ({ useCreateJsScript: () => ({ mutateAsync }) }));
jest.mock("../../../hooks/skills/useSkills", () => ({ useCreateSkill: () => ({ mutateAsync }) }));
jest.mock("../../../hooks/useApplications", () => ({ useCreateApplication: () => ({ mutateAsync }) }));

beforeEach(() => {
  jest.clearAllMocks();
  useWorkspaceTabsStore.setState({ tabs: [], activeTabId: null, activeProjectId: "project-a", personalProjectId: null, projectSessions: {} });
});

it("keeps an asset and its visible tab in the project captured before delayed creation", async () => {
  let finish!: (asset: { id: string; name: string }) => void;
  createAsset.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const hook = renderHook(() => useNewDocumentCatalog());
  let creating!: Promise<void>;
  act(() => { creating = hook.result.current.createTextFile(TEXT_FILE_TEMPLATES[0]); });
  act(() => { useWorkspaceTabsStore.getState().setActiveProjectId("project-b"); });
  await act(async () => { finish({ id: "text-a", name: "Draft.md" }); await creating; });
  expect(createAsset.mock.calls[0][5]).toBe("project-a");
  const state = useWorkspaceTabsStore.getState();
  expect(state.getActiveTab()?.projectId).toBe("project-a");
  expect(state.activeProjectId).toBe("project-a");
  expect(isTabInScope(state.getActiveTab()!, state.activeProjectId)).toBe(true);
});

it("keeps local workflow ownership after an intervening project switch", async () => {
  createNew.mockImplementation(async (projectId: string) => {
    useWorkspaceTabsStore.getState().setActiveProjectId("project-b");
    return { id: "workflow-a", name: "New workflow", project_id: projectId };
  });
  const hook = renderHook(() => useNewDocumentCatalog());
  await act(async () => { await hook.result.current.entries.find((entry) => entry.key === "workflow")!.create!(); });
  expect(createNew).toHaveBeenCalledWith("project-a");
  expect(useWorkspaceTabsStore.getState().getActiveTab()?.projectId).toBe("project-a");
  expect(useWorkspaceTabsStore.getState().activeProjectId).toBe("project-a");
});
