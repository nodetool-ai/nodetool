/**
 * CodeAct evaluation harness — provider-agnostic.
 *
 * Drives a real {@link CodeActExecutor} over the instrumented offline
 * toolbelt in `codeact-cases.ts` and scores each run structurally: required
 * tools invoked through the bridge, action-round and tool-call bounds, and a
 * predicate over the final result.
 */

import { randomUUID } from "node:crypto";
import type { BaseProvider } from "@nodetool-ai/runtime";
import { ProcessingContext } from "@nodetool-ai/runtime";
import type { StepResult, ToolCallUpdate } from "@nodetool-ai/protocol";
import type { EvalCheck } from "./graph-planner-eval.js";
import {
  CodeActExecutor,
  EXECUTE_CODE_TOOL_NAME
} from "../codeact/codeact-executor.js";
import type { Step, Task } from "../types.js";
import {
  CODEACT_EVAL_CASES,
  createCodeActRecorder,
  createCodeActTools,
  type CodeActEvalCase,
  type CodeActEvalExpectations
} from "./codeact-cases.js";
import { shippedPackCatalog } from "./codeact-sandbox-pack-cases.js";

const DEFAULT_MAX_ITERATIONS = 8;

/** Everything the pure checker needs — no provider, no I/O. */
export interface CodeActObservation {
  toolsInvoked: Set<string>;
  /**
   * Every tool name seen on the event stream, including the ones the executor
   * adds to the session — which the case's recorder never wraps and so cannot
   * see.
   */
  sessionToolsInvoked: Set<string>;
  /** Provider turns that carried a code action. */
  actions: number;
  /** Bridged tool invocations. */
  toolCalls: number;
  result: unknown;
}

export interface CodeActCaseResult {
  caseId: string;
  description: string;
  accepted: boolean;
  score: number;
  checks: EvalCheck[];
  actions: number;
  toolCalls: number;
  durationMs: number;
  costUsd: number;
  error?: string;
}

export interface CodeActEvalReport {
  provider: string;
  model: string;
  startedAt: string;
  cases: CodeActCaseResult[];
  summary: {
    total: number;
    accepted: number;
    successRate: number;
    meanScore: number;
    avgActions: number;
    avgToolCalls: number;
    totalCostUsd: number;
  };
}

export interface RunCodeActEvalOptions {
  provider: BaseProvider;
  model: string;
  cases?: readonly CodeActEvalCase[];
  maxIterations?: number;
  signal?: AbortSignal;
  onEvent?: (line: string) => void;
}

/** Pure scorer over one run's observation. */
export function checkCodeActExpectations(
  obs: CodeActObservation,
  expect: CodeActEvalExpectations
): EvalCheck[] {
  const checks: EvalCheck[] = [];
  for (const name of expect.requiredTools ?? []) {
    const pass = obs.toolsInvoked.has(name);
    checks.push({
      name: `tool:${name}`,
      pass,
      detail: pass ? undefined : `never invoked ${name}`
    });
  }
  for (const name of expect.forbiddenTools ?? []) {
    const hit = obs.toolsInvoked.has(name);
    checks.push({
      name: `not-tool:${name}`,
      pass: !hit,
      detail: hit ? `invoked forbidden tool ${name}` : undefined
    });
  }
  for (const name of expect.requiredSessionTools ?? []) {
    const pass = obs.sessionToolsInvoked.has(name);
    checks.push({
      name: `session-tool:${name}`,
      pass,
      detail: pass ? undefined : `never invoked ${name}`
    });
  }
  if (expect.maxActions !== undefined) {
    checks.push({
      name: `actions<=${expect.maxActions}`,
      pass: obs.actions <= expect.maxActions,
      detail: `took ${obs.actions}`
    });
  }
  if (expect.minToolCalls !== undefined) {
    checks.push({
      name: `toolCalls>=${expect.minToolCalls}`,
      pass: obs.toolCalls >= expect.minToolCalls,
      detail: `made ${obs.toolCalls}`
    });
  }
  if (expect.maxToolCalls !== undefined) {
    checks.push({
      name: `toolCalls<=${expect.maxToolCalls}`,
      pass: obs.toolCalls <= expect.maxToolCalls,
      detail: `made ${obs.toolCalls}`
    });
  }
  if (expect.resultCheck) {
    const pass = expect.resultCheck(obs.result);
    checks.push({
      name: `result:${expect.resultCheckLabel ?? "predicate"}`,
      pass,
      detail: pass
        ? undefined
        : `got ${JSON.stringify(obs.result)?.slice(0, 200)}`
    });
  }
  return checks;
}

