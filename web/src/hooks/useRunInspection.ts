import { useCallback } from "react";
import useTraceStore, { type RunInspectionTarget, type RunInspectionView } from "../stores/TraceStore";
import { useBottomPanelStore } from "../stores/BottomPanelStore";

interface RunInspection {
  selectedRunId: string | null;
  focusedSpanId: string | null;
  view: RunInspectionView;
  openRunInspection: (target: RunInspectionTarget) => void;
}

export function useRunInspection(): RunInspection {
  const selectedRunId = useTraceStore((state) => state.selectedRunId);
  const focusedSpanId = useTraceStore((state) => state.focusedSpanId);
  const view = useTraceStore((state) => state.view);
  const openInspection = useTraceStore((state) => state.openInspection);
  const setActiveView = useBottomPanelStore((state) => state.setActiveView);
  const setVisibility = useBottomPanelStore((state) => state.setVisibility);
  const openRunInspection = useCallback((target: RunInspectionTarget) => {
    openInspection(target);
    setActiveView(target.view ?? "trace");
    setVisibility(true);
  }, [openInspection, setActiveView, setVisibility]);
  return { selectedRunId, focusedSpanId, view, openRunInspection };
}
