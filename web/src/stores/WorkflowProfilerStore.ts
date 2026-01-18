import { create } from "zustand";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "./NodeData";

export interface ProfileMetrics {
  nodeCount: number;
  edgeCount: number;
  depth: number;
  width: number;
  parallelizableLayers: number;
  density: number;
  cycleCount: number;
}

export interface BottleneckNode {
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  avgExecutionTime: number;
  impactScore: number;
  recommendation: string;
}

export interface ParallelOpportunity {
  layerIndex: number;
  nodeIds: string[];
  potentialSpeedup: number;
  description: string;
}

export interface StructuralIssue {
  type: "cycle" | "deep_nesting" | "orphan" | "redundant";
  severity: "high" | "medium" | "low";
  description: string;
  affectedNodes: string[];
  recommendation: string;
}

export interface WorkflowProfile {
  workflowId: string;
  metrics: ProfileMetrics;
  bottlenecks: BottleneckNode[];
  parallelOpportunities: ParallelOpportunity[];
  structuralIssues: StructuralIssue[];
  lastAnalyzed: number;
}

interface WorkflowProfilerStore {
  profiles: Record<string, WorkflowProfile>;
  isAnalyzing: boolean;
  analyzeWorkflow: (
    workflowId: string,
    nodes: Node<NodeData>[],
    edges: Edge[],
    executionTimes?: Record<string, number>
  ) => WorkflowProfile;
  getProfile: (workflowId: string) => WorkflowProfile | undefined;
  clearProfile: (workflowId: string) => void;
  clearAllProfiles: () => void;
}

const calculateMetrics = (
  nodes: Node<NodeData>[],
  edges: Edge[],
  layers: string[][]
): ProfileMetrics => {
  const nodeCount = nodes.length;
  const edgeCount = edges.length;
  const depth = layers.length;
  const width = Math.max(...layers.map((layer) => layer.length), 0);
  const density = nodeCount > 0 ? edgeCount / nodeCount : 0;

  const uniqueNodesInLayers = new Set(layers.flat());
  const cycleCount = nodeCount - uniqueNodesInLayers.size;

  return {
    nodeCount,
    edgeCount,
    depth,
    width,
    parallelizableLayers: layers.filter((layer) => layer.length > 1).length,
    density,
    cycleCount: Math.max(0, cycleCount),
  };
};

const detectBottlenecks = (
  nodes: Node<NodeData>[],
  executionTimes: Record<string, number>
): BottleneckNode[] => {
  const bottlenecks: BottleneckNode[] = [];
  const entries = Object.entries(executionTimes);

  if (entries.length === 0) { return bottlenecks; }

  const avgTimes = entries.map(([nodeId, time]) => ({
    nodeId,
    time,
  }));

  const maxTime = Math.max(...avgTimes.map((e) => e.time));
  const avgTime =
    avgTimes.reduce((sum, e) => sum + e.time, 0) / avgTimes.length;

  for (const { nodeId, time } of avgTimes) {
    if (time >= avgTime * 2 && time > 100) {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) { continue; }

      const impactScore = time / maxTime;
      let recommendation = "";

      if (time > 5000) {
        recommendation =
          "Consider splitting this node into smaller parallel operations";
      } else if (time > 1000) {
        recommendation =
          "Check if this node can be optimized or replaced with a faster alternative";
      } else {
        recommendation =
          "Execution time is acceptable but monitor for degradation";
      }

      bottlenecks.push({
        nodeId,
        nodeType: node.type || "unknown",
        nodeLabel:
          (node.data as Record<string, unknown>)?.label?.toString() || node.id,
        avgExecutionTime: time,
        impactScore,
        recommendation,
      });
    }
  }

  return bottlenecks.sort((a, b) => b.impactScore - a.impactScore);
};

const detectParallelOpportunities = (
  layers: string[][]
): ParallelOpportunity[] => {
  const opportunities: ParallelOpportunity[] = [];

  layers.forEach((layer, index) => {
    if (layer.length > 1) {
      const potentialSpeedup = layer.length;
      opportunities.push({
        layerIndex: index,
        nodeIds: layer,
        potentialSpeedup,
        description: `Layer ${index} has ${layer.length} nodes that can execute in parallel`,
      });
    }
  });

  return opportunities;
};

