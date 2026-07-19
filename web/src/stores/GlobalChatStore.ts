/**
 * Global chat state and WebSocket bridge.
 *
 * Server contract: connects to `CHAT_URL` (with Supabase auth outside
 * localhost) and exchanges chatProtocol messages: Message streams, Job/Node
 * updates, ToolCallUpdate, PlanningUpdate/TaskUpdate, and workflow graph
 * updates keyed by thread_id. The server is expected to preserve message
 * ordering per thread and resume streams after reconnects.
 *
 * State machine: disconnected → connecting → connected/streaming → stopping →
 * disconnected or error. Reconnects recreate the WebSocketManager, restore the
 * active thread, and replay cached messages while new ones stream in.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useQuery } from "@tanstack/react-query";
import React from "react";
import {
  Message,
  MessageTextContent,
  TaskUpdate,
  PlanningUpdate,
  LogUpdate,
  Thread,
  LanguageModel,
  TodoItem,
  PermissionMode,
  NodeUpdate
} from "./ApiTypes";
import useResultsStore from "./ResultsStore";
import useWorkflowRunsStore from "./WorkflowRunsStore";
import { syncBudgetSpentFromProviderCosts } from "../hooks/useLiveRunCost";
import type { WebSocketMessage } from "../lib/websocket/GlobalWebSocketManager";
import {
  sendPlanApprovalResponse,
  sendToolApprovalResponse
} from "../core/chat/chatProtocol";
import { isLocalhost } from "../lib/env";
import { trpcClient } from "../trpc/client";
import {
  isTRPCErrorWithCode,
  ApiErrorCode
} from "@nodetool-ai/protocol/api-schemas";
import { DEFAULT_MODEL } from "../config/constants";
import { ConnectionState } from "../lib/websocket/WebSocketManager";
import { globalWebSocketManager } from "../lib/websocket/GlobalWebSocketManager";
import { FrontendToolRegistry } from "../lib/tools/frontendTools";
import { createChatPiSlice, type ChatPiSlice } from "./chatPi";
import {
  handleChatWebSocketMessage,
  WorkflowCreatedUpdate,
  WorkflowUpdatedUpdate
} from "../core/chat/chatProtocol";
import type { ChatOutgoingMessage } from "./MediaGenerationStore";
import { useShallow } from "zustand/react/shallow";
import {
  DEFAULT_THREAD_RUNTIME,
  getThreadRuntime,
  mirrorsForThread,
  threadRuntimeUpdate,
  type ThreadRuntime
} from "../core/chat/threadRuntime";

// Include additional runtime statuses used during message streaming
type ChatStatus =
  | ConnectionState
  | "loading"
  | "streaming"
  | "error"
  | "stopping";

/**
 * How the unified chat routes a message:
 * - "chat": the `/ws` LLM-with-tools loop (also covers media generation, which
 *   is carried per-message via `media_generation`).
 * - "pi": the workspace-aware Pi coding agent over `/ws/agent`.
 */
type ChatMode = "chat" | "pi";

export type StepToolCall = {
  id: string;
  name: string;
  args: Record<string, unknown> | null;
  message?: string | null;
  startedAt: number;
  status?: string | null;
};

type AgentExecutionToolCalls = Record<
  string,
  Record<string, StepToolCall[]>
>;

const DEFAULT_PERMISSION_MODE: PermissionMode = "default";

/** Decision a user can make on an inline tool-approval prompt. */
export type ApprovalDecision = "allow" | "allow_for_chat" | "deny";

/**
 * A pending tool-approval request awaiting a user decision. Keyed by
 * `approval_id` in `pendingApprovals`.
 */
interface PendingApproval {
  thread_id: string;
  tool_name: string;
  category: string;
  message: string;
  args: Record<string, unknown>;
}

/** Server → client tool-approval request payload. */
interface ToolApprovalRequest {
  type: "tool_approval_request";
  thread_id: string;
  approval_id: string;
  tool_name: string;
  category: "write" | "execute" | "external";
  message: string;
  args: Record<string, unknown>;
}

/** A step of a proposed agent plan, as serialized on the wire. */
interface ProposedPlanStep {
  id: string;
  instructions: string;
}

/** A task of a proposed agent plan, as serialized on the wire. */
interface ProposedPlanTask {
  id: string;
  title: string;
  depends_on: string[];
  steps: ProposedPlanStep[];
}

/** The plan an agent proposes before executing. */
export interface ProposedPlan {
  title: string;
  tasks: ProposedPlanTask[];
}

/** Decision a user can make on a proposed agent plan. */
export type PlanDecision = "approve" | "reject";

/**
 * A pending plan-approval request awaiting a user decision. Keyed by
 * `approval_id` in `pendingPlanApprovals`. `thread_id` is null when the plan
 * comes from a run not bound to a thread (e.g. an editor workflow run) — the
 * card then shows on the active thread.
 */
export interface PendingPlanApproval {
  thread_id: string | null;
  plan: ProposedPlan;
}

/** Server → client plan-approval request payload. */
interface PlanApprovalRequest {
  type: "plan_approval_request";
  thread_id: string | null;
  approval_id: string;
  plan: ProposedPlan;
}

export interface GlobalChatState extends ChatPiSlice {
  // Connection state + mirror of the CURRENT thread's runtime (see
  // core/chat/threadRuntime.ts). Multi-thread consumers read `threadRuntime`.
  status: ChatStatus;
  statusMessage: string | null;
  progress: { current: number; total: number };
  error: string | null;
  /**
   * Per-thread generation runtime, keyed by thread id. Every thread streams
   * independently; the top-level fields above mirror the current thread.
   */
  threadRuntime: Record<string, ThreadRuntime>;
  workflowId: string | null;
  threadWorkflowId: Record<string, string | null>;

  // Active chat mode (chat vs. pi). Media generation is a per-message concern
  // carried in `media_generation`, so it does not need its own mode here.
  mode: ChatMode;
  setMode: (mode: ChatMode) => void;

  // Per-workflow thread binding for the editor side panel: each workflow gets
  // its own conversation. workflowId -> threadId.
  workflowThreadId: Record<string, string>;
  /**
   * Bind the editor chat to a workflow: switch to its most recent conversation,
   * or create a fresh one if the workflow has none yet. Returns the thread id.
   */
  openWorkflowThread: (workflowId: string) => Promise<string>;
  /** Start a fresh thread bound to the workflow, replacing the prior binding. */
  newWorkflowThread: (workflowId: string) => Promise<string>;
  // Tool call runtime UI state
  currentRunningToolCallId: string | null;
  currentToolMessage: string | null;

  // WebSocket event subscriptions
  wsEventUnsubscribes: Array<() => void>;
  wsThreadSubscriptions: Record<string, () => void>;

  // Thread management
  threads: Record<string, Thread>;
  currentThreadId: string | null;
  lastUsedThreadId: string | null;
  isLoadingThreads: boolean;
  threadsLoaded: boolean;

  // Message caching
  messageCache: Record<string, Message[]>; // threadId -> messages
  messageCursors: Record<string, string | null>; // threadId -> next cursor
  isLoadingMessages: boolean;

