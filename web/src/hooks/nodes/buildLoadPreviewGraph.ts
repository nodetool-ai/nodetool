/**
 * buildLoadPreviewGraph
 *
 * Selects the part of a freshly loaded workflow that can render previews in
 * the browser right away: every input/constant node that holds a value, plus
 * the browser-capable nodes downstream of it. A node joins only when it is
 * browser-capable and every one of its predecessors also joins, so a server
 * node or an empty input upstream keeps it (and everything behind it) out.
 */
import type { Edge, Node } from "@xyflow/react";
import type { NodeData } from "../../stores/NodeData";
import { isLiteralSourceNode } from "../../utils/edgeValue";

const MEDIA_TYPES = new Set(["image", "video", "audio", "model3d"]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasContent = (value: unknown): boolean => {
  if (value instanceof Uint8Array) {
    return value.length > 0;
  }
  if (typeof value === "string") {
    return value.length > 0;
  }
  return value != null;
};

/** True when an input/constant value can feed a run. Empty media refs cannot. */
export const hasSourceValue = (value: unknown): boolean => {
  if (value == null || value === "") {
    return false;
  }
  if (isRecord(value) && MEDIA_TYPES.has(String(value.type))) {
    return (
      hasContent(value.uri) || hasContent(value.asset_id) || hasContent(value.data)
    );
  }
  return true;
};

export interface LoadPreviewGraph {
  nodes: Node<NodeData>[];
  edges: Edge[];
}

/**
 * Returns the nodes and edges to run, or `null` when no input with a value
 * reaches a browser-capable node.
 */
export const buildLoadPreviewGraph = (
  nodes: Node<NodeData>[],
  edges: Edge[],
  isBrowserNode: (type: string | undefined) => boolean
): LoadPreviewGraph | null => {
  const isSource = (node: Node<NodeData>): boolean =>
    isLiteralSourceNode(node.type) &&
    hasSourceValue(node.data?.properties?.value);
  const runnable = (node: Node<NodeData>): boolean =>
    isBrowserNode(node.type) && (!isLiteralSourceNode(node.type) || isSource(node));

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  const link = (map: Map<string, string[]>, from: string, to: string): void => {
    const list = map.get(from);
    if (list) {
      list.push(to);
    } else {
      map.set(from, [to]);
    }
  };
  for (const edge of edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target)) {
      continue;
    }
    link(outgoing, edge.source, edge.target);
    link(incoming, edge.target, edge.source);
  }

  // Topological pass: a node is included once all its predecessors resolved
  // and every one of them was included. Nodes on a cycle never resolve.
  const pending = new Map(
    nodes.map((node) => [node.id, incoming.get(node.id)?.length ?? 0])
  );
  const blocked = new Set<string>();
  const included = new Set<string>();
  const queue = nodes.filter((node) => pending.get(node.id) === 0).map((n) => n.id);
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    const node = byId.get(id);
    if (node && !blocked.has(id) && runnable(node)) {
      included.add(id);
    }
    for (const target of outgoing.get(id) ?? []) {
      if (!included.has(id)) {
        blocked.add(target);
      }
      const left = (pending.get(target) ?? 0) - 1;
      pending.set(target, left);
      if (left === 0) {
        queue.push(target);
      }
    }
  }

  // Everything an input with a value reaches, then the included upstream
  // nodes those need (e.g. a browser generator blended with the input).
  const reached = new Set(
    nodes.filter((node) => included.has(node.id) && isSource(node)).map((n) => n.id)
  );
  const forward = [...reached];
  for (let i = 0; i < forward.length; i++) {
    for (const target of outgoing.get(forward[i]) ?? []) {
      if (included.has(target) && !reached.has(target)) {
        reached.add(target);
        forward.push(target);
      }
    }
  }
  const selected = new Set(reached);
  const backward = [...reached];
  for (let i = 0; i < backward.length; i++) {
    for (const source of incoming.get(backward[i]) ?? []) {
      if (!selected.has(source)) {
        selected.add(source);
        backward.push(source);
      }
    }
  }

  const selectedNodes = nodes.filter((node) => selected.has(node.id));
  if (!selectedNodes.some((node) => !isLiteralSourceNode(node.type))) {
    return null;
  }
  return {
    nodes: selectedNodes,
    edges: edges.filter(
      (edge) => selected.has(edge.source) && selected.has(edge.target)
    )
  };
};
