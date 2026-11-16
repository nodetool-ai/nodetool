/**
 * Native sign-in for the desktop apps: the `native` scope of the OAuth
 * server, `ntd_` access tokens, the revocation handle and device sessions
 * (docs/plans/native-cloud-sync/technical-design.md, "Sign-in protocol").
 *
 * The consent step runs through the real `agentAccess.approveOauthRequest`
 * procedure and the token step through the real route plugin, against a
 * temp SQLite database. Codes in comments name the design's tests: TC2, TC3,
 * TC5 (server half), TC6 and the session half of TC13.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { createHash, randomBytes } from "node:crypto";
import {
  McpOauthGrant,
  McpOauthToken,
  ModelObserver,
  initTestDb,
  getPortableDb,
  oauthPendingEntries,
  MCP_OAUTH_REFRESH_REUSE_GRACE_MS
} from "@nodetool-ai/models";
import { oauthAsRoutes } from "../src/routes/oauth-as.js";
import { PendingStore } from "../src/oauth/pending-store.js";
import { decideOauthBearer } from "../src/oauth/bearer.js";
import {
  authenticateNativeAccessToken,
  NATIVE_VALIDATION_TTL_MS,
  nativeValidationCacheSize,
  resetNativeSessionState,
  sweepNativeSessionSockets,
  trackNativeSessionSocket
} from "../src/oauth/native-session.js";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

const PUBLIC_URL = "https://nodetool.example";
const createCaller = createCallerFactory(appRouter);

const ENV_KEYS = [
  "NODETOOL_PUBLIC_URL",
  "NODETOOL_DISABLE_MCP_OAUTH",
  "NODETOOL_DISABLE_NATIVE_SIGNIN",
  "NODETOOL_ENV",
  "NODETOOL_ENABLE_MCP",
  "SUPABASE_URL",
  "SUPABASE_KEY"
] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  initTestDb();
  resetNativeSessionState();
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const key of ENV_KEYS) delete process.env[key];
  process.env["NODETOOL_PUBLIC_URL"] = PUBLIC_URL;
  // Native sign-in needs a server with real accounts.
  process.env["SUPABASE_URL"] = "https://project.supabase.example";
  process.env["SUPABASE_KEY"] = "anon-key";
});

afterEach(() => {
  vi.useRealTimers();
  ModelObserver.clear();
  resetNativeSessionState();
  for (const key of ENV_KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function makeCtx(userId: string, nativeSessionId: string | null = null): Context {
  return {
    userId,
    nativeSessionId,
    // A native app always names its protocol version.
    clientProtocol: nativeSessionId ? 1 : null,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  } as Context;
}

/** Move the expiry of an access token row, as time passing would. */
async function setAccessExpiry(token: string, expiresAt: number): Promise<void> {
  const row = await McpOauthToken.get<McpOauthToken>(token.split("_")[1]!);
  if (!row) throw new Error("no such token");
  row.expires_at = new Date(expiresAt).toISOString();
  await row.save();
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(oauthAsRoutes);
  await app.ready();
  return app;
}

function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier, "ascii").digest("base64url");
  return { verifier, challenge };
}

const REDIRECT = "http://127.0.0.1:53111/callback";

function authorizeQuery(
  challenge: string,
  overrides: Record<string, string | null> = {}
): string {
  const params: Record<string, string | null> = {
    client_id: "nodetool-native",
    redirect_uri: REDIRECT,
    response_type: "code",
    code_challenge: challenge,
    code_challenge_method: "S256",
    scope: "native",
    resource: PUBLIC_URL,
    state: "st-1",
    app: "node-editor",
    device_name: "Studio Mac",
    ...overrides
  };
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null) query.set(key, value);
  }
  return query.toString();
}

/** Authorize, approve as `userId` through the real procedure, return the code. */
async function approveNative(
  app: FastifyInstance,
  userId = "user-a",
  overrides: Record<string, string | null> = {}
): Promise<{ code: string; verifier: string }> {
  const { verifier, challenge } = pkcePair();
  const res = await app.inject({
    method: "GET",
    url: `/oauth/authorize?${authorizeQuery(challenge, overrides)}`
  });
  expect(res.statusCode).toBe(302);
  const requestId = new URL(res.headers.location as string, "http://x").searchParams.get(
    "request_id"
  )!;
  expect(requestId).toBeTruthy();
  const { redirect_url } = await createCaller(makeCtx(userId)).agentAccess.approveOauthRequest({
    request_id: requestId
  });
  const redirect = new URL(redirect_url);
  expect(redirect.searchParams.get("state")).toBe("st-1");
  return { code: redirect.searchParams.get("code")!, verifier };
}

