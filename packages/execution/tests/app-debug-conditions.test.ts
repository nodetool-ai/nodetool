/**
 * Tests for the simulated logic surface of the app simulator: `visibleWhen`,
 * `disabledWhen`, and `format`. The workflow runner is stubbed out, so what
 * these assert is the simulator's own behaviour — which steps a user could
 * perform, and what a widget ends up showing.
 */
import { describe, expect, it, vi } from "vitest";
import { simulateApp } from "../src/app-debug/simulate.js";
import { renderAppReportMarkdown } from "../src/app-debug/markdown.js";
import { collectExecutionSummary } from "../src/debug/collector.js";
import type {
  AppServerRunInput,
  AppServerRunOutcome
} from "../src/app-debug/simulate.js";
import type {
  InteractionStep,
  ResolvedAppTarget
} from "../src/app-debug/types.js";
import { resolvedWorkflow } from "./app-debug-fixtures.js";

const graph = {
  nodes: [
    {
      id: "in1",
      type: "nodetool.input.StringInput",
      data: { name: "prompt", value: "hello" }
    },
    { id: "out1", type: "nodetool.output.StringOutput", data: { name: "result" } }
  ],
  edges: []
};

/** A workflow target whose app document is built from the given widget list. */
const appTarget = (
  content: Array<Record<string, unknown>>,
  variables: Array<Record<string, unknown>> = []
): ResolvedAppTarget =>
  resolvedWorkflow(graph, {
    version: 2,
    variables,
    data: { root: { props: { title: "Conditional App" } }, content, zones: {} }
  });

const stubRunner = () =>
  vi.fn(async (_input: AppServerRunInput): Promise<AppServerRunOutcome> => {
    const messages = [
      { type: "output_update", node_id: "out1", output_name: "output", value: "the answer" },
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
        durationMs: 5,
        summary,
        trace: null
      },
      rawMessages: messages as never[]
    };
  });

const run = async (target: ResolvedAppTarget, interact?: InteractionStep[]) => {
  const runOnServer = stubRunner();
  const report = await simulateApp(
    target,
    { ...(interact ? { interact } : {}) },
    { loadFromDb: async () => null, runOnServer }
  );
  return { report, runOnServer };
};

const approveApp = (buttonProps: Record<string, unknown>) =>
  appTarget(
    [
      { type: "TextInput", props: { id: "TextInput-1", binding: "prompt" } },
      { type: "Markdown", props: { id: "Markdown-1", binding: "result" } },
      {
        type: "Button",
        props: {
          id: "Button-1",
          label: "Approve",
          events: [{ trigger: "click", kind: "run", key: "", value: "" }],
          ...buttonProps
        }
      }
    ],
    [{ id: "draft", name: "draft", scope: "instance", persist: false }]
  );

describe("app debug — conditions", () => {
  it("fails a click on a widget its own visibleWhen hides", async () => {
    const { report, runOnServer } = await run(
      approveApp({ visibleWhen: { binding: "var:draft", op: "notEmpty" } }),
      [{ click: "Approve" }]
    );

    expect(runOnServer).not.toHaveBeenCalled();
    expect(report.interactions[0].error).toBe(
      'clicked "Approve" while hidden by `var:draft notEmpty`.'
    );
    expect(report.verdict.ok).toBe(false);
    const button = report.widgets.find((w) => w.id === "Button-1");
    expect(button).toMatchObject({ visible: false, disabled: false });
  });

  it("runs the same click once the condition holds", async () => {
    const { report, runOnServer } = await run(
      approveApp({ visibleWhen: { binding: "var:draft", op: "notEmpty" } }),
      [{ set: { key: "var:draft", value: "a draft" } }, { click: "Approve" }]
    );

    expect(runOnServer).toHaveBeenCalledOnce();
    expect(report.interactions.map((i) => i.error)).toEqual([null, null]);
    expect(report.interactions[1].runIndex).toBe(0);
    expect(report.widgets.find((w) => w.id === "Button-1")).toMatchObject({
      visible: true,
      disabled: false
    });
    expect(report.verdict.ok).toBe(true);
  });

  it("fails a click on a disabled widget, naming the condition", async () => {
    const { report, runOnServer } = await run(
      approveApp({ disabledWhen: { binding: "prompt", op: "eq", value: "hello" } }),
      [{ click: "Approve" }]
    );

    expect(runOnServer).not.toHaveBeenCalled();
    expect(report.interactions[0].error).toBe(
      'clicked "Approve" while disabled by `prompt eq hello`.'
    );
  });

  it("flags a run trigger whose visibleWhen never held", async () => {
    const { report } = await run(
      approveApp({ visibleWhen: { binding: "var:draft", op: "notEmpty" } }),
      []
    );

    expect(report.verdict.issues.join("\n")).toMatch(
      /Button "Approve" runs the app, but its visibleWhen \(`var:draft notEmpty`\) never held/
    );
  });

  it("does not flag a trigger that was reachable at some point", async () => {
    const { report } = await run(
      approveApp({ visibleWhen: { binding: "var:draft", op: "notEmpty" } }),
      [{ set: { key: "var:draft", value: "a draft" } }, { click: "Approve" }]
    );

    expect(report.verdict.issues.join("\n")).not.toMatch(/never held/);
  });
});

