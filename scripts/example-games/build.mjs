// Builds the shipped example games from their source projects.
//
// `node scripts/example-games/build.mjs` reads committed source projects and
// the canonical packaged Lumen and Neon Drift documents/media.
// NODETOOL_GAMES_DIR can explicitly override those packaged sources. It stages verified media for
// packages/base-nodes/nodetool/assets/nodetool-base/games/<slug>/, and writes
// packages/base-nodes/nodetool/examples/games/<slug>.game.json with every asset
// slot bound to its `package://` file. Installing a bundle copies those files
// into the user's assets (packages/websocket/src/lib/example-games.ts).
// The committed samples (the 3D games and Kindle) provide editable sources. The
// packaged Lumen and Neon Drift documents, media and posters are their
// canonical source.
// Use --slug=<slug> to rebuild one game.
//
// Add `--posters` to capture each poster again. The packaged sources have no
// committed input recordings, so their fresh capture requires an explicit
// NODETOOL_GAMES_DIR project and recording. 2D uses Dawn, 3D uses Chromium.
// A script that runs past its time
// budget on a loaded machine fails the capture, so each one is retried.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = path.join(ROOT, "packages/base-nodes/nodetool");
const SOURCE = process.env.NODETOOL_GAMES_DIR;
const POSTERS = process.argv.includes("--posters");

const GAMES = [
  {
    slug: "signal-forge",
    name: "Signal Forge",
    description: "Wake an industrial relay, ride its shuttle, raise a bridge over the coolant furnace, and restore the reactor beacon.",
    controls: "WASD or arrows to move · Space to jump · E to pulse or use terminals · R to recover · Hold right mouse to look",
    sourceDir: path.join(ROOT, "packages/game-runtime/samples/signal-forge"),
    posterTick: 1,
    inputs: "completion.inputs.json",
    backend: "webgl2"
  },
  {
    slug: "aether",
    name: "AETHER // Skybound",
    description: "Cross 22 floating platforms, dodge pulsing lasers, escape collapsing steps, and ride two sky ferries to recover five aether prisms.",
    controls: "WASD to move · Space to jump · Hold right mouse to look · R to return to checkpoint",
    sourceDir: path.join(ROOT, "packages/game-runtime/samples/aether"),
    posterTick: 15,
    inputs: "completion.inputs.json",
    backend: "webgl2"
  },
  {
    slug: "blacksite",
    name: "BLACKSITE",
    description: "A first-person mission through an industrial reactor facility. Destroy five security drones, use cover, and reach extraction.",
    controls: "WASD to move · Hold right mouse to aim · F to fire · R to reload · Space to jump",
    sourceDir: path.join(ROOT, "packages/game-runtime/samples/blacksite"),
    posterTick: 2,
    inputs: "completion.inputs.json",
    backend: "webgl2"
  },
  {
    slug: "ridgeline",
    name: "RIDGELINE",
    description: "Fly a light jet from the island airfield, thread 13 gates through a river canyon and over the ridges at golden hour, and finish with a low pass over the runway.",
    controls: "W/S pitch · A/D roll · Q/E rudder · Shift/Ctrl throttle · G gear · C camera · R reset · Drag to look",
    sourceDir: path.join(ROOT, "packages/game-runtime/samples/ridgeline"),
    posterTick: 1500,
    inputs: "completion.inputs.json",
    backend: "webgl2"
  },
  {
    slug: "kindle",
    name: "Kindle",
    description:
      "A jump-and-run through a drowned temple. Run, wall-jump and ride moving lifts to relight four braziers and gather the embers on the way.",
    controls: "Arrows to run · Space to jump · Jump off walls",
    sourceDir: path.join(ROOT, "packages/game-runtime/samples/kindle"),
    posterTick: 420,
    inputs: "completion.inputs.json"
  },
  {
    slug: "lumen",
    name: "Lumen",
    description:
      "Fly a firefly through a night forest and gather the light it has lost. Shadow wisps drift between the trees and knock you away.",
    controls: "Arrows to fly",
    posterTick: 900,
    inputs: "inputs.json"
  },
  {
    slug: "neon-drift",
    name: "Neon Drift",
    description:
      "A neon arena shooter. Every wave warps in with a ring of light. Keep the combo alive to push the score.",
    controls: "Arrows to fly · Hold Space to fire",
    posterTick: 2400,
    inputs: "inputs.json"
  }
];

function capturePoster(game, sourceDir, out) {
  const png = path.join(path.dirname(path.dirname(out)), `${game.slug}-capture.png`);
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = spawnSync("npm", [
      "run", "--silent", "dev:nodetool", "--", "game", "capture", path.join(sourceDir, "game.json"),
      "--ticks", String(game.posterTick),
      "--inputs", path.join(sourceDir, game.inputs),
      "--assets-dir", path.join(sourceDir, "assets"),
      "--backend", game.backend ?? "webgpu",
      "--out", png
    ], { cwd: ROOT, encoding: "utf8" });
    if (result.status === 0 && /Captured tick/.test(result.stdout + result.stderr)) {
      return sharp(png).jpeg({ quality: 86, mozjpeg: true }).toFile(out).finally(() => rmSync(png, { force: true }));
    }
    console.warn(`  ${game.slug}: capture attempt ${attempt} failed: ${(result.stderr || result.stdout).trim().split("\n").pop()}`);
  }
  throw new Error(`Could not capture the ${game.slug} poster`);
}

