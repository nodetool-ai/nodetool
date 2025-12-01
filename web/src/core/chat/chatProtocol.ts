/**
 * Global chat protocol reducer.
 *
 * The chat WebSocket streams mixed message types: user/assistant Messages,
 * Chunk streams for assistant text, Job/Node updates, ToolCall/ToolResult,
 * Planning/Task updates, workflow graph create/update events, and generation
 * stop notices. Ordering is preserved per thread; updates are merged into the
 * GlobalChatStore via pure reducer helpers here so connection logic stays in
 * the store while message handling remains testable.
 */
import log from "loglevel";

import {
  Chunk,
  JobUpdate,
  Message,
  MessageContent,
  NodeProgress,
  NodeUpdate,
  OutputUpdate,
  PlanningUpdate,
  Prediction,
  SubTaskResult,
  TaskUpdate,
  ToolCallUpdate
} from "../../stores/ApiTypes";
import {
  FrontendToolRegistry,
  FrontendToolState
} from "../../lib/tools/frontendTools";
import type { GlobalChatState } from "../../stores/GlobalChatStore";

export interface WorkflowCreatedUpdate {
  type: "workflow_created";
  workflow_id: string;
  graph: any;
}

export interface WorkflowUpdatedUpdate {
  type: "workflow_updated";
  workflow_id: string;
  graph: any;
}

export interface GenerationStoppedUpdate {
  type: "generation_stopped";
  message: string;
}

export interface ToolCallMessage {
  type: "tool_call";
  tool_call_id: string;
  name: string;
  args: any;
  thread_id: string;
}

export type MsgpackData =
  | JobUpdate
  | Chunk
  | Prediction
  | NodeProgress
  | NodeUpdate
  | Message
  | ToolCallUpdate
  | TaskUpdate
  | PlanningUpdate
  | OutputUpdate
  | SubTaskResult
  | WorkflowCreatedUpdate
  | GenerationStoppedUpdate
  | ToolCallMessage
  | ToolResultMessage;

export interface ToolResultMessage {
  type: "tool_result";
  tool_call_id: string;
  result: any;
  ok: boolean;
}

const makeMessageContent = (type: string, data: Uint8Array): MessageContent => {
  let mimeType = "application/octet-stream";
  if (type === "image") mimeType = "image/png";
  else if (type === "audio") mimeType = "audio/mp3";
  else if (type === "video") mimeType = "video/mp4";

  const dataUri = URL.createObjectURL(new Blob([data], { type: mimeType }));

  if (type === "image") {
    return {
      type: "image_url",
      image: { type: "image", uri: dataUri }
    } as MessageContent;
  } else if (type === "audio") {
    return {
      type: "audio",
      audio: { type: "audio", uri: dataUri }
    } as MessageContent;
  } else if (type === "video") {
    return {
      type: "video",
      video: { type: "video", uri: dataUri }
    } as MessageContent;
  }
  throw new Error(`Unknown message content type: ${type}`);
};

type ChatStateSetter = (
  state:
    | Partial<GlobalChatState>
    | ((state: GlobalChatState) => Partial<GlobalChatState>)
) => void;

type ChatStateGetter = () => GlobalChatState;

type ReducerResult = {
  update: Partial<GlobalChatState>;
  postAction?: (get: ChatStateGetter) => void;
};

const noopUpdate: ReducerResult = { update: {} };

const updateThreadTimestamp = (
  threadId: string,
  threads: GlobalChatState["threads"]
) => ({
  ...threads,
  [threadId]: {
    ...threads[threadId],
    updated_at: new Date().toISOString()
  }
});

const applyJobUpdate = (state: GlobalChatState, update: JobUpdate) => {
  if (update.status === "completed") {
    return {
      update: {
        status: "connected",
        progress: { current: 0, total: 0 },
        statusMessage: null
      }
    };
  }
  if (update.status === "failed") {
    return {
      update: {
        status: "error",
        error: update.error,
        progress: { current: 0, total: 0 },
        statusMessage: update.error || null
      }
    };
  }
  return noopUpdate;
};

const applyNodeUpdate = (state: GlobalChatState, update: NodeUpdate) => {
  if (update.status === "completed") {
    return {
      update: {
        status: "connected",
        progress: { current: 0, total: 0 },
        statusMessage: null
      }
    };
  }
  return { update: { statusMessage: update.node_name } };
};

