/**
 * The `app-build` eval suite: how often does `buildApp` turn a prompt into a
 * green mini app, and how much repair did it take?
 *
 * Every other suite here scores one stage — a graph, a plan, a tool loop. This
 * one scores the whole machine end to end, so its metrics are the ones the PRD
 * puts a number on (docs/mini-app-build-harness-prd.md §8):
 *
 * - **one-shot rate** — green with zero repair rounds, the north-star metric;
 * - **green-within-budget rate** — green at all inside the repair budget. This
 *   is the suite's `successRate`, so `--min-success` gates on it;
 * - repair rounds, cost, and wall clock per case.
 *
 * A case is green only when the build's own verdict is ok *and* the case's
 * target-shape checklist holds. The verdict answers "does this app work"; the
 * checklist answers "is it the app that was asked for, at the complexity bar
 * the PRD pins" — a build that quietly shipped one operation and three widgets
 * would otherwise score as a success.
 *
 * Two of the cases are deterministic (`app-build-cases.ts`): a pinned spec over
 * template graphs, authored by a scripted tool script instead of a model, judge
 * skipped, and exact expected widget values. They call no provider at all, so
 * they run in CI with no keys — and what they regress is the harness itself
 * (plan-binding, check, run, expectations), not the model.
 */

import type {
  BaseProvider,
  ProcessingContext,
  ProviderStreamItem,
  ProviderTool
} from "@nodetool-ai/runtime";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import {
  widgetSlots,
  type ApplicationDocument
} from "@nodetool-ai/app-runtime";
import type {
  AppServerRunInput,
  AppServerRunOutcome
} from "@nodetool-ai/execution/app-debug";
import {
  buildApp,
  type BuildAppOptions,
  type BuildJudgeOptions
} from "../app-build/build.js";
import type { BuildReport, BuildSpec } from "../app-build/types.js";
import {
  isNonEmptyString,
  isObjectLike,
  isString
} from "../utils/type-guards.js";

/**
 * The medium-complexity traits from the PRD (§4). A case declares the ones it
 * exercises; the suite as a whole must cover all of them, which
 * `app-build-cases.ts` asserts by construction and the harness test checks.
 */
export const APP_BUILD_TRAITS = [
  /** 2+ operations over 2+ workflows. */
  "multi-operation",
  /** 8–15 widgets, at least one of them nested in a layout container. */
  "container-depth",
  /** An app-scoped `persist: true` setting. */
  "persisted-setting",
  /** A streaming output folded into a display widget. */
  "streaming-output",
  /** A second operation reading a variable the first wrote. */
  "gated-flow",
  /** A `visibleWhen`/`disabledWhen` condition that actually gates. */
  "conditional"
] as const;

export type AppBuildTrait = (typeof APP_BUILD_TRAITS)[number];

/** A workflow graph, in the saved shape the simulator and validator read. */
export interface AppBuildGraph {
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
}

/** One `ui_app_*` call a deterministic case's author script makes. */
export interface ScriptedToolCall {
  name: string;
  args: Record<string, unknown>;
}

/**
 * A case that needs no model: the spec is pinned, the workflows are template
 * graphs resolved from memory, and the document is authored by replaying
 * `authorScript` through the real bridge.
 */
export interface DeterministicAppBuild {
  spec: BuildSpec;
  /** Workflow id (as the spec's operations bind it) → graph. */
  workflows: Record<string, AppBuildGraph>;
  /** The `ui_app_*` calls of one authoring round, ending in `ui_app_finish`. */
  authorScript: ScriptedToolCall[];
}

/** The target shape a built app must have, beyond the build's own verdict. */
export interface AppBuildExpectations {
  minOperations?: number;
  minWorkflows?: number;
  minWidgets?: number;
  maxWidgets?: number;
  /** At least one widget nested inside a layout container's slot. */
  requireContainer?: boolean;
  /** At least one declared variable with `persist: true`. */
  requirePersistedVariable?: boolean;
  /** At least one operation declared streaming, with a display widget bound to it. */
  requireStreamingOperation?: boolean;
  /** An operation input fed by a variable another operation's output writes. */
  requireGatedFlow?: boolean;
  /** A widget carrying a `visibleWhen`/`disabledWhen` condition. */
  requireConditional?: boolean;
  /** Exact final values, keyed by the spec's widget role (deterministic cases). */
  widgetValues?: ReadonlyArray<{ widget: string; equals: unknown }>;
}

