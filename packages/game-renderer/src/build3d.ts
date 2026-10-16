import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, rmdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { resolvePackageAssetPath } from "@nodetool-ai/config";
import { gameDocument3D, type GameDocument3D } from "@nodetool-ai/protocol";
import { validateGame3D, decodePreparedGameCollider3D } from "@nodetool-ai/game-runtime";
import { prepareGameImage3D } from "./renderer3d/assets/image-preparation.js";
import { prepareGameModel } from "./renderer3d/preparation.js";
import type { StandaloneAsset, StandaloneGameBuild } from "./build.js";
import { validateExportImage, validateExportAudio, validateExportFont } from "./export-media.js";
import { TOUCH_CONTROLS_CSS } from "./touch-controls.js";

export interface BuildStandaloneGame3DOptions {
  readonly document: GameDocument3D;
  readonly outputDir: string;
  readonly resolveAsset: (sourceAssetId: string, signal?: AbortSignal) => Promise<StandaloneAsset | null>;
  readonly signal?: AbortSignal;
}
const PLAYER_FILE = "game3d-player.js";
const HTML = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; connect-src \'self\' blob:; script-src \'self\' \'wasm-unsafe-eval\'; img-src \'self\' blob:; media-src \'self\' blob:; font-src \'self\'; style-src \'self\'"><title>NodeTool 3D Game</title><link rel="stylesheet" href="./style.css"></head><body><main><canvas id="game" aria-label="3D game viewport"></canvas><nav aria-label="Game controls"><button id="pause" type="button">Pause</button><button id="reset" type="button">Reset</button></nav><p id="status" role="status" aria-live="polite">Loading game</p></main><script type="module" src="./game3d-player.js"></script></body></html>';
const CSS = 'html,body{margin:0;background:#202838;color:#fff;font:16px system-ui,sans-serif}main{max-width:1280px;margin:auto}canvas{display:block;width:100%;height:auto;touch-action:none}nav{display:flex;gap:8px;padding:8px;position:relative;z-index:3}button{font:inherit}#status{padding:8px}' +
  // The export CSP allows only same-origin styles, so the touch controls are styled here rather than by the player.
  TOUCH_CONTROLS_CSS;

async function playerBundle(): Promise<Uint8Array> {
  const source = fileURLToPath(new URL("./standalone-player3d.ts", import.meta.url));
  const compiled = fileURLToPath(new URL("./standalone-player3d.js", import.meta.url));
  if (!existsSync(source) && !existsSync(compiled)) {
    return readFile(resolvePackageAssetPath({ pkg: "@nodetool-ai/game-renderer", path: PLAYER_FILE }, import.meta.url));
  }
  const result = await build({ entryPoints: [existsSync(source) ? source : compiled], bundle: true, format: "esm", platform: "browser",
    target: "es2022", minify: true, write: false, conditions: ["nodetool-dev"], logLevel: "silent" });
  const player = result.outputFiles?.[0];
  if (!player) { throw new Error("3D player bundle is empty"); }
  return player.contents;
}

