import { Command } from "commander";
import { afterEach, expect, it, vi } from "vitest";
import { registerGameCommands } from "../src/commands/game.js";
import { smokeStandaloneGame } from "@nodetool-ai/game-renderer/smoke";

vi.mock("@nodetool-ai/game-renderer/smoke", () => ({ smokeStandaloneGame: vi.fn() }));
const originalExitCode = process.exitCode;
afterEach(() => { vi.restoreAllMocks(); process.exitCode = originalExitCode; });

it.each([true, false])("reports smoke success=%s and sets the CLI exit status", async ok => {
  const report = { ok, frames: ok ? 300 : 1, ticks: ok ? 300 : 0, errors: ok ? [] : ["stalled tick"] };
  vi.mocked(smokeStandaloneGame).mockResolvedValue(report);
  let output = "";
  vi.spyOn(process.stdout, "write").mockImplementation(chunk => { output += String(chunk); return true; });
  const program = new Command();
  registerGameCommands(program);
  await program.parseAsync(["node", "nodetool", "game", "smoke", "build", "--json"]);
  expect(smokeStandaloneGame).toHaveBeenCalledWith(expect.stringContaining("build"));
  expect(JSON.parse(output)).toEqual(report);
  expect(process.exitCode).toBe(ok ? originalExitCode : 1);
});
