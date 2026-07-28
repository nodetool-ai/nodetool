/**
 * ScriptPlanner (script mode) evaluation harness — provider-agnostic.
 *
 * Script mode is the third planning mode: instead of a DAG of tasks the model
 * authors a JavaScript orchestration script that the {@link ScriptRunner}
 * executes, with each `agent()` call spawning a real sub-agent. This suite
 * scores the authored script the way the graph-planner suite scores an
 * accepted graph — statically, without running it.
 *
 * `validateScript` already gates the submission (non-empty, calls `agent(`,
 * has a `return`, compiles). What it cannot judge is whether the script uses
 * the control flow the objective actually calls for: concurrency for
 * independent work, a real loop for unknown-size discovery, a budget guard so
 * the loop degrades instead of dying on the call cap, a schema on the final
 * aggregation. Those are the expectations here.
 *
 * Scoring is structural (see {@link checkScriptExpectations}) — never an exact
 * script, so many valid orchestrations pass.
 */

import { randomUUID } from "node:crypto";
import type { BaseProvider } from "@nodetool-ai/runtime";
import { ProcessingContext } from "@nodetool-ai/runtime";
import type { EvalCheck } from "./graph-planner-eval.js";
import { ScriptPlanner, validateScript } from "../script-planner.js";
import { SCRIPT_RESERVED_NAMES } from "../script-runner.js";
import { createPlannerTools } from "./planner-tools.js";
import {
  SCRIPT_PLANNER_EVAL_CASES,
  type ScriptPlannerEvalCase,
  type ScriptPlannerEvalExpectations
} from "./script-planner-cases.js";

