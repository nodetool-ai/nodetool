/**
 * Code node authoring (`CodePlanner`) evaluation harness — provider-agnostic.
 *
 * Runs {@link CodeGenEvalCase}s through `CodePlanner.plan()` with any
 * `BaseProvider`, records what the feedback loop cost (submit rounds, tool
 * calls, duration, cost), and scores each accepted submission structurally.
 *
 * Acceptance is reported twice, because they are different claims about a
 * model: **first-pass** is a submission accepted on round 1 — the model wrote
 * valid code from the prompt alone — and **post-repair** is a submission
 * accepted at all within the round cap, after the tool fed its rejections back.
 * A model can score badly on the first and well on the second; the rollout gate
 * reads post-repair.
 */

import type { BaseProvider, ProcessingContext } from "@nodetool-ai/runtime";
import type {
  CodeGenExpectedOutput,
  CodeGenInputPort,
  CodeGenSubmission
} from "@nodetool-ai/protocol/api-schemas/code-gen.js";

import { CodePlanner } from "../code-planner.js";
import {
  analyzeGeneratedCode,
  collectBoundNames
} from "../code-gen/analyze.js";
import { unknownApiReferences } from "../code-gen/sandbox-prompt.js";
import { CODE_GEN_EVAL_CASES } from "./code-gen-cases.js";
import { isString } from "../utils/type-guards.js";

export interface CodeGenEvalExpectations {
  /** Output names that must be declared (exact names the instruction implies). */
  requiredOutputs?: string[];
  /** Accepted `type.type` values per declared output name. */
  outputTypes?: Record<string, string[]>;
  /** Each kind must be the type of at least one declared output. */
  outputTypeKinds?: string[];
  minOutputs?: number;
  maxOutputs?: number;
  /** Regex sources; each must match the generated code. */
  requiredCodePatterns?: string[];
  /** Regex sources; none may match the generated code. */
  forbiddenCodePatterns?: string[];
}

export interface CodeGenEvalCase {
  id: string;
  description: string;
  /** What the user asked for, in their own words. */
  instruction: string;
  /** Slots the dialog offers, as if seeded from connected handles. */
  inputs?: CodeGenInputPort[];
  /** Set for the destination-handle entry point. */
  expectedOutput?: CodeGenExpectedOutput;
  expect: CodeGenEvalExpectations;
}

export interface CodeGenEvalCheck {
  name: string;
  pass: boolean;
  detail?: string;
}

export interface CodeGenCaseResult {
  caseId: string;
  description: string;
  /** A submission was accepted within the round cap. */
  accepted: boolean;
  /** Accepted on the first `submit_code` call — no repair round needed. */
  firstPass: boolean;
  /** Accepted only after at least one rejection was fed back. */
  repaired: boolean;
  /** Fraction of checks passed (0 when nothing was accepted). */
  score: number;
  checks: CodeGenEvalCheck[];
  /** Tool calls the planner made, by tool name. */
  toolCalls: Record<string, number>;
  /** `submit_code` calls — 1 means the model got it right first try. */
  submitRounds: number;
  durationMs: number;
  costUsd: number;
  /** Declared output names of the accepted submission. */
  outputs: string[];
  codeChars: number;
  /** Failure code from the planner, when nothing was accepted. */
  error?: string;
}

export interface CodeGenEvalReport {
  provider: string;
  model: string;
  startedAt: string;
  cases: CodeGenCaseResult[];
  summary: {
    total: number;
    /** Cases accepted on round 1. */
    firstPass: number;
    /** Cases accepted at all, round 1 or after repair. */
    postRepair: number;
    firstPassRate: number;
    postRepairRate: number;
    /** Fraction of accepted cases that needed a repair round. */
    repairRate: number;
    /** Mean expectation score over all cases. */
    meanScore: number;
    avgSubmitRounds: number;
    avgDurationMs: number;
    totalCostUsd: number;
  };
}

export interface RunCodeGenEvalOptions {
  provider: BaseProvider;
  model: string;
  /** Cases to run; defaults to the built-in suite. */
  cases?: readonly CodeGenEvalCase[];
  /** Feedback rounds per case. Defaults to the planner's own cap. */
  maxRounds?: number;
  signal?: AbortSignal;
  /** Progress callback (one line per event, for CLI display). */
  onEvent?: (line: string) => void;
}

function totalToolCalls(byName: Record<string, number>): number {
  return Object.values(byName).reduce((a, b) => a + b, 0);
}

function typeOf(port: { type: { type?: unknown } }): string {
  return isString(port.type.type) ? port.type.type : "unknown";
}

/**
 * Names a generated body may reference without inventing anything: the sandbox
 * surface (checked by `unknownApiReferences`), the node's own ports, which
 * arrive as globals, and whatever the code binds itself.
 */
function invitedNames(submission: CodeGenSubmission): string[] {
  return [
    ...submission.inputs.map((port) => port.name),
    ...submission.outputs.map((port) => port.name),
    ...collectBoundNames(submission.code)
  ];
}

