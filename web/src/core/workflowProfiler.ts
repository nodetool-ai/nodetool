import { Edge } from "@xyflow/react";
import type { Node as ReactFlowNode } from "@xyflow/react";

export interface WorkflowProfile {
  nodeCount: number;
  edgeCount: number;
  maxDepth: number;
  parallelLayers: number;
  complexityScore: number;
  nodeTypeBreakdown: Record<string, number>;
  bottlenecks: BottleneckInfo[];
  recommendations: string[];
  estimatedMemoryUsage: number;
  graphMetrics: GraphMetrics;
}

export interface BottleneckInfo {
  nodeId: string;
  nodeType: string;
  reason: string;
  severity: "low" | "medium" | "high";
  suggestion: string;
}

export interface GraphMetrics {
  density: number;
  avgConnectionsPerNode: number;
  cycles: boolean;
  cycleNodes?: string[];
  isolatedNodes: string[];
  sourceNodes: string[];
  sinkNodes: string[];
  fanInMax: { nodeId: string; count: number };
  fanOutMax: { nodeId: string; count: number };
}

const NODE_COMPLEXITY_WEIGHTS: Record<string, number> = {
  input: 1,
  output: 1,
  transform: 2,
  model: 5,
  image: 3,
  audio: 3,
  video: 4,
  llm: 5,
  embedding: 4,
  database: 3,
  api: 2,
  default: 2,
};

function getNodeComplexity(node: ReactFlowNode): number {
  const type = node.type?.toLowerCase() || "";
  const data = node.data || {};

  let baseWeight = NODE_COMPLEXITY_WEIGHTS.default;

  for (const [category, weight] of Object.entries(NODE_COMPLEXITY_WEIGHTS)) {
    if (type.includes(category)) {
      baseWeight = weight;
      break;
    }
  }

  let multiplier = 1;
  const dataAny = data as Record<string, unknown>;
  if (dataAny?.model_id) {
    multiplier *= 1.5;
  }
  if (dataAny?.temperature !== undefined) {
    multiplier *= 1.2;
  }
  if (dataAny?.max_tokens) {
    multiplier *= 1.3;
  }
  if (dataAny?.batch_size && (dataAny.batch_size as number) > 1) {
    multiplier *= 1 + Math.log2(dataAny.batch_size as number);
  }

  return baseWeight * multiplier;
}

function calculateMaxDepth(
  edges: Edge[],
  nodes: ReactFlowNode[]
): number {
  if (nodes.length === 0) {
    return 0;
  }

  const indegree: Record<string, number> = {};
  const adj: Record<string, string[]> = {};

  nodes.forEach((n) => {
    indegree[n.id] = 0;
    adj[n.id] = [];
  });

  edges.forEach((e) => {
    if (adj[e.source]) {
      adj[e.source].push(e.target);
      indegree[e.target] = (indegree[e.target] || 0) + 1;
    }
  });

  const queue: string[] = [];
  Object.entries(indegree).forEach(([id, deg]) => {
    if (deg === 0) queue.push(id);
  });

  const depth: Record<string, number> = {};
  nodes.forEach((n) => (depth[n.id] = 0));

  let maxDepth = 0;
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    const currentDepth = depth[nodeId];
    maxDepth = Math.max(maxDepth, currentDepth);

    for (const neighbor of adj[nodeId]) {
      depth[neighbor] = Math.max(depth[neighbor], currentDepth + 1);
      indegree[neighbor]--;
      if (indegree[neighbor] === 0) {
        queue.push(neighbor);
      }
    }
  }

  return maxDepth;
}

function detectCycles(
  edges: Edge[],
  nodes: ReactFlowNode[]
): string[] | null {
  const adj: Record<string, string[]> = {};
  const visited: Set<string> = new Set();
  const recursionStack: Set<string> = new Set();
  const cyclePath: string[] = [];

  nodes.forEach((n) => {
    adj[n.id] = edges.filter((e) => e.source === n.id).map((e) => e.target);
  });

  function dfs(nodeId: string): boolean {
    visited.add(nodeId);
    recursionStack.add(nodeId);
    cyclePath.push(nodeId);

    for (const neighbor of adj[nodeId]) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) {
          return true;
        }
      } else if (recursionStack.has(neighbor)) {
        const cycleStart = cyclePath.indexOf(neighbor);
        cyclePath.slice(cycleStart);
        recursionStack.delete(neighbor);
        cyclePath.pop();
        return true;
      }
    }

    recursionStack.delete(nodeId);
    cyclePath.pop();
    return false;
  }

  for (const node of nodes) {
    if (!visited.has(node.id)) {
      if (dfs(node.id)) {
        return cyclePath;
      }
    }
  }

  return null;
}

