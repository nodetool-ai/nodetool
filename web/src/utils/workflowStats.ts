/**
 * Workflow Statistics Utilities
 *
 * Provides functions to calculate various statistics about a workflow graph.
 * Used by the WorkflowStatsPanel to display workflow metrics.
 */

import { Graph, Node as GraphNode, Edge as GraphEdge } from "../stores/ApiTypes";

export interface WorkflowStats {
  nodeCount: number;
  edgeCount: number;
  nodeTypes: Record<string, number>;
  complexity: {
    score: number;
    level: "simple" | "moderate" | "complex" | "very-complex";
    factors: ComplexityFactor[];
  };
  connectivity: {
    density: number;
    averageConnectionsPerNode: number;
    disconnectedNodes: number;
    orphans: number;
  };
  structure: {
    inputNodes: number;
    outputNodes: number;
    hasCycles: boolean;
    depth: number;
    branches: number;
  };
  health: {
    score: number;
    issues: HealthIssue[];
  };
}

export interface ComplexityFactor {
  name: string;
  impact: number;
  description: string;
}

export interface HealthIssue {
  severity: "info" | "warning" | "error";
  type: string;
  message: string;
  suggestion?: string;
}

const NODE_CATEGORY_PATTERNS: Record<string, RegExp[]> = {
  input: [/input/i, /chatinput/i, /file/i, /image/i, /audio/i, /video/i, /text/i],
  output: [/output/i, /preview/i, /chatoutput/i, /save/i],
  llm: [/llm/i, /gpt/i, /claude/i, /ollama/i, /openai/i, /anthropic/i, /model/i],
  image: [/image/i, /diffusion/i, /stable/i, /sd1/i, /sdxl/i, /flux/i],
  video: [/video/i],
  audio: [/audio/i, /speech/i, /tts/i, /whisper/i],
  text: [/text/i, /string/i, /prompt/i, /llm/i],
  condition: [/condition/i, /if/i, /switch/i, /branch/i, /boolean/i],
  math: [/math/i, /number/i, /float/i, /int/i, /calculate/i],
  data: [/list/i, /dict/i, /array/i, /dataframe/i, /collection/i, /combine/i],
  agent: [/agent/i, /task/i, /planner/i, /crew/i],
  transform: [/transform/i, /convert/i, /process/i, /filter/i, /map/i],
};

const categorizeNodeType = (nodeType: string): string => {
  const lowerType = nodeType.toLowerCase();

  for (const [category, patterns] of Object.entries(NODE_CATEGORY_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(lowerType)) {
        return category;
      }
    }
  }

  return "other";
};

const countNodeTypes = (nodes: GraphNode[]): Record<string, number> => {
  const counts: Record<string, number> = {};

  for (const node of nodes) {
    const category = categorizeNodeType(node.type);
    counts[category] = (counts[category] || 0) + 1;
  }

  return counts;
};

const detectCycles = (
  edges: GraphEdge[],
  nodes: GraphNode[]
): { hasCycles: boolean; cyclePath?: string[] } => {
  const adjacencyList = new Map<string, string[]>();
  const nodeIds = new Set(nodes.map((n) => n.id));

  for (const node of nodes) {
    adjacencyList.set(node.id, []);
  }

  for (const edge of edges) {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      adjacencyList.get(edge.source)?.push(edge.target);
    }
  }

  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  const hasCycleDFS = (
    nodeId: string,
    path: string[]
  ): { hasCycle: boolean; cyclePath?: string[] } => {
    visited.add(nodeId);
    recursionStack.add(nodeId);
    path.push(nodeId);

    const neighbors = adjacencyList.get(nodeId) || [];

    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        const result = hasCycleDFS(neighbor, path);
        if (result.hasCycle) {
          return result;
        }
      } else if (recursionStack.has(neighbor)) {
        const cycleStart = path.indexOf(neighbor);
        return {
          hasCycle: true,
          cyclePath: path.slice(cycleStart)
        };
      }
    }

    path.pop();
    recursionStack.delete(nodeId);
    return { hasCycle: false };
  };

  for (const nodeId of nodeIds) {
    if (!visited.has(nodeId)) {
      const result = hasCycleDFS(nodeId, []);
      if (result.hasCycle) {
        return { hasCycles: result.hasCycle, cyclePath: result.cyclePath };
      }
    }
  }

  return { hasCycles: false };
};

