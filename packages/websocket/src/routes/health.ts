import type { FastifyPluginAsync } from "fastify";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pingDb } from "@nodetool-ai/models";
import { chatTurnRegistry } from "../chat-turn-registry.js";
import { isDraining } from "../drain.js";
import { jobRunRegistry } from "../job-run-registry.js";

const serverStartTime = Date.now();

export function getVersion(): string {
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

/** Request header the desktop app sends with a random nonce. */
export const SERVER_PROOF_NONCE_HEADER = "x-nodetool-proof-nonce";
/** Response header carrying the proof for that nonce. */
export const SERVER_PROOF_HEADER = "x-nodetool-proof";

const PROOF_NONCE = /^[A-Za-z0-9]{16,128}$/;

/**
 * HMAC-SHA256 of the nonce and the port the request arrived on, keyed with
 * the secret the desktop app passed as `NODETOOL_SERVER_PROOF_KEY`. The app
 * reuses a server already listening on its port only when this matches, so
 * it never hands its windows or tokens to a process it did not start. Must
 * match `serverProofFor` in electron/src/serverProof.ts.
 */
export function serverProofFor(key: string, port: number, nonce: string): string {
  return createHmac("sha256", key).update(`nodetool-health:${port}:${nonce}`).digest("hex");
}

const healthRoute: FastifyPluginAsync = async (app) => {
  const proofKey = process.env["NODETOOL_SERVER_PROOF_KEY"]?.trim() || null;

  /**
   * GET /health — detailed health check.
   * Returns 200 when all services are healthy, 503 when degraded or draining.
   * No authentication required.
   *
   * `turns` and `jobs` are always reported: a rolling deploy drains one machine
   * and then polls this endpoint until both reach 0 before replacing it, and a
   * count that only appeared while draining could not be told from a payload
   * this build does not produce. The 503 is what makes Fly's health check fail
   * and stops new clients being routed here.
   */
  app.get("/health", async (req, reply) => {
    const nonce = req.headers[SERVER_PROOF_NONCE_HEADER];
    const port = req.socket.localPort;
    if (proofKey && typeof nonce === "string" && PROOF_NONCE.test(nonce) && port) {
      reply.header(SERVER_PROOF_HEADER, serverProofFor(proofKey, port, nonce));
    }

    let dbStatus: "ok" | "error" = "ok";

    try {
      await pingDb();
    } catch {
      dbStatus = "error";
    }

    const draining = isDraining();
    const allOk = dbStatus === "ok" && !draining;

    const payload = {
      status: draining ? "draining" : dbStatus === "ok" ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - serverStartTime) / 1000),
      turns: chatTurnRegistry.runningCount(),
      jobs: jobRunRegistry.runningCount(),
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
