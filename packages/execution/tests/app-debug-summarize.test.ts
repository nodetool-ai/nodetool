/**
 * Tests for the chat-sized report reducer (src/app-debug/summarize.ts).
 *
 * The reducer is what every surface returns instead of the bundle-sized
 * `AppDebugReport`, so what it keeps is the contract: the verdict, each
 * widget's end state, each invocation's outcome, the failed steps, and what a
 * headless run could not answer.
 */
import { describe, expect, it } from "vitest";
import { summarizeAppReport } from "../src/app-debug/summarize.js";
import type { AppDebugReport } from "../src/app-debug/types.js";

const report = (over: Partial<AppDebugReport> = {}): AppDebugReport => ({
  generatedAt: "2026-01-01T00:00:00.000Z",
  target: {
    ref: "app-1",
    source: "application",
    workflowId: "wf1",
    nodeCount: 2,
    edgeCount: 1
  },
  app: { version: 3, title: "Demo App", widgetCount: 2 },
  spec: null,
  io: { inputs: ["prompt"], outputs: ["result"], variables: [] },
  validation: { errors: ["bad binding"], warnings: ["unbound output"] },
  interactions: [
    { step: "set prompt", actions: ["set prompt"], runIndex: null, error: null },
    { step: "click Button-1", actions: [], runIndex: null, error: "no widget matches" }
  ],
  runs: [],
  values: { prompt: "hi", result: "there" },
  variables: {},
  invocations: [
    {
      id: "inv-1",
      operationId: "main",
      status: "error",
      decision: "start",
      decisionTargets: [],
      runIndex: 0,
      timedOutMs: 5000,
      error: "node exploded",
      activity: ["thinking"]
    }
  ],
  activity: [],
  widgets: [
    {
      id: "Markdown-1",
      type: "Markdown",
      bindingMode: "read",
      binding: "op:main/out:out1",
      stateKey: "main:out1",
      value: "there",
      display: "Result: there",
      hasValue: true,
      visible: true,
      disabled: false
    },
    {
      id: "TextInput-1",
      type: "TextInput",
      bindingMode: "write",
      binding: "op:main/in:in1",
      stateKey: "main:in1",
      value: "hi",
      display: null,
      hasValue: true,
      visible: true,
      disabled: true
    }
  ],
  resources: [],
  notSimulated: ["Layout, styling, focus, and scroll."],
  verdict: {
    ok: false,
    headline: "App has issues — bad binding",
    issues: ["bad binding"],
    warnings: ["unbound output"]
  },
  bundleDir: null,
  ...over
});

describe("summarizeAppReport", () => {
  it("keeps the verdict, widget end state, and invocation outcomes", () => {
    const summary = summarizeAppReport(report());

    expect(summary.target).toEqual({
      ref: "app-1",
      source: "application",
      workflowId: "wf1"
    });
    expect(summary.app).toEqual({ title: "Demo App", widgetCount: 2 });
    expect(summary.verdict).toEqual({
      ok: false,
      headline: "App has issues — bad binding",
      issues: ["bad binding"],
      warnings: ["unbound output"]
    });
    expect(summary.widgets).toEqual([
      {
        id: "Markdown-1",
        type: "Markdown",
        binding: "op:main/out:out1",
        hasValue: true,
        visible: true,
        disabled: false,
        display: "Result: there"
      },
      {
        id: "TextInput-1",
        type: "TextInput",
        binding: "op:main/in:in1",
        hasValue: true,
        visible: true,
        disabled: true
      }
    ]);
    expect(summary.invocations).toEqual([
      {
        id: "inv-1",
        operationId: "main",
        status: "error",
        decision: "start",
        error: "node exploded",
        timedOutMs: 5000
      }
    ]);
    expect(summary.values).toEqual({ prompt: "hi", result: "there" });
    expect(summary.notSimulated).toEqual(["Layout, styling, focus, and scroll."]);
  });

  it("keeps the static check's warnings, which the verdict does not carry", () => {
    const summary = summarizeAppReport(
      report({
        validation: {
          errors: [],
          warnings: ["TextInput \"TextInput-1\": not bound to an input."]
        },
        verdict: {
          ok: true,
          headline: "App ran clean.",
          issues: [],
          warnings: ["Markdown \"Markdown-1\" is downstream of a branch."]
        }
      })
    );
    expect(summary.verdict.warnings).toEqual([
      'Markdown "Markdown-1" is downstream of a branch.',
      'TextInput "TextInput-1": not bound to an input.'
    ]);
  });

  it("reports only the interaction steps that failed", () => {
    const summary = summarizeAppReport(report());
    expect(summary.interactionErrors).toEqual([
      { step: "click Button-1", error: "no widget matches" }
    ]);
  });

  it("drops nothing but the bundle-sized parts of a clean report", () => {
    const summary = summarizeAppReport(
      report({
        validation: { errors: [], warnings: [] },
        interactions: [],
        invocations: [],
        verdict: { ok: true, headline: "App wiring is valid.", issues: [] }
      })
    );
    expect(summary.verdict).toEqual({
      ok: true,
      headline: "App wiring is valid.",
      issues: [],
      warnings: []
    });
    expect(summary.interactionErrors).toEqual([]);
    expect(summary.invocations).toEqual([]);
    expect(summary).not.toHaveProperty("runs");
    expect(summary).not.toHaveProperty("spec");
  });
});