const slug = process.argv.find((arg) => arg.startsWith("--slug="))?.slice(7);
if (slug && !GAMES.some((game) => game.slug === slug)) throw new Error(`Unknown game: ${slug}`);

// Read and validate the entire selection before changing any shipped path.
const plans = GAMES.filter((game) => !slug || game.slug === slug).map((game) => {
  const mediaDir = path.join(BASE, "assets/nodetool-base/games", game.slug);
  const manifest = path.join(BASE, "examples/games", `${game.slug}.game.json`);
  const sourceDir = game.sourceDir ?? (SOURCE ? path.join(SOURCE, game.slug) : null);
  const document = JSON.parse(readFileSync(sourceDir ? path.join(sourceDir, "game.json") : manifest, "utf8"));
  const sourceDocument = sourceDir ? document : document.document;
  const poster = path.join(mediaDir, "poster.jpg");
  if (POSTERS || !existsSync(poster)) {
    if (!sourceDir) throw new Error(`${game.slug}: fresh poster capture requires NODETOOL_GAMES_DIR with game.json, assets and ${game.inputs}`);
    if (!existsSync(path.join(sourceDir, game.inputs))) throw new Error(`${game.slug}: poster capture recording is missing: ${game.inputs}`);
  }
  const files = sourceDir ? readdirSync(path.join(sourceDir, "assets")) : [];
  const assets = Object.entries(sourceDocument.assets).map(([slot, binding]) => {
    if (slot === "." || slot === ".." || /[/\\]/.test(slot)) {
      throw new Error(`${game.slug}: asset slot "${slot}" cannot be used as a file name`);
    }
    const file = sourceDir
      ? files.find((name) => name.slice(0, name.lastIndexOf(".")) === binding.assetId)
      : binding.assetId.slice(`package://nodetool-base/games/${game.slug}/`.length);
    if (!file || path.basename(file) !== file || (!sourceDir && binding.assetId !== `package://nodetool-base/games/${game.slug}/${file}`)) {
      throw new Error(`${game.slug}: no local file for slot "${slot}" (${binding.assetId})`);
    }
    const source = path.join(sourceDir ? path.join(sourceDir, "assets") : mediaDir, file);
    const bytes = readFileSync(source);
    if (createHash("sha256").update(bytes).digest("hex") !== binding.digest) {
      throw new Error(`${game.slug}: ${file} does not match the digest bound to "${slot}"`);
    }
    const target = `${slot}${path.extname(file).toLowerCase()}`;
    if (target.toLowerCase() === "poster.jpg") {
      throw new Error(`${game.slug}: asset slot "${slot}" collides with the reserved poster file`);
    }
    binding.assetId = `package://nodetool-base/games/${game.slug}/${target}`;
    delete binding.sourceAssetId;
    return { source, target, digest: binding.digest };
  });
  return { game, mediaDir, manifest, sourceDir, document: sourceDocument, assets,
    poster: existsSync(poster) && !POSTERS ? readFileSync(poster) : null };
});

mkdirSync(BASE, { recursive: true });
const staging = mkdtempSync(path.join(BASE, ".game-bundles-"));
const published = [];
let preserveBackup = false;
try {
  for (const plan of plans) {
    const directory = path.join(staging, plan.game.slug);
    mkdirSync(directory);
    for (const asset of plan.assets) {
      const target = path.join(directory, asset.target);
      copyFileSync(asset.source, target);
      if (createHash("sha256").update(readFileSync(target)).digest("hex") !== asset.digest) {
        throw new Error(`${plan.game.slug}: source media changed during staging`);
      }
    }
    if (plan.poster) writeFileSync(path.join(directory, "poster.jpg"), plan.poster);
    else await capturePoster(plan.game, plan.sourceDir, path.join(directory, "poster.jpg"));
    const bundle = { name: plan.game.name, description: plan.game.description, controls: plan.game.controls,
      posterUri: `package://nodetool-base/games/${plan.game.slug}/poster.jpg`, document: plan.document };
    writeFileSync(path.join(staging, `${plan.game.slug}.game.json`), `${JSON.stringify(bundle)}\n`);
  }
  for (const plan of plans) {
    for (const [source, target] of [[path.join(staging, plan.game.slug), plan.mediaDir],
      [path.join(staging, `${plan.game.slug}.game.json`), plan.manifest]]) {
      mkdirSync(path.dirname(target), { recursive: true });
      const backup = path.join(staging, `backup-${published.length}`);
      const change = { target, backup, existed: existsSync(target), installed: false };
      if (change.existed) renameSync(target, backup);
      published.push(change);
      renameSync(source, target);
      change.installed = true;
    }
  }
  for (const plan of plans) console.log(`${plan.game.slug}: ${plan.assets.length} assets`);
} catch (cause) {
  const failures = [];
  for (const change of published.reverse()) {
    try {
      if (change.installed) rmSync(change.target, { recursive: true, force: true });
      if (change.existed) renameSync(change.backup, change.target);
    } catch (error) { failures.push(error); }
  }
  if (failures.length) {
    preserveBackup = true;
    throw new AggregateError([cause, ...failures], `Bundle publication rollback failed. Recovery files retained at ${staging}`);
  }
  throw cause;
} finally {
  if (!preserveBackup) rmSync(staging, { recursive: true, force: true });
}