describe("app debug — format", () => {
  it("reports what the format template renders, not the raw value", async () => {
    const { report } = await run(
      appTarget([
        { type: "TextInput", props: { id: "TextInput-1", binding: "prompt" } },
        {
          type: "Markdown",
          props: { id: "Markdown-1", binding: "result", format: "{result|upper}" }
        },
        {
          type: "Button",
          props: {
            id: "Button-1",
            label: "Run",
            events: [{ trigger: "click", kind: "run", key: "", value: "" }]
          }
        }
      ])
    );

    const markdown = report.widgets.find((w) => w.id === "Markdown-1");
    expect(markdown).toMatchObject({
      value: "the answer",
      display: "THE ANSWER",
      hasValue: true
    });
    expect(renderAppReportMarkdown(report)).toContain("THE ANSWER");
    expect(report.verdict.ok).toBe(true);
  });

  it("counts a widget as empty when its template renders nothing", async () => {
    // The bound output arrives, but the template reads a variable nothing
    // fills, so the user sees an empty widget — which is what the check tests.
    const { report } = await run(
      appTarget(
        [
          { type: "TextInput", props: { id: "TextInput-1", binding: "prompt" } },
          {
            type: "Markdown",
            props: { id: "Markdown-1", binding: "result", format: "{var:draft}" }
          },
          {
            type: "Button",
            props: {
              id: "Button-1",
              label: "Run",
              events: [{ trigger: "click", kind: "run", key: "", value: "" }]
            }
          }
        ],
        [{ id: "draft", name: "draft", scope: "instance", persist: false }]
      )
    );

    const markdown = report.widgets.find((w) => w.id === "Markdown-1");
    expect(markdown).toMatchObject({ value: "the answer", display: "", hasValue: false });
    expect(report.verdict.issues.join("\n")).toMatch(/never received a value/);
  });
});

describe("app debug — apps without conditions", () => {
  it("reports every widget visible and enabled, with no rendered display", async () => {
    const { report } = await run(
      appTarget([
        { type: "TextInput", props: { id: "TextInput-1", binding: "prompt" } },
        { type: "Markdown", props: { id: "Markdown-1", binding: "result" } },
        {
          type: "Button",
          props: {
            id: "Button-1",
            label: "Run",
            events: [{ trigger: "click", kind: "run", key: "", value: "" }]
          }
        }
      ])
    );

    expect(report.verdict.ok).toBe(true);
    expect(report.interactions.map((i) => i.error)).toEqual([null]);
    for (const widget of report.widgets) {
      expect(widget).toMatchObject({ visible: true, disabled: false, display: null });
    }
    // Conditions and formatting are simulated now, so nothing here may claim
    // otherwise.
    expect(report.notSimulated.join("\n")).not.toMatch(/condition|format|visibleWhen/i);
    expect(renderAppReportMarkdown(report)).toContain("## Not simulated");
  });
});
