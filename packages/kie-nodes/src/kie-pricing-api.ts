/**
 * Fetch and normalize kie.ai public model pricing from the pricing page API.
 *
 * POST https://api.kie.ai/client/v1/model-pricing/page
 * (same endpoint the kie.ai/pricing page uses — no API key required)
 */

export const KIE_MODEL_PRICING_PAGE_URL =
  "https://api.kie.ai/client/v1/model-pricing/page";

export const KIE_PRICING_PAGE_SIZE = 100;

export interface KiePricingPageRecord {
  modelDescription: string;
  interfaceType: string;
  provider: string;
  creditPrice: string;
  creditUnit: string;
  usdPrice: string;
  falPrice: string;
  discountRate: number;
  anchor: string;
  discountPrice: boolean;
}

export interface KiePricingPageResponse {
  code?: number;
  msg?: string;
  data?: {
    records?: KiePricingPageRecord[];
    total?: number;
    size?: number;
    current?: number;
    pages?: number;
  };
}

/** Aggregated list price for a kie model id (may span multiple tiers). */
export interface KieModelPricingSummary {
  model_id: string;
  unit_price: number;
  billing_unit: string;
  currency: "credits";
  usd_price?: number;
  tier_count: number;
  pricing_url?: string;
}

function parsePositiveNumber(raw: string | undefined): number | null {
  if (raw == null || raw.trim() === "") {
    return null;
  }
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Extract `model` query param from a kie.ai pricing row anchor URL. */
export function modelIdFromKiePricingAnchor(anchor: string): string | null {
  try {
    const id = new URL(anchor).searchParams.get("model");
    return id != null && id.trim() !== "" ? id.trim() : null;
  } catch {
    return null;
  }
}

/** Base model page URL without the `model=` query (for external links). */
export function kiePricingPageUrlFromAnchor(anchor: string): string | undefined {
  try {
    const url = new URL(anchor);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

function normalizeBillingUnit(creditUnit: string): string {
  const trimmed = creditUnit.trim();
  if (trimmed !== "") {
    return trimmed.replace(/^per\s+/i, "").trim() || trimmed;
  }
  return "run";
}

/** A slug-like token already looks like a model id (lowercase, no spaces, has a separator). */
const KIE_SLUG_LIKE = /^[a-z0-9]+([._/-][a-z0-9.]+)+$/;

/** Lowercase, strip non-alphanumerics — collapses kie's slug variants to a comparable key. */
export function normalizeKieModelId(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Model id taken from the modelDescription prefix, but only when it already looks like one. */
function modelIdFromDescription(description: string): string | null {
  const prefix = (description.split(",")[0] ?? "").trim();
  return prefix !== "" && KIE_SLUG_LIKE.test(prefix) ? prefix : null;
}

/** Model id from the anchor URL path (kie's marketing slugs / generation ids). */
function modelIdFromAnchorPath(anchor: string): string | null {
  try {
    const url = new URL(anchor);
    if (url.hostname.includes("docs")) {
      return null; // doc links point at API guides, not model pages
    }
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length === 0) {
      return null;
    }
    return segments.slice(-2).join("/");
  } catch {
    return null;
  }
}

/**
 * Resolve the kie model identifier for a pricing row. kie encodes it in three
 * inconsistent places, so we try, highest-confidence first:
 *   1. the `?model=` anchor query param (canonical generation id)
 *   2. a slug-like prefix of modelDescription (e.g. "bytedance/seedance-2")
 *   3. the anchor URL path (e.g. "qwen/image-edit", "topaz-image-upscale")
 */
export function kieModelKeyForRecord(record: KiePricingPageRecord): string | null {
  return (
    modelIdFromKiePricingAnchor(record.anchor ?? "") ??
    modelIdFromDescription(record.modelDescription ?? "") ??
    modelIdFromAnchorPath(record.anchor ?? "")
  );
}

/**
 * Collapse paginated pricing rows into one summary per kie `model_id`.
 * Uses the minimum credit price when multiple tiers exist for the same model.
 * The billing unit is kept when every priced tier shares it (e.g. "per second"
 * for a video model), and only falls back to "varies" when tiers genuinely
 * disagree — so a per-second model reads "From 9 credits per second" rather
 * than dropping the unit entirely.
 */
export function aggregateKiePricingByModelId(
  records: readonly KiePricingPageRecord[],
): Record<string, KieModelPricingSummary> {
  const grouped = new Map<string, KiePricingPageRecord[]>();

  for (const record of records) {
    if (record.interfaceType === "chat") {
      continue; // LLM/token pricing — not a media node we surface
    }
    const modelId = kieModelKeyForRecord(record);
    if (modelId == null) {
      continue;
    }
    const bucket = grouped.get(modelId);
    if (bucket) {
      bucket.push(record);
    } else {
      grouped.set(modelId, [record]);
    }
  }

  const out: Record<string, KieModelPricingSummary> = {};

  for (const [modelId, rows] of grouped) {
    let minCredits: number | null = null;
    let minUsd: number | null = null;
    let minUnit = "";
    let pricingUrl: string | undefined;
    const units = new Set<string>();

    for (const row of rows) {
      const credits = parsePositiveNumber(row.creditPrice);
      if (credits == null) {
        continue;
      }
      const unit = normalizeBillingUnit(row.creditUnit);
      units.add(unit);
      if (minCredits == null || credits < minCredits) {
        minCredits = credits;
        minUsd = parsePositiveNumber(row.usdPrice);
        minUnit = unit;
      }
      pricingUrl ??= kiePricingPageUrlFromAnchor(row.anchor);
    }

    if (minCredits == null) {
      continue;
    }

    out[modelId] = {
      model_id: modelId,
      unit_price: minCredits,
      billing_unit: units.size === 1 ? minUnit : "varies",
      currency: "credits",
      usd_price: minUsd ?? undefined,
      tier_count: rows.length,
      pricing_url: pricingUrl,
    };
  }

  return out;
}

/**
 * Hand-verified map from our manifest model id → the kie catalog key, for cases
 * where kie's pricing id can't be derived from ours by normalization. Each pair
 * was checked against kie's live provider/price (see kie-pricing-api.test.ts).
 *
 * Suno music nodes: kie lists Suno operations under internal `ai-music-api/*`
 * ids (every such row has provider "Suno"). Kling avatars: kie inserts a `v1`
 * version token. Do NOT add pairs that merely look similar — e.g. seedance-2 vs
 * seedance-2-fast or seedream-v4 vs 4.5 are different models with different prices.
 */
export const KIE_MODEL_ID_ALIASES: Readonly<Record<string, string>> = {
  "generate-music": "ai-music-api/generate",
  "upload-and-cover-audio": "ai-music-api/upload-and-cover-audio",
  "upload-and-extend-audio": "ai-music-api/extend",
  "add-instrumental": "ai-music-api/add-instrumental",
  "get-timestamped-lyrics": "ai-music-api/timeStamped-lyrics",
  "boost-music-style": "ai-music-api/boost-music-style",
  "generate-cover": "ai-music-api/cover-generate",
  "generate-mashup": "ai-music-api/mashup",
  "convert-to-wav": "ai-music-api/convert-to-wav-format",
  "separate-vocals": "ai-music-api/separate-vocals",
  "generate-midi": "ai-music-api/generate-midi-from-audio",
  "create-music-video": "ai-music-api/create-music-video",
  "generate-sounds": "ai-music-api/sounds",
  "kling/ai-avatar-pro": "kling/ai-avatar-v1-pro",
  "kling/ai-avatar-standard": "kling/v1-avatar-standard",
};

/**
 * Find the pricing for a manifest model id in an aggregated catalog, trying:
 *   1. exact key, 2. curated alias, 3. a unique normalized-key match.
 * Returns undefined when nothing matches or a normalized match is ambiguous.
 */
export function resolveKiePricing(
  catalog: Record<string, KieModelPricingSummary>,
  modelId: string,
): KieModelPricingSummary | undefined {
  const exact = catalog[modelId];
  if (exact) {
    return exact;
  }

  const aliased = KIE_MODEL_ID_ALIASES[modelId];
  if (aliased && catalog[aliased]) {
    return catalog[aliased];
  }

  const target = normalizeKieModelId(modelId);
  let match: KieModelPricingSummary | undefined;
  let count = 0;
  for (const [key, summary] of Object.entries(catalog)) {
    if (normalizeKieModelId(key) === target) {
      match = summary;
      count += 1;
    }
  }
  return count === 1 ? match : undefined;
}

export async function fetchKiePricingPage(
  pageNum: number,
  pageSize = KIE_PRICING_PAGE_SIZE,
  fetchImpl: typeof fetch = fetch,
): Promise<KiePricingPageResponse> {
  const res = await fetchImpl(KIE_MODEL_PRICING_PAGE_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://kie.ai",
      referer: "https://kie.ai/",
    },
    body: JSON.stringify({
      pageNum,
      pageSize,
      modelDescription: "",
      interfaceType: "",
    }),
  });

  if (!res.ok) {
    throw new Error(
      `KIE pricing page HTTP ${res.status}: ${await res.text().catch(() => "")}`,
    );
  }

  return (await res.json()) as KiePricingPageResponse;
}

/** Fetch all pricing rows across paginated responses. */
export async function fetchAllKiePricingRecords(
  fetchImpl: typeof fetch = fetch,
): Promise<KiePricingPageRecord[]> {
  const records: KiePricingPageRecord[] = [];
  let pageNum = 1;
  let totalPages = 1;

  while (pageNum <= totalPages) {
    const json = await fetchKiePricingPage(pageNum, KIE_PRICING_PAGE_SIZE, fetchImpl);
    if (json.code !== undefined && json.code !== 200) {
      throw new Error(`KIE pricing page error ${json.code}: ${json.msg ?? ""}`);
    }
    const page = json.data;
    if (page?.records?.length) {
      records.push(...page.records);
    }
    totalPages = page?.pages ?? pageNum;
    pageNum += 1;
  }

  return records;
}

/** Full catalog keyed by kie model id. */
export async function fetchKiePricingCatalog(
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, KieModelPricingSummary>> {
  const records = await fetchAllKiePricingRecords(fetchImpl);
  return aggregateKiePricingByModelId(records);
}
