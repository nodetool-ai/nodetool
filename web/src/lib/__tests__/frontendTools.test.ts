import { FrontendToolRegistry, FrontendToolDefinition, FrontendToolContext } from "../tools/frontendTools";
import { Workflow } from "../../stores/ApiTypes";

describe("FrontendToolRegistry", () => {
  const createMockContext = (overrides = {}): Omit<FrontendToolContext, "abortSignal"> => ({
    getState: () => ({
      nodeMetadata: {},
      currentWorkflowId: null,
      getWorkflow: () => undefined,
      addWorkflow: jest.fn(),
      removeWorkflow: jest.fn(),
      getNodeStore: () => undefined,
      updateWorkflow: jest.fn(),
      saveWorkflow: jest.fn().mockResolvedValue(undefined),
      getCurrentWorkflow: () => undefined,
      setCurrentWorkflowId: jest.fn(),
      fetchWorkflow: jest.fn().mockResolvedValue(undefined),
      newWorkflow: () => ({ id: "new", name: "New" } as Workflow),
      createNew: jest.fn().mockResolvedValue({ id: "new", name: "New" } as Workflow),
      searchTemplates: jest.fn().mockResolvedValue([]),
      copy: jest.fn().mockResolvedValue({ id: "copy", name: "Copy" } as Workflow),
      ...overrides,
    }),
  });

  beforeEach(() => {
    FrontendToolRegistry.abortAll();
    FrontendToolRegistry.clearRegistry();
  });

  afterAll(() => {
    FrontendToolRegistry.abortAll();
    FrontendToolRegistry.clearRegistry();
  });

  describe("register", () => {
    it("registers a tool and returns unregister function", () => {
      const tool: FrontendToolDefinition = {
        name: "ui_test",
        description: "A test tool",
        parameters: { type: "object", properties: {} },
        execute: async () => "result",
      };

      const unregister = FrontendToolRegistry.register(tool);

      expect(FrontendToolRegistry.has("ui_test")).toBe(true);
      unregister();
      expect(FrontendToolRegistry.has("ui_test")).toBe(false);
    });

    it("allows multiple tools to be registered", () => {
      const tool1: FrontendToolDefinition = {
        name: "ui_test1",
        description: "Test tool 1",
        parameters: { type: "object", properties: {} },
        execute: async () => "result1",
      };
      const tool2: FrontendToolDefinition = {
        name: "ui_test2",
        description: "Test tool 2",
        parameters: { type: "object", properties: {} },
        execute: async () => "result2",
      };

      FrontendToolRegistry.register(tool1);
      FrontendToolRegistry.register(tool2);

      expect(FrontendToolRegistry.has("ui_test1")).toBe(true);
      expect(FrontendToolRegistry.has("ui_test2")).toBe(true);
    });
  });

  describe("getManifest", () => {
    it("returns manifest for all non-hidden tools", () => {
      const tool1: FrontendToolDefinition = {
        name: "ui_visible",
        description: "Visible tool",
        parameters: { type: "object", properties: {} },
        execute: async () => {},
      };
      const tool2: FrontendToolDefinition = {
        name: "ui_hidden",
        description: "Hidden tool",
        parameters: { type: "object", properties: {} },
        hidden: true,
        execute: async () => {},
      };

      FrontendToolRegistry.register(tool1);
      FrontendToolRegistry.register(tool2);

      const manifest = FrontendToolRegistry.getManifest();

      expect(manifest).toHaveLength(1);
      expect(manifest[0].name).toBe("ui_visible");
    });

    it("returns empty manifest when no tools registered", () => {
      const manifest = FrontendToolRegistry.getManifest();

      expect(manifest).toEqual([]);
    });
  });

  describe("has", () => {
    it("returns true for registered tool", () => {
      const tool: FrontendToolDefinition = {
        name: "ui_test",
        description: "Test tool",
        parameters: { type: "object", properties: {} },
        execute: async () => {},
      };

      FrontendToolRegistry.register(tool);

      expect(FrontendToolRegistry.has("ui_test")).toBe(true);
    });

    it("returns false for unregistered tool", () => {
      expect(FrontendToolRegistry.has("ui_nonexistent")).toBe(false);
    });
  });

  describe("call", () => {
    it("executes registered tool with arguments", async () => {
      const executeMock = jest.fn().mockResolvedValue("test result");
      const tool: FrontendToolDefinition = {
        name: "ui_test",
        description: "Test tool",
        parameters: { type: "object", properties: {} },
        execute: executeMock,
      };

      FrontendToolRegistry.register(tool);

      const result = await FrontendToolRegistry.call("ui_test", { foo: "bar" }, "call-1", createMockContext());

      expect(executeMock).toHaveBeenCalledWith(
        { foo: "bar" },
        expect.objectContaining({
          abortSignal: expect.any(AbortSignal),
          getState: expect.any(Function),
        })
      );
      expect(result).toBe("test result");
    });

    it("throws error for unknown tool", async () => {
      await expect(
        FrontendToolRegistry.call("ui_unknown", {}, "call-1", createMockContext())
      ).rejects.toThrow("Unknown tool: ui_unknown");
    });

    it("provides abort signal to tool execution", async () => {
      let receivedSignal: AbortSignal | null = null;
      const tool: FrontendToolDefinition = {
        name: "ui_test",
        description: "Test tool",
        parameters: { type: "object", properties: {} },
        execute: async (args, ctx) => {
          receivedSignal = ctx.abortSignal;
          return "done";
        },
      };

      FrontendToolRegistry.register(tool);

      await FrontendToolRegistry.call("ui_test", {}, "call-1", createMockContext());

      expect(receivedSignal).not.toBeNull();
      expect((receivedSignal as unknown as { aborted: boolean }).aborted).toBe(false);
    });

    it("cleans up active call after execution", async () => {
      const tool: FrontendToolDefinition = {
        name: "ui_test",
        description: "Test tool",
        parameters: { type: "object", properties: {} },
        execute: async () => "result",
      };

      FrontendToolRegistry.register(tool);
      await FrontendToolRegistry.call("ui_test", {}, "call-1", createMockContext());

      FrontendToolRegistry.abortAll();
    });
  });

  describe("abortAll", () => {
    it("aborts all active tool executions", async () => {
      let abortCalled = false;
      const tool: FrontendToolDefinition = {
        name: "ui_test",
        description: "Test tool",
        parameters: { type: "object", properties: {} },
        execute: async (args, ctx) => {
          ctx.abortSignal.addEventListener("abort", () => {
            abortCalled = true;
          });
          await new Promise((resolve) => setTimeout(resolve, 100));
          return "result";
        },
      };

      FrontendToolRegistry.register(tool);
      const promise = FrontendToolRegistry.call("ui_test", {}, "call-1", createMockContext());

      FrontendToolRegistry.abortAll();

      await promise;

      expect(abortCalled).toBe(true);
    });

    it("clears active calls map", async () => {
      const tool: FrontendToolDefinition = {
        name: "ui_test",
        description: "Test tool",
        parameters: { type: "object", properties: {} },
        execute: async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return "result";
        },
      };

      FrontendToolRegistry.register(tool);
      const promise = FrontendToolRegistry.call("ui_test", {}, "call-1", createMockContext());

      FrontendToolRegistry.abortAll();
      await promise;

      FrontendToolRegistry.abortAll();
    });
  });
});
