#!/usr/bin/env node
/**
 * Package media: the binary example media of `nodetool-base` lives on media
 * storage (media.nodetool.ai, the `nodetool-media` R2 bucket), not in git.
 * `packages/base-nodes/nodetool/assets/nodetool-base.media.json` lists each
 * file by SHA-256. The runtime side is `@nodetool-ai/config/package-media`.
 *
 *   node scripts/package-media.mjs pull    # download missing files into the checkout
 *   node scripts/package-media.mjs push    # upload new or changed files, rewrite the manifest
 *   node scripts/package-media.mjs push --tracked   # only files git tracks (the first migration)
 *   node scripts/package-media.mjs check   # fail when a local file differs from the manifest
 *
 * `pull` keeps downloaded objects in the package media cache
 * (NODETOOL_PACKAGE_MEDIA_CACHE, else <cache>/nodetool/package-media), so a
 * second checkout or worktree copies them from disk.
 *
 * `push` uploads with wrangler: it needs CLOUDFLARE_ACCOUNT_ID and a wrangler
 * login or CLOUDFLARE_API_TOKEN. R2_BUCKET overrides the bucket.
 */
import { execFileSync, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS_ROOT = path.join(ROOT, "packages/base-nodes/nodetool/assets");
const PACKAGE = "nodetool-base";
const PACKAGE_DIR = path.join(ASSETS_ROOT, PACKAGE);
const MANIFEST = path.join(ASSETS_ROOT, `${PACKAGE}.media.json`);
const BASE = "https://media.nodetool.ai/package-media/";
const BUCKET = process.env.R2_BUCKET || "nodetool-media";
const PREFIX = "package-media/";

/** Folders whose media moved to storage. Text files in them stay in git. */
export const MEDIA_DIRS = ["games", "game-models", "timelines", "storyboards", "recipe-inputs", "ad-library"];
/** Extensions that count as media. */
export const MEDIA_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".webp", ".gif", ".wav", ".mp3", ".ogg", ".m4a", ".mp4", ".webm", ".mov", ".glb", ".gltf", ".bin", ".ttf", ".otf",
]);
const CONTENT_TYPES = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif",
  ".wav": "audio/wav", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".m4a": "audio/mp4",
  ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
  ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".bin": "application/octet-stream",
  ".ttf": "font/ttf", ".otf": "font/otf",
};

/** Storyboard films play from media.nodetool.ai/showcase and never ship. */
const STORYBOARD_FILM = /^storyboards\/[^/]+\/[^/]+\.mp4$/i;

export function isMediaPath(relative) {
  const [dir] = relative.split("/");
  return (
    MEDIA_DIRS.includes(dir) &&
    MEDIA_EXTENSIONS.has(path.extname(relative).toLowerCase()) &&
    !STORYBOARD_FILM.test(relative)
  );
}

function cacheDir() {
  const override = process.env.NODETOOL_PACKAGE_MEDIA_CACHE?.trim();
  if (override) return override;
  const base =
    process.env.NODETOOL_CACHE_DIR?.trim() ||
    (process.platform === "win32"
      ? path.join(process.env.LOCALAPPDATA ?? path.join(homedir(), "AppData", "Local"), "nodetool", "cache")
      : path.join(process.env.XDG_CACHE_HOME ?? path.join(homedir(), ".cache"), "nodetool"));
  return path.join(base, "package-media");
}

function keyOf(relative, sha256) {
  return `${sha256}${path.extname(relative).toLowerCase()}`;
}

async function sha256Of(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

async function readManifest() {
  if (!existsSync(MANIFEST)) return { version: 1, base: BASE, files: {} };
  return JSON.parse(await readFile(MANIFEST, "utf8"));
}

async function writeManifest(files) {
  const sorted = Object.fromEntries(Object.entries(files).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  await writeFile(MANIFEST, `${JSON.stringify({ version: 1, base: BASE, files: sorted }, null, 2)}\n`);
}

async function* walk(dir, prefix) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const relative = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) yield* walk(path.join(dir, entry.name), relative);
    else if (entry.isFile() && isMediaPath(relative)) yield relative;
  }
}

async function localMedia() {
  const found = [];
  for (const dir of MEDIA_DIRS) {
    for await (const relative of walk(path.join(PACKAGE_DIR, dir), dir)) found.push(relative);
  }
  return found.sort();
}

