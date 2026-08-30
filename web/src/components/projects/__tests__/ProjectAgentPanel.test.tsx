/**
 * The project's agent column: it binds the project's own thread, and sends the
 * opening turn the new-project surface staged — once, after the history it
 * would otherwise be overwritten by has loaded.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

const ensureThread = jest.fn(async () => ({ threadId: "t1" }));
jest.mock("../../../trpc/client", () => ({
  trpc: { projects: { thread: { useMutation: () => ({ mutateAsync: ensureThread }) } } }
}));

interface SentMessage {
  role: string;
  content: unknown[];
  system_prompt?: string;
}
type SendOutcome =
  | { ok: true; threadId: string }
  | { ok: false; reason: "no_model" | "not_connected"; error: string };

const trySendMessage = jest.fn(
  async (_message: SentMessage, threadId: string): Promise<SendOutcome> => ({
    ok: true,
    threadId
  })
);
const sendMessage = jest.fn(
  async (_message: SentMessage, _threadId: string) => undefined
);
const fetchThread = jest.fn(async () => null);
const loadMessages = jest.fn(async () => []);
const chatState = {
  connect: jest.fn(async () => undefined),
  fetchThread,
  loadMessages,
  sendMessage,
  trySendMessage,
  stopGeneration: jest.fn(),
  messageCache: {} as Record<string, unknown[]>,
  status: "connected",
  selectedModel: { provider: "anthropic", id: "claude-sonnet-5" },
  setSelectedModel: jest.fn()
};
jest.mock("../../../stores/GlobalChatStore", () => ({
  __esModule: true,
  default: <T,>(selector: (s: typeof chatState) => T) => selector(chatState),
  useThreadRuntime: () => ({
    status: "idle",
    statusMessage: null,
    progress: { current: 0, total: 0 },
    planningUpdate: null,
    taskUpdate: null,
    logUpdate: null,
    runningToolCallId: null,
    toolMessage: null
  })
}));

jest.mock("../../chat/containers/ChatView", () => ({
  __esModule: true,
  default: () => <div data-testid="chat-view" />
}));

import ProjectAgentPanel from "../ProjectAgentPanel";
import {
  peekProjectFirstTurn,
  stageProjectFirstTurn,
  takeProjectFirstTurn
} from "../projectAgent";

const panel = (threadId: string | null) => (
  <ThemeProvider theme={mockTheme}>
    <ProjectAgentPanel projectId="p1" projectName="Aurora" threadId={threadId} />
  </ThemeProvider>
);

const renderPanel = (threadId: string | null = null) => render(panel(threadId));

beforeEach(() => {
  jest.clearAllMocks();
  takeProjectFirstTurn("p1");
  chatState.status = "connected";
  trySendMessage.mockImplementation(async (_message, threadId) => ({
    ok: true,
    threadId
  }));
});

describe("ProjectAgentPanel", () => {
  it("creates the project's thread on first visit and loads its history", async () => {
    renderPanel();
    await waitFor(() => expect(ensureThread).toHaveBeenCalledWith({ id: "p1" }));
    await waitFor(() => expect(loadMessages).toHaveBeenCalledWith("t1"));
    expect(await screen.findByTestId("chat-view")).toBeInTheDocument();
  });

  it("sends a staged opening turn once, into the project's thread", async () => {
    stageProjectFirstTurn("p1", [{ type: "text", text: "A spot for our lamp" }]);
    renderPanel("t1");

    await waitFor(() => expect(trySendMessage).toHaveBeenCalledTimes(1));
    const [message, threadId] = trySendMessage.mock.calls[0];
    expect(threadId).toBe("t1");
    expect(message.role).toBe("user");
    expect(message.content).toEqual([
      { type: "text", text: "A spot for our lamp" }
    ]);
    expect(message.system_prompt).toContain("Aurora");
    // The history load lands before the send, or the send would be wiped.
    expect(loadMessages.mock.invocationCallOrder[0]).toBeLessThan(
      trySendMessage.mock.invocationCallOrder[0]
    );
    // Delivered, so nothing is left staged for a remount to send again.
    await waitFor(() => expect(peekProjectFirstTurn("p1")).toBeNull());
  });

  it("sends nothing when no opening turn was staged", async () => {
    renderPanel("t1");
    await waitFor(() => expect(loadMessages).toHaveBeenCalled());
    expect(trySendMessage).not.toHaveBeenCalled();
  });

  // BUG F2: the turn used to be consumed before the send resolved, so a send
  // that never left the client took the user's prompt with it.
  it("keeps the opening turn staged when the send could not go out", async () => {
    trySendMessage.mockResolvedValue({
      ok: false,
      reason: "no_model",
      error: "No model selected."
    });
    stageProjectFirstTurn("p1", [{ type: "text", text: "A spot for our lamp" }]);
    renderPanel("t1");

    await waitFor(() => expect(trySendMessage).toHaveBeenCalledTimes(1));
    expect(peekProjectFirstTurn("p1")).toEqual([
      { type: "text", text: "A spot for our lamp" }
    ]);
  });

  // BUG F4: a rejection only happens after the optimistic turn is already in
  // the thread cache, so keeping it staged sent the same turn twice on the
  // next retrigger.
  it("drops the stage when the send rejects, since the turn reached the thread", async () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    trySendMessage.mockRejectedValue(new Error("socket closed"));
    stageProjectFirstTurn("p1", [{ type: "text", text: "keep me" }]);
    renderPanel("t1");

    await waitFor(() => expect(trySendMessage).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(peekProjectFirstTurn("p1")).toBeNull());
    consoleError.mockRestore();
  });

  // BUG F3: a `not_connected` refusal had no retrigger — the effect watched
  // the model but not the connection.
  it("re-attempts the still-staged turn once the socket reconnects", async () => {
    chatState.status = "disconnected";
    trySendMessage.mockResolvedValue({
      ok: false,
      reason: "not_connected",
      error: "Not connected to chat service"
    });
    stageProjectFirstTurn("p1", [{ type: "text", text: "deliver me" }]);
    const view = renderPanel("t1");

    await waitFor(() => expect(trySendMessage).toHaveBeenCalledTimes(1));
    expect(peekProjectFirstTurn("p1")).not.toBeNull();

    trySendMessage.mockImplementation(async (_message, threadId) => ({
      ok: true,
      threadId
    }));
    chatState.status = "connected";
    view.rerender(panel("t1"));

    await waitFor(() => expect(trySendMessage).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(peekProjectFirstTurn("p1")).toBeNull());
  });

  // BUG F15: the projects.get cache catches up mid-run (threadId null → id).
  // Re-binding would reload the thread and wipe the optimistic user turn.
  it("does not re-bind when the incoming threadId catches up with the one it created", async () => {
    const view = render(panel(null));
    await waitFor(() => expect(loadMessages).toHaveBeenCalledTimes(1));

    view.rerender(panel("t1"));

    await Promise.resolve();
    expect(loadMessages).toHaveBeenCalledTimes(1);
    expect(fetchThread).toHaveBeenCalledTimes(1);
    expect(ensureThread).toHaveBeenCalledTimes(1);
  });

  it("re-binds when the project names a different thread", async () => {
    const view = render(panel("t1"));
    await waitFor(() => expect(loadMessages).toHaveBeenCalledWith("t1"));

    view.rerender(panel("t2"));

    await waitFor(() => expect(loadMessages).toHaveBeenCalledWith("t2"));
  });

  // BUG F5: `historyLoaded` stayed true across a re-bind, so a staged turn
  // could be sent against the new thread id while its history was still
  // loading — and the load would then wipe it.
  it("does not send a staged turn into a thread whose history is still loading", async () => {
    const view = render(panel("t1"));
    await waitFor(() => expect(loadMessages).toHaveBeenCalledWith("t1"));

    let finishLoad: () => void = () => {};
    loadMessages.mockImplementationOnce(
      () =>
        new Promise<never[]>((resolve) => {
          finishLoad = () => resolve([]);
        })
    );
    stageProjectFirstTurn("p1", [{ type: "text", text: "second thread" }]);
    view.rerender(panel("t2"));

    await waitFor(() => expect(loadMessages).toHaveBeenCalledWith("t2"));
    expect(trySendMessage).not.toHaveBeenCalled();

    finishLoad();
    await waitFor(() => expect(trySendMessage).toHaveBeenCalledTimes(1));
    expect(trySendMessage.mock.calls[0][1]).toBe("t2");
  });
});
