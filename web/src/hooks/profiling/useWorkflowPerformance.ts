import { useCallback, useMemo } from "react";
import usePerformanceProfileStore, {
  WorkflowPerformanceProfile,
  PerformanceInsight
} from "../../stores/profiling/PerformanceProfileStore";
import { useNodes } from "../../contexts/NodeContext";
import { NodeStoreState } from "../../stores/NodeStore";
import { shallow } from "zustand/shallow";
import { Node } from "@xyflow/react";

export interface WorkflowPerformanceHook {
  profile: WorkflowPerformanceProfile | null;
  insights: PerformanceInsight[];
  generateProfile: () => WorkflowPerformanceProfile | null;
  clearProfile: () => void;
  getNodePerformanceColor: (nodeId: string) => string;
  formatDuration: (ms: number) => string;
}

export const useWorkflowPerformance = (): WorkflowPerformanceHook => {
  const { workflowId, workflowName, nodes } = useNodes(
    (state: NodeStoreState) => ({
      workflowId: state.workflow?.id || "",
      workflowName: state.workflow?.name || "",
      nodes: state.nodes
    }),
    shallow
  );

  const profile = useMemo(() => {
    if (!workflowId) {
      return null;
    }
    return usePerformanceProfileStore.getState().getProfile(workflowId);
  }, [workflowId]);

  const generateProfileFn = usePerformanceProfileStore.getState().generateProfile;
  const clearProfileFn = usePerformanceProfileStore.getState().clearProfile;
  const getInsightsFn = usePerformanceProfileStore.getState().getInsights;

  const generateProfile = useCallback(() => {
    if (!workflowId || !nodes) {
      return null;
    }
    const nodeData: Record<string, { label?: string; type?: string }> = {};
    for (const node of nodes) {
      const typedNode = node as Node<{ title?: string }>;
      nodeData[node.id] = {
        label: typedNode.data?.title || node.id,
        type: node.type || "unknown"
      };
    }
    return generateProfileFn(workflowId, workflowName, nodes.map((n) => n.id), nodeData);
  }, [workflowId, workflowName, nodes, generateProfileFn]);

  const clearProfile = useCallback(() => {
    if (workflowId) {
      clearProfileFn(workflowId);
    }
  }, [workflowId, clearProfileFn]);

  const insights = useMemo(() => {
    if (!profile) {
      return [];
    }
    return getInsightsFn(profile);
  }, [profile, getInsightsFn]);

  const getNodePerformanceColor = useCallback((nodeId: string): string => {
    if (!profile) {
      return "transparent";
    }

    const nodeData = profile.nodes.find((n) => n.nodeId === nodeId);
    if (!nodeData) {
      return "transparent";
    }

    const percentage = nodeData.percentageOfTotal;

    if (nodeData.isBottleneck) {
      return "rgba(244, 67, 54, 0.15)";
    } else if (percentage >= 10) {
      return "rgba(255, 152, 0, 0.1)";
    } else if (percentage >= 5) {
      return "rgba(255, 193, 7, 0.08)";
    } else if (percentage >= 2) {
      return "rgba(76, 175, 80, 0.05)";
    }

    return "transparent";
  }, [profile]);

  const formatDuration = useCallback((ms: number): string => {
    if (ms < 1000) {
      return `${ms}ms`;
    } else if (ms < 60000) {
      const seconds = Math.floor(ms / 1000);
      const milliseconds = ms % 1000;
      if (milliseconds === 0) {
        return `${seconds}s`;
      }
      return `${seconds}s ${milliseconds}ms`;
    } else {
      const minutes = Math.floor(ms / 60000);
      const seconds = Math.floor((ms % 60000) / 1000);
      return `${minutes}m ${seconds}s`;
    }
  }, []);

  return {
    profile,
    insights,
    generateProfile,
    clearProfile,
    getNodePerformanceColor,
    formatDuration
  };
};

export default useWorkflowPerformance;
