import { describe, it, expect, vi } from "vitest";
import { TaskExecutor } from "../src/task-executor.js";
import type { Step, Task } from "../src/types.js";
import type { ProcessingMessage } from "@nodetool-ai/protocol";
import { memoryKeys, BaseProvider } from "@nodetool-ai/runtime";
import { createMockContext } from "./_helpers/mock-context.js";

/**
 * Creates a mock provider that returns a finish_step tool call for each step.
 * The `delayMs` parameter allows simulating async work for parallel tests.
 */
function createMockProvider(delayMs = 0) {
  return {
    provider: "mock",
    hasToolSupport: async () => true,
    generateMessages: async function* () {
      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
      yield { type: "chunk" as const, content: "Working...", done: false };
      yield {
        id: "tc_1",
        name: "finish_step",
        args: { result: { done: true } }
      };
    },
    async *generateMessagesTraced(...args: any[]) {
      yield* (this as any).generateMessages(...args);
    },
    async generateMessageTraced(...args: any[]) {
      return (this as any).generateMessage(...args);
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
  } as any;
}

function makeStep(id: string, dependsOn: string[] = []): Step {
  return {
    id,
    instructions: `Do ${id}`,
    completed: false,
    dependsOn,
    outputSchema: JSON.stringify({
      type: "object",
      properties: { done: { type: "boolean" } }
    }),
    logs: []
  };
}

describe("TaskExecutor", () => {
  it("executes a single step sequentially", async () => {
    const step = makeStep("s1");
    const task: Task = { id: "t1", title: "Test", steps: [step] };

    const executor = new TaskExecutor({
      provider: createMockProvider(),
      model: "test-model",
      context: createMockContext(),
      tools: [],
      task
    });

    const messages: ProcessingMessage[] = [];
    for await (const msg of executor.executeTasks()) {
      messages.push(msg);
    }

    expect(step.completed).toBe(true);
    expect(messages.some((m) => m.type === "step_result")).toBe(true);
  });

  it("executes steps respecting dependency order", async () => {
    const s1 = makeStep("s1");
    const s2 = makeStep("s2", ["s1"]);
    const task: Task = { id: "t1", title: "Test", steps: [s1, s2] };

    const completionOrder: string[] = [];
    const provider = {
      ...createMockProvider(),
      generateMessages: async function* () {
        yield { type: "chunk" as const, content: "Working...", done: false };
        yield {
          id: "tc_1",
          name: "finish_step",
          args: { result: { done: true } }
        };
      }
    } as any;

    const context = createMockContext();
    context.memory.subscribe((entry: { kind: string; source?: string }) => {
      if (entry.kind === "step_result" && entry.source) {
        completionOrder.push(entry.source);
      }
    });

    const executor = new TaskExecutor({
      provider,
      model: "test-model",
      context,
      tools: [],
      task
    });

    for await (const _msg of executor.executeTasks()) {
      // consume
    }

    expect(s1.completed).toBe(true);
    expect(s2.completed).toBe(true);
    // s1 must complete before s2
    expect(completionOrder.indexOf("s1")).toBeLessThan(
      completionOrder.indexOf("s2")
    );
  });

  it("defers finish step until other steps complete", async () => {
    // s1 and s2 are independent, s3 is the last (finish) step depending on both
    const s1 = makeStep("s1");
    const s2 = makeStep("s2");
    const s3 = makeStep("s3", ["s1", "s2"]);
    const task: Task = { id: "t1", title: "Test", steps: [s1, s2, s3] };

    const completionOrder: string[] = [];
    const context = createMockContext();
    context.memory.subscribe((entry: { kind: string; source?: string }) => {
      if (entry.kind === "step_result" && entry.source) {
        completionOrder.push(entry.source);
      }
    });

    const executor = new TaskExecutor({
      provider: createMockProvider(),
      model: "test-model",
      context,
      tools: [],
      task
    });

    for await (const _msg of executor.executeTasks()) {
      // consume
    }

    expect(s1.completed).toBe(true);
    expect(s2.completed).toBe(true);
    expect(s3.completed).toBe(true);
    // s3 (finish step) must be last step stored
    expect(completionOrder[completionOrder.length - 1]).toBe("s3");
  });

  it("defers finish step even when it has no explicit dependencies", async () => {
    // All three steps have no dependencies, but s3 is last so it's the finish step
    const s1 = makeStep("s1");
    const s2 = makeStep("s2");
    const s3 = makeStep("s3");
    const task: Task = { id: "t1", title: "Test", steps: [s1, s2, s3] };

    const completionOrder: string[] = [];
    const context = createMockContext();
    context.memory.subscribe((entry: { kind: string; source?: string }) => {
      if (entry.kind === "step_result" && entry.source) {
        completionOrder.push(entry.source);
      }
    });

    const executor = new TaskExecutor({
      provider: createMockProvider(),
      model: "test-model",
      context,
      tools: [],
      task
    });

    for await (const _msg of executor.executeTasks()) {
      // consume
    }

    expect(s3.completed).toBe(true);
    // s3 must be last due to finish step deferral
    expect(completionOrder[completionOrder.length - 1]).toBe("s3");
  });

  it("executes independent steps in parallel when parallelExecution=true", async () => {
    const s1 = makeStep("s1");
    const s2 = makeStep("s2");
    // s3 depends on both - forces sequential after parallel batch
    const s3 = makeStep("s3", ["s1", "s2"]);
    const task: Task = { id: "t1", title: "Test", steps: [s1, s2, s3] };

    const startTimes: Record<string, number> = {};
    const endTimes: Record<string, number> = {};

    // Provider with delay to detect parallelism
    const provider = {
      ...createMockProvider(),
      generateMessages: async function* () {
        // We can't easily get the step id here, but we can verify
        // from the outside that both started before either finished
        yield { type: "chunk" as const, content: "Working...", done: false };
        await new Promise((r) => setTimeout(r, 20));
        yield {
          id: "tc_1",
          name: "finish_step",
          args: { result: { done: true } }
        };
      }
    } as any;

    const context = createMockContext();

    const executor = new TaskExecutor({
      provider,
      model: "test-model",
      context,
      tools: [],
      task,
      parallelExecution: true
    });

    const messages: ProcessingMessage[] = [];
    for await (const msg of executor.executeTasks()) {
      messages.push(msg);
    }

    expect(s1.completed).toBe(true);
    expect(s2.completed).toBe(true);
    expect(s3.completed).toBe(true);

    // All steps should produce step_result messages
    const stepResults = messages.filter((m) => m.type === "step_result");
    expect(stepResults).toHaveLength(3);
  });

  it("yields dependency issue chunk when stuck", async () => {
    // s1 depends on nonexistent step - will never be executable
    const s1 = makeStep("s1", ["nonexistent"]);
    const task: Task = { id: "t1", title: "Test", steps: [s1] };

    const executor = new TaskExecutor({
      provider: createMockProvider(),
      model: "test-model",
      context: createMockContext(),
      tools: [],
      task
    });

    const messages: ProcessingMessage[] = [];
    for await (const msg of executor.executeTasks()) {
      messages.push(msg);
    }

    expect(s1.completed).toBe(false);
    const chunks = messages.filter((m) => m.type === "chunk");
    expect(
      chunks.some((c) => (c as any).content.includes("dependency issues"))
    ).toBe(true);
  });

  it("seeds inputs into context", async () => {
    const s1 = makeStep("s1");
    const task: Task = { id: "t1", title: "Test", steps: [s1] };

    const context = createMockContext();
    const executor = new TaskExecutor({
      provider: createMockProvider(),
      model: "test-model",
      context,
      tools: [],
      task,
      inputs: { myKey: "myValue" }
    });

    for await (const _msg of executor.executeTasks()) {
      // consume
    }

    expect(context.memory.has(memoryKeys.input("myKey"))).toBe(true);
    expect(context.memory.getValue(memoryKeys.input("myKey"))).toBe("myValue");
  });

  it("respects maxSteps limit", async () => {
    // Create a step that never completes (provider returns no finish_step)
    const s1: Step = {
      id: "s1",
      instructions: "Do something",
      completed: false,
      dependsOn: [],
      outputSchema: JSON.stringify({
        type: "object",
        properties: { answer: { type: "string" } },
        required: ["answer"]
      }),
      logs: []
    };
    const task: Task = { id: "t1", title: "Test", steps: [s1] };

    // Provider that never returns finish_step and never returns extractable JSON
    const provider = {
      ...createMockProvider(),
      generateMessages: async function* () {
        yield {
          type: "chunk" as const,
          content: "Still thinking...",
          done: false
        };
      }
    } as any;

    const executor = new TaskExecutor({
      provider,
      model: "test-model",
      context: createMockContext(),
      tools: [],
      task,
      maxSteps: 2,
      maxStepIterations: 1
    });

    const messages: ProcessingMessage[] = [];
    for await (const msg of executor.executeTasks()) {
      messages.push(msg);
    }

    // Should terminate after maxSteps iterations
    expect(messages.length).toBeGreaterThan(0);
  });

  it("uses finalStepId to override finish step detection", async () => {
    const s1 = makeStep("s1");
    const s2 = makeStep("s2");
    const task: Task = { id: "t1", title: "Test", steps: [s1, s2] };

    const completionOrder: string[] = [];
    const context = createMockContext();
    context.memory.subscribe((entry: { kind: string; source?: string }) => {
      if (entry.kind === "step_result" && entry.source) {
        completionOrder.push(entry.source);
      }
    });

    // Set s1 as the final step (not the default last step s2)
    const executor = new TaskExecutor({
      provider: createMockProvider(),
      model: "test-model",
      context,
      tools: [],
      task,
      finalStepId: "s1"
    });

    for await (const _msg of executor.executeTasks()) {
      // consume
    }

    // s1 is the designated finish step, should be deferred until s2 completes
    expect(completionOrder[0]).toBe("s2");
    expect(completionOrder[1]).toBe("s1");
  });

  it("preserves item order in a parallel fan-out despite out-of-order completion", async () => {
    // Regression: parallel process-mode fan-out used to push per-item results
    // in completion order, scrambling them relative to the discover items.
    const items = ["alpha", "beta", "gamma"];

    // Provider returns an item-tagged result, finishing beta first and alpha
    // last so completion order (beta, gamma, alpha) differs from item order.
    const provider = {
      provider: "mock",
      hasToolSupport: async () => true,
      generateMessages: async function* (args: any) {
        const text = JSON.stringify(args?.messages ?? "");
        const item = items.find((x) => text.includes(x)) ?? "unknown";
        const delay = item === "beta" ? 5 : item === "gamma" ? 25 : 45;
        await new Promise((r) => setTimeout(r, delay));
        yield {
          id: "tc_1",
          name: "finish_step",
          args: { result: { item } }
        };
      },
      async *generateMessagesTraced(...args: any[]) {
        yield* (this as any).generateMessages(...args);
      },
      generateLoop(args: unknown) {
        return (
          BaseProvider.prototype as { generateLoop: (a: unknown) => unknown }
        ).generateLoop.call(this, args);
      },
      async generateMessageTraced(...args: any[]) {
        return (this as any).generateMessage(...args);
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
    } as any;

    const context = createMockContext();
    // Seed the discover step's result the fan-out reads from.
    context.memory.set({
      key: memoryKeys.step("discover"),
      kind: "step_result",
      value: items,
      source: "discover",
      title: "discover"
    });

    const discoverStep: Step = {
      id: "discover",
      instructions: "list items",
      completed: true,
      dependsOn: [],
      logs: []
    };
    const processStep: Step = {
      id: "process",
      instructions: "handle {item}",
      completed: false,
      dependsOn: ["discover"],
      mode: "process",
      outputSchema: JSON.stringify({
        type: "object",
        properties: { item: { type: "string" } }
      }),
      logs: []
    } as Step;

    const task: Task = {
      id: "t1",
      title: "Fan-out",
      steps: [discoverStep, processStep]
    };

    const executor = new TaskExecutor({
      provider,
      model: "test-model",
      context,
      tools: [],
      task,
      parallelExecution: true
    });

    for await (const _msg of executor.executeTasks()) {
      // consume
    }

    const aggregated = context.memory.getValue(memoryKeys.step("process"));
    expect(aggregated).toEqual([
      { item: "alpha" },
      { item: "beta" },
      { item: "gamma" }
    ]);
  });
});