export function analyzeWorkflow(
  nodes: ReactFlowNode[],
  edges: Edge[]
): WorkflowProfile {
  const nodeCount = nodes.length;
  const edgeCount = edges.length;
  const maxDepth = calculateMaxDepth(edges, nodes);

  const nodeTypeBreakdown: Record<string, number> = {};
  let totalComplexity = 0;
  const fanIn: Record<string, number> = {};
  const fanOut: Record<string, number> = {};

  nodes.forEach((n) => {
    const type = n.type || "unknown";
    nodeTypeBreakdown[type] = (nodeTypeBreakdown[type] || 0) + 1;
    totalComplexity += getNodeComplexity(n);
    fanIn[n.id] = 0;
    fanOut[n.id] = 0;
  });

  edges.forEach((e) => {
    fanOut[e.source] = (fanOut[e.source] || 0) + 1;
    fanIn[e.target] = (fanIn[e.target] || 0) + 1;
  });

  const cycles = detectCycles(edges, nodes);

  const sourceNodes = nodes
    .filter((n) => fanIn[n.id] === 0)
    .map((n) => n.id);

  const sinkNodes = nodes
    .filter((n) => fanOut[n.id] === 0)
    .map((n) => n.id);

  const isolatedNodes = nodes
    .filter((n) => fanIn[n.id] === 0 && fanOut[n.id] === 0)
    .map((n) => n.id);

  let maxFanInNode = { nodeId: "", count: 0 };
  let maxFanOutNode = { nodeId: "", count: 0 };

  Object.entries(fanIn).forEach(([id, count]) => {
    if (count > maxFanInNode.count) {
      maxFanInNode = { nodeId: id, count };
    }
  });

  Object.entries(fanOut).forEach(([id, count]) => {
    if (count > maxFanOutNode.count) {
      maxFanOutNode = { nodeId: id, count };
    }
  });

  const avgConnectionsPerNode =
    nodeCount > 0 ? (edgeCount * 2) / nodeCount : 0;
  const density =
    nodeCount > 1
      ? (2 * edgeCount) / (nodeCount * (nodeCount - 1))
      : 0;

  const graphMetrics: GraphMetrics = {
    density,
    avgConnectionsPerNode,
    cycles: !!cycles,
    cycleNodes: cycles || undefined,
    isolatedNodes,
    sourceNodes,
    sinkNodes,
    fanInMax: maxFanInNode,
    fanOutMax: maxFanOutNode,
  };

  const bottlenecks: BottleneckInfo[] = [];
  const recommendations: string[] = [];

  if (maxDepth > 10) {
    const complexNode = nodes.find(
      (n) => n.type?.includes("model") || n.type?.includes("llm")
    );
    bottlenecks.push({
      nodeId: complexNode?.id || "workflow",
      nodeType: complexNode?.type || "workflow",
      reason: `Deep workflow chain (${maxDepth} levels)`,
      severity: maxDepth > 20 ? "high" : "medium",
      suggestion:
        "Consider breaking into multiple workflows or using parallel processing",
    });
    recommendations.push(
      `Workflow has ${maxDepth} execution levels. Consider optimizing for parallel execution.`
    );
  }

  if (maxFanInNode.count > 10) {
    const highFanInNode = nodes.find((n) => n.id === maxFanInNode.nodeId);
    bottlenecks.push({
      nodeId: maxFanInNode.nodeId,
      nodeType: highFanInNode?.type || "unknown",
      reason: `High fan-in: ${maxFanInNode.count} incoming connections`,
      severity: maxFanInNode.count > 20 ? "high" : "medium",
      suggestion: "Consider restructuring to reduce dependencies on this node",
    });
    recommendations.push(
      `Node "${highFanInNode?.id}" has ${maxFanInNode.count} inputs. Consider splitting the workflow.`
    );
  }

  if (maxFanOutNode.count > 10) {
    const highFanOutNode = nodes.find((n) => n.id === maxFanOutNode.nodeId);
    bottlenecks.push({
      nodeId: maxFanOutNode.nodeId,
      nodeType: highFanOutNode?.type || "unknown",
      reason: `High fan-out: ${maxFanOutNode.count} outgoing connections`,
      severity: maxFanOutNode.count > 20 ? "high" : "medium",
      suggestion: "Consider grouping outputs or creating sub-workflows",
    });
    recommendations.push(
      `Node "${highFanOutNode?.id}" has ${maxFanOutNode.count} outputs. Consider modularization.`
    );
  }

  if (cycles) {
    bottlenecks.push({
      nodeId: cycles[0],
      nodeType: nodes.find((n) => n.id === cycles[0])?.type || "unknown",
      reason: "Cycle detected in workflow graph",
      severity: "high",
      suggestion: "Remove circular dependencies to prevent infinite loops",
    });
    recommendations.push(
      "Workflow contains cycles which can cause infinite loops during execution."
    );
  }

  if (isolatedNodes.length > 0) {
    recommendations.push(
      `${isolatedNodes.length} node(s) are disconnected from the main workflow.`
    );
  }

  const modelNodes = nodes.filter(
    (n) =>
      n.type?.includes("model") ||
      n.type?.includes("llm") ||
      n.type?.includes("hugging")
  );
  if (modelNodes.length > 3) {
    recommendations.push(
      `Workflow uses ${modelNodes.length} model nodes. Consider memory usage for local inference.`
    );
  }

  const complexityScore = Math.round(
    (totalComplexity + edgeCount * 0.5 + maxDepth * 2) / 10
  );

  const estimatedMemoryUsage = Math.round(
    nodeCount * 10 + edgeCount * 2 + modelNodes.length * 500
  );

  const parallelLayers = edges.length > 0 ? maxDepth : 1;

  return {
    nodeCount,
    edgeCount,
    maxDepth,
    parallelLayers,
    complexityScore,
    nodeTypeBreakdown,
    bottlenecks,
    recommendations,
    estimatedMemoryUsage,
    graphMetrics,
  };
}

export function getComplexityLevel(score: number): {
  label: string;
  color: string;
} {
  if (score < 10) {
    return { label: "Low", color: "success.main" };
  }
  if (score < 30) {
    return { label: "Medium", color: "warning.main" };
  }
  if (score < 50) {
    return { label: "High", color: "error.main" };
  }
  return { label: "Critical", color: "error.dark" };
}
