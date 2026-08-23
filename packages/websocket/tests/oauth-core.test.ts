import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  buildProtectedResourceMetadata,
  buildAuthServerMetadata
} from "../src/oauth/metadata.js";
import { buildBearerChallenge } from "../src/oauth/www-authenticate.js";
import {
  isAllowedRedirectUri,
  canonicalResource,
  resourceMatches,
  validateScope
} from "../src/oauth/validate.js";
import { verifyS256 } from "../src/oauth/pkce.js";
import { pendingStore, PendingStore } from "../src/oauth/pending-store.js";
import { isClientIdUrl, fetchClientMetadata } from "../src/oauth/cimd.js";

const PUBLIC_URL = "https://nodetool.example.com";

// ── metadata.ts ─────────────────────────────────────────────────────────

describe("buildProtectedResourceMetadata", () => {
  it("matches the design doc JSON exactly for a fixed publicUrl", () => {
    expect(buildProtectedResourceMetadata(PUBLIC_URL)).toEqual({
      resource: "https://nodetool.example.com/mcp",
      authorization_servers: ["https://nodetool.example.com"],
      scopes_supported: ["mcp"],
      bearer_methods_supported: ["header"],
      resource_name: "NodeTool MCP"
    });
  });

  it("strips a trailing slash", () => {
    expect(buildProtectedResourceMetadata("https://nodetool.example.com/").resource).toBe(
      "https://nodetool.example.com/mcp"
    );
  });

  it("lowercases scheme and host", () => {
    const meta = buildProtectedResourceMetadata("HTTPS://NodeTool.Example.COM");
    expect(meta.resource).toBe("https://nodetool.example.com/mcp");
    expect(meta.authorization_servers).toEqual(["https://nodetool.example.com"]);
  });
});

describe("buildAuthServerMetadata", () => {
  it("matches the design doc JSON exactly for a fixed publicUrl", () => {
    expect(buildAuthServerMetadata(PUBLIC_URL)).toEqual({
      issuer: "https://nodetool.example.com",
      authorization_endpoint: "https://nodetool.example.com/oauth/authorize",
      token_endpoint: "https://nodetool.example.com/oauth/token",
      registration_endpoint: "https://nodetool.example.com/oauth/register",
      revocation_endpoint: "https://nodetool.example.com/oauth/revoke",
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["mcp"],
      client_id_metadata_document_supported: true,
      authorization_response_iss_parameter_supported: true
    });
  });

  it("strips a trailing slash and lowercases the host", () => {
    const meta = buildAuthServerMetadata("https://NodeTool.Example.com/");
    expect(meta.issuer).toBe("https://nodetool.example.com");
    expect(meta.token_endpoint).toBe("https://nodetool.example.com/oauth/token");
  });
});

// ── www-authenticate.ts ─────────────────────────────────────────────────

describe("buildBearerChallenge", () => {
  it("builds the challenge without an error", () => {
    expect(buildBearerChallenge({ publicUrl: PUBLIC_URL })).toBe(
      'Bearer resource_metadata="https://nodetool.example.com/.well-known/oauth-protected-resource/mcp", scope="mcp"'
    );
  });

  it("appends error=invalid_token when set", () => {
    expect(
      buildBearerChallenge({ publicUrl: PUBLIC_URL, error: "invalid_token" })
    ).toBe(
      'Bearer resource_metadata="https://nodetool.example.com/.well-known/oauth-protected-resource/mcp", scope="mcp", error="invalid_token"'
    );
  });
});

// ── validate.ts ─────────────────────────────────────────────────────────

describe("isAllowedRedirectUri", () => {
  it("allows https", () => {
    expect(isAllowedRedirectUri("https://claude.ai/callback")).toBe(true);
  });

  it("allows http on 127.0.0.1 with a port", () => {
    expect(isAllowedRedirectUri("http://127.0.0.1:8080/cb")).toBe(true);
  });

  it("allows http on localhost", () => {
    expect(isAllowedRedirectUri("http://localhost:1234/cb")).toBe(true);
  });

  it("rejects http on a non-loopback host", () => {
    expect(isAllowedRedirectUri("http://evil.com")).toBe(false);
  });

  it("rejects a non-http(s) scheme", () => {
    expect(isAllowedRedirectUri("myapp://cb")).toBe(false);
  });

  it("rejects an unparseable URI", () => {
    expect(isAllowedRedirectUri("not a url")).toBe(false);
  });
});

