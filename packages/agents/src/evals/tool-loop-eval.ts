/**
 * Tool-loop evaluation harness — provider-agnostic.
 *
 * Drives a multi-turn tool-calling loop over the *frontend* tool surface: the
 * model is handed the real `ui_*` tool contract (names/descriptions/Zod schemas
 * from `@nodetool-ai/protocol`) and an objective, each requested tool runs
 * against a {@link createToolLoopBridge headless bridge}, and the result is fed
 * back — repeating until the model stops calling tools or a turn cap is hit.
 *
 * Where {@link runGraphPlannerEval} evaluates one-shot DSL authoring, this
 * evaluates the incremental add-node/connect-node tool flow the browser UI and
 * the agent WebSocket bridge actually expose. It records the same efficiency
 * metrics and emits the same result/summary shapes so providers/models can be
 * compared on one report.
 *
 * Scoring is structural (see {@link checkToolLoopExpectations}): required /
 * forbidden tool names, ordering constraints, final-state predicates, tool-call
 * budgets, and a no-error-results check — never an exact transcript match, so
 * many valid tool orderings pass.
 */

import type { BaseProvider, Message } from "@nodetool-ai/runtime";
import { zodToJsonSchema } from "@nodetool-ai/runtime";
import type { EvalCheck } from "./graph-planner-eval.js";
import {
  createToolLoopBridge,
  type ToolLoopInitialState,
  type ToolLoopFinalState
} from "./tool-loop-bridge.js";
import { TOOL_LOOP_EVAL_CASES } from "./tool-loop-cases.js";

/** One tool call the model made, with its result and whether it errored. */
export interface ToolCallRecord {
  name: string;
  args: Record<string, unknown>;
  result: unknown;
  isError: boolean;
}

/** A named boolean assertion over the final graph state. */
export interface ToolLoopStatePredicate {
  name: string;
  test: (state: ToolLoopFinalState) => boolean;
  /** Optional detail shown when the predicate fails. */
  detail?: string;
}

export interface ToolLoopEvalExpectations {
  /** Tool names that must each be called at least once. */
  requiredTools?: string[];
  /** Tool names that must never be called. */
  forbiddenTools?: string[];
  /**
   * Ordering constraints `[a, b]`: the first call of `a` must precede the first
   * call of `b`. Both tools must be called for the check to pass.
   */
  ordering?: Array<[string, string]>;
  /** Predicates on the final graph state (all must hold). */
  finalState?: ToolLoopStatePredicate[];
  /** Minimum total tool calls across the run. */
  minToolCalls?: number;
  /** Maximum total tool calls across the run (efficiency ceiling). */
  maxToolCalls?: number;
  /** When true, no tool call may have returned an error result. */
  noErrorResults?: boolean;
}

export interface ToolLoopEvalCase {
  id: string;
  description: string;
  objective: string;
  /** Node catalog + starting graph the tools operate on. */
  initialState: ToolLoopInitialState;
  /**
   * Case needs configured model providers to be solvable — skipped when the
   * harness runs without any (mirrors the graph-planner suite).
   */
  needsModelProviders?: boolean;
  expect: ToolLoopEvalExpectations;
}

/** Everything the pure checker needs — no provider, no I/O. */
export interface ToolLoopObservation {
  toolCalls: ToolCallRecord[];
  finalState: ToolLoopFinalState;
}

export interface ToolLoopCaseResult {
  caseId: string;
  description: string;
  skipped: boolean;
  /** The loop ran to a natural stop / cap without a fatal provider error. */
  accepted: boolean;
  /** Fraction of checks passed (0 when the loop did not run). */
  score: number;
  checks: EvalCheck[];
  /** Tool calls made, by tool name. */
  toolCalls: Record<string, number>;
  /** Total tool calls across all names. */
  totalToolCalls: number;
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
    /** accepted / (total - skipped) */
    successRate: number;
    /** Mean expectation score over non-skipped cases. */
    meanScore: number;
    avgToolCalls: number;
    totalCostUsd: number;
  };
}

export interface RunToolLoopEvalOptions {
  provider: BaseProvider;
  model: string;
  /** Configured providers; enables model-dependent cases (else they skip). */
  providers?: Record<string, BaseProvider>;
  /** Cases to run; defaults to the built-in suite. */
  cases?: readonly ToolLoopEvalCase[];
  /** Turn cap — max tool-calling rounds before the loop stops. Defaults to 12. */
  maxIterations?: number;
  /** Override the system prompt handed to the model. */
  systemPrompt?: string;
  signal?: AbortSignal;
  /** Progress callback (one line per event, for CLI display). */
  onEvent?: (line: string) => void;
}

const DEFAULT_MAX_ITERATIONS = 12;

const DEFAULT_SYSTEM_PROMPT = `You are a workflow-graph building assistant operating a node-based editor through UI tools.

Build the workflow the user asks for by calling the ui_* tools:
- Discover node types with ui_search_nodes before adding them — never guess a type.
- Add nodes with ui_add_node (choose a stable, unique id per node and a {x, y} position).
- Wire nodes together with ui_connect_nodes using the exact output/input handle names from ui_search_nodes.
- Inspect your work with ui_get_graph when unsure.

Call one tool at a time and use the result before the next call. When the objective is fully satisfied, STOP calling tools and give a one-line summary.`;

function totalToolCalls(byName: Record<string, number>): number {
  return Object.values(byName).reduce((a, b) => a + b, 0);
}

