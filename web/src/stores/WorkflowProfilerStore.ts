/**
 * Workflow Performance Profiler Store
 *
 * Manages performance analysis data for workflows, including:
 * - Estimated execution times based on node types
 * - Bottleneck identification
 * - Parallelization opportunities
 * - Optimization suggestions
 *
 * Used by:
 * - WorkflowProfilerPanel to display performance insights
 * - useWorkflowProfiler hook for analysis
 *
 * @example
 * ```typescript
 * import useWorkflowProfilerStore from './WorkflowProfilerStore';
 *
 * const store = useWorkflowProfilerStore();
 * store.analyzeWorkflow('workflow-1', nodes, edges);
 * const profile = store.getProfile('workflow-1');
 * ```
 */
import { create } from "zustand";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "./NodeData";

export interface PerformanceMetric {
  nodeId: string;
  nodeType: string;
  estimatedTime: number;
  actualTime?: number;
  isBottleneck: boolean;
  parallelizable: boolean;
  children?: PerformanceMetric[];
}

export interface WorkflowProfile {
  workflowId: string;
  totalEstimatedTime: number;
  totalActualTime?: number;
  nodeCount: number;
  bottleneckNodes: PerformanceMetric[];
  parallelizableNodes: PerformanceMetric[];
  suggestions: OptimizationSuggestion[];
  layerAnalysis: LayerAnalysis;
  timestamp: number;
  criticalPath: string[];
}

export interface OptimizationSuggestion {
  type: "bottleneck" | "parallelization" | "memory" | "caching" | "general";
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  affectedNodes: string[];
  potentialImprovement?: string;
}

export interface LayerAnalysis {
  layers: LayerInfo[];
  maxParallelism: number;
  criticalPath: string[];
}

export interface LayerInfo {
  layerIndex: number;
  nodeIds: string[];
  estimatedTime: number;
  canRunInParallel: boolean;
}

interface WorkflowProfilerStore {
  profiles: Record<string, WorkflowProfile>;
  analyzeWorkflow: (
    workflowId: string,
    nodes: Node<NodeData>[],
    edges: Edge[]
  ) => WorkflowProfile;
  getProfile: (workflowId: string) => WorkflowProfile | undefined;
  updateActualTime: (
    workflowId: string,
    nodeId: string,
    actualTime: number
  ) => void;
  clearProfile: (workflowId: string) => void;
  getSuggestions: (workflowId: string) => OptimizationSuggestion[];
}

const NODE_TYPE_ESTIMATES: Record<string, number> = {
  "nodetool.input.StringInput": 5,
  "nodetool.input.IntegerInput": 5,
  "nodetool.input.FloatInput": 5,
  "nodetool.input.BooleanInput": 5,
  "nodetool.input.ImageInput": 50,
  "nodetool.input.AudioInput": 50,
  "nodetool.input.VideoInput": 100,
  "nodetool.input.FileInput": 50,
  "nodetool.input.FolderInput": 20,
  "nodetool.processing.StringProcessing": 100,
  "nodetool.processing.ImageProcessing": 2000,
  "nodetool.processing.AudioProcessing": 3000,
  "nodetool.processing.VideoProcessing": 5000,
  "nodetool.processing.TextProcessing": 500,
  "nodetool.models.LLM": 3000,
  "nodetool.models.ImageGeneration": 10000,
  "nodetool.models.AudioGeneration": 8000,
  "nodetool.models.Embedding": 500,
  "nodetool.output.StringOutput": 5,
  "nodetool.output.ImageOutput": 50,
  "nodetool.output.AudioOutput": 50,
  "nodetool.output.VideoOutput": 100,
  "nodetool.output.FileOutput": 50,
  "nodetool.control_flow.Loop": 1000,
  "nodetool.control_flow.Condition": 50,
  "nodetool.workflows.base_node.Comment": 1,
  "nodetool.workflows.base_node.Group": 0,
};

const CRITICAL_NODE_TYPES: Set<string> = new Set([
  "nodetool.models.LLM",
  "nodetool.models.ImageGeneration",
  "nodetool.models.AudioGeneration",
  "nodetool.processing.ImageProcessing",
  "nodetool.processing.VideoProcessing",
]);

