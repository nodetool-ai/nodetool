/**
 * Graph authoring evaluation harness — provider-agnostic.
 *
 * Runs a set of {@link GraphPlannerEvalCase}s through {@link authorGraph} with
 * any `BaseProvider`, records efficiency metrics from the message stream (tool
 * calls, authoring rounds, duration, cost), and scores each authored graph
 * against the case's structural expectations. The result is a machine-readable
 * report plus a text summary, so different providers/models can be compared on
 * the same suite.
 *
 * It used to drive `GraphPlanner.plan()`, whose unit of work was a
 * `submit_graph` call carrying one untyped DSL program. `authorGraph` has no
 * such tool: the graph is built inside an `execute_code` action against the
 * typed DSL pack and handed back through `finish()`. Two metrics are mapped
 * across:
 *
 * - **authoring rounds** (was submit rounds) — `execute_code` actions the run
 *   spent. One action that ends in `finish(graph)` is the new one-shot, so
 *   `oneShotRate` still reads "delivered without a second attempt".
 * - **attempts** is gone. It counted `GraphPlanner`'s outer retry loop, which
 *   `authorGraph` does not have — a CodeAct child repairs inside its own loop,
 *   and that repair already shows up as another authoring round.
 */

import { randomUUID } from "node:crypto";
import type { BaseProvider } from "@nodetool-ai/runtime";
import { ProcessingContext } from "@nodetool-ai/runtime";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import { isJsCodeNodeType, PROVIDER_NAMESPACES } from "@nodetool-ai/node-sdk";
import type { GraphData, NodeDescriptor } from "@nodetool-ai/protocol";
import { authorGraph, type AuthorGraphOptions } from "../author-graph.js";
import { EXECUTE_CODE_TOOL_NAME } from "../codeact/codeact-executor.js";
import { AGENT_NODE_TYPE } from "../graph-builder.js";
import { GRAPH_PLANNER_EVAL_CASES } from "./graph-planner-cases.js";

export interface GraphPlannerEvalExpectations {
  /** Input-node `name` properties that must exist (one node per name). */
  requiredInputNames?: string[];
  /** Regex sources; each must match at least one node type in the graph. */
  requiredNodeTypePatterns?: string[];
  /** Regex sources; none may match any node type in the graph. */
  forbiddenNodeTypePatterns?: string[];
  /**
   * Regex sources; each must match the text of some node property. Catches an
   * instruction the objective asked for — "as bullet points" — that no node
   * type or edge can express.
   */
  requiredPropertyTextPatterns?: string[];
  /**
   * Regex pairs; for each, some node matching `from` must reach some node
   * matching `to` by following edges. Two node families both being present
   * says nothing about the data getting from one to the other.
   */
  requiredReachablePaths?: { from: string; to: string }[];
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
  /** Minimum number of `nodetool.code.Code` nodes. */
  minCodeNodes?: number;
  /**
   * Maximum number of `nodetool.code.Code` nodes. One Code node covers a whole
   * data-shaping step, so a low cap is what catches a chain of them.
   */
  maxCodeNodes?: number;
  /**
   * Output handle names the Code nodes must expose between them. A handle is
   * exposed when the node declares it in `dynamic_outputs` or an outgoing edge
   * reads it — a body returning a key nothing exposes leaves the node inert.
   */
  requiredCodeOutputHandles?: string[];
  /** Every Code node must expose at least one output handle. */
  requireCodeOutputs?: boolean;
  /** No Code node may declare a sandbox package in `packages`. */
  forbidCodePackages?: boolean;
  /**
   * Sandbox specifiers the Code nodes may declare. A specifier outside the
   * list fails the check — that is a pack the machine does not install.
   */
  allowedCodePackages?: string[];
  /**
   * Regex sources; each must match the type of a node fed by a Code node.
   * Pins the boundary between deterministic prep and the step it feeds.
   */
  codeFeedsNodeTypePatterns?: string[];
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
  /**
   * How much this check matters. `critical` = the behavior the case exists to
   * test, `standard` = correctness that isn't the objective, `advisory` =
   * efficiency and hygiene. Suites that don't set it score every check equally.
   */
  severity?: "critical" | "standard" | "advisory";
}

export interface GraphPlannerCaseResult {
  caseId: string;
  description: string;
  skipped: boolean;
  /** The run returned a graph. */
  accepted: boolean;
  /** Fraction of checks passed (0 when no graph was produced). */
  score: number;
  checks: EvalCheck[];
  /** Total tool calls the run made, by tool name (`execute_code` included). */
  toolCalls: Record<string, number>;
  /** `execute_code` actions — 1 means the model one-shotted the graph. */
  authoringRounds: number;
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
    /** Fraction of authored graphs delivered in exactly one code action. */
    oneShotRate: number;
    avgAuthoringRounds: number;
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
  /** Provider rounds one authoring run may spend; `authorGraph`'s default otherwise. */
  maxIterations?: number;
  signal?: AbortSignal;
  /** Progress callback (one line per event, for CLI display). */
  onEvent?: (line: string) => void;
}

