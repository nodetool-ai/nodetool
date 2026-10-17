import { afterEach, expect, it, vi } from "vitest";
import { Command } from "commander";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseToolArguments,
  registerAuthoringCommands
} from "../src/commands/tools.js";

const call = vi.fn(async () => ({ success: true }));
const load = async () => ({ list: async () => [], call });
afterEach(() => {
  vi.restoreAllMocks();
  call.mockClear();
  process.exitCode = undefined;
});

it("routes skills through the existing local capability calls", async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  const program = new Command();
  registerAuthoringCommands(program, load);
  await program.parseAsync(["skills", "read", "native-game"], { from: "user" });
  expect(call).toHaveBeenCalledWith("load_skill", { name: "native-game" });
});

it("accepts JSON files without shell escaping and rejects non-object arguments", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nodetool-tools-"));
  try {
    const file = join(directory, "arguments.json");
    await writeFile(
      file,
      JSON.stringify({ text: "quotes ' and \" and new\nlines", frames: [1, 2] })
    );
    expect(await parseToolArguments(`@${file}`)).toEqual({
      text: "quotes ' and \" and new\nlines",
      frames: [1, 2]
    });
    await expect(parseToolArguments("[]")).rejects.toThrow("JSON object");
  } finally {
    await rm(directory, { recursive: true });
  }
});

it("reports tool failures with a failing CLI exit code", async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  const program = new Command();
  registerAuthoringCommands(program, async () => ({
    list: async () => [],
    call: async () => ({ success: false, error: "invalid input" })
  }));
  await program.parseAsync(
    ["tools", "call", "create_timeline", "--args", "{}"],
    { from: "user" }
  );
  expect(process.exitCode).toBe(1);
});

it("links authoring command help to installed guides and tool discovery", () => {
  const program = new Command();
  for (const name of ["timeline", "game", "app", "workflows"]) {
    program.command(name);
  }
  registerAuthoringCommands(program, load);
  for (const command of [
    program,
    ...program.commands.filter((command) =>
      ["timeline", "game", "app", "workflows"].includes(command.name())
    )
  ]) {
    const output = vi.fn();
    command.configureOutput({ writeOut: output });
    command.outputHelp();
    expect(output.mock.calls.flat().join("")).toContain(
      "nodetool skills read native-game"
    );
    expect(output.mock.calls.flat().join("")).toContain(
      "nodetool tools info create_timeline"
    );
  }
});
