import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
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
  directory = await mkdtemp(join(tmpdir(), "nodetool-cli-game-hud-"));
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

// No scripts, so the wall-clock script budget cannot fail the run on a busy host. The bar reads entity health.
const document = {
  schemaVersion: 2, engineVersion: "1", id: "hud", revision: "r1", entrySceneId: "main", pixelsPerUnit: 32, tickRate: 60,
  inputActions: ["pause"], assets: {},
  ui: { nodes: [
    { kind: "bar", id: "health", offset: { x: 16, y: 16 }, width: 160, height: 12, source: { kind: "health", entityId: "player" } },
    { kind: "panel", id: "scorePanel", anchor: { x: 1, y: 0 }, offset: { x: -16, y: 16 }, width: 120, height: 32 },
    { kind: "text", id: "score", parent: "scorePanel", anchor: { x: 0.5, y: 0.5 }, text: "Score 0" },
    { kind: "button", id: "pause", anchor: { x: 0.5, y: 1 }, offset: { x: 0, y: -16 }, width: 96, height: 36, action: "pause", text: "Pause" }
  ] },
  scenes: [{ id: "main", name: "Main", entities: [
    { id: "camera", transform2d: { x: 0, y: 0 }, camera2d: { width: 16, height: 9 } },
    { id: "player", transform2d: { x: 0, y: 0 }, behaviors: [{ kind: "health", maximum: 3 }] }
  ] }]
};

it("validates, replays and captures a 2D game with a HUD widget tree", async () => {
  await writeFile(gamePath, JSON.stringify(document));
  expect(await run("validate")).toMatchObject({ valid: true, document: { ui: { nodes: [{ id: "health" }, { id: "scorePanel" }, { id: "score" }, { id: "pause" }] } } });
  const inputs = join(directory, "inputs.json");
  await writeFile(inputs, JSON.stringify(Array.from({ length: 10 }, (_, tick) => ({ pressed: tick === 3 ? ["pause"] : [], justPressed: tick === 3 ? ["pause"] : [] }))));
  expect(await run("simulate", "--ticks", "10", "--inputs", inputs, "--verify-replay")).toMatchObject({ ok: true, replay: { verified: true } });
  const png = join(directory, "hud.png");
  expect(await run("capture", "--ticks", "1", "--out", png)).toMatchObject({ tick: 1 });
  expect((await readFile(png)).subarray(1, 4).toString()).toBe("PNG");
});

it("rejects a HUD button that presses an undeclared action", async () => {
  await writeFile(gamePath, JSON.stringify({ ...document, inputActions: [] }));
  const report = await run("validate");
  expect(report).toMatchObject({ valid: false });
  expect(JSON.stringify(report)).toContain("HUD button pause presses undeclared input action pause");
  expect(process.exitCode).toBe(1);
});
