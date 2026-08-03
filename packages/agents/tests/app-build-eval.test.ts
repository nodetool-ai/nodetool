/**
 * The `app-build` suite: its cases, its checklist, and one end-to-end pass.
 *
 * The deterministic cases are the point of this file. They run the real
 * orchestrator, the real bridge, and the real oracle with no provider and no
 * credentials — a stub kernel runner stands in for the workflow execution,
 * which the Quality Gate's `nodetool eval app-build` leg covers for real. What
 * is asserted here is that the suite scores what it claims to: a green build
 * whose target shape holds, a failing check that takes a case down with it, and
 * a case set that still covers every medium-complexity trait.
 */

import { describe, it, expect } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import type {
  AppServerRunInput,
  AppServerRunOutcome
} from "@nodetool-ai/execution/app-debug";
import { collectExecutionSummary } from "@nodetool-ai/execution/debug";
import {
  runAppBuildEval,
  checkAppBuild,
  formatAppBuildReport,
  APP_BUILD_TRAITS,
  type AppBuildEvalCase
} from "../src/evals/app-build-eval.js";
import {
  APP_BUILD_EVAL_CASES,
  APP_BUILD_DETERMINISTIC_CASE_IDS,
  uncoveredAppBuildTraits
} from "../src/evals/app-build-cases.js";
import { validateBuildSpec } from "../src/app-build/spec.js";
import type { BuildReport } from "../src/app-build/types.js";
import { createMockContext } from "./_helpers/mock-context.js";

const registry = {
  has: () => true,
  getMetadata: () => undefined,
  validateNode: () => []
} as unknown as NodeRegistry;

/**
 * A kernel stand-in: every run reports one completed output per output node,
 * with the value the template graph would have produced.
 */
