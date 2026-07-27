import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ModelObserver } from "../src/base-model.js";
import { initTestDb } from "../src/db.js";
import { setMasterKey } from "@nodetool-ai/security";
import {
  resolveGoogleAccessToken,
  storeGoogleCredential,
  deleteGoogleCredentials,
  getGoogleGrantedScopes
} from "../src/google-token.js";

const TEST_MASTER_KEY = "dGVzdC1tYXN0ZXIta2V5LWZvci11bml0LXRlc3Rz"; // base64

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  initTestDb();
  setMasterKey(TEST_MASTER_KEY);
  originalFetch = globalThis.fetch;
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
});

afterEach(() => {
  ModelObserver.clear();
  globalThis.fetch = originalFetch;
});

describe("storeGoogleCredential", () => {
  it("encrypts the tokens and round-trips the access token", async () => {
    const credential = await storeGoogleCredential({
      userId: "u1",
      accountId: "alice@example.com",
      accessToken: "ya29.first",
      refreshToken: "refresh-1",
      email: "alice@example.com",
      scope: "https://www.googleapis.com/auth/drive"
    });

    expect(credential.encrypted_access_token).not.toBe("ya29.first");
    await expect(resolveGoogleAccessToken("u1")).resolves.toBe("ya29.first");
    await expect(getGoogleGrantedScopes("u1")).resolves.toEqual([
      "https://www.googleapis.com/auth/drive"
    ]);
  });

  it("updates the existing row on re-login", async () => {
    await storeGoogleCredential({
      userId: "u1",
      accountId: "alice@example.com",
      accessToken: "ya29.first"
    });
    await storeGoogleCredential({
      userId: "u1",
      accountId: "alice@example.com",
      accessToken: "ya29.second"
    });

    await expect(resolveGoogleAccessToken("u1")).resolves.toBe("ya29.second");
    await expect(deleteGoogleCredentials("u1")).resolves.toBe(1);
  });
});

describe("resolveGoogleAccessToken", () => {
  it("returns null when the user has not signed in with Google", async () => {
    await expect(resolveGoogleAccessToken("nobody")).resolves.toBeNull();
  });

  it("refreshes an expired token when the OAuth client is configured", async () => {
    process.env.GOOGLE_CLIENT_ID = "client-id";
    process.env.GOOGLE_CLIENT_SECRET = "client-secret";
    await storeGoogleCredential({
      userId: "u1",
      accountId: "alice@example.com",
      accessToken: "ya29.stale",
      refreshToken: "refresh-1",
      expiresAt: new Date(Date.now() - 60_000).toISOString()
    });

    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({ access_token: "ya29.fresh", expires_in: 3600 }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    ) as unknown as typeof globalThis.fetch;

    await expect(resolveGoogleAccessToken("u1")).resolves.toBe("ya29.fresh");
    // The rotated token is persisted, so the next call needs no refresh.
    globalThis.fetch = vi.fn(async () => {
      throw new Error("should not refresh again");
    }) as unknown as typeof globalThis.fetch;
    await expect(resolveGoogleAccessToken("u1")).resolves.toBe("ya29.fresh");
  });

  it("returns the stale token when no OAuth client is configured", async () => {
    await storeGoogleCredential({
      userId: "u1",
      accountId: "alice@example.com",
      accessToken: "ya29.stale",
      refreshToken: "refresh-1",
      expiresAt: new Date(Date.now() - 60_000).toISOString()
    });

    await expect(resolveGoogleAccessToken("u1")).resolves.toBe("ya29.stale");
  });
});
