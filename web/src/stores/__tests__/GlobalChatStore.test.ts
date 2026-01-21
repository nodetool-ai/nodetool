import useGlobalChatStore, {
  AgentExecutionToolCalls,
  GlobalChatState,
  StepToolCall
} from "../GlobalChatStore";
import { Message, Thread } from "../ApiTypes";
import { LanguageModel } from "../ApiTypes";

describe("GlobalChatStore", () => {
  beforeEach(() => {
    useGlobalChatStore.setState(useGlobalChatStore.getInitialState());
  });

  afterEach(() => {
    useGlobalChatStore.setState(useGlobalChatStore.getInitialState());
  });

  describe("initial state", () => {
    it("starts with disconnected status", () => {
      expect(useGlobalChatStore.getState().status).toBe("disconnected");
    });

    it("has null statusMessage initially", () => {
      expect(useGlobalChatStore.getState().statusMessage).toBeNull();
    });

    it("has zero progress initially", () => {
      expect(useGlobalChatStore.getState().progress).toEqual({ current: 0, total: 0 });
    });

    it("has null error initially", () => {
      expect(useGlobalChatStore.getState().error).toBeNull();
    });

    it("has null workflowId initially", () => {
      expect(useGlobalChatStore.getState().workflowId).toBeNull();
    });

    it("has empty threadWorkflowId initially", () => {
      expect(useGlobalChatStore.getState().threadWorkflowId).toEqual({});
    });

    it("has empty threads initially", () => {
      expect(useGlobalChatStore.getState().threads).toEqual({});
    });

    it("has null currentThreadId initially", () => {
      expect(useGlobalChatStore.getState().currentThreadId).toBeNull();
    });

    it("has null lastUsedThreadId initially", () => {
      expect(useGlobalChatStore.getState().lastUsedThreadId).toBeNull();
    });

    it("is not loading threads initially", () => {
      expect(useGlobalChatStore.getState().isLoadingThreads).toBe(false);
    });

    it("has not loaded threads initially", () => {
      expect(useGlobalChatStore.getState().threadsLoaded).toBe(false);
    });

    it("has empty messageCache initially", () => {
      expect(useGlobalChatStore.getState().messageCache).toEqual({});
    });

    it("has empty messageCursors initially", () => {
      expect(useGlobalChatStore.getState().messageCursors).toEqual({});
    });

    it("is not loading messages initially", () => {
      expect(useGlobalChatStore.getState().isLoadingMessages).toBe(false);
    });

    it("has agentMode disabled initially", () => {
      expect(useGlobalChatStore.getState().agentMode).toBe(false);
    });

    it("has empty agentExecutionToolCalls initially", () => {
      expect(useGlobalChatStore.getState().agentExecutionToolCalls).toEqual({});
    });

    it("has null currentRunningToolCallId initially", () => {
      expect(useGlobalChatStore.getState().currentRunningToolCallId).toBeNull();
    });

    it("has null currentToolMessage initially", () => {
      expect(useGlobalChatStore.getState().currentToolMessage).toBeNull();
    });

    it("has null currentPlanningUpdate initially", () => {
      expect(useGlobalChatStore.getState().currentPlanningUpdate).toBeNull();
    });

    it("has null currentTaskUpdate initially", () => {
      expect(useGlobalChatStore.getState().currentTaskUpdate).toBeNull();
    });

    it("has null currentLogUpdate initially", () => {
      expect(useGlobalChatStore.getState().currentLogUpdate).toBeNull();
    });

    it("has null lastWorkflowGraphUpdate initially", () => {
      expect(useGlobalChatStore.getState().lastWorkflowGraphUpdate).toBeNull();
    });

    it("has null sendMessageTimeoutId initially", () => {
      expect(useGlobalChatStore.getState().sendMessageTimeoutId).toBeNull();
    });

    it("has empty selectedTools initially", () => {
      expect(useGlobalChatStore.getState().selectedTools).toEqual([]);
    });

    it("has empty selectedCollections initially", () => {
      expect(useGlobalChatStore.getState().selectedCollections).toEqual([]);
    });
  });

  describe("setAgentMode", () => {
    it("enables agent mode when called with true", () => {
      useGlobalChatStore.getState().setAgentMode(true);
      expect(useGlobalChatStore.getState().agentMode).toBe(true);
    });

    it("disables agent mode when called with false", () => {
      useGlobalChatStore.getState().setAgentMode(true);
      useGlobalChatStore.getState().setAgentMode(false);
      expect(useGlobalChatStore.getState().agentMode).toBe(false);
    });
  });

  describe("setSelectedModel", () => {
    it("sets selected model", () => {
      const model: LanguageModel = {
        type: "language_model",
        provider: "openai",
        id: "gpt-4",
        name: "GPT-4"
      };
      useGlobalChatStore.getState().setSelectedModel(model);
      expect(useGlobalChatStore.getState().selectedModel).toEqual(model);
    });
  });

  describe("setSelectedTools", () => {
    it("sets selected tools", () => {
      const tools = ["tool1", "tool2", "tool3"];
      useGlobalChatStore.getState().setSelectedTools(tools);
      expect(useGlobalChatStore.getState().selectedTools).toEqual(tools);
    });

    it("clears selected tools when called with empty array", () => {
      useGlobalChatStore.getState().setSelectedTools(["tool1"]);
      useGlobalChatStore.getState().setSelectedTools([]);
      expect(useGlobalChatStore.getState().selectedTools).toEqual([]);
    });
  });

  describe("setSelectedCollections", () => {
    it("sets selected collections", () => {
      const collections = ["collection1", "collection2"];
      useGlobalChatStore.getState().setSelectedCollections(collections);
      expect(useGlobalChatStore.getState().selectedCollections).toEqual(collections);
    });
  });

  describe("setPlanningUpdate", () => {
    it("sets planning update", () => {
      const update = {
        type: "planning",
        content: "Planning content"
      };
      useGlobalChatStore.getState().setPlanningUpdate(update as any);
      expect(useGlobalChatStore.getState().currentPlanningUpdate).toEqual(update);
    });

    it("clears planning update when called with null", () => {
      useGlobalChatStore.getState().setPlanningUpdate({ type: "planning", content: "test" } as any);
      useGlobalChatStore.getState().setPlanningUpdate(null);
      expect(useGlobalChatStore.getState().currentPlanningUpdate).toBeNull();
    });
  });

  describe("setTaskUpdate", () => {
    it("sets task update", () => {
      const update = {
        type: "task",
        task: "Task content"
      };
      useGlobalChatStore.getState().setTaskUpdate(update as any);
      expect(useGlobalChatStore.getState().currentTaskUpdate).toEqual(update);
    });

    it("clears task update when called with null", () => {
      useGlobalChatStore.getState().setTaskUpdate({ type: "task", task: "test" } as any);
      useGlobalChatStore.getState().setTaskUpdate(null);
      expect(useGlobalChatStore.getState().currentTaskUpdate).toBeNull();
    });
  });

  describe("setLogUpdate", () => {
    it("sets log update", () => {
      const update = {
        type: "log",
        message: "Log message"
      };
      useGlobalChatStore.getState().setLogUpdate(update as any);
      expect(useGlobalChatStore.getState().currentLogUpdate).toEqual(update);
    });

    it("clears log update when called with null", () => {
      useGlobalChatStore.getState().setLogUpdate({ type: "log", message: "test" } as any);
      useGlobalChatStore.getState().setLogUpdate(null);
      expect(useGlobalChatStore.getState().currentLogUpdate).toBeNull();
    });
  });

  describe("thread management", () => {
    it("sets current thread ID", () => {
      const threadId = "thread-123";
      // Set up threads so switchThread works
      useGlobalChatStore.setState({
        threads: { [threadId]: { id: threadId, title: "Test Thread", created_at: new Date().toISOString() } }
      });

      useGlobalChatStore.getState().switchThread(threadId);
      expect(useGlobalChatStore.getState().currentThreadId).toBe(threadId);
    });

    it("sets last used thread ID", () => {
      useGlobalChatStore.getState().setLastUsedThreadId("thread-456");
      expect(useGlobalChatStore.getState().lastUsedThreadId).toBe("thread-456");
    });

    it("clears last used thread ID when called with null", () => {
      useGlobalChatStore.getState().setLastUsedThreadId("thread-456");
      useGlobalChatStore.getState().setLastUsedThreadId(null);
      expect(useGlobalChatStore.getState().lastUsedThreadId).toBeNull();
    });
  });

  describe("message cache management", () => {
    it("adds message to cache", () => {
      const threadId = "thread-123";
      const message: Message = {
        id: "msg-1",
        role: "user",
        content: "Test message"
      };

      useGlobalChatStore.getState().addMessageToCache(threadId, message);

      const cache = useGlobalChatStore.getState().messageCache;
      expect(cache[threadId]).toBeDefined();
      expect(cache[threadId]).toHaveLength(1);
      expect(cache[threadId][0]).toEqual(message);
    });

    it("appends multiple messages to same thread", () => {
      const threadId = "thread-123";
      const message1: Message = { id: "msg-1", role: "user", content: "First" };
      const message2: Message = { id: "msg-2", role: "assistant", content: "Second" };

      useGlobalChatStore.getState().addMessageToCache(threadId, message1);
      useGlobalChatStore.getState().addMessageToCache(threadId, message2);

      const cache = useGlobalChatStore.getState().messageCache;
      expect(cache[threadId]).toHaveLength(2);
    });

    it("clears message cache for thread", () => {
      const threadId = "thread-123";
      const message: Message = { id: "msg-1", role: "user", content: "Test" };

      useGlobalChatStore.getState().addMessageToCache(threadId, message);
      useGlobalChatStore.getState().clearMessageCache(threadId);

      const cache = useGlobalChatStore.getState().messageCache;
      expect(cache[threadId]).toBeUndefined();
    });

    it("maintains separate caches for different threads", () => {
      const thread1 = "thread-1";
      const thread2 = "thread-2";
      const msg1: Message = { id: "msg-1", role: "user", content: "Thread 1" };
      const msg2: Message = { id: "msg-2", role: "user", content: "Thread 2" };

      useGlobalChatStore.getState().addMessageToCache(thread1, msg1);
      useGlobalChatStore.getState().addMessageToCache(thread2, msg2);

      const cache = useGlobalChatStore.getState().messageCache;
      expect(cache[thread1][0].content).toBe("Thread 1");
      expect(cache[thread2][0].content).toBe("Thread 2");
    });
  });

  describe("getCurrentMessages", () => {
    it("returns empty array when no thread selected", () => {
      const messages = useGlobalChatStore.getState().getCurrentMessages();
      expect(messages).toEqual([]);
    });

    it("returns cached messages for current thread", () => {
      const threadId = "thread-123";
      const message: Message = { id: "msg-1", role: "user", content: "Test" };

      // Set up threads so switchThread works
      useGlobalChatStore.setState({
        threads: { [threadId]: { id: threadId, title: "Test Thread", created_at: new Date().toISOString() } }
      });

      useGlobalChatStore.getState().switchThread(threadId);
      useGlobalChatStore.getState().addMessageToCache(threadId, message);

      const messages = useGlobalChatStore.getState().getCurrentMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual(message);
    });
  });

  describe("getCurrentMessagesSync", () => {
    it("returns empty array when no thread selected", () => {
      const messages = useGlobalChatStore.getState().getCurrentMessagesSync();
      expect(messages).toEqual([]);
    });

    it("returns cached messages for current thread", () => {
      const threadId = "thread-456";
      const message: Message = { id: "msg-2", role: "assistant", content: "Sync test" };

      // Set up threads so switchThread works
      useGlobalChatStore.setState({
        threads: { [threadId]: { id: threadId, title: "Test Thread", created_at: new Date().toISOString() } }
      });

      useGlobalChatStore.getState().switchThread(threadId);
      useGlobalChatStore.getState().addMessageToCache(threadId, message);

      const messages = useGlobalChatStore.getState().getCurrentMessagesSync();
      expect(messages).toHaveLength(1);
    });
  });

  describe("agent execution tool calls", () => {
    it("updates agent execution tool calls", () => {
      const toolCalls: AgentExecutionToolCalls = {
        "thread-1": {
          "execution-1": [
            {
              id: "call-1",
              name: "test-tool",
              args: { param: "value" },
              startedAt: Date.now()
            }
          ]
        }
      };

      useGlobalChatStore.setState({ agentExecutionToolCalls: toolCalls });
      expect(useGlobalChatStore.getState().agentExecutionToolCalls).toEqual(toolCalls);
    });

    it("sets current running tool call ID", () => {
      useGlobalChatStore.getState().currentRunningToolCallId = "call-123";
      expect(useGlobalChatStore.getState().currentRunningToolCallId).toBe("call-123");
    });

    it("sets current tool message", () => {
      useGlobalChatStore.getState().currentToolMessage = "Processing...";
      expect(useGlobalChatStore.getState().currentToolMessage).toBe("Processing...");
    });
  });

  describe("thread workflow ID tracking", () => {
    it("tracks workflow ID for thread", () => {
      const threadId = "thread-123";
      const workflowId = "workflow-456";

      useGlobalChatStore.setState({
        threadWorkflowId: { [threadId]: workflowId }
      });

      expect(useGlobalChatStore.getState().threadWorkflowId[threadId]).toBe(workflowId);
    });

    it("returns null workflow ID for untracked thread", () => {
      expect(useGlobalChatStore.getState().threadWorkflowId["unknown-thread"]).toBeUndefined();
    });
  });

  describe("connection state updates", () => {
    it("updates status", () => {
      useGlobalChatStore.setState({ status: "connecting" });
      expect(useGlobalChatStore.getState().status).toBe("connecting");
    });

    it("updates status message", () => {
      useGlobalChatStore.setState({ statusMessage: "Connecting..." });
      expect(useGlobalChatStore.getState().statusMessage).toBe("Connecting...");
    });

    it("updates progress", () => {
      useGlobalChatStore.setState({ progress: { current: 5, total: 10 } });
      expect(useGlobalChatStore.getState().progress).toEqual({ current: 5, total: 10 });
    });

    it("updates error", () => {
      useGlobalChatStore.setState({ error: "Connection failed" });
      expect(useGlobalChatStore.getState().error).toBe("Connection failed");
    });

    it("clears error when status is connected", () => {
      useGlobalChatStore.setState({ error: "Previous error" });
      useGlobalChatStore.setState({ status: "connected", error: null });
      expect(useGlobalChatStore.getState().error).toBeNull();
    });
  });

  describe("frontend tool state", () => {
    it("updates frontend tool state", () => {
      const newState = {
        nodeMetadata: { "test-node": {} },
        currentWorkflowId: "workflow-123",
        getWorkflow: () => ({ id: "workflow-123" }),
        addWorkflow: () => {},
        removeWorkflow: () => {},
        getNodeStore: () => ({}),
        updateWorkflow: () => {},
        saveWorkflow: () => Promise.resolve(),
        getCurrentWorkflow: () => ({ id: "workflow-123" }),
        setCurrentWorkflowId: () => {},
        fetchWorkflow: () => Promise.resolve({} as any),
        newWorkflow: () => {},
        createNew: () => Promise.resolve({} as any),
        searchTemplates: () => Promise.resolve([]),
        copy: () => Promise.resolve({} as any)
      };

      useGlobalChatStore.getState().setFrontendToolState(newState);
      expect(useGlobalChatStore.getState().frontendToolState.currentWorkflowId).toBe("workflow-123");
    });
  });

  describe("task update thread tracking", () => {
    it("sets current task update thread ID", () => {
      useGlobalChatStore.setState({ currentTaskUpdateThreadId: "thread-789" });
      expect(useGlobalChatStore.getState().currentTaskUpdateThreadId).toBe("thread-789");
    });

    it("tracks last task updates by thread", () => {
      const threadId = "thread-123";
      const update = { type: "task", task: "Test task" } as any;

      useGlobalChatStore.setState({
        lastTaskUpdatesByThread: { [threadId]: update }
      });

      expect(useGlobalChatStore.getState().lastTaskUpdatesByThread[threadId]).toEqual(update);
    });
  });

  describe("WebSocket subscriptions", () => {
    it("tracks WebSocket event unsubscribes", () => {
      const unsubscribe1 = () => {};
      const unsubscribe2 = () => {};

      useGlobalChatStore.setState({
        wsEventUnsubscribes: [unsubscribe1, unsubscribe2]
      });

      expect(useGlobalChatStore.getState().wsEventUnsubscribes).toHaveLength(2);
    });

    it("tracks WebSocket thread subscriptions", () => {
      const unsub = () => {};

      useGlobalChatStore.setState({
        wsThreadSubscriptions: { "thread-123": unsub }
      });

      expect(useGlobalChatStore.getState().wsThreadSubscriptions["thread-123"]).toBe(unsub);
    });
  });

  describe("threads state management", () => {
    it("sets threads", () => {
      const threads: Record<string, Thread> = {
        "thread-1": { id: "thread-1", title: "Thread 1", created_at: new Date().toISOString() },
        "thread-2": { id: "thread-2", title: "Thread 2", created_at: new Date().toISOString() }
      };

      useGlobalChatStore.setState({ threads, threadsLoaded: true });

      expect(useGlobalChatStore.getState().threads).toEqual(threads);
      expect(useGlobalChatStore.getState().threadsLoaded).toBe(true);
    });

    it("tracks threads loading state", () => {
      useGlobalChatStore.setState({ isLoadingThreads: true });
      expect(useGlobalChatStore.getState().isLoadingThreads).toBe(true);
    });

    it("tracks messages loading state", () => {
      useGlobalChatStore.setState({ isLoadingMessages: true });
      expect(useGlobalChatStore.getState().isLoadingMessages).toBe(true);
    });

    it("tracks message cursors", () => {
      useGlobalChatStore.setState({
        messageCursors: { "thread-123": "cursor-456" }
      });

      expect(useGlobalChatStore.getState().messageCursors["thread-123"]).toBe("cursor-456");
    });
  });
});
