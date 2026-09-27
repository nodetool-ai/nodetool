import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, rmdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { GlobalFonts } from "@napi-rs/canvas";
import { createCanvas, loadImage } from "@napi-rs/canvas";
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
  if ((mime === "font/ttf" || mime === "application/x-font-ttf") && bytes.length >= 4 && bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0) {
    return "ttf";
  }
  if ((mime === "font/otf" || mime === "application/vnd.ms-opentype") && bytes.length >= 4 && Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "OTTO") {
    return "otf";
  }
  throw new Error(`Asset bytes do not match a supported media type: ${mimeType}`);
}

function html(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="theme-color" content="#000000">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' blob:; media-src 'self' blob:; font-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'">
  <title>NodeTool Game</title>
  <link rel="stylesheet" href="./style.css">
</head>
<body>
  <main>
    <div class="stage"><canvas id="game" aria-label="Game viewport"></canvas></div>
    <div class="controls">
      <button id="pause" type="button">Pause</button>
      <button id="step" type="button">Step</button>
      <button id="reset" type="button">Reset</button>
      <button id="save" type="button">Save</button>
      <button id="load" type="button">Load</button>
      <button id="fullscreen" type="button">Fullscreen</button>
    </div>
    <p id="status" role="status" aria-live="polite"></p>
  </main>
  <div id="touch" class="touch-layer"></div>
  <div class="rotate" role="alert">Turn your device sideways to play</div>
  <script type="module" src="./${PLAYER_FILE}"></script>
</body>
</html>
`;
}

// Desktop keeps the toolbar under the game. A coarse pointer gets a full-screen stage, a
// compact toolbar, touch controls from touch-controls.ts, and a prompt to turn a landscape game sideways.
const CSS = `:root{color-scheme:dark;font-family:system-ui,sans-serif;--game-aspect:1.7778}
html,body{height:100%}
body{margin:0;background:#000;color:#fff;overscroll-behavior:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent}
main{min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem}
.stage{width:min(100vw,calc((100dvh - 6rem) * var(--game-aspect)));aspect-ratio:var(--game-aspect)}
canvas{display:block;width:100%;height:100%;image-rendering:pixelated;background:#202631;touch-action:none}
.controls{display:flex;flex-wrap:wrap;justify-content:center;gap:.5rem}
button{font:inherit;padding:.4rem .8rem}
#status{min-height:1.5em;margin:0}
.touch-layer,.rotate{display:none}
body.touch{position:fixed;inset:0;overflow:hidden;touch-action:none}
body.touch main{position:fixed;inset:0;gap:0}
body.touch .stage{width:min(100vw,calc(100dvh * var(--game-aspect)))}
body.touch .controls{position:fixed;top:max(.5rem,env(safe-area-inset-top));right:max(.5rem,env(safe-area-inset-right));z-index:3;opacity:.5;flex-direction:column;gap:.4rem}
body.touch .controls button{width:2.25rem;height:2.25rem;padding:0;font-size:1rem;line-height:1;border-radius:50%;border:1px solid #fff4;background:#0008;color:#fff}
body.touch #step,body.touch #save,body.touch #load{display:none}
body.touch #status{position:fixed;bottom:max(.5rem,env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);font-size:.75rem;z-index:3;pointer-events:none;opacity:0}
body.touch #status.flash{animation:status-flash 3.5s ease-out}
@keyframes status-flash{0%,70%{opacity:.7}100%{opacity:0}}
body.touch .touch-layer{display:block;position:fixed;inset:0;z-index:2;pointer-events:none}
.touch-stick-zone{position:absolute;left:0;top:0;bottom:0;width:50%;pointer-events:auto;touch-action:none}
.touch-stick{position:absolute;left:25%;top:70%;width:7.5rem;height:7.5rem;margin:-3.75rem 0 0 -3.75rem;border-radius:50%;border:2px solid #fff5;background:#fff1;opacity:.35;transition:opacity .15s}
.touch-stick.active{opacity:.9}
.touch-knob{position:absolute;left:50%;top:50%;width:3.25rem;height:3.25rem;margin:-1.625rem 0 0 -1.625rem;border-radius:50%;background:#fff8;box-shadow:0 0 1rem #fff6}
.touch-buttons{position:absolute;right:max(1.25rem,env(safe-area-inset-right));bottom:max(1.25rem,env(safe-area-inset-bottom));display:flex;flex-direction:column-reverse;gap:1rem;pointer-events:auto}
.touch-button{width:5.25rem;height:5.25rem;border-radius:50%;border:2px solid #fff6;background:#ffffff1f;color:#fff;font:600 .8rem system-ui,sans-serif;letter-spacing:.05em;touch-action:none;box-shadow:0 0 1.25rem #0008}
.touch-button.active{background:#ffffff59;transform:scale(.94)}
@media (orientation:portrait){body.touch.landscape-game .rotate{display:flex;position:fixed;inset:0;z-index:4;align-items:center;justify-content:center;padding:2rem;text-align:center;font-size:1.25rem;background:#000e}}`;

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
        fontFormat: binding.fontFormat,
        width: binding.width,
        height: binding.height,
        pivot: binding.pivot,
        sampling: binding.sampling,
        required: binding.required,
        preparation: binding.preparation,
        originalDimensions: binding.originalDimensions,
        trim: binding.trim,
        referenceAssetId: binding.referenceAssetId,
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
      const kind = extension === "png" || extension === "jpg" || extension === "webp" ? "image"
        : extension === "ttf" || extension === "otf" ? "font" : "audio";
      if (binding.mediaKind !== kind) {
        throw new Error(`Asset type does not match ${logicalId}`);
      }
      if (kind === "font" && binding.fontFormat !== extension) {
        throw new Error(`Font format does not match ${logicalId}`);
      }
      if (kind === "font") {
        const key = GlobalFonts.register(Buffer.from(asset.bytes), `ntg-export-check-${logicalId}`);
        if (!key) throw new Error(`Invalid font bytes for ${logicalId}`);
        GlobalFonts.remove(key);
      }
      const lut = document.renderEffects?.find((effect) => effect.kind === "lut" && effect.assetId === logicalId);
      if (lut?.kind === "lut") {
        const image = await loadImage(Buffer.from(asset.bytes));
        if (image.width !== lut.size * lut.size || image.height !== lut.size) {
          throw new Error(`LUT ${logicalId} has invalid decoded dimensions`);
        }
        const canvas = createCanvas(image.width, image.height);
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, image.width, image.height).data;
        for (let index = 3; index < pixels.length; index += 4) {
          if (pixels[index] !== 255) {
            throw new Error(`LUT ${logicalId} must be opaque`);
          }
        }
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
