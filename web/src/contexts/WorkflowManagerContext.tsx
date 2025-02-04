import { createContext, useContext, useState, useEffect } from "react";
import { create, StoreApi, UseBoundStore } from "zustand";
import { NodeStore } from "../stores/NodeStore";
import {
  Workflow,
  WorkflowAttributes,
  WorkflowRequest
} from "../stores/ApiTypes";
import { createNodeStore } from "../stores/NodeStore";
import { useParams } from "react-router-dom";
import { client } from "../stores/ApiClient";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { shallow } from "zustand/shallow";
import React from "react";
import { debounce } from "lodash";
import { createErrorMessage } from "../utils/errorHandling";
import { uuidv4 } from "../stores/uuidv4";

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
  getWorkflow: (workflowId: string) => Workflow | undefined;
  addWorkflow: (workflow: Workflow) => void;
  removeWorkflow: (workflowId: string) => void;
  getNodeStore: (workflowId: string) => NodeStore | undefined;
  listWorkflows: () => WorkflowAttributes[];
  reorderWorkflows: (sourceIndex: number, targetIndex: number) => void;
  updateWorkflow: (workflow: WorkflowAttributes) => void;
  saveWorkflow: (workflow: Workflow) => Promise<void>;
  getCurrentWorkflow: () => Workflow | undefined;
  setCurrentWorkflowId: (workflowId: string) => void;
  fetchWorkflow: (workflowId: string) => Promise<void>;
  getLoadingState: (workflowId: string) => LoadingState | undefined;
  setLoadingState: (workflowId: string, state: Partial<LoadingState>) => void;
  newWorkflow: () => Workflow;
  createNew: () => Promise<Workflow>;
  create: (workflow: WorkflowRequest) => Promise<Workflow>;
  load: (cursor?: string, limit?: number) => Promise<any>;
  loadIDs: (workflowIds: string[]) => Promise<Workflow[]>;
  loadPublic: (cursor?: string) => Promise<any>;
  loadExamples: () => Promise<any>;
  update: (workflow: Workflow) => Promise<Workflow>;
  copy: (originalWorkflow: Workflow) => Promise<Workflow>;
  delete: (id: string) => Promise<void>;
  saveExample: (id: string, workflow: Workflow) => Promise<any>;
};

export type WorkflowManagerStore = UseBoundStore<
  StoreApi<WorkflowManagerState>
>;

const WorkflowManagerContext = createContext<WorkflowManagerStore | null>(null);

const STORAGE_KEYS = {
  CURRENT_WORKFLOW: "currentWorkflowId",
  OPEN_WORKFLOWS: "openWorkflows"
} as const;

