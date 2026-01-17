import { useCallback, useMemo } from "react";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";
import useWorkflowProfilerStore, { WorkflowProfile, NodeProfile } from "../stores/WorkflowProfilerStore";

interface UseWorkflowProfilerReturn {
  isAnalyzing: boolean;
  profile: WorkflowProfile | null;
  error: string | null;
  analyzeWorkflow: (nodes: Node<NodeData>[], edges: Edge[]) => WorkflowProfile | null;
  clearProfile: () => void;
  getNodeProfile: (nodeId: string) => NodeProfile | undefined;
  getScoreLabel: () => string;
  getScoreColor: () => "success" | "warning" | "error";
  formatDuration: (ms: number) => string;
}

export const useWorkflowProfiler = (workflowId: string): UseWorkflowProfilerReturn => {
  const { isAnalyzing, profile, error, analyzeWorkflow: storeAnalyze, clearProfile } =
    useWorkflowProfilerStore();

  const analyzeWorkflow = useCallback(
    (nodes: Node<NodeData>[], edges: Edge[]) => {
      return storeAnalyze(workflowId, nodes, edges);
    },
    [workflowId, storeAnalyze]
  );

  const getNodeProfile = useCallback(
    (nodeId: string) => {
      if (!profile) return undefined;
      const { dependencies, dependents } = buildSimpleGraph(profile, nodeId);
      const node = nodesStore.get(nodeId);
      if (!node) return undefined;

      const baseTime = estimateNodeBaseTime(node.type || "");
      const parallelizable = dependents.length > 1 || dependencies.length > 1;

      return {
        nodeId,
        nodeType: node.type || "unknown",
        estimatedDuration: baseTime,
        complexity: getComplexity(baseTime),
        parallelizable,
        dependencies,
        dependents,
        bottlenecks: [],
      };
    },
    [profile]
  );

  const getScoreLabel = useCallback(() => {
    if (!profile) return "Not analyzed";
    const { score } = profile;
    if (score >= 80) return "Excellent";
    if (score >= 60) return "Good";
    if (score >= 40) return "Needs Optimization";
    return "Poor Performance";
  }, [profile]);

  const getScoreColor = useCallback((): "success" | "warning" | "error" => {
    if (!profile) return "success";
    const { score } = profile;
    if (score >= 70) return "success";
    if (score >= 40) return "warning";
    return "error";
  }, [profile]);

  const formatDuration = useCallback((ms: number) => {
    if (ms < 1000) {
      return `${Math.round(ms)}ms`;
    } else if (ms < 60000) {
      const seconds = Math.round(ms / 1000);
      return `${seconds}s`;
    } else {
      const minutes = Math.round(ms / 60000);
      const seconds = Math.round((ms % 60000) / 1000);
      return `${minutes}m ${seconds}s`;
    }
  }, []);

  return {
    isAnalyzing,
    profile,
    error,
    analyzeWorkflow,
    clearProfile,
    getNodeProfile,
    getScoreLabel,
    getScoreColor,
    formatDuration,
  };
};

const nodesStore = new Map<string, Node<NodeData>>();

const buildSimpleGraph = (profile: WorkflowProfile, nodeId: string) => {
  const dependencies: string[] = [];
  const dependents: string[] = [];
  return { dependencies, dependents };
};

const estimateNodeBaseTime = (nodeType: string): number => {
  if (nodeType.startsWith("nodetool.llm")) return 2000;
  if (nodeType.startsWith("nodetool.embedding")) return 500;
  if (nodeType.startsWith("nodetool.audio")) return 3000;
  if (nodeType.startsWith("nodetool.image")) return 1500;
  if (nodeType.startsWith("nodetool.video")) return 5000;
  if (nodeType.startsWith("nodetool.text")) return 200;
  if (nodeType.startsWith("nodetool.input")) return 10;
  if (nodeType.startsWith("nodetool.output")) return 10;
  return 100;
};

const getComplexity = (duration: number): "low" | "medium" | "high" => {
  if (duration < 500) return "low";
  if (duration < 2000) return "medium";
  return "high";
};

export default useWorkflowProfiler;