  // Long-term memory opt-in
  /**
   * When true, the server resolves a per-user, per-thread `LongTermMemory`
   * for this chat session: relevant items are recalled into the system
   * prompt before each LLM call, and new memories are mined from the
   * conversation after each turn. Default off — memory is a trust
   * boundary, not a quiet convenience. Persisted across reloads.
   */
  memoryEnabled: boolean;
  setMemoryEnabled: (enabled: boolean) => void;

  /** Clear the current error (e.g. when dismissing an error banner). */
  clearError: () => void;

  // Agent execution trace
  agentExecutionToolCalls: AgentExecutionToolCalls;

  // Selections
  selectedModel: LanguageModel;
  setSelectedModel: (model: LanguageModel) => void;

  // Per-thread permission mode (governs how gated tool calls are handled).
  // Unknown/new threads default to DEFAULT_PERMISSION_MODE.
  permissionMode: Record<string, PermissionMode>;
  getPermissionMode: (threadId: string | null) => PermissionMode;
  setPermissionMode: (threadId: string, mode: PermissionMode) => void;

  // Inline tool-approval prompts awaiting a user decision, keyed by approval_id.
  pendingApprovals: Record<string, PendingApproval>;
  addPendingApproval: (req: ToolApprovalRequest) => void;
  resolveApproval: (approvalId: string, decision: ApprovalDecision) => void;

  // Inline plan-approval prompts awaiting a user decision, keyed by approval_id.
  pendingPlanApprovals: Record<string, PendingPlanApproval>;
  addPendingPlanApproval: (req: PlanApprovalRequest) => void;
  resolvePlanApproval: (
    approvalId: string,
    decision: PlanDecision,
    feedback?: string
  ) => void;

  // Planning updates
  currentPlanningUpdate: PlanningUpdate | null;
  setPlanningUpdate: (update: PlanningUpdate | null) => void;

  // Task updates
  currentTaskUpdate: TaskUpdate | null;
  currentTaskUpdateThreadId: string | null;
  lastTaskUpdatesByThread: Record<string, TaskUpdate | null>;

  // Log updates
  currentLogUpdate: LogUpdate | null;
  // Per-thread todo lists (TodoWrite-style checklist)
  todosByThread: Record<string, TodoItem[]>;

  // Workflow graph updates
  lastWorkflowGraphUpdate: WorkflowCreatedUpdate | WorkflowUpdatedUpdate | null;

  // Safety timeout tracking for loadMessages after delete
  loadMessagesTimeoutId: ReturnType<typeof setTimeout> | null;

  // Actions
  connect: () => Promise<void>;
  disconnect: () => void;
  /**
   * Send a message to `threadId`, or to the current thread when omitted
   * (creating one if none exists). Threads generate independently, so a
   * send to a background thread does not disturb the current one.
   */
  sendMessage: (
    message: Message | ChatOutgoingMessage,
    threadId?: string
  ) => Promise<void>;
  resetMessages: () => void;

  // Thread actions
  fetchThreads: () => Promise<void>;
  fetchThread: (threadId: string) => Promise<Thread | null>;
  createNewThread: (
    title?: string,
    workflowId?: string | null
  ) => Promise<string>;
  switchThread: (threadId: string) => void;
  deleteThread: (threadId: string) => Promise<void>;
  getCurrentMessages: () => Message[];
  getCurrentMessagesSync: () => Message[];
  loadMessages: (threadId: string, cursor?: string) => Promise<Message[]>;
  updateThreadTitle: (threadId: string, title: string) => Promise<void>;
  summarizeThread: (
    threadId: string,
    provider: string,
    model: string,
    content: string
  ) => Promise<void>;
  /** Stop generation on `threadId`, or the current thread when omitted. */
  stopGeneration: (threadId?: string) => void;

  // Message cache management
  addMessageToCache: (threadId: string, message: Message) => void;
  clearMessageCache: (threadId: string) => void;

  // Agent execution message grouping
  getAgentExecutionMessages: (
    threadId: string,
    agentExecutionId: string
  ) => Message[];
}

function buildDefaultLanguageModel(): LanguageModel {
  return {
    type: "language_model",
    provider: "empty",
    id: DEFAULT_MODEL,
    name: DEFAULT_MODEL
  };
}

/** Flatten a message's content down to plain text (for the pi transport). */
function extractMessageText(message: Message | ChatOutgoingMessage): string {
  const { content } = message;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .filter((part): part is MessageTextContent => part?.type === "text")
      .map((part) => part.text)
      .join("")
      .trim();
  }
  return "";
}

// Concurrency guards (module-level so they never end up in persisted state):
// - `connectPromise` dedupes overlapping connect() calls; without it each call
//   registers its own event handlers on the GlobalWebSocketManager singleton
//   and later `set({ wsEventUnsubscribes })` calls overwrite earlier arrays,
//   leaking handlers. Cleared in `finally` so a failed connect can be retried.
let connectPromise: Promise<void> | null = null;
// - `inFlightMessageLoads` dedupes loadMessages() per thread: concurrent calls
//   for the SAME thread await one request, while loads for different threads
//   proceed independently.
const inFlightMessageLoads = new Map<string, Promise<Message[]>>();

/**
 * Chat-initiated workflow runs stream `node_update`s over the chat socket, not
 * through the editor's `handleUpdate` pipeline — so their run never registers as
 * the focused job and their provider costs never land in ResultsStore under the
 * workflow id. That left the CostTicker (rendered in Global Chat) stuck at $0.
 *
 * Mirror the editor path here: register the run so `useLiveRunCost(workflowId)`
 * follows it, record any provider charge, and refresh the session budget spend.
 */
const captureChatRunSpend = (
  data: WebSocketMessage,
  threadId: string,
  get: () => GlobalChatState
): void => {
  if (data.type !== "node_update") {
    return;
  }
  // job_id / workflow_id are stamped onto the wire message by the relay; the
  // NodeUpdate type carries provider_cost and node_id.
  const update = data as unknown as NodeUpdate;
  const jobId = data.job_id;
  const workflowId =
    data.workflow_id ?? get().threadWorkflowId[threadId] ?? undefined;
  if (!workflowId || !jobId) {
    return;
  }

  const runsStore = useWorkflowRunsStore.getState();
  if (!runsStore.hasRun(workflowId, jobId)) {
    runsStore.recordRun({
      jobId,
      workflowId,
      state: "running",
      startedAt: Date.now(),
      label: jobId
    });
  }

  if (update.provider_cost) {
    useResultsStore
      .getState()
      .setProviderCost(workflowId, jobId, update.node_id, update.provider_cost);
    syncBudgetSpentFromProviderCosts();
  }
};

