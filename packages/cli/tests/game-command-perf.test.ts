import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createNative3DGame, createTopDownRoomGame } from "@nodetool-ai/game-runtime";
import { registerGameCommands } from "../src/commands/game.js";

const measureStandaloneGame3D = vi.hoisted(() => vi.fn());
const buildStandaloneGame3D = vi.hoisted(() => vi.fn());
vi.mock("@nodetool-ai/game-renderer/perf", () => ({
  measureStandaloneGame3D,
  formatGamePerfOverrun: (overrun: { metric: string }) => `over ${overrun.metric}`
}));
vi.mock("@nodetool-ai/game-renderer/build3d", () => ({ buildStandaloneGame3D }));

let directory: string;
let stdout: string;
let stderr: string;
let originalExitCode: typeof process.exitCode;

const percentiles = { p50: 1, p95: 2, p99: 3, max: 4 };
function report(overrides: Record<string, unknown> = {}) {
  return { ok: true, gpu: { renderer: "Test GPU", adapterType: "hardware" }, canvas: { width: 1280, height: 720 }, vsync: false, routeTicks: 2,
    seconds: 1, renderedFrames: 100, fps: 100, frameMs: percentiles, drawCalls: percentiles, triangles: percentiles,
    programs: { start: 10, end: 10, growth: 0 }, ticks: { start: 2, end: 62 }, budget: { limits: {}, overruns: [] }, status: "Ready", warnings: [], errors: [], ...overrides };
}

async function perf(document: unknown, ...args: string[]): Promise<void> {
  const gamePath = join(directory, "game.json");
  await writeFile(gamePath, JSON.stringify(document));
  const program = new Command();
  registerGameCommands(program);
  await program.parseAsync(["node", "nodetool", "game", "perf", gamePath, "--seconds", "1", ...args]);
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "nodetool-game-perf-"));
  stdout = "";
  stderr = "";
  originalExitCode = process.exitCode;
  process.exitCode = undefined;
  buildStandaloneGame3D.mockResolvedValue({});
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { stdout += String(chunk); return true; });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => { stderr += String(chunk); return true; });
  vi.spyOn(console, "log").mockImplementation((value) => { stdout += `${String(value)}\n`; });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  measureStandaloneGame3D.mockReset();
  buildStandaloneGame3D.mockReset();
  process.exitCode = originalExitCode;
  await rm(directory, { recursive: true, force: true });
});

describe("game perf", () => {
  it("exports the game, replays the route and prints the JSON report", async () => {
    measureStandaloneGame3D.mockResolvedValue(report());
    const routePath = join(directory, "route.json");
    await writeFile(routePath, JSON.stringify([{ pressed: [], justPressed: [], axes: { throttle: 1 } }, { pressed: ["gear"], justPressed: ["gear"] }]));
    await perf(createNative3DGame("f".repeat(32)), "--inputs", routePath, "--json", "--software");
    expect(buildStandaloneGame3D).toHaveBeenCalledWith(expect.objectContaining({ document: expect.objectContaining({ id: "f".repeat(32) }) }));
    const [, options] = measureStandaloneGame3D.mock.calls[0] as [string, { inputs: unknown[]; seconds: number; software: boolean }];
    expect(options).toMatchObject({ seconds: 1, software: true });
    expect(options.inputs).toEqual([{ pressed: [], justPressed: [], axes: { throttle: 1 }, look: { x: 0, y: 0 } }, { pressed: ["gear"], justPressed: ["gear"], axes: {}, look: { x: 0, y: 0 } }]);
    expect(JSON.parse(stdout.trim())).toMatchObject({ ok: true, fps: 100 });
    expect(process.exitCode).toBeUndefined();
  });

  it("exits 1 on an overrun only with --fail-on-budget", async () => {
    const overruns = [{ metric: "frameMs", value: 40, budget: 16.6 }, { metric: "programGrowth", value: 12, budget: 0 }];
    measureStandaloneGame3D.mockResolvedValue(report({ budget: { limits: {}, overruns } }));
    await perf(createNative3DGame("f".repeat(32)));
    expect(process.exitCode).toBeUndefined();
    expect(stderr).toBe("over frameMs\nover programGrowth\n");
    await perf(createNative3DGame("f".repeat(32)), "--fail-on-budget");
    expect(process.exitCode).toBe(1);
  });

  it("exits 1 when the player reports errors", async () => {
    measureStandaloneGame3D.mockResolvedValue(report({ ok: false, errors: ["broken renderer"] }));
    await perf(createNative3DGame("f".repeat(32)));
    expect(stdout).toContain("broken renderer");
    expect(process.exitCode).toBe(1);
  });

  it("refuses a 2D game", async () => {
    await perf(createTopDownRoomGame("g".repeat(32)), "--json");
    expect(JSON.parse(stdout.trim())).toMatchObject({ error: expect.stringContaining("3D") });
    expect(measureStandaloneGame3D).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
