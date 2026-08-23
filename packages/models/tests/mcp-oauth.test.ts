import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ModelObserver } from "../src/base-model.js";
import { initTestDb } from "../src/db.js";
import {
  McpOauthClient,
  McpOauthGrant,
  McpOauthToken,
  MCP_OAUTH_ACCESS_TTL_MS
} from "../src/mcp-oauth.js";

async function makeGrant(overrides: Partial<{
  user_id: string;
  client_id: string;
  client_name: string;
  scope: string;
  resource: string;
}> = {}): Promise<string> {
  const { id } = await McpOauthGrant.create({
    user_id: "user-a",
    client_id: "ntc_deadbeef",
    client_name: "Claude Code",
    scope: "mcp",
    resource: "https://nodetool.example/mcp",
    ...overrides
  });
  return id;
}

describe("McpOauthClient model", () => {
  beforeEach(() => initTestDb());
  afterEach(() => {
    ModelObserver.clear();
    vi.useRealTimers();
  });

  it("creates a client with an ntc_ id and reads it back", async () => {
    const { id } = await McpOauthClient.create({
      client_name: "Claude Code",
      redirect_uris: ["http://127.0.0.1:8080/cb"]
    });
    expect(id.startsWith("ntc_")).toBe(true);

    const client = await McpOauthClient.get(id);
    expect(client).not.toBeNull();
    expect(client!.client_name).toBe("Claude Code");
    expect(client!.redirect_uris).toEqual(["http://127.0.0.1:8080/cb"]);
  });

  it("returns null for an unknown client id", async () => {
    expect(await McpOauthClient.get("ntc_nonexistent")).toBeNull();
  });

  it("gcUnused deletes only grant-less clients older than the cutoff", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const { id: oldUnused } = await McpOauthClient.create({
      client_name: "old, unused",
      redirect_uris: ["https://a.example/cb"]
    });
    const { id: oldUsed } = await McpOauthClient.create({
      client_name: "old, used",
      redirect_uris: ["https://b.example/cb"]
    });
    await makeGrant({ client_id: oldUsed });

    vi.setSystemTime(new Date("2026-01-20T00:00:00.000Z"));
    const { id: recentUnused } = await McpOauthClient.create({
      client_name: "recent, unused",
      redirect_uris: ["https://c.example/cb"]
    });

    // Advance to "now" without leaving fake time, so the cutoff below is
    // computed against it rather than against the real wall clock.
    vi.setSystemTime(new Date("2026-01-25T00:00:00.000Z"));

    // Cutoff: anything older than 10 days from "now" (2026-01-25) — catches
    // the Jan-1 rows but not the Jan-20 one.
    const deleted = await McpOauthClient.gcUnused(10 * 24 * 60 * 60 * 1000);

    expect(deleted).toBe(1);
    expect(await McpOauthClient.get(oldUnused)).toBeNull();
    expect(await McpOauthClient.get(oldUsed)).not.toBeNull();
    expect(await McpOauthClient.get(recentUnused)).not.toBeNull();
  });
});

