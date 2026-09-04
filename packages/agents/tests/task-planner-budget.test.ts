/**
 * Planning spends the run's budget (invariant I-2).
 *
 * `TaskPlanner` used to hand `generateLoop` no `turnBudget`, so up to its own
 * call cap of planning rounds ran past the run's cost cap, deadline and turn
 * counter. An exhausted budget must admit no planning turn at all, and the
 * failure must name the budget rather than a planner that "ended without
 * finish_plan".
 */
import { describe, it, expect } from "vitest";
import { ProcessingContext, createRunBudget } from "@nodetool-ai/runtime";
import type { PlanningUpdate } from "@nodetool-ai/protocol";
import { TaskPlanner } from "../src/task-planner.js";
import { createLoopingMockProvider } from "./_helpers/looping-mock-provider.js";

/** A model the price catalog covers, so a turn has a worst case to refuse. */
const PRICED_MODEL = "gpt-4o-mini";

function exhaustedBudget() {
  return createRunBudget({
    capUsd: 0,
    maxOutputTokens: 1_000,
    unpricedTokenCeiling: 0,
    deadlineMs: Infinity,
    maxConcurrency: 4,
    maxTurns: 50
  });
}

function planningProvider() {
  return createLoopingMockProvider(
    [
      [
        {
          id: "c1",
          name: "add_task",
          args: {
            id: "gather",
            title: "Gather",
            depends_on: [],
            steps: [{ id: "gather_s1", instructions: "Read", depends_on: [] }]
          }
        },
        { id: "c2", name: "finish_plan", args: { title: "A Plan" } }
      ]
    ],
    { provider: "openai", repeatLast: true }
  );
}

async function drain(planner: TaskPlanner, context: ProcessingContext) {
  const updates: PlanningUpdate[] = [];
  const gen = planner.planMultiTask("Do the thing", context);
  let next = await gen.next();
  while (!next.done) {
    if (next.value.type === "planning_update") updates.push(next.value);
    next = await gen.next();
  }
  return { plan: next.value, updates };
}

describe("TaskPlanner and the run budget", () => {
  it("makes no planning turn on an exhausted budget and names the budget", async () => {
    const budget = exhaustedBudget();
    const provider = planningProvider();
    const planner = new TaskPlanner({
      provider,
      model: PRICED_MODEL,
      tools: [],
      budget
    });

    const { plan, updates } = await drain(
      planner,
      new ProcessingContext({ jobId: "plan-budget", userId: "test" })
    );

    expect(plan).toBeNull();
    expect(provider.turnsStarted).toBe(0);
    expect(budget.exhausted?.kind).toBe("cost");
    const last = updates[updates.length - 1];
    expect(last.status).toBe("failed");
    expect(last.content).toContain("turn budget");
    expect(last.content).not.toContain("finish_plan");
  });

  it("finds the budget the host left on the context when none is passed", async () => {
    const budget = exhaustedBudget();
    const provider = planningProvider();
    const context = new ProcessingContext({ jobId: "plan-budget", userId: "test" });
    context.set("nodetool_run_budget", budget);
    const planner = new TaskPlanner({ provider, model: PRICED_MODEL, tools: [] });

    const { plan } = await drain(planner, context);

    expect(plan).toBeNull();
    expect(provider.turnsStarted).toBe(0);
  });

  it("still plans when the budget has room", async () => {
    const budget = createRunBudget({
      capUsd: 5,
      maxOutputTokens: 1_000,
      unpricedTokenCeiling: 0,
      deadlineMs: Infinity,
      maxConcurrency: 4,
      maxTurns: 50
    });
    const provider = planningProvider();
    const planner = new TaskPlanner({
      provider,
      model: PRICED_MODEL,
      tools: [],
      budget
    });

    const { plan } = await drain(
      planner,
      new ProcessingContext({ jobId: "plan-budget", userId: "test" })
    );

    expect(plan?.title).toBe("A Plan");
    expect(budget.turnCount.current).toBeGreaterThan(0);
  });
});
