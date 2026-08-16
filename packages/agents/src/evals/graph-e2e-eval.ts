/**
 * End-to-end graph eval: plan a workflow with the agent, run it, judge the
 * result against the goal.
 *
 * The `graph-planner` suite stops at the graph — it scores structure, which is
 * everything a static check can see and nothing about whether the workflow
 * does what was asked. This suite closes that loop. Each case runs three
 * phases:
 *
 *   1. **plan** — `authorGraph()` produces a graph (scored structurally,
 *      reusing `checkExpectations` from the graph-planner suite).
 *   2. **execute** — the run policy is stamped onto the planned graph (the
 *      planner leaves Agent nodes model-less on purpose; the run picks the
 *      model), then the graph runs for real with the case's inputs as run
 *      params, through a caller-supplied {@link GraphRunner}. Injecting the
 *      runner keeps this package free of an execution dependency and lets the
 *      harness tests drive scripted runs with no kernel.
 *   3. **judge** — deterministic output checks, plus an LLM judge that reads
 *      the goal and the actual outputs and says whether the goal was met.
 *
 * A case only counts as a success when all three hold: a graph was accepted,
 * the run completed, and the judge says the goal was achieved. That is the
 * rate `--min-success` gates on — the claim the product actually makes.
 */

import { randomUUID } from "node:crypto";
import type { BaseProvider } from "@nodetool-ai/runtime";
import { ProcessingContext } from "@nodetool-ai/runtime";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import type { GraphData } from "@nodetool-ai/protocol";
import { authorGraph, type AuthorGraphOptions } from "../author-graph.js";
import { EXECUTE_CODE_TOOL_NAME } from "../codeact/codeact-executor.js";
import {
  checkExpectations,
  type EvalCheck,
  type GraphPlannerEvalExpectations
} from "./graph-planner-eval.js";
import { applyRunPolicy } from "../execute-agent-graph.js";
import { judgeGoalAchievement, type GoalJudgeVerdict } from "./goal-judge.js";
import { GRAPH_E2E_EVAL_CASES } from "./graph-e2e-cases.js";

/** One value the run surfaced through an output node. */
export interface GraphRunOutput {
  /** Output node `name` (falls back to the node id when unnamed). */
  name: string;
  nodeId?: string;
  value: unknown;
}

/** What a {@link GraphRunner} reports back about one execution. */
export interface GraphRunResult {
  /** The run reached a terminal `completed` state. */
  ok: boolean;
  /** Terminal job status, e.g. `completed` / `failed` / `cancelled`. */
  status: string;
  error?: string;
  outputs: GraphRunOutput[];
  /** Per-node failures, for the report's failure detail. */
  nodeErrors?: { nodeId: string | null; message: string }[];
  durationMs?: number;
}

/**
 * Runs a planned graph. Supplied by the caller (the CLI wires one over
 * `@nodetool-ai/execution`); harness tests pass a scripted one.
 */
export type GraphRunner = (input: {
  graph: GraphData;
  params: Record<string, unknown>;
  timeoutMs?: number;
  signal?: AbortSignal;
}) => Promise<GraphRunResult>;

export interface GraphE2eExpectations {
  /** Output names the run must produce (one output each). */
  requiredOutputNames?: string[];
  minOutputs?: number;
  /** No output may be null/undefined/empty-string. */
  requireNonEmptyOutputs?: boolean;
  /**
   * Exact value a named output must carry. `requiredOutputPatterns` matches
   * case-insensitively against *any* output, which cannot pin a formatting
   * result character for character or tell one deterministic output from
   * another. A fully deterministic case states its answers here.
   */
  expectedOutputs?: Record<string, unknown>;
  /** Regex sources; each must match at least one output rendered as text. */
  requiredOutputPatterns?: string[];
  /** Regex sources; none may match any output rendered as text. */
  forbiddenOutputPatterns?: string[];
}