/** `agent(...)` calls, ignoring property accesses like `foo.agent(`. */
const AGENT_CALL_RE = /(?<![\w.$])agent\s*\(/g;
/** `parallel(` or `pipeline(` — the two concurrency primitives. */
const CONCURRENCY_RE = /(?<![\w.$])(?:parallel|pipeline)\s*\(/;
/** A real loop, not an array `.map`: the shape unknown-size discovery needs. */
const LOOP_RE = /\b(?:while|for)\s*\(/;
/** The guard that keeps a loop from dying on the lifetime call cap. */
const BUDGET_GUARD_RE =
  /budget\s*\.\s*(?:remainingCalls|agentCalls|spentUsd)\s*\(/;
/** A schema passed to `agent()` — structured, validated sub-agent output. */
const SCHEMA_OPT_RE = /\bschema\s*:/;
/** Module syntax the sandbox has no loader for. */
const MODULE_SYNTAX_RE = /(?:^|\n)\s*import\s|(?<![\w.$])require\s*\(/;

export interface ScriptPlanCaseResult {
  caseId: string;
  description: string;
  skipped: boolean;
  /** The planner returned an accepted script. */
  accepted: boolean;
  score: number;
  checks: EvalCheck[];
  /** `agent()` call sites in the source (static count, not runtime calls). */
  agentCalls: number;
  chars: number;
  /** `submit_script` calls — 1 means the model one-shotted the script. */
  submitRounds: number;
  /** Submissions the host validator rejected. */
  validationFailures: number;
  durationMs: number;
  costUsd: number;
  /** The accepted script, so a report can be inspected after the fact. */
  script?: string;
  error?: string;
}

export interface ScriptPlanEvalReport {
  provider: string;
  model: string;
  startedAt: string;
  cases: ScriptPlanCaseResult[];
  summary: {
    total: number;
    skipped: number;
    accepted: number;
    /** accepted / (total - skipped) */
    successRate: number;
    /** Mean expectation score over non-skipped cases. */
    meanScore: number;
    /** Fraction of accepted scripts that passed validation on the first try. */
    oneShotRate: number;
    avgAgentCalls: number;
    avgChars: number;
    avgDurationMs: number;
    totalCostUsd: number;
  };
}

export interface RunScriptPlannerEvalOptions {
  provider: BaseProvider;
  model: string;
  /** Configured providers; enables model-dependent cases (else they skip). */
  providers?: Record<string, BaseProvider>;
  /** Cases to run; defaults to the built-in suite. */
  cases?: readonly ScriptPlannerEvalCase[];
  signal?: AbortSignal;
  /** Progress callback (one line per event, for CLI display). */
  onEvent?: (line: string) => void;
}

/** Static count of `agent()` call sites in a script. */
export function countAgentCalls(script: string): number {
  return script.match(AGENT_CALL_RE)?.length ?? 0;
}

/**
 * Score an accepted script against a case's expectations. Pure and fully
 * unit-testable: takes the source text, never calls a provider and never
 * executes the script.
 */
export function checkScriptExpectations(
  script: string,
  expect: ScriptPlannerEvalExpectations
): EvalCheck[] {
  const checks: EvalCheck[] = [];

  if (expect.minAgentCalls !== undefined) {
    const count = countAgentCalls(script);
    checks.push({
      name: `agentCalls>=${expect.minAgentCalls}`,
      pass: count >= expect.minAgentCalls,
      detail: `found ${count}`
    });
  }

  if (expect.requireConcurrency) {
    const pass = CONCURRENCY_RE.test(script);
    checks.push({
      name: "concurrency",
      pass,
      detail: pass
        ? undefined
        : "no parallel()/pipeline() — independent work is serialized"
    });
  }

  if (expect.requireLoop) {
    const pass = LOOP_RE.test(script);
    checks.push({
      name: "loop",
      pass,
      detail: pass
        ? undefined
        : "no for/while loop — unknown-size work was unrolled"
    });
  }

  if (expect.requireBudgetGuard) {
    const pass = BUDGET_GUARD_RE.test(script);
    checks.push({
      name: "budget-guard",
      pass,
      detail: pass
        ? undefined
        : "loop is not guarded by budget.remainingCalls()"
    });
  }

  if (expect.requireSchema) {
    const pass = SCHEMA_OPT_RE.test(script);
    checks.push({
      name: "schema",
      pass,
      detail: pass ? undefined : "no agent() call requests a structured result"
    });
  }

  for (const pattern of expect.requiredPatterns ?? []) {
    const pass = new RegExp(pattern, "i").test(script);
    checks.push({
      name: `has:${pattern}`,
      pass,
      detail: pass ? undefined : `script does not match /${pattern}/i`
    });
  }

  for (const pattern of expect.forbiddenPatterns ?? []) {
    const hit = new RegExp(pattern, "i").test(script);
    checks.push({
      name: `not:${pattern}`,
      pass: !hit,
      detail: hit ? `script matches forbidden /${pattern}/i` : undefined
    });
  }

  if (expect.maxChars !== undefined) {
    checks.push({
      name: `chars<=${expect.maxChars}`,
      pass: script.length <= expect.maxChars,
      detail: `${script.length} chars`
    });
  }

  // Universal: the host validator must still be satisfied. The planner gates
  // on it too, so a failure here means an accepted script drifted from what
  // the runner will take.
  const errors = validateScript(script);
  checks.push({
    name: "validates",
    pass: errors.length === 0,
    detail: errors.length === 0 ? undefined : errors.join("; ")
  });

  // Universal: the prelude owns these names. Redeclaring one shadows the real
  // bridge, and the script silently does nothing.
  const shadowed = SCRIPT_RESERVED_NAMES.filter((name) =>
    new RegExp(`\\b(?:const|let|var|function)\\s+${name}\\b`).test(script)
  );
  checks.push({
    name: "no-shadowing",
    pass: shadowed.length === 0,
    detail:
      shadowed.length === 0 ? undefined : `redeclares ${shadowed.join(", ")}`
  });

  // Universal: no module loader exists inside the QuickJS guest.
  const usesModules = MODULE_SYNTAX_RE.test(script);
  checks.push({
    name: "no-imports",
    pass: !usesModules,
    detail: usesModules ? "script uses import/require" : undefined
  });

  return checks;
}

async function runCase(
  evalCase: ScriptPlannerEvalCase,
  opts: RunScriptPlannerEvalOptions
): Promise<ScriptPlanCaseResult> {
  let submitRounds = 0;
  let validationFailures = 0;
  const costBefore = opts.provider.getTotalCost();
  const startedAt = Date.now();

  const planner = new ScriptPlanner({
    provider: opts.provider,
    model: opts.model,
    tools: createPlannerTools(),
    outputSchema: evalCase.outputSchema,
    inputs: evalCase.inputs,
    signal: opts.signal
  });

  const context = new ProcessingContext({
    jobId: `script-planner-eval-${randomUUID()}`,
    userId: "eval-user"
  });

  let script: string | null = null;
  let error: string | undefined;
  try {
    const gen = planner.plan(evalCase.objective, context);
    let res = await gen.next();
    while (!res.done) {
      const m = res.value as { type?: string } & Record<string, unknown>;
      if (m.type === "planning_update") {
        if (m.phase === "generation" && m.status === "running") {
          submitRounds++;
          opts.onEvent?.("    [submit_script]");
        } else if (m.phase === "validation" && m.status === "failed") {
          validationFailures++;
          opts.onEvent?.(`    [rejected] ${String(m.content ?? "")}`);
        }
      }
      res = await gen.next();
    }
    script = res.value;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const durationMs = Date.now() - startedAt;
  const costUsd = opts.provider.getTotalCost() - costBefore;

  const checks: EvalCheck[] = [
    { name: "accepted", pass: script !== null, detail: error }
  ];
  if (script) checks.push(...checkScriptExpectations(script, evalCase.expect));
  const score = script
    ? checks.filter((c) => c.pass).length / checks.length
    : 0;

  return {
    caseId: evalCase.id,
    description: evalCase.description,
    skipped: false,
    accepted: script !== null,
    score,
    checks,
    agentCalls: script ? countAgentCalls(script) : 0,
    chars: script?.length ?? 0,
    submitRounds,
    validationFailures,
    durationMs,
    costUsd,
    script: script ?? undefined,
    error
  };
}

export async function runScriptPlannerEval(
  opts: RunScriptPlannerEvalOptions
): Promise<ScriptPlanEvalReport> {
  const cases = opts.cases ?? SCRIPT_PLANNER_EVAL_CASES;
  const hasModelProviders =
    !!opts.providers && Object.keys(opts.providers).length > 0;
  const results: ScriptPlanCaseResult[] = [];

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
        agentCalls: 0,
        chars: 0,
        submitRounds: 0,
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
        `agents=${result.agentCalls} chars=${result.chars} ` +
        `submits=${result.submitRounds} ${Math.round(result.durationMs / 1000)}s` +
        (failed.length > 0
          ? ` | failed: ${failed.map((c) => c.name).join(", ")}`
          : "")
    );
    results.push(result);
  }

  const ran = results.filter((r) => !r.skipped);
  const acceptedResults = ran.filter((r) => r.accepted);
  const mean = (pick: (r: ScriptPlanCaseResult) => number): number =>
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
      oneShotRate:
        acceptedResults.length > 0
          ? acceptedResults.filter((r) => r.validationFailures === 0).length /
            acceptedResults.length
          : 0,
      avgAgentCalls: mean((r) => r.agentCalls),
      avgChars: mean((r) => r.chars),
      avgDurationMs: mean((r) => r.durationMs),
      totalCostUsd: ran.reduce((a, r) => a + r.costUsd, 0)
    }
  };
}

/** Text summary table for terminal output. */
export function formatScriptPlanReport(report: ScriptPlanEvalReport): string {
  const lines: string[] = [];
  lines.push(
    `ScriptPlanner eval — provider=${report.provider} model=${report.model}`
  );
  lines.push("");
  const header = [
    "case".padEnd(22),
    "result".padEnd(7),
    "score".padEnd(6),
    "agents".padEnd(7),
    "chars".padEnd(7),
    "submits".padEnd(8),
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
        String(r.agentCalls).padEnd(7),
        String(r.chars).padEnd(7),
        String(r.submitRounds).padEnd(8),
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
      `  one-shot ${(s.oneShotRate * 100).toFixed(0)}%` +
      `  avg agents ${s.avgAgentCalls.toFixed(1)}` +
      `  avg chars ${Math.round(s.avgChars)}` +
      `  avg time ${(s.avgDurationMs / 1000).toFixed(1)}s` +
      (s.totalCostUsd > 0 ? `  cost $${s.totalCostUsd.toFixed(4)}` : "") +
      (s.skipped > 0 ? `  (${s.skipped} skipped)` : "")
  );
  return lines.join("\n");
}
