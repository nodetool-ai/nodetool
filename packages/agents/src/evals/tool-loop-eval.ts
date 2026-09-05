/**
 * Tool-loop evaluation harness — provider-agnostic.
 *
 * Drives a multi-turn tool-calling loop over the *frontend* tool surface: the
 * model is handed the real `ui_*` tool contract (names/descriptions/Zod schemas
 * from `@nodetool-ai/protocol`) and an objective, each requested tool runs
 * against a {@link createToolLoopBridge headless bridge}, and the result is fed
 * back — repeating until the model stops calling tools or a turn cap is hit.
 *
 * Where {@link runGraphPlannerEval} evaluates typed-DSL graph authoring, this
 * evaluates the incremental add-node/connect-node tool flow the browser UI
 * exposes. It records the same efficiency
 * metrics and emits the same result/summary shapes so providers/models can be
 * compared on one report.
 *
 * Scoring is structural (see {@link checkToolLoopExpectations}): required /
 * forbidden tool names, ordering constraints, final-state predicates, tool-call
 * budgets, and a no-error-results check — never an exact transcript match, so
 * many valid tool orderings pass.
 *
 * Checks are not weighed alike. Each carries a severity — `critical` for the
 * behavior the case exists to test, `advisory` for efficiency budgets — and
 * {@link scoreToolLoopChecks} weighs them accordingly and caps a run that
 * missed a critical check, so "built the wrong thing" can never outscore "built
 * the right thing a bit wastefully".
 *
 * Severity also decides the suite's headline number: `successRate` counts the
 * cases that completed *and* passed every critical check, so a model that
 * called no tool at all cannot pass. How often the loop merely ran to a stop is
 * reported separately as `completionRate`.
 */

import type { BaseProvider } from "@nodetool-ai/runtime";
import {
  runToolLoop,
  type ToolLoopCallRecord
} from "../app-build/tool-loop.js";
import type { EvalCheck } from "./graph-planner-eval.js";
import type { HeadlessTool, ToolLoopFinalState } from "./tool-loop-bridge.js";
import { TOOL_LOOP_EVAL_CASES } from "./tool-loop-cases.js";
import {
  checkEscalationExpectations,
  createEscalationChannel,
  type EscalationConfig,
  type EscalationExpectations,
  type EscalationTurn
} from "./escalation.js";
import {
  gateHeadlessTools,
  type PermissionRequestRecord,
  type ToolLoopPermission
} from "./tool-loop-permission.js";

/**
 * The minimal contract every headless surface bridge (graph editor, script,
 * sketch, timeline, storyboard, 3D) exposes to the runner: a set of executable
 * {@link HeadlessTool tools} carrying the real frontend tool contract, plus a
 * `finalState` snapshot the case's structural predicates run against. `TFinal`
 * is surface-specific (graph → `{nodes, edges}`, timeline → clips/tracks, …).
 */
export interface HeadlessSurfaceBridge<TFinal = unknown> {
  tools: HeadlessTool[];
  finalState: () => TFinal;
}

/** One tool call the model made, with its result and whether it errored. */
export type ToolCallRecord = ToolLoopCallRecord;

/** A named boolean assertion over a surface's final state. */
export interface ToolLoopStatePredicate<TFinal = unknown> {
  name: string;
  test: (state: TFinal) => boolean;
  /** Optional detail shown when the predicate fails. */
  detail?: string;
}

export interface ToolLoopEvalExpectations<TFinal = unknown> {
  /** Tool names that must each be called at least once. */
  requiredTools?: string[];
  /** Tool names that must never be called. */
  forbiddenTools?: string[];
  /**
   * Ordering constraints `[a, b]`: the first call of `a` must precede the first
   * call of `b`. Both tools must be called for the check to pass.
   */
  ordering?: Array<[string, string]>;
  /** Predicates on the final surface state (all must hold). */
  finalState?: ToolLoopStatePredicate<TFinal>[];
  /** Minimum total tool calls across the run. */
  minToolCalls?: number;
  /** Maximum total tool calls across the run (efficiency ceiling). */
  maxToolCalls?: number;
  /** When true, no tool call may have returned an error result. */
  noErrorResults?: boolean;
  /**
   * Expectations over the interactive-escalation exchanges. Only meaningful
   * when the case declares an {@link ToolLoopEvalCase.escalation} config.
   * Note that escalation calls count toward `minToolCalls`/`maxToolCalls` like
   * any other tool call.
   */
  escalation?: EscalationExpectations;
  /**
   * Predicates over the approval requests the permission gate made (all must
   * hold). Only meaningful when the case declares a
   * {@link ToolLoopEvalCase.permission} mode; without one the list is empty.
   */
  permissionRequests?: ToolLoopStatePredicate<
    readonly PermissionRequestRecord[]
  >[];
}

