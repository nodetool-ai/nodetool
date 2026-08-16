/**
 * Browser sandbox module catalog: fetch, verify, cache, resolve.
 *
 * jsdom has no Fetch classes, so `fetch` and the delivery responses are faked —
 * only the four members the catalog reads. The hash check is not faked: it runs
 * on the real `crypto.subtle` jest.setup.js hands jsdom, against the real body
 * bytes, so a mismatch here is the mismatch a browser would compute.
 */
import {
  clearSandboxModuleCache,
  collectSandboxModuleDeclarations,
  createSeededSandboxModuleCatalog,
  fetchSandboxModuleClosure,
  type SandboxModuleRecord
} from "../sandboxModuleCatalog";
import { stub } from "../../../test-utils/doubles";
import type { WorkflowGraph } from "../../../stores/ApiTypes";

const DIGEST = "a".repeat(64);
const OTHER_DIGEST = "e".repeat(64);
const ENTRY_SOURCE =
  'import { round } from "./internal/round.js";\nexport const geo = () => round(1);\n';
const HELPER_SOURCE = "export const round = (n) => n;\n";
const HELPER_ID = "@acme/nodetool-geo::sandbox/internal/round.js";

async function sha(body: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(body)
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** The members of `Response` the catalog reads, and nothing else. */
function fakeResponse(
  status: number,
  body: string,
  headers: Record<string, string> = {}
): Response {
  const lookup = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );
  return stub<Response>({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => lookup.get(name.toLowerCase()) ?? null },
    arrayBuffer: async () => new TextEncoder().encode(body).buffer
  });
}

async function jsResponse(
  source: string,
  headers: Record<string, string> = {}
): Promise<Response> {
  return fakeResponse(200, source, {
    "Content-Type": "text/javascript",
    "X-Content-Digest": DIGEST,
    "X-Content-Sha256": await sha(source),
    "X-Sandbox-Pack": "@acme/nodetool-geo",
    "X-Sandbox-Pack-Version": "1.2.0",
    "X-Sandbox-File-Id": "sandbox/geo.js",
    "X-Sandbox-Internal": "0",
    "X-Sandbox-Module-Dependencies": "[]",
    ...headers
  });
}

type FetchStub = jest.Mock<Promise<Response>, [unknown, RequestInit?]>;

/** jsdom has no `fetch`, so install one rather than spy on a missing global. */
function installFetch(
  impl: (input: unknown, init?: RequestInit) => Promise<Response>
): FetchStub {
  const mock = jest.fn(impl) as FetchStub;
  (globalThis as { fetch?: unknown }).fetch = mock;
  return mock;
}

/** The `If-None-Match` validator a conditional request carries, if any. */
function validatorOf(init?: RequestInit): string | null {
  return new Headers(init?.headers).get("If-None-Match");
}

/**
 * The two-file graph the server serves for `@acme/geo`, honoring
 * `If-None-Match` the way the delivery route does — the route answers
 * `Cache-Control: private, no-cache`, so a conditional request is what the
 * client sends for anything it already holds.
 */
function serveGeoGraph(digest: string = DIGEST): FetchStub {
  return installFetch(async (input, init) => {
    if (validatorOf(init) === `"${digest}"`) return fakeResponse(304, "");
    const url = String(input);
    if (url.includes(encodeURIComponent(HELPER_ID))) {
      return jsResponse(HELPER_SOURCE, {
        "X-Content-Digest": digest,
        "X-Sandbox-File-Id": "sandbox/internal/round.js",
        "X-Sandbox-Internal": "1"
      });
    }
    return jsResponse(ENTRY_SOURCE, {
      "X-Content-Digest": digest,
      "X-Sandbox-Module-Dependencies": JSON.stringify([HELPER_ID])
    });
  });
}

beforeEach(() => {
  clearSandboxModuleCache();
});

afterEach(() => {
  jest.restoreAllMocks();
  delete (globalThis as { fetch?: unknown }).fetch;
});

describe("collectSandboxModuleDeclarations", () => {
  const graphWith = (properties: unknown): WorkflowGraph =>
    stub<WorkflowGraph>({
      nodes: [{ id: "code_1", type: "nodetool.code.Code", data: properties }],
      edges: []
    });

  it("reads string and object declarations, deduped by specifier", () => {
    expect(
      collectSandboxModuleDeclarations(
        graphWith({
          properties: {
            packages: [
              "@acme/geo",
              { specifier: "@acme/geo" },
              { specifier: "@acme/other", resolvedPackVersion: "2.0.0" }
            ]
          }
        })
      )
    ).toEqual([
      { specifier: "@acme/geo" },
      { specifier: "@acme/other", resolvedPackVersion: "2.0.0" }
    ]);
  });

  it("reads a flattened graph shape and ignores non-Code nodes", () => {
    expect(
      collectSandboxModuleDeclarations(stub<WorkflowGraph>({
        nodes: [
          { id: "n", type: "browser.Const", data: { packages: ["@x/y"] } },
          {
            id: "code_1",
            type: "nodetool.code.Code",
            data: { packages: ["@acme/geo"] }
          }
        ],
        edges: []
      }))
    ).toEqual([{ specifier: "@acme/geo" }]);
  });

  it("is empty for a graph with no Code node", () => {
    expect(collectSandboxModuleDeclarations(null)).toEqual([]);
  });
});

