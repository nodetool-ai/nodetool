import { renderHook, act } from "@testing-library/react";
import { useMessageQueue } from "../useMessageQueue";
import { MessageContent } from "../../stores/ApiTypes";

describe("useMessageQueue", () => {
  const mockOnSendMessage = jest.fn();
  const mockOnStop = jest.fn();
  const mockTextareaRef = {
    current: {
      focus: jest.fn()
    } as unknown as HTMLTextAreaElement
  };

  const createMockContent = (text: string): MessageContent[] => [
    { type: "text", text }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("initial state", () => {
    it("returns null queuedMessage initially", () => {
      const { result } = renderHook(() =>
        useMessageQueue({
          isLoading: false,
          isStreaming: false,
          onSendMessage: mockOnSendMessage
        })
      );

      expect(result.current.queuedMessage).toBeNull();
    });

    it("returns sendMessage, cancelQueued, and sendQueuedNow functions", () => {
      const { result } = renderHook(() =>
        useMessageQueue({
          isLoading: false,
          isStreaming: false,
          onSendMessage: mockOnSendMessage
        })
      );

      expect(typeof result.current.sendMessage).toBe("function");
      expect(typeof result.current.cancelQueued).toBe("function");
      expect(typeof result.current.sendQueuedNow).toBe("function");
    });
  });

  describe("sendMessage", () => {
    it("sends message immediately when not loading or streaming", () => {
      const { result } = renderHook(() =>
        useMessageQueue({
          isLoading: false,
          isStreaming: false,
          onSendMessage: mockOnSendMessage
        })
      );

      const content = createMockContent("test message");

      act(() => {
        result.current.sendMessage(content, "test message", false);
      });

      expect(mockOnSendMessage).toHaveBeenCalledWith(
        content,
        "test message",
        false
      );
      expect(result.current.queuedMessage).toBeNull();
    });

    it("queues message when loading", () => {
      const { result } = renderHook(() =>
        useMessageQueue({
          isLoading: true,
          isStreaming: false,
          onSendMessage: mockOnSendMessage
        })
      );

      const content = createMockContent("test message");

      act(() => {
        result.current.sendMessage(content, "test message", false);
      });

      expect(mockOnSendMessage).not.toHaveBeenCalled();
      expect(result.current.queuedMessage).toEqual({
        content,
        prompt: "test message",
        agentMode: false
      });
    });

    it("queues message when streaming", () => {
      const { result } = renderHook(() =>
        useMessageQueue({
          isLoading: false,
          isStreaming: true,
          onSendMessage: mockOnSendMessage
        })
      );

      const content = createMockContent("test message");

      act(() => {
        result.current.sendMessage(content, "test message", true);
      });

      expect(mockOnSendMessage).not.toHaveBeenCalled();
      expect(result.current.queuedMessage).toEqual({
        content,
        prompt: "test message",
        agentMode: true
      });
    });

    it("does not queue a second message if one is already queued", () => {
      const { result } = renderHook(() =>
        useMessageQueue({
          isLoading: true,
          isStreaming: false,
          onSendMessage: mockOnSendMessage
        })
      );

      const content1 = createMockContent("first message");
      const content2 = createMockContent("second message");

      act(() => {
        result.current.sendMessage(content1, "first message", false);
      });

      act(() => {
        result.current.sendMessage(content2, "second message", false);
      });

      // Should still have first message queued
      expect(result.current.queuedMessage?.prompt).toBe("first message");
    });

    it("focuses textarea after sending when ref provided", () => {
      const { result } = renderHook(() =>
        useMessageQueue({
          isLoading: false,
          isStreaming: false,
          onSendMessage: mockOnSendMessage,
          textareaRef: mockTextareaRef
        })
      );

      const content = createMockContent("test message");

      act(() => {
        result.current.sendMessage(content, "test message", false);
      });

      // Run animation frame
      act(() => {
        jest.runAllTimers();
      });

      expect(mockTextareaRef.current.focus).toHaveBeenCalled();
    });
  });

  describe("automatic queue sending", () => {
    it("sends queued message when loading stops", () => {
      const { result, rerender } = renderHook(
        ({ isLoading, isStreaming }) =>
          useMessageQueue({
            isLoading,
            isStreaming,
            onSendMessage: mockOnSendMessage
          }),
        {
          initialProps: { isLoading: true, isStreaming: false }
        }
      );

      const content = createMockContent("test message");

      act(() => {
        result.current.sendMessage(content, "test message", false);
      });

      expect(mockOnSendMessage).not.toHaveBeenCalled();

      // Stop loading
      rerender({ isLoading: false, isStreaming: false });

      expect(mockOnSendMessage).toHaveBeenCalledWith(
        content,
        "test message",
        false
      );
      expect(result.current.queuedMessage).toBeNull();
    });

    it("sends queued message when streaming stops", () => {
      const { result, rerender } = renderHook(
        ({ isLoading, isStreaming }) =>
          useMessageQueue({
            isLoading,
            isStreaming,
            onSendMessage: mockOnSendMessage
          }),
        {
          initialProps: { isLoading: false, isStreaming: true }
        }
      );

      const content = createMockContent("test message");

      act(() => {
        result.current.sendMessage(content, "test message", false);
      });

      expect(mockOnSendMessage).not.toHaveBeenCalled();

      // Stop streaming
      rerender({ isLoading: false, isStreaming: false });

      expect(mockOnSendMessage).toHaveBeenCalledWith(
        content,
        "test message",
        false
      );
      expect(result.current.queuedMessage).toBeNull();
    });

    it("waits until both loading and streaming stop", () => {
      const { result, rerender } = renderHook(
        ({ isLoading, isStreaming }) =>
          useMessageQueue({
            isLoading,
            isStreaming,
            onSendMessage: mockOnSendMessage
          }),
        {
          initialProps: { isLoading: true, isStreaming: true }
        }
      );

      const content = createMockContent("test message");

      act(() => {
        result.current.sendMessage(content, "test message", false);
      });

      // Stop loading but still streaming
      rerender({ isLoading: false, isStreaming: true });
      expect(mockOnSendMessage).not.toHaveBeenCalled();

      // Stop streaming
      rerender({ isLoading: false, isStreaming: false });
      expect(mockOnSendMessage).toHaveBeenCalledWith(
        content,
        "test message",
        false
      );
    });
  });

  describe("cancelQueued", () => {
    it("clears queued message", () => {
      const { result } = renderHook(() =>
        useMessageQueue({
          isLoading: true,
          isStreaming: false,
          onSendMessage: mockOnSendMessage
        })
      );

      const content = createMockContent("test message");

      act(() => {
        result.current.sendMessage(content, "test message", false);
      });

      expect(result.current.queuedMessage).not.toBeNull();

      act(() => {
        result.current.cancelQueued();
      });

      expect(result.current.queuedMessage).toBeNull();
    });

    it("can be called multiple times safely", () => {
      const { result } = renderHook(() =>
        useMessageQueue({
          isLoading: false,
          isStreaming: false,
          onSendMessage: mockOnSendMessage
        })
      );

      act(() => {
        result.current.cancelQueued();
        result.current.cancelQueued();
        result.current.cancelQueued();
      });

      expect(result.current.queuedMessage).toBeNull();
    });
  });

  describe("sendQueuedNow", () => {
    it("sends queued message immediately and calls onStop", () => {
      const { result, rerender } = renderHook(
        ({ isLoading, isStreaming }) =>
          useMessageQueue({
            isLoading,
            isStreaming,
            onSendMessage: mockOnSendMessage,
            onStop: mockOnStop
          }),
        {
          initialProps: { isLoading: true, isStreaming: false }
        }
      );

      const content = createMockContent("test message");

      act(() => {
        result.current.sendMessage(content, "test message", false);
      });

      act(() => {
        result.current.sendQueuedNow();
      });

      expect(mockOnStop).toHaveBeenCalled();
      expect(result.current.queuedMessage).toBeNull();

      // Simulate the streaming state changing to stopped
      rerender({ isLoading: false, isStreaming: false });

      expect(mockOnSendMessage).toHaveBeenCalledWith(
        content,
        "test message",
        false
      );
    });

    it("does nothing when no message is queued", () => {
      const { result } = renderHook(() =>
        useMessageQueue({
          isLoading: false,
          isStreaming: false,
          onSendMessage: mockOnSendMessage,
          onStop: mockOnStop
        })
      );

      act(() => {
        result.current.sendQueuedNow();
      });

      expect(mockOnStop).not.toHaveBeenCalled();
      expect(mockOnSendMessage).not.toHaveBeenCalled();
    });

    it("does nothing when onStop is not provided", () => {
      const { result } = renderHook(() =>
        useMessageQueue({
          isLoading: true,
          isStreaming: false,
          onSendMessage: mockOnSendMessage
        })
      );

      const content = createMockContent("test message");

      act(() => {
        result.current.sendMessage(content, "test message", false);
      });

      act(() => {
        result.current.sendQueuedNow();
      });

      expect(mockOnSendMessage).not.toHaveBeenCalled();
      expect(result.current.queuedMessage).not.toBeNull();
    });
  });

  describe("onSendMessage reference updates", () => {
    it("uses the latest onSendMessage when sending", () => {
      const mockOnSendMessage1 = jest.fn();
      const mockOnSendMessage2 = jest.fn();

      const { result, rerender } = renderHook(
        ({ onSendMessage }) =>
          useMessageQueue({
            isLoading: false,
            isStreaming: false,
            onSendMessage
          }),
        {
          initialProps: { onSendMessage: mockOnSendMessage1 }
        }
      );

      // Update onSendMessage
      rerender({ onSendMessage: mockOnSendMessage2 });

      const content = createMockContent("test message");

      act(() => {
        result.current.sendMessage(content, "test message", false);
      });

      expect(mockOnSendMessage1).not.toHaveBeenCalled();
      expect(mockOnSendMessage2).toHaveBeenCalledWith(
        content,
        "test message",
        false
      );
    });
  });

  describe("agentMode parameter", () => {
    it("preserves agentMode value through queue", () => {
      const { result, rerender } = renderHook(
        ({ isLoading }) =>
          useMessageQueue({
            isLoading,
            isStreaming: false,
            onSendMessage: mockOnSendMessage
          }),
        {
          initialProps: { isLoading: true }
        }
      );

      const content = createMockContent("test message");

      act(() => {
        result.current.sendMessage(content, "test message", true);
      });

      // Stop loading
      rerender({ isLoading: false });

      expect(mockOnSendMessage).toHaveBeenCalledWith(
        content,
        "test message",
        true
      );
    });
  });
});