describe("canonicalResource", () => {
  it("appends /mcp to the normalized origin", () => {
    expect(canonicalResource(PUBLIC_URL)).toBe("https://nodetool.example.com/mcp");
  });
});

describe("resourceMatches", () => {
  it("is ok when absent", () => {
    expect(resourceMatches(undefined, PUBLIC_URL)).toBe(true);
  });

  it("is ok on an exact match", () => {
    expect(resourceMatches("https://nodetool.example.com/mcp", PUBLIC_URL)).toBe(true);
  });

  it("rejects a different host", () => {
    expect(resourceMatches("https://evil.com/mcp", PUBLIC_URL)).toBe(false);
  });
});

describe("validateScope", () => {
  it("accepts mcp", () => {
    expect(validateScope("mcp")).toEqual({ ok: true, scope: "mcp" });
  });

  it("accepts undefined (defaults to mcp)", () => {
    expect(validateScope(undefined)).toEqual({ ok: true, scope: "mcp" });
  });

  it("rejects an unknown scope", () => {
    expect(validateScope("admin")).toEqual({ ok: false });
  });
});

// ── pkce.ts ─────────────────────────────────────────────────────────────

describe("verifyS256", () => {
  // RFC 7636 Appendix B.
  const RFC_7636_VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const RFC_7636_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

  it("verifies the RFC 7636 appendix B vector", () => {
    expect(verifyS256(RFC_7636_VERIFIER, RFC_7636_CHALLENGE)).toBe(true);
  });

  it("rejects a wrong verifier", () => {
    expect(verifyS256("not-the-right-verifier", RFC_7636_CHALLENGE)).toBe(false);
  });

  it("rejects a challenge of a different length", () => {
    expect(verifyS256(RFC_7636_VERIFIER, "short")).toBe(false);
  });
});

// ── pending-store.ts ────────────────────────────────────────────────────

function baseRequest(): Omit<
  import("../src/oauth/pending-store.js").PendingAuthorizeRequest,
  "id" | "createdAt"
> {
  return {
    clientId: "ntc_abc123",
    clientName: "Test Client",
    redirectUri: "https://client.example.com/cb",
    codeChallenge: "challenge",
    scope: "mcp",
    resource: "https://nodetool.example.com/mcp",
    redirectHostIsLoopbackOnly: false
  };
}

