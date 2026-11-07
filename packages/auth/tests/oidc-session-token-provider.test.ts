import { describe, it, expect } from "vitest";
import {
  OidcSessionTokenProvider,
  mintOidcSessionToken,
  isOidcSessionToken,
  OIDC_SESSION_TOKEN_PREFIX,
  TokenType
} from "../src/index.js";

const KEY = Buffer.alloc(32, 7);
const NOW = 1_800_000_000_000;
const clock = (): number => NOW;

describe("OIDC session tokens", () => {
  it("round-trips the user id as a USER session", async () => {
    const { token, expiresAt } = mintOidcSessionToken(
      KEY,
      { userId: "a".repeat(32), email: "ada@example.com", name: "Ada" },
      3600,
      clock
    );
    expect(token.startsWith(OIDC_SESSION_TOKEN_PREFIX)).toBe(true);
    expect(isOidcSessionToken(token)).toBe(true);
    expect(expiresAt).toBe(new Date(NOW + 3600 * 1000).toISOString());

    const result = await new OidcSessionTokenProvider(KEY, { now: clock }).verifyToken(token);
    expect(result).toEqual({ ok: true, userId: "a".repeat(32), tokenType: TokenType.USER });
  });

  it("carries email and name in the readable payload for the web app", () => {
    const { token } = mintOidcSessionToken(
      KEY,
      { userId: "u1", email: "ada@example.com", name: "Ada" },
      60,
      clock
    );
    const encoded = token.slice(OIDC_SESSION_TOKEN_PREFIX.length, token.lastIndexOf("."));
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf-8"));
    expect(payload).toMatchObject({ u: "u1", m: "ada@example.com", n: "Ada" });
  });

  it("refuses an expired token", async () => {
    const { token } = mintOidcSessionToken(KEY, { userId: "u1" }, 0, clock);
    const result = await new OidcSessionTokenProvider(KEY, { now: clock }).verifyToken(token);
    expect(result).toEqual({ ok: false, error: "SSO session expired" });
  });

  it("refuses a token signed with another key", async () => {
    const { token } = mintOidcSessionToken(Buffer.alloc(32, 8), { userId: "u1" }, 60, clock);
    const result = await new OidcSessionTokenProvider(KEY, { now: clock }).verifyToken(token);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Invalid SSO session token signature");
  });

  it("refuses a payload edited to another user", async () => {
    const { token } = mintOidcSessionToken(KEY, { userId: "u1" }, 60, clock);
    const signature = token.slice(token.lastIndexOf(".") + 1);
    const forged = Buffer.from(
      JSON.stringify({ v: 1, u: "1", e: Math.floor(NOW / 1000) + 60 })
    ).toString("base64url");
    const result = await new OidcSessionTokenProvider(KEY, { now: clock }).verifyToken(
      `${OIDC_SESSION_TOKEN_PREFIX}${forged}.${signature}`
    );
    expect(result.ok).toBe(false);
  });

  it("refuses tokens of other kinds and malformed ones without throwing", async () => {
    const provider = new OidcSessionTokenProvider(KEY, { now: clock });
    expect((await provider.verifyToken("nda_abc.def")).error).toBe("Not an SSO session token");
    expect((await provider.verifyToken("")).ok).toBe(false);
    expect((await provider.verifyToken("nts_nodot")).error).toBe("Malformed SSO session token");
  });

  it("refuses to mint without a user id", () => {
    expect(() => mintOidcSessionToken(KEY, { userId: "" }, 60, clock)).toThrow();
  });

  it("derives the key lazily from an accessor", async () => {
    let calls = 0;
    const provider = new OidcSessionTokenProvider(
      () => {
        calls++;
        return KEY;
      },
      { now: clock }
    );
    expect(calls).toBe(0);
    const { token } = mintOidcSessionToken(KEY, { userId: "u1" }, 60, clock);
    expect((await provider.verifyToken(token)).ok).toBe(true);
    expect(calls).toBe(1);
  });
});
