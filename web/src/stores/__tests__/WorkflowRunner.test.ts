import { createWorkflowRunnerStore } from "../WorkflowRunner";
import { globalWebSocketManager } from "../../lib/websocket/GlobalWebSocketManager";

jest.mock("../../contexts/EditorInsertionContext", () => ({
  EditorInsertionProvider: ({ children }: any) => children,
  useEditorInsertion: () => null,
  __esModule: true,
  default: {
    Provider: ({ children }: any) => children,
  },
}));

jest.mock("../../lib/websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: {
    ensureConnection: jest.fn().mockResolvedValue(undefined),
    send: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn().mockReturnValue(jest.fn()),
  },
}));

jest.mock("../ApiClient", () => ({
  isLocalhost: true,
}));

jest.mock("../../lib/supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({
        data: { session: null },
      }),
    },
  },
}));

jest.mock("../ResultsStore", () => ({
  __esModule: true,
  default: {
    getState: jest.fn().mockReturnValue({
      clearEdges: jest.fn(),
      clearResults: jest.fn(),
      clearPreviews: jest.fn(),
      clearProgress: jest.fn(),
      clearToolCalls: jest.fn(),
      clearTasks: jest.fn(),
      clearChunks: jest.fn(),
      clearPlanningUpdates: jest.fn(),
    }),
  },
}));

jest.mock("../StatusStore", () => ({
  __esModule: true,
  default: {
    getState: jest.fn().mockReturnValue({
      clearStatuses: jest.fn(),
      setNodeStatus: jest.fn(),
    }),
  },
}));

jest.mock("../ErrorStore", () => ({
  __esModule: true,
  default: {
    getState: jest.fn().mockReturnValue({
      clearErrors: jest.fn(),
    }),
  },
}));

jest.mock("../../queryClient", () => ({
  queryClient: {
    invalidateQueries: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock("../uuidv4", () => ({
  uuidv4: jest.fn().mockReturnValue("test-job-id-123"),
}));

describe("WorkflowRunner", () => {
  let store: ReturnType<typeof createWorkflowRunnerStore>;

  beforeEach(() => {
    jest.clearAllMocks();
    store = createWorkflowRunnerStore("test-workflow-id");
  });

  afterEach(() => {
    store.getState().cleanup();
  });

  describe("initial state", () => {
    it("initializes with default values", () => {
      const state = store.getState();
      expect(state.workflow).toBeNull();
      expect(state.nodes).toEqual([]);
      expect(state.edges).toEqual([]);
      expect(state.job_id).toBeNull();
      expect(state.state).toBe("idle");
      expect(state.statusMessage).toBeNull();
      expect(state.notifications).toEqual([]);
    });

    it("has message handler that logs warning", () => {
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();
      store.getState().messageHandler({} as any, {} as any);
      expect(consoleSpy).toHaveBeenCalledWith("No message handler set");
      consoleSpy.mockRestore();
    });
  });

  describe("setMessageHandler", () => {
    it("updates the message handler", () => {
      const mockHandler = jest.fn();
      store.getState().setMessageHandler(mockHandler);
      expect(store.getState().messageHandler).toBe(mockHandler);
    });
  });

  describe("setStatusMessage", () => {
    it("updates the status message", () => {
      store.getState().setStatusMessage("Running workflow...");
      expect(store.getState().statusMessage).toBe("Running workflow...");
    });

    it("clears status message when null is passed", () => {
      store.getState().setStatusMessage("Test message");
      store.getState().setStatusMessage(null);
      expect(store.getState().statusMessage).toBeNull();
    });
  });

  describe("addNotification", () => {
    it("adds a notification with timestamp", () => {
      store.getState().addNotification({
        type: "info",
        content: "Test message",
      });

      const notifications = store.getState().notifications;
      expect(notifications).toHaveLength(1);
      expect(notifications[0].id).toBeDefined();
      expect(notifications[0].timestamp).toBeDefined();
      expect(notifications[0].type).toBe("info");
    });

    it("limits notifications to 50", () => {
      for (let i = 0; i < 60; i++) {
        store.getState().addNotification({
          type: "info",
          content: `Test message ${i}`,
        });
      }

      expect(store.getState().notifications).toHaveLength(50);
    });
  });

  describe("cleanup", () => {
    it("cleans up unsubscribe function if present", () => {
      const mockUnsubscribe = jest.fn();
      store.setState({ unsubscribe: mockUnsubscribe });

      store.getState().cleanup();

      expect(mockUnsubscribe).toHaveBeenCalled();
      expect(store.getState().unsubscribe).toBeNull();
    });

    it("does nothing if unsubscribe is null", () => {
      store.setState({ unsubscribe: null });
      expect(() => store.getState().cleanup()).not.toThrow();
    });
  });

  describe("state transitions", () => {
    it("can transition through connection states", async () => {
      expect(store.getState().state).toBe("idle");

      await store.getState().ensureConnection();

      expect(store.getState().state).toBe("connected");
    });

    it("transitions to error state on connection failure", async () => {
      (globalWebSocketManager.ensureConnection as jest.Mock).mockRejectedValueOnce(
        new Error("Connection failed")
      );

      await expect(store.getState().ensureConnection()).rejects.toThrow();
      expect(store.getState().state).toBe("error");
    });

    it("transitions to running state on reconnect", async () => {
      await store.getState().ensureConnection();
      await store.getState().reconnect("job-123");

      expect(store.getState().state).toBe("running");
      expect(store.getState().job_id).toBe("job-123");
    });
  });

  describe("streaming methods", () => {
    beforeEach(async () => {
      await store.getState().ensureConnection();
      await store.getState().reconnect("job-123");
    });

    it("streams input to running job", async () => {
      await store.getState().streamInput("text", "Hello");

      expect(globalWebSocketManager.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "stream_input",
          data: expect.objectContaining({
            input: "text",
            value: "Hello",
            job_id: "job-123",
          }),
        })
      );
    });

    it("ends input stream", async () => {
      await store.getState().endInputStream("text");

      expect(globalWebSocketManager.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "end_input_stream",
          data: expect.objectContaining({
            input: "text",
            job_id: "job-123",
          }),
        })
      );
    });

    it("warns when streaming without active job", async () => {
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();
      
      store.setState({ job_id: null });
      await store.getState().streamInput("text", "Hello");

      expect(consoleSpy).toHaveBeenCalledWith(
        "streamInput called without an active job"
      );
      consoleSpy.mockRestore();
    });
  });
});
