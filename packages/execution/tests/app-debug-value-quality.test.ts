/**
 * A run can complete while producing nothing useful. The calculator app that
 * motivated these tests emitted `""` on its result output and
 * `"Error: 'eval' is not defined"` on its error output, and the harness called
 * that a clean run: the empty string passed the `value !== undefined` arrival
 * check, and nothing looked at what the values said.
 *
 * The runner is stubbed, so what these assert is the verdict's own judgement of
 * the values a run leaves behind.
 */
import { describe, expect, it, vi } from "vitest";
import { simulateApp } from "../src/app-debug/simulate.js";
import { collectExecutionSummary } from "../src/debug/collector.js";
import type {
  AppServerRunInput,
  AppServerRunOutcome
} from "../src/app-debug/simulate.js";
import { resolvedWorkflow } from "./app-debug-fixtures.js";

/** Two outputs: the computed answer and the message a caught failure lands on. */
const graph = {
  nodes: [
    {
      id: "in1",
      type: "nodetool.input.StringInput",
      data: { name: "expression", value: "2 + 3 * 4" }
    },
    { id: "code1", type: "nodetool.code.Code", data: { name: "calc" } },
    { id: "out1", type: "nodetool.output.StringOutput", data: { name: "result" } },
    { id: "out2", type: "nodetool.output.StringOutput", data: { name: "error" } }
  ],
  edges: []
};

const runButton = {
  type: "Button",
  props: {
    id: "Button-1",
    label: "Run",
    events: [{ trigger: "click", kind: "run", key: "", value: "" }]
  }
};

const calculatorApp = () =>
  resolvedWorkflow(graph, {
    version: 2,
    variables: [],
    data: {
      root: { props: { title: "Calculator" } },
      content: [
        { type: "TextInput", props: { id: "TextInput-1", binding: "expression" } },
        { type: "Stat", props: { id: "Stat-1", binding: "result" } },
        { type: "Alert", props: { id: "Alert-1", binding: "error" } },
        runButton
      ],
      zones: {}
    }
  });

/** A run that completes without error, emitting whatever the case asks for. */
const stubRunner = (outputs: Record<string, unknown>) =>
  vi.fn<(input: AppServerRunInput) => Promise<AppServerRunOutcome>>(async () => {
    const messages = [
      ...Object.entries(outputs).map(([nodeId, value]) => ({
        type: "output_update",
        node_id: nodeId,
        output_name: "output",
        value
      })),
      { type: "job_update", status: "completed" }
    ];
    const summary = collectExecutionSummary(messages);
    summary.status = "completed";
    return {
      report: {
        surface: "server" as const,
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

const run = async (outputs: Record<string, unknown>) =>
  simulateApp(
    calculatorApp(),
    {},
    { loadFromDb: async () => null, runOnServer: stubRunner(outputs) }
  );

describe("app debug — a run that produced nothing", () => {
  it("does not call an empty string a received value", async () => {
    const report = await run({ out1: "", out2: "" });

    expect(report.widgets.find((w) => w.id === "Stat-1")?.hasValue).toBe(false);
    expect(report.verdict.warnings.join("\n")).toMatch(
      /Stat "Stat-1" is bound to "result" but received an empty value/
    );
  });

  it("does not call an empty array or a null a received value", async () => {
    const report = await run({ out1: [], out2: null });

    expect(report.widgets.find((w) => w.id === "Stat-1")?.hasValue).toBe(false);
    expect(report.widgets.find((w) => w.id === "Alert-1")?.hasValue).toBe(false);
  });

  it("still calls a real value received", async () => {
    const report = await run({ out1: "14", out2: "" });

    expect(report.widgets.find((w) => w.id === "Stat-1")?.hasValue).toBe(true);
    expect(report.verdict.warnings.join("\n")).not.toMatch(/"Stat-1"/);
  });
});

describe("app debug — a run that produced an error", () => {
  it("fails the verdict when a bound widget shows an error message", async () => {
    const report = await run({ out1: "", out2: "Error: 'eval' is not defined" });

    expect(report.verdict.ok).toBe(false);
    expect(report.verdict.issues.join("\n")).toMatch(
      /Alert "Alert-1" shows an error message from "error": Error: 'eval' is not defined/
    );
    expect(report.verdict.headline).not.toMatch(/ran clean/);
  });

  it("recognises a named error class", async () => {
    const report = await run({
      out1: "14",
      out2: "ReferenceError: eval is not defined"
    });

    expect(report.verdict.ok).toBe(false);
  });

  it("leaves prose that merely mentions an error alone", async () => {
    const report = await run({
      out1: "The Error: message below is part of the answer",
      out2: ""
    });

    expect(report.verdict.ok).toBe(true);
  });
});

/**
 * Naming only the miss is what sent one agent round after round: "no widget
 * matches undefined" says nothing about what a target may be, so it guessed
 * the step shape twice and got the identical error both times.
 */
describe("app debug — an interaction that matches no widget", () => {
  const runWith = async (interact: Record<string, unknown>[]) =>
    simulateApp(
      calculatorApp(),
      { interact: interact as never },
      { loadFromDb: async () => null, runOnServer: stubRunner({ out1: "14" }) }
    );

  it("lists the widgets that do exist", async () => {
    const report = await runWith([{ click: "Submit" }]);

    const error = report.interactions[0]?.error ?? "";
    expect(error).toMatch(/no widget matches "Submit"/);
    expect(error).toMatch(/Button-1 \(Button, label "Run"\)/);
    expect(error).toMatch(/Stat-1 \(Stat\)/);
  });
});
