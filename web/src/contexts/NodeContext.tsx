import React, { createContext, useContext } from "react";
import { createNodeStore } from "../stores/NodeStore";
import type { StoreApi, UseBoundStore } from "zustand";
import type {
  NodeStore,
  NodeStoreState,
  PartializedNodeStore
} from "../stores/NodeStore";
import { shallow } from "zustand/shallow";
import { TemporalState } from "zundo";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { useLoaderData } from "react-router-dom";

// Update the context type to hold the full store
const NodeContext = createContext<NodeStore | null>(null);

export const useNodes = <T,>(
  selector: (state: NodeStoreState) => T,
  equalityFn?: (left: T, right: T) => boolean
): T => {
  const context = useContext(NodeContext);
  if (!context) {
    throw new Error("useNodes must be used within a NodeProvider");
  }
  return useStoreWithEqualityFn(context, selector, equalityFn ?? shallow);
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
    context.temporal,
    selector,
    equalityFn ?? shallow
  );
};

export const NodeProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  const [nodeStores, setNodeStores] = React.useState<Record<string, NodeStore>>(
    {}
  );

  const data = useLoaderData();

  React.useEffect(() => {
    if (!nodeStores[data.workflow.id]) {
      setNodeStores((prev) => ({
        ...prev,
        [data.workflow.id]: createNodeStore(data.workflow)
      }));
    }
  }, [data.workflow.id, data.workflow]);

  const store = nodeStores[data.workflow.id];

  if (!store) {
    return null; // or a loading indicator
  }

  return <NodeContext.Provider value={store}>{children}</NodeContext.Provider>;
};
