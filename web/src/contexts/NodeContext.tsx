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
import { Workflow, WorkflowAttributes } from "../stores/ApiTypes";
import { create } from "zustand";

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

type WorkflowManagerStore = {
  nodeStores: Record<string, NodeStore>;
  getWorkflow: (workflowId: string) => WorkflowAttributes | undefined;
  addWorkflow: (workflow: Workflow) => void;
  removeWorkflow: (workflowId: string) => void;
  getNodeStore: (workflowId: string) => NodeStore | undefined;
  listWorkflows: () => WorkflowAttributes[];
  reorderWorkflows: (sourceIndex: number, targetIndex: number) => void;
  updateWorkflow: (workflow: WorkflowAttributes) => void;
};

export const useWorkflowManager = create<WorkflowManagerStore>((set, get) => ({
  nodeStores: {},
  listWorkflows: () => {
    return Object.values(get().nodeStores).map(
      (store) => store.getState().workflow
    );
  },
  getWorkflow: (workflowId: string) => {
    const workflow = get().nodeStores[workflowId];
    if (!workflow) {
      return undefined;
    }
    return workflow.getState().workflow;
  },
  addWorkflow: (workflow: Workflow) => {
    set((state) => ({
      nodeStores: {
        ...state.nodeStores,
        [workflow.id]: createNodeStore(workflow)
      }
    }));
  },
  removeWorkflow: (workflowId: string) => {
    set((state) => {
      const { [workflowId]: removed, ...remaining } = state.nodeStores;
      return {
        nodeStores: remaining
      };
    });
  },
  getNodeStore: (workflowId: string) => get().nodeStores[workflowId],
  reorderWorkflows: (sourceIndex: number, targetIndex: number) => {
    set((state) => {
      // Convert Record to array of [id, store] pairs
      const entries = Object.entries(state.nodeStores);

      // Perform the reorder
      const [moved] = entries.splice(sourceIndex, 1);
      entries.splice(targetIndex, 0, moved);

      // Convert back to Record
      const reorderedStores = Object.fromEntries(entries);

      return {
        nodeStores: reorderedStores
      };
    });
  },
  updateWorkflow: (workflow: WorkflowAttributes) => {
    const nodeStore = get().nodeStores[workflow.id];
    if (!nodeStore) {
      return;
    }
    nodeStore.getState().setWorkflowAttributes(workflow);
  }
}));

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
  const { addWorkflow, getNodeStore: getWorkflow } = useWorkflowManager();
  const data = useLoaderData();

  React.useEffect(() => {
    if (!getWorkflow(data.workflow.id)) {
      addWorkflow(data.workflow);
    }
  }, [data.workflow.id, data.workflow]);

  const store = getWorkflow(data.workflow.id);

  if (!store) {
    return <div>Loading...</div>;
  }

  return <NodeContext.Provider value={store}>{children}</NodeContext.Provider>;
};
