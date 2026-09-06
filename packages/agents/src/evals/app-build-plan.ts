/**
 * The plan-to-graph half of the `app-build` harness (PRD § 11.6, R6).
 *
 * The Workflow flow's build is not a mini app, but it is the same journey the
 * app-build harness already runs — a plan, a graph built from it, a static
 * check, a real run — so it grades here rather than in a harness of its own.
 *
 * What makes this case worth having is the last check. A plan whose steps name
 * node types that exist builds a graph that passes `validate_workflow` and can
 * still produce nothing: an output node fed by no step, a step wired to a
 * handle that never carries a value. Validation cannot see that. So a case is
 * green only when
 *
 *  1. `planToPlacement` reported no wiring it could not do,
 *  2. the graph passes the same static check `validate_workflow` runs, and
 *  3. **the run produced a value for every declared output**, matching what the
 *     case expects.
 *
 * Check 3 is the one that fails on a plan that validates and does nothing.
 * `packages/agents/tests/app-build-workflow-plan.test.ts` feeds exactly such a
 * plan and asserts checks 1 and 3 go red while 2 stays green.
 */

import { planNodeShape, planToPlacement } from "@nodetool-ai/protocol";
import type { PlanNodeShape } from "@nodetool-ai/protocol";
import type { WorkflowSetupPlan } from "@nodetool-ai/protocol/api-schemas/workflows.js";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import type {
  AppServerRunInput,
  AppServerRunOutcome
} from "@nodetool-ai/execution/app-debug";
import { isNonEmptyString, isString } from "../utils/type-guards.js";

/** One output the run has to produce for the case to be green. */
export interface PlanOutputExpectation {
  /** The plan output's name, which is also the output node's `name`. */
  name: string;
  /** Exact value. Omit to require only that something non-empty arrived. */
  equals?: unknown;
  /** Substring the produced value must contain. */
  contains?: string;
}

/** A deterministic plan-to-graph case: a pinned plan, no model, a real run. */
export interface PlanToGraphCase {
  /** The plan the planner would have written for the case's inspiration chip. */
  plan: WorkflowSetupPlan;
  /**
   * Node shapes for types the eval's registry cannot describe. The real
   * registry wins wherever it has metadata, so the CLI leg wires from the same
   * node definitions the run executes; this only stands in for a stub.
   */
  shapes?: Readonly<Record<string, PlanNodeShape>>;
  /** Run parameters. Defaults to the plan inputs' samples, keyed by name. */
  params?: Record<string, unknown>;
  /** What the run has to produce. */
  outputs: readonly PlanOutputExpectation[];
}

export interface PlanCheck {
  name: string;
  pass: boolean;
  detail?: string;
}

export interface PlanCaseResult {
  checks: PlanCheck[];
  /** Output name → the value the run produced, for the report. */
  produced: Record<string, unknown>;
  /** Wiring the builder could not do. Empty on a green case. */
  issues: string[];
  validationIssues: string[];
  error?: string;
}

const check = (name: string, pass: boolean, detail?: string): PlanCheck =>
  detail === undefined ? { name, pass } : { name, pass, detail };

/** A value that reached an output but carries nothing a user would call a result. */
const isEmptyResult = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  (isString(value) && value.trim().length === 0) ||
  (Array.isArray(value) && value.length === 0);

export interface RunPlanCaseOptions {
  registry: NodeRegistry;
  runOnServer: (input: AppServerRunInput) => Promise<AppServerRunOutcome>;
  timeoutMs?: number;
}

/**
 * Build the case's plan into a graph, check it, run it, and grade what came
 * out. Returns the three checks in the order they are earned, so a report reads
 * as the journey: wired → validated → produced.
 */
export async function runPlanToGraphCase(
  planCase: PlanToGraphCase,
  opts: RunPlanCaseOptions
): Promise<PlanCaseResult> {
  const { registry } = opts;
  const shapes = planCase.shapes ?? {};
  const placement = planToPlacement(planCase.plan, (nodeType) => {
    const meta = registry.getMetadata(nodeType);
    if (meta) return planNodeShape(meta);
    return shapes[nodeType] ?? null;
  });

  const checks: PlanCheck[] = [
    check(
      "plan wiring",
      placement.issues.length === 0,
      placement.issues.join(" ")
    )
  ];

  const graph = {
    nodes: placement.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      data: node.properties,
      ui_properties: {
        position: node.position,
        setup_step_id: node.setupStepId
      },
      dynamic_properties: node.dynamicProperties ?? {},
      dynamic_outputs: {}
    })),
    edges: placement.edges.map((edge, index) => ({
      id: `e${index + 1}`,
      source: edge.source,
      sourceHandle: edge.sourceHandle,
      target: edge.target,
      targetHandle: edge.targetHandle
    }))
  };

  const { validateGraph } = await import("@nodetool-ai/node-sdk");
  const report = validateGraph(graph, {
    has: (type: string) => registry.has(type),
    getMetadata: (type: string) => registry.getMetadata(type),
    validateNode: (
      descriptor: Parameters<typeof registry.validateNode>[0],
      connectedHandles: Parameters<typeof registry.validateNode>[1]
    ) => registry.validateNode(descriptor, connectedHandles)
  });
  const validationIssues = report.issues
    .filter((issue) => issue.severity === "error")
    .map((issue) => issue.message);
  checks.push(
    check("graph validates", report.ok, validationIssues.join(" "))
  );

  // Sample values live on the input nodes the builder placed, so a run needs no
  // params at all; a case may still override them.
  const params =
    planCase.params ??
    Object.fromEntries(
      planCase.plan.inputs
        .filter((input) => input.sample !== undefined)
        .map((input) => [input.name, input.sample])
    );

  let produced: Record<string, unknown> = {};
  let runError: string | undefined;
  try {
    const runInput: AppServerRunInput = {
      graph: graph as unknown as AppServerRunInput["graph"],
      workflowId: null,
      params
    };
    if (opts.timeoutMs !== undefined) runInput.timeoutMs = opts.timeoutMs;
    const outcome = await opts.runOnServer(runInput);
    // The output node's `name` property is what a user reads the result by, so
    // key the produced map by it rather than by the node id.
    const nameByNodeId = new Map(
      placement.nodes
        .filter((node) => isNonEmptyString(node.properties["name"]))
        .map((node) => [node.id, String(node.properties["name"])])
    );
    for (const output of outcome.report.summary.outputs) {
      const key = nameByNodeId.get(output.nodeId ?? "") ?? output.outputName;
      produced[key] = output.value;
    }
    if (!outcome.report.ok) {
      runError = outcome.report.error ?? outcome.report.status;
    }
  } catch (cause) {
    produced = {};
    runError = cause instanceof Error ? cause.message : String(cause);
  }

  for (const expected of planCase.outputs) {
    const value = produced[expected.name];
    const detail =
      runError !== undefined
        ? `run failed: ${runError}`
        : `produced ${JSON.stringify(value)}`;
    if (isEmptyResult(value)) {
      checks.push(
        check(
          `output "${expected.name}" produced`,
          false,
          runError !== undefined
            ? detail
            : `the graph validated but produced nothing for "${expected.name}"`
        )
      );
      continue;
    }
    const matches =
      expected.equals !== undefined
        ? JSON.stringify(value) === JSON.stringify(expected.equals)
        : expected.contains !== undefined
          ? String(value).includes(expected.contains)
          : true;
    checks.push(check(`output "${expected.name}" produced`, matches, detail));
  }

  const result: PlanCaseResult = {
    checks,
    produced,
    issues: placement.issues,
    validationIssues
  };
  if (runError !== undefined) result.error = runError;
  return result;
}
