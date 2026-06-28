/**
 * Integration tests for the opt-in plan cache (TaskPlanner) and checkpoint
 * resume (ParallelTaskExecutor), plus a control proving default behavior is
 * unchanged when neither is provided.
 */

import { describe, it, expect, vi } from "vitest";
import { TaskPlanner } from "../src/task-planner.js";
import { ParallelTaskExecutor } from "../src/parallel-task-executor.js";
import {
  InMemoryPlanCache,
  InMemoryCheckpointStore,
  hashPlanKey,
  type Checkpoint
} from "../src/checkpoint-store.js";
import { BaseProvider, memoryKeys } from "@nodetool-ai/runtime";
import type {
  BaseProvider as BaseProviderType,
  ProcessingContext,
  ProviderStreamItem,
  ToolCall
} from "@nodetool-ai/runtime";
import type { ProcessingMessage } from "@nodetool-ai/protocol";
import type { TaskPlan } from "../src/types.js";
import { createMockContext } from "./_helpers/mock-context.js";

const OBJECTIVE = "Research and write outreach";

function scriptedPlanCalls(): ToolCall[] {
  return [
    {
      id: "tc_add_1",
      name: "add_task",
      args: {
        id: "task_research",
        title: "Research the prospect",
        depends_on: [],
        steps: [
          { id: "task_research_s1", instructions: "Search the web", depends_on: [] }
        ]
      }
    },
    {
      id: "tc_add_2",
      name: "add_task",
      args: {
        id: "task_write",
        title: "Write outreach",
        depends_on: ["task_research"],
        steps: [
          { id: "task_write_s1", instructions: "Draft the email", depends_on: [] }
        ]
      }
    },
    { id: "tc_finish", name: "finish_plan", args: { title: "Outreach Plan" } }
  ];
}

/**
 * Provider that runs its own tool loop (agent SDK style). `loopCalls` counts
 * how many times the planning LLM loop is invoked, so a cache hit (which never
 * enters the loop) is observable.
 */
function createCountingLoopProvider(script: ToolCall[]): {
  provider: BaseProviderType;
  getLoopCalls: () => number;
} {
  let loopCalls = 0;
  const provider = {
    provider: "sdk_loop",
    hasToolSupport: async () => true,
    async *generateMessages(): AsyncGenerator<ProviderStreamItem> {
      yield { type: "chunk", content: "", done: true };
    },
    async *generateMessagesTraced(): AsyncGenerator<ProviderStreamItem> {
      yield { type: "chunk", content: "", done: true };
    },
    async *generateLoop(args: {
      tools?: Array<{
        name: string;
        execute?: (a: Record<string, unknown>) => Promise<string | unknown>;
        terminal?: boolean;
      }>;
      signal?: AbortSignal;
    }): AsyncGenerator<ProviderStreamItem> {
      loopCalls++;
      const toolMap = new Map((args.tools ?? []).map((t) => [t.name, t]));
      for (const tc of script) {
        if (args.signal?.aborted) break;
        yield tc;
        const tool = toolMap.get(tc.name);
        const content = tool?.execute ? await tool.execute(tc.args) : "";
        yield {
          type: "message",
          message: {
            role: "tool",
            toolCallId: tc.id,
            content: typeof content === "string" ? content : JSON.stringify(content)
          }
        };
        if (tool?.terminal) break;
      }
      yield { type: "chunk", content: "", done: true };
    }
  } as unknown as BaseProviderType;
  return { provider, getLoopCalls: () => loopCalls };
}

async function drainPlan(
  gen: AsyncGenerator<ProcessingMessage, TaskPlan | null>
): Promise<{ plan: TaskPlan | null; messages: ProcessingMessage[] }> {
  const messages: ProcessingMessage[] = [];
  let res = await gen.next();
  while (!res.done) {
    messages.push(res.value);
    res = await gen.next();
  }
  return { plan: res.value, messages };
}

/** Step-executing provider that just finishes each step immediately. */
function createStepProvider(): BaseProviderType {
  return {
    provider: "mock",
    hasToolSupport: async () => true,
    generateMessages: async function* () {
      yield {
        id: "tc_1",
        name: "finish_step",
        args: { result: { done: true } }
      };
    },
    async *generateMessagesTraced(...args: unknown[]) {
      yield* (this as { generateMessages: (...a: unknown[]) => AsyncGenerator<ProviderStreamItem> }).generateMessages(
        ...args
      );
    },
    generateLoop(args: unknown) {
      return (
        BaseProvider.prototype as { generateLoop: (a: unknown) => unknown }
      ).generateLoop.call(this, args);
    },
    isContextLengthError: () => false
  } as unknown as BaseProviderType;
}

