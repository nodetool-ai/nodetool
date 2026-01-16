import { create } from "zustand";
import { Edge, type Node as ReactFlowNode } from "@xyflow/react";
import {
  analyzeWorkflow,
  type WorkflowProfile,
  type BottleneckInfo,
} from "../core/workflowProfiler";

interface WorkflowProfilerState {
  isAnalyzing: boolean;
  lastProfile: WorkflowProfile | null;
  selectedNodeId: string | null;
  autoProfile: boolean;
  analyzeWorkflow: (nodes: ReactFlowNode[], edges: Edge[]) => void;
  selectNode: (nodeId: string | null) => void;
  toggleAutoProfile: () => void;
  clearProfile: () => void;
}

const useWorkflowProfilerStore = create<WorkflowProfilerState>((set) => ({
  isAnalyzing: false,
  lastProfile: null,
  selectedNodeId: null,
  autoProfile: false,

  analyzeWorkflow: (nodes, edges) => {
    set({ isAnalyzing: true });
    try {
      const profile = analyzeWorkflow(nodes, edges);
      set({ lastProfile: profile, isAnalyzing: false });
    } catch {
      set({ isAnalyzing: false });
    }
  },

  selectNode: (nodeId) => {
    set({ selectedNodeId: nodeId });
  },

  toggleAutoProfile: () => {
    set((state) => ({ autoProfile: !state.autoProfile }));
  },

  clearProfile: () => {
    set({ lastProfile: null, selectedNodeId: null });
  },
}));

export default useWorkflowProfilerStore;
