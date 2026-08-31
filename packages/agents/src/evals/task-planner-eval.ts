/**
 * TaskPlanner (plan mode) evaluation harness — provider-agnostic.
 *
 * Runs {@link TaskPlanner.planMultiTask} for each case and scores the resulting
 * {@link TaskPlan}. `PlanBuilder` already rejects structurally broken plans —
 * duplicate step ids, dangling dependencies, cycles — so a plan that comes back
 * at all is valid by construction. What it cannot judge is plan *quality*, and
 * that is what this suite measures: does the planner exploit parallelism, keep
 * decomposition proportional to the objective, route work to the right tool,
 * respect the step-granularity and id-prefix conventions, and leave final
 * synthesis to the Compiler stage instead of planning an "assemble" task?
 *
 * Scoring is structural (see {@link checkTaskPlanExpectations}) — task/step
 * counts, DAG shape, tool routing, instruction patterns — never an exact plan,
 * so many valid decompositions pass.
 */

import { randomUUID } from "node:crypto";
import type { BaseProvider } from "@nodetool-ai/runtime";
import { ProcessingContext } from "@nodetool-ai/runtime";
import type { EvalCheck } from "./graph-planner-eval.js";
import { TaskPlanner } from "../task-planner.js";
import type { Task, TaskPlan } from "../types.js";
import { createPlannerTools } from "./planner-tools.js";
import {
  TASK_PLANNER_EVAL_CASES,
  type TaskPlannerEvalCase,
  type TaskPlannerEvalExpectations
} from "./task-planner-cases.js";

/**
 * Task titles and step instructions that mean "assemble the final answer".
 * The planner prompt forbids such a task outright — the Compiler stage owns
 * final synthesis and already has every `task_result` in memory.
 */
const SYNTHESIS_PATTERN =
  /\b(aggregat\w*|synthesi[sz]\w*|assembl\w*|consolidat\w*|final report|final answer|combine (?:the )?results?|compile (?:the )?(?:results?|report|findings))\b/i;

/**
 * Instruction verbs that need a tool: retrieval, I/O, or generation. Matched
 * against step instructions for {@link TaskPlannerEvalExpectations.forbidToolWork}.
 */
const TOOL_WORK_PATTERN =
  /\b(search|google|browse|crawl|scrape|fetch|download|visit|look up|read the file|write (?:the |a )?file|save to|generate an? (?:image|video|audio)|call the api|query the api)\b/i;

export interface TaskPlanCaseResult {
  caseId: string;
  description: string;
  skipped: boolean;
  /** The planner returned a committed plan. */
  accepted: boolean;
  score: number;
  checks: EvalCheck[];
  tasks: number;
  steps: number;
  /** Tasks with no `dependsOn` — how wide the plan opens. */
  parallelWidth: number;
  /** Longest chain of task dependencies (1 for a flat fan-out). */
  criticalPath: number;
  /** Planner tool calls by name (`add_task`, `remove_task`, `finish_plan`). */
  toolCalls: Record<string, number>;
  /** `add_task`/`finish_plan` calls the builder rejected. */
  validationFailures: number;
  durationMs: number;
  costUsd: number;
  error?: string;
}

export interface TaskPlanEvalReport {
  provider: string;
  model: string;
  startedAt: string;
  cases: TaskPlanCaseResult[];
  summary: {
    total: number;
    skipped: number;
    accepted: number;
    /** accepted / (total - skipped) */
    successRate: number;
    /** Mean expectation score over non-skipped cases. */
    meanScore: number;
    /** Fraction of accepted plans built without a single rejected tool call. */
    cleanRate: number;
    avgTasks: number;
    avgSteps: number;
    avgParallelWidth: number;
    avgDurationMs: number;
    totalCostUsd: number;
  };
}

/**
 * The `AgentNode`'s default system prompt, mirrored here so the suite plans
 * behind the same preamble a real run does. Kept as a literal rather than
 * imported: `packages/agents` sits below `llm-nodes` in the dependency order.
 */
export const AGENT_NODE_SYSTEM_PROMPT = "You are a friendly assistant";

export interface RunTaskPlannerEvalOptions {
  provider: BaseProvider;
  model: string;
  /** Configured providers; enables model-dependent cases (else they skip). */
  providers?: Record<string, BaseProvider>;
  /** Cases to run; defaults to the built-in suite. */
  cases?: readonly TaskPlannerEvalCase[];
  /** Planning attempts per case. */
  maxRetries?: number;
  /**
   * The caller preamble every case plans behind. Defaults to the `AgentNode`'s
   * own default system prompt, because that is what the product sends; pass
   * `""` to score the bare planner contract instead.
   */
  systemPrompt?: string;
  signal?: AbortSignal;
  /** Progress callback (one line per event, for CLI display). */
  onEvent?: (line: string) => void;
}

