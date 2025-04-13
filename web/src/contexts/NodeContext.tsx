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
import { isEqual } from "lodash";

interface NodeContextValue {
  store: NodeStore;
  workflowId: string;
}

export const NodeContext = createContext<NodeContextValue | null>(null);

export const useNodes = <T,>(selector: (state: NodeStoreState) => T): T => {
  const context = useContext(NodeContext);
  if (!context) {
    throw new Error("useNodes must be used within a NodeProvider");
  }
  return useStoreWithEqualityFn(context.store, selector, isEqual);
};

export const useTemporalNodes = <T,>(
  selector: (state: TemporalState<PartializedNodeStore>) => T
): T => {
  const context = useContext(NodeContext);
  if (!context) {
    throw new Error("useTemporalNodes must be used within a NodeProvider");
  }
  return useStoreWithEqualityFn(context.store.temporal, selector, isEqual);
};

export const NodeProvider: React.FC<{
  children: React.ReactNode;
  workflowId: string;
}> = ({ children, workflowId }) => {
  const store = useWorkflowManager((state) => state.getNodeStore(workflowId));

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
