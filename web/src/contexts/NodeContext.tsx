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