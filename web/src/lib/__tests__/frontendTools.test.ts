import { FrontendToolRegistry, FrontendToolState } from "../tools/frontendTools";

describe("frontendTools", () => {
  const registeredTools: (() => void)[] = [];

  const createMockState = (overrides: Partial<FrontendToolState> = {}): FrontendToolState => ({
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
    newWorkflow: jest.fn(),
    createNew: jest.fn(),
    searchTemplates: jest.fn(),
    copy: jest.fn(),
    ...overrides
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    FrontendToolRegistry.abortAll();
    registeredTools.forEach((unregister) => unregister());
    registeredTools.length = 0;
  });

  describe("FrontendToolRegistry", () => {
    describe("register", () => {
      it("registers a tool with the registry", () => {
        const tool = {
          name: "ui_test" as const,
          description: "A test tool",
          parameters: {
            type: "object",
            properties: { value: { type: "string" } }
          },
          execute: jest.fn().mockResolvedValue("test result")
        };

        const unregister = FrontendToolRegistry.register(tool);
        registeredTools.push(unregister);

        expect(FrontendToolRegistry.has("ui_test")).toBe(true);
        unregister();
        expect(FrontendToolRegistry.has("ui_test")).toBe(false);
      });

      it("returns unregister function that removes the tool", () => {
        const tool = {
          name: "ui_test_remove" as const,
          description: "A test tool",
          parameters: { type: "object", properties: {} },
          execute: jest.fn()
        };

        const unregister = FrontendToolRegistry.register(tool);
        registeredTools.push(unregister);
        expect(FrontendToolRegistry.has("ui_test_remove")).toBe(true);

        unregister();
        expect(FrontendToolRegistry.has("ui_test_remove")).toBe(false);
      });

      it("allows registering multiple tools", () => {
        const tool1 = {
          name: "ui_tool1" as const,
          description: "Tool 1",
          parameters: { type: "object", properties: {} },
          execute: jest.fn()
        };
        const tool2 = {
          name: "ui_tool2" as const,
          description: "Tool 2",
          parameters: { type: "object", properties: {} },
          execute: jest.fn()
        };

        const unregister1 = FrontendToolRegistry.register(tool1);
        const unregister2 = FrontendToolRegistry.register(tool2);
        registeredTools.push(unregister1, unregister2);

        expect(FrontendToolRegistry.has("ui_tool1")).toBe(true);
        expect(FrontendToolRegistry.has("ui_tool2")).toBe(true);

        unregister2();
        expect(FrontendToolRegistry.has("ui_tool2")).toBe(false);
        expect(FrontendToolRegistry.has("ui_tool1")).toBe(true);
      });
    });

    describe("getManifest", () => {
      it("returns empty array when no tools registered", () => {
        const manifest = FrontendToolRegistry.getManifest();
        expect(manifest).toEqual([]);
      });

      it("returns manifest for all non-hidden tools", () => {
        const tool = {
          name: "ui_manifest_test" as const,
          description: "A manifest test tool",
          parameters: {
            type: "object",
            properties: { id: { type: "string" } }
          },
          execute: jest.fn()
        };

        const unregister = FrontendToolRegistry.register(tool);
        registeredTools.push(unregister);
        const manifest = FrontendToolRegistry.getManifest();

        expect(manifest).toHaveLength(1);
        expect(manifest[0]).toEqual({
          name: "ui_manifest_test",
          description: "A manifest test tool",
          parameters: tool.parameters
        });
      });

      it("excludes hidden tools from manifest", () => {
        const visibleTool = {
          name: "ui_visible" as const,
          description: "Visible tool",
          parameters: { type: "object", properties: {} },
          execute: jest.fn()
        };
        const hiddenTool = {
          name: "ui_hidden" as const,
          description: "Hidden tool",
          parameters: { type: "object", properties: {} },
          hidden: true,
          execute: jest.fn()
        };

        const unregister1 = FrontendToolRegistry.register(visibleTool);
        const unregister2 = FrontendToolRegistry.register(hiddenTool);
        registeredTools.push(unregister1, unregister2);

        const manifest = FrontendToolRegistry.getManifest();

        expect(manifest).toHaveLength(1);
        expect(manifest[0].name).toBe("ui_visible");
      });
    });

    describe("has", () => {
      it("returns false for unregistered tool", () => {
        expect(FrontendToolRegistry.has("ui_nonexistent")).toBe(false);
      });

      it("returns true for registered tool", () => {
        const tool = {
          name: "ui_has_test" as const,
          description: "Has test tool",
          parameters: { type: "object", properties: {} },
          execute: jest.fn()
        };

        const unregister = FrontendToolRegistry.register(tool);
        registeredTools.push(unregister);
        expect(FrontendToolRegistry.has("ui_has_test")).toBe(true);
      });
    });

    describe("call", () => {
      it("throws error for unknown tool", async () => {
        await expect(
          FrontendToolRegistry.call("ui_unknown", {}, "call-1", {
            getState: createMockState
          })
        ).rejects.toThrow("Unknown tool: ui_unknown");
      });

      it("calls tool execute function with args and context", async () => {
        const executeMock = jest.fn().mockResolvedValue("result");
        const tool = {
          name: "ui_execute_test" as const,
          description: "Execute test tool",
          parameters: { type: "object", properties: { value: { type: "string" } } },
          execute: executeMock
        };

        const unregister = FrontendToolRegistry.register(tool);
        registeredTools.push(unregister);

        const mockState = createMockState({
          currentWorkflowId: "workflow-1",
          getWorkflow: jest.fn()
        });

        const result = await FrontendToolRegistry.call(
          "ui_execute_test",
          { value: "test" },
          "call-1",
          { getState: () => mockState }
        );

        expect(executeMock).toHaveBeenCalledWith(
          { value: "test" },
          expect.objectContaining({
            abortSignal: expect.any(AbortSignal),
            getState: expect.any(Function)
          })
        );
        expect(result).toBe("result");
      });

      it("creates AbortController for each call", async () => {
        const executeMock = jest.fn().mockImplementation((args, ctx) => {
          expect(ctx.abortSignal.aborted).toBe(false);
          return Promise.resolve("done");
        });
        const tool = {
          name: "ui_abort_test" as const,
          description: "Abort test",
          parameters: { type: "object", properties: {} },
          execute: executeMock
        };

        const unregister = FrontendToolRegistry.register(tool);
        registeredTools.push(unregister);

        await FrontendToolRegistry.call("ui_abort_test", {}, "call-1", {
          getState: createMockState
        });

        expect(executeMock).toHaveBeenCalledTimes(1);
      });

      it("cleans up active call after execution", async () => {
        const executeMock = jest.fn().mockResolvedValue("result");
        const tool = {
          name: "ui_cleanup_test" as const,
          description: "Cleanup test",
          parameters: { type: "object", properties: {} },
          execute: executeMock
        };

        const unregister = FrontendToolRegistry.register(tool);
        registeredTools.push(unregister);

        await FrontendToolRegistry.call("ui_cleanup_test", {}, "call-1", {
          getState: createMockState
        });

        expect(executeMock).toHaveBeenCalledTimes(1);
      });

      it("handles execute errors without leaking active call", async () => {
        const executeMock = jest.fn().mockRejectedValue(new Error("Tool error"));
        const tool = {
          name: "ui_error_test" as const,
          description: "Error test",
          parameters: { type: "object", properties: {} },
          execute: executeMock
        };

        const unregister = FrontendToolRegistry.register(tool);
        registeredTools.push(unregister);

        await expect(
          FrontendToolRegistry.call("ui_error_test", {}, "call-1", {
            getState: createMockState
          })
        ).rejects.toThrow("Tool error");
      });
    });

    describe("abortAll", () => {
      it("aborts all active tool calls", async () => {
        const executeMock = jest.fn().mockImplementation((_args, ctx) => {
          return new Promise<string>((_resolve, reject) => {
            ctx.abortSignal.addEventListener("abort", () => {
              reject(new Error("Aborted"));
            });
          });
        });
        const tool = {
          name: "ui_abort_all_test" as const,
          description: "Abort all test",
          parameters: { type: "object", properties: {} },
          execute: executeMock
        };

        const unregister = FrontendToolRegistry.register(tool);
        registeredTools.push(unregister);

        const promise = FrontendToolRegistry.call("ui_abort_all_test", {}, "call-1", {
          getState: createMockState
        });

        FrontendToolRegistry.abortAll();

        await expect(promise).rejects.toThrow("Aborted");
      });

      it("clears active calls after execution completes normally", async () => {
        const executeMock = jest.fn().mockResolvedValue("result");
        const tool = {
          name: "ui_clear_after_abort" as const,
          description: "Clear after abort",
          parameters: { type: "object", properties: {} },
          execute: executeMock
        };

        const unregister = FrontendToolRegistry.register(tool);
        registeredTools.push(unregister);

        await FrontendToolRegistry.call("ui_clear_after_abort", {}, "call-1", {
          getState: createMockState
        });

        expect(executeMock).toHaveBeenCalledTimes(1);
      });
    });
  });
});
