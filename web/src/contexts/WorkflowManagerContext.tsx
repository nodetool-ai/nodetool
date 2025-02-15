// WorkflowManagerContext.tsx
// -----------------------------------------------
// This module creates a React context along with a corresponding Zustand store
// to manage workflows for the application. It is responsible for:
// - Managing open workflows and associated node stores.
// - Persisting the current workflow and list of open workflows in localStorage.
// - Handling API calls to create, retrieve, copy, update, and delete workflows.
// - Setting up WebSocket connections to listen for real-time workflow updates.
// - Presenting notifications on workflow changes.
// -----------------------------------------------

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

// -----------------------------------------------------------------
// TYPES
// -----------------------------------------------------------------

// Represents the loading state for a workflow API call.
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

// Defines the Zustand store type for workflow management.
export type WorkflowManagerStore = UseBoundStore<
  StoreApi<WorkflowManagerState>
>;

// -----------------------------------------------------------------
// CONTEXT SETUP
// -----------------------------------------------------------------

// Create a React context to hold the workflow manager store.
const WorkflowManagerContext = createContext<WorkflowManagerStore | null>(null);

// -----------------------------------------------------------------
// LOCAL STORAGE UTILITIES
// -----------------------------------------------------------------

// Storage keys for persisting workflow state in localStorage.
const STORAGE_KEYS = {
  CURRENT_WORKFLOW: "currentWorkflowId",
  OPEN_WORKFLOWS: "openWorkflows"
} as const;

// Provides a set of utility functions to interact with localStorage,
// including debounced writes to avoid excessive operations.
const storage = {
  // Retrieve the current workflow ID from localStorage.
  getCurrentWorkflow: () => localStorage.getItem(STORAGE_KEYS.CURRENT_WORKFLOW),

  // Retrieve the list of open workflow IDs.
  getOpenWorkflows: (): string[] =>
    JSON.parse(localStorage.getItem(STORAGE_KEYS.OPEN_WORKFLOWS) || "[]"),

  // Debounced setter for the current workflow ID.
  setCurrentWorkflow: debounce((workflowId: string) => {
    localStorage.setItem(STORAGE_KEYS.CURRENT_WORKFLOW, workflowId);
  }, 100),

  // Debounced setter for the array of open workflows.
  setOpenWorkflows: debounce((workflowIds: string[]) => {
    localStorage.setItem(
      STORAGE_KEYS.OPEN_WORKFLOWS,
      JSON.stringify(workflowIds)
    );
  }, 100),

  // Adds a workflow ID to the list of open workflows.
  addOpenWorkflow: (workflowId: string) => {
    const currentWorkflows = storage.getOpenWorkflows();
    if (!currentWorkflows.includes(workflowId)) {
      const updatedWorkflows = [...currentWorkflows, workflowId];
      storage.setOpenWorkflows(updatedWorkflows);
    }
  },

  // Removes a workflow ID from the list of open workflows.
  removeOpenWorkflow: (workflowId: string) => {
    const currentWorkflows = storage.getOpenWorkflows();
    const updatedWorkflows = currentWorkflows.filter((id) => id !== workflowId);
    storage.setOpenWorkflows(updatedWorkflows);
  }
};

// -----------------------------------------------------------------
// CUSTOM HOOK
// -----------------------------------------------------------------

// Custom hook to allow components to access the WorkflowManager state.
// The selector allows for fine-grained subscription and prevents unnecessary re-renders.
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

// -----------------------------------------------------------------
// ZUSTAND STORE CREATION
// -----------------------------------------------------------------