export interface ToolLoopEvalCase<TFinal = ToolLoopFinalState> {
  id: string;
  description: string;
  objective: string;
  /**
   * Build the headless surface bridge (tools + final-state snapshot) this case
   * drives. Called once per run, so each case starts from a fresh in-memory
   * state.
   */
  createBridge: () => HeadlessSurfaceBridge<TFinal>;
  /**
   * Surface-specific system prompt. Falls back to the runner's `systemPrompt`
   * option, then the graph-editor default.
   */
  systemPrompt?: string;
  /** Override the user message (defaults to `Objective: <objective>`). */
  userPrompt?: string;
  /**
   * Case needs configured model providers to be solvable — skipped when the
   * harness runs without any (mirrors the graph-planner suite).
   */
  needsModelProviders?: boolean;
  /**
   * Hand the model an `ask_user` tool backed by a scripted user, making the
   * case interactive: it can escalate an ambiguous or destructive decision and
   * build on the answer. See `./escalation.ts`.
   */
  escalation?: EscalationConfig;
  /**
   * Run the belt through the permission gate in this mode, with a scripted
   * user answering every approval prompt. A case without it is ungated, as
   * before. See `./tool-loop-permission.ts`.
   */
  permission?: ToolLoopPermission;
  /**
   * Turn cap for this case, overriding the runner's `maxIterations`. A case
   * whose work is inherently many-turned — drawing is dozens of strokes, not
   * three property edits — declares the budget it needs rather than forcing
   * every suite run to be invoked with a flag.
   */
  maxIterations?: number;
  expect: ToolLoopEvalExpectations<TFinal>;
}

/** Everything the pure checker needs — no provider, no I/O. */
export interface ToolLoopObservation<TFinal = unknown> {
  toolCalls: ToolCallRecord[];
  finalState: TFinal;
  /** Question/answer exchanges, for cases with an escalation channel. */
  escalations?: readonly EscalationTurn[];
  /** Approval requests the gate made, for cases with a permission mode. */
  permissionRequests?: readonly PermissionRequestRecord[];
}

export interface ToolLoopCaseResult {
  caseId: string;
  description: string;
  skipped: boolean;
  /** The loop ran to a natural stop / cap without a fatal provider error. */
  accepted: boolean;
  /**
   * The case did what it exists to test: the loop completed AND no `critical`
   * check failed. This — not {@link accepted} — is what the suite's success
   * rate and the `--min-success` gate read, because a model that made zero
   * tool calls still "completes".
   */
  success: boolean;
  /**
   * Severity-weighted fraction of checks passed, capped at
   * {@link CRITICAL_FAILURE_SCORE_CAP} when a critical check failed (0 when the
   * loop did not run).
   */
  score: number;
  /** Failing `critical` checks — the core behaviors the case exists to test. */
  criticalFailures: number;
  checks: EvalCheck[];
  /** Tool calls made, by tool name. */
  toolCalls: Record<string, number>;
  /** Total tool calls across all names. */
  totalToolCalls: number;
  /** Approval requests the permission gate made; empty for an ungated case. */
  permissionRequests: PermissionRequestRecord[];
  durationMs: number;
  costUsd: number;
  error?: string;
}

export interface ToolLoopEvalReport {
  provider: string;
  model: string;
  startedAt: string;
  cases: ToolLoopCaseResult[];
  summary: {
    total: number;
    skipped: number;
    accepted: number;
    /** Cases that completed with every critical check passing. */
    successful: number;
    /**
     * successful / (total - skipped) — the gated metric. A run that merely
     * finished without a provider error is not a success.
     */
    successRate: number;
    /** accepted / (total - skipped): the loop ran, whatever it built. */
    completionRate: number;
    /** Mean expectation score over non-skipped cases. */
    meanScore: number;
    avgToolCalls: number;
    totalCostUsd: number;
  };
}

export interface RunToolLoopEvalOptions<TFinal = ToolLoopFinalState> {
  provider: BaseProvider;
  model: string;
  /** Configured providers; enables model-dependent cases (else they skip). */
  providers?: Record<string, BaseProvider>;
  /** Cases to run; defaults to the built-in graph-editor suite. */
  cases?: readonly ToolLoopEvalCase<TFinal>[];
  /** Turn cap — max tool-calling rounds before the loop stops. Defaults to 12. */
  maxIterations?: number;
  /** Override the system prompt handed to the model (per-case wins over this). */
  systemPrompt?: string;
  signal?: AbortSignal;
  /** Progress callback (one line per event, for CLI display). */
  onEvent?: (line: string) => void;
}