function buildUserPrompt(evalCase: ToolLoopEvalCase): string {
  const existing =
    (evalCase.initialState.nodes?.length ?? 0) > 0
      ? `\n\nThe workflow already contains ${evalCase.initialState.nodes!.length} node(s); build on top of them.`
      : "";
  return `Objective: ${evalCase.objective}${existing}`;
}

/**
 * Score a completed run against a case's structural expectations. Pure and
 * fully unit-testable: it takes an {@link ToolLoopObservation} and never calls
 * a provider.
 */
export function checkToolLoopExpectations(
  observation: ToolLoopObservation,
  expect: ToolLoopEvalExpectations
): EvalCheck[] {
  const checks: EvalCheck[] = [];
  const sequence = observation.toolCalls.map((c) => c.name);
  const called = new Set(sequence);

  for (const name of expect.requiredTools ?? []) {
    const pass = called.has(name);
    checks.push({
      name: `tool:${name}`,
      pass,
      detail: pass ? undefined : `never called ${name}`
    });
  }

  for (const name of expect.forbiddenTools ?? []) {
    const hit = called.has(name);
    checks.push({
      name: `not-tool:${name}`,
      pass: !hit,
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
      detail: pass ? undefined : (detail ?? `predicate ${predicate.name} failed`)
    });
  }

  if (expect.minToolCalls !== undefined) {
    checks.push({
      name: `toolCalls>=${expect.minToolCalls}`,
      pass: sequence.length >= expect.minToolCalls,
      detail: `made ${sequence.length}`
    });
  }
  if (expect.maxToolCalls !== undefined) {
    checks.push({
      name: `toolCalls<=${expect.maxToolCalls}`,
      pass: sequence.length <= expect.maxToolCalls,
      detail: `made ${sequence.length}`
    });
  }

  if (expect.noErrorResults) {
    const errored = observation.toolCalls.filter((c) => c.isError);
    checks.push({
      name: "no-error-results",
      pass: errored.length === 0,
      detail:
        errored.length === 0
          ? undefined
          : `${errored.length} errored: ${errored.map((c) => c.name).join(", ")}`
    });
  }

  return checks;
}

async function runCase(
  evalCase: ToolLoopEvalCase,
  opts: RunToolLoopEvalOptions
): Promise<ToolLoopCaseResult> {
  const bridge = createToolLoopBridge(evalCase.initialState);
  const toolCalls: Record<string, number> = {};
  const records: ToolCallRecord[] = [];
  const costBefore = opts.provider.getTotalCost();
  const startedAt = Date.now();

  // Provider tools carry a self-contained `execute`, so `generateLoop`
  // dispatches directly to the bridge and feeds the stringified result back to
  // the model — exactly how the graph planner drives its tools.
  const providerTools = bridge.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: zodToJsonSchema(tool.parameters),
    execute: async (args: Record<string, unknown>): Promise<string> => {
      toolCalls[tool.name] = (toolCalls[tool.name] ?? 0) + 1;
      let result: unknown;
      let isError = false;
      try {
        result = await tool.execute(args ?? {});
      } catch (e) {
        isError = true;
        result = { error: e instanceof Error ? e.message : String(e) };
      }
      records.push({ name: tool.name, args: args ?? {}, result, isError });
      opts.onEvent?.(`    [tool] ${tool.name}${isError ? " (error)" : ""}`);
      return typeof result === "string" ? result : JSON.stringify(result);
    }
  }));

  const messages: Message[] = [
    { role: "system", content: opts.systemPrompt ?? DEFAULT_SYSTEM_PROMPT },
    { role: "user", content: buildUserPrompt(evalCase) }
  ];

  let error: string | undefined;
  try {
    const stream = opts.provider.generateLoop({
      messages,
      model: opts.model,
      tools: providerTools,
      // Tools mutate shared graph state and read it back, so calls must be
      // serialized.
      sequentialTools: true,
      maxIterations: opts.maxIterations ?? DEFAULT_MAX_ITERATIONS,
      signal: opts.signal
    });
    // Drain the stream; side effects (tool execution, result feedback) happen
    // inside `generateLoop`.
    for await (const _item of stream) {
      if (opts.signal?.aborted) break;
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const durationMs = Date.now() - startedAt;
  const costUsd = opts.provider.getTotalCost() - costBefore;
  const accepted = error === undefined;

  const observation: ToolLoopObservation = {
    toolCalls: records,
    finalState: bridge.finalState()
  };

  const checks: EvalCheck[] = [
    { name: "accepted", pass: accepted, detail: error }
  ];
  if (accepted) {
    checks.push(...checkToolLoopExpectations(observation, evalCase.expect));
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
    toolCalls,
    totalToolCalls: totalToolCalls(toolCalls),
    durationMs,
    costUsd,
    error
  };
}

export async function runToolLoopEval(
  opts: RunToolLoopEvalOptions
): Promise<ToolLoopEvalReport> {
  const cases = opts.cases ?? TOOL_LOOP_EVAL_CASES;
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
        score: 0,
        checks: [],
        toolCalls: {},
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
        `tools=${result.totalToolCalls} ${Math.round(result.durationMs / 1000)}s` +
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
        (r.skipped ? "skip" : r.accepted ? "pass" : "FAIL").padEnd(7),
        (r.skipped ? "-" : r.score.toFixed(2)).padEnd(6),
        String(r.totalToolCalls).padEnd(6),
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
      `  avg tools ${s.avgToolCalls.toFixed(1)}` +
      (s.totalCostUsd > 0 ? `  cost $${s.totalCostUsd.toFixed(4)}` : "") +
      (s.skipped > 0 ? `  (${s.skipped} skipped)` : "")
  );
  return lines.join("\n");
}
