import {
  DEFAULT_THREAD_RUNTIME,
  getThreadRuntime,
  threadRuntimeUpdate,
  mirrorsForThread
} from "../threadRuntime";
import type { GlobalChatState } from "../../../stores/GlobalChatStore";
import type {
  TaskUpdate,
  PlanningUpdate,
  LogUpdate
} from "../../../stores/ApiTypes";
import { TaskUpdateEvent } from "@nodetool-ai/protocol";

const makeState = (
  overrides: Partial<GlobalChatState> = {}
): GlobalChatState =>
  ({
    currentThreadId: null,
    threadRuntime: {},
    status: "connected",
    statusMessage: null,
    progress: { current: 0, total: 0 },
    error: null,
    currentPlanningUpdate: null,
    currentTaskUpdate: null,
    currentTaskUpdateThreadId: null,
    currentLogUpdate: null,
    currentRunningToolCallId: null,
    currentToolMessage: null,
    ...overrides
  }) as unknown as GlobalChatState;

describe("threadRuntime", () => {
  describe("getThreadRuntime", () => {
    it("returns DEFAULT_THREAD_RUNTIME for null threadId", () => {
      const state = makeState();
      expect(getThreadRuntime(state, null)).toBe(DEFAULT_THREAD_RUNTIME);
    });

    it("returns DEFAULT_THREAD_RUNTIME for undefined threadId", () => {
      const state = makeState();
      expect(getThreadRuntime(state, undefined)).toBe(DEFAULT_THREAD_RUNTIME);
    });

    it("returns DEFAULT_THREAD_RUNTIME when thread has no entry", () => {
      const state = makeState();
      expect(getThreadRuntime(state, "t1")).toBe(DEFAULT_THREAD_RUNTIME);
    });

    it("returns the stored runtime for a known thread", () => {
      const rt = { ...DEFAULT_THREAD_RUNTIME, status: "streaming" as const };
      const state = makeState({ threadRuntime: { t1: rt } });
      expect(getThreadRuntime(state, "t1")).toBe(rt);
    });

    it("returns DEFAULT_THREAD_RUNTIME when threadRuntime map is undefined", () => {
      const state = makeState({ threadRuntime: undefined as never });
      expect(getThreadRuntime(state, "t1")).toBe(DEFAULT_THREAD_RUNTIME);
    });
  });

  describe("threadRuntimeUpdate", () => {
    it("creates a new runtime entry from DEFAULT when none exists", () => {
      const state = makeState({ currentThreadId: "t1" });
      const update = threadRuntimeUpdate(state, "t1", {
        status: "loading"
      });
      expect(update.threadRuntime?.["t1"]?.status).toBe("loading");
      expect(update.threadRuntime?.["t1"]?.error).toBeNull();
    });

    it("merges patch into an existing runtime entry", () => {
      const existing = {
        ...DEFAULT_THREAD_RUNTIME,
        status: "streaming" as const,
        progress: { current: 3, total: 10 }
      };
      const state = makeState({
        currentThreadId: "t1",
        threadRuntime: { t1: existing }
      });
      const update = threadRuntimeUpdate(state, "t1", {
        progress: { current: 5, total: 10 }
      });
      expect(update.threadRuntime?.["t1"]?.status).toBe("streaming");
      expect(update.threadRuntime?.["t1"]?.progress).toEqual({
        current: 5,
        total: 10
      });
    });

    it("mirrors status onto top-level when thread is current", () => {
      const state = makeState({ currentThreadId: "t1" });
      const update = threadRuntimeUpdate(state, "t1", {
        status: "streaming"
      });
      expect(update.status).toBe("streaming");
    });

    it("maps idle status to connected in the mirror", () => {
      const state = makeState({ currentThreadId: "t1" });
      const update = threadRuntimeUpdate(state, "t1", { status: "idle" });
      expect(update.status).toBe("connected");
    });

    it("does not mirror when thread is not the current thread", () => {
      const state = makeState({ currentThreadId: "t2" });
      const update = threadRuntimeUpdate(state, "t1", {
        status: "streaming",
        statusMessage: "Generating..."
      });
      expect(update.status).toBeUndefined();
      expect(update.statusMessage).toBeUndefined();
    });

    it("mirrors taskUpdate and sets taskUpdateThreadId", () => {
      const taskUpdate: TaskUpdate = {
        type: "task_update",
        task: { id: "task1", name: "Plan", status: "running", steps: [] },
        event: TaskUpdateEvent.TaskPlanned
      };
      const state = makeState({ currentThreadId: "t1" });
      const update = threadRuntimeUpdate(state, "t1", { taskUpdate });
      expect(update.currentTaskUpdate).toBe(taskUpdate);
      expect(update.currentTaskUpdateThreadId).toBe("t1");
    });

    it("clears taskUpdateThreadId when taskUpdate is null", () => {
      const state = makeState({ currentThreadId: "t1" });
      const update = threadRuntimeUpdate(state, "t1", { taskUpdate: null });
      expect(update.currentTaskUpdate).toBeNull();
      expect(update.currentTaskUpdateThreadId).toBeNull();
    });

    it("preserves other threads in the runtime map", () => {
      const otherRt = { ...DEFAULT_THREAD_RUNTIME, status: "error" as const };
      const state = makeState({
        currentThreadId: "t1",
        threadRuntime: { t2: otherRt }
      });
      const update = threadRuntimeUpdate(state, "t1", {
        status: "loading"
      });
      expect(update.threadRuntime?.["t2"]).toBe(otherRt);
    });

    it("mirrors all runtime fields when thread is current", () => {
      const state = makeState({ currentThreadId: "t1" });
      const update = threadRuntimeUpdate(state, "t1", {
        statusMessage: "Processing...",
        error: "Something broke",
        runningToolCallId: "tc-1",
        toolMessage: "Running tool..."
      });
      expect(update.statusMessage).toBe("Processing...");
      expect(update.error).toBe("Something broke");
      expect(update.currentRunningToolCallId).toBe("tc-1");
      expect(update.currentToolMessage).toBe("Running tool...");
    });
  });

  describe("mirrorsForThread", () => {
    it("projects idle runtime as connected when top-level status is a runtime status", () => {
      const state = makeState({
        status: "streaming",
        threadRuntime: { t1: DEFAULT_THREAD_RUNTIME }
      });
      const mirror = mirrorsForThread(state, "t1");
      expect(mirror.status).toBe("connected");
    });

    it("preserves non-runtime top-level status when thread is idle", () => {
      const state = makeState({
        status: "disconnected" as GlobalChatState["status"],
        threadRuntime: { t1: DEFAULT_THREAD_RUNTIME }
      });
      const mirror = mirrorsForThread(state, "t1");
      expect(mirror.status).toBe("disconnected");
    });

    it("uses the thread status when not idle", () => {
      const rt = { ...DEFAULT_THREAD_RUNTIME, status: "loading" as const };
      const state = makeState({
        status: "connected",
        threadRuntime: { t1: rt }
      });
      const mirror = mirrorsForThread(state, "t1");
      expect(mirror.status).toBe("loading");
    });

    it("projects all runtime fields to legacy mirror fields", () => {
      const planningUpdate: PlanningUpdate = {
        type: "planning_update",
        phase: "thinking",
        status: "in_progress"
      };
      const taskUpdate: TaskUpdate = {
        type: "task_update",
        task: { id: "t", name: "T", status: "running", steps: [] },
        event: TaskUpdateEvent.TaskPlanned
      };
      const logUpdate: LogUpdate = {
        type: "log_update",
        node_id: "n1",
        node_name: "Node1",
        content: "log message",
        severity: "info"
      };
      const rt = {
        ...DEFAULT_THREAD_RUNTIME,
        statusMessage: "Thinking...",
        progress: { current: 2, total: 5 },
        planningUpdate,
        taskUpdate,
        logUpdate,
        runningToolCallId: "tc-2",
        toolMessage: "Executing..."
      };
      const state = makeState({ threadRuntime: { t1: rt } });
      const mirror = mirrorsForThread(state, "t1");
      expect(mirror.statusMessage).toBe("Thinking...");
      expect(mirror.progress).toEqual({ current: 2, total: 5 });
      expect(mirror.currentPlanningUpdate).toBe(planningUpdate);
      expect(mirror.currentTaskUpdate).toBe(taskUpdate);
      expect(mirror.currentTaskUpdateThreadId).toBe("t1");
      expect(mirror.currentLogUpdate).toBe(logUpdate);
      expect(mirror.currentRunningToolCallId).toBe("tc-2");
      expect(mirror.currentToolMessage).toBe("Executing...");
    });

    it("sets currentTaskUpdateThreadId to null when there is no task update", () => {
      const state = makeState({
        threadRuntime: { t1: DEFAULT_THREAD_RUNTIME }
      });
      const mirror = mirrorsForThread(state, "t1");
      expect(mirror.currentTaskUpdate).toBeNull();
      expect(mirror.currentTaskUpdateThreadId).toBeNull();
    });
  });
});
