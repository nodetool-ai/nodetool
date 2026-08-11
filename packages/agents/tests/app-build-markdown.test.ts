/**
 * The human half of a build report.
 *
 * `report.md` is what a person opens after a build, so every case here asserts
 * the rendered text — the verdict line, the stage table, the repair rounds, the
 * judge verdicts, the supervision rollup — rather than that something was
 * written. A section that has nothing to say must be absent, not empty.
 */

import { describe, it, expect } from "vitest";
import type { Intervention } from "@nodetool-ai/protocol";
import { summarizeInterventions } from "@nodetool-ai/execution/debug";
import { renderBuildReportMarkdown } from "../src/app-build/markdown.js";
import type {
  BuildReport,
  BuildSpec,
  CompletedInteraction,
  StageRecord
} from "../src/app-build/types.js";

const spec = (): BuildSpec => ({
  title: "Drafter",
  operations: [
    {
      id: "draft",
      objective: "draft a note",
      inputs: [{ name: "prompt", type: "string", example: "a haiku" }],
      outputs: [{ name: "text", type: "string" }],
      streaming: false
    }
  ],
  variables: [],
  widgets: [
    {
      role: "prompt-input",
      type: "TextInput",
      binding: "op:draft/in:prompt",
      label: "Prompt"
    },
    { role: "run-button", type: "Button", binding: "", label: "Draft it" }
  ],
  interactions: []
});

const stage = (over: Partial<StageRecord> = {}): StageRecord => ({
  stage: "spec",
  round: 0,
  status: "ok",
  startedAt: "2026-08-11T10:00:00.000Z",
  durationMs: 12,
  issues: [],
  costUsd: 0.01,
  ...over
});

const interaction = (
  over: Partial<CompletedInteraction> = {}
): CompletedInteraction => ({
  name: "draft-once",
  steps: [{ click: "run-button" }],
  expect: [{ widget: "draft-output", check: "nonEmpty" }],
  derived: false,
  addedSteps: [],
  ...over
});

const report = (over: Partial<BuildReport> = {}): BuildReport =>
  ({
    target: { prompt: "an app that drafts a note" },
    spec: spec(),
    interactions: [interaction()],
    stages: [stage()],
    repairs: [],
    appDebug: null,
    judge: null,
    supervision: null,
    verdict: { ok: true, reason: "green on the first pass", notSimulated: [] },
    cost: { usd: 0.125, byStage: { spec: 0.125 } },
    bundle: null,
    ...over
  }) as BuildReport;

const intervention = (): Intervention => ({
  escalation: {
    nodeId: "out2",
    nodeType: "nodetool.output.StringOutput",
    correlationLineage: [],
    invocationKey: "",
    allowedActions: ["skip", "fail"],
    detail: "the notes source returned HTTP 404",
    inputs: {},
    declaredOutputs: {},
    attempt: 1,
    spentCostUsd: 0,
    createdAssets: false,
    retrySafe: false,
    emitted: false
  },
  verdict: { action: "skip" },
  decidedBy: "agent",
  costUsd: 0.004
});