interface NativeTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  session_id: string;
  user_id: string;
  revocation_handle?: string;
}

async function exchange(
  app: FastifyInstance,
  code: string,
  verifier: string
): Promise<{ status: number; body: NativeTokens & { error?: string } }> {
  const res = await app.inject({
    method: "POST",
    url: "/oauth/token",
    payload: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: "nodetool-native",
      redirect_uri: REDIRECT,
      code_verifier: verifier,
      resource: PUBLIC_URL
    }).toString(),
    headers: { "content-type": "application/x-www-form-urlencoded" }
  });
  return { status: res.statusCode, body: res.json() };
}

async function signIn(app: FastifyInstance, userId = "user-a"): Promise<NativeTokens> {
  const { code, verifier } = await approveNative(app, userId);
  const { status, body } = await exchange(app, code, verifier);
  expect(status).toBe(200);
  return body;
}

async function refresh(
  app: FastifyInstance,
  refreshToken: string
): Promise<{ status: number; body: NativeTokens & { error?: string } }> {
  const res = await app.inject({
    method: "POST",
    url: "/oauth/token",
    payload: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: "nodetool-native",
      resource: PUBLIC_URL
    }).toString(),
    headers: { "content-type": "application/x-www-form-urlencoded" }
  });
  return { status: res.statusCode, body: res.json() };
}

async function endSession(
  app: FastifyInstance,
  handle: string
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await app.inject({
    method: "POST",
    url: "/oauth/session/end",
    payload: JSON.stringify({ handle }),
    headers: { "content-type": "application/json" }
  });
  return { status: res.statusCode, body: res.json() };
}

describe("native sign-in: authorize, consent, exchange", () => {
  it("signs in with the seeded client and returns the session, user and handle", async () => {
    const app = await buildApp();
    const tokens = await signIn(app);
    expect(tokens.access_token.startsWith("ntd_")).toBe(true);
    expect(tokens.refresh_token.startsWith("ntr_")).toBe(true);
    expect(tokens.revocation_handle?.startsWith("nth_")).toBe(true);
    expect(tokens.expires_in).toBe(900);
    expect(tokens.scope).toBe("native");
    expect(tokens.user_id).toBe("user-a");

    const grant = await McpOauthGrant.get(tokens.session_id);
    expect(grant).toMatchObject({
      kind: "native",
      app_name: "node-editor",
      device_name: "Studio Mac",
      client_id: "nodetool-native",
      resource: PUBLIC_URL,
      revoked_at: null
    });
  });

  it("shows the app and the device name on the consent request", async () => {
    const app = await buildApp();
    const { challenge } = pkcePair();
    const res = await app.inject({
      method: "GET",
      url: `/oauth/authorize?${authorizeQuery(challenge, {
        app: "timeline",
        device_name: "  Edit\u0007 Bay\n 3 "
      })}`
    });
    const requestId = new URL(res.headers.location as string, "http://x").searchParams.get(
      "request_id"
    )!;
    const summary = await createCaller(makeCtx("user-a")).agentAccess.getOauthRequest({
      request_id: requestId
    });
    expect(summary).toMatchObject({
      kind: "native",
      scope: "native",
      app_name: "timeline",
      // Control characters removed and whitespace collapsed.
      device_name: "Edit Bay 3"
    });
  });

  it("refuses an unknown app, a missing device name, and a foreign resource", async () => {
    const app = await buildApp();
    const { challenge } = pkcePair();
    for (const [overrides, error] of [
      [{ app: "browser" }, "invalid_request"],
      [{ device_name: null }, "invalid_request"],
      [{ resource: "https://other.example" }, "invalid_target"]
    ] as const) {
      const res = await app.inject({
        method: "GET",
        url: `/oauth/authorize?${authorizeQuery(challenge, overrides)}`
      });
      expect(res.statusCode).toBe(302);
      const location = new URL(res.headers.location as string);
      expect(location.origin + location.pathname).toBe(REDIRECT);
      expect(location.searchParams.get("error")).toBe(error);
    }
  });

  it("keeps the native scope and the native client bound to each other", async () => {
    const app = await buildApp();
    const { challenge } = pkcePair();
    const res = await app.inject({
      method: "GET",
      url: `/oauth/authorize?${authorizeQuery(challenge, { scope: "mcp" })}`
    });
    expect(new URL(res.headers.location as string).searchParams.get("error")).toBe(
      "invalid_scope"
    );
  });

  it("does not sign out another device when the same user signs in again", async () => {
    const app = await buildApp();
    const first = await signIn(app);
    const second = await signIn(app);
    expect(second.session_id).not.toBe(first.session_id);
    expect((await McpOauthGrant.get(first.session_id))?.revoked_at).toBeNull();
    const sessions = await createCaller(makeCtx("user-a")).agentAccess.listDeviceSessions();
    expect(sessions.available).toBe(true);
    expect(sessions.sessions.map((s) => s.id).sort()).toEqual(
      [first.session_id, second.session_id].sort()
    );
    // Device sessions are not listed as MCP clients.
    const mcp = await createCaller(makeCtx("user-a")).agentAccess.listOauthGrants();
    expect(mcp.grants).toEqual([]);
  });

  it("returns the revocation handle from the code exchange only", async () => {
    const app = await buildApp();
    const tokens = await signIn(app);
    const refreshed = await refresh(app, tokens.refresh_token);
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.revocation_handle).toBeUndefined();
    expect(refreshed.body.session_id).toBe(tokens.session_id);
    expect(refreshed.body.access_token.startsWith("ntd_")).toBe(true);
    expect(refreshed.body.expires_in).toBe(900);
  });
});

