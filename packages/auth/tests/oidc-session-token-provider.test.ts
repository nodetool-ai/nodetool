import { describe, it, expect } from "vitest";
import { SignJWT, decodeJwt } from "jose";
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
const provider = (): OidcSessionTokenProvider =>
  new OidcSessionTokenProvider(KEY, { now: clock });

describe("OIDC session tokens", () => {
  it("round-trips the user id as a USER session", async () => {
    const { token, expiresAt } = await mintOidcSessionToken(
      KEY,
      { userId: "a".repeat(32), email: "ada@example.com", name: "Ada" },
      3600,
      clock
    );
    expect(token.startsWith(OIDC_SESSION_TOKEN_PREFIX)).toBe(true);
    expect(isOidcSessionToken(token)).toBe(true);
    expect(expiresAt).toBe(new Date(NOW + 3600 * 1000).toISOString());
    expect(await provider().verifyToken(token)).toEqual({
      ok: true,
      userId: "a".repeat(32),
      tokenType: TokenType.USER
    });
  });

  it("carries email and name in the readable claims for the web app", async () => {
    const { token } = await mintOidcSessionToken(
      KEY,
      { userId: "u1", email: "ada@example.com", name: "Ada" },
      60,
      clock
    );
    expect(decodeJwt(token.slice(OIDC_SESSION_TOKEN_PREFIX.length))).toMatchObject({
      sub: "u1",
      email: "ada@example.com",
      name: "Ada",
      exp: NOW / 1000 + 60
    });
  });

  it("refuses an expired token", async () => {
    const { token } = await mintOidcSessionToken(KEY, { userId: "u1" }, 0, clock);
    expect(await provider().verifyToken(token)).toEqual({
      ok: false,
      error: "SSO session expired"
    });
  });

  it("refuses a token signed with another key", async () => {
    const { token } = await mintOidcSessionToken(Buffer.alloc(32, 8), { userId: "u1" }, 60, clock);
    expect(await provider().verifyToken(token)).toEqual({
      ok: false,
      error: "Invalid SSO session token"
    });
  });

  it("refuses a payload edited to another user", async () => {
    const { token } = await mintOidcSessionToken(KEY, { userId: "u1" }, 60, clock);
    const [header, payload, signature] = token.slice(OIDC_SESSION_TOKEN_PREFIX.length).split(".");
    const claims = JSON.parse(Buffer.from(payload!, "base64url").toString("utf-8"));
    const forged = Buffer.from(JSON.stringify({ ...claims, sub: "1" })).toString("base64url");
    const result = await provider().verifyToken(
      `${OIDC_SESSION_TOKEN_PREFIX}${header}.${forged}.${signature}`
    );
    expect(result.ok).toBe(false);
  });

  it("refuses a JWT signed with the same key for another purpose", async () => {
    const other = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u1")
      .setExpirationTime(NOW / 1000 + 60)
      .sign(new Uint8Array(KEY));
    expect((await provider().verifyToken(`${OIDC_SESSION_TOKEN_PREFIX}${other}`)).ok).toBe(false);
  });

  it("refuses tokens of other kinds and malformed ones without throwing", async () => {
    expect((await provider().verifyToken("nda_abc.def")).error).toBe("Not an SSO session token");
    expect((await provider().verifyToken("")).ok).toBe(false);
    expect((await provider().verifyToken("nts_nodot")).error).toBe("Invalid SSO session token");
  });

  it("refuses to mint without a user id", async () => {
    await expect(mintOidcSessionToken(KEY, { userId: "" }, 60, clock)).rejects.toThrow();
  });

  it("derives the key lazily from an accessor", async () => {
    let calls = 0;
    const lazy = new OidcSessionTokenProvider(
      () => {
        calls++;
        return KEY;
      },
      { now: clock }
    );
    expect(calls).toBe(0);
    const { token } = await mintOidcSessionToken(KEY, { userId: "u1" }, 60, clock);
    expect((await lazy.verifyToken(token)).ok).toBe(true);
    expect(calls).toBe(1);
  });
});
