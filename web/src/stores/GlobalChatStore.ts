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
import {
  Message,
  TaskUpdate,
  PlanningUpdate,
  LogUpdate,
  Thread,
  LanguageModel,
  TodoItem,
  PermissionMode
} from "./ApiTypes";
import {
  sendPermissionMode,
  sendPlanApprovalResponse,
  sendSecretRequestResponse,
  sendToolApprovalResponse
} from "../core/chat/chatProtocol";
import { isLocalhost } from "../lib/env";
import { trpcClient } from "../trpc/client";
import {
  isTRPCErrorWithCode,
  ApiErrorCode
} from "@nodetool-ai/protocol/api-schemas";
import {
  isModelSelected,
  NO_MODEL_SELECTED_MESSAGE,
  noMediaModelSelectedMessage
} from "@nodetool-ai/protocol";
import { DEFAULT_MODEL } from "../config/constants";
import { ConnectionState } from "../lib/websocket/WebSocketManager";
import { globalWebSocketManager } from "../lib/websocket/GlobalWebSocketManager";
import { FrontendToolRegistry } from "../lib/tools/frontendTools";
import {
  handleChatWebSocketMessage,
  type ChatStateSetter
} from "../core/chat/chatProtocol";
import type { SubAgentMessages } from "../core/chat/subAgentMessages";
import type { ChatOutgoingMessage } from "./MediaGenerationStore";
import { useShallow } from "zustand/react/shallow";
import {
  DEFAULT_THREAD_RUNTIME,
  getThreadRuntime,
  mirrorsForThread,
  threadRuntimeUpdate,
  type ThreadRuntime
} from "../core/chat/threadRuntime";
import { isObjectLike, isString } from "../utils/typePredicates";

// Include additional runtime statuses used during message streaming
type ChatStatus =
  | ConnectionState
  | "loading"
  | "streaming"
  | "error"
  | "stopping";

export type StepToolCall = {
  id: string;
  name: string;
  args: Record<string, unknown> | null;
  message?: string | null;
  startedAt: number;
  status?: string | null;
};

type AgentExecutionToolCalls = Record<string, Record<string, StepToolCall[]>>;

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
  /** Plain-sentence account of the call; empty when the caller sent none. */
  description: string;
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
  description?: string;
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

/**
 * A pending request for a credential, awaiting the user's own entry. Keyed by
 * `approval_id` in `pendingSecretRequests`.
 *
 * The value is not in this state and never will be: the card writes it
 * straight to the secret store and reports only what happened. That is the
 * whole point of routing a secret through a dialog rather than through the
 * agent — nothing that holds chat state ever holds the credential.
 */
export interface PendingSecretRequest {
  thread_id: string;
  key: string;
  description: string | null;
  reason: string | null;
  help_url: string | null;
}

/** What the user did with the secret dialog. */
export type SecretRequestOutcome = "saved" | "declined";

/** Server → client secret-request payload. */
interface SecretRequest {
  type: "secret_request";
  thread_id: string;
  approval_id: string;
  key: string;
  description: string | null;
  reason: string | null;
  help_url: string | null;
}

/**
 * What became of a send. `ok` means the turn reached the socket; the two
 * failure reasons are the paths that used to return quietly, leaving the
 * caller to assume the turn was on its way.
 *
 * Both refusals happen before the turn is written to the thread cache, so an
 * outcome means nothing was recorded. A send that fails *after* that point
 * rejects instead — a caller holding its own copy of the turn can read the
 * rejection as "it is in the thread now" and stop holding it.
 */
export type ChatSendOutcome =
  | { ok: true; threadId: string }
  | { ok: false; reason: "no_model" | "not_connected"; error: string };

export interface GlobalChatState {
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

  /**
   * Per-thread `chat_seq` high-water marks from resilient chat turns. On
   * reconnect, threads with a generation in flight send `resume_chat` with
   * this cursor and the server replays only what was missed. In-memory only:
   * after a full page reload the cache is rebuilt from REST history instead.
   */
  chatReplayCursors: Record<string, number>;

  /**
   * Clear the current error (e.g. when dismissing an error banner). Pass a
   * thread id to also clear that thread's runtime error — a surface rendering
   * one thread has to drop both, or the banner comes straight back.
   */
  clearError: (threadId?: string) => void;

