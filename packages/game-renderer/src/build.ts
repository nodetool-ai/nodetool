import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, rmdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { validateGame } from "@nodetool-ai/game-runtime";
import type { GameDocument } from "@nodetool-ai/protocol";

const PLAYER_VERSION = 1;
const PLAYER_FILE = `player-v${PLAYER_VERSION}.js`;

export interface StandaloneAsset {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
}

export interface BuildStandaloneGameOptions {
  readonly document: GameDocument;
  readonly outputDir: string;
  readonly resolveAsset: (sourceAssetId: string) => Promise<StandaloneAsset | null>;
}

export interface StandaloneGameBuild {
  readonly outputDir: string;
  readonly gamePath: string;
  readonly playerPath: string;
  readonly assetPaths: Readonly<Record<string, string>>;
}

function mediaExtension(bytes: Uint8Array, mimeType: string): string {
  const mime = mimeType.split(";", 1)[0]?.trim().toLowerCase();
  if (mime === "image/png" && bytes.length >= 8 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) {
    return "png";
  }
  if (mime === "image/jpeg" && bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
    return "jpg";
  }
  if (mime === "image/webp" && bytes.length >= 12 && Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" && Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP") {
    return "webp";
  }
  if (mime === "audio/wav" && bytes.length >= 12 && Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" && Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WAVE") {
    return "wav";
  }
  if (mime === "audio/ogg" && bytes.length >= 4 && Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "OggS") {
    return "ogg";
  }
  if (mime === "audio/mpeg" && bytes.length >= 3 && (Buffer.from(bytes.subarray(0, 3)).toString("ascii") === "ID3" || (bytes[0] === 255 && (bytes[1] ?? 0) >= 224))) {
    return "mp3";
  }
  throw new Error(`Asset bytes do not match a supported media type: ${mimeType}`);
}

function html(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' blob:; media-src 'self' blob:; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'">
  <title>NodeTool Game</title>
  <link rel="stylesheet" href="./style.css">
</head>
<body>
  <main>
    <canvas id="game" aria-label="Game viewport"></canvas>
    <div class="controls">
      <button id="pause" type="button">Pause</button>
      <button id="step" type="button">Step</button>
      <button id="reset" type="button">Reset</button>
      <button id="save" type="button">Save</button>
      <button id="load" type="button">Load</button>
    </div>
    <p id="status" role="status" aria-live="polite"></p>
  </main>
  <script type="module" src="./${PLAYER_FILE}"></script>
</body>
</html>
`;
}

const CSS = `:root{color-scheme:dark;font-family:system-ui,sans-serif}body{margin:0;background:#111;color:#fff}main{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem}canvas{max-width:100vw;max-height:75vh;image-rendering:pixelated;background:#202631}.controls{display:flex;gap:.5rem}button{font:inherit;padding:.4rem .8rem}#status{min-height:1.5em;margin:0}`;

/** Builds a self-contained web player with local content-addressed media. */
export async function buildStandaloneGame(options: BuildStandaloneGameOptions): Promise<StandaloneGameBuild> {
  const validation = validateGame(options.document);
  if (!validation.valid || !validation.document) {
    throw new Error(`Invalid game document: ${validation.errors.join("; ")}`);
  }
  const document = validation.document;
  const outputDir = resolve(options.outputDir);
  await mkdir(dirname(outputDir), { recursive: true });
  const staging = await mkdtemp(join(dirname(outputDir), ".nodetool-game-build-"));
  try {
    const sourceEntry = fileURLToPath(new URL("./standalone-player.ts", import.meta.url));
    const entry = existsSync(sourceEntry) ? sourceEntry : fileURLToPath(new URL("./standalone-player.js", import.meta.url));
    const bundled = await build({
      entryPoints: [entry],
      outfile: PLAYER_FILE,
      bundle: true,
      platform: "browser",
      format: "esm",
      target: "es2022",
      minify: true,
      write: false,
      conditions: ["nodetool-dev"],
      logLevel: "silent",
    });
    const player = bundled.outputFiles?.[0];
    if (!player) {
      throw new Error("Standalone player bundle was empty");
    }
    const wasmPath = fileURLToPath(import.meta.resolve("@jitl/quickjs-ng-wasmfile-release-sync/wasm"));
    const scriptRuntime = await readFile(wasmPath);
    const exportedAssets: GameDocument["assets"] = {};
    const assetPaths: Record<string, string> = {};
    await mkdir(join(staging, "assets"));
    for (const [logicalId, binding] of Object.entries(document.assets)) {
      const exportedBinding: GameDocument["assets"][string] = {
        assetId: binding.assetId,
        digest: binding.digest,
        mediaKind: binding.mediaKind,
        width: binding.width,
        height: binding.height,
        pivot: binding.pivot,
        sampling: binding.sampling,
      };
      if (binding.frame) {
        exportedBinding.frame = binding.frame;
      }
      if (binding.assetId.startsWith("builtin:")) {
        exportedAssets[logicalId] = exportedBinding;
        continue;
      }
      const asset = await options.resolveAsset(binding.assetId);
      if (!asset) {
        throw new Error(`Missing asset for ${logicalId}`);
      }
      const extension = mediaExtension(asset.bytes, asset.mimeType);
      const image = extension === "png" || extension === "jpg" || extension === "webp";
      if ((binding.mediaKind === "image") !== image) {
        throw new Error(`Asset type does not match ${logicalId}`);
      }
      const digest = createHash("sha256").update(asset.bytes).digest("hex");
      if (digest !== binding.digest) {
        throw new Error(`Asset content digest changed for ${logicalId}`);
      }
      const relativePath = `./assets/${digest}.${extension}`;
      await writeFile(join(staging, "assets", `${digest}.${extension}`), asset.bytes);
      exportedAssets[logicalId] = { ...exportedBinding, assetId: relativePath, digest };
      assetPaths[logicalId] = relativePath;
    }
    const exportedDocument: GameDocument = { ...document, assets: exportedAssets };
    await Promise.all([
      writeFile(join(staging, "index.html"), html()),
      writeFile(join(staging, "style.css"), CSS),
      writeFile(join(staging, "game.json"), JSON.stringify(exportedDocument)),
      writeFile(join(staging, PLAYER_FILE), player.contents),
      writeFile(join(staging, "emscripten-module.wasm"), scriptRuntime),
    ]);
    let existing: string[] | undefined;
    try {
      existing = await readdir(outputDir);
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
        throw error;
      }
    }
    if (existing && existing.length > 0) {
      throw new Error(`Output directory is not empty: ${outputDir}`);
    }
    if (existing) {
      await rmdir(outputDir);
    }
    await rename(staging, outputDir);
    return { outputDir, gamePath: join(outputDir, "game.json"), playerPath: join(outputDir, PLAYER_FILE), assetPaths };
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}
