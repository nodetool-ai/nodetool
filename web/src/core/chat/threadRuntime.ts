/**
 * Per-thread chat runtime state.
 *
 * GlobalChatStore keeps one WebSocket but many concurrently-live threads:
 * each thread carries its own streaming status, progress, planning/task/log
 * updates, tool-call state, and safety timeout in `threadRuntime`. The store's
 * legacy top-level fields (`status`, `statusMessage`, `currentTaskUpdate`, …)
 * are mirrors of the *current* thread's runtime, kept in sync by
 * `threadRuntimeUpdate`/`mirrorsForThread` so single-thread consumers
 * (GlobalChat, editor side panels) keep working unchanged.
 */
import type {
  PlanningUpdate,
  TaskUpdate,
  LogUpdate
} from "../../stores/ApiTypes";
import type { GlobalChatState } from "../../stores/GlobalChatStore";

/**
 * A thread's generation lifecycle. "idle" means no generation in flight — the
 * legacy mirror projects it to the connection-level "connected".
 */
export type ThreadRuntimeStatus =
  | "idle"
  | "loading"
  | "streaming"
  | "error"
  | "stopping";

export interface ThreadRuntime {
  status: ThreadRuntimeStatus;
  statusMessage: string | null;
  progress: { current: number; total: number };
  error: string | null;
  planningUpdate: PlanningUpdate | null;
  taskUpdate: TaskUpdate | null;
  logUpdate: LogUpdate | null;
  runningToolCallId: string | null;
  toolMessage: string | null;
  /** Safety timeout that resets a stuck loading/streaming state. */
  sendMessageTimeoutId: ReturnType<typeof setTimeout> | null;
}

export const DEFAULT_THREAD_RUNTIME: ThreadRuntime = {
  status: "idle",
  statusMessage: null,
  progress: { current: 0, total: 0 },
  error: null,
  planningUpdate: null,
  taskUpdate: null,
  logUpdate: null,
  runningToolCallId: null,
  toolMessage: null,
  sendMessageTimeoutId: null
};

export const getThreadRuntime = (
  state: Pick<GlobalChatState, "threadRuntime">,
  threadId: string | null | undefined
): ThreadRuntime =>
  (threadId ? state.threadRuntime?.[threadId] : undefined) ??
  DEFAULT_THREAD_RUNTIME;

/** Runtime statuses that occupy the legacy top-level `status` field. */
const RUNTIME_STATUSES: ReadonlyArray<GlobalChatState["status"]> = [
  "loading",
  "streaming",
  "error",
  "stopping"
];

/** Project a runtime-patch onto the legacy top-level mirror fields. */
const mirrorFromPatch = (
  patch: Partial<ThreadRuntime>,
  threadId: string
): Partial<GlobalChatState> => {
  const mirror: Partial<GlobalChatState> = {};
  if ("status" in patch && patch.status !== undefined) {
    mirror.status = patch.status === "idle" ? "connected" : patch.status;
  }
  if ("statusMessage" in patch) {
    mirror.statusMessage = patch.statusMessage ?? null;
  }
  if ("progress" in patch && patch.progress) {
    mirror.progress = patch.progress;
  }
  if ("error" in patch) {
    mirror.error = patch.error ?? null;
  }
  if ("planningUpdate" in patch) {
    mirror.currentPlanningUpdate = patch.planningUpdate ?? null;
  }
  if ("taskUpdate" in patch) {
    mirror.currentTaskUpdate = patch.taskUpdate ?? null;
    mirror.currentTaskUpdateThreadId = patch.taskUpdate ? threadId : null;
  }
  if ("logUpdate" in patch) {
    mirror.currentLogUpdate = patch.logUpdate ?? null;
  }
  if ("runningToolCallId" in patch) {
    mirror.currentRunningToolCallId = patch.runningToolCallId ?? null;
  }
  if ("toolMessage" in patch) {
    mirror.currentToolMessage = patch.toolMessage ?? null;
  }
  return mirror;
};

/**
 * Build a store update that applies `patch` to one thread's runtime and, when
 * that thread is the current one, mirrors the patched fields onto the legacy
 * top-level fields.
 */
export const threadRuntimeUpdate = (
  state: GlobalChatState,
  threadId: string,
  patch: Partial<ThreadRuntime>
): Partial<GlobalChatState> => {
  const next = { ...getThreadRuntime(state, threadId), ...patch };
  const update: Partial<GlobalChatState> = {
    threadRuntime: { ...(state.threadRuntime ?? {}), [threadId]: next }
  };
  if (state.currentThreadId === threadId) {
    Object.assign(update, mirrorFromPatch(patch, threadId));
  }
  return update;
};

/**
 * Full mirror projection for a thread — used when the current thread changes,
 * so the top-level fields immediately reflect the newly-focused thread instead
 * of carrying the previous thread's streaming state.
 *
 * `error` is deliberately not projected: the top-level error also carries
 * connection-level failures that must survive a thread switch.
 */
export const mirrorsForThread = (
  state: GlobalChatState,
  threadId: string
): Partial<GlobalChatState> => {
  const rt = getThreadRuntime(state, threadId);
  return {
    status:
      rt.status !== "idle"
        ? rt.status
        : RUNTIME_STATUSES.includes(state.status)
          ? "connected"
          : state.status,
    statusMessage: rt.statusMessage,
    progress: rt.progress,
    currentPlanningUpdate: rt.planningUpdate,
    currentTaskUpdate: rt.taskUpdate,
    currentTaskUpdateThreadId: rt.taskUpdate ? threadId : null,
    currentLogUpdate: rt.logUpdate,
    currentRunningToolCallId: rt.runningToolCallId,
    currentToolMessage: rt.toolMessage
  };
};
