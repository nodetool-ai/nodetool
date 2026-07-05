// Run: node --test marketing/scripts/__tests__/seed-guard.test.mjs
//
// End-to-end checks for the two OPS-1 pipeline steps that sit between the seeder
// and the PR: the guard (check-seed-manifest.mjs) and the R2 uploader
// (upload-videos-r2.mjs). Both are run as subprocesses against a fabricated
// batch tree via NODETOOL_SEED_OUT_DIR, so no seeder run or Cloudflare creds are
// needed.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPTS = resolve(__dirname, "..");
const GUARD = join(SCRIPTS, "check-seed-manifest.mjs");
const UPLOADER = join(SCRIPTS, "upload-videos-r2.mjs");

let OUT;

beforeEach(() => {
  OUT = mkdtempSync(join(tmpdir(), "seed-guard-"));
});
afterEach(() => {
  rmSync(OUT, { recursive: true, force: true });
});

/** Write one batch dir with a manifest.jsonl (and any asset files). */
function writeBatch(batch, rows, assets = {}) {
  const dir = join(OUT, batch);
  mkdirSync(join(dir, "assets"), { recursive: true });
  writeFileSync(
    join(dir, "manifest.jsonl"),
    rows.map((r) => JSON.stringify(r)).join("\n") + "\n"
  );
  for (const [rel, bytes] of Object.entries(assets)) {
    writeFileSync(join(dir, rel), bytes);
  }
}

function run(script, args, extraEnv = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    env: { ...process.env, NODETOOL_SEED_OUT_DIR: OUT, ...extraEnv },
    encoding: "utf-8"
  });
}

function imageRow(id, costUsd) {
  return {
    id,
    batch: "b",
    template: "movie-posters",
    category: "image",
    provider: "fal_ai",
    model: "fal-ai/flux/schnell",
    modelSlug: "flux-schnell",
    prompt: "a neon cyberpunk street at night with rain",
    promptNormalized: "a neon cyberpunk street at night with rain",
    hash: `${id}hash`,
    mediaType: "image",
    asset: `assets/${id}.png`,
    width: null,
    height: null,
    bytes: 100,
    costUsd,
    createdAt: "2026-07-05T00:00:00.000Z"
  };
}

function videoRow(id, costUsd) {
  return { ...imageRow(id, costUsd), mediaType: "video", asset: `assets/${id}.mp4` };
}

test("guard passes when rows exist and every batch is within cap", () => {
  writeBatch("movie-posters-1", [imageRow("a", 1), imageRow("b", 1)]);
  const r = run(GUARD, ["--budget-usd", "5"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /guard passed/);
});

test("guard fails (no PR) when there are zero manifest rows", () => {
  // A batch dir with an empty manifest → 0 rows total.
  writeBatch("empty-1", []);
  const r = run(GUARD, ["--budget-usd", "5"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /0 manifest rows/);
});

test("guard fails (no PR) when there are no batches at all", () => {
  const r = run(GUARD, ["--budget-usd", "5"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /0 manifest rows/);
});

test("guard fails when a batch's summed cost exceeds the cap", () => {
  writeBatch("pricey-1", [imageRow("a", 4), imageRow("b", 4)]); // $8 > $5
  const r = run(GUARD, ["--budget-usd", "5"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /OVER CAP|> cap/);
});

test("guard evaluates the cap per-batch, not across the whole run", () => {
  // Two batches each at $4 (within a $5 cap) — total $8 must NOT trip the cap.
  writeBatch("a-1", [imageRow("a", 4)]);
  writeBatch("b-1", [imageRow("b", 4)]);
  const r = run(GUARD, ["--budget-usd", "5"]);
  assert.equal(r.status, 0, r.stderr);
});

test("uploader rewrites local video rows to R2 URLs and leaves images local", () => {
  writeBatch(
    "trailers-1",
    [videoRow("vid", 2), imageRow("img", 1)],
    { "assets/vid.mp4": Buffer.from("fake-mp4"), "assets/img.png": Buffer.from("fake-png") }
  );
  // Stub wrangler with `true` (ignores args, exits 0) — no Cloudflare creds.
  const r = run(UPLOADER, [], {
    NODETOOL_WRANGLER_CMD: "true",
    R2_BUCKET: "test-bucket",
    R2_PUBLIC_BASE: "https://media.example.com/"
  });
  assert.equal(r.status, 0, r.stderr);

  const rows = readFileSync(join(OUT, "trailers-1", "manifest.jsonl"), "utf-8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  const vid = rows.find((x) => x.id === "vid");
  const img = rows.find((x) => x.id === "img");
  // Video asset rewritten to the R2 public URL (trailing slash normalized).
  assert.equal(vid.asset, "https://media.example.com/showcase/trailers-1/vid.mp4");
  // Image row untouched — it commits into the repo, not R2.
  assert.equal(img.asset, "assets/img.png");
});

test("uploader is idempotent — an already-uploaded video URL is skipped", () => {
  const already = { ...videoRow("vid", 2), asset: "https://media.example.com/showcase/x/vid.mp4" };
  writeBatch("trailers-2", [already]);
  const r = run(UPLOADER, [], { NODETOOL_WRANGLER_CMD: "true" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /1 skipped/);
});

test("uploader --dry-run performs no manifest rewrite", () => {
  writeBatch("trailers-3", [videoRow("vid", 2)], { "assets/vid.mp4": Buffer.from("x") });
  const r = run(UPLOADER, ["--dry-run"], { NODETOOL_WRANGLER_CMD: "true" });
  assert.equal(r.status, 0, r.stderr);
  const raw = readFileSync(join(OUT, "trailers-3", "manifest.jsonl"), "utf-8");
  assert.match(raw, /"asset":"assets\/vid\.mp4"/);
});
