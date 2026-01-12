import { Edge, Node } from "@xyflow/react";
import log from "loglevel";
import { NodeData } from "../stores/NodeData";
import ELK from "elkjs";

/**
 * Graph utilities for workflow layout and traversal.
 *
 * - `topologicalSort` (Kahn) returns layered node ids for parallel-friendly
 *   processing and warns on cycles.
 * - `subgraph` collects nodes reachable from a start node (optional stop) and
 *   returns all edges whose endpoints are in that reachable set.
 * - `autoLayout` runs ELK layered layout, filtering out comment nodes, grouping
 *   by parentId, and resizing group nodes to fit children with padding.
 */
export function topologicalSort(
  edges: Edge[],
  nodes: Node<NodeData>[]
): string[][] {
  // handle empty edges case
  if (edges.length === 0) {
    return [nodes.map((node) => node.id)];
  }

  const indegree: Record<string, number> = {};
  edges = [...edges];

  // initialize the indegree of each node to 0
  nodes.forEach((node) => {
    indegree[node.id] = 0;
  });

  // iterate through the edges and increment the indegree of the target node
  edges.forEach((edge) => {
    indegree[edge.target]++;
  });

  // initialize the queue with nodes that have no incoming edges
  const queue: string[] = [];
  Object.keys(indegree).forEach((nodeId) => {
    if (indegree[nodeId] === 0) {queue.push(nodeId);}
  });

  // initialize the sorted nodes which will be returned
  // this is a list of layers of nodes
  const sortedNodes: string[][] = [];

  // iterate through the queue until it is empty
  while (queue.length) {
    const levelNodes: string[] = [];

    // iterate through the nodes in the queue
    for (let i = 0, len = queue.length; i < len; i++) {
      const n = queue.shift()!;
      levelNodes.push(n);

      // iterate through the edges and remove edges that are connected to the nod
      for (const edge of [...edges]) {
        // if the edge is connected to the node, remove it
        if (edge.source === n) {
          const index = edges.indexOf(edge);
          if (index > -1) {
            edges.splice(index, 1);
          }
          indegree[edge.target]--;
          // if the node has no more incoming edges, add it to the queue
          if (indegree[edge.target] === 0) {
            queue.push(edge.target);
          }
        }
      }
    }
    // add the layer to the sorted nodes
    sortedNodes.push(levelNodes);
  }

  const totalNodes = nodes.length;
  const processedNodes = sortedNodes.flat().length;
  if (processedNodes < totalNodes) {
    log.warn("Graph contains at least one cycle", { edges, nodes });
  }

  return sortedNodes;
}

type Result = { edges: Edge[]; nodes: Node<NodeData>[] };

/**
 * Returns a subgraph of the given graph starting from the given start node.
 *
 * Examples:
 * 1) Linear chain: A->B->C from A => nodes {A,B,C}, edges {A->B, B->C}
 * 2) Diamond: A->B, A->C, B->D, C->D from A => nodes {A,B,C,D}, edges all four
 * 3) Stop node: A->B->C->D from A, stop C => nodes {A,B,C}, edges {A->B, B->C}
 * @param edges - The edges of the graph.
 * @param nodes - The nodes of the graph.
 * @param startNode - The node to start the subgraph from.
 * @param stopNode - The node to stop the subgraph at.
 * @returns The subgraph of the given graph.
 */
export function subgraph(
  edges: Edge[],
  nodes: Node<NodeData>[],
  startNode: Node,
  stopNode: Node | null = null
): Result {
  // Keep track of visited nodes
  const visited: Set<string> = new Set();
  // Use a stack to perform a depth-first search
  const stack: string[] = [startNode.id];
  const result: Result = { edges: [], nodes: [] };

  while (stack.length) {
    const currentNodeId = stack.pop()!;

    if (visited.has(currentNodeId)) {
      continue;
    }

    visited.add(currentNodeId);

    if (stopNode && currentNodeId === stopNode.id) {
      break;
    }

    // Find and collect connected nodes
    for (const edge of edges) {
      if (edge.source === currentNodeId) {
        if (!visited.has(edge.target)) {
          stack.push(edge.target);
        }
      }
    }
  }

  // Add nodes to result based on visited nodes
  for (const node of nodes) {
    if (visited.has(node.id)) {
      result.nodes.push(node);
    }
  }

  // Include all edges that stay within the visited node set.
  result.edges = edges.filter(
    (edge) => visited.has(edge.source) && visited.has(edge.target)
  );

  return result;
}

