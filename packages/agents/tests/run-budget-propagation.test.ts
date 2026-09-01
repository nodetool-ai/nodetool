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
import { ProcessingContext, createRunBudget } from "@nodetool-ai/runtime";
import type { RunBudget } from "@nodetool-ai/runtime";
import {
  BackgroundSubtaskRegistry,
  ParallelTaskExecutor,
  RunSubtaskTool,
  StartSubtaskTool
} from "../src/index.js";
import { createLoopingMockProvider } from "./_helpers/looping-mock-provider.js";

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

  it("keeps a fan-out of twenty background children inside the run's permit pool", async () => {
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
    for (let i = 0; i < 20; i++) {
      const receipt = (await tool.process(ctx, {
        description: `job ${i}`,
        prompt: "work"
      })) as Record<string, unknown>;
      expect(receipt.status).toBe("running");
    }

    await vi.waitFor(() => expect(registry.runningCount).toBe(0), {
      timeout: 10_000
    });

    expect(provider.turnsStarted).toBe(20);
    expect(peak).toBeLessThanOrEqual(2);
  }, 20_000);
});
