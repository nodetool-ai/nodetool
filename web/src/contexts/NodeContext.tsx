import React, { createContext, useContext, useCallback } from "react";
import { useNodeStore, NodeStoreState } from "../stores/NodeStore";

const NodeContext = createContext<NodeStoreState | null>(null);

export const NodeProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  return (
    <NodeContext.Provider value={useNodeStore.getState()}>
      {children}
    </NodeContext.Provider>
  );
};

export const useNodeStoreState = () => {
  const context = useContext(NodeContext);
  if (!context) {
    throw new Error("useNode must be used within a NodeProvider");
  }
  return context;
};
