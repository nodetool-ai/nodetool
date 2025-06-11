import React, { createContext, useContext, useMemo } from "react";
import {
  NodeStore,
  NodeStoreState,
  PartializedNodeStore
} from "../stores/NodeStore";
import { shallow } from "zustand/shallow";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { TemporalState } from "zundo";
import { Box } from "@mui/material";
import { isEqual } from "lodash";

interface NodeContextValue {
  store: NodeStore;
}

// Context wrapper around a NodeStore instance. Components can use the custom
// hooks below to access node state and actions with equality checks to minimize
// unnecessary re-renders.
export const NodeContext = createContext<NodeStore | null>(null);

export const useNodes = <T,>(selector: (state: NodeStoreState) => T): T => {
  const store = useContext(NodeContext);
  if (!store) {
    throw new Error("useNodes must be used within a NodeProvider");
  }
  return useStoreWithEqualityFn(store, selector, isEqual);
};

export const useTemporalNodes = <T,>(
  selector: (state: TemporalState<PartializedNodeStore>) => T
): T => {
  const store = useContext(NodeContext);
  if (!store) {
    throw new Error("useTemporalNodes must be used within a NodeProvider");
  }
  return useStoreWithEqualityFn(store.temporal, selector, isEqual);
};

export const NodeProvider: React.FC<{
  children: React.ReactNode;
  createStore: () => NodeStore;
}> = ({ children, createStore }) => {
  const store = useMemo(() => createStore(), [createStore]);

  // If the store isn't ready yet we display a small loading indicator. This
  // occurs while workflows are being fetched or initialized.
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

  return <NodeContext.Provider value={store}>{children}</NodeContext.Provider>;
};
