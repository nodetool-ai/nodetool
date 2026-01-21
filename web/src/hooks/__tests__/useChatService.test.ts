import { renderHook, act } from "@testing-library/react";
import { useChatService } from "../useChatService";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import { Message, LanguageModel } from "../../stores/ApiTypes";
import * as routerDom from "react-router-dom";

jest.mock("../../stores/GlobalChatStore");
jest.mock("react-router-dom");
jest.mock("../../utils/truncateString", () => ({
  truncateString: jest.fn((str: string) => str)
}));

describe("useChatService", () => {
  const mockNavigate = jest.fn();
  const mockSendMessage = jest.fn();
  const mockCreateNewThread = jest.fn();
  const mockSwitchThread = jest.fn();
  const mockDeleteThread = jest.fn();
  const mockStopGeneration = jest.fn();

  const mockSelectedModel: LanguageModel = {
    id: "test-model-1",
    name: "Test Model",
    type: "language_model",
    provider: "openai"
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    (useGlobalChatStore as unknown as jest.Mock).mockImplementation((selector) => {
      const state = {
        status: "connected",
        sendMessage: mockSendMessage,
        createNewThread: mockCreateNewThread.mockResolvedValue("thread-123"),
        switchThread: mockSwitchThread,
        threads: { "thread-123": { id: "thread-123", title: "Test Thread" } },
        messageCache: { "thread-123": [{ role: "user", content: "Hello" }] },
        currentThreadId: "thread-123",
        deleteThread: mockDeleteThread,
        progress: 50,
        statusMessage: "Processing",
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

    (routerDom.useNavigate as jest.Mock).mockReturnValue(mockNavigate);
  });

  it("returns initial chat state", () => {
    const { result } = renderHook(() => useChatService(mockSelectedModel));
    
    expect(result.current.status).toBe("connected");
    expect(result.current.threads).toEqual({ "thread-123": { id: "thread-123", title: "Test Thread" } });
    expect(result.current.currentThreadId).toBe("thread-123");
    expect(result.current.progress).toBe(50);
    expect(result.current.statusMessage).toBe("Processing");
  });

  it("sends message with selected model", async () => {
    const { result } = renderHook(() => useChatService(mockSelectedModel));
    
    await act(async () => {
      await result.current.sendMessage({ type: "message", role: "user", content: "Hello world" } as Message);
    });

    expect(mockSendMessage).toHaveBeenCalledWith({
      type: "message",
      role: "user",
      content: "Hello world",
      model: "test-model-1"
    });
  });

  it("creates new thread when no current thread exists", async () => {
    (useGlobalChatStore as unknown as jest.Mock).mockImplementation((selector) => {
      const state = {
        status: "connected",
        sendMessage: mockSendMessage,
        createNewThread: mockCreateNewThread.mockResolvedValue("new-thread-456"),
        switchThread: mockSwitchThread,
        threads: {},
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

    const { result } = renderHook(() => useChatService(mockSelectedModel));
    
    await act(async () => {
      await result.current.sendMessage({ type: "message", role: "user", content: "New message" } as Message);
    });

    expect(mockCreateNewThread).toHaveBeenCalled();
    expect(mockSwitchThread).toHaveBeenCalledWith("new-thread-456");
  });

  it("handles thread selection", () => {
    const { result } = renderHook(() => useChatService(mockSelectedModel));
    
    act(() => {
      result.current.onSelectThread("thread-789");
    });

    expect(mockSwitchThread).toHaveBeenCalledWith("thread-789");
    expect(mockNavigate).toHaveBeenCalledWith("/chat/thread-789");
  });

  it("creates new thread via onNewThread", async () => {
    const { result } = renderHook(() => useChatService(mockSelectedModel));
    
    await act(async () => {
      await result.current.onNewThread();
    });

    expect(mockCreateNewThread).toHaveBeenCalled();
    expect(mockSwitchThread).toHaveBeenCalledWith("thread-123");
    expect(mockNavigate).toHaveBeenCalledWith("/chat/thread-123");
  });

  it("generates thread preview from title", () => {
    const { result } = renderHook(() => useChatService(mockSelectedModel));
    
    const preview = result.current.getThreadPreview("thread-123");
    expect(preview).toBe("Test Thread");
  });

  it("generates thread preview from first user message when no title", () => {
    (useGlobalChatStore as unknown as jest.Mock).mockImplementation((selector) => {
      const state = {
        status: "connected",
        sendMessage: mockSendMessage,
        createNewThread: mockCreateNewThread,
        switchThread: mockSwitchThread,
        threads: { "thread-no-title": { id: "thread-no-title" } },
        messageCache: { "thread-no-title": [{ role: "user", content: "Hello from message" }] },
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

    const { result } = renderHook(() => useChatService(mockSelectedModel));
    
    const preview = result.current.getThreadPreview("thread-no-title");
    expect(preview).toBe("Hello from message");
  });

  it("returns 'New conversation' for empty thread", () => {
    (useGlobalChatStore as unknown as jest.Mock).mockImplementation((selector) => {
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

    const { result } = renderHook(() => useChatService(mockSelectedModel));
    
    const preview = result.current.getThreadPreview("empty-thread");
    expect(preview).toBe("New conversation");
  });

  it("handles send message error when no model selected", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation();
    
    const { result } = renderHook(() => useChatService(null));
    
    await act(async () => {
      await result.current.sendMessage({ type: "message", role: "user", content: "Test" } as Message);
    });

    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith("No model selected");
    
    consoleSpy.mockRestore();
  });

  it("returns deleteThread function", () => {
    const { result } = renderHook(() => useChatService(mockSelectedModel));
    
    expect(typeof result.current.deleteThread).toBe("function");
  });

  it("returns stopGeneration function", () => {
    const { result } = renderHook(() => useChatService(mockSelectedModel));
    
    expect(typeof result.current.stopGeneration).toBe("function");
  });

  it("returns planning and task updates", () => {
    const { result } = renderHook(() => useChatService(mockSelectedModel));
    
    expect(result.current.currentPlanningUpdate).toBeNull();
    expect(result.current.currentTaskUpdate).toBeNull();
    expect(result.current.lastTaskUpdatesByThread).toEqual({});
  });
});
