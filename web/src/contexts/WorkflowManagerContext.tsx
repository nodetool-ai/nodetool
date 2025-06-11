// WorkflowManagerContext.tsx
// -----------------------------------------------
// This module creates a React context along with a corresponding Zustand store
// to manage workflows for the application. It is responsible for:
// - Managing open workflows and associated node stores.
// - Persisting the current workflow and list of open workflows in localStorage.
// - Handling API calls to create, retrieve, copy, update, and delete workflows.
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

// -----------------------------------------------------------------
// HELPER FUNCTIONS
// -----------------------------------------------------------------

/**
 * Determines the next active workflow ID when a workflow is removed.
 *
 * @param openWorkflows - The list of currently open workflows.
 * @param closingWorkflowId - The ID of the workflow being closed.
 * @param currentWorkflowId - The ID of the currently active workflow.
 * @returns The ID of the next workflow to be activated, or null if none are left.
 */
export const determineNextWorkflowId = (
  openWorkflows: WorkflowAttributes[],
  closingWorkflowId: string,
  currentWorkflowId: string | null
): string | null => {
  if (currentWorkflowId !== closingWorkflowId) {
    return currentWorkflowId;
  }

  const remainingWorkflows = openWorkflows.filter(
    (w) => w.id !== closingWorkflowId
  );
  if (remainingWorkflows.length === 0) {
    return null;
  }

  const closingIndex = openWorkflows.findIndex(
    (w) => w.id === closingWorkflowId
  );

  // Try to select the next tab, then the previous one, then the first one.
  const nextWorkflow =
    remainingWorkflows[closingIndex] ||
    remainingWorkflows[closingIndex - 1] ||
    remainingWorkflows[0];

  return nextWorkflow.id;
};

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
  create: (
    workflow: WorkflowRequest,
    fromExamplePackage?: string,
    fromExampleName?: string
  ) => Promise<Workflow>;
  load: (cursor?: string, limit?: number) => Promise<any>;
  loadIDs: (workflowIds: string[]) => Promise<Workflow[]>;
  loadPublic: (cursor?: string) => Promise<any>;
  loadExamples: () => Promise<any>;
  searchExamples: (query: string) => Promise<any>;
  copy: (originalWorkflow: Workflow) => Promise<Workflow>;
  delete: (workflow: Workflow) => Promise<void>;
  saveExample: () => Promise<any>;
  validateAllEdges: () => void;
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

/**
 * Custom hook to access the WorkflowManager state.
 * @template T The type of the selected state slice
 * @param {function} selector Function to select a portion of the state
 * @returns {T} The selected portion of the state
 * @throws {Error} If used outside of WorkflowManagerProvider
 */
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