const useGlobalChatStore = create<GlobalChatState>()(
  persist<GlobalChatState>(
    (set, get) => ({
      // Connection state
      status: "disconnected",
      statusMessage: null,
      progress: { current: 0, total: 0 },
      error: null,
      threadRuntime: {},
      workflowId: null,
      threadWorkflowId: {},
      wsEventUnsubscribes: [],
      wsThreadSubscriptions: {},
      currentRunningToolCallId: null,
      currentToolMessage: null,

      // Mode + Pi transport slice
      mode: "chat",
      setMode: (mode: ChatMode) => set({ mode }),
      ...createChatPiSlice(set, get),

      // Per-workflow thread binding (editor side panel)
      workflowThreadId: {},
      openWorkflowThread: async (workflowId: string) => {
        set({ workflowId });
        const state = get();

        // A thread belongs to this workflow if the server bound it
        // (`workflow_id`) or the client did before it was persisted
        // (`threadWorkflowId`).
        const belongsToWorkflow = (thread: Thread) =>
          (thread.workflow_id ?? state.threadWorkflowId[thread.id] ?? null) ===
          workflowId;

        // Load the most recent conversation for this workflow.
        const lastThread = Object.values(state.threads)
          .filter(belongsToWorkflow)
          .sort((a, b) =>
            (b.updated_at ?? "").localeCompare(a.updated_at ?? "")
          )[0];

        if (lastThread) {
          set((s) => ({
            workflowThreadId: {
              ...s.workflowThreadId,
              [workflowId]: lastThread.id
            },
            threadWorkflowId: {
              ...s.threadWorkflowId,
              [lastThread.id]: workflowId
            }
          }));
          if (state.currentThreadId !== lastThread.id) {
            get().switchThread(lastThread.id);
          }
          return lastThread.id;
        }

        // No conversation yet — start a fresh thread bound to this workflow.
        const threadId = await get().createNewThread(undefined, workflowId);
        set((s) => ({
          workflowThreadId: { ...s.workflowThreadId, [workflowId]: threadId }
        }));
        return threadId;
      },

      newWorkflowThread: async (workflowId: string) => {
        set({ workflowId });
        // createNewThread sets currentThreadId to the new thread; rebind the
        // workflow to it so openWorkflowThread won't pull the old one back.
        const threadId = await get().createNewThread();
        set((state) => ({
          workflowThreadId: { ...state.workflowThreadId, [workflowId]: threadId },
          threadWorkflowId: { ...state.threadWorkflowId, [threadId]: workflowId }
        }));
        return threadId;
      },

      // Thread state - ensure default values
      threads: {} as Record<string, Thread>,
      currentThreadId: null as string | null,
      lastUsedThreadId: null as string | null,
      isLoadingThreads: false,
      threadsLoaded: false,

      // Message cache
      messageCache: {},
      messageCursors: {},
      isLoadingMessages: false,

      memoryEnabled: false,
      setMemoryEnabled: (enabled: boolean) => set({ memoryEnabled: enabled }),

      clearError: () => set({ error: null }),

      // Agent execution trace
      agentExecutionToolCalls: {},

      // Selections
      selectedModel: buildDefaultLanguageModel(),
      setSelectedModel: (model: LanguageModel) => {
        set({ selectedModel: model });
      },

      // Per-thread permission mode
      permissionMode: {},
      getPermissionMode: (threadId: string | null) => {
        if (!threadId) return DEFAULT_PERMISSION_MODE;
        return get().permissionMode[threadId] ?? DEFAULT_PERMISSION_MODE;
      },
      setPermissionMode: (threadId: string, mode: PermissionMode) =>
        set((state) => ({
          permissionMode: { ...state.permissionMode, [threadId]: mode }
        })),

      // Inline tool-approval prompts
      pendingApprovals: {},
      addPendingApproval: (req: ToolApprovalRequest) =>
        set((state) => ({
          pendingApprovals: {
            ...state.pendingApprovals,
            [req.approval_id]: {
              thread_id: req.thread_id,
              tool_name: req.tool_name,
              category: req.category,
              message: req.message,
              args: req.args
            }
          }
        })),
      resolveApproval: (approvalId: string, decision: ApprovalDecision) => {
        if (!get().pendingApprovals[approvalId]) return;
        void sendToolApprovalResponse(approvalId, decision);
        set((state) => {
          const { [approvalId]: _resolved, ...rest } = state.pendingApprovals;
          return { pendingApprovals: rest };
        });
      },

      // Inline plan-approval prompts
      pendingPlanApprovals: {},
      addPendingPlanApproval: (req: PlanApprovalRequest) =>
        set((state) => ({
          pendingPlanApprovals: {
            ...state.pendingPlanApprovals,
            [req.approval_id]: {
              thread_id: req.thread_id ?? null,
              plan: req.plan
            }
          }
        })),
      resolvePlanApproval: (
        approvalId: string,
        decision: PlanDecision,
        feedback?: string
      ) => {
        if (!get().pendingPlanApprovals[approvalId]) return;
        void sendPlanApprovalResponse(approvalId, decision, feedback);
        set((state) => {
          const { [approvalId]: _resolved, ...rest } =
            state.pendingPlanApprovals;
          return { pendingPlanApprovals: rest };
        });
      },

      // Planning updates
      currentPlanningUpdate: null,
      setPlanningUpdate: (update: PlanningUpdate | null) =>
        set({ currentPlanningUpdate: update }),

      // Task updates
      currentTaskUpdate: null,
      currentTaskUpdateThreadId: null,
      lastTaskUpdatesByThread: {},

      // Log updates
      currentLogUpdate: null,

      // Per-thread todo lists
      todosByThread: {},

      // Workflow graph updates
      lastWorkflowGraphUpdate: null,

      loadMessagesTimeoutId: null,

      connect: async () => {
        // Overlapping connect() calls share one in-flight attempt; otherwise
        // each call would register its own event handlers on the singleton
        // manager and the loser's unsubscribe handles would be lost.
        if (connectPromise) {
          return connectPromise;
        }
        connectPromise = (async () => {
        console.info("Connecting to global chat");

        const state = get();

        state.wsEventUnsubscribes.forEach((unsubscribe) => unsubscribe());
        Object.values(state.wsThreadSubscriptions).forEach((unsubscribe) =>
          unsubscribe()
        );
        // Drop the now-dead handles immediately: if anything below throws,
        // state must not keep truthy-but-unsubscribed entries, or sendMessage
        // would skip re-subscribing and streamed replies would have no handler.
        set({ wsEventUnsubscribes: [], wsThreadSubscriptions: {} });

        // Load threads if not already loaded
        if (!state.threadsLoaded) {
          await get().fetchThreads();
        }

        // Ensure WebSocket connection is established first
        try {
          await globalWebSocketManager.ensureConnection();
        } catch (error) {
          console.error("Failed to establish WebSocket connection:", error);
          set({
            error: "Failed to connect to chat service",
            status: "failed"
          });
          throw error;
        }

        const eventUnsubscribes: Array<() => void> = [];

        // Set up event handlers on the shared connection
        eventUnsubscribes.push(
          globalWebSocketManager.subscribeEvent(
            "stateChange",
            (newState: ConnectionState) => {
              // Don't override loading status when WebSocket connects
              const currentState = get();
              if (
                newState === "connected" &&
                currentState.status === "loading"
              ) {
                // Keep loading status if we're waiting for a response
                set({
                  error: null,
                  statusMessage: null
                });
              } else {
                set({ status: newState });

                if (newState === "connected") {
                  set({
                    error: null,
                    statusMessage: null
                  });
                }
              }
            }
          )
        );

        eventUnsubscribes.push(
          globalWebSocketManager.subscribeEvent(
            "reconnecting",
            (attempt: number, maxAttempts: number) => {
              set({
                statusMessage: `Reconnecting... (attempt ${attempt}/${maxAttempts})`
              });
            }
          )
        );

        const threadSubscriptions: Record<string, () => void> = {};
        const stateThreads = Object.keys(get().threads);
        stateThreads.forEach((threadId) => {
          // Unsubscribe any handler that was registered between the
          // initial cleanup and this point (possible during the await)
          const existing = get().wsThreadSubscriptions[threadId];
          if (existing) {
            existing();
          }
          threadSubscriptions[threadId] = globalWebSocketManager.subscribe(
            threadId,
            (data) => {
              captureChatRunSpend(data, threadId, get);
              handleChatWebSocketMessage(data, set, get, threadId);
            }
          );
        });

        const sendManifest = () => {
          const manifest = FrontendToolRegistry.getManifest();
          if (manifest.length > 0) {
            void globalWebSocketManager
              .send({
                type: "client_tools_manifest",
                tools: manifest
              })
              .catch((e) => console.error("Failed to send manifest:", e));
          }
        };

        eventUnsubscribes.push(
          globalWebSocketManager.subscribeEvent("open", sendManifest)
        );

        if (globalWebSocketManager.isConnectionOpen()) {
          sendManifest();
        }

        eventUnsubscribes.push(
          globalWebSocketManager.subscribeEvent("error", (error: Error) => {
            console.error("WebSocket error:", error);
            let errorMessage = error.message;

            if (!isLocalhost) {
              errorMessage += " This may be due to an authentication issue.";
            }

            set({
              error: errorMessage
            });
          })
        );

        eventUnsubscribes.push(
          globalWebSocketManager.subscribeEvent(
            "close",
            (code?: number, _reason?: string) => {
              if (code === 1008 || code === 4001 || code === 4003) {
                // Authentication errors
                set({
                  error: "Authentication failed. Please log in again."
                });
              }
            }
          )
        );

        // Store subscriptions
        set({
          error: null,
          wsEventUnsubscribes: eventUnsubscribes,
          wsThreadSubscriptions: threadSubscriptions
        });

        // Connection is automatic via globalWebSocketManager
        // Subscriptions will trigger connection if not already connected
        console.info("Global chat subscriptions set up");
        })();
        try {
          await connectPromise;
        } finally {
          // Always clear the guard — a FAILED connect must not block the
          // retry button from starting a fresh attempt.
          connectPromise = null;
        }
      },

      disconnect: () => {
        const {
          wsEventUnsubscribes,
          wsThreadSubscriptions,
          threadRuntime,
          loadMessagesTimeoutId
        } = get();
        wsEventUnsubscribes.forEach((unsubscribe) => unsubscribe());
        Object.values(wsThreadSubscriptions).forEach((unsubscribe) =>
          unsubscribe()
        );

        // Clear every thread's pending safety timeout
        Object.values(threadRuntime).forEach((rt) => {
          if (rt.sendMessageTimeoutId !== null) {
            clearTimeout(rt.sendMessageTimeoutId);
          }
        });
        // Clear any pending loadMessages timeout
        if (loadMessagesTimeoutId !== null) {
          clearTimeout(loadMessagesTimeoutId);
        }

        set({
          wsEventUnsubscribes: [],
          wsThreadSubscriptions: {},
          status: "disconnected",
          error: null,
          statusMessage: null,
          threadRuntime: {},
          loadMessagesTimeoutId: null
        });
      },

      sendMessage: async (
        message: Message | ChatOutgoingMessage,
        targetThreadId?: string
      ) => {
        const { currentThreadId, workflowId, memoryEnabled, selectedModel } =
          get();

        // Pi mode routes through the agent socket instead of the /ws chat loop.
        if (get().mode === "pi") {
          let threadId = targetThreadId ?? currentThreadId;
          if (!threadId) {
            threadId = await get().createNewThread();
          }
          await get().sendPiMessage(threadId, extractMessageText(message));
          return;
        }
        // Agent mode is no longer a UI toggle — every chat session runs the
        // unified LLM-with-tools loop, and the agent decides for itself
        // whether to escalate via `run_subtask`. `agent_mode` and
        // `agent_planner` are no longer sent on the wire.
        const outgoing = message as ChatOutgoingMessage;
        const mediaGeneration = outgoing.media_generation ?? null;

        set({ error: null });

        // Ensure WebSocket connection is established before sending
        try {
          await globalWebSocketManager.ensureConnection();
        } catch (connError) {
          const detail =
            connError instanceof Error ? connError.message : String(connError);
          const knownTid = targetThreadId ?? currentThreadId;
          set((state) => ({
            error: `Not connected to chat service: ${detail}`,
            ...(knownTid
              ? threadRuntimeUpdate(state, knownTid, {
                  error: `Not connected to chat service: ${detail}`
                })
              : {})
          }));
          return;
        }

        // Ensure we have a thread
        let threadId = targetThreadId ?? currentThreadId;
        if (!threadId) {
          threadId = await get().createNewThread();
        }
        const tid = threadId;

        // Clear the target thread's existing safety timeout
        const existingTimeoutId = getThreadRuntime(
          get(),
          tid
        ).sendMessageTimeoutId;
        if (existingTimeoutId !== null) {
          clearTimeout(existingTimeoutId);
        }
        set((state) =>
          threadRuntimeUpdate(state, tid, {
            error: null,
            sendMessageTimeoutId: null
          })
        );

        // Ensure we have a WS subscription for this thread before sending,
        // otherwise streamed chunks/messages will be routed with no handler.
        if (!get().wsThreadSubscriptions[threadId]) {
          const unsub = globalWebSocketManager.subscribe(tid, (data) => {
            captureChatRunSpend(data, tid, get);
            handleChatWebSocketMessage(data, set, get, tid);
          });
          set((state) => {
            // Guard against a race: if another path registered a handler
            // between our check and this set(), clean ours up to avoid a leak.
            const existing = state.wsThreadSubscriptions[tid];
            if (existing !== undefined) {
              unsub();
              return {};
            }
            return {
              wsThreadSubscriptions: {
                ...state.wsThreadSubscriptions,
                [tid]: unsub
              }
            };
          });
        }

        // Targeted sends (chat tabs) keep the thread's own workflow binding;
        // untargeted sends bind the thread to the currently-open workflow as
        // before.
        const boundWorkflowId = targetThreadId
          ? get().threads[tid]?.workflow_id ??
            get().threadWorkflowId[tid] ??
            null
          : workflowId ?? null;
        set((state) => ({
          threadWorkflowId: {
            ...state.threadWorkflowId,
            [tid]: boundWorkflowId
          }
        }));

        // Prepare messages for cache and wire (workflow_id only on wire)
        // Preserve workflow_id if already set by caller (e.g., WorkflowAssistantChat)
        const messageForCache: Message = {
          ...message,
          thread_id: threadId,
          memory_enabled: memoryEnabled,
          ...(mediaGeneration ? { media_generation: mediaGeneration } : {})
        } as Message;

        // Build the chat_message command data. Media-generation messages
        // use the provider/model chosen in the media composer instead of the
        // default language model so text-to-image / text-to-video calls are
        // routed correctly on the server.
        const isMediaGeneration =
          !!mediaGeneration && mediaGeneration.mode !== "chat";
        // The client no longer drives the toolbelt: `tools` and `collections`
        // are dropped from the send path. The active per-thread permission
        // mode is sent instead and governs how the agent's gated tool calls
        // are handled server-side.
        const { tools: _tools, collections: _collections, ...messageWithoutTools } =
          message as Message;
        const chatMessageData = {
          ...messageWithoutTools,
          workflow_id: message.workflow_id ?? boundWorkflowId,
          thread_id: threadId,
          memory_enabled: memoryEnabled,
          permission_mode: get().getPermissionMode(threadId),
          model: isMediaGeneration
            ? mediaGeneration?.model ?? message.model ?? selectedModel?.id
            : selectedModel?.id,
          provider: isMediaGeneration
            ? mediaGeneration?.provider ?? message.provider ?? selectedModel?.provider
            : selectedModel?.provider,
          media_generation: mediaGeneration
        };

        // Wrap in chat_message command structure as per unified WebSocket API
        const commandMessage = {
          command: "chat_message",
          data: chatMessageData
        };

        // Add message to cache optimistically
        get().addMessageToCache(threadId, messageForCache);

        // Waiting for response — only this thread's runtime enters "loading"
        set((state) => threadRuntimeUpdate(state, tid, { status: "loading" }));

        try {
          await globalWebSocketManager.send(commandMessage);

          // Safety timeout - reset the thread if no response after 5 minutes
          const timeoutId = setTimeout(() => {
            const runtime = getThreadRuntime(get(), tid);
            if (runtime.status === "loading" || runtime.status === "streaming") {
              console.warn("Generation timeout - resetting thread to idle");
              set((state) =>
                threadRuntimeUpdate(state, tid, {
                  status: "idle",
                  progress: { current: 0, total: 0 },
                  statusMessage: null,
                  planningUpdate: null,
                  taskUpdate: null,
                  sendMessageTimeoutId: null
                })
              );
            }
          }, 5 * 60 * 1000);
          set((state) =>
            threadRuntimeUpdate(state, tid, { sendMessageTimeoutId: timeoutId })
          );
        } catch (error) {
          // Clear this thread's timeout on error
          const currentTimeoutId = getThreadRuntime(
            get(),
            tid
          ).sendMessageTimeoutId;
          if (currentTimeoutId !== null) {
            clearTimeout(currentTimeoutId);
          }
          console.error("Failed to send message:", error);
          const errorMessage =
            error instanceof Error ? error.message : "Failed to send message";
          set((state) => ({
            error: errorMessage,
            ...threadRuntimeUpdate(state, tid, {
              error: errorMessage,
              status: "idle",
              sendMessageTimeoutId: null
            })
          }));
          throw error;
        }
      },

      resetMessages: () => {
        const threadId = get().currentThreadId;
        if (threadId) {
          set((state) => ({
            messageCache: {
              ...state.messageCache,
              [threadId]: []
            }
          }));
        }
      },

      fetchThreads: async () => {
        set({ isLoadingThreads: true });
        try {
          const data = await trpcClient.threads.list.query({});

          const threadsRecord: Record<string, Thread> = {};
          data.threads.forEach((thread) => {
            threadsRecord[thread.id] = thread;
          });

          // Merge with existing threads so locally-created/optimistic threads
          // that haven't reached the server yet don't get wiped (the server
          // response wins for ids present in both). Also hydrate the
          // thread→workflow map from the server so the editor can scope its
          // thread list after a fresh load (before any message is sent).
          set((state) => {
            const threadWorkflowId = { ...state.threadWorkflowId };
            for (const thread of data.threads) {
              if (thread.workflow_id != null) {
                threadWorkflowId[thread.id] = thread.workflow_id;
              }
            }
            return {
              threads: { ...state.threads, ...threadsRecord },
              threadWorkflowId,
              threadsLoaded: true,
              error: null
            };
          });
        } catch (error) {
          console.error("Failed to fetch threads:", error);
          set({
            threadsLoaded: true,
            error:
              error instanceof Error
                ? error.message
                : "Failed to load chat threads"
          });
        } finally {
          set({ isLoadingThreads: false });
        }
      },

      fetchThread: async (threadId: string) => {
        try {
          const data = await trpcClient.threads.get.query({ id: threadId });

          set((state) => ({
            threads: {
              ...state.threads,
              [threadId]: data
            }
          }));

          return data;
        } catch (error: unknown) {
          // Surface NOT_FOUND without logging — missing threads are expected
          // when fetching by stale id.
          const isNotFound = isTRPCErrorWithCode(
            error,
            ApiErrorCode.NOT_FOUND
          );
          if (!isNotFound) {
            console.error("Failed to fetch thread:", error);
          }
          return null;
        }
      },

      createNewThread: async (title?: string, workflowId?: string | null) => {
        const safeTitle = typeof title === "string" ? title : undefined;

        // Bind to the passed workflow, or the currently open one. `undefined`
        // means "use current"; an explicit `null` forces a workflow-agnostic
        // thread.
        const boundWorkflowId =
          workflowId !== undefined ? workflowId : get().workflowId ?? null;

        // Create thread locally; server will auto-create on first message
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const localThread: Thread = {
          id,
          user_id: "",
          workflow_id: boundWorkflowId,
          title: safeTitle || "New conversation",
          created_at: now,
          updated_at: now
        };

        // Subscribe first, then atomically store the unsubscribe handle.
        // This avoids the closure being created inside set() where a stale
        // read of wsThreadSubscriptions could leak an old handler.
        const existingUnsub = get().wsThreadSubscriptions[id];
        if (existingUnsub) {
          existingUnsub();
        }
        const newUnsub = globalWebSocketManager.subscribe(id, (data) => {
          captureChatRunSpend(data, id, get);
          handleChatWebSocketMessage(data, set, get, id);
        });

        set((state) => ({
          threads: {
            ...state.threads,
            [id]: localThread
          },
          currentThreadId: id,
          lastUsedThreadId: id,
          threadWorkflowId: {
            ...state.threadWorkflowId,
            [id]: boundWorkflowId
          },
          workflowThreadId: boundWorkflowId
            ? { ...state.workflowThreadId, [boundWorkflowId]: id }
            : state.workflowThreadId,
          messageCache: {
            ...state.messageCache,
            [id]: []
          },
          wsThreadSubscriptions: {
            ...state.wsThreadSubscriptions,
            [id]: newUnsub
          },
          // The new thread becomes current with a fresh (idle) runtime.
          ...mirrorsForThread({ ...state, currentThreadId: id }, id)
        }));

        return id;
      },

      switchThread: (threadId: string) => {
        const exists = !!get().threads[threadId];
        if (!exists) {
          return;
        }

        if (!get().wsThreadSubscriptions[threadId]) {
          const unsub = globalWebSocketManager.subscribe(threadId, (data) => {
            captureChatRunSpend(data, threadId, get);
            handleChatWebSocketMessage(data, set, get, threadId);
          });
          set((state) => {
            const existing = state.wsThreadSubscriptions[threadId];
            if (existing !== undefined) {
              unsub();
              return {};
            }
            return {
              wsThreadSubscriptions: {
                ...state.wsThreadSubscriptions,
                [threadId]: unsub
              }
            };
          });
        }

        set((state) => ({
          currentThreadId: threadId,
          lastUsedThreadId: threadId,
          workflowId:
            state.threads[threadId]?.workflow_id ??
            state.threadWorkflowId[threadId] ??
            state.workflowId,
          // Project the newly-focused thread's runtime onto the legacy
          // top-level mirrors so the UI doesn't carry the previous thread's
          // streaming state.
          ...mirrorsForThread(state, threadId)
        }));
        get().loadMessages(threadId);
      },

      deleteThread: async (threadId: string) => {
        try {
          await trpcClient.threads.delete.mutate({ id: threadId });

          // Update local state
          set((state) => {
            const { [threadId]: deleted, ...remainingThreads } = state.threads;

            // Clear message cache for deleted thread
            const { [threadId]: deletedCache, ...remainingCache } =
              state.messageCache;
            const { [threadId]: deletedCursor, ...remainingCursors } =
              state.messageCursors;
            const { [threadId]: threadUnsubscribe, ...remainingSubscriptions } =
              state.wsThreadSubscriptions;
            threadUnsubscribe?.();
            const { [threadId]: _deletedTodos, ...remainingTodos } =
              state.todosByThread;
            const { [threadId]: deletedRuntime, ...remainingRuntime } =
              state.threadRuntime;
            if (deletedRuntime?.sendMessageTimeoutId != null) {
              clearTimeout(deletedRuntime.sendMessageTimeoutId);
            }

            const newState: Partial<GlobalChatState> = {
              threads: remainingThreads,
              messageCache: remainingCache,
              messageCursors: remainingCursors,
              wsThreadSubscriptions: remainingSubscriptions,
              todosByThread: remainingTodos,
              threadRuntime: remainingRuntime
            };

            // If deleting current thread, switch to another or create new
            if (state.currentThreadId === threadId) {
              const threadIds = Object.keys(remainingThreads);
              if (threadIds.length > 0) {
                const newCurrentThreadId = threadIds[threadIds.length - 1];
                newState.currentThreadId = newCurrentThreadId;
                newState.lastUsedThreadId = newCurrentThreadId;
                // Project the newly-current thread's runtime onto the legacy
                // top-level mirrors (status/statusMessage/progress/task etc.).
                // Without this the mirrors keep reflecting the just-deleted
                // (possibly streaming) thread — same reason switchThread and
                // createNewThread call mirrorsForThread.
                Object.assign(
                  newState,
                  mirrorsForThread(
                    {
                      ...state,
                      threadRuntime: remainingRuntime,
                      currentThreadId: newCurrentThreadId
                    } as GlobalChatState,
                    newCurrentThreadId
                  )
                );
                // Clear any existing loadMessages timeout before setting a new one
                const existingTimeout = get().loadMessagesTimeoutId;
                if (existingTimeout !== null) {
                  clearTimeout(existingTimeout);
                }
                // Auto-load messages for the new current thread, but
                // re-read currentThreadId at fire time so a switchThread
                // call between scheduling and firing doesn't load messages
                // into the wrong thread context.
                const timeoutId = setTimeout(() => {
                  const activeId = get().currentThreadId;
                  if (activeId) {
                    get().loadMessages(activeId);
                  }
                }, 0);
                newState.loadMessagesTimeoutId = timeoutId;
              } else {
                // No threads left, clear current thread (we will create a new one below)
                newState.currentThreadId = null;
                newState.lastUsedThreadId = null;
                // Reset the top-level mirrors to idle defaults so they stop
                // reflecting the deleted thread's runtime.
                Object.assign(
                  newState,
                  mirrorsForThread(
                    {
                      ...state,
                      threadRuntime: {},
                      currentThreadId: null
                    } as GlobalChatState,
                    "__no_thread__"
                  )
                );
              }
            }
            // If the deleted thread was the last used, but not current, pick another if available
            else if (state.lastUsedThreadId === threadId) {
              const threadIds = Object.keys(remainingThreads);
              newState.lastUsedThreadId = threadIds.length
                ? threadIds[threadIds.length - 1]
                : null;
            }

            return newState as GlobalChatState;
          });

          // If no threads remain, create a new one immediately
          const { threads, currentThreadId } = get();
          if (!currentThreadId && Object.keys(threads).length === 0) {
            await get().createNewThread();
          }
        } catch (error) {
          console.error("Failed to delete thread:", error);
          throw error;
        }
      },

      getCurrentMessages: () => {
        const { currentThreadId, messageCache } = get();
        if (!currentThreadId) {
          return [];
        }
        return messageCache[currentThreadId] || [];
      },

      // Get current messages synchronously from cache
      getCurrentMessagesSync: () => {
        const { currentThreadId, messageCache } = get();
        if (!currentThreadId) {
          return [];
        }
        return messageCache[currentThreadId] || [];
      },

      loadMessages: async (threadId: string, cursor?: string) => {
        // Dedupe per thread: concurrent calls for the SAME thread await the
        // one in-flight request, while loads for other threads proceed
        // independently (a store-wide guard used to silently drop them).
        const inFlight = inFlightMessageLoads.get(threadId);
        if (inFlight) {
          return inFlight;
        }

        const load = (async (): Promise<Message[]> => {
          try {
            const data = await trpcClient.messages.list.query({
              thread_id: threadId,
              ...(cursor ? { cursor } : {}),
              limit: 100
            });

            // The tRPC response shape is a strict subset of the web-side
            // `Message` openapi type (which includes agent-specific fields
            // that this endpoint never emits). Cast to the broader type so
            // downstream store operations compile.
            const messages = (data.messages ?? []) as unknown as Message[];
            const nextCursor = data.next;

            set((state) => {
              const existingMessages = state.messageCache[threadId] || [];
              const updatedMessages = cursor
                ? [...existingMessages, ...messages]
                : messages;

              return {
                messageCache: {
                  ...state.messageCache,
                  [threadId]: updatedMessages
                },
                messageCursors: {
                  ...state.messageCursors,
                  [threadId]: nextCursor
                }
              };
            });

            return get().messageCache[threadId] || [];
          } catch (error) {
            console.error("Failed to load messages:", error);
            set({
              error:
                error instanceof Error
                  ? error.message
                  : "Failed to load messages"
            });
            return get().messageCache[threadId] || [];
          }
        })();

        // `isLoadingMessages` stays a store-wide "any load in flight" flag.
        inFlightMessageLoads.set(threadId, load);
        set({ isLoadingMessages: true, error: null });
        try {
          return await load;
        } finally {
          inFlightMessageLoads.delete(threadId);
          if (inFlightMessageLoads.size === 0) {
            set({ isLoadingMessages: false });
          }
        }
      },

      updateThreadTitle: async (threadId: string, title: string) => {
        // Optimistically update local state
        set((state) => {
          const thread = state.threads[threadId];
          if (thread) {
            return {
              threads: {
                ...state.threads,
                [threadId]: {
                  ...thread,
                  title,
                  updated_at: new Date().toISOString()
                }
              }
            } as Partial<GlobalChatState>;
          }
          return state;
        });

        // Best-effort server update
        try {
          await trpcClient.threads.update.mutate({ id: threadId, title });
        } catch (error) {
          console.error("Failed to update thread title:", error);
          // Do not throw to keep optimistic UI
        }
      },

      summarizeThread: async (
        threadId: string,
        _provider: string,
        _model: string,
        _content: string
      ) => {
        // Note: the server derives the title from existing thread messages and
        // ignores provider/model/content. Kept in the signature for backward
        // compatibility with existing callers.
        try {
          const data = await trpcClient.threads.summarize.mutate({
            id: threadId
          });

          // Update the thread in local state if title was changed
          set((state) => {
            const thread = state.threads[threadId];
            if (thread && data.title !== thread.title) {
              return {
                threads: {
                  ...state.threads,
                  [threadId]: {
                    ...thread,
                    title: data.title,
                    updated_at: new Date().toISOString()
                  }
                }
              };
            }
            return state;
          });

          console.info(`Thread ${threadId} summarized successfully`);
        } catch (error) {
          console.error("Failed to summarize thread:", error);
          // Don't throw error - summarization is not critical
        }
      },

      addMessageToCache: (threadId: string, message: Message) => {
        set((state) => {
          const existingMessages = state.messageCache[threadId] || [];
          // Add created_at timestamp if not already present
          const messageWithTimestamp = {
            ...message,
            created_at: message.created_at || new Date().toISOString()
          };
          return {
            messageCache: {
              ...state.messageCache,
              [threadId]: [...existingMessages, messageWithTimestamp]
            }
          };
        });
      },

      clearMessageCache: (threadId: string) => {
        set((state) => {
          const { [threadId]: deleted, ...remainingCache } = state.messageCache;
          const { [threadId]: deletedCursor, ...remainingCursors } =
            state.messageCursors;

          return {
            messageCache: remainingCache,
            messageCursors: remainingCursors
          };
        });
      },

      stopGeneration: (threadId?: string) => {
        const { currentThreadId, loadMessagesTimeoutId } = get();
        const tid = threadId ?? currentThreadId;

        // Pi mode stops via the agent socket, not the /ws stop command.
        if (get().mode === "pi") {
          FrontendToolRegistry.abortAll();
          if (tid) {
            get().stopPi(tid);
          }
          return;
        }

        // Clear the thread's pending sendMessage timeout
        const pendingTimeoutId = getThreadRuntime(get(), tid).sendMessageTimeoutId;
        if (pendingTimeoutId !== null) {
          clearTimeout(pendingTimeoutId);
        }
        // Clear any pending loadMessages timeout
        if (loadMessagesTimeoutId !== null) {
          clearTimeout(loadMessagesTimeoutId);
          set({ loadMessagesTimeoutId: null });
        }

        // Abort any active frontend tools
        FrontendToolRegistry.abortAll();

        // Stopping cancels the run, so drop any pending tool/plan-approval
        // prompts for the current thread — they belong to the cancelled run.
        // Null-thread plan approvals go too: the server's stop command calls
        // approvalBridge.cancelAll(), which cancels every waiter on this
        // socket (including ones from non-thread-bound workflow runs), so
        // keeping their cards would leave orphaned prompts whose responses
        // resolve nothing.
        if (tid) {
          set((state) => {
            const remaining = Object.fromEntries(
              Object.entries(state.pendingApprovals).filter(
                ([, approval]) => approval.thread_id !== tid
              )
            );
            const remainingPlans = Object.fromEntries(
              Object.entries(state.pendingPlanApprovals).filter(
                ([, approval]) =>
                  approval.thread_id !== null && approval.thread_id !== tid
              )
            );
            return {
              pendingApprovals: remaining,
              pendingPlanApprovals: remainingPlans
            };
          });
        }

        if (
          !tid ||
          !globalWebSocketManager ||
          !globalWebSocketManager.isConnectionOpen()
        ) {
          if (tid) {
            set((state) =>
              threadRuntimeUpdate(state, tid, { sendMessageTimeoutId: null })
            );
          }
          return;
        }

        console.info("Sending stop signal to workflow");

        try {
          // Use command wrapper as per unified WebSocket API
          void globalWebSocketManager
            .send({
              command: "stop",
              data: { thread_id: tid }
            })
            .catch((error) => {
              console.error("Failed to send stop signal:", error);
            });

          // Enter "stopping" (not "idle") until the server's `generation_stopped`
          // arrives. The straggler guard in handleChatWebSocketMessage swallows
          // queued chunks/outputs for a thread whose runtime status is
          // "stopping"; going straight to "idle" here would let those late
          // chunks flip the thread back to "streaming" and re-append text after
          // the user hit Stop. `applyGenerationStopped` resets the status to
          // "idle", so a subsequent new generation starts cleanly.
          set((state) => ({
            loadMessagesTimeoutId: null,
            ...threadRuntimeUpdate(state, tid, {
              status: "stopping",
              progress: { current: 0, total: 0 },
              statusMessage: null,
              planningUpdate: null,
              taskUpdate: null,
              sendMessageTimeoutId: null
            })
          }));
        } catch (error) {
          console.error("Failed to send stop signal:", error);
          set((state) => ({
            error: "Failed to stop generation",
            ...threadRuntimeUpdate(state, tid, {
              error: "Failed to stop generation",
              status: "error",
              statusMessage: null,
              sendMessageTimeoutId: null
            })
          }));
        }
      },

      getAgentExecutionMessages: (
        threadId: string,
        agentExecutionId: string
      ) => {
        const messages = get().messageCache[threadId] || [];
        return messages.filter(
          (msg) =>
            msg.role === "agent_execution" &&
            msg.agent_execution_id === agentExecutionId
        );
      }
    }),
    {
      name: "global-chat-storage",
      version: 1,
      // Persist minimal subset incl. selections; do not persist message cache
      // Note: Return type cast needed due to zustand persist middleware type limitations
      partialize: (state) => ({
        threads: state.threads || {},
        lastUsedThreadId: state.lastUsedThreadId,
        selectedModel: state.selectedModel,
        permissionMode: state.permissionMode,
        memoryEnabled: state.memoryEnabled,
        // Per-workflow thread binding + Pi selections so the editor side panel
        // restores the right conversation and agent setup across reloads.
        workflowThreadId: state.workflowThreadId,
        threadWorkflowId: state.threadWorkflowId,
        piModel: state.piModel,
        piWorkspaceId: state.piWorkspaceId,
        piWorkspacePath: state.piWorkspacePath,
        piSessionByThread: state.piSessionByThread
      }) as GlobalChatState,
      migrate: (persistedState, _version) => {
        // Corrupt localStorage (string, null, etc.) must yield a usable
        // default rather than passing the raw value through; selectors
        // that read `threads`/`permissionMode` would otherwise see
        // `undefined` and crash.
        const fallback = {
          threads: {} as Record<string, Thread>,
          lastUsedThreadId: null as string | null,
          selectedModel: null as LanguageModel | null,
          permissionMode: {} as Record<string, PermissionMode>
        };
        if (!persistedState || typeof persistedState !== "object") {
          return fallback as unknown as GlobalChatState;
        }
        const state = persistedState as Record<string, unknown>;
        return {
          threads:
            state.threads &&
            typeof state.threads === "object" &&
            !Array.isArray(state.threads)
              ? (state.threads as Record<string, Thread>)
              : fallback.threads,
          lastUsedThreadId:
            typeof state.lastUsedThreadId === "string"
              ? state.lastUsedThreadId
              : fallback.lastUsedThreadId,
          selectedModel:
            state.selectedModel &&
            typeof state.selectedModel === "object"
              ? (state.selectedModel as LanguageModel)
              : fallback.selectedModel,
          permissionMode:
            state.permissionMode &&
            typeof state.permissionMode === "object" &&
            !Array.isArray(state.permissionMode)
              ? (state.permissionMode as Record<string, PermissionMode>)
              : fallback.permissionMode
        } as unknown as GlobalChatState;
      },
      onRehydrateStorage: () => (state) => {
        // State has been rehydrated from storage
        if (state) {
          // Ensure threads is always an object
          if (!state.threads) {
            state.threads = {};
          }
          // Initialize message cache as empty
          state.messageCache = {};
          state.messageCursors = {};
          state.isLoadingMessages = false;
          state.isLoadingThreads = false;

          // Guard the per-workflow + pi maps against corrupt persisted values
          // (they're read with spreads, so a non-object would crash).
          const asRecord = (value: unknown) =>
            value && typeof value === "object" && !Array.isArray(value)
              ? (value as Record<string, never>)
              : {};
          state.workflowThreadId = asRecord(state.workflowThreadId);
          state.threadWorkflowId = asRecord(state.threadWorkflowId);
          state.piSessionByThread = asRecord(state.piSessionByThread);
          state.piThreadBySession = {};
          if (typeof state.piModel !== "string") {
            state.piModel = "";
          }
          state.mode = state.mode === "pi" ? "pi" : "chat";

          // Load threads from API if not loaded yet
          if (!state.threadsLoaded) {
            // Use setTimeout to avoid calling during hydration
            setTimeout(() => {
              const store = useGlobalChatStore.getState();
              store.fetchThreads().catch((error) => {
                console.error(
                  "Failed to load threads during initialization:",
                  error
                );
              });
            }, 0);
          }
          // Ensure selection defaults are present
          if (!state.permissionMode) {
            state.permissionMode = {};
          }
          if (!state.pendingApprovals) {
            state.pendingApprovals = {};
          }
          if (!state.pendingPlanApprovals) {
            state.pendingPlanApprovals = {};
          }
          if (!state.selectedModel) {
            state.selectedModel = buildDefaultLanguageModel();
          }
          if (typeof state.lastUsedThreadId === "undefined") {
            state.lastUsedThreadId = null;
          }
        }
      }
    }
  )
);