describe("TC6: consent and exchange on different server processes", () => {
  it("keeps the authorize state in the database, not in a process", async () => {
    const app = await buildApp();
    const { challenge } = pkcePair();
    const res = await app.inject({
      method: "GET",
      url: `/oauth/authorize?${authorizeQuery(challenge)}`
    });
    const requestId = new URL(res.headers.location as string, "http://x").searchParams.get(
      "request_id"
    )!;
    // A second store instance stands in for a second process: it shares the
    // database and nothing else. The in-memory store failed this.
    const otherProcess = new PendingStore();
    expect((await otherProcess.takeRequestForApproval(requestId))?.deviceName).toBe(
      "Studio Mac"
    );
    const rows = await getPortableDb().select().from(oauthPendingEntries);
    expect(rows.map((r) => r.entry_type)).toEqual(["request"]);
  });

  it("exchanges a code that another store instance wrote", async () => {
    const app = await buildApp();
    const { code, verifier } = await approveNative(app);
    expect(await new PendingStore().peekCode(code)).not.toBeNull();
    const { status } = await exchange(app, code, verifier);
    expect(status).toBe(200);
    // The code row is stored by hash, never as the code itself.
    const ids = (await getPortableDb().select().from(oauthPendingEntries)).map((r) => r.id);
    expect(ids).not.toContain(code);
  });
});

