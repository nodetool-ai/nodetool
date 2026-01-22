import { renderHook, waitFor } from "@testing-library/react";
import { useChatService } from "../useChatService";
import { LanguageModel } from "../../stores/ApiTypes";

jest.mock("../../stores/GlobalChatStore");

import useGlobalChatStore from "../../stores/GlobalChatStore";

const mockUseGlobalChatStore = useGlobalChatStore as jest.MockedFunction<typeof useGlobalChatStore>;

jest.mock("react-router-dom", () => ({
  useNavigate: jest.fn()
}));

jest.mock("../../utils/truncateString", () => ({
  truncateString: jest.fn((str: string) => str)
}));

describe("useChatService", () => {
  const mockNavigate = jest.fn();
  const mockSendMessage = jest.fn();
  const mockCreateNewThread = jest.fn().mockResolvedValue("new-thread-123");
  const mockSwitchThread = jest.fn();
  const mockDeleteThread = jest.fn();
  const mockStopGeneration = jest.fn();

  const mockSelectedModel: LanguageModel = {
    id: "model-1",
    name: "Test Model",
    provider: "test",
    capabilities: ["generate_message"]
  };

  const mockState = {
    status: "connected" as const,
    sendMessage: mockSendMessage,
    createNewThread: mockCreateNewThread,
    switchThread: mockSwitchThread,
    threads: {
      "thread-1": { id: "thread-1", title: "Test Thread" },
      "thread-2": { id: "thread-2" }
    },
    messageCache: {
      "thread-1": [{ role: "user", content: "Hello" }],
      "thread-2": []
    },
    currentThreadId: "thread-1",
    deleteThread: mockDeleteThread,
    progress: 0,
    statusMessage: "Ready" as const,
    stopGeneration: mockStopGeneration,
    currentPlanningUpdate: null,
    currentTaskUpdate: null,
    lastTaskUpdatesByThread: {},
    currentLogUpdate: null
  };

  beforeEach(() => {
    jest.clearAllMocks();
    require("react-router-dom").useNavigate.mockReturnValue(mockNavigate);
    mockUseGlobalChatStore.mockImplementation((selector: any) => {
      if (typeof selector === "function") {
        return selector(mockState);
      }
      return mockState;
    });
  });

  describe("Return Values", () => {
    it("returns status from store", () => {
      const { result } = renderHook(() => useChatService(mockSelectedModel));

      expect(result.current.status).toBe("connected");
    });

    it("returns threads from store", () => {
      const { result } = renderHook(() => useChatService(mockSelectedModel));

      expect(result.current.threads).toBeDefined();
      expect(result.current.threads["thread-1"]).toBeDefined();
    });

    it("returns currentThreadId from store", () => {
      const { result } = renderHook(() => useChatService(mockSelectedModel));

      expect(result.current.currentThreadId).toBe("thread-1");
    });

    it("returns progress from store", () => {
      const { result } = renderHook(() => useChatService(mockSelectedModel));

      expect(result.current.progress).toBe(0);
    });

    it("returns statusMessage from store", () => {
      const { result } = renderHook(() => useChatService(mockSelectedModel));

      expect(result.current.statusMessage).toBe("Ready");
    });
  });

  describe("handleSendMessage", () => {
    it("returns early if no model selected", async () => {
      const { result } = renderHook(() => useChatService(null));

      await result.current.sendMessage({ role: "user", content: "Hello" });

      expect(mockSendMessage).not.toHaveBeenCalled();
      expect(mockCreateNewThread).not.toHaveBeenCalled();
    });

    it("creates new thread if no current thread", async () => {
      mockUseGlobalChatStore.mockImplementation((selector: any) => {
        const noThreadState = {
          ...mockState,
          currentThreadId: null,
          threads: {},
          messageCache: {}
        };
        if (typeof selector === "function") {
          return selector(noThreadState);
        }
        return noThreadState;
      });

      const { result } = renderHook(() => useChatService(mockSelectedModel));

      await result.current.sendMessage({ role: "user", content: "Hello" });

      await waitFor(() => {
        expect(mockCreateNewThread).toHaveBeenCalled();
      });
    });

    it("sends message with selected model", async () => {
      const { result } = renderHook(() => useChatService(mockSelectedModel));

      await result.current.sendMessage({ role: "user", content: "Hello" });

      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledWith({
          role: "user",
          content: "Hello",
          model: "model-1"
        });
      });
    });

    it("navigates to thread after sending message", async () => {
      const { result } = renderHook(() => useChatService(mockSelectedModel));

      await result.current.sendMessage({ role: "user", content: "Hello" });

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith("/chat/thread-1");
      });
    });
  });

  describe("handleThreadSelect", () => {
    it("switches thread and navigates", () => {
      const { result } = renderHook(() => useChatService(mockSelectedModel));

      result.current.onSelectThread("thread-2");

      expect(mockSwitchThread).toHaveBeenCalledWith("thread-2");
      expect(mockNavigate).toHaveBeenCalledWith("/chat/thread-2");
    });
  });

  describe("handleNewThread", () => {
    it("creates new thread and navigates", async () => {
      const { result } = renderHook(() => useChatService(mockSelectedModel));

      await result.current.onNewThread();

      await waitFor(() => {
        expect(mockCreateNewThread).toHaveBeenCalled();
        expect(mockSwitchThread).toHaveBeenCalledWith("new-thread-123");
        expect(mockNavigate).toHaveBeenCalledWith("/chat/new-thread-123");
      });
    });
  });

  describe("getThreadPreview", () => {
    it("returns thread title if available", () => {
      const { result } = renderHook(() => useChatService(mockSelectedModel));

      const preview = result.current.getThreadPreview("thread-1");

      expect(preview).toBe("Test Thread");
    });

    it("returns 'New conversation' for empty thread", () => {
      const { result } = renderHook(() => useChatService(mockSelectedModel));

      const preview = result.current.getThreadPreview("thread-2");

      expect(preview).toBe("New conversation");
    });

    it("returns 'No messages yet' for unknown thread", () => {
      const { result } = renderHook(() => useChatService(mockSelectedModel));

      const preview = result.current.getThreadPreview("unknown-thread");

      expect(preview).toBe("No messages yet");
    });

    it("returns first user message preview for thread with messages", () => {
      const { result } = renderHook(() => useChatService(mockSelectedModel));

      const preview = result.current.getThreadPreview("thread-1");

      expect(preview).toBe("Test Thread");
    });
  });

  describe("Delete and Stop Functions", () => {
    it("returns deleteThread function", () => {
      const { result } = renderHook(() => useChatService(mockSelectedModel));

      expect(typeof result.current.deleteThread).toBe("function");
    });

    it("returns stopGeneration function", () => {
      const { result } = renderHook(() => useChatService(mockSelectedModel));

      expect(typeof result.current.stopGeneration).toBe("function");
    });
  });

  describe("Update States", () => {
    it("returns planning update states", () => {
      const { result } = renderHook(() => useChatService(mockSelectedModel));

      expect(result.current.currentPlanningUpdate).toBeNull();
      expect(result.current.currentTaskUpdate).toBeNull();
      expect(result.current.lastTaskUpdatesByThread).toEqual({});
    });

    it("returns log update state", () => {
      const { result } = renderHook(() => useChatService(mockSelectedModel));

      expect(result.current.currentLogUpdate).toBeNull();
    });
  });
});
