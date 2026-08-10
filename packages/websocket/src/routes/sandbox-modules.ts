/**
 * Sandbox module delivery: `GET /api/sandbox-modules/*`.
 *
 * The browser runner fetches guest module sources by **opaque module id** — a
 * public entry specifier (`@acme/geo`) or an internal graph-file id
 * (`@acme/geo::sandbox/helper.js`). Ids contain `/`, so the route is a wildcard
 * and the id is whatever follows the prefix; Fastify percent-decodes the
 * wildcard, so `@acme%2Fgeo` and `@acme/geo` name the same module.
 *
 * The route never touches the filesystem and never translates a path: it asks
 * the catalog to authorize and retrieve in one call, and answers with what the
 * catalog handed back. While `NODETOOL_SANDBOX_MODULES_V1` is off the whole
 * mechanism is dark and every request is a 404.
 */
import type { FastifyPluginAsync } from "fastify";
import { isSandboxModulesV1Enabled } from "@nodetool-ai/config";
import { getSandboxCatalog } from "../sandbox-catalog.js";

/** A year, in seconds: responses are immutable because the ETag is a digest. */
const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

const sandboxModulesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/sandbox-modules/*", async (req, reply) => {
    if (!isSandboxModulesV1Enabled()) {
      return reply.status(404).send({ detail: "Not found" });
    }
    const moduleId = (req.params as { "*"?: string })["*"] ?? "";
    if (moduleId.length === 0) {
      return reply.status(404).send({ detail: "Not found" });
    }

    const catalog = getSandboxCatalog();
    if (catalog === null) {
      return reply.status(404).send({ detail: "Not found" });
    }

    const delivery = await catalog.authorizeDelivery(moduleId);
    if (!delivery.authorized) {
      // A refusal is an entitlement answer (403) or an absence (404). The
      // catalog's message names the module id and nothing else.
      const status = delivery.reason === "forbidden" ? 403 : 404;
      return reply.status(status).send({ detail: delivery.message });
    }

    const etag = `"${delivery.contentDigest}"`;
    reply
      .header("Content-Type", delivery.mediaType)
      .header("X-Content-Digest", delivery.contentDigest)
      // A JSON array, not a comma list: a package-relative file id may contain
      // a comma, and the client prefetches the closure from this header.
      .header(
        "X-Sandbox-Module-Dependencies",
        JSON.stringify(delivery.dependencies)
      )
      .header("X-Sandbox-Pack", delivery.packName)
      .header("ETag", etag)
      .header("Cache-Control", IMMUTABLE_CACHE_CONTROL);
    if (delivery.packVersion !== undefined) {
      reply.header("X-Sandbox-Pack-Version", delivery.packVersion);
    }

    if (req.headers["if-none-match"] === etag) {
      return reply.status(304).send();
    }
    return reply
      .status(200)
      .send(delivery.kind === "js" ? delivery.source : Buffer.from(delivery.bytes));
  });
};

export default sandboxModulesRoutes;
