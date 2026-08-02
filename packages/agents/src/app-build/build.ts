/**
 * `buildApp` — the orchestrator behind `nodetool app build`.
 *
 * A plain loop, not an agent: spec → plan → author → check → run → judge, with
 * everything wrong at the end of a pass collected into one
 * {@link BuildComplaint} and handed back to the stage that can fix it. The
 * stages themselves are the existing machinery — `GraphPlanner` plans, the
 * `ui_app_*` bridge authors, the `@nodetool-ai/execution` simulator checks and
 * runs — so this module owns exactly three things: the order, the complaints,
 * and the bounds.
 *
 * Failure is closed, everywhere (docs/mini-app-build-harness-design.md §7).
 * A budget that runs out, an issue that comes back after being fixed, a
 * cancelled signal — each ends the build as `failed` with the reason named and
 * the best attempt's evidence attached. There is no partial success and no
 * bundle behind a failed verdict.
 *
 * Nothing here writes to a database: planned graphs live in the bundle, and the
 * simulator runs them from memory. That is what makes a build runnable in CI.
 */

import type {
  BaseProvider,
  ProcessingContext,
  TurnBudget
} from "@nodetool-ai/runtime";
import { CostCappedTurnBudget, withSpan } from "@nodetool-ai/runtime";
import { createLogger } from "@nodetool-ai/config";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import { validateGraph } from "@nodetool-ai/node-sdk";
import type { ProcessingMessage } from "@nodetool-ai/protocol";
import {
  APPLICATION_BUNDLE_SCHEMA_VERSION,
  APP_SCHEMA_VERSION,
  parseBinding,
  type ApplicationBundle,
  type ApplicationDocument
} from "@nodetool-ai/app-runtime";
import {
  bundleTarget,
  extractAppIO,
  simulateApp,
  type AppDebugReport,
  type AppIO,
  type AppServerRunInput,
  type AppServerRunOutcome,
  type AppSpec,
  type AppWidgetState,
  type InteractionStep
} from "@nodetool-ai/execution/app-debug";
import { GraphPlanner } from "../graph-planner.js";
import {
  runAuthorStage,
  DEFAULT_AUTHOR_TURNS,
  type AuthorWorkflow
} from "./author.js";
import type { AppBridgeDocument } from "./bridge.js";
import { completeInteractions } from "./interactions.js";
import { runSpecStage, specFromFile } from "./spec.js";
import {
  issueFingerprint,
  type BuildComplaint,
  type BuildExpectation,
  type BuildIssue,
  type BuildReport,
  type BuildSpec,
  type BuildSpecWidget,
  type CompletedInteraction,
  type JudgeRecord,
  type StageRecord
} from "./types.js";

const log = createLogger("nodetool.agents.app-build");

/** A workflow graph in the shape the simulator and the validator read. */
interface BuildGraph {
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
}

/** Repair rounds allowed after the first pass. */
export const DEFAULT_MAX_REPAIRS = 3;
/** Wall clock a build may take. */
export const DEFAULT_BUILD_TIMEOUT_MS = 10 * 60 * 1000;
/** Ceiling on what one build may spend, in USD. */
export const DEFAULT_BUILD_COST_CAP_USD = 2;
/** Output-token bound assumed per turn when reserving against the cap. */
const BUILD_MAX_OUTPUT_TOKENS = 4096;

/**
 * Complaint codes Plan owns: the app binds to a graph node the workflow does
 * not have, which authoring cannot fix by itself.
 */
const PLAN_ROUTED_CODES = new Set(["binding_node_missing"]);

/** One row of spend, as the prediction ledger takes it. */
export interface BuildLedgerAttribution {
  userId: string;
  /** The workflow column of the ledger. A build owns no workflow, so null. */
  workflowId?: string | null;
}

export interface BuildAppOptions {
  /** The request, when the spec is to be written by the model. */
  prompt?: string;
  /** A `spec.json` to load instead of prompting a model. */
  specPath?: string;
  /** An already-validated spec, e.g. from a deterministic eval case. */
  spec?: BuildSpec;

  provider: BaseProvider;
  model: string;
  context: ProcessingContext;
  registry: NodeRegistry;
  /** Configured providers, so the planner can pick real models. */
  providers?: Record<string, BaseProvider>;

  /** Execute one operation's workflow. The kernel runner, or a test double. */
  runOnServer: (input: AppServerRunInput) => Promise<AppServerRunOutcome>;
  /** Load a workflow an operation binds by id. Omitted ⇒ no id resolves. */
  loadWorkflow?: (
    id: string
  ) => Promise<{ graph: BuildGraph; name?: string } | null>;

  /** Workflow ids to pin, in operation declaration order. Plan binds them. */
  pinnedWorkflowIds?: string[];

