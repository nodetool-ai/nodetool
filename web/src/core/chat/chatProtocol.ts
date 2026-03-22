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

/**
 * Chunk deduplication cache to prevent duplicate chunks from being processed
 * multiple times due to duplicate WebSocket handlers or message routing.
 * Tracks last processed chunk per thread with a short TTL for cleanup.
 */
const chunkDeduplicationCache = new Map<
  string, // threadId
  { content: string; timestamp: number; messageLength: number }
>();
const CHUNK_DEDUP_TTL_MS = 100; // Short TTL - chunks should arrive in quick succession

/**
 * Check if a chunk is a duplicate of the last processed chunk for a thread.
 * Also cleans up stale cache entries.
 */
function isChunkDuplicate(
  threadId: string,
  chunkContent: string,
  currentMessageLength: number
): boolean {
  const now = Date.now();
  const cached = chunkDeduplicationCache.get(threadId);

  // Clean up stale entry
  if (cached && now - cached.timestamp > CHUNK_DEDUP_TTL_MS) {
    chunkDeduplicationCache.delete(threadId);
    return false;
  }

  // Check for duplicate: same content AND same message length (position)
  if (
    cached &&
    cached.content === chunkContent &&
    cached.messageLength === currentMessageLength
  ) {
    log.debug(
      `Chunk dedup: Skipping duplicate chunk for thread ${threadId}: "${chunkContent.substring(0, 50)}..."`
    );
    return true;
  }

  return false;
}

/**
 * Record a processed chunk in the deduplication cache.
 */
function recordProcessedChunk(
  threadId: string,
  chunkContent: string,
  newMessageLength: number
): void {
  chunkDeduplicationCache.set(threadId, {
    content: chunkContent,
    timestamp: Date.now(),
    messageLength: newMessageLength
  });
}

/**
 * Clear the deduplication cache for a thread (e.g., when streaming ends).
 */
function clearChunkCache(threadId: string): void {
  chunkDeduplicationCache.delete(threadId);
}

import {
  Chunk,
  EdgeUpdate,
  ErrorMessage,
  JobUpdate,
  Message,
  MessageContent,
  MessageTextContent,
  NodeProgress,
  NodeUpdate,
  OutputUpdate,
  LogUpdate,
  PlanningUpdate,
  Prediction,
  StepResult,
  TaskUpdate,
  ToolCallUpdate
} from "../../stores/ApiTypes";
import {
  FrontendToolRegistry,
  FrontendToolState
} from "../../lib/tools/frontendTools";
import type {
  GlobalChatState,
  StepToolCall
} from "../../stores/GlobalChatStore";
import { globalWebSocketManager } from "../../lib/websocket/GlobalWebSocketManager";
import useResultsStore from "../../stores/ResultsStore";
import useStatusStore from "../../stores/StatusStore";
import type { Graph } from "../../stores/ApiTypes";

export interface WorkflowCreatedUpdate {
  type: "workflow_created";
  workflow_id: string;
  graph: Graph;
}

export interface WorkflowUpdatedUpdate {
  type: "workflow_updated";
  workflow_id: string;
  graph: Graph;
}

export interface GenerationStoppedUpdate {
  type: "generation_stopped";
  message: string;
}

export interface ToolCallMessage {
  type: "tool_call";
  tool_call_id: string;
  name: string;
  args: Record<string, unknown>;
  thread_id: string;
}

export type MsgpackData =
  | JobUpdate
  | Chunk
  | Prediction
  | NodeProgress
  | NodeUpdate
  | EdgeUpdate
  | Message
  | ToolCallUpdate
  | TaskUpdate
  | PlanningUpdate
  | OutputUpdate
  | StepResult
  | WorkflowCreatedUpdate
  | GenerationStoppedUpdate
  | ToolCallMessage
  | ToolResultMessage
  | ErrorMessage;

export interface ToolResultMessage {
  type: "tool_result";
  tool_call_id: string;
  result: unknown;
  ok: boolean;
}

