import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createNative3DGame, createTopDownRoomGame } from "@nodetool-ai/game-runtime";
import { registerGameCommands } from "../src/commands/game.js";

let directory: string;
let gamePath: string;
let output: string;
let originalExitCode: typeof process.exitCode;

async function run(command: string, ...args: string[]): Promise<Record<string, unknown>> {
  output = "";
  const program = new Command();
  registerGameCommands(program);
  await program.parseAsync(["node", "nodetool", "game", command, gamePath, "--json", ...args]);
  return JSON.parse(output.trim());
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "nodetool-cli-game-bindings-"));
  gamePath = join(directory, "game.json");
  output = ""; originalExitCode = process.exitCode;
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { output += String(chunk); return true; });
  vi.spyOn(console, "log").mockImplementation((value) => { output += `${String(value)}\n`; });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks(); process.exitCode = originalExitCode;
  await rm(directory, { recursive: true, force: true });
});

it("validates and replays a 3D document with an authored input map", async () => {
  const sample = createNative3DGame("a".repeat(32));
  // Scripts are removed so the wall-clock script budget cannot fail the run on a busy host. Bindings never reach scripts.
  const scenes = sample.scenes.map((scene) => ({ ...scene, entities: scene.entities.map((entity) => ({ ...entity, behaviors: entity.behaviors.filter((behavior) => behavior.kind !== "script") })) }));
  const document = { ...sample, scenes, inputBindings: {
    actions: { jump: [{ kind: "gamepadButton", button: 0 }, { kind: "key", code: "KeyK" }] },
    axes: { moveX: [{ kind: "gamepadAxis", axis: 0, deadZone: 0.2, invert: false }] },
    look: [{ kind: "gamepadStick", xAxis: 2, yAxis: 3, deadZone: 0.15, speed: 12, invertY: true }]
  } };
  await writeFile(gamePath, JSON.stringify(document));
  expect(await run("validate")).toMatchObject({ valid: true, document: { inputBindings: { actions: { jump: [{ kind: "gamepadButton", button: 0 }, { kind: "key", code: "KeyK" }] } } } });
  const inputs = join(directory, "inputs.json");
  await writeFile(inputs, JSON.stringify(Array.from({ length: 20 }, (_, tick) => ({ pressed: tick === 2 ? ["jump"] : [], justPressed: tick === 2 ? ["jump"] : [], axes: { moveX: 0.5 }, look: { x: 1, y: 0 } }))));
  expect(await run("simulate", "--ticks", "20", "--inputs", inputs, "--verify-replay")).toMatchObject({ ok: true, replay: { verified: true } });
});

it("rejects a 2D input map that binds an undeclared action", async () => {
  await writeFile(gamePath, JSON.stringify({ ...createTopDownRoomGame("b".repeat(32)), inputBindings: { actions: { fly: [{ kind: "key", code: "KeyF" }] } } }));
  const report = await run("validate");
  expect(report).toMatchObject({ valid: false });
  expect(JSON.stringify(report)).toContain("Input action fly is not declared");
  expect(process.exitCode).toBe(1);
});