  // Agent execution trace
  agentExecutionToolCalls: AgentExecutionToolCalls;

  /**
   * Sub-agent transcripts, keyed threadId → spawning tool_call_id. A
   * `run_subtask` child's events never enter `messageCache`; the chat renders
   * them inside the spawning call's card instead.
   */
  subAgentMessages: SubAgentMessages;

  // Selections
  selectedModel: LanguageModel;
  setSelectedModel: (model: LanguageModel) => void;

  // Per-thread permission mode (governs how gated tool calls are handled).
  // A thread with no entry uses lastPermissionMode, then Default.
  permissionMode: Record<string, PermissionMode>;
  lastPermissionMode: PermissionMode;
  getPermissionMode: (threadId: string | null) => PermissionMode;
  setPermissionMode: (threadId: string | null, mode: PermissionMode) => void;

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

  // Inline secret-entry prompts awaiting the user, keyed by approval_id.
  pendingSecretRequests: Record<string, PendingSecretRequest>;
  addPendingSecretRequest: (req: SecretRequest) => void;
  resolveSecretRequest: (
    approvalId: string,
    outcome: SecretRequestOutcome
  ) => void;

  // Planning updates
  currentPlanningUpdate: PlanningUpdate | null;
  setPlanningUpdate: (update: PlanningUpdate | null) => void;

  // Task updates
  currentTaskUpdate: TaskUpdate | null;

  // Log updates
  currentLogUpdate: LogUpdate | null;
  // Per-thread todo lists (TodoWrite-style checklist)
  todosByThread: Record<string, TodoItem[]>;

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
  /**
   * The same send, with its outcome reported instead of swallowed.
   *
   * `sendMessage` returns without throwing when nothing could be sent — no
   * model is selected, or the socket refused to connect — so a caller that
   * consumed something to build the turn (the project agent's staged first
   * prompt) cannot tell a delivered turn from a dropped one. This reports it.
   */
  trySendMessage: (
    message: Message | ChatOutgoingMessage,
    threadId?: string
  ) => Promise<ChatSendOutcome>;
  resetMessages: () => void;

  // Thread actions
  fetchThreads: () => Promise<void>;
  fetchThread: (threadId: string) => Promise<Thread | null>;
  /**
   * Register a thread that exists only on the client. The server creates the
   * row on the first message. No-op when `threadId` is already in `threads`.
   */
  ensureLocalThread: (
    threadId: string,
    options?: {
      title?: string;
      workflowId?: string | null;
      makeCurrent?: boolean;
    }
  ) => void;
  createNewThread: (
    title?: string,
    workflowId?: string | null,
    options?: { makeCurrent?: boolean }
  ) => Promise<string>;
  switchThread: (threadId: string) => void;
  deleteThread: (threadId: string) => Promise<void>;
  getCurrentMessages: () => Message[];
  loadMessages: (threadId: string, cursor?: string) => Promise<Message[]>;
  updateThreadTitle: (threadId: string, title: string) => Promise<void>;
  summarizeThread: (threadId: string) => Promise<void>;
  /** Stop generation on `threadId`, or the current thread when omitted. */
  stopGeneration: (threadId?: string) => void;

  // Message cache management
  addMessageToCache: (threadId: string, message: Message) => void;
}

