import { create } from "zustand";

export interface Breakpoint {
  nodeId: string;
  enabled: boolean;
  condition?: string;
}

export interface ExecutionEvent {
  id: string;
  timestamp: number;
  nodeId: string;
  nodeType: string;
  eventType: "started" | "completed" | "error" | "progress";
  duration?: number;
  message?: string;
  data?: Record<string, unknown>;
}

export interface DebugPanelState {
  breakpoints: Breakpoint[];
  executionHistory: ExecutionEvent[];
  isDebugMode: boolean;
  currentNodeId: string | null;

  // Actions
  addBreakpoint: (nodeId: string) => void;
  removeBreakpoint: (nodeId: string) => void;
  toggleBreakpoint: (nodeId: string) => void;
  clearBreakpoints: () => void;
  hasBreakpoint: (nodeId: string) => boolean;
  isBreakpointEnabled: (nodeId: string) => boolean;

  addExecutionEvent: (event: Omit<ExecutionEvent, "id" | "timestamp">) => void;
  clearExecutionHistory: () => void;
  setDebugMode: (enabled: boolean) => void;
  setCurrentNode: (nodeId: string | null) => void;
  startDebugSession: () => void;
  endDebugSession: () => void;
}

export const useDebugPanelStore = create<DebugPanelState>((set, get) => ({
  breakpoints: [],
  executionHistory: [],
  isDebugMode: false,
  currentNodeId: null,

  addBreakpoint: (nodeId: string) => {
    set((state) => {
      if (state.breakpoints.some((bp) => bp.nodeId === nodeId)) {
        return state;
      }
      return {
        breakpoints: [...state.breakpoints, { nodeId, enabled: true }]
      };
    });
  },

  removeBreakpoint: (nodeId: string) => {
    set((state) => ({
      breakpoints: state.breakpoints.filter((bp) => bp.nodeId !== nodeId)
    }));
  },

  toggleBreakpoint: (nodeId: string) => {
    set((state) => ({
      breakpoints: state.breakpoints.map((bp) =>
        bp.nodeId === nodeId ? { ...bp, enabled: !bp.enabled } : bp
      )
    }));
  },

  clearBreakpoints: () => {
    set({ breakpoints: [] });
  },

  hasBreakpoint: (nodeId: string) => {
    return get().breakpoints.some((bp) => bp.nodeId === nodeId);
  },

  isBreakpointEnabled: (nodeId: string) => {
    const bp = get().breakpoints.find((b) => b.nodeId === nodeId);
    return bp ? bp.enabled : false;
  },

  addExecutionEvent: (event: Omit<ExecutionEvent, "id" | "timestamp">) => {
    const newEvent: ExecutionEvent = {
      ...event,
      id: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now()
    };
    set((state) => ({
      executionHistory: [...state.executionHistory, newEvent].slice(-100)
    }));
  },

  clearExecutionHistory: () => {
    set({ executionHistory: [] });
  },

  setDebugMode: (enabled: boolean) => {
    set({ isDebugMode: enabled });
  },

  setCurrentNode: (nodeId: string | null) => {
    set({ currentNodeId: nodeId });
  },

  startDebugSession: () => {
    set({ isDebugMode: true, executionHistory: [], currentNodeId: null });
  },

  endDebugSession: () => {
    set({ isDebugMode: false, currentNodeId: null });
  }
}));
