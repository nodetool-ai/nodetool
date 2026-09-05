import { describe, it, expect } from "vitest";
import {
  AuthProvider,
  AuthResult,
  TokenType,
  LocalAuthProvider
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
// AuthProvider.extractTokenFromHeaders
// ---------------------------------------------------------------------------
describe("AuthProvider.extractTokenFromHeaders", () => {
  const provider = new StubProvider({ ok: true });

  it("extracts a valid bearer token from a plain object", () => {
    const token = provider.extractTokenFromHeaders({
      authorization: "Bearer abc123"
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
        authorization: "Bearer abc def"
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
      Authorization: "Bearer capital"
    });
    expect(token).toBe("capital");
  });

  it("collapses runs of whitespace between scheme and token", () => {
    // Two spaces: split(/\s+/) must treat the run as a single delimiter so the
    // header still parses to exactly two parts (kills the /\s+/ → /\s/ mutant).
    expect(
      provider.extractTokenFromHeaders({ authorization: "Bearer  tok" })
    ).toBe("tok");
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
// AuthProvider.preferHeader (static)
// ---------------------------------------------------------------------------
describe("AuthProvider.preferHeader", () => {
  it("returns 'authorization'", () => {
    expect(AuthProvider.preferHeader()).toBe("authorization");
  });
});
