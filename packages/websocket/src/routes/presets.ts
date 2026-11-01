import type { FastifyPluginAsync } from "fastify";
import { runtimePresetCatalog } from "@nodetool-ai/pack-core/preset-catalog";

/** Uses the same server authentication hook as the other /api routes. */
const presetRoutes: FastifyPluginAsync = async app => {
  app.get("/api/presets", {
    schema: { response: { 200: { type: "array", items: { type: "object", additionalProperties: true } } } }
  }, async () => {
    const catalog = runtimePresetCatalog();
    return [...catalog.presets, ...catalog.studios];
  });
};
export default presetRoutes;
