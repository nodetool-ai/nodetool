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
