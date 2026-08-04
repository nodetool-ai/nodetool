import { handleChatWebSocketMessage } from "../chatProtocol";

jest.mock("../../../lib/tools/frontendTools", () => ({
  FrontendToolRegistry: {
    has: jest.fn(),
    call: jest.fn()
  }
}));

jest.mock("../../../lib/websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: {
    send: jest.fn().mockResolvedValue(undefined),
    ensureConnection: jest.fn().mockResolvedValue(undefined)
  }
}));

const makeState = (threadRuntimeStatus: string) => ({
  status: "streaming",
  currentThreadId: "thread-1",
  threads: {
    "thread-1": {
      id: "thread-1",
      title: "T",
      updated_at: new Date().toISOString()
    }
  },
  threadRuntime: {
    "thread-1": {
      status: threadRuntimeStatus,
      statusMessage: null,
      progress: { current: 0, total: 0 },
      error: null,
      planningUpdate: null,
      taskUpdate: null,
      logUpdate: null,
      runningToolCallId: null,
      toolMessage: null,
      sendMessageTimeoutId: null
    }
  },
  messageCache: { "thread-1": [] },
  chatReplayCursors: {},
  loadMessages: jest.fn().mockResolvedValue([]),
  selectedModel: { provider: "", id: "" },
  summarizeThread: jest.fn(),
  updateThreadTitle: jest.fn()
});

const makeHarness = (threadRuntimeStatus = "streaming") => {
  let state: any = makeState(threadRuntimeStatus);
  const set = jest.fn((updater) => {
    state = {
      ...state,
      ...(typeof updater === "function" ? updater(state) : updater)
    };
  });
  return { set, get: () => state, state: () => state };
};

describe("chat resume protocol", () => {
  it("tracks the chat_seq high-water mark per thread", async () => {
    const h = makeHarness();
    await handleChatWebSocketMessage(
      {
        type: "chunk",
        thread_id: "thread-1",
        content: "hi",
        done: false,
        chat_seq: 7
      } as any,
      h.set,
      h.get
    );
    expect(h.state().chatReplayCursors["thread-1"]).toBe(7);
  });

  it("chat_resumed unknown resets the runtime and reloads history", async () => {
    const h = makeHarness("streaming");
    await handleChatWebSocketMessage(
      {
        type: "chat_resumed",
        thread_id: "thread-1",
        status: "unknown",
        last_seq: 0,
        replay_count: 0,
        replay_incomplete: false
      } as any,
      h.set,
      h.get
    );
    expect(h.state().threadRuntime["thread-1"].status).toBe("idle");
    expect(h.state().loadMessages).toHaveBeenCalledWith("thread-1");
  });

  it("chat_resumed incomplete replay also reconciles from history", async () => {
    const h = makeHarness("streaming");
    await handleChatWebSocketMessage(
      {
        type: "chat_resumed",
        thread_id: "thread-1",
        status: "running",
        last_seq: 40,
        replay_count: 12,
        replay_incomplete: true
      } as any,
      h.set,
      h.get
    );
    expect(h.state().threadRuntime["thread-1"].status).toBe("idle");
    expect(h.state().loadMessages).toHaveBeenCalledWith("thread-1");
  });

  it("chat_resumed running leaves the streaming runtime alone", async () => {
    const h = makeHarness("streaming");
    await handleChatWebSocketMessage(
      {
        type: "chat_resumed",
        thread_id: "thread-1",
        status: "running",
        last_seq: 40,
        replay_count: 12,
        replay_incomplete: false
      } as any,
      h.set,
      h.get
    );
    expect(h.state().threadRuntime["thread-1"].status).toBe("streaming");
    expect(h.state().loadMessages).not.toHaveBeenCalled();
  });
});
