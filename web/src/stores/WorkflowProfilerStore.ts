import { create } from "zustand";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "./NodeData";

export interface NodeProfile {
  nodeId: string;
  nodeType: string;
  estimatedDuration: number;
  complexity: "low" | "medium" | "high";
  parallelizable: boolean;
  dependencies: string[];
  dependents: string[];
  bottlenecks: string[];
}

export interface WorkflowProfile {
  workflowId: string;
  totalEstimatedDuration: number;
  parallelDuration: number;
  nodeCount: number;
  maxDepth: number;
  parallelizableNodes: string[];
  bottlenecks: NodeProfile[];
  score: number;
  analyzedAt: number;
}

interface WorkflowProfilerState {
  isAnalyzing: boolean;
  profile: WorkflowProfile | null;
  error: string | null;
  analyzeWorkflow: (
    workflowId: string,
    nodes: Node<NodeData>[],
    edges: Edge[]
  ) => WorkflowProfile | null;
  clearProfile: () => void;
}

const NODE_COMPLEXITY_ESTIMATES: Record<string, { baseTime: number; complexity: "low" | "medium" | "high" }> = {
  "nodetool.input": { baseTime: 10, complexity: "low" },
  "nodetool.output": { baseTime: 10, complexity: "low" },
  "nodetool.control": { baseTime: 5, complexity: "low" },
  "nodetool.llm": { baseTime: 2000, complexity: "high" },
  "nodetool.embedding": { baseTime: 500, complexity: "medium" },
  "nodetool.audio": { baseTime: 3000, complexity: "high" },
  "nodetool.image": { baseTime: 1500, complexity: "high" },
  "nodetool.video": { baseTime: 5000, complexity: "high" },
  "nodetool.text": { baseTime: 200, complexity: "medium" },
  "nodetool.rerank": { baseTime: 800, complexity: "high" },
  "nodetool.workflows": { baseTime: 50, complexity: "low" },
};

const estimateNodeDuration = (node: Node<NodeData>): { duration: number; complexity: "low" | "medium" | "high" } => {
  const nodeType = node.type || "";
  const nodeCategory = nodeType.split(".")[1] || "";

  for (const [pattern, estimate] of Object.entries(NODE_COMPLEXITY_ESTIMATES)) {
    if (nodeType.startsWith(pattern)) {
      const complexityMultiplier = {
        low: 1,
        medium: 2.5,
        high: 5,
      }[estimate.complexity];
      const paramMultiplier = Object.keys(node.data).length * 0.1 + 1;
      return {
        duration: estimate.baseTime * complexityMultiplier * paramMultiplier,
        complexity: estimate.complexity,
      };
    }
  }

  return { duration: 100, complexity: "medium" };
};

const buildDependencyGraph = (nodes: Node<NodeData>[], edges: Edge[]) => {
  const nodeMap = new Map<string, Node<NodeData>>();
  const dependencies = new Map<string, string[]>();
  const dependents = new Map<string, string[]>();

  nodes.forEach((node) => {
    nodeMap.set(node.id, node);
    dependencies.set(node.id, []);
    dependents.set(node.id, []);
  });

  edges.forEach((edge) => {
    const sourceDeps = dependencies.get(edge.target) || [];
    sourceDeps.push(edge.source);
    dependencies.set(edge.target, sourceDeps);

    const targetDependents = dependents.get(edge.source) || [];
    targetDependents.push(edge.target);
    dependents.set(edge.source, targetDependents);
  });

  return { nodeMap, dependencies, dependents };
};

const calculateMaxDepth = (
  nodeId: string,
  dependencies: Map<string, string[]>,
  memo: Map<string, number> = new Map()
): number => {
  if (memo.has(nodeId)) {
    return memo.get(nodeId)!;
  }

  const nodeDeps = dependencies.get(nodeId) || [];
  if (nodeDeps.length === 0) {
    return 1;
  }

  const maxChildDepth = Math.max(
    ...nodeDeps.map((depId) => calculateMaxDepth(depId, dependencies, memo))
  );

  const depth = maxChildDepth + 1;
  memo.set(nodeId, depth);
  return depth;
};

const isParallelizable = (
  nodeId: string,
  dependencies: Map<string, string[]>,
  dependents: Map<string, string[]>
): boolean => {
  const nodeDeps = dependencies.get(nodeId) || [];
  const nodeDependents = dependents.get(nodeId) || [];

  const hasMultipleParents = nodeDeps.length > 1;
  const hasMultipleChildren = nodeDependents.length > 1;

  if (hasMultipleParents && hasMultipleChildren) {
    return true;
  }

  const hasSiblingDependencies = nodeDeps.some((depId) => {
    const siblingDeps = dependencies.get(depId) || [];
    return siblingDeps.length > 1;
  });

  return hasSiblingDependencies;
};

