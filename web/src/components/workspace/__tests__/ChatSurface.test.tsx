import type React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import ChatSurface from "../ChatSurface";
import useChatDraftStore from "../../../stores/ChatDraftStore";
import mockTheme from "../../../__mocks__/themeMock";

const fetchThread = jest.fn();
const ensureLocalThread = jest.fn();
const loadMessages = jest.fn().mockResolvedValue([]);
const connect = jest.fn().mockResolvedValue(undefined);
const switchThread = jest.fn();
const createNewThread = jest.fn().mockResolvedValue("thread-other");
const sendMessage = jest.fn();
const stopGeneration = jest.fn();
const setSelectedModel = jest.fn();
const openTab = jest.fn();
const setTitle = jest.fn();

const chatState = {
  currentThreadId: null as string | null,
  threads: {} as Record<string, { id: string; title: string }>,
  messageCache: {} as Record<string, unknown[]>,
  threadWorkflowId: {} as Record<string, string | null>,
  selectedModel: {
    type: "language_model",
    provider: "openai",
    id: "gpt-5"
  },
  connect,
  fetchThread,
  ensureLocalThread,
  switchThread,
  loadMessages,
  createNewThread,
  sendMessage,
  stopGeneration,
  setSelectedModel
};

jest.mock("../../../stores/GlobalChatStore", () => {
  const useStore = <T,>(selector: (state: typeof chatState) => T): T =>
    selector(chatState);
  useStore.getState = () => chatState;
  useStore.persist = {
    hasHydrated: () => true,
    onFinishHydration: (cb: () => void) => {
      cb();
      return () => undefined;
    }
  };
  return {
    __esModule: true,
    default: useStore,
    useThreadRuntime: () => ({
      status: "idle",
      statusMessage: null,
      progress: { current: 0, total: 0 },
      runningToolCallId: null,
      toolMessage: null,
      planningUpdate: null,
      taskUpdate: null,
      logUpdate: null
    })
  };
});

jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  __esModule: true,
  useWorkspaceTabsStore: <T,>(
    selector: (state: { openTab: jest.Mock; setTitle: jest.Mock }) => T
  ) => selector({ openTab, setTitle })
}));

jest.mock("../../chat/containers/ChatView", () => ({
  __esModule: true,
  default: ({
    noMessagesPlaceholder
  }: {
    noMessagesPlaceholder?: React.ReactNode;
  }) => (
    <div>
      chat view
      {noMessagesPlaceholder}
    </div>
  )
}));

jest.mock("../../chat/containers/WelcomePlaceholder", () => ({
  __esModule: true,
  default: ({ onSuggestionClick }: { onSuggestionClick: (s: string) => void }) => (
    <button onClick={() => onSuggestionClick("Analyze an image")}>
      suggestion
    </button>
  )
}));

const renderSurface = (refId = "thread-new") =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ChatSurface refId={refId} active />
    </ThemeProvider>
  );

describe("ChatSurface", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    chatState.currentThreadId = null;
    chatState.threads = {};
    chatState.messageCache = {};
    fetchThread.mockResolvedValue(null);
  });

  it("shows the composer when a new thread is not on the server yet", async () => {
    renderSurface();

    expect(await screen.findByText("chat view")).toBeInTheDocument();
    expect(
      screen.queryByText("Conversation not found")
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(ensureLocalThread).toHaveBeenCalledWith("thread-new")
    );
  });

  it("does not refetch a thread that already exists locally", async () => {
    chatState.threads = {
      "thread-new": { id: "thread-new", title: "New conversation" }
    };

    renderSurface();

    expect(await screen.findByText("chat view")).toBeInTheDocument();
    await waitFor(() => expect(loadMessages).toHaveBeenCalledWith("thread-new"));
    expect(fetchThread).not.toHaveBeenCalled();
    expect(ensureLocalThread).not.toHaveBeenCalled();
  });

  it("seeds the composer with a welcome suggestion instead of sending it", async () => {
    useChatDraftStore.setState({ drafts: {} });
    renderSurface();

    await userEvent.click(await screen.findByText("suggestion"));

    expect(sendMessage).not.toHaveBeenCalled();
    expect(useChatDraftStore.getState().drafts["thread-new"]).toBe(
      "Analyze an image"
    );
  });
});
