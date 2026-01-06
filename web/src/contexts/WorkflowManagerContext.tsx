// WorkflowManagerContext.tsx
// -----------------------------------------------
// React context + Zustand store coordinating all workflows in the app.
// Responsibilities:
// - Create/load/copy/delete workflows via API and expose helpers to the UI
// - Maintain per-workflow NodeStore instances (tabbed editors) and surface
//   validation helpers
// - Persist `currentWorkflowId` and the list/order of open workflows in
//   localStorage to restore tabs between sessions
// - Provide a shared QueryClient and system stats for child components
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
import debounce from "lodash/debounce";
import omit from "lodash/omit";
import { createErrorMessage } from "../utils/errorHandling";
import { uuidv4 } from "../stores/uuidv4";
import type {} from "../window";
import { QueryClient } from "@tanstack/react-query";
import {
  fetchWorkflowById,
  workflowQueryKey
} from "../serverState/useWorkflow";
import { subscribeToWorkflowUpdates, unsubscribeFromWorkflowUpdates } from "../stores/workflowUpdates";
import { getWorkflowRunnerStore } from "../stores/WorkflowRunner";

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

// Loading state was previously kept here for tabs; now superseded by React Query
type LoadingState = never;

type WorkflowManagerState = {
  nodeStores: Record<string, NodeStore>;
  currentWorkflowId: string | null;
  loadingStates: Record<string, never>;
  openWorkflows: WorkflowAttributes[];
  queryClient: QueryClient;
  systemStats: SystemStats | null;
  getSystemStats: () => SystemStats | null;
  getCurrentLoadingState: () => undefined;
  getWorkflow: (workflowId: string) => Workflow | undefined;
  addWorkflow: (workflow: Workflow) => void;
  removeWorkflow: (workflowId: string) => void;
  getNodeStore: (workflowId: string) => NodeStore | undefined;
  reorderWorkflows: (sourceIndex: number, targetIndex: number) => void;
  updateWorkflow: (workflow: WorkflowAttributes) => void;
  saveWorkflow: (workflow: Workflow) => Promise<void>;
  getCurrentWorkflow: () => Workflow | undefined;
  setCurrentWorkflowId: (workflowId: string) => void;
  fetchWorkflow: (workflowId: string) => Promise<Workflow | undefined>;
  getLoadingState: (workflowId: string) => undefined;
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
  loadTemplates: () => Promise<any>;
  searchTemplates: (query: string) => Promise<any>;
  copy: (originalWorkflow: Workflow) => Promise<Workflow>;
  delete: (workflow: Workflow) => Promise<void>;
  saveExample: (packageName: string) => Promise<any>;
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
  }, 100)
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
       * Uses a local ID (with "local-" prefix) to avoid immediate database save.
       * The workflow is only saved when saveWorkflow() is called for the first time.
       * @returns {Workflow} A new workflow object with default values
       */
      newWorkflow: () => {
        const data: Workflow = {
          id: uuidv4(),
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
          },
          run_mode: "workflow"
        };
        return data;
      },

        /**
         * Saves the workflow and creates a version entry.
         * If the workflow has a local ID (starts with "local-"), it will be created
         * in the database first, then updated with the real ID.
         * @param {Workflow} workflow - The workflow to save
         * @returns {Promise<void>}
         * @throws {Error} If the save operation fails
         */
        saveWorkflow: async (workflow: Workflow) => {
          console.log("[saveWorkflow] Saving workflow:", {
            id: workflow.id,
            name: workflow.name,
            graphNodesCount: workflow.graph?.nodes?.length ?? 0,
            graphEdgesCount: workflow.graph?.edges?.length ?? 0,
            firstNode: workflow.graph?.nodes?.[0] ? {
              id: workflow.graph.nodes[0].id,
              type: workflow.graph.nodes[0].type,
              ui_properties: workflow.graph.nodes[0].ui_properties,
              parent_id: workflow.graph.nodes[0].parent_id,
              dynamic_properties: workflow.graph.nodes[0].dynamic_properties
            } : null,
            firstEdge: workflow.graph?.edges?.[0] || null
          });

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

          set((state) => {
            const nodeStore = state.nodeStores[data.id];
            if (nodeStore) {
              nodeStore.setState({
                workflow: data
              });
              nodeStore.getState().setWorkflowDirty(false);
            }

            return {
              openWorkflows: state.openWorkflows.map((w) =>
                w.id === data.id ? omit(data, ["graph"]) : w
              )
            };
          });

          get().queryClient?.invalidateQueries({ queryKey: ["workflows"] });
          get().queryClient?.invalidateQueries({
            queryKey: ["workflow", data.id]
          });
          get().queryClient?.invalidateQueries({ queryKey: ["workflow-tools"] });
        },

       /**
        * Creates a new workflow locally with instant response.
        * Does NOT save to database - only saves when saveWorkflow() is called.
        * @returns {Promise<Workflow>} The newly created local workflow
        */
       createNew: async () => {
         const workflow = get().newWorkflow();
         get().addWorkflow(workflow);
         get().setCurrentWorkflowId(workflow.id);
         return workflow;
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
        if (data.tags === undefined) {
          data.tags = [];
        }
        get().addWorkflow(data);
        get().setCurrentWorkflowId(data.id);

        // Refresh workflows query cache.
        get().queryClient?.invalidateQueries({ queryKey: ["workflows"] });
        // Refresh workflow tools list reactively
        get().queryClient?.invalidateQueries({ queryKey: ["workflow-tools"] });

        if (window.api) {
          window.api.onCreateWorkflow(data);
        }

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

      // Loads template workflows.
      loadTemplates: async () => {
        const { data, error } = await client.GET("/api/workflows/examples", {});
        if (error) {
          throw createErrorMessage(error, "Failed to load templates");
        }
        return data;
      },

      // Searches template workflows using the backend search API.
      searchTemplates: async (query: string) => {
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
            "[WorkflowManagerContext] searchTemplates error:",
            error
          );
          throw createErrorMessage(error, "Failed to search templates");
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
        // Invalidate workflow tools reactively
        get().queryClient?.invalidateQueries({ queryKey: ["workflow-tools"] });
      },

      // Saves the current workflow as an example.
      saveExample: async (packageName: string) => {
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
              package_name: packageName,
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
      // Current Workflow (loading state handled via React Query)
      // ---------------------------------------------------------------------------------

      // Deprecated: replaced by React Query; keep API for compatibility
      getCurrentLoadingState: () => undefined,

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
        const newOpenWorkflows = [...get().openWorkflows, workflowAttributes];
        
        set((state) => ({
          nodeStores: { ...state.nodeStores, [workflow.id]: newStore },
          openWorkflows: newOpenWorkflows
        }));
        storage.setOpenWorkflows(newOpenWorkflows.map(w => w.id));

        const runnerStore = getWorkflowRunnerStore(workflow.id);
        subscribeToWorkflowUpdates(workflow.id, workflow, runnerStore);
      },

       /**
        * Removes a workflow from state and localStorage.
        * @param {string} workflowId The ID of the workflow to remove
        */
       removeWorkflow: (workflowId: string) => {
         unsubscribeFromWorkflowUpdates(workflowId);
         
         const { nodeStores, openWorkflows, currentWorkflowId } = get();

        const newOpenWorkflows = openWorkflows.filter(
          (w) => w.id !== workflowId
        );
        const newStores = { ...nodeStores };
        delete newStores[workflowId];

        const newCurrentId = determineNextWorkflowId(
          openWorkflows,
          workflowId,
          currentWorkflowId
        );

        set({
          nodeStores: newStores,
          openWorkflows: newOpenWorkflows,
          currentWorkflowId: newCurrentId,
          loadingStates: {}
        });

        storage.setOpenWorkflows(newOpenWorkflows.map(w => w.id));

        if (newCurrentId) {
          storage.setCurrentWorkflow(newCurrentId);
        } else {
          localStorage.removeItem(STORAGE_KEYS.CURRENT_WORKFLOW);
        }
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
      // Loading States for Workflows (deprecated)
      // ---------------------------------------------------------------------------------

      // Deprecated: always undefined; use React Query hooks for loading/error
      getLoadingState: (_workflowId: string) => undefined,

      // Fetches the workflow data by its ID, using QueryClient cache and adds the workflow store.
      fetchWorkflow: async (workflowId: string) => {
        // If already have a NodeStore, just set current and ensure query cache is populated.
        const existing = get().getWorkflow(workflowId);
        if (existing) {
          get().queryClient?.setQueryData(
            workflowQueryKey(workflowId),
            existing
          );
          get().setCurrentWorkflowId(workflowId);
          return existing;
        }

        // Check cache first
        const cached = get().queryClient?.getQueryData<Workflow>(
          workflowQueryKey(workflowId)
        );
        if (cached) {
          get().addWorkflow(cached);
          get().setCurrentWorkflowId(workflowId);
          return cached;
        }

        // Fetch and populate both cache and NodeStore
        try {
          const data = await fetchWorkflowById(workflowId);
          get().queryClient?.setQueryData(workflowQueryKey(workflowId), data);
          get().addWorkflow(data);
          get().setCurrentWorkflowId(data.id);
          return data;
        } catch (e) {
          console.error(
            `[WorkflowManager] fetchWorkflow error for ${workflowId}`,
            e
          );
        }
      },

      validateAllEdges: () => {
        // Edge validation functionality removed - will be implemented in separate branch
      }

      /**
       * Fetches workflow tools from the API.
       * @returns {Promise<void>}
       */
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

  useEffect(() => {
    // Restore workflows that were previously open from localStorage
    const openWorkflows = storage.getOpenWorkflows();
    openWorkflows.forEach((workflowId: string) => {
      store.getState().fetchWorkflow(workflowId);
    });
  }, [store]);

  return (
    <WorkflowManagerContext.Provider value={store}>
      {children}
    </WorkflowManagerContext.Provider>
  );
};