const identifyBottlenecks = (
  nodes: Node<NodeData>[],
  profiles: NodeProfile[],
  totalDuration: number
): NodeProfile[] => {
  const threshold = totalDuration * 0.2;
  return profiles
    .filter((p) => p.estimatedDuration > threshold)
    .sort((a, b) => b.estimatedDuration - a.estimatedDuration)
    .slice(0, 5);
};

const calculateComplexityScore = (
  nodeCount: number,
  maxDepth: number,
  bottleneckCount: number
): number => {
  let score = 100;

  score -= Math.min(nodeCount * 2, 40);
  score -= Math.min(maxDepth * 5, 30);
  score -= Math.min(bottleneckCount * 10, 30);

  return Math.max(0, Math.min(100, score));
};

const useWorkflowProfilerStore = create<WorkflowProfilerState>((set, get) => ({
  isAnalyzing: false,
  profile: null,
  error: null,

  analyzeWorkflow: (workflowId: string, nodes: Node<NodeData>[], edges: Edge[]) => {
    set({ isAnalyzing: true, error: null });

    try {
      if (nodes.length === 0) {
        const emptyProfile: WorkflowProfile = {
          workflowId,
          totalEstimatedDuration: 0,
          parallelDuration: 0,
          nodeCount: 0,
          maxDepth: 0,
          parallelizableNodes: [],
          bottlenecks: [],
          score: 100,
          analyzedAt: Date.now(),
        };
        set({ profile: emptyProfile, isAnalyzing: false });
        return emptyProfile;
      }

      const { nodeMap, dependencies, dependents } = buildDependencyGraph(nodes, edges);

      const nodeProfiles: NodeProfile[] = nodes.map((node) => {
        const { duration, complexity } = estimateNodeDuration(node);
        const nodeDeps = dependencies.get(node.id) || [];
        const nodeDependents = dependents.get(node.id) || [];
        const parallelizable = isParallelizable(node.id, dependencies, dependents);

        const bottlenecks: string[] = [];
        if (complexity === "high") {
          bottlenecks.push("High computational complexity");
        }
        if (nodeDeps.length > 2) {
          bottlenecks.push("Multiple dependencies may slow execution");
        }
        if (nodeDependents.length > 3) {
          bottlenecks.push("Fan-out: many downstream nodes depend on this");
        }

        return {
          nodeId: node.id,
          nodeType: node.type || "unknown",
          estimatedDuration: duration,
          complexity,
          parallelizable,
          dependencies: nodeDeps,
          dependents: nodeDependents,
          bottlenecks,
        };
      });

      const maxDepth = Math.max(
        ...nodes.map((node) => calculateMaxDepth(node.id, dependencies))
      );

      const parallelizableNodes = nodeProfiles
        .filter((p) => p.parallelizable)
        .map((p) => p.nodeId);

      const totalDuration = nodeProfiles.reduce((sum, p) => sum + p.estimatedDuration, 0);

      const parallelDuration = (() => {
        const levelNodesMap = new Map<number, string[]>();
        const maxLevel = { value: 0 };

        nodes.forEach((node) => {
          const depth = calculateMaxDepth(node.id, dependencies);
          if (!levelNodesMap.has(depth)) {
            levelNodesMap.set(depth, []);
          }
          levelNodesMap.get(depth)!.push(node.id);
          if (depth > maxLevel.value) {
            maxLevel.value = depth;
          }
        });

        let parallelTime = 0;
        for (let depth = 1; depth <= maxLevel.value; depth++) {
          const nodesAtDepth = levelNodesMap.get(depth) || [];
          if (nodesAtDepth.length > 0) {
            const levelDuration = Math.max(
              ...nodesAtDepth.map((id) => {
                const profile = nodeProfiles.find((p) => p.nodeId === id);
                return profile?.estimatedDuration || 0;
              })
            );
            parallelTime += levelDuration;
          }
        }

        return parallelTime;
      })();

      const bottlenecks = identifyBottlenecks(nodes, nodeProfiles, totalDuration);
      const score = calculateComplexityScore(nodes.length, maxDepth, bottlenecks.length);

      const profile: WorkflowProfile = {
        workflowId,
        totalEstimatedDuration: totalDuration,
        parallelDuration,
        nodeCount: nodes.length,
        maxDepth,
        parallelizableNodes,
        bottlenecks,
        score,
        analyzedAt: Date.now(),
      };

      set({ profile, isAnalyzing: false });
      return profile;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error during analysis";
      set({ error: errorMessage, isAnalyzing: false });
      return null;
    }
  },

  clearProfile: () => {
    set({ profile: null, error: null });
  },
}));

export default useWorkflowProfilerStore;
