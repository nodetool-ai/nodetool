import React, { createContext, useContext, useMemo } from "react";
import {
  NodeStore,
  NodeStoreState,
  PartializedNodeStore
} from "../stores/NodeStore";
import { shallow } from "zustand/shallow";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { TemporalState } from "zundo";
import isEqual from "lodash/isEqual";
import { Box } from "@mui/material";

export const NodeContext = createContext<NodeStore | null>(null);

interface NodeProviderProps {
  createStore: () => NodeStore | null;
  children: React.ReactNode;
}

// Provides the node store to child components. Displays a loading state while
// the store is being created.
export const NodeProvider = ({ createStore, children }: NodeProviderProps) => {
  const store = useMemo(() => createStore(), [createStore]);
  if (!store) {
    return <Box>Loading workflow...</Box>;
  }
  return <NodeContext.Provider value={store}>{children}</NodeContext.Provider>;
};

export const useNodes = <T,>(
  selector: (state: NodeStoreState) => T,
  equalityFn?: (a: T, b: T) => boolean
): T => {
  const store = useContext(NodeContext);
  if (!store) {
    throw new Error("useNodes must be used within a NodeProvider");
  }
  return useStoreWithEqualityFn(store, selector, equalityFn ?? shallow);
};

export const useNodeStore = () => {
  const store = useContext(NodeContext);
  if (!store) {
    throw new Error("useNodeStore must be used within a NodeProvider");
  }
  return store;
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