const applyChunk = (state: GlobalChatState, chunk: Chunk): ReducerResult => {
  const threadId = state.currentThreadId;
  if (!threadId) return noopUpdate;

  const thread = state.threads[threadId];
  if (!thread) return noopUpdate;

  const messages = state.messageCache[threadId] || [];
  const lastMessage = messages[messages.length - 1];
  let updatedMessages: Message[];

  if (lastMessage && lastMessage.role === "assistant") {
    const updatedMessage: Message = {
      ...lastMessage,
      content: (lastMessage.content || "") + chunk.content
    };
    updatedMessages = [...messages.slice(0, -1), updatedMessage];
  } else {
    const message: Message = {
      role: "assistant",
      type: "message",
      content: chunk.content
    };
    updatedMessages = [...messages, message];
  }

  const baseUpdate: Partial<GlobalChatState> = {
    status: chunk.done ? "connected" : "streaming",
    statusMessage: null,
    messageCache: {
      ...state.messageCache,
      [threadId]: updatedMessages
    },
    threads: updateThreadTimestamp(threadId, state.threads)
  };

  if (!chunk.done) {
    return { update: baseUpdate };
  }

  const postAction = (get: ChatStateGetter) => {
    const { selectedModel, summarizeThread } = get();
    const messagesAfterUpdate = get().messageCache[threadId] || [];
    if (messagesAfterUpdate.length === 2) {
      log.debug("Triggering thread summarization for thread:", threadId);
    }
    if (selectedModel.provider && selectedModel.id) {
      summarizeThread(
        threadId,
        selectedModel.provider,
        selectedModel.id,
        JSON.stringify(messagesAfterUpdate)
      );
    }
  };

  return {
    update: {
      ...baseUpdate,
      currentPlanningUpdate: null,
      currentTaskUpdate: null
    },
    postAction
  };
};

const applyOutputUpdate = (
  state: GlobalChatState,
  update: OutputUpdate
): ReducerResult => {
  const threadId = state.currentThreadId;
  if (!threadId) return noopUpdate;

  const thread = state.threads[threadId];
  if (!thread) return noopUpdate;

  if (update.output_type === "string") {
    const messages = state.messageCache[threadId] || [];
    const lastMessage = messages[messages.length - 1];

    if (lastMessage && lastMessage.role === "assistant") {
      if (update.value === "<nodetool_end_of_stream>") {
        return noopUpdate;
      }
      const updatedMessage: Message = {
        ...lastMessage,
        content: lastMessage.content + (update.value as string)
      };
      return {
        update: {
          status: "streaming",
          statusMessage: undefined,
          messageCache: {
            ...state.messageCache,
            [threadId]: [...messages.slice(0, -1), updatedMessage]
          },
          threads: updateThreadTimestamp(threadId, state.threads)
        }
      };
    }

    const message: Message = {
      role: "assistant",
      type: "message",
      content: update.value as string
    };
    return {
      update: {
        status: "streaming",
        messageCache: {
          ...state.messageCache,
          [threadId]: [...messages, message]
        },
        threads: updateThreadTimestamp(threadId, state.threads)
      }
    };
  }

  if (["image", "audio", "video"].includes(update.output_type)) {
    const message: Message = {
      role: "assistant",
      type: "message",
      content: [
        makeMessageContent(
          update.output_type,
          (update.value as { data: Uint8Array }).data
        )
      ],
      name: "assistant"
    } as Message;
    const messages = state.messageCache[threadId] || [];
    return {
      update: {
        statusMessage: null,
        messageCache: {
          ...state.messageCache,
          [threadId]: [...messages, message]
        },
        threads: updateThreadTimestamp(threadId, state.threads)
      }
    };
  }

  return noopUpdate;
};

const applyToolCallUpdate = (
  _state: GlobalChatState,
  update: ToolCallUpdate
) => ({
  update: {
    statusMessage: update.message,
    currentRunningToolCallId: (update as any).tool_call_id || null,
    currentToolMessage: update.message || null
  }
});

const applyAgentExecutionMessage = (
  state: GlobalChatState,
  threadId: string,
  thread: any,
  messages: Message[],
  msg: Message
): ReducerResult => {
  const update: Partial<GlobalChatState> = {
    messageCache: {
      ...state.messageCache,
      [threadId]: [...messages, msg]
    },
    threads: updateThreadTimestamp(threadId, state.threads)
  };

  if (msg.execution_event_type === "planning_update") {
    const content = msg.content;
    if (content && typeof content === "object" && !Array.isArray(content)) {
      update.currentPlanningUpdate = content as PlanningUpdate;
    }
  } else if (msg.execution_event_type === "task_update") {
    const content = msg.content;
    if (content && typeof content === "object" && !Array.isArray(content)) {
      update.currentTaskUpdate = content as TaskUpdate;
    }
  }

  return { update };
};

const applyToolMessage = (
  state: GlobalChatState,
  threadId: string,
  messages: Message[],
  msg: Message
) => ({
  update: {
    messageCache: {
      ...state.messageCache,
      [threadId]: [...messages, msg]
    },
    threads: updateThreadTimestamp(threadId, state.threads),
    ...(msg.role === "tool"
      ? {
          currentRunningToolCallId: null,
          currentToolMessage: null,
          statusMessage: null
        }
      : {})
  }
});

const applyAssistantMessage = (
  state: GlobalChatState,
  threadId: string,
  messages: Message[],
  msg: Message
) => {
  const incomingText =
    typeof msg.content === "string"
      ? msg.content
      : Array.isArray(msg.content)
      ? msg.content.map((c: any) => (c?.type === "text" ? c.text : "")).join("")
      : "";

  return {
    update: {
      messageCache: {
        ...state.messageCache,
        [threadId]: (() => {
          const currentLast = messages[messages.length - 1];
          const currentLastText =
            currentLast &&
            currentLast.role === "assistant" &&
            typeof currentLast.content === "string"
              ? (currentLast.content as string)
              : null;

          if (
            currentLast &&
            currentLast.role === "assistant" &&
            currentLastText === incomingText
          ) {
            return messages;
          }

          return [...messages, msg];
        })()
      },
      threads: updateThreadTimestamp(threadId, state.threads)
    }
  };
};