export interface GraphE2eEvalCase {
  id: string;
  description: string;
  /** What the planner is asked to build. */
  objective: string;
  /** What a successful run must produce — the judge grades against this. */
  goal: string;
  /** Declared to the planner as inputs, and used as run params by default. */
  inputs?: Record<string, unknown>;
  /** Run params, when they should differ from `inputs`. */
  params?: Record<string, unknown>;
  /**
   * Case needs configured model providers (`find_model`) to be planned or run —
   * skipped when the harness runs without any.
   */
  needsModelProviders?: boolean;
  /** Per-case execution timeout; defaults to the harness option. */
  timeoutMs?: number;
  /** Structural expectations on the planned graph (scored, not gating). */
  expectGraph?: GraphPlannerEvalExpectations;
  /** Expectations on what the run produced. */
  expect: GraphE2eExpectations;
  /**
   * Skip the LLM judge — for cases whose outputs are fully pinned down by
   * `requiredOutputPatterns` (pure string mechanics, exact arithmetic).
   * `goalAchieved` then follows the output checks, and no separate
   * `goal-achieved` check is scored: it would count those same checks twice.
   */
  skipJudge?: boolean;
}

export interface GraphE2eCaseResult {
  caseId: string;
  description: string;
  skipped: boolean;
  /** A graph was accepted by the planner. */
  planned: boolean;
  /** The run reached `completed`. */
  executed: boolean;
  /** The judge (or, for judge-free cases, the output checks) says goal met. */
  goalAchieved: boolean;
  /** All three phases passed. */
  success: boolean;
  /** Fraction of checks passed across all phases. */
  score: number;
  checks: EvalCheck[];
  judge?: GoalJudgeVerdict;
  /** Outputs the run produced, keyed by name (values previewed). */
  outputs: Record<string, unknown>;
  /**
   * The graph that ran — policy already stamped on. Carried in the JSON report
   * (never the text table) because a failing e2e case is triaged by reading the
   * graph next to the outputs it produced.
   */
  graph?: GraphData;
  toolCalls: Record<string, number>;
  /** `execute_code` actions the authoring run spent (was `submit_graph` calls). */
  authoringRounds: number;
  nodes: number;
  edges: number;
  planMs: number;
  runMs: number;
  durationMs: number;
  costUsd: number;
  error?: string;
}

export interface GraphE2eEvalReport {
  provider: string;
  model: string;
  startedAt: string;
  cases: GraphE2eCaseResult[];
  summary: {
    total: number;
    skipped: number;
    planned: number;
    executed: number;
    goalAchieved: number;
    /** goalAchieved / ran — the end-to-end success rate the gate reads. */
    successRate: number;
    /** planned / ran. */
    planRate: number;
    /** executed / planned. */
    executionRate: number;
    meanScore: number;
    avgPlanMs: number;
    avgRunMs: number;
    totalCostUsd: number;
  };
}

export interface RunGraphE2eEvalOptions {
  provider: BaseProvider;
  model: string;
  registry: NodeRegistry;
  /** Executes the planned graph. Required — there is no default runner here. */
  runGraph: GraphRunner;
  /** Configured providers for `find_model`; enables model-dependent cases. */
  providers?: Record<string, BaseProvider>;
  /**
   * Provider/model stamped onto authored Agent nodes before the run
   * (see {@link applyRunPolicy}). Defaults to the planner's own.
   */
  executionProviderId?: string;
  executionModel?: string;
  /** Judge provider/model; defaults to the primary provider and model. */
  judgeProvider?: BaseProvider;
  judgeModel?: string;
  cases?: readonly GraphE2eEvalCase[];
  /** Provider rounds one authoring run may spend; `authorGraph`'s default otherwise. */
  maxIterations?: number;
  /** Default per-case execution timeout (ms). */
  timeoutMs?: number;
  signal?: AbortSignal;
  onEvent?: (line: string) => void;
}

