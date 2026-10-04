#!/usr/bin/env node
/**
 * Refresh `packages/model-pricing/src/generated/model-rankings.json` from the
 * Artificial Analysis media leaderboards — the nightly source of the per-task
 * quality rankings behind `getModelRank` / `rankedForTask`.
 *
 * The canonical id is the leaderboard's own `slug`. The route universe is what
 * NodeTool's providers list (`rankings/routes.mjs`): each AA row is matched to
 * the `<provider>:<model_id>` routes whose id or name answers to the row's exact
 * key (`rankings/match.mjs`), and every matched route is written under its
 * `<provider_id>:<model_id>` key — so runtime does no matching at all and every
 * route to one model carries identical tasks. No pricing catalog is read: a
 * model needs a provider route, and nothing else, to be ranked.
 *
 * Fails closed. A leaderboard whose response is not the documented shape, or
 * that parses to no rows, drops that task from the artifact and is named in the
 * run report. A row that matches no route, or reaches a route another model also
 * reaches, is reported and dropped — never guessed. Pin or block the stragglers
 * in `scripts/rankings/aliases.json`.
 *
 *   node scripts/sync-model-rankings.mjs            # rewrite the artifact
 *   node scripts/sync-model-rankings.mjs --check    # exit 1 if out of date
 *   node scripts/sync-model-rankings.mjs --report r.json
 *   node scripts/sync-model-rankings.mjs --from-dir fixtures/   # <task>.json each
 *
 * Needs `ARTIFICIAL_ANALYSIS_API_KEY` unless `--from-dir` is given. Without one
 * the run is a no-op that exits 0: a fork's CI has no secret, and a missing key
 * is not a broken pipeline. It also needs `npm run build:packages` first: the
 * route universe is read from the built `@nodetool-ai/runtime` providers.
 *
 * Rankings via artificialanalysis.ai.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LEADERBOARDS,
  leaderboardUrl,
  parseLeaderboard
} from "./rankings/leaderboards.mjs";
import { buildRouteIndex, matchRow } from "./rankings/match.mjs";
import { loadProviderRoutes } from "./rankings/routes.mjs";
import { normalize } from "./rankings/model-keys.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUT = join(
  ROOT,
  "packages/model-pricing/src/generated/model-rankings.json"
);
const ALIASES_PATH = join(ROOT, "scripts/rankings/aliases.json");

export const SOURCE = "artificialanalysis.ai";
export const SCHEMA_VERSION = 1;

const USAGE = `Usage: node scripts/sync-model-rankings.mjs [options]

  --check              re-derive and exit 1 when the shipped artifact disagrees
  --out <path>         artifact path (default: ${DEFAULT_OUT})
  --from-dir <dir>     read <task>.json fixtures instead of calling the API
  --report <path>      write the match report as JSON
  --help               this text
`;

/**
 * Per-task rankings for every provider route a leaderboard row resolved to.
 *
 * A row's canonical id is its AA `slug` (its normalized name when it has none).
 * The first leaderboard to name a route names it, in `LEADERBOARDS` order — AA
 * spells one model the same way across its arenas, so the choice only matters
 * when it does not, and then the first is as good as any. A later leaderboard
 * that names the same route differently is reported as a canonical conflict;
 * its rank still attaches, since the route is the same model.
 *
 * Within one leaderboard a route can be reached by several rows. Rows of one
 * slug (a model listed at two resolutions, say) collide: the better rank wins
 * and the loser is reported. Rows of different slugs are ambiguous: the route
 * is dropped for all of them, since either rank would be a guess. A route a
 * maintainer pinned in `aliases.json` outranks any key match on it.
 */