export const autoLayout = async (
  edges: Edge[],
  nodes: Node<NodeData>[]
): Promise<Node<NodeData>[]> => {
  const elk = new ELK({
    defaultLayoutOptions: {
      "elk.layered.spacing.nodeNodeBetweenLayers": "30",
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": "50",
      "elk.layered.spacing.edgeNodeBetweenLayers": "30",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX"
    }
  });

  // Filter out comment nodes
  const nonCommentNodes = nodes.filter(
    (node) => node.type !== "nodetool.workflows.base_node.Comment"
  );

  // Group non-comment nodes by parentId
  const nodeGroups: Record<string, Node<NodeData>[]> = {};
  nonCommentNodes.forEach((node) => {
    const groupId = node.parentId || "root";
    if (!nodeGroups[groupId]) {
      nodeGroups[groupId] = [];
    }
    nodeGroups[groupId].push(node);
  });

  // Helper function to create ELK node structure
  const createElkNode = (node: Node<NodeData>, children?: any[]): any => ({
    id: node.id,
    width: node.measured?.width ?? 100,
    height: node.measured?.height ?? 100,
    ...(children && { children })
  });

  // Helper function to create ELK graph for a group of nodes
  const createElkGraph = (
    groupNodes: Node<NodeData>[],
    groupEdges: Edge[],
    isRoot = false
  ) => ({
    id: isRoot ? "root" : groupNodes[0].parentId || "root",
    layoutOptions: {
      "elk.padding": "[top=50,left=50,bottom=50,right=50]"
    },
    children: groupNodes.map((node) => createElkNode(node)),
    edges: groupEdges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target]
    }))
  });

  // Helper function to update node positions
  const updateNodePositions = (
    layoutNode: any,
    parentX = 0,
    parentY = 0
  ): Node<NodeData> => {
    const originalNode = nodes.find((n) => n.id === layoutNode.id)!;
    return {
      ...originalNode,
      position: {
        x: (layoutNode.x ?? 0) + parentX,
        y: (layoutNode.y ?? 0) + parentY
      }
    };
  };

  // Process groups in topological order
  const processedGroups: Record<string, Node<NodeData>[]> = {};
  const groupOrder = [
    "root",
    ...Object.keys(nodeGroups).filter((id) => id !== "root")
  ].reverse();

  // root group is processed last to ensure all group nodes are processed
  for (const groupId of groupOrder) {
    const groupNodes = nodeGroups[groupId] || [];
    const groupEdges = edges.filter(
      (edge) =>
        groupNodes.some((n) => n.id === edge.source) &&
        groupNodes.some((n) => n.id === edge.target)
    );

    const graph = createElkGraph(groupNodes, groupEdges, groupId === "root");

    try {
      const layout = await elk.layout(graph);
      const groupUpdatedNodes = layout.children!.map((layoutNode) =>
        updateNodePositions(layoutNode)
      );

      // Update group node dimensions based on children
      if (groupId !== "root") {
        const parentNode = nodes.find(
          (n) => n.id === groupId
        ) as Node<NodeData>;
        if (parentNode) {
          const xExtent = Math.max(
            ...groupUpdatedNodes.map(
              (n) => n.position.x + (n.measured?.width ?? 100)
            )
          );
          const yExtent = Math.max(
            ...groupUpdatedNodes.map(
              (n) => n.position.y + (n.measured?.height ?? 100)
            )
          );
          parentNode.width = xExtent + 50;
          parentNode.height = yExtent + 50;
          parentNode.measured = {
            width: parentNode.width,
            height: parentNode.height
          };
        }
      }

      processedGroups[groupId] = groupUpdatedNodes;
    } catch (error) {
      console.error(`Error in ELK layout for group ${groupId}:`, error);
    }
  }

  // Combine updated non-comment nodes with original comment nodes
  const updatedNonCommentNodes = Object.values(processedGroups).flat();
  const commentNodes = nodes.filter(
    (node) => node.type === "nodetool.workflows.base_node.Comment"
  );

  return [...updatedNonCommentNodes, ...commentNodes];
};