const useWorkflowProfilerStore = create<WorkflowProfilerStore>((set, get) => ({
  profiles: {},

  analyzeWorkflow: (
    workflowId: string,
    nodes: Node<NodeData>[],
    edges: Edge[]
  ): WorkflowProfile => {
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const metrics: Map<string, PerformanceMetric> = new Map();
    const layerAnalysis = analyzeLayers(nodes, edges);
    let totalEstimatedTime = 0;

    nodes.forEach((node) => {
      const nodeType = node.type || "nodetool.processing.StringProcessing";
      const estimatedTime =
        NODE_TYPE_ESTIMATES[nodeType] ||
        NODE_TYPE_ESTIMATES["nodetool.processing.StringProcessing"];
      metrics.set(node.id, {
        nodeId: node.id,
        nodeType: nodeType,
        estimatedTime,
        isBottleneck: false,
        parallelizable: canRunInParallel(node, nodes, edges),
      });
      totalEstimatedTime += estimatedTime;
    });

    const bottleneckNodes = identifyBottlenecks(metrics, totalEstimatedTime);
    const parallelizableNodes = identifyParallelizableNodes(
      metrics,
      layerAnalysis
    );
    const suggestions = generateSuggestions(
      metrics,
      bottleneckNodes,
      parallelizableNodes,
      layerAnalysis,
      nodes
    );

    bottleneckNodes.forEach((b) => {
      const metric = metrics.get(b.nodeId);
      if (metric) metric.isBottleneck = true;
    });

    const profile: WorkflowProfile = {
      workflowId,
      totalEstimatedTime,
      nodeCount: nodes.length,
      bottleneckNodes,
      parallelizableNodes,
      suggestions,
      layerAnalysis,
      timestamp: Date.now(),
      criticalPath: layerAnalysis.criticalPath,
    };

    set({
      profiles: {
        ...get().profiles,
        [workflowId]: profile,
      },
    });

    return profile;
  },

  getProfile: (workflowId: string) => {
    return get().profiles[workflowId];
  },

  updateActualTime: (workflowId: string, nodeId: string, actualTime: number) => {
    const profile = get().profiles[workflowId];
    if (!profile) return;

    const updatedProfile = {
      ...profile,
      totalActualTime: (profile.totalActualTime || 0) + actualTime,
    };

    set({
      profiles: {
        ...get().profiles,
        [workflowId]: updatedProfile,
      },
    });
  },

  clearProfile: (workflowId: string) => {
    const profiles = { ...get().profiles };
    delete profiles[workflowId];
    set({ profiles });
  },

  getSuggestions: (workflowId: string) => {
    const profile = get().profiles[workflowId];
    return profile?.suggestions || [];
  },
}));

function analyzeLayers(
  nodes: Node<NodeData>[],
  edges: Edge[]
): LayerAnalysis {
  const indegree: Record<string, number> = {};
  const adjacency: Record<string, string[]> = {};
  const nodeLayer: Record<string, number> = {};

  nodes.forEach((node) => {
    indegree[node.id] = 0;
    adjacency[node.id] = [];
  });

  edges.forEach((edge) => {
    if (adjacency[edge.source]) {
      adjacency[edge.source].push(edge.target);
      indegree[edge.target] = (indegree[edge.target] || 0) + 1;
    }
  });

  const queue: string[] = [];
  nodes.forEach((node) => {
    if (indegree[node.id] === 0) {
      queue.push(node.id);
      nodeLayer[node.id] = 0;
    }
  });

  const layers: LayerInfo[] = [];
  let layerIndex = 0;

  while (queue.length > 0) {
    const layerNodes = [...queue];
    queue.length = 0;

    let layerTime = 0;
    layerNodes.forEach((nodeId) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (node) {
        const nodeType = node.type || "nodetool.processing.StringProcessing";
        layerTime += NODE_TYPE_ESTIMATES[nodeType] || 100;
      }
    });

    layers.push({
      layerIndex,
      nodeIds: layerNodes,
      estimatedTime: layerTime,
      canRunInParallel: layerNodes.length > 1,
    });

    layerNodes.forEach((nodeId) => {
      adjacency[nodeId].forEach((targetId) => {
        indegree[targetId]--;
        if (indegree[targetId] === 0) {
          queue.push(targetId);
          nodeLayer[targetId] = layerIndex + 1;
        }
      });
    });

    layerIndex++;
  }

  const criticalPath = findCriticalPath(nodes, edges, nodeLayer);
  const maxParallelism = Math.max(...layers.map((l) => l.nodeIds.length));

  return { layers, maxParallelism, criticalPath };
}

function findCriticalPath(
  nodes: Node<NodeData>[],
  edges: Edge[],
  nodeLayer: Record<string, number>
): string[] {
  const adjacency: Record<string, string[]> = {};
  nodes.forEach((node) => {
    adjacency[node.id] = [];
  });

  edges.forEach((edge) => {
    if (adjacency[edge.source]) {
      adjacency[edge.source].push(edge.target);
    }
  });

  let currentLayer = 0;
  const criticalPath: string[] = [];
  const visited = new Set<string>();

  let hasMoreLayers = true;
  while (hasMoreLayers) {
    const layerNodes = nodes.filter(
      (n) => nodeLayer[n.id] === currentLayer && !visited.has(n.id)
    );

    if (layerNodes.length === 0) {
      hasMoreLayers = false;
      break;
    }

    const slowestNode = layerNodes.reduce((slowest, node) => {
      const nodeType = node.type || "nodetool.processing.StringProcessing";
      const nodeTime = NODE_TYPE_ESTIMATES[nodeType] || 100;
      const slowestType = slowest?.type || "nodetool.processing.StringProcessing";
      const slowestTime = slowest
        ? NODE_TYPE_ESTIMATES[slowestType] || 100
        : 0;
      return nodeTime >= slowestTime ? node : slowest;
    }, null as Node<NodeData> | null);

    if (slowestNode) {
      criticalPath.push(slowestNode.id);
      visited.add(slowestNode.id);
    }

    const hasNextLayer = nodes.some(
      (n) => nodeLayer[n.id] === currentLayer + 1
    );
    if (!hasNextLayer) break;
    currentLayer++;
  }

  return criticalPath;
}

