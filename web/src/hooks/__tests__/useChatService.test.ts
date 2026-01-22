import { renderHook, waitFor, act } from "@testing-library/react";
import { useChatService } from "../useChatService";
import { LanguageModel } from "../../stores/ApiTypes";
import * as ReactRouterDom from "react-router-dom";

const mockSendMessage = jest.fn();
const mockCreateNewThread = jest.fn();
const mockSwitchThread = jest.fn();
const mockDeleteThread = jest.fn();
const mockStopGeneration = jest.fn();

jest.mock("../../stores/GlobalChatStore", () => ({
  default: jest.fn((selector) => {
    const state = {
      status: "connected",
      sendMessage: mockSendMessage,
      createNewThread: mockCreateNewThread,
      switchThread: mockSwitchThread,
      threads: { "thread-1": { id: "thread-1", title: "Test Thread" } },
      messageCache: { "thread-1": [{ role: "user", content: "Hello" }] },
      currentThreadId: null,
      deleteThread: mockDeleteThread,
      progress: 0,
      statusMessage: "",
      stopGeneration: mockStopGeneration,
      currentPlanningUpdate: null,
      currentTaskUpdate: null,
      lastTaskUpdatesByThread: {},
      currentLogUpdate: null
    };
    if (typeof selector === "function") {
      return selector(state);
    }
    return state;
  })
}));

jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: jest.fn()
}));