describe("TC2 and TC3: each credential only where it belongs", () => {
  it("TC2: an ntd_ token is refused on /mcp and accepted on the API", async () => {
    const app = await buildApp();
    const tokens = await signIn(app);
    expect(await decideOauthBearer(tokens.access_token, "/mcp")).toMatchObject({
      kind: "deny"
    });
    expect(await decideOauthBearer(tokens.access_token, "/api/workflows")).toEqual({
      kind: "grant",
      userId: "user-a",
      nativeSessionId: tokens.session_id,
      nativeTokenExpiresAt: expect.any(Number)
    });
    expect(await decideOauthBearer(tokens.access_token, "/trpc/workflows.list")).toMatchObject({
      kind: "grant"
    });
  });

  it("TC2: an nta_ token is refused on the API, and a prefix swap buys nothing", async () => {
    const grant = await McpOauthGrant.create({
      user_id: "user-a",
      client_id: "ntc_x",
      client_name: "MCP",
      scope: "mcp",
      resource: `${PUBLIC_URL}/mcp`
    });
    const pair = await McpOauthToken.mintPair(grant.id);
    expect(await decideOauthBearer(pair.accessToken, "/api/workflows")).toMatchObject({
      kind: "deny"
    });
    // The same id and secret under the native prefix: the grant is MCP.
    const swapped = `ntd_${pair.accessToken.slice("nta_".length)}`;
    expect(await decideOauthBearer(swapped, "/api/workflows")).toMatchObject({
      kind: "deny"
    });
    // And the other way round.
    const app = await buildApp();
    const tokens = await signIn(app);
    const toMcp = `nta_${tokens.access_token.slice("ntd_".length)}`;
    expect(await decideOauthBearer(toMcp, "/mcp")).toMatchObject({ kind: "deny" });
  });

  it("TC3: a revocation handle is refused as a bearer everywhere and the grant stays active", async () => {
    const app = await buildApp();
    const tokens = await signIn(app);
    for (const path of ["/api/workflows", "/trpc/workflows.list", "/ws", "/mcp", "/v1/chat/completions"]) {
      expect(await decideOauthBearer(tokens.revocation_handle!, path)).toMatchObject({
        kind: "deny"
      });
      expect(await decideOauthBearer(tokens.refresh_token, path)).toMatchObject({
        kind: "deny"
      });
    }
    expect((await McpOauthGrant.get(tokens.session_id))?.revoked_at).toBeNull();
    expect(await decideOauthBearer(tokens.access_token, "/api/workflows")).toMatchObject({
      kind: "grant"
    });
  });

  it("refuses credential-creating procedures to a native session", async () => {
    const caller = createCaller(makeCtx("user-a", "grant-1"));
    await expect(caller.agentAccess.createToken({ name: "x" })).rejects.toThrow(
      /Sign in to the web app/
    );
    await expect(
      caller.agentAccess.approveOauthRequest({ request_id: "r" })
    ).rejects.toThrow(/Sign in to the web app/);
    // Reading is fine.
    await expect(caller.agentAccess.listTokens()).resolves.toEqual({ tokens: [] });
  });
});

describe("TC5 (server half): the lost-rotation rule", () => {
  it("accepts the previous refresh token within 60 seconds while its replacement was never used", async () => {
    const app = await buildApp();
    const tokens = await signIn(app);
    // The app's keychain write never happened: it still holds the old token.
    const lost = await refresh(app, tokens.refresh_token);
    expect(lost.status).toBe(200);
    const retried = await refresh(app, tokens.refresh_token);
    expect(retried.status).toBe(200);
    expect(retried.body.refresh_token).not.toBe(lost.body.refresh_token);
    // The lost replacement is discarded: one refresh chain stays live.
    expect((await refresh(app, lost.body.refresh_token)).status).toBe(400);
    expect((await McpOauthGrant.get(tokens.session_id))?.revoked_at).toBeNull();
    // The retried chain keeps working.
    const next = await refresh(app, retried.body.refresh_token);
    expect(next.status).toBe(200);
  });

  it("revokes the grant when the replacement was already used", async () => {
    const app = await buildApp();
    const tokens = await signIn(app);
    const second = await refresh(app, tokens.refresh_token);
    expect((await refresh(app, second.body.refresh_token)).status).toBe(200);
    const reuse = await refresh(app, tokens.refresh_token);
    expect(reuse.status).toBe(400);
    expect(reuse.body.error).toBe("invalid_grant");
    expect((await McpOauthGrant.get(tokens.session_id))?.revoked_at).not.toBeNull();
  });

  it("revokes the grant after 60 seconds, and the app must sign in again", async () => {
    const app = await buildApp();
    const tokens = await signIn(app);
    expect((await refresh(app, tokens.refresh_token)).status).toBe(200);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + MCP_OAUTH_REFRESH_REUSE_GRACE_MS + 1);
    const late = await refresh(app, tokens.refresh_token);
    expect(late.status).toBe(400);
    expect(late.body.error).toBe("invalid_grant");
    expect((await McpOauthGrant.get(tokens.session_id))?.revoked_at).not.toBeNull();
  });

  it("restarts the 90-day inactivity period at each rotation", async () => {
    const app = await buildApp();
    const tokens = await signIn(app);
    vi.useFakeTimers({ toFake: ["Date"] });
    // 80 days later a refresh still works and starts a new period.
    vi.setSystemTime(Date.now() + 80 * 86_400_000);
    const r1 = await refresh(app, tokens.refresh_token);
    expect(r1.status).toBe(200);
    vi.setSystemTime(Date.now() + 80 * 86_400_000);
    expect((await refresh(app, r1.body.refresh_token)).status).toBe(200);
  });
});

