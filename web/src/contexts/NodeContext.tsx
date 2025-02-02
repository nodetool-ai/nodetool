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
    return <div>Loading...</div>;
  }

  return (
    <NodeContext.Provider value={{ store, workflowId }}>
      {children}
    </NodeContext.Provider>
  );
};
