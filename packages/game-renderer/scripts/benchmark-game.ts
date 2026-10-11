import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cpus, arch, platform } from "node:os";
import { createGameSession3D, validateAnyGame } from "@nodetool-ai/game-runtime";
import type { GamePostProcessing3D } from "@nodetool-ai/protocol";
import { captureGameFrame3D } from "../src/node3d.js";

/** Post-processing settings the browser benchmark measures one at a time, after a baseline without post-processing. */
export const GAME_POST_PROCESSING_BENCHMARK_VARIANTS_3D: readonly { readonly name: string; readonly postProcessing?: GamePostProcessing3D }[] = [
  { name: "none" },
  { name: "exposure", postProcessing: { enabled: true, exposure: 1.5, toneMapping: "aces", antialias: "msaa" } },
  { name: "agx", postProcessing: { enabled: true, exposure: 1, toneMapping: "agx", antialias: "msaa" } },
  { name: "neutral", postProcessing: { enabled: true, exposure: 1, toneMapping: "neutral", antialias: "msaa" } },
  { name: "linear", postProcessing: { enabled: true, exposure: 1, toneMapping: "linear", antialias: "msaa" } },
  { name: "bloom", postProcessing: { enabled: true, exposure: 1, toneMapping: "aces", antialias: "msaa", bloom: { threshold: 0.85, softness: 0.1, radius: 0.4, intensity: 1 } } },
  { name: "vignette", postProcessing: { enabled: true, exposure: 1, toneMapping: "aces", antialias: "msaa", vignette: { intensity: 0.4, radius: 0.5, softness: 0.5 } } },
  { name: "fxaa", postProcessing: { enabled: true, exposure: 1, toneMapping: "aces", antialias: "fxaa" } },
  { name: "smaa", postProcessing: { enabled: true, exposure: 1, toneMapping: "aces", antialias: "smaa" } },
  { name: "stack", postProcessing: { enabled: true, exposure: 1, toneMapping: "agx", antialias: "smaa",
    bloom: { threshold: 0.85, softness: 0.1, radius: 0.4, intensity: 1 }, vignette: { intensity: 0.4, radius: 0.5, softness: 0.5 } } }
];

/**
 * Renders `frames` frames of the document's first tick in Chromium and prints one JSON line. With
 * `postEffects`, it prints one line per entry of GAME_POST_PROCESSING_BENCHMARK_VARIANTS_3D instead, each
 * with the scene's post-processing replaced, so the frame-time difference from "none" is that effect's cost.
 */
export async function benchmarkGameBrowser(path: string, assetsDir: string, frames = 600, postEffects = false): Promise<void> {
  const validation = validateAnyGame(JSON.parse(await readFile(resolve(path), "utf8")));
  if (!validation.valid) { throw new Error(validation.diagnostics.map((issue) => issue.message).join(", ")); }
  if (validation.document.schemaVersion !== 3) { throw new Error("Browser game benchmarks currently use the 3D capture path. Use benchmark:effects for the 2D WebGPU renderer"); }
  const document = validation.document;
  const session = await createGameSession3D(document, 1);
  try {
    const base = session.frame();
    const { postProcessing: _documentPostProcessing, ...environment } = base.environment;
    const variants = postEffects ? GAME_POST_PROCESSING_BENCHMARK_VARIANTS_3D : [{ name: "document" }];
    for (const variant of variants) {
      const frame = postEffects
        ? { ...base, environment: { ...environment, ...(variant.postProcessing ? { postProcessing: variant.postProcessing } : {}) } }
        : base;
      const captured = await captureGameFrame3D(frame, { benchmarkFrames: frames, timeoutMs: 120_000,
        executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH,
        resolveAsset: async (logicalId) => {
          const binding = document.assets[logicalId];
          if (!binding || binding.mediaKind !== "model") { return null; }
          if (!/^[a-f0-9]{32}$/.test(binding.assetId)) {
            throw new Error(`Asset ID must be a full 32-character resource ID: ${binding.assetId}`);
          }
          return { bytes: new Uint8Array(await readFile(resolve(assetsDir, `${binding.assetId}.glb`))), digest: binding.digest };
        } });
      process.stdout.write(JSON.stringify({ documentId: document.id, ...(postEffects ? { postProcessing: variant.name } : {}), backend: "webgl2",
        viewport: document.presentation, benchmark: captured.benchmark, stats: captured.stats,
        machine: { platform: platform(), architecture: arch(), cpu: cpus()[0]?.model ?? "unknown", node: process.version } }) + "\n");
    }
  } finally { session.dispose(); }
}
