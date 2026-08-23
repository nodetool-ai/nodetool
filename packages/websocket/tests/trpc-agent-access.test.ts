/**
 * `agentAccess` tRPC router — connecting an external MCP client.
 *
 * Two things are worth pinning here. The token procedures are scoped: a user
 * sees and revokes their own rows and nobody else's. And `mcpConnection`
 * reports the mount's real gate — the settings UI offers a connection over it,
 * so an answer of "enabled" over an unregistered route sends people to debug a
 * 404.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  AccessToken,
  McpOauthGrant,
  ModelObserver,
  initTestDb
} from "@nodetool-ai/models";

import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";
import { pendingStore } from "../src/oauth/pending-store.js";
import type { PendingAuthorizeRequest } from "../src/oauth/pending-store.js";

const createCaller = createCallerFactory(appRouter);

function makeCtx(userId: string | null): Context {
  return {
    userId,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  } as Context;
}

const ENV_KEYS = [
  "NODETOOL_ENV",
  "NODETOOL_ENABLE_MCP",
  "NODETOOL_PUBLIC_URL",
  "SUPABASE_URL",
  "SUPABASE_KEY"
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  initTestDb();
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const key of ENV_KEYS) delete process.env[key];
});

afterEach(() => {
  ModelObserver.clear();
  for (const key of ENV_KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("agentAccess tokens", () => {
  it("mints a token, returns the plaintext once, and lists it without the secret", async () => {
    const caller = createCaller(makeCtx("user-a"));

    const minted = await caller.agentAccess.createToken({
      name: "Claude Code"
    });
    expect(minted.token).toMatch(/^ntk_[0-9a-f]+_/);
    expect(minted.record.name).toBe("Claude Code");
    expect(minted.record.expires_at).toBeNull();

    const listed = await caller.agentAccess.listTokens();
    expect(listed.tokens).toHaveLength(1);
    expect(listed.tokens[0].id).toBe(minted.record.id);
    // The wire shape has no field that could carry the secret.
    expect(JSON.stringify(listed.tokens[0])).not.toContain(minted.token);
  });

  it("mints a token that expires when one was asked for", async () => {
    const caller = createCaller(makeCtx("user-a"));
    const minted = await caller.agentAccess.createToken({
      name: "temporary",
      expires_in_days: 30
    });

    const expiry = Date.parse(minted.record.expires_at!);
    const expected = Date.now() + 30 * 86_400_000;
    expect(Math.abs(expiry - expected)).toBeLessThan(60_000);
  });

  it("lists only the caller's own tokens", async () => {
    await createCaller(makeCtx("user-a")).agentAccess.createToken({
      name: "mine"
    });
    await createCaller(makeCtx("user-b")).agentAccess.createToken({
      name: "theirs"
    });

    const listed = await createCaller(makeCtx("user-a")).agentAccess.listTokens();
    expect(listed.tokens.map((t) => t.name)).toEqual(["mine"]);
  });

  it("revokes the caller's token, and refuses to revoke another user's", async () => {
    const owner = createCaller(makeCtx("user-a"));
    const minted = await owner.agentAccess.createToken({ name: "mine" });

    const other = createCaller(makeCtx("user-b"));
    expect(
      await other.agentAccess.revokeToken({ id: minted.record.id })
    ).toEqual({ revoked: false });
    expect(await AccessToken.verify(minted.token)).not.toBeNull();

    expect(
      await owner.agentAccess.revokeToken({ id: minted.record.id })
    ).toEqual({ revoked: true });
    expect(await AccessToken.verify(minted.token)).toBeNull();
  });

  it("caps how many tokens one user may hold", async () => {
    const caller = createCaller(makeCtx("user-a"));
    for (let i = 0; i < 25; i++) {
      await caller.agentAccess.createToken({ name: `token ${i}` });
    }
    await expect(
      caller.agentAccess.createToken({ name: "one too many" })
    ).rejects.toThrow(/Revoke one/);
  });

  it("refuses every procedure without a session", async () => {
    const anonymous = createCaller(makeCtx(null));
    await expect(anonymous.agentAccess.listTokens()).rejects.toThrow();
    await expect(
      anonymous.agentAccess.createToken({ name: "nope" })
    ).rejects.toThrow();
    await expect(
      anonymous.agentAccess.revokeToken({ id: "x" })
    ).rejects.toThrow();
    await expect(anonymous.agentAccess.mcpConnection()).rejects.toThrow();
  });
});

describe("agentAccess mcpConnection", () => {
  it("reports the mount on outside production", async () => {
    const result = await createCaller(makeCtx("user-a")).agentAccess.mcpConnection();
    expect(result.enabled).toBe(true);
    expect(result.enable_flag).toBeNull();
  });

  it("reports the mount off in production, and names the flag", async () => {
    process.env.NODETOOL_ENV = "production";
    const result = await createCaller(makeCtx("user-a")).agentAccess.mcpConnection();
    expect(result.enabled).toBe(false);
    expect(result.url).toBeNull();
    expect(result.enable_flag).toBe("NODETOOL_ENABLE_MCP");
  });

  it("reports the mount on in production once the flag is set", async () => {
    process.env.NODETOOL_ENV = "production";
    process.env.NODETOOL_ENABLE_MCP = "1";
    const result = await createCaller(makeCtx("user-a")).agentAccess.mcpConnection();
    expect(result.enabled).toBe(true);
    expect(result.enable_flag).toBeNull();
  });

  it("returns the configured public URL, and null when there is none", async () => {
    process.env.NODETOOL_PUBLIC_URL = "https://nodetool.example.com/";
    expect(
      (await createCaller(makeCtx("user-a")).agentAccess.mcpConnection()).url
    ).toBe("https://nodetool.example.com/mcp");

    delete process.env.NODETOOL_PUBLIC_URL;
    expect(
      (await createCaller(makeCtx("user-a")).agentAccess.mcpConnection()).url
    ).toBeNull();
  });

  it("asks for a token only when the server checks one", async () => {
    expect(
      (await createCaller(makeCtx("user-a")).agentAccess.mcpConnection()).auth_mode
    ).toBe("none");

    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_KEY = "service-key";
    expect(
      (await createCaller(makeCtx("user-a")).agentAccess.mcpConnection()).auth_mode
    ).toBe("token");
  });
});

/** Park a pending `/oauth/authorize` request the way the (T3) route plugin
 * does, so the tRPC procedures under test have something to act on. */
