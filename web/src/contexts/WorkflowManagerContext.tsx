import { createContext, useContext, useState, useEffect } from "react";
import { create, StoreApi, UseBoundStore } from "zustand";
import { NodeStore } from "../stores/NodeStore";
import { Workflow, WorkflowAttributes } from "../stores/ApiTypes";
import { createNodeStore } from "../stores/NodeStore";
import { useParams } from "react-router-dom";
import { client } from "../stores/ApiClient";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { shallow } from "zustand/shallow";
import React from "react";

type LoadingState = {
  isLoading: boolean;
  error: Error | null;
  data: Workflow | null;
};

type WorkflowManagerState = {
  nodeStores: Record<string, NodeStore>;
  currentWorkflowId: string | null;
  loadingStates: Record<string, LoadingState>;
  getCurrentLoadingState: () => LoadingState | undefined;
  getWorkflow: (workflowId: string) => WorkflowAttributes | undefined;
  addWorkflow: (workflow: Workflow) => void;
  removeWorkflow: (workflowId: string) => void;
  getNodeStore: (workflowId: string) => NodeStore | undefined;
  listWorkflows: () => WorkflowAttributes[];
  reorderWorkflows: (sourceIndex: number, targetIndex: number) => void;
  updateWorkflow: (workflow: WorkflowAttributes) => void;
  getCurrentWorkflow: () => Workflow | undefined;
  setCurrentWorkflowId: (workflowId: string) => void;
  fetchWorkflow: (workflowId: string) => Promise<void>;
  getLoadingState: (workflowId: string) => LoadingState | undefined;
  setLoadingState: (workflowId: string, state: Partial<LoadingState>) => void;
};

export type WorkflowManagerStore = UseBoundStore<
  StoreApi<WorkflowManagerState>
>;

const WorkflowManagerContext = createContext<WorkflowManagerStore | null>(null);

export const useWorkflowManager = <T,>(
  selector: (state: WorkflowManagerState) => T
) => {
  const context = useContext(WorkflowManagerContext);
  if (!context) {
    throw new Error(
      "useWorkflowManager must be used within a WorkflowManagerProvider"
    );
  }

  return useStoreWithEqualityFn(context, selector, shallow);
};

export const createWorkflowManagerStore = () =>
  create<WorkflowManagerState>()((set, get) => ({
    nodeStores: {},
    currentWorkflowId: null,
    loadingStates: {},
    error: null,
    getCurrentLoadingState: () => {
      const currentWorkflowId = get().currentWorkflowId;
      if (!currentWorkflowId) {
        return undefined;
      }
      return get().loadingStates[currentWorkflowId];
    },
    setCurrentWorkflowId: (workflowId: string) => {
      set({ currentWorkflowId: workflowId });
    },
    getCurrentWorkflow: () => {
      const workflow = get().nodeStores[get().currentWorkflowId!];
      if (!workflow) {
        return undefined;
      }
      return workflow.getState().getWorkflow();
    },
    listWorkflows: () => {
      return Object.values(get().nodeStores).map((store) => {
        return store.getState().workflow;
      });
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
          [workflow.id]: createNodeStore(workflow, { shouldFitToScreen: true })
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
        const entries = Object.entries(state.nodeStores);
        const [moved] = entries.splice(sourceIndex, 1);
        entries.splice(targetIndex, 0, moved);
        return {
          nodeStores: Object.fromEntries(entries)
        };
      });
    },
    updateWorkflow: (workflow: WorkflowAttributes) => {
      const nodeStore = get().nodeStores[workflow.id];
      if (!nodeStore) {
        return;
      }
      nodeStore.getState().setWorkflowAttributes(workflow);
    },
    getLoadingState: (workflowId: string) => get().loadingStates[workflowId],
    setLoadingState: (workflowId: string, state: Partial<LoadingState>) => {
      set((current) => ({
        loadingStates: {
          ...current.loadingStates,
          [workflowId]: {
            ...current.loadingStates[workflowId],
            ...state
          }
        }
      }));
    },
    fetchWorkflow: async (workflowId: string) => {
      const state = get();
      const nodeStore = state.getNodeStore(workflowId);
      const loadingState = state.getLoadingState(workflowId);

      // If no nodeStore exists, create one with empty workflow attributes
      if (nodeStore || loadingState?.isLoading) {
        return;
      }

      state.setLoadingState(workflowId, {
        isLoading: true,
        error: null,
        data: null
      });

      try {
        const { data, error } = await client.GET("/api/workflows/{id}", {
          params: { path: { id: workflowId } }
        });

        if (error) {
          state.setLoadingState(workflowId, {
            isLoading: false,
            error: error as Error,
            data: null
          });
        } else {
          state.setLoadingState(workflowId, {
            isLoading: false,
            error: null,
            data
          });
          state.addWorkflow(data);
        }
      } catch (error) {
        state.setLoadingState(workflowId, {
          isLoading: false,
          error: error as Error,
          data: null
        });
      }
    }
  }));

export const FetchCurrentWorkflow: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const { setCurrentWorkflowId, getNodeStore, fetchWorkflow } =
    useWorkflowManager((state) => ({
      setCurrentWorkflowId: state.setCurrentWorkflowId,
      getNodeStore: state.getNodeStore,
      fetchWorkflow: state.fetchWorkflow
    }));
  const { workflow: workflowId } = useParams();
  const isWorkflowLoaded = Boolean(workflowId && getNodeStore(workflowId));

  useEffect(() => {
    if (workflowId) {
      setCurrentWorkflowId(workflowId);
    }
    if (workflowId && !isWorkflowLoaded) {
      fetchWorkflow(workflowId);
    }
  }, [workflowId, fetchWorkflow, isWorkflowLoaded]);

  return children;
};

export const WorkflowManagerProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [store] = useState(() => createWorkflowManagerStore());

  return (
    <WorkflowManagerContext.Provider value={store}>
      {children}
    </WorkflowManagerContext.Provider>
  );
};