const DEFAULT_SYSTEM_PROMPT = `You are a workflow-graph building assistant operating a node-based editor through UI tools.

Build the workflow the user asks for by calling the ui_* tools:
- Discover node types with ui_search_nodes before adding them — never guess a type.
- Add nodes with ui_add_node (choose a stable, unique id per node and a {x, y} position).
- Wire nodes together with ui_connect_nodes using the exact output/input handle names from ui_search_nodes.
- Inspect your work with ui_get_graph when unsure.

Call one tool at a time and use the result before the next call. When the objective is fully satisfied, STOP calling tools and give a one-line summary.`;

function buildUserPrompt(evalCase: {
  userPrompt?: string;
  objective: string;
}): string {
  return evalCase.userPrompt ?? `Objective: ${evalCase.objective}`;
}

/**
 * Weight per severity. A flat pass-fraction made a run that built the right
 * graph but skipped the one behavior under test (`confirm-before-delete`, no
 * `ask_user`) score higher than a run that did everything right and overran a
 * call budget — the two are not comparable, so they should not be weighed
 * alike.
 */
const SEVERITY_WEIGHT = {
  critical: 3,
  standard: 2,
  advisory: 1
} satisfies Record<NonNullable<EvalCheck["severity"]>, number>;

/**
 * Ceiling on a run that failed a `critical` check. Without it, a case with many
 * passing state predicates can bury a core-behavior miss under partial credit.
 */
export const CRITICAL_FAILURE_SCORE_CAP = 0.5;

/** Checks with no severity (other suites) are scored as `standard`. */
function weightOf(check: EvalCheck): number {
  return SEVERITY_WEIGHT[check.severity ?? "standard"];
}

/**
 * Severity-weighted pass fraction, capped when any critical check failed.
 * Exported so the scoring rule is testable on its own.
 */
export function scoreToolLoopChecks(checks: readonly EvalCheck[]): number {
  if (checks.length === 0) return 0;
  const total = checks.reduce((sum, c) => sum + weightOf(c), 0);
  const earned = checks
    .filter((c) => c.pass)
    .reduce((sum, c) => sum + weightOf(c), 0);
  const score = earned / total;
  const criticalFailed = checks.some(
    (c) => !c.pass && c.severity === "critical"
  );
  return criticalFailed ? Math.min(score, CRITICAL_FAILURE_SCORE_CAP) : score;
}

/** Failing checks marked `critical` — the core-behavior misses. */
export function countCriticalFailures(checks: readonly EvalCheck[]): number {
  return checks.filter((c) => !c.pass && c.severity === "critical").length;
}

/**
 * Score a completed run against a case's structural expectations. Pure and
 * fully unit-testable: it takes an {@link ToolLoopObservation} and never calls
 * a provider.
 */