function parkRequest(
  overrides: Partial<Omit<PendingAuthorizeRequest, "id" | "createdAt">> = {}
): string {
  return pendingStore.putRequest({
    clientId: "ntc_abc123",
    clientName: "Test Client",
    redirectUri: "https://client.example.com/callback",
    codeChallenge: "challenge",
    scope: "mcp",
    resource: "https://nodetool.example.com/mcp",
    redirectHostIsLoopbackOnly: false,
    ...overrides
  });
}

describe("agentAccess OAuth consent", () => {
  beforeEach(() => {
    process.env.NODETOOL_PUBLIC_URL = "https://nodetool.example.com";
  });

  it("reports a pending request's details without consuming it", async () => {
    const caller = createCaller(makeCtx("user-a"));
    const requestId = parkRequest({ state: "xyz" });

    const first = await caller.agentAccess.getOauthRequest({
      request_id: requestId
    });
    expect(first).toEqual({
      client_name: "Test Client",
      redirect_host: "client.example.com",
      scope: "mcp",
      loopback_only: false
    });

    // Reading again still works — get does not consume.
    const second = await caller.agentAccess.getOauthRequest({
      request_id: requestId
    });
    expect(second).toEqual(first);
  });

  it("returns null for an unknown request_id", async () => {
    const caller = createCaller(makeCtx("user-a"));
    expect(
      await caller.agentAccess.getOauthRequest({ request_id: "does-not-exist" })
    ).toBeNull();
  });

  it("approves a request: mints a grant, and the redirect carries code, state, and iss", async () => {
    const caller = createCaller(makeCtx("user-a"));
    const requestId = parkRequest({ state: "s1" });

    const { redirect_url } = await caller.agentAccess.approveOauthRequest({
      request_id: requestId
    });
    const url = new URL(redirect_url);
    expect(url.origin + url.pathname).toBe(
      "https://client.example.com/callback"
    );
    expect(url.searchParams.get("code")).toBeTruthy();
    expect(url.searchParams.get("state")).toBe("s1");
    expect(url.searchParams.get("iss")).toBe("https://nodetool.example.com");

    const grants = await McpOauthGrant.listForUser("user-a");
    expect(grants).toHaveLength(1);
    expect(grants[0].client_name).toBe("Test Client");
    expect(grants[0].client_id).toBe("ntc_abc123");

    // The request is single-use — approving it again fails.
    await expect(
      caller.agentAccess.approveOauthRequest({ request_id: requestId })
    ).rejects.toThrow();
  });

  it("omits state from the redirect when the client never sent one", async () => {
    const caller = createCaller(makeCtx("user-a"));
    const requestId = parkRequest();

    const { redirect_url } = await caller.agentAccess.approveOauthRequest({
      request_id: requestId
    });
    expect(new URL(redirect_url).searchParams.has("state")).toBe(false);
  });

  it("denies a request without minting a grant, redirecting with access_denied", async () => {
    const caller = createCaller(makeCtx("user-a"));
    const requestId = parkRequest({ state: "s2" });

    const { redirect_url } = await caller.agentAccess.denyOauthRequest({
      request_id: requestId
    });
    const url = new URL(redirect_url);
    expect(url.searchParams.get("error")).toBe("access_denied");
    expect(url.searchParams.get("state")).toBe("s2");
    expect(url.searchParams.get("iss")).toBe("https://nodetool.example.com");

    expect(await McpOauthGrant.listForUser("user-a")).toHaveLength(0);
  });

  it("rejects an expired or unknown request_id with NOT_FOUND", async () => {
    const caller = createCaller(makeCtx("user-a"));
    await expect(
      caller.agentAccess.approveOauthRequest({ request_id: "never-existed" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      caller.agentAccess.denyOauthRequest({ request_id: "never-existed" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses every OAuth procedure without a session", async () => {
    const anonymous = createCaller(makeCtx(null));
    await expect(
      anonymous.agentAccess.getOauthRequest({ request_id: "x" })
    ).rejects.toThrow();
    await expect(
      anonymous.agentAccess.approveOauthRequest({ request_id: "x" })
    ).rejects.toThrow();
    await expect(
      anonymous.agentAccess.denyOauthRequest({ request_id: "x" })
    ).rejects.toThrow();
    await expect(anonymous.agentAccess.listOauthGrants()).rejects.toThrow();
    await expect(
      anonymous.agentAccess.revokeOauthGrant({ grant_id: "x" })
    ).rejects.toThrow();
  });
});

describe("agentAccess OAuth consent — iss and grant uniqueness", () => {
  it("preserves a sub-path in iss (RFC 9207 string comparison)", async () => {
    process.env.NODETOOL_PUBLIC_URL = "https://nodetool.example.com/base";
    const caller = createCaller(makeCtx("user-a"));
    const requestId = parkRequest();
    const { redirect_url } = await caller.agentAccess.approveOauthRequest({
      request_id: requestId
    });
    const iss = new URL(redirect_url).searchParams.get("iss");
    // new URL(...).origin would say https://nodetool.example.com and every
    // conforming client would reject the response against the metadata
    // issuer https://nodetool.example.com/base.
    expect(iss).toBe("https://nodetool.example.com/base");
  });

  it("re-consent supersedes: one active grant per (user, client)", async () => {
    process.env.NODETOOL_PUBLIC_URL = "https://nodetool.example.com";
    const caller = createCaller(makeCtx("user-a"));
    await caller.agentAccess.approveOauthRequest({
      request_id: parkRequest()
    });
    await caller.agentAccess.approveOauthRequest({
      request_id: parkRequest()
    });
    const { grants } = await caller.agentAccess.listOauthGrants();
    const forClient = grants.filter((g) => g.client_id === "ntc_abc123");
    expect(forClient).toHaveLength(1);
  });
});

describe("agentAccess OAuth grants", () => {
  it("lists a user's active grants, excluding revoked ones", async () => {
    const caller = createCaller(makeCtx("user-a"));
    const { id: grant1 } = await McpOauthGrant.create({
      user_id: "user-a",
      client_id: "ntc_one",
      client_name: "Client One",
      scope: "mcp",
      resource: "https://nodetool.example.com/mcp"
    });
    await McpOauthGrant.create({
      user_id: "user-a",
      client_id: "ntc_two",
      client_name: "Client Two",
      scope: "mcp",
      resource: "https://nodetool.example.com/mcp"
    });

    expect(await McpOauthGrant.revoke("user-a", grant1)).toBe(true);

    const { grants } = await caller.agentAccess.listOauthGrants();
    expect(grants).toHaveLength(1);
    expect(grants[0].client_name).toBe("Client Two");
  });

  it("only lists and revokes the caller's own grants", async () => {
    const { id: grantId } = await McpOauthGrant.create({
      user_id: "user-a",
      client_id: "ntc_one",
      client_name: "Client One",
      scope: "mcp",
      resource: "https://nodetool.example.com/mcp"
    });

    const other = createCaller(makeCtx("user-b"));
    expect((await other.agentAccess.listOauthGrants()).grants).toHaveLength(0);
    expect(
      await other.agentAccess.revokeOauthGrant({ grant_id: grantId })
    ).toEqual({ ok: false });

    const owner = createCaller(makeCtx("user-a"));
    expect(
      await owner.agentAccess.revokeOauthGrant({ grant_id: grantId })
    ).toEqual({ ok: true });
    expect((await owner.agentAccess.listOauthGrants()).grants).toHaveLength(0);
  });
});