export interface AppBuildEvalCase {
  id: string;
  description: string;
  /** Which medium-complexity traits this case exercises. */
  traits: readonly AppBuildTrait[];
  /** The request handed to the Spec stage. Absent on a deterministic case. */
  prompt?: string;
  /** Everything a no-provider run needs. Absent on a prompt case. */
  deterministic?: DeterministicAppBuild;
  expect: AppBuildExpectations;
  /** The planned workflows need real models, so the case needs `find_model`. */
  needsModelProviders?: boolean;
  /** Repair rounds this case allows. Defaults to the build's own default. */
  maxRepairs?: number;
}

/** One target-shape assertion and how it came out. */
export interface AppBuildCheck {
  name: string;
  pass: boolean;
  detail?: string;
}

export interface AppBuildCaseResult {
  caseId: string;
  description: string;
  traits: readonly AppBuildTrait[];
  deterministic: boolean;
  /** Verdict ok and every check passed. */
  green: boolean;
  /** Green with zero repair rounds. */
  oneShot: boolean;
  repairRounds: number;
  /** Fraction of checks that passed, 0..1. */
  score: number;
  checks: AppBuildCheck[];
  verdict: string;
  /** Stage executions, as `stage@round:status`. */
  stages: string[];
  costUsd: number;
  durationMs: number;
  /** Set when the build threw rather than resolving to a report. */
  error?: string;
  /** Set when the case was skipped (no configured model providers). */
  skipped?: string;
}

export interface AppBuildEvalSummary {
  total: number;
  /** Cases that actually ran (skipped ones are excluded from every rate). */
  ran: number;
  green: number;
  /** The `--min-success` gate: green inside the repair budget. */
  greenWithinBudgetRate: number;
  oneShot: number;
  oneShotRate: number;
  meanRepairRounds: number;
  medianRepairRounds: number;
  meanScore: number;
  totalCostUsd: number;
  meanDurationMs: number;
  /** Per trait: how many cases exercise it, and how many of those went green. */
  traitCoverage: Array<{ trait: AppBuildTrait; cases: number; green: number }>;
}

export interface AppBuildEvalReport {
  provider: string;
  model: string;
  generatedAt: string;
  cases: AppBuildCaseResult[];
  summary: AppBuildEvalSummary;
}

