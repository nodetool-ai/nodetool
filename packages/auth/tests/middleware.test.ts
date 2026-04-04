import { describe, it, expect } from "vitest";
import {
  createAuthMiddleware,
  getUserId,
  HttpError,
  type AuthMiddlewareOptions
} from "../src/middleware.js";
import { AuthProvider, AuthResult, TokenType } from "../src/auth-provider.js";

// ---------------------------------------------------------------------------
// Mock providers
// ---------------------------------------------------------------------------
class AcceptProvider extends AuthProvider {
  constructor(private readonly userId: string = "static-user") {
    super();
  }
  async verifyToken(_token: string): Promise<AuthResult> {
    return { ok: true, userId: this.userId, tokenType: TokenType.STATIC };
  }
}

class RejectProvider extends AuthProvider {
  constructor(private readonly msg = "Invalid token") {
    super();
  }
  async verifyToken(_token: string): Promise<AuthResult> {
    return { ok: false, error: this.msg };
  }
}

function makeRequest(
  headers: Record<string, string>,
  path = "/api/test"
): Request {
  return new Request(`http://localhost${path}`, { headers });
}

function bearerRequest(token: string, path = "/api/test"): Request {
  return makeRequest({ authorization: `Bearer ${token}` }, path);
}

// ---------------------------------------------------------------------------
// HttpError
// ---------------------------------------------------------------------------
describe("HttpError", () => {
  it("is an instance of Error", () => {
    const err = new HttpError(401, "Unauthorized");
    expect(err).toBeInstanceOf(Error);
  });

  it("stores statusCode and message", () => {
    const err = new HttpError(403, "Forbidden");
    expect(err.statusCode).toBe(403);
    expect(err.message).toBe("Forbidden");
  });

  it("has name 'HttpError'", () => {
    const err = new HttpError(500, "Server error");
    expect(err.name).toBe("HttpError");
  });
});

// ---------------------------------------------------------------------------
// createAuthMiddleware
// ---------------------------------------------------------------------------
describe("createAuthMiddleware", () => {
  // ── enforceAuth = true ──────────────────────────────────────────────────
  describe("with enforceAuth = true", () => {
    function opts(
      overrides?: Partial<AuthMiddlewareOptions>
    ): AuthMiddlewareOptions {
      return {
        staticProvider: new RejectProvider(),
        enforceAuth: true,
        ...overrides
      };
    }

    it("throws HttpError 401 when no Authorization header", async () => {
      const middleware = createAuthMiddleware(opts());
      const req = makeRequest({});
      await expect(middleware(req)).rejects.toThrow(HttpError);
      await expect(middleware(req)).rejects.toMatchObject({ statusCode: 401 });
    });

    it("returns user when staticProvider accepts the token", async () => {
      const middleware = createAuthMiddleware(
        opts({ staticProvider: new AcceptProvider("alice") })
      );
      const req = bearerRequest("any-token");
      const user = await middleware(req);
      expect(user.userId).toBe("alice");
      expect(user.tokenType).toBe(TokenType.STATIC);
    });

    it("falls through to userProvider when staticProvider rejects", async () => {
      const middleware = createAuthMiddleware(
        opts({
          staticProvider: new RejectProvider("not static"),
          userProvider: new AcceptProvider("bob")
        })
      );
      const req = bearerRequest("user-token");
      const user = await middleware(req);
      expect(user.userId).toBe("bob");
      expect(user.tokenType).toBe(TokenType.STATIC);
    });

    it("throws HttpError 401 with userProvider error when both providers reject", async () => {
      const middleware = createAuthMiddleware(
        opts({
          staticProvider: new RejectProvider("bad static"),
          userProvider: new RejectProvider("bad user")
        })
      );
      const req = bearerRequest("bad-token");
      await expect(middleware(req)).rejects.toMatchObject({ statusCode: 401 });
    });

    it("throws HttpError 401 with staticProvider error when no userProvider and staticProvider rejects", async () => {
      const middleware = createAuthMiddleware(opts());
      const req = bearerRequest("bad-token");
      await expect(middleware(req)).rejects.toMatchObject({ statusCode: 401 });
    });
  });

  // ── enforceAuth = false ─────────────────────────────────────────────────
  describe("with enforceAuth = false", () => {
    function opts(
      overrides?: Partial<AuthMiddlewareOptions>
    ): AuthMiddlewareOptions {
      return {
        staticProvider: new RejectProvider(),
        enforceAuth: false,
        ...overrides
      };
    }

    it("returns default user '1' when no Authorization header", async () => {
      const middleware = createAuthMiddleware(opts());
      const req = makeRequest({});
      const user = await middleware(req);
      expect(user.userId).toBe("1");
      expect(user.tokenType).toBe(TokenType.STATIC);
    });

    it("still validates the token when one is supplied", async () => {
      const middleware = createAuthMiddleware(
        opts({ staticProvider: new AcceptProvider("carol") })
      );
      const req = bearerRequest("some-token");
      const user = await middleware(req);
      expect(user.userId).toBe("carol");
    });

    it("falls back to default user when a token is supplied but both providers reject", async () => {
      const middleware = createAuthMiddleware(
        opts({
          staticProvider: new RejectProvider(),
          userProvider: new RejectProvider()
        })
      );
      const req = bearerRequest("invalid");
      const user = await middleware(req);
      expect(user.userId).toBe("1");
      expect(user.tokenType).toBe(TokenType.STATIC);
    });
  });
});

// ---------------------------------------------------------------------------
// getUserId
// ---------------------------------------------------------------------------
describe("getUserId", () => {
  it("returns the value of x-user-id header", () => {
    const req = makeRequest({ "x-user-id": "user-99" });
    expect(getUserId(req)).toBe("user-99");
  });

  it("returns '1' when x-user-id header is missing", () => {
    const req = makeRequest({});
    expect(getUserId(req)).toBe("1");
  });

  it("returns the value of a custom header when specified", () => {
    const req = makeRequest({ "x-custom-user": "custom-55" });
    expect(getUserId(req, "x-custom-user")).toBe("custom-55");
  });

  it("returns '1' when custom header is missing", () => {
    const req = makeRequest({});
    expect(getUserId(req, "x-custom-user")).toBe("1");
  });
});