const DEFAULT_RUN_TIMEOUT_MS = 300_000;
const MAX_OUTPUT_PREVIEW_CHARS = 4000;

/** Collapse an output value to something a JSON report can carry. */
export function previewOutputValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value.length > MAX_OUTPUT_PREVIEW_CHARS
      ? `${value.slice(0, MAX_OUTPUT_PREVIEW_CHARS)}…[${value.length} chars]`
      : value;
  }
  if (value instanceof Uint8Array) return `<binary ${value.byteLength} bytes>`;
  if (Array.isArray(value)) return value.map(previewOutputValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = previewOutputValue(v);
    }
    return out;
  }
  return value;
}

/** Render an output for regex matching and emptiness checks. */
function outputText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (value instanceof Uint8Array) return `<binary ${value.byteLength} bytes>`;
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return String(value);
  }
}

/**
 * Compare one output against the value a case pinned. Structural equality on
 * the text rendering, with one tolerance: a number may arrive as its decimal
 * string, because a value carried through a text output node comes back as
 * text. Strings are compared exactly — case and punctuation included.
 */
function matchesExactly(actual: unknown, expected: unknown): boolean {
  if (typeof expected === "number" && typeof actual === "string") {
    return actual.trim() !== "" && Number(actual) === expected;
  }
  return outputText(actual) === outputText(expected);
}

/** Last write wins, so a streaming output reports its final value. */
export function outputsByName(
  outputs: readonly GraphRunOutput[]
): Record<string, unknown> {
  const byName: Record<string, unknown> = {};
  for (const o of outputs) {
    byName[o.name || o.nodeId || "output"] = o.value;
  }
  return byName;
}

/** Score what a run produced against the case's output expectations. */
export function checkRunOutputs(
  run: GraphRunResult,
  expect: GraphE2eExpectations
): EvalCheck[] {
  const checks: EvalCheck[] = [];
  const byName = outputsByName(run.outputs);
  const texts = Object.values(byName).map(outputText);

  for (const name of expect.requiredOutputNames ?? []) {
    const found = Object.prototype.hasOwnProperty.call(byName, name);
    checks.push({
      name: `output:${name}`,
      pass: found,
      detail: found
        ? undefined
        : `run produced no output named "${name}" (got: ${
            Object.keys(byName).join(", ") || "none"
          })`
    });
  }

  for (const [name, expected] of Object.entries(expect.expectedOutputs ?? {})) {
    const present = Object.prototype.hasOwnProperty.call(byName, name);
    const pass = present && matchesExactly(byName[name], expected);
    checks.push({
      name: `equals:${name}`,
      pass,
      detail: pass
        ? undefined
        : `expected ${outputText(expected)}, got ${
            present ? outputText(byName[name]) : "no such output"
          }`
    });
  }

  if (expect.minOutputs !== undefined) {
    const count = Object.keys(byName).length;
    checks.push({
      name: `outputs>=${expect.minOutputs}`,
      pass: count >= expect.minOutputs,
      detail: `found ${count}`
    });
  }

  if (expect.requireNonEmptyOutputs) {
    const empty = Object.entries(byName)
      .filter(([, v]) => outputText(v).trim().length === 0)
      .map(([name]) => name);
    checks.push({
      name: "outputs-non-empty",
      pass: empty.length === 0 && Object.keys(byName).length > 0,
      detail:
        Object.keys(byName).length === 0
          ? "no outputs at all"
          : empty.length > 0
            ? `empty: ${empty.join(", ")}`
            : undefined
    });
  }

  for (const pattern of expect.requiredOutputPatterns ?? []) {
    const re = new RegExp(pattern, "i");
    const found = texts.some((t) => re.test(t));
    checks.push({
      name: `match:${pattern}`,
      pass: found,
      detail: found ? undefined : `no output matches /${pattern}/i`
    });
  }

  for (const pattern of expect.forbiddenOutputPatterns ?? []) {
    const re = new RegExp(pattern, "i");
    const offender = texts.find((t) => re.test(t));
    checks.push({
      name: `no-match:${pattern}`,
      pass: !offender,
      detail: offender ? `output matches forbidden /${pattern}/i` : undefined
    });
  }

  return checks;
}