const makeMessageContent = (type: string, data: Uint8Array): MessageContent => {
  let mimeType = "application/octet-stream";
  if (type === "image") {
    mimeType = "image/png";
  } else if (type === "audio") {
    mimeType = "audio/mp3";
  } else if (type === "video") {
    mimeType = "video/mp4";
  }

  const arrayBuffer = data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength
  ) as ArrayBuffer;
  const dataUri = URL.createObjectURL(
    new Blob([arrayBuffer], { type: mimeType })
  );

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

const generateTitleFromFirstUserMessage = (
  threadId: string,
  state: GlobalChatState
): string | null => {
  const thread = state.threads[threadId];
  if (!thread) {
    return null;
  }
  if (thread.title) {
    return null;
  }

  const messages = state.messageCache[threadId] || [];
  const firstUserMessage = messages.find((msg) => msg.role === "user");
  if (!firstUserMessage) {
    return null;
  }

  let contentText = "";
  if (typeof firstUserMessage.content === "string") {
    contentText = firstUserMessage.content;
  } else if (Array.isArray(firstUserMessage.content)) {
    const firstText = firstUserMessage.content.find(
      (c) => c?.type === "text" && typeof c.text === "string"
    );
    contentText = (firstText as MessageTextContent | undefined)?.text || "";
  }

  const titleBase = contentText || "New conversation";
  return titleBase.substring(0, 50) + (titleBase.length > 50 ? "..." : "");
};

