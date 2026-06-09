import { describe, it, expect } from "vitest";
import {
  extractBearerToken,
  authenticateRequest,
  requireAuth,
  type HttpAuthOptions
} from "../src/http-auth.js";
import { AuthProvider, AuthResult, TokenType } from "../src/auth-provider.js";

// ---------------------------------------------------------------------------
// Mock provider: accepts "valid-token", rejects everything else
// ---------------------------------------------------------------------------
class MockProvider extends AuthProvider {
  async verifyToken(token: string): Promise<AuthResult> {
    if (token === "valid-token") {
      return { ok: true, userId: "42", tokenType: TokenType.USER };
    }
    return { ok: false, error: "Invalid token" };
  }
}

/** Accepts any token — used to prove the empty-token short-circuit matters. */
class AcceptAllProvider extends AuthProvider {
  async verifyToken(_token: string): Promise<AuthResult> {
    return { ok: true, userId: "any", tokenType: TokenType.STATIC };
  }
}

function makeRequest(
  headers: Record<string, string>,
  path: string = "/api/test"
): Request {
  return new Request(`http://localhost${path}`, { headers });
}

function defaultOptions(overrides?: Partial<HttpAuthOptions>): HttpAuthOptions {
  return { provider: new MockProvider(), ...overrides };
}

// ---------------------------------------------------------------------------
// extractBearerToken
// ---------------------------------------------------------------------------
describe("extractBearerToken", () => {
  it("extracts token from valid Bearer header", () => {
    const req = makeRequest({ authorization: "Bearer abc123" });
    expect(extractBearerToken(req)).toBe("abc123");
  });

  it("returns null for non-Bearer scheme", () => {
    const req = makeRequest({ authorization: "Basic abc" });
    expect(extractBearerToken(req)).toBeNull();
  });

  it("returns null when no Authorization header", () => {
    const req = makeRequest({});
    expect(extractBearerToken(req)).toBeNull();
  });

  it("returns null for empty Bearer value", () => {
    const req = makeRequest({ authorization: "Bearer" });
    expect(extractBearerToken(req)).toBeNull();
  });

  it("handles case-insensitive Bearer keyword", () => {
    const req = makeRequest({ authorization: "bearer tok" });
    expect(extractBearerToken(req)).toBe("tok");
  });

  it("collapses a run of whitespace between scheme and token", () => {
    // Two spaces must still split into exactly two parts (kills /\s+/ → /\s/).
    const req = makeRequest({ authorization: "Bearer  abc123" });
    expect(extractBearerToken(req)).toBe("abc123");
  });
});

// ---------------------------------------------------------------------------
// authenticateRequest
// ---------------------------------------------------------------------------
describe("authenticateRequest", () => {
  it("returns user when valid token provided", async () => {
    const req = makeRequest({ authorization: "Bearer valid-token" });
    const user = await authenticateRequest(req, defaultOptions());
    expect(user).toEqual({ userId: "42", tokenType: TokenType.USER });
  });

  it("returns null when no Authorization header", async () => {
    const req = makeRequest({});
    const user = await authenticateRequest(req, defaultOptions());
    expect(user).toBeNull();
  });

  it("returns null when provider rejects token", async () => {
    const req = makeRequest({ authorization: "Bearer invalid" });
    const user = await authenticateRequest(req, defaultOptions());
    expect(user).toBeNull();
  });

  it("returns null without consulting the provider when no token is present", async () => {
    // Even a provider that accepts everything must not authenticate a request
    // that carries no token — proving the `if (!token) return null` short-circuit
    // runs before verifyToken (kills its condition-removal mutant).
    const req = makeRequest({});
    const user = await authenticateRequest(req, {
      provider: new AcceptAllProvider()
    });
    expect(user).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// requireAuth
// ---------------------------------------------------------------------------
describe("requireAuth", () => {
  it("returns null (pass-through) when valid token", async () => {
    const req = makeRequest({ authorization: "Bearer valid-token" });
    const response = await requireAuth(req, defaultOptions());
    expect(response).toBeNull();
  });

  it("returns 401 Response when no token", async () => {
    const req = makeRequest({});
    const response = await requireAuth(req, defaultOptions());
    expect(response).toBeInstanceOf(Response);
    expect(response!.status).toBe(401);
  });

  it("the 401 carries the JSON detail body and challenge headers", async () => {
    // Pins the response payload and headers so the body/header object and string
    // literals can't be blanked (kills the ObjectLiteral and StringLiteral mutants
    // on the 401 Response).
    const req = makeRequest({});
    const response = await requireAuth(req, defaultOptions());
    expect(await response!.json()).toEqual({
      detail: "Authorization required"
    });
    expect(response!.headers.get("Content-Type")).toBe("application/json");
    expect(response!.headers.get("WWW-Authenticate")).toBe("Bearer");
  });

  it("returns 401 Response when invalid token", async () => {
    const req = makeRequest({ authorization: "Bearer invalid" });
    const response = await requireAuth(req, defaultOptions());
    expect(response).toBeInstanceOf(Response);
    expect(response!.status).toBe(401);
  });

  it("returns null for public paths without auth", async () => {
    const req = makeRequest({}, "/health");
    const response = await requireAuth(
      req,
      defaultOptions({ publicPaths: ["/health"] })
    );
    expect(response).toBeNull();
  });

  it("requires auth for non-public paths", async () => {
    const req = makeRequest({}, "/api/data");
    const response = await requireAuth(
      req,
      defaultOptions({ publicPaths: ["/health"] })
    );
    expect(response).toBeInstanceOf(Response);
    expect(response!.status).toBe(401);
  });
});
