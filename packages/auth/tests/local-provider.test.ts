import { describe, it, expect } from "vitest";
import { LocalAuthProvider } from "../src/providers/local-provider.js";
import { TokenType } from "../src/auth-provider.js";

describe("LocalAuthProvider", () => {
  it("authenticate returns success with default user", async () => {
    const provider = new LocalAuthProvider();
    const result = await provider.verifyToken("any-token");
    expect(result.ok).toBe(true);
    expect(result.userId).toBe("1");
    expect(result.tokenType).toBe(TokenType.STATIC);
  });

  it("authenticate returns success even with empty token", async () => {
    const provider = new LocalAuthProvider();
    const result = await provider.verifyToken("");
    expect(result.ok).toBe(true);
    expect(result.userId).toBe("1");
  });

  it("uses custom userId when provided", async () => {
    const provider = new LocalAuthProvider();
    provider.userId = "custom-42";
    const result = await provider.verifyToken("anything");
    expect(result.ok).toBe(true);
    expect(result.userId).toBe("custom-42");
  });

  it("verifyToken always returns the configured user", async () => {
    const provider = new LocalAuthProvider();
    const r1 = await provider.verifyToken("token-a");
    const r2 = await provider.verifyToken("token-b");
    expect(r1.userId).toBe(r2.userId);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
  });
});
