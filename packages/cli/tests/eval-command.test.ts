/**
 * Tests for the `nodetool eval` command registration (src/commands/eval.ts).
 *
 * The command is now data-driven: one subcommand is generated per entry in
 * `EVAL_SUITES`. These tests verify the registry drives registration and that
 * each suite exposes the full option surface. Heavy deps are imported lazily
 * inside the action, so registration is testable without them.
 */
import { describe, expect, it } from "vitest";
import { Command } from "commander";
import {
  registerEvalCommand,
  EVAL_SUITES,
  evalGateFailures
} from "../src/commands/eval.js";

function evalCommand() {
  const program = new Command();
  registerEvalCommand(program);
  const cmd = program.commands.find((c) => c.name() === "eval");
  if (!cmd) throw new Error("eval command not registered");
  return cmd;
}

describe("registerEvalCommand", () => {
  it("registers the eval command", () => {
    expect(evalCommand().description()).toMatch(/evaluation suites/i);
  });

  it("generates one subcommand per registered suite", () => {
    const subNames = evalCommand()
      .commands.map((c) => c.name())
      .sort();
    const suiteIds = EVAL_SUITES.map((s) => s.id).sort();
    expect(subNames).toEqual(suiteIds);
  });

  it("exposes graph-planner as a registered suite", () => {
    expect(EVAL_SUITES.some((s) => s.id === "graph-planner")).toBe(true);
  });

  it("gives every suite the full option surface", () => {
    for (const sub of evalCommand().commands) {
      const flags = sub.options.map((o) => o.long).filter(Boolean);
      expect(flags).toEqual(
        expect.arrayContaining([
          "--provider",
          "--model",
          "--cases",
          "--list",
          "--json",
          "--out",
          "--judge-model",
          "--min-success",
          "--min-score",
          "--min-cases",
          "--max-cost-usd",
          "--max-p95-duration-ms",
          "--keyless",
          "--system-prompt",
          "--no-find-model"
        ])
      );
    }
  });
});

describe("keyless case selection", () => {
  it("declares a keyless set only where the suite has one", () => {
    // app-build's two scripted cases are the only eval cases that reach no
    // provider; every other suite drives a real model on every case. The ids
    // behind the hook are pinned where they live, in
    // packages/agents/tests/app-build-eval.test.ts.
    const withKeyless = EVAL_SUITES.filter((s) => s.keylessCaseIds);
    expect(withKeyless.map((s) => s.id)).toEqual(["app-build"]);
  });
});

describe("evalGateFailures", () => {
  // Two cases ran for $0.01 each, a third was skipped (0 ms, $0).
  const green = {
    successRate: 1,
    meanScore: 1,
    casesRan: 2,
    costUsd: 0.02,
    durationsMs: [1200, 1800]
  };

  it("passes a run that clears both thresholds", () => {
    expect(
      evalGateFailures(green, "task-planner", {
        minScore: "1",
        minSuccess: "1"
      })
    ).toEqual([]);
  });

  it("fails a degraded plan that --min-success alone would pass", () => {
    // The shape the planner suite actually produces on a regression: the plan
    // committed (success 1.0) but lost half its parallelism (score 0.92).
    const degraded = { ...green, meanScore: 0.92 };
    expect(evalGateFailures(degraded, "task-planner", { minSuccess: "1" })).toEqual(
      []
    );
    const failures = evalGateFailures(degraded, "task-planner", {
      minScore: "1",
      minSuccess: "1"
    });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("0.92");
  });

  it("fails loudly when the suite reports no score", () => {
    const failures = evalGateFailures(
      { ...green, meanScore: undefined, casesRan: 8 },
      "code-gen",
      { minScore: "0.5" }
    );
    expect(failures).toEqual(['--min-score: suite "code-gen" reports no score']);
  });

  it("reports both gates when both are missed", () => {
    expect(
      evalGateFailures(
        { ...green, successRate: 0.4, meanScore: 0.4, casesRan: 7 },
        "task-planner",
        { minScore: "0.8", minSuccess: "0.8" }
      )
    ).toHaveLength(2);
  });

  it("is silent when neither threshold is given", () => {
    expect(
      evalGateFailures(
        { successRate: 0, casesRan: 0, costUsd: 0, durationsMs: [] },
        "task-planner",
        {}
      )
    ).toEqual([]);
  });

  it("fails a run that examined nothing", () => {
    // The shape a keyless gate degrades into: the ids still resolve, but every
    // case was skipped for want of a provider. The success rate is 0 over an
    // empty set, so --min-success alone would blame the cases.
    const failures = evalGateFailures(
      { successRate: 0, casesRan: 0, costUsd: 0, durationsMs: [] },
      "app-build",
      { minCases: "2", minSuccess: "1" }
    );
    expect(failures).toHaveLength(2);
    expect(failures[0]).toContain("ran 0 case(s)");
  });

  it("fails a gate whose case set shrank under it", () => {
    // Every case that ran passed, so every rate reads green. Only the count
    // says the gate stopped covering half of what it claims.
    const failures = evalGateFailures(
      { ...green, casesRan: 1, durationsMs: [1200] },
      "app-build",
      { minCases: "2", minSuccess: "1" }
    );
    expect(failures).toEqual([
      'Suite "app-build" ran 1 case(s), below --min-cases 2 — a rate over ' +
        "that many cases says nothing"
    ]);
  });

  it("passes a run under both the cost and the duration cap", () => {
    expect(
      evalGateFailures(green, "tool-loop", {
        maxCostUsd: "0.05",
        maxP95DurationMs: "2000"
      })
    ).toEqual([]);
  });

  it("fails a green run that cost more than the cap", () => {
    // Every rate reads 1.0; only the bill says the suite got expensive.
    const failures = evalGateFailures(green, "tool-loop", {
      minSuccess: "1",
      maxCostUsd: "0.01"
    });
    expect(failures).toEqual([
      "Total cost $0.0200 above --max-cost-usd 0.01"
    ]);
  });

  it("gates the p95 on the cases that ran, nearest-rank", () => {
    // Twenty timings: rank ceil(0.95 * 20) = 19 is the second-slowest, so
    // the one outlier at 9000 ms is not what the gate reads.
    const durationsMs = [...Array.from({ length: 18 }, () => 1000), 3000, 9000];
    const timed = { ...green, casesRan: 20, durationsMs };
    expect(
      evalGateFailures(timed, "codeact", { maxP95DurationMs: "3000" })
    ).toEqual([]);
    expect(
      evalGateFailures(timed, "codeact", { maxP95DurationMs: "2999" })
    ).toEqual(["p95 case duration 3000ms above --max-p95-duration-ms 2999"]);
  });

  it("fails the duration gate when nothing ran", () => {
    // A skipped-everything run has no timing to compare; silence here would
    // read as a fast suite.
    expect(
      evalGateFailures(
        { successRate: 0, casesRan: 0, costUsd: 0, durationsMs: [] },
        "graph-e2e",
        { maxP95DurationMs: "1000" }
      )
    ).toEqual([
      '--max-p95-duration-ms: suite "graph-e2e" ran no case, nothing to time'
    ]);
  });

  it("rejects a negative cost cap", () => {
    expect(() =>
      evalGateFailures(green, "tool-loop", { maxCostUsd: "-1" })
    ).toThrow(/--max-cost-usd/);
  });
});