  maxRepairs?: number;
  /** Wall clock for the whole build. */
  timeoutMs?: number;
  /** Per-run timeout handed to the simulator. */
  runTimeoutMs?: number;
  costCapUsd?: number;
  /** Turn cap per authoring round. */
  maxAuthorTurns?: number;
  /** Spend admission. Defaults to a cap-carrying budget over `costCapUsd`. */
  turnBudget?: TurnBudget;

  signal?: AbortSignal;
  onLog?: (line: string) => void;
  /** Persist one interaction run's message stream; returns the recorded path. */
  onRunMessages?: (
    interaction: string,
    runIndex: number,
    messages: ProcessingMessage[]
  ) => Promise<string | null>;
  /** Write stage spend to the prediction ledger. Omitted ⇒ nothing is written. */
  ledger?: BuildLedgerAttribution;
  /** Identity this build's spans and ledger rows carry. */
  buildId?: string;
}

const issue = (
  stage: BuildIssue["stage"],
  code: string,
  message: string,
  ref: { widget?: string; operation?: string } = {},
  severity: BuildIssue["severity"] = "error"
): BuildIssue => ({
  stage,
  code,
  severity,
  message,
  ...(ref.widget !== undefined ? { widget: ref.widget } : {}),
  ...(ref.operation !== undefined ? { operation: ref.operation } : {})
});

const errorsOf = (issues: readonly BuildIssue[]): BuildIssue[] =>
  issues.filter((i) => i.severity === "error");

/** What the build spent, in total and per stage. */
const costOf = (stages: readonly StageRecord[]): BuildReport["cost"] => {
  const byStage: Record<string, number> = {};
  let usd = 0;
  for (const stage of stages) {
    byStage[stage.stage] = (byStage[stage.stage] ?? 0) + stage.costUsd;
    usd += stage.costUsd;
  }
  return { usd, byStage };
};

/** The simulator's dependencies: the caller's runner and workflow loader. */
const simulationDeps = (opts: BuildAppOptions) => ({
  loadFromDb: async (id: string) => {
    const loaded = await opts.loadWorkflow?.(id);
    return loaded ? { graph: loaded.graph } : null;
  },
  runOnServer: opts.runOnServer
});

const record = (
  stage: BuildIssue["stage"],
  round: number,
  startedAt: number,
  issues: BuildIssue[],
  detail: string,
  costUsd = 0
): StageRecord => ({
  stage,
  round,
  status: errorsOf(issues).length > 0 ? "failed" : "ok",
  startedAt: new Date(startedAt).toISOString(),
  durationMs: Date.now() - startedAt,
  issues,
  costUsd,
  detail
});

// ---------------------------------------------------------------------------
// Bundle assembly
// ---------------------------------------------------------------------------

/** One operation's graph, held in memory as the bundle entry it will become. */
interface PlannedWorkflow {
  operationId: string;
  key: string;
  name: string;
  graph: BuildGraph;
  io: AppIO;
}

const documentOf = (
  spec: BuildSpec,
  doc: AppBridgeDocument
): ApplicationDocument => ({
  schemaVersion: APP_SCHEMA_VERSION,
  ui: {
    root: { props: { title: doc.title ?? spec.title } },
    content: doc.content,
    zones: {}
  },
  operations: doc.meta.operations,
  resources: doc.meta.resources,
  variables: doc.meta.variables
});

const assembleBundle = (
  spec: BuildSpec,
  doc: AppBridgeDocument,
  workflows: PlannedWorkflow[],
  description: string
): ApplicationBundle => ({
  schemaVersion: APPLICATION_BUNDLE_SCHEMA_VERSION,
  name: spec.title,
  description,
  app: documentOf(spec, doc),
  workflows: workflows.map((workflow) => ({
    key: workflow.key,
    name: workflow.name,
    graph: { nodes: workflow.graph.nodes, edges: workflow.graph.edges }
  }))
});

// ---------------------------------------------------------------------------
// Widget resolution
// ---------------------------------------------------------------------------

/**
 * The placed widget a spec role names. The author places widgets with
 * generated ids, so the link back to the spec is the label it was told to use
 * verbatim; the type is the last resort, and only when it is unambiguous.
 */
function placedWidget(
  appSpec: AppSpec | null,
  widget: BuildSpecWidget
): { id: string } | null {
  if (!appSpec) return null;
  const byId = appSpec.widgets.find((w) => w.id === widget.role);
  if (byId) return byId;
  const byLabel = appSpec.widgets.filter((w) => w.label === widget.label);
  if (byLabel.length === 1) return byLabel[0] ?? null;
  const byType = appSpec.widgets.filter((w) => w.type === widget.type);
  return byType.length === 1 ? (byType[0] ?? null) : null;
}

