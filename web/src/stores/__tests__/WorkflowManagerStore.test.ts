import { WorkflowManagerStore, createWorkflowManagerStore } from "../WorkflowManagerStore";
import { Workflow, WorkflowAttributes } from "../ApiTypes";
import { QueryClient } from "@tanstack/react-query";

jest.mock("react", () => ({
  ...jest.requireActual("react"),
  createContext: jest.fn(() => ({ Provider: ({ children }: any) => children })),
}));

describe("WorkflowManagerStore", () => {
  let store: WorkflowManagerStore;
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
        },
      },
    });
    store = createWorkflowManagerStore(queryClient);
  });

  afterEach(() => {
    store.destroy();
    queryClient.clear();
  });

  describe("initial state", () => {
    it("initializes with empty nodeStores", () => {
      expect(store.getState().nodeStores).toEqual({});
    });

    it("initializes with empty openWorkflows", () => {
      expect(store.getState().openWorkflows).toEqual([]);
    });

    it("initializes with null currentWorkflowId", () => {
      expect(store.getState().currentWorkflowId).toBeNull();
    });

    it("initializes with provided queryClient", () => {
      expect(store.getState().queryClient).toBe(queryClient);
    });

    it("initializes with null systemStats", () => {
      expect(store.getState().systemStats).toBeNull();
    });
  });

  describe("getSystemStats", () => {
    it("returns null when no system stats set", () => {
      expect(store.getState().getSystemStats()).toBeNull();
    });

    it("returns system stats when set", () => {
      const mockStats = { cpu_usage: 50, memory_usage: 60 };
      store.getState().setSystemStats(mockStats as any);

      expect(store.getState().getSystemStats()).toEqual(mockStats);
    });
  });

  describe("newWorkflow", () => {
    it("creates a new workflow with default values", () => {
      const result = store.getState().newWorkflow();

      expect(result.id).toBeDefined();
      expect(result.name).toBe("New Workflow");
      expect(result.description).toBe("");
      expect(result.access).toBe("private");
      expect(result.graph.nodes).toEqual([]);
      expect(result.graph.edges).toEqual([]);
      expect(result.settings.hide_ui).toBe(false);
      expect(result.run_mode).toBe("workflow");
    });

    it("creates workflow with unique ID", () => {
      const workflow1 = store.getState().newWorkflow();
      const workflow2 = store.getState().newWorkflow();

      expect(workflow1.id).not.toBe(workflow2.id);
    });

    it("creates workflow with valid ISO dates", () => {
      const result = store.getState().newWorkflow();

      expect(result.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
      expect(result.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    });
  });

  describe("getCurrentWorkflow", () => {
    it("returns undefined when no workflow is current", () => {
      expect(store.getState().getCurrentWorkflow()).toBeUndefined();
    });

    it("returns undefined for non-existent workflow", () => {
      store.getState().setCurrentWorkflowId("non-existent");
      expect(store.getState().getCurrentWorkflow()).toBeUndefined();
    });
  });

  describe("getWorkflow", () => {
    it("returns undefined for non-existent workflow", () => {
      expect(store.getState().getWorkflow("non-existent")).toBeUndefined();
    });

    it("returns workflow from node store", () => {
      const newWorkflow = store.getState().newWorkflow();
      store.getState().addWorkflow(newWorkflow);

      const result = store.getState().getWorkflow(newWorkflow.id);

      expect(result).toBeDefined();
      expect(result?.id).toBe(newWorkflow.id);
    });
  });

  describe("setCurrentWorkflowId", () => {
    it("sets the current workflow ID", () => {
      store.getState().setCurrentWorkflowId("test-workflow");

      expect(store.getState().currentWorkflowId).toBe("test-workflow");
    });
  });

  describe("addWorkflow", () => {
    it("adds a workflow to the store", () => {
      const workflow = store.getState().newWorkflow();
      store.getState().addWorkflow(workflow);

      expect(store.getState().nodeStores[workflow.id]).toBeDefined();
      expect(store.getState().openWorkflows).toHaveLength(1);
    });

    it("does not add duplicate workflow", () => {
      const workflow = store.getState().newWorkflow();
      store.getState().addWorkflow(workflow);
      store.getState().addWorkflow(workflow);

      expect(store.getState().openWorkflows).toHaveLength(1);
    });

    it("adds workflow without graph to openWorkflows", () => {
      const workflow = store.getState().newWorkflow();
      store.getState().addWorkflow(workflow);

      const openWorkflow = store.getState().openWorkflows[0];
      expect(openWorkflow.id).toBe(workflow.id);
      expect(openWorkflow.name).toBe(workflow.name);
      expect((openWorkflow as any).graph).toBeUndefined();
    });

    it("creates node store for the workflow", () => {
      const workflow = store.getState().newWorkflow();
      store.getState().addWorkflow(workflow);

      const nodeStore = store.getState().nodeStores[workflow.id];
      expect(nodeStore).toBeDefined();
      expect(nodeStore.getState().workflow.id).toBe(workflow.id);
    });
  });

  describe("removeWorkflow", () => {
    it("removes workflow from store", () => {
      const workflow = store.getState().newWorkflow();
      store.getState().addWorkflow(workflow);
      store.getState().removeWorkflow(workflow.id);

      expect(store.getState().nodeStores[workflow.id]).toBeUndefined();
      expect(store.getState().openWorkflows).toHaveLength(0);
    });

    it("clears currentWorkflowId when removing current workflow", () => {
      const workflow = store.getState().newWorkflow();
      store.getState().addWorkflow(workflow);
      store.getState().setCurrentWorkflowId(workflow.id);

      store.getState().removeWorkflow(workflow.id);

      expect(store.getState().currentWorkflowId).toBeNull();
    });

    it("switches to next workflow when removing current", () => {
      const workflow1 = store.getState().newWorkflow();
      const workflow2 = store.getState().newWorkflow();
      store.getState().addWorkflow(workflow1);
      store.getState().addWorkflow(workflow2);
      store.getState().setCurrentWorkflowId(workflow1.id);

      store.getState().removeWorkflow(workflow1.id);

      expect(store.getState().currentWorkflowId).toBe(workflow2.id);
    });
  });

  describe("updateWorkflow", () => {
    it("updates workflow in openWorkflows", () => {
      const workflow = store.getState().newWorkflow();
      store.getState().addWorkflow(workflow);

      store.getState().updateWorkflow({
        id: workflow.id,
        name: "Updated Name",
        access: "private"
      });

      const updated = store.getState().openWorkflows[0];
      expect(updated.name).toBe("Updated Name");
    });

    it("preserves other workflow properties", () => {
      const workflow = store.getState().newWorkflow();
      store.getState().addWorkflow(workflow);

      store.getState().updateWorkflow({
        id: workflow.id,
        name: "Updated Name",
        access: "private"
      });

      const updated = store.getState().openWorkflows[0];
      expect(updated.id).toBe(workflow.id);
      expect(updated.description).toBe(workflow.description);
    });
  });

  describe("reorderWorkflows", () => {
    it("reorders nodeStores and openWorkflows", () => {
      const workflow1 = store.getState().newWorkflow();
      const workflow2 = store.getState().newWorkflow();
      const workflow3 = store.getState().newWorkflow();
      store.getState().addWorkflow(workflow1);
      store.getState().addWorkflow(workflow2);
      store.getState().addWorkflow(workflow3);

      store.getState().reorderWorkflows(0, 2);

      const newOpenWorkflows = store.getState().openWorkflows;

      expect(newOpenWorkflows[0].id).toBe(workflow2.id);
      expect(newOpenWorkflows[1].id).toBe(workflow3.id);
      expect(newOpenWorkflows[2].id).toBe(workflow1.id);
    });
  });

  describe("getNodeStore", () => {
    it("returns undefined for non-existent workflow", () => {
      expect(store.getState().getNodeStore("non-existent")).toBeUndefined();
    });

    it("returns node store for existing workflow", () => {
      const workflow = store.getState().newWorkflow();
      store.getState().addWorkflow(workflow);

      const nodeStore = store.getState().getNodeStore(workflow.id);

      expect(nodeStore).toBeDefined();
      expect(nodeStore?.getState().workflow.id).toBe(workflow.id);
    });
  });

  describe("load", () => {
    it("loads workflows with pagination", async () => {
      const result = await store.getState().load("", 10);

      expect(result).toHaveProperty("workflows");
      expect(result).toHaveProperty("next_cursor");
    });
  });

  describe("loadPublic", () => {
    it("loads public workflows", async () => {
      const result = await store.getState().loadPublic();

      expect(result).toHaveProperty("workflows");
    });
  });

  describe("loadTemplates", () => {
    it("loads template workflows", async () => {
      const result = await store.getState().loadTemplates();

      expect(result).toHaveProperty("workflows");
    });
  });

  describe("searchTemplates", () => {
    it("searches template workflows", async () => {
      const result = await store.getState().searchTemplates("test");

      expect(result).toHaveProperty("workflows");
    });
  });

  describe("getCurrentLoadingState", () => {
    it("returns undefined (deprecated)", () => {
      expect(store.getState().getCurrentLoadingState()).toBeUndefined();
    });
  });

  describe("getLoadingState", () => {
    it("returns undefined (deprecated)", () => {
      expect(store.getState().getLoadingState("any")).toBeUndefined();
    });
  });

  describe("validateAllEdges", () => {
    it("does not throw", () => {
      expect(() => store.getState().validateAllEdges()).not.toThrow();
    });
  });
});