const stubRunner =
  (outputs: Record<string, string>) =>
  async (input: AppServerRunInput): Promise<AppServerRunOutcome> => {
    const outputNodes = input.graph.nodes.filter(
      (node) => typeof node.type === "string" && node.type.includes(".output.")
    );
    const messages = [
      ...outputNodes.map((node) => ({
        type: "output_update",
        node_id: String(node.id),
        output_name: "output",
        value: outputs[String(node.id)] ?? ""
      })),
      { type: "job_update", status: "completed" }
    ];
    const summary = collectExecutionSummary(messages);
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

const caseById = (id: string): AppBuildEvalCase => {
  const found = APP_BUILD_EVAL_CASES.find((c) => c.id === id);
  if (!found) throw new Error(`no such case: ${id}`);
  return found;
};

const evalOptions = (
  cases: readonly AppBuildEvalCase[],
  outputs: Record<string, string>
) => ({
  // The deterministic cases author from a script, so the provider is never
  // called; it only supplies the report's header.
  provider: {
    provider: "none",
    getTotalCost: () => 0
  } as unknown as Parameters<typeof runAppBuildEval>[0]["provider"],
  model: "none",
  registry,
  context: createMockContext() as unknown as ProcessingContext,
  runOnServer: stubRunner(outputs),
  cases
});

describe("app-build eval cases", () => {
  it("ships two deterministic cases and eight prompt cases", () => {
    expect(APP_BUILD_DETERMINISTIC_CASE_IDS).toEqual([
      "greeting-card",
      "draft-then-publish"
    ]);
    const prompts = APP_BUILD_EVAL_CASES.filter((c) => c.prompt !== undefined);
    expect(prompts.length).toBeGreaterThanOrEqual(8);
  });

  it("covers every medium-complexity trait", () => {
    expect(uncoveredAppBuildTraits()).toEqual([]);
    for (const evalCase of APP_BUILD_EVAL_CASES) {
      expect(evalCase.traits.length).toBeGreaterThan(0);
      for (const trait of evalCase.traits) {
        expect(APP_BUILD_TRAITS).toContain(trait);
      }
    }
  });

  it("declares a prompt or a deterministic build, never both", () => {
    for (const evalCase of APP_BUILD_EVAL_CASES) {
      expect(
        (evalCase.prompt !== undefined) !==
          (evalCase.deterministic !== undefined)
      ).toBe(true);
    }
  });

  it("holds specs the Spec stage's own validator accepts", () => {
    for (const evalCase of APP_BUILD_EVAL_CASES) {
      if (!evalCase.deterministic) continue;
      expect(validateBuildSpec(evalCase.deterministic.spec)).toEqual([]);
    }
  });

  it("labels every authored widget the way its spec role does", () => {
    for (const evalCase of APP_BUILD_EVAL_CASES) {
      const deterministic = evalCase.deterministic;
      if (!deterministic) continue;
      const authored = deterministic.authorScript
        .filter((call) => call.name === "ui_app_add_component")
        .map((call) => (call.args.props as { label?: string })?.label);
      for (const widget of deterministic.spec.widgets) {
        // Containers are placed by title, not label; every other role must be
        // findable by the label Check resolves it through.
        if (widget.type === "Container") continue;
        expect(authored).toContain(widget.label);
      }
    }
  });
});

describe("runAppBuildEval", () => {
  it("runs a deterministic case end to end and scores it green", async () => {
    const report = await runAppBuildEval(
      evalOptions([caseById("greeting-card")], {
        greeting_out: "Hello, Ada!"
      })
    );

    const result = report.cases[0];
    expect(result?.green).toBe(true);
    expect(result?.oneShot).toBe(true);
    expect(result?.repairRounds).toBe(0);
    expect(result?.score).toBe(1);
    expect(result?.checks.some((c) => c.name.includes("greeting-output"))).toBe(
      true
    );
    expect(report.summary.greenWithinBudgetRate).toBe(1);
    expect(report.summary.oneShotRate).toBe(1);
    expect(formatAppBuildReport(report)).toContain("green-within-budget 1/1");
  });

  it("runs the gated two-operation case, condition and variable included", async () => {
    const report = await runAppBuildEval(
      evalOptions([caseById("draft-then-publish")], {
        draft_out: "SHIP IT",
        published_out: "PUBLISHED: SHIP IT"
      })
    );

    const result = report.cases[0];
    expect(result?.checks.filter((c) => !c.pass)).toEqual([]);
    expect(result?.green).toBe(true);
    expect(result?.checks.find((c) => c.name === "gated flow")?.pass).toBe(
      true
    );
    expect(result?.checks.find((c) => c.name === "conditional")?.pass).toBe(
      true
    );
  });

  it("fails a case whose app works but is not what was asked for", async () => {
    const target = caseById("greeting-card");
    const overreaching: AppBuildEvalCase = {
      ...target,
      id: "greeting-card-overreaching",
      expect: { ...target.expect, minOperations: 3 }
    };
    const report = await runAppBuildEval(
      evalOptions([overreaching], { greeting_out: "Hello, Ada!" })
    );

    const result = report.cases[0];
    expect(result?.green).toBe(false);
    expect(result?.verdict).toBe("green on the first pass");
    expect(result?.checks.find((c) => c.name === "operations")?.pass).toBe(
      false
    );
    // The build itself was fine, so most checks still pass — the score says so.
    expect(result?.score).toBeGreaterThan(0.5);
  });

  it("skips prompt cases when no model providers are configured", async () => {
    const report = await runAppBuildEval(
      evalOptions([caseById("caption-review")], {})
    );

    expect(report.cases[0]?.skipped).toBe("no configured model providers");
    expect(report.summary.ran).toBe(0);
    expect(report.summary.greenWithinBudgetRate).toBe(0);
  });
});

describe("checkAppBuild", () => {
  it("fails every shape check when the build produced no bundle", () => {
    const failed = {
      spec: {
        title: "",
        operations: [],
        variables: [],
        widgets: [],
        interactions: []
      },
      appDebug: null,
      bundle: null,
      repairs: [],
      stages: [],
      verdict: { ok: false, reason: "planning failed", notSimulated: [] },
      cost: { usd: 0, byStage: {} }
    } as unknown as BuildReport;

    const checks = checkAppBuild(caseById("draft-then-publish"), failed);
    expect(checks.every((c) => !c.pass)).toBe(true);
    expect(checks.map((c) => c.name)).toContain("gated flow");
    expect(checks[0]?.detail).toBe("planning failed");
  });
});
