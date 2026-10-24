#!/usr/bin/env node
/**
 * Report models a provider's own catalog lists that NodeTool does not ship.
 *
 * The FAL and Replicate generators build nodes only for the ids in their
 * `src/configs/` allowlists, and the Gemini image list is written by hand. A
 * refresh adds what someone noticed was new that week, so a model that was
 * missed once stays missing: nothing else compares the allowlists with the
 * upstream catalogs. (`marketing/scripts/model-watch.mjs` diffs our manifests
 * with our model pages, so it cannot see a model that never got a node.)
 *
 * Upstream catalogs:
 *   fal        GET https://api.fal.ai/v1/models (paged; FAL_API_KEY optional)
 *   replicate  GET https://api.replicate.com/v1/collections/official (REPLICATE_API_TOKEN)
 *   gemini     GET https://generativelanguage.googleapis.com/v1beta/models (GEMINI_API_KEY)
 *
 * KIE needs no entry: kie-codegen builds its configs from docs.kie.ai/llms.txt
 * itself, so running `npm run generate:kie` picks up every listed model.
 *
 * Ids we deliberately skip live in `scripts/provider-gaps/ignore.json`.
 *
 *   node scripts/provider-model-gaps.mjs                       # all providers
 *   node scripts/provider-model-gaps.mjs --provider fal
 *   node scripts/provider-model-gaps.mjs --out gaps.json       # also write the report
 *   node scripts/provider-model-gaps.mjs --check               # exit 1 on any gap
 *
 * A provider whose key is missing or whose catalog request fails is reported
 * with `ok: false` and does not stop the others.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  diffCatalog,
  parseConfigIds,
  parseFalModelsPage,
  parseGeminiImageModels,
  parseGeminiShippedIds,
  parseReplicateCollection
} from "./provider-gaps/gaps.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const IGNORE = JSON.parse(
  readFileSync(join(ROOT, "scripts/provider-gaps/ignore.json"), "utf8")
);

function configIds(dir) {
  const full = join(ROOT, dir);
  return readdirSync(full)
    .filter((name) => name.endsWith(".ts") && name !== "index.ts")
    .flatMap((name) => parseConfigIds(readFileSync(join(full, name), "utf8")));
}

function ignorePatterns(provider) {
  return Object.values(IGNORE[provider] ?? {}).flat();
}

async function getJson(url, headers = {}) {
  const response = await fetch(url, {
    headers: { Accept: "application/json", ...headers }
  });
  if (!response.ok) {
    throw new Error(
      `GET ${url.split("?")[0]} failed: ${response.status} ${response.statusText}`
    );
  }
  return response.json();
}

const PROVIDERS = {
  fal: {
    shipped: () => configIds("packages/fal-codegen/src/configs"),
    async upstream() {
      const key = process.env.FAL_API_KEY ?? process.env.FAL_KEY;
      const headers = key ? { Authorization: `Key ${key}` } : {};
      const ids = [];
      let cursor = null;
      do {
        const query = new URLSearchParams({ limit: "100" });
        if (cursor) query.set("cursor", cursor);
        const page = parseFalModelsPage(
          await getJson(`https://api.fal.ai/v1/models?${query}`, headers)
        );
        ids.push(...page.ids);
        cursor = page.nextCursor;
      } while (cursor);
      return ids;
    }
  },
  replicate: {
    shipped: () => configIds("packages/replicate-codegen/src/configs"),
    async upstream() {
      const token = process.env.REPLICATE_API_TOKEN;
      if (!token) throw new Error("REPLICATE_API_TOKEN is not set");
      const collection = await getJson(
        "https://api.replicate.com/v1/collections/official",
        {
          Authorization: `Bearer ${token}`
        }
      );
      return parseReplicateCollection(collection);
    }
  },
  gemini: {
    shipped: () =>
      parseGeminiShippedIds(
        readFileSync(
          join(ROOT, "packages/runtime/src/providers/gemini-provider.ts"),
          "utf8"
        )
      ),
    async upstream() {
      const key = process.env.GEMINI_API_KEY;
      if (!key) throw new Error("GEMINI_API_KEY is not set");
      const ids = [];
      let pageToken = null;
      do {
        const query = new URLSearchParams({ key, pageSize: "1000" });
        if (pageToken) query.set("pageToken", pageToken);
        const page = await getJson(
          `https://generativelanguage.googleapis.com/v1beta/models?${query}`
        );
        ids.push(...parseGeminiImageModels(page));
        pageToken = page.nextPageToken ?? null;
      } while (pageToken);
      return ids;
    }
  }
};

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index > 0 ? process.argv[index + 1] : null;
}

async function main() {
  const only = argValue("--provider");
  const out = argValue("--out");
  const check = process.argv.includes("--check");
  const names = only ? [only] : Object.keys(PROVIDERS);
  for (const name of names) {
    if (!PROVIDERS[name]) throw new Error(`Unknown provider "${name}"`);
  }

  const providers = [];
  for (const name of names) {
    try {
      const upstream = await PROVIDERS[name].upstream();
      const { missing, ignored } = diffCatalog({
        upstream,
        shipped: PROVIDERS[name].shipped(),
        ignore: ignorePatterns(name)
      });
      providers.push({
        provider: name,
        ok: true,
        upstreamCount: upstream.length,
        ignored,
        missing
      });
      console.error(
        `${name}: ${missing.length} missing of ${upstream.length} upstream (${ignored} ignored)`
      );
      for (const id of missing) console.error(`  ${id}`);
    } catch (error) {
      providers.push({
        provider: name,
        ok: false,
        error: String(error?.message ?? error),
        missing: []
      });
      console.error(`${name}: skipped, ${error?.message ?? error}`);
    }
  }

  const report = { generatedAt: new Date().toISOString(), providers };
  if (out) writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  else console.log(JSON.stringify(report, null, 2));
  if (check && providers.some((p) => p.missing.length > 0)) process.exit(1);
}

await main();
