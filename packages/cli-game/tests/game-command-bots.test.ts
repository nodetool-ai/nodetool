import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createNative3DGame, createTopDownRoomGame } from "@nodetool-ai/game-runtime";
import { gameDocument } from "@nodetool-ai/protocol";
import { registerGameCommands } from "../src/commands/game.js";

let directory: string;
let gamePath: string;
let botPath: string;
let output: string;
let originalExitCode: typeof process.exitCode;

/** Walks toward the gem when its roll for that gem is under its skill. */
const POLICY = `({
  decide(view, bot) {
    const gem = view.sprites.find((sprite) => sprite.assetId === "gem");
    const player = view.sprites.find((sprite) => sprite.assetId === "player");
    if (!gem || !player) { return { ticks: 10 }; }
    const toward = gem.x > player.x ? "right" : "left";
    return { hold: [bot.rollFor(gem.entityId) < bot.skill ? toward : (toward === "right" ? "left" : "right")], ticks: 10 };
  }
})`;

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
  directory = await mkdtemp(join(tmpdir(), "nodetool-game-bots-"));
  gamePath = join(directory, "game.json");
  botPath = join(directory, "bot.js");
  await writeFile(gamePath, JSON.stringify(createTopDownRoomGame("c".repeat(32))));
  await writeFile(botPath, POLICY);
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

describe("game simulate bots and seed sweeps", () => {
  it("sweeps seeds with a skilled bot and reports each session length", async () => {
    const report = await simulate("--ticks", "600", "--bot", "1", "--bot-file", botPath, "--seeds", "3", "--expect-win", "--max-session-ticks", "300");
    expect(report).toMatchObject({ mode: "sweep", bot: "1", seeds: [1, 2, 3], ok: true });
    const runs = report.runs as { won: boolean; endTick: number }[];
    expect(runs).toHaveLength(3);
    expect(runs.every((run) => run.won && run.endTick > 0 && run.endTick <= 300)).toBe(true);
    expect(report.summary).toMatchObject({ runs: 3, wins: 3, ended: 3, errors: 0 });
    expect(process.exitCode).toBeUndefined();
  });

  it("fails a weak bot that scores above its cap, naming the seeds", async () => {
    const report = await simulate("--ticks", "300", "--bot", "1", "--bot-file", botPath, "--seeds", "2", "--expect-max-score", "0");
    expect(report.ok).toBe(false);
    expect(report.checks).toEqual(expect.arrayContaining([expect.objectContaining({ name: "maxScore", ok: false, failedSeeds: [1, 2] })]));
    expect(process.exitCode).toBe(1);
  });

  it("fails a session that never ends against the session length target", async () => {
    const report = await simulate("--ticks", "120", "--bot", "hold", "--max-session-ticks", "100", "--expect-no-win");
    expect(report.runs).toEqual([expect.objectContaining({ ended: false, endTick: null })]);
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "sessionLength", ok: false, failedSeeds: [1] }),
      expect.objectContaining({ name: "noWin", ok: true })
    ]));
    expect(process.exitCode).toBe(1);
  });

  it("reports a script error that only the mash bot reaches", async () => {
    const base = createTopDownRoomGame("c".repeat(32));
    const source = `(input) => { if (input.justPressed.includes("left")) { showHint(); } return { state: null, commands: [] }; }`;
    await writeFile(gamePath, JSON.stringify(gameDocument.parse({ ...base, schemaVersion: 4, engineVersion: "3", scenes: base.scenes.map((scene) => ({
      ...scene, entities: [...scene.entities, { id: "hints", transform2d: { x: -5, y: 2 }, behaviors: [{ kind: "script", source, maxCommands: 4, maxTickMs: 20 }] }]
    })) })));
    const idle = await simulate("--ticks", "60", "--bot", "idle");
    expect(idle.ok).toBe(true);
    output = "";
    const mash = await simulate("--ticks", "60", "--bot", "mash");
    expect(mash.ok).toBe(false);
    expect((mash.runs as { error?: { message: string } }[])[0].error?.message).toMatch(/showHint/);
  });

  it("sweeps seeds over a recorded route", async () => {
    const inputs = join(directory, "route.json");
    await writeFile(inputs, JSON.stringify(Array.from({ length: 60 }, () => ({ pressed: ["right"] }))));
    const report = await simulate("--ticks", "120", "--inputs", inputs, "--seeds", "2", "--expect-win");
    expect(report).toMatchObject({ bot: "inputs", ok: true, summary: expect.objectContaining({ wins: 2 }) });
  });

  it("rejects options that a sweep cannot apply and sweep options without a sweep", async () => {
    await run("--ticks", "10", "--bot", "idle", "--verify-replay");
    expect(output).toMatch(/--verify-replay cannot be combined with --bot or --seeds/);
    output = "";
    await run("--ticks", "10", "--max-session-ticks", "5");
    expect(output).toMatch(/--max-session-ticks needs --bot or --seeds/);
    output = "";
    await run("--ticks", "10", "--bot", "0.5");
    expect(output).toMatch(/needs a bot file/);
    output = "";
    await writeFile(gamePath, JSON.stringify(createNative3DGame("d".repeat(32))));
    await run("--ticks", "10", "--bot", "idle");
    expect(output).toMatch(/2D games only/);
    expect(process.exitCode).toBe(1);
  });
});
