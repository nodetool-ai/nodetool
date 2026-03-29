import type { FastifyPluginAsync } from "fastify";
import { Secret } from "@nodetool/models";

const FAL_PRICING_URL = "https://api.fal.ai/v1/models/pricing";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface PricingEntry {
  unit_price: number;
  billing_unit: string;
  currency: string;
}

// Per-endpoint cache: endpoint_id -> { entry, expiresAt }
const endpointCache = new Map<string, { entry: PricingEntry; expiresAt: number }>();

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchPricingBatch(
  batch: string[],
  apiKey: string,
): Promise<Record<string, PricingEntry>> {
  const url = new URL(FAL_PRICING_URL);
  for (const id of batch) url.searchParams.append("endpoint_id", id);

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Key ${apiKey}` },
    });
    if (res.ok) {
      const json = (await res.json()) as { prices?: { endpoint_id: string; unit_price: number; unit: string; currency: string }[] };
      const out: Record<string, PricingEntry> = {};
      for (const row of json.prices ?? []) {
        out[row.endpoint_id] = { unit_price: row.unit_price, billing_unit: row.unit, currency: row.currency };
      }
      return out;
    }
    if (res.status === 429 && attempt < 2) {
      console.warn("[fal-pricing] 429 rate limit, retrying after", 4000 * (attempt + 1), "ms");
      await sleep(4000 * (attempt + 1));
      continue;
    }
    const body = await res.text().catch(() => "");
    console.warn("[fal-pricing] batch HTTP", res.status, "—", body.slice(0, 200));
    break;
  }
  return {};
}

async function fetchFalPricingForIds(
  endpointIds: string[],
  apiKey: string,
): Promise<Record<string, PricingEntry>> {
  const now = Date.now();
  const missing = endpointIds.filter((id) => {
    const cached = endpointCache.get(id);
    return !cached || now >= cached.expiresAt;
  });

  if (missing.length > 0) {
    const result = await fetchPricingBatch(missing, apiKey);
    const expiresAt = now + CACHE_TTL_MS;
    for (const [id, entry] of Object.entries(result)) {
      endpointCache.set(id, { entry, expiresAt });
    }
  }

  const byEndpointId: Record<string, PricingEntry> = {};
  for (const id of endpointIds) {
    const cached = endpointCache.get(id);
    if (cached) byEndpointId[id] = cached.entry;
  }
  return byEndpointId;
}

const falPricingRoute: FastifyPluginAsync = async (app) => {
  app.get("/api/fal/pricing", async (req, reply) => {
    // Accept one or more endpoint_id query params
    const raw = (req.query as Record<string, string | string[]>)["endpoint_id"];
    const endpointIds = raw
      ? [...new Set(Array.isArray(raw) ? raw : [raw])]
      : [];

    if (endpointIds.length === 0) {
      reply.status(400).send({ detail: "endpoint_id query param required" });
      return;
    }

    const secret = await Secret.find("1", "FAL_API_KEY");
    let apiKey: string | null = null;
    if (secret) {
      try {
        apiKey = await secret.getDecryptedValue();
      } catch (err) {
        console.error("[fal-pricing] decryption failed:", err);
      }
    }
    apiKey ??= process.env.FAL_API_KEY ?? null;
    if (!apiKey) {
      reply.status(204).send();
      return;
    }

    try {
      const byEndpointId = await fetchFalPricingForIds(endpointIds, apiKey);
      reply.send({ byEndpointId, fetched_at: new Date().toISOString() });
    } catch (err) {
      console.error("[fal-pricing] fetch failed:", err);
      reply.status(502).send({ detail: "Failed to fetch FAL pricing" });
    }
  });
};

export default falPricingRoute;
