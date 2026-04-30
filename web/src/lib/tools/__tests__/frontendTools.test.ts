import { z } from "zod";
import { FrontendToolRegistry } from "../frontendTools";
import type { FrontendToolDefinition, FrontendToolState } from "../frontendTools";

const createMockState = (): FrontendToolState => ({
  nodeMetadata: {},
  currentWorkflowId: null,
  getWorkflow: jest.fn(),
  addWorkflow: jest.fn(),
  removeWorkflow: jest.fn(),
  getNodeStore: jest.fn(),
  updateWorkflow: jest.fn(),
  saveWorkflow: jest.fn(),
  getCurrentWorkflow: jest.fn(),
  setCurrentWorkflowId: jest.fn(),
  fetchWorkflow: jest.fn(),
  newWorkflow: jest.fn() as unknown as () => ReturnType<FrontendToolState["newWorkflow"]>,
  createNew: jest.fn(),
  searchTemplates: jest.fn(),
  copy: jest.fn()
});

describe("FrontendToolRegistry", () => {
  const toolName = "ui_test_tool" as const;
  let unregister: () => void;

  afterEach(() => {
    unregister?.();
  });

  describe("register / has / get", () => {
    it("registers a tool and finds it by name", () => {
      const tool: FrontendToolDefinition = {
        name: toolName,
        description: "A test tool",
        parameters: z.object({ value: z.string() }),
        execute: async () => ({ ok: true })
      };
      unregister = FrontendToolRegistry.register(tool);

      expect(FrontendToolRegistry.has(toolName)).toBe(true);
      expect(FrontendToolRegistry.get(toolName)).toBe(tool);
    });

    it("unregister removes the tool", () => {
      const tool: FrontendToolDefinition = {
        name: toolName,
        description: "temp",
        parameters: z.object({}),
        execute: async () => null
      };
      unregister = FrontendToolRegistry.register(tool);
      unregister();

      expect(FrontendToolRegistry.has(toolName)).toBe(false);
      expect(FrontendToolRegistry.get(toolName)).toBeUndefined();
      unregister = () => {};
    });
  });

  describe("getManifest", () => {
    it("includes registered tools in the manifest", () => {
      const tool: FrontendToolDefinition = {
        name: toolName,
        description: "manifest test",
        parameters: z.object({ query: z.string() }),
        execute: async () => null
      };
      unregister = FrontendToolRegistry.register(tool);

      const manifest = FrontendToolRegistry.getManifest();
      const entry = manifest.find((t) => t.name === toolName);
      expect(entry).toBeDefined();
      expect(entry!.description).toBe("manifest test");
    });

    it("passes through plain JSON Schema parameters in manifest", () => {
      const jsonSchema = {
        type: "object",
        properties: {
          name: { type: "string" },
          count: { type: "number" }
        },
        required: ["name"]
      };
      const tool: FrontendToolDefinition = {
        name: toolName,
        description: "json schema test",
        parameters: jsonSchema,
        execute: async () => null
      };
      unregister = FrontendToolRegistry.register(tool);

      const manifest = FrontendToolRegistry.getManifest();
      const entry = manifest.find((t) => t.name === toolName);
      expect(entry!.parameters).toEqual(jsonSchema);
    });

    it("produces a parameters object for Zod schemas", () => {
      const tool: FrontendToolDefinition = {
        name: toolName,
        description: "zod test",
        parameters: z.object({ query: z.string() }),
        execute: async () => null
      };
      unregister = FrontendToolRegistry.register(tool);

      const manifest = FrontendToolRegistry.getManifest();
      const entry = manifest.find((t) => t.name === toolName);
      expect(entry!.parameters).toBeDefined();
      expect(typeof entry!.parameters).toBe("object");
    });

    it("excludes hidden tools from manifest", () => {
      const tool: FrontendToolDefinition = {
        name: toolName,
        description: "hidden tool",
        parameters: z.object({}),
        hidden: true,
        execute: async () => null
      };
      unregister = FrontendToolRegistry.register(tool);

      const manifest = FrontendToolRegistry.getManifest();
      const entry = manifest.find((t) => t.name === toolName);
      expect(entry).toBeUndefined();
    });

    it("manifest entry has name and description", () => {
      const tool: FrontendToolDefinition = {
        name: toolName,
        description: "full entry test",
        parameters: z.object({ x: z.number() }),
        execute: async () => null
      };
      unregister = FrontendToolRegistry.register(tool);

      const manifest = FrontendToolRegistry.getManifest();
      const entry = manifest.find((t) => t.name === toolName);
      expect(entry).toEqual(
        expect.objectContaining({
          name: toolName,
          description: "full entry test",
          parameters: expect.any(Object)
        })
      );
    });
  });

  describe("call", () => {
    it("calls the tool execute function with validated args", async () => {
      const executeFn = jest.fn().mockResolvedValue({ result: 42 });
      const tool: FrontendToolDefinition = {
        name: toolName,
        description: "call test",
        parameters: z.object({ value: z.number() }),
        execute: executeFn
      };
      unregister = FrontendToolRegistry.register(tool);

      const mockState = createMockState();
      const result = await FrontendToolRegistry.call(
        toolName,
        { value: 5 },
        "call-1",
        { getState: () => mockState }
      );

      expect(result).toEqual({ result: 42 });
      expect(executeFn).toHaveBeenCalledWith(
        { value: 5 },
        expect.objectContaining({ abortSignal: expect.any(AbortSignal) })
      );
    });

    it("throws on unknown tool name", async () => {
      const mockState = createMockState();
      await expect(
        FrontendToolRegistry.call("ui_nonexistent", {}, "call-2", {
          getState: () => mockState
        })
      ).rejects.toThrow("Unknown tool: ui_nonexistent");
    });

    it("coerces string 'true'/'false' to boolean when schema expects boolean", async () => {
      const executeFn = jest.fn().mockResolvedValue("ok");
      const tool: FrontendToolDefinition = {
        name: toolName,
        description: "coercion test",
        parameters: z.object({ flag: z.boolean() }),
        execute: executeFn
      };
      unregister = FrontendToolRegistry.register(tool);

      const mockState = createMockState();
      await FrontendToolRegistry.call(
        toolName,
        { flag: "true" },
        "call-3",
        { getState: () => mockState }
      );

      expect(executeFn).toHaveBeenCalledWith(
        { flag: true },
        expect.anything()
      );
    });

    it("coerces string number to number when schema expects number", async () => {
      const executeFn = jest.fn().mockResolvedValue("ok");
      const tool: FrontendToolDefinition = {
        name: toolName,
        description: "number coercion test",
        parameters: z.object({ count: z.number() }),
        execute: executeFn
      };
      unregister = FrontendToolRegistry.register(tool);

      const mockState = createMockState();
      await FrontendToolRegistry.call(
        toolName,
        { count: "42" },
        "call-4",
        { getState: () => mockState }
      );

      expect(executeFn).toHaveBeenCalledWith(
        { count: 42 },
        expect.anything()
      );
    });

    it("rejects invalid args that cannot be coerced", async () => {
      const tool: FrontendToolDefinition = {
        name: toolName,
        description: "validation test",
        parameters: z.object({ value: z.number() }),
        execute: async () => null
      };
      unregister = FrontendToolRegistry.register(tool);

      const mockState = createMockState();
      await expect(
        FrontendToolRegistry.call(
          toolName,
          { value: "not-a-number" },
          "call-5",
          { getState: () => mockState }
        )
      ).rejects.toThrow();
    });
  });
});