function buildDefaultLanguageModel(): LanguageModel {
  return {
    type: "language_model",
    provider: "empty",
    id: DEFAULT_MODEL,
    name: DEFAULT_MODEL
  };
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
 * Register the socket handler for one thread, once.
 *
 * Four call sites used to spell this out; two of them without the race guard,
 * so a handler registered between the "already subscribed?" check and the
 * `set` was leaked (it stays on the socket with nothing holding its
 * unsubscribe). Registering twice also delivers every chunk twice.
 */
const ensureThreadSubscription = (
  threadId: string,
  set: ChatStateSetter,
  get: () => GlobalChatState
): void => {
  if (get().wsThreadSubscriptions[threadId]) {
    return;
  }
  const unsubscribe = globalWebSocketManager.subscribe(threadId, (data) => {
    handleChatWebSocketMessage(data, set, get, threadId);
  });
  set((state) => {
    if (state.wsThreadSubscriptions[threadId] !== undefined) {
      unsubscribe();
      return {};
    }
    return {
      wsThreadSubscriptions: {
        ...state.wsThreadSubscriptions,
        [threadId]: unsubscribe
      }
    };
  });
};

/**
 * The slice written to localStorage. Newer keys are optional because a
 * payload persisted before they existed does not carry them, and `migrate`
 * rebuilds what it can — persist merges the rest from the store's initial
 * state.
 */
interface PersistedChatState {
  threads: Record<string, Thread>;
  lastUsedThreadId: string | null;
  selectedModel: LanguageModel | null;
  permissionMode: Record<string, PermissionMode>;
  lastPermissionMode?: PermissionMode;
  workflowThreadId?: Record<string, string>;
  threadWorkflowId?: Record<string, string | null>;
}

const useGlobalChatStore = create<GlobalChatState>()(
  persist<GlobalChatState, [], [], PersistedChatState>(
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
          workflowThreadId: {
            ...state.workflowThreadId,
            [workflowId]: threadId
          },
          threadWorkflowId: {
            ...state.threadWorkflowId,
            [threadId]: workflowId
          }
        }));
        return threadId;
      },

      // Thread state - ensure default values
      threads: {},
      currentThreadId: null as string | null,
      lastUsedThreadId: null as string | null,
      isLoadingThreads: false,
      threadsLoaded: false,

      // Message cache
      messageCache: {},
      messageCursors: {},
      isLoadingMessages: false,
      chatReplayCursors: {},

      clearError: (threadId?: string) =>
        set((state) =>
          threadId
            ? {
                error: null,
                ...threadRuntimeUpdate(state, threadId, { error: null })
              }
            : { error: null }
        ),

      // Agent execution trace
      agentExecutionToolCalls: {},
      subAgentMessages: {},

      // Selections
      selectedModel: buildDefaultLanguageModel(),
      setSelectedModel: (model: LanguageModel) => {
        set({ selectedModel: model });
      },

      // Per-thread permission mode. lastPermissionMode is what the user last
      // picked, so a new chat keeps Auto instead of silently falling back to
      // Default and prompting on a low-risk action.
      permissionMode: {},
      lastPermissionMode: DEFAULT_PERMISSION_MODE,
      getPermissionMode: (threadId: string | null) => {
        if (threadId) {
          const explicit = get().permissionMode[threadId];
          if (explicit) return explicit;
        }
        return get().lastPermissionMode;
      },
      setPermissionMode: (threadId: string | null, mode: PermissionMode) => {
        const pendingIds =
          mode === "auto" && threadId
            ? Object.entries(get().pendingApprovals)
                .filter(([, approval]) => approval.thread_id === threadId)
                .map(([approvalId]) => approvalId)
            : [];
        set((state) => ({
          lastPermissionMode: mode,
          permissionMode: threadId
            ? { ...state.permissionMode, [threadId]: mode }
            : state.permissionMode
        }));
        for (const approvalId of pendingIds) {
          get().resolveApproval(approvalId, "allow");
        }
        if (threadId) {
          void sendPermissionMode(threadId, mode);
        }
      },

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
              description: req.description ?? "",
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

      // Inline secret-entry prompts
      pendingSecretRequests: {},
      addPendingSecretRequest: (req: SecretRequest) =>
        set((state) => ({
          pendingSecretRequests: {
            ...state.pendingSecretRequests,
            [req.approval_id]: {
              thread_id: req.thread_id,
              key: req.key,
              description: req.description ?? null,
              reason: req.reason ?? null,
              help_url: req.help_url ?? null
            }
          }
        })),
      resolveSecretRequest: (
        approvalId: string,
        outcome: SecretRequestOutcome
      ) => {
        if (!get().pendingSecretRequests[approvalId]) return;
        void sendSecretRequestResponse(approvalId, outcome);
        set((state) => {
          const { [approvalId]: _resolved, ...rest } =
            state.pendingSecretRequests;
          return { pendingSecretRequests: rest };
        });
      },

      // Planning updates
      currentPlanningUpdate: null,
      setPlanningUpdate: (update: PlanningUpdate | null) =>
        set({ currentPlanningUpdate: update }),

      // Task updates
      currentTaskUpdate: null,

      // Log updates
      currentLogUpdate: null,

      // Per-thread todo lists
      todosByThread: {},

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
                  statusMessage: Number.isFinite(maxAttempts)
                    ? `Reconnecting... (attempt ${attempt}/${maxAttempts})`
                    : `Reconnecting... (attempt ${attempt})`
                });
              }
            )
          );

          Object.keys(get().threads).forEach((threadId) => {
            ensureThreadSubscription(threadId, set, get);
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

          // After a reconnect, ask the server to replay what each in-flight
          // generation emitted while the socket was down. The server keeps the
          // agent turn running across the disconnect and buffers its frames;
          // `resume_chat` reattaches this connection and replays from the
          // thread's last seen `chat_seq`. Registered after sendManifest so the
          // tools manifest lands before any replayed `tool_call` frames.
          const resumeInFlightThreads = () => {
            const s = get();
            for (const [threadId, runtime] of Object.entries(s.threadRuntime)) {
              if (
                runtime.status !== "loading" &&
                runtime.status !== "streaming" &&
                runtime.status !== "stopping"
              ) {
                continue;
              }
              void globalWebSocketManager
                .send({
                  command: "resume_chat",
                  data: {
                    thread_id: threadId,
                    last_seq: s.chatReplayCursors[threadId] ?? 0
                  }
                })
                .catch((e) =>
                  console.error("Failed to send resume_chat:", threadId, e)
                );
            }
          };
          eventUnsubscribes.push(
            globalWebSocketManager.subscribeEvent("open", resumeInFlightThreads)
          );

          // Discover turns this client knows nothing about. A page reload
          // wipes threadRuntime and the replay cursors, so the loop above
          // finds nothing even though the server kept the agent turn running.
          // `list_chat_turns` answers with one `chat_turn_active` frame per
          // running turn; the protocol handler reattaches each thread.
          const discoverRunningTurns = () => {
            void globalWebSocketManager
              .send({ command: "list_chat_turns", data: {} })
              .catch((e) =>
                console.error("Failed to send list_chat_turns:", e)
              );
          };
          eventUnsubscribes.push(
            globalWebSocketManager.subscribeEvent("open", discoverRunningTurns)
          );

          if (globalWebSocketManager.isConnectionOpen()) {
            sendManifest();
            // The initial connection's "open" fired before these subscribers
            // existed — run discovery for it now that the per-thread handlers
            // are registered.
            discoverRunningTurns();
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
            wsEventUnsubscribes: eventUnsubscribes
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
        await get().trySendMessage(message, targetThreadId);
      },

      trySendMessage: async (
        message: Message | ChatOutgoingMessage,
        targetThreadId?: string
      ): Promise<ChatSendOutcome> => {
        const { currentThreadId, workflowId, selectedModel } = get();

        // Agent mode is no longer a UI toggle — every chat session runs the
        // unified LLM-with-tools loop, and the agent decides for itself
        // whether to escalate via `run_subtask`. `agent_mode` and
        // `agent_planner` are no longer sent on the wire.
        const outgoing = message;
        const mediaGeneration = outgoing.media_generation ?? null;
        const isMediaGeneration =
          !!mediaGeneration && mediaGeneration.mode !== "chat";

        set({ error: null });

        // Nothing is picked yet — the default selection carries the "empty"
        // provider sentinel. Sending would persist the user's turn and then
        // fail in provider resolution, so stop here and say what to do.
        const modelForSend = isMediaGeneration
          ? {
              provider: mediaGeneration?.provider ?? message.provider,
              id: mediaGeneration?.model ?? message.model
            }
          : selectedModel;
        if (!isModelSelected(modelForSend)) {
          const reason = isMediaGeneration
            ? noMediaModelSelectedMessage(mediaGeneration?.mode ?? "media")
            : NO_MODEL_SELECTED_MESSAGE;
          const knownThreadId = targetThreadId ?? currentThreadId;
          set((state) => {
            const patch: Partial<GlobalChatState> = { error: reason };
            if (knownThreadId) {
              Object.assign(
                patch,
                threadRuntimeUpdate(state, knownThreadId, { error: reason })
              );
            }
            return patch;
          });
          return { ok: false, reason: "no_model", error: reason };
        }

        // Ensure WebSocket connection is established before sending
        try {
          await globalWebSocketManager.ensureConnection();
        } catch (connError) {
          const detail =
            connError instanceof Error ? connError.message : String(connError);
          const knownTid = targetThreadId ?? currentThreadId;
          const connectionError = `Not connected to chat service: ${detail}`;
          set((state) => {
            const patch: Partial<GlobalChatState> = { error: connectionError };
            if (knownTid) {
              Object.assign(
                patch,
                threadRuntimeUpdate(state, knownTid, {
                  error: connectionError
                })
              );
            }
            return patch;
          });
          return {
            ok: false,
            reason: "not_connected",
            error: connectionError
          };
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
        ensureThreadSubscription(tid, set, get);

        // Targeted sends (chat tabs) keep the thread's own workflow binding;
        // untargeted sends bind the thread to the currently-open workflow as
        // before.
        const boundWorkflowId = targetThreadId
          ? (get().threads[tid]?.workflow_id ??
            get().threadWorkflowId[tid] ??
            null)
          : (workflowId ?? null);
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
          thread_id: threadId
        };
        if (mediaGeneration) {
          messageForCache.media_generation = mediaGeneration;
        }

        // Build the chat_message command data. Media-generation messages
        // use the provider/model chosen in the media composer instead of the
        // default language model so text-to-image / text-to-video calls are
        // routed correctly on the server.
        // The client no longer drives the toolbelt: `tools` and `collections`
        // are dropped from the send path. The active per-thread permission
        // mode is sent instead and governs how the agent's gated tool calls
        // are handled server-side.
        const {
          tools: _tools,
          collections: _collections,
          ...messageWithoutTools
        } = message;
        const chatMessageData = {
          ...messageWithoutTools,
          workflow_id: message.workflow_id ?? boundWorkflowId,
          thread_id: threadId,
          permission_mode: get().getPermissionMode(threadId),
          model: isMediaGeneration
            ? (mediaGeneration?.model ?? message.model ?? selectedModel?.id)
            : selectedModel?.id,
          provider: isMediaGeneration
            ? (mediaGeneration?.provider ??
              message.provider ??
              selectedModel?.provider)
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
          const timeoutId = setTimeout(
            () => {
              const runtime = getThreadRuntime(get(), tid);
              if (
                runtime.status === "loading" ||
                runtime.status === "streaming"
              ) {
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
            },
            5 * 60 * 1000
          );
          set((state) =>
            threadRuntimeUpdate(state, tid, { sendMessageTimeoutId: timeoutId })
          );
          return { ok: true, threadId: tid };
        } catch (error) {
          // Clear this thread's timeout on error
          const currentTimeoutId = getThreadRuntime(
            get(),
            tid
          ).sendMessageTimeoutId;
          if (currentTimeoutId !== null) {
            clearTimeout(currentTimeoutId);
          }
          // Thrown, not returned: the optimistic turn is already in the thread
          // cache by here, and callers tell the two apart by that (see
          // ChatSendOutcome).
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
          const data = await trpcClient.threads.list.query({ limit: 100 });

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
          const isNotFound = isTRPCErrorWithCode(error, ApiErrorCode.NOT_FOUND);
          if (!isNotFound) {
            console.error("Failed to fetch thread:", error);
          }
          return null;
        }
      },

      ensureLocalThread: (threadId, options) => {
        if (get().threads[threadId]) {
          return;
        }

        const safeTitle = isString(options?.title) ? options.title : undefined;
        const makeCurrent = options?.makeCurrent === true;
        const boundWorkflowId =
          options?.workflowId !== undefined
            ? options.workflowId
            : (get().workflowId ?? null);

        ensureThreadSubscription(threadId, set, get);

        const now = new Date().toISOString();
        const localThread: Thread = {
          id: threadId,
          user_id: "",
          workflow_id: boundWorkflowId,
          title: safeTitle || "New conversation",
          created_at: now,
          updated_at: now
        };
        const inheritedMode = get().lastPermissionMode;

        set((state) => {
          const patch: Partial<GlobalChatState> = {
            threads: {
              ...state.threads,
              [threadId]: localThread
            },
            permissionMode: {
              ...state.permissionMode,
              [threadId]: inheritedMode
            },
            threadWorkflowId: {
              ...state.threadWorkflowId,
              [threadId]: boundWorkflowId
            },
            messageCache: {
              ...state.messageCache,
              [threadId]: []
            },
          };
          if (makeCurrent) {
            patch.currentThreadId = threadId;
            patch.lastUsedThreadId = threadId;
            patch.workflowThreadId = boundWorkflowId
              ? { ...state.workflowThreadId, [boundWorkflowId]: threadId }
              : state.workflowThreadId;
            Object.assign(
              patch,
              mirrorsForThread(
                { ...state, currentThreadId: threadId },
                threadId
              )
            );
          }
          return patch;
        });
      },

      createNewThread: async (
        title?: string,
        workflowId?: string | null,
        options?: { makeCurrent?: boolean }
      ) => {
        const id = crypto.randomUUID();
        get().ensureLocalThread(id, {
          title: isString(title) ? title : undefined,
          workflowId,
          makeCurrent: options?.makeCurrent !== false
        });
        return id;
      },

      switchThread: (threadId: string) => {
        const exists = !!get().threads[threadId];
        if (!exists) {
          return;
        }

        ensureThreadSubscription(threadId, set, get);

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
            const { [threadId]: _deletedSubAgents, ...remainingSubAgents } =
              state.subAgentMessages;
            const {
              [threadId]: _deletedReplayCursor,
              ...remainingReplayCursors
            } = state.chatReplayCursors;
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
              subAgentMessages: remainingSubAgents,
              threadRuntime: remainingRuntime,
              chatReplayCursors: remainingReplayCursors
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
                    },
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
                    },
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

            return newState;
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
            const listInput: Parameters<
              typeof trpcClient.messages.list.query
            >[0] = { thread_id: threadId, limit: 100 };
            if (cursor) listInput.cursor = cursor;
            const data = await trpcClient.messages.list.query(listInput);

            // SAFETY: the tRPC response shape is a strict subset of the
            // web-side `Message` openapi type — the endpoint never emits the
            // agent-specific fields that type adds, and every one of them is
            // optional, so each row read here is a `Message` at run time.
            const messages = (data.messages ?? []) as Message[];
            const nextCursor = data.next;

            set((state) => {
              const existingMessages = state.messageCache[threadId] || [];
              // A full refresh replaces the cache with persisted history —
              // but the trailing `local-stream-*` placeholder holds streamed
              // text of a reply that is not persisted yet (it exists while a
              // resume replay and this REST load race), so carry it over
              // instead of wiping it.
              const updatedMessages = cursor
                ? [...existingMessages, ...messages]
                : [
                    ...messages,
                    ...existingMessages.filter(
                      (m) =>
                        isString(m.id) &&
                        m.id.startsWith("local-stream-")
                    )
                  ];

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
            };
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

      // The server derives the title from the thread's stored messages.
      summarizeThread: async (threadId: string) => {
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

      stopGeneration: (threadId?: string) => {
        const { currentThreadId, loadMessagesTimeoutId } = get();
        const tid = threadId ?? currentThreadId;

        // Clear the thread's pending sendMessage timeout
        const pendingTimeoutId = getThreadRuntime(
          get(),
          tid
        ).sendMessageTimeoutId;
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
            const remainingSecrets = Object.fromEntries(
              Object.entries(state.pendingSecretRequests).filter(
                ([, request]) => request.thread_id !== tid
              )
            );
            return {
              pendingApprovals: remaining,
              pendingPlanApprovals: remainingPlans,
              pendingSecretRequests: remainingSecrets
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
      }
    }),
    {
      name: "global-chat-storage",
      version: 1,
      // Persist minimal subset incl. selections; do not persist message cache
      partialize: (state) =>
        ({
          threads: state.threads || {},
          lastUsedThreadId: state.lastUsedThreadId,
          selectedModel: state.selectedModel,
          permissionMode: state.permissionMode,
          lastPermissionMode: state.lastPermissionMode,
          // Per-workflow thread binding so the editor side panel restores the
          // right conversation across reloads.
          workflowThreadId: state.workflowThreadId,
          threadWorkflowId: state.threadWorkflowId
        }),
      // Default persist merge is shallow, so a rehydrate that finishes after
      // createNewThread would replace `threads` and drop the new conversation.
      merge: (persistedState, currentState) => {
        if (!isObjectLike(persistedState) || Array.isArray(persistedState)) {
          return currentState;
        }
        const persisted = persistedState as Partial<PersistedChatState>;
        // SAFETY: overlay is a persisted subset; the four maps are rebuilt so
        // in-memory keys win over a late rehydrate.
        return {
          ...currentState,
          ...persisted,
          threads: {
            ...(persisted.threads ?? {}),
            ...currentState.threads
          },
          permissionMode: {
            ...(persisted.permissionMode ?? {}),
            ...currentState.permissionMode
          },
          workflowThreadId: {
            ...(persisted.workflowThreadId ?? {}),
            ...currentState.workflowThreadId
          },
          threadWorkflowId: {
            ...(persisted.threadWorkflowId ?? {}),
            ...currentState.threadWorkflowId
          }
        } as GlobalChatState;
      },
      migrate: (persistedState, _version) => {
        // Corrupt localStorage (string, null, etc.) must yield a usable
        // default rather than passing the raw value through; selectors
        // that read `threads`/`permissionMode` would otherwise see
        // `undefined` and crash.
        const fallback = {
          threads: {},
          lastUsedThreadId: null as string | null,
          selectedModel: null as LanguageModel | null,
          permissionMode: {},
          lastPermissionMode: DEFAULT_PERMISSION_MODE as PermissionMode
        };
        if (!persistedState || !isObjectLike(persistedState)) {
          return fallback;
        }
        const state = persistedState as Record<string, unknown>;
        return {
          threads:
            state.threads &&
            isObjectLike(state.threads) &&
            !Array.isArray(state.threads)
              ? (state.threads as Record<string, Thread>)
              : fallback.threads,
          lastUsedThreadId:
            isString(state.lastUsedThreadId)
              ? state.lastUsedThreadId
              : fallback.lastUsedThreadId,
          selectedModel:
            state.selectedModel && typeof state.selectedModel === "object"
              ? (state.selectedModel as LanguageModel)
              : fallback.selectedModel,
          permissionMode:
            state.permissionMode &&
            isObjectLike(state.permissionMode) &&
            !Array.isArray(state.permissionMode)
              ? (state.permissionMode as Record<string, PermissionMode>)
              : fallback.permissionMode,
          lastPermissionMode:
            state.lastPermissionMode === "plan" ||
            state.lastPermissionMode === "auto" ||
            state.lastPermissionMode === "default"
              ? state.lastPermissionMode
              : fallback.lastPermissionMode
        };
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

          // Guard the per-workflow maps against corrupt persisted values
          // (they're read with spreads, so a non-object would crash).
          const asRecord = (value: unknown) =>
            value && typeof value === "object" && !Array.isArray(value)
              ? (value as Record<string, never>)
              : {};
          state.workflowThreadId = asRecord(state.workflowThreadId);
          state.threadWorkflowId = asRecord(state.threadWorkflowId);

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
          if (
            state.lastPermissionMode !== "plan" &&
            state.lastPermissionMode !== "auto" &&
            state.lastPermissionMode !== "default"
          ) {
            state.lastPermissionMode = DEFAULT_PERMISSION_MODE;
          }
          if (!state.pendingApprovals) {
            state.pendingApprovals = {};
          }
          if (!state.pendingPlanApprovals) {
            state.pendingPlanApprovals = {};
          }
          if (!state.pendingSecretRequests) {
            state.pendingSecretRequests = {};
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
        ? (state.threadRuntime[threadId] ?? DEFAULT_THREAD_RUNTIME)
        : DEFAULT_THREAD_RUNTIME
    )
  );

export type { ThreadRuntime } from "../core/chat/threadRuntime";

export default useGlobalChatStore;
