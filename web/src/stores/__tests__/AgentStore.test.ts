import type { Message } from "../ApiTypes";
import { EventEmitter } from "../../lib/EventEmitter";

describe("AgentStore", () => {
  const createSessionMock = jest.fn<
    Promise<string>,
    [
      {
        provider?: "claude" | "codex" | "opencode";
        model: string;
        workspacePath?: string;
        resumeSessionId?: string;
      }
    ]
  >();
  const sendMessageMock = jest.fn<Promise<void>, [string, string]>();
  const stopExecutionMock = jest.fn<Promise<void>, [string]>();
  const closeSessionMock = jest.fn<Promise<void>, [string]>();

  // Bus is reused across loadStore() calls so emitStreamMessage works on the
  // same emitter the store subscribed to.
  const clientBus = new EventEmitter();
  const fakeClient = {
    on: clientBus.on.bind(clientBus),
    off: clientBus.off.bind(clientBus),
    listModels: jest.fn().mockResolvedValue([]),
    listSessions: jest.fn().mockResolvedValue([]),
    getSessionMessages: jest.fn().mockResolvedValue([]),
    createSession: (...args: Parameters<typeof createSessionMock>) =>
      createSessionMock(...args),
    sendMessage: (...args: Parameters<typeof sendMessageMock>) =>
      sendMessageMock(...args),
    stopExecution: (...args: Parameters<typeof stopExecutionMock>) =>
      stopExecutionMock(...args),
    closeSession: (...args: Parameters<typeof closeSessionMock>) =>
      closeSessionMock(...args)
  };

  jest.mock("../../lib/agent/AgentSocketClient", () => ({
    getAgentSocketClient: () => fakeClient
  }));

  // Frontend tools bridge tries to subscribe at module-load — stub it out.
  jest.mock("../../lib/tools/frontendToolsIpc", () => ({
    initFrontendToolsBridge: jest.fn()
  }));

  async function loadStore() {
    jest.resetModules();
    const module = await import("../AgentStore");
    return module.default;
  }

  function makeUserMessage(text: string): Message {
    return {
      type: "message",
      id: "user-input",
      role: "user",
      content: [{ type: "text", text }],
      created_at: new Date().toISOString()
    } as Message;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    clientBus.removeAllListeners();
    if (!globalThis.crypto) {
      Object.defineProperty(globalThis, "crypto", {
        value: {},
        configurable: true
      });
    }
    Object.defineProperty(globalThis.crypto, "randomUUID", {
      value: jest.fn(() => "test-uuid"),
      configurable: true
    });
    createSessionMock.mockResolvedValue("session-1");
    sendMessageMock.mockResolvedValue(undefined);
    stopExecutionMock.mockResolvedValue(undefined);
    closeSessionMock.mockResolvedValue(undefined);
  });

  function emitStreamMessage(message: {
    type:
      | "assistant"
      | "user"
      | "result"
      | "system"
      | "status"
      | "stream_event";
    uuid: string;
    session_id: string;
    text?: string;
    is_error?: boolean;
    errors?: string[];
    subtype?: string;
    content?: Array<{ type: string; text?: string }>;
  }) {
    clientBus.emit("stream", {
      sessionId: "session-1",
      message,
      done: false
    });
  }

  it("skips duplicate success result when assistant content already streamed", async () => {
    const useAgentStore = await loadStore();
    useAgentStore
      .getState()
      .setWorkspaceContext("workspace-1", "/tmp/workspace-1");
    await useAgentStore.getState().createSession();
    await useAgentStore.getState().sendMessage(makeUserMessage("Hi"));

    emitStreamMessage({
      type: "assistant",
      uuid: "assistant-1",
      session_id: "session-1",
      content: [{ type: "text", text: "Hello from Claude" }]
    });
    emitStreamMessage({
      type: "result",
      uuid: "result-1",
      session_id: "session-1",
      subtype: "success",
      text: "Hello from Claude"
    });

    const assistantMessages = useAgentStore
      .getState()
      .messages.filter((msg) => msg.role === "assistant");
    expect(assistantMessages).toHaveLength(1);
    expect(assistantMessages[0].content).toEqual([
      { type: "text", text: "Hello from Claude" }
    ]);
  });

  it("updates an existing streamed message when uuid repeats", async () => {
    const useAgentStore = await loadStore();
    useAgentStore
      .getState()
      .setWorkspaceContext("workspace-1", "/tmp/workspace-1");
    await useAgentStore.getState().createSession();
    await useAgentStore
      .getState()
      .sendMessage(makeUserMessage("What can you do?"));

    emitStreamMessage({
      type: "assistant",
      uuid: "assistant-1",
      session_id: "session-1",
      content: [{ type: "text", text: "Part" }]
    });
    emitStreamMessage({
      type: "assistant",
      uuid: "assistant-1",
      session_id: "session-1",
      content: [{ type: "text", text: "Final answer" }]
    });

    const assistantMessages = useAgentStore
      .getState()
      .messages.filter((msg) => msg.role === "assistant");
    expect(assistantMessages).toHaveLength(1);
    expect(assistantMessages[0].content).toEqual([
      { type: "text", text: "Final answer" }
    ]);
  });

  it("keeps success result when no assistant message is present", async () => {
    const useAgentStore = await loadStore();
    useAgentStore
      .getState()
      .setWorkspaceContext("workspace-1", "/tmp/workspace-1");
    await useAgentStore.getState().createSession();
    await useAgentStore
      .getState()
      .sendMessage(makeUserMessage("What can you do?"));

    emitStreamMessage({
      type: "result",
      uuid: "result-1",
      session_id: "session-1",
      subtype: "success",
      text: "Final answer"
    });

    const assistantMessages = useAgentStore
      .getState()
      .messages.filter((msg) => msg.role === "assistant");
    expect(assistantMessages).toHaveLength(1);
    expect(assistantMessages[0].content).toEqual([
      { type: "text", text: "Final answer" }
    ]);
  });

  it("keeps first user message visible while lazily creating a session", async () => {
    const useAgentStore = await loadStore();
    useAgentStore
      .getState()
      .setWorkspaceContext("workspace-1", "/tmp/workspace-1");
    await useAgentStore.getState().sendMessage(makeUserMessage("Hello"));

    const state = useAgentStore.getState();
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].role).toBe("user");
    expect(state.messages[0].content).toEqual([{ type: "text", text: "Hello" }]);
    expect(state.status).toBe("loading");
    expect(createSessionMock).toHaveBeenCalledTimes(1);
    expect(createSessionMock).toHaveBeenCalledWith({
      provider: "claude",
      model: "claude-sonnet-4-6",
      workspacePath: "/tmp/workspace-1",
      resumeSessionId: undefined
    });
    expect(sendMessageMock).toHaveBeenCalledWith("session-1", "Hello");
  });

  it("stops active execution without closing the session", async () => {
    const useAgentStore = await loadStore();
    useAgentStore
      .getState()
      .setWorkspaceContext("workspace-1", "/tmp/workspace-1");
    await useAgentStore.getState().createSession();

    useAgentStore.getState().stopGeneration();

    expect(stopExecutionMock).toHaveBeenCalledWith("session-1");
    expect(closeSessionMock).not.toHaveBeenCalled();
    expect(useAgentStore.getState().sessionId).toBe("session-1");
  });
});
