import { openChatThread } from "../openChatThread";
import { isTabInScope, useWorkspaceTabsStore } from "../../../stores/WorkspaceTabsStore";

const threads: Record<string, { id: string; title: string; project_id?: string }> = {};
const getThread = jest.fn();
jest.mock("../../../stores/GlobalChatStore", () => ({
  __esModule: true,
  default: { getState: () => ({ threads }) }
}));
jest.mock("../../../trpc/client", () => ({
  trpcClient: { threads: { get: { query: (input: unknown, options: unknown) => getThread(input, options) } } }
}));

beforeEach(() => {
  jest.clearAllMocks();
  for (const id of Object.keys(threads)) delete threads[id];
  useWorkspaceTabsStore.setState({ tabs: [], activeProjectId: "project-a", activeTabId: null, projectSessions: {} });
});

function expectVisibleThread(projectId: string | null): void {
  const state = useWorkspaceTabsStore.getState();
  expect(state.activeProjectId).toBe(projectId);
  expect(state.getActiveTab()?.ref).toBe("thread-b");
  expect(isTabInScope(state.getActiveTab()!, state.activeProjectId)).toBe(true);
}

it("opens a cached conversation in its owning project", async () => {
  threads["thread-b"] = { id: "thread-b", title: "B conversation", project_id: "project-b" };
  await openChatThread("thread-b");
  expectVisibleThread("project-b");
  expect(getThread).not.toHaveBeenCalled();
});

it("resolves an uncached conversation before selecting its scope", async () => {
  getThread.mockResolvedValue({ id: "thread-b", title: "B conversation", project_id: "project-b" });
  await openChatThread("thread-b");
  expect(getThread).toHaveBeenCalledWith({ id: "thread-b" }, { signal: undefined });
  expectVisibleThread("project-b");
});

it("opens an explicitly unassigned thread in the loose scope", async () => {
  getThread.mockResolvedValue({ id: "thread-b", title: "Loose conversation", project_id: null });
  await openChatThread("thread-b");
  expectVisibleThread(null);
});

it("keeps the current destination intact when resolution fails", async () => {
  const state = useWorkspaceTabsStore.getState();
  state.openTab({ type: "text", ref: "draft", projectId: "project-a" });
  getThread.mockRejectedValue(new Error("Conversation unavailable"));
  await expect(openChatThread("thread-b")).rejects.toThrow("Conversation unavailable");
  expect(useWorkspaceTabsStore.getState().activeProjectId).toBe("project-a");
  expect(useWorkspaceTabsStore.getState().getActiveTab()?.ref).toBe("draft");
});

it("does not navigate when the link resolver is cancelled", async () => {
  const controller = new AbortController();
  getThread.mockImplementation(async () => {
    controller.abort();
    return { id: "thread-b", project_id: "project-b" };
  });
  await openChatThread("thread-b", controller.signal);
  expect(useWorkspaceTabsStore.getState().tabs).toHaveLength(0);
  expect(useWorkspaceTabsStore.getState().activeProjectId).toBe("project-a");
});
