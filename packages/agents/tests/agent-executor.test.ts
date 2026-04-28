import { describe, it, expect, vi } from "vitest";
import {
  AgentExecutor,
  FinishTool,
  jsonSchemaForOutputType
} from "../src/agent-executor.js";
import type { ToolCall } from "@nodetool/runtime";
import type { Chunk } from "@nodetool/protocol";

function createMockProvider(toolCallArgs?: Record<string, unknown>) {
  const args = toolCallArgs ?? {
    result: { answer: "42" },
    metadata: { title: "Test", description: "Done" }
  };
  return {
    provider: "mock",
    hasToolSupport: async () => true,
    generateMessage: vi.fn().mockResolvedValue({
      role: "assistant",
      content: "Working on it...",
      toolCalls: [
        {
          id: "tc_1",
          name: "finish_task",
          args
        }
      ]
    }),
    async *generateMessagesTraced(...args: any[]) {
      yield* (this as any).generateMessages(...args);
    },
    async generateMessageTraced(...args: any[]) {
      return (this as any).generateMessage(...args);
    },
    getAvailableLanguageModels: vi.fn().mockResolvedValue([]),
    getAvailableImageModels: vi.fn().mockResolvedValue([]),
    getAvailableVideoModels: vi.fn().mockResolvedValue([]),
    getAvailableTTSModels: vi.fn().mockResolvedValue([]),
    getAvailableASRModels: vi.fn().mockResolvedValue([]),
    getAvailableEmbeddingModels: vi.fn().mockResolvedValue([]),
    getContainerEnv: () => ({}),
    textToImage: vi.fn(),
    imageToImage: vi.fn(),
    textToSpeech: vi.fn(),
    automaticSpeechRecognition: vi.fn(),
    textToVideo: vi.fn(),
    imageToVideo: vi.fn(),
    generateEmbedding: vi.fn(),
    isContextLengthError: () => false,
    trackUsage: vi.fn(),
    getTotalCost: vi.fn().mockReturnValue(0),
    resetCost: vi.fn()
  } as any;
}

function createMockContext() {
  return {
    storeStepResult: vi.fn(),
    loadStepResult: vi.fn(),
    set: vi.fn(),
    get: vi.fn()
  } as any;
}

describe("jsonSchemaForOutputType", () => {
  it("returns correct schema for known types", () => {
    expect(jsonSchemaForOutputType("json")).toEqual({
      type: "object",
      description: "JSON object"
    });
    expect(jsonSchemaForOutputType("string")).toEqual({
      type: "string",
      description: "Text string"
    });
    expect(jsonSchemaForOutputType("number")).toEqual({
      type: "number",
      description: "Numeric value"
    });
    expect(jsonSchemaForOutputType("boolean")).toEqual({
      type: "boolean",
      description: "Boolean value"
    });
    expect(jsonSchemaForOutputType("list")).toEqual({
      type: "array",
      description: "Array of values"
    });
    expect(jsonSchemaForOutputType("markdown")).toEqual({
      type: "string",
      description: "Markdown formatted text"
    });
    expect(jsonSchemaForOutputType("html")).toEqual({
      type: "string",
      description: "HTML markup"
    });
    expect(jsonSchemaForOutputType("csv")).toEqual({
      type: "string",
      description: "CSV formatted data"
    });
    expect(jsonSchemaForOutputType("yaml")).toEqual({
      type: "string",
      description: "YAML formatted data"
    });
  });

  it("returns fallback schema for unknown types", () => {
    const schema = jsonSchemaForOutputType("xml");
    expect(schema.type).toBe("string");
    expect(schema.description).toContain("xml");
  });
});

describe("FinishTool", () => {
  it("has correct name and description", () => {
    const tool = new FinishTool("json", null);
    expect(tool.name).toBe("finish_task");
    expect(tool.description).toContain("Finish the task");
  });

  it("uses provided output schema", () => {
    const schema = { type: "object", properties: { x: { type: "number" } } };
    const tool = new FinishTool("json", schema);
    const props = tool.inputSchema.properties as Record<string, unknown>;
    expect(props.result).toEqual(schema);
  });

  it("generates schema from output type when no schema provided", () => {
    const tool = new FinishTool("string", null);
    const props = tool.inputSchema.properties as Record<string, unknown>;
    expect(props.result).toEqual({
      type: "string",
      description: "Text string"
    });
  });

  it("process returns params unchanged", async () => {
    const tool = new FinishTool("json", null);
    const params = {
      result: { data: 1 },
      metadata: { title: "T", description: "D" }
    };
    const result = await tool.process({} as any, params);
    expect(result).toEqual(params);
  });

  it("converts to provider tool format", () => {
    const tool = new FinishTool("json", null);
    const pt = tool.toProviderTool();
    expect(pt.name).toBe("finish_task");
    expect(pt.description).toBeDefined();
    expect(pt.inputSchema).toBeDefined();
  });
});

