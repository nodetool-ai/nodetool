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
  EdgeUpdate,
  ErrorMessage,
  JobUpdate,
  Message,
  MessageContent,
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
import type { GlobalChatState, StepToolCall } from "../../stores/GlobalChatStore";
import { globalWebSocketManager } from "../../lib/websocket/GlobalWebSocketManager";
import useResultsStore from "../../stores/ResultsStore";
import useStatusStore, { type StatusValue } from "../../stores/StatusStore";

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
  result: any;
  ok: boolean;
}

const makeMessageContent = (type: string, data: Uint8Array): MessageContent => {
  let mimeType = "application/octet-stream";
  if (type === "image") {mimeType = "image/png";}
  else if (type === "audio") {mimeType = "audio/mp3";}
  else if (type === "video") {mimeType = "video/mp4";}

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

const generateTitleFromFirstUserMessage = (
  threadId: string,
  state: GlobalChatState
): string | null => {
  const thread = state.threads[threadId];
  if (!thread) { return null; }
  if (thread.title) { return null; }

  const messages = state.messageCache[threadId] || [];
  const firstUserMessage = messages.find((msg) => msg.role === "user");
  if (!firstUserMessage) { return null; }

  let contentText = "";
  if (typeof firstUserMessage.content === "string") {
    contentText = firstUserMessage.content;
  } else if (Array.isArray(firstUserMessage.content)) {
    const firstText = (firstUserMessage.content as any[]).find(
      (c: any) => c?.type === "text" && typeof c.text === "string"
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
  const workflowId =
    (update as any).workflow_id ?? state.threadWorkflowId[state.currentThreadId ?? ""];
  if (workflowId) {
    useResultsStore
      .getState()
      .setEdge(
        workflowId, 
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
  const workflowId =
    (update as any).workflow_id ?? state.threadWorkflowId[state.currentThreadId ?? ""];

  if (workflowId) {
    // Sync with ResultsStore
    // If running, we might want to clear previous error or result?
    // For now, allow multiple updates.

    // Sync status
    useStatusStore
      .getState()
      .setStatus(workflowId, update.node_id, update.status as StatusValue);

    if (update.result) {
      useResultsStore
        .getState()
        .setResult(workflowId, update.node_id, update.result);
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
  if (!threadId) {return noopUpdate;}

  const thread = state.threads[threadId];
  if (!thread) {return noopUpdate;}

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
    const localStreamId = `local-stream-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`;
    const message: Message = {
      id: localStreamId,
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
  if (!threadId) {return noopUpdate;}

  const thread = state.threads[threadId];
  if (!thread) {return noopUpdate;}

  const workflowId =
    (update as any).workflow_id ?? state.threadWorkflowId[threadId];
  if (workflowId) {
    useResultsStore
      .getState()
      .setOutputResult(
        workflowId,
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

  let agentExecutionToolCalls: GlobalChatState["agentExecutionToolCalls"] | undefined;

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
  const anyMsg = msg as any;
  log.debug("applyAgentExecutionMessage:", {
    execution_event_type: anyMsg.execution_event_type,
    content_type: typeof anyMsg.content,
    content_is_array: Array.isArray(anyMsg.content),
    has_content: !!anyMsg.content
  });

  if (anyMsg.execution_event_type === "planning_update") {
    const content = anyMsg.content;
    log.debug("PlanningUpdate content:", content);
    if (content && typeof content === "object" && !Array.isArray(content)) {
      update.currentPlanningUpdate = content as PlanningUpdate;
      log.info("Set currentPlanningUpdate:", content);
    } else {
      log.warn("PlanningUpdate content is invalid:", content);
    }
  } else if (anyMsg.execution_event_type === "task_update") {
    const content = anyMsg.content;
    if (content && typeof content === "object" && !Array.isArray(content)) {
      update.currentTaskUpdate = content as TaskUpdate;
      update.currentTaskUpdateThreadId = threadId;
      update.lastTaskUpdatesByThread = {
        ...state.lastTaskUpdatesByThread,
        [threadId]: content as TaskUpdate
      };
    }
  } else if (anyMsg.execution_event_type === "log_update") {
    const content = anyMsg.content;
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
    if (typeof message.content === "string") {return message.content;}
    if (Array.isArray(message.content)) {
      return message.content
        .map((c: any) => (c?.type === "text" ? c.text : ""))
        .join("");
    }
    return "";
  };

  const incomingText =
    typeof msg.content === "string"
      ? msg.content
      : Array.isArray(msg.content)
      ? msg.content.map((c: any) => (c?.type === "text" ? c.text : "")).join("")
      : "";
  const incomingNormalized = normalizeTextForComparison(incomingText);

  const findStreamPlaceholderIndex = (): number => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const candidate = messages[i];
      if (candidate?.role !== "assistant") {continue;}
      if ((candidate as any).type !== "message") {continue;}

      const candidateId = candidate.id ?? null;
      const isLocalStream =
        typeof candidateId === "string" && candidateId.startsWith("local-stream-");
      const isServerAuthored = !!candidate.created_at || (!!candidateId && !isLocalStream);

      if (isServerAuthored) {continue;}

      const candidateText = extractTextContent(candidate);
      const candidateNormalized = normalizeTextForComparison(candidateText);
      if (!candidateNormalized || !incomingNormalized) {continue;}

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

  const isNewAssistantMessage = streamPlaceholderIndex < 0 &&
    (messages.length === 0 || messages[messages.length - 1]?.role !== "assistant");

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
      if (currentLastNormalized && currentLastNormalized === incomingNormalized) {
        return messages;
      }
    }

    return [...messages, msg];
  })();

  const postAction = isNewAssistantMessage ? (get: ChatStateGetter) => {
    const { updateThreadTitle } = get();
    if (!get().threads[threadId]?.title) {
      const newTitle = generateTitleFromFirstUserMessage(threadId, get());
      if (newTitle) {
        updateThreadTitle(threadId, newTitle);
      }
    }
  } : undefined;

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
  if (!threadId) {return noopUpdate;}
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
  const workflowId =
    (progress as any).workflow_id ??
    state.threadWorkflowId[state.currentThreadId ?? ""];
  if (workflowId) {
    useResultsStore
      .getState()
      .setProgress(
        workflowId,
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
  console.log("handleChatWebSocketMessage:", data);

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
    console.log("Job update received:", data);
    applyReducer(applyJobUpdate, data as JobUpdate);
  } else if (data.type === "node_update") {
    applyReducer(applyNodeUpdate, data as NodeUpdate);
  } else if (data.type === "edge_update") {
    applyReducer(applyEdgeUpdate, data as EdgeUpdate);
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
        threadWorkflowId == null
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
      const message =
        error instanceof Error ? error.message : "Unknown error";
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
    applyReducer(
      (_state) => applyGenerationStopped(),
      data as GenerationStoppedUpdate
    );
    const stoppedData = data as GenerationStoppedUpdate;
    log.info("Generation stopped:", stoppedData.message);
  } else if (data.type === "error") {
    const errorData = data as ErrorMessage;
    console.log("Error message received:", errorData);
    applyReducer(
      (_state) => applyError(errorData.message),
      errorData
    );
  }
}
