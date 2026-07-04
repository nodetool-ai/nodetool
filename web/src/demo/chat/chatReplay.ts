/**
 * Pure replay for a `ChatDemoCast` — folds every event with `t <= timeMs`
 * into the props `ChatView` needs. Chat casts are short (tens of events), so
 * unlike the workflow `DemoEngine` this recomputes from scratch on every
 * frame instead of seeking incrementally; simplicity over micro-optimizing a
 * fold that never runs over ~50 events.
 */
import type { Message, TodoItem } from "../../stores/ApiTypes";
import type { ChatCastEvent, ChatViewStatus } from "./chatCastTypes";
import useGlobalChatStore from "../../stores/GlobalChatStore";

export interface ChatReplayState {
  status: ChatViewStatus;
  messages: Message[];
  progress: number;
  total: number;
  progressMessage: string | null;
  runningToolCallId: string | null;
  runningToolMessage: string | null;
  todos: TodoItem[];
}

const INITIAL_STATE: ChatReplayState = {
  status: "connected",
  messages: [],
  progress: 0,
  total: 0,
  progressMessage: null,
  runningToolCallId: null,
  runningToolMessage: null,
  todos: [],
};

function patchMessage(
  messages: Message[],
  id: string,
  patch: (m: Message) => Message
): Message[] {
  return messages.map((m) => (m.id === id ? patch(m) : m));
}

/** Compute the chat UI state at `timeMs` by folding every event up to it. */
export function computeChatStateAt(
  events: ChatCastEvent[],
  timeMs: number
): ChatReplayState {
  let state = INITIAL_STATE;

  for (const event of events) {
    if (event.t > timeMs) break;
    const { payload } = event;

    switch (payload.kind) {
      case "status":
        state = { ...state, status: payload.status };
        break;
      case "message":
        state = { ...state, messages: [...state.messages, payload.message] };
        break;
      case "assistantStart":
        state = {
          ...state,
          messages: [
            ...state.messages,
            {
              type: "message",
              id: payload.id,
              role: "assistant",
              content: "",
              tool_calls: payload.toolCalls ?? null,
            },
          ],
        };
        break;
      case "chunk":
        state = {
          ...state,
          messages: patchMessage(state.messages, payload.id, (m) => ({
            ...m,
            content: `${typeof m.content === "string" ? m.content : ""}${payload.text}`,
          })),
        };
        break;
      case "toolRunning":
        state = {
          ...state,
          runningToolCallId: payload.toolCallId,
          runningToolMessage: payload.toolMessage ?? null,
        };
        break;
      case "toolResult":
        state = {
          ...state,
          messages: patchMessage(state.messages, payload.id, (m) => ({
            ...m,
            tool_calls: payload.toolCalls,
          })),
        };
        break;
      case "progress":
        state = {
          ...state,
          progress: payload.progress,
          total: payload.total,
          progressMessage: payload.message,
        };
        break;
      case "todos":
        state = { ...state, todos: payload.todos };
        break;
    }
  }

  return state;
}

/**
 * Mirror the replay state into the real `GlobalChatStore` singleton: some
 * chat components (e.g. `MessageView`'s tool-call spinner, `TodoSidebar`)
 * read a handful of fields directly off the global store instead of props.
 * Same "seed the shared store" pattern as `seedCastMetadata`/`seedDemoAuth`
 * in the workflow demo engine.
 */
export function seedChatGlobalState(
  threadId: string,
  state: ChatReplayState
): void {
  useGlobalChatStore.setState({
    currentThreadId: threadId,
    currentRunningToolCallId: state.runningToolCallId,
    currentToolMessage: state.runningToolMessage,
    todosByThread: { [threadId]: state.todos },
  });
}
