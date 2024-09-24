import { shallow } from "zustand/shallow";
import { NodeStore } from "./NodeStore";
import { Edge, Node } from "@xyflow/react";
import { NodeData } from "./NodeData";

function compareEdge(a: Edge, b: Edge) {
  return (
    a.id === b.id &&
    a.source === b.source &&
    a.target === b.target &&
    a.sourceHandle === b.sourceHandle &&
    a.targetHandle === b.targetHandle
  );
}

function compareNode(a: Node<NodeData>, b: Node<NodeData>) {
  return (
    a.id === b.id &&
    a.type === b.type &&
    a.data.collapsed === b.data.collapsed &&
    shallow(a.data.properties, b.data.properties) &&
    a.position.x === b.position.x &&
    a.position.y === b.position.y
  );
}

// undo_debounce: dampens frequency of history updates.
// beware: causes edge creation event to be missed in history.
//const undo_debounce = 10;
export function customEquality(
  previous: NodeStore,
  current: NodeStore
): boolean {
  /*
  customEquality:
  - results in a history item being created if the return value is false
  - allows explicit creation of a history item using explicitSave
  - omits some fields to prevent unnecessary history items being created
  */
  if (previous.explicitSave === true) {
    return false;
  }

  if (previous.nodes.length !== current.nodes.length) {
    return false;
  }
  if (previous.edges.length !== current.edges.length) {
    return false;
  }

  for (let i = 0; i < previous.nodes.length; i++) {
    if (!compareNode(previous.nodes[i], current.nodes[i])) {
      return false;
    }
  }

  for (let i = 0; i < previous.edges.length; i++) {
    if (!compareEdge(previous.edges[i], current.edges[i])) {
      return false;
    }
  }
  for (const key in previous) {
    if (key === "nodes" || key === "edges") continue;
    if (typeof (previous as any)[key] === "function") continue;
    if (!shallow((previous as any)[key], (current as any)[key])) {
      return false;
    }
  }

  for (const key in current) {
    if (!(key in previous)) {
      return false;
    }
  }
  return true;
}
