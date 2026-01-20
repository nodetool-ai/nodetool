import { renderHook } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { useChatService } from "../useChatService";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import { LanguageModel } from "../../stores/ApiTypes";

jest.mock("../../stores/GlobalChatStore");

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
);

describe("useChatService", () => {
  const mockSendMessage = jest.fn();
  const mockCreateNewThread = jest.fn();
  const mockSwitchThread = jest.fn();
  const mockDeleteThread = jest.fn();
  const mockStopGeneration = jest.fn();

  const mockModel: LanguageModel = {
    id: "model-1",
    name: "Test Model",
    provider: "test",
    type: "language_model",
    capabilities: ["text"],
    context_length: 4096
  };

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
  });

  describe("return values from store selectors", () => {
    it("returns status from store", () => {
      const { result } = renderHook(() => useChatService(mockModel), { wrapper });
      expect(result.current.status).toBe("connected");
    });

    it("returns progress from store", () => {
      const { result } = renderHook(() => useChatService(mockModel), { wrapper });
      expect(result.current.progress).toBe(0);
    });

    it("returns statusMessage from store", () => {
      const { result } = renderHook(() => useChatService(mockModel), { wrapper });
      expect(result.current.statusMessage).toBe("Ready");
    });

    it("returns thread-related state from store", () => {
      const { result } = renderHook(() => useChatService(mockModel), { wrapper });
      expect(result.current.threads).toBeDefined();
      expect(result.current.currentThreadId).toBeNull();
    });

    it("returns planning/task update state from store", () => {
      const { result } = renderHook(() => useChatService(mockModel), { wrapper });
      expect(result.current.currentPlanningUpdate).toBeNull();
      expect(result.current.currentTaskUpdate).toBeNull();
    });

    it("returns action functions from store", () => {
      const { result } = renderHook(() => useChatService(mockModel), { wrapper });
      expect(typeof result.current.sendMessage).toBe("function");
      expect(typeof result.current.deleteThread).toBe("function");
      expect(typeof result.current.stopGeneration).toBe("function");
    });
  });

  describe("model selection", () => {
    it("handles null model", () => {
      const { result } = renderHook(() => useChatService(null), { wrapper });
      expect(result.current.status).toBe("connected");
    });

    it("handles valid model", () => {
      const { result } = renderHook(() => useChatService(mockModel), { wrapper });
      expect(result.current.status).toBe("connected");
    });
  });

  describe("hook with different states", () => {
    it("handles disconnected state", () => {
      (useGlobalChatStore as unknown as jest.Mock).mockImplementation((selector) => {
        const disconnectedState = {
          status: "disconnected",
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
        if (typeof selector === "function") {
          return selector(disconnectedState);
        }
        return disconnectedState;
      });

      const { result } = renderHook(() => useChatService(mockModel), { wrapper });
      expect(result.current.status).toBe("disconnected");
    });

    it("handles running state", () => {
      (useGlobalChatStore as unknown as jest.Mock).mockImplementation((selector) => {
        const runningState = {
          status: "running",
          sendMessage: mockSendMessage,
          createNewThread: mockCreateNewThread,
          switchThread: mockSwitchThread,
          threads: {},
          messageCache: {},
          currentThreadId: null,
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
          return selector(runningState);
        }
        return runningState;
      });

      const { result } = renderHook(() => useChatService(mockModel), { wrapper });
      expect(result.current.status).toBe("running");
      expect(result.current.progress).toBe(50);
    });
  });
});
