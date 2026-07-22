/**
 * Sub-agent execution evaluation harness — provider-agnostic.
 *
 * Drives a real parent agent ({@link StepExecutor}) equipped with the
 * {@link RunSubtaskTool} plus a library of {@link createInstrumentedTools
 * instrumented tools}. Each case's objective is written so the parent must
 * delegate to a child sub-agent; the harness then scores whether the *child*
 * (depth >= 1), not the parent, actually ran the inherited tools, plus subtask
 * count, recursion depth, error propagation, and whether the delegated result
 * flowed back into the parent's final answer.
 *
 * Unlike the tool-loop suites (headless bridges over a flat `ui_*` surface),
 * this exercises the genuine recursion machinery: `RunSubtaskTool` spins up a
 * fresh `StepExecutor` with a copied, depth-bumped context and the parent's
 * toolset. The instrumented tools are the same instances at both levels, so the
 * `SUBTASK_DEPTH_KEY` each call reads from its context is the ground truth for
 * "who ran this".
 *
 * Scoring is structural (see {@link checkSubtaskExpectations}) — required
 * parent/child tools, forbidden tools, subtask-count and depth bounds, no
 * failed subtasks, required store keys, and answer substrings — never an exact
 * transcript, so many valid delegations pass.
 */

import { randomUUID } from "node:crypto";
import type { BaseProvider } from "@nodetool-ai/runtime";
import { ProcessingContext } from "@nodetool-ai/runtime";
import type { ProcessingMessage, StepResult } from "@nodetool-ai/protocol";
import type { EvalCheck } from "./graph-planner-eval.js";
import { StepExecutor } from "../step-executor.js";
import { RunSubtaskTool } from "../tools/run-subtask-tool.js";
import type { Tool } from "../tools/base-tool.js";
import type { Step, Task } from "../types.js";
import {
  createInstrumentedTools,
  createToolRecorder,
  SUBTASK_EVAL_CASES,
  type SubtaskEvalCase,
  type SubtaskEvalExpectations,
  type ToolRecorder
} from "./subtask-cases.js";

const DEFAULT_MAX_ITERATIONS = 16;

/** One spawned subtask and how it resolved. */
export interface SubtaskSpawnRecord {
  description: string;
  /** True when `run_subtask` returned an error envelope. */
  failed: boolean;
  errorCode: string | null;
  /** The subtask's returned value coerced to text (the result the parent saw). */
  resultText: string;
}

/** Everything the pure checker needs — no provider, no I/O. */
export interface SubtaskObservation {
  /** Tool names the parent (depth 0) called directly, plus `run_subtask`. */
  parentTools: Set<string>;
  /** Tool names called inside a subtask (depth >= 1). */
  childTools: Set<string>;
  /** Every tool name called at any depth (incl. `run_subtask`). */
  allTools: Set<string>;
  /** Subtasks the parent spawned (excludes depth-refused / bad-arg calls). */
  spawns: SubtaskSpawnRecord[];
  /** Deepest sub-agent level a tool actually ran at. */
  maxDepth: number;
  /** Keys present in the shared store at the end of the run. */
  storeKeys: Set<string>;
  /** The parent agent's final answer text. */
  answer: string;
  /** Text each spawned subtask returned to the parent. */
  subtaskResults: string[];
}

export interface SubtaskCaseResult {
  caseId: string;
  description: string;
  skipped: boolean;
  /** The parent loop ran to a natural stop without a fatal provider error. */
  accepted: boolean;
  score: number;
  checks: EvalCheck[];
  /** Number of subtasks spawned. */
  subtasks: number;
  /** Deepest sub-agent level reached. */
  maxDepth: number;
  /** Tool calls made at any depth (incl. run_subtask). */
  totalToolCalls: number;
  durationMs: number;
  costUsd: number;
  error?: string;
}

export interface SubtaskEvalReport {
  provider: string;
  model: string;
  startedAt: string;
  cases: SubtaskCaseResult[];
  summary: {
    total: number;
    skipped: number;
    accepted: number;
    /** accepted / (total - skipped) */
    successRate: number;
    /** Mean expectation score over non-skipped cases. */
    meanScore: number;
    avgSubtasks: number;
    totalCostUsd: number;
  };
}

export interface RunSubtaskEvalOptions {
  provider: BaseProvider;
  model: string;
  /** Configured providers; enables model-dependent cases (else they skip). */
  providers?: Record<string, BaseProvider>;
  /** Cases to run; defaults to the built-in suite. */
  cases?: readonly SubtaskEvalCase[];
  /** Turn cap for the parent step and each subtask. Defaults to 16. */
  maxIterations?: number;
  signal?: AbortSignal;
  /** Progress callback (one line per event, for CLI display). */
  onEvent?: (line: string) => void;
}

/**
 * `run_subtask` error codes that mean "no child ran" (a refusal / bad call),
 * as opposed to a subtask that ran and failed.
 */
const NON_SPAWN_ERROR_CODES = new Set([
  "missing_prompt",
  "max_recursion_depth_reached"
]);

/**
 * A `RunSubtaskTool` that records each spawn's outcome so the harness can score
 * subtask count and error propagation without parsing the transcript.
 */
