import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { trpcClient } from "../../../trpc/client";
import { useWorkspaceTabsStore } from "../../../stores/WorkspaceTabsStore";
import { WorkflowEditorRedirect, ChatThreadRedirect } from "../RouteRedirects";

const mockGlobalChatState = {
  threads: {} as Record<string, { id: string; project_id: string }>
};

jest.mock("../../../stores/GlobalChatStore", () => ({
  __esModule: true,
  default: { getState: () => mockGlobalChatState }
}));

jest.mock("../../../trpc/client", () => ({
  trpcClient: {
    workflows: { get: { query: jest.fn() } },
    threads: { get: { query: jest.fn() } }
  }
}));

beforeEach(() => {
  useWorkspaceTabsStore.setState({
    tabs: [], activeTabId: null, activeProjectId: null, personalProjectId: null,
    projectSessions: {}
  });
  jest.mocked(trpcClient.workflows.get.query).mockReset();
  jest.mocked(trpcClient.threads.get.query).mockReset();
  mockGlobalChatState.threads = {};
});

const renderRedirect = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/editor/:workflowId" element={<WorkflowEditorRedirect />} />
        <Route path="/chat/:thread_id" element={<ChatThreadRedirect />} />
        <Route path="/workspace" element={<div>Workspace</div>} />
      </Routes>
    </MemoryRouter>
  );

it("waits for workflow ownership before assigning a cold deep-link tab", async () => {
  let resolve: (value: { id: string; project_id: string }) => void = () => {};
  jest.mocked(trpcClient.workflows.get.query).mockReturnValue(
    new Promise((done) => { resolve = done; }) as never
  );
  renderRedirect("/editor/wf-1");
  expect(useWorkspaceTabsStore.getState().tabs).toEqual([]);
  resolve({ id: "wf-1", project_id: "p-1" });
  await waitFor(() => expect(screen.getByText("Workspace")).toBeInTheDocument());
  const state = useWorkspaceTabsStore.getState();
  expect(state.activeProjectId).toBe("p-1");
  expect(state.tabs.find((tab) => tab.ref === "wf-1")?.projectId).toBe("p-1");
});

it("loads an uncached thread's owner before opening its deep-link tab", async () => {
  jest.mocked(trpcClient.threads.get.query).mockResolvedValue({
    id: "thread-1", project_id: "p-chat"
  } as never);
  renderRedirect("/chat/thread-1");
  await waitFor(() => expect(screen.getByText("Workspace")).toBeInTheDocument());
  const state = useWorkspaceTabsStore.getState();
  expect(state.activeProjectId).toBe("p-chat");
  expect(state.tabs.find((tab) => tab.ref === "thread-1")?.projectId).toBe("p-chat");
});

it("opens a locally created thread that is not on the server yet", async () => {
  mockGlobalChatState.threads["local-thread"] = {
    id: "local-thread", project_id: "p-local"
  };
  renderRedirect("/chat/local-thread");
  await waitFor(() => expect(screen.getByText("Workspace")).toBeInTheDocument());
  expect(trpcClient.threads.get.query).not.toHaveBeenCalled();
  const state = useWorkspaceTabsStore.getState();
  expect(state.activeProjectId).toBe("p-local");
  expect(state.tabs.find((tab) => tab.ref === "local-thread")?.projectId).toBe("p-local");
});
