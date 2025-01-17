import { create } from "zustand";
import { NodeMetadata, OutputSlot, Property, TypeMetadata } from "./ApiTypes";
import { useNodeStore } from "./NodeStore";

export type ConnectDirection = "target" | "source" | "" | null;

type ConnectionStore = {
  connecting: boolean;
  connectType: TypeMetadata | null;
  connectDirection: ConnectDirection;
  connectNodeId: string | null;
  connectHandleId: string | null;
  startConnecting: (
    nodeId: string,
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
      connectHandleId: null
    });
  },

  /**
   * Handle the start of a connection between two nodes.
   * This is used to set the type and direction of the node to connect.
   *
   * @param nodeId The id of the node to connect.
   * @param handleId The id of the handle to connect.
   * @param handleType The type of the handle to connect.
   * @param metadata The metadata of the node to connect.
   */
  startConnecting: (
    nodeId: string,
    handleId: string,
    handleType: string,
    metadata: NodeMetadata
  ) => {
    if (handleType === "source") {
      let connectType = metadata.outputs.find(
        (output: OutputSlot) => output.name === handleId
      )?.type as TypeMetadata;
      set({
        connecting: true,
        connectType,
        connectNodeId: nodeId,
        connectDirection: "source",
        connectHandleId: handleId
      });
    }
    if (handleType === "target") {
      const node = useNodeStore.getState().findNode(nodeId);
      let connectType = metadata.properties.find(
        (input: Property) => input.name === handleId
      )?.type as TypeMetadata;
      if (node?.data.dynamic_properties[handleId] !== undefined) {
        connectType = {
          type: "str",
          type_args: [],
          optional: false
        };
      }
      set({
        connecting: true,
        connectType,
        connectNodeId: nodeId,
        connectDirection: "target",
        connectHandleId: handleId
      });
    }
  }
}));

export default useConnectionStore;
