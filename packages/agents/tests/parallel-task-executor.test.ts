import { describe, it, expect, vi } from "vitest";
import { ParallelTaskExecutor } from "../src/parallel-task-executor.js";
import type { TaskPlan } from "../src/types.js";
import type { ProcessingMessage, StepResult } from "@nodetool/protocol";

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
    async *generateMessagesTraced(...args: unknown[]) {
      yield* (this as ReturnType<typeof createMockProvider>).generateMessages(
        ...(args as Parameters<
          ReturnType<typeof createMockProvider>["generateMessages"]
        >)
      );
    },
    async generateMessageTraced(...args: unknown[]) {
      return (
        this as ReturnType<typeof createMockProvider>
      ).generateMessage(
        ...(args as Parameters<
          ReturnType<typeof createMockProvider>["generateMessage"]
        >)
      );
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
  } as ReturnType<typeof createMockProvider>;
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
    set: vi.fn((key: string, value: unknown) => {
      store.set(key, value);
    }),
    get: vi.fn((key: string) => {
      return store.get(key);
    }),
    _store: store
  } as ReturnType<typeof createMockContext>;
}

describe("ParallelTaskExecutor", () => {
  it("executes a single task plan", async () => {
    const plan: TaskPlan = {
      title: "Single Task Plan",
      tasks: [
        {
          id: "task_1",
          title: "Task One",
          dependsOn: [],
          completed: false,
          steps: [
            {
              id: "s1",
              instructions: "Do something",
              completed: false,
              dependsOn: [],
              outputSchema: JSON.stringify({
                type: "object",
                properties: { done: { type: "boolean" } }
              }),
              logs: []
            }
          ]
        }
      ]
    };

    const executor = new ParallelTaskExecutor({
      provider: createMockProvider() as never,
      model: "test-model",
      context: createMockContext() as never,
      tools: [],
      taskPlan: plan
    });

    const messages: ProcessingMessage[] = [];
    for await (const msg of executor.execute()) {
      messages.push(msg);
    }

    expect(plan.tasks[0].completed).toBe(true);
    expect(messages.some((m) => m.type === "step_result")).toBe(true);
  });

  it("executes independent tasks in parallel", async () => {
    const plan: TaskPlan = {
      title: "Parallel Plan",
      tasks: [
        {
          id: "task_a",
          title: "Task A",
          dependsOn: [],
          completed: false,
          steps: [
            {
              id: "s_a",
              instructions: "Do A",
              completed: false,
              dependsOn: [],
              outputSchema: JSON.stringify({
                type: "object",
                properties: { done: { type: "boolean" } }
              }),
              logs: []
            }
          ]
        },
        {
          id: "task_b",
          title: "Task B",
          dependsOn: [],
          completed: false,
          steps: [
            {
              id: "s_b",
              instructions: "Do B",
              completed: false,
              dependsOn: [],
              outputSchema: JSON.stringify({
                type: "object",
                properties: { done: { type: "boolean" } }
              }),
              logs: []
            }
          ]
        }
      ]
    };

    const executor = new ParallelTaskExecutor({
      provider: createMockProvider(10) as never,
      model: "test-model",
      context: createMockContext() as never,
      tools: [],
      taskPlan: plan
    });

    const messages: ProcessingMessage[] = [];
    for await (const msg of executor.execute()) {
      messages.push(msg);
    }

    // Both tasks should complete
    expect(plan.tasks[0].completed).toBe(true);
    expect(plan.tasks[1].completed).toBe(true);

    // Should have step_result for both tasks
    const stepResults = messages.filter((m) => m.type === "step_result");
    expect(stepResults.length).toBeGreaterThanOrEqual(2);
  });

  it("respects task-level dependencies", async () => {
    const plan: TaskPlan = {
      title: "Dependency Plan",
      tasks: [
        {
          id: "task_first",
          title: "First Task",
          dependsOn: [],
          completed: false,
          steps: [
            {
              id: "s_first",
              instructions: "Do first",
              completed: false,
              dependsOn: [],
              outputSchema: JSON.stringify({
                type: "object",
                properties: { done: { type: "boolean" } }
              }),
              logs: []
            }
          ]
        },
        {
          id: "task_second",
          title: "Second Task",
          dependsOn: ["task_first"],
          completed: false,
          steps: [
            {
              id: "s_second",
              instructions: "Do second",
              completed: false,
              dependsOn: [],
              outputSchema: JSON.stringify({
                type: "object",
                properties: { done: { type: "boolean" } }
              }),
              logs: []
            }
          ]
        }
      ]
    };

    const completionOrder: string[] = [];
    const context = createMockContext();
    const origSet = context.set;
    context.set = vi.fn((key: string, value: unknown) => {
      if (key.startsWith("task_")) {
        completionOrder.push(key);
      }
      origSet(key, value);
    });

    const executor = new ParallelTaskExecutor({
      provider: createMockProvider() as never,
      model: "test-model",
      context: context as never,
      tools: [],
      taskPlan: plan
    });

    for await (const _msg of executor.execute()) {
      // consume
    }

    expect(plan.tasks[0].completed).toBe(true);
    expect(plan.tasks[1].completed).toBe(true);

    // task_first must complete before task_second
    expect(completionOrder.indexOf("task_first")).toBeLessThan(
      completionOrder.indexOf("task_second")
    );
  });

  it("handles dependency issue when tasks cannot execute", async () => {
    const plan: TaskPlan = {
      title: "Broken Plan",
      tasks: [
        {
          id: "task_stuck",
          title: "Stuck Task",
          dependsOn: ["nonexistent"],
          completed: false,
          steps: [
            {
              id: "s_stuck",
              instructions: "Will never execute",
              completed: false,
              dependsOn: [],
              logs: []
            }
          ]
        }
      ]
    };

    const executor = new ParallelTaskExecutor({
      provider: createMockProvider() as never,
      model: "test-model",
      context: createMockContext() as never,
      tools: [],
      taskPlan: plan
    });

    const messages: ProcessingMessage[] = [];
    for await (const msg of executor.execute()) {
      messages.push(msg);
    }

    expect(plan.tasks[0].completed).toBeFalsy();
    const chunks = messages.filter((m) => m.type === "chunk");
    expect(
      chunks.some((c) =>
        ((c as { content: string }).content ?? "").includes("dependency issues")
      )
    ).toBe(true);
  });

  it("returns final result from the last task", async () => {
    const plan: TaskPlan = {
      title: "Result Plan",
      tasks: [
        {
          id: "task_1",
          title: "Task One",
          dependsOn: [],
          completed: false,
          steps: [
            {
              id: "s1",
              instructions: "Do it",
              completed: false,
              dependsOn: [],
              outputSchema: JSON.stringify({
                type: "object",
                properties: { done: { type: "boolean" } }
              }),
              logs: []
            }
          ]
        }
      ]
    };

    const executor = new ParallelTaskExecutor({
      provider: createMockProvider() as never,
      model: "test-model",
      context: createMockContext() as never,
      tools: [],
      taskPlan: plan
    });

    for await (const _msg of executor.execute()) {
      // consume
    }

    const result = executor.getFinalResult();
    expect(result).toEqual({ done: true });
  });

  it("seeds inputs into context", async () => {
    const plan: TaskPlan = {
      title: "Input Plan",
      tasks: [
        {
          id: "task_1",
          title: "Task One",
          dependsOn: [],
          completed: false,
          steps: [
            {
              id: "s1",
              instructions: "Use input",
              completed: false,
              dependsOn: [],
              outputSchema: JSON.stringify({
                type: "object",
                properties: { done: { type: "boolean" } }
              }),
              logs: []
            }
          ]
        }
      ]
    };

    const context = createMockContext();
    const executor = new ParallelTaskExecutor({
      provider: createMockProvider() as never,
      model: "test-model",
      context: context as never,
      tools: [],
      taskPlan: plan,
      inputs: { myKey: "myValue" }
    });

    for await (const _msg of executor.execute()) {
      // consume
    }

    expect(context.set).toHaveBeenCalledWith("myKey", "myValue");
  });

  it("executes a diamond dependency pattern (fan-out + fan-in)", async () => {
    const plan: TaskPlan = {
      title: "Diamond Plan",
      tasks: [
        {
          id: "task_start",
          title: "Start",
          dependsOn: [],
          completed: false,
          steps: [
            {
              id: "s_start",
              instructions: "Initialize",
              completed: false,
              dependsOn: [],
              outputSchema: JSON.stringify({
                type: "object",
                properties: { done: { type: "boolean" } }
              }),
              logs: []
            }
          ]
        },
        {
          id: "task_branch_a",
          title: "Branch A",
          dependsOn: ["task_start"],
          completed: false,
          steps: [
            {
              id: "s_branch_a",
              instructions: "Process A",
              completed: false,
              dependsOn: [],
              outputSchema: JSON.stringify({
                type: "object",
                properties: { done: { type: "boolean" } }
              }),
              logs: []
            }
          ]
        },
        {
          id: "task_branch_b",
          title: "Branch B",
          dependsOn: ["task_start"],
          completed: false,
          steps: [
            {
              id: "s_branch_b",
              instructions: "Process B",
              completed: false,
              dependsOn: [],
              outputSchema: JSON.stringify({
                type: "object",
                properties: { done: { type: "boolean" } }
              }),
              logs: []
            }
          ]
        },
        {
          id: "task_merge",
          title: "Merge",
          dependsOn: ["task_branch_a", "task_branch_b"],
          completed: false,
          steps: [
            {
              id: "s_merge",
              instructions: "Combine results",
              completed: false,
              dependsOn: [],
              outputSchema: JSON.stringify({
                type: "object",
                properties: { done: { type: "boolean" } }
              }),
              logs: []
            }
          ]
        }
      ]
    };

    const completionOrder: string[] = [];
    const context = createMockContext();
    const origSet = context.set;
    context.set = vi.fn((key: string, value: unknown) => {
      if (key.startsWith("task_")) {
        completionOrder.push(key);
      }
      origSet(key, value);
    });

    const executor = new ParallelTaskExecutor({
      provider: createMockProvider() as never,
      model: "test-model",
      context: context as never,
      tools: [],
      taskPlan: plan
    });

    for await (const _msg of executor.execute()) {
      // consume
    }

    // All tasks should complete
    for (const task of plan.tasks) {
      expect(task.completed).toBe(true);
    }

    // task_start must come first
    const startIdx = completionOrder.indexOf("task_start");
    expect(startIdx).toBe(0);

    // task_merge must come after both branches
    const mergeIdx = completionOrder.indexOf("task_merge");
    const branchAIdx = completionOrder.indexOf("task_branch_a");
    const branchBIdx = completionOrder.indexOf("task_branch_b");
    expect(mergeIdx).toBeGreaterThan(branchAIdx);
    expect(mergeIdx).toBeGreaterThan(branchBIdx);
  });
});