/** Score an accepted submission against the case expectations. */
export function checkCodeGenExpectations(
  submission: CodeGenSubmission,
  evalCase: CodeGenEvalCase
): CodeGenEvalCheck[] {
  const checks: CodeGenEvalCheck[] = [];
  const expect = evalCase.expect;
  const outputNames = submission.outputs.map((port) => port.name);
  const inputNames = submission.inputs.map((port) => port.name);

  for (const name of expect.requiredOutputs ?? []) {
    const found = outputNames.includes(name);
    checks.push({
      name: `output:${name}`,
      pass: found,
      detail: found ? undefined : `declared outputs: ${outputNames.join(", ")}`
    });
  }

  for (const [name, accepted] of Object.entries(expect.outputTypes ?? {})) {
    const port = submission.outputs.find((p) => p.name === name);
    const actual = port ? typeOf(port) : "missing";
    checks.push({
      name: `type:${name}`,
      pass: accepted.includes(actual),
      detail: `is ${actual}, expected one of ${accepted.join("|")}`
    });
  }

  for (const kind of expect.outputTypeKinds ?? []) {
    const found = submission.outputs.some((port) => typeOf(port) === kind);
    checks.push({
      name: `anyOutputOfType:${kind}`,
      pass: found,
      detail: found
        ? undefined
        : `output types: ${submission.outputs.map(typeOf).join(", ")}`
    });
  }

  if (expect.minOutputs !== undefined) {
    checks.push({
      name: `outputs>=${expect.minOutputs}`,
      pass: outputNames.length >= expect.minOutputs,
      detail: `declared ${outputNames.length}`
    });
  }
  if (expect.maxOutputs !== undefined) {
    checks.push({
      name: `outputs<=${expect.maxOutputs}`,
      pass: outputNames.length <= expect.maxOutputs,
      detail: `declared ${outputNames.length}`
    });
  }

  for (const pattern of expect.requiredCodePatterns ?? []) {
    const found = new RegExp(pattern).test(submission.code);
    checks.push({
      name: `code:${pattern}`,
      pass: found,
      detail: found ? undefined : `code does not match /${pattern}/`
    });
  }
  for (const pattern of expect.forbiddenCodePatterns ?? []) {
    const found = new RegExp(pattern).test(submission.code);
    checks.push({
      name: `notCode:${pattern}`,
      pass: !found,
      detail: found ? `code matches forbidden /${pattern}/` : undefined
    });
  }

  // ── Universal checks, applied to every case ─────────────────────────────

  // The dialog offers a fixed set of slots; a declared input outside it has no
  // value at runtime and no handle to connect.
  const offered = new Set((evalCase.inputs ?? []).map((port) => port.name));
  const invented = inputNames.filter((name) => !offered.has(name));
  checks.push({
    name: "inputs-offered",
    pass: invented.length === 0,
    detail:
      invented.length === 0
        ? undefined
        : `declared inputs not on offer: ${invented.join(", ")}`
  });

  // The destination-handle entry point promises one named, typed output.
  if (evalCase.expectedOutput) {
    const port = submission.outputs.find(
      (p) => p.name === evalCase.expectedOutput?.name
    );
    checks.push({
      name: "expected-output",
      pass: port !== undefined && typeOf(port) === evalCase.expectedOutput.type.type,
      detail: port
        ? `is ${typeOf(port)}, expected ${String(evalCase.expectedOutput.type.type)}`
        : `no output named "${evalCase.expectedOutput.name}"`
    });
  }

  // Every declared output assigned on every visible return path.
  const analysis = analyzeGeneratedCode(submission.code, outputNames);
  checks.push({
    name: "outputs-assigned",
    pass: analysis.ok,
    detail: analysis.ok ? undefined : analysis.errors.join(" ")
  });

  // `state` and `yield` are the streaming surface; a one-shot transformation
  // that reaches for them is noise the prompt asks the model to avoid.
  const streaming = /\bstate\b|\byield\b/.test(submission.code);
  checks.push({
    name: "no-streaming-surface",
    pass: !streaming,
    detail: streaming ? "code uses `state` or `yield` unasked" : undefined
  });

  // Anything referenced that is neither sandbox API nor locally bound is a
  // library the guest does not have — it throws on the first run.
  const unknown = unknownApiReferences(submission.code).filter(
    (name) => !invitedNames(submission).includes(name)
  );
  checks.push({
    name: "no-invented-apis",
    pass: unknown.length === 0,
    detail:
      unknown.length === 0 ? undefined : `unknown names: ${unknown.join(", ")}`
  });

  return checks;
}

