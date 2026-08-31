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
          "--max-retries",
          "--judge-model",
          "--min-success",
          "--min-score",
          "--system-prompt",
          "--no-find-model"
        ])
      );
    }
  });
});

describe("evalGateFailures", () => {
  const green = { successRate: 1, meanScore: 1 };

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
    const degraded = { successRate: 1, meanScore: 0.92 };
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
      { successRate: 1 },
      "code-gen",
      { minScore: "0.5" }
    );
    expect(failures).toEqual(['--min-score: suite "code-gen" reports no score']);
  });

  it("reports both gates when both are missed", () => {
    expect(
      evalGateFailures({ successRate: 0.4, meanScore: 0.4 }, "task-planner", {
        minScore: "0.8",
        minSuccess: "0.8"
      })
    ).toHaveLength(2);
  });

  it("is silent when neither threshold is given", () => {
    expect(evalGateFailures({ successRate: 0 }, "task-planner", {})).toEqual([]);
  });
});
