/**
 * Unit tests for the TaskPlanner eval harness (`src/evals/task-planner-*`):
 * plan-quality scoring, critical-path math, metrics collection from the
 * planner message stream, skip logic, and report formatting — all with a
 * scripted provider, no network.
 */
import { describe, it, expect } from "vitest";
import {
  runTaskPlannerEval,
  formatTaskPlanReport,
  checkTaskPlanExpectations,
  criticalPathDepth,
  TASK_PLANNER_EVAL_CASES,
  type TaskPlannerEvalCase
} from "../src/index.js";
import type { Task, TaskPlan } from "../src/types.js";
import type {
  BaseProvider,
  ProviderStreamItem,
  ToolCall
} from "@nodetool-ai/runtime";

/** Provider replaying one scripted tool-call list per generateLoop call. */
function createScriptedProvider(script: ToolCall[]): BaseProvider {
  return {
    provider: "scripted",
    hasToolSupport: async () => true,
    getTotalCost: () => 0,
    async *generateLoop(args: {
      tools?: Array<{
        name: string;
        execute?: (a: Record<string, unknown>) => Promise<unknown>;
      }>;
      signal?: AbortSignal;
    }): AsyncGenerator<ProviderStreamItem> {
      const toolMap = new Map((args.tools ?? []).map((t) => [t.name, t]));
      for (const tc of script) {
        if (args.signal?.aborted) break;
        yield tc as unknown as ProviderStreamItem;
        await toolMap
          .get(tc.name)
          ?.execute?.(tc.args as Record<string, unknown>);
        if (args.signal?.aborted) break;
      }
      yield { type: "chunk", content: "", done: true };
    }
  } as unknown as BaseProvider;
}

function task(id: string, stepIds: string[], extra: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    dependsOn: [],
    steps: stepIds.map((sid) => ({
      id: sid,
      instructions: `do ${sid}`,
      completed: false,
      dependsOn: [],
      logs: []
    })),
    ...extra
  };
}

const flatPlan: TaskPlan = {
  title: "flat",
  tasks: [task("a", ["a_1"]), task("b", ["b_1"]), task("c", ["c_1"])]
};

describe("criticalPathDepth", () => {
  it("is 1 for a flat fan-out and N for an N-stage chain", () => {
    expect(criticalPathDepth(flatPlan.tasks)).toBe(1);
    expect(
      criticalPathDepth([
        task("a", ["a_1"]),
        task("b", ["b_1"], { dependsOn: ["a"] }),
        task("c", ["c_1"], { dependsOn: ["b"] })
      ])
    ).toBe(3);
  });

  it("is 0 for an empty plan", () => {
    expect(criticalPathDepth([])).toBe(0);
  });
});

describe("checkTaskPlanExpectations", () => {
  it("passes a wide flat plan against fan-out expectations", () => {
    const checks = checkTaskPlanExpectations(flatPlan, {
      minTasks: 3,
      minIndependentTasks: 3,
      requireFlat: true,
      maxStepsPerTask: 2
    });
    expect(checks.every((c) => c.pass)).toBe(true);
  });

  it("fails requireFlat when a task carries a dependency", () => {
    const chained: TaskPlan = {
      title: "chained",
      tasks: [task("a", ["a_1"]), task("b", ["b_1"], { dependsOn: ["a"] })]
    };
    const flat = checkTaskPlanExpectations(chained, { requireFlat: true }).find(
      (c) => c.name === "flat-fanout"
    );
    expect(flat?.pass).toBe(false);
    expect(flat?.detail).toContain("b");
  });

  it("accepts a tool routed via step.tools or via the instructions", () => {
    const viaTools: TaskPlan = {
      title: "t",
      tasks: [
        {
          ...task("a", ["a_1"]),
          steps: [
            {
              id: "a_1",
              instructions: "look it up",
              completed: false,
              dependsOn: [],
              tools: ["web_search"],
              logs: []
            }
          ]
        }
      ]
    };
    const viaText: TaskPlan = {
      title: "t",
      tasks: [
        {
          ...task("a", ["a_1"]),
          steps: [
            {
              id: "a_1",
              instructions: "Use web_search to find sources.",
              completed: false,
              dependsOn: [],
              logs: []
            }
          ]
        }
      ]
    };
    for (const plan of [viaTools, viaText]) {
      const check = checkTaskPlanExpectations(plan, {
        requiredTools: ["web_search"]
      }).find((c) => c.name === "tool:web_search");
      expect(check?.pass).toBe(true);
    }
  });

  it("flags unprefixed step ids and a planned synthesis task", () => {
    const sloppy: TaskPlan = {
      title: "sloppy",
      tasks: [
        task("gather", ["s1"]),
        { ...task("wrapup", ["wrapup_1"]), title: "Assemble the final report" }
      ]
    };
    const checks = checkTaskPlanExpectations(sloppy, {});
    expect(checks.find((c) => c.name === "step-ids-prefixed")?.pass).toBe(
      false
    );
    expect(checks.find((c) => c.name === "no-synthesis-task")?.pass).toBe(
      false
    );
  });

  it("allows a synthesis task when the case opts in", () => {
    const plan: TaskPlan = {
      title: "s",
      tasks: [{ ...task("final", ["final_1"]), title: "Combine the results" }]
    };
    const check = checkTaskPlanExpectations(plan, {
      allowSynthesisTask: true
    }).find((c) => c.name === "no-synthesis-task");
    expect(check).toBeUndefined();
  });
});

