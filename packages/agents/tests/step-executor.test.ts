import { describe, it, expect, vi } from "vitest";
import { StepExecutor } from "../src/step-executor.js";
import type { Step, Task } from "../src/types.js";
import type { ProcessingMessage, TaskUpdate } from "@nodetool-ai/protocol";
import type { BaseProvider, ProcessingContext } from "@nodetool-ai/runtime";
import type { Tool } from "../src/tools/base-tool.js";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Minimal mock provider that returns a single assistant message
 * with a finish_step tool call.
 */
const asBaseProvider = (value: unknown): BaseProvider => {
  return value as BaseProvider;
};

const asProcessingContext = (value: unknown): ProcessingContext => {
  return value as ProcessingContext;
};

const asTool = (value: unknown): Tool => {
  return value as Tool;
};

function createMockProvider(toolCallArgs?: Record<string, unknown>): BaseProvider {
  const args = toolCallArgs ?? { result: { answer: "42" } };
  return asBaseProvider({
    provider: "mock",
    hasToolSupport: async () => true,
    generateMessages: async function* () {
      // Yield a text chunk
      yield {
        type: "chunk" as const,
        content: "Working on it...",
        done: false
      };
      // Yield a finish_step tool call
      yield {
        id: "tc_1",
        name: "finish_step",
        args
      };
    },
    async *generateMessagesTraced(
      args: Parameters<BaseProvider["generateMessages"]>[0]
    ) {
      yield* this.generateMessages(args);
    },
    async generateMessageTraced(
      args: Parameters<BaseProvider["generateMessage"]>[0]
    ) {
      return this.generateMessage(args);
    },
    generateMessage: vi.fn(),
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
    isContextLengthError: () => false
  });
}

/**
 * Minimal mock context with storeStepResult and loadStepResult.
 */
function createMockContext(
  overrides: Record<string, unknown> = {}
): ProcessingContext {
  const store = new Map<string, unknown>();
  return asProcessingContext({
    storeStepResult: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
      return key;
    }),
    loadStepResult: vi.fn(async (key: string) => {
      return store.get(key);
    }),
    set: vi.fn(),
    get: vi.fn(),
    _store: store,
    ...overrides
  });
}

