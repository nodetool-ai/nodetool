// @ts-nocheck
/**
 * Model watcher — flag provider models that NodeTool has no /models page for.
 *
 * For each provider that ships a model manifest, run
 * `nodetool generate <provider> --list-models --json` and diff the returned
 * model ids against two things:
 *   1. `marketing/src/data/modelProviderCoverage.generated.ts` — the launch
 *      model slugs (seedance, flux, imagen, …). An id that contains a launch
 *      slug is already covered by a page.
 *   2. `model-watch.watchlist.json` — ids a maintainer has decided NOT to page.
 * Anything left over is a **new** model: a signal (not content) that a page
 * might be worth writing. The report is machine-readable and consumed by OPS-2
 * (`.github/workflows/model-watch.yml`), which opens one issue per provider
 * batch with a pre-filled seed command.
 *
 * There is no API-key-free path for every provider, so this runs where keys are
 * configured — CI secrets or a maintainer machine.
 *
 * Usage (from repo root or marketing/):
 *   node marketing/scripts/model-watch.mjs                 # print JSON report
 *   node marketing/scripts/model-watch.mjs --provider fal_ai
 *   node marketing/scripts/model-watch.mjs --pretty        # human summary to stderr too
 *   node marketing/scripts/model-watch.mjs --out report.json
 *   node marketing/scripts/model-watch.mjs --input fixture.json   # skip the CLI, read model lists
 *
 * The CLI invocation defaults to `npm run dev:nodetool -- generate …` run from
 * the repo root. Override with NODETOOL_MODEL_WATCH_CLI (a shell prefix), e.g.
 *   NODETOOL_MODEL_WATCH_CLI="node packages/cli/dist/index.js"
 */

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MARKETING_DIR = resolve(__dirname, "..");
const REPO_ROOT = resolve(MARKETING_DIR, "..");
const COVERAGE_FILE = resolve(
  MARKETING_DIR,
  "src",
  "data",
  "modelProviderCoverage.generated.ts"
);
const WATCHLIST_FILE = resolve(__dirname, "model-watch.watchlist.json");

/**
 * Providers whose node package ships a model manifest — the exact set
 * `generate --list-models` can enumerate. Mirrors the PROVIDERS list in
 * generate-model-coverage.mjs (both derive from the same manifests).
 */
const PROVIDERS = ["fal_ai", "replicate", "kie", "together", "atlascloud", "topaz"];

// ---------------------------------------------------------------------------
// Pure helpers (exported for the test — no I/O, no CLI).
// ---------------------------------------------------------------------------

/** Extract the launch-model slugs (object keys) from the generated coverage TS. */
export function parseCoverageSlugs(tsSource) {
  const open = tsSource.indexOf("{");
  const close = tsSource.lastIndexOf("}");
  if (open === -1 || close === -1) return [];
  const body = tsSource.slice(open + 1, close);
  const slugs = [];
  // Keys look like `  "flux": [...]` — a quoted string immediately before a colon.
  const re = /"([^"]+)"\s*:/g;
  let m;
  while ((m = re.exec(body))) slugs.push(m[1]);
  return slugs;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Does `text` contain the launch slug as a token (not an accidental substring)?
 * "flux" matches "fal-ai/flux/schnell" but not "influx"; "veo-3" also matches
 * "veo3" / "veo 3" (the de-hyphenated variants the coverage generator keys on).
 */
export function matchesSlug(text, slug) {
  const hay = String(text).toLowerCase();
  const needles = new Set([slug, slug.replace(/-/g, ""), slug.replace(/-/g, " ")]);
  for (const n of needles) {
    if (!n) continue;
    const re = new RegExp(`(?:^|[^a-z0-9])${escapeRe(n)}(?:[^a-z0-9]|$)`);
    if (re.test(hay)) return true;
  }
  return false;
}

/** Normalize the watchlist JSON into { all:Set, byProvider:Map<string,Set> }. */
export function loadWatchlist(json) {
  const all = new Set((json?.all ?? []).map((s) => String(s).toLowerCase()));
  const byProvider = new Map();
  for (const [prov, ids] of Object.entries(json?.providers ?? {})) {
    byProvider.set(prov, new Set((ids ?? []).map((s) => String(s).toLowerCase())));
  }
  return { all, byProvider };
}

function isIgnored(providerId, modelId, watchlist) {
  const id = String(modelId).toLowerCase();
  if (watchlist.all.has(id)) return true;
  return watchlist.byProvider.get(providerId)?.has(id) ?? false;
}

function isCovered(model, knownSlugs) {
  const id = model.id ?? "";
  const name = model.name ?? "";
  return knownSlugs.some((s) => matchesSlug(id, s) || matchesSlug(name, s));
}