const storage = {
  getCurrentWorkflow: () => localStorage.getItem(STORAGE_KEYS.CURRENT_WORKFLOW),

  getOpenWorkflows: (): string[] =>
    JSON.parse(localStorage.getItem(STORAGE_KEYS.OPEN_WORKFLOWS) || "[]"),

  // Debounced write functions
  setCurrentWorkflow: debounce((workflowId: string) => {
    localStorage.setItem(STORAGE_KEYS.CURRENT_WORKFLOW, workflowId);
  }, 100),

  setOpenWorkflows: debounce((workflowIds: string[]) => {
    localStorage.setItem(
      STORAGE_KEYS.OPEN_WORKFLOWS,
      JSON.stringify(workflowIds)
    );
  }, 100)
};

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
    currentWorkflowId: storage.getCurrentWorkflow() || null,
    loadingStates: {},
    error: null,
    newWorkflow: () => {
      const data: Workflow = {
        id: "",
        name: "New Workflow",
        description: "",
        access: "private",
        thumbnail: "",
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        graph: {
          nodes: [],
          edges: []
        }
      };
      return data;
    },

    createNew: async () => {
      return await get().create(get().newWorkflow());
    },

    create: async (workflow: WorkflowRequest) => {
      const { data, error } = await client.POST("/api/workflows/", {
        body: workflow
      });
      if (error) {
        throw createErrorMessage(error, "Failed to create workflow");
      }

      const workflowWithTags = {
        ...data,
        tags: workflow.tags || []
      };

      return workflowWithTags;
    },

    load: async (cursor?: string, limit?: number) => {
      cursor = cursor || "";
      const { data, error } = await client.GET("/api/workflows/", {
        params: { query: { cursor, limit } }
      });
      if (error) {
        throw createErrorMessage(error, "Failed to load workflows");
      }
      return data;
    },

    loadIDs: async (workflowIds: string[]) => {
      const getWorkflow = get().getWorkflow;
      const promises = workflowIds.map((id) => getWorkflow(id));
      const workflows = await Promise.all(promises);
      return workflows.filter((w) => w !== undefined) as Workflow[];
    },

    loadPublic: async (cursor?: string) => {
      cursor = cursor || "";
      const { data, error } = await client.GET("/api/workflows/public", {
        params: { query: { cursor } }
      });
      if (error) {
        throw error;
      }
      return data;
    },

    loadExamples: async () => {
      const { data, error } = await client.GET("/api/workflows/examples", {});
      if (error) {
        throw createErrorMessage(error, "Failed to load examples");
      }
      return data;
    },

    update: async (workflow: Workflow) => {
      if (workflow.id === "") {
        console.warn("Cannot update workflow with empty ID");
        return workflow;
      }
      const { error, data } = await client.PUT("/api/workflows/{id}", {
        params: {
          path: { id: workflow.id }
        },
        body: workflow
      });
      if (error) {
        throw createErrorMessage(error, "Failed to update workflow");
      }
      return data;
    },

    copy: async (originalWorkflow: Workflow) => {
      const workflow = get().getWorkflow(originalWorkflow.id);
      if (!workflow) {
        throw new Error("Workflow not found");
      }
      const copiedWorkflow = {
        id: uuidv4(),
        name: workflow.name,
        description: workflow.description,
        thumbnail: workflow.thumbnail,
        thumbnail_url: workflow.thumbnail_url,
        tags: workflow.tags,
        access: "private",
        graph: JSON.parse(JSON.stringify(workflow.graph)),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      return copiedWorkflow;
    },

    delete: async (id: string) => {
      const { error } = await client.DELETE("/api/workflows/{id}", {
        params: { path: { id } }
      });
      if (error) {
        throw createErrorMessage(error, "Failed to delete workflow");
      }
    },

    saveExample: async (id: string, workflow: Workflow) => {
      const { data, error } = await client.PUT("/api/workflows/examples/{id}", {
        params: { path: { id } },
        body: {
          name: workflow.name,
          description: workflow.description,
          thumbnail: workflow.thumbnail,
          thumbnail_url: workflow.thumbnail_url,
          access: "public",
          graph: workflow.graph
        }
      });

      if (error) {
        throw createErrorMessage(error, "Failed to save example");
      }

      return data;
    },
    getCurrentLoadingState: () => {
      const currentWorkflowId = get().currentWorkflowId;
      if (!currentWorkflowId) {
        return undefined;
      }
      return get().loadingStates[currentWorkflowId];
    },
    setCurrentWorkflowId: (workflowId: string) => {
      storage.setCurrentWorkflow(workflowId);
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
      return workflow.getState().getWorkflow();
    },
    addWorkflow: (workflow: Workflow) => {
      if (!workflow.id) {
        return;
      }
      const openWorkflows = storage.getOpenWorkflows();
      if (!openWorkflows.includes(workflow.id)) {
        const updatedWorkflows = [...openWorkflows, workflow.id];
        storage.setOpenWorkflows(updatedWorkflows);
      }

      set((state) => ({
        nodeStores: {
          ...state.nodeStores,
          [workflow.id]: createNodeStore(workflow)
        }
      }));
    },
    removeWorkflow: (workflowId: string) => {
      const openWorkflows = storage.getOpenWorkflows();
      const updatedWorkflows = openWorkflows.filter((id) => id !== workflowId);
      storage.setOpenWorkflows(updatedWorkflows);

      set((state) => {
        const { [workflowId]: removed, ...remaining } = state.nodeStores;
        const { [workflowId]: removedLoadingState, ...remainingLoadingStates } =
          state.loadingStates;
        return {
          nodeStores: remaining,
          loadingStates: remainingLoadingStates
        };
      });
    },

    saveWorkflow: async (workflow: Workflow) => {
      const { data, error } = await client.PUT("/api/workflows/{id}", {
        params: { path: { id: workflow.id } },
        body: workflow
      });
      if (error) {
        throw createErrorMessage(error, "Failed to save workflow");
      }
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
  }, [workflowId, fetchWorkflow, isWorkflowLoaded, setCurrentWorkflowId]);

  return children;
};

export const WorkflowManagerProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [store] = useState(() => {
    const workflowManagerStore = createWorkflowManagerStore();

    // Restore previously open workflows
    const openWorkflows = storage.getOpenWorkflows();
    openWorkflows.forEach((workflowId: string) => {
      workflowManagerStore.getState().fetchWorkflow(workflowId);
    });

    return workflowManagerStore;
  });

  return (
    <WorkflowManagerContext.Provider value={store}>
      {children}
    </WorkflowManagerContext.Provider>
  );
};
