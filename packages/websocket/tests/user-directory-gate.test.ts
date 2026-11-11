/**
 * The account-status gate the server registers after its auth hook.
 *
 * server.ts binds a port on import, so this rebuilds the relevant slice: a
 * stand-in auth hook that sets `req.userId`, then `enforceAccountStatus`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import * as models from "@nodetool-ai/models";
import { initTestDb, recordSignIn, updateUserAccount } from "@nodetool-ai/models";
import {
  ACCOUNT_STATUS_TTL_MS,
  accountAccess,
  closeUserSockets,
  enforceAccountStatus,
  forgetAccountStatus,
  resetUserDirectoryCache,
  sweepDisabledSockets,
  trackUserSocket
} from "../src/lib/user-directory.js";

const USER = "d".repeat(32);

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorateRequest("userId", null);
  app.addHook("onRequest", async (req) => {
    const header = req.headers["x-test-user"];
    req.userId = typeof header === "string" ? header : null;
  });
  app.addHook("onRequest", enforceAccountStatus);
  app.get("/api/thing", async () => ({ ok: true }));
  await app.ready();
  return app;
}

describe("account status gate", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    initTestDb();
    resetUserDirectoryCache();
    await recordSignIn({ userId: USER, authSource: "oidc" });
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
    vi.restoreAllMocks();
    resetUserDirectoryCache();
  });

  const call = (userId?: string) =>
    app.inject({
      method: "GET",
      url: "/api/thing",
      headers: userId ? { "x-test-user": userId } : {}
    });

  it("lets an active user through", async () => {
    expect((await call(USER)).statusCode).toBe(200);
  });

  it("lets an id with no directory row through", async () => {
    expect((await call("token-user")).statusCode).toBe(200);
    expect((await call("1")).statusCode).toBe(200);
  });

  it("refuses a disabled user with 403 account_disabled", async () => {
    await updateUserAccount(USER, { status: "disabled" });
    forgetAccountStatus(USER);
    const res = await call(USER);
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body)).toEqual({ error: "account_disabled" });
  });

  it("serves a cached status until it expires", async () => {
    const now = Date.now();
    expect(await accountAccess(USER, now)).toBe("allowed");
    await updateUserAccount(USER, { status: "disabled" });
    expect(await accountAccess(USER, now + 1_000)).toBe("allowed");
    expect(await accountAccess(USER, now + ACCOUNT_STATUS_TTL_MS + 1)).toBe(
      "disabled"
    );
  });

  it("fails closed with 503 when the directory cannot be read", async () => {
    vi.spyOn(models, "getUserAccount").mockRejectedValue(new Error("db down"));
    const res = await call("someone-else");
    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body)).toEqual({ error: "user_directory_unavailable" });
  });

  it("closes the open sockets of a user disabled on another replica", async () => {
    const close = vi.fn();
    const untrack = trackUserSocket(USER, close);
    await updateUserAccount(USER, { status: "disabled" });
    await sweepDisabledSockets(Date.now() + ACCOUNT_STATUS_TTL_MS + 1);
    expect(close).toHaveBeenCalledOnce();
    untrack();
  });

  it("forgets a socket once it closes on its own", () => {
    const close = vi.fn();
    const untrack = trackUserSocket(USER, close);
    untrack();
    expect(closeUserSockets(USER)).toBe(0);
    expect(close).not.toHaveBeenCalled();
  });
});
