/**
 * GraphPlanner evaluation harness — provider-agnostic.
 *
 * Runs a set of {@link GraphPlannerEvalCase}s through `GraphPlanner.plan()`
 * with any `BaseProvider`, records efficiency metrics from the message stream
 * (tool calls, submit rounds, attempts, duration, cost), and scores each
 * accepted graph against the case's structural expectations. The result is a
 * machine-readable report plus a text summary, so different providers/models
 * can be compared on the same suite.
 */

import type { BaseProvider, ProcessingContext } from "@nodetool-ai/runtime";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import type { GraphData } from "@nodetool-ai/protocol";
import { GraphPlanner } from "../graph-planner.js";
import { AGENT_NODE_TYPE } from "../graph-builder.js";
import { PROVIDER_NAMESPACES } from "../prompts/graph-planner-prompt.js";
import { GRAPH_PLANNER_EVAL_CASES } from "./graph-planner-cases.js";

export interface GraphPlannerEvalExpectations {
  /** Input-node `name` properties that must exist (one node per name). */
  requiredInputNames?: string[];
  /** Regex sources; each must match at least one node type in the graph. */
  requiredNodeTypePatterns?: string[];
  /** Regex sources; none may match any node type in the graph. */
  forbiddenNodeTypePatterns?: string[];
  /** Edge sourceHandles that must each be used by at least one edge. */
  requiredSourceHandles?: string[];
  /** Minimum number of Agent (LLM step) nodes. */
  minAgentSteps?: number;
  /** Minimum number of edges. */
  minEdges?: number;
  /**
   * Every non-input node must have an incoming edge, and every non-output
   * node an outgoing one. Catches graphs whose nodes were created but never
   * wired — they run, validate clean, and do nothing.
   */
  requireConnected?: boolean;
  /** Minimum number of `nodetool.output.*` nodes. */
  minOutputNodes?: number;
  /** At least one `nodetool.output.*` node. */
  requireOutputNode?: boolean;
  minNodes?: number;
  maxNodes?: number;
}

export interface GraphPlannerEvalCase {
  id: string;
  description: string;
  objective: string;
  inputs?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  /**
   * Case needs configured model providers (`find_model`) to be solvable —
   * skipped when the harness runs without any.
   */
  needsModelProviders?: boolean;
  expect: GraphPlannerEvalExpectations;
}

export interface EvalCheck {
  name: string;
  pass: boolean;
  detail?: string;
}

export interface GraphPlannerCaseResult {
  caseId: string;
  description: string;
  skipped: boolean;
  /** Planner returned an accepted graph. */
  accepted: boolean;
  /** Fraction of checks passed (0 when no graph was produced). */
  score: number;
  checks: EvalCheck[];
  /** Total tool calls the planner made, by tool name. */
  toolCalls: Record<string, number>;
  /** submit_graph calls — 1 means the model one-shotted the graph. */
  submitRounds: number;
  /** Outer planning attempts consumed (1 = no retry). */
  attempts: number;
  durationMs: number;
  costUsd: number;
  nodes: number;
  edges: number;
  error?: string;
}

export interface GraphPlannerEvalReport {
  provider: string;
  model: string;
  startedAt: string;
  cases: GraphPlannerCaseResult[];
  summary: {
    total: number;
    skipped: number;
    accepted: number;
    /** accepted / (total - skipped) */
    successRate: number;
    /** Mean expectation score over non-skipped cases. */
    meanScore: number;
    /** Fraction of accepted graphs that needed exactly one submit_graph call. */
    oneShotRate: number;
    avgSubmitRounds: number;
    avgToolCalls: number;
    avgDurationMs: number;
    totalCostUsd: number;
  };
}

export interface RunGraphPlannerEvalOptions {
  provider: BaseProvider;
  model: string;
  registry: NodeRegistry;
  /** Configured providers for `find_model`; enables model-dependent cases. */
  providers?: Record<string, BaseProvider>;
  /** Cases to run; defaults to the built-in suite. */
  cases?: readonly GraphPlannerEvalCase[];
  maxRetries?: number;
  signal?: AbortSignal;
  /** Progress callback (one line per event, for CLI display). */
  onEvent?: (line: string) => void;
}

function totalToolCalls(byName: Record<string, number>): number {
  return Object.values(byName).reduce((a, b) => a + b, 0);
}

