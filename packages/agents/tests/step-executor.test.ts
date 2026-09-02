import { describe, it, expect, vi } from "vitest";
import { StepExecutor } from "../src/step-executor.js";
import type { Step, Task } from "../src/types.js";
import type { ProcessingMessage, TaskUpdate } from "@nodetool-ai/protocol";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { AgentMemory, BaseProvider } from "@nodetool-ai/runtime";
import type { Tool } from "../src/tools/base-tool.js";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createLocalWorkspace } from "@nodetool-ai/runtime";

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
    // The executor delegates its tool loop to the provider; reuse the real base
    // loop (it only needs generateMessagesTraced, which this mock has).
    generateLoop(args: unknown) {
      return (
        BaseProvider.prototype as { generateLoop: (a: unknown) => unknown }
      ).generateLoop.call(this, args);
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
 * Minimal mock context with a real AgentMemory.
 */
function createMockContext(
  overrides: Record<string, unknown> = {}
): ProcessingContext {
  const store = new Map<string, unknown>();
  return asProcessingContext({
    memory: new AgentMemory(),
    workspaceDir: null,
    workspace: null,
    storeStepResult: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
      return key;
    }),
    loadStepResult: vi.fn(async (key: string) => {
      return store.get(key);
    }),
    set: vi.fn(),
    get: vi.fn(),
    sandboxToAsset: vi.fn(async (uri: string) => ({ uri: `asset://${uri}` })),
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
    const stored = context.memory.getValue("step:step_1");
    expect(stored).toEqual({ answer: "42" });
    expect(executor.getResult()).toEqual({ answer: "42" });
  });

  it("ignores embedded JSON in assistant text for schema'd steps (finish_step is the only completion path)", async () => {
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

    // Provider that returns text with embedded JSON but never calls finish_step.
    // The loop must exhaust iterations rather than parse JSON out of assistant text.
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
      model: "test-model",
      maxIterations: 3
    });

    const messages: ProcessingMessage[] = [];
    for await (const msg of executor.execute()) {
      messages.push(msg);
    }

    // Step "completes" with an iteration-exhaustion failure rather than the
    // hallucinated JSON value — the schema'd path requires finish_step.
    const result = executor.getResult() as Record<string, unknown> | string;
    expect(result).not.toEqual({ greeting: "hello" });
    expect(typeof result === "object" && result !== null && "error" in result)
      .toBe(true);
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
    expect(mockTool.process).toHaveBeenCalledWith(
      context,
      expect.objectContaining({ input: "test" })
    );

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
    // Pre-populate the dependency in shared memory
    context.memory.set({
      key: "step:dep_step",
      kind: "step_result",
      value: { previous: "data" },
      source: "dep_step",
      title: "dep_step"
    });

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
    // The new memory write for this step should exist alongside the dep entry.
    expect(context.memory.has("step:step_with_deps")).toBe(true);
    expect(context.memory.has("step:dep_step")).toBe(true);
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

  it("does not extract bare JSON from text for schema'd steps", async () => {
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
      model: "test-model",
      maxIterations: 3
    });

    const messages: ProcessingMessage[] = [];
    for await (const msg of executor.execute()) {
      messages.push(msg);
    }

    const result = executor.getResult() as Record<string, unknown> | string;
    expect(result).not.toEqual({ answer: "plain" });
    expect(typeof result === "object" && result !== null && "error" in result)
      .toBe(true);
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
    // No `needsToolCallId` opt-in and args were undefined → cleanArgs is {}.
    expect(simpleTool.process).toHaveBeenCalledWith(context, {});
  });

  it("yields StepFailed naming the real terminal state when the model ends in prose", async () => {
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

    // Terminal, but NOT completed — a dependent step must not run on this.
    expect(step.completed).toBe(false);
    expect(step.failed).toBe(true);
    // One provider turn happened, so the iteration budget is not the story.
    // The error says what the model did instead, and quotes it.
    expect(step.error).toContain("ended after 1 model turn(s)");
    expect(step.error).toContain("without calling finish_step");
    expect(step.error).toContain("I cannot figure this out");
    expect(step.error).not.toContain("exceeded 2 iterations");
    expect(step.endTime).toBeDefined();

    // Should have a StepFailed task_update
    const failedUpdates = messages.filter(
      (m) => m.type === "task_update" && (m as TaskUpdate).event === "step_failed"
    );
    expect(failedUpdates).toHaveLength(1);

    // …and the failure is on the protocol-level `error` field, not buried in
    // the result payload.
    const stepResult = messages.find((m) => m.type === "step_result") as any;
    expect(stepResult.error).toContain("ended after 1 model turn(s)");
  });

  it("reports iteration exhaustion only when the budget really ran out", async () => {
    const step: Step = {
      id: "step_exhaust",
      instructions: "Will keep calling a tool",
      completed: false,
      dependsOn: [],
      logs: [],
      outputSchema: JSON.stringify({
        type: "object",
        properties: { answer: { type: "string" } },
        required: ["answer"]
      })
    };
    const task: Task = { id: "task_exhaust", title: "Exhaust", steps: [step] };

    // Every turn calls a tool, so the loop only stops at maxIterations.
    let turn = 0;
    const provider = {
      ...createMockProvider(),
      generateMessages: async function* () {
        yield { id: `tc_${++turn}`, name: "my_tool", args: {} };
      }
    } as unknown as BaseProvider;

    const mockTool = asTool({
      name: "my_tool",
      description: "A test tool",
      inputSchema: { type: "object" as const, properties: {}, required: [] },
      process: vi.fn().mockResolvedValue({ output: "not a result" }),
      userMessage: () => "Using my_tool",
      toProviderTool: () => ({
        name: "my_tool",
        description: "A test tool",
        inputSchema: { type: "object", properties: {}, required: [] }
      })
    });

    const executor = new StepExecutor({
      task,
      step,
      context: createMockContext(),
      provider,
      model: "test-model",
      tools: [mockTool],
      maxIterations: 2
    });
    for await (const _ of executor.execute()) void _;

    expect(turn).toBe(2);
    expect(step.error).toContain("exceeded 2 iterations without completion");
  });
});