async function runCase(
  evalCase: CodeGenEvalCase,
  opts: RunCodeGenEvalOptions
): Promise<CodeGenCaseResult> {
  const toolCalls: Record<string, number> = {};
  const costBefore = opts.provider.getTotalCost();
  const startedAt = Date.now();

  const planner = new CodePlanner({
    provider: opts.provider,
    model: opts.model,
    instruction: evalCase.instruction,
    inputs: evalCase.inputs,
    expectedOutput: evalCase.expectedOutput,
    maxRounds: opts.maxRounds,
    signal: opts.signal
  });

  let submission: CodeGenSubmission | null = null;
  let error: string | undefined;
  try {
    const generator = planner.plan({} as ProcessingContext);
    let next = await generator.next();
    while (!next.done) {
      const message = next.value;
      if (message.type === "tool_call_update") {
        const name = String(message.name ?? "unknown");
        toolCalls[name] = (toolCalls[name] ?? 0) + 1;
        opts.onEvent?.(`    [tool] ${name}`);
      }
      next = await generator.next();
    }
    const response = next.value;
    if (response.status === "ok") {
      submission = response.submission;
    } else {
      error = `${response.error.code}: ${response.error.message}`;
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const durationMs = Date.now() - startedAt;
  const costUsd = opts.provider.getTotalCost() - costBefore;
  const submitRounds = toolCalls["submit_code"] ?? 0;

  const checks: CodeGenEvalCheck[] = [
    { name: "accepted", pass: submission !== null, detail: error }
  ];
  if (submission) checks.push(...checkCodeGenExpectations(submission, evalCase));
  const score = submission
    ? checks.filter((c) => c.pass).length / checks.length
    : 0;

  return {
    caseId: evalCase.id,
    description: evalCase.description,
    accepted: submission !== null,
    firstPass: submission !== null && submitRounds === 1,
    repaired: submission !== null && submitRounds > 1,
    score,
    checks,
    toolCalls,
    submitRounds,
    durationMs,
    costUsd,
    outputs: submission?.outputs.map((port) => port.name) ?? [],
    codeChars: submission?.code.length ?? 0,
    error
  };
}

export async function runCodeGenEval(
  opts: RunCodeGenEvalOptions
): Promise<CodeGenEvalReport> {
  const cases = opts.cases ?? CODE_GEN_EVAL_CASES;
  const results: CodeGenCaseResult[] = [];

  for (const evalCase of cases) {
    if (opts.signal?.aborted) break;
    opts.onEvent?.(`- ${evalCase.id}: ${evalCase.description}`);
    const result = await runCase(evalCase, opts);
    const failed = result.checks.filter((c) => !c.pass);
    opts.onEvent?.(
      `  ${result.accepted ? (result.firstPass ? "PASS" : "REPAIRED") : "FAIL"} ` +
        `score=${result.score.toFixed(2)} submits=${result.submitRounds} ` +
        `outputs=${result.outputs.length} ${Math.round(result.durationMs / 1000)}s` +
        (failed.length > 0
          ? ` | failed: ${failed.map((c) => c.name).join(", ")}`
          : "")
    );
    results.push(result);
  }

  const total = results.length;
  const firstPass = results.filter((r) => r.firstPass).length;
  const postRepair = results.filter((r) => r.accepted).length;
  const mean = (pick: (r: CodeGenCaseResult) => number): number =>
    total > 0 ? results.reduce((a, r) => a + pick(r), 0) / total : 0;

  return {
    provider: opts.provider.provider,
    model: opts.model,
    startedAt: new Date().toISOString(),
    cases: results,
    summary: {
      total,
      firstPass,
      postRepair,
      firstPassRate: total > 0 ? firstPass / total : 0,
      postRepairRate: total > 0 ? postRepair / total : 0,
      repairRate:
        postRepair > 0
          ? results.filter((r) => r.repaired).length / postRepair
          : 0,
      meanScore: mean((r) => r.score),
      avgSubmitRounds: mean((r) => r.submitRounds),
      avgDurationMs: mean((r) => r.durationMs),
      totalCostUsd: results.reduce((a, r) => a + r.costUsd, 0)
    }
  };
}

/** Text summary table for terminal output. */
export function formatCodeGenReport(report: CodeGenEvalReport): string {
  const lines: string[] = [];
  lines.push(
    `Code generation eval — provider=${report.provider} model=${report.model}`
  );
  lines.push("");
  const header = [
    "case".padEnd(18),
    "result".padEnd(10),
    "score".padEnd(6),
    "submits".padEnd(8),
    "tools".padEnd(6),
    "outs".padEnd(5),
    "time".padEnd(7),
    "cost"
  ].join("");
  lines.push(header);
  lines.push("-".repeat(header.length));
  for (const r of report.cases) {
    lines.push(
      [
        r.caseId.padEnd(18),
        (r.firstPass ? "first-pass" : r.accepted ? "repaired" : "FAIL").padEnd(
          10
        ),
        r.score.toFixed(2).padEnd(6),
        String(r.submitRounds).padEnd(8),
        String(totalToolCalls(r.toolCalls)).padEnd(6),
        String(r.outputs.length).padEnd(5),
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
    `first-pass ${s.firstPass}/${s.total} (${(s.firstPassRate * 100).toFixed(0)}%)` +
      `  post-repair ${s.postRepair}/${s.total} (${(s.postRepairRate * 100).toFixed(0)}%)` +
      `  mean score ${s.meanScore.toFixed(2)}` +
      `  avg submits ${s.avgSubmitRounds.toFixed(1)}` +
      `  avg time ${(s.avgDurationMs / 1000).toFixed(1)}s` +
      (s.totalCostUsd > 0 ? `  cost $${s.totalCostUsd.toFixed(4)}` : "")
  );
  return lines.join("\n");
}
