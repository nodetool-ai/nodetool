import { NodeMetadata, TypeMetadata } from "./ApiTypes";
import { useContext } from "react";
import { ConnectableNodesContext } from "../providers/ConnectableNodesProvider";

export interface ConnectableNodesState {
  nodeMetadata: NodeMetadata[];
  filterType: "input" | "output" | null;
  typeMetadata: TypeMetadata | null;
  isVisible: boolean;
  sourceHandle: string | null;
  targetHandle: string | null;
  nodeId: string | null;
  menuPosition: { x: number; y: number } | null;
  setSourceHandle: (sourceHandle: string | null) => void;
  setTargetHandle: (targetHandle: string | null) => void;
  setNodeId: (nodeId: string | null) => void;
  setFilterType: (type: "input" | "output" | null) => void;
  setTypeMetadata: (metadata: TypeMetadata | null) => void;
  getConnectableNodes: () => NodeMetadata[];
  showMenu: (position: { x: number; y: number }) => void;
  hideMenu: () => void;
}

export function useConnectableNodes(): ConnectableNodesState;
export function useConnectableNodes<Selected>(
  selector: (state: ConnectableNodesState) => Selected
): Selected;
export function useConnectableNodes<Selected>(
  selector?: (state: ConnectableNodesState) => Selected
) {
  const context = useContext(ConnectableNodesContext);
  if (!context) {
    throw new Error(
      "useConnectableNodes must be used within a ConnectableNodesProvider"
    );
  }
  return selector ? selector(context) : context;
}

export default useConnectableNodes;