const applyJobUpdate = (
  state: GlobalChatState,
  update: JobUpdate
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
  if (update.status === "failed" || update.status === "error") {
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

const applyEdgeUpdate = (
  state: GlobalChatState,
  update: EdgeUpdate
): ReducerResult => {
  // EdgeUpdate already has workflow_id in its type definition
  const workflowId = "workflow_id" in update
    ? (update as EdgeUpdate & { workflow_id?: string }).workflow_id
    : undefined;
  const effectiveWorkflowId = workflowId ?? state.threadWorkflowId[state.currentThreadId ?? ""];
  if (effectiveWorkflowId) {
    useResultsStore
      .getState()
      .setEdge(
        effectiveWorkflowId,
        update.edge_id,
        update.status,
        update.counter ?? undefined
      );
  }
  return noopUpdate;
};

const applyNodeUpdate = (
  state: GlobalChatState,
  update: NodeUpdate
): ReducerResult => {
  // NodeUpdate may have workflow_id as an optional field
  const workflowId = "workflow_id" in update
    ? (update as NodeUpdate & { workflow_id?: string }).workflow_id
    : undefined;
  const effectiveWorkflowId = workflowId ?? state.threadWorkflowId[state.currentThreadId ?? ""];

  if (effectiveWorkflowId) {
    // Sync with ResultsStore
    // If running, we might want to clear previous error or result?
    // For now, allow multiple updates.

    // Sync status
    useStatusStore
      .getState()
      .setStatus(effectiveWorkflowId, update.node_id, update.status);

    if (update.result) {
      useResultsStore
        .getState()
        .setResult(effectiveWorkflowId, update.node_id, update.result);
    }
  }

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
  if (!threadId) {
    log.warn("applyChunk: No currentThreadId, dropping chunk");
    return noopUpdate;
  }

  const thread = state.threads[threadId];
  if (!thread) {
    log.warn(`applyChunk: Thread ${threadId} not found, dropping chunk`);
    return noopUpdate;
  }

  const messages = state.messageCache[threadId] || [];
  const lastMessage = messages[messages.length - 1];

  // Get current message length for deduplication check
  const currentMessageLength =
    lastMessage && lastMessage.role === "assistant"
      ? String(lastMessage.content || "").length
      : 0;

  // Check for duplicate chunk (can happen with multiple WebSocket handlers)
  if (isChunkDuplicate(threadId, chunk.content, currentMessageLength)) {
    // Still update status if this is the final chunk
    if (chunk.done) {
      clearChunkCache(threadId);
      return {
        update: {
          status: "connected",
          currentPlanningUpdate: null,
          currentTaskUpdate: null,
          currentTaskUpdateThreadId: null,
          currentLogUpdate: null
        }
      };
    }
    return noopUpdate;
  }

  let updatedMessages: Message[];
  let newMessageLength: number;

  if (lastMessage && lastMessage.role === "assistant") {
    const newContent = (lastMessage.content || "") + chunk.content;
    newMessageLength = newContent.length;
    const updatedMessage: Message = {
      ...lastMessage,
      content: newContent
    };
    updatedMessages = [...messages.slice(0, -1), updatedMessage];
  } else {
    const localStreamId = `local-stream-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`;
    newMessageLength = chunk.content.length;
    const message: Message = {
      id: localStreamId,
      role: "assistant",
      type: "message",
      content: chunk.content
    };
    updatedMessages = [...messages, message];
  }

  // Record this chunk as processed for deduplication
  recordProcessedChunk(threadId, chunk.content, newMessageLength);

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

  // Clear deduplication cache when streaming ends
  clearChunkCache(threadId);

  const postAction = (get: ChatStateGetter) => {
    const { selectedModel, summarizeThread, updateThreadTitle } = get();
    const messagesAfterUpdate = get().messageCache[threadId] || [];
    if (messagesAfterUpdate.length === 2) {
      log.debug("Triggering thread summarization for thread:", threadId);
    }

    const assistantMessages = messagesAfterUpdate.filter(
      (msg) => msg.role === "assistant"
    );
    if (assistantMessages.length === 1 && !get().threads[threadId]?.title) {
      const newTitle = generateTitleFromFirstUserMessage(threadId, get());
      if (newTitle) {
        updateThreadTitle(threadId, newTitle);
      }
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
      currentTaskUpdate: null,
      currentTaskUpdateThreadId: null,
      currentLogUpdate: null
    },
    postAction
  };
};

const applyOutputUpdate = (
  state: GlobalChatState,
  update: OutputUpdate
): ReducerResult => {
  const threadId = state.currentThreadId;
  if (!threadId) {
    return noopUpdate;
  }

  const thread = state.threads[threadId];
  if (!thread) {
    return noopUpdate;
  }

  // OutputUpdate may have workflow_id as an optional field
  const workflowId = "workflow_id" in update
    ? (update as OutputUpdate & { workflow_id?: string }).workflow_id
    : undefined;
  const effectiveWorkflowId = workflowId ?? state.threadWorkflowId[threadId];
  if (effectiveWorkflowId) {
    useResultsStore
      .getState()
      .setOutputResult(
        effectiveWorkflowId,
        update.node_id,
        update.value,
        true // append
      );
  }

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

type ToolCallUpdateWithMeta = ToolCallUpdate & {
  tool_call_id?: string | number | null;
  step_id?: string | null;
  agent_execution_id?: string | null;
};

const applyToolCallUpdate = (
  state: GlobalChatState,
  update: ToolCallUpdate
): ReducerResult => {
  const updateWithMeta = update as ToolCallUpdateWithMeta;
  const toolCallId =
    updateWithMeta.tool_call_id != null
      ? String(updateWithMeta.tool_call_id)
      : null;
  const agentExecutionId = updateWithMeta.agent_execution_id ?? null;
  const stepId = updateWithMeta.step_id ?? null;

  let agentExecutionToolCalls:
    | GlobalChatState["agentExecutionToolCalls"]
    | undefined;

  if (toolCallId && agentExecutionId && stepId) {
    const existingExecution =
      state.agentExecutionToolCalls[agentExecutionId] || {};
    const existingCalls = existingExecution[stepId] || [];
    const existingIndex = existingCalls.findIndex(
      (call) => call.id === toolCallId
    );
    const nextCall: StepToolCall = {
      id: toolCallId,
      name: update.name || "Tool",
      args: update.args ?? null,
      message: update.message ?? null,
      startedAt:
        existingIndex >= 0 ? existingCalls[existingIndex].startedAt : Date.now()
    };
    const nextCalls =
      existingIndex >= 0
        ? existingCalls.map((call, index) =>
            index === existingIndex ? { ...call, ...nextCall } : call
          )
        : [...existingCalls, nextCall];

    agentExecutionToolCalls = {
      ...state.agentExecutionToolCalls,
      [agentExecutionId]: {
        ...existingExecution,
        [stepId]: nextCalls
      }
    };
  }

  return {
    update: {
      statusMessage: update.message,
      currentRunningToolCallId: toolCallId || null,
      currentToolMessage: update.message || null,
      ...(agentExecutionToolCalls ? { agentExecutionToolCalls } : {})
    }
  };
};

const applyAgentExecutionMessage = (
  state: GlobalChatState,
  threadId: string,
  messages: Message[],
  msg: Message
): ReducerResult => {
  const update: Partial<GlobalChatState> = {
    messageCache: {
      ...state.messageCache,
      [threadId]: [...messages, msg]
    },
    threads: state.threads[threadId]
      ? updateThreadTimestamp(threadId, state.threads)
      : state.threads
  };

  // Debug logging for agent execution messages
  // These properties exist on agent_execution messages but aren't in the base Message type
  const agentMsg = msg as Message & {
    execution_event_type?: string;
  };
  log.debug("applyAgentExecutionMessage:", {
    execution_event_type: agentMsg.execution_event_type,
    content_type: typeof agentMsg.content,
    content_is_array: Array.isArray(agentMsg.content),
    has_content: !!agentMsg.content
  });

  if (agentMsg.execution_event_type === "planning_update") {
    const content = agentMsg.content;
    log.debug("PlanningUpdate content:", content);
    if (content && typeof content === "object" && !Array.isArray(content)) {
      update.currentPlanningUpdate = content as PlanningUpdate;
      log.info("Set currentPlanningUpdate:", content);
    } else {
      log.warn("PlanningUpdate content is invalid:", content);
    }
  } else if (agentMsg.execution_event_type === "task_update") {
    const content = agentMsg.content;
    if (content && typeof content === "object" && !Array.isArray(content)) {
      update.currentTaskUpdate = content as TaskUpdate;
      update.currentTaskUpdateThreadId = threadId;
      update.lastTaskUpdatesByThread = {
        ...state.lastTaskUpdatesByThread,
        [threadId]: content as TaskUpdate
      };
    }
  } else if (agentMsg.execution_event_type === "log_update") {
    const content = agentMsg.content;
    if (content && typeof content === "object" && !Array.isArray(content)) {
      update.currentLogUpdate = content as LogUpdate;
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
    threads: state.threads[threadId]
      ? updateThreadTimestamp(threadId, state.threads)
      : state.threads,
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
  const normalizeTextForComparison = (text: string) =>
    text.replace(/\r\n/g, "\n").replace(/\s+$/g, "");

  const extractTextContent = (message: Message): string => {
    if (typeof message.content === "string") {
      return message.content;
    }
    if (Array.isArray(message.content)) {
      return message.content
        .map((c) => (c?.type === "text" ? (c as MessageTextContent).text : ""))
        .join("");
    }
    return "";
  };

  const incomingText =
    typeof msg.content === "string"
      ? msg.content
      : Array.isArray(msg.content)
      ? msg.content.map((c) => (c?.type === "text" ? (c as MessageTextContent).text : "")).join("")
      : "";
  const incomingNormalized = normalizeTextForComparison(incomingText);

  const findStreamPlaceholderIndex = (): number => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const candidate = messages[i];
      if (candidate?.role !== "assistant") {continue;}
      // Messages may have an optional type field that isn't in the base type
      const candidateWithType = candidate as Message & { type?: string };
      if (candidateWithType.type !== "message") {continue;}

      const candidateId = candidate.id ?? null;
      const isLocalStream =
        typeof candidateId === "string" &&
        candidateId.startsWith("local-stream-");
      const isServerAuthored =
        !!candidate.created_at || (!!candidateId && !isLocalStream);

      if (isServerAuthored) {
        continue;
      }

      const candidateText = extractTextContent(candidate);
      const candidateNormalized = normalizeTextForComparison(candidateText);
      if (!candidateNormalized || !incomingNormalized) {
        continue;
      }

      if (
        candidateNormalized === incomingNormalized ||
        incomingNormalized.startsWith(candidateNormalized) ||
        candidateNormalized.startsWith(incomingNormalized)
      ) {
        return i;
      }

      // If we were streaming and the most recent assistant message looks local,
      // prefer replacing it even if trailing whitespace differs.
      if (
        i === messages.length - 1 &&
        (state.status === "streaming" || isLocalStream) &&
        candidateText &&
        incomingText
      ) {
        const candidateTrimmed = candidateText.trimEnd();
        const incomingTrimmed = incomingText.trimEnd();
        if (
          candidateTrimmed === incomingTrimmed ||
          incomingTrimmed.startsWith(candidateTrimmed)
        ) {
          return i;
        }
      }
    }
    return -1;
  };

  const streamPlaceholderIndex = findStreamPlaceholderIndex();

  const isNewAssistantMessage =
    streamPlaceholderIndex < 0 &&
    (messages.length === 0 ||
      messages[messages.length - 1]?.role !== "assistant");

  const updatedMessages = (() => {
    if (streamPlaceholderIndex >= 0) {
      const existing = messages[streamPlaceholderIndex];
      const replacement: Message = {
        ...existing,
        ...msg,
        content: msg.content ?? existing.content
      };
      return [
        ...messages.slice(0, streamPlaceholderIndex),
        replacement,
        ...messages.slice(streamPlaceholderIndex + 1)
      ];
    }

    const currentLast = messages[messages.length - 1];
    if (currentLast?.role === "assistant") {
      const currentLastNormalized = normalizeTextForComparison(
        extractTextContent(currentLast)
      );
      if (
        currentLastNormalized &&
        currentLastNormalized === incomingNormalized
      ) {
        return messages;
      }
    }

    return [...messages, msg];
  })();

  const postAction = isNewAssistantMessage
    ? (get: ChatStateGetter) => {
        const { updateThreadTitle } = get();
        if (!get().threads[threadId]?.title) {
          const newTitle = generateTitleFromFirstUserMessage(threadId, get());
          if (newTitle) {
            updateThreadTitle(threadId, newTitle);
          }
        }
      }
    : undefined;

  return {
    update: {
      messageCache: {
        ...state.messageCache,
        [threadId]: updatedMessages
      },
      threads: state.threads[threadId]
        ? updateThreadTimestamp(threadId, state.threads)
        : state.threads
    },
    postAction
  };
};

const applyMessage = (state: GlobalChatState, msg: Message): ReducerResult => {
  const threadId = msg.thread_id ?? state.currentThreadId;
  if (!threadId) {
    return noopUpdate;
  }
  const messages = state.messageCache[threadId] || [];

  if (msg.role === "agent_execution") {
    return applyAgentExecutionMessage(state, threadId, messages, msg);
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
  state: GlobalChatState,
  progress: NodeProgress
): ReducerResult => {
  // NodeProgress may have workflow_id as an optional field
  const workflowId = "workflow_id" in progress
    ? (progress as NodeProgress & { workflow_id?: string }).workflow_id
    : undefined;
  const effectiveWorkflowId = workflowId ?? state.threadWorkflowId[state.currentThreadId ?? ""];
  if (effectiveWorkflowId) {
    useResultsStore
      .getState()
      .setProgress(
        effectiveWorkflowId,
        progress.node_id,
        progress.progress,
        progress.total
      );
  }

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
    currentTaskUpdateThreadId: null,
    currentLogUpdate: null
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
    const jobUpdate = data as JobUpdate;
    // Clear timeout on terminal job states
    if (
      jobUpdate.status === "completed" ||
      jobUpdate.status === "failed" ||
      jobUpdate.status === "cancelled"
    ) {
      const timeoutId = get().sendMessageTimeoutId;
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        set({ sendMessageTimeoutId: null });
      }
    }
    applyReducer(applyJobUpdate, jobUpdate);
  } else if (data.type === "node_update") {
    applyReducer(applyNodeUpdate, data as NodeUpdate);
  } else if (data.type === "edge_update") {
    applyReducer(applyEdgeUpdate, data as EdgeUpdate);
  } else if (data.type === "chunk") {
    const chunk = data as Chunk;
    if (chunk.done) {
      log.info("Received final chunk (done=true), clearing timeout");
      // Clear the safety timeout when generation completes
      const timeoutId = get().sendMessageTimeoutId;
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        set({ sendMessageTimeoutId: null });
      }
    }
    applyReducer(applyChunk, chunk);
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

    // Update UI immediately; server-side ToolCallUpdate may arrive later (or not at all for UI tools).
    set({
      currentRunningToolCallId: tool_call_id,
      currentToolMessage: `Executing ${name}`,
      statusMessage: `Executing ${name}`
    });

    if (!FrontendToolRegistry.has(name)) {
      log.warn(`Unknown tool: ${name}`);
      try {
        await globalWebSocketManager.send({
          type: "tool_result",
          tool_call_id,
          thread_id,
          ok: false,
          error: `Unsupported tool: ${name}`,
          result: { error: `Unsupported tool: ${name}` }
        });
      } catch (error) {
        log.error("Failed to send tool_result for unknown tool:", error);
      }
      return;
    }

    const startTime = Date.now();
    try {
      const threadWorkflowId =
        get().threadWorkflowId?.[thread_id] ?? get().workflowId ?? null;
      if (threadWorkflowId) {
        try {
          await get().frontendToolState.fetchWorkflow(threadWorkflowId);
        } catch (e) {
          log.warn("Failed to fetch workflow for tool call:", e);
        }
      }

      const effectiveArgs =
        threadWorkflowId === null || threadWorkflowId === undefined
          ? args
          : {
              ...(args ?? {}),
              workflow_id: threadWorkflowId,
              w: threadWorkflowId
            };

      const result = await FrontendToolRegistry.call(
        name,
        effectiveArgs,
        tool_call_id,
        {
          getState: () =>
            ({
              ...(get().frontendToolState as FrontendToolState),
              currentWorkflowId:
                threadWorkflowId ?? get().frontendToolState.currentWorkflowId
            }) as FrontendToolState
        }
      );

      const elapsedMs = Date.now() - startTime;
      try {
        await globalWebSocketManager.send({
          type: "tool_result",
          tool_call_id,
          thread_id,
          ok: true,
          result,
          elapsed_ms: elapsedMs
        });
      } catch (error) {
        log.error("Failed to send tool_result:", error);
      }
    } catch (error) {
      const elapsedMs = Date.now() - startTime;
      const message = error instanceof Error ? error.message : "Unknown error";
      log.error(`Tool execution failed for ${name}:`, error);
      try {
        await globalWebSocketManager.send({
          type: "tool_result",
          tool_call_id,
          thread_id,
          ok: false,
          error: message,
          result: { error: message },
          elapsed_ms: elapsedMs
        });
      } catch (sendError) {
        log.error("Failed to send tool_result after error:", sendError);
      }
    }
  } else if (data.type === "generation_stopped") {
    // Clear the safety timeout when generation is stopped
    const timeoutId = get().sendMessageTimeoutId;
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      set({ sendMessageTimeoutId: null });
    }
    applyReducer(
      (_state) => applyGenerationStopped(),
      data as GenerationStoppedUpdate
    );
    const stoppedData = data as GenerationStoppedUpdate;
    log.info("Generation stopped:", stoppedData.message);
  } else if (data.type === "error") {
    const errorData = data as ErrorMessage;
    // Clear the safety timeout on error
    const timeoutId = get().sendMessageTimeoutId;
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      set({ sendMessageTimeoutId: null });
    }
    applyReducer((_state) => applyError(errorData.message), errorData);
  }
}