// This factory function creates the Zustand store that will manage
// workflow data, API calls, loading states, and local storage synchronization.
// It also has methods for creating, updating, saving, deleting workflows, etc.
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

      // ---------------------------------------------------------------------------------
      // Workflow Creation and API methods
      // ---------------------------------------------------------------------------------

      // Creates a new workflow object with default properties.
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

      // Creates a new workflow by sending the default workflow object to the API.
      createNew: async () => {
        return await get().create(get().newWorkflow());
      },

      // Creates a workflow based on the workflow request object.
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

        // Refresh workflows query cache.
        get().queryClient?.invalidateQueries({ queryKey: ["workflows"] });

        return workflowWithTags;
      },

      // Loads workflows from the API with optional pagination.
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

      // Loads a list of workflows by their IDs.
      loadIDs: async (workflowIds: string[]) => {
        const getWorkflow = get().getWorkflow;
        const promises = workflowIds.map((id) => getWorkflow(id));
        const workflows = await Promise.all(promises);
        return workflows.filter((w) => w !== undefined) as Workflow[];
      },

      // Loads public workflows available from the API.
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

      // Loads example workflows.
      loadExamples: async () => {
        const { data, error } = await client.GET("/api/workflows/examples", {});
        if (error) {
          throw createErrorMessage(error, "Failed to load examples");
        }
        return data;
      },

      // Creates a copy of an existing workflow.
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
          graph: JSON.parse(JSON.stringify(workflow.graph)), // Deep copy graph
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          settings: workflow.settings
        };
        return copiedWorkflow;
      },

      // Deletes a workflow.
      delete: async (id: string) => {
        // Record the deletion to handle possible race conditions with WebSocket updates.
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

        // Invalidate cache for workflows and the specific workflow.
        get().queryClient?.invalidateQueries({ queryKey: ["workflows"] });
        get().queryClient?.invalidateQueries({ queryKey: ["workflow", id] });
      },

      // Saves the current workflow as an example.
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

      // ---------------------------------------------------------------------------------
      // Current Workflow and Loading States
      // ---------------------------------------------------------------------------------

      // Returns the loading state of the current workflow based on currentWorkflowId.
      getCurrentLoadingState: () => {
        const currentWorkflowId = get().currentWorkflowId;
        if (!currentWorkflowId) {
          return undefined;
        }
        return get().loadingStates[currentWorkflowId];
      },

      // Sets the current workflow id and syncs it to localStorage.
      setCurrentWorkflowId: (workflowId: string) => {
        storage.setCurrentWorkflow(workflowId);
        set({ currentWorkflowId: workflowId });
      },

      // Retrieves the current workflow using its node store.
      getCurrentWorkflow: () => {
        const workflow = get().nodeStores[get().currentWorkflowId!];
        if (!workflow) {
          return undefined;
        }
        return workflow.getState().getWorkflow();
      },

      // Returns a workflow from its node store using the workflow id.
      getWorkflow: (workflowId: string) => {
        const workflow = get().nodeStores[workflowId];
        if (!workflow) {
          return undefined;
        }
        return workflow.getState().getWorkflow();
      },

      // ---------------------------------------------------------------------------------
      // Handling Open Workflows and Node Stores
      // ---------------------------------------------------------------------------------

      // Adds a workflow to the store and updates the list of open workflows.
      addWorkflow: (workflow: Workflow) => {
        if (!workflow.id) {
          console.warn("Attempted to add workflow with no ID");
          return;
        }
        // Update the open workflows in localStorage.
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
          // Create a new node store for the workflow.
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

      // Removes a workflow from state and localStorage.
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

      // Saves a workflow by sending its data to the API, updating the store and invalidating queries.
      saveWorkflow: async (workflow: Workflow) => {
        // Mark as recently saved to mitigate conflicts with WebSocket updates.
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

        // Update node store and openWorkflows with the new data.
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

        // Invalidate cache for the workflows list and the specific workflow.
        get().queryClient?.invalidateQueries({ queryKey: ["workflows"] });
        get().queryClient?.invalidateQueries({
          queryKey: ["workflow", workflow.id]
        });
      },

      // Returns the node store for a given workflow Id.
      getNodeStore: (workflowId: string) => get().nodeStores[workflowId],

      // ---------------------------------------------------------------------------------
      // Reordering and Updating Workflows
      // ---------------------------------------------------------------------------------

      // Reorders workflows based on source and target indices.
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

      // Updates a workflow's properties in its node store and refreshes the openWorkflows list.
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

      // ---------------------------------------------------------------------------------
      // Loading States for Workflows
      // ---------------------------------------------------------------------------------

      // Retrieves the loading state for a particular workflow.
      getLoadingState: (workflowId: string) => get().loadingStates[workflowId],

      // Updates the loading state for a workflow (e.g., during API calls).
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

      // Fetches the workflow data by its ID, updates the loading state and adds the workflow.
      fetchWorkflow: async (workflowId: string) => {
        const state = get();
        const nodeStore = state.getNodeStore(workflowId);
        const loadingState = state.getLoadingState(workflowId);

        // If the workflow is already loaded or currently loading, skip fetch.
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

      // Tracks recent changes to workflows to help prevent conflicting updates.
      recentChanges: {}
    };
  });
};

// -----------------------------------------------------------------
// COMPONENTS
// -----------------------------------------------------------------

// React component that ensures the current workflow is fetched and set based on URL params.
// It checks if the workflow is already loaded and fetches it if not.
export const FetchCurrentWorkflow: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const { setCurrentWorkflowId, getNodeStore, fetchWorkflow } =
    useWorkflowManager((state) => ({
      setCurrentWorkflowId: state.setCurrentWorkflowId,
      getNodeStore: state.getNodeStore,
      fetchWorkflow: state.fetchWorkflow
    }));
  // Extract workflow id from the route.
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

// Provider component that sets up the WorkflowManager store and supplies it via context.
// It also sets up WebSocket connections to handle real-time workflow updates and
// restores previously open workflows from localStorage.
export const WorkflowManagerProvider: React.FC<{
  children: React.ReactNode;
  queryClient: QueryClient;
}> = ({ children, queryClient }) => {
  const [store] = useState(() => {
    console.log("Creating workflow manager store");
    const workflowManagerStore = createWorkflowManagerStore(queryClient);
    return workflowManagerStore;
  });

  const [webSocketStore] = useState(() => {
    return createWebSocketUpdatesStore({
      // Callback to handle workflow updates
      onWorkflowUpdate: (workflow) => {
        const recentChange = store.getState().recentChanges[workflow.id];
        const now = Date.now();

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
      // Callback to handle workflow deletions
      onWorkflowDelete: (workflowId) => {
        const recentChange = store.getState().recentChanges[workflowId];
        const now = Date.now();

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
      // Callback to handle new workflow additions
      onWorkflowCreate: (workflow) => {
        store.getState().addWorkflow(workflow);
        useNotificationStore.getState().addNotification({
          type: "info",
          alert: true,
          content: `Added workflow ${workflow.name}`
        });
      }
    });
  });

  useEffect(() => {
    // Connect to the WebSocket server
    webSocketStore.getState().connect();

    // Restore workflows that were previously open from localStorage
    const openWorkflows = storage.getOpenWorkflows();
    openWorkflows.forEach((workflowId: string) => {
      store.getState().fetchWorkflow(workflowId);
    });

    // Cleanup: disconnect WebSocket on component unmount
    return () => {
      webSocketStore.getState().disconnect();
    };
  }, [store, webSocketStore]);

  return (
    <WorkflowManagerContext.Provider value={store}>
      {children}
    </WorkflowManagerContext.Provider>
  );
};
