/**
 * Simplified chat protocol handler for the Chrome extension.
 * 
 * Handles WebSocket messages from the Nodetool server and updates the store.
 * Includes browser tool execution via the BrowserToolRegistry.
 */
import log from "loglevel";

import {
  Message,
  TaskUpdate,
  PlanningUpdate,
  ToolCallUpdate,
  JobUpdate,
  NodeUpdate,
  NodeProgress,
  OutputUpdate,
  MessageContent
} from "../../stores/ApiTypes";
import type { GlobalChatState } from "../../stores/GlobalChatStore";
import { BrowserToolRegistry } from "../../lib/tools/browserTools";

export interface WorkflowCreatedUpdate {
  type: "workflow_created";
  workflow_id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  graph: any;
}

export interface WorkflowUpdatedUpdate {
  type: "workflow_updated";
  workflow_id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  graph: any;
}

export interface GenerationStoppedUpdate {
  type: "generation_stopped";
  message: string;
}

export interface Chunk {
  type: "chunk";
  content: string;
  done?: boolean;
}

// Add type field to types that need it
interface TypedJobUpdate extends JobUpdate {
  type: "job_update";
}

interface TypedNodeUpdate extends NodeUpdate {
  type: "node_update";
  node_name?: string;
}

interface TypedNodeProgress extends NodeProgress {
  type: "node_progress";
}

interface TypedMessage extends Message {
  type: "message";
}

interface TypedToolCallUpdate extends ToolCallUpdate {
  type: "tool_call_update";
  message?: string;
}

interface TypedOutputUpdate extends OutputUpdate {
  type: "output_update";
  output_type?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value?: any;
}

interface TypedError {
  type: "error";
  message?: string;
}

// Tool call message from server requesting client-side tool execution
interface ToolCallMessage {
  type: "tool_call";
  tool_call_id: string;
  name: string;
  args: Record<string, unknown>;
  thread_id: string;
}

export type MsgpackData =
  | TypedJobUpdate
  | Chunk
  | TypedNodeProgress
  | TypedNodeUpdate
  | TypedMessage
  | TypedToolCallUpdate
  | TypedOutputUpdate
  | WorkflowCreatedUpdate
  | WorkflowUpdatedUpdate
  | GenerationStoppedUpdate
  | ToolCallMessage
  | TypedError;

