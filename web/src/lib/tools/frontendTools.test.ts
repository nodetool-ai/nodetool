import {
  FrontendToolRegistry,
  FrontendToolDefinition,
  FrontendToolContext,
  FrontendToolState,
} from "./frontendTools";

describe("FrontendToolRegistry", () => {
  let mockState: FrontendToolState;
  let mockContext: Omit<FrontendToolContext, "abortSignal">;

  const createMockTool = (
    name: string,
    description: string,
    executeResult: any
  ): FrontendToolDefinition => ({
    name: name as `ui_${string}`,
    description,
    parameters: {
      type: "object",
      properties: {
        testArg: { type: "string" },
      },
      required: ["testArg"],
    },
    execute: jest.fn().mockResolvedValue(executeResult),
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockState = {
      nodeMetadata: {},
      currentWorkflowId: null,
      getWorkflow: jest.fn(),
      addWorkflow: jest.fn(),
      removeWorkflow: jest.fn(),
      getNodeStore: jest.fn(),
      updateWorkflow: jest.fn(),
      saveWorkflow: jest.fn().mockResolvedValue(undefined),
      getCurrentWorkflow: jest.fn(),
      setCurrentWorkflowId: jest.fn(),
      fetchWorkflow: jest.fn().mockResolvedValue(undefined),
      newWorkflow: jest.fn(),
      createNew: jest.fn().mockResolvedValue({} as any),
      searchTemplates: jest.fn().mockResolvedValue([]),
      copy: jest.fn().mockResolvedValue({} as any),
    };

    mockContext = {
      getState: () => mockState,
    };

    FrontendToolRegistry.abortAll();
  });

  afterEach(() => {
    FrontendToolRegistry.abortAll();
  });

  describe("register", () => {
    it("should register a tool and return unregister function", () => {
      const tool = createMockTool("ui_test", "A test tool", "success");
      const unregister = FrontendToolRegistry.register(tool);

      expect(FrontendToolRegistry.has("ui_test")).toBe(true);
      expect(typeof unregister).toBe("function");
    });

    it("should allow registering multiple tools", () => {
      const tool1 = createMockTool("ui_tool1", "Tool 1", "result1");
      const tool2 = createMockTool("ui_tool2", "Tool 2", "result2");

      FrontendToolRegistry.register(tool1);
      FrontendToolRegistry.register(tool2);

      expect(FrontendToolRegistry.has("ui_tool1")).toBe(true);
      expect(FrontendToolRegistry.has("ui_tool2")).toBe(true);
    });

    it("should override existing tool with same name", () => {
      const tool1 = createMockTool("ui_test", "Tool 1", "result1");
      const tool2 = createMockTool("ui_test", "Tool 2", "result2");

      FrontendToolRegistry.register(tool1);
      FrontendToolRegistry.register(tool2);

      expect(FrontendToolRegistry.has("ui_test")).toBe(true);
    });
  });

  describe("getManifest", () => {
    it("should return manifest for all registered tools", () => {
      const tool1 = createMockTool("ui_tool1", "Tool 1 description", "result1");
      const tool2 = createMockTool("ui_tool2", "Tool 2 description", "result2");

      FrontendToolRegistry.register(tool1);
      FrontendToolRegistry.register(tool2);

      const manifest = FrontendToolRegistry.getManifest();

      expect(manifest).toHaveLength(2);
      expect(manifest[0]).toMatchObject({
        name: "ui_tool1",
        description: "Tool 1 description",
      });
      expect(manifest[1]).toMatchObject({
        name: "ui_tool2",
        description: "Tool 2 description",
      });
    });

    it("should filter out hidden tools", () => {
      const visibleTool = createMockTool("ui_visible", "Visible tool", "result");
      const hiddenTool = createMockTool("ui_hidden", "Hidden tool", "result");
      (hiddenTool as any).hidden = true;

      FrontendToolRegistry.register(visibleTool);
      FrontendToolRegistry.register(hiddenTool);

      const manifest = FrontendToolRegistry.getManifest();

      expect(manifest).toHaveLength(1);
      expect(manifest[0].name).toBe("ui_visible");
    });

    it("should return empty array when no tools registered", () => {
      const manifest = FrontendToolRegistry.getManifest();
      expect(manifest).toEqual([]);
    });
  });

  describe("has", () => {
    it("should return true for registered tool", () => {
      const tool = createMockTool("ui_existing", "Test tool", "result");
      FrontendToolRegistry.register(tool);

      expect(FrontendToolRegistry.has("ui_existing")).toBe(true);
    });

    it("should return false for unregistered tool", () => {
      expect(FrontendToolRegistry.has("ui_nonexistent")).toBe(false);
    });

    it("should return false after tool is unregistered", () => {
      const tool = createMockTool("ui_to_remove", "Test tool", "result");
      const unregister = FrontendToolRegistry.register(tool);

      expect(FrontendToolRegistry.has("ui_to_remove")).toBe(true);
      unregister();
      expect(FrontendToolRegistry.has("ui_to_remove")).toBe(false);
    });
  });

  describe("call", () => {
    it("should execute tool with provided arguments", async () => {
      const tool = createMockTool("ui_execute", "Test tool", "success");
      FrontendToolRegistry.register(tool);

      const result = await FrontendToolRegistry.call(
        "ui_execute",
        { testArg: "value" },
        "call-1",
        mockContext
      );

      expect(result).toBe("success");
    });

    it("should throw error for unknown tool", async () => {
      await expect(
        FrontendToolRegistry.call("ui_unknown", {}, "call-1", mockContext)
      ).rejects.toThrow("Unknown tool: ui_unknown");
    });

    it("should pass correct context to execute function", async () => {
      const tool = createMockTool("ui_context", "Test tool", "success");
      FrontendToolRegistry.register(tool);

      await FrontendToolRegistry.call("ui_context", { testArg: "value" }, "call-1", mockContext);

      expect(tool.execute).toHaveBeenCalledWith(
        { testArg: "value" },
        expect.objectContaining({
          abortSignal: expect.any(AbortSignal),
          getState: expect.any(Function),
        })
      );
    });

    it("should track active calls for abort functionality", async () => {
      const tool = createMockTool("ui_tracked", "Test tool", "success");
      FrontendToolRegistry.register(tool);

      await FrontendToolRegistry.call("ui_tracked", { testArg: "value" }, "call-1", mockContext);

      FrontendToolRegistry.abortAll();
    });

    it("should handle concurrent tool calls", async () => {
      const tool1 = createMockTool("ui_concurrent1", "Tool 1", "result1");
      const tool2 = createMockTool("ui_concurrent2", "Tool 2", "result2");

      FrontendToolRegistry.register(tool1);
      FrontendToolRegistry.register(tool2);

      const [result1, result2] = await Promise.all([
        FrontendToolRegistry.call("ui_concurrent1", { testArg: "a" }, "call-1", mockContext),
        FrontendToolRegistry.call("ui_concurrent2", { testArg: "b" }, "call-2", mockContext),
      ]);

      expect(result1).toBe("result1");
      expect(result2).toBe("result2");
    });

    it("should generate unique call IDs", async () => {
      const tool = createMockTool("ui_id", "Test tool", "success");
      FrontendToolRegistry.register(tool);

      await FrontendToolRegistry.call("ui_id", { testArg: "value" }, "unique-id-1", mockContext);
      await FrontendToolRegistry.call("ui_id", { testArg: "value" }, "unique-id-2", mockContext);
    });
  });

  describe("abortAll", () => {
    it("should clear all active calls", async () => {
      const tool = createMockTool("ui_abort", "Test tool", "success");
      FrontendToolRegistry.register(tool);

      const controller = new AbortController();
      const abortSpy = jest.spyOn(controller, "abort");

      await FrontendToolRegistry.call("ui_abort", { testArg: "value" }, "call-1", mockContext);

      FrontendToolRegistry.abortAll();
    });
  });
});
