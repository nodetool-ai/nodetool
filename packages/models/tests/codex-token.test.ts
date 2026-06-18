import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { initTestDb } from "../src/db.js";
import { setMasterKey } from "@nodetool-ai/security";
import { OAuthCredential } from "../src/oauth-credential.js";
import { resolveCodexAccessToken } from "../src/codex-token.js";

const TEST_MASTER_KEY = "dGVzdC1tYXN0ZXIta2V5LWZvci11bml0LXRlc3Rz"; // base64

beforeEach(() => {
  initTestDb();
  setMasterKey(TEST_MASTER_KEY);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("resolveCodexAccessToken", () => {
  it("returns null when the user has not connected", async () => {
    expect(await resolveCodexAccessToken("user-1")).toBeNull();
  });

  it("returns the stored token when still valid", async () => {
    await OAuthCredential.upsert({
      user_id: "user-1",
      provider: "openai",
      account_id: "acct",
      access_token: "valid-token",
      refresh_token: "r",
      token_type: "Bearer",
      received_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 3_600_000).toISOString()
    });
    expect(await resolveCodexAccessToken("user-1")).toBe("valid-token");
  });

  it("refreshes an expired token and persists the new one", async () => {
    await OAuthCredential.upsert({
      user_id: "user-1",
      provider: "openai",
      account_id: "acct",
      access_token: "stale-token",
      refresh_token: "refresh-token",
      token_type: "Bearer",
      received_at: new Date(Date.now() - 7_200_000).toISOString(),
      expires_at: new Date(Date.now() - 3_600_000).toISOString()
    });

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "fresh-token",
          refresh_token: "new-refresh",
          token_type: "Bearer",
          expires_in: 3600
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const token = await resolveCodexAccessToken("user-1");
    expect(token).toBe("fresh-token");
    expect(fetchMock).toHaveBeenCalledOnce();

    // The rotated token is persisted, so a follow-up read needs no refresh.
    fetchMock.mockClear();
    expect(await resolveCodexAccessToken("user-1")).toBe("fresh-token");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to the stale token when refresh fails", async () => {
    await OAuthCredential.upsert({
      user_id: "user-1",
      provider: "openai",
      account_id: "acct",
      access_token: "stale-token",
      refresh_token: "refresh-token",
      token_type: "Bearer",
      received_at: new Date(Date.now() - 7_200_000).toISOString(),
      expires_at: new Date(Date.now() - 3_600_000).toISOString()
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 400 })
    );

    expect(await resolveCodexAccessToken("user-1")).toBe("stale-token");
  });
});
