import { Edge, Node } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";
import ELK, { ElkNode } from "elkjs/lib/elk.bundled.js";
import { COMMENT_NODE_TYPE } from "../constants/nodeTypes";

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
    console.warn("Graph contains at least one cycle", { edges, nodes });
  }

  return sortedNodes;
}

type Result = { edges: Edge[]; nodes: Node<NodeData>[] };

/**
 * Returns a subgraph starting from the given start node.
 *
 * Examples:
 * - Linear: A->B->C from A => {A,B,C}
 * - Diamond: A->B, A->C, B->D, C->D from A => {A,B,C,D}
 * - Stop: A->B->C->D from A, stop C => {A,B,C}
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

const isControlEdge = (edge: Edge): boolean =>
  edge.type === "control" ||
  (edge.data != null && "edge_type" in edge.data && edge.data.edge_type === "control");

/**
 * Compute a layer index per node using data edges (target ≥ source + 1) and
 * collapsing control edges to the same layer (controller and controlled node
 * share a column). Used to feed ELK's partitioning so it respects the
 * "controlled node is a sibling, not a successor" intent.
 */
const computeLayerPartitions = (
  nodes: Node<NodeData>[],
  edges: Edge[]
): Map<string, number> => {
  const layer = new Map<string, number>();
  nodes.forEach((n) => layer.set(n.id, 0));

  const dataEdges = edges.filter((e) => !isControlEdge(e));
  const ctrlEdges = edges.filter(isControlEdge);

  let changed = true;
  let safety = Math.max(8, nodes.length * 4);
  while (changed && safety-- > 0) {
    changed = false;
    for (const e of dataEdges) {
      const want = (layer.get(e.source) ?? 0) + 1;
      if ((layer.get(e.target) ?? 0) < want) {
        layer.set(e.target, want);
        changed = true;
      }
    }
    // Pin control source/target to the same (max) layer.
    for (const e of ctrlEdges) {
      const src = layer.get(e.source) ?? 0;
      const tgt = layer.get(e.target) ?? 0;
      if (src === tgt) continue;
      const pinned = Math.max(src, tgt);
      if (src !== pinned) {
        layer.set(e.source, pinned);
        changed = true;
      }
      if (tgt !== pinned) {
        layer.set(e.target, pinned);
        changed = true;
      }
    }
  }

  return layer;
};

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

  const layerPartitions = computeLayerPartitions(nodes, edges);

  // Filter out comment nodes
  const nonCommentNodes = nodes.filter(
    (node) => node.type !== COMMENT_NODE_TYPE
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

  // Title panels (EditableTitle) render absolutely-positioned below the node
  // (top: 100% + 12px) so they don't contribute to node.measured.height.
  // Measure them from the DOM so ELK reserves space and avoids overlap.
  const measureTitleHeight = (nodeId: string): number => {
    if (typeof document === "undefined") return 40;
    const el = document.querySelector(
      `.react-flow__node[data-id="${CSS.escape(nodeId)}"] .title-container`
    ) as HTMLElement | null;
    if (!el) return 40;
    return el.offsetHeight + 12; // 12px = top offset gap
  };

  // Read the top-to-bottom order of a node's output handles from the DOM so
  // downstream nodes can be placed in the same order as the source handles
  // that feed them. Output handles render in a single flex column in handle
  // order, so DOM order equals vertical order. Returns handleId → index.
  const sourceHandleOrderCache = new Map<string, Map<string, number>>();
  const getSourceHandleOrder = (nodeId: string): Map<string, number> => {
    const cached = sourceHandleOrderCache.get(nodeId);
    if (cached) return cached;
    const order = new Map<string, number>();
    if (typeof document !== "undefined") {
      const handles = document.querySelectorAll(
        `.react-flow__node[data-id="${CSS.escape(nodeId)}"] .react-flow__handle.source`
      );
      handles.forEach((el) => {
        const handleId = el.getAttribute("data-handleid");
        if (handleId != null && !order.has(handleId)) {
          order.set(handleId, order.size);
        }
      });
    }
    sourceHandleOrderCache.set(nodeId, order);
    return order;
  };

  // Helper function to create ELK node structure
  const createElkNode = (node: Node<NodeData>, children?: ElkNode[]): ElkNode => ({
    id: node.id,
    width: node.measured?.width ?? 100,
    height:
      (node.measured?.height ?? 100) +
      (node.data?.title ? measureTitleHeight(node.id) : 0),
    layoutOptions: {
      "elk.partitioning.partition": String(layerPartitions.get(node.id) ?? 0)
    },
    ...(children && { children })
  });

  // Within a partition, place each controller immediately followed by its
  // controlled nodes so model-order ordering renders the controlled node
  // directly below the controller.
  const orderForControlPlacement = (
    groupNodes: Node<NodeData>[],
    groupEdges: Edge[]
  ): Node<NodeData>[] => {
    const controlled = new Map<string, string[]>();
    for (const e of groupEdges) {
      if (!isControlEdge(e)) continue;
      if (!controlled.has(e.source)) controlled.set(e.source, []);
      controlled.get(e.source)!.push(e.target);
    }
    if (controlled.size === 0) return groupNodes;

    const byId = new Map(groupNodes.map((n) => [n.id, n]));
    const placed = new Set<string>();
    const ordered: Node<NodeData>[] = [];
    for (const node of groupNodes) {
      if (placed.has(node.id)) continue;
      ordered.push(node);
      placed.add(node.id);
      for (const targetId of controlled.get(node.id) ?? []) {
        const target = byId.get(targetId);
        if (target && !placed.has(targetId)) {
          ordered.push(target);
          placed.add(targetId);
        }
      }
    }
    return ordered;
  };

  // Order nodes within each layer so a node sits in the same top-to-bottom
  // position as the upstream output handle that feeds it: siblings sharing a
  // source are sorted by that source's handle order, and a node is otherwise
  // kept near its predecessors (barycenter). ELK honors the resulting model
  // order via forceNodeModelOrder.
  const orderByUpstreamHandles = (
    groupNodes: Node<NodeData>[],
    groupEdges: Edge[]
  ): Node<NodeData>[] => {
    const dataEdges = groupEdges.filter((edge) => !isControlEdge(edge));
    const origIndex = new Map(groupNodes.map((n, i) => [n.id, i]));

    const incoming = new Map<string, Edge[]>();
    for (const edge of dataEdges) {
      if (!incoming.has(edge.target)) incoming.set(edge.target, []);
      incoming.get(edge.target)!.push(edge);
    }

    const byLayer = new Map<number, Node<NodeData>[]>();
    for (const node of groupNodes) {
      const layer = layerPartitions.get(node.id) ?? 0;
      if (!byLayer.has(layer)) byLayer.set(layer, []);
      byLayer.get(layer)!.push(node);
    }
    const layers = [...byLayer.keys()].sort((a, b) => a - b);

    const orderIndex = new Map<string, number>();
    const ordered: Node<NodeData>[] = [];

    layers.forEach((layer, layerIdx) => {
      const layerNodes = byLayer.get(layer)!;
      if (layerIdx === 0) {
        // Sources keep their existing relative order.
        layerNodes.sort((a, b) => origIndex.get(a.id)! - origIndex.get(b.id)!);
      } else {
        const sortKey = new Map<string, number>();
        for (const node of layerNodes) {
          const preds = (incoming.get(node.id) ?? []).filter((edge) =>
            orderIndex.has(edge.source)
          );
          if (preds.length === 0) {
            sortKey.set(node.id, origIndex.get(node.id)!);
            continue;
          }
          // Barycenter of predecessor positions, refined by the source handle
          // index so siblings on the same source keep its handle order
          // (handlePos < 1 keeps the predecessor position dominant).
          let sum = 0;
          for (const edge of preds) {
            const predPos = orderIndex.get(edge.source)!;
            const handlePos =
              getSourceHandleOrder(edge.source).get(edge.sourceHandle ?? "") ??
              0;
            sum += predPos + handlePos / 1000;
          }
          sortKey.set(node.id, sum / preds.length);
        }
        layerNodes.sort((a, b) => {
          const ka = sortKey.get(a.id)!;
          const kb = sortKey.get(b.id)!;
          if (ka !== kb) return ka - kb;
          return origIndex.get(a.id)! - origIndex.get(b.id)!;
        });
      }
      layerNodes.forEach((node, i) => orderIndex.set(node.id, i));
      ordered.push(...layerNodes);
    });

    return ordered;
  };

  // Helper function to create ELK graph for a group of nodes.
  // Control edges are excluded from ELK input so they don't pull the
  // controlled node into a later layer; partitioning keeps controller and
  // controlled node in the same column, and model-order placement keeps
  // the controlled node directly below its controller.
  const createElkGraph = (
    groupNodes: Node<NodeData>[],
    groupEdges: Edge[],
    isRoot = false
  ) => {
    const handleOrdered = orderByUpstreamHandles(groupNodes, groupEdges);
    const orderedNodes = orderForControlPlacement(handleOrdered, groupEdges);
    return {
      id: isRoot ? "root" : groupNodes[0].parentId || "root",
      layoutOptions: {
        "elk.padding": "[top=50,left=50,bottom=50,right=50]",
        "elk.partitioning.activate": "true",
        "elk.layered.crossingMinimization.forceNodeModelOrder": "true",
        "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES"
      },
      children: orderedNodes.map((node) => createElkNode(node)),
      edges: groupEdges
        .filter((edge) => !isControlEdge(edge))
        .map((edge) => ({
          id: edge.id,
          sources: [edge.source],
          targets: [edge.target]
        }))
    };
  };

  // Helper function to update node positions
  const updateNodePositions = (
    layoutNode: ElkNode,
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
    const groupNodeIds = new Set(groupNodes.map((n) => n.id));
    const groupEdges = edges.filter(
      (edge) =>
        groupNodeIds.has(edge.source) &&
        groupNodeIds.has(edge.target)
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
    (node) => node.type === COMMENT_NODE_TYPE
  );

  return [...updatedNonCommentNodes, ...commentNodes];
};
