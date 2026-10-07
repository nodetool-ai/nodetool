import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { gameDocument3D } from "@nodetool-ai/protocol";
import { benchmarkGameBrowser } from "../scripts/benchmark-game.js";

const captured = vi.hoisted(() => ({ bytes: [] as number[][] }));
vi.mock("../src/node3d.js", () => ({
  captureGameFrame3D: async (_frame: unknown, options: { resolveAsset: (id: string) => Promise<{ bytes: Uint8Array } | null> }) => {
    const asset = await options.resolveAsset("triangle");
    if (asset) { captured.bytes.push(Array.from(asset.bytes)); }
    return { stats: {}, benchmark: {} };
  }
}));

let directory: string | undefined;
afterEach(async () => {
  vi.restoreAllMocks();
  captured.bytes.length = 0;
  if (directory) { await rm(directory, { recursive: true, force: true }); }
});

it.each(["../outside", "2".repeat(32)])("bounds browser benchmark asset reads for %s", async (assetId) => {
  directory = await mkdtemp(join(tmpdir(), "game-benchmark-assets-"));
  const assetsDir = join(directory, "assets");
  await mkdir(assetsDir);
  const outside = new Uint8Array([17, 23, 41]);
  const inside = new Uint8Array([53, 67, 79]);
  await writeFile(join(directory, "outside.glb"), outside);
  await writeFile(join(assetsDir, `${"2".repeat(32)}.glb`), inside);
  const document = gameDocument3D.parse(JSON.parse(await readFile(new URL("../../game-runtime/bench/bench-3d-1000.json", import.meta.url), "utf8")));
  document.scenes[0].entities = document.scenes[0].entities.slice(0, 1);
  document.assets.triangle.assetId = assetId;
  const path = join(directory, "game.json");
  await writeFile(path, JSON.stringify(document));
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  const outcome = await benchmarkGameBrowser(path, assetsDir, 1).catch((error: unknown) => error);
  if (assetId.startsWith("..")) {
    expect(captured.bytes).toEqual([]);
    expect(outcome).toBeInstanceOf(Error);
    expect((outcome as Error).message).toContain("full 32-character resource ID");
  } else {
    expect(outcome).toBeUndefined();
    expect(captured.bytes).toEqual([Array.from(inside)]);
  }
});
