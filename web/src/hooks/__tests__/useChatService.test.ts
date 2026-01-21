import { renderHook, act } from "@testing-library/react";
import { useChatService } from "../useChatService";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import { LanguageModel } from "../../stores/ApiTypes";
import * as router from "react-router-dom";

jest.mock("react-router-dom", () => ({
  useNavigate: jest.fn(),
}));

jest.mock("../../stores/GlobalChatStore", () => ({
  __esModule: true,
  default: jest.fn(),
}));

describe("useChatService", () => {
  const mockNavigate = jest.fn();
  const mockSendMessage = jest.fn();

  const mockLanguageModel: LanguageModel = {
    id: "model-1",
    name: "Test Model",
    provider: "openai",
    type: "language_model",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    (router.useNavigate as jest.Mock).mockReturnValue(mockNavigate);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("initial state", () => {
    it("returns status from store", () => {
      (useGlobalChatStore as unknown as jest.Mock).mockImplementation((selector) => {
        return selector({ status: "connected" });
      });

      const { result } = renderHook(() => useChatService(mockLanguageModel));
      expect(result.current.status).toBe("connected");
    });

    it("returns threads from store", () => {
      const mockThreads = { "thread-1": { id: "thread-1", title: "Thread 1" } };
      (useGlobalChatStore as unknown as jest.Mock).mockImplementation((selector) => {
        return selector({ threads: mockThreads });
      });

      const { result } = renderHook(() => useChatService(mockLanguageModel));
      expect(result.current.threads).toEqual(mockThreads);
    });

    it("returns progress from store", () => {
      (useGlobalChatStore as unknown as jest.Mock).mockImplementation((selector) => {
        return selector({ progress: 50 });
      });

      const { result } = renderHook(() => useChatService(mockLanguageModel));
      expect(result.current.progress).toBe(50);
    });
  });

  describe("handleSendMessage", () => {
    it("does nothing when no model is selected", async () => {
      (useGlobalChatStore as unknown as jest.Mock).mockImplementation((selector) => {
        return selector({ sendMessage: mockSendMessage });
      });

      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

      const { result } = renderHook(() => useChatService(null));
      await act(async () => {
        await result.current.sendMessage({ role: "user", content: "Hello", type: "message" } as any);
      });

      expect(mockSendMessage).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith("No model selected");
      consoleErrorSpy.mockRestore();
    });

    it("uses existing thread when current thread exists", async () => {
      (useGlobalChatStore as unknown as jest.Mock).mockImplementation((selector) => {
        return selector({
          sendMessage: mockSendMessage,
          currentThreadId: "thread-1",
          threads: { "thread-1": { id: "thread-1", title: "Thread 1" } },
          createNewThread: jest.fn().mockResolvedValue("new-thread"),
          switchThread: jest.fn(),
        });
      });

      const { result } = renderHook(() => useChatService(mockLanguageModel));

      await act(async () => {
        await result.current.sendMessage({ role: "user", content: "Hello", type: "message" } as any);
      });

      expect(mockSendMessage).toHaveBeenCalledWith({
        role: "user",
        content: "Hello",
        model: "model-1",
        type: "message",
      });
    });

    it("navigates to thread after sending message", async () => {
      (useGlobalChatStore as unknown as jest.Mock).mockImplementation((selector) => {
        return selector({
          sendMessage: mockSendMessage,
          currentThreadId: "thread-1",
          threads: { "thread-1": { id: "thread-1", title: "Thread 1" } },
          createNewThread: jest.fn().mockResolvedValue("new-thread"),
          switchThread: jest.fn(),
        });
      });

      const { result } = renderHook(() => useChatService(mockLanguageModel));

      await act(async () => {
        await result.current.sendMessage({ role: "user", content: "Hello", type: "message" } as any);
      });

      act(() => {
        jest.advanceTimersByTime(100);
      });

      expect(mockNavigate).toHaveBeenCalledWith("/chat/thread-1");
    });

    it("handles errors gracefully", async () => {
      mockSendMessage.mockRejectedValue(new Error("Send failed"));
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

      (useGlobalChatStore as unknown as jest.Mock).mockImplementation((selector) => {
        return selector({
          sendMessage: mockSendMessage,
          currentThreadId: "thread-1",
          threads: { "thread-1": { id: "thread-1", title: "Thread 1" } },
          createNewThread: jest.fn().mockResolvedValue("new-thread"),
          switchThread: jest.fn(),
        });
      });

      const { result } = renderHook(() => useChatService(mockLanguageModel));

      await act(async () => {
        await result.current.sendMessage({ role: "user", content: "Hello", type: "message" } as any);
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to send message:", expect.any(Error));
      consoleErrorSpy.mockRestore();
    });
  });

  describe("onSelectThread", () => {
    it("switches to selected thread and navigates", () => {
      const mockSwitchThread = jest.fn();
      (useGlobalChatStore as unknown as jest.Mock).mockImplementation((selector) => {
        return selector({ switchThread: mockSwitchThread });
      });

      const { result } = renderHook(() => useChatService(mockLanguageModel));

      result.current.onSelectThread("thread-1");

      expect(mockSwitchThread).toHaveBeenCalledWith("thread-1");
      expect(mockNavigate).toHaveBeenCalledWith("/chat/thread-1");
    });
  });

  describe("planning updates", () => {
    it("returns planning update from store", () => {
      const mockPlanningUpdate = { type: "planning", content: "Thinking..." };

      (useGlobalChatStore as unknown as jest.Mock).mockImplementation((selector) => {
        return selector({ currentPlanningUpdate: mockPlanningUpdate });
      });

      const { result } = renderHook(() => useChatService(mockLanguageModel));
      expect(result.current.currentPlanningUpdate).toEqual(mockPlanningUpdate);
    });

    it("returns task update from store", () => {
      const mockTaskUpdate = { type: "task", content: "Processing..." };

      (useGlobalChatStore as unknown as jest.Mock).mockImplementation((selector) => {
        return selector({ currentTaskUpdate: mockTaskUpdate });
      });

      const { result } = renderHook(() => useChatService(mockLanguageModel));
      expect(result.current.currentTaskUpdate).toEqual(mockTaskUpdate);
    });
  });
});
