import { NodeStore } from "./stores/NodeStore";

export type HistoryManager = {
  undo: (steps?: number | undefined) => void;
  redo: (steps?: number | undefined) => void;
  pause: () => void;
  resume: () => void;
  isTracking: boolean;
  futureStates: Partial<NodeStore>[];
  pastStates: Partial<NodeStore>[];
};
