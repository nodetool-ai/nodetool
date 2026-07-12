/**
 * Tests for the `nodetool app debug` command registration
 * (src/commands/app.ts). Heavy dependencies are only imported lazily inside
 * the action, so registration is testable without them.
 */
import { describe, expect, it } from "vitest";
import { Command } from "commander";
import { registerAppCommands } from "../src/commands/app.js";

function appDebugCommand() {
  const program = new Command();
  registerAppCommands(program);
  const app = program.commands.find((c) => c.name() === "app");
  if (!app) throw new Error("app command not registered");
  const cmd = app.commands.find((c) => c.name() === "debug");
  if (!cmd) throw new Error("app debug command not registered");
  return cmd;
}

describe("registerAppCommands", () => {
  it("registers app debug with an agent-friendly description", () => {
    expect(appDebugCommand().description()).toMatch(/headlessly/i);
  });

  it("exposes the params, interact, no-run, out, timeout and json options", () => {
    const flags = appDebugCommand()
      .options.map((o) => o.long)
      .filter(Boolean);
    expect(flags).toEqual(
      expect.arrayContaining([
        "--params",
        "--interact",
        "--no-run",
        "--out",
        "--timeout",
        "--json"
      ])
    );
  });

  it("defaults runs on (`--no-run` yields run: true by default)", () => {
    const opts = appDebugCommand().opts<{ run?: boolean }>();
    expect(opts.run).toBe(true);
  });

  it("takes a required workflow argument", () => {
    const args = appDebugCommand().registeredArguments.map((a) => a.name());
    expect(args).toContain("workflow_id_or_file");
  });
});