/** Every step in the plan, flattened. */
function allSteps(plan: TaskPlan) {
  return plan.tasks.flatMap((t) => t.steps);
}

/** Tool names any step explicitly restricted itself to. */
function declaredStepTools(plan: TaskPlan): Set<string> {
  const names = new Set<string>();
  for (const step of allSteps(plan)) {
    for (const tool of step.tools ?? []) names.add(tool);
  }
  return names;
}

/**
 * Longest chain of task-level dependencies. 1 means a flat fan-out (every task
 * independent); N means the plan serializes N stages.
 */
export function criticalPathDepth(tasks: readonly Task[]): number {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const memo = new Map<string, number>();

  const depth = (id: string, seen: Set<string>): number => {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    // The builder rejects cycles, but a defensive guard keeps the scorer total
    // for hand-written plans in tests.
    if (seen.has(id)) return 0;
    const task = byId.get(id);
    if (!task) return 0;
    seen.add(id);
    const parents = task.dependsOn ?? [];
    const result =
      parents.length === 0
        ? 1
        : 1 + Math.max(...parents.map((p) => depth(p, seen)));
    seen.delete(id);
    memo.set(id, result);
    return result;
  };

  return tasks.length === 0
    ? 0
    : Math.max(...tasks.map((t) => depth(t.id, new Set())));
}

/**
 * Score a committed plan against a case's expectations. Pure and fully
 * unit-testable: takes a {@link TaskPlan}, never calls a provider.
 */
export function checkTaskPlanExpectations(
  plan: TaskPlan,
  expect: TaskPlannerEvalExpectations
): EvalCheck[] {
  const checks: EvalCheck[] = [];
  const steps = allSteps(plan);
  const independent = plan.tasks.filter(
    (t) => !t.dependsOn || t.dependsOn.length === 0
  );
  const dependent = plan.tasks.filter((t) => (t.dependsOn?.length ?? 0) > 0);

  const bound = (
    name: string,
    actual: number,
    min: number | undefined,
    max: number | undefined
  ): void => {
    if (min !== undefined) {
      checks.push({
        name: `${name}>=${min}`,
        pass: actual >= min,
        detail: `found ${actual}`
      });
    }
    if (max !== undefined) {
      checks.push({
        name: `${name}<=${max}`,
        pass: actual <= max,
        detail: `found ${actual}`
      });
    }
  };

  bound("tasks", plan.tasks.length, expect.minTasks, expect.maxTasks);
  bound("steps", steps.length, expect.minSteps, expect.maxSteps);
  bound("parallel", independent.length, expect.minIndependentTasks, undefined);
  bound("dependent", dependent.length, expect.minDependentTasks, undefined);

  if (expect.maxStepsPerTask !== undefined) {
    const worst = plan.tasks.reduce(
      (acc, t) => (t.steps.length > acc.steps.length ? t : acc),
      plan.tasks[0] ?? { id: "-", steps: [] }
    );
    checks.push({
      name: `stepsPerTask<=${expect.maxStepsPerTask}`,
      pass: worst.steps.length <= expect.maxStepsPerTask,
      detail: `widest task '${worst.id}' has ${worst.steps.length}`
    });
  }

  if (expect.requireFlat) {
    const chained = dependent.map((t) => t.id);
    checks.push({
      name: "flat-fanout",
      pass: chained.length === 0,
      detail:
        chained.length === 0
          ? undefined
          : `tasks with dependencies: ${chained.join(", ")}`
    });
  }

  const stepTools = declaredStepTools(plan);
  const instructions = steps.map((s) => s.instructions).join("\n");

  for (const tool of expect.requiredTools ?? []) {
    // A planner may route a tool either by restricting a step's toolset or by
    // naming it in the instructions — the prompt teaches both, so accept both.
    const pass =
      stepTools.has(tool) || new RegExp(`\\b${tool}\\b`).test(instructions);
    checks.push({
      name: `tool:${tool}`,
      pass,
      detail: pass ? undefined : `no step routes work to ${tool}`
    });
  }

  for (const tool of expect.forbiddenTools ?? []) {
    const hit =
      stepTools.has(tool) || new RegExp(`\\b${tool}\\b`).test(instructions);
    checks.push({
      name: `not-tool:${tool}`,
      pass: !hit,
      detail: hit ? `plan routes work to ${tool}` : undefined
    });
  }

  // An empty toolbelt cannot search, fetch, or generate. A planner told so
  // still writes "search the web for …" unless the contract says otherwise,
  // and the run then returns the model's own recall dressed as findings.
  if (expect.forbidToolWork) {
    const offender = steps.find((s) => TOOL_WORK_PATTERN.test(s.instructions));
    checks.push({
      name: "no-tool-work",
      pass: offender === undefined,
      detail: offender
        ? `step "${offender.id}" instructs work no tool can do`
        : undefined
    });
  }

  for (const pattern of expect.requiredInstructionPatterns ?? []) {
    const re = new RegExp(pattern, "i");
    const pass = re.test(instructions);
    checks.push({
      name: `says:${pattern}`,
      pass,
      detail: pass ? undefined : `no step instruction matches /${pattern}/i`
    });
  }

  // Universal: step ids must be prefixed with their task id. The builder only
  // enforces global uniqueness; the prefix convention is what keeps ids
  // readable and collision-free as a plan grows.
  const unprefixed = plan.tasks.flatMap((t) =>
    t.steps.filter((s) => !s.id.startsWith(t.id)).map((s) => `${t.id}/${s.id}`)
  );
  checks.push({
    name: "step-ids-prefixed",
    pass: unprefixed.length === 0,
    detail:
      unprefixed.length === 0
        ? undefined
        : `unprefixed: ${unprefixed.join(", ")}`
  });

  // Universal: final synthesis belongs to the Compiler stage, not the plan.
  if (!expect.allowSynthesisTask) {
    const offender =
      plan.tasks.find((t) => SYNTHESIS_PATTERN.test(t.title))?.title ??
      steps.find((s) => SYNTHESIS_PATTERN.test(s.instructions))?.id;
    checks.push({
      name: "no-synthesis-task",
      pass: offender === undefined,
      detail: offender ? `synthesis work planned in "${offender}"` : undefined
    });
  }

  return checks;
}

