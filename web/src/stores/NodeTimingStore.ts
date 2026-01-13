import { create } from "zustand";

export interface NodeTiming {
  startTime: number | null;
  endTime: number | null;
  duration: number | null;
}

interface NodeTimingStore {
  timings: Record<string, NodeTiming>;
  startNode: (workflowId: string, nodeId: string) => void;
  endNode: (workflowId: string, nodeId: string) => void;
  getTiming: (workflowId: string, nodeId: string) => NodeTiming | undefined;
  clearTimings: (workflowId: string) => void;
  clearAllTimings: () => void;
}

const hashKey = (workflowId: string, nodeId: string) =>
  `${workflowId}:${nodeId}`;

const useNodeTimingStore = create<NodeTimingStore>((set, get) => ({
  timings: {},

  startNode: (workflowId: string, nodeId: string) => {
    const key = hashKey(workflowId, nodeId);
    set({
      timings: {
        ...get().timings,
        [key]: {
          startTime: Date.now(),
          endTime: null,
          duration: null
        }
      }
    });
  },

  endNode: (workflowId: string, nodeId: string) => {
    const key = hashKey(workflowId, nodeId);
    const existing = get().timings[key];
    if (existing?.startTime) {
      const endTime = Date.now();
      const duration = endTime - existing.startTime;
      set({
        timings: {
          ...get().timings,
          [key]: {
            ...existing,
            endTime,
            duration
          }
        }
      });
    }
  },

  getTiming: (workflowId: string, nodeId: string) => {
    const key = hashKey(workflowId, nodeId);
    return get().timings[key];
  },

  clearTimings: (workflowId: string) => {
    const timings = { ...get().timings };
    for (const key in timings) {
      if (key.startsWith(workflowId)) {
        delete timings[key];
      }
    }
    set({ timings });
  },

  clearAllTimings: () => {
    set({ timings: {} });
  }
}));

export default useNodeTimingStore;
