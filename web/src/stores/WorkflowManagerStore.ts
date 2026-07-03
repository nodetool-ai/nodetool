// WorkflowManagerStore.ts
// -----------------------------------------------
// Zustand store for managing workflows in the app.
// This file contains only the store creation logic, separated from the
// React context to maintain Fast Refresh compatibility.
// -----------------------------------------------

import { create, StoreApi, UseBoundStore } from "zustand";
import { NodeStore, createNodeStore } from "./NodeStore";
import {
  Workflow,
  WorkflowAttributes,
  WorkflowList,
  WorkflowRequest
} from "./ApiTypes";
import { trpcClient } from "../trpc/client";
import { debounce, omit } from "../utils/lodashAlternatives";
import { createErrorMessage } from "../utils/errorHandling";
import { fetchLiveFalPricing } from "../utils/fetchLiveFalPricing";
import { fetchLiveKiePricing } from "../utils/fetchLiveKiePricing";
import useMetadataStore from "./MetadataStore";
import { QueryClient } from "@tanstack/react-query";
import {
  fetchWorkflowById,
  workflowQueryKey
} from "../serverState/useWorkflow";
import { subscribeToWorkflowUpdates, unsubscribeFromWorkflowUpdates, setGetNodeStore } from "./workflowUpdates";
import { disposeWorkflowRunnerStore, getWorkflowRunnerStore } from "./WorkflowRunner";
import useResultsStore from "./ResultsStore";
import useErrorStore from "./ErrorStore";
import useStatusStore from "./StatusStore";
import useExecutionTimeStore from "./ExecutionTimeStore";
import usePropertyValidationStore from "./PropertyValidationStore";
import useWorkflowRunsStore from "./WorkflowRunsStore";
import { useFavoriteWorkflowsStore } from "./FavoriteWorkflowsStore";
import { useWorkflowAssetStore } from "./WorkflowAssetStore";
import { useSubgraphTabsStore } from "./SubgraphTabsStore";
import { useCurrentWorkspaceStore } from "./CurrentWorkspaceStore";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

const isWorkflowNotFoundError = (err: unknown): boolean => {
  if (!isRecord(err)) return false;
  if (isRecord(err.data)) {
    if (err.data.code === "NOT_FOUND") return true;
    if (err.data.apiCode === "WORKFLOW_NOT_FOUND") return true;
  }
  if (typeof err.message === "string") {
    return /not found/i.test(err.message);
  }
  return false;
};

// -----------------------------------------------------------------
// HELPER FUNCTIONS
// -----------------------------------------------------------------

// -----------------------------------------------------------------
// LOCAL STORAGE UTILITIES
// -----------------------------------------------------------------

// Storage keys for persisting workflow state in localStorage.
const STORAGE_KEYS = {
  CURRENT_WORKFLOW: "currentWorkflowId",
  OPEN_WORKFLOWS: "openWorkflows"
} as const;