function totalToolCalls(byName: Record<string, number>): number {
  return Object.values(byName).reduce((a, b) => a + b, 0);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * Output handles a Code node exposes: the ones it declares plus the ones an
 * outgoing edge reads. The DSL has no syntax for `dynamic_outputs`, so a
 * planner-written Code node exposes its handles through its edges.
 */
function codeOutputHandles(graph: GraphData, node: NodeDescriptor): string[] {
  const declared =
    asRecord(node.dynamic_outputs) ??
    asRecord(node.properties?.["dynamic_outputs"]) ??
    {};
  const handles = new Set(Object.keys(declared));
  for (const edge of graph.edges) {
    if (edge.source === node.id && edge.sourceHandle) {
      handles.add(edge.sourceHandle);
    }
  }
  return [...handles];
}

/** Sandbox specifiers a Code node declares in `packages`. */
function codePackageSpecifiers(node: NodeDescriptor): string[] {
  const declared = node.properties?.["packages"];
  if (!Array.isArray(declared)) return [];
  return declared.map((entry) => {
    if (typeof entry === "string") return entry;
    const specifier = asRecord(entry)?.["specifier"];
    return typeof specifier === "string" ? specifier : String(entry);
  });
}

/**
 * Whether any node matching `from` reaches one matching `to` over the edges.
 * A node matching `from` never counts as the destination, so a pattern pair
 * that overlaps cannot pass on the start node alone.
 */
function reaches(graph: GraphData, from: RegExp, to: RegExp): boolean {
  const typeById = new Map(graph.nodes.map((n) => [n.id, n.type]));
  const outgoing = new Map<string, string[]>();
  for (const edge of graph.edges) {
    outgoing.set(edge.source, [
      ...(outgoing.get(edge.source) ?? []),
      edge.target
    ]);
  }
  const queue = graph.nodes.filter((n) => from.test(n.type)).map((n) => n.id);
  const seen = new Set(queue);
  while (queue.length > 0) {
    const id = queue.shift() as string;
    if (to.test(typeById.get(id) ?? "") && !from.test(typeById.get(id) ?? "")) {
      return true;
    }
    for (const next of outgoing.get(id) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return false;
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

  for (const pattern of expect.requiredPropertyTextPatterns ?? []) {
    const re = new RegExp(pattern, "i");
    const found = graph.nodes.some((n) =>
      Object.values(n.properties ?? {}).some(
        (v) => typeof v === "string" && re.test(v)
      )
    );
    checks.push({
      name: `propText:${pattern}`,
      pass: found,
      detail: found ? undefined : `no node property matches /${pattern}/i`
    });
  }

  for (const { from, to } of expect.requiredReachablePaths ?? []) {
    const found = reaches(graph, new RegExp(from), new RegExp(to));
    checks.push({
      name: `reaches:${from}->${to}`,
      pass: found,
      detail: found ? undefined : `no path from /${from}/ to /${to}/`
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
        // Inputs and constants are sources: they are wired correctly with no
        // incoming edge, so requiring one flags a `nodetool.constant.String`
        // feeding a comparison as unwired when it is doing its job.
        const isSource =
          n.type.startsWith("nodetool.input.") ||
          n.type.startsWith("nodetool.constant.");
        const isOutput = n.type.startsWith("nodetool.output.");
        if (!isSource && !hasIn.has(n.id)) return true;
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

  const codeNodes = graph.nodes.filter((n) => isJsCodeNodeType(n.type));

  if (expect.minCodeNodes !== undefined) {
    checks.push({
      name: `codeNodes>=${expect.minCodeNodes}`,
      pass: codeNodes.length >= expect.minCodeNodes,
      detail: `found ${codeNodes.length}`
    });
  }
  if (expect.maxCodeNodes !== undefined) {
    checks.push({
      name: `codeNodes<=${expect.maxCodeNodes}`,
      pass: codeNodes.length <= expect.maxCodeNodes,
      detail: `found ${codeNodes.length}`
    });
  }

  if (expect.requiredCodeOutputHandles) {
    const exposed = new Set(
      codeNodes.flatMap((n) => codeOutputHandles(graph, n))
    );
    for (const handle of expect.requiredCodeOutputHandles) {
      const found = exposed.has(handle);
      checks.push({
        name: `codeOutput:${handle}`,
        pass: found,
        detail: found
          ? undefined
          : `no Code node exposes an output handle "${handle}"`
      });
    }
  }

  if (expect.requireCodeOutputs) {
    const inert = codeNodes
      .filter((n) => codeOutputHandles(graph, n).length === 0)
      .map((n) => n.id);
    checks.push({
      name: "codeOutputs",
      pass: inert.length === 0,
      detail:
        inert.length === 0
          ? undefined
          : `Code nodes with no output handle: ${inert.join(", ")}`
    });
  }

  if (expect.forbidCodePackages) {
    const offenders = codeNodes.flatMap((n) =>
      codePackageSpecifiers(n).map((s) => `${n.id}:${s}`)
    );
    checks.push({
      name: "codePackages:none",
      pass: offenders.length === 0,
      detail:
        offenders.length === 0
          ? undefined
          : `declared sandbox packages: ${offenders.join(", ")}`
    });
  }

  if (expect.allowedCodePackages) {
    const allowed = new Set(expect.allowedCodePackages);
    const offenders = codeNodes.flatMap((n) =>
      codePackageSpecifiers(n)
        .filter((s) => !allowed.has(s))
        .map((s) => `${n.id}:${s}`)
    );
    checks.push({
      name: "codePackages:allowed",
      pass: offenders.length === 0,
      detail:
        offenders.length === 0
          ? undefined
          : `sandbox packages outside the allowed list: ${offenders.join(", ")}`
    });
  }

  for (const pattern of expect.codeFeedsNodeTypePatterns ?? []) {
    const re = new RegExp(pattern);
    const codeIds = new Set(codeNodes.map((n) => n.id));
    const byId = new Map(graph.nodes.map((n) => [n.id, n.type]));
    const found = graph.edges.some(
      (e) => codeIds.has(e.source) && re.test(byId.get(e.target) ?? "")
    );
    checks.push({
      name: `codeFeeds:${pattern}`,
      pass: found,
      detail: found
        ? undefined
        : `no Code node feeds a node matching /${pattern}/`
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
  const costBefore = opts.provider.getTotalCost();
  const startedAt = Date.now();

  // A real context: the authoring sub-agent runs code in the sandbox, so it
  // needs the process's module catalog and a memory to settle through.
  const context = new ProcessingContext({
    jobId: `graph-eval-${randomUUID()}`,
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
    if (evalCase.outputSchema) {
      authorOptions.outputSchema = evalCase.outputSchema;
    }
    if (opts.maxIterations) authorOptions.maxIterations = opts.maxIterations;
    if (opts.signal) authorOptions.signal = opts.signal;
    const gen = authorGraph(evalCase.objective, authorOptions);
    let res = await gen.next();
    while (!res.done) {
      const m = res.value;
      if (m.type === "tool_call_update") {
        const name = String(m.name ?? "unknown");
        toolCalls[name] = (toolCalls[name] ?? 0) + 1;
        opts.onEvent?.(`    [tool] ${name}`);
      }
      res = await gen.next();
    }
    graph = res.value;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const durationMs = Date.now() - startedAt;
  const costUsd = opts.provider.getTotalCost() - costBefore;
  const authoringRounds = toolCalls[EXECUTE_CODE_TOOL_NAME] ?? 0;

  const checks: EvalCheck[] = [
    { name: "accepted", pass: graph !== null, detail: error }
  ];
  if (graph) {
    checks.push(...checkExpectations(graph, evalCase.expect));
  }
  const score = graph ? checks.filter((c) => c.pass).length / checks.length : 0;

  return {
    caseId: evalCase.id,
    description: evalCase.description,
    skipped: false,
    accepted: graph !== null,
    score,
    checks,
    toolCalls,
    authoringRounds,
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
        authoringRounds: 0,
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
        `actions=${result.authoringRounds} tools=${totalToolCalls(result.toolCalls)} ` +
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
      ran.length > 0 ? ran.reduce((a, r) => a + r.score, 0) / ran.length : 0,
    oneShotRate:
      acceptedResults.length > 0
        ? acceptedResults.filter((r) => r.authoringRounds === 1).length /
          acceptedResults.length
        : 0,
    avgAuthoringRounds:
      ran.length > 0
        ? ran.reduce((a, r) => a + r.authoringRounds, 0) / ran.length
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
    `Graph authoring eval — provider=${report.provider} model=${report.model}`
  );
  lines.push("");
  const header = [
    "case".padEnd(22),
    "result".padEnd(7),
    "score".padEnd(6),
    "actions".padEnd(8),
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
        String(r.authoringRounds).padEnd(8),
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
      `  avg actions ${s.avgAuthoringRounds.toFixed(1)}` +
      `  avg tools ${s.avgToolCalls.toFixed(1)}` +
      `  avg time ${(s.avgDurationMs / 1000).toFixed(1)}s` +
      (s.totalCostUsd > 0 ? `  cost $${s.totalCostUsd.toFixed(4)}` : "") +
      (s.skipped > 0 ? `  (${s.skipped} skipped)` : "")
  );
  return lines.join("\n");
}
