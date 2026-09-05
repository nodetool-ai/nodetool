import { describe, it, expect, vi } from "vitest";
import { ParallelTaskExecutor } from "../src/parallel-task-executor.js";
import type { TaskPlan } from "../src/types.js";
import type { ProcessingMessage, StepResult } from "@nodetool-ai/protocol";
import { memoryKeys, BaseProvider } from "@nodetool-ai/runtime";
import { createMockContext } from "./_helpers/mock-context.js";
import { finishAction } from "./_helpers/codeact-provider.js";

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
    async *generateMessagesTraced(...args: unknown[]) {
      yield* (this as ReturnType<typeof createMockProvider>).generateMessages(
        ...(args as Parameters<
          ReturnType<typeof createMockProvider>["generateMessages"]
        >)
      );
    },
    generateLoop(args: unknown) {
      return (
        BaseProvider.prototype as { generateLoop: (a: unknown) => unknown }
      ).generateLoop.call(this, args);
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

  it("does not fail a schema'd step whose requested shape carries an `error` field", async () => {
    // A schema that declares `error` asked for that key; a non-empty string in
    // it is the step's data, not the `{ error }` payload a dying step writes.
    // `detectTaskFailure` used to settle it without the schema flag and mark
    // the task failed, blocking its dependents.
    const provider = {
      ...createMockProvider(),
      generateMessages: async function* () {
        yield finishAction({ error: "no errors found", ok: true });
      }
    } as unknown as ReturnType<typeof createMockProvider>;
    const plan: TaskPlan = {
      title: "Schema Plan",
      tasks: [
        {
          id: "check",
          title: "Check",
          dependsOn: [],
          completed: false,
          steps: [
            {
              id: "check_s1",
              instructions: "Report",
              completed: false,
              dependsOn: [],
              outputSchema: JSON.stringify({
                type: "object",
                properties: {
                  error: { type: "string" },
                  ok: { type: "boolean" }
                }
              }),
              logs: []
            }
          ]
        },
        {
          id: "after",
          title: "After",
          dependsOn: ["check"],
          completed: false,
          steps: [
            {
              id: "after_s1",
              instructions: "Use it",
              completed: false,
              dependsOn: [],
              outputSchema: JSON.stringify({
                type: "object",
                properties: {
                  error: { type: "string" },
                  ok: { type: "boolean" }
                }
              }),
              logs: []
            }
          ]
        }
      ]
    };

    const executor = new ParallelTaskExecutor({
      provider: provider as never,
      model: "test-model",
      context: createMockContext() as never,
      tools: [],
      taskPlan: plan
    });
    for await (const _msg of executor.execute()) {
      // consume
    }

    expect(executor.getFailedTaskIds()).toEqual([]);
    expect(plan.tasks.map((t) => t.completed)).toEqual([true, true]);
    expect(executor.getTaskResult("check")).toEqual({
      error: "no errors found",
      ok: true
    });
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
    context.memory.subscribe((entry: { kind: string; source?: string }) => {
      if (entry.kind === "task_result" && entry.source) {
        completionOrder.push(entry.source);
      }
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
    // A deadlocked plan is a failure, reported as one: an error log plus a
    // terminal task_update. It used to surface only as a prose chunk, which
    // every status-reading consumer scored as success.
    expect(executor.getFailedTaskIds()).toEqual(["task_stuck"]);
    expect(
      messages.some(
        (m) =>
          m.type === "log_update" &&
          (m as { severity?: string }).severity === "error"
      )
    ).toBe(true);
    expect(
      messages.some(
        (m) =>
          m.type === "task_update" && (m as { event?: string }).event === "task_failed"
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

    expect(context.memory.has(memoryKeys.input("myKey"))).toBe(true);
    expect(context.memory.getValue(memoryKeys.input("myKey"))).toBe("myValue");
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
    context.memory.subscribe((entry: { kind: string; source?: string }) => {
      if (entry.kind === "task_result" && entry.source) {
        completionOrder.push(entry.source);
      }
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

  it("emits a terminal task_failed update when a step never completes", async () => {
    // Regression: a failed task used to yield only a log_update, never a
    // terminal task_update, leaving lifecycle consumers stuck "in progress".
    const provider = {
      ...createMockProvider(),
      generateMessages: async function* () {
        // Never calls finish_step, so the step exhausts its iteration budget.
        yield { type: "chunk" as const, content: "thinking...", done: false };
      }
    } as never;

    const plan: TaskPlan = {
      title: "Failing Plan",
      tasks: [
        {
          id: "task_1",
          title: "Doomed",
          dependsOn: [],
          completed: false,
          steps: [
            {
              id: "s1",
              instructions: "do the impossible",
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
      provider,
      model: "test-model",
      context: createMockContext() as never,
      tools: [],
      taskPlan: plan,
      maxStepIterations: 1
    });

    const events: string[] = [];
    for await (const msg of executor.execute()) {
      if (msg.type === "task_update") {
        events.push((msg as { event: string }).event);
      }
    }

    expect(events).toContain("task_failed");
    expect(events).not.toContain("task_completed");
    expect(plan.tasks[0].completed).toBe(false);
  });

  it("treats an all-error array result as a task failure", async () => {
    // Regression: a step stores an array and is marked completed even when
    // every element errored. An array never settles as a failure on its own,
    // so the task used to be recorded as a success — the elements decide.
    const provider = {
      ...createMockProvider(),
      generateMessages: async function* () {
        // Every ephemeral item fails (never finishes).
        yield { type: "chunk" as const, content: "...", done: false };
      }
    } as never;

    const context = createMockContext();
    context.memory.set({
      key: memoryKeys.step("discover"),
      kind: "step_result",
      value: ["one", "two"],
      source: "discover",
      title: "discover"
    });

    const plan: TaskPlan = {
      title: "Fan-out Failure Plan",
      tasks: [
        {
          id: "task_1",
          title: "Fan-out",
          dependsOn: [],
          completed: false,
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
                properties: { ok: { type: "boolean" } }
              }),
              logs: []
            }
          ] as never
        }
      ]
    };

    const executor = new ParallelTaskExecutor({
      provider,
      model: "test-model",
      context: context as never,
      tools: [],
      taskPlan: plan,
      maxStepIterations: 1
    });

    const events: string[] = [];
    for await (const msg of executor.execute()) {
      if (msg.type === "task_update") {
        events.push((msg as { event: string }).event);
      }
    }

    expect(events).toContain("task_failed");
    expect(events).not.toContain("task_completed");
  });
  it("starts a short task's dependent before a long sibling finishes", async () => {
    // The round loop made a plan as slow as its slowest sibling: the dependent
    // of the short task waited for the long one because both sat in the same
    // barrier. Here the long step is held open until the dependent has started,
    // so a barrier cannot pass this — it would deadlock until the escape timer
    // fires, which the assertion reads.
    let openLongStep = (): void => {};
    const longStepGate = new Promise<void>((resolve) => {
      openLongStep = resolve;
    });
    let escapeTimerFired = false;
    const escape = setTimeout(() => {
      escapeTimerFired = true;
      openLongStep();
    }, 2000);

    const provider = {
      ...createMockProvider(),
      generateMessages: async function* (args: { messages?: unknown[] }) {
        const text = JSON.stringify(args?.messages ?? "");
        if (text.includes("Do long")) {
          await longStepGate;
        } else {
          // The short branch is genuinely quicker, not merely unordered.
          await new Promise((r) => setTimeout(r, 5));
        }
        yield finishAction({ done: true });
      }
    } as never;

    const step = (id: string, instructions: string) => ({
      id,
      instructions,
      completed: false,
      dependsOn: [] as string[],
      outputSchema: JSON.stringify({
        type: "object",
        properties: { done: { type: "boolean" } }
      }),
      logs: []
    });

    const plan: TaskPlan = {
      title: "Unequal Plan",
      tasks: [
        {
          id: "task_long",
          title: "Long",
          dependsOn: [],
          completed: false,
          steps: [step("s_long", "Do long")]
        },
        {
          id: "task_short",
          title: "Short",
          dependsOn: [],
          completed: false,
          steps: [step("s_short", "Do short")]
        },
        {
          id: "task_after",
          title: "After",
          dependsOn: ["task_short"],
          completed: false,
          steps: [step("s_after", "Do after")]
        }
      ]
    };

    const executor = new ParallelTaskExecutor({
      provider,
      model: "test-model",
      context: createMockContext() as never,
      tools: [],
      taskPlan: plan
    });

    const order: string[] = [];
    for await (const msg of executor.execute()) {
      if (msg.type !== "task_update") continue;
      const update = msg as { event: string; task?: { id?: string } };
      if (update.event === "task_created" && update.task?.id === "task_after") {
        order.push("after_started");
        // The dependent is running; the long sibling may finish now.
        openLongStep();
      }
      if (update.event === "task_completed" && update.task?.id === "task_long") {
        order.push("long_completed");
      }
    }
    clearTimeout(escape);

    expect(escapeTimerFired).toBe(false);
    expect(order).toEqual(["after_started", "long_completed"]);
    expect(plan.tasks.every((t) => t.completed)).toBe(true);
  });

  it("emits the lifecycle stream the round-based executor emitted", async () => {
    // R9: consumers order on this stream — a task's `task_update` before the
    // first `step_update` of that task, and its terminal update before any
    // event of a task that depended on it. Recorded from the round loop for
    // this fixture; the only events it emitted that are gone are the per-round
    // "Running N task(s) in parallel" logs, which no longer have rounds.
    const step = (id: string, dependsOn: string[] = []) => ({
      id,
      instructions: `Do ${id}`,
      completed: false,
      dependsOn,
      outputSchema: JSON.stringify({
        type: "object",
        properties: { done: { type: "boolean" } }
      }),
      logs: []
    });

    const plan: TaskPlan = {
      title: "Parity Plan",
      tasks: [
        {
          id: "t_a",
          title: "A",
          dependsOn: [],
          completed: false,
          steps: [step("s_a1"), step("s_a2", ["s_a1"])]
        },
        {
          id: "t_b",
          title: "B",
          dependsOn: ["t_a"],
          completed: false,
          steps: [step("s_b1")]
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

    const stream: string[] = [];
    for await (const msg of executor.execute()) {
      if (msg.type === "chunk" || msg.type === "log_update") continue;
      const m = msg as {
        type: string;
        event?: string;
        step?: { id?: string };
        task?: { id?: string };
        node_id?: string;
      };
      const id = m.step?.id ?? m.task?.id ?? m.node_id ?? "";
      stream.push(`${m.type}${m.event ? ":" + m.event : ""}/${id}`);
    }

    expect(stream).toEqual([
      "task_update:task_created/t_a",
      "task_update:step_started/s_a1",
      "tool_call_update/s_a1",
      "task_update:step_completed/s_a1",
      "step_result/s_a1",
      "task_update:step_started/s_a2",
      "tool_call_update/s_a2",
      "task_update:step_completed/s_a2",
      "step_result/s_a2",
      "task_update:task_completed/t_a",
      "task_update:task_created/t_b",
      "task_update:step_started/s_b1",
      "tool_call_update/s_b1",
      "task_update:step_completed/s_b1",
      "step_result/s_b1",
      "task_update:task_completed/t_b"
    ]);
  });
});