function canRunInParallel(
  node: Node<NodeData>,
  nodes: Node<NodeData>[],
  edges: Edge[]
): boolean {
  const incomingEdges = edges.filter((e) => e.target === node.id);
  if (incomingEdges.length === 0) return true;
  if (incomingEdges.length > 1) return false;

  const sourceId = incomingEdges[0].source;
  const sourceNode = nodes.find((n) => n.id === sourceId);
  if (!sourceNode) return false;

  const outgoingFromSource = edges.filter((e) => e.source === sourceId);
  return outgoingFromSource.length > 1;
}

function identifyBottlenecks(
  metrics: Map<string, PerformanceMetric>,
  totalTime: number
): PerformanceMetric[] {
  const threshold = totalTime * 0.3;

  return Array.from(metrics.values())
    .filter((m) => m.estimatedTime >= threshold)
    .sort((a, b) => b.estimatedTime - a.estimatedTime);
}

function identifyParallelizableNodes(
  metrics: Map<string, PerformanceMetric>,
  layerAnalysis: LayerAnalysis
): PerformanceMetric[] {
  return layerAnalysis.layers
    .filter((layer) => layer.canRunInParallel && layer.nodeIds.length > 1)
    .flatMap((layer) =>
      layer.nodeIds.map((nodeId) => metrics.get(nodeId)).filter(Boolean)
    ) as PerformanceMetric[];
}

function generateSuggestions(
  metrics: Map<string, PerformanceMetric>,
  bottleneckNodes: PerformanceMetric[],
  parallelizableNodes: PerformanceMetric[],
  layerAnalysis: LayerAnalysis,
  nodes: Node<NodeData>[]
): OptimizationSuggestion[] {
  const suggestions: OptimizationSuggestion[] = [];

  bottleneckNodes.forEach((bottleneck) => {
    if (CRITICAL_NODE_TYPES.has(bottleneck.nodeType)) {
      suggestions.push({
        type: "bottleneck",
        severity: "high",
        title: "Model Inference Bottleneck",
        description: `${bottleneck.nodeId} is estimated to take ${bottleneck.estimatedTime}ms. Consider using a faster model or batching requests.`,
        affectedNodes: [bottleneck.nodeId],
        potentialImprovement: "Consider using a smaller/faster model variant for non-critical tasks.",
      });
    } else {
      suggestions.push({
        type: "bottleneck",
        severity: "medium",
        title: "Processing Bottleneck",
        description: `${bottleneck.nodeId} is taking significant time. Check if processing can be optimized.`,
        affectedNodes: [bottleneck.nodeId],
      });
    }
  });

  const parallelLayers = layerAnalysis.layers.filter(
    (l) => l.canRunInParallel && l.nodeIds.length > 2
  );
  parallelLayers.forEach((layer) => {
    if (layer.nodeIds.length > 2) {
      suggestions.push({
        type: "parallelization",
        severity: "low",
        title: "Parallel Execution Available",
        description: `Layer ${layer.layerIndex} has ${layer.nodeIds.length} nodes that can run in parallel.`,
        affectedNodes: layer.nodeIds,
        potentialImprovement: "Consider restructuring to maximize parallel execution.",
      });
    }
  });

  const hasHeavyProcessing = Array.from(metrics.values()).some(
    (m) =>
      m.nodeType.includes("Processing") || m.nodeType.includes("Generation")
  );
  if (hasHeavyProcessing) {
    suggestions.push({
      type: "caching",
      severity: "medium",
      title: "Consider Caching",
      description: "Heavy processing nodes detected. Consider adding caching for repeated operations.",
      affectedNodes: [],
      potentialImprovement: "Add a Cache node before/after expensive operations.",
    });
  }

  if (layerAnalysis.maxParallelism < 2) {
    suggestions.push({
      type: "general",
      severity: "low",
      title: "Linear Workflow",
      description: "This workflow runs nodes sequentially. Consider if any nodes can run in parallel.",
      affectedNodes: [],
    });
  }

  return suggestions;
}

export default useWorkflowProfilerStore;
