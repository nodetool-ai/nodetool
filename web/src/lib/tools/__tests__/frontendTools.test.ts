import { FrontendToolRegistry, FrontendToolDefinition } from "../frontendTools";

describe("FrontendToolRegistry", () => {
  describe("register", () => {
    it("should register a tool and return unregister function", () => {
      const tool: FrontendToolDefinition = {
        name: "ui_test_tool_abc123",
        description: "A test tool",
        parameters: {
          type: "object",
          properties: {
            arg1: { type: "string" }
          }
        },
        execute: async () => ({ success: true })
      };

      const unregister = FrontendToolRegistry.register(tool);

      expect(FrontendToolRegistry.has("ui_test_tool_abc123")).toBe(true);
      expect(typeof unregister).toBe("function");

      unregister();
      expect(FrontendToolRegistry.has("ui_test_tool_abc123")).toBe(false);
    });

    it("should register multiple tools", () => {
      const tool1: FrontendToolDefinition = {
        name: "ui_tool_1_def456",
        description: "Tool 1",
        parameters: { type: "object", properties: {} },
        execute: async () => ({})
      };

      const tool2: FrontendToolDefinition = {
        name: "ui_tool_2_ghi789",
        description: "Tool 2",
        parameters: { type: "object", properties: {} },
        execute: async () => ({})
      };

      const unregister1 = FrontendToolRegistry.register(tool1);
      const unregister2 = FrontendToolRegistry.register(tool2);

      expect(FrontendToolRegistry.has("ui_tool_1_def456")).toBe(true);
      expect(FrontendToolRegistry.has("ui_tool_2_ghi789")).toBe(true);

      unregister1();
      unregister2();
    });
  });

  describe("has", () => {
    it("should return false for unregistered tools", () => {
      expect(FrontendToolRegistry.has("ui_nonexistent_xyz123")).toBe(false);
    });

    it("should return true for registered tools", () => {
      const tool: FrontendToolDefinition = {
        name: "ui_existing_tool_abc456",
        description: "An existing tool",
        parameters: { type: "object", properties: {} },
        execute: async () => ({})
      };

      const unregister = FrontendToolRegistry.register(tool);
      expect(FrontendToolRegistry.has("ui_existing_tool_abc456")).toBe(true);
      unregister();
    });
  });

  describe("getManifest", () => {
    it("should include name, description, and parameters in manifest", () => {
      const tool: FrontendToolDefinition = {
        name: "ui_manifest_tool_jkl123",
        description: "A tool for manifest testing",
        parameters: {
          type: "object",
          properties: {
            input: { type: "string", description: "The input value" }
          },
          required: ["input"]
        },
        execute: async () => ({})
      };

      const unregister = FrontendToolRegistry.register(tool);

      const manifest = FrontendToolRegistry.getManifest();
      const foundTool = manifest.find(m => m.name === "ui_manifest_tool_jkl123");

      expect(foundTool).toBeDefined();
      expect(foundTool!.name).toBe("ui_manifest_tool_jkl123");
      expect(foundTool!.description).toBe("A tool for manifest testing");
      expect(foundTool!.parameters).toBeDefined();
      expect(foundTool!.parameters.properties).toHaveProperty("input");

      unregister();
    });

    it("should exclude hidden tools from manifest", () => {
      const visibleTool: FrontendToolDefinition = {
        name: "ui_visible_test_mno123",
        description: "Visible tool",
        parameters: { type: "object", properties: {} },
        execute: async () => ({})
      };

      const hiddenTool: FrontendToolDefinition = {
        name: "ui_hidden_test_pqr123",
        description: "Hidden tool",
        parameters: { type: "object", properties: {} },
        hidden: true,
        execute: async () => ({})
      };

      const unregisterVisible = FrontendToolRegistry.register(visibleTool);
      const unregisterHidden = FrontendToolRegistry.register(hiddenTool);

      const manifest = FrontendToolRegistry.getManifest();

      expect(manifest.find(m => m.name === "ui_visible_test_mno123")).toBeDefined();
      expect(manifest.find(m => m.name === "ui_hidden_test_pqr123")).toBeUndefined();

      unregisterVisible();
      unregisterHidden();
    });
  });

  describe("call", () => {
    it("should throw error for unknown tool", async () => {
      await expect(
        FrontendToolRegistry.call("ui_unknown_stu456", {}, "call-1", {
          getState: () => ({})
        } as any)
      ).rejects.toThrow("Unknown tool: ui_unknown_stu456");
    });

    it("should execute tool and return result", async () => {
      const tool: FrontendToolDefinition = {
        name: "ui_exec_test_vwx123",
        description: "Execution test tool",
        parameters: { type: "object", properties: {} },
        execute: async (args, ctx) => ({ executed: true, args })
      };

      const unregister = FrontendToolRegistry.register(tool);

      const result = await FrontendToolRegistry.call(
        "ui_exec_test_vwx123",
        { testArg: "value" },
        "call-2",
        { getState: () => ({}) } as any
      );

      expect(result).toEqual({ executed: true, args: { testArg: "value" } });

      unregister();
    });

    it("should pass context to execute function", async () => {
      const mockGetState = jest.fn().mockReturnValue({ testState: true } as any);
      const tool: FrontendToolDefinition = {
        name: "ui_context_test_yza123",
        description: "Context test tool",
        parameters: { type: "object", properties: {} },
        execute: async (args, ctx) => {
          const state = ctx.getState() as any;
          return { hasState: Boolean(state.testState) };
        }
      };

      const unregister = FrontendToolRegistry.register(tool);

      const result = await FrontendToolRegistry.call(
        "ui_context_test_yza123",
        {},
        "call-3",
        { getState: mockGetState } as any
      );

      expect(result).toEqual({ hasState: true });
      expect(mockGetState).toHaveBeenCalled();

      unregister();
    });

    it("should handle tool execution errors", async () => {
      const errorTool: FrontendToolDefinition = {
        name: "ui_error_test_bcd123",
        description: "Error test tool",
        parameters: { type: "object", properties: {} },
        execute: async (_args, _ctx) => {
          throw new Error("Tool execution failed");
        }
      };

      const unregister = FrontendToolRegistry.register(errorTool);

      await expect(
        FrontendToolRegistry.call("ui_error_test_bcd123", {}, "call-4", {
          getState: () => ({})
        } as any)
      ).rejects.toThrow("Tool execution failed");

      unregister();
    });
  });

  describe("tool registration patterns", () => {
    it("should handle tools with complex parameter schemas", () => {
      const complexTool: FrontendToolDefinition = {
        name: "ui_complex_params_efg123",
        description: "Tool with complex parameters",
        parameters: {
          type: "object",
          properties: {
            text: { type: "string", description: "Text input" },
            number: { type: "number", minimum: 0, maximum: 100 },
            boolean: { type: "boolean" },
            array: {
              type: "array",
              items: { type: "string" }
            },
            nested: {
              type: "object",
              properties: {
                inner: { type: "string" }
              }
            }
          },
          required: ["text"]
        },
        execute: async () => ({})
      };

      const unregister = FrontendToolRegistry.register(complexTool);
      expect(FrontendToolRegistry.has("ui_complex_params_efg123")).toBe(true);
      unregister();
    });

    it("should handle tools with requireUserConsent flag", () => {
      const consentTool: FrontendToolDefinition = {
        name: "ui_consent_tool_ghi123",
        description: "Tool requiring user consent",
        parameters: { type: "object", properties: {} },
        requireUserConsent: true,
        execute: async () => ({})
      };

      const unregister = FrontendToolRegistry.register(consentTool);
      expect(FrontendToolRegistry.has("ui_consent_tool_ghi123")).toBe(true);
      unregister();
    });
  });
});

