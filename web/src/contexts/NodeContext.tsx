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

// Extend Window interface for HMR context preservation
declare global {
  interface Window {
    __NODE_CONTEXT__?: React.Context<NodeStore | null>;
  }
}

// Detect Vite HMR availability without using import.meta syntax directly,
// which would cause Jest to fail with "Cannot use 'import.meta' outside a module".
const __HMR__ =
  typeof window !== "undefined" &&
  process.env.NODE_ENV !== "production" &&
  process.env.NODE_ENV !== "test";

// Preserve the context reference across HMR to prevent
// "cannot read property of null getSnapshot" crashes caused by
// context mismatch between providers and consumers after hot reload.
export const NodeContext: React.Context<NodeStore | null> = (() => {
  if (__HMR__ && window.__NODE_CONTEXT__) {
    return window.__NODE_CONTEXT__;
  }
  const ctx = createContext<NodeStore | null>(null);
  if (__HMR__) {
    window.__NODE_CONTEXT__ = ctx;
  }
  return ctx;
})();

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

export const useTemporalNodes = <T,>(
  selector: (state: TemporalState<PartializedNodeStore>) => T
): T => {
  const store = useContext(NodeContext);
  if (!store) {
    throw new Error("useTemporalNodes must be used within a NodeProvider");
  }
  return useStoreWithEqualityFn(store.temporal, selector, isEqual);
};

/**
 * Returns the raw node store reference without subscribing to any state.
 * Use this when you need to call store.getState() in callbacks without
 * causing re-renders on state changes.
 */
export const useNodeStoreRef = (): NodeStore => {
  const store = useContext(NodeContext);
  if (!store) {
    throw new Error("useNodeStoreRef must be used within a NodeProvider");
  }
  return store;
};
