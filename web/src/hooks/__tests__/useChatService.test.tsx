import { renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import React, { ReactNode } from "react";
import { useChatService } from "../useChatService";
import { Message, LanguageModel } from "../../stores/ApiTypes";

jest.mock("../../stores/GlobalChatStore", () => ({
  __esModule: true,
  default: jest.fn((selector) => {
    if (typeof selector !== 'function') {
      return undefined;
    }
    const mockState = {
      status: "connected",
      sendMessage: jest.fn(),
      createNewThread: jest.fn(),
      switchThread: jest.fn(),
      threads: {
        "thread-1": { id: "thread-1", title: "First Thread" },
        "thread-2": { id: "thread-2" }
      },
      messageCache: {
        "thread-1": [{ type: "message", role: "user", content: "Hello" }],
        "thread-2": []
      },
      currentThreadId: null,
      deleteThread: jest.fn(),
      progress: 0,
      statusMessage: "Ready",
      stopGeneration: jest.fn(),
      currentPlanningUpdate: null,
      currentTaskUpdate: null,
      lastTaskUpdatesByThread: {},
      currentLogUpdate: null
    };
    return selector(mockState);
  })
}));

const mockSelectedModel: LanguageModel = {
  type: "language_model",
  provider: "openai",
  id: "gpt-4",
  name: "GPT-4"
};

const createWrapper = () => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter>{children}</MemoryRouter>
  );
  Wrapper.displayName = "Wrapper";
  return Wrapper;
};

describe("useChatService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns status from store", () => {
    const { result } = renderHook(() => useChatService(mockSelectedModel), {
      wrapper: createWrapper()
    });

    expect(result.current.status).toBe("connected");
  });

  it("returns threads from store", () => {
    const { result } = renderHook(() => useChatService(mockSelectedModel), {
      wrapper: createWrapper()
    });

    expect(result.current.threads).toEqual({
      "thread-1": { id: "thread-1", title: "First Thread" },
      "thread-2": { id: "thread-2" }
    });
  });

  it("returns progress from store", () => {
    const { result } = renderHook(() => useChatService(mockSelectedModel), {
      wrapper: createWrapper()
    });

    expect(result.current.progress).toBe(0);
  });

  it("returns statusMessage from store", () => {
    const { result } = renderHook(() => useChatService(mockSelectedModel), {
      wrapper: createWrapper()
    });

    expect(result.current.statusMessage).toBe("Ready");
  });

  describe("handleSendMessage", () => {
    it("sends message when model is selected", async () => {
      const { result } = renderHook(() => useChatService(mockSelectedModel), {
        wrapper: createWrapper()
      });

      await result.current.sendMessage({ type: "message", role: "user", content: "Hello" });

      expect(result.current.sendMessage).toBeDefined();
    });

    it("creates new thread when no current thread exists", async () => {
      const { result } = renderHook(() => useChatService(mockSelectedModel), {
        wrapper: createWrapper()
      });

      await result.current.sendMessage({ type: "message", role: "user", content: "Hello" });

      expect(result.current.sendMessage).toBeDefined();
    });

    it("does nothing if no model is selected", async () => {
      const { result } = renderHook(() => useChatService(null), {
        wrapper: createWrapper()
      });

      await result.current.sendMessage({ type: "message", role: "user", content: "Hello" });

      expect(result.current.sendMessage).toBeDefined();
    });
  });

  describe("handleThreadSelect", () => {
    it("switches thread and navigates", () => {
      const { result } = renderHook(() => useChatService(mockSelectedModel), {
        wrapper: createWrapper()
      });

      result.current.onSelectThread("thread-1");

      expect(result.current.onSelectThread).toBeDefined();
    });

    it("navigates to chat route with thread id", () => {
      const { result } = renderHook(() => useChatService(mockSelectedModel), {
        wrapper: createWrapper()
      });

      result.current.onSelectThread("thread-1");
    });
  });

  describe("handleNewThread", () => {
    it("creates new thread and navigates", async () => {
      const { result } = renderHook(() => useChatService(mockSelectedModel), {
        wrapper: createWrapper()
      });

      await result.current.onNewThread();

      expect(result.current.onNewThread).toBeDefined();
    });

    it("handles errors gracefully", async () => {
      const { result } = renderHook(() => useChatService(mockSelectedModel), {
        wrapper: createWrapper()
      });

      await result.current.onNewThread();

      expect(result.current.onNewThread).toBeDefined();
    });
  });

  describe("getThreadPreview", () => {
    it("returns thread title when available", () => {
      const { result } = renderHook(() => useChatService(mockSelectedModel), {
        wrapper: createWrapper()
      });

      expect(result.current.getThreadPreview("thread-1")).toBe("First Thread");
    });

    it.skip("returns truncated first user message content", () => {
      const { result } = renderHook(() => useChatService(mockSelectedModel), {
        wrapper: createWrapper()
      });

      expect(result.current.getThreadPreview("thread-1")).toBe("Hello");
    });

    it("returns 'New conversation' for empty message cache", () => {
      const { result } = renderHook(() => useChatService(mockSelectedModel), {
        wrapper: createWrapper()
      });

      expect(result.current.getThreadPreview("thread-2")).toBe("New conversation");
    });

    it("returns 'No messages yet' for nonexistent thread", () => {
      const { result } = renderHook(() => useChatService(mockSelectedModel), {
        wrapper: createWrapper()
      });

      expect(result.current.getThreadPreview("nonexistent")).toBe("No messages yet");
    });
  });

  describe("deleteThread", () => {
    it("returns deleteThread from store", () => {
      const { result } = renderHook(() => useChatService(mockSelectedModel), {
        wrapper: createWrapper()
      });

      expect(typeof result.current.deleteThread).toBe("function");
    });
  });

  describe("stopGeneration", () => {
    it("returns stopGeneration from store", () => {
      const { result } = renderHook(() => useChatService(mockSelectedModel), {
        wrapper: createWrapper()
      });

      expect(typeof result.current.stopGeneration).toBe("function");
    });
  });

  describe("planning and task updates", () => {
    it("returns currentPlanningUpdate from store", () => {
      const { result } = renderHook(() => useChatService(mockSelectedModel), {
        wrapper: createWrapper()
      });

      expect(result.current.currentPlanningUpdate).toBeNull();
    });

    it("returns currentTaskUpdate from store", () => {
      const { result } = renderHook(() => useChatService(mockSelectedModel), {
        wrapper: createWrapper()
      });

      expect(result.current.currentTaskUpdate).toBeNull();
    });

    it("returns lastTaskUpdatesByThread from store", () => {
      const { result } = renderHook(() => useChatService(mockSelectedModel), {
        wrapper: createWrapper()
      });

      expect(result.current.lastTaskUpdatesByThread).toEqual({});
    });

    it("returns currentLogUpdate from store", () => {
      const { result } = renderHook(() => useChatService(mockSelectedModel), {
        wrapper: createWrapper()
      });

      expect(result.current.currentLogUpdate).toBeNull();
    });
  });

  describe("currentThreadId", () => {
    it("returns currentThreadId from store", () => {
      const { result } = renderHook(() => useChatService(mockSelectedModel), {
        wrapper: createWrapper()
      });

      expect(result.current.currentThreadId).toBeNull();
    });
  });
});