/** A best-effort seed slug for the pre-filled command (last path segment). */
export function deriveSeedSlug(modelId) {
  const tail = String(modelId).split("/").pop() ?? String(modelId);
  return tail
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function seedCommand(providerId, modelId) {
  const slug = deriveSeedSlug(modelId);
  return `npx tsx marketing/seo/seed.ts --template <template> --models ${slug} --provider ${providerId} --count 5`;
}

/**
 * Split one provider's model list into covered / ignored / new.
 * `models` is the array from `--list-models --json` ({ id, name }).
 */
export function classifyProvider(providerId, models, knownSlugs, watchlist) {
  const fresh = [];
  let covered = 0;
  let ignored = 0;
  for (const model of models) {
    if (isIgnored(providerId, model.id, watchlist)) {
      ignored += 1;
    } else if (isCovered(model, knownSlugs)) {
      covered += 1;
    } else {
      fresh.push({
        id: model.id,
        name: model.name ?? null,
        seedCommand: seedCommand(providerId, model.id),
      });
    }
  }
  return {
    provider: providerId,
    ok: true,
    totalModels: models.length,
    covered,
    ignored,
    newCount: fresh.length,
    new: fresh,
  };
}

// ---------------------------------------------------------------------------
// I/O + CLI orchestration.
// ---------------------------------------------------------------------------

/** Run the CLI for one provider, returning its parsed `{ provider, models }`. */
function listModels(providerId) {
  const override = process.env.NODETOOL_MODEL_WATCH_CLI;
  const args = ["generate", providerId, "--list-models", "--json"];
  const run = override
    ? spawnSync(`${override} ${args.join(" ")}`, {
        cwd: REPO_ROOT,
        shell: true,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      })
    : spawnSync("npm", ["run", "dev:nodetool", "--", ...args], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      });

  if (run.error) {
    return { ok: false, error: run.error.message };
  }
  const parsed = extractJson(run.stdout ?? "");
  if (!parsed) {
    const stderr = (run.stderr ?? "").trim().split("\n").slice(-4).join("\n");
    return {
      ok: false,
      error: `could not parse model list (exit ${run.status})${stderr ? `: ${stderr}` : ""}`,
    };
  }
  return { ok: true, models: Array.isArray(parsed.models) ? parsed.models : [] };
}

/** Pull the JSON object out of CLI stdout, tolerating leading/trailing noise. */
function extractJson(stdout) {
  const text = stdout.trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const open = text.indexOf("{");
    const close = text.lastIndexOf("}");
    if (open === -1 || close <= open) return null;
    try {
      return JSON.parse(text.slice(open, close + 1));
    } catch {
      return null;
    }
  }
}

function parseArgs(argv) {
  const opts = { providers: null, pretty: false, out: null, input: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--pretty") opts.pretty = true;
    else if (a === "--provider") opts.providers = [argv[++i]];
    else if (a === "--out") opts.out = argv[++i];
    else if (a === "--input") opts.input = argv[++i];
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  const knownSlugs = existsSync(COVERAGE_FILE)
    ? parseCoverageSlugs(readFileSync(COVERAGE_FILE, "utf8"))
    : [];
  const watchlist = loadWatchlist(
    existsSync(WATCHLIST_FILE)
      ? JSON.parse(readFileSync(WATCHLIST_FILE, "utf8"))
      : {}
  );

  const providerIds = opts.providers ?? PROVIDERS;

  // `--input`: read `{ "<provider>": [ {id,name}, … ] }` instead of the CLI.
  const fixture = opts.input
    ? JSON.parse(readFileSync(resolve(process.cwd(), opts.input), "utf8"))
    : null;

  const results = [];
  for (const providerId of providerIds) {
    if (opts.pretty) process.stderr.write(`Checking ${providerId} …\n`);
    const listed = fixture
      ? { ok: true, models: fixture[providerId] ?? [] }
      : listModels(providerId);
    if (!listed.ok) {
      results.push({ provider: providerId, ok: false, error: listed.error });
      continue;
    }
    results.push(classifyProvider(providerId, listed.models, knownSlugs, watchlist));
  }

  const report = {
    tool: "model-watch",
    knownSlugs,
    providers: results,
    newCount: results.reduce((n, r) => n + (r.newCount ?? 0), 0),
    errorCount: results.filter((r) => r.ok === false).length,
  };

  const json = JSON.stringify(report, null, 2);
  if (opts.out) {
    writeFileSync(resolve(process.cwd(), opts.out), json + "\n");
    if (opts.pretty) process.stderr.write(`Wrote ${opts.out}\n`);
  } else {
    process.stdout.write(json + "\n");
  }

  if (opts.pretty) {
    for (const r of results) {
      if (r.ok === false) {
        process.stderr.write(`  ${r.provider}: ERROR — ${r.error}\n`);
      } else {
        process.stderr.write(
          `  ${r.provider}: ${r.newCount} new / ${r.totalModels} total ` +
            `(${r.covered} covered, ${r.ignored} ignored)\n`
        );
      }
    }
    process.stderr.write(`Total new models: ${report.newCount}\n`);
  }
}

// Run only when invoked directly, so the test can import the pure helpers.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
