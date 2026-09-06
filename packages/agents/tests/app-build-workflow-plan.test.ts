/**
 * The plan-to-graph case's grading (PRD § 11.6, R6).
 *
 * R6 is the risk that a plan naming node types that exist builds a graph that
 * passes `validate_workflow` and does nothing useful. The case therefore has
 * three checks, and this file proves the third one bites: the same graph, the
 * same clean validation, a run that returns nothing — and the case goes red.
 *
 * That is the inversion this phase owes: a check that has only ever been green
 * is indistinguishable from one that examines nothing.
 */

import { describe, expect, it } from "vitest";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import type {
  AppServerRunInput,
  AppServerRunOutcome
} from "@nodetool-ai/execution/app-debug";
import { collectExecutionSummary } from "@nodetool-ai/execution/debug";
import type { PlanNodeShape } from "@nodetool-ai/protocol";
import type { WorkflowSetupPlan } from "@nodetool-ai/protocol/api-schemas/workflows.js";
import { runPlanToGraphCase } from "../src/evals/app-build-plan.js";
import { APP_BUILD_EVAL_CASES } from "../src/evals/app-build-cases.js";

/**
 * A registry that knows nothing, so the case's own `shapes` are what the
 * builder wires from and `validateGraph` finds no fault with any node type.
 * The real registry is exercised by the CLI's chip suite and by the
 * `nodetool eval app-build` leg the harness gate runs.
 */
const registry = {
  has: () => true,
  getMetadata: () => undefined,
  validateNode: () => []
} as unknown as NodeRegistry;

const SHAPES: Record<string, PlanNodeShape> = {
  "nodetool.input.StringInput": {
    inputs: [{ name: "name", type: "str" }],
    outputs: [{ name: "output", type: "str" }]
  },
  "nodetool.text.Template": {
    inputs: [{ name: "string", type: "str" }],
    outputs: [{ name: "output", type: "str" }]
  },
  "nodetool.output.Output": {
    inputs: [{ name: "value", type: "any" }],
    outputs: []
  }
};

const PLAN: WorkflowSetupPlan = {
  inputs: [{ name: "text", type: "string", sample: "ship the plan first" }],
  steps: [
    {
      id: "compose",
      title: "Compose",
      summary: "lay the text into the template",
      node_type: "nodetool.text.Template"
    }
  ],
  outputs: [{ name: "post", type: "string" }]
};

/**
 * A kernel stand-in that reports `value` for every output node it is given.
 * Pass "" to model the run this whole phase is defending against: a graph that
 * ran to completion and produced nothing.
 */
const runnerProducing =
  (value: unknown) =>
  async (input: AppServerRunInput): Promise<AppServerRunOutcome> => {
    const outputs = input.graph.nodes.filter(
      (node) => String(node.type ?? "").includes(".output.")
    );
    const messages = outputs.map((node) => ({
      type: "output_update",
      node_id: String(node.id),
      output_name: "output",
      value
    }));
    const summary = collectExecutionSummary([
      ...messages,
      { type: "job_update", status: "completed" }
    ]);
    summary.status = "completed";
    return {
      report: {
        surface: "server",
        ok: true,
        status: "completed",
        error: null,
        durationMs: 1,
        summary,
        trace: null
      },
      rawMessages: messages as never[]
    };
  };

const named = (checks: { name: string; pass: boolean }[], name: string) => {
  const found = checks.find((check) => check.name === name);
  if (!found) throw new Error(`no check named "${name}": ${checks.map((c) => c.name).join(", ")}`);
  return found;
};

describe("plan-to-graph case", () => {
  it("is green when the plan wires, the graph validates, and the run produces the output", async () => {
    const result = await runPlanToGraphCase(
      { plan: PLAN, shapes: SHAPES, outputs: [{ name: "post", contains: "ship" }] },
      { registry, runOnServer: runnerProducing("ship the plan first") }
    );
    expect(result.checks.every((check) => check.pass)).toBe(true);
    expect(result.produced).toEqual({ post: "ship the plan first" });
  });

  // R6, inverted: the graph is identical and still validates. Only the run's
  // output changed, and that alone must take the case down.
  it("fails on a graph that validates and produces nothing", async () => {
    const result = await runPlanToGraphCase(
      { plan: PLAN, shapes: SHAPES, outputs: [{ name: "post", contains: "ship" }] },
      { registry, runOnServer: runnerProducing("") }
    );
    expect(named(result.checks, "plan wiring").pass).toBe(true);
    expect(named(result.checks, "graph validates").pass).toBe(true);
    const produced = named(result.checks, 'output "post" produced');
    expect(produced.pass).toBe(false);
    expect(produced.detail).toContain("validated but produced nothing");
    expect(result.checks.every((check) => check.pass)).toBe(false);
  });

  it("fails on a run that produced a value the case did not ask for", async () => {
    const result = await runPlanToGraphCase(
      { plan: PLAN, shapes: SHAPES, outputs: [{ name: "post", contains: "ship" }] },
      { registry, runOnServer: runnerProducing("something else entirely") }
    );
    expect(named(result.checks, "graph validates").pass).toBe(true);
    expect(named(result.checks, 'output "post" produced').pass).toBe(false);
  });

  it("fails on a plan whose output has no step upstream, before the run is graded", async () => {
    const result = await runPlanToGraphCase(
      {
        plan: { ...PLAN, steps: [] },
        shapes: SHAPES,
        outputs: [{ name: "post", contains: "ship" }]
      },
      { registry, runOnServer: runnerProducing("") }
    );
    expect(named(result.checks, "plan wiring").pass).toBe(false);
    expect(result.issues.join(" ")).toContain("produces nothing");
  });

  it("fails when the run itself failed, naming the reason", async () => {
    const result = await runPlanToGraphCase(
      { plan: PLAN, shapes: SHAPES, outputs: [{ name: "post", contains: "ship" }] },
      {
        registry,
        runOnServer: async () => {
          throw new Error("the kernel refused the graph");
        }
      }
    );
    expect(named(result.checks, 'output "post" produced').pass).toBe(false);
    expect(result.error).toBe("the kernel refused the graph");
  });

  it("ships the case in the suite, in the keyless set", () => {
    const shipped = APP_BUILD_EVAL_CASES.find(
      (evalCase) => evalCase.id === "workflow-plan-to-graph"
    );
    expect(shipped?.planToGraph?.outputs).toHaveLength(1);
    expect(shipped?.needsModelProviders).toBeUndefined();
  });
});
