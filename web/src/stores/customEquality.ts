import { shallow } from "zustand/shallow";
import { PartializedNodeStore } from "./NodeStore";
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

export function customEquality(
  previous: PartializedNodeStore,
  current: PartializedNodeStore
): boolean {
  /*
  customEquality:
  - results in a history item being created if the return value is false
  - omits some fields to prevent unnecessary history items being created
  */
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

  return shallow(previous.workflow, current.workflow);
}