export interface RunAppBuildEvalOptions {
  provider: BaseProvider;
  model: string;
  registry: NodeRegistry;
  context: ProcessingContext;
  /** Configured providers, so the planner can pick real models. */
  providers?: Record<string, BaseProvider>;
  /** Execute one operation's workflow. The kernel runner, or a test double. */
  runOnServer: (input: AppServerRunInput) => Promise<AppServerRunOutcome>;
  cases: readonly AppBuildEvalCase[];
  /** How the Judge stage runs for prompt cases. Deterministic cases skip it. */
  judge?: BuildJudgeOptions;
  maxRepairs?: number;
  /** Wall clock per case. */
  timeoutMs?: number;
  costCapUsd?: number;
  onEvent?: (line: string) => void;
  signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// The scripted author, for deterministic cases
// ---------------------------------------------------------------------------

/**
 * A provider that replays one scripted list of tool calls through the tools'
 * own `execute` closures, the way `generateLoop` dispatches self-executing
 * tools. It never reaches the network, so a deterministic case runs with no
 * credentials — and the loop, the bridge, and every stage after it are the real
 * ones.
 *
 * A repair round would consume a script this provider does not have; the round
 * then makes no edit, the same complaint comes back, and the case fails as it
 * should. Deterministic cases are expected to be green on the first pass.
 */
function scriptedAuthorProvider(
  script: readonly ScriptedToolCall[]
): BaseProvider {
  const provider = {
    provider: "scripted",
    hasToolSupport: async () => true,
    // Nothing is spent: the script replaces the model, not the loop.
    getTotalCost: () => 0,
    async *generateLoop(args: {
      tools?: ProviderTool[];
      signal?: AbortSignal;
    }): AsyncGenerator<ProviderStreamItem> {
      const tools = new Map(
        (args.tools ?? []).map((tool) => [tool.name, tool])
      );
      let seq = 0;
      for (const call of script) {
        if (args.signal?.aborted) break;
        const id = `call_${++seq}`;
        yield { id, name: call.name, args: call.args } as ProviderStreamItem;
        await tools.get(call.name)?.execute?.(call.args, id);
      }
      yield { type: "chunk", content: "", done: true } as ProviderStreamItem;
    }
  };
  // SAFETY: the app-build loop calls only these three members. Standing the
  // double up on `BaseProvider.prototype` would give it base implementations
  // that read instance fields no constructor ever set.
  return provider as unknown as BaseProvider;
}

// ---------------------------------------------------------------------------
// The checklist
// ---------------------------------------------------------------------------

/**
 * One placed widget, read structurally. `ApplicationDocument.ui.content` is
 * `unknown[]` on purpose (the document package holds no Puck dependency), so
 * the shape is narrowed here rather than cast.
 */
interface DocWidget {
  type: string;
  props: Record<string, unknown>;
}

const asWidget = (value: unknown): DocWidget | null => {
  if (!isObjectLike(value)) return null;
  const { type, props } = value as { type?: unknown; props?: unknown };
  if (!isString(type)) return null;
  return {
    type,
    props:
      isObjectLike(props)
        ? (props as Record<string, unknown>)
        : {}
  };
};

const childrenOf = (node: DocWidget): DocWidget[] =>
  widgetSlots(node.type).flatMap((slot) => {
    const value = node.props[slot];
    return Array.isArray(value)
      ? value
          .map(asWidget)
          .filter((child): child is DocWidget => child !== null)
      : [];
  });

/** Every component in the document, flattened through layout slots. */
function flattenWidgets(content: readonly unknown[]): DocWidget[] {
  const out: DocWidget[] = [];
  for (const value of content) {
    const node = asWidget(value);
    if (!node) continue;
    out.push(node, ...flattenWidgets(childrenOf(node)));
  }
  return out;
}

/** True when some layout widget actually holds a child. */
const hasNesting = (content: readonly unknown[]): boolean =>
  flattenWidgets(content).some((node) => childrenOf(node).length > 0);

/** A widget prop that carries a condition (`{binding, op, value}`). */
function hasCondition(node: DocWidget): boolean {
  return (["visibleWhen", "disabledWhen"] as const).some((prop) => {
    const value = node.props[prop];
    if (!isObjectLike(value)) return false;
    const binding = (value as { binding?: unknown }).binding;
    return isNonEmptyString(binding);
  });
}

const check = (name: string, pass: boolean, detail?: string): AppBuildCheck => {
  const built: AppBuildCheck = { name, pass };
  if (detail !== undefined) built.detail = detail;
  return built;
};

/**
 * Score the built app against the case's target shape.
 *
 * Reads the delivered bundle wherever it can — that is the artifact a user
 * imports — and the spec only for what the document does not record (an
 * operation's `streaming` intent). A failed build has no bundle, so every
 * shape check fails with the verdict as the reason.
 */
export function checkAppBuild(
  evalCase: AppBuildEvalCase,
  report: BuildReport
): AppBuildCheck[] {
  const checks: AppBuildCheck[] = [
    check("verdict.ok", report.verdict.ok, report.verdict.reason)
  ];
  const expect = evalCase.expect;
  const bundle = report.bundle;
  if (!bundle) {
    const missing = `no bundle — ${report.verdict.reason}`;
    for (const name of expectedCheckNames(expect)) {
      checks.push(check(name, false, missing));
    }
    return checks;
  }

  const app: ApplicationDocument = bundle.app;
  const widgets = flattenWidgets(app.ui.content);

  if (expect.minOperations !== undefined) {
    checks.push(
      check(
        "operations",
        app.operations.length >= expect.minOperations,
        `${app.operations.length} operation(s), wanted ≥ ${expect.minOperations}`
      )
    );
  }
  if (expect.minWorkflows !== undefined) {
    checks.push(
      check(
        "workflows",
        bundle.workflows.length >= expect.minWorkflows,
        `${bundle.workflows.length} workflow(s), wanted ≥ ${expect.minWorkflows}`
      )
    );
  }
  if (expect.minWidgets !== undefined || expect.maxWidgets !== undefined) {
    const min = expect.minWidgets ?? 0;
    const max = expect.maxWidgets ?? Number.POSITIVE_INFINITY;
    checks.push(
      check(
        "widget count",
        widgets.length >= min && widgets.length <= max,
        `${widgets.length} widget(s), wanted ${min}..${expect.maxWidgets ?? "∞"}`
      )
    );
  }
  if (expect.requireContainer) {
    checks.push(
      check(
        "container depth",
        hasNesting(app.ui.content),
        "no widget is nested inside a layout container"
      )
    );
  }
  if (expect.requirePersistedVariable) {
    const persisted = app.variables.filter((variable) => variable.persist);
    checks.push(
      check(
        "persisted variable",
        persisted.length > 0,
        `${app.variables.length} variable(s), none with persist: true`
      )
    );
  }
  if (expect.requireStreamingOperation) {
    const streaming = report.spec.operations.filter((op) => op.streaming);
    const shown = streaming.some((op) =>
      report.spec.widgets.some((widget) =>
        widget.binding.startsWith(`op:${op.id}/out:`)
      )
    );
    checks.push(
      check(
        "streaming output",
        shown,
        streaming.length === 0
          ? "no operation is declared streaming"
          : "no display widget is bound to a streaming operation's output"
      )
    );
  }
  if (expect.requireGatedFlow) {
    checks.push(check("gated flow", ...gatedFlow(app)));
  }
  if (expect.requireConditional) {
    checks.push(
      check(
        "conditional",
        widgets.some(hasCondition),
        "no widget carries a visibleWhen/disabledWhen condition"
      )
    );
  }
  for (const expected of expect.widgetValues ?? []) {
    // The spec names widgets by role; the document names them by the id the
    // author generated. The label is the link — the same one the build's own
    // expectation checks resolve through.
    const declared = report.spec.widgets.find(
      (widget) => widget.role === expected.widget
    );
    const placed = report.appDebug?.spec?.widgets.find(
      (widget) =>
        widget.id === expected.widget ||
        (declared !== undefined && widget.label === declared.label)
    );
    const state = report.appDebug?.widgets.find(
      (widget) => widget.id === placed?.id
    );
    const shown = state?.display ?? state?.value;
    checks.push(
      check(
        `widget "${expected.widget}" value`,
        JSON.stringify(shown) === JSON.stringify(expected.equals),
        `shows ${JSON.stringify(shown)}, expected ${JSON.stringify(expected.equals)}`
      )
    );
  }
  return checks;
}

/** A variable one operation's output writes and another operation reads. */
function gatedFlow(app: ApplicationDocument): [boolean, string] {
  const written = new Map<string, string>();
  for (const operation of app.operations) {
    for (const mapping of Object.values(operation.outputs ?? {})) {
      if (mapping.to === "variable")
        written.set(mapping.variableId, operation.id);
    }
  }
  for (const operation of app.operations) {
    for (const mapping of Object.values(operation.inputs ?? {})) {
      if (mapping.from !== "variable") continue;
      const writer = written.get(mapping.variableId);
      if (writer !== undefined && writer !== operation.id) {
        return [
          true,
          `operation "${operation.id}" reads "${mapping.variableId}", written by "${writer}"`
        ];
      }
    }
  }
  return [
    false,
    written.size === 0
      ? "no operation output writes a variable"
      : "no operation reads a variable another operation wrote"
  ];
}

/** The names of the checks a failed build could not even attempt. */
function expectedCheckNames(expect: AppBuildExpectations): string[] {
  const names: string[] = [];
  if (expect.minOperations !== undefined) names.push("operations");
  if (expect.minWorkflows !== undefined) names.push("workflows");
  if (expect.minWidgets !== undefined || expect.maxWidgets !== undefined) {
    names.push("widget count");
  }
  if (expect.requireContainer) names.push("container depth");
  if (expect.requirePersistedVariable) names.push("persisted variable");
  if (expect.requireStreamingOperation) names.push("streaming output");
  if (expect.requireGatedFlow) names.push("gated flow");
  if (expect.requireConditional) names.push("conditional");
  for (const expected of expect.widgetValues ?? []) {
    names.push(`widget "${expected.widget}" value`);
  }
  return names;
}

// ---------------------------------------------------------------------------
// The runner
// ---------------------------------------------------------------------------

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] ?? 0)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
};