function twoTaskPlan(): TaskPlan {
  return {
    title: "Resume Plan",
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
}

describe("plan cache (TaskPlanner)", () => {
  it("reuses a cached plan on the second identical planning run", async () => {
    const cache = new InMemoryPlanCache();
    const { provider, getLoopCalls } = createCountingLoopProvider(
      scriptedPlanCalls()
    );

    const planner1 = new TaskPlanner({ provider, model: "opus", tools: [], planCache: cache });
    const first = await drainPlan(
      planner1.planMultiTask(OBJECTIVE, createMockContext() as ProcessingContext)
    );
    expect(first.plan).not.toBeNull();
    expect(getLoopCalls()).toBe(1);

    // Second planner shares the same cache — identical objective + tools + model.
    const planner2 = new TaskPlanner({ provider, model: "opus", tools: [], planCache: cache });
    const second = await drainPlan(
      planner2.planMultiTask(OBJECTIVE, createMockContext() as ProcessingContext)
    );

    // The LLM loop must NOT run again — the result comes from the cache.
    expect(getLoopCalls()).toBe(1);
    expect(second.plan).toEqual(first.plan);
    expect(
      second.messages.some(
        (m) =>
          m.type === "planning_update" &&
          typeof (m as { content?: string }).content === "string" &&
          (m as { content: string }).content.includes("cache hit")
      )
    ).toBe(true);
  });

  it("accepts the cache via the planMultiTask argument too", async () => {
    const cache = new InMemoryPlanCache();
    const { provider, getLoopCalls } = createCountingLoopProvider(
      scriptedPlanCalls()
    );
    const planner = new TaskPlanner({ provider, model: "opus", tools: [] });

    await drainPlan(
      planner.planMultiTask(OBJECTIVE, createMockContext() as ProcessingContext, cache)
    );
    expect(getLoopCalls()).toBe(1);

    await drainPlan(
      planner.planMultiTask(OBJECTIVE, createMockContext() as ProcessingContext, cache)
    );
    expect(getLoopCalls()).toBe(1);
  });

  it("CONTROL: no cache means the LLM loop runs every time", async () => {
    const { provider, getLoopCalls } = createCountingLoopProvider(
      scriptedPlanCalls()
    );
    const planner = new TaskPlanner({ provider, model: "opus", tools: [] });

    await drainPlan(
      planner.planMultiTask(OBJECTIVE, createMockContext() as ProcessingContext)
    );
    await drainPlan(
      planner.planMultiTask(OBJECTIVE, createMockContext() as ProcessingContext)
    );
    expect(getLoopCalls()).toBe(2);
  });
});

describe("checkpoint resume (ParallelTaskExecutor)", () => {
  function planHashFor(plan: TaskPlan, tools: string[] = []): string {
    return hashPlanKey({
      objective: `${plan.title}\n${plan.tasks.map((t) => t.id).join(",")}`,
      tools
    });
  }

  it("skips tasks marked complete in a saved checkpoint", async () => {
    const plan = twoTaskPlan();
    const store = new InMemoryCheckpointStore();
    const runId = "run-resume-1";

    // Seed a checkpoint that says task_a is already done.
    const checkpoint: Checkpoint = {
      planHash: planHashFor(plan),
      completedTaskIds: ["task_a"],
      taskResults: { task_a: { done: true, fromCheckpoint: true } }
    };
    store.save(runId, checkpoint);

    const executedSteps: string[] = [];
    const provider = createStepProvider();
    // Spy on generateLoop to record which steps actually ran.
    const origLoop = (provider as { generateLoop: (a: { messages?: { content?: string }[] }) => AsyncGenerator<ProviderStreamItem> }).generateLoop.bind(provider);
    (provider as { generateLoop: unknown }).generateLoop = vi.fn(
      (args: { messages?: { content?: string }[] }) => {
        const text = (args.messages ?? []).map((m) => m.content ?? "").join(" ");
        if (text.includes("Do A")) executedSteps.push("task_a");
        if (text.includes("Do B")) executedSteps.push("task_b");
        return origLoop(args);
      }
    );

    const context = createMockContext();
    const executor = new ParallelTaskExecutor({
      provider,
      model: "test-model",
      context: context as never,
      tools: [],
      taskPlan: plan,
      checkpointStore: store,
      runId
    });

    for await (const _msg of executor.execute()) {
      // consume
    }

    // task_a was resumed from the checkpoint — only task_b runs.
    expect(executedSteps).not.toContain("task_a");
    expect(executedSteps).toContain("task_b");
    expect(plan.tasks[0].completed).toBe(true);
    expect(plan.tasks[1].completed).toBe(true);

    // The checkpoint's task_a result is seeded into memory.
    expect(context.memory.getValue(memoryKeys.task("task_a"))).toEqual({
      done: true,
      fromCheckpoint: true
    });
  });

  it("persists a checkpoint as tasks complete", async () => {
    const plan = twoTaskPlan();
    const store = new InMemoryCheckpointStore();
    const runId = "run-persist-1";

    const executor = new ParallelTaskExecutor({
      provider: createStepProvider(),
      model: "test-model",
      context: createMockContext() as never,
      tools: [],
      taskPlan: plan,
      checkpointStore: store,
      runId
    });

    for await (const _msg of executor.execute()) {
      // consume
    }

    const saved = store.load(runId);
    expect(saved).toBeDefined();
    expect(saved!.completedTaskIds.sort()).toEqual(["task_a", "task_b"]);
    expect(saved!.taskResults).toBeDefined();
  });

  it("CONTROL: no checkpoint store runs every task and persists nothing", async () => {
    const plan = twoTaskPlan();
    const executedSteps: string[] = [];
    const provider = createStepProvider();
    const origLoop = (provider as { generateLoop: (a: { messages?: { content?: string }[] }) => AsyncGenerator<ProviderStreamItem> }).generateLoop.bind(provider);
    (provider as { generateLoop: unknown }).generateLoop = vi.fn(
      (args: { messages?: { content?: string }[] }) => {
        const text = (args.messages ?? []).map((m) => m.content ?? "").join(" ");
        if (text.includes("Do A")) executedSteps.push("task_a");
        if (text.includes("Do B")) executedSteps.push("task_b");
        return origLoop(args);
      }
    );

    const executor = new ParallelTaskExecutor({
      provider,
      model: "test-model",
      context: createMockContext() as never,
      tools: [],
      taskPlan: plan
    });

    for await (const _msg of executor.execute()) {
      // consume
    }

    // Both tasks run — no checkpoint to skip from.
    expect(executedSteps.sort()).toEqual(["task_a", "task_b"]);
    expect(plan.tasks.every((t) => t.completed)).toBe(true);
  });
});
