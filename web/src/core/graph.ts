import { Edge, Node } from "reactflow";
import { devWarn } from "../utils/DevLog";
import dagre from "dagre";

/**
 * Topological sort of a graph.
 * This is used to sort nodes in the workflow editor for processing.
 * The algorithm is based on Kahn's algorithm.
 * https://en.wikipedia.org/wiki/Topological_sorting#Kahn's_algorithm
 *
 * The nodes are returned as layers of nodes, where each layer can be
 * processed in parallel.
 *
 * If the graph contains a cycle, an error is thrown.
 *
 * @param edges The edges of the graph.
 * @param nodes The nodes of the graph.
 * @returns A list of sorted layers of nodes.
 */
export function topologicalSort(edges: Edge[], nodes: Node[]): string[][] {
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
    if (indegree[nodeId] === 0) queue.push(nodeId);
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
    devWarn("Graph contains at least one cycle", { edges, nodes });
  }

  return sortedNodes;
}

type Result = { edges: Edge[]; nodes: Node[] };

/**
 * Returns a subgraph of the given graph starting from the given start node.
 * @param edges - The edges of the graph.
 * @param nodes - The nodes of the graph.
 * @param startNode - The node to start the subgraph from.
 * @oaram stopNode - The node to stop the subgraph at.
 * @returns The subgraph of the given graph.
 */
export function subgraph(
  edges: Edge[],
  nodes: Node[],
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

    // Find and collect connected edges and nodes
    for (const edge of edges) {
      if (edge.source === currentNodeId) {
        if (!visited.has(edge.target)) {
          result.edges.push(edge);
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

  return result;
}

type NodePosition = { x: number; y: number };
type NodePositions = { [id: string]: NodePosition };

export const autoLayout = (edges: Edge[], nodes: Node[]) => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: "LR" });

  const originalPositions: NodePositions = nodes.reduce(
    (acc: NodePositions, node) => {
      acc[node.id] = { x: node.position.x, y: node.position.y };
      return acc;
    },
    {}
  );

  nodes.forEach((node) => {
    if (node.type === "comment") return;
    dagreGraph.setNode(node.id, {
      width: node.width,
      height: node.height
    });
  });

  edges.forEach((el) => {
    dagreGraph.setEdge(el.source, el.target);
  });

  dagre.layout(dagreGraph);

  let minX = Infinity;
  let minY = Infinity;

  nodes.forEach((node) => {
    if (node.type === "nodetool.workflows.base_node.Comment") return;
    const dnode = dagreGraph.node(node.id);
    minX = Math.min(minX, dnode.x - dnode.width / 2);
    minY = Math.min(minY, dnode.y - dnode.height / 2);
  });

  const originalTopLeft = {
    x: Math.min(
      ...Object.values(originalPositions).map((pos: NodePosition) => pos.x)
    ),
    y: Math.min(
      ...Object.values(originalPositions).map((pos: NodePosition) => pos.y)
    )
  };

  const layoutedNodes = nodes.map((node: Node) => {
    if (node.type === "nodetool.workflows.base_node.Comment") return node;
    const dnode = dagreGraph.node(node.id);
    const position = {
      x: dnode.x - minX + originalTopLeft.x - 50,
      y: dnode.y - minY + originalTopLeft.y - 50
    };
    return {
      ...node,
      position: position,
      size: { width: dnode.width, height: dnode.height }
    };
  });

  return layoutedNodes;
};
