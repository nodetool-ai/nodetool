import type { Connection, Node, XYPosition } from "@xyflow/react";

import type { NodeData } from "../../stores/NodeData";
import type { NodeMetadata } from "../../stores/ApiTypes";
import type { NodeStoreState } from "../../stores/NodeStore";

export type KeyboardConnectionDirection = "source" | "target";

export interface KeyboardConnectionPort {
  readonly kind: "existing" | "new";
  readonly nodeId?: string;
  readonly handleId: string;
  readonly metadata?: NodeMetadata;
}

interface KeyboardConnectionRequest {
  readonly nodeId: string;
  readonly handleId: string;
  readonly direction: KeyboardConnectionDirection;
  readonly option: KeyboardConnectionPort;
}

type KeyboardConnectionState = Pick<
  NodeStoreState,
  | "nodes"
  | "edges"
  | "findNode"
  | "validateConnection"
  | "createNode"
  | "addNode"
  | "deleteNode"
  | "onConnect"
>;

interface KeyboardConnectionStore {
  getState: () => KeyboardConnectionState;
}

const NEW_NODE_HORIZONTAL_OFFSET = 320;

export const buildKeyboardConnection = (
  request: Omit<KeyboardConnectionRequest, "option">,
  otherNodeId: string,
  otherHandleId: string
): Connection =>
  request.direction === "source"
    ? {
        source: request.nodeId,
        sourceHandle: request.handleId,
        target: otherNodeId,
        targetHandle: otherHandleId
      }
    : {
        source: otherNodeId,
        sourceHandle: otherHandleId,
        target: request.nodeId,
        targetHandle: request.handleId
      };

export const getAbsoluteNodePosition = (
  nodes: readonly Node<NodeData>[],
  nodeId: string
): XYPosition | null => {
  let node = nodes.find((candidate) => candidate.id === nodeId);
  if (!node) {
    return null;
  }
  if (node.data.positionAbsolute) {
    return node.data.positionAbsolute;
  }

  const position = { ...node.position };
  const visited = new Set<string>([node.id]);
  while (node.parentId) {
    if (visited.has(node.parentId)) {
      return null;
    }
    visited.add(node.parentId);
    node = nodes.find((candidate) => candidate.id === node?.parentId);
    if (!node) {
      return null;
    }
    position.x += node.position.x;
    position.y += node.position.y;
  }
  return position;
};

export const isKeyboardConnectionValid = (
  state: Pick<NodeStoreState, "findNode" | "validateConnection">,
  connection: Connection
): boolean => {
  const sourceNode = state.findNode(connection.source);
  const targetNode = state.findNode(connection.target);
  return Boolean(
    sourceNode &&
      targetNode &&
      state.validateConnection(connection, sourceNode, targetNode)
  );
};

const hasConnection = (
  state: Pick<NodeStoreState, "edges">,
  connection: Connection
): boolean =>
  state.edges.some(
    (edge) =>
      edge.source === connection.source &&
      edge.target === connection.target &&
      (edge.sourceHandle ?? null) === (connection.sourceHandle ?? null) &&
      (edge.targetHandle ?? null) === (connection.targetHandle ?? null)
  );

/**
 * Applies a keyboard-picked connection and reports whether the store accepted
 * it. `onConnect` intentionally returns void, so success is established from
 * the resulting edge instead of assuming the request succeeded.
 */
export const applyKeyboardConnection = (
  store: KeyboardConnectionStore,
  request: KeyboardConnectionRequest
): boolean => {
  const initialState = store.getState();
  let otherNodeId = request.option.nodeId;
  let createdNodeId: string | null = null;

  if (request.option.kind === "new") {
    const sourcePosition = getAbsoluteNodePosition(
      initialState.nodes,
      request.nodeId
    );
    const nodeMetadata = request.option.metadata;
    if (!sourcePosition || !nodeMetadata) {
      return false;
    }
    const offset =
      request.direction === "source"
        ? NEW_NODE_HORIZONTAL_OFFSET
        : -NEW_NODE_HORIZONTAL_OFFSET;
    const created = initialState.createNode(nodeMetadata, {
      x: sourcePosition.x + offset,
      y: sourcePosition.y
    });
    initialState.addNode(created);
    otherNodeId = created.id;
    createdNodeId = created.id;
  }

  if (!otherNodeId) {
    return false;
  }

  const connection = buildKeyboardConnection(
    request,
    otherNodeId,
    request.option.handleId
  );
  const currentState = store.getState();
  if (!isKeyboardConnectionValid(currentState, connection)) {
    if (createdNodeId) {
      currentState.deleteNode(createdNodeId);
    }
    return false;
  }

  currentState.onConnect(connection);
  const acceptedState = store.getState();
  if (!hasConnection(acceptedState, connection)) {
    if (createdNodeId) {
      acceptedState.deleteNode(createdNodeId);
    }
    return false;
  }
  return true;
};