/** Rewrite a script's widget references from spec roles to placed ids. */
function bindSteps(
  steps: readonly InteractionStep[],
  spec: BuildSpec,
  appSpec: AppSpec | null
): { steps: InteractionStep[]; issues: BuildIssue[] } {
  const issues: BuildIssue[] = [];
  const resolve = (role: string): string => {
    const declared = spec.widgets.find((w) => w.role === role);
    const placed = declared ? placedWidget(appSpec, declared) : null;
    if (placed) return placed.id;
    issues.push(
      issue(
        "check",
        "widget_missing",
        `the script addresses widget "${role}", which is not in the app — place a ${declared?.type ?? "widget"} labelled "${declared?.label ?? role}"`,
        { widget: role }
      )
    );
    return role;
  };
  const bound = steps.map((step) => {
    if ("click" in step) return { click: resolve(step.click) };
    if ("change" in step) {
      return { change: resolve(step.change), value: step.value };
    }
    return step;
  });
  return { steps: bound, issues };
}

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------

/** Names the spec declared that the graph does not carry. */
function ioGap(
  spec: BuildSpec["operations"][number],
  io: AppIO
): { inputs: string[]; outputs: string[] } {
  const inputs = new Set(io.inputs.map((i) => i.name));
  const outputs = new Set(io.outputs.map((o) => o.name));
  return {
    inputs: spec.inputs.filter((i) => !inputs.has(i.name)).map((i) => i.name),
    outputs: spec.outputs.filter((o) => !outputs.has(o.name)).map((o) => o.name)
  };
}

const gapText = (gap: { inputs: string[]; outputs: string[] }): string =>
  [
    gap.inputs.length > 0
      ? `input node(s) named ${gap.inputs.map((n) => `"${n}"`).join(", ")}`
      : "",
    gap.outputs.length > 0
      ? `output node(s) named ${gap.outputs.map((n) => `"${n}"`).join(", ")}`
      : ""
  ]
    .filter(Boolean)
    .join(" and ");

/** `validateGraph` errors, as build issues. */
function graphIssues(
  graph: BuildGraph,
  registry: NodeRegistry,
  stage: BuildIssue["stage"],
  operationId: string
): BuildIssue[] {
  const report = validateGraph(graph, registry);
  return report.issues
    .filter((i) => i.severity === "error")
    .map((i) =>
      issue(
        stage,
        "invalid_graph",
        `operation "${operationId}": ${i.code} — ${i.message}`,
        { operation: operationId }
      )
    );
}

interface PlanStageOptions {
  spec: BuildSpec;
  round: number;
  /** Plan only these operations. Absent ⇒ all of them. */
  only?: ReadonlySet<string>;
  /** What a routed replan must fix, keyed by operation id. */
  deltas?: ReadonlyMap<string, string>;
}

/**
 * Plan (or bind) one workflow per operation.
 *
 * A `workflowId` binds: the graph is loaded and checked, and a declared surface
 * the workflow does not have is a *spec* complaint — the spec named a workflow
 * it does not fit, which no amount of planning fixes. Everything else goes to
 * `GraphPlanner`, whose graph must cover the declared surface; one replan names
 * the delta, and a second miss fails the build.
 */
async function runPlanStage(
  opts: BuildAppOptions,
  planOpts: PlanStageOptions
): Promise<{ workflows: PlannedWorkflow[]; record: StageRecord }> {
  const startedAt = Date.now();
  const costBefore = opts.provider.getTotalCost();
  const issues: BuildIssue[] = [];
  const workflows: PlannedWorkflow[] = [];
  const pinned = opts.pinnedWorkflowIds ?? [];

  for (const [index, operation] of planOpts.spec.operations.entries()) {
    if (planOpts.only && !planOpts.only.has(operation.id)) continue;
    const key = `wf-${operation.id}`;
    const workflowId = operation.workflowId ?? pinned[index];

    if (workflowId) {
      const loaded = await opts.loadWorkflow?.(workflowId);
      if (!loaded) {
        issues.push(
          issue(
            "plan",
            "workflow_not_found",
            `operation "${operation.id}" binds workflow "${workflowId}", which could not be loaded`,
            { operation: operation.id }
          )
        );
        continue;
      }
      issues.push(
        ...graphIssues(loaded.graph, opts.registry, "plan", operation.id)
      );
      const io = extractAppIO(loaded.graph);
      const gap = ioGap(operation, io);
      if (gap.inputs.length > 0 || gap.outputs.length > 0) {
        issues.push(
          issue(
            "spec",
            "declared_io_mismatch",
            `operation "${operation.id}" declares ${gapText(gap)}, which workflow "${workflowId}" does not have — the spec named a workflow it does not fit`,
            { operation: operation.id }
          )
        );
        continue;
      }
      workflows.push({
        operationId: operation.id,
        key,
        name: loaded.name ?? operation.id,
        graph: loaded.graph,
        io
      });
      continue;
    }

    const delta = planOpts.deltas?.get(operation.id);
    let objective = operation.objective;
    if (delta) objective = `${objective}\n\n${delta}`;
    let planned: BuildGraph | null = null;
    let gap = { inputs: [] as string[], outputs: [] as string[] };

    for (let attempt = 0; attempt < 2; attempt++) {
      if (opts.signal?.aborted) break;
      const graph = await planGraph(opts, operation, objective);
      if (!graph) break;
      planned = graph;
      gap = ioGap(operation, extractAppIO(graph));
      if (gap.inputs.length === 0 && gap.outputs.length === 0) break;
      // One replan, with the delta named in the objective: the app cannot bind
      // to an input the planner renamed.
      objective = `${operation.objective}\n\nThe previous graph was missing ${gapText(gap)}. Every declared input must be an Input node whose \`name\` property is exactly that name, and every declared output an Output node named exactly that.`;
      planned = null;
    }

    if (!planned) {
      issues.push(
        gap.inputs.length > 0 || gap.outputs.length > 0
          ? issue(
              "plan",
              "graph_io_missing",
              `the planned graph for operation "${operation.id}" is still missing ${gapText(gap)} after a replan`,
              { operation: operation.id }
            )
          : issue(
              "plan",
              "planner_failed",
              `no graph could be planned for operation "${operation.id}"`,
              { operation: operation.id }
            )
      );
      continue;
    }

    issues.push(...graphIssues(planned, opts.registry, "plan", operation.id));
    workflows.push({
      operationId: operation.id,
      key,
      name: operation.id,
      graph: planned,
      io: extractAppIO(planned)
    });
  }

  return {
    workflows,
    record: record(
      "plan",
      planOpts.round,
      startedAt,
      issues,
      `${workflows.length} workflow(s)`,
      opts.provider.getTotalCost() - costBefore
    )
  };
}

