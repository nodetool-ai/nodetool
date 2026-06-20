import type { FastifyPluginAsync } from "fastify";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pingDb } from "@nodetool-ai/models";

const serverStartTime = Date.now();

// Read version from package.json
function getVersion(): string {
  try {
    const packageJsonPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../package.json"
    );
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
    return packageJson.version || "unknown";
  } catch {
    return "unknown";
  }
}

const healthRoute: FastifyPluginAsync = async (app) => {
  /**
   * GET /health — detailed health check.
   * Returns 200 when all services are healthy, 503 when degraded.
   * No authentication required.
   */
  app.get("/health", async (_req, reply) => {
    let dbStatus: "ok" | "error" = "ok";

    try {
      await pingDb();
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

  /**
   * GET /api/health — version and uptime information.
   * Returns 200 with version from package.json and uptime in seconds.
   * No authentication required.
   */
  app.get("/api/health", async (_req, reply) => {
    return reply.status(200).send({
      version: getVersion(),
      uptime: Math.floor((Date.now() - serverStartTime) / 1000)
    });
  });
};

export default healthRoute;
