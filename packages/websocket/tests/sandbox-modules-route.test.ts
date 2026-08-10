/**
 * Tests for the sandbox module delivery route.
 *
 * Runs an in-process Fastify instance with only this route registered and a
 * stub catalog, so nothing touches the pack search paths or the database.
 *
 * Run with:
 *   npm run test --workspace=packages/websocket -- sandbox-modules-route
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import {
  sandboxDeliveryRefusal,
  type SandboxModuleDeliveryResult
} from "@nodetool-ai/protocol";
import type { SandboxModuleCatalog } from "@nodetool-ai/runtime";

const getSandboxCatalog = vi.fn<() => SandboxModuleCatalog | null>();

vi.mock("../src/sandbox-catalog.js", () => ({
  getSandboxCatalog: () => getSandboxCatalog()
}));

const { default: sandboxModulesRoutes } = await import(
  "../src/routes/sandbox-modules.js"
);

const DIGEST = "c".repeat(64);
const SHA = "d".repeat(64);
const SOURCE = "export const distance = () => 0;\n";
const PACK_DIRECTORY = "/srv/nodetool/packs/@acme/geo/sandbox";

function catalogServing(
  deliveries: Record<string, SandboxModuleDeliveryResult>
): SandboxModuleCatalog {
  return {
    summaries: () => [],
    diagnostics: () => [],
    resolveForExecution: () => ({ modules: [], statuses: [] }),
    authorizeDelivery: (moduleId) =>
      Promise.resolve(
        deliveries[moduleId] ??
          sandboxDeliveryRefusal(
            "not-found",
            `Sandbox module ${moduleId} is not installed.`
          )
      )
  };
}

const GEO: SandboxModuleDeliveryResult = {
  authorized: true,
  moduleId: "@acme/geo",
  fileId: "sandbox/geo.js",
  internal: false,
  packName: "@acme/geo",
  packVersion: "1.2.0",
  contentDigest: DIGEST,
  contentSha256: SHA,
  kind: "js",
  mediaType: "text/javascript",
  source: SOURCE,
  dependencies: ["@acme/geo::sandbox/helper.js"]
};

let app: FastifyInstance;

beforeEach(async () => {
  getSandboxCatalog.mockReset();
  getSandboxCatalog.mockReturnValue(catalogServing({ "@acme/geo": GEO }));
  app = Fastify();
  await app.register(sandboxModulesRoutes);
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

describe("GET /api/sandbox-modules/*", () => {
  it("serves the module source with digest and immutable caching headers", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/sandbox-modules/@acme/geo"
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(SOURCE);
    expect(response.headers["content-type"]).toContain("text/javascript");
    expect(response.headers["x-content-digest"]).toBe(DIGEST);
    // The digest versions the whole graph; the sha is what a client can check
    // this body against.
    expect(response.headers["x-content-sha256"]).toBe(SHA);
    expect(response.headers["x-sandbox-file-id"]).toBe("sandbox/geo.js");
    expect(response.headers["x-sandbox-internal"]).toBe("0");
    expect(response.headers["etag"]).toBe(`"${DIGEST}"`);
    expect(response.headers["cache-control"]).toBe(
      "public, max-age=31536000, immutable"
    );
    expect(response.headers["x-sandbox-module-dependencies"]).toBe(
      JSON.stringify(["@acme/geo::sandbox/helper.js"])
    );
    expect(response.headers["x-sandbox-pack-version"]).toBe("1.2.0");
  });

  it("answers 304 when the client already holds this digest", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/sandbox-modules/@acme/geo",
      headers: { "if-none-match": `"${DIGEST}"` }
    });

    expect(response.statusCode).toBe(304);
    expect(response.body).toBe("");
  });

  it("accepts a percent-encoded scoped id and an internal graph-file id", async () => {
    const internalId = "@acme/geo::sandbox/helper.js";
    getSandboxCatalog.mockReturnValue(
      catalogServing({
        "@acme/geo": GEO,
        [internalId]: { ...GEO, moduleId: internalId, dependencies: [] }
      })
    );

    const encodedEntry = await app.inject({
      method: "GET",
      url: `/api/sandbox-modules/${encodeURIComponent("@acme/geo")}`
    });
    const encodedInternal = await app.inject({
      method: "GET",
      url: `/api/sandbox-modules/${encodeURIComponent(internalId)}`
    });

    expect(encodedEntry.statusCode).toBe(200);
    expect(encodedInternal.statusCode).toBe(200);
    expect(encodedInternal.body).toBe(SOURCE);
  });

  it("404s an unknown id and 403s an entitlement refusal", async () => {
    getSandboxCatalog.mockReturnValue(
      catalogServing({
        "@acme/private": sandboxDeliveryRefusal(
          "forbidden",
          "Sandbox module @acme/private is not available to this client."
        )
      })
    );

    const unknown = await app.inject({
      method: "GET",
      url: "/api/sandbox-modules/@acme/absent"
    });
    const refused = await app.inject({
      method: "GET",
      url: "/api/sandbox-modules/@acme/private"
    });

    expect(unknown.statusCode).toBe(404);
    expect(refused.statusCode).toBe(403);
  });

  it("404s when no host has built a catalog", async () => {
    getSandboxCatalog.mockReturnValue(null);

    const response = await app.inject({
      method: "GET",
      url: "/api/sandbox-modules/@acme/geo"
    });

    expect(response.statusCode).toBe(404);
  });

  it("never answers with a filesystem path, delivered or refused", async () => {
    const ok = await app.inject({
      method: "GET",
      url: "/api/sandbox-modules/@acme/geo"
    });
    const missing = await app.inject({
      method: "GET",
      url: "/api/sandbox-modules/@acme/absent"
    });

    // The route hands out only what the catalog returned, and the catalog's
    // refusal names the requested id — never where the pack lives on disk.
    expect(missing.statusCode).toBe(404);
    for (const response of [ok, missing]) {
      const serialized = `${response.body}${JSON.stringify(response.headers)}`;
      expect(serialized).not.toContain(PACK_DIRECTORY);
    }
  });
});