const calculateGraphDepth = (
  edges: GraphEdge[],
  nodes: GraphNode[]
): number => {
  const inDegree = new Map<string, number>();
  const adjacencyList = new Map<string, string[]>();

  for (const node of nodes) {
    inDegree.set(node.id, 0);
    adjacencyList.set(node.id, []);
  }

  for (const edge of edges) {
    adjacencyList.get(edge.source)?.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
  }

  const queue: string[] = [];
  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) {
      queue.push(nodeId);
    }
  }

  let maxDepth = 0;
  const depth = new Map<string, number>();

  for (const nodeId of queue) {
    depth.set(nodeId, 1);
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentDepth = depth.get(current) || 0;
    maxDepth = Math.max(maxDepth, currentDepth);

    const neighbors = adjacencyList.get(current) || [];
    for (const neighbor of neighbors) {
      const newDepth = currentDepth + 1;
      if (!depth.has(neighbor) || newDepth > depth.get(neighbor)!) {
        depth.set(neighbor, newDepth);
      }
      inDegree.set(neighbor, inDegree.get(neighbor)! - 1);
      if (inDegree.get(neighbor) === 0) {
        queue.push(neighbor);
      }
    }
  }

  return maxDepth;
};

const countBranches = (
  edges: GraphEdge[],
  nodes: GraphNode[]
): number => {
  const outDegree = new Map<string, number>();

  for (const node of nodes) {
    outDegree.set(node.id, 0);
  }

  for (const edge of edges) {
    outDegree.set(edge.source, (outDegree.get(edge.source) || 0) + 1);
  }

  let branchCount = 0;
  for (const [, degree] of outDegree) {
    if (degree > 1) {
      branchCount += degree - 1;
    }
  }

  return branchCount;
};

const calculateComplexity = (
  nodeCount: number,
  edgeCount: number,
  hasCycles: boolean,
  depth: number,
  branches: number,
  nodeTypes: Record<string, number>
): { score: number; level: "simple" | "moderate" | "complex" | "very-complex"; factors: ComplexityFactor[] } => {
  const factors: ComplexityFactor[] = [];
  let score = 0;

  if (nodeCount > 0) {
    const nodeFactor = Math.min(nodeCount * 2, 30);
    score += nodeFactor;
    factors.push({
      name: "Node Count",
      impact: nodeFactor,
      description: `${nodeCount} nodes contribute to complexity`
    });
  }

  if (edgeCount > 0) {
    const edgeFactor = Math.min(edgeCount * 1.5, 25);
    score += edgeFactor;
    factors.push({
      name: "Connections",
      impact: edgeFactor,
      description: `${edgeCount} connections between nodes`
    });
  }

  if (hasCycles) {
    const cycleFactor = 20;
    score += cycleFactor;
    factors.push({
      name: "Cycles Detected",
      impact: cycleFactor,
      description: "Workflow contains circular dependencies"
    });
  }

  if (depth > 5) {
    const depthFactor = Math.min((depth - 5) * 2, 15);
    score += depthFactor;
    factors.push({
      name: "Graph Depth",
      impact: depthFactor,
      description: `Deep execution path (${depth} levels)`
    });
  }

  if (branches > 3) {
    const branchFactor = Math.min((branches - 3) * 2, 15);
    score += branchFactor;
    factors.push({
      name: "Branching",
      impact: branchFactor,
      description: `Multiple execution branches (${branches} splits)`
    });
  }

  const uniqueNodeTypes = Object.keys(nodeTypes).length;
  if (uniqueNodeTypes > 5) {
    const varietyFactor = Math.min((uniqueNodeTypes - 5) * 2, 10);
    score += varietyFactor;
    factors.push({
      name: "Node Variety",
      impact: varietyFactor,
      description: `${uniqueNodeTypes} different node types used`
    });
  }

  let level: "simple" | "moderate" | "complex" | "very-complex";
  if (score < 30) {
    level = "simple";
  } else if (score < 60) {
    level = "moderate";
  } else if (score < 100) {
    level = "complex";
  } else {
    level = "very-complex";
  }

  return { score, level, factors };
};

const calculateConnectivity = (
  nodeCount: number,
  edgeCount: number,
  nodes: GraphNode[],
  edges: GraphEdge[]
): { density: number; averageConnectionsPerNode: number; disconnectedNodes: number; orphans: number } => {
  const connectedNodes = new Set<string>();
  const orphanNodes = new Set<string>();

  for (const edge of edges) {
    connectedNodes.add(edge.source);
    connectedNodes.add(edge.target);
  }

  let disconnectedCount = 0;
  let orphanCount = 0;

  for (const node of nodes) {
    if (!connectedNodes.has(node.id)) {
      disconnectedCount++;
    }

    const hasInput = edges.some((e) => e.target === node.id);
    const hasOutput = edges.some((e) => e.source === node.id);

    if (!hasInput && !hasOutput) {
      orphanCount++;
    }
  }

  const maxEdges = nodeCount * (nodeCount - 1) / 2;
  const density = maxEdges > 0 ? (edgeCount / maxEdges) * 100 : 0;
  const averageConnectionsPerNode = nodeCount > 0 ? (edgeCount * 2) / nodeCount : 0;

  return {
    density: Math.round(density * 100) / 100,
    averageConnectionsPerNode: Math.round(averageConnectionsPerNode * 100) / 100,
    disconnectedNodes: disconnectedCount,
    orphans: orphanCount
  };
};