function skippedResult(evalCase: GraphE2eEvalCase): GraphE2eCaseResult {
  return {
    caseId: evalCase.id,
    description: evalCase.description,
    skipped: true,
    planned: false,
    executed: false,
    goalAchieved: false,
    success: false,
    score: 0,
    checks: [],
    outputs: {},
    toolCalls: {},
    authoringRounds: 0,
    nodes: 0,
    edges: 0,
    planMs: 0,
    runMs: 0,
    durationMs: 0,
    costUsd: 0
  };
}

async function runCase(
  evalCase: GraphE2eEvalCase,
  opts: RunGraphE2eEvalOptions
): Promise<GraphE2eCaseResult> {
  const toolCalls: Record<string, number> = {};
  const costBefore = opts.provider.getTotalCost();
  const startedAt = Date.now();

  // ---- phase 1: plan -----------------------------------------------------
  const context = new ProcessingContext({
    jobId: `graph-e2e-eval-${randomUUID()}`,
    userId: "eval-user"
  });

  let graph: GraphData | null = null;
  let error: string | undefined;
  try {
    const authorOptions: AuthorGraphOptions = {
      context,
      provider: opts.provider,
      model: opts.model,
      registry: opts.registry
    };
    if (opts.providers) authorOptions.providers = opts.providers;
    if (evalCase.inputs) authorOptions.inputs = evalCase.inputs;
    if (opts.maxIterations) authorOptions.maxIterations = opts.maxIterations;
    if (opts.signal) authorOptions.signal = opts.signal;
    const gen = authorGraph(evalCase.objective, authorOptions);
    let res = await gen.next();
    while (!res.done) {
      const m = res.value as { type?: string } & Record<string, unknown>;
      if (m.type === "tool_call_update") {
        const name = String(m.name ?? "unknown");
        toolCalls[name] = (toolCalls[name] ?? 0) + 1;
      }
      res = await gen.next();
    }
    graph = res.value;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const planMs = Date.now() - startedAt;

  const checks: EvalCheck[] = [
    { name: "planned", pass: graph !== null, detail: error }
  ];
  if (graph && evalCase.expectGraph) {
    checks.push(...checkExpectations(graph, evalCase.expectGraph));
  }

  // ---- phase 2: execute --------------------------------------------------
  let run: GraphRunResult | null = null;
  let outputChecks: EvalCheck[] = [];
  let runnableGraph: GraphData | undefined;
  const runStartedAt = Date.now();
  if (graph) {
    opts.onEvent?.(`    [run] ${graph.nodes.length} nodes`);
    // Authoring deliberately leaves Agent nodes model-less — the run owns
    // that choice — so an authored graph is only runnable once the run policy is
    // stamped on, exactly as `executeAgentGraph` does before executing one.
    // Without this every LLM step dies on "Select a model".
    runnableGraph = applyRunPolicy(graph, {
      providerId: opts.executionProviderId ?? opts.provider.provider,
      modelId: opts.executionModel ?? opts.model
    });
    try {
      run = await opts.runGraph({
        graph: runnableGraph,
        params: evalCase.params ?? evalCase.inputs ?? {},
        timeoutMs:
          evalCase.timeoutMs ?? opts.timeoutMs ?? DEFAULT_RUN_TIMEOUT_MS,
        signal: opts.signal
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      error ??= message;
      run = { ok: false, status: "failed", error: message, outputs: [] };
    }
    const runError =
      run.error ??
      run.nodeErrors
        ?.map((n) => `${n.nodeId ?? "run"}: ${n.message}`)
        .join("; ");
    checks.push({
      name: "executed",
      pass: run.ok,
      detail: run.ok
        ? undefined
        : `status=${run.status} ${runError ?? ""}`.trim()
    });
    if (!run.ok && !error) error = runError ?? `run status ${run.status}`;
    outputChecks = checkRunOutputs(run, evalCase.expect);
    checks.push(...outputChecks);
  }
  const runMs = run ? Date.now() - runStartedAt : 0;

  // ---- phase 3: judge ----------------------------------------------------
  const byName = run ? outputsByName(run.outputs) : {};
  let judge: GoalJudgeVerdict | undefined;
  let goalAchieved = false;
  let goalDetail: string | undefined;
  if (!run?.ok) {
    goalDetail = graph ? "run did not complete" : "no graph to run";
  } else if (evalCase.skipJudge) {
    // Judge-free case: the output checks pin the result down exactly. They are
    // already in `checks` and scored there, so no `goal-achieved` check is
    // pushed below — it would weigh the same failures a second time. A case
    // with no output checks pins nothing, so it cannot claim the goal.
    goalAchieved = outputChecks.length > 0 && outputChecks.every((c) => c.pass);
    goalDetail = goalAchieved
      ? undefined
      : outputChecks.length === 0
        ? "skipJudge case declares no output checks"
        : "output checks failed";
  } else {
    judge = await judgeGoalAchievement({
      provider: opts.judgeProvider ?? opts.provider,
      model: opts.judgeModel ?? opts.model,
      objective: evalCase.objective,
      goal: evalCase.goal,
      inputs: evalCase.params ?? evalCase.inputs,
      outputs: byName,
      signal: opts.signal
    });
    goalAchieved = judge.achieved;
    goalDetail = judge.error ?? judge.reasoning;
  }
  if (!evalCase.skipJudge) {
    checks.push({
      name: "goal-achieved",
      pass: goalAchieved,
      detail: goalDetail
    });
  }

  const score = checks.filter((c) => c.pass).length / checks.length;

  return {
    caseId: evalCase.id,
    description: evalCase.description,
    skipped: false,
    planned: graph !== null,
    executed: run?.ok === true,
    goalAchieved,
    success: graph !== null && run?.ok === true && goalAchieved,
    score,
    checks,
    judge,
    outputs: Object.fromEntries(
      Object.entries(byName).map(([k, v]) => [k, previewOutputValue(v)])
    ),
    graph: runnableGraph,
    toolCalls,
    authoringRounds: toolCalls[EXECUTE_CODE_TOOL_NAME] ?? 0,
    nodes: graph?.nodes.length ?? 0,
    edges: graph?.edges.length ?? 0,
    planMs,
    runMs,
    durationMs: Date.now() - startedAt,
    costUsd: opts.provider.getTotalCost() - costBefore,
    error
  };
}

export async function runGraphE2eEval(
  opts: RunGraphE2eEvalOptions
): Promise<GraphE2eEvalReport> {
  const cases = opts.cases ?? GRAPH_E2E_EVAL_CASES;
  const hasModelProviders =
    !!opts.providers && Object.keys(opts.providers).length > 0;
  const results: GraphE2eCaseResult[] = [];

  for (const evalCase of cases) {
    if (opts.signal?.aborted) break;
    if (evalCase.needsModelProviders && !hasModelProviders) {
      opts.onEvent?.(`- ${evalCase.id}: SKIPPED (no model providers)`);
      results.push(skippedResult(evalCase));
      continue;
    }

    opts.onEvent?.(`- ${evalCase.id}: ${evalCase.description}`);
    const result = await runCase(evalCase, opts);
    const failed = result.checks.filter((c) => !c.pass);
    opts.onEvent?.(
      `  ${result.success ? "PASS" : "FAIL"} score=${result.score.toFixed(2)} ` +
        `plan=${result.planned ? "ok" : "no"} run=${result.executed ? "ok" : "no"} ` +
        `goal=${result.goalAchieved ? "met" : "unmet"} ` +
        `nodes=${result.nodes} ${Math.round(result.durationMs / 1000)}s` +
        (failed.length > 0
          ? ` | failed: ${failed.map((c) => c.name).join(", ")}`
          : "")
    );
    results.push(result);
  }

  const ran = results.filter((r) => !r.skipped);
  const planned = ran.filter((r) => r.planned);
  const executed = ran.filter((r) => r.executed);
  const achieved = ran.filter((r) => r.goalAchieved);
  const mean = (pick: (r: GraphE2eCaseResult) => number): number =>
    ran.length > 0 ? ran.reduce((a, r) => a + pick(r), 0) / ran.length : 0;

  return {
    provider: opts.provider.provider,
    model: opts.model,
    startedAt: new Date().toISOString(),
    cases: results,
    summary: {
      total: results.length,
      skipped: results.length - ran.length,
      planned: planned.length,
      executed: executed.length,
      goalAchieved: achieved.length,
      successRate: ran.length > 0 ? achieved.length / ran.length : 0,
      planRate: ran.length > 0 ? planned.length / ran.length : 0,
      executionRate: planned.length > 0 ? executed.length / planned.length : 0,
      meanScore: mean((r) => r.score),
      avgPlanMs: mean((r) => r.planMs),
      avgRunMs: mean((r) => r.runMs),
      totalCostUsd: ran.reduce((a, r) => a + r.costUsd, 0)
    }
  };
}

/** Text summary table for terminal output. */
export function formatGraphE2eReport(report: GraphE2eEvalReport): string {
  const lines: string[] = [];
  lines.push(
    `Graph e2e eval — provider=${report.provider} model=${report.model}`
  );
  lines.push("");
  const header = [
    "case".padEnd(22),
    "result".padEnd(7),
    "score".padEnd(6),
    "plan".padEnd(6),
    "run".padEnd(5),
    "goal".padEnd(6),
    "nodes".padEnd(6),
    "time".padEnd(7),
    "cost"
  ].join("");
  lines.push(header);
  lines.push("-".repeat(header.length));
  for (const r of report.cases) {
    lines.push(
      [
        r.caseId.padEnd(22),
        (r.skipped ? "skip" : r.success ? "pass" : "FAIL").padEnd(7),
        (r.skipped ? "-" : r.score.toFixed(2)).padEnd(6),
        (r.skipped ? "-" : r.planned ? "ok" : "no").padEnd(6),
        (r.skipped ? "-" : r.executed ? "ok" : "no").padEnd(5),
        (r.skipped ? "-" : r.goalAchieved ? "met" : "unmet").padEnd(6),
        String(r.nodes).padEnd(6),
        `${Math.round(r.durationMs / 1000)}s`.padEnd(7),
        r.costUsd > 0 ? `$${r.costUsd.toFixed(4)}` : "-"
      ].join("")
    );
    for (const c of r.checks.filter((c) => !c.pass)) {
      lines.push(`  ✗ ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
    }
    if (r.judge?.reasoning) {
      lines.push(`  judge: ${r.judge.reasoning}`);
    }
  }
  const s = report.summary;
  lines.push("");
  lines.push(
    `goal achieved ${s.goalAchieved}/${s.total - s.skipped} (${(s.successRate * 100).toFixed(0)}%)` +
      `  planned ${(s.planRate * 100).toFixed(0)}%` +
      `  ran ${(s.executionRate * 100).toFixed(0)}%` +
      `  mean score ${s.meanScore.toFixed(2)}` +
      `  avg plan ${(s.avgPlanMs / 1000).toFixed(1)}s` +
      `  avg run ${(s.avgRunMs / 1000).toFixed(1)}s` +
      (s.totalCostUsd > 0 ? `  cost $${s.totalCostUsd.toFixed(4)}` : "") +
      (s.skipped > 0 ? `  (${s.skipped} skipped)` : "")
  );
  return lines.join("\n");
}