/** One `GraphPlanner` pass. Returns null when it produced no graph. */
async function planGraph(
  opts: BuildAppOptions,
  operation: BuildSpec["operations"][number],
  objective: string
): Promise<BuildGraph | null> {
  const planner = new GraphPlanner({
    provider: opts.provider,
    model: opts.model,
    registry: opts.registry,
    inputs: Object.fromEntries(
      operation.inputs.map((input) => [input.name, input.example])
    ),
    outputSchema: {
      type: "object",
      properties: Object.fromEntries(
        operation.outputs.map((output) => [output.name, { type: "string" }])
      )
    },
    ...(opts.providers ? { providers: opts.providers } : {}),
    ...(opts.turnBudget ? { turnBudget: opts.turnBudget } : {}),
    ...(opts.signal ? { signal: opts.signal } : {})
  });
  const generator = planner.plan(objective, opts.context);
  let next = await generator.next();
  while (!next.done) next = await generator.next();
  const graph = next.value;
  return graph
    ? {
        nodes: graph.nodes as unknown as Array<Record<string, unknown>>,
        edges: graph.edges as unknown as Array<Record<string, unknown>>
      }
    : null;
}

/** The widget id a validation message names, for a stable fingerprint. */
const widgetOf = (message: string): string | undefined =>
  /^[A-Za-z0-9_]+ "([^"]+)"/.exec(message)?.[1];

/**
 * Check: the static half of the oracle over the in-memory bundle, plus a
 * per-workflow graph check. No LLM ever judges a statically invalid app.
 */
async function runCheckStage(
  opts: BuildAppOptions,
  spec: BuildSpec,
  bundle: ApplicationBundle,
  workflows: PlannedWorkflow[],
  round: number
): Promise<{ report: AppDebugReport; issues: BuildIssue[]; record: StageRecord }> {
  const startedAt = Date.now();
  const report = await simulateApp(
    bundleTarget(bundle, opts.buildId ?? "app-build"),
    { run: false },
    simulationDeps(opts)
  );

  const issues: BuildIssue[] = [
    ...report.validation.errors.map((message) =>
      issue("check", "wiring_error", message, { widget: widgetOf(message) })
    ),
    ...report.validation.warnings.map((message) =>
      issue(
        "check",
        "wiring_warning",
        message,
        { widget: widgetOf(message) },
        "warning"
      )
    )
  ];

  for (const workflow of workflows) {
    issues.push(
      ...graphIssues(
        workflow.graph,
        opts.registry,
        "check",
        workflow.operationId
      )
    );
  }
  issues.push(...bindingIssues(report.spec, workflows));

  // Every role the interaction scripts and expectations address must exist.
  for (const widget of spec.widgets) {
    if (placedWidget(report.spec, widget)) continue;
    issues.push(
      issue(
        "check",
        "widget_missing",
        `the spec asks for widget "${widget.role}" (${widget.type}, label "${widget.label}"), which the app does not have`,
        { widget: widget.role }
      )
    );
  }

  return {
    report,
    issues,
    record: record(
      "check",
      round,
      startedAt,
      issues,
      `${report.spec?.widgets.length ?? 0} widget(s), ${errorsOf(issues).length} error(s)`
    )
  };
}

