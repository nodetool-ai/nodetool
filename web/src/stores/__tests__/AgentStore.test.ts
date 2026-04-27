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

  // ── LLM provider — chatProviderId plumbing + workspace bypass ───────

  it("setModel with an explicit chatProviderId wins over availableModels lookup", async () => {
    // The LanguageModelMenuDialog returns full LanguageModels that aren't
    // necessarily in `availableModels` (which is populated from the
    // AgentSdkProvider list, not the tRPC aggregate). The explicit second
    // arg lets the caller pass the chat provider directly.
    const useAgentStore = await loadStore();
    useAgentStore.setState({
      // Deliberately stale availableModels so the lookup branch would resolve
      // a different (or no) chatProviderId — the explicit arg must win.
      availableModels: [
        {
          id: "gpt-4o",
          label: "(stale)",
          provider: "llm",
          chatProviderId: "openai"
        }
      ]
    });

    useAgentStore.getState().setModel("brand-new-model", "anthropic");
    expect(useAgentStore.getState().model).toBe("brand-new-model");
    expect(useAgentStore.getState().chatProviderId).toBe("anthropic");
  });

  it("setModel auto-stamps chatProviderId from the picked descriptor", async () => {
    const useAgentStore = await loadStore();
    useAgentStore.setState({
      availableModels: [
        {
          id: "gpt-4o",
          label: "GPT-4o (openai)",
          provider: "llm",
          chatProviderId: "openai"
        },
        {
          id: "claude-sonnet-4-6",
          label: "Claude Sonnet (anthropic)",
          provider: "llm",
          chatProviderId: "anthropic"
        }
      ]
    });

    useAgentStore.getState().setModel("gpt-4o");
    expect(useAgentStore.getState().chatProviderId).toBe("openai");

    useAgentStore.getState().setModel("claude-sonnet-4-6");
    expect(useAgentStore.getState().chatProviderId).toBe("anthropic");
  });

  it("setProvider clears chatProviderId so it gets re-stamped from the new catalog", async () => {
    const useAgentStore = await loadStore();
    useAgentStore.setState({ chatProviderId: "anthropic" });

    useAgentStore.getState().setProvider("claude");
    expect(useAgentStore.getState().chatProviderId).toBeNull();
  });

  it("loadModels re-stamps chatProviderId from the resolved descriptor (setProvider race)", async () => {
    // Regression: setProvider("llm") clears chatProviderId and triggers
    // loadModels. loadModels auto-selects a default model — but unless it
    // also re-stamps chatProviderId from that descriptor, state ends with
    // model set + chatProviderId=null, which would make createSession()
    // falsely refuse with "Pick an LLM model first".
    fakeClient.listModels.mockResolvedValueOnce([
      {
        id: "gpt-4o",
        label: "GPT-4o (openai)",
        provider: "llm",
        chatProviderId: "openai",
        isDefault: true
      }
    ]);

    const useAgentStore = await loadStore();
    // Mirror what setProvider("llm") leaves behind: chatProviderId cleared,
    // model set to something the new catalog doesn't contain (so
    // loadModels has to fall back to the default).
    useAgentStore.setState({
      provider: "llm",
      model: "stale-from-previous-provider",
      chatProviderId: null
    });

    await useAgentStore.getState().loadModels();

    const state = useAgentStore.getState();
    expect(state.model).toBe("gpt-4o");
    expect(state.chatProviderId).toBe("openai");
  });

  it("loadModels preserves the user's selected model and re-stamps from its descriptor", async () => {
    // If the user already has a valid model selected, loadModels must
    // keep it AND re-stamp chatProviderId from its descriptor (not the
    // default's). Otherwise switching providers and back could leave the
    // wrong chat provider attached to a kept model.
    fakeClient.listModels.mockResolvedValueOnce([
      {
        id: "gpt-4o",
        label: "GPT-4o (openai)",
        provider: "llm",
        chatProviderId: "openai",
        isDefault: true
      },
      {
        id: "claude-sonnet-4-6",
        label: "Claude Sonnet (anthropic)",
        provider: "llm",
        chatProviderId: "anthropic"
      }
    ]);

    const useAgentStore = await loadStore();
    useAgentStore.setState({
      provider: "llm",
      model: "claude-sonnet-4-6",
      chatProviderId: null
    });

    await useAgentStore.getState().loadModels();

    const state = useAgentStore.getState();
    expect(state.model).toBe("claude-sonnet-4-6");
    expect(state.chatProviderId).toBe("anthropic");
  });

  it("createSession for LLM provider skips the workspace requirement", async () => {
    const useAgentStore = await loadStore();
    useAgentStore.setState({
      provider: "llm",
      model: "gpt-4o",
      chatProviderId: "openai",
      // intentionally NOT setting a workspace
      workspacePath: null,
      workspaceId: null
    });

    await useAgentStore.getState().createSession();

    // Should succeed (no workspace error) and pass chatProviderId through.
    expect(createSessionMock).toHaveBeenCalledTimes(1);
    const callArg = createSessionMock.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(callArg.provider).toBe("llm");
    expect(callArg.chatProviderId).toBe("openai");
    expect(useAgentStore.getState().status).not.toBe("error");
  });

  it("createSession for LLM provider errors when no model has been picked", async () => {
    const useAgentStore = await loadStore();
    useAgentStore.setState({
      provider: "llm",
      model: "",
      chatProviderId: null,
      workspacePath: null
    });

    await useAgentStore.getState().createSession();

    expect(createSessionMock).not.toHaveBeenCalled();
    expect(useAgentStore.getState().status).toBe("error");
    expect(useAgentStore.getState().error).toMatch(/Pick an LLM model/i);
  });

  it("createSession for harness provider still requires a workspace", async () => {
    const useAgentStore = await loadStore();
    useAgentStore.setState({
      provider: "claude",
      model: "claude-sonnet-4-6",
      workspacePath: null,
      workspaceId: null
    });

    await useAgentStore.getState().createSession();

    expect(createSessionMock).not.toHaveBeenCalled();
    expect(useAgentStore.getState().status).toBe("error");
    expect(useAgentStore.getState().error).toMatch(/workspace/i);
  });
});
