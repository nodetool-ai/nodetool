import { useCallback } from "react";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";
import useWorkflowProfilerStore, {
  WorkflowProfile,
} from "../stores/WorkflowProfilerStore";
import useExecutionTimeStore from "../stores/ExecutionTimeStore";

interface UseWorkflowProfilerOptions {
  workflowId: string;
  nodes: Node<NodeData>[];
  edges: Edge[];
  _autoRefresh?: boolean;
}

interface UseWorkflowProfilerReturn {
  profile: WorkflowProfile | undefined;
  isAnalyzing: boolean;
  analyze: () => WorkflowProfile;
  clearProfile: () => void;
  getExecutionTimeStats: () => {
    totalTime: number;
    avgNodeTime: number;
    slowestNode: { nodeId: string; time: number } | null;
  };
}

export const useWorkflowProfiler = ({
  workflowId,
  nodes,
  edges,
  _autoRefresh = false,
}: UseWorkflowProfilerOptions): UseWorkflowProfilerReturn => {
  const { analyzeWorkflow, getProfile, clearProfile, isAnalyzing } =
    useWorkflowProfilerStore();
  const { getDuration } = useExecutionTimeStore();

  const profile = getProfile(workflowId);

  const getExecutionTimeStats = useCallback(() => {
    let totalTime = 0;
    let nodeCount = 0;
    let slowestNode: { nodeId: string; time: number } | null = null;

    for (const node of nodes) {
      const duration = getDuration(workflowId, node.id);
      if (duration !== undefined) {
        totalTime += duration;
        nodeCount++;
        if (!slowestNode || duration > slowestNode.time) {
          slowestNode = { nodeId: node.id, time: duration };
        }
      }
    }

    return {
      totalTime,
      avgNodeTime: nodeCount > 0 ? totalTime / nodeCount : 0,
      slowestNode,
    };
  }, [workflowId, nodes, getDuration]);

  const analyze = useCallback(() => {
    const executionTimes: Record<string, number> = {};

    for (const node of nodes) {
      const duration = getDuration(workflowId, node.id);
      if (duration !== undefined) {
        executionTimes[node.id] = duration;
      }
    }

    return analyzeWorkflow(workflowId, nodes, edges, executionTimes);
  }, [workflowId, nodes, edges, analyzeWorkflow, getDuration]);

  const handleClearProfile = useCallback(() => {
    clearProfile(workflowId);
  }, [workflowId, clearProfile]);

  return {
    profile,
    isAnalyzing,
    analyze,
    clearProfile: handleClearProfile,
    getExecutionTimeStats,
  };
};

export default useWorkflowProfiler;
