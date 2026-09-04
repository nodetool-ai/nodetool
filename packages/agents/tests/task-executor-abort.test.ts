/**
 * Cancellation settles every step as aborted, terminally and once.
 *
 * On abort the merge stops draining, so the terminal events the in-flight
 * step's own executor yields land in a queue nobody reads; the executor used
 * to then settle it with nothing because `step.failed` was already set. And a
 * cancelled run cascaded to dependents as "dependency failed", which sends the
 * reader after a bug that is not there.
 */
import { describe, it, expect, vi } from "vitest";
import { BaseProvider } from "@nodetool-ai/runtime";
import type { ProcessingMessage, StepResult } from "@nodetool-ai/protocol";
import { TaskExecutor } from "../src/task-executor.js";
import type { Step, Task } from "../src/types.js";
import { createMockContext } from "./_helpers/mock-context.js";

/** A provider whose turn ends only when the run's signal fires. */
function abortAwareProvider() {
  let turns = 0;
  const provider = {
    provider: "mock",
    hasToolSupport: async () => true,
    async *generateMessages(opts: { signal?: AbortSignal }) {
      turns++;
      const signal = opts.signal;
      await new Promise<void>((resolve) => {
        if (!signal || signal.aborted) {
          resolve();
          return;
        }
        signal.addEventListener("abort", () => resolve(), { once: true });
      });
    },
    async *generateMessagesTraced(...args: unknown[]) {
      yield* (
        provider as {
          generateMessages: (...a: unknown[]) => AsyncGenerator<unknown>;
        }
      ).generateMessages(...args);
    },
    generateLoop(args: unknown) {
      return (
        BaseProvider.prototype as { generateLoop: (a: unknown) => unknown }
      ).generateLoop.call(provider, args);
    },
    async generateMessageTraced() {
      return null;
    },
    generateMessage: vi.fn(),
    getAvailableLanguageModels: vi.fn().mockResolvedValue([]),
    getContainerEnv: () => ({}),
    isContextLengthError: () => false,
    turns: () => turns
  };
  return provider;
}

function makeStep(id: string, dependsOn: string[] = []): Step {
  return { id, instructions: `Do ${id}`, completed: false, dependsOn, logs: [] };
}

describe("TaskExecutor on abort", () => {
  it("emits one terminal step_result per step, worded as aborted", async () => {
    const s1 = makeStep("s1");
    const s2 = makeStep("s2", ["s1"]);
    const task: Task = { id: "t1", title: "Test", steps: [s1, s2] };
    const controller = new AbortController();
    const provider = abortAwareProvider();

    const executor = new TaskExecutor({
      provider: provider as unknown as BaseProvider,
      model: "test-model",
      context: createMockContext(),
      tools: [],
      task,
      signal: controller.signal
    });

    const messages: ProcessingMessage[] = [];
    for await (const msg of executor.executeTasks()) {
      messages.push(msg);
      // Stop once s1 is in flight.
      if (msg.type === "task_update" && msg.event === "step_started") {
        setTimeout(() => controller.abort(), 10);
      }
    }

    // s1 was running when Stop was pressed; s2 never started.
    expect(provider.turns()).toBe(1);
    const results = messages.filter(
      (m): m is StepResult => m.type === "step_result"
    );
    expect(results.map((r) => r.step.id).sort()).toEqual(["s1", "s2"]);
    for (const result of results) {
      expect(result.error).toContain("aborted");
    }
    expect(
      messages.filter(
        (m) => m.type === "task_update" && m.event === "step_failed"
      )
    ).toHaveLength(2);
    // Cancellation is not a dependency failure.
    const worded = messages
      .map((m) => JSON.stringify(m))
      .filter((text) => /dependency/i.test(text));
    expect(worded).toEqual([]);
    for (const step of task.steps) {
      expect(step.failed).toBe(true);
      expect(step.completed).toBe(false);
    }
  });
});