const mean = (values: number[]): number =>
  values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;

/** Run one case: build the app, then score it. */
async function runCase(
  evalCase: AppBuildEvalCase,
  opts: RunAppBuildEvalOptions
): Promise<AppBuildCaseResult> {
  const startedAt = Date.now();
  const base = {
    caseId: evalCase.id,
    description: evalCase.description,
    traits: evalCase.traits,
    deterministic: evalCase.deterministic !== undefined
  };

  const deterministic = evalCase.deterministic;
  const provider = deterministic
    ? scriptedAuthorProvider(deterministic.authorScript)
    : opts.provider;

  let report: BuildReport;
  try {
    const buildOptions: BuildAppOptions = {
      provider,
      model: deterministic ? "scripted" : opts.model,
      context: opts.context,
      registry: opts.registry,
      runOnServer: opts.runOnServer,
      buildId: `eval-${evalCase.id}-${Date.now()}`
    };
    if (deterministic) {
      buildOptions.spec = deterministic.spec;
      buildOptions.judge = { enabled: false };
      buildOptions.loadWorkflow = async (id: string) => {
        const graph = deterministic.workflows[id];
        return graph ? { graph, name: id } : null;
      };
    } else {
      buildOptions.prompt = evalCase.prompt ?? "";
      if (opts.judge) buildOptions.judge = opts.judge;
    }
    if (opts.providers) buildOptions.providers = opts.providers;
    if (evalCase.maxRepairs !== undefined) {
      buildOptions.maxRepairs = evalCase.maxRepairs;
    } else if (opts.maxRepairs !== undefined) {
      buildOptions.maxRepairs = opts.maxRepairs;
    }
    if (opts.timeoutMs !== undefined) buildOptions.timeoutMs = opts.timeoutMs;
    if (opts.costCapUsd !== undefined) {
      buildOptions.costCapUsd = opts.costCapUsd;
    }
    if (opts.signal) buildOptions.signal = opts.signal;
    report = await buildApp(buildOptions);
  } catch (e) {
    return {
      ...base,
      green: false,
      oneShot: false,
      repairRounds: 0,
      score: 0,
      checks: [],
      verdict: "the build threw",
      stages: [],
      costUsd: 0,
      durationMs: Date.now() - startedAt,
      error: e instanceof Error ? e.message : String(e)
    };
  }

  const checks = checkAppBuild(evalCase, report);
  const green = checks.every((c) => c.pass);
  return {
    ...base,
    green,
    oneShot: green && report.repairs.length === 0,
    repairRounds: report.repairs.length,
    score:
      checks.length === 0
        ? 0
        : checks.filter((c) => c.pass).length / checks.length,
    checks,
    verdict: report.verdict.reason,
    stages: report.stages.map((s) => `${s.stage}@${s.round}:${s.status}`),
    costUsd: report.cost.usd,
    durationMs: Date.now() - startedAt
  };
}

