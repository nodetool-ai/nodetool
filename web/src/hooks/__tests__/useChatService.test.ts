/**
 * Tests for useChatService.ts
 * Tests unified chat interface combining GlobalChatStore operations with navigation
 */

import { renderHook } from "@testing-library/react";
import { useChatService } from "../useChatService";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import { MemoryRouter, useNavigate } from "react-router-dom";

// Mock dependencies
jest.mock("../../stores/GlobalChatStore");
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: jest.fn()
}));

jest.mock("../../utils/truncateString", () => ({
  truncateString: (str: string, maxLength: number) =>
    str.length > maxLength ? str.substring(0, maxLength) + "..." : str
}));

describe("useChatService", () => {
  const mockNavigate = jest.fn();
  const mockUseNavigate = useNavigate as jest.MockedFunction<typeof useNavigate>;
  const mockGlobalChatStore = useGlobalChatStore as any;

  // Test data
  const mockModel: any = {
    id: "openai/gpt-4",
    name: "GPT-4",
    provider: "openai",
    type: "language_model" as const,
    description: "Test model"
  };

  const mockThreads = {
    "thread-1": {
      id: "thread-1",
      title: "Test Thread 1",
      workflow_id: null,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z"
    },
    "thread-2": {
      id: "thread-2",
      title: "Test Thread 2",
      workflow_id: null,
      created_at: "2024-01-01T01:00:00Z",
      updated_at: "2024-01-01T01:00:00Z"
    }
  };

  const mockMessageCache = {
    "thread-1": [
      {
        role: "user" as const,
        content: "Hello, this is a test message"
      },
      {
        role: "assistant" as const,
        content: "Hi! How can I help you?"
      }
    ],
    "thread-2": [
      {
        role: "user" as const,
        content: "Another conversation"
      }
    ]
  };

  const createMockState = (overrides: any = {}) => ({
    status: "idle",
    sendMessage: jest.fn().mockResolvedValue(undefined),
    createNewThread: jest.fn().mockResolvedValue("new-thread-id"),
    switchThread: jest.fn(),
    threads: mockThreads,
    messageCache: mockMessageCache,
    currentThreadId: "thread-1",
    deleteThread: jest.fn(),
    progress: null,
    statusMessage: null,
    stopGeneration: jest.fn(),
    currentPlanningUpdate: null,
    currentTaskUpdate: null,
    lastTaskUpdatesByThread: {},
    currentLogUpdate: null,
    ...overrides
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseNavigate.mockReturnValue(mockNavigate);

    // Default mock implementations
    mockGlobalChatStore.mockImplementation((selector: any) => {
      const state = createMockState();

      // Support function selector
      if (typeof selector === "function") {
        return selector(state);
      }
      return state;
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("initial state", () => {
    it("should return chat status from store", () => {
      const { result } = renderHook(() => useChatService(mockModel), {
        wrapper: MemoryRouter
      });

      expect(result.current.status).toBe("idle");
    });

    it("should return threads from store", () => {
      const { result } = renderHook(() => useChatService(mockModel), {
        wrapper: MemoryRouter
      });

      expect(result.current.threads).toEqual(mockThreads);
    });

    it("should return currentThreadId from store", () => {
      const { result } = renderHook(() => useChatService(mockModel), {
        wrapper: MemoryRouter
      });

      expect(result.current.currentThreadId).toBe("thread-1");
    });

    it("should return progress from store", () => {
      const { result } = renderHook(() => useChatService(mockModel), {
        wrapper: MemoryRouter
      });

      expect(result.current.progress).toBeNull();
    });

    it("should return deleteThread function from store", () => {
      const { result } = renderHook(() => useChatService(mockModel), {
        wrapper: MemoryRouter
      });

      expect(result.current.deleteThread).toBeDefined();
    });

    it("should return stopGeneration function from store", () => {
      const { result } = renderHook(() => useChatService(mockModel), {
        wrapper: MemoryRouter
      });

      expect(result.current.stopGeneration).toBeDefined();
    });
  });

  describe("sendMessage", () => {
    it("should send message with selected model", async () => {
      const mockSendMessage = jest.fn().mockResolvedValue(undefined);
      mockGlobalChatStore.mockImplementation((selector: any) => {
        const state = createMockState({ sendMessage: mockSendMessage });
        if (typeof selector === "function") {
          return selector(state);
        }
        return state;
      });

      const { result } = renderHook(() => useChatService(mockModel), {
        wrapper: MemoryRouter
      });

      const message: any = {
        role: "user" as const,
        content: "Test message"
      };

      await result.current.sendMessage(message);

      expect(mockSendMessage).toHaveBeenCalledWith({
        role: "user",
        content: "Test message",
        model: "openai/gpt-4"
      });
    });

    it("should create new thread if no current thread exists", async () => {
      const mockCreateNewThread = jest.fn().mockResolvedValue("new-thread-id");
      const mockSwitchThread = jest.fn();
      const mockSendMessage = jest.fn().mockResolvedValue(undefined);

      mockGlobalChatStore.mockImplementation((selector: any) => {
        const state = createMockState({
          createNewThread: mockCreateNewThread,
          switchThread: mockSwitchThread,
          sendMessage: mockSendMessage,
          threads: {},
          messageCache: {},
          currentThreadId: null
        });
        if (typeof selector === "function") {
          return selector(state);
        }
        return state;
      });

      const { result } = renderHook(() => useChatService(mockModel), {
        wrapper: MemoryRouter
      });

      const message: any = {
        role: "user" as const,
        content: "Test message"
      };

      await result.current.sendMessage(message);

      expect(mockCreateNewThread).toHaveBeenCalled();
      expect(mockSwitchThread).toHaveBeenCalledWith("new-thread-id");
    });

    it("should create new thread if current thread not found in store", async () => {
      const mockCreateNewThread = jest.fn().mockResolvedValue("new-thread-id");
      const mockSwitchThread = jest.fn();
      const mockSendMessage = jest.fn().mockResolvedValue(undefined);

      mockGlobalChatStore.mockImplementation((selector: any) => {
        const state = createMockState({
          createNewThread: mockCreateNewThread,
          switchThread: mockSwitchThread,
          sendMessage: mockSendMessage,
          threads: {},
          messageCache: {},
          currentThreadId: "thread-1"
        });
        if (typeof selector === "function") {
          return selector(state);
        }
        return state;
      });

      const { result } = renderHook(() => useChatService(mockModel), {
        wrapper: MemoryRouter
      });

      const message: any = {
        role: "user" as const,
        content: "Test message"
      };

      await result.current.sendMessage(message);

      expect(mockCreateNewThread).toHaveBeenCalled();
      expect(mockSwitchThread).toHaveBeenCalledWith("new-thread-id");
    });

    it("should navigate to chat route after sending message", async () => {
      jest.useFakeTimers();

      const { result } = renderHook(() => useChatService(mockModel), {
        wrapper: MemoryRouter
      });

      const message: any = {
        role: "user" as const,
        content: "Test message"
      };

      await result.current.sendMessage(message);

      jest.advanceTimersByTime(100);

      expect(mockNavigate).toHaveBeenCalledWith("/chat/thread-1");
    });

    it("should not send message if no model selected", async () => {
      const consoleErrorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const { result } = renderHook(() => useChatService(null), {
        wrapper: MemoryRouter
      });

      const message: any = {
        role: "user" as const,
        content: "Test message"
      };

      await result.current.sendMessage(message);

      expect(consoleErrorSpy).toHaveBeenCalledWith("No model selected");

      consoleErrorSpy.mockRestore();
    });

    it("should handle errors when sending message", async () => {
      const consoleErrorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const mockSendMessage = jest.fn().mockRejectedValue(new Error("Send failed"));

      mockGlobalChatStore.mockImplementation((selector: any) => {
        const state = createMockState({ sendMessage: mockSendMessage });
        if (typeof selector === "function") {
          return selector(state);
        }
        return state;
      });

      const { result } = renderHook(() => useChatService(mockModel), {
        wrapper: MemoryRouter
      });

      const message: any = {
        role: "user" as const,
        content: "Test message"
      };

      await result.current.sendMessage(message);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to send message:",
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe("onNewThread", () => {
    it("should create new thread and navigate to it", async () => {
      const mockCreateNewThread = jest.fn().mockResolvedValue("new-thread-id");
      const mockSwitchThread = jest.fn();

      mockGlobalChatStore.mockImplementation((selector: any) => {
        const state = createMockState({
          createNewThread: mockCreateNewThread,
          switchThread: mockSwitchThread,
          threads: {},
          messageCache: {},
          currentThreadId: null
        });
        if (typeof selector === "function") {
          return selector(state);
        }
        return state;
      });

      const { result } = renderHook(() => useChatService(mockModel), {
        wrapper: MemoryRouter
      });

      await result.current.onNewThread();

      expect(mockCreateNewThread).toHaveBeenCalled();
      expect(mockSwitchThread).toHaveBeenCalledWith("new-thread-id");
      expect(mockNavigate).toHaveBeenCalledWith("/chat/new-thread-id");
    });

    it("should handle errors when creating new thread", async () => {
      const consoleErrorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const mockCreateNewThread = jest.fn().mockRejectedValue(new Error("Create failed"));

      mockGlobalChatStore.mockImplementation((selector: any) => {
        const state = createMockState({
          createNewThread: mockCreateNewThread,
          threads: {},
          messageCache: {},
          currentThreadId: null
        });
        if (typeof selector === "function") {
          return selector(state);
        }
        return state;
      });

      const { result } = renderHook(() => useChatService(mockModel), {
        wrapper: MemoryRouter
      });

      await result.current.onNewThread();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to create new thread:",
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe("onSelectThread", () => {
    it("should switch thread and navigate to it", () => {
      const mockSwitchThread = jest.fn();

      mockGlobalChatStore.mockImplementation((selector: any) => {
        const state = createMockState({ switchThread: mockSwitchThread });
        if (typeof selector === "function") {
          return selector(state);
        }
        return state;
      });

      const { result } = renderHook(() => useChatService(mockModel), {
        wrapper: MemoryRouter
      });

      result.current.onSelectThread("thread-2");

      expect(mockSwitchThread).toHaveBeenCalledWith("thread-2");
      expect(mockNavigate).toHaveBeenCalledWith("/chat/thread-2");
    });
  });

  describe("getThreadPreview", () => {
    it("should return thread title if available", () => {
      const { result } = renderHook(() => useChatService(mockModel), {
        wrapper: MemoryRouter
      });

      const preview = result.current.getThreadPreview("thread-1");

      expect(preview).toBe("Test Thread 1");
    });

    it("should truncate long thread titles", () => {
      const longTitle = "A".repeat(150);
      const mockThreadsWithLongTitle = {
        "thread-long": {
          id: "thread-long",
          title: longTitle,
          workflow_id: null,
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z"
        }
      };

      mockGlobalChatStore.mockImplementation((selector: any) => {
        const state = createMockState({ threads: mockThreadsWithLongTitle });
        if (typeof selector === "function") {
          return selector(state);
        }
        return state;
      });

      const { result } = renderHook(() => useChatService(mockModel), {
        wrapper: MemoryRouter
      });

      const preview = result.current.getThreadPreview("thread-long");

      expect(preview).toHaveLength(103); // 100 chars + "..."
      expect(preview).toContain("...");
    });

    it("should return 'New conversation' for thread with no messages", () => {
      mockGlobalChatStore.mockImplementation((selector: any) => {
        const state = createMockState({
          threads: {
            "thread-new": {
              id: "thread-new",
              title: null,
              workflow_id: null,
              created_at: "2024-01-01T00:00:00Z",
              updated_at: "2024-01-01T00:00:00Z"
            }
          },
          messageCache: { "thread-new": [] }
        });
        if (typeof selector === "function") {
          return selector(state);
        }
        return state;
      });

      const { result } = renderHook(() => useChatService(mockModel), {
        wrapper: MemoryRouter
      });

      const preview = result.current.getThreadPreview("thread-new");

      expect(preview).toBe("New conversation");
    });

    it("should return first user message content as preview", () => {
      const mockThreadsWithoutTitle = {
        "thread-no-title": {
          id: "thread-no-title",
          title: null,
          workflow_id: null,
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z"
        }
      };
      const mockCacheForThread = {
        "thread-no-title": [
          {
            role: "user" as const,
            content: "Hello, this is a test message"
          }
        ]
      };

      mockGlobalChatStore.mockImplementation((selector: any) => {
        const state = createMockState({
          threads: mockThreadsWithoutTitle,
          messageCache: mockCacheForThread
        });
        if (typeof selector === "function") {
          return selector(state);
        }
        return state;
      });

      const { result } = renderHook(() => useChatService(mockModel), {
        wrapper: MemoryRouter
      });

      const preview = result.current.getThreadPreview("thread-no-title");

      expect(preview).toBe("Hello, this is a test message");
    });

    it("should truncate long message content", () => {
      const longMessage = "B".repeat(150);
      const mockThreadsWithLongMessage = {
        "thread-long": {
          id: "thread-long",
          title: null,
          workflow_id: null,
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z"
        }
      };
      const mockCacheWithLongMessage = {
        "thread-long": [
          {
            role: "user" as const,
            content: longMessage
          }
        ]
      };

      mockGlobalChatStore.mockImplementation((selector: any) => {
        const state = createMockState({
          threads: mockThreadsWithLongMessage,
          messageCache: mockCacheWithLongMessage
        });
        if (typeof selector === "function") {
          return selector(state);
        }
        return state;
      });

      const { result } = renderHook(() => useChatService(mockModel), {
        wrapper: MemoryRouter
      });

      const preview = result.current.getThreadPreview("thread-long");

      expect(preview).toHaveLength(103); // 100 chars + "..."
      expect(preview).toContain("...");
    });

    it("should return 'Chat started' for thread with only assistant messages", () => {
      const mockThreadsWithOnlyAssistant = {
        "thread-assistant": {
          id: "thread-assistant",
          title: null,
          workflow_id: null,
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z"
        }
      };
      const mockCacheWithOnlyAssistant = {
        "thread-assistant": [
          {
            role: "assistant" as const,
            content: "Hello!"
          }
        ]
      };

      mockGlobalChatStore.mockImplementation((selector: any) => {
        const state = createMockState({
          threads: mockThreadsWithOnlyAssistant,
          messageCache: mockCacheWithOnlyAssistant
        });
        if (typeof selector === "function") {
          return selector(state);
        }
        return state;
      });

      const { result } = renderHook(() => useChatService(mockModel), {
        wrapper: MemoryRouter
      });

      const preview = result.current.getThreadPreview("thread-assistant");

      expect(preview).toBe("Chat started");
    });

    it("should return 'No messages yet' for non-existent thread", () => {
      const { result } = renderHook(() => useChatService(mockModel), {
        wrapper: MemoryRouter
      });

      const preview = result.current.getThreadPreview("non-existent");

      expect(preview).toBe("No messages yet");
    });
  });
});
