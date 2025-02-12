import { createContext, useContext, useState, useEffect } from "react";
import { create, StoreApi, UseBoundStore } from "zustand";
import { NodeStore } from "../stores/NodeStore";
import {
  SystemStats,
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
import { debounce, omit } from "lodash";
import { createErrorMessage } from "../utils/errorHandling";
import { uuidv4 } from "../stores/uuidv4";
import { QueryClient } from "@tanstack/react-query";
import { createWebSocketUpdatesStore } from "../stores/WebSocketUpdatesStore";
import { useNotificationStore } from "../stores/NotificationStore";

type LoadingState = {
  isLoading: boolean;
  error: Error | null;
  data: Workflow | null;
};

type WorkflowManagerState = {
  nodeStores: Record<string, NodeStore>;
  currentWorkflowId: string | null;
  loadingStates: Record<string, LoadingState>;
  openWorkflows: WorkflowAttributes[];
  queryClient: QueryClient;
  systemStats: SystemStats | null;
  getSystemStats: () => SystemStats | null;
  getCurrentLoadingState: () => LoadingState | undefined;
  getWorkflow: (workflowId: string) => Workflow | undefined;
  addWorkflow: (workflow: Workflow) => void;
  removeWorkflow: (workflowId: string) => void;
  getNodeStore: (workflowId: string) => NodeStore | undefined;
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
  copy: (originalWorkflow: Workflow) => Promise<Workflow>;
  delete: (id: string) => Promise<void>;
  saveExample: () => Promise<any>;
  recentChanges: Record<
    string,
    { timestamp: number; action: "save" | "delete" | "edit" }
  >;
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
  }, 100),

  // New functions for managing open workflows
  addOpenWorkflow: (workflowId: string) => {
    const currentWorkflows = storage.getOpenWorkflows();
    if (!currentWorkflows.includes(workflowId)) {
      const updatedWorkflows = [...currentWorkflows, workflowId];
      storage.setOpenWorkflows(updatedWorkflows);
    }
  },

  removeOpenWorkflow: (workflowId: string) => {
    const currentWorkflows = storage.getOpenWorkflows();
    const updatedWorkflows = currentWorkflows.filter((id) => id !== workflowId);
    storage.setOpenWorkflows(updatedWorkflows);
  }
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

