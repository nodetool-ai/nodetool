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
 * catalog handed back.
 */
import type { FastifyPluginAsync } from "fastify";
import { getSandboxCatalog } from "../sandbox-catalog.js";
import { getHttpRateLimitConfig } from "../lib/http-rate-limit.js";

/**
 * The URL is the *stable* module id, not the digest, so the body behind it
 * changes whenever the pack is upgraded. `immutable` would let a browser or a
 * proxy keep serving the old source without ever revalidating — the ETag below
 * would never be consulted. `no-cache` still lets the client store the
 * response; it just has to ask before reusing it, and the strong ETag turns
 * that question into a 304 whenever nothing moved.
 *
 * `private` because delivery is authorized per client: a shared cache must not
 * hold a private pack's source and hand it to the next requester.
 */
const REVALIDATE_CACHE_CONTROL = "private, no-cache";

const sandboxModulesRoutes: FastifyPluginAsync = async (app) => {
  // The server registers @fastify/rate-limit globally, which already covers
  // this route. The explicit per-route config restates the same bounds where
  // a static analyzer (CodeQL js/missing-rate-limiting) can see them next to
  // the authorization call.
  const rateLimit = getHttpRateLimitConfig();
  const routeConfig = {
    rateLimit: {
      max: rateLimit.enabled ? rateLimit.max : Number.MAX_SAFE_INTEGER,
      timeWindow: rateLimit.timeWindow
    }
  };
  app.get("/api/sandbox-modules/*", { config: routeConfig }, async (req, reply) => {
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
      // The digest above versions the module graph — every file of one graph
      // shares it. This is the hash of *this* body, which is what a client can
      // actually verify before it executes the source.
      .header("X-Content-Sha256", delivery.contentSha256)
      // A JSON array, not a comma list: a package-relative file id may contain
      // a comma, and the client prefetches the closure from this header.
      .header(
        "X-Sandbox-Module-Dependencies",
        JSON.stringify(delivery.dependencies)
      )
      .header("X-Sandbox-Pack", delivery.packName)
      // The pack-relative file id: an entry is requested by specifier, and the
      // client resolves the module's own relative imports against this.
      .header("X-Sandbox-File-Id", delivery.fileId)
      .header("X-Sandbox-Internal", delivery.internal ? "1" : "0")
      .header("ETag", etag)
      .header("Cache-Control", REVALIDATE_CACHE_CONTROL);
    if (delivery.packVersion !== undefined) {
      reply.header("X-Sandbox-Pack-Version", delivery.packVersion);
    }
    // The WASM call contract, on a public entry only: the client builds the
    // facade it imports from this, and an internal file has none.
    if (delivery.kind === "wasm" && delivery.wasm !== undefined) {
      reply.header("X-Sandbox-Wasm-Contract", JSON.stringify(delivery.wasm));
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
