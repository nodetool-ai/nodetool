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

import { visibleToolArgs } from "./toolCallFields";

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
    console.debug(
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
  TodoUpdate,
  ToolCallUpdate
} from "../../stores/ApiTypes";
import { FrontendToolRegistry } from "../../lib/tools/frontendTools";
import { getFrontendToolRuntimeState } from "../../lib/tools/frontendToolRuntimeState";
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

/**
 * Server → client request to approve a gated tool call. Routed to the
 * GlobalChatStore as a pending approval; the user resolves it via the inline
 * ToolApprovalCard, which sends a `tool_approval_response` back.
 */
export interface ToolApprovalRequestMessage {
  type: "tool_approval_request";
  thread_id: string;
  approval_id: string;
  tool_name: string;
  category: "write" | "execute" | "external";
  message: string;
  args: Record<string, unknown>;
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
  | TodoUpdate
  | PlanningUpdate
  | OutputUpdate
  | StepResult
  | WorkflowCreatedUpdate
  | WorkflowUpdatedUpdate
  | GenerationStoppedUpdate
  | ToolCallMessage
  | ToolResultMessage
  | ToolApprovalRequestMessage
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
      type: "image_url" as const,
      image: { type: "image" as const, uri: dataUri }
    };
  } else if (type === "audio") {
    return {
      type: "audio" as const,
      audio: { type: "audio" as const, uri: dataUri }
    };
  } else if (type === "video") {
    return {
      type: "video" as const,
      video: { type: "video" as const, uri: dataUri }
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
      (c): c is MessageTextContent => c?.type === "text" && typeof c.text === "string"
    );
    contentText = firstText?.text || "";
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
  const workflowId = update.workflow_id ?? undefined;
  const effectiveWorkflowId = workflowId ?? state.threadWorkflowId[state.currentThreadId ?? ""];
  // Edges are scoped by the producing run's job_id so concurrent same-workflow
  // runs stay isolated. Skip the write if job_id is absent.
  const jobId = (update as { job_id?: string | null }).job_id ?? undefined;
  if (effectiveWorkflowId && jobId) {
    useResultsStore
      .getState()
      .setEdge(
        effectiveWorkflowId,
        jobId,
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
  const workflowId = update.workflow_id ?? undefined;
  const effectiveWorkflowId = workflowId ?? state.threadWorkflowId[state.currentThreadId ?? ""];

  if (effectiveWorkflowId) {
    // Sync with ResultsStore
    // If running, we might want to clear previous error or result?
    // For now, allow multiple updates.

    // Sync status, scoped by the producing run's job_id so concurrent
    // same-workflow runs stay isolated. Skip the write if job_id is absent.
    const jobId = (update as { job_id?: string | null }).job_id ?? undefined;
    if (jobId) {
      useStatusStore
        .getState()
        .setStatus(effectiveWorkflowId, jobId, update.node_id, update.status);
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
  const threadId = chunk.thread_id ?? state.currentThreadId;
  if (!threadId) {
    console.warn("applyChunk: No thread_id or currentThreadId, dropping chunk");
    return noopUpdate;
  }

  const thread = state.threads[threadId];
  if (!thread) {
    console.warn(`applyChunk: Thread ${threadId} not found, dropping chunk`);
    return noopUpdate;
  }

  const messages = state.messageCache[threadId] || [];
  const lastMessage = messages[messages.length - 1];

  // Audio chunks carry binary payloads (native Float32Array or base64);
  // only text contributes to the assistant message stream.
  const chunkText = typeof chunk.content === "string" ? chunk.content : "";

  // Get current message length for deduplication check
  const currentMessageLength =
    lastMessage && lastMessage.role === "assistant"
      ? String(lastMessage.content || "").length
      : 0;

  // Check for duplicate chunk (can happen with multiple WebSocket handlers)
  if (isChunkDuplicate(threadId, chunkText, currentMessageLength)) {
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
    const newContent = (lastMessage.content || "") + chunkText;
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
    newMessageLength = chunkText.length;
    const message: Message = {
      id: localStreamId,
      role: "assistant",
      type: "message",
      content: chunkText
    };
    updatedMessages = [...messages, message];
  }

  // Record this chunk as processed for deduplication
  recordProcessedChunk(threadId, chunkText, newMessageLength);

  // Preserve statusMessage during media generation (it's set from
  // content_metadata.media_generation in the chunk handler above).
  // Only clear it when the stream finishes (done=true) or when the
  // chunk carries actual text content (regular LLM streaming).
  const keepStatusMessage =
    !chunk.done && !chunk.content && state.statusMessage;

  const baseUpdate: Partial<GlobalChatState> = {
    status: chunk.done ? "connected" : "streaming",
    statusMessage: keepStatusMessage ? state.statusMessage : null,
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
      console.debug("Triggering thread summarization for thread:", threadId);
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

  const workflowId = update.workflow_id ?? undefined;
  const effectiveWorkflowId = workflowId ?? state.threadWorkflowId[threadId];
  // Output results are scoped by the producing run's job_id so concurrent
  // same-workflow runs stay isolated. Skip the write if job_id is absent.
  const jobId = (update as { job_id?: string | null }).job_id ?? undefined;
  if (effectiveWorkflowId && jobId) {
    useResultsStore
      .getState()
      .setOutputResult(
        effectiveWorkflowId,
        jobId,
        update.node_id,
        update.value,
        true // append
      );
  }

  if (update.output_type === "string" && typeof update.value === "string") {
    const messages = state.messageCache[threadId] || [];
    const lastMessage = messages[messages.length - 1];

    if (lastMessage && lastMessage.role === "assistant") {
      if (update.value === "<nodetool_end_of_stream>") {
        return noopUpdate;
      }
      const updatedMessage: Message = {
        ...lastMessage,
        content: lastMessage.content + update.value
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
      content: update.value
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
  state: GlobalChatState,
  update: ToolCallUpdate
): ReducerResult => {
  const toolCallId =
    update.tool_call_id != null
      ? String(update.tool_call_id)
      : null;
  const agentExecutionId = update.agent_execution_id ?? null;
  const stepId = update.step_id ?? null;

  // The LLM-authored status lives in args._message and is mirrored onto
  // `update.message`. Strip it from the args we display so the user doesn't
  // see the status field duplicated under "Arguments".
  const displayArgs = visibleToolArgs(update.args);

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
      args: displayArgs ?? null,
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

interface AgentExecutionMessage extends Message {
  execution_event_type?: string;
}

function isAgentExecutionMessage(msg: Message): msg is AgentExecutionMessage {
  return msg.role === "agent_execution";
}

function isPlanningUpdateContent(content: unknown): content is PlanningUpdate {
  return (
    typeof content === "object" &&
    content !== null &&
    !Array.isArray(content) &&
    "type" in content &&
    content.type === "planning_update"
  );
}

function isTaskUpdateContent(content: unknown): content is TaskUpdate {
  return (
    typeof content === "object" &&
    content !== null &&
    !Array.isArray(content) &&
    "type" in content &&
    content.type === "task_update"
  );
}

function isLogUpdateContent(content: unknown): content is LogUpdate {
  return (
    typeof content === "object" &&
    content !== null &&
    !Array.isArray(content) &&
    "type" in content &&
    content.type === "log_update"
  );
}

const applyAgentExecutionMessage = (
  state: GlobalChatState,
  threadId: string,
  messages: Message[],
  msg: AgentExecutionMessage
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

  console.debug("applyAgentExecutionMessage:", {
    execution_event_type: msg.execution_event_type,
    content_type: typeof msg.content,
    content_is_array: Array.isArray(msg.content),
    has_content: !!msg.content
  });

  const content = msg.content;

  if (msg.execution_event_type === "planning_update") {
    console.debug("PlanningUpdate content:", content);
    if (isPlanningUpdateContent(content)) {
      update.currentPlanningUpdate = content;
      console.info("Set currentPlanningUpdate:", content);
    } else {
      console.warn("PlanningUpdate content is invalid:", content);
    }
  } else if (msg.execution_event_type === "task_update") {
    if (isTaskUpdateContent(content)) {
      update.currentTaskUpdate = content;
      update.currentTaskUpdateThreadId = threadId;
      update.lastTaskUpdatesByThread = {
        ...state.lastTaskUpdatesByThread,
        [threadId]: content
      };
    }
  } else if (msg.execution_event_type === "log_update") {
    if (isLogUpdateContent(content)) {
      update.currentLogUpdate = content;
    }
  }

  return { update };
};

const normalizeTextForComparison = (text: string) =>
  text.replace(/\r\n/g, "\n").replace(/\s+$/g, "");

const extractTextContent = (message: Message): string => {
  if (typeof message.content === "string") {
    return message.content;
  }
  if (Array.isArray(message.content)) {
    return message.content
      .map((c) => (c.type === "text" ? c.text : ""))
      .join("");
  }
  return "";
};

/**
 * Locate the trailing local streaming placeholder (the `local-stream-*`
 * assistant message that applyChunk builds from streamed text) that an incoming
 * server-authored assistant message should replace rather than sit beside.
 *
 * The server re-sends the streamed text as a finalized assistant message — both
 * when it completes a plain reply and when it attaches tool_calls. Without this
 * reconciliation the placeholder and the finalized message both render, so the
 * same text appears twice. Returns -1 when the incoming message is genuinely new.
 */
const findStreamPlaceholderIndex = (
  messages: Message[],
  msg: Message,
  status: GlobalChatState["status"]
): number => {
  const incomingText = extractTextContent(msg);
  const incomingNormalized = normalizeTextForComparison(incomingText);

  for (let i = messages.length - 1; i >= 0; i--) {
    const candidate = messages[i];
    if (candidate?.role !== "assistant") {
      continue;
    }
    if (candidate.type !== "message") {
      continue;
    }

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
      (status === "streaming" || isLocalStream) &&
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

/**
 * Replace the message at `index` with the incoming server message (merging so
 * server fields like id/created_at/tool_calls win while keeping content when the
 * server omits it), or append when no placeholder matched.
 */
const replaceStreamPlaceholderOrAppend = (
  messages: Message[],
  index: number,
  msg: Message
): Message[] => {
  if (index < 0) {
    return [...messages, msg];
  }
  const existing = messages[index];
  const replacement: Message = {
    ...existing,
    ...msg,
    content: msg.content ?? existing.content
  };
  return [
    ...messages.slice(0, index),
    replacement,
    ...messages.slice(index + 1)
  ];
};

const applyToolMessage = (
  state: GlobalChatState,
  threadId: string,
  messages: Message[],
  msg: Message
) => {
  // An assistant message carrying tool_calls finalizes the text the server just
  // streamed, so replace the streaming placeholder instead of appending a second
  // copy. Plain tool-result messages (role === "tool") never have a placeholder
  // and are always appended.
  const placeholderIndex =
    msg.role === "assistant"
      ? findStreamPlaceholderIndex(messages, msg, state.status)
      : -1;
  const updatedMessages = replaceStreamPlaceholderOrAppend(
    messages,
    placeholderIndex,
    msg
  );
  return {
    update: {
      messageCache: {
        ...state.messageCache,
        [threadId]: updatedMessages
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
  };
};

const applyAssistantMessage = (
  state: GlobalChatState,
  threadId: string,
  messages: Message[],
  msg: Message
) => {
  const isCurrentThreadMessage = threadId === state.currentThreadId;
  const shouldResetStatusOnAssistantMessage =
    isCurrentThreadMessage &&
    (state.status === "loading" ||
      state.status === "streaming" ||
      state.status === "stopping");

  const incomingNormalized = normalizeTextForComparison(
    extractTextContent(msg)
  );

  const streamPlaceholderIndex = findStreamPlaceholderIndex(
    messages,
    msg,
    state.status
  );

  const isNewAssistantMessage =
    streamPlaceholderIndex < 0 &&
    (messages.length === 0 ||
      messages[messages.length - 1]?.role !== "assistant");

  const updatedMessages = (() => {
    if (streamPlaceholderIndex >= 0) {
      return replaceStreamPlaceholderOrAppend(
        messages,
        streamPlaceholderIndex,
        msg
      );
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
        : state.threads,
      ...(shouldResetStatusOnAssistantMessage
        ? {
            status: "connected" as const,
            progress: { current: 0, total: 0 },
            statusMessage: null,
            currentPlanningUpdate: null,
            currentTaskUpdate: null,
            currentTaskUpdateThreadId: null,
            currentLogUpdate: null
          }
        : {})
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

  if (isAgentExecutionMessage(msg)) {
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
  const workflowId = progress.workflow_id ?? undefined;
  const effectiveWorkflowId = workflowId ?? state.threadWorkflowId[state.currentThreadId ?? ""];
  // Progress is scoped by the producing run's job_id so concurrent same-workflow
  // runs stay isolated. Skip the write if job_id is absent.
  const jobId = (progress as { job_id?: string | null }).job_id ?? undefined;
  if (effectiveWorkflowId && jobId) {
    useResultsStore
      .getState()
      .setProgress(
        effectiveWorkflowId,
        jobId,
        progress.node_id,
        progress.progress,
        progress.total
      );
  }

  // Keep the existing statusMessage for heartbeat ticks (empty chunk, total=0)
  // so the "Generating image…" label set from the chunk metadata stays visible.
  const statusMessage =
    progress.chunk
      ? progress.chunk
      : state.statusMessage;
  return {
    update: {
      status: "loading",
      progress: { current: progress.progress, total: progress.total },
      statusMessage
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

async function executeToolCall(
  toolCallData: ToolCallMessage,
  get: ChatStateGetter,
  set: ChatStateSetter,
  wsManager: typeof globalWebSocketManager
): Promise<void> {
  const { tool_call_id, name, args, thread_id } = toolCallData;

  // Update UI immediately
  set({
    currentRunningToolCallId: tool_call_id,
    currentToolMessage: `Executing ${name}`,
    statusMessage: `Executing ${name}`
  });

  if (!FrontendToolRegistry.has(name)) {
    console.warn(`Unknown tool: ${name}`);
    try {
      await wsManager.send({
        type: "tool_result",
        tool_call_id,
        thread_id,
        ok: false,
        error: `Unsupported tool: ${name}`,
        result: { error: `Unsupported tool: ${name}` }
      });
    } catch (error) {
      console.error("Failed to send tool_result for unknown tool:", error);
    }
    return;
  }

  const startTime = Date.now();
  try {
    // Resolve the canonical frontend-tool runtime state lazily — the same
    // source the agent (`/ws/agent`) bridge uses, so `ui_*` tools behave
    // identically in every chat mode. It is wired by the workflow editor
    // (PanelRight); when no editor is mounted (e.g. the global /chat route
    // with no open workflow) accessing it throws, which surfaces as a tool
    // error instead of silently mutating a stub.
    const threadWorkflowId =
      get().threadWorkflowId?.[thread_id] ?? get().workflowId ?? null;
    if (threadWorkflowId) {
      try {
        await getFrontendToolRuntimeState().fetchWorkflow(threadWorkflowId);
      } catch (e) {
        console.warn("Failed to fetch workflow for tool call:", e);
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
        getState: () => {
          const runtimeState = getFrontendToolRuntimeState();
          return {
            ...runtimeState,
            currentWorkflowId:
              threadWorkflowId ?? runtimeState.currentWorkflowId
          };
        }
      }
    );

    const elapsedMs = Date.now() - startTime;
    try {
      await wsManager.send({
        type: "tool_result",
        tool_call_id,
        thread_id,
        ok: true,
        result,
        elapsed_ms: elapsedMs
      });
    } catch (error) {
      console.error("Failed to send tool_result:", error);
    }
  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Tool execution failed for ${name}:`, error);
    try {
      await wsManager.send({
        type: "tool_result",
        tool_call_id,
        thread_id,
        ok: false,
        error: message,
        result: { error: message },
        elapsed_ms: elapsedMs
      });
    } catch (sendError) {
      console.error("Failed to send tool_result after error:", sendError);
    }
  }
}

/**
 * Send the user's decision on a gated tool call back to the server, resuming
 * (or denying) the paused tool execution. Reuses the shared WebSocket
 * connection — never opens a new socket.
 */
export async function sendToolApprovalResponse(
  approvalId: string,
  decision: "allow" | "allow_for_chat" | "deny"
): Promise<void> {
  try {
    await globalWebSocketManager.send({
      type: "tool_approval_response",
      approval_id: approvalId,
      decision
    });
  } catch (error) {
    console.error("Failed to send tool_approval_response:", error);
  }
}

export async function handleChatWebSocketMessage(
  data: MsgpackData,
  set: ChatStateSetter,
  get: ChatStateGetter
) {
  const currentState = get();

  if (currentState.status === "stopping") {
    if (!["generation_stopped", "error", "job_update"].includes(data.type ?? "")) {
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
    // Clear timeout on terminal job states
    if (
      data.status === "completed" ||
      data.status === "failed" ||
      data.status === "cancelled"
    ) {
      const timeoutId = get().sendMessageTimeoutId;
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        set({ sendMessageTimeoutId: null });
      }
    }
    applyReducer(applyJobUpdate, data);
  } else if (data.type === "node_update") {
    applyReducer(applyNodeUpdate, data);
  } else if (data.type === "edge_update") {
    applyReducer(applyEdgeUpdate, data);
  } else if (data.type === "chunk") {
    if (data.done) {
      console.info("Received final chunk (done=true), clearing timeout");
      // Clear the safety timeout when generation completes
      const timeoutId = get().sendMessageTimeoutId;
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        set({ sendMessageTimeoutId: null });
      }
    }
    // Surface a progress message for media generation chunks so the UI
    // shows "Generating image…" / "Generating video…" instead of "Thinking…"
    const mediaMeta = data.content_metadata?.media_generation as
      | Record<string, unknown>
      | undefined;
    if (mediaMeta && !data.done) {
      const mode = String(mediaMeta.mode ?? "");
      const model = mediaMeta.model ? String(mediaMeta.model) : "";
      const label =
        mode === "image"
          ? "Generating image"
          : mode === "video"
            ? "Generating video"
            : "Generating";
      set({ statusMessage: model ? `${label} with ${model}…` : `${label}…` });
    }
    applyReducer(applyChunk, data);
  } else if (data.type === "output_update") {
    applyReducer(applyOutputUpdate, data);
  } else if (data.type === "tool_call_update") {
    applyReducer(applyToolCallUpdate, data);
  } else if (data.type === "todo_update") {
    const threadId = data.thread_id ?? get().currentThreadId;
    if (threadId) {
      set((state) => ({
        todosByThread: {
          ...state.todosByThread,
          [threadId]: data.todos ?? []
        }
      }));
    }
  } else if (data.type === "message") {
    const currentThreadId = get().currentThreadId;
    const messageThreadId = data.thread_id ?? currentThreadId;
    if (
      data.role === "assistant" &&
      messageThreadId === currentThreadId
    ) {
      const timeoutId = get().sendMessageTimeoutId;
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        set({ sendMessageTimeoutId: null });
      }
    }
    applyReducer(applyMessage, data);
  } else if (data.type === "node_progress") {
    applyReducer(applyNodeProgress, data);
  } else if (data.type === "tool_call") {
    void executeToolCall(data, get, set, globalWebSocketManager);
  } else if (data.type === "tool_approval_request") {
    get().addPendingApproval(data);
  } else if (data.type === "generation_stopped") {
    // Clear the safety timeout when generation is stopped
    const timeoutId = get().sendMessageTimeoutId;
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      set({ sendMessageTimeoutId: null });
    }
    applyReducer(
      (_state) => applyGenerationStopped(),
      data
    );
    console.info("Generation stopped:", data.message);
  } else if (data.type === "workflow_created" || data.type === "workflow_updated") {
    const threadId = get().currentThreadId;
    if (threadId && data.workflow_id) {
      set((state) => ({
        threadWorkflowId: {
          ...state.threadWorkflowId,
          [threadId]: data.workflow_id
        }
      }));
    }
    console.debug(`${data.type}:`, data.workflow_id);
  } else if (data.type === "error") {
    // Clear the safety timeout on error
    const timeoutId = get().sendMessageTimeoutId;
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      set({ sendMessageTimeoutId: null });
    }
    applyReducer((_state) => applyError(data.message), data);
  }
}