const applyMessage = (state: GlobalChatState, msg: Message): ReducerResult => {
  const threadId = state.currentThreadId;
  if (!threadId) return noopUpdate;

  const thread = state.threads[threadId];
  if (!thread) return noopUpdate;

  const messages = state.messageCache[threadId] || [];

  if (msg.role === "agent_execution") {
    return applyAgentExecutionMessage(state, threadId, thread, messages, msg);
  }

  const isAssistantToolCall =
    msg.role === "assistant" &&
    Array.isArray(msg.tool_calls) &&
    msg.tool_calls.length > 0;
  if (msg.role === "tool" || isAssistantToolCall) {
    return applyToolMessage(state, threadId, messages, msg);
  }

  if (msg.role === "assistant") {
    return applyAssistantMessage(state, threadId, messages, msg);
  }

  return {
    update: {
      messageCache: {
        ...state.messageCache,
        [threadId]: [...messages, msg]
      },
      threads: updateThreadTimestamp(threadId, state.threads)
    }
  };
};

const applyNodeProgress = (
  _state: GlobalChatState,
  progress: NodeProgress
) => ({
  update: {
    status: "loading",
    progress: { current: progress.progress, total: progress.total },
    statusMessage: null
  }
});

const applyGenerationStopped = (): ReducerResult => ({
  update: {
    status: "connected",
    progress: { current: 0, total: 0 },
    statusMessage: null,
    currentPlanningUpdate: null,
    currentTaskUpdate: null
  }
});

const applyError = (message: string): ReducerResult => ({
  update: {
    error: message || "An error occurred",
    status: "error",
    statusMessage: message
  }
});

export async function handleChatWebSocketMessage(
  data: MsgpackData,
  set: ChatStateSetter,
  get: ChatStateGetter
) {
  const currentState = get();

  if (currentState.status === "stopping") {
    if (!["generation_stopped", "error", "job_update"].includes(data.type)) {
      return;
    }
  }

  const applyReducer = <T>(
    fn: (state: GlobalChatState, payload: T) => ReducerResult,
    payload: T
  ) => {
    let postAction: ReducerResult["postAction"];
    set((state) => {
      const result = fn(state, payload);
      postAction = result.postAction;
      return result.update;
    });
    if (postAction) {
      postAction(get);
    }
  };

  if (data.type === "job_update") {
    applyReducer(applyJobUpdate, data as JobUpdate);
  } else if (data.type === "node_update") {
    applyReducer(applyNodeUpdate, data as NodeUpdate);
  } else if (data.type === "chunk") {
    applyReducer(applyChunk, data as Chunk);
  } else if (data.type === "output_update") {
    applyReducer(applyOutputUpdate, data as OutputUpdate);
  } else if (data.type === "tool_call_update") {
    applyReducer(applyToolCallUpdate, data as ToolCallUpdate);
  } else if (data.type === "message") {
    applyReducer(applyMessage, data as Message);
  } else if (data.type === "node_progress") {
    applyReducer(applyNodeProgress, data as NodeProgress);
  } else if (data.type === "tool_call") {
    const toolCallData = data as ToolCallMessage;
    const { tool_call_id, name, args, thread_id } = toolCallData;

    if (!FrontendToolRegistry.has(name)) {
      log.warn(`Unknown tool: ${name}`);
      currentState.wsManager?.send({
        type: "tool_result",
        tool_call_id,
        thread_id,
        ok: false,
        error: `Unsupported tool: ${name}`
      });
      return;
    }

    const startTime = Date.now();
    try {
      const result = await FrontendToolRegistry.call(name, args, tool_call_id, {
        getState: () => get().frontendToolState as FrontendToolState
      });

      const elapsedMs = Date.now() - startTime;
      currentState.wsManager?.send({
        type: "tool_result",
        tool_call_id,
        thread_id,
        ok: true,
        result,
        elapsed_ms: elapsedMs
      });
    } catch (error) {
      const elapsedMs = Date.now() - startTime;
      log.error(`Tool execution failed for ${name}:`, error);
      currentState.wsManager?.send({
        type: "tool_result",
        tool_call_id,
        thread_id,
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
        elapsed_ms: elapsedMs
      });
    }
  } else if (data.type === "generation_stopped") {
    applyReducer(
      (_state) => applyGenerationStopped(),
      data as GenerationStoppedUpdate
    );
    const stoppedData = data as GenerationStoppedUpdate;
    log.info("Generation stopped:", stoppedData.message);
  } else if ((data as any).type === "error") {
    const errorData = data as any;
    applyReducer(
      (_state) => applyError(errorData.message),
      errorData as { message?: string }
    );
  }
}
