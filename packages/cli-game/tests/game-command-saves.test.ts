import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createNative3DGame, createTopDownRoomGame } from "@nodetool-ai/game-runtime";
import { registerGameCommands } from "../src/commands/game.js";

let directory: string;
let output: string;
let originalExitCode: typeof process.exitCode;

async function simulate(document: unknown, ...args: string[]): Promise<Record<string, unknown>> {
  const gamePath = join(directory, "game.json");
  await writeFile(gamePath, JSON.stringify(document));
  output = "";
  const program = new Command();
  registerGameCommands(program);
  await program.parseAsync(["node", "nodetool", "game", "simulate", gamePath, "--json", "--ticks", "120", "--verify-replay", ...args]);
  return JSON.parse(output.trim());
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "nodetool-cli-game-saves-"));
  output = ""; originalExitCode = process.exitCode;
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { output += String(chunk); return true; });
  vi.spyOn(console, "log").mockImplementation((value) => { output += `${String(value)}\n`; });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks(); process.exitCode = originalExitCode;
  await rm(directory, { recursive: true, force: true });
});

/** Loads progress slot main at tick 70, then saves its best score plus one and a settings record at tick 90. */
const SAVER = `(input) => {
  const state = input.state ?? { best: null };
  const commands = [];
  for (const result of input.loaded ?? []) {
    state.best = result.data === null ? -1 : result.data.best;
    commands.push({ kind: "emit", event: "loaded", payload: { best: state.best } });
  }
  if (input.tick === 70) { commands.push({ kind: "load", slot: "main" }); }
  if (input.tick === 90) {
    commands.push({ kind: "save", slot: "main", data: { best: state.best + 1 }, snapshot: true },
      { kind: "save", slot: "main", scope: "settings", data: { volume: 0.5 } });
  }
  return { state, commands };
}`;
const saver = { id: "saver", behaviors: [{ kind: "script", source: SAVER, maxCommands: 8, maxTickMs: 20 }] };

it.each([
  ["2D", () => {
    const base = createTopDownRoomGame("a".repeat(32));
    return { ...base, schemaVersion: 4, engineVersion: "3", scenes: base.scenes.map((scene, index) => index > 0 ? scene
      : { ...scene, entities: [...scene.entities, { ...saver, transform2d: { x: -5, y: 2 } }] }) };
  }],
  ["3D", () => {
    const base = createNative3DGame("b".repeat(32));
    // The sample's own scripts are left out, so only the saver uses the wall-clock script budget.
    const withoutScripts = <Entity extends { behaviors: readonly { kind: string }[] }>(entity: Entity) =>
      ({ ...entity, behaviors: entity.behaviors.filter((behavior) => behavior.kind !== "script") });
    return { ...base, scenes: base.scenes.map((scene, index) => index > 0 ? scene
      : { ...scene, entities: [...scene.entities.map(withoutScripts), { ...saver, transform3d: { position: { x: 4, y: 1, z: 0 } } }] }) };
  }]
])("seeds in-memory saves, delivers a script load and verifies the replay in %s", async (_dimension, create) => {
  const saves = join(directory, "saves.json");
  await writeFile(saves, JSON.stringify({ progress: { main: { best: 30 } } }));
  const report = await simulate(create(), "--saves", saves);
  expect(report).toMatchObject({ ok: true, replay: { verified: true },
    saves: { progress: { main: { best: 31 } }, settings: { main: { volume: 0.5 } }, errors: [] } });
  expect(report.events).toContainEqual(expect.objectContaining({ kind: "trigger", event: "loaded", payload: { best: 30 } }));
});

it("leaves the report without saves when no script saves", async () => {
  const report = await simulate(createTopDownRoomGame("c".repeat(32)));
  expect(report.ok).toBe(true);
  expect(report).not.toHaveProperty("saves");
});