/**
 * Creates a new Zustand store for managing workflows.
 * @param {QueryClient} queryClient The React Query client instance
 * @returns {WorkflowManagerStore} The configured workflow manager store
 */
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

      /**
       * Creates a new workflow with default properties.
       * @returns {Workflow} A new workflow object with default values
       */
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

      /**
       * Creates a new workflow via API call.
       * @returns {Promise<Workflow>} The newly created workflow
       */
      createNew: async () => {
        return await get().create(get().newWorkflow());
      },

      /**
       * Creates a workflow based on the provided request object.
       * @param {WorkflowRequest} workflow The workflow request data
       * @param {string} [fromExamplePackage] The package name for creating from example
       * @param {string} [fromExampleName] The example name for creating from example
       * @returns {Promise<Workflow>} The created workflow
       * @throws {Error} If the API call fails
       */
      create: async (
        workflow: WorkflowRequest,
        fromExamplePackage?: string,
        fromExampleName?: string
      ) => {
        const { data, error } = await client.POST("/api/workflows/", {
          body: workflow,
          params: {
            query: {
              from_example_package: fromExamplePackage,
              from_example_name: fromExampleName
            }
          }
        });
        if (error) {
          throw createErrorMessage(error, "Failed to create workflow");
        }
        get().addWorkflow(data);
        get().setCurrentWorkflowId(data.id);
        return data;
      },

      /**
       * Loads workflows with optional pagination.
       * @param {string} [cursor] Pagination cursor
       * @param {number} [limit] Number of workflows to load
       * @returns {Promise<any>} The loaded workflows data
       * @throws {Error} If the API call fails
       */
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

      /**
       * Loads multiple workflows by their IDs.
       * @param {string[]} workflowIds Array of workflow IDs to load
       * @returns {Promise<Workflow[]>} Array of loaded workflows
       */
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

      // Searches example workflows using the backend search API.
      searchExamples: async (query: string) => {
        const { data, error } = await client.GET(
          "/api/workflows/examples/search",
          {
            params: {
              query: {
                query
              }
            }
          }
        );
        if (error) {
          console.error(
            "[WorkflowManagerContext] searchExamples error:",
            error
          );
          throw createErrorMessage(error, "Failed to search examples");
        }
        return data;
      },

      /**
       * Creates a copy of an existing workflow.
       * @param {Workflow} originalWorkflow The workflow to copy
       * @returns {Promise<Workflow>} The copied workflow
       * @throws {Error} If the original workflow is not found
       */
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

      /**
       * Deletes a workflow by ID.
       * @param {string} id The ID of the workflow to delete
       * @returns {Promise<void>}
       * @throws {Error} If the deletion fails
       */
      delete: async (workflow: Workflow) => {
        const { error } = await client.DELETE("/api/workflows/{id}", {
          params: { path: { id: workflow.id } }
        });
        if (error) {
          throw createErrorMessage(error, "Failed to delete workflow");
        }
        if (window.api) {
          window.api.onDeleteWorkflow(workflow);
        }
        // Invalidate cache for workflows and the specific workflow.
        get().queryClient?.invalidateQueries({ queryKey: ["workflows"] });
        get().queryClient?.invalidateQueries({
          queryKey: ["workflow", workflow.id]
        });
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
              tags: workflow.tags,
              package_name: workflow.package_name,
              path: workflow.path,
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

      /**
       * Sets the current workflow ID and syncs it to localStorage.
       * @param {string} workflowId The ID of the workflow to set as current
       */
      setCurrentWorkflowId: (workflowId: string) => {
        set({ currentWorkflowId: workflowId });
        storage.setCurrentWorkflow(workflowId);
      },

      // Retrieves the current workflow using its node store.
      getCurrentWorkflow: () => {
        const id = get().currentWorkflowId;
        return id ? get().getWorkflow(id) : undefined;
      },

      // Returns a workflow from its node store using the workflow id.
      getWorkflow: (workflowId: string) => {
        const store = get().nodeStores[workflowId];
        return store ? store.getState().getWorkflow() : undefined;
      },

      // ---------------------------------------------------------------------------------
      // Handling Open Workflows and Node Stores
      // ---------------------------------------------------------------------------------

      /**
       * Adds a workflow to the store and updates open workflows.
       * @param {Workflow} workflow The workflow to add
       */
      addWorkflow: (workflow: Workflow) => {
        const existingStore = get().getNodeStore(workflow.id);
        if (existingStore) {
          console.warn(
            `[WorkflowManager] A store for workflow ${workflow.id} already exists. Skipping creation.`
          );
          return;
        }

        const newStore = createNodeStore(workflow);
        const workflowAttributes = omit(workflow, "graph");
        set((state) => ({
          nodeStores: { ...state.nodeStores, [workflow.id]: newStore },
          openWorkflows: [...state.openWorkflows, workflowAttributes]
        }));
        storage.addOpenWorkflow(workflow.id);
      },

      /**
       * Removes a workflow from state and localStorage.
       * @param {string} workflowId The ID of the workflow to remove
       */
      removeWorkflow: (workflowId: string) => {
        console.log(`[WorkflowManager] Removing workflow: ${workflowId}`);
        const { nodeStores, openWorkflows, currentWorkflowId, loadingStates } =
          get();

        const newOpenWorkflows = openWorkflows.filter(
          (w) => w.id !== workflowId
        );
        const newStores = { ...nodeStores };
        delete newStores[workflowId];

        const newLoadingStates = { ...loadingStates };
        delete newLoadingStates[workflowId];

        const newCurrentId = determineNextWorkflowId(
          openWorkflows,
          workflowId,
          currentWorkflowId
        );

        set({
          nodeStores: newStores,
          openWorkflows: newOpenWorkflows,
          currentWorkflowId: newCurrentId,
          loadingStates: newLoadingStates
        });

        storage.removeOpenWorkflow(workflowId);

        if (newCurrentId) {
          storage.setCurrentWorkflow(newCurrentId);
        } else {
          localStorage.removeItem(STORAGE_KEYS.CURRENT_WORKFLOW);
        }
      },

      /**
       * Saves workflow changes to the API and updates local state.
       * @param {Workflow} workflow The workflow to save
       * @returns {Promise<void>}
       * @throws {Error} If the save operation fails
       */
      saveWorkflow: async (workflow: Workflow) => {
        const { data, error } = await client.PUT("/api/workflows/{id}", {
          params: { path: { id: workflow.id } },
          body: workflow
        });
        if (error) {
          throw createErrorMessage(error, "Failed to save workflow");
        }

        if (window.api) {
          window.api.onUpdateWorkflow(data);
        }

        // Update node store and openWorkflows with the new data.
        set((state) => {
          const nodeStore = state.nodeStores[workflow.id];
          if (nodeStore) {
            nodeStore.setState({
              workflow: data
            });
            nodeStore.getState().setWorkflowDirty(false);
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

      /**
       * Reorders workflows in the list.
       * @param {number} sourceIndex Original position
       * @param {number} targetIndex New position
       */
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

      /**
       * Updates a workflow's properties and refreshes the list.
       * @param {WorkflowAttributes} workflow The workflow attributes to update
       */
      updateWorkflow: (workflow: WorkflowAttributes) => {
        set((state) => ({
          openWorkflows: state.openWorkflows.map((w) =>
            w.id === workflow.id ? { ...w, ...workflow } : w
          )
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

      validateAllEdges: () => {
        // Edge validation functionality removed - will be implemented in separate branch
      }
    };
  });
};

// -----------------------------------------------------------------
// COMPONENTS
// -----------------------------------------------------------------

/**
 * Component that ensures the current workflow is fetched based on URL params.
 * @param {Object} props Component props
 * @param {React.ReactNode} props.children Child components
 * @returns {React.ReactNode}
 */
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
/**
 * Provider component that sets up the WorkflowManager store and context.
 * @param {Object} props Component props
 * @param {React.ReactNode} props.children Child components
 * @param {QueryClient} props.queryClient React Query client instance
 * @returns {React.ReactNode}
 */
export const WorkflowManagerProvider: React.FC<{
  children: React.ReactNode;
  queryClient: QueryClient;
}> = ({ children, queryClient }) => {
  const [store] = useState(() => {
    const workflowManagerStore = createWorkflowManagerStore(queryClient);
    return workflowManagerStore;
  });

  const [webSocketStore] = useState(() => {
    return createWebSocketUpdatesStore();
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