describe("POST /oauth/session/end", () => {
  it("ends the session with the handle alone: 200, then 200 again, 404 for an unknown handle", async () => {
    const app = await buildApp();
    const tokens = await signIn(app);
    const first = await endSession(app, tokens.revocation_handle!);
    expect(first).toEqual({ status: 200, body: { ended: true, already_ended: false } });
    const again = await endSession(app, tokens.revocation_handle!);
    expect(again).toEqual({ status: 200, body: { ended: true, already_ended: true } });
    expect((await endSession(app, `nth_${randomBytes(32).toString("base64url")}`)).status).toBe(
      404
    );
    expect((await endSession(app, tokens.refresh_token)).status).toBe(404);

    expect((await refresh(app, tokens.refresh_token)).status).toBe(400);
    expect(await decideOauthBearer(tokens.access_token, "/api/workflows")).toMatchObject({
      kind: "deny"
    });
  });
});

describe("TC13 (session half): ending a device session", () => {
  it("closes the session's sockets at once when it ends on this process", async () => {
    const app = await buildApp();
    const tokens = await signIn(app);
    const close = vi.fn();
    trackNativeSessionSocket(tokens.session_id, tokens.access_token, Date.now() + 3_600_000, close);
    await createCaller(makeCtx("user-a")).agentAccess.endDeviceSession({
      session_id: tokens.session_id
    });
    expect(close).toHaveBeenCalledTimes(1);
    expect(await decideOauthBearer(tokens.access_token, "/api/workflows")).toMatchObject({
      kind: "deny"
    });
  });

  it("closes the sockets at the next sweep when another process ended the session", async () => {
    const app = await buildApp();
    const tokens = await signIn(app);
    const close = vi.fn();
    trackNativeSessionSocket(tokens.session_id, tokens.access_token, Date.now() + 3_600_000, close);
    await sweepNativeSessionSockets();
    expect(close).not.toHaveBeenCalled();
    // Another process revokes: only the database changes here.
    await McpOauthGrant.revoke("user-a", tokens.session_id);
    await sweepNativeSessionSockets();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("stops accepting a token revoked on another process once its cached check expires, and drops the entry", async () => {
    const app = await buildApp();
    const tokens = await signIn(app);
    const start = Date.now();
    expect(await authenticateNativeAccessToken(tokens.access_token, "/api/workflows", start)).toMatchObject({
      ok: true
    });
    expect(nativeValidationCacheSize()).toBe(1);
    // Another process revokes: only the database changes here.
    await McpOauthGrant.revoke("user-a", tokens.session_id);
    expect(
      await authenticateNativeAccessToken(tokens.access_token, "/api/workflows", start + 1_000)
    ).toMatchObject({ ok: true });
    expect(
      await authenticateNativeAccessToken(
        tokens.access_token,
        "/api/workflows",
        start + NATIVE_VALIDATION_TTL_MS
      )
    ).toEqual({ ok: false });
    expect(nativeValidationCacheSize()).toBe(0);
  });

  it("refuses a write with a token revoked on another process at once, cache or not", async () => {
    const app = await buildApp();
    const tokens = await signIn(app);
    const start = Date.now();
    expect(await authenticateNativeAccessToken(tokens.access_token, "/trpc/workflows.autosave", start)).toMatchObject({
      ok: true
    });
    expect(await decideOauthBearer(tokens.access_token, "/trpc/workflows.list", "GET")).toMatchObject({
      kind: "grant"
    });
    // Another replica processed the revocation: only the database changes here.
    await McpOauthGrant.revoke("user-a", tokens.session_id);
    expect(
      await authenticateNativeAccessToken(tokens.access_token, "/trpc/workflows.autosave", start + 1_000, {
        write: true
      })
    ).toEqual({ ok: false });
    // The refused write also drops the cached check, so reads stop too.
    expect(await decideOauthBearer(tokens.access_token, "/trpc/workflows.list", "GET")).toMatchObject({
      kind: "deny"
    });
    expect(
      await decideOauthBearer(tokens.access_token, "/trpc/workflows.autosave", "POST")
    ).toMatchObject({ kind: "deny" });
  });

  it("never answers from the cache after the token expired", async () => {
    const app = await buildApp();
    const tokens = await signIn(app);
    const start = Date.now();
    const expiresAt = start + 5_000;
    await setAccessExpiry(tokens.access_token, expiresAt);
    expect(await authenticateNativeAccessToken(tokens.access_token, "/api/workflows", start)).toMatchObject({
      ok: true,
      expiresAt
    });
    // Inside the 30-second cache window, past the token's own expiry.
    expect(
      await authenticateNativeAccessToken(tokens.access_token, "/api/workflows", expiresAt + 1)
    ).toEqual({ ok: false });
    expect(nativeValidationCacheSize()).toBe(0);
  });

  it("closes a socket when the token that opened it expires, while its grant stays active", async () => {
    const app = await buildApp();
    const tokens = await signIn(app);
    const close = vi.fn();
    trackNativeSessionSocket(tokens.session_id, tokens.access_token, Date.now() + 20, close);
    await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect((await McpOauthGrant.get(tokens.session_id))?.revoked_at).toBeNull();
  });

  it("closes a socket at the sweep when its token stopped verifying, while its grant stays active", async () => {
    const app = await buildApp();
    const tokens = await signIn(app);
    const close = vi.fn();
    trackNativeSessionSocket(tokens.session_id, tokens.access_token, Date.now() + 3_600_000, close);
    await sweepNativeSessionSockets();
    expect(close).not.toHaveBeenCalled();
    // The token expired in the database, for example on a host whose clock
    // ran ahead: the grant is still active.
    await setAccessExpiry(tokens.access_token, Date.now() - 1);
    await sweepNativeSessionSockets();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("does not let one user end another user's session", async () => {
    const app = await buildApp();
    const tokens = await signIn(app, "user-a");
    const result = await createCaller(makeCtx("user-b")).agentAccess.endDeviceSession({
      session_id: tokens.session_id
    });
    expect(result.ok).toBe(false);
    expect((await McpOauthGrant.get(tokens.session_id))?.revoked_at).toBeNull();
  });
});

describe("the administrator switch and Local mode", () => {
  it("answers access_denied at authorize, and stops existing sessions", async () => {
    const app = await buildApp();
    const tokens = await signIn(app);
    process.env["NODETOOL_DISABLE_NATIVE_SIGNIN"] = "1";
    resetNativeSessionState();
    const { challenge } = pkcePair();
    const res = await app.inject({
      method: "GET",
      url: `/oauth/authorize?${authorizeQuery(challenge)}`
    });
    const location = new URL(res.headers.location as string);
    expect(location.searchParams.get("error")).toBe("access_denied");
    expect(location.searchParams.get("error_description")).toMatch(/turned off/);
    expect(await decideOauthBearer(tokens.access_token, "/api/workflows")).toMatchObject({
      kind: "deny"
    });
    // A refresh is refused without spending the token.
    expect((await refresh(app, tokens.refresh_token)).status).toBe(400);
    delete process.env["NODETOOL_DISABLE_NATIVE_SIGNIN"];
    expect((await refresh(app, tokens.refresh_token)).status).toBe(200);
    // The handle still ends the session while the switch is off.
    process.env["NODETOOL_DISABLE_NATIVE_SIGNIN"] = "1";
    expect((await endSession(app, tokens.revocation_handle!)).status).toBe(200);
  });

  it("does not offer the native scope in Local mode", async () => {
    delete process.env["SUPABASE_URL"];
    delete process.env["SUPABASE_KEY"];
    const app = await buildApp();
    const { challenge } = pkcePair();
    const res = await app.inject({
      method: "GET",
      url: `/oauth/authorize?${authorizeQuery(challenge)}`
    });
    expect(res.statusCode).toBe(404);
    const sessions = await createCaller(makeCtx("1")).agentAccess.listDeviceSessions();
    expect(sessions).toEqual({ available: false, sessions: [] });
  });

  it("serves native sign-in when the MCP mount is off", async () => {
    process.env["NODETOOL_ENV"] = "production";
    const app = await buildApp();
    const tokens = await signIn(app);
    expect(tokens.access_token.startsWith("ntd_")).toBe(true);
    // The MCP half stays closed.
    const register = await app.inject({
      method: "POST",
      url: "/oauth/register",
      payload: JSON.stringify({ client_name: "x", redirect_uris: ["https://c.example/cb"] }),
      headers: { "content-type": "application/json" }
    });
    expect(register.statusCode).toBe(404);
  });
});