export function checkToolLoopExpectations<TFinal>(
  observation: ToolLoopObservation<TFinal>,
  expect: ToolLoopEvalExpectations<TFinal>
): EvalCheck[] {
  const checks: EvalCheck[] = [];
  const sequence = observation.toolCalls.map((c) => c.name);
  const called = new Set(sequence);

  for (const name of expect.requiredTools ?? []) {
    const pass = called.has(name);
    checks.push({
      name: `tool:${name}`,
      pass,
      severity: "critical",
      detail: pass ? undefined : `never called ${name}`
    });
  }

  for (const name of expect.forbiddenTools ?? []) {
    const hit = called.has(name);
    checks.push({
      name: `not-tool:${name}`,
      pass: !hit,
      severity: "critical",
      detail: hit ? `called forbidden tool ${name}` : undefined
    });
  }

  for (const [a, b] of expect.ordering ?? []) {
    const ia = sequence.indexOf(a);
    const ib = sequence.indexOf(b);
    const pass = ia !== -1 && ib !== -1 && ia < ib;
    checks.push({
      name: `order:${a}<${b}`,
      pass,
      severity: "standard",
      detail: pass
        ? undefined
        : `${a} first@${ia}, ${b} first@${ib} (need ${a} before ${b})`
    });
  }

  for (const predicate of expect.finalState ?? []) {
    let pass = false;
    let detail = predicate.detail;
    try {
      pass = predicate.test(observation.finalState);
    } catch (e) {
      detail = e instanceof Error ? e.message : String(e);
    }
    checks.push({
      name: `state:${predicate.name}`,
      pass,
      severity: "critical",
      detail: pass
        ? undefined
        : (detail ?? `predicate ${predicate.name} failed`)
    });
  }

  if (expect.minToolCalls !== undefined) {
    checks.push({
      name: `toolCalls>=${expect.minToolCalls}`,
      pass: sequence.length >= expect.minToolCalls,
      severity: "advisory",
      detail: `made ${sequence.length}`
    });
  }
  if (expect.maxToolCalls !== undefined) {
    checks.push({
      name: `toolCalls<=${expect.maxToolCalls}`,
      pass: sequence.length <= expect.maxToolCalls,
      severity: "advisory",
      detail: `made ${sequence.length}`
    });
  }

  if (expect.noErrorResults) {
    const errored = observation.toolCalls.filter((c) => c.isError);
    checks.push({
      name: "no-error-results",
      pass: errored.length === 0,
      severity: "standard",
      detail:
        errored.length === 0
          ? undefined
          : `${errored.length} errored: ${errored.map((c) => c.name).join(", ")}`
    });
  }

  if (expect.escalation) {
    checks.push(
      ...checkEscalationExpectations(
        observation.escalations ?? [],
        sequence,
        expect.escalation
      )
    );
  }

  for (const predicate of expect.permissionRequests ?? []) {
    const requests = observation.permissionRequests ?? [];
    let pass = false;
    let detail = predicate.detail;
    try {
      pass = predicate.test(requests);
    } catch (e) {
      detail = e instanceof Error ? e.message : String(e);
    }
    checks.push({
      name: `permission:${predicate.name}`,
      pass,
      severity: "critical",
      detail: pass
        ? undefined
        : (detail ?? `predicate ${predicate.name} failed`)
    });
  }

  return checks;
}

async function runCase<TFinal>(
  evalCase: ToolLoopEvalCase<TFinal>,
  opts: RunToolLoopEvalOptions<TFinal>
): Promise<ToolLoopCaseResult> {
  const bridge = evalCase.createBridge();
  // An interactive case gets one extra tool alongside the surface tools: the
  // scripted user it can escalate to.
  const escalation = evalCase.escalation
    ? createEscalationChannel(evalCase.escalation)
    : undefined;
  const surfaceTools: HeadlessTool[] = escalation
    ? [...bridge.tools, escalation.tool]
    : bridge.tools;
  // A case with a permission mode runs the whole belt through the gate, the
  // scripted user included.
  const gated = evalCase.permission
    ? gateHeadlessTools(surfaceTools, evalCase.permission)
    : undefined;

  const run = await runToolLoop({
    provider: opts.provider,
    model: opts.model,
    tools: gated ? gated.tools : surfaceTools,
    // Per-case (surface-specific) prompt wins over the runner-wide override,
    // which in turn wins over the graph-editor default.
    systemPrompt:
      evalCase.systemPrompt ?? opts.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
    userPrompt: buildUserPrompt(evalCase),
    // A case that declares its own budget wins: an explicit per-case need
    // beats the runner default. An explicit --max-iterations still overrides.
    maxIterations: opts.maxIterations ?? evalCase.maxIterations,
    signal: opts.signal,
    onToolCall: (record) =>
      opts.onEvent?.(
        `    [tool] ${record.name}${record.isError ? " (error)" : ""}`
      )
  });

  const accepted = run.completed;
  const observation: ToolLoopObservation<TFinal> = {
    toolCalls: run.calls,
    finalState: bridge.finalState(),
    escalations: escalation?.turns(),
    permissionRequests: gated?.requests()
  };

  const checks: EvalCheck[] = [
    {
      name: "accepted",
      pass: accepted,
      severity: "critical",
      detail: run.error
    }
  ];
  if (accepted) {
    checks.push(...checkToolLoopExpectations(observation, evalCase.expect));
  }
  const score = accepted ? scoreToolLoopChecks(checks) : 0;
  const criticalFailures = countCriticalFailures(checks);

  return {
    caseId: evalCase.id,
    description: evalCase.description,
    skipped: false,
    accepted,
    success: accepted && criticalFailures === 0,
    score,
    criticalFailures,
    checks,
    toolCalls: run.countsByName,
    totalToolCalls: run.totalCalls,
    permissionRequests: [...(observation.permissionRequests ?? [])],
    durationMs: run.durationMs,
    costUsd: run.costUsd,
    error: run.error
  };
}