export const createWorkflowManagerStore = (queryClient: QueryClient) => {
  return create<WorkflowManagerState>()((set, get) => {
    return {
      nodeStores: {},
      openWorkflows: [],
      currentWorkflowId: storage.getCurrentWorkflow() || null,
      loadingStates: {},
      error: null,
      queryClient: queryClient,
      systemStats: null,
      getSystemStats: () => get().systemStats,
      setSystemStats: (stats: SystemStats) => set({ systemStats: stats }),
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
          },
          settings: {
            hide_ui: false
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

        // Invalidate workflows queries
        get().queryClient?.invalidateQueries({ queryKey: ["workflows"] });

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
          updated_at: new Date().toISOString(),
          settings: workflow.settings
        };
        return copiedWorkflow;
      },

      delete: async (id: string) => {
        // Mark this workflow as recently deleted
        set((state) => ({
          recentChanges: {
            ...state.recentChanges,
            [id]: { timestamp: Date.now(), action: "delete" }
          }
        }));

        const { error } = await client.DELETE("/api/workflows/{id}", {
          params: { path: { id } }
        });
        if (error) {
          throw createErrorMessage(error, "Failed to delete workflow");
        }

        // Invalidate workflows queries and specific workflow
        get().queryClient?.invalidateQueries({ queryKey: ["workflows"] });
        get().queryClient?.invalidateQueries({ queryKey: ["workflow", id] });
      },

      saveExample: async () => {
        const workflow = get().getCurrentWorkflow();
        if (!workflow) {
          throw new Error("Workflow not found");
        }
        const { data, error } = await client.PUT(
          "/api/workflows/examples/{id}",
          {
            params: { path: { id: workflow.id } },
            body: {
              name: workflow.name,
              description: workflow.description,
              thumbnail: workflow.thumbnail,
              thumbnail_url: workflow.thumbnail_url,
              access: "public",
              graph: workflow.graph
            }
          }
        );

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
      getWorkflow: (workflowId: string) => {
        const workflow = get().nodeStores[workflowId];
        if (!workflow) {
          return undefined;
        }
        return workflow.getState().getWorkflow();
      },
      addWorkflow: (workflow: Workflow) => {
        if (!workflow.id) {
          console.warn("Attempted to add workflow with no ID");
          return;
        }
        const openWorkflows = storage.getOpenWorkflows();

        if (!openWorkflows.includes(workflow.id)) {
          const updatedWorkflows = [...openWorkflows, workflow.id];
          storage.setOpenWorkflows(updatedWorkflows);
        }

        set((state) => {
          const existingIndex = state.openWorkflows.findIndex(
            (w) => w.id === workflow.id
          );

          let updatedOpenWorkflows;
          if (existingIndex >= 0) {
            updatedOpenWorkflows = [...state.openWorkflows];
            updatedOpenWorkflows[existingIndex] = omit(workflow, ["graph"]);

            if (state.nodeStores[workflow.id]) {
              state.nodeStores[workflow.id].setState({
                workflow: workflow
              });
              return {
                openWorkflows: updatedOpenWorkflows
              };
            }
          } else {
            updatedOpenWorkflows = [
              ...state.openWorkflows,
              omit(workflow, ["graph"])
            ];
          }
          const nodeStore = createNodeStore(workflow);

          return {
            openWorkflows: updatedOpenWorkflows,
            nodeStores: {
              ...state.nodeStores,
              [workflow.id]: nodeStore
            }
          };
        });
      },
      removeWorkflow: (workflowId: string) => {
        storage.removeOpenWorkflow(workflowId);

        set((state) => {
          const { [workflowId]: removed, ...remaining } = state.nodeStores;
          const {
            [workflowId]: removedLoadingState,
            ...remainingLoadingStates
          } = state.loadingStates;
          return {
            nodeStores: remaining,
            loadingStates: remainingLoadingStates,
            openWorkflows: state.openWorkflows.filter(
              (w) => w.id !== workflowId
            )
          };
        });
      },

      saveWorkflow: async (workflow: Workflow) => {
        // Mark this workflow as recently saved
        set((state) => ({
          recentChanges: {
            ...state.recentChanges,
            [workflow.id]: { timestamp: Date.now(), action: "save" }
          }
        }));

        const { data, error } = await client.PUT("/api/workflows/{id}", {
          params: { path: { id: workflow.id } },
          body: workflow
        });
        if (error) {
          throw createErrorMessage(error, "Failed to save workflow");
        }

        // Update the node store and openWorkflows with the saved workflow
        set((state) => {
          const nodeStore = state.nodeStores[workflow.id];
          if (nodeStore) {
            nodeStore.setState({
              workflow: data
            });
          }
          return {
            openWorkflows: state.openWorkflows.map((w) =>
              w.id === workflow.id ? omit(data, ["graph"]) : w
            )
          };
        });

        // Invalidate specific workflow and workflows list
        get().queryClient?.invalidateQueries({ queryKey: ["workflows"] });
        get().queryClient?.invalidateQueries({
          queryKey: ["workflow", workflow.id]
        });
      },
      getNodeStore: (workflowId: string) => get().nodeStores[workflowId],
      reorderWorkflows: (sourceIndex: number, targetIndex: number) => {
        set((state) => {
          const entries = Object.entries(state.nodeStores);
          const [moved] = entries.splice(sourceIndex, 1);
          entries.splice(targetIndex, 0, moved);
          return {
            nodeStores: Object.fromEntries(entries),
            openWorkflows: Object.values(get().nodeStores).map((store) => {
              return store.getState().workflow;
            })
          };
        });
      },
      updateWorkflow: (workflow: WorkflowAttributes) => {
        const nodeStore = get().nodeStores[workflow.id];
        if (!nodeStore) {
          return;
        }
        nodeStore.setState({
          workflow: workflow
        });
        set((state) => ({
          openWorkflows: Object.values(state.nodeStores).map((store) => {
            return store.getState().workflow;
          })
        }));
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
      },
      recentChanges: {}
    };
  });
};

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
  queryClient: QueryClient;
}> = ({ children, queryClient }) => {
  const [store] = useState(() => {
    const workflowManagerStore = createWorkflowManagerStore(queryClient);
    return workflowManagerStore;
  });

  useEffect(() => {
    // Create and connect WebSocket store
    const webSocketUpdatesStore = createWebSocketUpdatesStore(
      (workflow) => {
        const recentChange = store.getState().recentChanges[workflow.id];
        const now = Date.now();

        // Skip updates for workflows saved in the last 2 seconds
        if (
          recentChange?.action === "save" &&
          now - recentChange.timestamp < 2000
        ) {
          return;
        }

        store.getState().addWorkflow(workflow);
        useNotificationStore.getState().addNotification({
          type: "info",
          alert: true,
          content: `Updated workflow ${workflow.name}`
        });
      },
      (workflowId) => {
        const recentChange = store.getState().recentChanges[workflowId];
        const now = Date.now();

        // Skip updates for workflows deleted in the last 2 seconds
        if (
          recentChange?.action === "delete" &&
          now - recentChange.timestamp < 2000
        ) {
          return;
        }

        store.getState().removeWorkflow(workflowId);
        useNotificationStore.getState().addNotification({
          type: "info",
          alert: true,
          content: `Removed workflow ${workflowId}`
        });
      },
      (workflow) => {
        store.getState().addWorkflow(workflow);
        useNotificationStore.getState().addNotification({
          type: "info",
          alert: true,
          content: `Added workflow ${workflow.name}`
        });
      }
    );

    webSocketUpdatesStore.getState().connect();

    // Restore previously open workflows
    const openWorkflows = storage.getOpenWorkflows();
    openWorkflows.forEach((workflowId: string) => {
      store.getState().fetchWorkflow(workflowId);
    });

    // Cleanup function to disconnect WebSocket when component unmounts
    return () => {
      webSocketUpdatesStore.getState().disconnect();
    };
  }, [store]);

  return (
    <WorkflowManagerContext.Provider value={store}>
      {children}
    </WorkflowManagerContext.Provider>
  );
};
