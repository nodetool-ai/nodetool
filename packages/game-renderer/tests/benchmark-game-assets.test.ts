import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { gameDocument3D, gameEntity3D, type GameRenderFrame3D } from "@nodetool-ai/protocol";
import { afterEach, expect, it, vi } from "vitest";
import { benchmarkGameBrowser } from "../scripts/benchmark-game.js";
import { prepareGameImage3D } from "../src/renderer3d/assets/image-preparation.js";

const captured = vi.hoisted(() => ({
  requested: [] as string[],
  assets: [] as { id: string; bytes: number[]; digest?: string }[],
  frame: undefined as GameRenderFrame3D | undefined,
  frames: undefined as number | undefined
}));

vi.mock("../src/node3d.js", () => ({
  captureGameFrame3D: async (frame: GameRenderFrame3D, options: {
    benchmarkFrames?: number;
    resolveAsset: (id: string, signal: AbortSignal) => Promise<{ bytes: Uint8Array; digest?: string } | null>;
  }) => {
    captured.frame = frame;
    captured.frames = options.benchmarkFrames;
    for (const id of captured.requested) {
      const asset = await options.resolveAsset(id, new AbortController().signal);
      if (!asset) { throw new Error(`Missing capture asset ${id}`); }
      captured.assets.push({ id, bytes: Array.from(asset.bytes), digest: asset.digest });
    }
    return { stats: {}, benchmark: {} };
  }
}));

const directories: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  captured.requested = [];
  captured.assets = [];
  captured.frame = undefined;
  captured.frames = undefined;
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function fixture(feature: "decal" | "font" | "collider") {
  const directory = await mkdtemp(join(tmpdir(), "game-benchmark-feature-"));
  directories.push(directory);
  const assetsDir = join(directory, "assets");
  await mkdir(assetsDir);
  const document = gameDocument3D.parse({
    schemaVersion: 3, engineVersion: "2", dimension: "3d", id: "benchmark-feature", revision: "r1", entrySceneId: "main",
    tickRate: 60, presentation: { aspectRatio: 16 / 9, hudWidth: 512, hudHeight: 288 }, inputActions: [],
    assets: {}, scenes: [{ id: "main", name: "Main", activeCameraId: "camera", entities: [
      { id: "camera", transform3d: { position: { x: 0, y: 2, z: 6 } }, camera3d: { projection: { kind: "perspective" } } },
      { id: "receiver", transform3d: {}, primitive: { kind: "box", dimensions: { x: 1, y: 1, z: 1 }, material: {} } }
    ] }]
  });
  let bytes: Uint8Array;
  const assetId = "a".repeat(32);
  let extension: string;
  if (feature === "decal") {
    bytes = new Uint8Array(createCanvas(2, 3).toBuffer("image/png"));
    const prepared = await prepareGameImage3D(bytes, { assetId });
    if (!prepared.ok) { throw new Error("Fixture image preparation failed"); }
    document.assets.paint = prepared.image.binding;
    document.scenes[0].entities.push(gameEntity3D.parse({ id: "projector", transform3d: {},
      decal3d: { assetId: "paint", receiverId: "receiver", size: { x: 1, y: 1, z: 1 } } }));
    extension = "png";
    captured.requested = ["paint"];
  } else if (feature === "font") {
    bytes = new Uint8Array(await readFile(new URL("../../timeline/fonts/BebasNeue-Regular.ttf", import.meta.url)));
    document.assets.display = { mediaKind: "font", assetId, digest: createHash("sha256").update(bytes).digest("hex"), required: true, fontFormat: "ttf" };
    document.ui = { nodes: [{ kind: "text", id: "title", text: "Benchmark", size: 14, fontId: "display" }] };
    extension = "ttf";
    captured.requested = ["display"];
  } else {
    bytes = new TextEncoder().encode(JSON.stringify({ vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], indices: [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3] }));
    document.assets.terrain = { mediaKind: "collider", assetId, digest: createHash("sha256").update(bytes).digest("hex"), required: true,
      preparationVersion: "1", shape: "triangleMesh", bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } }, vertices: 4, triangles: 4 };
    const receiver = document.scenes[0].entities[1];
    document.scenes[0].entities[1] = gameEntity3D.parse({ ...receiver, body3d: { type: "static" },
      collider3d: { kind: "triangleMesh", assetId: "terrain" } });
    extension = "json";
  }
  const assetPath = join(assetsDir, `${assetId}.${extension}`);
  await writeFile(assetPath, bytes);
  const path = join(directory, "game.json");
  await writeFile(path, JSON.stringify(document));
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  return { path, assetsDir, assetPath, bytes, document };
}

it.each(["decal", "font", "collider"] as const)("benchmarks an authored %s feature with resolved local assets", async (feature) => {
  const { path, assetsDir, bytes, document } = await fixture(feature);
  await benchmarkGameBrowser(path, assetsDir);
  expect(captured.frames).toBe(600);
  expect(captured.frame?.tick).toBe(0);
  const line = vi.mocked(process.stdout.write).mock.calls[0]?.[0];
  if (typeof line !== "string") { throw new Error("Benchmark emitted no JSON report"); }
  expect(JSON.parse(line)).toMatchObject({ scenario: "static", tick: 0 });
  if (feature === "collider") {
    expect(captured.frame?.entities.find((entity) => entity.entityId === "receiver")?.primitive?.kind).toBe("box");
  } else {
    const slot = feature === "decal" ? "paint" : "display";
    expect(captured.assets).toEqual([{ id: slot, bytes: Array.from(bytes), digest: document.assets[slot].digest }]);
    if (feature === "decal") { expect(captured.frame?.entities.some((entity) => entity.decal3d?.assetId === "paint")).toBe(true); }
    else { expect(captured.frame?.ui?.nodes).toContainEqual(expect.objectContaining({ kind: "text", fontId: "display" })); }
  }
});

it("rejects a changed prepared collider before starting capture", async () => {
  const { path, assetsDir, assetPath } = await fixture("collider");
  await writeFile(assetPath, "{}");
  await expect(benchmarkGameBrowser(path, assetsDir)).rejects.toThrow("Prepared collider digest mismatch");
  expect(captured.frame).toBeUndefined();
});

it.each(["decal", "font"] as const)("rejects missing %s bytes through the capture contract", async (feature) => {
  const { path, assetsDir, assetPath } = await fixture(feature);
  await rm(assetPath);
  await expect(benchmarkGameBrowser(path, assetsDir)).rejects.toThrow("Missing capture asset");
  expect(captured.assets).toEqual([]);
});

it("rejects image IDs that would read outside the asset directory", async () => {
  const { path, assetsDir, document, bytes } = await fixture("decal");
  document.assets.paint.assetId = "../outside";
  await writeFile(join(dirname(assetsDir), "outside.png"), bytes);
  await writeFile(path, JSON.stringify(document));
  await expect(benchmarkGameBrowser(path, assetsDir)).rejects.toThrow("full 32-character resource ID");
  expect(captured.assets).toEqual([]);
});
