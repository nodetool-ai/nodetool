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
import { Workflow } from "../stores/ApiTypes";
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
  addWorkflow: (workflow: Workflow) => void;
  removeWorkflow: (workflowId: string) => void;
  getWorkflow: (workflowId: string) => NodeStore | undefined;
  workflows: Workflow[];
  reorderWorkflows: (sourceIndex: number, targetIndex: number) => void;
};

export const useWorkflowManager = create<WorkflowManagerStore>((set, get) => ({
  nodeStores: {},
  workflows: [],
  addWorkflow: (workflow: Workflow) => {
    set((state) => ({
      nodeStores: {
        ...state.nodeStores,
        [workflow.id]: createNodeStore(workflow)
      },
      workflows: [...state.workflows, workflow]
    }));
  },
  removeWorkflow: (workflowId: string) => {
    set((state) => {
      const { [workflowId]: removed, ...remaining } = state.nodeStores;
      return {
        nodeStores: remaining,
        workflows: state.workflows.filter((w) => w.id !== workflowId)
      };
    });
  },
  getWorkflow: (workflowId: string) => get().nodeStores[workflowId],
  reorderWorkflows: (sourceIndex: number, targetIndex: number) => {
    set((state) => {
      const newWorkflows = [...state.workflows];
      const [removed] = newWorkflows.splice(sourceIndex, 1);
      newWorkflows.splice(targetIndex, 0, removed);
      return { ...state, workflows: newWorkflows };
    });
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
  const { addWorkflow, getWorkflow } = useWorkflowManager();
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
