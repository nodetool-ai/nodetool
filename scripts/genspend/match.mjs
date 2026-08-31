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

/**
 * How much each route can be trusted, high wins. `provider-id` outranks
 * `receipt` because GenSpend reads the field off the provider's own API
 * reference, while a receipt id is inferred from a URL path.
 */
export const MATCH_RANK = {
  alias: 5,
  variant: 4,
  "provider-id": 3,
  receipt: 2,
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
 * Alias overrides, keyed `<provider_id>` → `<genspend slug>` → one of:
 *
 *   - `null` — block the model for that provider.
 *   - `string[]` — pin these model ids at the offering's headline price.
 *   - `{ [modelId]: variantSpec }` — pin each model id to the published
 *     `variants[]` row whose `spec` matches, and price it at *that* row.
 *
 * The object form exists because a tier is sometimes a rung the provider
 * publishes and sometimes prose. AtlasCloud sells Ideogram 4.0 at $0.008
 * (Turbo) and $0.025 (Quality), and GenSpend records both — but as
 * `"Quality rendering tier"`, not as a model id the automatic `variant` route
 * can verify. Pinning the id to the headline price would have quoted the
 * Quality endpoint at Turbo's rate: a number the provider does not publish
 * for it. Naming the row keeps the figure the provider's own.
 *
 * Hand-maintained: it is how a maintainer pins a match the name comparison
 * cannot see, and how a bad match gets killed without weakening the rules for
 * everything else.
 */
function aliasIdsFor(aliases, providerId, slug) {
  const provider = aliases?.[providerId];
  if (!provider || !(slug in provider)) return undefined;
  const value = provider[slug];
  if (value === null) return null;
  if (Array.isArray(value)) {
    return {
      pins: value
        .filter((id) => typeof id === "string")
        .map((id) => ({ id, spec: null }))
    };
  }
  if (value && typeof value === "object") {
    return {
      pins: Object.entries(value)
        .filter(([, spec]) => typeof spec === "string")
        .map(([id, spec]) => ({ id, spec }))
    };
  }
  return undefined;
}

/**
 * The published `variants[]` row an alias pin names, by exact `spec`.
 *
 * A pin that names no row throws rather than falling back to the headline
 * price: the whole point of the object form is that the headline is the wrong
 * number for that endpoint, so a spec GenSpend has renamed or dropped must
 * stop the sync and be re-pinned, not silently become a figure nobody
 * published.
 */
function pinnedVariant(offering, slug, providerId, pin) {
  const variants = Array.isArray(offering.variants) ? offering.variants : [];
  const found = variants.find((v) => v?.spec === pin.spec);
  if (!found) {
    const available = variants.map((v) => JSON.stringify(v?.spec)).join(", ");
    throw new Error(
      `aliases.json pins ${providerId}/${slug} → ${pin.id} to variant ${JSON.stringify(pin.spec)}, ` +
        `which this offering does not publish. Available specs: ${available || "(none)"}`
    );
  }
  return found;
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
  if (alias && alias.pins.length > 0) {
    return {
      providerId,
      entries: alias.pins.map((pin) => {
        if (pin.spec === null) {
          return priceEntry(pin.id, headlinePrice, headlineClass, "alias");
        }
        const variant = pinnedVariant(offering, model.slug, providerId, pin);
        const price = isFiniteNumber(variant.priceUsd)
          ? variant.priceUsd
          : headlinePrice;
        const unitClass =
          typeof variant.unitClass === "string" && variant.unitClass
            ? variant.unitClass
            : headlineClass;
        return priceEntry(pin.id, price, unitClass, "alias", variant);
      }),
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
    // `videoInput: true` is a billing axis, not a spec note — providers charge
    // more when a video goes in. Applying such a row to a text-to-video
    // endpoint would undercharge, so let the headline price stand instead.
    if (
      variant.videoInput === true &&
      capabilityForModelId(found.id, found.name) === "t2v"
    ) {
      continue;
    }
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

  // Name matching. GenSpend prices a model once per provider, but a provider
  // ships it as several task endpoints (text-to-video, image-to-video, edit),
  // and only one of those is what `providerModelId` or a receipt names. So the
  // name tier still runs, to carry the price to the model's sibling endpoints —
  // at `catalog` trust, and only where the model's own capabilities allow it.
  //
  // This is the only interpreting route, and the only one needing the modality,
  // capability and ambiguity guards.
  const modality = MODALITY_ALIASES[normalize(model.modality)];
  const keyMap = modality ? index?.[providerId]?.byKey?.[modality] : undefined;
  const named = new Set();
  let namedReason = null;

  if (!keyMap || audioKindMismatch(model, modality)) {
    namedReason = "unmatched";
  } else {
    for (const key of modelKeys(
      model.slug,
      model.name,
      model.shortName,
      ...(Array.isArray(model.aliases) ? model.aliases : [])
    )) {
      for (const id of keyMap.get(key) ?? []) named.add(id);
    }
    if (named.size === 0) namedReason = "unmatched";
    else if (named.size > maxIds) {
      named.clear();
      namedReason = "ambiguous";
    }
  }

  const allowed = [...named]
    .map((id) => index[providerId].byId.get(id.toLowerCase()))
    .filter((entry) => entry && !capabilitiesRefuteTask(model, entry));
  if (named.size > 0 && allowed.length === 0) {
    namedReason = "refuted-by-capabilities";
  }
  for (const entry of allowed) {
    claim(priceEntry(entry.id, headlinePrice, headlineClass, "catalog"));
  }

  if (byId.size === 0) {
    return { providerId, entries: [], reason: namedReason ?? "unmatched" };
  }

  return {
    providerId,
    entries: [...byId.values()].sort((a, b) =>
      a.modelId.localeCompare(b.modelId)
    ),
    reason: null
  };
}