// Network status monitoring
const registerGlobalChatListeners = () => {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleOnline = () => {
    const state = useGlobalChatStore.getState();
    if (state.status === "disconnected" || state.status === "failed") {
      console.info(
        "Network came online, connection will be established automatically"
      );
      // globalWebSocketManager handles reconnection automatically
    }
  };

  const handleOffline = () => {
    console.info("Network went offline");
    // The WebSocket will close automatically, triggering our reconnection logic
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      const state = useGlobalChatStore.getState();
      if (state.status === "disconnected" || state.status === "failed") {
        console.info(
          "Tab became visible, connection will be established automatically"
        );
        // globalWebSocketManager handles reconnection automatically
      }
    }
  };

  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  return () => {
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
};

// Guard against multiple registrations from HMR / multi-bundle loads. Each
// extra import would otherwise install another set of listeners that the
// `return cleanup` path never calls back into.
declare global {
  interface Window {
    __nodetoolGlobalChatListenersBound?: boolean;
    __nodetoolGlobalChatListenersCleanup?: () => void;
  }
}

if (typeof window !== "undefined" && !window.__nodetoolGlobalChatListenersBound) {
  window.__nodetoolGlobalChatListenersBound = true;
  window.__nodetoolGlobalChatListenersCleanup = registerGlobalChatListeners();
}

