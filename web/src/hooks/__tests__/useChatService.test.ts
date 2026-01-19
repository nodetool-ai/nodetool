import { renderHook, act, waitFor } from "@testing-library/react";
import { useChatService } from "../useChatService";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import { Message, LanguageModel } from "../../stores/ApiTypes";
import { useNavigate } from "react-router-dom";

jest.mock("../../stores/GlobalChatStore");
jest.mock("react-router-dom", () => ({
  useNavigate: jest.fn()
}));

const mockNavigate = jest.fn();
const mockSendMessage = jest.fn();
const mockCreateNewThread = jest.fn();
const mockSwitchThread = jest.fn();
const mockDeleteThread = jest.fn();

describe("useChatService", () => {
  const createMockModel = (id: string): LanguageModel => ({
    id,
    type: "language_model",
    repo_id: "test/model",
    path: "",
    format: "onnx",
    size: 1000,
    bytes: 1000,
    the_model_info: {}
  });

  beforeEach(() => {
    jest.clearAllMocks();

    (useGlobalChatStore as unknown as jest.Mock).mockImplementation((selector) => {
      const state = {
        status: "connected",
        sendMessage: mockSendMessage,
        createNewThread: mockCreateNewThread,
        switchThread: mockSwitchThread,
        threads: {},
        messageCache: {},
        currentThreadId: null,
        deleteThread: mockDeleteThread,
        progress: 0,
        statusMessage: "Ready",
        stopGeneration: jest.fn(),
        currentPlanningUpdate: null,
        currentTaskUpdate: null,
        lastTaskUpdatesByThread: {},
        currentLogUpdate: null
      };
      return selector(state);
    });

    (useNavigate as jest.Mock).mockReturnValue(mockNavigate);
  });

  describe("state selectors", () => {
    it("should return status from store", () => {
      const { result } = renderHook(() => useChatService(createMockModel("model-1")));
      expect(result.current.status).toBe("connected");
    });

    it("should return threads from store", () => {
      const mockThreads = { "thread-1": { id: "thread-1", title: "Test Thread" } };
      
      (useGlobalChatStore as unknown as jest.Mock).mockImplementation((selector) => {
        const state = {
          status: "connected",
          sendMessage: mockSendMessage,
          createNewThread: mockCreateNewThread,
          switchThread: mockSwitchThread,
          threads: mockThreads,
          messageCache: {},
          currentThreadId: "thread-1",
          deleteThread: mockDeleteThread,
          progress: 0,
          statusMessage: "Ready",
          stopGeneration: jest.fn(),
          currentPlanningUpdate: null,
          currentTaskUpdate: null,
          lastTaskUpdatesByThread: {},
          currentLogUpdate: null
        };
        return selector(state);
      });

      const { result } = renderHook(() => useChatService(createMockModel("model-1")));
      expect(result.current.threads).toEqual(mockThreads);
    });

    it("should return progress from store", () => {
      const { result } = renderHook(() => useChatService(createMockModel("model-1")));
      expect(result.current.progress).toBe(0);
    });

    it("should return statusMessage from store", () => {
      const { result } = renderHook(() => useChatService(createMockModel("model-1")));
      expect(result.current.statusMessage).toBe("Ready");
    });

    it("should return currentThreadId from store", () => {
      (useGlobalChatStore as unknown as jest.Mock).mockImplementation((selector) => {
        const state = {
          status: "connected",
          sendMessage: mockSendMessage,
          createNewThread: mockCreateNewThread,
          switchThread: mockSwitchThread,
          threads: {},
          messageCache: {},
          currentThreadId: "thread-123",
          deleteThread: mockDeleteThread,
          progress: 0,
          statusMessage: "Ready",
          stopGeneration: jest.fn(),
          currentPlanningUpdate: null,
          currentTaskUpdate: null,
          lastTaskUpdatesByThread: {},
          currentLogUpdate: null
        };
        return selector(state);
      });

      const { result } = renderHook(() => useChatService(createMockModel("model-1")));
      expect(result.current.currentThreadId).toBe("thread-123");
    });
  });

  describe("handleSendMessage", () => {
    it("should not send message when no model selected", async () => {
      const { result } = renderHook(() => useChatService(null));

      const message: Message = { role: "user", content: "Hello" };
      
      await act(async () => {
        await result.current.sendMessage(message);
      });

      expect(mockSendMessage).not.toHaveBeenCalled();
      expect(mockCreateNewThread).not.toHaveBeenCalled();
    });

    it("should create new thread when no current thread", async () => {
      mockCreateNewThread.mockResolvedValue("new-thread-id");
      mockSendMessage.mockResolvedValue(undefined);

      const { result } = renderHook(() => useChatService(createMockModel("model-1")));

      const message: Message = { role: "user", content: "Hello" };
      
      await act(async () => {
        await result.current.sendMessage(message);
      });

      expect(mockCreateNewThread).toHaveBeenCalled();
      expect(mockSwitchThread).toHaveBeenCalledWith("new-thread-id");
      expect(mockSendMessage).toHaveBeenCalledWith({
        ...message,
        model: "model-1"
      });
    });

    it("should use existing thread when available", async () => {
      mockSendMessage.mockResolvedValue(undefined);

      (useGlobalChatStore as unknown as jest.Mock).mockImplementation((selector) => {
        const state = {
          status: "connected",
          sendMessage: mockSendMessage,
          createNewThread: mockCreateNewThread,
          switchThread: mockSwitchThread,
          threads: { "existing-thread": { id: "existing-thread" } },
          messageCache: {},
          currentThreadId: "existing-thread",
          deleteThread: mockDeleteThread,
          progress: 0,
          statusMessage: "Ready",
          stopGeneration: jest.fn(),
          currentPlanningUpdate: null,
          currentTaskUpdate: null,
          lastTaskUpdatesByThread: {},
          currentLogUpdate: null
        };
        return selector(state);
      });

      const { result } = renderHook(() => useChatService(createMockModel("model-1")));

      const message: Message = { role: "user", content: "Hello" };
      
      await act(async () => {
        await result.current.sendMessage(message);
      });

      expect(mockCreateNewThread).not.toHaveBeenCalled();
      expect(mockSendMessage).toHaveBeenCalledWith({
        ...message,
        model: "model-1"
      });
    });

    it("should navigate to thread after sending", async () => {
      mockCreateNewThread.mockResolvedValue("new-thread-id");
      mockSendMessage.mockResolvedValue(undefined);

      const { result } = renderHook(() => useChatService(createMockModel("model-1")));

      const message: Message = { role: "user", content: "Hello" };
      
      await act(async () => {
        await result.current.sendMessage(message);
      });

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith("/chat/new-thread-id");
      });
    });

    it("should handle thread not found in store", async () => {
      mockCreateNewThread.mockResolvedValue("recovered-thread-id");
      mockSendMessage.mockResolvedValue(undefined);

      (useGlobalChatStore as unknown as jest.Mock).mockImplementation((selector) => {
        const state = {
          status: "connected",
          sendMessage: mockSendMessage,
          createNewThread: mockCreateNewThread,
          switchThread: mockSwitchThread,
          threads: {}, // Current thread not in store
          messageCache: {},
          currentThreadId: "missing-thread",
          deleteThread: mockDeleteThread,
          progress: 0,
          statusMessage: "Ready",
          stopGeneration: jest.fn(),
          currentPlanningUpdate: null,
          currentTaskUpdate: null,
          lastTaskUpdatesByThread: {},
          currentLogUpdate: null
        };
        return selector(state);
      });

      const { result } = renderHook(() => useChatService(createMockModel("model-1")));

      const message: Message = { role: "user", content: "Hello" };
      
      await act(async () => {
        await result.current.sendMessage(message);
      });

      expect(mockCreateNewThread).toHaveBeenCalled();
      expect(mockSwitchThread).toHaveBeenCalledWith("recovered-thread-id");
    });
  });

  describe("handleThreadSelect", () => {
    it("should switch thread and navigate", () => {
      const { result } = renderHook(() => useChatService(createMockModel("model-1")));

      act(() => {
        result.current.onSelectThread("thread-123");
      });

      expect(mockSwitchThread).toHaveBeenCalledWith("thread-123");
      expect(mockNavigate).toHaveBeenCalledWith("/chat/thread-123");
    });
  });

  describe("handleNewThread", () => {
    it("should create new thread and navigate", async () => {
      mockCreateNewThread.mockResolvedValue("brand-new-thread");

      const { result } = renderHook(() => useChatService(createMockModel("model-1")));
      
      await act(async () => {
        await result.current.onNewThread();
      });

      expect(mockCreateNewThread).toHaveBeenCalled();
      expect(mockSwitchThread).toHaveBeenCalledWith("brand-new-thread");
      expect(mockNavigate).toHaveBeenCalledWith("/chat/brand-new-thread");
    });

    it("should handle errors gracefully", async () => {
      mockCreateNewThread.mockRejectedValue(new Error("Failed"));

      const { result } = renderHook(() => useChatService(createMockModel("model-1")));
      
      await act(async () => {
        await result.current.onNewThread();
      });

      // Should not throw, error is caught internally
      expect(mockSwitchThread).not.toHaveBeenCalled();
    });
  });

  describe("getThreadPreview", () => {
    it("should return 'No messages yet' for non-existent thread", () => {
      const { result } = renderHook(() => useChatService(createMockModel("model-1")));
      
      const preview = result.current.getThreadPreview("non-existent");
      expect(preview).toBe("No messages yet");
    });

    it("should return thread title if available", () => {
      (useGlobalChatStore as unknown as jest.Mock).mockImplementation((selector) => {
        const state = {
          status: "connected",
          sendMessage: mockSendMessage,
          createNewThread: mockCreateNewThread,
          switchThread: mockSwitchThread,
          threads: { "thread-1": { id: "thread-1", title: "My Custom Title" } },
          messageCache: {},
          currentThreadId: null,
          deleteThread: mockDeleteThread,
          progress: 0,
          statusMessage: "Ready",
          stopGeneration: jest.fn(),
          currentPlanningUpdate: null,
          currentTaskUpdate: null,
          lastTaskUpdatesByThread: {},
          currentLogUpdate: null
        };
        return selector(state);
      });

      const { result } = renderHook(() => useChatService(createMockModel("model-1")));
      
      const preview = result.current.getThreadPreview("thread-1");
      expect(preview).toBe("My Custom Title");
    });

    it("should return first user message content as preview", () => {
      (useGlobalChatStore as unknown as jest.Mock).mockImplementation((selector) => {
        const state = {
          status: "connected",
          sendMessage: mockSendMessage,
          createNewThread: mockCreateNewThread,
          switchThread: mockSwitchThread,
          threads: { "thread-1": { id: "thread-1" } },
          messageCache: {
            "thread-1": [
              { role: "user", content: "Hello, how are you?" },
              { role: "assistant", content: "I'm doing great!" }
            ]
          },
          currentThreadId: null,
          deleteThread: mockDeleteThread,
          progress: 0,
          statusMessage: "Ready",
          stopGeneration: jest.fn(),
          currentPlanningUpdate: null,
          currentTaskUpdate: null,
          lastTaskUpdatesByThread: {},
          currentLogUpdate: null
        };
        return selector(state);
      });

      const { result } = renderHook(() => useChatService(createMockModel("model-1")));
      
      const preview = result.current.getThreadPreview("thread-1");
      expect(preview).toBe("Hello, how are you?");
    });

    it("should return 'New conversation' for thread with no messages", () => {
      (useGlobalChatStore as unknown as jest.Mock).mockImplementation((selector) => {
        const state = {
          status: "connected",
          sendMessage: mockSendMessage,
          createNewThread: mockCreateNewThread,
          switchThread: mockSwitchThread,
          threads: { "thread-1": { id: "thread-1" } },
          messageCache: { "thread-1": [] },
          currentThreadId: null,
          deleteThread: mockDeleteThread,
          progress: 0,
          statusMessage: "Ready",
          stopGeneration: jest.fn(),
          currentPlanningUpdate: null,
          currentTaskUpdate: null,
          lastTaskUpdatesByThread: {},
          currentLogUpdate: null
        };
        return selector(state);
      });

      const { result } = renderHook(() => useChatService(createMockModel("model-1")));
      
      const preview = result.current.getThreadPreview("thread-1");
      expect(preview).toBe("New conversation");
    });
  });

  describe("deleteThread", () => {
    it("should return deleteThread from store", () => {
      const { result } = renderHook(() => useChatService(createMockModel("model-1")));
      expect(result.current.deleteThread).toBe(mockDeleteThread);
    });
  });

  describe("stopGeneration", () => {
    it("should return stopGeneration from store", () => {
      const mockStopGeneration = jest.fn();
      
      (useGlobalChatStore as unknown as jest.Mock).mockImplementation((selector) => {
        const state = {
          status: "connected",
          sendMessage: mockSendMessage,
          createNewThread: mockCreateNewThread,
          switchThread: mockSwitchThread,
          threads: {},
          messageCache: {},
          currentThreadId: null,
          deleteThread: mockDeleteThread,
          progress: 0,
          statusMessage: "Ready",
          stopGeneration: mockStopGeneration,
          currentPlanningUpdate: null,
          currentTaskUpdate: null,
          lastTaskUpdatesByThread: {},
          currentLogUpdate: null
        };
        return selector(state);
      });

      const { result } = renderHook(() => useChatService(createMockModel("model-1")));
      expect(result.current.stopGeneration).toBe(mockStopGeneration);
    });
  });

  describe("planning and task updates", () => {
    it("should return currentPlanningUpdate from store", () => {
      const mockPlanningUpdate = { phase: "planning", status: "in_progress" };
      
      (useGlobalChatStore as unknown as jest.Mock).mockImplementation((selector) => {
        const state = {
          status: "connected",
          sendMessage: mockSendMessage,
          createNewThread: mockCreateNewThread,
          switchThread: mockSwitchThread,
          threads: {},
          messageCache: {},
          currentThreadId: null,
          deleteThread: mockDeleteThread,
          progress: 0,
          statusMessage: "Ready",
          stopGeneration: jest.fn(),
          currentPlanningUpdate: mockPlanningUpdate,
          currentTaskUpdate: null,
          lastTaskUpdatesByThread: {},
          currentLogUpdate: null
        };
        return selector(state);
      });

      const { result } = renderHook(() => useChatService(createMockModel("model-1")));
      expect(result.current.currentPlanningUpdate).toEqual(mockPlanningUpdate);
    });

    it("should return currentTaskUpdate from store", () => {
      const mockTaskUpdate = { id: "task-1", title: "Test Task" };
      
      (useGlobalChatStore as unknown as jest.Mock).mockImplementation((selector) => {
        const state = {
          status: "connected",
          sendMessage: mockSendMessage,
          createNewThread: mockCreateNewThread,
          switchThread: mockSwitchThread,
          threads: {},
          messageCache: {},
          currentThreadId: null,
          deleteThread: mockDeleteThread,
          progress: 0,
          statusMessage: "Ready",
          stopGeneration: jest.fn(),
          currentPlanningUpdate: null,
          currentTaskUpdate: mockTaskUpdate,
          lastTaskUpdatesByThread: {},
          currentLogUpdate: null
        };
        return selector(state);
      });

      const { result } = renderHook(() => useChatService(createMockModel("model-1")));
      expect(result.current.currentTaskUpdate).toEqual(mockTaskUpdate);
    });
  });
});
