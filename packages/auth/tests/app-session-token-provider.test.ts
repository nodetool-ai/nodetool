import { describe, it, expect } from "vitest";

import { TokenType } from "../src/auth-provider.js";
import {
  APP_SESSION_TOKEN_PREFIX,
  AppSessionTokenProvider,
  isAppSessionToken,
  mintAppSessionToken
} from "../src/providers/app-session-token-provider.js";

const KEY = "test-signing-key";
const SCOPE = { userId: "owner-1", applicationId: "app-1", version: 3 };

const provider = (now = () => 1_000_000): AppSessionTokenProvider =>
  new AppSessionTokenProvider(KEY, { now });

describe("mintAppSessionToken", () => {
  it("carries the owner, the app, and the release", async () => {
    const { token, expiresAt } = mintAppSessionToken(KEY, SCOPE, 3600, () =>
      Date.parse("2026-01-01T00:00:00.000Z")
    );

    expect(isAppSessionToken(token)).toBe(true);
    expect(token.startsWith(APP_SESSION_TOKEN_PREFIX)).toBe(true);
    expect(expiresAt).toBe("2026-01-01T01:00:00.000Z");

    const result = await provider(() =>
      Date.parse("2026-01-01T00:30:00.000Z")
    ).verifyToken(token);
    expect(result).toMatchObject({
      ok: true,
      userId: "owner-1",
      tokenType: TokenType.APP_SESSION,
      applicationId: "app-1",
      applicationVersion: 3
    });
  });

  it("refuses to mint without a full scope", () => {
    expect(() =>
      mintAppSessionToken(KEY, { ...SCOPE, userId: "" }, 60)
    ).toThrow(/user id/);
    expect(() =>
      mintAppSessionToken(KEY, { ...SCOPE, applicationId: "" }, 60)
    ).toThrow(/application id/);
    expect(() =>
      mintAppSessionToken(KEY, { ...SCOPE, version: 1.5 }, 60)
    ).toThrow(/released version/);
  });
});

describe("AppSessionTokenProvider.verifyToken", () => {
  it("passes on a token that is not one of ours", async () => {
    for (const token of ["", "ndt_something.sig", "sk-live-abc"]) {
      const result = await provider().verifyToken(token);
      expect(result.ok).toBe(false);
      expect(result.error).toBe("Not an app session token");
    }
  });

  it("rejects a tampered payload", async () => {
    const { token } = mintAppSessionToken(KEY, SCOPE, 3600);
    const separator = token.lastIndexOf(".");
    const forged = mintAppSessionToken(
      "some-other-key",
      { ...SCOPE, applicationId: "someone-elses-app" },
      3600
    ).token;
    // Same signature, different payload: the material no longer matches.
    const spliced = `${forged.slice(0, forged.lastIndexOf("."))}${token.slice(
      separator
    )}`;

    const result = await provider().verifyToken(spliced);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Invalid app session token signature");
  });

  it("rejects a token signed with another key", async () => {
    const { token } = mintAppSessionToken("another-key", SCOPE, 3600);
    const result = await provider().verifyToken(token);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Invalid app session token signature");
  });

  it("rejects a malformed payload", async () => {
    const { token } = mintAppSessionToken(KEY, SCOPE, 3600);
    expect(
      await provider().verifyToken(token.slice(0, token.lastIndexOf(".")))
    ).toMatchObject({ ok: false, error: "Malformed app session token" });
  });

  it("expires", async () => {
    const at = Date.parse("2026-01-01T00:00:00.000Z");
    const { token } = mintAppSessionToken(KEY, SCOPE, 60, () => at);

    expect(await provider(() => at + 59_000).verifyToken(token)).toMatchObject({
      ok: true
    });
    expect(await provider(() => at + 61_000).verifyToken(token)).toMatchObject({
      ok: false,
      error: "App session token expired"
    });
  });

  it("never returns an unscoped identity", async () => {
    const { token } = mintAppSessionToken(KEY, SCOPE, 3600);
    const result = await provider().verifyToken(token);
    // The scope is what confines the session, so a verified result that
    // carries a user id must carry an application id too.
    expect(result.userId).toBeDefined();
    expect(result.applicationId).toBeDefined();
    expect(result.tokenType).not.toBe(TokenType.USER);
  });

  it("takes the signing key from an accessor", async () => {
    const { token } = mintAppSessionToken(KEY, SCOPE, 3600);
    const lazy = new AppSessionTokenProvider(() => KEY);
    expect(await lazy.verifyToken(token)).toMatchObject({ ok: true });
  });
});

/**
 * CodeQL reports `js/insufficient-password-hash` against `sign()`, having
 * tracked a presented token from `?api_key=` into the HMAC. Calling that a
 * false positive rests on two premises, and these pin both — so if either
 * stops holding, it fails here rather than going unnoticed because someone
 * dismissed an alert once.
 */
describe("what makes the fast hash safe here", () => {
  const payloadOf = (token: string): Record<string, unknown> => {
    const material = token.slice(0, token.lastIndexOf("."));
    const encoded = material.slice(APP_SESSION_TOKEN_PREFIX.length);
    return JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf-8")
    ) as Record<string, unknown>;
  };

  it("hashes a payload that is public, and holds nothing secret", () => {
    // Premise one: the hashed material is not a credential. It is the token's
    // own payload, readable by anyone holding the token — which is why there
    // is nothing here for a fast hash to expose. Adding a secret to the
    // payload (a key, a session id, anything not in this list) would break
    // that, and breaks this test.
    const { token } = mintAppSessionToken(KEY, SCOPE, 3600);
    const payload = payloadOf(token);

    expect(Object.keys(payload).sort()).toEqual(["a", "e", "r", "u", "v"]);
    expect(payload).toEqual({
      v: 1,
      u: "owner-1",
      a: "app-1",
      r: 3,
      e: expect.any(Number)
    });
    // The signature is over exactly that payload and nothing else: it is
    // reproducible from what the token already discloses, plus the key.
    const issuedAtMs = ((payload.e as number) - 3600) * 1000;
    expect(
      mintAppSessionToken(KEY, SCOPE, 3600, () => issuedAtMs).token
    ).toBe(token);
  });

  it("rests on the key, so a near-miss key forges nothing", async () => {
    // Premise two: unforgeability comes from the key's 256 bits, not from the
    // hash being expensive. The server derives that key with PBKDF2; here the
    // falsifiable half is that a different key — even one byte apart — cannot
    // produce a signature this provider accepts.
    const key = Buffer.alloc(32, 7);
    const almost = Buffer.alloc(32, 7);
    almost[31] ^= 0x01;

    const forged = mintAppSessionToken(almost, SCOPE, 3600).token;
    expect(
      await new AppSessionTokenProvider(key).verifyToken(forged)
    ).toMatchObject({
      ok: false,
      error: "Invalid app session token signature"
    });

    // And nothing is stored: verification is a recomputation, so two
    // providers holding the same key agree without sharing any state.
    const { token } = mintAppSessionToken(key, SCOPE, 3600);
    expect(
      await new AppSessionTokenProvider(key).verifyToken(token)
    ).toMatchObject({ ok: true });
  });
});
