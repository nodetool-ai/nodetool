import type { FastifyPluginAsync } from "fastify";
import { getRawDb } from "@nodetool-ai/models";

const serverStartTime = Date.now();

const healthRoute: FastifyPluginAsync = async (app) => {
  /**
   * GET /health — detailed health check.
   * Returns 200 when all services are healthy, 503 when degraded.
   * No authentication required.
   */
  app.get("/health", async (_req, reply) => {
    let dbStatus: "ok" | "error" = "ok";

    try {
      const raw = getRawDb();
      // Fast integrity check — just verifies the connection is alive
      raw.pragma("quick_check(1)");
    } catch {
      dbStatus = "error";
    }

    const allOk = dbStatus === "ok";

    const payload = {
      status: allOk ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - serverStartTime) / 1000),
      services: {
        database: dbStatus,
        server: "ok" as const
      }
    };

    return reply.status(allOk ? 200 : 503).send(payload);
  });

  /**
   * GET /ready — simple liveness probe.
   * Always returns 200 if the server is accepting requests.
   * No authentication required.
   */
  app.get("/ready", async (_req, reply) => {
    return reply.status(200).send({ status: "ok" });
  });
};

export default healthRoute;
