/**
 * BreakpointsStore manages visual debugging breakpoints for workflow nodes.
 *
 * EXPERIMENTAL FEATURE: Visual Debugging with Breakpoints
 *
 * This store allows users to set breakpoints on nodes in the workflow.
 * When a workflow runs and encounters a node with a breakpoint, execution
 * pauses before that node executes, allowing users to inspect the current
 * state of the workflow.
 *
 * Features:
 * - Set/unset breakpoints on nodes
 * - Query breakpoint status for specific nodes
 * - Get all breakpoints for a workflow
 * - Clear all breakpoints for a workflow
 * - Toggle breakpoints programmatically
 *
 * @experimental - This is an experimental feature for visual debugging.
 */
import { create } from "zustand";

export type Breakpoint = {
  nodeId: string;
  workflowId: string;
  enabled: boolean;
  condition?: string;
};

type BreakpointsStore = {
  breakpoints: Record<string, Breakpoint>;
  setBreakpoint: (workflowId: string, nodeId: string, enabled?: boolean) => void;
  unsetBreakpoint: (workflowId: string, nodeId: string) => void;
  toggleBreakpoint: (workflowId: string, nodeId: string) => void;
  getBreakpoint: (workflowId: string, nodeId: string) => Breakpoint | undefined;
  hasBreakpoint: (workflowId: string, nodeId: string) => boolean;
  getWorkflowBreakpoints: (workflowId: string) => Breakpoint[];
  clearWorkflowBreakpoints: (workflowId: string) => void;
  clearAllBreakpoints: () => void;
};

const hashKey = (workflowId: string, nodeId: string) =>
  `${workflowId}:${nodeId}`;

export const useBreakpointsStore = create<BreakpointsStore>((set, get) => ({
  breakpoints: {},

  setBreakpoint: (workflowId: string, nodeId: string, enabled = true) => {
    const key = hashKey(workflowId, nodeId);
    set((state) => ({
      breakpoints: {
        ...state.breakpoints,
        [key]: {
          nodeId,
          workflowId,
          enabled
        }
      }
    }));
  },

  unsetBreakpoint: (workflowId: string, nodeId: string) => {
    const key = hashKey(workflowId, nodeId);
    set((state) => {
      const { [key]: removed, ...remaining } = state.breakpoints;
      return { breakpoints: remaining };
    });
  },

  toggleBreakpoint: (workflowId: string, nodeId: string) => {
    const key = hashKey(workflowId, nodeId);
    set((state) => {
      const existing = state.breakpoints[key];
      if (existing) {
        const { [key]: removed, ...remaining } = state.breakpoints;
        return { breakpoints: remaining };
      } else {
        return {
          breakpoints: {
            ...state.breakpoints,
            [key]: {
              nodeId,
              workflowId,
              enabled: true
            }
          }
        };
      }
    });
  },

  getBreakpoint: (workflowId: string, nodeId: string) => {
    const key = hashKey(workflowId, nodeId);
    return get().breakpoints[key];
  },

  hasBreakpoint: (workflowId: string, nodeId: string) => {
    const key = hashKey(workflowId, nodeId);
    const breakpoint = get().breakpoints[key];
    return breakpoint !== undefined && breakpoint.enabled;
  },

  getWorkflowBreakpoints: (workflowId: string) => {
    const breakpoints = get().breakpoints;
    return Object.values(breakpoints).filter(
      (bp) => bp.workflowId === workflowId && bp.enabled
    );
  },

  clearWorkflowBreakpoints: (workflowId: string) => {
    set((state) => {
      const newBreakpoints: Record<string, Breakpoint> = {};
      for (const [key, bp] of Object.entries(state.breakpoints)) {
        if (bp.workflowId !== workflowId) {
          newBreakpoints[key] = bp;
        }
      }
      return { breakpoints: newBreakpoints };
    });
  },

  clearAllBreakpoints: () => {
    set({ breakpoints: {} });
  }
}));

export default useBreakpointsStore;
