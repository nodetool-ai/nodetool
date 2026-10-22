import type { Edge, Node, XYPosition } from "@xyflow/react";
import type { GraphLink } from "@nodetool-ai/protocol";
import type { NodeData } from "../../stores/NodeData";
import type { NodeStore } from "../../stores/NodeStore";
import { runAsOneUndoEntry } from "../../utils/runAsOneUndoEntry";

/** Nodes, edges and lineage links to copy into the open graph. */
export interface GraphFragment {
  nodes: Node<NodeData>[];
  edges: Edge[];
  links?: GraphLink[];
}

/**
 * Add a copy of `fragment` to the graph with fresh ids, its first top-level
 * node placed at `at` (a flow position). The copies are selected and every
 * other node and edge is deselected. The insert is one undo step.
 */
export const insertGraphFragment = (
  nodeStore: NodeStore,
  fragment: GraphFragment,
  at: XYPosition
): void => {
  const {
    nodes: copiedNodes,
    edges: copiedEdges,
    links: copiedLinks
  } = fragment;
  if (copiedNodes.length === 0) {
    return;
  }
  const oldToNewIds = new Map<string, string>();
  const newNodes: Node<NodeData>[] = [];
  const newEdges: Edge[] = [];

  const {
    nodes,
    edges,
    links,
    setNodes,
    setEdges,
    setLinks,
    generateNodeIds,
    workflow
  } = nodeStore.getState();
  const workflowId = workflow.id;

  // Generate new sequential IDs for all copied nodes
  const newIds = generateNodeIds(copiedNodes.length);
  copiedNodes.forEach((node, index) => {
    oldToNewIds.set(node.id, newIds[index]);
  });

  // Anchor on a top-level node: a group child's position is relative.
  const anchorNode =
    copiedNodes.find(
      (node) => !node.parentId || !oldToNewIds.has(node.parentId)
    ) ?? copiedNodes[0];
  const firstPos = anchorNode.position ?? { x: 0, y: 0 };
  const offset = {
    x: at.x - (firstPos.x ?? 0),
    y: at.y - (firstPos.y ?? 0)
  };

  // create new nodes with updated IDs and parent references
  for (const node of copiedNodes) {
    const newId = oldToNewIds.get(node.id)!;
    const newParentId =
      node.parentId && oldToNewIds.has(node.parentId)
        ? oldToNewIds.get(node.parentId)
        : undefined;

    const positionAbsolute = node.data?.positionAbsolute;

    newNodes.push({
      ...node,
      id: newId,
      parentId: newParentId,
      data: {
        ...node.data,
        // The copy belongs to the graph it lands in.
        workflow_id: workflowId,
        positionAbsolute: positionAbsolute
          ? {
            x: positionAbsolute.x + offset.x,
            y: positionAbsolute.y + offset.y
          }
          : undefined
      },
      position: {
        x: (node.position?.x ?? 0) + (newParentId ? 0 : offset.x),
        y: (node.position?.y ?? 0) + (newParentId ? 0 : offset.y)
      },
      selected: true
    });
  }

  for (const edge of copiedEdges) {
    const newSource = oldToNewIds.get(edge.source);
    const newTarget = oldToNewIds.get(edge.target);
    if (newSource && newTarget) {
      newEdges.push({
        ...edge,
        id: crypto.randomUUID(), // Edge IDs can still be UUIDs
        source: newSource,
        target: newTarget,
        selected: false
      });
    }
  }

  // Deselect existing nodes, then add the new selected nodes
  const deselectedNodes = nodes.map((node) => ({
    ...node,
    selected: false
  }));
  const deselectedEdges = edges.map((edge) => ({
    ...edge,
    selected: false
  }));

  const newLinks: GraphLink[] = [];
  for (const link of Array.isArray(copiedLinks) ? copiedLinks : []) {
    const newSource = oldToNewIds.get(link.source);
    const newTarget = oldToNewIds.get(link.target);
    if (newSource && newTarget) {
      newLinks.push({
        ...link,
        id: crypto.randomUUID().replace(/-/g, ""),
        source: newSource,
        target: newTarget
      });
    }
  }

  runAsOneUndoEntry(nodeStore, () => {
    setNodes([...deselectedNodes, ...newNodes]);
    setEdges([...deselectedEdges, ...newEdges]);
    if (newLinks.length > 0) {
      setLinks([...links, ...newLinks]);
    }
  });
};