describe("fetchSandboxModuleClosure", () => {
  it("walks the dependency header and verifies every body", async () => {
    const fetchMock = serveGeoGraph();

    const records = await fetchSandboxModuleClosure(["@acme/geo"]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(records.map((record) => record.moduleId).sort()).toEqual([
      "@acme/geo",
      HELPER_ID
    ]);
    const entry = records.find((r) => r.moduleId === "@acme/geo");
    expect(entry).toMatchObject({
      fileId: "sandbox/geo.js",
      internal: false,
      packName: "@acme/nodetool-geo",
      packVersion: "1.2.0",
      contentDigest: DIGEST,
      source: ENTRY_SOURCE
    });
    expect(records.find((r) => r.moduleId === HELPER_ID)?.internal).toBe(true);
  });

  it("revalidates the root on a second run and keeps the cache on a 304", async () => {
    // Nothing tells the browser a pack was upgraded, so a cached root is never
    // simply accepted: the second run asks, conditionally, and the 304 is what
    // makes reusing the closure safe rather than hopeful.
    const fetchMock = serveGeoGraph();

    const first = await fetchSandboxModuleClosure(["@acme/geo"]);
    const second = await fetchSandboxModuleClosure(["@acme/geo"]);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [, revalidation] = fetchMock.mock.calls[2] ?? [];
    expect(validatorOf(revalidation)).toBe(`"${DIGEST}"`);
    // The 304 costs a round trip, not a re-download: the records are the ones
    // already verified, dependencies included.
    expect(second).toEqual(first);
  });

  it("replaces the whole closure when the revalidated root moved", async () => {
    serveGeoGraph();
    const warm = await fetchSandboxModuleClosure(["@acme/geo"]);
    expect(warm.every((record) => record.contentDigest === DIGEST)).toBe(true);

    // v2: same ids, new digest, new source. The conditional request no longer
    // matches, so the root comes back 200 and the cached helper — whose digest
    // is now stale against it — is fetched again.
    const V2_ENTRY = `${ENTRY_SOURCE}export const version = 2;\n`;
    const V2_HELPER = "export const round = (n) => Math.round(n);\n";
    const fetchMock = installFetch(async (input, init) => {
      if (validatorOf(init) === `"${OTHER_DIGEST}"`) return fakeResponse(304, "");
      const url = String(input);
      if (url.includes(encodeURIComponent(HELPER_ID))) {
        return jsResponse(V2_HELPER, {
          "X-Content-Digest": OTHER_DIGEST,
          "X-Sandbox-File-Id": "sandbox/internal/round.js",
          "X-Sandbox-Internal": "1"
        });
      }
      return jsResponse(V2_ENTRY, {
        "X-Content-Digest": OTHER_DIGEST,
        "X-Sandbox-Module-Dependencies": JSON.stringify([HELPER_ID])
      });
    });

    const upgraded = await fetchSandboxModuleClosure(["@acme/geo"]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(upgraded.every((record) => record.contentDigest === OTHER_DIGEST)).toBe(
      true
    );
    const entry = upgraded.find((record) => record.moduleId === "@acme/geo");
    const helper = upgraded.find((record) => record.moduleId === HELPER_ID);
    expect(entry).toMatchObject({ kind: "js", source: V2_ENTRY });
    expect(helper).toMatchObject({ kind: "js", source: V2_HELPER });

    // And v2 is what the cache now holds: the next run revalidates against the
    // new digest and is answered 304.
    const again = await fetchSandboxModuleClosure(["@acme/geo"]);
    expect(again).toEqual(upgraded);
    expect(validatorOf(fetchMock.mock.calls[2]?.[1])).toBe(`"${OTHER_DIGEST}"`);
  });

  it("re-fetches a dependency left over from another pack version", async () => {
    // The helper's id is stable across versions, so a cached record from the
    // old graph would otherwise be served forever.
    installFetch(async (input) => {
      const url = String(input);
      if (url.includes(encodeURIComponent(HELPER_ID))) {
        return jsResponse(HELPER_SOURCE, {
          "X-Content-Digest": OTHER_DIGEST,
          "X-Sandbox-File-Id": "sandbox/internal/round.js"
        });
      }
      return jsResponse(ENTRY_SOURCE, {
        "X-Sandbox-Module-Dependencies": JSON.stringify([HELPER_ID])
      });
    });
    await fetchSandboxModuleClosure(["@acme/geo"]);

    const fetchMock = serveGeoGraph();
    await fetchSandboxModuleClosure(["@acme/geo"]);

    // The root is revalidated and answers 304; the stale-digest helper is
    // fetched again.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(validatorOf(fetchMock.mock.calls[0]?.[1])).toBe(`"${DIGEST}"`);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
      encodeURIComponent(HELPER_ID)
    );
  });

  it("rejects a body that does not match its announced hash, and caches nothing", async () => {
    const fetchMock = installFetch(async () =>
      jsResponse(ENTRY_SOURCE, { "X-Content-Sha256": "b".repeat(64) })
    );

    await expect(fetchSandboxModuleClosure(["@acme/geo"])).rejects.toThrow(
      /failed its content check/
    );

    // Nothing verified, nothing cached: the next attempt fetches again.
    await expect(fetchSandboxModuleClosure(["@acme/geo"])).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("maps a 404 to 'not available on this server'", async () => {
    installFetch(async () => fakeResponse(404, ""));
    await expect(fetchSandboxModuleClosure(["@acme/geo"])).rejects.toThrow(
      /@acme\/geo is not available on this server/
    );
  });

  it("maps a 403 to a client-entitlement refusal", async () => {
    installFetch(async () => fakeResponse(403, ""));
    await expect(fetchSandboxModuleClosure(["@acme/geo"])).rejects.toThrow(
      /not available to this client/
    );
  });

  it("rejects a response missing its content headers", async () => {
    installFetch(async () =>
      fakeResponse(200, ENTRY_SOURCE, { "Content-Type": "text/javascript" })
    );
    await expect(fetchSandboxModuleClosure(["@acme/geo"])).rejects.toThrow(
      /without its content headers/
    );
  });
});

describe("createSeededSandboxModuleCatalog", () => {
  const records: SandboxModuleRecord[] = [
    {
      moduleId: "@acme/geo",
      fileId: "sandbox/geo.js",
      internal: false,
      packName: "@acme/nodetool-geo",
      packVersion: "1.2.0",
      contentDigest: DIGEST,
      contentSha256: "0".repeat(64),
      dependencies: [HELPER_ID],
      kind: "js",
      source: ENTRY_SOURCE
    },
    {
      moduleId: HELPER_ID,
      fileId: "sandbox/internal/round.js",
      internal: true,
      packName: "@acme/nodetool-geo",
      packVersion: "1.2.0",
      contentDigest: DIGEST,
      contentSha256: "1".repeat(64),
      dependencies: [],
      kind: "js",
      source: HELPER_SOURCE
    }
  ];

  it("resolves an entry with its whole graph, in guest file-id terms", () => {
    const resolution = createSeededSandboxModuleCatalog(
      records
    ).resolveForExecution([{ specifier: "@acme/geo" }]);

    expect(resolution.statuses).toEqual([]);
    const [module] = resolution.modules;
    expect(module).toMatchObject({
      specifier: "@acme/geo",
      packName: "@acme/nodetool-geo",
      packVersion: "1.2.0",
      contentDigest: DIGEST,
      // The guest loader links relative imports against the file id, never
      // against the specifier the module was fetched by.
      moduleId: "sandbox/geo.js"
    });
    expect(module.graph.map((file) => file.id)).toEqual([
      "sandbox/geo.js",
      "sandbox/internal/round.js"
    ]);
    expect(module.graph[0]).toMatchObject({
      dependencies: ["sandbox/internal/round.js"],
      internal: false
    });
  });

  it("reports a specifier it was not seeded with as not installed", () => {
    const resolution = createSeededSandboxModuleCatalog(
      records
    ).resolveForExecution([{ specifier: "@acme/missing" }]);

    expect(resolution.modules).toEqual([]);
    expect(resolution.statuses[0]).toMatchObject({
      status: "error",
      code: "module-not-found",
      packName: "@acme/missing"
    });
  });

  it("warns when the saved pack version or digest moved", () => {
    const resolution = createSeededSandboxModuleCatalog(
      records
    ).resolveForExecution([
      {
        specifier: "@acme/geo",
        resolvedPackVersion: "1.0.0",
        contentDigest: OTHER_DIGEST
      }
    ]);

    expect(resolution.modules).toHaveLength(1);
    expect(resolution.statuses.map((status) => status.code)).toEqual([
      "version-mismatch",
      "content-digest-mismatch"
    ]);
    expect(
      resolution.statuses.every((status) => status.status === "warning")
    ).toBe(true);
  });

  it("summarizes entries only, and refuses to deliver", async () => {
    const catalog = createSeededSandboxModuleCatalog(records);

    expect(catalog.summaries()).toEqual([
      {
        specifier: "@acme/geo",
        packName: "@acme/nodetool-geo",
        packVersion: "1.2.0",
        kind: "js"
      }
    ]);
    expect(catalog.diagnostics()).toEqual([]);
    await expect(catalog.authorizeDelivery("@acme/geo")).resolves.toMatchObject(
      { authorized: false }
    );
  });
});