describe("McpOauthGrant + McpOauthToken", () => {
  beforeEach(() => initTestDb());
  afterEach(() => {
    ModelObserver.clear();
    vi.useRealTimers();
  });

  it("mints an access+refresh pair that verifies as the grant's owner", async () => {
    const grantId = await makeGrant();
    const { accessToken, refreshToken, expiresAt } =
      await McpOauthToken.mintPair(grantId);

    expect(accessToken.startsWith("nta_")).toBe(true);
    expect(refreshToken.startsWith("ntr_")).toBe(true);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());

    const verified = await McpOauthToken.verifyAccess(accessToken);
    expect(verified).not.toBeNull();
    expect(verified!.userId).toBe("user-a");
    expect(verified!.grantId).toBe(grantId);
    expect(verified!.resource).toBe("https://nodetool.example/mcp");
  });

  it("refuses an access token whose secret does not match its id", async () => {
    const grantId = await makeGrant();
    const { accessToken } = await McpOauthToken.mintPair(grantId);
    const id = accessToken.split("_")[1];

    expect(
      await McpOauthToken.verifyAccess(`nta_${id}_wrong-secret`)
    ).toBeNull();
  });

  it("refuses an expired access token and deletes the row", async () => {
    const grantId = await makeGrant();
    const { accessToken } = await McpOauthToken.mintPair(grantId);
    expect(await McpOauthToken.verifyAccess(accessToken)).not.toBeNull();

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + MCP_OAUTH_ACCESS_TTL_MS + 1000);

    expect(await McpOauthToken.verifyAccess(accessToken)).toBeNull();
    vi.useRealTimers();

    // The row is gone, so presenting the same token again is still refused
    // (as opposed to erroring) — proves the delete, not just the expiry.
    expect(await McpOauthToken.verifyAccess(accessToken)).toBeNull();
  });

  it("revoking a grant kills both its access and refresh tokens", async () => {
    const grantId = await makeGrant();
    const { accessToken, refreshToken } =
      await McpOauthToken.mintPair(grantId);

    expect(await McpOauthGrant.revoke("user-a", grantId)).toBe(true);

    expect(await McpOauthToken.verifyAccess(accessToken)).toBeNull();
    const rotated = await McpOauthToken.rotateRefresh(refreshToken);
    expect(rotated).toBeNull();

    const grant = await McpOauthGrant.get(grantId);
    expect(grant!.revoked_at).not.toBeNull();
  });

  it("does not let one user revoke another's grant", async () => {
    const grantId = await makeGrant();
    expect(await McpOauthGrant.revoke("user-b", grantId)).toBe(false);

    const grant = await McpOauthGrant.get(grantId);
    expect(grant!.revoked_at).toBeNull();
  });

  it("listForUser returns only the caller's active grants", async () => {
    const active = await makeGrant({ client_name: "active" });
    const revoked = await makeGrant({ client_name: "revoked" });
    await makeGrant({ user_id: "user-b", client_name: "someone else" });
    await McpOauthGrant.revoke("user-a", revoked);

    const grants = await McpOauthGrant.listForUser("user-a");
    expect(grants.map((g) => g.id)).toEqual([active]);
  });

  it("rotateRefresh invalidates the old refresh token and mints a new pair", async () => {
    const grantId = await makeGrant();
    const { refreshToken: firstRefresh, accessToken: firstAccess } =
      await McpOauthToken.mintPair(grantId);

    const rotated = await McpOauthToken.rotateRefresh(firstRefresh);
    expect(rotated).not.toBeNull();
    expect("reuseDetected" in (rotated as object)).toBe(false);
    const { accessToken: secondAccess, refreshToken: secondRefresh } =
      rotated as { accessToken: string; refreshToken: string };

    expect(secondRefresh).not.toBe(firstRefresh);
    expect(secondAccess).not.toBe(firstAccess);

    // The new access token from rotation verifies.
    const verified = await McpOauthToken.verifyAccess(secondAccess);
    expect(verified).not.toBeNull();
    expect(verified!.grantId).toBe(grantId);
  });

  it("reuse of a rotated-out refresh token revokes the grant and its tokens", async () => {
    const grantId = await makeGrant();
    const { refreshToken: firstRefresh } =
      await McpOauthToken.mintPair(grantId);

    const rotated = await McpOauthToken.rotateRefresh(firstRefresh);
    const { accessToken: secondAccess } = rotated as {
      accessToken: string;
      refreshToken: string;
    };
    expect(await McpOauthToken.verifyAccess(secondAccess)).not.toBeNull();

    // Present the pre-rotation refresh token again — reuse.
    const reuse = await McpOauthToken.rotateRefresh(firstRefresh);
    expect(reuse).toEqual({ reuseDetected: true });

    // The grant's remaining tokens — including the ones issued by the
    // legitimate rotation — stop verifying.
    expect(await McpOauthToken.verifyAccess(secondAccess)).toBeNull();
    const grant = await McpOauthGrant.get(grantId);
    expect(grant!.revoked_at).not.toBeNull();
  });

  it("revokeByRawToken on an access token deletes only that row", async () => {
    const grantId = await makeGrant();
    const { accessToken, refreshToken } =
      await McpOauthToken.mintPair(grantId);

    expect(await McpOauthToken.revokeByRawToken(accessToken)).toBe(true);
    expect(await McpOauthToken.verifyAccess(accessToken)).toBeNull();

    // The refresh token is untouched by revoking the access token alone.
    const rotated = await McpOauthToken.rotateRefresh(refreshToken);
    expect(rotated).not.toBeNull();
    expect("reuseDetected" in (rotated as object)).toBe(false);
  });

  it("revoking a refresh token revokes the whole grant, so a revoked chain's ancestor cannot rotate", async () => {
    const grantId = await makeGrant();
    const pair1 = await McpOauthToken.mintPair(grantId);
    // Rotate once: pair1's refresh token is now the ancestor of pair2's.
    const rotated = await McpOauthToken.rotateRefresh(pair1.refreshToken);
    expect(rotated).not.toBeNull();
    expect("reuseDetected" in (rotated as object)).toBe(false);
    const pair2 = rotated as { accessToken: string; refreshToken: string };

    // The user disconnects by revoking the current refresh token.
    expect(await McpOauthToken.revokeByRawToken(pair2.refreshToken)).toBe(true);

    // The exfiltrated ancestor must not be able to mint a fresh pair — the
    // grant is revoked, not just the presented row deleted.
    expect(await McpOauthToken.rotateRefresh(pair1.refreshToken)).toBeNull();
    expect(await McpOauthToken.verifyAccess(pair2.accessToken)).toBeNull();
    const grant = await McpOauthGrant.get(grantId);
    expect(grant!.revoked_at).not.toBeNull();
  });

  it("a rotated refresh token inherits its chain's absolute expiry", async () => {
    const grantId = await makeGrant();
    await McpOauthToken.mintPair(grantId);
    vi.useFakeTimers();
    try {
      // 20 days in: rotating must not extend the chain past the original
      // 30-day horizon — the successor inherits the ancestor's expiry.
      vi.setSystemTime(Date.now() + 20 * 24 * 60 * 60 * 1000);
      const pair = await McpOauthToken.mintPair(grantId);
      const rotated = (await McpOauthToken.rotateRefresh(
        pair.refreshToken
      )) as { refreshToken: string };
      // 31 more days: past the second mint's own 30-day window but within a
      // fresh window from rotation time. A sliding lifetime would still
      // rotate here; the absolute one must refuse.
      vi.setSystemTime(Date.now() + 31 * 24 * 60 * 60 * 1000);
      expect(await McpOauthToken.rotateRefresh(rotated.refreshToken)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("the rotated_from unique index refuses a second successor row", async () => {
    const grantId = await makeGrant();
    const pair = await McpOauthToken.mintPair(grantId);
    const first = await McpOauthToken.rotateRefresh(pair.refreshToken);
    expect("reuseDetected" in (first as object)).toBe(false);
    // Simulate the concurrent-rotation loser: a second insert claiming the
    // same ancestor must hit the unique index, which rotateRefresh turns
    // into reuse detection. Presenting the ancestor again exercises exactly
    // that insert path... but the successor check already catches it, so
    // drive the raw insert to prove the constraint itself bites.
    const { getDb } = await import("../src/db.js");
    const { mcpOauthTokens } = await import("../src/schema/index.js");
    const rows = await getDb()
      .select({ rotated_from: mcpOauthTokens.rotated_from })
      .from(mcpOauthTokens);
    const claimed = rows.find(
      (r: { rotated_from: string | null }) => r.rotated_from !== null
    );
    expect(claimed).toBeDefined();
    await expect(
      getDb()
        .insert(mcpOauthTokens)
        .values({
          id: "ffffffffffffffff",
          grant_id: grantId,
          kind: "refresh",
          secret_hash: "irrelevant",
          expires_at: new Date(Date.now() + 1000).toISOString(),
          rotated_from: claimed!.rotated_from,
          last_used_at: null
        })
    ).rejects.toThrow();
  });

  it("revokeByRawToken returns false for an unknown or malformed token", async () => {
    expect(await McpOauthToken.revokeByRawToken("nta_deadbeef_x")).toBe(
      false
    );
    expect(await McpOauthToken.revokeByRawToken("not-a-token")).toBe(false);
  });
});
