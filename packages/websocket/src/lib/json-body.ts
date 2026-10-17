import type { FastifyInstance } from "fastify";

/**
 * Parse `application/json` bodies into objects inside one route plugin.
 *
 * `server.ts` replaces every parser with a catch-all that hands handlers the
 * raw `Buffer`, which suits the bridged Web API handlers. A route that reads
 * `req.body` as an object, or declares a Fastify body schema, must register
 * this first, or every request reaches it as bytes.
 */
export function parseJsonBodies(app: FastifyInstance): void {
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    app.getDefaultJsonParser("error", "error")
  );
}

/**
 * Whether a `Content-Type` header is exactly `application/json`, ignoring
 * parameters such as `charset`.
 *
 * A substring test also accepts `text/plain; x=application/json`, which a
 * browser sends cross-site without a CORS preflight, so a page could post
 * JSON to a local server that trusts loopback.
 */
export function isJsonContentType(contentType: string | null | undefined): boolean {
  const essence = (contentType ?? "").split(";")[0]?.trim().toLowerCase();
  return essence === "application/json";
}
