import { create } from "zustand";

export type TraceEventType =
  | "node_start"
  | "node_complete"
  | "node_error"
  | "llm_call"
  | "tool_call"
  | "tool_result"
  | "step_result"
  | "todo_update"
  | "edge_active"
  | "output";

export interface TraceEvent {
  id: string;
  timestamp: string;
  relativeMs: number;
  type: TraceEventType;
  nodeId?: string;
  nodeName?: string;
  nodeType?: string;
  summary: string;
  detail: unknown;
}

export interface TraceRunContext {
  workflowId: string;
  workflowName: string;
  jobId?: string;
}

export interface TraceRun {
  id: string;
  startTime: string;
  context: TraceRunContext | null;
  events: TraceEvent[];
}

const MAX_EVENTS = 10_000;
const MAX_RUNS = 10;

interface TraceStoreState {
  runs: TraceRun[];
  activeRunId: string | null;
  selectedRunId: string | null;
  isSelectionPinned: boolean;
  events: TraceEvent[];
  runStartTime: string | null;
  runContext: TraceRunContext | null;
  isRecording: boolean;
  startRun: (
    timestamp: string,
    context?: TraceRunContext,
    options?: { select?: boolean }
  ) => void;
  append: (
    event: TraceEvent,
    scope?: { workflowId: string; jobId?: string }
  ) => void;
  selectRun: (runId: string) => void;
  getActiveRun: () => TraceRun | null;
  clear: () => void;
  exportJSON: () => string;
}

let nextId = 0;
export function traceEventId(): string {
  return `te-${++nextId}`;
}

let nextRunId = 0;

const useTraceStore = create<TraceStoreState>((set, get) => ({
  runs: [],
  activeRunId: null,
  selectedRunId: null,
  isSelectionPinned: false,
  events: [],
  runStartTime: null,
  runContext: null,
  isRecording: false,

  startRun: (
    timestamp: string,
    context?: TraceRunContext,
    options?: { select?: boolean }
  ) =>
    set((state) => {
      const run: TraceRun = {
        id: `trace-run-${++nextRunId}`,
        startTime: timestamp,
        context: context ?? null,
        events: []
      };
      const select = options?.select ?? true;
      const runs = [run, ...state.runs].slice(0, MAX_RUNS);
      const selectedRunRetained = runs.some(
        (candidate) => candidate.id === state.selectedRunId
      );
      const updateSelection = select || !selectedRunRetained;
      return {
        runs,
        activeRunId: run.id,
        selectedRunId: updateSelection ? run.id : state.selectedRunId,
        isSelectionPinned: updateSelection
          ? false
          : state.isSelectionPinned,
        events: updateSelection ? run.events : state.events,
        runStartTime: updateSelection ? run.startTime : state.runStartTime,
        runContext: updateSelection ? run.context : state.runContext,
        isRecording: true
      };
    }),

  append: (event: TraceEvent, scope) =>
    set((state) => {
      if (!state.isRecording) {
        return state;
      }
      const targetRun = scope
        ? state.runs.find(
            (run) =>
              run.context?.workflowId === scope.workflowId &&
              (!scope.jobId || run.context.jobId === scope.jobId)
          )
        : state.runs.find((run) => run.id === state.activeRunId);
      if (!targetRun) {
        return state;
      }
      const events =
        targetRun.events.length >= MAX_EVENTS
          ? [...targetRun.events.slice(1), event]
          : [...targetRun.events, event];
      const runs = state.runs.map((run) =>
        run.id === targetRun.id ? { ...run, events } : run
      );
      return state.selectedRunId === targetRun.id
        ? { runs, events }
        : { runs };
    }),

  selectRun: (runId: string) =>
    set((state) => {
      const run = state.runs.find((candidate) => candidate.id === runId);
      if (!run) {
        return state;
      }
      return {
        selectedRunId: run.id,
        isSelectionPinned: run.id !== state.activeRunId,
        events: run.events,
        runStartTime: run.startTime,
        runContext: run.context
      };
    }),

  getActiveRun: () => {
    const state = get();
    return state.runs.find((run) => run.id === state.activeRunId) ?? null;
  },

  clear: () =>
    set({
      runs: [],
      activeRunId: null,
      selectedRunId: null,
      isSelectionPinned: false,
      events: [],
      runStartTime: null,
      runContext: null,
      isRecording: false
    }),

  exportJSON: () => {
    const { events, runStartTime, runContext } = get();
    return JSON.stringify({ runStartTime, runContext, events }, null, 2);
  },
}));

export default useTraceStore;