describe("AgentExecutor", () => {
  it("executes and captures result via finish_task", async () => {
    const provider = createMockProvider();
    const context = createMockContext();

    const executor = new AgentExecutor({
      provider,
      model: "test-model",
      context,
      tools: [],
      outputType: "json"
    });

    const items: (Chunk | ToolCall)[] = [];
    for await (const item of executor.execute("Compute the answer")) {
      items.push(item);
    }

    expect(items.length).toBeGreaterThan(0);
    expect(executor.getResult()).toEqual({ answer: "42" });
    expect(executor.getMetadata()).toEqual({
      title: "Test",
      description: "Done"
    });
  });

  it("passes inputs to prompt", async () => {
    const provider = createMockProvider();
    const context = createMockContext();

    const executor = new AgentExecutor({
      provider,
      model: "test-model",
      context,
      tools: [],
      outputType: "json"
    });

    const items: unknown[] = [];
    for await (const item of executor.execute("Analyze data", {
      data: [1, 2, 3]
    })) {
      items.push(item);
    }

    // Provider was called with messages that include the inputs
    const call = provider.generateMessage.mock.calls[0][0];
    const userMsg = call.messages.find((m: any) => m.role === "user");
    expect(userMsg.content).toContain("data");
  });

  it("handles custom tools", async () => {
    const customTool = {
      name: "calculator",
      description: "Calculate things",
      inputSchema: { type: "object", properties: {} },
      process: vi.fn().mockResolvedValue({ result: 42 }),
      toProviderTool: () => ({
        name: "calculator",
        description: "Calculate things",
        inputSchema: { type: "object", properties: {} }
      }),
      userMessage: () => "Running calculator"
    };

    // Provider calls calculator first, then finish_task
    let callCount = 0;
    const provider = {
      ...createMockProvider(),
      generateMessage: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            role: "assistant",
            content: "Let me calculate.",
            toolCalls: [
              {
                id: "tc_calc",
                name: "calculator",
                args: { expr: "1+1" }
              }
            ]
          };
        }
        return {
          role: "assistant",
          content: "Done.",
          toolCalls: [
            {
              id: "tc_finish",
              name: "finish_task",
              args: {
                result: 42,
                metadata: { title: "Calc", description: "Calculated" }
              }
            }
          ]
        };
      })
    };

    const executor = new AgentExecutor({
      provider: provider as any,
      model: "test-model",
      context: createMockContext(),
      tools: [customTool as any],
      outputType: "number"
    });

    const items: unknown[] = [];
    for await (const item of executor.execute("Calculate 1+1")) {
      items.push(item);
    }

    expect(customTool.process).toHaveBeenCalled();
    expect(executor.getResult()).toBe(42);
  });

  it("handles max iterations gracefully", async () => {
    // Provider never calls finish_task
    const provider = {
      ...createMockProvider(),
      generateMessage: vi.fn().mockResolvedValue({
        role: "assistant",
        content: "Still thinking...",
        toolCalls: null
      })
    };

    const executor = new AgentExecutor({
      provider: provider as any,
      model: "test-model",
      context: createMockContext(),
      tools: [],
      outputType: "string",
      maxIterations: 3
    });

    const items: unknown[] = [];
    for await (const item of executor.execute("Do something")) {
      items.push(item);
    }

    expect(executor.getResult()).toContain("incomplete");
    expect(executor.getMetadata()?.title).toBe("Incomplete Task");
  });

  it("handles tool execution errors", async () => {
    const failingTool = {
      name: "faulty",
      description: "Fails",
      inputSchema: { type: "object", properties: {} },
      process: vi.fn().mockRejectedValue(new Error("boom")),
      toProviderTool: () => ({
        name: "faulty",
        description: "Fails",
        inputSchema: { type: "object", properties: {} }
      }),
      userMessage: () => "Running faulty"
    };

    let callCount = 0;
    const provider = {
      ...createMockProvider(),
      generateMessage: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            role: "assistant",
            content: null,
            toolCalls: [{ id: "tc_1", name: "faulty", args: {} }]
          };
        }
        return {
          role: "assistant",
          content: null,
          toolCalls: [
            {
              id: "tc_2",
              name: "finish_task",
              args: {
                result: "recovered",
                metadata: { title: "R", description: "Recovered" }
              }
            }
          ]
        };
      })
    };

    const executor = new AgentExecutor({
      provider: provider as any,
      model: "test-model",
      context: createMockContext(),
      tools: [failingTool as any],
      outputType: "string"
    });

    const items: unknown[] = [];
    for await (const item of executor.execute("Try faulty tool")) {
      items.push(item);
    }

    expect(executor.getResult()).toBe("recovered");
  });

  it("handles unknown tool calls", async () => {
    let callCount = 0;
    const provider = {
      ...createMockProvider(),
      generateMessage: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            role: "assistant",
            content: null,
            toolCalls: [{ id: "tc_1", name: "nonexistent", args: {} }]
          };
        }
        return {
          role: "assistant",
          content: null,
          toolCalls: [
            {
              id: "tc_2",
              name: "finish_task",
              args: {
                result: "done",
                metadata: { title: "D", description: "Done" }
              }
            }
          ]
        };
      })
    };

    const executor = new AgentExecutor({
      provider: provider as any,
      model: "test-model",
      context: createMockContext(),
      tools: [],
      outputType: "string"
    });

    const items: unknown[] = [];
    for await (const item of executor.execute("Try unknown tool")) {
      items.push(item);
    }

    expect(executor.getResult()).toBe("done");
  });
});
