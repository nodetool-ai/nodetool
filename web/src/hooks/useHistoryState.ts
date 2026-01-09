import { useMemo } from "react";
import { useTemporalNodes } from "../contexts/NodeContext";

interface UseHistoryStateReturn {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  pastCount: number;
  futureCount: number;
}

export const useHistoryState = (): UseHistoryStateReturn => {
  const { pastStates, futureStates, undo, redo } = useTemporalNodes((state) => ({
    pastStates: state.pastStates,
    futureStates: state.futureStates,
    undo: state.undo,
    redo: state.redo
  }));

  const canUndo = useMemo(() => pastStates.length > 0, [pastStates]);
  const canRedo = useMemo(() => futureStates.length > 0, [futureStates]);
  const pastCount = useMemo(() => pastStates.length, [pastStates]);
  const futureCount = useMemo(() => futureStates.length, [futureStates]);

  return {
    canUndo,
    canRedo,
    undo,
    redo,
    pastCount,
    futureCount
  };
};

export default useHistoryState;
