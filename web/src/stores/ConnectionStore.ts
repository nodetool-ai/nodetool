import { create } from "zustand";
import { NodeMetadata, TypeMetadata } from "./ApiTypes";
import { NodeData } from "./NodeData";
import { Node } from "@xyflow/react";
import { findOutputHandle, findInputHandle } from "../utils/handleUtils";
export type ConnectDirection = "target" | "source" | "" | null;

type ConnectionStore = {
  connecting: boolean;
  connectType: TypeMetadata | null;
  connectDirection: ConnectDirection;
  connectNodeId: string | null;
  connectHandleId: string | null;
  connectMin: number | null;
  connectMax: number | null;
  connectDefault: unknown;
  startConnecting: (
    node: Node<NodeData>,
    handleId: string,
    handleType: string,
    metadata: NodeMetadata
  ) => void;
  endConnecting: () => void;
};

const useConnectionStore = create<ConnectionStore>((set) => ({
  connecting: false,
  connectType: null,
  connectDirection: null,
  connectNodeId: null,
  connectHandleId: null,
  connectMin: null,
  connectMax: null,
  connectDefault: undefined,

  /**
   * Handle the end event of a connection between two nodes.
   * Reset all values used for connecting.
   */
  endConnecting: () => {
    set({
      connecting: false,
      connectType: null,
      connectDirection: null,
      connectNodeId: null,
      connectHandleId: null,
      connectMin: null,
      connectMax: null,
      connectDefault: undefined
    });
  },

  /**
   * Handle the start of a connection between two nodes.
   * This is used to set the type and direction of the node to connect.
   *
   * @param node The node to connect.
   * @param handleId The id of the handle to connect.
   * @param handleType The type of the handle to connect.
   * @param metadata The metadata of the node to connect.
   */
  startConnecting: (
    node: Node<NodeData>,
    handleId: string,
    handleType: string,
    metadata: NodeMetadata
  ) => {
    if (handleType === "source") {
      const outputHandle = findOutputHandle(node, handleId, metadata);
      const connectType = outputHandle?.type;

      set({
        connecting: true,
        connectType,
        connectNodeId: node.id,
        connectDirection: "source",
        connectHandleId: handleId
      });
    }
    if (handleType === "target") {
      const inputHandle = findInputHandle(node, handleId, metadata);
      const connectType = inputHandle?.type;
      
      // Get min/max/default from the property metadata if available
      const property = metadata.properties.find(p => p.name === handleId);
      const connectMin = property?.min ?? null;
      const connectMax = property?.max ?? null;
      const connectDefault = property?.default;

      set({
        connecting: true,
        connectType,
        connectNodeId: node.id,
        connectDirection: "target",
        connectHandleId: handleId,
        connectMin,
        connectMax,
        connectDefault
      });
    }
  }
}));

export default useConnectionStore;