export interface WorkflowStats {
  nodeCount: number;
  edgeCount: number;
  nodeCountsByType: Record<string, number>;
  nodeCountsByCategory: Record<string, number>;
  workflowDepth: number;
  hasCycles: boolean;
  sourceNodes: number;
  sinkNodes: number;
  branchingFactor: number;
}

export interface NodeTypeInfo {
  type: string;
  category: string;
  displayName: string;
}

const NODE_CATEGORY_PATTERNS: Record<string, RegExp[]> = {
  "Inputs": [/^nodetool\.input\./],
  "Outputs": [/^nodetool\.output\./],
  "Processing": [/^nodetool\.processing\./],
  "Control Flow": [/^nodetool\.control\./, /nodetool\.workflows\./],
  "Models": [/^nodetool\.models\./, /model$/],
};

const getNodeCategory = (nodeType: string): string => {
  for (const [category, patterns] of Object.entries(NODE_CATEGORY_PATTERNS)) {
    if (patterns.some((pattern) => pattern.test(nodeType))) {
      return category;
    }
  }
  return "Other";
};

const getNodeDisplayName = (nodeType: string): string => {
  const parts = nodeType.split(".");
  const lastPart = parts[parts.length - 1];
  return lastPart
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
};

export const getNodeTypeInfo = (nodeType: string): NodeTypeInfo => ({
  type: nodeType,
  category: getNodeCategory(nodeType),
  displayName: getNodeDisplayName(nodeType)
});

export const calculateWorkflowStats = (
  nodes: Node<NodeData>[],
  edges: Edge[]
): WorkflowStats => {
  const nodeCountsByType: Record<string, number> = {};
  const nodeCountsByCategory: Record<string, number> = {};
  const indegree: Record<string, number> = {};
  const outdegree: Record<string, number> = {};

  nodes.forEach((node) => {
    const info = getNodeTypeInfo(node.type ?? "");
    nodeCountsByType[info.displayName] = (nodeCountsByType[info.displayName] || 0) + 1;
    nodeCountsByCategory[info.category] = (nodeCountsByCategory[info.category] || 0) + 1;
    indegree[node.id] = 0;
    outdegree[node.id] = 0;
  });

  edges.forEach((edge) => {
    if (indegree[edge.target] !== undefined) {
      indegree[edge.target]++;
    }
    if (outdegree[edge.source] !== undefined) {
      outdegree[edge.source]++;
    }
  });

  const sourceNodes = nodes.filter((node) => indegree[node.id] === 0).length;
  const sinkNodes = nodes.filter((node) => outdegree[node.id] === 0).length;

  const topologicalLayers = topologicalSort(edges, nodes);
  const hasCycles = topologicalLayers.flat().length < nodes.length;
  const workflowDepth = topologicalLayers.length;

  const totalOutDegree = Object.values(outdegree).reduce((sum, val) => sum + val, 0);
  const branchingFactor = nodes.length > 0 ? totalOutDegree / nodes.length : 0;

  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodeCountsByType,
    nodeCountsByCategory,
    workflowDepth,
    hasCycles,
    sourceNodes,
    sinkNodes,
    branchingFactor: Math.round(branchingFactor * 100) / 100
  };
};

export const getWorkflowComplexityLevel = (stats: WorkflowStats): "simple" | "moderate" | "complex" => {
  if (stats.nodeCount <= 10 && stats.workflowDepth <= 5) {
    return "simple";
  }
  if (stats.nodeCount > 50) {
    return "complex";
  }
  return "moderate";
};

export const getWorkflowComplexityDescription = (level: "simple" | "moderate" | "complex"): string => {
  switch (level) {
    case "simple":
      return "This workflow has a straightforward structure with few nodes and dependencies.";
    case "moderate":
      return "This workflow has moderate complexity with branching and multiple processing steps.";
    case "complex":
      return "This is a complex workflow with many nodes and potential for parallel execution.";
    default:
      return "";
  }
};
