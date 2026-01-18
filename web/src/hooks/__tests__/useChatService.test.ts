import { renderHook, act, waitFor } from "@testing-library/react";
import { useChatService } from "../useChatService";
import { LanguageModel, Message, Thread } from "../../stores/ApiTypes";

jest.mock("../../stores/GlobalChatStore");
jest.mock("react-router-dom", () => ({
  useNavigate: jest.fn()
}));

describe("useChatService", () => {
  const mockSendMessage = jest.fn();
  const mockCreateNewThread = jest.fn();
  const mockSwitchThread = jest.fn();
  const mockDeleteThread = jest.fn();
  const mockStopGeneration = jest.fn();
  const mockNavigate = jest.fn();

  const mockSelectedModel: LanguageModel = {
    type: "language_model",
    provider: "openai",
    id: "gpt-4",
    name: "GPT-4"
  };

  const mockThreads: Record<string, Thread> = {
    "thread-1": {
      id: "thread-1",
      title: "Test Thread",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      access: "private"
    }
  };

  const mockMessageCache: Record<string, Message[]> = {
    "thread-1": [
      {
        role: "user",
        type: "message",
        content: "Hello",
        thread_id: "thread-1"
      }
    ]
  };

  const getDefaultMockReturn = () => ({
    status: "disconnected",
    sendMessage: mockSendMessage,
    createNewThread: mockCreateNewThread,
    switchThread: mockSwitchThread,
    threads: mockThreads,
    messageCache: mockMessageCache,
    currentThreadId: "thread-1",
    deleteThread: mockDeleteThread,
    progress: { current: 0, total: 0 },
    statusMessage: null,
    stopGeneration: mockStopGeneration,
    currentPlanningUpdate: null,
    currentTaskUpdate: null,
    lastTaskUpdatesByThread: {},
    currentLogUpdate: null
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateNewThread.mockReset();
    mockSwitchThread.mockReset();
    mockSendMessage.mockReset();
    mockNavigate.mockReset();

    const mockUseGlobalChatStore = require("../../stores/GlobalChatStore");
    mockUseGlobalChatStore.default.mockImplementation((selector: any) => {
      const state = getDefaultMockReturn();
      return selector(state);
    });

    (require("react-router-dom").useNavigate as jest.Mock).mockReturnValue(mockNavigate);
  });

  describe("return values", () => {
    it("returns status from store", () => {
      const { result } = renderHook(() => useChatService(mockSelectedModel));
      expect(result.current.status).toBe("disconnected");
    });

    it("returns threads from store", () => {
      const { result } = renderHook(() => useChatService(mockSelectedModel));
      expect(result.current.threads).toEqual(mockThreads);
    });

    it("returns currentThreadId from store", () => {
      const { result } = renderHook(() => useChatService(mockSelectedModel));
      expect(result.current.currentThreadId).toBe("thread-1");
    });

    it("returns progress from store", () => {
      const { result } = renderHook(() => useChatService(mockSelectedModel));
      expect(result.current.progress).toEqual({ current: 0, total: 0 });
    });

    it("returns statusMessage from store", () => {
      const { result } = renderHook(() => useChatService(mockSelectedModel));
      expect(result.current.statusMessage).toBeNull();
    });

    it("returns stopGeneration from store", () => {
      const { result } = renderHook(() => useChatService(mockSelectedModel));
      expect(result.current.stopGeneration).toBeDefined();
    });
  });

  describe("handleSendMessage", () => {
    it("does not call sendMessage when no model is selected", async () => {
      const mockUseGlobalChatStore = require("../../stores/GlobalChatStore");
      mockUseGlobalChatStore.default.mockImplementation((selector: any) => {
        const state = getDefaultMockReturn();
        return selector(state);
      });

      const { result } = renderHook(() => useChatService(null));

      const message: Message = {
        role: "user",
        type: "message",
        content: "Hello"
      };

      await result.current.sendMessage(message);

      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it("creates new thread when currentThreadId is null", async () => {
      mockCreateNewThread.mockResolvedValue("new-thread");

      const mockUseGlobalChatStore = require("../../stores/GlobalChatStore");
      mockUseGlobalChatStore.default.mockImplementation((selector: any) => {
        const state = {
          ...getDefaultMockReturn(),
          currentThreadId: null,
          threads: {},
          messageCache: {}
        };
        return selector(state);
      });

      const { result } = renderHook(() => useChatService(mockSelectedModel));

      const message: Message = {
        role: "user",
        type: "message",
        content: "Hello"
      };

      await result.current.sendMessage(message);

      expect(mockCreateNewThread).toHaveBeenCalled();
      expect(mockSwitchThread).toHaveBeenCalledWith("new-thread");
      expect(mockSendMessage).toHaveBeenCalledWith({
        ...message,
        model: "gpt-4"
      });
    });

    it("uses existing thread when currentThreadId is set", async () => {
      const { result } = renderHook(() => useChatService(mockSelectedModel));

      const message: Message = {
        role: "user",
        type: "message",
        content: "Hello"
      };

      await result.current.sendMessage(message);

      expect(mockCreateNewThread).not.toHaveBeenCalled();
      expect(mockSendMessage).toHaveBeenCalledWith({
        ...message,
        model: "gpt-4"
      });
    });

    it("navigates to thread after sending message", async () => {
      const { result } = renderHook(() => useChatService(mockSelectedModel));

      const message: Message = {
        role: "user",
        type: "message",
        content: "Hello"
      };

      await result.current.sendMessage(message);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith("/chat/thread-1");
      }, { timeout: 200 });
    });
  });

  describe("onNewThread", () => {
    it("creates new thread and navigates", async () => {
      mockCreateNewThread.mockResolvedValue("new-thread-2");

      const { result } = renderHook(() => useChatService(mockSelectedModel));

      await result.current.onNewThread();

      expect(mockCreateNewThread).toHaveBeenCalled();
      expect(mockSwitchThread).toHaveBeenCalledWith("new-thread-2");
      expect(mockNavigate).toHaveBeenCalledWith("/chat/new-thread-2");
    });

    it("handles errors gracefully", async () => {
      mockCreateNewThread.mockRejectedValue(new Error("Failed"));

      const { result } = renderHook(() => useChatService(mockSelectedModel));

      await result.current.onNewThread();

      expect(mockSwitchThread).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe("onSelectThread", () => {
    it("switches to thread and navigates", () => {
      const { result } = renderHook(() => useChatService(mockSelectedModel));

      result.current.onSelectThread("thread-2");

      expect(mockSwitchThread).toHaveBeenCalledWith("thread-2");
      expect(mockNavigate).toHaveBeenCalledWith("/chat/thread-2");
    });
  });

  describe("getThreadPreview", () => {
    it("returns thread title when available", () => {
      const { result } = renderHook(() => useChatService(mockSelectedModel));
      const preview = result.current.getThreadPreview("thread-1");
      expect(preview).toBe("Test Thread");
    });

    it("returns first user message content when no title", () => {
      const mockThreadsNoTitle: Record<string, Thread> = {
        "thread-2": {
          id: "thread-2",
          title: "",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          access: "private"
        }
      };

      const mockCache: Record<string, Message[]> = {
        "thread-2": [
          {
            role: "user",
            type: "message",
            content: "First message",
            thread_id: "thread-2"
          }
        ]
      };

      const mockUseGlobalChatStore = require("../../stores/GlobalChatStore");
      mockUseGlobalChatStore.default.mockImplementation((selector: any) => {
        const state = {
          ...getDefaultMockReturn(),
          threads: mockThreadsNoTitle,
          messageCache: mockCache,
          currentThreadId: "thread-2"
        };
        return selector(state);
      });

      const { result } = renderHook(() => useChatService(mockSelectedModel));
      const preview = result.current.getThreadPreview("thread-2");
      expect(preview).toBe("First message");
    });

    it("returns 'New conversation' when no messages", () => {
      const mockEmptyCache: Record<string, Message[]> = {
        "thread-3": []
      };

      const mockUseGlobalChatStore = require("../../stores/GlobalChatStore");
      mockUseGlobalChatStore.default.mockImplementation((selector: any) => {
        const state = {
          ...getDefaultMockReturn(),
          threads: {
            "thread-3": {
              id: "thread-3",
              title: "",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              access: "private"
            }
          },
          messageCache: mockEmptyCache,
          currentThreadId: "thread-3"
        };
        return selector(state);
      });

      const { result } = renderHook(() => useChatService(mockSelectedModel));
      const preview = result.current.getThreadPreview("thread-3");
      expect(preview).toBe("New conversation");
    });

    it("returns 'No messages yet' for non-existent thread", () => {
      const { result } = renderHook(() => useChatService(mockSelectedModel));
      const preview = result.current.getThreadPreview("non-existent");
      expect(preview).toBe("No messages yet");
    });
  });
});
