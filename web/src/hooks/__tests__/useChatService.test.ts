import { renderHook, act, waitFor } from "@testing-library/react";
import { useChatService } from "../useChatService";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import { Message, LanguageModel } from "../../stores/ApiTypes";
import { useNavigate } from "react-router-dom";

jest.mock("react-router-dom", () => ({
  useNavigate: jest.fn(),
}));

jest.mock("../../stores/GlobalChatStore", () => ({
  default: jest.fn(),
  __esModule: true,
}));

describe("useChatService", () => {
  const mockNavigate = jest.fn();
  const mockSendMessage = jest.fn();
  const mockCreateNewThread = jest.fn();
  const mockSwitchThread = jest.fn();
  const mockDeleteThread = jest.fn();
  const mockStopGeneration = jest.fn();

  let mockSelectedModel: LanguageModel | null = {
    id: "test-model-1",
    name: "Test Model",
    provider: "test-provider",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useNavigate as jest.Mock).mockReturnValue(mockNavigate);
    (useGlobalChatStore as unknown as jest.Mock).mockImplementation((selector) => {
      const state = {
        status: "disconnected",
        sendMessage: mockSendMessage,
        createNewThread: mockCreateNewThread,
        switchThread: mockSwitchThread,
        threads: {},
        messageCache: {},
        currentThreadId: null,
        deleteThread: mockDeleteThread,
        progress: { current: 0, total: 0 },
        statusMessage: null,
        stopGeneration: mockStopGeneration,
        currentPlanningUpdate: null,
        currentTaskUpdate: null,
        lastTaskUpdatesByThread: {},
        currentLogUpdate: null,
      };
      if (typeof selector === "function") {
        return selector(state);
      }
      return state;
    });
  });

  describe("basic return values", () => {
    it("returns status from store", () => {
      const { result } = renderHook(() => useChatService(mockSelectedModel));
      expect(result.current.status).toBe("disconnected");
    });

    it("returns threads from store", () => {
      const { result } = renderHook(() => useChatService(mockSelectedModel));
      expect(result.current.threads).toEqual({});
    });

    it("returns progress from store", () => {
      const { result } = renderHook(() => useChatService(mockSelectedModel));
      expect(result.current.progress).toEqual({ current: 0, total: 0 });
    });

    it("returns statusMessage from store", () => {
      const { result } = renderHook(() => useChatService(mockSelectedModel));
      expect(result.current.statusMessage).toBeNull();
    });

    it("handles null selected model", () => {
      const { result } = renderHook(() => useChatService(null));
      expect(result.current.sendMessage).toBeDefined();
    });
  });

  describe("sendMessage", () => {
    it("does not send message when no model is selected", async () => {
      const { result } = renderHook(() => useChatService(null));
      const message: Message = { role: "user", type: "message", content: "Hello" };

      await act(async () => {
        await result.current.sendMessage(message);
      });

      expect(mockSendMessage).not.toHaveBeenCalled();
      expect(mockCreateNewThread).not.toHaveBeenCalled();
    });

    it("creates new thread and sends message when no current thread", async () => {
      mockCreateNewThread.mockResolvedValue("thread-123");
      mockSendMessage.mockResolvedValue(undefined);

      const { result } = renderHook(() => useChatService(mockSelectedModel));
      const message: Message = { role: "user", type: "message", content: "Hello" };

      await act(async () => {
        await result.current.sendMessage(message);
      });

      expect(mockCreateNewThread).toHaveBeenCalledTimes(1);
      expect(mockSwitchThread).toHaveBeenCalledWith("thread-123");
      expect(mockSendMessage).toHaveBeenCalledWith({
        ...message,
        model: "test-model-1",
      });
    });

    it("uses existing thread if available", async () => {
      mockSendMessage.mockResolvedValue(undefined);

      (useGlobalChatStore as unknown as jest.Mock).mockImplementation((selector) => {
        const state = {
          status: "disconnected",
          sendMessage: mockSendMessage,
          createNewThread: mockCreateNewThread,
          switchThread: mockSwitchThread,
          threads: { "existing-thread": { id: "existing-thread", title: "Test" } },
          messageCache: {},
          currentThreadId: "existing-thread",
          deleteThread: mockDeleteThread,
          progress: { current: 0, total: 0 },
          statusMessage: null,
          stopGeneration: mockStopGeneration,
          currentPlanningUpdate: null,
          currentTaskUpdate: null,
          lastTaskUpdatesByThread: {},
          currentLogUpdate: null,
        };
        if (typeof selector === "function") {
          return selector(state);
        }
        return state;
      });

      const { result } = renderHook(() => useChatService(mockSelectedModel));
      const message: Message = { role: "user", type: "message", content: "Hello" };

      await act(async () => {
        await result.current.sendMessage(message);
      });

      expect(mockCreateNewThread).not.toHaveBeenCalled();
      expect(mockSendMessage).toHaveBeenCalledWith({
        ...message,
        model: "test-model-1",
      });
    });
  });

  describe("onNewThread", () => {
    it("creates new thread", async () => {
      mockCreateNewThread.mockResolvedValue("new-thread");
      mockSwitchThread.mockResolvedValue(undefined);

      const { result } = renderHook(() => useChatService(mockSelectedModel));

      const threadId = await result.current.onNewThread();

      expect(threadId).toBe("new-thread");
      expect(mockCreateNewThread).toHaveBeenCalledTimes(1);
      expect(mockSwitchThread).toHaveBeenCalledWith("new-thread");
    });
  });

  describe("onSelectThread", () => {
    it("calls switchThread with threadId", () => {
      mockSwitchThread.mockResolvedValue(undefined);

      const { result } = renderHook(() => useChatService(mockSelectedModel));
      result.current.onSelectThread("thread-123");

      expect(mockSwitchThread).toHaveBeenCalledWith("thread-123");
    });
  });

  describe("deleteThread", () => {
    it("calls deleteThread with threadId", () => {
      mockDeleteThread.mockResolvedValue(undefined);

      const { result } = renderHook(() => useChatService(mockSelectedModel));
      result.current.deleteThread("thread-123");

      expect(mockDeleteThread).toHaveBeenCalledWith("thread-123");
    });
  });

  describe("getThreadPreview", () => {
    it("returns thread title when available", () => {
      const threadId = "thread-123";
      const threads = {
        [threadId]: { id: threadId, title: "My Custom Title" },
      };

      (useGlobalChatStore as unknown as jest.Mock).mockImplementation((selector) => {
        const state = {
          status: "disconnected",
          sendMessage: mockSendMessage,
          createNewThread: mockCreateNewThread,
          switchThread: mockSwitchThread,
          threads,
          messageCache: {},
          currentThreadId: null,
          deleteThread: mockDeleteThread,
          progress: { current: 0, total: 0 },
          statusMessage: null,
          stopGeneration: mockStopGeneration,
          currentPlanningUpdate: null,
          currentTaskUpdate: null,
          lastTaskUpdatesByThread: {},
          currentLogUpdate: null,
        };
        if (typeof selector === "function") {
          return selector(state);
        }
        return state;
      });

      const { result } = renderHook(() => useChatService(mockSelectedModel));
      const preview = result.current.getThreadPreview(threadId);

      expect(preview).toBe("My Custom Title");
    });

    it("returns first user message from thread", () => {
      const threadId = "thread-123";
      const messageCache = {
        [threadId]: [
          { role: "assistant", type: "message", content: "Hello!" },
          { role: "user", type: "message", content: "How are you?" },
        ],
      };

      (useGlobalChatStore as unknown as jest.Mock).mockImplementation((selector) => {
        const state = {
          status: "disconnected",
          sendMessage: mockSendMessage,
          createNewThread: mockCreateNewThread,
          switchThread: mockSwitchThread,
          threads: {},
          messageCache,
          currentThreadId: null,
          deleteThread: mockDeleteThread,
          progress: { current: 0, total: 0 },
          statusMessage: null,
          stopGeneration: mockStopGeneration,
          currentPlanningUpdate: null,
          currentTaskUpdate: null,
          lastTaskUpdatesByThread: {},
          currentLogUpdate: null,
        };
        if (typeof selector === "function") {
          return selector(state);
        }
        return state;
      });

      const { result } = renderHook(() => useChatService(mockSelectedModel));
      const preview = result.current.getThreadPreview(threadId);

      expect(preview).toBe("How are you?");
    });

    it("returns 'New conversation' for empty thread", () => {
      const threadId = "thread-123";
      const messageCache = {
        [threadId]: [],
      };

      (useGlobalChatStore as unknown as jest.Mock).mockImplementation((selector) => {
        const state = {
          status: "disconnected",
          sendMessage: mockSendMessage,
          createNewThread: mockCreateNewThread,
          switchThread: mockSwitchThread,
          threads: {},
          messageCache,
          currentThreadId: null,
          deleteThread: mockDeleteThread,
          progress: { current: 0, total: 0 },
          statusMessage: null,
          stopGeneration: mockStopGeneration,
          currentPlanningUpdate: null,
          currentTaskUpdate: null,
          lastTaskUpdatesByThread: {},
          currentLogUpdate: null,
        };
        if (typeof selector === "function") {
          return selector(state);
        }
        return state;
      });

      const { result } = renderHook(() => useChatService(mockSelectedModel));
      const preview = result.current.getThreadPreview(threadId);

      expect(preview).toBe("New conversation");
    });
  });

  describe("stopGeneration", () => {
    it("calls stopGeneration from store", () => {
      const { result } = renderHook(() => useChatService(mockSelectedModel));
      result.current.stopGeneration();
      expect(mockStopGeneration).toHaveBeenCalledTimes(1);
    });
  });
});