/**
 * Bindings that name a node the workflow does not have. `validateApp` accepts
 * an explicit `op:<id>/in:<nodeId>` token on its syntax alone, so a guessed
 * node id would otherwise reach Run as a widget that silently never fills.
 */
function bindingIssues(
  appSpec: AppSpec | null,
  workflows: PlannedWorkflow[]
): BuildIssue[] {
  if (!appSpec) return [];
  const ioByOperation = new Map(
    workflows.map((workflow) => [workflow.operationId, workflow.io])
  );
  const issues: BuildIssue[] = [];
  for (const widget of appSpec.widgets) {
    const ref = parseBinding(widget.binding);
    if (!ref || (ref.kind !== "input" && ref.kind !== "output")) continue;
    const io = ioByOperation.get(ref.operationId);
    if (!io) continue;
    const nodes = ref.kind === "input" ? io.inputs : io.outputs;
    if (nodes.some((node) => node.nodeId === ref.nodeId)) continue;
    issues.push(
      issue(
        "check",
        "binding_node_missing",
        `${widget.type} "${widget.id}" binds "${widget.binding}", but operation "${ref.operationId}" has no ${ref.kind} node "${ref.nodeId}" (it has: ${nodes.map((n) => `${n.nodeId} (${n.name})`).join(", ") || "none"})`,
        { widget: widget.id, operation: ref.operationId }
      )
    );
  }
  return issues;
}

