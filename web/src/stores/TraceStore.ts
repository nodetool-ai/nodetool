import { create } from "zustand";

export type RunInspectionView = "trace" | "logs";
export interface RunInspectionTarget {
  runId: string;
  spanId?: string;
  view?: RunInspectionView;
  /** The workflow the run belongs to. The panel ignores the pick in other workflows. */
  workflowId?: string | null;
  /** Focus this node's span once the run's trace loads. */
  nodeId?: string;
}

interface TraceStoreState {
  selectedRunId: string | null;
  /** The workflow `selectedRunId` was picked in, or null outside a workflow. */
  selectedRunWorkflowId: string | null;
  focusedSpanId: string | null;
  /** A node whose span is focused when the selected run's trace arrives. */
  pendingNodeId: string | null;
  view: RunInspectionView;
  selectRun: (runId: string, workflowId?: string | null) => void;
  focusSpan: (spanId: string | null) => void;
  setView: (view: RunInspectionView) => void;
  openInspection: (target: RunInspectionTarget) => void;
  clear: () => void;
}

// Selection is client state. Durable records and live projections belong to
// the runs queries so a reload never depends on a processing-message fold.
const useTraceStore = create<TraceStoreState>((set) => ({
  selectedRunId: null,
  selectedRunWorkflowId: null,
  focusedSpanId: null,
  pendingNodeId: null,
  view: "trace",
  selectRun: (runId, workflowId) => set({
    selectedRunId: runId,
    selectedRunWorkflowId: workflowId ?? null,
    focusedSpanId: null,
    pendingNodeId: null
  }),
  focusSpan: (spanId) => set({ focusedSpanId: spanId, pendingNodeId: null }),
  setView: (view) => set({ view }),
  openInspection: ({ runId, spanId, view, workflowId, nodeId }) => set({
    selectedRunId: runId,
    selectedRunWorkflowId: workflowId ?? null,
    focusedSpanId: spanId ?? null,
    pendingNodeId: nodeId ?? null,
    view: view ?? "trace"
  }),
  clear: () => set({
    selectedRunId: null,
    selectedRunWorkflowId: null,
    focusedSpanId: null,
    pendingNodeId: null,
    view: "trace"
  })
}));

export default useTraceStore;