export async function runToolLoopEval<TFinal = ToolLoopFinalState>(
  opts: RunToolLoopEvalOptions<TFinal>
): Promise<ToolLoopEvalReport> {
  const cases = (opts.cases ??
    TOOL_LOOP_EVAL_CASES) as readonly ToolLoopEvalCase<TFinal>[];
  const hasModelProviders =
    !!opts.providers && Object.keys(opts.providers).length > 0;
  const results: ToolLoopCaseResult[] = [];

  for (const evalCase of cases) {
    if (opts.signal?.aborted) break;
    if (evalCase.needsModelProviders && !hasModelProviders) {
      opts.onEvent?.(`- ${evalCase.id}: SKIPPED (no model providers)`);
      results.push({
        caseId: evalCase.id,
        description: evalCase.description,
        skipped: true,
        accepted: false,
        success: false,
        score: 0,
        criticalFailures: 0,
        checks: [],
        toolCalls: {},
        totalToolCalls: 0,
        permissionRequests: [],
        durationMs: 0,
        costUsd: 0
      });
      continue;
    }

    opts.onEvent?.(`- ${evalCase.id}: ${evalCase.description}`);
    const result = await runCase(evalCase, opts);
    const failed = result.checks.filter((c) => !c.pass);
    opts.onEvent?.(
      `  ${result.success ? "PASS" : "FAIL"} score=${result.score.toFixed(2)} ` +
        `tools=${result.totalToolCalls} ${Math.round(result.durationMs / 1000)}s` +
        (failed.length > 0
          ? ` | failed: ${failed.map((c) => c.name).join(", ")}`
          : "")
    );
    results.push(result);
  }

  const ran = results.filter((r) => !r.skipped);
  const acceptedResults = ran.filter((r) => r.accepted);
  const successful = ran.filter((r) => r.success).length;
  const summary = {
    total: results.length,
    skipped: results.length - ran.length,
    accepted: acceptedResults.length,
    successful,
    successRate: ran.length > 0 ? successful / ran.length : 0,
    completionRate: ran.length > 0 ? acceptedResults.length / ran.length : 0,
    meanScore:
      ran.length > 0 ? ran.reduce((a, r) => a + r.score, 0) / ran.length : 0,
    avgToolCalls:
      ran.length > 0
        ? ran.reduce((a, r) => a + r.totalToolCalls, 0) / ran.length
        : 0,
    totalCostUsd: ran.reduce((a, r) => a + r.costUsd, 0)
  };

  return {
    provider: opts.provider.provider,
    model: opts.model,
    startedAt: new Date().toISOString(),
    cases: results,
    summary
  };
}

/** Text summary table for terminal output. */
export function formatToolLoopReport(report: ToolLoopEvalReport): string {
  const lines: string[] = [];
  lines.push(
    `Tool-loop eval — provider=${report.provider} model=${report.model}`
  );
  lines.push("");
  const header = [
    "case".padEnd(24),
    "result".padEnd(7),
    "score".padEnd(6),
    "crit".padEnd(5),
    "tools".padEnd(6),
    "time".padEnd(7),
    "cost"
  ].join("");
  lines.push(header);
  lines.push("-".repeat(header.length));
  for (const r of report.cases) {
    lines.push(
      [
        r.caseId.padEnd(24),
        (r.skipped
          ? "skip"
          : r.success
            ? "pass"
            : r.accepted
              ? "FAIL"
              : "ERROR"
        ).padEnd(7),
        (r.skipped ? "-" : r.score.toFixed(2)).padEnd(6),
        (r.skipped ? "-" : String(r.criticalFailures)).padEnd(5),
        String(r.totalToolCalls).padEnd(6),
        `${Math.round(r.durationMs / 1000)}s`.padEnd(7),
        r.costUsd > 0 ? `$${r.costUsd.toFixed(4)}` : "-"
      ].join("")
    );
    for (const c of r.checks.filter((c) => !c.pass)) {
      // Severity first: a reader scanning failures needs to know which ones
      // are the behavior under test and which are budget overruns.
      const tag = c.severity === "critical" ? "[critical] " : "";
      lines.push(`  ✗ ${tag}${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
    }
  }
  const s = report.summary;
  lines.push("");
  lines.push(
    `success ${s.successful}/${s.total - s.skipped} (${(s.successRate * 100).toFixed(0)}%)` +
      `  completed ${(s.completionRate * 100).toFixed(0)}%` +
      `  mean score ${s.meanScore.toFixed(2)}` +
      `  avg tools ${s.avgToolCalls.toFixed(1)}` +
      (s.totalCostUsd > 0 ? `  cost $${s.totalCostUsd.toFixed(4)}` : "") +
      (s.skipped > 0 ? `  (${s.skipped} skipped)` : "")
  );
  return lines.join("\n");
}
