/**
 * Pure helpers for `scripts/provider-model-gaps.mjs`: read the model ids a
 * provider's catalog lists and the ids NodeTool ships, and diff the two.
 *
 * No I/O here, so the test can feed recorded catalog pages.
 */

/** Ids a codegen config file lists: the `"owner/name": {` keys. */
export function parseConfigIds(source) {
  const ids = [];
  const re = /^\s+"([^"\s]+\/[^"\s]+)":\s*\{/gm;
  let match;
  while ((match = re.exec(source))) ids.push(match[1]);
  return ids;
}

/** Image model ids in `GeminiProvider.getAvailableImageModels()`. */
export function parseGeminiShippedIds(source) {
  const start = source.indexOf("async getAvailableImageModels()");
  if (start === -1) return [];
  const end = source.indexOf("async getAvailableTTSModels()", start);
  const body = source.slice(start, end === -1 ? undefined : end);
  return [...body.matchAll(/\bid:\s*"([^"]+)"/g)].map((m) => m[1]);
}

/** `*` matches any run of characters; everything else is literal. */
export function matchesPattern(id, pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(id);
}

/**
 * Upstream ids that are neither shipped nor ignored, sorted.
 * Returns the ignored count too, so a report shows what the patterns hid.
 */
export function diffCatalog({ upstream, shipped, ignore = [] }) {
  const have = new Set(shipped);
  const missing = [];
  let ignored = 0;
  for (const id of new Set(upstream)) {
    if (have.has(id)) continue;
    if (ignore.some((pattern) => matchesPattern(id, pattern))) {
      ignored++;
      continue;
    }
    missing.push(id);
  }
  return { missing: missing.sort(), ignored };
}

/**
 * One page of `GET https://api.fal.ai/v1/models`. Deprecated endpoints are
 * dropped: shipping them would add nodes that are about to stop working.
 */
export function parseFalModelsPage(page) {
  const ids = (page.models ?? [])
    .filter((model) => model.metadata?.status !== "deprecated")
    .map((model) => model.endpoint_id)
    .filter(Boolean);
  return { ids, nextCursor: page.has_more ? page.next_cursor : null };
}

/** `GET https://api.replicate.com/v1/collections/<slug>`. */
export function parseReplicateCollection(collection) {
  return (collection.models ?? [])
    .filter((model) => model.owner && model.name)
    .map((model) => `${model.owner}/${model.name}`);
}

/**
 * `GET https://generativelanguage.googleapis.com/v1beta/models`, narrowed to
 * the image generators: `generateContent` models whose id names an image line.
 */
export function parseGeminiImageModels(page) {
  return (page.models ?? [])
    .filter((model) => (model.supportedGenerationMethods ?? []).includes("generateContent"))
    .map((model) => String(model.name ?? "").replace(/^models\//, ""))
    .filter((id) => /image|nano-banana/i.test(id));
}
