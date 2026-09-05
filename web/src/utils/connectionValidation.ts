/**
 * One rule set for "may this edge exist", shared by every layer that asks.
 *
 * Before this module the question had three answers — ReactFlow's
 * `isValidConnection`, `handleOnConnect`, and `NodeStore.onConnect` — that
 * disagreed about typed dynamic slots, about which edges count for the cycle
 * check, and about whether a non-Agent node may drive a control edge. The
 * cheapest symptom was a "Cannot create a cyclic connection" warning for an
 * edge the store would have accepted; the worst was an edge the UI reported as
 * made and the store silently dropped.
 */
import type { Connection, Edge, Node } from "@xyflow/react";

import type { NodeMetadata } from "../stores/ApiTypes";
import type { NodeData } from "../stores/NodeData";
import { CONTROL_HANDLE_ID, isAgentNodeType } from "../stores/graphEdgeToReactFlowEdge";
import { isTypedSlot } from "./dynamicSlots";
import { wouldCreateCycle } from "./graphCycle";
import { findInputHandle, findOutputHandle } from "./handleUtils";
import { isCollectType, isConnectable } from "./TypeHandler";

export type ConnectionRejectionReason =
  | "missing-handle"
  | "unknown-handle"
  | "duplicate"
  | "cycle"
  | "control-source"
  | "incompatible-types";

export interface ConnectionRejection {
  ok: false;
  reason: ConnectionRejectionReason;
  /** Text for a user-facing notification, or null when the drop is a no-op. */
  message: string | null;
}

export interface ConnectionAccepted {
  ok: true;
  isControlEdge: boolean;
  /** Edges that survive the connect — the replaced edge is already dropped. */
  remainingEdges: Edge[];
}

export type ConnectionValidation = ConnectionAccepted | ConnectionRejection;

export interface ConnectionContext {
  edges: Edge[];
  findNode: (id: string | null | undefined) => Node<NodeData> | undefined;
  getMetadata: (nodeType: string) => NodeMetadata | undefined;
}

const reject = (
  reason: ConnectionRejectionReason,
  message: string | null
): ConnectionRejection => ({ ok: false, reason, message });

export const CYCLE_MESSAGE = "Cannot create a cyclic connection";
export const INCOMPATIBLE_MESSAGE = "Cannot connect these types";

export function validateConnection(
  connection: Connection,
  { edges, findNode, getMetadata }: ConnectionContext
): ConnectionValidation {
  const { source, sourceHandle, target, targetHandle } = connection;
  if (!sourceHandle || !targetHandle) {
    return reject("missing-handle", null);
  }
  const sourceNode = findNode(source);
  const targetNode = findNode(target);
  if (!sourceNode || !targetNode) {
    return reject("unknown-handle", null);
  }

  const isControlEdge =
    targetHandle === CONTROL_HANDLE_ID || sourceHandle === CONTROL_HANDLE_ID;

  if (isControlEdge) {
    if (!isAgentNodeType(sourceNode.type)) {
      return reject(
        "control-source",
        "Only Agent nodes can drive a control connection"
      );
    }
    const duplicate = edges.some(
      (edge) =>
        edge.source === source &&
        edge.target === target &&
        edge.targetHandle === CONTROL_HANDLE_ID
    );
    if (duplicate) {
      return reject("duplicate", null);
    }
    if (wouldCreateCycle(edges, source, target)) {
      return reject("cycle", CYCLE_MESSAGE);
    }
    return { ok: true, isControlEdge: true, remainingEdges: edges };
  }

  const sourceMetadata = getMetadata(sourceNode.type ?? "");
  const targetMetadata = getMetadata(targetNode.type ?? "");

  const sourceHandleMetadata =
    sourceMetadata && findOutputHandle(sourceNode, sourceHandle, sourceMetadata);
  const targetHandleMetadata =
    targetMetadata && findInputHandle(targetNode, targetHandle, targetMetadata);

  // An undeclared dynamic slot stays promiscuous — it adopts the source type on
  // connect. A slot that already carries a real type is gated like a static one.
  const isDynamicProperty =
    targetNode.data.dynamic_properties?.[targetHandle] !== undefined;
  const isUntypedDynamicSlot =
    isDynamicProperty &&
    !isTypedSlot(targetNode.data.dynamic_inputs?.[targetHandle]);

  // A "collect" handle (list[T]) takes more than one incoming edge; every other
  // handle keeps only the newest, so the edges already on it are replaced.
  const isCollectHandle =
    !!targetHandleMetadata && isCollectType(targetHandleMetadata.type);
  const remainingEdges = isCollectHandle
    ? edges
    : edges.filter(
        (edge) => !(edge.target === target && edge.targetHandle === targetHandle)
      );

  const duplicate = edges.some(
    (edge) =>
      edge.source === source &&
      edge.sourceHandle === sourceHandle &&
      edge.target === target &&
      edge.targetHandle === targetHandle
  );
  if (duplicate) {
    return reject("duplicate", null);
  }

  if (wouldCreateCycle(remainingEdges, source, target)) {
    return reject("cycle", CYCLE_MESSAGE);
  }

  // Placeholder nodes (a pack that is not installed) carry no metadata; their
  // edges are kept so the graph round-trips.
  if (!sourceMetadata || !targetMetadata) {
    return { ok: true, isControlEdge: false, remainingEdges };
  }
  if (!sourceHandleMetadata) {
    return reject("unknown-handle", null);
  }
  if (!targetHandleMetadata && !isUntypedDynamicSlot) {
    return reject("unknown-handle", null);
  }
  if (
    targetHandleMetadata &&
    !isConnectable(sourceHandleMetadata.type, targetHandleMetadata.type, true)
  ) {
    return reject("incompatible-types", INCOMPATIBLE_MESSAGE);
  }

  return { ok: true, isControlEdge: false, remainingEdges };
}
