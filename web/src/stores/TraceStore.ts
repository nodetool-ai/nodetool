import { create } from "zustand";

export type TraceEventType =
  | "node_start"
  | "node_complete"
  | "node_error"
  | "llm_call"
  | "tool_call"
  | "tool_result"
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

const MAX_EVENTS = 10_000;

interface TraceStoreState {
  events: TraceEvent[];
  runStartTime: string | null;
  isRecording: boolean;
  startRun: (timestamp: string) => void;
  append: (event: TraceEvent) => void;
  clear: () => void;
  exportJSON: () => string;
}

let nextId = 0;
export function traceEventId(): string {
  return `te-${++nextId}`;
}

const useTraceStore = create<TraceStoreState>((set, get) => ({
  events: [],
  runStartTime: null,
  isRecording: false,

  startRun: (timestamp: string) =>
    set({ events: [], runStartTime: timestamp, isRecording: true }),

  append: (event: TraceEvent) =>
    set((state) => {
      if (!state.isRecording) return state;
      const events =
        state.events.length >= MAX_EVENTS
          ? [...state.events.slice(1), event]
          : [...state.events, event];
      return { events };
    }),

  clear: () => set({ events: [], runStartTime: null, isRecording: false }),

  exportJSON: () => {
    const { events, runStartTime } = get();
    return JSON.stringify({ runStartTime, events }, null, 2);
  },
}));

export default useTraceStore;
