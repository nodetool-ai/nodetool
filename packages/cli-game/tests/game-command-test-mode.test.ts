import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTopDownRoomGame } from "@nodetool-ai/game-runtime";
import { gameDocument } from "@nodetool-ai/protocol";
import { registerGameCommands } from "../src/commands/game.js";

let directory: string;
let gamePath: string;
let output: string;
let originalExitCode: typeof process.exitCode;

/** Counts ticks, logs a tagged line each tick, and promises the count stays under its `limit` param. */
const COUNTER = `(input) => {
  const count = (input.state ?? 0) + 1;
  return { state: count, commands: [
    { kind: "log", tag: "COUNT", message: "count " + count, data: { count, test: input.test === true } },
    { kind: "assert", ok: count < input.params.limit, message: "count stays under " + input.params.limit }
  ] };
}`;

async function writeGame(extraScenes: readonly unknown[] = []): Promise<void> {
  const base = createTopDownRoomGame("9".repeat(32));
  await writeFile(gamePath, JSON.stringify(gameDocument.parse({ ...base, schemaVersion: 4, engineVersion: "3", scenes: [
    ...base.scenes.map((scene) => ({ ...scene, entities: [...scene.entities, { id: "checker", transform2d: { x: -5, y: 2 },
      behaviors: [{ kind: "script", source: COUNTER, maxCommands: 4, maxTickMs: 20, params: { limit: { type: "number", default: 3, integer: true } } }] }] })),
    ...extraScenes
  ] })));
}

async function run(...args: string[]): Promise<void> {
  const program = new Command();
  registerGameCommands(program);
  await program.parseAsync(["node", "nodetool", "game", "simulate", gamePath, "--json", ...args]);
}

async function simulate(...args: string[]): Promise<Record<string, unknown>> {
  await run(...args);
  return JSON.parse(output.trim()) as Record<string, unknown>;
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "nodetool-game-test-mode-"));
  gamePath = join(directory, "game.json");
  await writeGame();
  output = "";
  originalExitCode = process.exitCode;
  process.exitCode = undefined;
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { output += String(chunk); return true; });
  vi.spyOn(console, "log").mockImplementation((message) => { output += `${String(message)}\n`; });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  process.exitCode = originalExitCode;
  await rm(directory, { recursive: true, force: true });
});

describe("game simulate test mode", () => {
  it("fails at a broken assert and reports the tagged log lines before it", async () => {
    const report = await simulate("--ticks", "10");
    expect(report).toMatchObject({ ok: false, assertions: { scripts: false } });
    expect(report.scriptFailure).toMatchObject({ tick: 3, message: expect.stringContaining("Assertion failed: count stays under 3") });
    expect(report.logs).toEqual([
      expect.objectContaining({ tick: 0, entityId: "checker", tag: "COUNT", data: { count: 1, test: true } }),
      expect.objectContaining({ tick: 1, tag: "COUNT", data: { count: 2, test: true } }),
      // The failing call's own line comes before its assert.
      expect.objectContaining({ tick: 2, tag: "COUNT", data: { count: 3, test: true } })
    ]);
    expect(process.exitCode).toBe(1);
  });

  it("overrides a script parameter for the run and reports every log line", async () => {
    const report = await simulate("--ticks", "5", "--param", "limit=10");
    expect(report.ok).toBe(true);
    expect((report.logs as unknown[]).length).toBe(5);
    output = "";
    expect(await simulate("--ticks", "5", "--param", "checker:limit=10")).toMatchObject({ ok: true });
  });

  it("rejects a parameter no script declares and a value of the wrong type", async () => {
    await run("--ticks", "5", "--param", "limt=10");
    expect(output).toMatch(/--param limt: no script declares this parameter/);
    output = "";
    await run("--ticks", "5", "--param", "player:limit=10");
    expect(output).toMatch(/no script on entity player declares this parameter/);
    output = "";
    await run("--ticks", "5", "--param", "limit=many");
    expect(output).toMatch(/limit/);
    expect(process.exitCode).toBe(1);
  });

  it("runs bot sweeps as test runs, so a broken assert fails the seed", async () => {
    const report = await simulate("--ticks", "10", "--bot", "idle", "--seeds", "2");
    expect(report.ok).toBe(false);
    expect((report.runs as { error?: { tick: number; message: string } }[]).map((run) => run.error?.message))
      .toEqual([expect.stringContaining("Assertion failed: count stays under 3"), expect.stringContaining("Assertion failed")]);
    output = "";
    expect(await simulate("--ticks", "10", "--bot", "idle", "--param", "limit=100")).toMatchObject({ ok: true });
  });

  it("starts in a named scene", async () => {
    await writeGame([{ id: "kit", name: "Sprite kit", entities: [{ id: "camera", transform2d: { x: 0, y: 0 }, camera2d: { width: 16, height: 9 } }] }]);
    const report = await simulate("--ticks", "3", "--scene", "kit");
    expect(report).toMatchObject({ ok: true, snapshot: expect.objectContaining({ sceneId: "kit" }), logs: [] });
    output = "";
    await run("--ticks", "3", "--scene", "nowhere");
    expect(output).toMatch(/nowhere.* is not a scene of this game. Scenes: room, kit/);
  });
});
