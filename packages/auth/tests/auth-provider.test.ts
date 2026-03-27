import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  AuthProvider,
  AuthResult,
  TokenType,
  LocalAuthProvider,
  StaticTokenProvider,
  createAuthMiddleware,
  getUserId,
  HttpError,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// Concrete subclass for testing the abstract AuthProvider methods
// ---------------------------------------------------------------------------
class StubProvider extends AuthProvider {
  result: AuthResult;

  constructor(result: AuthResult) {
    super();
    this.result = result;
  }

  async verifyToken(_token: string): Promise<AuthResult> {
    return this.result;
  }
}

// ---------------------------------------------------------------------------
// Helper to build a minimal Request with given headers
// ---------------------------------------------------------------------------
function makeRequest(headers: Record<string, string>): Request {
  return new Request("http://localhost/test", { headers });
}

// ---------------------------------------------------------------------------
// AuthProvider.extractTokenFromHeaders
// ---------------------------------------------------------------------------
describe("AuthProvider.extractTokenFromHeaders", () => {
  const provider = new StubProvider({ ok: true });

  it("extracts a valid bearer token from a plain object", () => {
    const token = provider.extractTokenFromHeaders({
      authorization: "Bearer abc123",
    });
    expect(token).toBe("abc123");
  });

  it("extracts a valid bearer token from Headers object", () => {
    const headers = new Headers({ Authorization: "Bearer xyz789" });
    const token = provider.extractTokenFromHeaders(headers);
    expect(token).toBe("xyz789");
  });

  it("returns null when no authorization header is present", () => {
    expect(provider.extractTokenFromHeaders({})).toBeNull();
    expect(provider.extractTokenFromHeaders(new Headers())).toBeNull();
  });

  it("returns null for malformed authorization header (no Bearer prefix)", () => {
    expect(
      provider.extractTokenFromHeaders({ authorization: "Token abc" })
    ).toBeNull();
  });

  it("returns null for authorization header with only Bearer keyword", () => {
    expect(
      provider.extractTokenFromHeaders({ authorization: "Bearer" })
    ).toBeNull();
  });

  it("returns null for authorization header with extra parts", () => {
    expect(
      provider.extractTokenFromHeaders({
        authorization: "Bearer abc def",
      })
    ).toBeNull();
  });

  it("is case-insensitive on the Bearer keyword", () => {
    expect(
      provider.extractTokenFromHeaders({ authorization: "bearer tok" })
    ).toBe("tok");
    expect(
      provider.extractTokenFromHeaders({ authorization: "BEARER tok" })
    ).toBe("tok");
  });

  it("handles capitalized header name in plain object", () => {
    const token = provider.extractTokenFromHeaders({
      Authorization: "Bearer capital",
    });
    expect(token).toBe("capital");
  });
});

