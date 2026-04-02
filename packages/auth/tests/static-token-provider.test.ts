import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { StaticTokenProvider } from "../src/providers/static-token-provider.js";
import { TokenType } from "../src/auth-provider.js";

describe("StaticTokenProvider", () => {
  // -------------------------------------------------------------------------
  // Constructor with explicit tokens map
  // -------------------------------------------------------------------------
  describe("explicit tokens", () => {
    it("accepts a valid token and returns the mapped userId", async () => {
      const provider = new StaticTokenProvider({ "secret-token": "user-42" });
      const result = await provider.verifyToken("secret-token");
      expect(result.ok).toBe(true);
      expect(result.userId).toBe("user-42");
      expect(result.tokenType).toBe(TokenType.STATIC);
    });

    it("rejects an unknown token", async () => {
      const provider = new StaticTokenProvider({ "secret-token": "user-42" });
      const result = await provider.verifyToken("wrong-token");
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("supports multiple tokens mapped to different users", async () => {
      const provider = new StaticTokenProvider({
        "token-a": "user-1",
        "token-b": "user-2"
      });
      const a = await provider.verifyToken("token-a");
      const b = await provider.verifyToken("token-b");
      expect(a.userId).toBe("user-1");
      expect(b.userId).toBe("user-2");
    });

    it("is case-sensitive – similar tokens with different casing are distinct", async () => {
      const provider = new StaticTokenProvider({ Token: "user-1" });
      const upper = await provider.verifyToken("Token");
      const lower = await provider.verifyToken("token");
      expect(upper.ok).toBe(true);
      expect(lower.ok).toBe(false);
    });

    it("returns ok:false with no tokens configured", async () => {
      const provider = new StaticTokenProvider({});
      const result = await provider.verifyToken("any-token");
      expect(result.ok).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Environment variable configuration
  // -------------------------------------------------------------------------
  describe("STATIC_AUTH_TOKEN env var", () => {
    beforeEach(() => {
      process.env["STATIC_AUTH_TOKEN"] = "env-single-token";
    });

    afterEach(() => {
      delete process.env["STATIC_AUTH_TOKEN"];
    });

    it("maps the env token to userId '1'", async () => {
      const provider = new StaticTokenProvider();
      const result = await provider.verifyToken("env-single-token");
      expect(result.ok).toBe(true);
      expect(result.userId).toBe("1");
      expect(result.tokenType).toBe(TokenType.STATIC);
    });

    it("rejects unknown tokens when env token is configured", async () => {
      const provider = new StaticTokenProvider();
      const result = await provider.verifyToken("other-token");
      expect(result.ok).toBe(false);
    });
  });

  describe("STATIC_AUTH_TOKENS env var", () => {
    beforeEach(() => {
      process.env["STATIC_AUTH_TOKENS"] = JSON.stringify({
        "multi-token-a": "user-100",
        "multi-token-b": "user-200"
      });
    });

    afterEach(() => {
      delete process.env["STATIC_AUTH_TOKENS"];
    });

    it("maps tokens from JSON to their respective user IDs", async () => {
      const provider = new StaticTokenProvider();
      const a = await provider.verifyToken("multi-token-a");
      const b = await provider.verifyToken("multi-token-b");
      expect(a.ok).toBe(true);
      expect(a.userId).toBe("user-100");
      expect(b.ok).toBe(true);
      expect(b.userId).toBe("user-200");
    });

    it("rejects a token not listed in STATIC_AUTH_TOKENS", async () => {
      const provider = new StaticTokenProvider();
      const result = await provider.verifyToken("unlisted-token");
      expect(result.ok).toBe(false);
    });
  });

  describe("malformed STATIC_AUTH_TOKENS env var", () => {
    beforeEach(() => {
      process.env["STATIC_AUTH_TOKENS"] = "not-valid-json";
    });

    afterEach(() => {
      delete process.env["STATIC_AUTH_TOKENS"];
    });

    it("silently ignores malformed JSON and rejects all tokens", async () => {
      const provider = new StaticTokenProvider();
      const result = await provider.verifyToken("any-token");
      expect(result.ok).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Explicit tokens override env vars
  // -------------------------------------------------------------------------
  it("explicit tokens constructor argument takes precedence over env vars", async () => {
    process.env["STATIC_AUTH_TOKEN"] = "env-token";
    try {
      const provider = new StaticTokenProvider({ "explicit-token": "user-x" });
      expect((await provider.verifyToken("env-token")).ok).toBe(false);
      expect((await provider.verifyToken("explicit-token")).ok).toBe(true);
    } finally {
      delete process.env["STATIC_AUTH_TOKEN"];
    }
  });

  // -------------------------------------------------------------------------
  // clearCaches
  // -------------------------------------------------------------------------
  it("clearCaches() is a no-op and does not throw", () => {
    const provider = new StaticTokenProvider({ token: "user-1" });
    expect(() => provider.clearCaches()).not.toThrow();
  });
});
