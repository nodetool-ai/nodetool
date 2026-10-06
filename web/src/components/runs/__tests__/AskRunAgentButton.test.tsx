import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { AskRunAgentButton } from "../AskRunAgentButton";
import mockTheme from "../../../__mocks__/themeMock";
import useChatDraftStore from "../../../stores/ChatDraftStore";
import { resolveUiContext } from "../../../lib/chat/uiContext";

const createThread = jest.fn();
const openTab = jest.fn();
jest.mock("../../../stores/GlobalChatStore", () => ({ __esModule: true,
  default: <T,>(select: (state: { createNewThread: jest.Mock }) => T) => select({ createNewThread: createThread }) }));
jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  creationProjectId: () => "project-a",
  useWorkspaceTabsStore: Object.assign(<T,>(select: (state: { openForegroundTab: jest.Mock }) => T) => select({ openForegroundTab: openTab }),
    { getState: () => ({ tabs: [], activeTabId: null }) })
}));

beforeEach(() => {
  jest.clearAllMocks();
  useChatDraftStore.setState({ drafts: {}, runReferences: {} });
  createThread.mockResolvedValueOnce("thread-a").mockResolvedValueOnce("thread-b");
});

it("opens independent chats with typed full run/span identifiers and no transcript copy", async () => {
  const runA = "a".repeat(32), runB = "b".repeat(32), span = "c".repeat(16);
  render(<ThemeProvider theme={mockTheme}>
    <AskRunAgentButton runId={runA} spanId={span} label="Ask A" />
    <AskRunAgentButton runId={runB} label="Ask B" />
  </ThemeProvider>);
  await userEvent.click(screen.getByRole("button", { name: "Ask A" }));
  await userEvent.click(screen.getByRole("button", { name: "Ask B" }));
  await waitFor(() => expect(openTab).toHaveBeenCalledTimes(2));
  expect(useChatDraftStore.getState().runReferences).toEqual({ "thread-a": { run_id: runA, span_id: span }, "thread-b": { run_id: runB } });
  expect(useChatDraftStore.getState().drafts["thread-a"]).not.toContain(runA);
  expect(openTab).toHaveBeenCalledWith({ type: "chat", ref: "thread-a", title: "Inspect run", mode: "view", projectId: "project-a" });
  const sent = resolveUiContext(() => ({ run: useChatDraftStore.getState().runReferences["thread-a"] }), "workspace_chat");
  expect(sent?.run).toEqual({ run_id: runA, span_id: span });
  expect(resolveUiContext(() => ({ run: useChatDraftStore.getState().runReferences["thread-b"] }), "workspace_chat")?.run).toEqual({ run_id: runB });
});
