/**
 * Resolve a GenSpend offering to the model ids NodeTool ships, each with the
 * price that actually applies to it.
 *
 * GenSpend keys models by its own slug (`seedance-2`); a run is priced by the
 * provider-native id on a node's provider-model property
 * (`bytedance/seedance-2.0/text-to-video`). Bridging the two is the whole job
 * here, done four ways, in descending order of how much they can be trusted:
 *
 *   1. `alias`  — pinned by hand in `aliases.json`. A maintainer's explicit call.
 *   2. `variant`— a `variants[]` row whose `spec` is a model NodeTool ships.
 *      Best of all the automatic routes: the row carries that endpoint's *own*
 *      price, so `fal-ai/flux-pro/v1.1` and `…/v1.1-ultra` get their real
 *      numbers instead of sharing the model's headline price.
 *   3. `receipt`— the offering's `sourceUrl` is a model page carrying the id.
 *   4. `provider-id` — `offering.providerModelId`, when it names a model
 *      NodeTool ships. GenSpend often fills this with its own slug, so it is
 *      only taken when the inventory recognizes it — never on faith.
 *
 * Failing all four, the model's normalized name (or an `aliases[]` entry) is
 * matched against the provider's own listing, which is the `catalog` tier and
 * the only one that interprets anything. Its guards are below.
 */