class RecordingSubtaskTool extends RunSubtaskTool {
  readonly spawns: SubtaskSpawnRecord[] = [];

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const result = await super.process(context, params);
    const errorCode =
      result !== null &&
      typeof result === "object" &&
      "error" in (result as Record<string, unknown>)
        ? String((result as { error: unknown }).error)
        : null;
    // A depth refusal or missing-prompt bad-call never ran a child agent — do
    // not count it as a spawned subtask.
    if (errorCode && NON_SPAWN_ERROR_CODES.has(errorCode)) return result;
    const description =
      typeof params.description === "string" ? params.description : "";
    const resultText =
      typeof result === "string" ? result : JSON.stringify(result ?? "");
    this.spawns.push({
      description,
      failed: errorCode !== null,
      errorCode,
      resultText
    });
    return result;
  }
}

/**
 * Score a completed run against a case's structural expectations. Pure and
 * fully unit-testable: it takes a {@link SubtaskObservation} and never calls a
 * provider.
 */
export function checkSubtaskExpectations(
  obs: SubtaskObservation,
  expect: SubtaskEvalExpectations
): EvalCheck[] {
  const checks: EvalCheck[] = [];

  for (const name of expect.requiredParentTools ?? []) {
    const pass = obs.parentTools.has(name);
    checks.push({
      name: `parent:${name}`,
      pass,
      detail: pass ? undefined : `parent never called ${name}`
    });
  }

  for (const name of expect.requiredChildTools ?? []) {
    const pass = obs.childTools.has(name);
    checks.push({
      name: `child:${name}`,
      pass,
      detail: pass ? undefined : `no subtask called ${name}`
    });
  }

  for (const name of expect.forbiddenTools ?? []) {
    const hit = obs.allTools.has(name);
    checks.push({
      name: `not-tool:${name}`,
      pass: !hit,
      detail: hit ? `called forbidden tool ${name}` : undefined
    });
  }

  if (expect.minSubtasks !== undefined) {
    checks.push({
      name: `subtasks>=${expect.minSubtasks}`,
      pass: obs.spawns.length >= expect.minSubtasks,
      detail: `spawned ${obs.spawns.length}`
    });
  }
  if (expect.maxSubtasks !== undefined) {
    checks.push({
      name: `subtasks<=${expect.maxSubtasks}`,
      pass: obs.spawns.length <= expect.maxSubtasks,
      detail: `spawned ${obs.spawns.length}`
    });
  }

  if (expect.minDepth !== undefined) {
    checks.push({
      name: `depth>=${expect.minDepth}`,
      pass: obs.maxDepth >= expect.minDepth,
      detail: `reached depth ${obs.maxDepth}`
    });
  }

  if (expect.noSubtaskErrors) {
    const failed = obs.spawns.filter((s) => s.failed);
    checks.push({
      name: "no-subtask-errors",
      pass: failed.length === 0,
      detail:
        failed.length === 0
          ? undefined
          : `${failed.length} failed: ${failed
              .map((s) => s.errorCode ?? "?")
              .join(", ")}`
    });
  }

  for (const key of expect.requiredStoreKeys ?? []) {
    const pass = obs.storeKeys.has(key);
    checks.push({
      name: `store:${key}`,
      pass,
      detail: pass ? undefined : `store missing key ${key}`
    });
  }

  // Match against the parent's final answer OR any subtask's returned result:
  // "the delegated result flowed back" is proven the moment the subagent's
  // value reaches the parent, whether or not the parent re-echoes the digits.
  const corpus = [obs.answer, ...obs.subtaskResults].join("\n").toLowerCase();
  for (const needle of expect.answerContains ?? []) {
    const pass = corpus.includes(needle.toLowerCase());
    checks.push({
      name: `answer~${needle}`,
      pass,
      detail: pass ? undefined : `neither answer nor subtask results had "${needle}"`
    });
  }

  return checks;
}

/** Coerce a step result into the parent's final answer text. */
function answerText(result: unknown): string {
  if (typeof result === "string") return result;
  if (result === null || result === undefined) return "";
  return JSON.stringify(result);
}