// ---------------------------------------------------------------------------
// AuthProvider.extractTokenFromWs
// ---------------------------------------------------------------------------
describe("AuthProvider.extractTokenFromWs", () => {
  const provider = new StubProvider({ ok: true });

  it("prefers token from headers over query params", () => {
    const token = provider.extractTokenFromWs(
      { authorization: "Bearer fromHeader" },
      { api_key: "fromQuery" }
    );
    expect(token).toBe("fromHeader");
  });

  it("falls back to api_key query parameter (plain object)", () => {
    const token = provider.extractTokenFromWs({}, { api_key: "qkey" });
    expect(token).toBe("qkey");
  });

  it("falls back to api_key query parameter (URLSearchParams)", () => {
    const params = new URLSearchParams("api_key=ukey");
    const token = provider.extractTokenFromWs({}, params);
    expect(token).toBe("ukey");
  });

  it("returns null when neither header nor query param is present", () => {
    expect(provider.extractTokenFromWs({}, {})).toBeNull();
    expect(provider.extractTokenFromWs({})).toBeNull();
  });

  it("trims whitespace from api_key", () => {
    const token = provider.extractTokenFromWs({}, { api_key: "  spaced  " });
    expect(token).toBe("spaced");
  });

  it("returns null for empty api_key after trim", () => {
    const token = provider.extractTokenFromWs({}, { api_key: "   " });
    expect(token).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// LocalAuthProvider
// ---------------------------------------------------------------------------
describe("LocalAuthProvider", () => {
  it("always returns ok with userId '1'", async () => {
    const provider = new LocalAuthProvider();
    const result = await provider.verifyToken("anything");
    expect(result.ok).toBe(true);
    expect(result.userId).toBe("1");
    expect(result.tokenType).toBe(TokenType.STATIC);
  });

  it("returns ok even for empty string token", async () => {
    const provider = new LocalAuthProvider();
    const result = await provider.verifyToken("");
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// StaticTokenProvider
// ---------------------------------------------------------------------------
describe("StaticTokenProvider", () => {
  it("accepts a valid token", async () => {
    const provider = new StaticTokenProvider({ secret123: "user42" });
    const result = await provider.verifyToken("secret123");
    expect(result.ok).toBe(true);
    expect(result.userId).toBe("user42");
    expect(result.tokenType).toBe(TokenType.STATIC);
  });

  it("rejects an invalid token", async () => {
    const provider = new StaticTokenProvider({ secret123: "user42" });
    const result = await provider.verifyToken("wrong");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Invalid token");
  });

  it("supports multiple tokens", async () => {
    const provider = new StaticTokenProvider({
      tok1: "u1",
      tok2: "u2",
    });
    expect((await provider.verifyToken("tok1")).userId).toBe("u1");
    expect((await provider.verifyToken("tok2")).userId).toBe("u2");
    expect((await provider.verifyToken("tok3")).ok).toBe(false);
  });

  describe("from environment variables", () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it("reads STATIC_AUTH_TOKEN", async () => {
      process.env["STATIC_AUTH_TOKEN"] = "envtok";
      const provider = new StaticTokenProvider();
      const result = await provider.verifyToken("envtok");
      expect(result.ok).toBe(true);
      expect(result.userId).toBe("1");
    });

    it("reads STATIC_AUTH_TOKENS as JSON", async () => {
      process.env["STATIC_AUTH_TOKENS"] = JSON.stringify({
        alpha: "uA",
        beta: "uB",
      });
      const provider = new StaticTokenProvider();
      expect((await provider.verifyToken("alpha")).userId).toBe("uA");
      expect((await provider.verifyToken("beta")).userId).toBe("uB");
    });

    it("ignores malformed STATIC_AUTH_TOKENS JSON", async () => {
      process.env["STATIC_AUTH_TOKENS"] = "not-json{";
      // Should not throw
      const provider = new StaticTokenProvider();
      const result = await provider.verifyToken("anything");
      expect(result.ok).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// createAuthMiddleware
// ---------------------------------------------------------------------------
describe("createAuthMiddleware", () => {
  it("returns default user when enforceAuth is false and no token", async () => {
    const staticProvider = new StaticTokenProvider({ tok: "u1" });
    const authenticate = createAuthMiddleware({
      staticProvider,
      enforceAuth: false,
    });

    const request = makeRequest({});
    const user = await authenticate(request);
    expect(user.userId).toBe("1");
    expect(user.tokenType).toBe(TokenType.STATIC);
  });

  it("still validates token when enforceAuth is false and token is provided", async () => {
    const staticProvider = new StaticTokenProvider({ tok: "u1" });
    const authenticate = createAuthMiddleware({
      staticProvider,
      enforceAuth: false,
    });

    const request = makeRequest({ authorization: "Bearer tok" });
    const user = await authenticate(request);
    expect(user.userId).toBe("u1");
  });

  it("throws 401 when enforceAuth is true and no token", async () => {
    const staticProvider = new StaticTokenProvider({ tok: "u1" });
    const authenticate = createAuthMiddleware({
      staticProvider,
      enforceAuth: true,
    });

    const request = makeRequest({});
    await expect(authenticate(request)).rejects.toThrow(HttpError);
    try {
      await authenticate(request);
    } catch (e) {
      expect((e as HttpError).statusCode).toBe(401);
    }
  });

  it("authenticates via static provider", async () => {
    const staticProvider = new StaticTokenProvider({ secret: "u5" });
    const authenticate = createAuthMiddleware({
      staticProvider,
      enforceAuth: true,
    });

    const request = makeRequest({ authorization: "Bearer secret" });
    const user = await authenticate(request);
    expect(user.userId).toBe("u5");
  });

  it("falls back to user provider when static fails", async () => {
    const staticProvider = new StaticTokenProvider({ stok: "u1" });
    const userProvider = new StaticTokenProvider({ utok: "u2" });
    const authenticate = createAuthMiddleware({
      staticProvider,
      userProvider,
      enforceAuth: true,
    });

    const request = makeRequest({ authorization: "Bearer utok" });
    const user = await authenticate(request);
    expect(user.userId).toBe("u2");
    expect(user.tokenType).toBe(TokenType.STATIC);
  });

  it("throws 401 when both providers reject", async () => {
    const staticProvider = new StaticTokenProvider({ stok: "u1" });
    const userProvider = new StaticTokenProvider({ utok: "u2" });
    const authenticate = createAuthMiddleware({
      staticProvider,
      userProvider,
      enforceAuth: true,
    });

    const request = makeRequest({ authorization: "Bearer bad" });
    await expect(authenticate(request)).rejects.toThrow(HttpError);
  });

  it("throws 401 with static error when no user provider", async () => {
    const staticProvider = new StaticTokenProvider({ stok: "u1" });
    const authenticate = createAuthMiddleware({
      staticProvider,
      enforceAuth: true,
    });

    const request = makeRequest({ authorization: "Bearer bad" });
    try {
      await authenticate(request);
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError);
      expect((e as HttpError).message).toContain("Invalid");
    }
  });
});

// ---------------------------------------------------------------------------
// getUserId helper
// ---------------------------------------------------------------------------
describe("getUserId", () => {
  it("returns user ID from x-user-id header", () => {
    const request = makeRequest({ "x-user-id": "u99" });
    expect(getUserId(request)).toBe("u99");
  });

  it("returns '1' when header is missing", () => {
    const request = makeRequest({});
    expect(getUserId(request)).toBe("1");
  });

  it("supports custom header name", () => {
    const request = makeRequest({ "x-custom-user": "u50" });
    expect(getUserId(request, "x-custom-user")).toBe("u50");
  });
});

// ---------------------------------------------------------------------------
// AuthProvider.preferHeader (static)
// ---------------------------------------------------------------------------
describe("AuthProvider.preferHeader", () => {
  it("returns 'authorization'", () => {
    expect(AuthProvider.preferHeader()).toBe("authorization");
  });
});

// ---------------------------------------------------------------------------
// AuthProvider.clearCaches (default no-op)
// ---------------------------------------------------------------------------
describe("AuthProvider.clearCaches", () => {
  it("does not throw (default no-op)", () => {
    const provider = new StubProvider({ ok: true });
    expect(() => provider.clearCaches()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// StaticTokenProvider.clearCaches
// ---------------------------------------------------------------------------
describe("StaticTokenProvider.clearCaches", () => {
  it("does not throw", () => {
    const provider = new StaticTokenProvider({ tok: "u1" });
    expect(() => provider.clearCaches()).not.toThrow();
  });
});
