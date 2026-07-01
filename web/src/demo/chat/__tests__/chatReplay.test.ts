/**
 * computeChatStateAt must be a pure function of time: replaying to the same
 * `timeMs` always yields the same state, regardless of what was computed
 * before it (unlike the workflow DemoEngine, there is no incremental seek
 * state to get out of sync).
 */
import { computeChatStateAt, seedChatGlobalState } from "../chatReplay";
import {
  assistantStart,
  assistantStream,
  progress,
  status,
  toolResult,
  toolRunning,
  userMessage,
} from "../chatCastHelpers";
import type { ChatCastEvent } from "../chatCastTypes";
import useGlobalChatStore from "../../../stores/GlobalChatStore";

const ASSISTANT_ID = "assistant-1";
const TOOL_CALL_ID = "tool-1";

const events: ChatCastEvent[] = [
  status(0, "connected"),
  userMessage(100, "Hello?"),
  status(200, "streaming"),
  assistantStart(300, ASSISTANT_ID, [
    { id: TOOL_CALL_ID, name: "search_web", args: { query: "hello" } },
  ]),
  toolRunning(400, TOOL_CALL_ID, "Searching…"),
  progress(400, 1, 1, "Searching…"),
  toolRunning(900, null),
  progress(900, 0, 0, null),
  toolResult(900, ASSISTANT_ID, [
    { id: TOOL_CALL_ID, name: "search_web", args: { query: "hello" }, result: { ok: true } },
  ]),
  ...assistantStream(ASSISTANT_ID, ["Hi ", "there."], 1000, 1000),
  status(2500, "connected"),
];

describe("computeChatStateAt", () => {
  it("shows no messages before the first event", () => {
    const state = computeChatStateAt(events, -1);
    expect(state.messages).toHaveLength(0);
    expect(state.status).toBe("connected");
  });

  it("adds the user message once its event has passed", () => {
    const state = computeChatStateAt(events, 100);
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].role).toBe("user");
    expect(state.messages[0].content).toBe("Hello?");
  });

  it("marks the tool call as running and reports progress", () => {
    const state = computeChatStateAt(events, 500);
    expect(state.runningToolCallId).toBe(TOOL_CALL_ID);
    expect(state.runningToolMessage).toBe("Searching…");
    expect(state.progress).toBe(1);
    expect(state.total).toBe(1);
  });

  it("clears the running tool call and attaches the result", () => {
    const state = computeChatStateAt(events, 950);
    expect(state.runningToolCallId).toBeNull();
    expect(state.progress).toBe(0);
    const assistant = state.messages.find((m) => m.id === ASSISTANT_ID);
    expect(assistant?.tool_calls?.[0]?.result).toEqual({ ok: true });
  });

  it("accumulates streamed chunks onto the assistant message", () => {
    const partial = computeChatStateAt(events, 1000);
    const assistant = partial.messages.find((m) => m.id === ASSISTANT_ID);
    expect(assistant?.content).toBe("Hi ");

    const full = computeChatStateAt(events, 2000);
    const assistantFull = full.messages.find((m) => m.id === ASSISTANT_ID);
    expect(assistantFull?.content).toBe("Hi there.");
  });

  it("is a pure function of time — recomputing at an earlier time undoes later state", () => {
    const late = computeChatStateAt(events, 2000);
    expect(late.status).toBe("streaming");

    const early = computeChatStateAt(events, 100);
    expect(early.status).toBe("connected");
    expect(early.messages).toHaveLength(1);
  });
});

describe("seedChatGlobalState", () => {
  it("mirrors the running tool call and todos into GlobalChatStore", () => {
    const state = computeChatStateAt(events, 500);
    seedChatGlobalState("demo-thread", state);

    const globalState = useGlobalChatStore.getState();
    expect(globalState.currentThreadId).toBe("demo-thread");
    expect(globalState.currentRunningToolCallId).toBe(TOOL_CALL_ID);
    expect(globalState.todosByThread["demo-thread"]).toEqual([]);
  });
});
