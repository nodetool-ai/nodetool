import React, { createContext, useContext } from "react";
import {
  NodeStore,
  NodeStoreState,
  PartializedNodeStore
} from "../stores/NodeStore";
import { shallow } from "zustand/shallow";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { useWorkflowManager } from "./WorkflowManagerContext";
import { TemporalState } from "zundo";
import { Box } from "@mui/material";

interface NodeContextValue {
  store: NodeStore;
  workflowId: string;
}

export const NodeContext = createContext<NodeContextValue | null>(null);

export const useNodes = <T,>(
  selector: (state: NodeStoreState) => T,
  equalityFn?: (left: T, right: T) => boolean
): T => {
  const context = useContext(NodeContext);
  if (!context) {
    throw new Error("useNodes must be used within a NodeProvider");
  }
  return useStoreWithEqualityFn(context.store, selector, equalityFn ?? shallow);
};

export const useTemporalNodes = <T,>(
  selector: (state: TemporalState<PartializedNodeStore>) => T,
  equalityFn?: (left: T, right: T) => boolean
): T => {
  const context = useContext(NodeContext);
  if (!context) {
    throw new Error("useTemporalNodes must be used within a NodeProvider");
  }
  return useStoreWithEqualityFn(
    context.store.temporal,
    selector,
    equalityFn ?? shallow
  );
};

export const NodeProvider: React.FC<{
  children: React.ReactNode;
  workflowId: string;
}> = ({ children, workflowId }) => {
  const { getNodeStore } = useWorkflowManager((state) => ({
    getNodeStore: state.getNodeStore
  }));
  const store = getNodeStore(workflowId);

  if (!store) {
    return (
      <Box
        sx={{
          "@keyframes fadeIn": {
            "0%": {
              opacity: 0
            },
            "100%": {
              opacity: 0.6
            }
          },
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          padding: "1rem",
          opacity: 0.6,
          animation: "fadeIn 0.2s ease-in",
          height: "100%"
        }}
      >
        <div>Loading workflow...</div>
      </Box>
    );
  }

  return (
    <NodeContext.Provider value={{ store, workflowId }}>
      {children}
    </NodeContext.Provider>
  );
};
