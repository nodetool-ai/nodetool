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

  if (data.type === "job_update") {
    const update = data as JobUpdate;
    if (update.status === "completed") {
      set({
        status: "connected",
        progress: { current: 0, total: 0 },
        statusMessage: null
      });
    } else if (update.status === "failed") {
      set({
        status: "error",
        error: update.error,
        progress: { current: 0, total: 0 },
        statusMessage: update.error || null
      });
    }
  } else if (data.type === "node_update") {
    const update = data as NodeUpdate;
    if (update.status === "completed") {
      set({
        status: "connected",
        progress: { current: 0, total: 0 },
        statusMessage: null
      });
    } else {
      set({ statusMessage: update.node_name });
    }
  } else if (data.type === "chunk") {
    const chunk = data as Chunk;
    const threadId = get().currentThreadId;
    if (threadId) {
      const thread = get().threads[threadId];
      if (thread) {
        const messages = get().messageCache[threadId] || [];
        const lastMessage = messages[messages.length - 1];
        if (lastMessage && lastMessage.role === "assistant") {
          const updatedMessage: Message = {
            ...lastMessage,
            content: (lastMessage.content || "") + chunk.content
          };
          set((state) => ({
            status: "streaming",
            statusMessage: null,
            messageCache: {
              ...state.messageCache,
              [threadId]: [...messages.slice(0, -1), updatedMessage]
            },
            threads: {
              ...state.threads,
              [threadId]: {
                ...thread,
                updated_at: new Date().toISOString()
              }
            }
          }));
        } else {
          const message: Message = {
            role: "assistant" as const,
            type: "message" as const,
            content: chunk.content
          };
          set((state) => ({
            status: "streaming",
            statusMessage: null,
            messageCache: {
              ...state.messageCache,
              [threadId]: [...messages, message]
            },
            threads: {
              ...state.threads,
              [threadId]: {
                ...thread,
                updated_at: new Date().toISOString()
              }
            }
          }));
        }
        if (chunk.done) {
          set({
            status: "connected",
            statusMessage: null,
            currentPlanningUpdate: null,
            currentTaskUpdate: null
          });
          const innerThreadId = get().currentThreadId;
          if (innerThreadId) {
            const messages = get().messageCache[innerThreadId];
            const model = get().selectedModel;
            if (messages.length == 2)
              log.debug("Triggering thread summarization for thread:", innerThreadId);
            if (model.provider && model.id) {
              get().summarizeThread(
                innerThreadId,
                model.provider,
                model.id,
                JSON.stringify(messages)
              );
            }
          }
        }
      }
    }
  } else if (data.type === "output_update") {
    const update = data as OutputUpdate;
    const threadId = get().currentThreadId;
    if (threadId) {
      const thread = get().threads[threadId];
      if (thread) {
        if (update.output_type === "string") {
          const messages = get().messageCache[threadId] || [];
          const lastMessage = messages[messages.length - 1];
          if (lastMessage && lastMessage.role === "assistant") {
            if (update.value === "<nodetool_end_of_stream>") {
              return;
            }
            const updatedMessage: Message = {
              ...lastMessage,
              content: lastMessage.content + (update.value as string)
            };
            set((state) => ({
              status: "streaming",
              statusMessage: undefined,
              messageCache: {
                ...state.messageCache,
                [threadId]: [...messages.slice(0, -1), updatedMessage]
              },
              threads: {
                ...state.threads,
                [threadId]: {
                  ...thread,
                  updated_at: new Date().toISOString()
                }
              }
            }));
          } else {
            const message: Message = {
              role: "assistant" as const,
              type: "message" as const,
              content: update.value as string
            };
            set((state) => ({
              status: "streaming",
              messageCache: {
                ...state.messageCache,
                [threadId]: [...messages, message]
              },
              threads: {
                ...state.threads,
                [threadId]: {
                  ...thread,
                  updated_at: new Date().toISOString()
                }
              }
            }));
          }
        } else if (["image", "audio", "video"].includes(update.output_type)) {
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
          const messages = get().messageCache[threadId] || [];
          set((state) => ({
            statusMessage: null,
            messageCache: {
              ...state.messageCache,
              [threadId]: [...messages, message]
            },
            threads: {
              ...state.threads,
              [threadId]: {
                ...thread,
                updated_at: new Date().toISOString()
              }
            }
          }));
        }
      }
    }
  } else if (data.type === "tool_call_update") {
    const update = data as ToolCallUpdate;
    set({
      statusMessage: update.message,
      currentRunningToolCallId: (update as any).tool_call_id || null,
      currentToolMessage: update.message || null
    });
  } else if (data.type === "message") {
    const msg = data as Message;
    const threadId = get().currentThreadId;
    if (threadId) {
      const thread = get().threads[threadId];
      if (thread) {
        const messages = get().messageCache[threadId] || [];
        const last = messages[messages.length - 1];

        if (msg.role === "agent_execution") {
          set((state) => ({
            messageCache: {
              ...state.messageCache,
              [threadId]: [...messages, msg]
            },
            threads: {
              ...state.threads,
              [threadId]: {
                ...thread,
                updated_at: new Date().toISOString()
              }
            }
          }));

          if (msg.execution_event_type === "planning_update") {
            const content = msg.content;
            if (content && typeof content === "object" && !Array.isArray(content)) {
              set({ currentPlanningUpdate: content as PlanningUpdate });
            }
          } else if (msg.execution_event_type === "task_update") {
            const content = msg.content;
            if (content && typeof content === "object" && !Array.isArray(content)) {
              set({ currentTaskUpdate: content as TaskUpdate });
            }
          }

          return;
        }

        const isAssistantToolCall =
          msg.role === "assistant" &&
          Array.isArray(msg.tool_calls) &&
          msg.tool_calls.length > 0;
        if (msg.role === "tool" || isAssistantToolCall) {
          set((state) => ({
            messageCache: {
              ...state.messageCache,
              [threadId]: [...messages, msg]
            },
            threads: {
              ...state.threads,
              [threadId]: {
                ...thread,
                updated_at: new Date().toISOString()
              }
            },
            ...(msg.role === "tool"
              ? {
                  currentRunningToolCallId: null,
                  currentToolMessage: null,
                  statusMessage: null
                }
              : {})
          }));
          return;
        }

        if (msg.role === "assistant") {
          const incomingText =
            typeof msg.content === "string"
              ? msg.content
              : Array.isArray(msg.content)
              ? msg.content
                  .map((c: any) => (c?.type === "text" ? c.text : ""))
                  .join("")
              : "";
          const lastText =
            last &&
            last.role === "assistant" &&
            typeof last.content === "string"
              ? (last.content as string)
              : null;

          set((state) => {
            const current = state.messageCache[threadId] || [];
            const currentLast = current[current.length - 1];
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
              return {
                messageCache: state.messageCache,
                threads: {
                  ...state.threads,
                  [threadId]: {
                    ...thread,
                    updated_at: new Date().toISOString()
                  }
                }
              } as Partial<GlobalChatState>;
            }

            return {
              messageCache: {
                ...state.messageCache,
                [threadId]: [...current, msg]
              },
              threads: {
                ...state.threads,
                [threadId]: {
                  ...thread,
                  updated_at: new Date().toISOString()
                }
              }
            } as Partial<GlobalChatState>;
          });
          return;
        }

        set((state) => ({
          messageCache: {
            ...state.messageCache,
            [threadId]: [...messages, msg]
          },
          threads: {
            ...state.threads,
            [threadId]: {
              ...thread,
              updated_at: new Date().toISOString()
            }
          }
        }));
      }
    }
  } else if (data.type === "node_progress") {
    const progress = data as NodeProgress;
    set({
      status: "loading",
      progress: { current: progress.progress, total: progress.total },
      statusMessage: null
    });
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
    const stoppedData = data as GenerationStoppedUpdate;
    set({
      status: "connected",
      progress: { current: 0, total: 0 },
      statusMessage: null,
      currentPlanningUpdate: null,
      currentTaskUpdate: null
    });
    log.info("Generation stopped:", stoppedData.message);
  } else if ((data as any).type === "error") {
    const errorData = data as any;
    set({
      error: errorData.message || "An error occurred",
      status: "error",
      statusMessage: errorData.message
    });
  }
}
