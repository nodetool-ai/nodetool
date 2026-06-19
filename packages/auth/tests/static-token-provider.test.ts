import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { StaticTokenProvider } from "../src/providers/static-token-provider.js";
import { TokenType } from "../src/auth-provider.js";

describe("StaticTokenProvider", () => {
  // -------------------------------------------------------------------------
  // Constructor with explicit tokens map
  // -------------------------------------------------------------------------
  describe("explicit tokens", () => {
    it("accepts a valid token and returns the mapped userId", async () => {
      const provider = new StaticTokenProvider({
        "secret-token-value-1234": "user-42"
      });
      const result = await provider.verifyToken("secret-token-value-1234");
      expect(result.ok).toBe(true);
      expect(result.userId).toBe("user-42");
      expect(result.tokenType).toBe(TokenType.STATIC);
    });

    it("rejects an unknown token", async () => {
      const provider = new StaticTokenProvider({
        "secret-token-value-1234": "user-42"
      });
      const result = await provider.verifyToken("wrong-token-value-1234");
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("supports multiple tokens mapped to different users", async () => {
      const provider = new StaticTokenProvider({
        "token-a-value-1234567890": "user-1",
        "token-b-value-1234567890": "user-2"
      });
      const a = await provider.verifyToken("token-a-value-1234567890");
      const b = await provider.verifyToken("token-b-value-1234567890");
      expect(a.userId).toBe("user-1");
      expect(b.userId).toBe("user-2");
    });

    it("is case-sensitive – similar tokens with different casing are distinct", async () => {
      const provider = new StaticTokenProvider({
        "Token-Value-MixedCase-12": "user-1"
      });
      const upper = await provider.verifyToken("Token-Value-MixedCase-12");
      const lower = await provider.verifyToken("token-value-mixedcase-12");
      expect(upper.ok).toBe(true);
      expect(lower.ok).toBe(false);
    });

    it("returns ok:false with no tokens configured", async () => {
      const provider = new StaticTokenProvider({});
      const result = await provider.verifyToken("any-token-value-12345");
      expect(result.ok).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Minimum token length enforcement
  // -------------------------------------------------------------------------
  describe("minimum token length", () => {
    it("rejects the empty string even with no tokens configured", async () => {
      const provider = new StaticTokenProvider({});
      expect((await provider.verifyToken("")).ok).toBe(false);
    });

    it("rejects a token shorter than the minimum length", async () => {
      // A short token must never be accepted even if it is a prefix of, or
      // otherwise resembles, a configured token.
      const provider = new StaticTokenProvider({
        "secret-token-value-1234": "user-42"
      });
      expect((await provider.verifyToken("secret-token")).ok).toBe(false);
      expect((await provider.verifyToken("short")).ok).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Environment variable configuration
  // -------------------------------------------------------------------------
  describe("STATIC_AUTH_TOKEN env var", () => {
    beforeEach(() => {
      process.env["STATIC_AUTH_TOKEN"] = "env-single-token-value-123";
    });

    afterEach(() => {
      delete process.env["STATIC_AUTH_TOKEN"];
    });

    it("maps the env token to userId '1'", async () => {
      const provider = new StaticTokenProvider();
      const result = await provider.verifyToken("env-single-token-value-123");
      expect(result.ok).toBe(true);
      expect(result.userId).toBe("1");
      expect(result.tokenType).toBe(TokenType.STATIC);
    });

    it("rejects unknown tokens when env token is configured", async () => {
      const provider = new StaticTokenProvider();
      const result = await provider.verifyToken("other-token-value-12345");
      expect(result.ok).toBe(false);
    });
  });

  describe("STATIC_AUTH_TOKENS env var", () => {
    beforeEach(() => {
      process.env["STATIC_AUTH_TOKENS"] = JSON.stringify({
        "multi-token-a-value-1234": "user-100",
        "multi-token-b-value-1234": "user-200"
      });
    });

    afterEach(() => {
      delete process.env["STATIC_AUTH_TOKENS"];
    });

    it("maps tokens from JSON to their respective user IDs", async () => {
      const provider = new StaticTokenProvider();
      const a = await provider.verifyToken("multi-token-a-value-1234");
      const b = await provider.verifyToken("multi-token-b-value-1234");
      expect(a.ok).toBe(true);
      expect(a.userId).toBe("user-100");
      expect(b.ok).toBe(true);
      expect(b.userId).toBe("user-200");
    });

    it("rejects a token not listed in STATIC_AUTH_TOKENS", async () => {
      const provider = new StaticTokenProvider();
      const result = await provider.verifyToken("unlisted-token-value-123");
      expect(result.ok).toBe(false);
    });
  });

  describe("empty STATIC_AUTH_TOKEN env var", () => {
    afterEach(() => {
      delete process.env["STATIC_AUTH_TOKEN"];
    });

    it("does not register an empty token (rejects the empty string)", async () => {
      // An empty STATIC_AUTH_TOKEN must NOT become a credential that accepts the
      // empty bearer token — kills the `if (singleToken)` → always-true mutant.
      process.env["STATIC_AUTH_TOKEN"] = "";
      delete process.env["STATIC_AUTH_TOKENS"];
      const provider = new StaticTokenProvider();
      expect((await provider.verifyToken("")).ok).toBe(false);
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
      const result = await provider.verifyToken("any-token-value-12345");
      expect(result.ok).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Explicit tokens override env vars
  // -------------------------------------------------------------------------
  it("explicit tokens constructor argument takes precedence over env vars", async () => {
    process.env["STATIC_AUTH_TOKEN"] = "env-token-value-1234567";
    try {
      const provider = new StaticTokenProvider({
        "explicit-token-value-123": "user-x"
      });
      expect((await provider.verifyToken("env-token-value-1234567")).ok).toBe(
        false
      );
      expect((await provider.verifyToken("explicit-token-value-123")).ok).toBe(
        true
      );
    } finally {
      delete process.env["STATIC_AUTH_TOKEN"];
    }
  });
});
