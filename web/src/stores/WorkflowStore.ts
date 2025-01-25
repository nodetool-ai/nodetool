import { create } from "zustand";
import { client } from "./ApiClient";
import { Workflow, WorkflowList, WorkflowRequest } from "./ApiTypes";
import { QueryClient, QueryKey } from "@tanstack/react-query";
import { uuidv4 } from "./uuidv4";
import { createErrorMessage } from "../utils/errorHandling";

export interface WorkflowStore {
  shouldFitToScreen: boolean;
  setShouldFitToScreen: (shouldFitToScreen: boolean) => void;
  invalidateQueries: (queryKey: QueryKey) => void;
  queryClient: QueryClient | null;
  setQueryClient: (queryClient: QueryClient) => void;
  newWorkflow: () => Workflow;
  add: (workflow: Workflow) => void;
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
  saveExample: (id: string, workflow: Workflow) => Promise<Workflow>;
}

export const useWorkflowStore = create<WorkflowStore>()((set, get) => ({
  shouldFitToScreen: false,
  queryClient: null,

  setShouldFitToScreen: (shouldFitToScreen: boolean) => {
    set({ shouldFitToScreen });
  },

  setQueryClient: (queryClient: QueryClient) => {
    set({ queryClient });
  },

  invalidateQueries: (queryKey: QueryKey) => {
    get().queryClient?.invalidateQueries({ queryKey: queryKey });
  },

  add: (workflow: Workflow) => {
    const queryClient = get().queryClient;
    if (!queryClient) return;

    queryClient.setQueryData(["workflows", workflow.id], workflow);
    get().invalidateQueries(["workflows"]);
  },

  get: async (id: string) => {
    const cachedWorkflow = get().queryClient?.getQueryData([
      "workflows",
      id
    ]) as Workflow | undefined;

    // If we have a cached workflow, check if it's recent (within 15 minutes)
    if (cachedWorkflow) {
      const lastUpdateTime = new Date(cachedWorkflow.updated_at);
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

      if (lastUpdateTime > fifteenMinutesAgo) {
        return cachedWorkflow;
      }
    }

    // If older than 15 minutes, fetch from server
    const { data, error } = await client.GET("/api/workflows/{id}", {
      params: { path: { id } }
    });

    // Return undefined for 404 errors, throw other errors
    if (error) {
      return cachedWorkflow;
    }

    get().add(data);
    return data;
  },

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
    get().invalidateQueries(["workflows"]);
    return data;
  },

  load: async (cursor?: string, limit?: number) => {
    cursor = cursor || "";
    const { data, error } = await client.GET("/api/workflows/", {
      params: { query: { cursor, limit } }
    });
    if (error) {
      throw createErrorMessage(error, "Failed to load workflows");
    }
    for (const workflow of data.workflows) {
      get().add(workflow);
    }
    return data;
  },

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
    get().add(data);
    get().invalidateQueries(["workflows"]);
    return data;
  },

  copy: async (originalWorkflow: Workflow) => {
    const workflow = await get().get(originalWorkflow.id);
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
    get().invalidateQueries(["workflows"]);
    return copiedWorkflow;
  },

  delete: async (id: string) => {
    const { error } = await client.DELETE("/api/workflows/{id}", {
      params: { path: { id } }
    });
    if (error) {
      throw createErrorMessage(error, "Failed to delete workflow");
    }
    get().invalidateQueries(["workflows"]);
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

    get().invalidateQueries(["workflows", "examples"]);
    return data;
  }
}));