import {
  capabilityForModelId,
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

/** How much each route can be trusted, high wins. See the module docs. */
export const MATCH_RANK = {
  alias: 5,
  variant: 4,
  receipt: 3,
  "provider-id": 2,
  catalog: 1
};

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
 * comparison key and by exact id, so a GenSpend name can be looked up in one
 * step and a claimed id can be verified in another.
 *
 * Endpoints for a task GenSpend does not price — upscalers, lip-sync, voice
 * cloning — are left out entirely.
 */
export function buildInventoryIndex(inventory) {
  const index = {};
  for (const [providerId, modalities] of Object.entries(inventory ?? {})) {
    const byKey = {};
    const byId = new Map();
    for (const [modality, entries] of Object.entries(modalities ?? {})) {
      const keyMap = new Map();
      for (const entry of entries ?? []) {
        if (!entry?.id) continue;
        if (isNonGenerationTask(entry.id, entry.name)) continue;
        byId.set(entry.id.toLowerCase(), { id: entry.id, name: entry.name, modality });
        for (const key of modelKeys(entry.id, entry.name)) {
          if (!keyMap.has(key)) keyMap.set(key, new Set());
          keyMap.get(key).add(entry.id);
        }
      }
      byKey[modality] = keyMap;
    }
    index[providerId] = { byKey, byId };
  }
  return index;
}

/** The inventory entry for a claimed model id, or null when NodeTool lacks it. */
function verifyId(index, providerId, claimedId) {
  if (typeof claimedId !== "string" || !claimedId.trim()) return null;
  return index?.[providerId]?.byId?.get(claimedId.trim().toLowerCase()) ?? null;
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
 * True when the model's published capabilities refute the task an endpoint
 * performs. `null`/absent is unknown, not refuted — GenSpend's flags are
 * receipted, so only an explicit `false` blocks a match.
 */
function capabilitiesRefuteTask(model, entry) {
  const tasks = model?.capabilities?.tasks;
  if (!tasks) return false;
  const capability = capabilityForModelId(entry.id, entry.name);
  return capability ? tasks[capability] === false : false;
}

/**
 * Audio splits into speech and music, and a provider's TTS listing is the only
 * audio inventory NodeTool has. A music model must not be priced against it.
 */
function audioKindMismatch(model, modality) {
  return modality === "audio" && model?.capabilities?.kind === "music";
}

const priceEntry = (modelId, unitPrice, unitClass, match, variant = null) => ({
  modelId,
  unitPrice,
  unitClass,
  match,
  variantSpec: variant?.spec ?? null,
  tier: variant?.tier ?? null,
  resolution: variant?.resolution ?? null
});

const isFiniteNumber = (value) =>
  typeof value === "number" && Number.isFinite(value);

/**
 * The priced model ids one offering resolves to.
 *
 * Returns `{ providerId, entries, reason }` — `entries` empty when nothing
 * resolved, and `reason` naming why (`"blocked"`, `"ambiguous"`,
 * `"unmatched"`, `"unmapped-provider"`) so the run can report what it could
 * not price. When several routes name the same id, the most trusted one wins.
 */
export function resolveOfferingPrices({
  model,
  offering,
  index,
  aliases,
  maxIds = MAX_IDS_PER_OFFERING
}) {
  const providerSlug = offering?.provider?.slug;
  const providerId = PROVIDER_IDS_BY_GENSPEND_SLUG[providerSlug];
  if (!providerId) {
    return { providerId: null, entries: [], reason: "unmapped-provider" };
  }

  const headlinePrice = offering.priceUsd;
  const headlineClass =
    typeof offering.unitClass === "string" ? offering.unitClass : "";

  const alias = aliasIdsFor(aliases, providerId, model.slug);
  if (alias === null) {
    return { providerId, entries: [], reason: "blocked" };
  }
  if (alias && alias.length > 0) {
    return {
      providerId,
      entries: alias.map((id) =>
        priceEntry(id, headlinePrice, headlineClass, "alias")
      ),
      reason: null
    };
  }

  // Exact routes. Each claimed id is checked against the provider's own
  // listing, so a slug echoed into `providerModelId` resolves to nothing
  // rather than to a model NodeTool cannot run.
  const byId = new Map();
  const claim = (entry) => {
    const existing = byId.get(entry.modelId);
    if (!existing || MATCH_RANK[entry.match] > MATCH_RANK[existing.match]) {
      byId.set(entry.modelId, entry);
    }
  };

  for (const variant of Array.isArray(offering.variants) ? offering.variants : []) {
    const found = verifyId(index, providerId, variant?.spec);
    if (!found) continue;
    const price = isFiniteNumber(variant.priceUsd) ? variant.priceUsd : headlinePrice;
    const unitClass =
      typeof variant.unitClass === "string" && variant.unitClass
        ? variant.unitClass
        : headlineClass;
    claim(priceEntry(found.id, price, unitClass, "variant", variant));
  }

  const receiptId = extractReceiptModelId(providerSlug, offering.sourceUrl);
  if (receiptId) {
    claim(priceEntry(receiptId, headlinePrice, headlineClass, "receipt"));
  }

  const claimed = verifyId(index, providerId, offering.providerModelId);
  if (claimed) {
    claim(priceEntry(claimed.id, headlinePrice, headlineClass, "provider-id"));
  }

  if (byId.size > 0) {
    return {
      providerId,
      entries: [...byId.values()].sort((a, b) =>
        a.modelId.localeCompare(b.modelId)
      ),
      reason: null
    };
  }

  // Name matching — the only interpreting route, and the only one that needs
  // the modality, capability and ambiguity guards.
  const modality = MODALITY_ALIASES[normalize(model.modality)];
  const keyMap = modality ? index?.[providerId]?.byKey?.[modality] : undefined;
  if (!keyMap || audioKindMismatch(model, modality)) {
    return { providerId, entries: [], reason: "unmatched" };
  }

  const hits = new Set();
  for (const key of modelKeys(
    model.slug,
    model.name,
    model.shortName,
    ...(Array.isArray(model.aliases) ? model.aliases : [])
  )) {
    for (const id of keyMap.get(key) ?? []) hits.add(id);
  }
  if (hits.size === 0) {
    return { providerId, entries: [], reason: "unmatched" };
  }
  if (hits.size > maxIds) {
    return { providerId, entries: [], reason: "ambiguous" };
  }

  const allowed = [...hits]
    .map((id) => index[providerId].byId.get(id.toLowerCase()))
    .filter((entry) => entry && !capabilitiesRefuteTask(model, entry));
  if (allowed.length === 0) {
    return { providerId, entries: [], reason: "refuted-by-capabilities" };
  }

  return {
    providerId,
    entries: allowed
      .map((entry) =>
        priceEntry(entry.id, headlinePrice, headlineClass, "catalog")
      )
      .sort((a, b) => a.modelId.localeCompare(b.modelId)),
    reason: null
  };
}
