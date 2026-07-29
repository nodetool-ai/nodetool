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
import { registerEvalCommand, EVAL_SUITES } from "../src/commands/eval.js";

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
          "--min-success",
          "--no-find-model"
        ])
      );
    }
  });
});