async function parallel(items, limit, task) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await task(items[next++]);
  });
  await Promise.all(workers);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"], cwd: ROOT });
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} exited ${code}\n${stderr}`))));
  });
}

async function retry(task, attempts = 4) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await task();
    } catch (error) {
      if (attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
    }
  }
}

async function uploaded(key) {
  const response = await fetch(`${BASE}${key}`, { method: "HEAD" });
  return response.ok;
}

async function push() {
  if (!process.env.CLOUDFLARE_ACCOUNT_ID) throw new Error("push needs CLOUDFLARE_ACCOUNT_ID");
  const manifest = await readManifest();
  const files = {};
  let local = await localMedia();
  if (process.argv.includes("--tracked")) {
    const tracked = new Set(
      execFileSync("git", ["ls-files", "-z", "--", ...MEDIA_DIRS], { cwd: PACKAGE_DIR, encoding: "utf8" }).split("\0"),
    );
    local = local.filter((relative) => tracked.has(relative));
  }
  let sent = 0;
  await parallel(local, 8, async (relative) => {
    const file = path.join(PACKAGE_DIR, ...relative.split("/"));
    const sha256 = await sha256Of(file);
    const { size } = await stat(file);
    files[relative] = { sha256, size };
    const key = keyOf(relative, sha256);
    if (manifest.files[relative]?.sha256 === sha256 || (await uploaded(key))) return;
    const extension = path.extname(relative).toLowerCase();
    await retry(() => run("npx", [
      "--no-install", "wrangler", "r2", "object", "put", `${BUCKET}/${PREFIX}${key}`, "--remote",
      "--file", file,
      "--content-type", CONTENT_TYPES[extension] ?? "application/octet-stream",
      "--cache-control", "public, max-age=31536000, immutable",
    ]));
    sent += 1;
    console.log(`uploaded ${relative}`);
  });
  // An entry whose file is not in this checkout stays, so a partial checkout cannot drop media.
  for (const [relative, entry] of Object.entries(manifest.files)) files[relative] ??= entry;
  await writeManifest(files);
  console.log(`push: ${local.length} local files, ${sent} uploaded, ${Object.keys(files).length} in the manifest`);
}

async function download(url, file, entry) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${url} answered ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      if (bytes.byteLength !== entry.size || sha256 !== entry.sha256) throw new Error(`${url} does not match the manifest`);
      const partial = `${file}.${randomUUID()}.partial`;
      await writeFile(partial, bytes);
      await rename(partial, file);
      return;
    } catch (error) {
      if (attempt >= 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
}

async function pull() {
  const manifest = await readManifest();
  const cache = cacheDir();
  await mkdir(cache, { recursive: true });
  const entries = Object.entries(manifest.files);
  let fetched = 0;
  let copied = 0;
  await parallel(entries, 8, async ([relative, entry]) => {
    const target = path.join(PACKAGE_DIR, ...relative.split("/"));
    try {
      const info = await stat(target);
      if (info.size === entry.size && (await sha256Of(target)) === entry.sha256) return;
    } catch {
      // Missing: fetch it.
    }
    const key = keyOf(relative, entry.sha256);
    const cached = path.join(cache, key);
    if (!existsSync(cached) || (await stat(cached)).size !== entry.size) {
      await download(`${manifest.base}${key}`, cached, entry);
      fetched += 1;
    }
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(cached, target);
    copied += 1;
  });
  console.log(`pull: ${entries.length} files, ${copied} written, ${fetched} downloaded`);
}

async function check() {
  const manifest = await readManifest();
  const problems = [];
  for (const relative of await localMedia()) {
    const entry = manifest.files[relative];
    const file = path.join(PACKAGE_DIR, ...relative.split("/"));
    if (!entry) problems.push(`${relative}: not in the manifest, run push`);
    else if ((await sha256Of(file)) !== entry.sha256) problems.push(`${relative}: changed since push, run push`);
  }
  if (problems.length > 0) {
    console.error(problems.join("\n"));
    process.exitCode = 1;
    return;
  }
  console.log(`check: ${Object.keys(manifest.files).length} manifest entries, local media matches`);
}

const commands = { pull, push, check };
if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const command = commands[process.argv[2]];
  if (!command) {
    console.error("usage: node scripts/package-media.mjs pull|push|check");
    process.exit(2);
  }
  await command();
}