/** What one expectation asserts, checked against what the widget ended up showing. */
function checkExpectation(
  expectation: BuildExpectation,
  state: AppWidgetState | undefined,
  interaction: string
): BuildIssue | null {
  if (!state) {
    return issue(
      "run",
      "expect_widget_missing",
      `interaction "${interaction}" expects widget "${expectation.widget}", which the app does not have`,
      { widget: expectation.widget }
    );
  }
  // The check sees what the user would see: the rendered `format` template
  // when the widget has one, else the bound value.
  const shown = state.display ?? state.value;
  const fail = (why: string): BuildIssue =>
    issue("run", "expect_failed", `interaction "${interaction}": ${why}`, {
      widget: expectation.widget
    });

  if (expectation.check === "nonEmpty") {
    return state.hasValue
      ? null
      : fail(`widget "${expectation.widget}" received no value`);
  }
  if (expectation.check === "equals") {
    return JSON.stringify(shown) === JSON.stringify(expectation.value)
      ? null
      : fail(
          `widget "${expectation.widget}" shows ${JSON.stringify(shown)}, expected ${JSON.stringify(expectation.value)}`
        );
  }
  const pattern = String(expectation.value ?? "");
  try {
    return new RegExp(pattern).test(String(shown ?? ""))
      ? null
      : fail(
          `widget "${expectation.widget}" shows ${JSON.stringify(shown)}, which does not match /${pattern}/`
        );
  } catch (error) {
    return fail(
      `expectation pattern /${pattern}/ is not a regular expression: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/** Run: one simulator pass per interaction, then that interaction's expectations. */
async function runRunStage(
  opts: BuildAppOptions,
  spec: BuildSpec,
  bundle: ApplicationBundle,
  interactions: CompletedInteraction[],
  appSpec: AppSpec | null,
  round: number
): Promise<{ report: AppDebugReport | null; issues: BuildIssue[]; record: StageRecord }> {
  const startedAt = Date.now();
  const issues: BuildIssue[] = [];
  let last: AppDebugReport | null = null;

  for (const interaction of interactions) {
    if (opts.signal?.aborted) break;
    const bound = bindSteps(interaction.steps, spec, appSpec);
    issues.push(...bound.issues);
    if (errorsOf(bound.issues).length > 0) continue;

    const report = await simulateApp(
      bundleTarget(bundle, opts.buildId ?? "app-build"),
      {
        interact: bound.steps,
        run: true,
        ...(opts.runTimeoutMs !== undefined
          ? { timeoutMs: opts.runTimeoutMs }
          : {})
      },
      {
        ...simulationDeps(opts),
        ...(opts.onLog ? { onLog: opts.onLog } : {}),
        ...(opts.onRunMessages
          ? {
              onRunMessages: (index: number, messages: ProcessingMessage[]) =>
                opts.onRunMessages!(interaction.name, index, messages)
            }
          : {})
      }
    );
    last = report;

    for (const step of report.interactions) {
      if (!step.error) continue;
      issues.push(
        issue(
          "run",
          "step_failed",
          `interaction "${interaction.name}" step ${step.step}: ${step.error}`
        )
      );
    }
    for (const problem of report.verdict.issues) {
      issues.push(
        issue("run", "run_issue", `interaction "${interaction.name}": ${problem}`, {
          widget: widgetOf(problem)
        })
      );
    }
    for (const expectation of interaction.expect) {
      const declared = spec.widgets.find((w) => w.role === expectation.widget);
      const placed = declared ? placedWidget(report.spec, declared) : null;
      const state = report.widgets.find((w) => w.id === placed?.id);
      const failure = checkExpectation(expectation, state, interaction.name);
      if (failure) issues.push(failure);
    }
  }

  return {
    report: last,
    issues,
    record: record(
      "run",
      round,
      startedAt,
      issues,
      `${interactions.length} interaction(s), ${errorsOf(issues).length} failure(s)`
    )
  };
}

/**
 * Judge: a stub until PR 7. It scores every interaction as achieved and the
 * verdict says so in `notSimulated`, so nobody reads a green build as
 * "an LLM confirmed this does what was asked".
 */
const JUDGE_STUB_NOTE =
  "Whether each interaction achieves the spec's intent — the judge stage is not implemented yet, so every interaction is recorded as achieved without being scored.";

function runJudgeStage(
  interactions: CompletedInteraction[],
  round: number
): { judge: JudgeRecord; record: StageRecord } {
  const startedAt = Date.now();
  return {
    judge: {
      model: "none",
      interactions: interactions.map((interaction) => ({
        interaction: interaction.name,
        achieved: true,
        confidence: 0,
        reasons: ["not judged — the judge stage lands in a later change"]
      }))
    },
    record: record("judge", round, startedAt, [], "skipped (not implemented)")
  };
}

// ---------------------------------------------------------------------------
// The orchestrator
// ---------------------------------------------------------------------------

/** A build that ended before it produced a bundle. */
function failedReport(
  target: BuildReport["target"],
  spec: BuildSpec | null,
  interactions: CompletedInteraction[],
  stages: StageRecord[],
  repairs: BuildComplaint[],
  appDebug: AppDebugReport | null,
  reason: string
): BuildReport {
  return {
    target,
    spec: spec ?? {
      title: "",
      operations: [],
      variables: [],
      widgets: [],
      interactions: []
    },
    interactions,
    stages,
    repairs,
    appDebug,
    judge: null,
    verdict: {
      ok: false,
      reason,
      notSimulated: [...(appDebug?.notSimulated ?? []), JUDGE_STUB_NOTE]
    },
    cost: costOf(stages),
    bundle: null
  };
}

/**
 * Build a mini app from a prompt or a spec file.
 *
 * Resolves to a {@link BuildReport} in every case — a build that fails says why
 * and carries its evidence; it never throws for a failure the report can
 * describe.
 */
export async function buildApp(opts: BuildAppOptions): Promise<BuildReport> {
  const buildId = opts.buildId ?? `app-build-${Date.now()}`;
  return withSpan(
    "app.build",
    {
      "app.build.id": buildId,
      "app.build.model": opts.model,
      "app.build.provider": opts.provider.provider
    },
    async () => {
      const report = await buildAppImpl({ ...opts, buildId });
      await recordBuildCost(report, opts, buildId);
      return report;
    }
  );
}

async function buildAppImpl(opts: BuildAppOptions): Promise<BuildReport> {
  const startedAt = Date.now();
  const log_ = opts.onLog ?? (() => {});
  const maxRepairs = opts.maxRepairs ?? DEFAULT_MAX_REPAIRS;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_BUILD_TIMEOUT_MS;
  const costCapUsd = opts.costCapUsd ?? DEFAULT_BUILD_COST_CAP_USD;
  const budget =
    opts.turnBudget ??
    new CostCappedTurnBudget({
      capUsd: costCapUsd,
      maxOutputTokens: BUILD_MAX_OUTPUT_TOKENS
    });
  const options: BuildAppOptions = { ...opts, turnBudget: budget };

  const costAtStart = opts.provider.getTotalCost();
  /**
   * What the build has spent. The budget's own number is authoritative where a
   * provider reserves against it; a provider that does not is still held to the
   * cap by its own running cost, so the ceiling never becomes advisory.
   */
  const spentUsd = (): number =>
    Math.max(budget.spentUsd, opts.provider.getTotalCost() - costAtStart);

  const target: BuildReport["target"] = {
    prompt: opts.prompt ?? "",
    ...(opts.specPath ? { specPath: opts.specPath } : {})
  };
  const stages: StageRecord[] = [];
  const repairs: BuildComplaint[] = [];

  /** Why the build must stop before the next stage, or null to continue. */
  const budgetStop = (): string | null => {
    if (opts.signal?.aborted) return "cancelled";
    if (Date.now() - startedAt > timeoutMs) {
      return `wall-clock budget exhausted (${timeoutMs}ms)`;
    }
    if (spentUsd() >= costCapUsd) {
      return `cost budget exhausted ($${costCapUsd.toFixed(2)})`;
    }
    return null;
  };

  // ---- Spec ---------------------------------------------------------------
  const specResult = await withSpan("app.build.spec", {}, async () => {
    if (opts.spec) {
      return {
        spec: opts.spec,
        record: record("spec", 0, Date.now(), [], "supplied by the caller")
      };
    }
    if (opts.specPath) return specFromFile(opts.specPath);
    if (!opts.prompt) {
      throw new Error("buildApp needs one of: prompt, specPath, spec");
    }
    return runSpecStage({
      prompt: opts.prompt,
      provider: options.provider,
      model: options.model,
      context: options.context,
      turnBudget: budget,
      ...(opts.signal ? { signal: opts.signal } : {})
    });
  });
  stages.push(specResult.record);
  const spec = specResult.spec;
  if (!spec) {
    return failedReport(
      target,
      null,
      [],
      stages,
      repairs,
      null,
      specResult.record.issues[0]?.message ?? "the prompt could not be specified"
    );
  }
  log_(`spec: ${spec.title} — ${spec.operations.length} operation(s)`);

  const interactions = completeInteractions(spec);

  // ---- Plan ---------------------------------------------------------------
  const stopAfterSpec = budgetStop();
  if (stopAfterSpec) {
    return failedReport(target, spec, interactions, stages, repairs, null, stopAfterSpec);
  }

  const planned = await withSpan("app.build.plan", {}, () =>
    runPlanStage(options, { spec, round: 0 })
  );
  stages.push(planned.record);
  if (errorsOf(planned.record.issues).length > 0) {
    return failedReport(
      target,
      spec,
      interactions,
      stages,
      repairs,
      null,
      `planning failed: ${errorsOf(planned.record.issues)[0]?.message ?? ""}`
    );
  }
  const workflows = planned.workflows;
  log_(`plan: ${workflows.length} workflow(s)`);

  // ---- Author → Check → Run → Judge, with repairs --------------------------
  let document: AppBridgeDocument | undefined;
  let complaint: BuildComplaint | undefined;
  let appDebug: AppDebugReport | null = null;
  let bundle: ApplicationBundle | null = null;
  let judge: JudgeRecord | null = null;
  /** Fingerprints per round, newest last — the oscillation guard's memory. */
  const seen: Array<Set<string>> = [];

  for (let round = 0; round <= maxRepairs; round++) {
    const stop = budgetStop();
    if (stop) {
      return failedReport(target, spec, interactions, stages, repairs, appDebug, stop);
    }

    const authorWorkflows: AuthorWorkflow[] = workflows.map((workflow) => ({
      operationId: workflow.operationId,
      key: workflow.key,
      io: workflow.io
    }));
    const authored = await withSpan("app.build.author", { "app.build.round": round }, () =>
      runAuthorStage({
        spec,
        workflows: authorWorkflows,
        provider: options.provider,
        model: options.model,
        round,
        maxTurns: opts.maxAuthorTurns ?? DEFAULT_AUTHOR_TURNS,
        turnBudget: budget,
        ...(document ? { resumeFrom: document } : {}),
        ...(complaint ? { complaint } : {}),
        ...(opts.signal ? { signal: opts.signal } : {}),
        ...(opts.onLog ? { onLog: opts.onLog } : {})
      })
    );
    stages.push(authored.record);
    document = authored.document;
    if (opts.signal?.aborted) {
      return failedReport(target, spec, interactions, stages, repairs, appDebug, "cancelled");
    }

    bundle = assembleBundle(
      spec,
      authored.document,
      workflows,
      opts.prompt ?? spec.title
    );

    const checked = await withSpan("app.build.check", { "app.build.round": round }, () =>
      runCheckStage(options, spec, bundle as ApplicationBundle, workflows, round)
    );
    stages.push(checked.record);
    appDebug = checked.report;

    const roundIssues: BuildIssue[] = [
      ...authored.record.issues,
      ...checked.issues
    ];

    if (errorsOf(checked.issues).length === 0) {
      const ran = await withSpan("app.build.run", { "app.build.round": round }, () =>
        runRunStage(
          options,
          spec,
          bundle as ApplicationBundle,
          interactions,
          checked.report.spec,
          round
        )
      );
      stages.push(ran.record);
      if (ran.report) appDebug = ran.report;
      roundIssues.push(...ran.issues);

      if (errorsOf(ran.issues).length === 0) {
        const judged = await withSpan("app.build.judge", {}, async () =>
          runJudgeStage(interactions, round)
        );
        stages.push(judged.record);
        judge = judged.judge;
        const failedInteractions = judged.judge.interactions.filter(
          (i) => !i.achieved
        );
        if (failedInteractions.length === 0) {
          // A build that overran its dollar cap is not a green build, however
          // good the app is: the money is spent, and the report says so
          // rather than handing back a bundle that cost more than allowed.
          if (spentUsd() >= costCapUsd) {
            return failedReport(
              target,
              spec,
              interactions,
              stages,
              repairs,
              appDebug,
              `cost budget exhausted ($${costCapUsd.toFixed(2)}) — the app was built but overran its cap`
            );
          }
          if (opts.signal?.aborted) {
            return failedReport(target, spec, interactions, stages, repairs, appDebug, "cancelled");
          }
          return okReport(
            target,
            spec,
            interactions,
            stages,
            repairs,
            appDebug,
            judged.judge,
            bundle,
            round
          );
        }
        roundIssues.push(
          ...failedInteractions.map((verdict) =>
            issue(
              "judge",
              "goal_not_achieved",
              `interaction "${verdict.interaction}": ${verdict.reasons.join("; ")}`
            )
          )
        );
      }
    }

    // ---- The round failed: complain, or stop ------------------------------
    const errors = errorsOf(roundIssues);
    const fingerprints = errors.map(issueFingerprint);
    const current = new Set(fingerprints);
    const previous = seen[seen.length - 1];
    const before = seen[seen.length - 2];
    if (previous && before) {
      const reappeared = [...current].filter(
        (fp) => !previous.has(fp) && before.has(fp)
      );
      if (reappeared.length > 0) {
        seen.push(current);
        repairs.push({ round, issues: errors, fingerprints });
        return failedReport(
          target,
          spec,
          interactions,
          stages,
          repairs,
          appDebug,
          `oscillating: ${reappeared.join(", ")} was fixed in round ${round - 1} and is back in round ${round}`
        );
      }
    }
    seen.push(current);

    if (round === maxRepairs) {
      repairs.push({ round, issues: errors, fingerprints });
      return failedReport(
        target,
        spec,
        interactions,
        stages,
        repairs,
        appDebug,
        `repair budget exhausted (${maxRepairs} repair round(s)); ${errors.length} issue(s) remain: ${errors[0]?.message ?? ""}`
      );
    }

    complaint = { round: round + 1, issues: errors, fingerprints };
    repairs.push(complaint);
    log_(`round ${round}: ${errors.length} issue(s) — repairing`);

    // A complaint that names a graph node the workflow lacks is Plan's, so that
    // one operation is replanned before Author sees the complaint again.
    const replan = new Set(
      errors
        .filter((i) => PLAN_ROUTED_CODES.has(i.code) && i.operation)
        .map((i) => i.operation as string)
    );
    if (replan.size > 0) {
      const deltas = new Map(
        [...replan].map((operationId) => [
          operationId,
          `The app needs these bindings to resolve: ${errors
            .filter((i) => i.operation === operationId)
            .map((i) => i.message)
            .join(" ")}`
        ])
      );
      const replanned = await withSpan("app.build.plan", { "app.build.round": round + 1 }, () =>
        runPlanStage(options, {
          spec,
          round: round + 1,
          only: replan,
          deltas
        })
      );
      stages.push(replanned.record);
      for (const workflow of replanned.workflows) {
        const index = workflows.findIndex(
          (w) => w.operationId === workflow.operationId
        );
        if (index >= 0) workflows[index] = workflow;
      }
    }
  }

  // Unreachable: the loop returns on its last round.
  return failedReport(
    target,
    spec,
    interactions,
    stages,
    repairs,
    appDebug,
    "the build loop ended without a verdict"
  );
}

function okReport(
  target: BuildReport["target"],
  spec: BuildSpec,
  interactions: CompletedInteraction[],
  stages: StageRecord[],
  repairs: BuildComplaint[],
  appDebug: AppDebugReport | null,
  judge: JudgeRecord,
  bundle: ApplicationBundle,
  round: number
): BuildReport {
  return {
    target,
    spec,
    interactions,
    stages,
    repairs,
    appDebug,
    judge,
    verdict: {
      ok: true,
      reason:
        round === 0
          ? "green on the first pass"
          : `green after ${round} repair round(s)`,
      notSimulated: [...(appDebug?.notSimulated ?? []), JUDGE_STUB_NOTE]
    },
    cost: costOf(stages),
    bundle
  };
}

/**
 * Write the build's provider spend to the prediction ledger `nodetool costs`
 * reads: one row per billable stage execution, attributed to the build id and
 * tagged `app-build` in `node_type`. Best-effort — a ledger failure never
 * changes a build's verdict.
 */
async function recordBuildCost(
  report: BuildReport,
  opts: BuildAppOptions,
  buildId: string
): Promise<number> {
  if (!opts.ledger) return 0;
  const billable = report.stages.filter((stage) => stage.costUsd > 0);
  if (billable.length === 0) return 0;

  const { Prediction } = await import("@nodetool-ai/models");
  let written = 0;
  for (const stage of billable) {
    try {
      await Prediction.create({
        user_id: opts.ledger.userId,
        provider: opts.provider.provider,
        model: opts.model,
        node_id: buildId,
        node_type: "app-build",
        workflow_id: opts.ledger.workflowId ?? null,
        cost: stage.costUsd,
        status: "completed",
        metadata: {
          kind: "app-build",
          build_id: buildId,
          stage: stage.stage,
          round: stage.round
        }
      });
      written += 1;
    } catch (error) {
      log.warn("Failed to record app-build cost", {
        buildId,
        stage: stage.stage,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return written;
}
