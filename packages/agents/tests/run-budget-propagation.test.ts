/**
 * One budget per run, shared downward (invariant I-2).
 *
 * A cap that a child re-creates is not a cap: three children under a $1.25
 * turn each get $1.25 of their own and the run spends $5. So the assertions
 * here are about the *total* across every loop a turn opens, and about the
 * permit pool that keeps a fan-out from opening twenty provider conversations
 * at once.
 *
 * The provider is scripted but its loop is real (`BaseProvider.generateLoop`),
 * so admission is exercised where it actually lives: reserve before a turn,
 * commit the provider's own reported cost after it.
 */

import { describe, it, expect, vi } from "vitest";
import {
  BaseProvider,
  ProcessingContext,
  createRunBudget
} from "@nodetool-ai/runtime";
import type { RunBudget } from "@nodetool-ai/runtime";
import {
  BackgroundSubtaskRegistry,
  ParallelTaskExecutor,
  RunSubtaskTool,
  StartSubtaskTool
} from "../src/index.js";
import { MAX_BACKGROUND_SUBTASKS_PER_TURN } from "../src/tools/start-subtask-tool.js";
import type { TaskPlan } from "../src/types.js";
import { createLoopingMockProvider } from "./_helpers/looping-mock-provider.js";
import { isString } from "../src/utils/type-guards.js";

/** A model the price catalog covers, so a turn has a knowable worst case. */
const PRICED_MODEL = "gpt-4o-mini";

/**
 * $0.60 of output at gpt-4o-mini's rate: the worst case every reservation is
 * measured against, and above the $0.50 each turn actually reports, so the cap
 * holds rather than being crossed by an under-reserved turn.
 */
const MAX_OUTPUT_TOKENS = 1_000_000;
const TURN_COST_USD = 0.5;
/** Room for two turns' worst case, not three. */
const CAP_USD = 1.25;

function makeCtx(): ProcessingContext {
  return new ProcessingContext({ jobId: "budget-test", userId: "test" });
}

function makeBudget(overrides: Partial<Parameters<typeof createRunBudget>[0]> = {}): RunBudget {
  return createRunBudget({
    capUsd: CAP_USD,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    unpricedTokenCeiling: 0,
    deadlineMs: Infinity,
    maxConcurrency: 8,
    maxTurns: 50,
    ...overrides
  });
}

function answersOnce() {
  return createLoopingMockProvider(
    [[{ type: "chunk", content: "child answer", done: true }]],
    { provider: "openai", costPerTurn: TURN_COST_USD, repeatLast: true }
  );
}

