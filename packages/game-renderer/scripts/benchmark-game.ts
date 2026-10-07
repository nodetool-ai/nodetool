import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cpus, arch, platform } from "node:os";
import { createGameSession3D, validateAnyGame } from "@nodetool-ai/game-runtime";
import { captureGameFrame3D } from "../src/node3d.js";

export async function benchmarkGameBrowser(path: string, assetsDir: string, frames = 600): Promise<void> {
  const validation = validateAnyGame(JSON.parse(await readFile(resolve(path), "utf8")));
  if (!validation.valid) { throw new Error(validation.diagnostics.map((issue) => issue.message).join(", ")); }
  if (validation.document.schemaVersion !== 3) { throw new Error("Browser game benchmarks currently use the 3D capture path. Use benchmark:effects for the 2D WebGPU renderer"); }
  const document = validation.document;
  const session = await createGameSession3D(document, 1);
  try {
    const captured = await captureGameFrame3D(session.frame(), { benchmarkFrames: frames, timeoutMs: 120_000,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH,
      resolveAsset: async (logicalId) => {
        const binding = document.assets[logicalId];
        if (!binding || binding.mediaKind !== "model") { return null; }
        if (!/^[a-f0-9]{32}$/.test(binding.assetId)) {
          throw new Error(`Asset ID must be a full 32-character resource ID: ${binding.assetId}`);
        }
        return { bytes: new Uint8Array(await readFile(resolve(assetsDir, `${binding.assetId}.glb`))), digest: binding.digest };
      } });
    process.stdout.write(JSON.stringify({ documentId: document.id, backend: "webgl2", viewport: document.presentation, benchmark: captured.benchmark, stats: captured.stats,
      machine: { platform: platform(), architecture: arch(), cpu: cpus()[0]?.model ?? "unknown", node: process.version } }) + "\n");
  } finally { session.dispose(); }
}