const makeMessageContent = (type: string, data: Uint8Array): MessageContent => {
  let mimeType = "application/octet-stream";
  if (type === "image") mimeType = "image/png";
  else if (type === "audio") mimeType = "audio/mp3";
  else if (type === "video") mimeType = "video/mp4";

  const dataUri = URL.createObjectURL(new Blob([data as BlobPart], { type: mimeType }));

  if (type === "image") {
    return {
      type: "image_url",
      image_url: { url: dataUri }
    };
  } else if (type === "audio") {
    return {
      type: "audio",
      audio_url: { url: dataUri }
    };
  } else if (type === "video") {
    return {
      type: "video",
      video_url: { url: dataUri }
    };
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

const applyJobUpdate = (
  _state: GlobalChatState,
  update: TypedJobUpdate
): ReducerResult => {
  if (update.status === "completed") {
    return {
      update: {
        status: "connected",
        progress: { current: 0, total: 0 },
        statusMessage: null
      }
    };
  }
  if (update.status === "error") {
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

const applyNodeUpdate = (
  _state: GlobalChatState,
  update: TypedNodeUpdate
): ReducerResult => {
  if (update.status === "completed") {
    return {
      update: {
        status: "connected",
        progress: { current: 0, total: 0 },
        statusMessage: null
      }
    };
  }
  return { update: { statusMessage: update.node_name || null } };
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
    const currentContent = typeof lastMessage.content === "string" ? lastMessage.content : "";
    const updatedMessage: Message = {
      ...lastMessage,
      content: currentContent + chunk.content
    };
    updatedMessages = [...messages.slice(0, -1), updatedMessage];
  } else {
    const localStreamId = `local-stream-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`;
    const message: Message = {
      id: localStreamId,
      role: "assistant",
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

  return {
    update: {
      ...baseUpdate,
      currentPlanningUpdate: null,
      currentTaskUpdate: null,
      currentTaskUpdateThreadId: null
    }
  };
};

const applyOutputUpdate = (
  state: GlobalChatState,
  update: TypedOutputUpdate
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
      const currentContent = typeof lastMessage.content === "string" ? lastMessage.content : "";
      const updatedMessage: Message = {
        ...lastMessage,
        content: currentContent + (update.value as string)
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

  if (update.output_type && ["image", "audio", "video"].includes(update.output_type)) {
    const message: Message = {
      role: "assistant",
      content: [
        makeMessageContent(
          update.output_type,
          ((update.value as { data: Uint8Array })?.data) as Uint8Array
        )
      ],
      name: "assistant"
    };
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
  update: TypedToolCallUpdate
): ReducerResult => {
  return {
    update: {
      statusMessage: update.message || null,
      currentRunningToolCallId: update.id || null,
      currentToolMessage: update.message || null
    }
  };
};

const applyMessage = (state: GlobalChatState, msg: Message): ReducerResult => {
  const threadId = msg.thread_id ?? state.currentThreadId;
  if (!threadId) return noopUpdate;
  const messages = state.messageCache[threadId] || [];

  // Handle agent_execution messages
  if (msg.role === "agent_execution") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyMsg = msg as any;
    const update: Partial<GlobalChatState> = {
      messageCache: {
        ...state.messageCache,
        [threadId]: [...messages, msg]
      },
      threads: state.threads[threadId]
        ? updateThreadTimestamp(threadId, state.threads)
        : state.threads
    };

    if (anyMsg.execution_event_type === "planning_update") {
      const content = anyMsg.content;
      if (content && typeof content === "object" && !Array.isArray(content)) {
        update.currentPlanningUpdate = content as PlanningUpdate;
      }
    } else if (anyMsg.execution_event_type === "task_update") {
      const content = anyMsg.content;
      if (content && typeof content === "object" && !Array.isArray(content)) {
        update.currentTaskUpdate = content as TaskUpdate;
        update.currentTaskUpdateThreadId = threadId;
      }
    }

    return { update };
  }

  // Handle assistant messages - merge with streaming content
  if (msg.role === "assistant") {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.role === "assistant" && lastMessage.id?.startsWith("local-stream-")) {
      // Replace the streaming placeholder with the final message
      return {
        update: {
          messageCache: {
            ...state.messageCache,
            [threadId]: [...messages.slice(0, -1), { ...lastMessage, ...msg }]
          },
          threads: updateThreadTimestamp(threadId, state.threads)
        }
      };
    }
  }

  // Handle tool messages
  if (msg.role === "tool") {
    return {
      update: {
        messageCache: {
          ...state.messageCache,
          [threadId]: [...messages, msg]
        },
        threads: state.threads[threadId]
          ? updateThreadTimestamp(threadId, state.threads)
          : state.threads,
        currentRunningToolCallId: null,
        currentToolMessage: null,
        statusMessage: null
      }
    };
  }

  // Default: append message
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
  progress: TypedNodeProgress
): ReducerResult => {
  return {
    update: {
      status: "loading",
      progress: { current: progress.progress, total: progress.total },
      statusMessage: null
    }
  };
};

const applyGenerationStopped = (): ReducerResult => ({
  update: {
    status: "connected",
    progress: { current: 0, total: 0 },
    statusMessage: null,
    currentPlanningUpdate: null,
    currentTaskUpdate: null,
    currentTaskUpdateThreadId: null
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
    applyReducer(applyJobUpdate, data as TypedJobUpdate);
  } else if (data.type === "node_update") {
    applyReducer(applyNodeUpdate, data as TypedNodeUpdate);
  } else if (data.type === "chunk") {
    applyReducer(applyChunk, data as Chunk);
  } else if (data.type === "output_update") {
    applyReducer(applyOutputUpdate, data as TypedOutputUpdate);
  } else if (data.type === "tool_call_update") {
    applyReducer(applyToolCallUpdate, data as TypedToolCallUpdate);
  } else if (data.type === "message") {
    applyReducer(applyMessage, data as TypedMessage);
  } else if (data.type === "node_progress") {
    applyReducer(applyNodeProgress, data as TypedNodeProgress);
  } else if (data.type === "tool_call") {
    // Handle browser tool execution
    const toolCallData = data as ToolCallMessage;
    const { tool_call_id, name, args, thread_id } = toolCallData;

    // Update UI immediately
    set({
      currentRunningToolCallId: tool_call_id,
      currentToolMessage: `Executing ${name}`,
      statusMessage: `Executing ${name}`
    });

    if (!BrowserToolRegistry.has(name)) {
      log.warn(`Unknown browser tool: ${name}`);
      currentState.wsManager?.send({
        type: "tool_result",
        tool_call_id,
        thread_id,
        ok: false,
        error: `Unsupported browser tool: ${name}`,
        result: { error: `Unsupported browser tool: ${name}` }
      });
      return;
    }

    // Check if tool requires user consent
    // Note: For now we log a warning but allow execution
    // TODO: Implement user consent dialog for sensitive tools
    if (BrowserToolRegistry.requiresConsent(name)) {
      log.warn(`Tool ${name} requires user consent - executing without confirmation`);
    }

    const startTime = Date.now();
    try {
      const result = await BrowserToolRegistry.call(
        name,
        args,
        tool_call_id,
        {}
      );

      const elapsedMs = Date.now() - startTime;
      currentState.wsManager?.send({
        type: "tool_result",
        tool_call_id,
        thread_id,
        ok: true,
        result,
        elapsed_ms: elapsedMs
      });

      // Clear UI state after successful execution
      set({
        currentRunningToolCallId: null,
        currentToolMessage: null,
        statusMessage: null
      });
    } catch (error) {
      const elapsedMs = Date.now() - startTime;
      const message = error instanceof Error ? error.message : "Unknown error";
      log.error(`Browser tool execution failed for ${name}:`, error);
      currentState.wsManager?.send({
        type: "tool_result",
        tool_call_id,
        thread_id,
        ok: false,
        error: message,
        result: { error: message },
        elapsed_ms: elapsedMs
      });

      // Clear UI state after failed execution
      set({
        currentRunningToolCallId: null,
        currentToolMessage: null,
        statusMessage: null
      });
    }
  } else if (data.type === "generation_stopped") {
    applyReducer(
      () => applyGenerationStopped(),
      data as GenerationStoppedUpdate
    );
    const stoppedData = data as GenerationStoppedUpdate;
    log.info("Generation stopped:", stoppedData.message);
  } else if (data.type === "error") {
    const errorData = data as TypedError;
    applyReducer(
      () => applyError(errorData.message || "Unknown error"),
      errorData
    );
  }
}