/** Score an accepted graph against the case expectations. */
export function checkExpectations(
  graph: GraphData,
  expect: GraphPlannerEvalExpectations
): EvalCheck[] {
  const checks: EvalCheck[] = [];
  const types = graph.nodes.map((n) => n.type);

  for (const name of expect.requiredInputNames ?? []) {
    const found = graph.nodes.some(
      (n) =>
        n.type.startsWith("nodetool.input.") && n.properties?.["name"] === name
    );
    checks.push({
      name: `input:${name}`,
      pass: found,
      detail: found ? undefined : `no nodetool.input.* node with name "${name}"`
    });
  }

  for (const pattern of expect.requiredNodeTypePatterns ?? []) {
    const re = new RegExp(pattern);
    const found = types.some((t) => re.test(t));
    checks.push({
      name: `has:${pattern}`,
      pass: found,
      detail: found ? undefined : `no node type matches /${pattern}/`
    });
  }

  for (const pattern of expect.forbiddenNodeTypePatterns ?? []) {
    const re = new RegExp(pattern);
    const offender = types.find((t) => re.test(t));
    checks.push({
      name: `not:${pattern}`,
      pass: !offender,
      detail: offender ? `forbidden node type ${offender}` : undefined
    });
  }

  for (const handle of expect.requiredSourceHandles ?? []) {
    const found = graph.edges.some((e) => e.sourceHandle === handle);
    checks.push({
      name: `handle:${handle}`,
      pass: found,
      detail: found ? undefined : `no edge uses sourceHandle "${handle}"`
    });
  }

  if (expect.minAgentSteps !== undefined) {
    const count = types.filter((t) => t === AGENT_NODE_TYPE).length;
    checks.push({
      name: `agentSteps>=${expect.minAgentSteps}`,
      pass: count >= expect.minAgentSteps,
      detail: `found ${count}`
    });
  }

  if (expect.minEdges !== undefined) {
    checks.push({
      name: `edges>=${expect.minEdges}`,
      pass: graph.edges.length >= expect.minEdges,
      detail: `found ${graph.edges.length}`
    });
  }

  if (expect.requireConnected) {
    const hasIn = new Set(graph.edges.map((e) => e.target));
    const hasOut = new Set(graph.edges.map((e) => e.source));
    const orphans = graph.nodes
      .filter((n) => {
        const isInput = n.type.startsWith("nodetool.input.");
        const isOutput = n.type.startsWith("nodetool.output.");
        if (!isInput && !hasIn.has(n.id)) return true;
        if (!isOutput && !hasOut.has(n.id)) return true;
        return false;
      })
      .map((n) => n.id);
    checks.push({
      name: "connected",
      pass: orphans.length === 0,
      detail:
        orphans.length === 0 ? undefined : `unwired: ${orphans.join(", ")}`
    });
  }

  const outputCount = types.filter((t) =>
    t.startsWith("nodetool.output.")
  ).length;
  if (expect.minOutputNodes !== undefined) {
    checks.push({
      name: `outputs>=${expect.minOutputNodes}`,
      pass: outputCount >= expect.minOutputNodes,
      detail: `found ${outputCount}`
    });
  }
  if (expect.requireOutputNode) {
    checks.push({
      name: "outputs>=1",
      pass: outputCount >= 1,
      detail: `found ${outputCount}`
    });
  }

  if (expect.minNodes !== undefined) {
    checks.push({
      name: `nodes>=${expect.minNodes}`,
      pass: graph.nodes.length >= expect.minNodes,
      detail: `found ${graph.nodes.length}`
    });
  }
  if (expect.maxNodes !== undefined) {
    checks.push({
      name: `nodes<=${expect.maxNodes}`,
      pass: graph.nodes.length <= expect.maxNodes,
      detail: `found ${graph.nodes.length}`
    });
  }

  // Universal check: provider-locked nodes are forbidden unless the case
  // explicitly requires one (none of the built-in cases do).
  const providerNode = types.find((t) =>
    PROVIDER_NAMESPACES.some((ns) => t.startsWith(`${ns}.`))
  );
  checks.push({
    name: "no-provider-nodes",
    pass: !providerNode,
    detail: providerNode ? `provider-locked node ${providerNode}` : undefined
  });

  return checks;
}

