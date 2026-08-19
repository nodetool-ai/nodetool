/**
 * Failure semantics and per-step tool allow-lists in task mode.
 *
 * A failed step is terminal but not completed, so dependents never run on it;
 * a plan's per-step `tools` list is a privilege boundary that task mode must
 * enforce the same way script mode does.
 */
import { describe, it, expect, vi } from "vitest";
import { TaskExecutor } from "../src/task-executor.js";
import { Tool } from "../src/tools/base-tool.js";
import type { Step, Task } from "../src/types.js";
import type { ProcessingMessage, StepResult } from "@nodetool-ai/protocol";
import { BaseProvider } from "@nodetool-ai/runtime";
import { createMockContext } from "./_helpers/mock-context.js";

class NoopTool extends Tool {
  readonly description = "test tool";
  constructor(readonly name: string) {
    super();
  }
  async process(): Promise<unknown> {
    return "ok";
  }
}

/**
 * Provider whose steps finish from a plain assistant message, except for the
 * step ids in `failing`, which never produce one (the model gave up).
 */
function createProvider(failing: string[] = []) {
  const seenPrompts: Record<string, string> = {};
  const provider = {
    provider: "mock",
    hasToolSupport: async () => true,
    generateMessages: async function* (opts: any) {
      const text = (opts.messages ?? [])
        .map((m: { content?: string }) => m.content ?? "")
        .join(" ");
      const stepId = failing.find((id) => text.includes(`Do ${id}`));
      if (stepId) {
        // The provider blew up: no result, no final message.
        throw new Error(`provider failed on ${stepId}`);
      }
      yield {
        type: "message" as const,
        message: { role: "assistant", content: "done" }
      };
    },
    async *generateMessagesTraced(...args: any[]) {
      const opts = args[0] ?? {};
      const text = (opts.messages ?? [])
        .map((m: { content?: string }) => m.content ?? "")
        .join(" ");
      const match = text.match(/Do (s\d+)/);
      if (match) seenPrompts[match[1]] = text;
      yield* (this as any).generateMessages(...args);
    },
    generateLoop(args: any) {
      return (BaseProvider.prototype as any).generateLoop.call(this, args);
    },
    async generateMessageTraced() {
      return null;
    },
    generateMessage: vi.fn(),
    getAvailableLanguageModels: vi.fn().mockResolvedValue([]),
    getContainerEnv: () => ({}),
    isContextLengthError: () => false
  } as any;
  return { provider, seenPrompts };
}

function makeStep(id: string, extra: Partial<Step> = {}): Step {
  return {
    id,
    instructions: `Do ${id}`,
    completed: false,
    dependsOn: [],
    logs: [],
    ...extra
  };
}

async function run(executor: TaskExecutor): Promise<ProcessingMessage[]> {
  const messages: ProcessingMessage[] = [];
  for await (const msg of executor.executeTasks()) messages.push(msg);
  return messages;
}

describe("TaskExecutor failure semantics", () => {
  it("blocks a dependent when its dependency fails", async () => {
    const s1 = makeStep("s1");
    const s2 = makeStep("s2", { dependsOn: ["s1"] });
    const task: Task = { id: "t1", title: "T", steps: [s1, s2] };
    const { provider } = createProvider(["s1"]);

    const messages = await run(
      new TaskExecutor({
        provider,
        model: "m",
        context: createMockContext(),
        tools: [],
        task,
        maxStepIterations: 1
      })
    );

    expect(s1.completed).toBe(false);
    expect(s1.failed).toBe(true);
    // The dependent never ran, and it is terminal rather than pending.
    expect(s2.completed).toBe(false);
    expect(s2.failed).toBe(true);
    expect(s2.error).toContain("dependency s1 failed");

    const results = messages.filter(
      (m): m is StepResult => m.type === "step_result"
    );
    expect(results.every((r) => Boolean(r.error))).toBe(true);
  });

  it("does not overwrite a failed step's state with a completion", async () => {
    const s1 = makeStep("s1");
    const task: Task = { id: "t1", title: "T", steps: [s1] };
    const { provider } = createProvider(["s1"]);

    const messages = await run(
      new TaskExecutor({
        provider,
        model: "m",
        context: createMockContext(),
        tools: [],
        task,
        maxStepIterations: 1
      })
    );

    const events = messages
      .filter((m) => m.type === "task_update")
      .map((m) => (m as { event: string }).event);
    expect(events).toContain("step_failed");
    expect(events).not.toContain("step_completed");
  });
});

describe("TaskExecutor step tool allow-lists", () => {
  it("hands a step only the tools its plan declared", async () => {
    const step = makeStep("s1", { tools: ["allowed"] });
    const task: Task = { id: "t1", title: "T", steps: [step] };
    const { provider, seenPrompts } = createProvider();

    await run(
      new TaskExecutor({
        provider,
        model: "m",
        context: createMockContext(),
        tools: [new NoopTool("allowed"), new NoopTool("forbidden")],
        task
      })
    );

    // Code actions reach the toolbelt through the sandbox, so what a step may
    // call shows up in the documented tool catalog, not in the provider tools.
    expect(seenPrompts["s1"]).toContain("await allowed(");
    expect(seenPrompts["s1"]).not.toContain("await forbidden(");
  });

  it("hands a step every tool when the plan declared no list", async () => {
    const step = makeStep("s1");
    const task: Task = { id: "t1", title: "T", steps: [step] };
    const { provider, seenPrompts } = createProvider();

    await run(
      new TaskExecutor({
        provider,
        model: "m",
        context: createMockContext(),
        tools: [new NoopTool("allowed"), new NoopTool("forbidden")],
        task
      })
    );

    expect(seenPrompts["s1"]).toContain("await allowed(");
    expect(seenPrompts["s1"]).toContain("await forbidden(");
  });

  it("grants nothing for an empty allow-list rather than falling back to all", () => {
    const step = makeStep("s1", { tools: [] });
    const task: Task = { id: "t1", title: "T", steps: [step] };
    const executor = new TaskExecutor({
      provider: createProvider().provider,
      model: "m",
      context: createMockContext(),
      tools: [new NoopTool("allowed")],
      task
    });

    const tools = (
      executor as unknown as { toolsForStep(s: Step): Tool[] }
    ).toolsForStep(step);
    expect(tools).toEqual([]);
  });
});