export function collectRankings({ leaderboards, index, aliases }) {
  const byRoute = new Map();
  const report = {
    tasks: [],
    unmatched: [],
    ambiguous: [],
    blocked: [],
    collisions: [],
    canonicalConflicts: [],
    droppedRows: []
  };

  for (const board of leaderboards) {
    const taskReport = {
      task: board.task,
      rows: board.rows.length,
      matched: 0,
      routes: 0,
      error: board.error ?? null
    };
    for (const row of board.dropped ?? []) {
      report.droppedRows.push({ task: board.task, ...row });
    }
    if (board.error) {
      report.tasks.push(taskReport);
      continue;
    }

    // 1. Resolve every row, and gather who claims each route.
    const claims = new Map();
    const resolvedRows = [];
    for (const row of board.rows) {
      const resolved = matchRow(row, index, aliases, board.task);
      const entry = {
        task: board.task,
        name: row.name,
        slug: row.slug ?? "",
        ...(resolved.detail ? { detail: resolved.detail } : {})
      };
      if (resolved.routes.length === 0) {
        if (resolved.reason === "blocked") report.blocked.push(entry);
        else report.unmatched.push({ ...entry, reason: resolved.reason });
        continue;
      }
      const canonical = row.slug ?? normalize(row.name);
      const claim = { row, canonical, pinned: resolved.match === "alias" };
      resolvedRows.push({ ...claim, entry, dropped: [] });
      for (const routeKey of resolved.routes) {
        const list = claims.get(routeKey) ?? [];
        list.push(resolvedRows[resolvedRows.length - 1]);
        claims.set(routeKey, list);
      }
    }

    // 2. Settle each route: pins first, then one slug, or ambiguity.
    const winners = new Map();
    for (const [routeKey, all] of claims) {
      const pinned = all.filter((c) => c.pinned);
      const active = pinned.length > 0 ? pinned : all;
      const slugs = new Set(active.map((c) => c.canonical));
      if (slugs.size > 1) {
        for (const c of active) {
          const others = active.filter((o) => o !== c).map((o) => o.row.name);
          c.dropped.push(`${routeKey} (also claimed by ${others.join(", ")})`);
        }
        continue;
      }
      const best = active.reduce((a, b) => (b.row.rank < a.row.rank ? b : a));
      for (const c of active) {
        if (c === best) continue;
        report.collisions.push({
          task: board.task,
          canonical: c.canonical,
          route: routeKey,
          dropped: c.row.name
        });
      }
      winners.set(routeKey, best);
    }

    // 3. Record what survived.
    for (const resolvedRow of resolvedRows) {
      if (resolvedRow.dropped.length > 0) {
        report.ambiguous.push({
          ...resolvedRow.entry,
          detail: resolvedRow.dropped.join("; ")
        });
      }
    }
    const matchedRows = new Set();
    for (const [routeKey, winner] of winners) {
      const { row, canonical } = winner;
      const model = byRoute.get(routeKey) ?? {
        canonical,
        name: row.name,
        ...(row.creator ? { creator: row.creator } : {}),
        tasks: {}
      };
      if (model.canonical !== canonical) {
        report.canonicalConflicts.push({
          task: board.task,
          route: routeKey,
          kept: model.canonical,
          other: canonical
        });
      }
      model.tasks[board.task] = {
        score: row.score,
        normalized: row.normalized,
        rank: row.rank,
        of: row.of
      };
      byRoute.set(routeKey, model);
      matchedRows.add(winner);
      taskReport.routes += 1;
    }
    taskReport.matched = matchedRows.size;
    report.tasks.push(taskReport);
  }

  return { byRoute, report };
}

/**
 * The whole artifact. `generatedAt` is carried over from `previous` when the
 * models are byte-identical, so a nightly run where no rank moved produces no
 * diff and the timestamp keeps meaning "when the rankings last moved".
 */
export function buildRankings({
  leaderboards,
  index,
  aliases,
  previous,
  nowIso
}) {
  const { byRoute, report } = collectRankings({ leaderboards, index, aliases });
  const models = {};
  for (const key of [...byRoute.keys()].sort()) {
    const model = byRoute.get(key);
    models[key] = {
      canonical: model.canonical,
      name: model.name,
      ...(model.creator ? { creator: model.creator } : {}),
      tasks: { ...model.tasks }
    };
  }
  const unchanged =
    previous && JSON.stringify(previous.models ?? {}) === JSON.stringify(models);
  const artifact = {
    schemaVersion: SCHEMA_VERSION,
    source: SOURCE,
    generatedAt: unchanged ? previous.generatedAt ?? null : nowIso,
    models
  };
  const canonical = new Set(Object.values(models).map((m) => m.canonical));
  return {
    artifact,
    report: {
      ...report,
      canonicalModels: canonical.size,
      routes: Object.keys(models).length
    }
  };
}

/** Fetch one leaderboard, retrying transient failures the way the price sync does. */
async function fetchLeaderboard(board, { apiKey, attempts = 3 } = {}) {
  const url = leaderboardUrl(board.path);
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "nodetool-rankings/1.0 (+https://nodetool.ai)",
          Accept: "application/json",
          "x-api-key": apiKey
        },
        signal: AbortSignal.timeout(30_000)
      });
      if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastError = err;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
      }
    }
  }
  throw lastError;
}

/**
 * Every leaderboard, parsed. A task whose fetch fails is not a failed run: it
 * drops out of the artifact and is reported, exactly as an unreadable body is.
 */
