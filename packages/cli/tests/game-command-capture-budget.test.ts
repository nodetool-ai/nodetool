import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gameDocument3D } from "@nodetool-ai/protocol";
import { createNative3DGame } from "@nodetool-ai/game-runtime";
import { registerGameCommands } from "../src/commands/game.js";

const captureGameFrame3D = vi.hoisted(() => vi.fn());
vi.mock("@nodetool-ai/game-renderer/node3d", () => ({ captureGameFrame3D }));

let directory: string;
let stdout: string;
let stderr: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "nodetool-game-capture-budget-"));
  stdout = "";
  stderr = "";
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { stdout += String(chunk); return true; });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => { stderr += String(chunk); return true; });
  captureGameFrame3D.mockImplementation(async (frame: { entities: readonly { cullDistance?: number }[] }) => ({
    png: new Uint8Array([1, 2, 3]),
    capabilities: {},
    projectedBounds: [],
    stats: { backend: "webgl2", drawCalls: 420, triangles: 900, culledEntities: frame.entities.filter((entity) => entity.cullDistance !== undefined).length }
  }));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(directory, { recursive: true, force: true });
});

async function capture(document: unknown, json: boolean): Promise<void> {
  const gamePath = join(directory, "game.json");
  await writeFile(gamePath, JSON.stringify(document));
  const program = new Command();
  registerGameCommands(program);
  await program.parseAsync(["node", "nodetool", "game", "capture", gamePath, "--ticks", "1", "--out", join(directory, "frame.png"), ...(json ? ["--json"] : [])]);
}

describe("3D capture frame budgets", () => {
  it("reports the document budgets, the overruns and the resolved cull distances", async () => {
    const base = createNative3DGame("capture-budget");
    const document = gameDocument3D.parse({ ...base, performance: { cullLayers: { props: { maxDistance: 30 } }, budgets: { drawCalls: 400 } },
      scenes: base.scenes.map((scene) => ({ ...scene, entities: scene.entities.map((entity) => entity.id === "crate" ? { ...entity, renderCulling: { layer: "props" } } : entity) })) });
    await capture(document, true);
    const frame = captureGameFrame3D.mock.calls[0]?.[0] as { entities: { entityId: string; cullDistance?: number }[] };
    expect(frame.entities.find((entity) => entity.entityId === "crate")?.cullDistance).toBe(30);
    const report = JSON.parse(stdout.trim()) as Record<string, unknown>;
    expect(report.budget).toEqual({
      limits: { drawCalls: 400, triangles: 1_000_000, particles: 4096, voices: 24 },
      overruns: [{ metric: "drawCalls", value: 420, budget: 400 }]
    });
    expect(report.stats).toMatchObject({ culledEntities: 1 });
  });

  it("prints overruns to stderr in text mode and stays quiet within budget", async () => {
    const base = createNative3DGame("capture-budget-text");
    await capture({ ...base, performance: { budgets: { drawCalls: 400 } } }, false);
    expect(stderr).toBe("Frame budget exceeded: 420 draw calls (budget 400)\n");
    stderr = "";
    await capture(base, false);
    expect(stderr).toBe("");
  });
});
