import { describe, it, expect, vi } from "vitest";
import { TaskExecutor } from "../src/task-executor.js";
import type { Step, Task } from "../src/types.js";
import {
  TaskUpdateEvent,
  type ProcessingMessage
} from "@nodetool-ai/protocol";
import { memoryKeys, BaseProvider } from "@nodetool-ai/runtime";
import { createMockContext } from "./_helpers/mock-context.js";
import { finishAction } from "./_helpers/codeact-provider.js";

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
      yield finishAction({ done: true });
    },
    async *generateMessagesTraced(...args: any[]) {
      yield* (this as any).generateMessages(...args);
    },
    // StepExecutor delegates the tool loop to the provider; reuse the real
    // base loop (it only needs generateMessagesTraced, which this mock has).
    // Without it every step failed, which the old failure path recorded as a
    // completion — so these tests passed while nothing ran.
    generateLoop(args: any) {
      return (BaseProvider.prototype as any).generateLoop.call(this, args);
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
        yield finishAction({ done: true });
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
        yield finishAction({ done: true });
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

  it("fails an unschedulable step instead of leaving it pending", async () => {
    // s1 depends on a nonexistent step — it will never be executable.
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
    expect(s1.failed).toBe(true);
    expect(s1.error).toContain("unsatisfiable dependency");

    // Terminal events, not a prose chunk: a stalled step must be visible to
    // consumers that read status rather than text.
    const stepResult = messages.find((m) => m.type === "step_result") as any;
    expect(stepResult.error).toContain("unsatisfiable dependency");
    expect(
      messages.some(
        (m) => m.type === "task_update" && (m as any).event === "step_failed"
      )
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
        yield finishAction({ item });
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

  it("keeps every result for duplicate fan-out items (no hash collision holes)", async () => {
    // Regression: content-hash-only ephemeral IDs collided for equal items, so
    // duplicates collapsed in the id->index map, dropping results and leaving
    // undefined holes. Index-qualified IDs must keep all N results.
    const items = ["cat", "cat", "dog"];
    const provider = {
      provider: "mock",
      hasToolSupport: async () => true,
      generateMessages: async function* (args: any) {
        const text = JSON.stringify(args?.messages ?? "");
        const item = text.match(/handle (\w+)/)?.[1] ?? "unknown";
        yield finishAction({ item });
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
    context.memory.set({
      key: memoryKeys.step("discover"),
      kind: "step_result",
      value: items,
      source: "discover",
      title: "discover"
    });
    const task: Task = {
      id: "t1",
      title: "Dup fan-out",
      steps: [
        {
          id: "discover",
          instructions: "list",
          completed: true,
          dependsOn: [],
          logs: []
        },
        {
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
        } as Step
      ]
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

    const aggregated = context.memory.getValue(
      memoryKeys.step("process")
    ) as unknown[];
    expect(aggregated).toHaveLength(3);
    expect(aggregated.every((r) => r != null)).toBe(true);
    expect(aggregated).toEqual([
      { item: "cat" },
      { item: "cat" },
      { item: "dog" }
    ]);
  });

  it("fails a fan-out whose item produced no result instead of completing it", async () => {
    // Regression: a failed ephemeral step answers with `{error}`, which the
    // aggregate stored as if it were a result and the step was marked
    // completed. A fan-out missing an item is a failed step (I-5).
    const provider = createFanOutProvider((item) =>
      item === "beta" ? null : { item }
    );

    const context = createMockContext();
    context.memory.set({
      key: memoryKeys.step("discover"),
      kind: "step_result",
      value: ["alpha", "beta", "gamma"],
      source: "discover",
      title: "discover"
    });

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
      steps: [
        {
          id: "discover",
          instructions: "list",
          completed: true,
          dependsOn: [],
          logs: []
        },
        processStep
      ]
    };

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

    expect(processStep.completed).toBe(false);
    expect(processStep.failed).toBe(true);
    expect(processStep.error).toContain("1");
    expect(processStep.error).toMatch(/no result/i);

    // The partial aggregate is never stored as the step's result.
    expect(context.memory.getValue(memoryKeys.step("process"))).toEqual({
      error: processStep.error
    });

    const failed = messages.filter(
      (m) =>
        m.type === "task_update" &&
        (m as { node_id?: string }).node_id === "process" &&
        (m as { event?: string }).event === TaskUpdateEvent.StepFailed
    );
    expect(failed).toHaveLength(1);
  });

  it("validates the aggregate against outputSchema when perItemSchema was used", async () => {
    // With both schemas declared, `perItemSchema` checks each item and the
    // step's own `outputSchema` was checked by nobody.
    const provider = createFanOutProvider((item) => ({ item }));

    const context = createMockContext();
    context.memory.set({
      key: memoryKeys.step("discover"),
      kind: "step_result",
      value: ["alpha", "beta"],
      source: "discover",
      title: "discover"
    });

    const processStep: Step = {
      id: "process",
      instructions: "handle {item}",
      completed: false,
      dependsOn: ["discover"],
      mode: "process",
      perItemSchema: JSON.stringify({
        type: "object",
        properties: { item: { type: "string" } },
        required: ["item"]
      }),
      // The aggregate must be a list of at least three items; the fan-out
      // produces two.
      outputSchema: JSON.stringify({ type: "array", minItems: 3 }),
      logs: []
    } as Step;
    const task: Task = {
      id: "t1",
      title: "Fan-out",
      steps: [
        {
          id: "discover",
          instructions: "list",
          completed: true,
          dependsOn: [],
          logs: []
        },
        processStep
      ]
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

    expect(processStep.completed).toBe(false);
    expect(processStep.failed).toBe(true);
    expect(processStep.error).toMatch(/at least 3 items/);
    expect(context.memory.getValue(memoryKeys.step("process"))).toEqual({
      error: processStep.error
    });
  });
});

/**
 * A provider for fan-out tests: `answer` maps the item named in the prompt to
 * the result its ephemeral step finishes with, or `null` to give up without
 * calling `finish()` (which is how a step fails).
 */
function createFanOutProvider(answer: (item: string) => unknown) {
  return {
    provider: "mock",
    hasToolSupport: async () => true,
    generateMessages: async function* (args: any) {
      const text = JSON.stringify(args?.messages ?? "");
      const item = text.match(/handle (\w+)/)?.[1] ?? "unknown";
      const result = answer(item);
      if (result === null) {
        yield { type: "chunk" as const, content: "Giving up", done: true };
        return;
      }
      yield finishAction(result);
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
}
