import type { FastifyPluginAsync } from "fastify";
import {
  aggregateKiePricingByModelId,
  fetchAllKiePricingRecords,
  type KieModelPricingSummary,
} from "@nodetool-ai/kie-nodes/kie-pricing-api";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

let catalogCache: {
  byModelId: Record<string, KieModelPricingSummary>;
  expiresAt: number;
} | null = null;

async function getKiePricingCatalog(): Promise<
  Record<string, KieModelPricingSummary>
> {
  const now = Date.now();
  if (catalogCache != null && now < catalogCache.expiresAt) {
    return catalogCache.byModelId;
  }

  const records = await fetchAllKiePricingRecords();
  const byModelId = aggregateKiePricingByModelId(records);
  catalogCache = {
    byModelId,
    expiresAt: now + CACHE_TTL_MS,
  };
  return byModelId;
}

const kiePricingRoute: FastifyPluginAsync = async (app) => {
  app.get("/api/kie/pricing", async (req, reply) => {
    const raw = (req.query as Record<string, string | string[]>)["model_id"];
    const modelIds = raw
      ? [...new Set(Array.isArray(raw) ? raw : [raw])]
      : [];

    if (modelIds.length === 0) {
      reply.status(400).send({ detail: "model_id query param required" });
      return;
    }

    try {
      const catalog = await getKiePricingCatalog();
      const byModelId: Record<string, KieModelPricingSummary> = {};
      for (const id of modelIds) {
        const entry = catalog[id];
        if (entry) {
          byModelId[id] = entry;
        }
      }
      reply.send({ byModelId, fetched_at: new Date().toISOString() });
    } catch (err) {
      console.error("[kie-pricing] fetch failed:", err);
      reply.status(502).send({ detail: "Failed to fetch KIE pricing" });
    }
  });
};

export default kiePricingRoute;
