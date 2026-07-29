/**
 * Resolve a GenSpend offering to the model ids NodeTool actually ships.
 *
 * GenSpend keys models by its own slug (`seedance-2`); a run is priced by the
 * provider-native id on a node's provider-model property
 * (`bytedance/seedance-2.0/text-to-video`). Bridging the two is the whole job
 * here, and it is done two ways, in order of how much they can be trusted:
 *
 *   1. `receipt` — the offering's `sourceUrl` is a model page carrying the
 *      native id (fal, Replicate). Exact, no interpretation.
 *   2. `catalog` — the normalized model name matches a model the provider
 *      itself enumerates in NodeTool (`getAvailableImageModels` and friends).
 *      Exact key equality, never prefix or fuzzy, and only within the same
 *      provider and the same modality.
 *
 * An alias file can pin or block either. Anything left over is reported, not
 * guessed: a wrong number here would gate a run's budget on a price the user
 * never agreed to pay.
 */

import {
  isNonGenerationTask,
  modelKeys,
  normalize
} from "./normalize.mjs";

/**
 * GenSpend provider slug → NodeTool provider id (`PROVIDER_IDS`). Providers
 * GenSpend tracks that NodeTool cannot run (WaveSpeed, Novita, Runware…) are
 * deliberately absent — there is no node to price.
 */
export const PROVIDER_IDS_BY_GENSPEND_SLUG = {
  fal: "fal_ai",
  replicate: "replicate",
  kie: "kie",
  atlascloud: "atlascloud",
  together: "together",
  google: "gemini",
  openai: "openai",
  minimax: "minimax",
  elevenlabs: "elevenlabs",
  xai: "xai"
};

/** Receipt URLs that carry a provider-native model id in their path. */
const RECEIPT_PATTERNS = {
  fal: /^https?:\/\/(?:www\.)?fal\.ai\/models\/(.+)$/,
  replicate: /^https?:\/\/(?:www\.)?replicate\.com\/([^/]+\/[^/]+)$/
};

/** GenSpend modality → the inventory modality it can price. */
const MODALITY_ALIASES = { image: "image", video: "video", audio: "audio" };

/**
 * A GenSpend model matching more ids than this is a name too generic to price
 * anything precisely (a family name hitting every variant). Reported, dropped.
 */
export const MAX_IDS_PER_OFFERING = 8;

/** The provider-native model id an offering's receipt URL carries, if any. */
export function extractReceiptModelId(providerSlug, sourceUrl) {
  const pattern = RECEIPT_PATTERNS[providerSlug];
  if (!pattern || typeof sourceUrl !== "string") return null;
  const cleaned = sourceUrl.trim().replace(/[?#].*$/, "").replace(/\/+$/, "");
  const match = pattern.exec(cleaned);
  return match ? match[1] : null;
}

/**
 * Index a provider inventory (`{provider: {modality: [{id, name}]}}`) by
 * comparison key, so a GenSpend name can be looked up in one step.
 *
 * Endpoints for a task GenSpend does not price — upscalers, lip-sync, voice
 * cloning — are left out of the index entirely.
 */
export function buildInventoryIndex(inventory) {
  const index = {};
  for (const [providerId, modalities] of Object.entries(inventory ?? {})) {
    index[providerId] = {};
    for (const [modality, entries] of Object.entries(modalities ?? {})) {
      const byKey = new Map();
      for (const entry of entries ?? []) {
        if (!entry?.id) continue;
        if (isNonGenerationTask(entry.id, entry.name)) continue;
        for (const key of modelKeys(entry.id, entry.name)) {
          if (!byKey.has(key)) byKey.set(key, new Set());
          byKey.get(key).add(entry.id);
        }
      }
      index[providerId][modality] = byKey;
    }
  }
  return index;
}

/**
 * Alias overrides, keyed `<provider_id>` → `<genspend slug>` → array of model
 * ids, or `null` to block the model for that provider. Hand-maintained: it is
 * how a maintainer pins a match the name comparison cannot see, and how a bad
 * match gets killed without weakening the rules for everything else.
 */
function aliasIdsFor(aliases, providerId, slug) {
  const provider = aliases?.[providerId];
  if (!provider || !(slug in provider)) return undefined;
  const value = provider[slug];
  if (value === null) return null;
  return Array.isArray(value) ? value.filter((id) => typeof id === "string") : undefined;
}

/**
 * The model ids one offering prices, with how they were resolved.
 *
 * Returns `{ ids, match, reason }` — `ids` empty when nothing resolved, and
 * `reason` naming why (`"blocked"`, `"ambiguous"`, `"unmatched"`,
 * `"unmapped-provider"`) so the run can report what it could not price.
 */
export function resolveOfferingIds({
  model,
  offering,
  index,
  aliases,
  maxIds = MAX_IDS_PER_OFFERING
}) {
  const providerSlug = offering?.provider?.slug;
  const providerId = PROVIDER_IDS_BY_GENSPEND_SLUG[providerSlug];
  if (!providerId) {
    return { ids: [], match: null, providerId: null, reason: "unmapped-provider" };
  }

  const alias = aliasIdsFor(aliases, providerId, model.slug);
  if (alias === null) {
    return { ids: [], match: null, providerId, reason: "blocked" };
  }
  if (alias && alias.length > 0) {
    return { ids: [...alias].sort(), match: "alias", providerId, reason: null };
  }

  const receiptId = extractReceiptModelId(providerSlug, offering.sourceUrl);
  if (receiptId) {
    return { ids: [receiptId], match: "receipt", providerId, reason: null };
  }

  const modality = MODALITY_ALIASES[normalize(model.modality)];
  const byKey = modality ? index?.[providerId]?.[modality] : undefined;
  if (!byKey) {
    return { ids: [], match: null, providerId, reason: "unmatched" };
  }

  const hits = new Set();
  for (const key of modelKeys(model.slug, model.name, model.shortName)) {
    for (const id of byKey.get(key) ?? []) hits.add(id);
  }
  if (hits.size === 0) {
    return { ids: [], match: null, providerId, reason: "unmatched" };
  }
  if (hits.size > maxIds) {
    return { ids: [], match: null, providerId, reason: "ambiguous" };
  }
  return { ids: [...hits].sort(), match: "catalog", providerId, reason: null };
}
