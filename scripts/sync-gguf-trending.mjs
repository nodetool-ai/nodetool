#!/usr/bin/env node
/**
 * Refresh `packages/runtime/src/providers/node-llama-cpp-trending.generated.ts`
 * from the trending GGUF repos on Hugging Face
 * (https://huggingface.co/models?library=gguf&sort=trending). The llama.cpp
 * provider lists these models after its curated ones, with a Download button.
 *
 * The selection rules are in `scripts/gguf/sources.json`: trusted publishers
 * only, no uncensored or merged variants, chat models only, and one
 * single-file quantization under a size cap. See `scripts/gguf/select.mjs`.
 *
 *   node scripts/sync-gguf-trending.mjs                    # rewrite the module
 *   node scripts/sync-gguf-trending.mjs --report r.json    # also write a report
 *
 * Needs no API key. A failed request exits 1 and leaves the module unchanged.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderModule, selectTrending } from "./gguf/select.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "packages/runtime/src/providers/node-llama-cpp-trending.generated.ts");
const RULES = JSON.parse(readFileSync(join(ROOT, "scripts/gguf/sources.json"), "utf8"));
const API = "https://huggingface.co/api/models";
// The API's trending sort; the website's `sort=trending` maps to it.
const LIST_URL =
  `${API}?filter=gguf&sort=trendingScore&direction=-1&limit=1000` +
  "&expand[]=pipeline_tag&expand[]=gguf&expand[]=trendingScore";

async function getJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`GET ${url} failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function main() {
  const reportIndex = process.argv.indexOf("--report");
  const reportPath = reportIndex > 0 ? process.argv[reportIndex + 1] : null;

  const repos = await getJson(LIST_URL);
  if (!Array.isArray(repos) || repos.length === 0) {
    throw new Error("The trending GGUF list is empty or not an array.");
  }
  const { models, skipped } = await selectTrending(repos, RULES, (repoId) =>
    getJson(`${API}/${repoId}/tree/main?recursive=true`)
  );
  if (models.length === 0) {
    throw new Error("No trending GGUF repo passed the rules. The module is left unchanged.");
  }

  const next = renderModule(models);
  const current = readFileSync(OUT, "utf8");
  if (next !== current) {
    writeFileSync(OUT, next);
  }
  console.log(`${next === current ? "Unchanged" : "Updated"}: ${models.length} trending GGUF models.`);
  for (const model of models) {
    console.log(`  ${model.repoId}/${model.file}`);
  }
  if (reportPath) {
    writeFileSync(reportPath, `${JSON.stringify({ models, skipped }, null, 2)}\n`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
