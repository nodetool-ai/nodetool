// @ts-nocheck
/**
 * Fetch each provider's logo (favicon) and store it under
 * `marketing/public/providers/<id>.png` for the /providers landing pages.
 *
 * Source: Google's public favicon service, which reliably returns a PNG for any
 * domain (direct provider-site icons are inconsistent — 403/404 across hosts).
 * The map below is the source of truth for provider → domain; keep it in sync
 * with `providerEntries.ts`. Re-run when a provider is added:
 *   node marketing/scripts/fetch-provider-logos.mjs
 * (wired as `npm run seo:provider-logos`). Committed output means the build
 * never depends on network access.
 */

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "..", "public", "providers");

/** provider id → primary domain (favicon source). */
const PROVIDER_DOMAINS = {
  // aggregators
  fal_ai: "fal.ai",
  replicate: "replicate.com",
  kie: "kie.ai",
  together: "together.ai",
  atlascloud: "atlascloud.ai",
  topaz: "topazlabs.com",
  // direct LLM APIs
  anthropic: "anthropic.com",
  openai: "openai.com",
  gemini: "gemini.google.com",
  xai: "x.ai",
  mistral: "mistral.ai",
  groq: "groq.com",
  deepseek: "deepseek.com",
  cohere: "cohere.com",
  openrouter: "openrouter.ai",
  huggingface: "huggingface.co",
  cerebras: "cerebras.ai",
  moonshot: "moonshot.ai",
  // media specialists
  elevenlabs: "elevenlabs.io",
  reve: "reve.art",
  meshy: "meshy.ai",
  rodin: "hyper3d.ai",
  minimax: "minimax.io",
};

const SIZE = 128;
const favicon = (domain) =>
  `https://www.google.com/s2/favicons?domain=${domain}&sz=${SIZE}`;

async function fetchLogo(id, domain, { force }) {
  const dest = resolve(OUT_DIR, `${id}.png`);
  if (existsSync(dest) && !force) {
    return { id, status: "skip" };
  }
  const res = await fetch(favicon(domain));
  if (!res.ok) return { id, status: `http ${res.status}` };
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100) return { id, status: "too small" };
  writeFileSync(dest, buf);
  return { id, status: `ok ${buf.length}b` };
}

async function main() {
  const force = process.argv.includes("--force");
  mkdirSync(OUT_DIR, { recursive: true });
  const entries = Object.entries(PROVIDER_DOMAINS);
  const results = await Promise.all(
    entries.map(([id, domain]) =>
      fetchLogo(id, domain, { force }).catch((e) => ({
        id,
        status: `error ${e.message}`,
      }))
    )
  );
  for (const r of results.sort((a, b) => a.id.localeCompare(b.id))) {
    console.log(`  ${r.id.padEnd(14)} ${r.status}`);
  }
  const failed = results.filter((r) => /^http|error|too small/.test(r.status));
  if (failed.length) {
    console.error(`\n${failed.length} logo(s) failed: ${failed.map((f) => f.id).join(", ")}`);
    process.exitCode = 1;
  }
}

main();