/** Atomically exports verified asset content and all runtime code for static HTTP serving. */
export async function buildStandaloneGame3D(options: BuildStandaloneGame3DOptions): Promise<StandaloneGameBuild> {
  options.signal?.throwIfAborted();
  const document = gameDocument3D.parse(options.document);
  const validation = validateGame3D(document);
  if (!validation.valid) { throw new Error(`Invalid 3D game: ${validation.errors.join("; ")}`); }
  const outputDir = resolve(options.outputDir);
  await mkdir(dirname(outputDir), { recursive: true });
  const staging = await mkdtemp(join(dirname(outputDir), ".nodetool-game3d-build-"));
  try {
    const player = await playerBundle();
    const quickJs = await readFile(fileURLToPath(import.meta.resolve("@jitl/quickjs-ng-wasmfile-release-sync/wasm")));
    const assetPaths: Record<string, string> = {};
    const hashes: Record<string, string> = {};
    await mkdir(join(staging, "assets"));
    const stage = async (path: string, bytes: Uint8Array | string): Promise<void> => {
      options.signal?.throwIfAborted();
      hashes[path] = createHash("sha256").update(bytes).digest("hex");
      await writeFile(join(staging, path), bytes);
    };
    for (const [logicalId, binding] of Object.entries(document.assets)) {
      options.signal?.throwIfAborted();
      const asset = await options.resolveAsset(binding.assetId, options.signal);
      if (!asset) { throw new Error(`Missing export asset ${logicalId}`); }
      const digest = createHash("sha256").update(asset.bytes).digest("hex");
      if (digest !== binding.digest) { throw new Error(`Export asset digest changed for ${logicalId}`); }
      let extension: string;
      if (binding.mediaKind === "model") {
        const prepared = await prepareGameModel(asset.bytes, { expectedDigest: binding.digest, signal: options.signal });
        if (!prepared.ok) { throw new Error(`Export model ${logicalId} failed preparation: ${prepared.diagnostics.map((entry) => entry.message).join("; ")}`); }
        if (JSON.stringify(prepared.model.nodeIds) !== JSON.stringify(binding.nodeIds) || JSON.stringify(prepared.model.clipIds) !== JSON.stringify(binding.clipIds)) { throw new Error(`Prepared selectors changed for model ${logicalId}`); }
        if (binding.clipDurations && (Object.keys(binding.clipDurations).length !== prepared.model.clipIds.length || prepared.model.clipIds.some(id => binding.clipDurations?.[id] !== prepared.model.clipDurations[id]))) { throw new Error(`Prepared clip durations changed for model ${logicalId}; reprepare the model`); }
        extension = "glb";
      } else if (binding.mediaKind === "image") {
        const prepared = await prepareGameImage3D(asset.bytes, { assetId: binding.assetId, expectedDigest: binding.digest, signal: options.signal });
        if (!prepared.ok) { throw new Error(`Export image ${logicalId} failed preparation: ${prepared.diagnostics.map((entry) => entry.message).join("; ")}`); }
        const actual = prepared.image.binding;
        if (actual.width !== binding.width || actual.height !== binding.height || actual.format !== binding.format || actual.byteLength !== binding.byteLength) { throw new Error(`Export image metadata changed for ${logicalId}`); }
        await validateExportImage(prepared.image.bytes, binding.format, options.signal);
        extension = binding.format;
      } else if (binding.mediaKind === "collider") {
        await decodePreparedGameCollider3D(asset.bytes, binding);
        extension = "json";
      } else if (binding.mediaKind === "font") {
        const view = new DataView(asset.bytes.buffer, asset.bytes.byteOffset, asset.bytes.byteLength);
        if (asset.bytes.length < 4 || (binding.fontFormat === "ttf" ? view.getUint32(0) !== 0x00010000 : view.getUint32(0) !== 0x4f54544f)) { throw new Error(`Invalid export font ${logicalId}`); }
        validateExportFont(asset.bytes, logicalId, options.signal);
        extension = binding.fontFormat;
      } else {
        const audioFormat = asset.mimeType === "audio/wav" ? "wav" : asset.mimeType === "audio/ogg" ? "ogg" : asset.mimeType === "audio/mpeg" ? "mp3" : "";
        if (!audioFormat) { throw new Error(`Unsupported export audio ${logicalId}`); }
        await validateExportAudio(asset.bytes, audioFormat, options.signal);
        extension = audioFormat;
      }
      const path = `assets/${digest}.${extension}`;
      await stage(path, asset.bytes);
      assetPaths[logicalId] = `./${path}`;
    }
    await stage("index.html", HTML);
    await stage("style.css", CSS);
    await stage("game.json", JSON.stringify(document));
    await stage(PLAYER_FILE, player);
    await stage("emscripten-module.wasm", quickJs);
    await writeFile(join(staging, "manifest.json"), JSON.stringify({ schemaVersion: 1, dimension: "3d", sourceRevision: document.revision,
      engineVersion: document.engineVersion, runtimes: { three: "0.185.1", rapier: "0.19.3", quickjs: "0.31.0" }, assets: assetPaths, files: hashes }, null, 2));
    options.signal?.throwIfAborted();
    let existing: string[] | undefined;
    try { existing = await readdir(outputDir); }
    catch (error) { if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") { throw error; } }
    if (existing && existing.length > 0) { throw new Error(`Output directory is not empty: ${outputDir}`); }
    if (existing) { await rmdir(outputDir); }
    await rename(staging, outputDir);
    return { outputDir, gamePath: join(outputDir, "game.json"), playerPath: join(outputDir, PLAYER_FILE), assetPaths };
  } catch (error) { await rm(staging, { recursive: true, force: true }); throw error; }
}
