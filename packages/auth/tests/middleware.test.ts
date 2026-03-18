/**
 * Dedicated tests for middleware.ts — HttpError, createAuthMiddleware, getUserId.
 */
import { describe, it, expect } from "vitest";
import {
  HttpError,
  createAuthMiddleware,
  getUserId,
  TokenType,
} from "../src/index.js";
import { AuthProvider, AuthResult } from "../src/auth-provider.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRequest(headers: Record<string, string>): Request {
  return new Request("http://localhost/test", { headers });
}

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
// HttpError
// ---------------------------------------------------------------------------
describe("HttpError", () => {
  it("has correct statusCode and message", () => {
    const err = new HttpError(403, "Forbidden");
    expect(err.statusCode).toBe(403);
    expect(err.message).toBe("Forbidden");
  });

  it("is an instance of Error", () => {
    const err = new HttpError(500, "Internal");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(HttpError);
  });

  it("has name set to HttpError", () => {
    const err = new HttpError(404, "Not found");
    expect(err.name).toBe("HttpError");
  });
});

// ---------------------------------------------------------------------------
// createAuthMiddleware
// ---------------------------------------------------------------------------
describe("createAuthMiddleware", () => {
  it("returns default user when enforceAuth=false and no token", async () => {
    const staticProvider = new StubProvider({
      ok: false,
      error: "No token",
    });
    const authenticate = createAuthMiddleware({
      staticProvider,
      enforceAuth: false,
    });

    const user = await authenticate(makeRequest({}));
    expect(user.userId).toBe("1");
    expect(user.tokenType).toBe(TokenType.STATIC);
  });

  it("throws 401 when enforceAuth=false but invalid token is provided", async () => {
    const staticProvider = new StubProvider({
      ok: false,
      error: "Invalid token",
    });
    const authenticate = createAuthMiddleware({
      staticProvider,
      enforceAuth: false,
    });

    const request = makeRequest({ authorization: "Bearer bad-token" });
    await expect(authenticate(request)).rejects.toThrow(HttpError);
    try {
      await authenticate(request);
    } catch (e) {
      expect((e as HttpError).statusCode).toBe(401);
    }
  });

  it("returns authenticated user with valid static token and enforceAuth=true", async () => {
    const staticProvider = new StubProvider({
      ok: true,
      userId: "static-user",
      tokenType: TokenType.STATIC,
    });
    const authenticate = createAuthMiddleware({
      staticProvider,
      enforceAuth: true,
    });

    const request = makeRequest({ authorization: "Bearer good-token" });
    const user = await authenticate(request);
    expect(user.userId).toBe("static-user");
    expect(user.tokenType).toBe(TokenType.STATIC);
  });

  it("returns authenticated user via userProvider when static rejects", async () => {
    const staticProvider = new StubProvider({
      ok: false,
      error: "static fail",
    });
    const userProvider = new StubProvider({
      ok: true,
      userId: "jwt-user",
      tokenType: TokenType.USER,
    });
    const authenticate = createAuthMiddleware({
      staticProvider,
      userProvider,
      enforceAuth: true,
    });

    const request = makeRequest({ authorization: "Bearer user-tok" });
    const user = await authenticate(request);
    expect(user.userId).toBe("jwt-user");
    expect(user.tokenType).toBe(TokenType.USER);
  });

  it("throws 401 when enforceAuth=true and no token", async () => {
    const staticProvider = new StubProvider({ ok: false });
    const authenticate = createAuthMiddleware({
      staticProvider,
      enforceAuth: true,
    });

    await expect(authenticate(makeRequest({}))).rejects.toThrow(HttpError);
    try {
      await authenticate(makeRequest({}));
    } catch (e) {
      expect((e as HttpError).statusCode).toBe(401);
      expect((e as HttpError).message).toContain("Authorization header required");
    }
  });

  it("throws 401 when both providers reject", async () => {
    const staticProvider = new StubProvider({
      ok: false,
      error: "static nope",
    });
    const userProvider = new StubProvider({
      ok: false,
      error: "user nope",
    });
    const authenticate = createAuthMiddleware({
      staticProvider,
      userProvider,
      enforceAuth: true,
    });

    const request = makeRequest({ authorization: "Bearer bad" });
    try {
      await authenticate(request);
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError);
      expect((e as HttpError).statusCode).toBe(401);
    }
  });
});

// ---------------------------------------------------------------------------
// getUserId
// ---------------------------------------------------------------------------
describe("getUserId", () => {
  it("returns user ID from x-user-id header", () => {
    const request = makeRequest({ "x-user-id": "u42" });
    expect(getUserId(request)).toBe("u42");
  });

  it("defaults to '1' when no header is present", () => {
    expect(getUserId(makeRequest({}))).toBe("1");
  });

  it("supports custom header name", () => {
    const request = makeRequest({ "x-custom": "u99" });
    expect(getUserId(request, "x-custom")).toBe("u99");
  });
});
