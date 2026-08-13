import { act, renderHook } from "@testing-library/react";

import { useChatViewThread } from "../useChatViewThread";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import type { Message, Thread } from "../../../stores/ApiTypes";

const makeThread = (id: string): Thread => ({
  id,
  user_id: "user",
  workflow_id: null,
  title: id,
  created_at: "2026-08-14T00:00:00.000Z",
  updated_at: "2026-08-14T00:00:00.000Z"
});

const makeMessage = (text: string): Message => ({
  type: "message",
  role: "assistant",
  name: "",
  content: [{ type: "text", text }]
});

describe("useChatViewThread", () => {
  it("keeps each mounted ChatView instance on its selected thread", () => {
    const switchThread = jest.fn((threadId: string) => {
      useGlobalChatStore.setState({ currentThreadId: threadId });
    });
    const sendMessage = jest.fn().mockResolvedValue(undefined);
    const stopGeneration = jest.fn();
    useGlobalChatStore.setState({
      currentThreadId: "thread-a",
      threads: {
        "thread-a": makeThread("thread-a"),
        "thread-b": makeThread("thread-b")
      },
      messageCache: {
        "thread-a": [makeMessage("Message A")],
        "thread-b": [makeMessage("Message B")]
      },
      switchThread,
      sendMessage,
      stopGeneration
    });

    const first = renderHook(() => useChatViewThread());
    const second = renderHook(() => useChatViewThread());

    act(() => second.result.current.selectThread("thread-b"));

    expect(first.result.current.threadId).toBe("thread-a");
    expect(first.result.current.messages).toEqual([makeMessage("Message A")]);
    expect(second.result.current.threadId).toBe("thread-b");
    expect(second.result.current.messages).toEqual([makeMessage("Message B")]);

    act(() => {
      void first.result.current.sendMessage(makeMessage("Send A"));
      second.result.current.stopGeneration();
    });

    expect(sendMessage).toHaveBeenCalledWith(makeMessage("Send A"), "thread-a");
    expect(stopGeneration).toHaveBeenCalledWith("thread-b");
  });
});