/**
 * Run the suite. Cases that need configured model providers are skipped when
 * none are available, exactly as the other suites skip them — the deterministic
 * cases then still run, which is what makes this suite usable in CI.
 */
export async function runAppBuildEval(
  opts: RunAppBuildEvalOptions
): Promise<AppBuildEvalReport> {
  const emit = opts.onEvent ?? (() => {});
  const results: AppBuildCaseResult[] = [];
  const haveProviders = Object.keys(opts.providers ?? {}).length > 0;

  for (const evalCase of opts.cases) {
    if (evalCase.needsModelProviders && !haveProviders) {
      emit(`- ${evalCase.id}: skipped (no configured model providers)`);
      results.push({
        caseId: evalCase.id,
        description: evalCase.description,
        traits: evalCase.traits,
        deterministic: false,
        green: false,
        oneShot: false,
        repairRounds: 0,
        score: 0,
        checks: [],
        verdict: "skipped",
        stages: [],
        costUsd: 0,
        durationMs: 0,
        skipped: "no configured model providers"
      });
      continue;
    }

    emit(`▶ ${evalCase.id}: ${evalCase.description}`);
    const result = await runCase(evalCase, opts);
    results.push(result);
    emit(
      `  ${result.green ? (result.oneShot ? "green (one-shot)" : `green after ${result.repairRounds} repair(s)`) : "FAIL"}` +
        ` — ${result.error ?? result.verdict}` +
        ` (${(result.durationMs / 1000).toFixed(1)}s${result.costUsd > 0 ? `, $${result.costUsd.toFixed(4)}` : ""})`
    );
    for (const failed of result.checks.filter((c) => !c.pass)) {
      emit(`  ✗ ${failed.name}${failed.detail ? ` — ${failed.detail}` : ""}`);
    }
  }

  const ran = results.filter((r) => r.skipped === undefined);
  const green = ran.filter((r) => r.green);
  const traitCoverage = APP_BUILD_TRAITS.map((trait) => ({
    trait,
    cases: opts.cases.filter((c) => c.traits.includes(trait)).length,
    green: green.filter((r) => r.traits.includes(trait)).length
  }));

  return {
    provider: opts.provider.provider,
    model: opts.model,
    generatedAt: new Date().toISOString(),
    cases: results,
    summary: {
      total: results.length,
      ran: ran.length,
      green: green.length,
      greenWithinBudgetRate: ran.length === 0 ? 0 : green.length / ran.length,
      oneShot: ran.filter((r) => r.oneShot).length,
      oneShotRate:
        ran.length === 0 ? 0 : ran.filter((r) => r.oneShot).length / ran.length,
      meanRepairRounds: mean(ran.map((r) => r.repairRounds)),
      medianRepairRounds: median(ran.map((r) => r.repairRounds)),
      meanScore: mean(ran.map((r) => r.score)),
      totalCostUsd: ran.reduce((sum, r) => sum + r.costUsd, 0),
      meanDurationMs: mean(ran.map((r) => r.durationMs)),
      traitCoverage
    }
  };
}