async function loadLeaderboards({ apiKey, fromDir }) {
  const boards = [];
  for (const board of LEADERBOARDS) {
    let body;
    try {
      body = fromDir
        ? JSON.parse(readFileSync(join(fromDir, `${board.task}.json`), "utf8"))
        : await fetchLeaderboard(board, { apiKey });
    } catch (err) {
      boards.push({
        task: board.task,
        rows: [],
        dropped: [],
        error: `fetch-failed: ${err instanceof Error ? err.message : err}`
      });
      continue;
    }
    boards.push(parseLeaderboard(board.task, body));
  }
  return boards;
}

function readJson(path, fallback = null) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function parseArgs(argv) {
  const args = { check: false, out: DEFAULT_OUT, fromDir: null, report: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--check") args.check = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--out") args.out = argv[++i];
    else if (arg === "--from-dir") args.fromDir = argv[++i];
    else if (arg === "--report") args.report = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function printRoutes(providers) {
  console.log("Provider routes (the universe rows are matched against):");
  for (const [provider, count] of Object.entries(providers)) {
    console.log(`  ${provider.padEnd(12)} ${String(count).padStart(4)} route(s)`);
  }
  console.log("");
}

function printReport(report) {
  console.log("Leaderboards (rows → rows matched, routes ranked):");
  for (const task of report.tasks) {
    const status = task.error ? `  dropped — ${task.error}` : "";
    console.log(
      `  ${task.task.padEnd(16)} ${String(task.rows).padStart(3)} rows → ${String(
        task.matched
      ).padStart(3)} matched, ${String(task.routes).padStart(3)} routes${status}`
    );
  }
  console.log(
    `\n${report.canonicalModels} canonical model(s) over ${report.routes} provider route(s).`
  );

  const lines = [
    ["unmatched", report.unmatched],
    ["ambiguous", report.ambiguous],
    ["blocked", report.blocked]
  ];
  for (const [label, entries] of lines) {
    if (entries.length === 0) continue;
    console.log(
      `\n${entries.length} ${label} leaderboard row(s) — pin or block them in scripts/rankings/aliases.json (a pin is a route key such as fal_ai:fal-ai/flux-2/pro):`
    );
    for (const entry of entries) {
      const detail = entry.detail ? `  (${entry.detail})` : "";
      console.log(`  ${entry.task.padEnd(16)} ${entry.name}${detail}`);
    }
  }
  for (const row of report.droppedRows) {
    console.log(`  dropped row ${row.task.padEnd(16)} ${row.name} — ${row.reason}`);
  }
  for (const clash of report.collisions) {
    console.log(
      `  collision ${clash.task.padEnd(16)} ${clash.route} (${clash.canonical}) — dropped ${clash.dropped}`
    );
  }
  for (const clash of report.canonicalConflicts) {
    console.log(
      `  conflict  ${clash.task.padEnd(16)} ${clash.route} — kept ${clash.kept}, also named ${clash.other}`
    );
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return;
  }

  const apiKey = process.env.ARTIFICIAL_ANALYSIS_API_KEY ?? "";
  if (!args.fromDir && !apiKey) {
    console.log(
      "skipped: no ARTIFICIAL_ANALYSIS_API_KEY — nothing fetched, artifact left as shipped."
    );
    return;
  }

  const { routes, providers } = await loadProviderRoutes();
  const index = buildRouteIndex(routes);
  if (index.routes.size === 0) {
    throw new Error("No provider routes listed — run `npm run build:packages` first");
  }
  printRoutes(providers);

  const aliases = readJson(ALIASES_PATH, { models: {} });
  const leaderboards = await loadLeaderboards({ apiKey, fromDir: args.fromDir });
  const previous = readJson(args.out);
  const { artifact, report } = buildRankings({
    leaderboards,
    index,
    aliases,
    previous,
    nowIso: new Date().toISOString()
  });

  if (Object.keys(artifact.models).length === 0) {
    throw new Error(
      "No leaderboard row matched a provider route — refusing to write an empty artifact"
    );
  }

  if (args.report) {
    mkdirSync(dirname(args.report), { recursive: true });
    writeFileSync(args.report, `${JSON.stringify(report, null, 2)}\n`);
  }

  printReport(report);

  const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
  const current = readJson(args.out) === null ? null : readFileSync(args.out, "utf8");

  if (args.check) {
    if (current !== serialized) {
      console.error(
        `\n${args.out} is out of date — run \`npm run sync:model-rankings\`.`
      );
      process.exit(1);
    }
    console.log(`\n${args.out} is up to date (${report.routes} routes).`);
    return;
  }

  if (current === serialized) {
    console.log(`\nNo ranking changes (${report.routes} routes).`);
    return;
  }

  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, serialized);
  console.log(
    `\nWrote ${args.out}: ${report.routes} routes over ${report.canonicalModels} canonical models.`
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
