import { create } from "zustand";
import { persist } from "zustand/middleware";
import { client } from "./ApiClient";
import { Workflow, WorkflowList, WorkflowRequest } from "./ApiTypes";
import { QueryClient, QueryKey } from "@tanstack/react-query";
import { uuidv4 } from "./uuidv4";

export interface WorkflowStore {
  shouldFitToScreen: boolean;
  unsavedWorkflows: { [id: string]: Workflow };
  isWorkflowUnsaved: (id: string) => boolean;
  addUnsavedWorkflow: (workflow: Workflow) => void;
  removeUnsavedWorkflow: (id: string) => void;
  setShouldFitToScreen: (shouldFitToScreen: boolean) => void;
  invalidateQueries: (queryKey: QueryKey) => void;
  queryClient: QueryClient | null;
  setQueryClient: (queryClient: QueryClient) => void;
  newWorkflow: () => Workflow;
  add: (workflow: Workflow) => void;
  getFromCache: (id: string) => Workflow | undefined;
  create: (workflow: WorkflowRequest) => Promise<Workflow>;
  createNew: () => Promise<Workflow>;
  load: (cursor?: string, limit?: number) => Promise<WorkflowList>;
  loadIDs: (ids: string[]) => Promise<Workflow[]>;
  loadPublic: (cursor?: string) => Promise<WorkflowList>;
  loadExamples: () => Promise<WorkflowList>;
  get: (id: string) => Promise<Workflow | undefined>;
  copy: (workflow: Workflow) => Promise<Workflow>;
  update: (workflow: Workflow) => Promise<Workflow>;
  delete: (id: string) => Promise<void>;
}