async function runCase(
  evalCase: GraphPlannerEvalCase,
  opts: RunGraphPlannerEvalOptions
): Promise<GraphPlannerCaseResult> {
  const toolCalls: Record<string, number> = {};
  let attempts = 0;
  const costBefore = opts.provider.getTotalCost();
  const startedAt = Date.now();

  const planner = new GraphPlanner({
    provider: opts.provider,
    model: opts.model,
    registry: opts.registry,
    providers: opts.providers,
    inputs: evalCase.inputs,
    outputSchema: evalCase.outputSchema,
    maxRetries: opts.maxRetries,
    signal: opts.signal
  });

  let graph: GraphData | null = null;
  let error: string | undefined;
  try {
    const gen = planner.plan(
      evalCase.objective,
      {} as ProcessingContext
    );
    let res = await gen.next();
    while (!res.done) {
      const m = res.value as { type?: string } & Record<string, unknown>;
      if (m.type === "tool_call_update") {
        const name = String(m.name ?? "unknown");
        toolCalls[name] = (toolCalls[name] ?? 0) + 1;
        opts.onEvent?.(`    [tool] ${name}`);
      } else if (
        m.type === "planning_update" &&
        m.phase === "generation" &&
        m.status === "running"
      ) {
        attempts++;
      }
      res = await gen.next();
    }
    graph = res.value;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const durationMs = Date.now() - startedAt;
  const costUsd = opts.provider.getTotalCost() - costBefore;
  const submitRounds = toolCalls["submit_graph"] ?? 0;

  const checks: EvalCheck[] = [
    { name: "accepted", pass: graph !== null, detail: error }
  ];
  if (graph) {
    checks.push(...checkExpectations(graph, evalCase.expect));
  }
  const score = graph
    ? checks.filter((c) => c.pass).length / checks.length
    : 0;

  return {
    caseId: evalCase.id,
    description: evalCase.description,
    skipped: false,
    accepted: graph !== null,
    score,
    checks,
    toolCalls,
    submitRounds,
    attempts: Math.max(attempts, 1),
    durationMs,
    costUsd,
    nodes: graph?.nodes.length ?? 0,
    edges: graph?.edges.length ?? 0,
    error
  };
}

export async function runGraphPlannerEval(
  opts: RunGraphPlannerEvalOptions
): Promise<GraphPlannerEvalReport> {
  const cases = opts.cases ?? GRAPH_PLANNER_EVAL_CASES;
  const hasModelProviders =
    !!opts.providers && Object.keys(opts.providers).length > 0;
  const results: GraphPlannerCaseResult[] = [];

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
        submitRounds: 0,
        attempts: 0,
        durationMs: 0,
        costUsd: 0,
        nodes: 0,
        edges: 0
      });
      continue;
    }

    opts.onEvent?.(`- ${evalCase.id}: ${evalCase.description}`);
    const result = await runCase(evalCase, opts);
    const failed = result.checks.filter((c) => !c.pass);
    opts.onEvent?.(
      `  ${result.accepted ? "PASS" : "FAIL"} score=${result.score.toFixed(2)} ` +
        `submits=${result.submitRounds} tools=${totalToolCalls(result.toolCalls)} ` +
        `nodes=${result.nodes} edges=${result.edges} ${Math.round(result.durationMs / 1000)}s` +
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
      ran.length > 0
        ? ran.reduce((a, r) => a + r.score, 0) / ran.length
        : 0,
    oneShotRate:
      acceptedResults.length > 0
        ? acceptedResults.filter((r) => r.submitRounds === 1).length /
          acceptedResults.length
        : 0,
    avgSubmitRounds:
      ran.length > 0
        ? ran.reduce((a, r) => a + r.submitRounds, 0) / ran.length
        : 0,
    avgToolCalls:
      ran.length > 0
        ? ran.reduce((a, r) => a + totalToolCalls(r.toolCalls), 0) / ran.length
        : 0,
    avgDurationMs:
      ran.length > 0
        ? ran.reduce((a, r) => a + r.durationMs, 0) / ran.length
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
export function formatEvalReport(report: GraphPlannerEvalReport): string {
  const lines: string[] = [];
  lines.push(
    `GraphPlanner eval — provider=${report.provider} model=${report.model}`
  );
  lines.push("");
  const header = [
    "case".padEnd(22),
    "result".padEnd(7),
    "score".padEnd(6),
    "submits".padEnd(8),
    "tools".padEnd(6),
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
        (r.skipped ? "skip" : r.accepted ? "pass" : "FAIL").padEnd(7),
        (r.skipped ? "-" : r.score.toFixed(2)).padEnd(6),
        String(r.submitRounds).padEnd(8),
        String(totalToolCalls(r.toolCalls)).padEnd(6),
        String(r.nodes).padEnd(6),
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
      `  avg submits ${s.avgSubmitRounds.toFixed(1)}` +
      `  avg tools ${s.avgToolCalls.toFixed(1)}` +
      `  avg time ${(s.avgDurationMs / 1000).toFixed(1)}s` +
      (s.totalCostUsd > 0 ? `  cost $${s.totalCostUsd.toFixed(4)}` : "") +
      (s.skipped > 0 ? `  (${s.skipped} skipped)` : "")
  );
  return lines.join("\n");
}