// localStorage utilities with debounced writes
const storage = {
  // Retrieve the current workflow ID from localStorage.
  getCurrentWorkflow: () => localStorage.getItem(STORAGE_KEYS.CURRENT_WORKFLOW),

  // Retrieve the list of open workflow IDs.
  getOpenWorkflows: (): string[] =>
    JSON.parse(localStorage.getItem(STORAGE_KEYS.OPEN_WORKFLOWS) || "[]") as string[],

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

// Export storage utility function for use in WorkflowManagerContext
export const getOpenWorkflowsFromStorage = (): string[] =>
  JSON.parse(localStorage.getItem(STORAGE_KEYS.OPEN_WORKFLOWS) || "[]") as string[];

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

export type WorkflowManagerState = {
  nodeStores: Record<string, NodeStore>;
  currentWorkflowId: string | null;
  openWorkflows: WorkflowAttributes[];
  queryClient: QueryClient;
  // Track notified autosave versions to prevent duplicate notifications
  notifiedAutosaveVersions: Record<string, Set<string>>;
  getWorkflow: (workflowId: string) => Workflow | undefined;
  addWorkflow: (workflow: Workflow) => void;
  removeWorkflow: (workflowId: string) => void;
  getNodeStore: (workflowId: string) => NodeStore | undefined;
  reorderWorkflows: (sourceIndex: number, targetIndex: number) => void;
  updateWorkflow: (workflow: WorkflowAttributes) => void;
  saveWorkflow: (workflow: Workflow) => Promise<void>;
  getCurrentWorkflow: () => Workflow | undefined;
  setCurrentWorkflowId: (workflowId: string) => void;
  fetchWorkflow: (
    workflowId: string,
    options?: { makeCurrent?: boolean }
  ) => Promise<Workflow | undefined>;
  newWorkflow: () => Workflow;
  createNew: () => Promise<Workflow>;
  create: (
    workflow: WorkflowRequest,
    fromExamplePackage?: string,
    fromExampleName?: string
  ) => Promise<Workflow>;
  load: (cursor?: string, limit?: number, columns?: string) => Promise<WorkflowList>;
  loadIDs: (workflowIds: string[]) => Promise<Workflow[]>;
  loadPublic: (cursor?: string) => Promise<WorkflowList>;
  loadTemplates: () => Promise<WorkflowList>;
  searchTemplates: (query: string) => Promise<WorkflowList>;
  copy: (originalWorkflow: Workflow) => Promise<Workflow>;
  delete: (workflow: Workflow) => Promise<void>;
  saveExample: (packageName: string) => Promise<Workflow>;
};

// Defines the Zustand store type for workflow management.
export type WorkflowManagerStore = UseBoundStore<
  StoreApi<WorkflowManagerState>
>;

/** Drop a restored workflow id when the server no longer has it. */
const pruneStaleWorkflowReference = (
  set: StoreApi<WorkflowManagerState>["setState"],
  workflowId: string
): void => {
  const previousOpenIds = storage.getOpenWorkflows();
  const openIds = previousOpenIds.filter((id) => id !== workflowId);
  if (openIds.length !== previousOpenIds.length) {
    storage.setOpenWorkflows.cancel();
    localStorage.setItem(
      STORAGE_KEYS.OPEN_WORKFLOWS,
      JSON.stringify(openIds)
    );
  }

  set((state) => {
    const filtered = state.openWorkflows.filter((w) => w.id !== workflowId);
    if (
      filtered.length === state.openWorkflows.length &&
      state.currentWorkflowId !== workflowId
    ) {
      return state;
    }

    const newCurrentId =
      state.currentWorkflowId === workflowId
        ? determineNextWorkflowId(
            state.openWorkflows,
            workflowId,
            state.currentWorkflowId
          )
        : state.currentWorkflowId;

    if (newCurrentId) {
      storage.setCurrentWorkflow(newCurrentId);
    } else {
      storage.setCurrentWorkflow.cancel();
      localStorage.removeItem(STORAGE_KEYS.CURRENT_WORKFLOW);
    }

    return {
      openWorkflows: filtered,
      currentWorkflowId: newCurrentId
    };
  });
};

// Per-workflow MetadataStore subscriptions waiting for metadata to load so
// live fal/kie pricing can be fetched. Tracked so removeWorkflow can release
// them if metadata never loads while the workflow is open.
const pricingMetadataUnsubs = new Map<string, Array<() => void>>();

const registerPricingUnsub = (
  workflowId: string,
  unsub: () => void
): void => {
  const list = pricingMetadataUnsubs.get(workflowId) ?? [];
  list.push(unsub);
  pricingMetadataUnsubs.set(workflowId, list);
};

const releasePricingUnsubs = (workflowId: string): void => {
  const list = pricingMetadataUnsubs.get(workflowId);
  if (list) {
    for (const unsub of list) {
      unsub();
    }
    pricingMetadataUnsubs.delete(workflowId);
  }
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
  const store = create<WorkflowManagerState>()((set, get) => {
    return {
      nodeStores: {},
      openWorkflows: [],
      notifiedAutosaveVersions: {},
      currentWorkflowId: storage.getCurrentWorkflow() || null,
      queryClient: queryClient,

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
        const lastUsedWorkspaceId =
          useCurrentWorkspaceStore.getState().lastUsedWorkspaceId;
        const data: Workflow = {
          id: crypto.randomUUID(),
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
          run_mode: "workflow",
          workspace_id: lastUsedWorkspaceId ?? null
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
          // Snapshot the node store's state references before the awaited
          // mutation. Every NodeStore mutation produces new `nodes`/`edges`/
          // `workflow` references, so reference equality after the await tells
          // us whether the user edited the graph while the save was in flight.
          const nodeStoreBefore = get().nodeStores[workflow.id];
          const stateBefore = nodeStoreBefore?.getState();

          let data: Workflow;
          try {
            const graph = workflow.graph ?? { nodes: [], edges: [] };
            data = (await trpcClient.workflows.update.mutate({
              id: workflow.id,
              name: workflow.name,
              access: workflow.access ?? "private",
              graph: graph as Parameters<typeof trpcClient.workflows.update.mutate>[0]["graph"],
              tool_name: workflow.tool_name,
              description: workflow.description,
              tags: workflow.tags,
              package_name: workflow.package_name,
              thumbnail: workflow.thumbnail,
              thumbnail_url: workflow.thumbnail_url,
              settings: workflow.settings as Record<string, unknown> | null | undefined,
              run_mode: workflow.run_mode,
              workspace_id: workflow.workspace_id,
              html_app: workflow.html_app
            })) as Workflow;
          } catch (err) {
            throw createErrorMessage(err, "Failed to save workflow");
          }

          // Version snapshot is best-effort — the main save already succeeded.
          try {
            await trpcClient.workflows.versions.create.mutate({
              id: workflow.id,
              name: workflow.name,
              description: `Manual save: ${new Date().toISOString()}`
            });
          } catch (err) {
            console.warn(
              "[saveWorkflow] Workflow saved but version snapshot failed:",
              err
            );
          }

          const persistedWorkflow: Workflow = {
            ...data,
            run_mode: workflow.run_mode ?? data.run_mode
          };

          if (window.api) {
            window.api.onUpdateWorkflow(persistedWorkflow);
          }

          set((state) => {
            const nodeStore = state.nodeStores[persistedWorkflow.id];
            if (nodeStore) {
              const current = nodeStore.getState();
              const editedDuringSave =
                nodeStore !== nodeStoreBefore ||
                !stateBefore ||
                current.nodes !== stateBefore.nodes ||
                current.edges !== stateBefore.edges ||
                current.workflow !== stateBefore.workflow;
              // Only mark the store clean (and adopt the server's workflow
              // attributes) when nothing changed during the save. If the user
              // edited meanwhile, keep the dirty flag and their attribute
              // edits — the next autosave persists them.
              if (!editedDuringSave) {
                nodeStore.setState({
                  workflow: persistedWorkflow
                });
                nodeStore.getState().setWorkflowDirty(false);
              }
            }

            const index = state.openWorkflows.findIndex((w) => w.id === persistedWorkflow.id);
            if (index === -1) return state;

            const newWorkflows = [...state.openWorkflows];
            newWorkflows[index] = omit(persistedWorkflow, ["graph"]);

            return {
              openWorkflows: newWorkflows
            };
          });

          get().queryClient?.invalidateQueries({ queryKey: ["workflows"] });
          get().queryClient?.invalidateQueries({
            queryKey: ["workflow", persistedWorkflow.id]
          });
          get().queryClient?.invalidateQueries({ queryKey: ["workflow-tools"] });
          get().queryClient?.invalidateQueries({
            queryKey: ["workflow", persistedWorkflow.id, "versions"]
          });
        },

       /**
        * Creates a new workflow in memory only.
        * Does not save to server until saveWorkflow() is explicitly called.
        * @returns {Promise<Workflow>} The created workflow
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
        let data: Workflow;
        try {
          const graph = workflow.graph ?? { nodes: [], edges: [] };
          data = (await trpcClient.workflows.create.mutate({
            name: workflow.name,
            access: workflow.access ?? "private",
            graph: graph as Parameters<typeof trpcClient.workflows.create.mutate>[0]["graph"],
            tool_name: workflow.tool_name,
            description: workflow.description,
            tags: workflow.tags,
            package_name: workflow.package_name,
            thumbnail: workflow.thumbnail,
            thumbnail_url: workflow.thumbnail_url,
            settings: workflow.settings as Record<string, unknown> | null | undefined,
            run_mode: workflow.run_mode,
            workspace_id: workflow.workspace_id,
            html_app: workflow.html_app,
            from_example_package: fromExamplePackage,
            from_example_name: fromExampleName
          })) as Workflow;
        } catch (err) {
          throw createErrorMessage(err, "Failed to create workflow");
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
       * @param {string} [columns] Optional comma-separated list of columns to fetch
       * @returns {Promise<WorkflowList>} The loaded workflows data
       * @throws {Error} If the API call fails
       */
      load: async (cursor?: string, limit?: number, _columns?: string) => {
        try {
          const data = await trpcClient.workflows.list.query({
            limit: limit ?? 100,
            cursor: cursor || undefined
          });
          return data as WorkflowList;
        } catch (err) {
          throw createErrorMessage(err, "Failed to load workflows");
        }
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
        return workflows.filter((w): w is Workflow => w !== undefined);
      },

      // Loads public workflows available from the API.
      loadPublic: async (_cursor?: string) => {
        const data = await trpcClient.workflows.public.list.query({ limit: 100 });
        return data as unknown as WorkflowList;
      },

      // Loads template workflows.
      loadTemplates: async () => {
        try {
          const data = await trpcClient.workflows.examples.query({});
          return data as unknown as WorkflowList;
        } catch (err) {
          throw createErrorMessage(err, "Failed to load templates");
        }
      },

      // Searches template workflows using the backend search API.
      searchTemplates: async (query: string) => {
        try {
          const data = await trpcClient.workflows.examples.query({ query });
          return data as unknown as WorkflowList;
        } catch (err) {
          console.error("[WorkflowManagerStore] searchTemplates error:", err);
          throw createErrorMessage(err, "Failed to search templates");
        }
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
          id: crypto.randomUUID(),
          name: workflow.name,
          description: workflow.description,
          thumbnail: workflow.thumbnail,
          thumbnail_url: workflow.thumbnail_url,
          tags: workflow.tags,
          access: "private",
          graph: structuredClone(workflow.graph), // Deep copy graph
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
        try {
          await trpcClient.workflows.delete.mutate({ id: workflow.id });
        } catch (err) {
          throw createErrorMessage(err, "Failed to delete workflow");
        }
        if (window.api) {
          window.api.onDeleteWorkflow(workflow);
        }

        // Drop the favorite entry so the deleted workflow doesn't keep
        // appearing in the favorites UI as a stale id.
        useFavoriteWorkflowsStore.getState().removeFavorite(workflow.id);

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
        const data = await trpcClient.workflows.update.mutate({
          id: workflow.id,
          name: workflow.name,
          description: workflow.description,
          tags: workflow.tags,
          package_name: packageName,
          path: workflow.path,
          access: "public",
          graph: workflow.graph as never
        });

        get().queryClient?.invalidateQueries({ queryKey: ["workflows"] });
        get().queryClient?.invalidateQueries({ queryKey: ["templates"] });
        get().queryClient?.invalidateQueries({
          queryKey: ["workflow", workflow.id]
        });
        get().queryClient?.invalidateQueries({ queryKey: ["workflow-tools"] });

        return data as unknown as Workflow;
      },

      // ---------------------------------------------------------------------------------
      // Current Workflow (loading state handled via React Query)
      // ---------------------------------------------------------------------------------

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
        subscribeToWorkflowUpdates(workflow.id, workflow, runnerStore, get().getNodeStore);

        // Refresh live FAL pricing for the FAL nodes in this workflow.
        // Subscribes to MetadataStore so we still fire once metadata loads
        // (workflows restored from localStorage open before metadata fetch).
        const falNodeTypes = [
          ...new Set(
            (workflow.graph?.nodes ?? [])
              .map((n) => n.type)
              .filter((t): t is string => typeof t === "string")
          )
        ].filter((t) => t.startsWith("fal."));

        if (falNodeTypes.length > 0) {
          // Returns true once metadata has loaded (the map is populated in one
          // bulk setMetadata), whether or not any pricing was found — so the
          // fallback subscription below always terminates after one real
          // attempt instead of living forever when pricing never appears.
          const doFetch = (): boolean => {
            const meta = useMetadataStore.getState().metadata;
            if (Object.keys(meta).length === 0) return false;
            const endpointIds = falNodeTypes
              .map((t) => meta[t]?.fal_unit_pricing?.endpoint_id)
              .filter((id): id is string => Boolean(id));
            if (endpointIds.length > 0) {
              fetchLiveFalPricing(meta, endpointIds)
                .then((updatedPricing) => {
                  if (!updatedPricing) return;
                  // Re-read the live map — metadata may have been reloaded
                  // while the fetch was in flight; merge the fresh pricing
                  // into cloned entries so per-node selectors re-render.
                  const store = useMetadataStore.getState();
                  const merged = { ...store.metadata };
                  let changed = false;
                  for (const [nodeType, pricing] of Object.entries(
                    updatedPricing
                  )) {
                    const base = merged[nodeType];
                    if (!base) continue;
                    merged[nodeType] = { ...base, fal_unit_pricing: pricing };
                    changed = true;
                  }
                  if (changed) store.setMetadata(merged);
                })
                .catch(() => {
                  // surfaced as console.error inside fetchLiveFalPricing
                });
            }
            return true;
          };

          if (!doFetch()) {
            const unsub = useMetadataStore.subscribe(() => {
              if (doFetch()) unsub();
            });
            registerPricingUnsub(workflow.id, unsub);
          }
        }

        const kieNodeTypes = [
          ...new Set(
            (workflow.graph?.nodes ?? []).map((n) => n.type)
          ),
        ].filter((t) => t.startsWith("kie."));

        if (kieNodeTypes.length > 0) {
          // Same termination contract as the FAL block above: true once
          // metadata is loaded, regardless of whether pricing was found.
          const doFetchKie = (): boolean => {
            const meta = useMetadataStore.getState().metadata;
            if (Object.keys(meta).length === 0) {
              return false;
            }
            const modelIds = kieNodeTypes
              .map((t) => meta[t]?.kie_unit_pricing?.model_id)
              .filter((id): id is string => Boolean(id));
            if (modelIds.length > 0) {
              fetchLiveKiePricing(meta, modelIds)
                .then((updatedPricing) => {
                  if (!updatedPricing) return;
                  const store = useMetadataStore.getState();
                  const merged = { ...store.metadata };
                  let changed = false;
                  for (const [nodeType, pricing] of Object.entries(
                    updatedPricing
                  )) {
                    const base = merged[nodeType];
                    if (!base) continue;
                    merged[nodeType] = { ...base, kie_unit_pricing: pricing };
                    changed = true;
                  }
                  if (changed) store.setMetadata(merged);
                })
                .catch(() => {
                  // surfaced as console.error inside fetchLiveKiePricing
                });
            }
            return true;
          };

          if (!doFetchKie()) {
            const unsub = useMetadataStore.subscribe(() => {
              if (doFetchKie()) unsub();
            });
            registerPricingUnsub(workflow.id, unsub);
          }
        }
      },

       /**
        * Removes a workflow from state and localStorage.
        * @param {string} workflowId The ID of the workflow to remove
        */
       removeWorkflow: (workflowId: string) => {
         unsubscribeFromWorkflowUpdates(workflowId);
         releasePricingUnsubs(workflowId);

         const { nodeStores, openWorkflows, currentWorkflowId, notifiedAutosaveVersions } = get();

         // Tear down the per-workflow NodeStore (releases its metadata
         // subscription) and the WorkflowRunner store before we drop the
         // reference, otherwise both leak forever.
         const departingNodeStore = nodeStores[workflowId];
         if (departingNodeStore) {
           try {
             departingNodeStore.getState().cleanup();
           } catch (err) {
             console.warn(
               `[WorkflowManager] NodeStore cleanup failed for ${workflowId}`,
               err
             );
           }
         }
         disposeWorkflowRunnerStore(workflowId);

         // Drop per-workflow keyed entries from singleton stores so they
         // don't accumulate forever in long-lived sessions.
         useResultsStore.getState().clearResults(workflowId);
         useResultsStore.getState().clearOutputResults(workflowId);
         useResultsStore.getState().clearProgress(workflowId);
         useResultsStore.getState().clearChunks(workflowId);
         useResultsStore.getState().clearTasks(workflowId);
         useResultsStore.getState().clearToolCalls(workflowId);
         useResultsStore.getState().clearPlanningUpdates(workflowId);
         useResultsStore.getState().clearEdges(workflowId);
         useErrorStore.getState().clearErrors(workflowId);
         useStatusStore.getState().clearStatuses(workflowId);
         useExecutionTimeStore.getState().clearTimings(workflowId);
         usePropertyValidationStore.getState().clearWorkflow(workflowId);
         useWorkflowRunsStore.getState().clearWorkflow(workflowId);
         useWorkflowAssetStore.getState().clearWorkflowAssets(workflowId);
         // Close the workflow's subgraph tabs (cleans up their NodeStores).
         useSubgraphTabsStore.getState().closeForWorkflow(workflowId);

         const newOpenWorkflows = openWorkflows.filter(
           (w) => w.id !== workflowId
         );
         const newStores = { ...nodeStores };
         delete newStores[workflowId];
         // Subgraph tab stores are registered under `${workflowId}:${nodeId}`.
         for (const key of Object.keys(newStores)) {
           if (key.startsWith(`${workflowId}:`)) {
             delete newStores[key];
           }
         }

         const newNotified = { ...notifiedAutosaveVersions };
         delete newNotified[workflowId];

        const newCurrentId = determineNextWorkflowId(
          openWorkflows,
          workflowId,
          currentWorkflowId
        );

        set({
          nodeStores: newStores,
          openWorkflows: newOpenWorkflows,
          currentWorkflowId: newCurrentId,
          notifiedAutosaveVersions: newNotified
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
          // Reorder the openWorkflows array, then rebuild the nodeStores
          // map in the same order so consumers iterating either source see
          // a consistent ordering.
          const reordered = [...state.openWorkflows];
          if (
            sourceIndex < 0 ||
            sourceIndex >= reordered.length ||
            targetIndex < 0 ||
            targetIndex >= reordered.length
          ) {
            return state;
          }
          const [moved] = reordered.splice(sourceIndex, 1);
          reordered.splice(targetIndex, 0, moved);

          const newStores: Record<string, NodeStore> = {};
          for (const wf of reordered) {
            const store = state.nodeStores[wf.id];
            if (store) {
              newStores[wf.id] = store;
            }
          }

          return {
            openWorkflows: reordered,
            nodeStores: newStores
          };
        });
      },

      /**
       * Updates a workflow's properties and refreshes the list.
       * @param {WorkflowAttributes} workflow The workflow attributes to update
       */
      updateWorkflow: (workflow: WorkflowAttributes) => {
        set((state) => {
          const index = state.openWorkflows.findIndex((w) => w.id === workflow.id);
          if (index === -1) return state;

          const merged = { ...state.openWorkflows[index], ...workflow };
          const newWorkflows = [...state.openWorkflows];
          newWorkflows[index] = merged;

          // Keep the underlying NodeStore's `workflow` attribute in sync —
          // otherwise the store and openWorkflows drift apart for fields
          // like name/description/tags.
          const nodeStore = state.nodeStores[workflow.id];
          if (nodeStore) {
            const current = nodeStore.getState().workflow;
            nodeStore.setState({ workflow: { ...current, ...workflow } });
          }

          return { openWorkflows: newWorkflows };
        });
      },

      // Fetches the workflow data by its ID, using QueryClient cache and adds the workflow store.
      // Pass { makeCurrent: false } for background loads (startup tab restore,
      // sub-workflow lookups) so parallel fetches can't race to scramble the
      // active tab.
      fetchWorkflow: async (
        workflowId: string,
        options?: { makeCurrent?: boolean }
      ) => {
        const makeCurrent = options?.makeCurrent ?? true;
        // Assets are non-critical to opening the workflow: log and continue
        // instead of misreporting an asset failure as a workflow-load failure.
        const loadAssetsNonFatal = async (id: string): Promise<void> => {
          try {
            await useWorkflowAssetStore.getState().loadWorkflowAssets(id);
          } catch (err) {
            console.warn(
              `[WorkflowManager] Failed to load assets for workflow ${id}`,
              err
            );
          }
        };

        // If already have a NodeStore, just set current and ensure query cache is populated.
        const existing = get().getWorkflow(workflowId);
        if (existing) {
          get().queryClient?.setQueryData(
            workflowQueryKey(workflowId),
            existing
          );
          if (makeCurrent) {
            get().setCurrentWorkflowId(workflowId);
          }
          return existing;
        }

        // Check cache first
        const cached = get().queryClient?.getQueryData<Workflow>(
          workflowQueryKey(workflowId)
        );
        if (cached) {
          get().addWorkflow(cached);
          if (makeCurrent) {
            get().setCurrentWorkflowId(workflowId);
          }
          await loadAssetsNonFatal(workflowId);
          return cached;
        }

        // Fetch using queryClient.fetchQuery for automatic deduplication of in-flight requests.
        // retry: false — NOT_FOUND is permanent; the caller falls back to createNew.
        try {
          const data = await get().queryClient?.fetchQuery({
            queryKey: workflowQueryKey(workflowId),
            queryFn: () => fetchWorkflowById(workflowId),
            staleTime: 60 * 1000,
            retry: false
          });
          if (!data) {
            return undefined;
          }
          get().addWorkflow(data);
          if (makeCurrent) {
            get().setCurrentWorkflowId(data.id);
          }
          await loadAssetsNonFatal(data.id);
          return data;
        } catch (e: unknown) {
          if (isWorkflowNotFoundError(e)) {
            pruneStaleWorkflowReference(set, workflowId);
          } else {
            console.error(
              `[WorkflowManager] fetchWorkflow error for ${workflowId}`,
              e
            );
          }
          return undefined;
        }
      }
    };
  });

  // Set the global getNodeStore getter so other modules can access node stores
  setGetNodeStore((workflowId: string) => store.getState().getNodeStore(workflowId));

  return store;
};