describe("PendingStore", () => {
  let store: PendingStore;

  beforeEach(() => {
    store = new PendingStore();
  });

  it("round-trips a request through putRequest/takeRequestForApproval", () => {
    const id = store.putRequest(baseRequest());
    const read1 = store.takeRequestForApproval(id);
    const read2 = store.takeRequestForApproval(id);
    expect(read1?.clientName).toBe("Test Client");
    // takeRequestForApproval does not consume — readable twice.
    expect(read2?.clientName).toBe("Test Client");
  });

  it("consumeRequest consumes — a second call returns null", () => {
    const id = store.putRequest(baseRequest());
    const first = store.consumeRequest(id);
    const second = store.consumeRequest(id);
    expect(first?.clientName).toBe("Test Client");
    expect(second).toBeNull();
  });

  it("expires a pending request after its TTL", () => {
    vi.useFakeTimers();
    try {
      const id = store.putRequest(baseRequest());
      vi.advanceTimersByTime(600_001);
      expect(store.takeRequestForApproval(id)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("putCode/consumeCode round-trips and reports single consumption", () => {
    const request = { ...baseRequest(), id: "req-1", createdAt: Date.now() };
    const code = store.putCode({ request, userId: "user-1" });
    const result = store.consumeCode(code);
    expect(result?.consumedBefore).toBe(false);
    expect(result?.userId).toBe("user-1");
  });

  it("reports consumedBefore=true on a second consumption of the same code", () => {
    const request = { ...baseRequest(), id: "req-1", createdAt: Date.now() };
    const code = store.putCode({ request, userId: "user-1" });
    store.consumeCode(code);
    const replay = store.consumeCode(code);
    expect(replay?.consumedBefore).toBe(true);
  });

  it("expires a code after its TTL", () => {
    vi.useFakeTimers();
    try {
      const request = { ...baseRequest(), id: "req-1", createdAt: Date.now() };
      const code = store.putCode({ request, userId: "user-1" });
      vi.advanceTimersByTime(600_001);
      expect(store.consumeCode(code)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("the module singleton is a PendingStore instance", () => {
    expect(pendingStore).toBeInstanceOf(PendingStore);
  });
});

// ── cimd.ts ─────────────────────────────────────────────────────────────

describe("isClientIdUrl", () => {
  it("accepts an https URL with a path", () => {
    expect(isClientIdUrl("https://client.example.com/metadata.json")).toBe(true);
  });

  it("rejects an https URL with no path", () => {
    expect(isClientIdUrl("https://client.example.com")).toBe(false);
    expect(isClientIdUrl("https://client.example.com/")).toBe(false);
  });

  it("rejects a non-https URL", () => {
    expect(isClientIdUrl("http://client.example.com/metadata.json")).toBe(false);
  });

  it("rejects a bare client id (DCR)", () => {
    expect(isClientIdUrl("ntc_abc123")).toBe(false);
  });
});

const CLIENT_URL = "https://client.example.com/oauth/client-metadata.json";

function fetchDoubleReturning(
  body: unknown,
  init?: { status?: number; headers?: Record<string, string> }
): typeof fetch {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status: init?.status ?? 200,
      headers: { "content-type": "application/json", ...init?.headers }
    })
  ) as unknown as typeof fetch;
}

describe("fetchClientMetadata", () => {
  it("happy path: valid document resolves ok:true", async () => {
    const fetchImpl = fetchDoubleReturning({
      client_id: CLIENT_URL,
      client_name: "Test Client",
      redirect_uris: ["https://client.example.com/cb"]
    });
    const result = await fetchClientMetadata(CLIENT_URL, fetchImpl);
    expect(result).toEqual({
      ok: true,
      clientName: "Test Client",
      redirectUris: ["https://client.example.com/cb"]
    });
  });

  // Each case below uses its own client_id URL — fetchClientMetadata caches
  // successful lookups keyed by URL, so reusing CLIENT_URL across cases would
  // let an earlier happy-path result shadow what this fetch double returns.

  it("rejects a client_id mismatch", async () => {
    const url = "https://client.example.com/mismatch.json";
    const fetchImpl = fetchDoubleReturning({
      client_id: "https://client.example.com/different.json",
      client_name: "Test Client",
      redirect_uris: ["https://client.example.com/cb"]
    });
    const result = await fetchClientMetadata(url, fetchImpl);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/client_id/i);
    }
  });

  it("rejects a document missing required fields", async () => {
    const url = "https://client.example.com/incomplete.json";
    const fetchImpl = fetchDoubleReturning({ client_id: url });
    const result = await fetchClientMetadata(url, fetchImpl);
    expect(result.ok).toBe(false);
  });

  it("rejects an oversize body", async () => {
    const url = "https://client.example.com/oversize.json";
    const huge = "x".repeat(70 * 1024);
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          client_id: url,
          client_name: "Test Client",
          redirect_uris: ["https://client.example.com/cb"],
          padding: huge
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    ) as unknown as typeof fetch;
    const result = await fetchClientMetadata(url, fetchImpl);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/large/i);
    }
  });

  it("returns ok:false, never throws, on a fetch failure", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const result = await fetchClientMetadata(
      "https://unreachable.example.com/metadata.json",
      fetchImpl
    );
    expect(result).toEqual({ ok: false, error: expect.stringContaining("network down") });
  });

  it("returns ok:false on invalid JSON", async () => {
    const fetchImpl = vi.fn(async () => new Response("not json", { status: 200 })) as unknown as typeof fetch;
    const result = await fetchClientMetadata(
      "https://client.example.com/bad.json",
      fetchImpl
    );
    expect(result.ok).toBe(false);
  });

  it("caches a successful lookup and does not re-fetch within max-age", async () => {
    const url = "https://client.example.com/cached.json";
    const fetchImpl = fetchDoubleReturning({
      client_id: url,
      client_name: "Cached Client",
      redirect_uris: ["https://client.example.com/cb"]
    });
    await fetchClientMetadata(url, fetchImpl);
    await fetchClientMetadata(url, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
