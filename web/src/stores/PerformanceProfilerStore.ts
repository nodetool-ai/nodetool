import { create } from "zustand";
import useExecutionTimeStore from "./ExecutionTimeStore";
import useStatusStore from "./StatusStore";
import useErrorStore from "./ErrorStore";
import useResultsStore from "./ResultsStore";

export interface NodePerformanceData {
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  status: string;
  duration: number | undefined;
  hasError: boolean;
  errorMessage: string | undefined;
  progress: number | undefined;
  resultSize: number | undefined;
}

export interface WorkflowPerformanceProfile {
  workflowId: string;
  totalDuration: number;
  nodeCount: number;
  completedCount: number;
  errorCount: number;
  nodes: NodePerformanceData[];
  bottlenecks: NodePerformanceData[];
  startTime: number;
  endTime: number;
}

interface PerformanceProfilerStore {
  profiles: Record<string, WorkflowPerformanceProfile | null>;
  currentProfile: WorkflowPerformanceProfile | null;
  analyzeWorkflow: (
    workflowId: string,
    nodes: { id: string; type: string; data: Record<string, any> }[]
  ) => WorkflowPerformanceProfile | null;
  getProfile: (workflowId: string) => WorkflowPerformanceProfile | null;
  clearProfile: (workflowId: string) => void;
  getBottlenecks: (workflowId: string, limit?: number) => NodePerformanceData[];
  compareExecutions: (
    workflowId: string,
    execution1Id: string,
    execution2Id: string
  ) => { changed: NodePerformanceData[]; improved: NodePerformanceData[]; regressed: NodePerformanceData[] };
}

const hashKey = (workflowId: string, nodeId: string) =>
  `${workflowId}:${nodeId}`;

const calculateDuration = (
  workflowId: string,
  nodeId: string
): number | undefined => {
  const timing = useExecutionTimeStore.getState().getDuration(workflowId, nodeId);
  return timing;
};

const getNodeLabel = (node: { id: string; type: string; data: Record<string, any> }): string => {
  if (node.data?.label) {
    return String(node.data.label);
  }
  const typeMatch = node.type.match(/(\w+)$/);
  return typeMatch ? typeMatch[1] : node.type;
};

const getNodeTypeName = (nodeType: string): string => {
  const parts = nodeType.split(".");
  return parts[parts.length - 1] || nodeType;
};

const usePerformanceProfilerStore = create<PerformanceProfilerStore>((set, get) => ({
  profiles: {},
  currentProfile: null,

  analyzeWorkflow: (
    workflowId: string,
    nodes: { id: string; type: string; data: Record<string, any> }[]
  ): WorkflowPerformanceProfile | null => {
    const executionTimings = useExecutionTimeStore.getState().timings;
    const statuses = useStatusStore.getState().statuses;
    const errors = useErrorStore.getState().errors;
    const results = useResultsStore.getState().results;

    let startTime = Infinity;
    let endTime = 0;
    const nodeDataList: NodePerformanceData[] = [];

    for (const node of nodes) {
      const timing = useExecutionTimeStore.getState().getTiming(workflowId, node.id);
      const status = useStatusStore.getState().getStatus(workflowId, node.id);
      const error = useErrorStore.getState().getError(workflowId, node.id);
      const result = useResultsStore.getState().getResult(workflowId, node.id);
      const progress = useResultsStore.getState().getProgress(workflowId, node.id);

      const duration = useExecutionTimeStore.getState().getDuration(workflowId, node.id);

      if (timing && timing.startTime < startTime) {
        startTime = timing.startTime;
      }
      if (timing && timing.endTime && timing.endTime > endTime) {
        endTime = timing.endTime;
      }

      const resultSize = result ? JSON.stringify(result).length : undefined;

      nodeDataList.push({
        nodeId: node.id,
        nodeType: getNodeTypeName(node.type),
        nodeLabel: getNodeLabel(node),
        status: status || "pending",
        duration,
        hasError: !!error,
        errorMessage: error,
        progress: progress?.progress,
        resultSize
      });
    }

    const completedCount = nodeDataList.filter(
      (n) => n.status === "completed" || n.status === "success"
    ).length;
    const errorCount = nodeDataList.filter((n) => n.hasError).length;

    const totalDuration = endTime > 0 && startTime !== Infinity ? endTime - startTime : 0;

    const sortedByDuration = [...nodeDataList]
      .filter((n) => n.duration !== undefined)
      .sort((a, b) => (b.duration || 0) - (a.duration || 0));

    const bottlenecks = sortedByDuration.slice(0, 5);

    const profile: WorkflowPerformanceProfile = {
      workflowId,
      totalDuration,
      nodeCount: nodes.length,
      completedCount,
      errorCount,
      nodes: nodeDataList,
      bottlenecks,
      startTime: startTime === Infinity ? 0 : startTime,
      endTime
    };

    set({
      profiles: { ...get().profiles, [workflowId]: profile },
      currentProfile: profile
    });

    return profile;
  },

  getProfile: (workflowId: string) => {
    return get().profiles[workflowId] || null;
  },

  clearProfile: (workflowId: string) => {
    set({
      profiles: { ...get().profiles, [workflowId]: null }
    });
  },

  getBottlenecks: (workflowId: string, limit: number = 5) => {
    const profile = get().profiles[workflowId];
    if (!profile) {
      return [];
    }
    return profile.bottlenecks.slice(0, limit);
  },

  compareExecutions: (
    workflowId: string,
    execution1Id: string,
    execution2Id: string
  ) => {
    const profile1 = get().profiles[`${workflowId}:${execution1Id}`];
    const profile2 = get().profiles[`${workflowId}:${execution2Id}`];

    if (!profile1 || !profile2) {
      return { changed: [], improved: [], regressed: [] };
    }

    const changed: NodePerformanceData[] = [];
    const improved: NodePerformanceData[] = [];
    const regressed: NodePerformanceData[] = [];

    const nodeMap1 = new Map(profile1.nodes.map((n) => [n.nodeId, n]));
    const nodeMap2 = new Map(profile2.nodes.map((n) => [n.nodeId, n]));

    for (const [nodeId, node1] of nodeMap1) {
      const node2 = nodeMap2.get(nodeId);
      if (node2 && node1.duration !== undefined && node2.duration !== undefined) {
        const diff = node2.duration - node1.duration;
        if (Math.abs(diff) > 100) {
          changed.push(node2);
          if (diff < 0) {
            improved.push(node2);
          } else {
            regressed.push(node2);
          }
        }
      }
    }

    return { changed, improved, regressed };
  }
}));

export default usePerformanceProfilerStore;