describe("runTaskPlannerEval", () => {
  const cases: TaskPlannerEvalCase[] = [
    {
      id: "fanout",
      description: "three independent tasks",
      objective: "Research three topics.",
      expect: { minTasks: 2, minIndependentTasks: 2, requireFlat: true }
    },
    {
      id: "needs-models",
      description: "skipped without providers",
      objective: "Generate images.",
      needsModelProviders: true,
      expect: {}
    }
  ];

  const addTask = (id: string, deps: string[] = []): ToolCall =>
    ({
      id: `call_${id}`,
      name: "add_task",
      args: {
        id,
        title: `Task ${id}`,
        depends_on: deps,
        steps: [
          {
            id: `${id}_1`,
            instructions: `Use web_search for ${id}.`,
            depends_on: []
          }
        ]
      }
    }) as unknown as ToolCall;

  it("collects metrics, scores the plan, and skips model-dependent cases", async () => {
    const provider = createScriptedProvider([
      addTask("alpha"),
      addTask("beta"),
      {
        id: "call_finish",
        name: "finish_plan",
        args: { title: "Research plan" }
      } as unknown as ToolCall
    ]);

    const report = await runTaskPlannerEval({
      provider,
      model: "test-model",
      cases
    });

    expect(report.provider).toBe("scripted");
    const fanout = report.cases[0];
    expect(fanout.accepted).toBe(true);
    expect(fanout.tasks).toBe(2);
    expect(fanout.steps).toBe(2);
    expect(fanout.parallelWidth).toBe(2);
    expect(fanout.criticalPath).toBe(1);
    expect(fanout.toolCalls["add_task"]).toBe(2);
    expect(fanout.validationFailures).toBe(0);
    expect(fanout.score).toBe(1);

    expect(report.cases[1].skipped).toBe(true);
    expect(report.summary.successRate).toBe(1);
    expect(report.summary.cleanRate).toBe(1);
    expect(report.summary.avgTasks).toBe(2);
  });

  it("counts rejected add_task calls against the clean rate", async () => {
    // The first add_task depends on a task that was never added → rejected.
    const provider = createScriptedProvider([
      addTask("alpha", ["missing"]),
      addTask("alpha"),
      addTask("beta"),
      {
        id: "call_finish",
        name: "finish_plan",
        args: { title: "Research plan" }
      } as unknown as ToolCall
    ]);

    const report = await runTaskPlannerEval({
      provider,
      model: "test-model",
      cases: [cases[0]]
    });

    expect(report.cases[0].accepted).toBe(true);
    expect(report.cases[0].validationFailures).toBe(1);
    expect(report.summary.cleanRate).toBe(0);
  });

  it("scores a never-committed plan as failed", async () => {
    // No finish_plan → no committed plan.
    const provider = createScriptedProvider([addTask("alpha")]);
    const report = await runTaskPlannerEval({
      provider,
      model: "test-model",
      cases: [cases[0]]
    });
    expect(report.cases[0].accepted).toBe(false);
    expect(report.cases[0].score).toBe(0);
    expect(report.summary.successRate).toBe(0);
  });

  it("formats a report with the failed checks inline", async () => {
    const provider = createScriptedProvider([
      addTask("alpha"),
      {
        id: "call_finish",
        name: "finish_plan",
        args: { title: "Research plan" }
      } as unknown as ToolCall
    ]);
    const report = await runTaskPlannerEval({
      provider,
      model: "test-model",
      cases: [cases[0]]
    });
    const text = formatTaskPlanReport(report);
    expect(text).toContain("TaskPlanner eval");
    expect(text).toContain("fanout");
    // One task only → the minTasks>=2 check fails and is listed.
    expect(text).toContain("✗ tasks>=2");
  });
});

describe("TASK_PLANNER_EVAL_CASES", () => {
  it("has unique ids and an expectation on every case", () => {
    const ids = TASK_PLANNER_EVAL_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of TASK_PLANNER_EVAL_CASES) {
      expect(Object.keys(c.expect).length).toBeGreaterThan(0);
      expect(c.objective.length).toBeGreaterThan(20);
    }
  });
});