const analyzeHealth = (
  nodeCount: number,
  edgeCount: number,
  hasCycles: boolean,
  disconnectedNodes: number,
  orphans: number,
  depth: number,
  inputNodes: number,
  outputNodes: number
): { score: number; issues: HealthIssue[] } => {
  const issues: HealthIssue[] = [];
  let score = 100;

  if (nodeCount === 0) {
    score = 0;
    issues.push({
      severity: "info",
      type: "empty",
      message: "Workflow is empty",
      suggestion: "Add nodes to start building your workflow"
    });
    return { score, issues };
  }

  if (hasCycles) {
    score -= 25;
    issues.push({
      severity: "error",
      type: "cycles",
      message: "Circular dependencies detected",
      suggestion: "Review node connections and remove loops"
    });
  }

  if (disconnectedNodes > 0) {
    const penalty = Math.min(disconnectedNodes * 5, 20);
    score -= penalty;
    issues.push({
      severity: "warning",
      type: "disconnected",
      message: `${disconnectedNodes} disconnected node(s)`,
      suggestion: "Connect all nodes or remove unused ones"
    });
  }

  if (orphans > 0) {
    const penalty = Math.min(orphans * 3, 15);
    score -= penalty;
    issues.push({
      severity: "warning",
      type: "orphans",
      message: `${orphans} orphaned node(s) with no connections`,
      suggestion: "Remove nodes that are not connected to the workflow"
    });
  }

  if (inputNodes === 0) {
    score -= 15;
    issues.push({
      severity: "warning",
      type: "no-input",
      message: "No input nodes found",
      suggestion: "Add input nodes to provide data to the workflow"
    });
  }

  if (outputNodes === 0) {
    score -= 15;
    issues.push({
      severity: "warning",
      type: "no-output",
      message: "No output nodes found",
      suggestion: "Add output nodes to see results"
    });
  }

  if (edgeCount === 0 && nodeCount > 1) {
    score -= 20;
    issues.push({
      severity: "warning",
      type: "no-connections",
      message: "No connections between nodes",
      suggestion: "Connect nodes to create a flow"
    });
  }

  if (depth > 20) {
    score -= 10;
    issues.push({
      severity: "info",
      type: "deep",
      message: `Very deep workflow (${depth} levels)`,
      suggestion: "Consider simplifying or grouping nodes"
    });
  }

  score = Math.max(0, Math.min(100, score));

  return { score, issues };
};

const analyzeStructure = (
  nodes: GraphNode[],
  edges: GraphEdge[],
  nodeTypes: Record<string, number>
): {
  inputNodes: number;
  outputNodes: number;
  hasCycles: boolean;
  depth: number;
  branches: number;
} => {
  const inputNodes = nodeTypes.input || 0;
  const outputNodes = nodeTypes.output || 0;
  const cycleResult = detectCycles(edges, nodes);
  const depth = calculateGraphDepth(edges, nodes);
  const branches = countBranches(edges, nodes);

  return {
    inputNodes,
    outputNodes,
    hasCycles: cycleResult.hasCycles,
    depth,
    branches
  };
};

export const calculateWorkflowStats = (graph: Graph): WorkflowStats => {
  const nodes = graph.nodes || [];
  const edges = graph.edges || [];

  const nodeCount = nodes.length;
  const edgeCount = edges.length;
  const nodeTypes = countNodeTypes(nodes);

  const structure = analyzeStructure(nodes, edges, nodeTypes);
  const connectivity = calculateConnectivity(nodeCount, edgeCount, nodes, edges);
  const complexity = calculateComplexity(
    nodeCount,
    edgeCount,
    structure.hasCycles,
    structure.depth,
    structure.branches,
    nodeTypes
  );
  const health = analyzeHealth(
    nodeCount,
    edgeCount,
    structure.hasCycles,
    connectivity.disconnectedNodes,
    connectivity.orphans,
    structure.depth,
    structure.inputNodes,
    structure.outputNodes
  );

  return {
    nodeCount,
    edgeCount,
    nodeTypes,
    complexity,
    connectivity,
    structure,
    health
  };
};

export const getComplexityColor = (level: "simple" | "moderate" | "complex" | "very-complex"): string => {
  switch (level) {
    case "simple":
      return "#10B981";
    case "moderate":
      return "#F59E0B";
    case "complex":
      return "#F97316";
    case "very-complex":
      return "#EF4444";
    default:
      return "#6B7280";
  }
};

export const getHealthColor = (score: number): string => {
  if (score >= 80) {
    return "#10B981";
  } else if (score >= 60) {
    return "#F59E0B";
  } else if (score >= 40) {
    return "#F97316";
  } else {
    return "#EF4444";
  }
};