export function formatAppBuildReport(report: AppBuildEvalReport): string {
  const lines: string[] = [
    `App build eval — provider=${report.provider} model=${report.model}`,
    ""
  ];
  const header = [
    "case".padEnd(22),
    "result".padEnd(18),
    "score".padEnd(6),
    "repairs".padEnd(8),
    "time".padEnd(7),
    "cost"
  ].join("");
  lines.push(header, "-".repeat(header.length));

  for (const result of report.cases) {
    const outcome = result.skipped
      ? "skipped"
      : result.green
        ? result.oneShot
          ? "green (one-shot)"
          : "green (repaired)"
        : "FAIL";
    lines.push(
      [
        result.caseId.padEnd(22),
        outcome.padEnd(18),
        result.score.toFixed(2).padEnd(6),
        String(result.repairRounds).padEnd(8),
        `${(result.durationMs / 1000).toFixed(1)}s`.padEnd(7),
        result.costUsd > 0 ? `$${result.costUsd.toFixed(4)}` : "-"
      ].join("")
    );
    if (result.error) lines.push(`  ! ${result.error}`);
    for (const failed of result.checks.filter((c) => !c.pass)) {
      lines.push(
        `  ✗ ${failed.name}${failed.detail ? ` — ${failed.detail}` : ""}`
      );
    }
  }

  const s = report.summary;
  lines.push(
    "",
    `green-within-budget ${s.green}/${s.ran} (${(s.greenWithinBudgetRate * 100).toFixed(0)}%)` +
      `  one-shot ${s.oneShot}/${s.ran} (${(s.oneShotRate * 100).toFixed(0)}%)` +
      `  median repairs ${s.medianRepairRounds.toFixed(1)}` +
      `  mean score ${s.meanScore.toFixed(2)}` +
      `  mean time ${(s.meanDurationMs / 1000).toFixed(1)}s` +
      (s.totalCostUsd > 0 ? `  cost $${s.totalCostUsd.toFixed(4)}` : ""),
    "traits: " +
      s.traitCoverage.map((t) => `${t.trait} ${t.green}/${t.cases}`).join("  ")
  );
  return lines.join("\n");
}
