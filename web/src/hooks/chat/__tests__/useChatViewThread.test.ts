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

  it("isolated mode loads the messages of a selected thread", () => {
    const switchThread = jest.fn();
    const loadMessages = jest.fn().mockResolvedValue([]);
    useGlobalChatStore.setState({
      currentThreadId: "canvas",
      threads: {
        canvas: makeThread("canvas"),
        older: makeThread("older")
      },
      messageCache: {},
      switchThread,
      loadMessages
    });

    const isolated = renderHook(() => useChatViewThread({ isolated: true }));

    act(() => isolated.result.current.selectThread("older"));

    expect(isolated.result.current.threadId).toBe("older");
    expect(loadMessages).toHaveBeenCalledWith("older");
    expect(switchThread).not.toHaveBeenCalled();
  });

  it("isolated mode reports loading until the selected thread's history arrives", async () => {
    let resolveLoad: (messages: Message[]) => void = () => undefined;
    const loadMessages = jest.fn(
      () =>
        new Promise<Message[]>((resolve) => {
          resolveLoad = resolve;
        })
    );
    useGlobalChatStore.setState({
      threads: { older: makeThread("older") },
      messageCache: {},
      loadMessages
    });

    const isolated = renderHook(() => useChatViewThread({ isolated: true }));
    expect(isolated.result.current.isLoadingThread).toBe(false);

    act(() => isolated.result.current.selectThread("older"));
    expect(isolated.result.current.isLoadingThread).toBe(true);

    await act(async () => {
      useGlobalChatStore.setState({
        messageCache: { older: [makeMessage("Old")] }
      });
      resolveLoad([makeMessage("Old")]);
    });
    expect(isolated.result.current.isLoadingThread).toBe(false);
    expect(isolated.result.current.messages).toEqual([makeMessage("Old")]);
  });

  it("isolated mode does not adopt or switch the current thread", async () => {
    const switchThread = jest.fn();
    const createNewThread = jest.fn().mockResolvedValue("isolated-1");
    const sendMessage = jest.fn().mockResolvedValue(undefined);
    useGlobalChatStore.setState({
      currentThreadId: "canvas",
      threads: {
        canvas: makeThread("canvas"),
        "isolated-1": makeThread("isolated-1")
      },
      messageCache: {
        canvas: [makeMessage("Canvas")],
        "isolated-1": []
      },
      switchThread,
      createNewThread,
      sendMessage,
      stopGeneration: jest.fn()
    });

    const isolated = renderHook(() => useChatViewThread({ isolated: true }));

    expect(isolated.result.current.threadId).toBeNull();

    await act(async () => {
      await isolated.result.current.sendMessage(makeMessage("from assistant"));
    });

    // Created for this send, so it keeps the composer's mode.
    expect(createNewThread).toHaveBeenCalledWith(undefined, null, {
      makeCurrent: false,
      mediaMode: "chat"
    });
    expect(switchThread).not.toHaveBeenCalled();
    expect(useGlobalChatStore.getState().currentThreadId).toBe("canvas");
    expect(sendMessage).toHaveBeenCalledWith(
      makeMessage("from assistant"),
      "isolated-1"
    );
  });
});