describe("renderBuildReportMarkdown", () => {
  it("leads with the title, the verdict, and the build's shape", () => {
    const text = renderBuildReportMarkdown(report());
    const lines = text.split("\n");

    expect(lines[0]).toBe("# Drafter");
    expect(lines[2]).toBe("**OK** — green on the first pass");
    expect(lines).toContain("- target: an app that drafts a note");
    expect(lines).toContain("- operations: 1");
    expect(lines).toContain("- widgets: 2");
    expect(lines).toContain("- interactions: 1");
    expect(lines).toContain("- repair rounds: 0");
    expect(lines).toContain("- cost: $0.1250");
  });

  it("names the spec file when the build ran from one", () => {
    const text = renderBuildReportMarkdown(
      report({ target: { prompt: "", specPath: "/tmp/spec.json" } })
    );
    expect(text).toContain("- target: /tmp/spec.json");
  });

  it("falls back to a generic title and target when neither was given", () => {
    const text = renderBuildReportMarkdown(
      report({
        spec: { ...spec(), title: "" },
        target: { prompt: "" }
      })
    );
    expect(text.split("\n")[0]).toBe("# app build");
    expect(text).toContain("- target: (none)");
  });

  it("renders one stage-table row per stage execution", () => {
    const text = renderBuildReportMarkdown(
      report({
        stages: [
          stage({ stage: "spec", detail: "1 operation, 2 widgets" }),
          stage({
            stage: "author",
            round: 1,
            status: "failed",
            durationMs: 4200,
            costUsd: 0.5,
            detail: "widget Draft has no binding"
          }),
          stage({
            stage: "judge",
            status: "skipped",
            durationMs: 0,
            costUsd: 0,
            detail: "skipped (--no-judge)"
          })
        ]
      })
    );

    expect(text).toContain("| stage | round | status | ms | cost | detail |");
    expect(text).toContain(
      "| spec | 0 | ok | 12 | $0.0100 | 1 operation, 2 widgets |"
    );
    expect(text).toContain(
      "| author | 1 | failed | 4200 | $0.5000 | widget Draft has no binding |"
    );
    expect(text).toContain("| judge | 0 | skipped | 0 | $0.0000 | skipped (--no-judge) |");
  });

  it("leaves a stage's detail cell empty when it carries none", () => {
    const text = renderBuildReportMarkdown(report());
    expect(text).toContain("| spec | 0 | ok | 12 | $0.0100 |  |");
  });

  it("lists every issue of every repair round under its round heading", () => {
    const text = renderBuildReportMarkdown(
      report({
        repairs: [
          {
            round: 1,
            issues: [
              {
                stage: "check",
                code: "unknown_binding",
                severity: "error",
                message: "widget Draft binds op:draft/out:missing"
              },
              {
                stage: "run",
                code: "widget_never_filled",
                severity: "error",
                message: "Draft showed nothing after draft-once"
              }
            ],
            fingerprints: []
          },
          {
            round: 2,
            issues: [
              {
                stage: "judge",
                code: "not_achieved",
                severity: "error",
                message: "draft-once did not draft anything"
              }
            ],
            fingerprints: []
          }
        ]
      })
    );

    expect(text).toContain("## Repairs");
    expect(text).toContain("### Round 1");
    expect(text).toContain(
      "- `check/unknown_binding` widget Draft binds op:draft/out:missing"
    );
    expect(text).toContain(
      "- `run/widget_never_filled` Draft showed nothing after draft-once"
    );
    expect(text).toContain("### Round 2");
    expect(text).toContain(
      "- `judge/not_achieved` draft-once did not draft anything"
    );
    expect(text).toContain("- repair rounds: 2");
  });

  it("marks a derived interaction and names the steps the harness seeded", () => {
    const text = renderBuildReportMarkdown(
      report({
        interactions: [
          interaction(),
          interaction({
            name: "publish-once",
            derived: true,
            operationId: "publish",
            steps: [{ click: "run-button" }, { run: "publish" }],
            expect: [],
            addedSteps: ['set prompt = "a haiku"', "click run-button"]
          })
        ]
      })
    );

    expect(text).toContain(
      "- **draft-once** — 1 step(s), 1 expectation(s)"
    );
    expect(text).toContain(
      "- **publish-once** (derived) — 2 step(s), 0 expectation(s)"
    );
    expect(text).toContain('  - seeded: set prompt = "a haiku"');
    expect(text).toContain("  - seeded: click run-button");
  });

  it("reports each interaction the judge scored, with its reasons", () => {
    const text = renderBuildReportMarkdown(
      report({
        judge: {
          model: "openai/gpt-5.4-mini",
          interactions: [
            {
              interaction: "draft-once",
              achieved: true,
              confidence: 0.9,
              reasons: ["the draft widget shows a drafted note"]
            },
            {
              interaction: "publish-once",
              achieved: false,
              confidence: 0.8,
              reasons: ["nothing was published", "the button stayed disabled"]
            }
          ]
        }
      })
    );

    expect(text).toContain("## Judge");
    expect(text).toContain("Model: openai/gpt-5.4-mini");
    expect(text).toContain(
      "- draft-once: achieved — the draft widget shows a drafted note"
    );
    expect(text).toContain(
      "- publish-once: not achieved — nothing was published; the button stayed disabled"
    );
  });

  it("renders the supervision rollup and one line per decision", () => {
    const item = intervention();
    const text = renderBuildReportMarkdown(
      report({
        supervision: {
          summary: summarizeInterventions([item]),
          byInteraction: [
            { interaction: "draft-once", interventions: [item] }
          ]
        }
      })
    );

    expect(text).toContain("## Supervision");
    expect(text).toContain("supervised: 1 skipped, 1 decision, +$0.0040");
    expect(text).toContain(
      "- **draft-once** — skip on `out2` (agent): the notes source returned HTTP 404"
    );
  });

  it("lists what nothing simulated", () => {
    const text = renderBuildReportMarkdown(
      report({
        verdict: {
          ok: true,
          reason: "green on the first pass",
          notSimulated: ["layout, styling, focus and scroll", "stored collections"]
        }
      })
    );

    expect(text).toContain("## Not simulated");
    expect(text).toContain("- layout, styling, focus and scroll");
    expect(text).toContain("- stored collections");
  });

  it("omits the optional sections a clean build has nothing to put in", () => {
    const text = renderBuildReportMarkdown(report());

    expect(text).not.toContain("## Repairs");
    expect(text).not.toContain("## Judge");
    expect(text).not.toContain("## Supervision");
    expect(text).not.toContain("## Not simulated");
    // The two unconditional sections stay.
    expect(text).toContain("## Stages");
    expect(text).toContain("## Interactions");
  });

  it("says FAILED with the reason when a build was cancelled", () => {
    const text = renderBuildReportMarkdown(
      report({
        verdict: { ok: false, reason: "cancelled", notSimulated: [] },
        stages: [stage({ stage: "run", status: "failed", detail: "cancelled" })],
        bundle: null
      })
    );

    expect(text.split("\n")[2]).toBe("**FAILED** — cancelled");
    expect(text).toContain("| run | 0 | failed | 12 | $0.0100 | cancelled |");
  });

  it("says FAILED with the cap when a build overran its cost cap", () => {
    const text = renderBuildReportMarkdown(
      report({
        verdict: {
          ok: false,
          reason:
            "cost budget exhausted ($0.50) — the app was built but overran its cap",
          notSimulated: []
        },
        cost: { usd: 0.62, byStage: { spec: 0.12, author: 0.5 } }
      })
    );

    expect(text.split("\n")[2]).toBe(
      "**FAILED** — cost budget exhausted ($0.50) — the app was built but overran its cap"
    );
    expect(text).toContain("- cost: $0.6200");
  });
});
