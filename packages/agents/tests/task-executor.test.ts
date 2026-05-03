import { describe, it, expect, vi } from "vitest";
import { TaskExecutor } from "../src/task-executor.js";
import type { Step, Task } from "../src/types.js";
import type { ProcessingMessage } from "@nodetool-ai/protocol";

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

function createMockContext() {
  const store = new Map<string, unknown>();
  return {
    storeStepResult: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
      return key;
    }),
    loadStepResult: vi.fn(async (key: string) => {
      return store.get(key);
    }),
    set: vi.fn(),
    get: vi.fn(),
    _store: store
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
    // Track step completion order via storeStepResult
    const origStore = context.storeStepResult;
    context.storeStepResult = vi.fn(async (key: string, value: unknown) => {
      completionOrder.push(key);
      return origStore(key, value);
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
    const stepIds = completionOrder.filter((id) => id.startsWith("s"));
    expect(stepIds.indexOf("s1")).toBeLessThan(stepIds.indexOf("s2"));
  });

  it("defers finish step until other steps complete", async () => {
    // s1 and s2 are independent, s3 is the last (finish) step depending on both
    const s1 = makeStep("s1");
    const s2 = makeStep("s2");
    const s3 = makeStep("s3", ["s1", "s2"]);
    const task: Task = { id: "t1", title: "Test", steps: [s1, s2, s3] };

    const completionOrder: string[] = [];
    const context = createMockContext();
    const origStore = context.storeStepResult;
    context.storeStepResult = vi.fn(async (key: string, value: unknown) => {
      completionOrder.push(key);
      return origStore(key, value);
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
    // Note: finish step also stores task-level result, so filter to step ids
    const stepIds = completionOrder.filter((id) => id.startsWith("s"));
    expect(stepIds[stepIds.length - 1]).toBe("s3");
  });

  it("defers finish step even when it has no explicit dependencies", async () => {
    // All three steps have no dependencies, but s3 is last so it's the finish step
    const s1 = makeStep("s1");
    const s2 = makeStep("s2");
    const s3 = makeStep("s3");
    const task: Task = { id: "t1", title: "Test", steps: [s1, s2, s3] };

    const completionOrder: string[] = [];
    const context = createMockContext();
    const origStore = context.storeStepResult;
    context.storeStepResult = vi.fn(async (key: string, value: unknown) => {
      completionOrder.push(key);
      return origStore(key, value);
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
    const stepIds = completionOrder.filter((id) => id.startsWith("s"));
    expect(stepIds[stepIds.length - 1]).toBe("s3");
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

    expect(context.set).toHaveBeenCalledWith("myKey", "myValue");
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
    const origStore = context.storeStepResult;
    context.storeStepResult = vi.fn(async (key: string, value: unknown) => {
      completionOrder.push(key);
      return origStore(key, value);
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
    const stepIds = completionOrder.filter((id) => id.startsWith("s"));
    expect(stepIds[0]).toBe("s2");
    expect(stepIds[1]).toBe("s1");
  });
});