describe("StepExecutor", () => {
  it("executes a simple step and captures result via finish_step", async () => {
    const step: Step = {
      id: "step_1",
      instructions: "Compute the answer to life",
      completed: false,
      dependsOn: [],
      outputSchema: JSON.stringify({
        type: "object",
        properties: { answer: { type: "string" } },
        required: ["answer"]
      }),
      logs: []
    };

    const task: Task = {
      id: "task_1",
      title: "Test Task",
      steps: [step]
    };

    const provider = createMockProvider();
    const context = createMockContext();

    const executor = new StepExecutor({
      task,
      step,
      context,
      provider,
      model: "test-model"
    });

    const messages: ProcessingMessage[] = [];
    for await (const msg of executor.execute()) {
      messages.push(msg);
    }

    // Should have received a chunk, then step_result
    const types = messages.map((m) => m.type);
    expect(types).toContain("task_update"); // step_started
    expect(types).toContain("chunk");
    expect(types).toContain("step_result");

    // Step should be marked completed
    expect(step.completed).toBe(true);

    // Result should be stored
    expect(context.storeStepResult).toHaveBeenCalledWith("step_1", {
      answer: "42"
    });
    expect(executor.getResult()).toEqual({ answer: "42" });
  });

  it("handles text-only response with JSON extraction", async () => {
    const step: Step = {
      id: "step_2",
      instructions: "Generate a greeting",
      completed: false,
      dependsOn: [],
      outputSchema: JSON.stringify({
        type: "object",
        properties: { greeting: { type: "string" } }
      }),
      logs: []
    };

    const task: Task = {
      id: "task_2",
      title: "Test Task 2",
      steps: [step]
    };

    // Provider that returns text with embedded JSON but no tool call
    const provider = {
      ...createMockProvider(),
      generateMessages: async function* () {
        yield {
          type: "chunk" as const,
          content: 'Here is the result: {"result": {"greeting": "hello"}}',
          done: false
        };
      }
    } as unknown as BaseProvider;

    const context = createMockContext();

    const executor = new StepExecutor({
      task,
      step,
      context,
      provider,
      model: "test-model"
    });

    const messages: ProcessingMessage[] = [];
    for await (const msg of executor.execute()) {
      messages.push(msg);
    }

    expect(step.completed).toBe(true);
    expect(executor.getResult()).toEqual({ greeting: "hello" });
  });

  it("handles invalid outputSchema JSON gracefully", async () => {
    const step: Step = {
      id: "step_invalid_schema",
      instructions: "Do something",
      completed: false,
      dependsOn: [],
      outputSchema: "not valid json {{{",
      logs: []
    };

    const task: Task = {
      id: "task_invalid_schema",
      title: "Invalid Schema Test",
      steps: [step]
    };

    const provider = createMockProvider({ result: { ok: true } });
    const context = createMockContext();

    const executor = new StepExecutor({
      task,
      step,
      context,
      provider,
      model: "test-model"
    });

    const messages: ProcessingMessage[] = [];
    for await (const msg of executor.execute()) {
      messages.push(msg);
    }

    // Should still complete (falls back to FinishStepTool with no schema)
    expect(step.completed).toBe(true);
    expect(executor.getResult()).toEqual({ ok: true });
  });

  it("executes regular tool calls before finish_step", async () => {
    const step: Step = {
      id: "step_tools",
      instructions: "Use a tool then finish",
      completed: false,
      dependsOn: [],
      outputSchema: JSON.stringify({
        type: "object",
        properties: { v: { type: "string" } }
      }),
      logs: []
    };

    const task: Task = {
      id: "task_tools",
      title: "Tool Test",
      steps: [step]
    };

    let callCount = 0;
    const provider = {
      ...createMockProvider(),
      generateMessages: async function* () {
        callCount++;
        if (callCount === 1) {
          // First call: use a regular tool
          yield {
            id: "tc_calc",
            name: "my_tool",
            args: { input: "test" }
          };
        } else {
          // Second call: finish
          yield {
            id: "tc_finish",
            name: "finish_step",
            args: { result: { v: "done" } }
          };
        }
      }
    } as unknown as BaseProvider;

    const mockTool = {
      name: "my_tool",
      description: "A test tool",
      inputSchema: { type: "object" as const, properties: {}, required: [] },
      process: vi.fn().mockResolvedValue({ output: "tool result" }),
      userMessage: () => "Using my_tool",
      toProviderTool: () => ({
        name: "my_tool",
        description: "A test tool",
        inputSchema: { type: "object", properties: {}, required: [] }
      })
    };

    const context = createMockContext();

    const executor = new StepExecutor({
      task,
      step,
      context,
      provider,
      model: "test-model",
      tools: [mockTool as unknown as Tool]
    });

    const messages: ProcessingMessage[] = [];
    for await (const msg of executor.execute()) {
      messages.push(msg);
    }

    expect(step.completed).toBe(true);
    expect(mockTool.process).toHaveBeenCalledWith(context, { input: "test" });

    // Should have tool_call_update messages for my_tool and finish_step
    const toolUpdates = messages.filter((m) => m.type === "tool_call_update");
    expect(toolUpdates.length).toBeGreaterThanOrEqual(1);
    expect((toolUpdates[0] as { name?: string }).name).toBe("my_tool");
  });

  it("handles unknown tool calls gracefully", async () => {
    const step: Step = {
      id: "step_unknown_tool",
      instructions: "Try unknown tool",
      completed: false,
      dependsOn: [],
      outputSchema: JSON.stringify({ type: "object", properties: {} }),
      logs: []
    };

    const task: Task = {
      id: "task_unknown_tool",
      title: "Unknown Tool Test",
      steps: [step]
    };

    let callCount = 0;
    const provider = {
      ...createMockProvider(),
      generateMessages: async function* () {
        callCount++;
        if (callCount === 1) {
          yield {
            id: "tc_unknown",
            name: "nonexistent_tool",
            args: {}
          };
        } else {
          yield {
            id: "tc_finish",
            name: "finish_step",
            args: { result: {} }
          };
        }
      }
    } as unknown as BaseProvider;

    const context = createMockContext();

    const executor = new StepExecutor({
      task,
      step,
      context,
      provider,
      model: "test-model"
    });

    const messages: ProcessingMessage[] = [];
    for await (const msg of executor.execute()) {
      messages.push(msg);
    }

    expect(step.completed).toBe(true);
  });

  it("handles tool execution errors gracefully", async () => {
    const step: Step = {
      id: "step_tool_error",
      instructions: "Use failing tool",
      completed: false,
      dependsOn: [],
      outputSchema: JSON.stringify({ type: "object", properties: {} }),
      logs: []
    };

    const task: Task = {
      id: "task_tool_error",
      title: "Tool Error Test",
      steps: [step]
    };

    let callCount = 0;
    const provider = {
      ...createMockProvider(),
      generateMessages: async function* () {
        callCount++;
        if (callCount === 1) {
          yield {
            id: "tc_fail",
            name: "failing_tool",
            args: {}
          };
        } else {
          yield {
            id: "tc_finish",
            name: "finish_step",
            args: { result: { recovered: true } }
          };
        }
      }
    } as unknown as BaseProvider;

    const failingTool = {
      name: "failing_tool",
      description: "A tool that throws",
      inputSchema: { type: "object" as const, properties: {}, required: [] },
      process: vi.fn().mockRejectedValue(new Error("tool exploded")),
      userMessage: () => "Using failing_tool",
      toProviderTool: () => ({
        name: "failing_tool",
        description: "A tool that throws",
        inputSchema: { type: "object", properties: {}, required: [] }
      })
    };

    const context = createMockContext();

    const executor = new StepExecutor({
      task,
      step,
      context,
      provider,
      model: "test-model",
      tools: [failingTool as unknown as Tool]
    });

    const messages: ProcessingMessage[] = [];
    for await (const msg of executor.execute()) {
      messages.push(msg);
    }

    expect(step.completed).toBe(true);
    expect(executor.getResult()).toEqual({ recovered: true });
  });

  it("truncates long tool results", async () => {
    const step: Step = {
      id: "step_truncate",
      instructions: "Use a tool with long output",
      completed: false,
      dependsOn: [],
      outputSchema: JSON.stringify({ type: "object", properties: {} }),
      logs: []
    };

    const task: Task = {
      id: "task_truncate",
      title: "Truncate Test",
      steps: [step]
    };

    let callCount = 0;
    const provider = {
      ...createMockProvider(),
      generateMessages: async function* () {
        callCount++;
        if (callCount === 1) {
          yield {
            id: "tc_long",
            name: "long_tool",
            args: {}
          };
        } else {
          yield {
            id: "tc_finish",
            name: "finish_step",
            args: { result: { done: true } }
          };
        }
      }
    } as unknown as BaseProvider;

    const longTool = {
      name: "long_tool",
      description: "Returns a very long result",
      inputSchema: { type: "object" as const, properties: {}, required: [] },
      process: vi.fn().mockResolvedValue({ data: "x".repeat(30000) }),
      userMessage: () => "Using long_tool",
      toProviderTool: () => ({
        name: "long_tool",
        description: "Returns a very long result",
        inputSchema: { type: "object", properties: {}, required: [] }
      })
    };

    const context = createMockContext();

    const executor = new StepExecutor({
      task,
      step,
      context,
      provider,
      model: "test-model",
      tools: [longTool as unknown as Tool]
    });

    const messages: ProcessingMessage[] = [];
    for await (const msg of executor.execute()) {
      messages.push(msg);
    }

    expect(step.completed).toBe(true);
  });

  it("enters conclusion stage when token limit is approached", async () => {
    const step: Step = {
      id: "step_conclude",
      instructions: "Do something",
      completed: false,
      dependsOn: [],
      outputSchema: JSON.stringify({
        type: "object",
        properties: { done: { type: "boolean" } }
      }),
      logs: []
    };

    const task: Task = {
      id: "task_conclude",
      title: "Conclusion Test",
      steps: [step]
    };

    // Provider that first returns a regular tool call (to build up tokens),
    // then on the second call (conclusion stage) returns finish_step.
    let callCount = 0;
    const provider = {
      ...createMockProvider(),
      generateMessages: async function* () {
        callCount++;
        if (callCount === 1) {
          // First call: return a long text chunk to inflate token count
          yield {
            type: "chunk" as const,
            content: "A".repeat(300),
            done: false
          };
          // No tool call, no finish_step — loop continues
        } else {
          // Second call (conclusion stage): finish_step
          yield { type: "chunk" as const, content: "Finishing", done: false };
          yield {
            id: "tc_finish",
            name: "finish_step",
            args: { result: { done: true } }
          };
        }
      }
    } as unknown as BaseProvider;

    const context = createMockContext();

    const executor = new StepExecutor({
      task,
      step,
      context,
      provider,
      model: "test-model",
      maxTokenLimit: 50 // Very low limit to trigger conclusion stage
    });

    const messages: ProcessingMessage[] = [];
    for await (const msg of executor.execute()) {
      messages.push(msg);
    }

    expect(step.completed).toBe(true);
    expect(executor.getResult()).toEqual({ done: true });
    // Conclusion stage should have been triggered (callCount > 1)
    expect(callCount).toBeGreaterThanOrEqual(2);
  });

  it("includes dependency results in user message", async () => {
    const step: Step = {
      id: "step_with_deps",
      instructions: "Use previous results",
      completed: false,
      dependsOn: ["dep_step"],
      outputSchema: JSON.stringify({ type: "object", properties: {} }),
      logs: []
    };

    const task: Task = {
      id: "task_deps",
      title: "Dependency Test",
      steps: [step]
    };

    const provider = createMockProvider({ result: { v: "ok" } });
    const context = createMockContext();
    // Pre-store a dependency result
    await context.storeStepResult("dep_step", { previous: "data" });

    const executor = new StepExecutor({
      task,
      step,
      context,
      provider,
      model: "test-model"
    });

    const messages: ProcessingMessage[] = [];
    for await (const msg of executor.execute()) {
      messages.push(msg);
    }

    expect(step.completed).toBe(true);
    // Verify loadStepResult was called for the dependency
    expect(context.loadStepResult).toHaveBeenCalledWith("dep_step");
  });

  it("uses full args when finish_step has no result key", async () => {
    const step: Step = {
      id: "step_no_result_key",
      instructions: "Finish without result key",
      completed: false,
      dependsOn: [],
      outputSchema: JSON.stringify({
        type: "object",
        properties: { answer: { type: "string" } }
      }),
      logs: []
    };

    const task: Task = {
      id: "task_no_result_key",
      title: "No Result Key Test",
      steps: [step]
    };

    // finish_step args without a "result" key
    const provider = {
      ...createMockProvider(),
      generateMessages: async function* () {
        yield {
          id: "tc_finish",
          name: "finish_step",
          args: { answer: "direct" }
        };
      }
    } as unknown as BaseProvider;

    const context = createMockContext();
    const executor = new StepExecutor({
      task,
      step,
      context,
      provider,
      model: "test-model"
    });

    const messages: ProcessingMessage[] = [];
    for await (const msg of executor.execute()) {
      messages.push(msg);
    }

    expect(step.completed).toBe(true);
    expect(executor.getResult()).toEqual({ answer: "direct" });
  });

  it("extracts JSON without result wrapper from text response", async () => {
    const step: Step = {
      id: "step_no_wrapper",
      instructions: "Return plain JSON",
      completed: false,
      dependsOn: [],
      outputSchema: JSON.stringify({ type: "object", properties: {} }),
      logs: []
    };

    const task: Task = {
      id: "task_no_wrapper",
      title: "No Wrapper Test",
      steps: [step]
    };

    // Provider returns text with JSON that has no "result" key
    const provider = {
      ...createMockProvider(),
      generateMessages: async function* () {
        yield {
          type: "chunk" as const,
          content: 'Here: {"answer": "plain"}',
          done: false
        };
      }
    } as unknown as BaseProvider;

    const context = createMockContext();
    const executor = new StepExecutor({
      task,
      step,
      context,
      provider,
      model: "test-model"
    });

    const messages: ProcessingMessage[] = [];
    for await (const msg of executor.execute()) {
      messages.push(msg);
    }

    expect(step.completed).toBe(true);
    // Since "result" is NOT in the parsed object, the whole object is used
    expect(executor.getResult()).toEqual({ answer: "plain" });
  });

  it("enters conclusion stage without finishStepTool", async () => {
    const step: Step = {
      id: "step_conclude_no_tool",
      instructions: "Do something",
      completed: false,
      dependsOn: [],
      // No outputSchema = unstructured mode, text accepted as result
      logs: []
    };

    const task: Task = {
      id: "task_conclude_no_tool",
      title: "Conclusion Without FinishStep",
      steps: [step]
    };

    let callCount = 0;
    const provider = {
      ...createMockProvider(),
      generateMessages: async function* () {
        callCount++;
        // Return text (no tool calls) - in unstructured mode this completes on first iteration
        yield { type: "chunk" as const, content: "A".repeat(300), done: false };
      }
    } as unknown as BaseProvider;

    const context = createMockContext();
    const executor = new StepExecutor({
      task,
      step,
      context,
      provider,
      model: "test-model",
      maxTokenLimit: 50,
      maxIterations: 3
    });

    const messages: ProcessingMessage[] = [];
    for await (const msg of executor.execute()) {
      messages.push(msg);
    }

    // Unstructured mode: text content is accepted as result on first iteration
    expect(step.completed).toBe(true);
    expect(callCount).toBeGreaterThanOrEqual(1);
  });

  it("handles finish_step with null args gracefully", async () => {
    const step: Step = {
      id: "step_null_args",
      instructions: "Finish with null args",
      completed: false,
      dependsOn: [],
      outputSchema: JSON.stringify({
        type: "object",
        properties: { v: { type: "string" } }
      }),
      logs: []
    };

    const task: Task = {
      id: "task_null_args",
      title: "Null Args Test",
      steps: [step]
    };

    let callCount = 0;
    const provider = {
      ...createMockProvider(),
      generateMessages: async function* () {
        callCount++;
        if (callCount === 1) {
          // finish_step with null args — triggers the "Missing result" branch
          yield { id: "tc_finish", name: "finish_step", args: null };
        } else {
          // Second attempt: provide valid result
          yield {
            id: "tc_finish2",
            name: "finish_step",
            args: { result: { v: "ok" } }
          };
        }
      }
    } as unknown as BaseProvider;

    const context = createMockContext();
    const executor = new StepExecutor({
      task,
      step,
      context,
      provider,
      model: "test-model"
    });

    const messages: ProcessingMessage[] = [];
    for await (const msg of executor.execute()) {
      messages.push(msg);
    }

    // Should eventually complete on second attempt
    expect(step.completed).toBe(true);
  });

  it("handles tool call with undefined args", async () => {
    const step: Step = {
      id: "step_undef_args",
      instructions: "Use tool with no args",
      completed: false,
      dependsOn: [],
      outputSchema: JSON.stringify({ type: "object", properties: {} }),
      logs: []
    };

    const task: Task = {
      id: "task_undef_args",
      title: "Undefined Args Test",
      steps: [step]
    };

    let callCount = 0;
    const provider = {
      ...createMockProvider(),
      generateMessages: async function* () {
        callCount++;
        if (callCount === 1) {
          yield {
            id: "tc_no_args",
            name: "simple_tool",
            args: undefined
          };
        } else {
          yield {
            id: "tc_finish",
            name: "finish_step",
            args: { result: { ok: true } }
          };
        }
      }
    } as unknown as BaseProvider;

    const simpleTool = {
      name: "simple_tool",
      description: "A tool",
      inputSchema: { type: "object" as const, properties: {}, required: [] },
      process: vi.fn().mockResolvedValue({ done: true }),
      userMessage: () => "Using simple_tool",
      toProviderTool: () => ({
        name: "simple_tool",
        description: "A tool",
        inputSchema: { type: "object", properties: {}, required: [] }
      })
    };

    const context = createMockContext();
    const executor = new StepExecutor({
      task,
      step,
      context,
      provider,
      model: "test-model",
      tools: [simpleTool as unknown as Tool]
    });

    const messages: ProcessingMessage[] = [];
    for await (const msg of executor.execute()) {
      messages.push(msg);
    }

    expect(step.completed).toBe(true);
    // The tool should have been called with {} when args is undefined
    expect(simpleTool.process).toHaveBeenCalledWith(context, {});
  });

  it("tracks browser URLs in getSources", async () => {
    const step: Step = {
      id: "step_browser",
      instructions: "Browse a URL",
      completed: false,
      dependsOn: [],
      outputSchema: JSON.stringify({ type: "object", properties: {} }),
      logs: []
    };

    const task: Task = {
      id: "task_browser",
      title: "Browser URL Test",
      steps: [step]
    };

    let callCount = 0;
    const provider = {
      ...createMockProvider(),
      generateMessages: async function* () {
        callCount++;
        if (callCount === 1) {
          yield {
            id: "tc_browser",
            name: "browser",
            args: { url: "https://example.com" }
          };
        } else {
          yield {
            id: "tc_finish",
            name: "finish_step",
            args: { result: { visited: true } }
          };
        }
      }
    } as unknown as BaseProvider;

    const browserTool = {
      name: "browser",
      description: "Browse a URL",
      inputSchema: {
        type: "object" as const,
        properties: { url: { type: "string" } },
        required: ["url"]
      },
      process: vi.fn().mockResolvedValue({ content: "page content" }),
      userMessage: () => "Browsing URL",
      toProviderTool: () => ({
        name: "browser",
        description: "Browse a URL",
        inputSchema: { type: "object", properties: {}, required: [] }
      })
    };

    const context = createMockContext();
    const executor = new StepExecutor({
      task,
      step,
      context,
      provider,
      model: "test-model",
      tools: [browserTool as unknown as Tool]
    });

    const messages: ProcessingMessage[] = [];
    for await (const msg of executor.execute()) {
      messages.push(msg);
    }

    expect(step.completed).toBe(true);
    expect(executor.getSources()).toContain("https://example.com");
  });

  it("deduplicates browser URLs in getSources", async () => {
    const step: Step = {
      id: "step_browser_dedup",
      instructions: "Browse URL twice",
      completed: false,
      dependsOn: [],
      outputSchema: JSON.stringify({ type: "object", properties: {} }),
      logs: []
    };

    const task: Task = {
      id: "task_browser_dedup",
      title: "Dedup Test",
      steps: [step]
    };

    let callCount = 0;
    const provider = {
      ...createMockProvider(),
      generateMessages: async function* () {
        callCount++;
        if (callCount === 1) {
          yield {
            id: "tc_b1",
            name: "browser",
            args: { url: "https://dup.com" }
          };
        } else if (callCount === 2) {
          yield {
            id: "tc_b2",
            name: "browser",
            args: { url: "https://dup.com" }
          };
        } else {
          yield { id: "tc_finish", name: "finish_step", args: { result: {} } };
        }
      }
    } as unknown as BaseProvider;

    const browserTool = {
      name: "browser",
      description: "Browse",
      inputSchema: { type: "object" as const, properties: {}, required: [] },
      process: vi.fn().mockResolvedValue({ content: "ok" }),
      userMessage: () => "Browsing",
      toProviderTool: () => ({
        name: "browser",
        description: "Browse",
        inputSchema: { type: "object", properties: {}, required: [] }
      })
    };

    const context = createMockContext();
    const executor = new StepExecutor({
      task,
      step,
      context,
      provider,
      model: "test-model",
      tools: [browserTool as unknown as Tool]
    });

    for await (const message of executor.execute()) {
      void message;
    }

    const sources = executor.getSources();
    // Should only appear once
    expect(sources.filter((s) => s === "https://dup.com")).toHaveLength(1);
  });

  it("persists download outputs to assets via sandboxToAsset", async () => {
    const step: Step = {
      id: "step_download_asset",
      instructions: "Download then finish",
      completed: false,
      dependsOn: [],
      outputSchema: JSON.stringify({ type: "object", properties: {} }),
      logs: []
    };
    const task: Task = {
      id: "task_download_asset",
      title: "Download asset bridge",
      steps: [step]
    };

    let callCount = 0;
    const provider = {
      ...createMockProvider(),
      generateMessages: async function* () {
        callCount += 1;
        if (callCount === 1) {
          yield {
            id: "tc_download",
            name: "download_file",
            args: {
              url: "https://example.com/file.txt",
              output_file: "downloads/file.txt"
            }
          };
          return;
        }
        yield { id: "tc_finish", name: "finish_step", args: { result: {} } };
      }
    } as unknown as BaseProvider;

    const downloadTool = {
      name: "download_file",
      description: "Download a file",
      inputSchema: { type: "object" as const, properties: {}, required: [] },
      process: vi.fn().mockResolvedValue({
        success: true,
        output_file: "downloads/file.txt"
      }),
      userMessage: () => "Downloading",
      toProviderTool: () => ({
        name: "download_file",
        description: "Download a file",
        inputSchema: { type: "object", properties: {}, required: [] }
      })
    };

    const sandboxToAsset = vi.fn().mockResolvedValue({
      type: "asset",
      uri: "asset://persisted-download",
      asset_id: "persisted-download"
    });
    const context = createMockContext({ sandboxToAsset });

    const executor = new StepExecutor({
      task,
      step,
      context,
      provider,
      model: "test-model",
      tools: [downloadTool as unknown as Tool]
    });

    for await (const message of executor.execute()) {
      void message;
    }

    expect(sandboxToAsset).toHaveBeenCalledWith("downloads/file.txt");
    expect(executor.getSources()).toContain("asset://persisted-download");
  });

  it("persists generated binary artifacts to assets via sandboxToAsset", async () => {
    const root = await mkdtemp(join(tmpdir(), "nodetool-step-artifacts-"));
    try {
      const step: Step = {
        id: "step_binary_artifact",
        instructions: "Generate an image then finish",
        completed: false,
        dependsOn: [],
        outputSchema: JSON.stringify({ type: "object", properties: {} }),
        logs: []
      };
      const task: Task = {
        id: "task_binary_artifact",
        title: "Binary artifact bridge",
        steps: [step]
      };

      let callCount = 0;
      const provider = {
        ...createMockProvider(),
        generateMessages: async function* () {
          callCount += 1;
          if (callCount === 1) {
            yield {
              id: "tc_js",
              name: "js",
              args: { code: "return 'ok'" }
            };
            return;
          }
          yield { id: "tc_finish", name: "finish_step", args: { result: {} } };
        }
      } as unknown as BaseProvider;

      const jsTool = {
        name: "js",
        description: "Run sandboxed JS",
        inputSchema: { type: "object" as const, properties: {}, required: [] },
        process: vi.fn().mockResolvedValue({
          success: true,
          image: `data:image/png;base64,${Buffer.from("img").toString("base64")}`
        }),
        userMessage: () => "Running js",
        toProviderTool: () => ({
          name: "js",
          description: "Run sandboxed JS",
          inputSchema: { type: "object", properties: {}, required: [] }
        })
      };

      const sandboxToAsset = vi.fn().mockResolvedValue({
        type: "image",
        uri: "asset://persisted-artifact",
        asset_id: "persisted-artifact"
      });
      const context = createMockContext({ sandboxToAsset, workspaceDir: root });

      const executor = new StepExecutor({
        task,
        step,
        context,
        provider,
        model: "test-model",
        tools: [jsTool as unknown as Tool]
      });

      for await (const message of executor.execute()) {
        void message;
      }

      expect(sandboxToAsset).toHaveBeenCalled();
      const firstArg = sandboxToAsset.mock.calls[0]?.[0];
      expect(typeof firstArg).toBe("string");
      expect(String(firstArg)).toContain("/artifacts/artifact_");
      expect(executor.getSources()).toContain("asset://persisted-artifact");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("persists generic successful tool output_file paths as assets", async () => {
    const step: Step = {
      id: "step_generic_output_file",
      instructions: "Generate an output file then finish",
      completed: false,
      dependsOn: [],
      outputSchema: JSON.stringify({ type: "object", properties: {} }),
      logs: []
    };
    const task: Task = {
      id: "task_generic_output_file",
      title: "Generic output file persistence",
      steps: [step]
    };

    let callCount = 0;
    const provider = {
      ...createMockProvider(),
      generateMessages: async function* () {
        callCount += 1;
        if (callCount === 1) {
          yield {
            id: "tc_img",
            name: "openai_image_generation",
            args: { prompt: "cat" }
          };
          return;
        }
        yield { id: "tc_finish", name: "finish_step", args: { result: {} } };
      }
    } as unknown as BaseProvider;

    const imageTool = {
      name: "openai_image_generation",
      description: "Generate image",
      inputSchema: { type: "object" as const, properties: {}, required: [] },
      process: vi.fn().mockResolvedValue({
        success: true,
        output_file: "generated/image.png"
      }),
      userMessage: () => "Generating image",
      toProviderTool: () => ({
        name: "openai_image_generation",
        description: "Generate image",
        inputSchema: { type: "object", properties: {}, required: [] }
      })
    };

    const sandboxToAsset = vi.fn().mockResolvedValue({
      type: "image",
      uri: "asset://persisted-generic-output",
      asset_id: "persisted-generic-output"
    });
    const context = createMockContext({ sandboxToAsset });

    const executor = new StepExecutor({
      task,
      step,
      context,
      provider,
      model: "test-model",
      tools: [imageTool as unknown as Tool]
    });

    for await (const message of executor.execute()) {
      void message;
    }

    expect(sandboxToAsset).toHaveBeenCalledWith("generated/image.png");
    expect(executor.getSources()).toContain("asset://persisted-generic-output");
  });

  it("does not persist output_file from args when tool result is not successful", async () => {
    const step: Step = {
      id: "step_noisy_output_file",
      instructions: "Fail screenshot then finish",
      completed: false,
      dependsOn: [],
      outputSchema: JSON.stringify({ type: "object", properties: {} }),
      logs: []
    };
    const task: Task = {
      id: "task_noisy_output_file",
      title: "Avoid noisy output_file persistence",
      steps: [step]
    };

    let callCount = 0;
    const provider = {
      ...createMockProvider(),
      generateMessages: async function* () {
        callCount += 1;
        if (callCount === 1) {
          yield {
            id: "tc_screenshot",
            name: "take_screenshot",
            args: { url: "https://example.com", output_file: "shots/a.png" }
          };
          return;
        }
        yield { id: "tc_finish", name: "finish_step", args: { result: {} } };
      }
    } as unknown as BaseProvider;

    const screenshotTool = {
      name: "take_screenshot",
      description: "Take screenshot",
      inputSchema: { type: "object" as const, properties: {}, required: [] },
      process: vi.fn().mockResolvedValue({
        error: "browser service unavailable"
      }),
      userMessage: () => "Taking screenshot",
      toProviderTool: () => ({
        name: "take_screenshot",
        description: "Take screenshot",
        inputSchema: { type: "object", properties: {}, required: [] }
      })
    };

    const sandboxToAsset = vi.fn().mockResolvedValue({
      type: "image",
      uri: "asset://should-not-be-called",
      asset_id: "should-not-be-called"
    });
    const context = createMockContext({ sandboxToAsset });

    const executor = new StepExecutor({
      task,
      step,
      context,
      provider,
      model: "test-model",
      tools: [screenshotTool as unknown as Tool]
    });

    for await (const message of executor.execute()) {
      void message;
    }

    expect(sandboxToAsset).not.toHaveBeenCalled();
  });

  it("getSources returns empty array initially", () => {
    const step: Step = {
      id: "step_sources",
      instructions: "Test sources",
      completed: false,
      dependsOn: [],
      logs: []
    };
    const task: Task = {
      id: "task_sources",
      title: "Sources Test",
      steps: [step]
    };
    const executor = new StepExecutor({
      task,
      step,
      context: createMockContext(),
      provider: createMockProvider(),
      model: "test-model"
    });
    expect(executor.getSources()).toEqual([]);
  });

  it("getTokenUsage returns zero initially", () => {
    const step: Step = {
      id: "step_tokens",
      instructions: "Test tokens",
      completed: false,
      dependsOn: [],
      logs: []
    };
    const task: Task = {
      id: "task_tokens",
      title: "Tokens Test",
      steps: [step]
    };
    const executor = new StepExecutor({
      task,
      step,
      context: createMockContext(),
      provider: createMockProvider(),
      model: "test-model"
    });
    const usage = executor.getTokenUsage();
    expect(usage.inputTokensTotal).toBe(0);
    expect(usage.outputTokensTotal).toBe(0);
  });

  it("yields StepFailed when step exhausts iterations without completing", async () => {
    const step: Step = {
      id: "step_fail",
      instructions: "Will not complete",
      completed: false,
      dependsOn: [],
      logs: [],
      // Use an output schema so unstructured auto-complete doesn't trigger
      outputSchema: JSON.stringify({
        type: "object",
        properties: { answer: { type: "string" } },
        required: ["answer"]
      })
    };

    const task: Task = {
      id: "task_fail",
      title: "Fail Test",
      steps: [step]
    };

    // Provider that returns non-JSON text every time (no tool calls, no extractable JSON)
    const provider = {
      ...createMockProvider(),
      generateMessages: async function* () {
        yield {
          type: "chunk" as const,
          content: "I cannot figure this out",
          done: false
        };
      }
    } as unknown as BaseProvider;

    const context = createMockContext();

    const executor = new StepExecutor({
      task,
      step,
      context,
      provider,
      model: "test-model",
      maxIterations: 2 // Low iteration limit
    });

    const messages: ProcessingMessage[] = [];
    for await (const msg of executor.execute()) {
      messages.push(msg);
    }

    expect(step.completed).toBe(true);
    expect(step.endTime).toBeDefined();

    // Should have a StepFailed task_update
    const failedUpdates = messages.filter(
      (m) => m.type === "task_update" && (m as TaskUpdate).event === "step_failed"
    );
    expect(failedUpdates).toHaveLength(1);
  });
});
