/**
 * Video → R2 uploader — the last step before ingest for video batches.
 *
 * Images commit into the repo (`marketing/public/showcase/**`); videos are too
 * heavy for git, so they live in Cloudflare R2 behind the media domain. This
 * walks every `marketing/seo/out/<batch>/manifest.jsonl`, and for each row with
 * `mediaType: "video"` whose `asset` is still a LOCAL path:
 *   1. `wrangler r2 object put <bucket>/showcase/<batch>/<file> --file <local>`
 *   2. rewrites the manifest row's `asset` to `<R2_PUBLIC_BASE>/showcase/...`.
 *
 * After this, `ingest-showcase.mjs` sees an absolute http(s) URL and passes it
 * through untouched (its documented URL-vs-local branch), so the video is NOT
 * copied into the repo — only images commit in-repo. Rows already carrying a
 * URL (a re-run) are skipped. Image rows are left alone.
 *
 * Config (env, with defaults matching the OPS-1 workflow):
 *   R2_BUCKET             R2 bucket name           (default: nodetool-media)
 *   R2_PUBLIC_BASE        public media base URL    (default: https://media.nodetool.ai)
 *   CLOUDFLARE_API_TOKEN  wrangler auth (required for a real upload)
 *   CLOUDFLARE_ACCOUNT_ID wrangler account
 *
 * Usage (from repo root or marketing/):
 *   node marketing/scripts/upload-videos-r2.mjs
 *   node marketing/scripts/upload-videos-r2.mjs --batch product-trailers-20260705-42
 *   node marketing/scripts/upload-videos-r2.mjs --dry-run   # no upload, no manifest rewrite
 *
 * Testing hook: set NODETOOL_WRANGLER_CMD to a shell prefix that replaces
 * `wrangler` (e.g. a stub that records its args), so the pipeline can be
 * exercised without Cloudflare credentials.
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MARKETING_DIR = resolve(__dirname, "..");
// NODETOOL_SEED_OUT_DIR overrides the batch root (tests point it at a temp dir).
const OUT_DIR = process.env.NODETOOL_SEED_OUT_DIR
  ? resolve(process.env.NODETOOL_SEED_OUT_DIR)
  : join(MARKETING_DIR, "seo", "out");

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes("--dry-run");

function argFlag(name) {
  const i = argv.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < argv.length) return argv[i + 1];
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.split("=").slice(1).join("=") : null;
}

const BATCH_FILTER = argFlag("batch");
const R2_BUCKET = process.env.R2_BUCKET || "nodetool-media";
const R2_PUBLIC_BASE = (
  process.env.R2_PUBLIC_BASE || "https://media.nodetool.ai"
).replace(/\/+$/, "");

function isHttpUrl(s) {
  return /^https?:\/\//i.test(s);
}

function listBatches() {
  if (!existsSync(OUT_DIR)) return [];
  return readdirSync(OUT_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => !BATCH_FILTER || name === BATCH_FILTER)
    .filter((name) => existsSync(join(OUT_DIR, name, "manifest.jsonl")));
}

/** Upload one local file to R2 at `key`. Throws if wrangler exits non-zero. */
function wranglerPut(key, filePath) {
  const prefix = process.env.NODETOOL_WRANGLER_CMD || "npx wrangler";
  const [cmd, ...prefixArgs] = prefix.split(/\s+/).filter(Boolean);
  const args = [
    ...prefixArgs,
    "r2",
    "object",
    "put",
    `${R2_BUCKET}/${key}`,
    "--file",
    filePath,
    "--remote"
  ];
  const res = spawnSync(cmd, args, {
    stdio: "inherit",
    cwd: MARKETING_DIR,
    env: process.env
  });
  if (res.status !== 0) {
    throw new Error(
      `wrangler r2 object put ${R2_BUCKET}/${key} failed (exit ${res.status ?? "signal"})`
    );
  }
}

function main() {
  const batches = listBatches();
  if (batches.length === 0) {
    console.error(
      `[upload-videos] no batches under ${OUT_DIR}` +
        (BATCH_FILTER ? ` matching "${BATCH_FILTER}"` : "")
    );
    return;
  }

  let uploaded = 0;
  let skipped = 0;

  for (const batch of batches) {
    const manifestFile = join(OUT_DIR, batch, "manifest.jsonl");
    const rows = readFileSync(manifestFile, "utf-8")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => JSON.parse(l));

    let changed = false;
    for (const row of rows) {
      if (row.mediaType !== "video") continue;
      if (isHttpUrl(row.asset)) {
        skipped++; // already uploaded (re-run)
        continue;
      }
      const localPath = join(OUT_DIR, batch, row.asset);
      if (!existsSync(localPath)) {
        console.warn(
          `  ! missing local video ${row.asset} in ${batch} — skipped`
        );
        skipped++;
        continue;
      }
      const file = row.asset.split("/").pop();
      const key = `showcase/${batch}/${file}`;
      const url = `${R2_PUBLIC_BASE}/${key}`;
      if (DRY_RUN) {
        console.error(`  (dry-run) would upload ${localPath} → ${url}`);
      } else {
        wranglerPut(key, localPath);
        row.asset = url;
        changed = true;
        console.error(`  ✓ ${row.id} → ${url}`);
      }
      uploaded++;
    }

    if (changed && !DRY_RUN) {
      writeFileSync(
        manifestFile,
        rows.map((r) => JSON.stringify(r)).join("\n") + "\n"
      );
    }
  }

  console.error(
    `[upload-videos] ${DRY_RUN ? "(dry-run) " : ""}${uploaded} uploaded, ${skipped} skipped`
  );
}

try {
  main();
} catch (e) {
  console.error(`\n❌ ${e.message}`);
  process.exit(1);
}