describe("useChatService", () => {
  const mockNavigate = jest.fn();
  const mockModel: LanguageModel = {
    id: "gpt-4",
    name: "GPT-4",
    provider: "openai",
    type: "language_model",
    max_tokens: 8192,
    capabilities: ["generate_message"]
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSendMessage.mockResolvedValue(undefined);
    mockCreateNewThread.mockResolvedValue("new-thread-123");
    mockSwitchThread.mockImplementation(() => {});
    (ReactRouterDom.useNavigate as jest.Mock).mockReturnValue(mockNavigate);
  });

  describe("initial state", () => {
    it("returns status from store", () => {
      const { result } = renderHook(() => useChatService(mockModel));
      expect(result.current.status).toBe("connected");
    });

    it("returns threads from store", () => {
      const { result } = renderHook(() => useChatService(mockModel));
      expect(result.current.threads).toHaveProperty("thread-1");
    });

    it("returns currentThreadId from store", () => {
      const { result } = renderHook(() => useChatService(mockModel));
      expect(result.current.currentThreadId).toBeNull();
    });

    it("returns deleteThread function", () => {
      const { result } = renderHook(() => useChatService(mockModel));
      expect(typeof result.current.deleteThread).toBe("function");
    });

    it("returns progress and statusMessage", () => {
      const { result } = renderHook(() => useChatService(mockModel));
      expect(result.current.progress).toBe(0);
      expect(result.current.statusMessage).toBe("");
    });

    it("returns planning and task updates", () => {
      const { result } = renderHook(() => useChatService(mockModel));
      expect(result.current.currentPlanningUpdate).toBeNull();
      expect(result.current.currentTaskUpdate).toBeNull();
    });
  });

  describe("sendMessage", () => {
    it("does nothing when no model selected", () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();
      const { result } = renderHook(() => useChatService(null));

      result.current.sendMessage({ role: "user", content: "Hello" });

      expect(mockSendMessage).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith("No model selected");
      consoleSpy.mockRestore();
    });

    it("creates new thread when currentThreadId is null", async () => {
      const { result } = renderHook(() => useChatService(mockModel));

      await result.current.sendMessage({ role: "user", content: "Hello" });

      expect(mockCreateNewThread).toHaveBeenCalled();
      expect(mockSwitchThread).toHaveBeenCalledWith("new-thread-123");
    });

    it("sends message with model ID attached", async () => {
      const { result } = renderHook(() => useChatService(mockModel));

      await result.current.sendMessage({ role: "user", content: "Hello" });

      expect(mockSendMessage).toHaveBeenCalledWith({
        role: "user",
        content: "Hello",
        model: "gpt-4"
      });
    });

    it("navigates to chat after sending message", async () => {
      const { result } = renderHook(() => useChatService(mockModel));

      await result.current.sendMessage({ role: "user", content: "Hello" });

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith("/chat/new-thread-123");
      });
    });

    it("uses existing thread if currentThreadId is set", async () => {
      jest.clearAllMocks();
      
      const store = require("../stores/GlobalChatStore").default;
      store.mockImplementation((selector) => {
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
          statusMessage: "",
          stopGeneration: mockStopGeneration,
          currentPlanningUpdate: null,
          currentTaskUpdate: null,
          lastTaskUpdatesByThread: {},
          currentLogUpdate: null
        };
        if (typeof selector === "function") {
          return selector(state);
        }
        return state;
      });

      const { result } = renderHook(() => useChatService(mockModel));

      await result.current.sendMessage({ role: "user", content: "Hello" });

      expect(mockCreateNewThread).not.toHaveBeenCalled();
      expect(mockSwitchThread).not.toHaveBeenCalled();
    });

    it("handles errors gracefully", async () => {
      mockSendMessage.mockRejectedValueOnce(new Error("Send failed"));
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      const { result } = renderHook(() => useChatService(mockModel));

      await result.current.sendMessage({ role: "user", content: "Hello" });

      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to send message:",
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });
  });

  describe("onNewThread", () => {
    it("creates new thread and navigates", async () => {
      const { result } = renderHook(() => useChatService(mockModel));

      await result.current.onNewThread();

      expect(mockCreateNewThread).toHaveBeenCalled();
      expect(mockSwitchThread).toHaveBeenCalledWith("new-thread-123");
      expect(mockNavigate).toHaveBeenCalledWith("/chat/new-thread-123");
    });

    it("handles errors gracefully", async () => {
      mockCreateNewThread.mockRejectedValueOnce(new Error("Create failed"));
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      const { result } = renderHook(() => useChatService(mockModel));

      await result.current.onNewThread();

      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to create new thread:",
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });
  });

  describe("onSelectThread", () => {
    it("switches thread and navigates", () => {
      const { result } = renderHook(() => useChatService(mockModel));

      result.current.onSelectThread("thread-456");

      expect(mockSwitchThread).toHaveBeenCalledWith("thread-456");
      expect(mockNavigate).toHaveBeenCalledWith("/chat/thread-456");
    });
  });

  describe("getThreadPreview", () => {
    it("returns thread title if available", () => {
      const { result } = renderHook(() => useChatService(mockModel));

      const preview = result.current.getThreadPreview("thread-1");

      expect(preview).toBe("Test Thread");
    });

    it("returns truncated title", () => {
      const longTitle = "A".repeat(150);
      jest.clearAllMocks();
      
      const store = require("../stores/GlobalChatStore").default;
      store.mockImplementation((selector) => {
        const state = {
          status: "connected",
          sendMessage: mockSendMessage,
          createNewThread: mockCreateNewThread,
          switchThread: mockSwitchThread,
          threads: { "thread-1": { id: "thread-1", title: longTitle } },
          messageCache: {},
          currentThreadId: null,
          deleteThread: mockDeleteThread,
          progress: 0,
          statusMessage: "",
          stopGeneration: mockStopGeneration,
          currentPlanningUpdate: null,
          currentTaskUpdate: null,
          lastTaskUpdatesByThread: {},
          currentLogUpdate: null
        };
        if (typeof selector === "function") {
          return selector(state);
        }
        return state;
      });

      const { result } = renderHook(() => useChatService(mockModel));

      const preview = result.current.getThreadPreview("thread-1");

      expect(preview.length).toBeLessThan(longTitle.length);
      expect(preview.endsWith("...")).toBe(true);
    });

    it("returns first user message preview", () => {
      const { result } = renderHook(() => useChatService(mockModel));

      const preview = result.current.getThreadPreview("thread-1");

      expect(preview).toBe("Test Thread");
    });

    it("returns 'New conversation' for empty cache", () => {
      jest.clearAllMocks();
      
      const store = require("../../stores/GlobalChatStore").default;
      store.mockImplementation((selector) => {
        const state = {
          status: "connected",
          sendMessage: mockSendMessage,
          createNewThread: mockCreateNewThread,
          switchThread: mockSwitchThread,
          threads: { "empty-thread": { id: "empty-thread" } },
          messageCache: { "empty-thread": [] },
          currentThreadId: null,
          deleteThread: mockDeleteThread,
          progress: 0,
          statusMessage: "",
          stopGeneration: mockStopGeneration,
          currentPlanningUpdate: null,
          currentTaskUpdate: null,
          lastTaskUpdatesByThread: {},
          currentLogUpdate: null
        };
        if (typeof selector === "function") {
          return selector(state);
        }
        return state;
      });

      const { result } = renderHook(() => useChatService(mockModel));

      const preview = result.current.getThreadPreview("empty-thread");

      expect(preview).toBe("New conversation");
    });

    it("returns 'No messages yet' for non-existent thread", () => {
      const { result } = renderHook(() => useChatService(mockModel));

      const preview = result.current.getThreadPreview("non-existent");

      expect(preview).toBe("No messages yet");
    });
  });

  describe("stopGeneration", () => {
    it("calls stopGeneration from store", () => {
      const { result } = renderHook(() => useChatService(mockModel));

      result.current.stopGeneration();

      expect(mockStopGeneration).toHaveBeenCalled();
    });
  });
});
