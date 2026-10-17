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

it.each([
  ["get_node_info", { status: "error", errors: ["Unknown node"] }],
  ["search_nodes", { status: "error", errors: ["Invalid query"] }],
  ["run_node", { status: "failed", outputs: {} }],
  ["run_workflow", { status: "failed", job_id: "job" }],
  ["debug_app", { status: "failed", verdict: { ok: false } }],
  ["debug_app", { status: "completed", verdict: { ok: false } }],
  ["debug_workflow", { workflow_id: "workflow", run: { status: "failed" } }],
  ["debug_workflow", { workflow_id: "workflow", run: { error: "Run refused" } }]
])("exits nonzero for the %s failure contract", async (name, result) => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  const program = new Command();
  registerAuthoringCommands(program, async () => ({
    list: async () => [],
    call: async () => result
  }));
  await program.parseAsync(["tools", "call", name], { from: "user" });
  expect(process.exitCode).toBe(1);
});

it.each([
  ["get_workflow", { status: "failed", metadata: { ok: false } }],
  ["get_app", { document: { status: "error", metadata: { ok: false } } }],
  ["get_job", { status: "failed", result: { success: false } }],
  [
    "debug_workflow",
    {
      run: { status: "completed", outputs: { error: "user output", ok: false } }
    }
  ],
  [
    "run_node",
    { status: "completed", outputs: { status: "failed", ok: false } }
  ]
])("preserves successful %s reads and user output", async (name, result) => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  const program = new Command();
  registerAuthoringCommands(program, async () => ({
    list: async () => [],
    call: async () => result
  }));
  await program.parseAsync(["tools", "call", name], { from: "user" });
  expect(process.exitCode).toBeUndefined();
});

it.each([false, true])(
  "preserves install-required exits for returned or thrown missing packs (%s)",
  async (throws) => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { MissingPackError } = await import("@nodetool-ai/protocol");
    const details = {
      error: "missing_pack" as const,
      packs: [
        {
          id: "fal",
          npm: "@nodetool-ai/fal-nodes",
          version: "1.2.3",
          installBytes: 0,
          requires: []
        }
      ],
      runtimeLibraries: [],
      nodeTypes: ["fal.Fixture"],
      install: {
        supported: true,
        reason: null,
        command: "nodetool packs add fal"
      },
      restartRequired: false
    };
    const program = new Command();
    registerAuthoringCommands(program, async () => ({
      list: async () => [],
      call: async () => {
        if (throws) {
          throw new MissingPackError(details);
        }
        return details;
      }
    }));
    await program.parseAsync(["tools", "call", "run_node"], { from: "user" });
    expect(process.exitCode).toBe(3);
  }
);

it("preserves install-required exits for a failed debug workflow's run envelope", async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  const { missingRuntimePackageDetails } =
    await import("@nodetool-ai/protocol");
  const missingRuntime = missingRuntimePackageDetails(
    "ffprobe",
    "ffmpeg",
    {},
    { NODETOOL_HOST: "cli" }
  );
  const program = new Command();
  registerAuthoringCommands(program, async () => ({
    list: async () => [],
    call: async () => ({ run: { status: "failed", missingRuntime } })
  }));
  await program.parseAsync(["tools", "call", "debug_workflow"], {
    from: "user"
  });
  expect(process.exitCode).toBe(3);
});