// Custom hook for TanStack Query thread loading
export const useThreadsQuery = () => {
  const query = useQuery({
    queryKey: ["threads"],
    queryFn: async () => {
      const data = await trpcClient.threads.list.query({ limit: 100 });
      console.debug("Threads fetched:", data);
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false
  });

  // Handle success and error states using useEffect
  React.useEffect(() => {
    if (query.isSuccess && query.data) {
      const threadsRecord: Record<string, Thread> = {};
      query.data.threads.forEach((thread) => {
        threadsRecord[thread.id] = thread;
      });

      // Merge with existing threads so locally-created/optimistic threads
      // that haven't reached the server yet don't get wiped on refetch, and
      // hydrate the thread→workflow map from the server (see fetchThreads).
      useGlobalChatStore.setState((state) => {
        const threadWorkflowId = { ...state.threadWorkflowId };
        for (const thread of query.data.threads) {
          if (thread.workflow_id != null) {
            threadWorkflowId[thread.id] = thread.workflow_id;
          }
        }
        return {
          threads: { ...state.threads, ...threadsRecord },
          threadWorkflowId,
          threadsLoaded: true,
          isLoadingThreads: false
        };
      });
    }
  }, [query.isSuccess, query.data]);

  React.useEffect(() => {
    if (query.isError) {
      // Update store with error state
      useGlobalChatStore.setState({
        threadsLoaded: true,
        isLoadingThreads: false
      });
      console.error("Failed to fetch threads:", query.error);
    }
  }, [query.isError, query.error]);

  return query;
};

/**
 * Subscribe to one thread's generation runtime. Returns the default (idle)
 * runtime for unknown/null thread ids. Use this instead of the top-level
 * status/progress mirrors when the component is bound to a specific thread
 * (e.g. a workspace chat tab) rather than the store's current one.
 */
export const useThreadRuntime = (threadId: string | null): ThreadRuntime =>
  useGlobalChatStore(
    useShallow((state) =>
      threadId
        ? state.threadRuntime[threadId] ?? DEFAULT_THREAD_RUNTIME
        : DEFAULT_THREAD_RUNTIME
    )
  );

export type { ThreadRuntime } from "../core/chat/threadRuntime";

export default useGlobalChatStore;
