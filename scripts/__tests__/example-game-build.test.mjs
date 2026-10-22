import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { afterEach, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const roots = [];
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "example-game-build-"));
  roots.push(root);
  const base = path.join(root, "packages/base-nodes/nodetool");
  const media = path.join(base, "assets/nodetool-base/games/lumen");
  const manifest = path.join(base, "examples/games/lumen.game.json");
  mkdirSync(path.dirname(manifest), { recursive: true });
  cpSync(path.join(ROOT, "packages/base-nodes/nodetool/assets/nodetool-base/games/lumen"), media, { recursive: true });
  cpSync(path.join(ROOT, "packages/base-nodes/nodetool/examples/games/lumen.game.json"), manifest);
  mkdirSync(path.join(root, "scripts/example-games"), { recursive: true });
  cpSync(path.join(ROOT, "scripts/example-games/build.mjs"), path.join(root, "scripts/example-games/build.mjs"));
  symlinkSync(path.join(ROOT, "node_modules"), path.join(root, "node_modules"), "dir");
  const source = path.join(root, "sources/lumen");
  mkdirSync(path.join(source, "assets"), { recursive: true });
  const document = JSON.parse(readFileSync(manifest, "utf8")).document;
  for (const [slot, binding] of Object.entries(document.assets)) {
    const extension = path.extname(binding.assetId);
    cpSync(path.join(media, `${slot}${extension}`), path.join(source, "assets", `${binding.digest}${extension}`));
    binding.assetId = binding.digest;
  }
  writeFileSync(path.join(source, "game.json"), JSON.stringify(document));
  return { root, base, media, manifest, source, document };
}
function snapshot(f) {
  return { manifest: digest(readFileSync(f.manifest)), media: readdirSync(f.media).sort().map((name) => [name, digest(readFileSync(path.join(f.media, name)))]) };
}
async function changeFirstImage(f) {
  const binding = f.document.assets.sky;
  const bytes = await sharp(path.join(f.source, "assets", `${binding.assetId}.jpg`)).flip().jpeg().toBuffer();
  binding.assetId = digest(bytes);
  binding.digest = binding.assetId;
  writeFileSync(path.join(f.source, "assets", `${binding.assetId}.jpg`), bytes);
}
function run(f, args = []) {
  return spawnSync(process.execPath, ["scripts/example-games/build.mjs", "--slug=lumen", ...args], {
    cwd: f.root, encoding: "utf8", env: { ...process.env, NODETOOL_GAMES_DIR: path.join(f.root, "sources") }
  });
}
it("preserves the complete published generation when a later asset fails its digest", async () => {
  const f = fixture();
  const before = snapshot(f);
  await changeFirstImage(f);
  f.document.assets.far.digest = "0".repeat(64);
  writeFileSync(path.join(f.source, "game.json"), JSON.stringify(f.document));
  const result = run(f);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/does not match the digest/);
  expect(snapshot(f)).toEqual(before);
});
it("preserves the complete published generation when poster capture fails", async () => {
  const f = fixture();
  const before = snapshot(f);
  await changeFirstImage(f);
  writeFileSync(path.join(f.source, "game.json"), JSON.stringify(f.document));
  writeFileSync(path.join(f.source, "inputs.json"), "[]");
  const bin = path.join(f.root, "bin");
  mkdirSync(bin);
  writeFileSync(path.join(bin, "npm"), `#!${process.execPath}\nprocess.stderr.write("intentional capture failure\\n"); process.exit(1);\n`, { mode: 0o755 });
  const result = spawnSync(process.execPath, ["scripts/example-games/build.mjs", "--slug=lumen", "--posters"], {
    cwd: f.root, encoding: "utf8", env: { ...process.env, NODETOOL_GAMES_DIR: path.join(f.root, "sources"), PATH: `${bin}${path.delimiter}${process.env.PATH}` }
  });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/Could not capture/);
  expect(snapshot(f)).toEqual(before);
});
it("publishes a complete successful generation and removes obsolete media", async () => {
  const f = fixture();
  await changeFirstImage(f);
  writeFileSync(path.join(f.source, "game.json"), JSON.stringify(f.document));
  writeFileSync(path.join(f.media, "obsolete.bin"), "old unbound media");
  const oldPoster = readFileSync(path.join(f.media, "poster.jpg"));
  const result = run(f);
  expect(result.status, result.stderr).toBe(0);
  const bundle = JSON.parse(readFileSync(f.manifest, "utf8"));
  expect(bundle.document.assets.sky.digest).toBe(f.document.assets.sky.digest);
  expect(digest(readFileSync(path.join(f.media, "sky.jpg")))).toBe(bundle.document.assets.sky.digest);
  expect(readFileSync(path.join(f.media, "poster.jpg"))).toEqual(oldPoster);
  expect(readdirSync(f.media)).not.toContain("obsolete.bin");
  expect(readdirSync(f.base).filter((name) => name.startsWith(".game-bundles-"))).toEqual([]);
});
it("rolls back media and manifest when the manifest rename fails", async () => {
  const f = fixture();
  const before = snapshot(f);
  await changeFirstImage(f);
  writeFileSync(path.join(f.source, "game.json"), JSON.stringify(f.document));
  const preload = path.join(f.root, "rename-failure.mjs");
  writeFileSync(preload, `import fs from "node:fs"; import {syncBuiltinESMExports} from "node:module";
const rename=fs.renameSync; let failed=false;
fs.renameSync=(from,to)=>{ if(!failed && from.includes(".game-bundles-") && from.endsWith("lumen.game.json")){failed=true;throw new Error("intentional publication failure");} return rename(from,to);}; syncBuiltinESMExports();`);
  const result = spawnSync(process.execPath, ["--import", preload, "scripts/example-games/build.mjs", "--slug=lumen"], {
    cwd: f.root, encoding: "utf8", env: { ...process.env, NODETOOL_GAMES_DIR: path.join(f.root, "sources") }
  });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/intentional publication failure/);
  expect(snapshot(f)).toEqual(before);
  expect(readdirSync(f.base).filter((name) => name.startsWith(".game-bundles-"))).toEqual([]);
});
function catalogFixture() {
  const f = fixture();
  cpSync(path.join(ROOT, "packages/base-nodes/nodetool/assets/nodetool-base/games"), path.join(f.base, "assets/nodetool-base/games"), { recursive: true });
  cpSync(path.join(ROOT, "packages/base-nodes/nodetool/examples/games"), path.join(f.base, "examples/games"), { recursive: true });
  for (const slug of ["signal-forge", "aether", "blacksite", "ridgeline", "sunrush-kart", "kindle"]) {
    cpSync(path.join(ROOT, "packages/game-runtime/samples", slug), path.join(f.root, "packages/game-runtime/samples", slug), { recursive: true });
  }
  return f;
}
function catalogSnapshot(f) {
  return ["signal-forge", "aether", "blacksite", "ridgeline", "sunrush-kart", "kindle", "lumen", "neon-drift"].map((slug) => {
    const media = path.join(f.base, "assets/nodetool-base/games", slug);
    return { slug, manifest: digest(readFileSync(path.join(f.base, "examples/games", `${slug}.game.json`))),
      media: readdirSync(media).sort().map((name) => [name, digest(readFileSync(path.join(media, name)))]) };
  });
}
it("reconstructs all unchanged bundles without private home projects", () => {
  const f = catalogFixture();
  const before = catalogSnapshot(f);
  const env = { ...process.env, HOME: path.join(f.root, "empty-home") };
  delete env.NODETOOL_GAMES_DIR;
  const result = spawnSync(process.execPath, ["scripts/example-games/build.mjs"], { cwd: f.root, encoding: "utf8", env });
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout.match(/ assets/g)).toHaveLength(8);
  expect(catalogSnapshot(f)).toEqual(before);
});
it("preflights every selected game before publishing any generation", () => {
  const f = catalogFixture();
  const before = catalogSnapshot(f);
  const sample = path.join(f.root, "packages/game-runtime/samples/signal-forge");
  const document = JSON.parse(readFileSync(path.join(sample, "game.json"), "utf8"));
  const first = document.assets["forge-pulse"];
  const second = document.assets["forge-relay"];
  const files = readdirSync(path.join(sample, "assets"));
  const target = files.find((name) => name.startsWith(`${first.assetId}.`));
  const replacement = readFileSync(path.join(sample, "assets", files.find((name) => name.startsWith(`${second.assetId}.`))));
  expect(digest(replacement)).not.toBe(first.digest);
  writeFileSync(path.join(sample, "assets", target), replacement);
  first.digest = digest(replacement);
  writeFileSync(path.join(sample, "game.json"), JSON.stringify(document));
  rmSync(path.join(f.base, "examples/games/neon-drift.game.json"));
  const env = { ...process.env };
  delete env.NODETOOL_GAMES_DIR;
  const result = spawnSync(process.execPath, ["scripts/example-games/build.mjs"], { cwd: f.root, encoding: "utf8", env });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/ENOENT/);
  writeFileSync(path.join(f.base, "examples/games/neon-drift.game.json"), readFileSync(path.join(ROOT, "packages/base-nodes/nodetool/examples/games/neon-drift.game.json")));
  expect(catalogSnapshot(f)).toEqual(before);
});
it("rejects fresh canonical 2D poster capture before changing any shipped path", () => {
  const f = fixture();
  const before = snapshot(f);
  const env = { ...process.env };
  delete env.NODETOOL_GAMES_DIR;
  const result = spawnSync(process.execPath, ["scripts/example-games/build.mjs", "--slug=lumen", "--posters"], { cwd: f.root, encoding: "utf8", env });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/fresh poster capture requires NODETOOL_GAMES_DIR/);
  expect(snapshot(f)).toEqual(before);
});
it("rejects asset slots that could escape staging without changing published files", () => {
  const f = fixture();
  const before = snapshot(f);
  const sentinel = path.join(f.base, "escape.jpg");
  writeFileSync(sentinel, "prior file outside the game directory");
  const binding = f.document.assets.sky;
  f.document.assets = { "../../escape": binding };
  writeFileSync(path.join(f.source, "game.json"), JSON.stringify(f.document));
  const result = run(f);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/asset slot/);
  expect(snapshot(f)).toEqual(before);
  expect(readFileSync(sentinel, "utf8")).toBe("prior file outside the game directory");
});
it("keeps a capture-named image asset when capturing a fresh poster", () => {
  const f = fixture();
  f.document.assets.capture = { ...f.document.assets.far };
  writeFileSync(path.join(f.source, "game.json"), JSON.stringify(f.document));
  writeFileSync(path.join(f.source, "inputs.json"), "[]");
  const bin = path.join(f.root, "bin");
  mkdirSync(bin);
  const image = path.join(f.source, "assets", `${f.document.assets.far.assetId}.png`);
  writeFileSync(path.join(bin, "npm"), `#!${process.execPath}\nconst fs=require("node:fs");fs.copyFileSync(${JSON.stringify(image)},process.argv[process.argv.indexOf("--out")+1]);process.stdout.write("Captured tick 900\\n");\n`, { mode: 0o755 });
  const result = spawnSync(process.execPath, ["scripts/example-games/build.mjs", "--slug=lumen", "--posters"], {
    cwd: f.root, encoding: "utf8", env: { ...process.env, NODETOOL_GAMES_DIR: path.join(f.root, "sources"), PATH: `${bin}${path.delimiter}${process.env.PATH}` }
  });
  expect(result.status, result.stderr).toBe(0);
  expect(digest(readFileSync(path.join(f.media, "capture.png")))).toBe(f.document.assets.capture.digest);
});
it.each(["poster", "Poster"])("rejects the %s asset collision without changing any published bytes", (slot) => {
  const f = fixture();
  const before = snapshot(f);
  f.document.assets[slot] = { ...f.document.assets.sky };
  writeFileSync(path.join(f.source, "game.json"), JSON.stringify(f.document));
  const result = run(f);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/reserved poster/);
  expect(snapshot(f)).toEqual(before);
});