describe("FrontendToolDefinition types", () => {
  it("should accept tools with ui_ prefix", () => {
    const tool: FrontendToolDefinition = {
      name: "ui_valid_prefix_jkl123",
      description: "Valid prefix",
      parameters: { type: "object", properties: {} },
      execute: async () => ({})
    };

    expect(tool.name.startsWith("ui_")).toBe(true);
  });

  it("should accept tools with various return types", async () => {
    const voidTool: FrontendToolDefinition = {
      name: "ui_void_tool_mno123",
      description: "Void tool",
      parameters: { type: "object", properties: {} },
      execute: async () => {}
    };

    const objectTool: FrontendToolDefinition = {
      name: "ui_object_tool_pqr123",
      description: "Object tool",
      parameters: { type: "object", properties: {} },
      execute: async () => ({ result: "value" })
    };

    const arrayTool: FrontendToolDefinition = {
      name: "ui_array_tool_stu123",
      description: "Array tool",
      parameters: { type: "object", properties: {} },
      execute: async () => ["item1", "item2"]
    };

    const un1 = FrontendToolRegistry.register(voidTool);
    const un2 = FrontendToolRegistry.register(objectTool);
    const un3 = FrontendToolRegistry.register(arrayTool);

    expect(FrontendToolRegistry.has("ui_void_tool_mno123")).toBe(true);
    expect(FrontendToolRegistry.has("ui_object_tool_pqr123")).toBe(true);
    expect(FrontendToolRegistry.has("ui_array_tool_stu123")).toBe(true);

    un1();
    un2();
    un3();
  });

  it("should accept tools with different argument types", async () => {
    const tool: FrontendToolDefinition = {
      name: "ui_args_test_vwx123",
      description: "Args test tool",
      parameters: {
        type: "object",
        properties: {
          stringArg: { type: "string" },
          numberArg: { type: "number" },
          boolArg: { type: "boolean" },
          arrayArg: { type: "array", items: { type: "string" } }
        }
      },
      execute: async (args) => args
    };

    const unregister = FrontendToolRegistry.register(tool);

    const result = await FrontendToolRegistry.call(
      "ui_args_test_vwx123",
      {
        stringArg: "test",
        numberArg: 42,
        boolArg: true,
        arrayArg: ["a", "b", "c"]
      },
      "call-args",
      { getState: () => ({}) } as any
    );

    expect(result.stringArg).toBe("test");
    expect(result.numberArg).toBe(42);
    expect(result.boolArg).toBe(true);
    expect(result.arrayArg).toEqual(["a", "b", "c"]);

    unregister();
  });
});
