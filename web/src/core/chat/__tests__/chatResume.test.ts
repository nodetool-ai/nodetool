import { handleChatWebSocketMessage } from "../chatProtocol";
import { stub } from "../../../test-utils/doubles";
import type { GlobalChatState } from "../../../stores/GlobalChatStore";
import type { ThreadRuntimeStatus } from "../threadRuntime";

jest.mock("../../../lib/tools/frontendTools", () => ({
  FrontendToolRegistry: {
    has: jest.fn(),
    call: jest.fn()
  }
}));

jest.mock("../../../lib/websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: {
    setResumeJobIdProvider: jest.fn(),
    subscribe: jest.fn(() => () => undefined),
    subscribeEvent: jest.fn(() => () => undefined),
    send: jest.fn().mockResolvedValue(undefined),
    ensureConnection: jest.fn().mockResolvedValue(undefined)
  }
}));

const makeState = (
  threadRuntimeStatus: ThreadRuntimeStatus
): GlobalChatState =>
  stub<GlobalChatState>({
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

/** A zustand `set` argument given as an updater rather than a partial state. */
const isStateUpdater = (
  value: unknown
): value is (state: unknown) => Record<string, unknown> =>
  typeof value === "function";

const makeHarness = (
  threadRuntimeStatus: ThreadRuntimeStatus = "streaming"
) => {
  let state = makeState(threadRuntimeStatus);
  const set = jest.fn((updater) => {
    state = {
      ...state,
      ...(isStateUpdater(updater) ? updater(state) : updater)
    };
  });
  return { set, get: () => state, state: () => state };
};

describe("chat resume protocol", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

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

  it("chat_resumed incomplete replay reconciles from history, staying busy while running", async () => {
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
    // The turn is still running server-side — the runtime must keep showing
    // the agent at work while history reloads, not flash back to idle.
    expect(h.state().threadRuntime["thread-1"].status).toBe("loading");
    expect(h.state().loadMessages).toHaveBeenCalledWith("thread-1");
  });

  it("chat_resumed incomplete replay of a finished turn resets to idle", async () => {
    const h = makeHarness("streaming");
    await handleChatWebSocketMessage(
      {
        type: "chat_resumed",
        thread_id: "thread-1",
        status: "finished",
        last_seq: 40,
        replay_count: 0,
        replay_incomplete: true
      } as any,
      h.set,
      h.get
    );
    expect(h.state().threadRuntime["thread-1"].status).toBe("idle");
    expect(h.state().loadMessages).toHaveBeenCalledWith("thread-1");
  });

  it("chat_turn_active on an idle thread reattaches it (the page-reload path)", async () => {
    // After a reload the runtime is empty even though the server still runs
    // the turn: discovery must mark the thread busy and send resume_chat.
    const h = makeHarness("idle");
    await handleChatWebSocketMessage(
      {
        type: "chat_turn_active",
        thread_id: "thread-1",
        status: "running",
        last_seq: 57
      } as any,
      h.set,
      h.get
    );
    expect(h.state().threadRuntime["thread-1"].status).toBe("loading");
    const { globalWebSocketManager } = jest.requireMock(
      "../../../lib/websocket/GlobalWebSocketManager"
    );
    expect(globalWebSocketManager.send).toHaveBeenCalledWith({
      command: "resume_chat",
      data: { thread_id: "thread-1", last_seq: 0 }
    });
  });

  it("chat_turn_active on an already-streaming thread does nothing", async () => {
    const h = makeHarness("streaming");
    await handleChatWebSocketMessage(
      {
        type: "chat_turn_active",
        thread_id: "thread-1",
        status: "running",
        last_seq: 57
      } as any,
      h.set,
      h.get
    );
    expect(h.state().threadRuntime["thread-1"].status).toBe("streaming");
    const { globalWebSocketManager } = jest.requireMock(
      "../../../lib/websocket/GlobalWebSocketManager"
    );
    expect(globalWebSocketManager.send).not.toHaveBeenCalled();
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
