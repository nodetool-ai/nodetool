// Builds the shipped example games from their source projects.
//
// `node scripts/example-games/build.mjs` reads each game's `game.json` and its
// content-addressed `assets/` folder from NODETOOL_GAMES_DIR (default
// ~/workspace/nodetool-games), copies the media into
// packages/base-nodes/nodetool/assets/nodetool-base/games/<slug>/, and writes
// packages/base-nodes/nodetool/examples/games/<slug>.game.json with every asset
// slot bound to its `package://` file. Installing a bundle copies those files
// into the user's assets (packages/websocket/src/lib/example-games.ts).
//
// Add `--posters` to capture each poster again with the WebGPU game capture.
// The capture needs the local Dawn adapter. A script that runs past its time
// budget on a loaded machine fails the capture, so each one is retried.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = path.join(ROOT, "packages/base-nodes/nodetool");
const SOURCE = process.env.NODETOOL_GAMES_DIR ?? path.join(homedir(), "workspace/nodetool-games");
const POSTERS = process.argv.includes("--posters");

const GAMES = [
  {
    slug: "kindle",
    name: "Kindle",
    description:
      "A jump-and-run through a drowned temple. Run, wall-jump and ride moving lifts to relight four braziers and gather the embers on the way.",
    controls: "Arrows to run · Space to jump · Jump off walls",
    posterTick: 420,
    inputs: "inputs-route.json"
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
  const png = path.join(tmpdir(), `${game.slug}-poster.png`);
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = spawnSync("npm", [
      "run", "--silent", "dev:nodetool", "--", "game", "capture", path.join(sourceDir, "game.json"),
      "--ticks", String(game.posterTick),
      "--inputs", path.join(sourceDir, game.inputs),
      "--assets-dir", path.join(sourceDir, "assets"),
      "--backend", "webgpu",
      "--out", png
    ], { cwd: ROOT, encoding: "utf8" });
    if (result.status === 0 && /Captured tick/.test(result.stdout + result.stderr)) {
      return sharp(png).jpeg({ quality: 86, mozjpeg: true }).toFile(out);
    }
    console.warn(`  ${game.slug}: capture attempt ${attempt} failed: ${(result.stderr || result.stdout).trim().split("\n").pop()}`);
  }
  throw new Error(`Could not capture the ${game.slug} poster`);
}

for (const game of GAMES) {
  const sourceDir = path.join(SOURCE, game.slug);
  const document = JSON.parse(readFileSync(path.join(sourceDir, "game.json"), "utf8"));
  const mediaDir = path.join(BASE, "assets/nodetool-base/games", game.slug);
  const poster = path.join(mediaDir, "poster.jpg");
  const keep = existsSync(poster) && !POSTERS ? readFileSync(poster) : null;
  rmSync(mediaDir, { recursive: true, force: true });
  mkdirSync(mediaDir, { recursive: true });
  if (keep) writeFileSync(poster, keep);

  const sourceFiles = readdirSync(path.join(sourceDir, "assets"));
  for (const [slot, binding] of Object.entries(document.assets)) {
    const file = sourceFiles.find((name) => name.slice(0, name.lastIndexOf(".")) === binding.assetId);
    if (!file) throw new Error(`${game.slug}: no file for slot "${slot}" (${binding.assetId})`);
    const bytes = readFileSync(path.join(sourceDir, "assets", file));
    if (createHash("sha256").update(bytes).digest("hex") !== binding.digest) {
      throw new Error(`${game.slug}: ${file} does not match the digest bound to "${slot}"`);
    }
    const target = `${slot}${path.extname(file).toLowerCase()}`;
    copyFileSync(path.join(sourceDir, "assets", file), path.join(mediaDir, target));
    binding.assetId = `package://nodetool-base/games/${game.slug}/${target}`;
  }

  if (!existsSync(poster)) await capturePoster(game, sourceDir, poster);

  const bundle = {
    name: game.name,
    description: game.description,
    controls: game.controls,
    posterUri: `package://nodetool-base/games/${game.slug}/poster.jpg`,
    document
  };
  mkdirSync(path.join(BASE, "examples/games"), { recursive: true });
  writeFileSync(path.join(BASE, "examples/games", `${game.slug}.game.json`), `${JSON.stringify(bundle)}\n`);
  console.log(`${game.slug}: ${Object.keys(document.assets).length} assets`);
}