async function runCase(
  evalCase: SubtaskEvalCase,
  opts: RunSubtaskEvalOptions
): Promise<SubtaskCaseResult> {
  const recorder: ToolRecorder = createToolRecorder();
  const instrumented: Tool[] = createInstrumentedTools(recorder);
  const maxIterations = opts.maxIterations ?? DEFAULT_MAX_ITERATIONS;

  // A broken forwarder must not kill a subtask; the harness reads results from
  // the recorder, so forwarding is a no-op here.
  const forwardMessage = (_msg: ProcessingMessage): void => {};

  // Mirror the runner wiring: `parentTools` snapshots the worker tools WITHOUT
  // run_subtask; the tool stitches itself into the child toolset so subtasks
  // can recurse.
  const subtaskTool = new RecordingSubtaskTool({
    provider: opts.provider,
    model: opts.model,
    parentTools: () => instrumented,
    forwardMessage,
    maxIterations
  });

  const context = new ProcessingContext({
    jobId: `subtask-eval-${randomUUID()}`,
    userId: "eval-user"
  });

  const step: Step = {
    id: randomUUID(),
    instructions: evalCase.objective,
    completed: false,
    dependsOn: [],
    logs: []
  };
  const task: Task = {
    id: randomUUID(),
    title: evalCase.description,
    steps: [step]
  };

  const executor = new StepExecutor({
    task,
    step,
    context,
    provider: opts.provider,
    model: opts.model,
    tools: [subtaskTool, ...instrumented],
    systemPrompt: evalCase.systemPrompt,
    maxIterations
  });

  const costBefore = opts.provider.getTotalCost();
  const startedAt = Date.now();
  let answer = "";
  let error: string | undefined;

  try {
    for await (const item of executor.execute()) {
      if (opts.signal?.aborted) break;
      if (item.type === "step_result") {
        const sr = item as StepResult;
        const nestedError =
          sr.result &&
          typeof sr.result === "object" &&
          !Array.isArray(sr.result) &&
          "error" in sr.result
            ? (sr.result as { error?: unknown }).error
            : undefined;
        if (sr.error) {
          error = sr.error;
        } else if (typeof nestedError === "string") {
          error = nestedError;
        } else {
          answer = answerText(sr.result);
        }
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const durationMs = Date.now() - startedAt;
  const costUsd = opts.provider.getTotalCost() - costBefore;
  const accepted = error === undefined;

  // Fold the recorder + spawn log into a scoring observation.
  const parentTools = new Set<string>();
  const childTools = new Set<string>();
  const allTools = new Set<string>();
  let maxDepth = 0;
  for (const inv of recorder.invocations) {
    allTools.add(inv.name);
    if (inv.depth >= 1) {
      childTools.add(inv.name);
      maxDepth = Math.max(maxDepth, inv.depth);
    } else {
      parentTools.add(inv.name);
    }
  }
  if (subtaskTool.spawns.length > 0) {
    parentTools.add("run_subtask");
    allTools.add("run_subtask");
    maxDepth = Math.max(maxDepth, 1);
  }

  const observation: SubtaskObservation = {
    parentTools,
    childTools,
    allTools,
    spawns: subtaskTool.spawns,
    maxDepth,
    storeKeys: new Set(recorder.store.keys()),
    answer,
    subtaskResults: subtaskTool.spawns.map((s) => s.resultText)
  };

  const checks: EvalCheck[] = [
    { name: "accepted", pass: accepted, detail: error }
  ];
  if (accepted) {
    checks.push(...checkSubtaskExpectations(observation, evalCase.expect));
  }
  const score = accepted
    ? checks.filter((c) => c.pass).length / checks.length
    : 0;

  return {
    caseId: evalCase.id,
    description: evalCase.description,
    skipped: false,
    accepted,
    score,
    checks,
    subtasks: subtaskTool.spawns.length,
    maxDepth,
    totalToolCalls: recorder.invocations.length + subtaskTool.spawns.length,
    durationMs,
    costUsd,
    error
  };
}

export async function runSubtaskEval(
  opts: RunSubtaskEvalOptions
): Promise<SubtaskEvalReport> {
  const cases = opts.cases ?? SUBTASK_EVAL_CASES;
  const hasModelProviders =
    !!opts.providers && Object.keys(opts.providers).length > 0;
  const results: SubtaskCaseResult[] = [];

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
        subtasks: 0,
        maxDepth: 0,
        totalToolCalls: 0,
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
        `subtasks=${result.subtasks} depth=${result.maxDepth} ` +
        `${Math.round(result.durationMs / 1000)}s` +
        (failed.length > 0
          ? ` | failed: ${failed.map((c) => c.name).join(", ")}`
          : "")
    );
    results.push(result);
  }

  const ran = results.filter((r) => !r.skipped);
  const acceptedResults = ran.filter((r) => r.accepted);
  const summary = {
    total: results.length,
    skipped: results.length - ran.length,
    accepted: acceptedResults.length,
    successRate: ran.length > 0 ? acceptedResults.length / ran.length : 0,
    meanScore:
      ran.length > 0 ? ran.reduce((a, r) => a + r.score, 0) / ran.length : 0,
    avgSubtasks:
      ran.length > 0
        ? ran.reduce((a, r) => a + r.subtasks, 0) / ran.length
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
export function formatSubtaskReport(report: SubtaskEvalReport): string {
  const lines: string[] = [];
  lines.push(
    `Sub-agent execution eval — provider=${report.provider} model=${report.model}`
  );
  lines.push("");
  const header = [
    "case".padEnd(22),
    "result".padEnd(7),
    "score".padEnd(6),
    "subs".padEnd(5),
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
        String(r.subtasks).padEnd(5),
        String(r.maxDepth).padEnd(6),
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
      `  avg subtasks ${s.avgSubtasks.toFixed(1)}` +
      (s.totalCostUsd > 0 ? `  cost $${s.totalCostUsd.toFixed(4)}` : "") +
      (s.skipped > 0 ? `  (${s.skipped} skipped)` : "")
  );
  return lines.join("\n");
}
