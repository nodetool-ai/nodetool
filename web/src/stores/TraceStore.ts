import { create } from "zustand";

export type RunInspectionView = "trace" | "logs";
export interface RunInspectionTarget {
  runId: string;
  spanId?: string;
  view?: RunInspectionView;
}

interface TraceStoreState {
  selectedRunId: string | null;
  focusedSpanId: string | null;
  view: RunInspectionView;
  selectRun: (runId: string) => void;
  focusSpan: (spanId: string | null) => void;
  setView: (view: RunInspectionView) => void;
  openInspection: (target: RunInspectionTarget) => void;
  clear: () => void;
}

// Selection is client state. Durable records and live projections belong to
// the runs queries so a reload never depends on a processing-message fold.
const useTraceStore = create<TraceStoreState>((set) => ({
  selectedRunId: null,
  focusedSpanId: null,
  view: "trace",
  selectRun: (runId) => set({ selectedRunId: runId, focusedSpanId: null }),
  focusSpan: (spanId) => set({ focusedSpanId: spanId }),
  setView: (view) => set({ view }),
  openInspection: ({ runId, spanId, view }) => set({
    selectedRunId: runId,
    focusedSpanId: spanId ?? null,
    view: view ?? "trace"
  }),
  clear: () => set({ selectedRunId: null, focusedSpanId: null, view: "trace" })
}));

export default useTraceStore;