export const useWorkflowStore = create<WorkflowStore>()(
  persist(
    (set, get) => ({
      shouldFitToScreen: false,
      unsavedWorkflows: {},

      /**
       * Adds an unsaved workflow to the store.
       * @param workflow - The workflow to be added.
       */
      addUnsavedWorkflow: (workflow: Workflow) => {
        const unsavedWorkflows = { ...get().unsavedWorkflows };
        unsavedWorkflows[workflow.id] = workflow;
        set({ unsavedWorkflows });
      },

      /**
       * Removes an unsaved workflow from the store.
       * @param id - The ID of the workflow to remove.
       */
      removeUnsavedWorkflow: (id: string) => {
        const unsavedWorkflows = { ...get().unsavedWorkflows };
        delete unsavedWorkflows[id];
        set({ unsavedWorkflows });
      },

      /**
       * Checks if a workflow is unsaved.
       * @param id - The ID of the workflow to check.
       * @returns True if the workflow is unsaved, false otherwise.
       */
      isWorkflowUnsaved: (id: string) => {
        return Object.keys(get().unsavedWorkflows).includes(id);
      },

      /**
       * Sets whether the graph should fit to the screen.
       * @param shouldFitToScreen - Boolean indicating if the graph should fit to screen.
       */
      setShouldFitToScreen: (shouldFitToScreen: boolean) => {
        set({ shouldFitToScreen });
      },

      queryClient: null,

      /**
       * Sets the React Query client to allow changing/clearing the cache.
       * @param queryClient - The QueryClient instance to be set.
       */
      setQueryClient: (queryClient: QueryClient) => {
        set({ queryClient });
      },

      /**
       * Invalidates the cache for a given query.
       * @param queryKey - The key of the query to invalidate.
       */
      invalidateQueries: (queryKey: QueryKey) => {
        get().queryClient?.invalidateQueries({ queryKey: queryKey });
      },

      /**
       * Adds a workflow to the cache, prioritizing the most recent version.
       * @param workflow - The workflow to be added.
       */
      add: (workflow: Workflow) => {
        const unsavedWorkflow = get().unsavedWorkflows[workflow.id];
        if (
          unsavedWorkflow &&
          new Date(unsavedWorkflow.updated_at) > new Date(workflow.updated_at)
        ) {
          // Use the unsaved version if it's more recent
          get().queryClient?.setQueryData(
            ["workflows", workflow.id],
            unsavedWorkflow
          );
        } else {
          get().queryClient?.setQueryData(["workflows", workflow.id], workflow);
        }
      },

      /**
       * Retrieves a workflow from the cache, prioritizing unsaved versions.
       * @param id - The ID of the workflow to retrieve.
       * @returns The workflow if found, undefined otherwise.
       */
      getFromCache: (id: string) => {
        const unsavedWorkflow = get().unsavedWorkflows[id];
        const cachedWorkflow = get().queryClient?.getQueryData([
          "workflows",
          id
        ]) as Workflow | undefined;

        if (unsavedWorkflow && cachedWorkflow) {
          return new Date(unsavedWorkflow.updated_at) >
            new Date(cachedWorkflow.updated_at)
            ? unsavedWorkflow
            : cachedWorkflow;
        }

        return unsavedWorkflow || cachedWorkflow;
      },

      /**
       * Creates a new workflow object with default values.
       * @returns A new Workflow object.
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
          }
        };
        return data;
      },

      /**
       * Creates a new workflow on the server using default values.
       * @returns A promise that resolves to the created Workflow.
       */
      createNew: async () => {
        return await get().create(get().newWorkflow());
      },

      /**
       * Creates a workflow on the server.
       * @param workflow - The workflow to be created.
       * @returns A promise that resolves to the created Workflow.
       * @throws Will throw an error if the server request fails.
       */
      create: async (workflow: WorkflowRequest) => {
        const { data, error } = await client.POST("/api/workflows/", {
          body: workflow
        });
        if (error) {
          throw error;
        }
        get().invalidateQueries(["workflows"]);
        return data;
      },

      /**
       * Loads a list of workflows from the server.
       * @param cursor - Optional cursor for pagination.
       * @param limit - Optional limit for the number of workflows to retrieve.
       * @returns A promise that resolves to a WorkflowList.
       * @throws Will throw an error if the server request fails.
       */
      load: async (cursor?: string, limit?: number) => {
        cursor = cursor || "";
        const { data, error } = await client.GET("/api/workflows/", {
          params: { query: { cursor, limit } }
        });
        if (error) {
          throw error;
        }
        for (const workflow of data.workflows) {
          get().add(workflow);
        }
        return data;
      },

      /**
       * Loads workflows with specific IDs from the server.
       * @param ids - An array of workflow IDs to load.
       * @returns A promise that resolves to an array of Workflows.
       */
      loadIDs: async (workflowIds: string[]) => {
        const getWorkflow = get().get;
        const promises = workflowIds.map((id) => getWorkflow(id));
        const workflows = await Promise.all(promises);
        for (const workflow of workflows) {
          if (workflow) {
            get().add(workflow);
          }
        }
        return workflows.filter((w) => w !== undefined) as Workflow[];
      },

      /**
       * Loads a list of public workflows from the server.
       * @param cursor - Optional cursor for pagination.
       * @returns A promise that resolves to a WorkflowList.
       * @throws Will throw an error if the server request fails.
       */
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

      /**
       * Loads example workflows from the server.
       * @returns A promise that resolves to a WorkflowList.
       * @throws Will throw an error if the server request fails.
       */
      loadExamples: async () => {
        const { data, error } = await client.GET("/api/workflows/examples", {});
        if (error) {
          throw error;
        }
        return data;
      },

      /**
       * Retrieves a workflow by ID, prioritizing unsaved versions.
       * @param id - The ID of the workflow to retrieve.
       * @returns A promise that resolves to the Workflow or undefined if not found.
       * @throws Will throw an error if the server request fails.
       */
      get: async (id: string) => {
        const unsavedWorkflow = get().unsavedWorkflows[id];
        if (unsavedWorkflow) {
          return unsavedWorkflow;
        }

        const { data, error } = await client.GET("/api/workflows/{id}", {
          params: { path: { id } }
        });
        if (error) {
          throw error;
        }
        return data;
      },

      /**
       * Updates a workflow on the server.
       * @param workflow - The workflow to be updated.
       * @returns A promise that resolves to the updated Workflow.
       * @throws Will throw an error if the server request fails or if the workflow ID is empty.
       */
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
          throw error;
        }
        get().add(data);
        get().removeUnsavedWorkflow(workflow.id);
        return data;
      },

      /**
       * Creates a copy of a workflow.
       * @param workflow - The workflow to be copied.
       * @returns A promise that resolves to the newly created Workflow.
       */
      copy: async (workflow: Workflow) => {
        const newWorkflow = {
          id: uuidv4(),
          name: workflow.name,
          description: workflow.description,
          thumbnail: workflow.thumbnail,
          access: "private",
          graph: workflow.graph,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        get().addUnsavedWorkflow(newWorkflow);
        return newWorkflow;
      },

      /**
       * Deletes a workflow from the server and local storage.
       * @param id - The ID of the workflow to delete.
       * @returns A promise that resolves when the workflow is deleted.
       * @throws Will throw an error if the server request fails.
       */
      delete: async (id: string) => {
        const { error } = await client.DELETE("/api/workflows/{id}", {
          params: { path: { id } }
        });
        if (error) {
          throw error;
        }
        get().invalidateQueries(["workflows"]);
        get().removeUnsavedWorkflow(id);
      }
    }),
    {
      name: "workflow-storage",
      partialize: (state) => ({ unsavedWorkflows: state.unsavedWorkflows })
    }
  )
);
