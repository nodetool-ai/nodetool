/**
 * Tests for the `nodetool debug` command registration (src/commands/debug.ts).
 *
 * Verifies the command + its options are wired up. Heavy dependencies are only
 * imported lazily inside the action, so registration is testable without them.
 */
import { describe, expect, it } from "vitest";
import { Command } from "commander";
import { registerDebugCommands } from "../src/commands/debug.js";

function debugCommand() {
  const program = new Command();
  registerDebugCommands(program);
  const cmd = program.commands.find((c) => c.name() === "debug");
  if (!cmd) throw new Error("debug command not registered");
  return cmd;
}

describe("registerDebugCommands", () => {
  it("registers the debug command", () => {
    expect(debugCommand().description()).toMatch(/end-to-end/i);
  });

  it("exposes the surface, params, out, timeout and json options", () => {
    const flags = debugCommand()
      .options.map((o) => o.long)
      .filter(Boolean);
    expect(flags).toEqual(
      expect.arrayContaining([
        "--no-server",
        "--browser",
        "--params",
        "--out",
        "--timeout",
        "--json"
      ])
    );
  });

  it("defaults server on and browser off", () => {
    const cmd = debugCommand();
    // `--no-server` yields `server: true` by default in commander.
    const opts = cmd.opts<{ server?: boolean; browser?: boolean }>();
    expect(opts.server).toBe(true);
    expect(opts.browser).toBeUndefined();
  });

  it("takes a required workflow argument", () => {
    const args = debugCommand().registeredArguments.map((a) => a.name());
    expect(args).toContain("workflow_id_or_file");
  });
});
