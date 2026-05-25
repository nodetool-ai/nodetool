import type { FastifyPluginAsync } from "fastify";
import { Secret } from "@nodetool-ai/models";

const FAL_PRICING_ESTIMATE_URL = "https://api.fal.ai/v1/models/pricing/estimate";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface EstimateCacheEntry {
  total_cost: number;
  currency: string;
  estimate_type: string;
  expiresAt: number;
}

const estimateCache = new Map<string, EstimateCacheEntry>();

function cacheKey(endpointId: string, estimateType: string): string {
  return `${estimateType}:${endpointId}`;
}

async function resolveFalApiKey(): Promise<string | null> {
  const secret = await Secret.find("1", "FAL_API_KEY");
  let apiKey: string | null = null;
  if (secret) {
    try {
      apiKey = await secret.getDecryptedValue();
    } catch (err) {
      console.error("[fal-pricing-estimate] decryption failed:", err);
    }
  }
  return apiKey ?? process.env.FAL_API_KEY ?? null;
}

interface EstimateRequestBody {
  endpoint_id?: string;
  estimate_type?: "historical_api_price" | "unit_price";
  call_quantity?: number;
  unit_quantity?: number;
}

async function fetchEstimateFromFal(
  endpointId: string,
  estimateType: "historical_api_price" | "unit_price",
  quantity: number,
  apiKey: string,
): Promise<EstimateCacheEntry | null> {
  const body =
    estimateType === "historical_api_price"
      ? {
          estimate_type: "historical_api_price" as const,
          endpoints: { [endpointId]: { call_quantity: Math.max(1, Math.round(quantity)) } },
        }
      : {
          estimate_type: "unit_price" as const,
          endpoints: { [endpointId]: { unit_quantity: Math.max(0.000001, quantity) } },
        };

  const res = await fetch(FAL_PRICING_ESTIMATE_URL, {
    method: "POST",
    headers: {
      Authorization: `Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    console.warn(
      "[fal-pricing-estimate] fal.ai HTTP",
      res.status,
      "—",
      errBody.slice(0, 200),
    );
    return null;
  }

  const json = (await res.json()) as {
    total_cost?: number;
    currency?: string;
    estimate_type?: string;
  };

  if (typeof json.total_cost !== "number" || typeof json.currency !== "string") {
    return null;
  }

  return {
    total_cost: json.total_cost,
    currency: json.currency,
    estimate_type: json.estimate_type ?? estimateType,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
}

const falPricingEstimateRoute: FastifyPluginAsync = async (app) => {
  app.post("/api/fal/pricing/estimate", async (req, reply) => {
    const body = (req.body ?? {}) as EstimateRequestBody;
    const endpointId =
      typeof body.endpoint_id === "string" ? body.endpoint_id.trim() : "";
    const estimateType =
      body.estimate_type === "unit_price" ? "unit_price" : "historical_api_price";

    if (endpointId === "") {
      reply.status(400).send({ detail: "endpoint_id is required" });
      return;
    }

    const apiKey = await resolveFalApiKey();
    if (!apiKey) {
      reply.status(204).send();
      return;
    }

    const quantity =
      estimateType === "historical_api_price"
        ? typeof body.call_quantity === "number" && body.call_quantity >= 1
          ? body.call_quantity
          : 1
        : typeof body.unit_quantity === "number" && body.unit_quantity >= 0.000001
          ? body.unit_quantity
          : 1;

    const key = cacheKey(endpointId, estimateType);
    const now = Date.now();
    const cached = estimateCache.get(key);
    if (cached && now < cached.expiresAt) {
      reply.send({
        endpoint_id: endpointId,
        estimate_type: cached.estimate_type,
        total_cost: cached.total_cost,
        currency: cached.currency,
        fetched_at: new Date().toISOString(),
        cached: true,
      });
      return;
    }

    try {
      const entry = await fetchEstimateFromFal(
        endpointId,
        estimateType,
        quantity,
        apiKey,
      );
      if (!entry) {
        reply.status(502).send({ detail: "Failed to fetch FAL pricing estimate" });
        return;
      }
      estimateCache.set(key, entry);
      reply.send({
        endpoint_id: endpointId,
        estimate_type: entry.estimate_type,
        total_cost: entry.total_cost,
        currency: entry.currency,
        fetched_at: new Date().toISOString(),
        cached: false,
      });
    } catch (err) {
      console.error("[fal-pricing-estimate] fetch failed:", err);
      reply.status(502).send({ detail: "Failed to fetch FAL pricing estimate" });
    }
  });
};

export default falPricingEstimateRoute;
