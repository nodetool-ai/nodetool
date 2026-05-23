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

/**
 * Collapse paginated pricing rows into one summary per kie `model_id`.
 * Uses the minimum credit price when multiple tiers exist for the same model.
 */
export function aggregateKiePricingByModelId(
  records: readonly KiePricingPageRecord[],
): Record<string, KieModelPricingSummary> {
  const grouped = new Map<string, KiePricingPageRecord[]>();

  for (const record of records) {
    const modelId = modelIdFromKiePricingAnchor(record.anchor ?? "");
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
    let billingUnit = "";
    let pricingUrl: string | undefined;

    for (const row of rows) {
      const credits = parsePositiveNumber(row.creditPrice);
      if (credits == null) {
        continue;
      }
      if (minCredits == null || credits < minCredits) {
        minCredits = credits;
        const usd = parsePositiveNumber(row.usdPrice);
        minUsd = usd;
        billingUnit = normalizeBillingUnit(row.creditUnit);
      }
      pricingUrl ??= kiePricingPageUrlFromAnchor(row.anchor);
    }

    if (minCredits == null) {
      continue;
    }

    const tierCount = rows.length;
    out[modelId] = {
      model_id: modelId,
      unit_price: minCredits,
      billing_unit: tierCount > 1 ? "varies" : billingUnit,
      currency: "credits",
      usd_price: minUsd ?? undefined,
      tier_count: tierCount,
      pricing_url: pricingUrl,
    };
  }

  return out;
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