const detectStructuralIssues = (
  nodes: Node<NodeData>[],
  edges: Edge[],
  hasCycle: boolean
): StructuralIssue[] => {
  const issues: StructuralIssue[] = [];

  if (hasCycle) {
    issues.push({
      type: "cycle",
      severity: "high",
      description: "Workflow contains one or more cycles",
      affectedNodes: [],
      recommendation:
        "Remove circular dependencies by restructuring the workflow",
    });
  }

  const sourceNodes = new Set(edges.map((e) => e.source));
  const targetNodes = new Set(edges.map((e) => e.target));

  const orphanNodes = nodes.filter(
    (n) => !sourceNodes.has(n.id) && !targetNodes.has(n.id)
  );

  if (orphanNodes.length > 0) {
    issues.push({
      type: "orphan",
      severity: "low",
      description: `${orphanNodes.length} node(s) are not connected to any other nodes`,
      affectedNodes: orphanNodes.map((n) => n.id),
      recommendation: "Remove orphan nodes or connect them to the workflow",
    });
  }

  const nodesWithParents = nodes.filter((n) => n.parentId);
  const deepNesting = nodesWithParents.filter((n) => {
    let depth = 0;
    let current = n;
    while (current.parentId) {
      depth++;
      current = nodes.find((p) => p.id === current.parentId) || current;
      if (depth > 3) { break; }
    }
    return depth > 3;
  });

  if (deepNesting.length > 0) {
    issues.push({
      type: "deep_nesting",
      severity: "medium",
      description: `${deepNesting.length} node(s) are nested more than 3 levels deep`,
      affectedNodes: deepNesting.map((n) => n.id),
      recommendation: "Consider flattening the node hierarchy for better clarity",
    });
  }

  const redundantEdges = edges.filter(
    (e1, i) =>
      edges.some(
        (e2, j) =>
          i !== j &&
          e1.source === e2.source &&
          e1.target === e2.target &&
          e1.id !== e2.id
      )
  );

  if (redundantEdges.length > 0) {
    issues.push({
      type: "redundant",
      severity: "low",
      description: `${redundantEdges.length / 2} pair(s) of redundant connections detected`,
      affectedNodes: [...new Set(redundantEdges.flatMap((e) => [e.source, e.target]))],
      recommendation: "Remove duplicate connections between nodes",
    });
  }

  return issues;
};

const useWorkflowProfilerStore = create<WorkflowProfilerStore>((set, get) => ({
  profiles: {},
  isAnalyzing: false,

  analyzeWorkflow: (
    workflowId: string,
    nodes: Node<NodeData>[],
    edges: Edge[],
    executionTimes: Record<string, number> = {}
  ) => {
    set({ isAnalyzing: true });

    const topologicalSort = (nodeList: Node<NodeData>[], edgeList: Edge[]) => {
      const indegree: Record<string, number> = {};
      const adj: Record<string, string[]> = {};

      nodeList.forEach((n) => {
        indegree[n.id] = 0;
        adj[n.id] = [];
      });

      edgeList.forEach((e) => {
        if (adj[e.source]) {
          adj[e.source].push(e.target);
          indegree[e.target] = (indegree[e.target] || 0) + 1;
        }
      });

      const queue: string[] = [];
      Object.entries(indegree).forEach(([id, deg]) => {
        if (deg === 0) { queue.push(id); }
      });

      const layers: string[][] = [];
      while (queue.length > 0) {
        const levelSize = queue.length;
        const level: string[] = [];
        for (let i = 0; i < levelSize; i++) {
          const nodeId = queue.shift()!;
          level.push(nodeId);
          if (adj[nodeId]) {
            adj[nodeId].forEach((target) => {
              indegree[target]--;
              if (indegree[target] === 0) {
                queue.push(target);
              }
            });
          }
        }
        layers.push(level);
      }

      const visited = new Set(layers.flat());
      const hasCycle = visited.size < nodeList.length;

      return { layers, hasCycle };
    };

    const { layers, hasCycle } = topologicalSort(nodes, edges);
    const metrics = calculateMetrics(nodes, edges, layers);
    const bottlenecks = detectBottlenecks(nodes, executionTimes);
    const parallelOpportunities = detectParallelOpportunities(layers);
    const structuralIssues = detectStructuralIssues(nodes, edges, hasCycle);

    const profile: WorkflowProfile = {
      workflowId,
      metrics,
      bottlenecks,
      parallelOpportunities,
      structuralIssues,
      lastAnalyzed: Date.now(),
    };

    set((state) => ({
      profiles: { ...state.profiles, [workflowId]: profile },
      isAnalyzing: false,
    }));

    return profile;
  },

  getProfile: (workflowId: string) => {
    return get().profiles[workflowId];
  },

  clearProfile: (workflowId: string) => {
    set((state) => {
      const { [workflowId]: _, ...remainingProfiles } = state.profiles;
      return { profiles: remainingProfiles };
    });
  },

  clearAllProfiles: () => {
    set({ profiles: {} });
  },
}));

export default useWorkflowProfilerStore;