async function runCase(
  evalCase: CodeActEvalCase,
  opts: RunCodeActEvalOptions
): Promise<CodeActCaseResult> {
  const recorder = createCodeActRecorder();
  const tools = (evalCase.createTools ?? createCodeActTools)(recorder);
  const maxIterations =
    evalCase.maxIterations ?? opts.maxIterations ?? DEFAULT_MAX_ITERATIONS;

  // A case that allows packages needs a catalog to resolve them; one that does
  // not stays on the process default, which is what every other case runs with.
  const sandboxPackages = evalCase.sandboxPackages ?? [];
  const contextInit: ConstructorParameters<typeof ProcessingContext>[0] = {
    jobId: `codeact-eval-${randomUUID()}`,
    userId: "eval-user"
  };
  if (sandboxPackages.length > 0) {
    contextInit.sandboxModuleCatalog = shippedPackCatalog();
  }
  const context = new ProcessingContext(contextInit);

  const step: Step = {
    id: randomUUID(),
    instructions: evalCase.objective,
    completed: false,
    dependsOn: [],
    logs: [],
    outputSchema: evalCase.outputSchema
      ? JSON.stringify(evalCase.outputSchema)
      : undefined
  };
  const task: Task = {
    id: randomUUID(),
    title: evalCase.description,
    steps: [step]
  };

  const executor = new CodeActExecutor({
    task,
    step,
    context,
    provider: opts.provider,
    model: opts.model,
    tools,
    maxIterations,
    signal: opts.signal,
    sandboxPackages
  });

  const costBefore = opts.provider.getTotalCost();
  const startedAt = Date.now();
  let result: unknown = null;
  let actions = 0;
  let error: string | undefined;
  const sessionToolsInvoked = new Set<string>();

  try {
    for await (const item of executor.execute()) {
      if (opts.signal?.aborted) break;
      if (item.type === "tool_call_update") {
        const tc = item as ToolCallUpdate;
        if (tc.name) sessionToolsInvoked.add(tc.name);
        // A "round" is one execute_code turn.
        if (tc.name === EXECUTE_CODE_TOOL_NAME) actions++;
      }
      if (item.type === "step_result") {
        const sr = item as StepResult;
        if (sr.error) error = sr.error;
        else result = sr.result;
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const durationMs = Date.now() - startedAt;
  const costUsd = opts.provider.getTotalCost() - costBefore;
  const accepted = error === undefined && step.completed === true;

  const observation: CodeActObservation = {
    toolsInvoked: new Set(recorder.invocations.map((i) => i.name)),
    sessionToolsInvoked,
    actions,
    toolCalls: recorder.invocations.length,
    result
  };

  const checks: EvalCheck[] = [
    { name: "accepted", pass: accepted, detail: error }
  ];
  if (accepted) {
    checks.push(...checkCodeActExpectations(observation, evalCase.expect));
  }
  const score = accepted
    ? checks.filter((c) => c.pass).length / checks.length
    : 0;

  return {
    caseId: evalCase.id,
    description: evalCase.description,
    accepted: accepted && checks.every((c) => c.pass),
    score,
    checks,
    actions,
    toolCalls: observation.toolCalls,
    durationMs,
    costUsd,
    error
  };
}

export async function runCodeActEval(
  opts: RunCodeActEvalOptions
): Promise<CodeActEvalReport> {
  const cases = opts.cases ?? CODEACT_EVAL_CASES;
  const results: CodeActCaseResult[] = [];

  for (const evalCase of cases) {
    if (opts.signal?.aborted) break;
    opts.onEvent?.(`▸ ${evalCase.id}`);
    const result = await runCase(evalCase, opts);
    results.push(result);
    opts.onEvent?.(
      `  ${result.accepted ? "pass" : "FAIL"} score=${result.score.toFixed(2)} ` +
        `actions=${result.actions} toolCalls=${result.toolCalls}`
    );
  }

  const accepted = results.filter((r) => r.accepted).length;
  const meanScore =
    results.length > 0
      ? results.reduce((sum, r) => sum + r.score, 0) / results.length
      : 0;

  return {
    provider: opts.provider.provider,
    model: opts.model,
    startedAt: new Date().toISOString(),
    cases: results,
    summary: {
      total: results.length,
      accepted,
      successRate: results.length > 0 ? accepted / results.length : 0,
      meanScore,
      avgActions:
        results.length > 0
          ? results.reduce((s, r) => s + r.actions, 0) / results.length
          : 0,
      avgToolCalls:
        results.length > 0
          ? results.reduce((s, r) => s + r.toolCalls, 0) / results.length
          : 0,
      totalCostUsd: results.reduce((s, r) => s + r.costUsd, 0)
    }
  };
}

export function formatCodeActReport(report: CodeActEvalReport): string {
  const lines: string[] = [];
  lines.push(
    `CodeAct eval — provider=${report.provider} model=${report.model}`
  );
  lines.push("");
  const header = [
    "case".padEnd(26),
    "result".padEnd(7),
    "score".padEnd(6),
    "acts".padEnd(5),
    "tools".padEnd(6),
    "time".padEnd(7),
    "cost"
  ].join("");
  lines.push(header);
  lines.push("-".repeat(header.length));
  for (const r of report.cases) {
    lines.push(
      [
        r.caseId.padEnd(26),
        (r.accepted ? "pass" : "FAIL").padEnd(7),
        r.score.toFixed(2).padEnd(6),
        String(r.actions).padEnd(5),
        String(r.toolCalls).padEnd(6),
        `${Math.round(r.durationMs / 1000)}s`.padEnd(7),
        r.costUsd > 0 ? `$${r.costUsd.toFixed(4)}` : "-"
      ].join("")
    );
    for (const c of r.checks.filter((c) => !c.pass)) {
      lines.push(`  ✗ ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
    }
  }
  lines.push("");
  const s = report.summary;
  lines.push(
    `success ${s.accepted}/${s.total} (${(s.successRate * 100).toFixed(0)}%)  ` +
      `meanScore ${s.meanScore.toFixed(2)}  avgActions ${s.avgActions.toFixed(1)}  ` +
      `avgToolCalls ${s.avgToolCalls.toFixed(1)}  cost $${s.totalCostUsd.toFixed(4)}`
  );
  return lines.join("\n");
}
