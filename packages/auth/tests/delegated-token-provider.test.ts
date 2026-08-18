import { describe, it, expect } from "vitest";

import { TokenType } from "../src/auth-provider.js";
import {
  DELEGATED_TOKEN_PREFIX,
  DelegatedTokenProvider,
  isDelegatedToken,
  mintDelegatedToken
} from "../src/providers/delegated-token-provider.js";

const KEY = Buffer.from("0123456789abcdef0123456789abcdef", "utf-8");

/** Flip one byte of the token's signature, keeping its length. */
function tamperSignature(token: string): string {
  const at = token.length - 1;
  const original = token[at];
  const replacement = original === "A" ? "B" : "A";
  return token.slice(0, at) + replacement;
}

describe("DelegatedTokenProvider", () => {
  it("authenticates a freshly minted token as the mapped user", async () => {
    const { token, expiresAt } = mintDelegatedToken(KEY, "user-a", 3600);
    expect(token.startsWith(DELEGATED_TOKEN_PREFIX)).toBe(true);
    expect(Date.parse(expiresAt)).toBeGreaterThan(Date.now());

    const result = await new DelegatedTokenProvider(KEY).verifyToken(token);
    expect(result).toEqual({
      ok: true,
      userId: "user-a",
      tokenType: TokenType.USER
    });
  });

  it("rejects a token whose signature was tampered with", async () => {
    const { token } = mintDelegatedToken(KEY, "user-a", 3600);
    const tampered = tamperSignature(token);
    expect(tampered).not.toBe(token);
    expect(tampered.length).toBe(token.length);

    const result = await new DelegatedTokenProvider(KEY).verifyToken(tampered);
    expect(result.ok).toBe(false);
    expect(result.userId).toBeUndefined();
  });

  it("rejects a token whose payload was rewritten to another user", async () => {
    const { token } = mintDelegatedToken(KEY, "user-a", 3600);
    const [material, signature] = token.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({
        v: 1,
        u: "user-b",
        e: Math.floor(Date.now() / 1000) + 3600
      }),
      "utf-8"
    ).toString("base64url");
    const forged = `${DELEGATED_TOKEN_PREFIX}${forgedPayload}.${signature}`;
    expect(forged).not.toBe(`${material}.${signature}`);

    const result = await new DelegatedTokenProvider(KEY).verifyToken(forged);
    expect(result.ok).toBe(false);
  });

  it("rejects a token signed with a different key", async () => {
    const { token } = mintDelegatedToken(
      Buffer.from("ffffffffffffffffffffffffffffffff", "utf-8"),
      "user-a",
      3600
    );
    const result = await new DelegatedTokenProvider(KEY).verifyToken(token);
    expect(result.ok).toBe(false);
  });

  it("rejects an expired token", async () => {
    const { token } = mintDelegatedToken(KEY, "user-a", -1);
    const result = await new DelegatedTokenProvider(KEY).verifyToken(token);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/expired/i);
  });

  it("rejects a valid token once the injected clock passes its expiry", async () => {
    const minted = mintDelegatedToken(KEY, "user-a", 60);
    const past = new DelegatedTokenProvider(KEY, { now: () => Date.now() });
    expect((await past.verifyToken(minted.token)).ok).toBe(true);

    const future = new DelegatedTokenProvider(KEY, {
      now: () => Date.now() + 61_000
    });
    const result = await future.verifyToken(minted.token);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/expired/i);
  });

  it("falls through on anything that is not a delegated token", async () => {
    const provider = new DelegatedTokenProvider(KEY);
    for (const token of [
      "",
      "garbage",
      "Bearer nonsense",
      "eyJhbGciOiJIUzI1NiJ9.e30.signature",
      `${DELEGATED_TOKEN_PREFIX}no-separator`,
      `${DELEGATED_TOKEN_PREFIX}not-base64.$$$`
    ]) {
      const result = await provider.verifyToken(token);
      expect(result.ok).toBe(false);
      expect(result.userId).toBeUndefined();
    }
  });

  it("rejects a well-signed token whose payload is not the minted shape", async () => {
    // Signed with the right key, so only the payload check can catch it.
    const encoded = Buffer.from(
      JSON.stringify({ v: 99, u: "user-a", e: Math.floor(Date.now() / 1000) + 60 }),
      "utf-8"
    ).toString("base64url");
    const material = `${DELEGATED_TOKEN_PREFIX}${encoded}`;
    const { createHmac } = await import("node:crypto");
    const signature = createHmac("sha256", KEY)
      .update(material)
      .digest("base64url");

    const result = await new DelegatedTokenProvider(KEY).verifyToken(
      `${material}.${signature}`
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/malformed/i);
  });

  it("recognizes its own prefix and nothing else", () => {
    expect(isDelegatedToken(`${DELEGATED_TOKEN_PREFIX}anything`)).toBe(true);
    expect(isDelegatedToken("sbp_token")).toBe(false);
    expect(isDelegatedToken("")).toBe(false);
  });

  it("refuses to mint without a user id", () => {
    expect(() => mintDelegatedToken(KEY, "", 3600)).toThrow();
  });
});