describe("run budget propagation", () => {
  it("spends at most the parent's cap across the parent and three children", async () => {
    const budget = makeBudget();

    // The parent turn — what a chat turn does with the budget it created.
    const parent = createLoopingMockProvider(
      [[{ type: "chunk", content: "parent turn", done: true }]],
      { provider: "openai", costPerTurn: TURN_COST_USD }
    );
    for await (const _ of parent.generateLoop({
      model: PRICED_MODEL,
      messages: [{ role: "user", content: "go" }],
      turnBudget: budget,
      maxIterations: 1
    } as never)) {
      // drained; the assertions are on the budget, not the stream
    }

    const ctx = makeCtx();
    const children = [answersOnce(), answersOnce(), answersOnce()];
    const results: Array<unknown> = [];
    for (const provider of children) {
      const tool = new RunSubtaskTool({
        provider,
        model: PRICED_MODEL,
        parentTools: () => [],
        forwardMessage: () => {},
        // The parent's budget, not one of the child's own.
        budget
      });
      results.push(
        await tool.process(ctx, { description: "d", prompt: "do a thing" })
      );
    }

    // Measured off the providers themselves, not off the budget's own books:
    // a child spending outside the budget would leave `spentUsd` looking fine.
    const billed =
      parent.getTotalCost() +
      children.reduce((sum, c) => sum + c.getTotalCost(), 0);
    expect(billed).toBeLessThanOrEqual(CAP_USD);
    expect(budget.turns.spentUsd).toBeLessThanOrEqual(CAP_USD);
    // The parent's turn plus one child's fits; the other two are refused
    // before they open a conversation.
    expect(parent.turnsStarted).toBe(1);
    expect(children.filter((c) => c.turnsStarted > 0)).toHaveLength(1);
    expect(budget.exhausted?.kind).toBe("cost");

    const refused = results.filter(
      (r) => (r as { error?: string }).error === "subtask_failed"
    );
    expect(refused).toHaveLength(2);
    expect(String((refused[0] as { message: string }).message)).toContain(
      "turn budget"
    );
  });

  it("holds the cap when the loops overlap", async () => {
    // The sequential case above never has two reservations outstanding at
    // once. Concurrency is where a shared reservation counter fails: one
    // loop's commit must not hand back the headroom another loop is holding.
    const budget = makeBudget();
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const child = (gateMs: number) =>
      createLoopingMockProvider(
        [[{ type: "chunk", content: "child answer", done: true }]],
        {
          provider: "openai",
          costPerTurn: TURN_COST_USD,
          repeatLast: true,
          gate: () => sleep(gateMs)
        }
      );

    const ctx = makeCtx();
    const run = (provider: ReturnType<typeof child>) =>
      new RunSubtaskTool({
        provider,
        model: PRICED_MODEL,
        parentTools: () => [],
        forwardMessage: () => {},
        budget
      }).process(ctx, { description: "d", prompt: "do a thing" });

    // A finishes early; B stays in flight; C asks for a turn in between.
    const a = child(20);
    const b = child(1500);
    const c = child(20);
    const pending = [run(a), run(b)];
    await sleep(400);
    pending.push(run(c));
    await Promise.all(pending);

    const billed = [a, b, c].reduce((sum, p) => sum + p.getTotalCost(), 0);
    expect(billed).toBeLessThanOrEqual(CAP_USD);
    expect(budget.exhausted?.kind).toBe("cost");
  }, 20_000);

  it("reaches every step of a plan the DAG executors run", async () => {
    // `execute_plan` hands the plan to `ParallelTaskExecutor`, which builds a
    // `TaskExecutor` per task and a `CodeActExecutor` per step. A budget that
    // stops at any of those layers is a plan that spends without a cap.
    const budget = makeBudget({ capUsd: 0 });
    const provider = createLoopingMockProvider(
      [[{ type: "chunk", content: "step answer", done: true }]],
      { provider: "openai", repeatLast: true }
    );
    const executor = new ParallelTaskExecutor({
      provider,
      model: PRICED_MODEL,
      context: makeCtx(),
      tools: [],
      taskPlan: {
        title: "plan",
        tasks: [
          {
            id: "t1",
            title: "T1",
            steps: [
              {
                id: "s1",
                instructions: "do a thing",
                completed: false,
                dependsOn: [],
                logs: []
              }
            ]
          }
        ]
      },
      budget
    });

    for await (const _ of executor.execute()) {
      // drained
    }

    expect(provider.turnsStarted).toBe(0);
    expect(executor.getFailedTaskIds()).toContain("t1");
    expect(budget.exhausted?.kind).toBe("cost");
  });

  it("keeps a fan-out of background children inside the run's permit pool, and caps it", async () => {
    const budget = makeBudget({ capUsd: null, maxConcurrency: 2, maxTurns: 100 });
    const registry = new BackgroundSubtaskRegistry();

    let active = 0;
    let peak = 0;
    const provider = createLoopingMockProvider(
      [[{ type: "chunk", content: "child answer", done: true }]],
      {
        provider: "openai",
        repeatLast: true,
        onTurnStart: () => {
          active++;
          peak = Math.max(peak, active);
        },
        onTurnEnd: () => {
          active--;
        },
        // Hold every turn open long enough for the others to pile up behind
        // the permit pool if nothing were bounding them.
        gate: () => new Promise((r) => setTimeout(r, 5))
      }
    );

    const tool = new StartSubtaskTool({
      provider,
      model: PRICED_MODEL,
      parentTools: () => [],
      forwardMessage: () => {},
      background: registry,
      budget
    });

    const ctx = makeCtx();
    const fanOut = MAX_BACKGROUND_SUBTASKS_PER_TURN;
    for (let i = 0; i < fanOut; i++) {
      const receipt = (await tool.process(ctx, {
        description: `job ${i}`,
        prompt: "work"
      })) as Record<string, unknown>;
      expect(receipt.status).toBe("running");
    }
    // Past the cap the registry admits nothing more, and says so by name.
    const refused = (await tool.process(ctx, {
      description: "one too many",
      prompt: "work"
    })) as Record<string, unknown>;
    expect(refused.error).toBe("background_limit_reached");
    expect(registry.size).toBe(fanOut);

    await vi.waitFor(() => expect(registry.runningCount).toBe(0), {
      timeout: 10_000
    });

    expect(provider.turnsStarted).toBe(fanOut);
    expect(peak).toBeLessThanOrEqual(2);
  }, 20_000);

  it("bounds every layer of a plan — tasks, steps and their sub-agents — by one pool", async () => {
    // The pool used to bound the outermost merge only: every nested
    // `TaskExecutor` saw the branch holding a permit and ran its steps on a
    // pool of its own, and every sub-agent under a step took no permit at all.
    // Three tasks of three steps, each step spawning two `run_subtask`
    // children, under two permits: never more than two conversations open.
    const budget = makeBudget({
      capUsd: null,
      maxConcurrency: 2,
      maxTurns: 500
    });

    let active = 0;
    let peak = 0;
    const provider = {
      provider: "mock",
      hasToolSupport: async () => true,
      getTotalCost: () => 0,
      async *generateMessages(opts: {
        messages?: Array<{ role: string; content?: unknown }>;
      }) {
        active++;
        peak = Math.max(peak, active);
        try {
          // Long enough for every other loop to reach its own turn, so an
          // unbounded layer piles up rather than serialising by accident.
          await new Promise((r) => setTimeout(r, 8));
          const history = opts.messages ?? [];
          const text = history
            .map((m) => (isString(m.content) ? m.content : ""))
            .join(" ");
          if (history.some((m) => m.role === "tool")) {
            // The step's second turn: its children have answered.
            yield {
              type: "message" as const,
              message: { role: "assistant", content: "done" }
            };
          } else if (text.includes("CHILD:")) {
            yield {
              type: "message" as const,
              message: { role: "assistant", content: "child answer" }
            };
          } else {
            const step = text.match(/STEP:([a-z_0-9]+)/)?.[1] ?? "?";
            for (const n of [1, 2]) {
              yield {
                id: `${step}_child_${n}`,
                name: "run_subtask",
                args: { description: `child ${n}`, prompt: `CHILD:${step}_${n}` }
              };
            }
          }
        } finally {
          active--;
        }
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
      _admitTurn(...args: unknown[]) {
        return (
          BaseProvider.prototype as unknown as {
            _admitTurn: (...a: unknown[]) => unknown;
          }
        )._admitTurn.apply(provider, args);
      },
      async generateMessageTraced() {
        return null;
      },
      generateMessage: vi.fn(),
      getAvailableLanguageModels: vi.fn().mockResolvedValue([]),
      getContainerEnv: () => ({}),
      isContextLengthError: () => false
    } as unknown as BaseProvider;

    const tasks: TaskPlan["tasks"] = ["a", "b", "c"].map((t) => ({
      id: `task_${t}`,
      title: `Task ${t}`,
      steps: [1, 2, 3].map((n) => ({
        id: `${t}_s${n}`,
        instructions: `STEP:${t}_s${n}`,
        completed: false,
        dependsOn: [],
        logs: []
      }))
    }));
    const executor = new ParallelTaskExecutor({
      provider,
      model: "test-model",
      context: makeCtx(),
      tools: [
        new RunSubtaskTool({
          provider,
          model: "test-model",
          parentTools: () => [],
          forwardMessage: () => {},
          budget
        })
      ],
      taskPlan: { title: "wide plan", tasks },
      budget
    });

    for await (const _ of executor.execute()) {
      // drained
    }

    expect(executor.getFailedTaskIds()).toEqual([]);
    // 9 steps × 2 turns + 18 children × 1 turn.
    expect(budget.turnCount.current).toBe(36);
    expect(peak).toBeLessThanOrEqual(2);
  }, 30_000);
});