async function runCase(
  evalCase: TaskPlannerEvalCase,
  opts: RunTaskPlannerEvalOptions
): Promise<TaskPlanCaseResult> {
  const toolCalls: Record<string, number> = {};
  let validationFailures = 0;
  const costBefore = opts.provider.getTotalCost();
  const startedAt = Date.now();

  // Run the shape the product runs. An `AgentNode` always supplies a system
  // prompt and often no tools at all; constructing the planner bare made this
  // suite blind to both — it stayed green while every node-driven plan was
  // authored without the TaskArchitect contract.
  const planner = new TaskPlanner({
    provider: opts.provider,
    model: opts.model,
    tools: evalCase.toolbelt === "none" ? [] : createPlannerTools(),
    systemPrompt: opts.systemPrompt ?? AGENT_NODE_SYSTEM_PROMPT,
    outputSchema: evalCase.outputSchema,
    inputs: evalCase.inputs,
    maxRetries: opts.maxRetries,
    signal: opts.signal
  });

  const context = new ProcessingContext({
    jobId: `task-planner-eval-${randomUUID()}`,
    userId: "eval-user"
  });

  let plan: TaskPlan | null = null;
  let error: string | undefined;
  try {
    const gen = planner.planMultiTask(evalCase.objective, context);
    let res = await gen.next();
    while (!res.done) {
      const m = res.value;
      if (m.type === "tool_call_update") {
        const name = String(m.name ?? "unknown");
        toolCalls[name] = (toolCalls[name] ?? 0) + 1;
        opts.onEvent?.(`    [tool] ${name}`);
      } else if (m.type === "planning_update" && m.phase === "validation") {
        validationFailures++;
      }
      res = await gen.next();
    }
    plan = res.value;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const durationMs = Date.now() - startedAt;
  const costUsd = opts.provider.getTotalCost() - costBefore;

  const checks: EvalCheck[] = [
    { name: "planned", pass: plan !== null, detail: error }
  ];
  if (plan) checks.push(...checkTaskPlanExpectations(plan, evalCase.expect));
  const score = plan ? checks.filter((c) => c.pass).length / checks.length : 0;

  return {
    caseId: evalCase.id,
    description: evalCase.description,
    skipped: false,
    accepted: plan !== null,
    score,
    checks,
    tasks: plan?.tasks.length ?? 0,
    steps: plan ? allSteps(plan).length : 0,
    parallelWidth: plan
      ? plan.tasks.filter((t) => !t.dependsOn || t.dependsOn.length === 0)
          .length
      : 0,
    criticalPath: plan ? criticalPathDepth(plan.tasks) : 0,
    toolCalls,
    validationFailures,
    durationMs,
    costUsd,
    error
  };
}

export async function runTaskPlannerEval(
  opts: RunTaskPlannerEvalOptions
): Promise<TaskPlanEvalReport> {
  const cases = opts.cases ?? TASK_PLANNER_EVAL_CASES;
  const hasModelProviders =
    !!opts.providers && Object.keys(opts.providers).length > 0;
  const results: TaskPlanCaseResult[] = [];

  for (const evalCase of cases) {
    if (opts.signal?.aborted) break;
    if (evalCase.needsModelProviders && !hasModelProviders) {
      opts.onEvent?.(`- ${evalCase.id}: SKIPPED (no model providers)`);
      results.push({
        caseId: evalCase.id,
        description: evalCase.description,
        skipped: true,
        accepted: false,
        score: 0,
        checks: [],
        tasks: 0,
        steps: 0,
        parallelWidth: 0,
        criticalPath: 0,
        toolCalls: {},
        validationFailures: 0,
        durationMs: 0,
        costUsd: 0
      });
      continue;
    }

    opts.onEvent?.(`- ${evalCase.id}: ${evalCase.description}`);
    const result = await runCase(evalCase, opts);
    const failed = result.checks.filter((c) => !c.pass);
    opts.onEvent?.(
      `  ${result.accepted ? "PASS" : "FAIL"} score=${result.score.toFixed(2)} ` +
        `tasks=${result.tasks} steps=${result.steps} ` +
        `parallel=${result.parallelWidth} depth=${result.criticalPath} ` +
        `${Math.round(result.durationMs / 1000)}s` +
        (failed.length > 0
          ? ` | failed: ${failed.map((c) => c.name).join(", ")}`
          : "")
    );
    results.push(result);
  }

  const ran = results.filter((r) => !r.skipped);
  const acceptedResults = ran.filter((r) => r.accepted);
  const mean = (pick: (r: TaskPlanCaseResult) => number): number =>
    ran.length > 0 ? ran.reduce((a, r) => a + pick(r), 0) / ran.length : 0;

  return {
    provider: opts.provider.provider,
    model: opts.model,
    startedAt: new Date().toISOString(),
    cases: results,
    summary: {
      total: results.length,
      skipped: results.length - ran.length,
      accepted: acceptedResults.length,
      successRate: ran.length > 0 ? acceptedResults.length / ran.length : 0,
      meanScore: mean((r) => r.score),
      cleanRate:
        acceptedResults.length > 0
          ? acceptedResults.filter((r) => r.validationFailures === 0).length /
            acceptedResults.length
          : 0,
      avgTasks: mean((r) => r.tasks),
      avgSteps: mean((r) => r.steps),
      avgParallelWidth: mean((r) => r.parallelWidth),
      avgDurationMs: mean((r) => r.durationMs),
      totalCostUsd: ran.reduce((a, r) => a + r.costUsd, 0)
    }
  };
}

/** Text summary table for terminal output. */
export function formatTaskPlanReport(report: TaskPlanEvalReport): string {
  const lines: string[] = [];
  lines.push(
    `TaskPlanner eval — provider=${report.provider} model=${report.model}`
  );
  lines.push("");
  const header = [
    "case".padEnd(22),
    "result".padEnd(7),
    "score".padEnd(6),
    "tasks".padEnd(6),
    "steps".padEnd(6),
    "par".padEnd(4),
    "depth".padEnd(6),
    "time".padEnd(7),
    "cost"
  ].join("");
  lines.push(header);
  lines.push("-".repeat(header.length));
  for (const r of report.cases) {
    lines.push(
      [
        r.caseId.padEnd(22),
        (r.skipped ? "skip" : r.accepted ? "pass" : "FAIL").padEnd(7),
        (r.skipped ? "-" : r.score.toFixed(2)).padEnd(6),
        String(r.tasks).padEnd(6),
        String(r.steps).padEnd(6),
        String(r.parallelWidth).padEnd(4),
        String(r.criticalPath).padEnd(6),
        `${Math.round(r.durationMs / 1000)}s`.padEnd(7),
        r.costUsd > 0 ? `$${r.costUsd.toFixed(4)}` : "-"
      ].join("")
    );
    for (const c of r.checks.filter((c) => !c.pass)) {
      lines.push(`  ✗ ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
    }
  }
  const s = report.summary;
  lines.push("");
  lines.push(
    `success ${s.accepted}/${s.total - s.skipped} (${(s.successRate * 100).toFixed(0)}%)` +
      `  mean score ${s.meanScore.toFixed(2)}` +
      `  clean ${(s.cleanRate * 100).toFixed(0)}%` +
      `  avg tasks ${s.avgTasks.toFixed(1)}` +
      `  avg steps ${s.avgSteps.toFixed(1)}` +
      `  avg parallel ${s.avgParallelWidth.toFixed(1)}` +
      `  avg time ${(s.avgDurationMs / 1000).toFixed(1)}s` +
      (s.totalCostUsd > 0 ? `  cost $${s.totalCostUsd.toFixed(4)}` : "") +
      (s.skipped > 0 ? `  (${s.skipped} skipped)` : "")
  );
  return lines.join("\n");
}
