/**
 * Dedicated tests for StaticTokenProvider.
 */
import { describe, it, expect, afterEach } from "vitest";
import { StaticTokenProvider } from "../src/providers/static-token-provider.js";
import { TokenType } from "../src/auth-provider.js";

// ---------------------------------------------------------------------------
// Save / restore env between tests
// ---------------------------------------------------------------------------
const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

// ---------------------------------------------------------------------------
// Constructor with explicit token map
// ---------------------------------------------------------------------------
describe("StaticTokenProvider constructor", () => {
  it("accepts an explicit token map", async () => {
    const provider = new StaticTokenProvider({ mytoken: "user1" });
    const result = await provider.verifyToken("mytoken");
    expect(result.ok).toBe(true);
    expect(result.userId).toBe("user1");
  });

  it("creates an empty provider when no args and no env vars", async () => {
    delete process.env["STATIC_AUTH_TOKEN"];
    delete process.env["STATIC_AUTH_TOKENS"];
    const provider = new StaticTokenProvider();
    const result = await provider.verifyToken("anything");
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// verifyToken
// ---------------------------------------------------------------------------
describe("StaticTokenProvider.verifyToken", () => {
  it("returns ok with userId for a valid token", async () => {
    const provider = new StaticTokenProvider({ secret: "u5" });
    const result = await provider.verifyToken("secret");
    expect(result.ok).toBe(true);
    expect(result.userId).toBe("u5");
    expect(result.tokenType).toBe(TokenType.STATIC);
  });

  it("returns not-ok for an invalid token", async () => {
    const provider = new StaticTokenProvider({ secret: "u5" });
    const result = await provider.verifyToken("wrong");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Invalid token");
  });

  it("handles multiple tokens correctly", async () => {
    const provider = new StaticTokenProvider({
      tokA: "userA",
      tokB: "userB",
      tokC: "userC",
    });
    expect((await provider.verifyToken("tokA")).userId).toBe("userA");
    expect((await provider.verifyToken("tokB")).userId).toBe("userB");
    expect((await provider.verifyToken("tokC")).userId).toBe("userC");
    expect((await provider.verifyToken("tokD")).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Environment variable: STATIC_AUTH_TOKEN
// ---------------------------------------------------------------------------
describe("StaticTokenProvider from STATIC_AUTH_TOKEN env var", () => {
  it("reads a single token mapped to user '1'", async () => {
    process.env["STATIC_AUTH_TOKEN"] = "env-single-tok";
    const provider = new StaticTokenProvider();
    const result = await provider.verifyToken("env-single-tok");
    expect(result.ok).toBe(true);
    expect(result.userId).toBe("1");
    expect(result.tokenType).toBe(TokenType.STATIC);
  });

  it("rejects unknown tokens when only STATIC_AUTH_TOKEN is set", async () => {
    process.env["STATIC_AUTH_TOKEN"] = "env-single-tok";
    const provider = new StaticTokenProvider();
    const result = await provider.verifyToken("other");
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Environment variable: STATIC_AUTH_TOKENS (JSON)
// ---------------------------------------------------------------------------
describe("StaticTokenProvider from STATIC_AUTH_TOKENS env var", () => {
  it("reads a JSON token map", async () => {
    process.env["STATIC_AUTH_TOKENS"] = JSON.stringify({
      alpha: "uAlpha",
      beta: "uBeta",
    });
    const provider = new StaticTokenProvider();
    expect((await provider.verifyToken("alpha")).userId).toBe("uAlpha");
    expect((await provider.verifyToken("beta")).userId).toBe("uBeta");
  });

  it("handles malformed STATIC_AUTH_TOKENS JSON gracefully", async () => {
    process.env["STATIC_AUTH_TOKENS"] = "{not valid json";
    // Should not throw during construction
    const provider = new StaticTokenProvider();
    const result = await provider.verifyToken("anything");
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// clearCaches
// ---------------------------------------------------------------------------
describe("StaticTokenProvider.clearCaches", () => {
  it("does not throw", () => {
    const provider = new StaticTokenProvider({ tok: "u1" });
    expect(() => provider.clearCaches()).not.toThrow();
  });
});
