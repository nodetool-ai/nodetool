/**
 * The admin router: who may call it, what it changes, and what a disable does
 * to sessions that are already open.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import {
  Prediction,
  getUserAccount,
  initTestDb,
  recordSignIn
} from "@nodetool-ai/models";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";
import {
  accountAccess,
  resetUserDirectoryCache,
  trackUserSocket
} from "../src/lib/user-directory.js";
import { forgetPermissions, permissionsFor } from "../src/lib/permissions.js";

const createCaller = createCallerFactory(appRouter);

const ADMIN = "a".repeat(32);
const MEMBER = "b".repeat(32);
const GROUP_ADMIN = "c".repeat(32);

function callerFor(userId: string) {
  const ctx: Context = {
    userId,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  };
  return createCaller(ctx);
}

describe("admin router", () => {
  beforeEach(async () => {
    initTestDb();
    resetUserDirectoryCache();
    forgetPermissions();
    // No users.json admins: point the file manager at a path that does not exist.
    vi.stubEnv(
      "USERS_FILE",
      join(tmpdir(), `nt-admin-${randomBytes(6).toString("hex")}.json`)
    );
    vi.stubEnv("ADMIN_USER_IDS", ADMIN);
    vi.stubEnv("OIDC_ADMIN_GROUPS", "nodetool-admins");
    await recordSignIn({
      userId: ADMIN,
      email: "root@example.com",
      authSource: "oidc"
    });
    await recordSignIn({
      userId: MEMBER,
      email: "ada@example.com",
      displayName: "Ada Lovelace",
      authSource: "oidc",
      groups: ["staff"]
    });
    await recordSignIn({
      userId: GROUP_ADMIN,
      email: "grace@example.com",
      authSource: "oidc",
      groups: ["staff", "nodetool-admins"]
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetUserDirectoryCache();
  });

  it("tells each caller whether they are an admin", async () => {
    expect(await callerFor(ADMIN).admin.me()).toEqual({ is_admin: true });
    expect(await callerFor(MEMBER).admin.me()).toEqual({ is_admin: false });
    expect(await callerFor(GROUP_ADMIN).admin.me()).toEqual({ is_admin: true });
  });

  it("refuses the directory to a member", async () => {
    await expect(callerFor(MEMBER).admin.users.list()).rejects.toMatchObject({
      code: "FORBIDDEN"
    });
    await expect(
      callerFor(MEMBER).admin.users.update({ user_id: ADMIN, status: "disabled" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lists and searches the directory", async () => {
    const all = await callerFor(ADMIN).admin.users.list();
    expect(all.total).toBe(3);
    const found = await callerFor(ADMIN).admin.users.list({ query: "LOVELACE" });
    expect(found.users.map((u) => u.user_id)).toEqual([MEMBER]);
    expect(found.users[0]).toMatchObject({
      email: "ada@example.com",
      groups: ["staff"],
      role: "member",
      is_admin: false,
      status: "active"
    });
    const admins = await callerFor(ADMIN).admin.users.list({ query: "grace" });
    expect(admins.users[0]?.is_admin).toBe(true);
  });

  it("treats LIKE wildcards in a search as text", async () => {
    const result = await callerFor(ADMIN).admin.users.list({ query: "%" });
    expect(result.total).toBe(0);
  });

  it("promotes a member, who then passes the admin check", async () => {
    const updated = await callerFor(ADMIN).admin.users.update({
      user_id: MEMBER,
      role: "admin"
    });
    expect(updated).toMatchObject({ role: "admin", is_admin: true });
    expect(await callerFor(MEMBER).admin.me()).toEqual({ is_admin: true });
  });

  it("disables an account at once and closes its open sockets", async () => {
    // Warm the cache, as a request from the member would.
    expect(await accountAccess(MEMBER)).toBe("allowed");
    const close = vi.fn();
    trackUserSocket(MEMBER, close);

    const updated = await callerFor(ADMIN).admin.users.update({
      user_id: MEMBER,
      status: "disabled"
    });

    expect(updated.status).toBe("disabled");
    expect(await accountAccess(MEMBER)).toBe("disabled");
    expect(close).toHaveBeenCalledOnce();
  });

  it("does not let a group admin keep admin rights once disabled", async () => {
    await callerFor(ADMIN).admin.users.update({
      user_id: GROUP_ADMIN,
      status: "disabled"
    });
    expect(await callerFor(GROUP_ADMIN).admin.me()).toEqual({ is_admin: false });
  });

  it("refuses to let an admin disable or demote themselves", async () => {
    await callerFor(ADMIN).admin.users.update({ user_id: MEMBER, role: "admin" });
    await expect(
      callerFor(MEMBER).admin.users.update({ user_id: MEMBER, status: "disabled" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      callerFor(MEMBER).admin.users.update({ user_id: MEMBER, role: "member" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect((await getUserAccount(MEMBER))?.status).toBe("active");
  });

  it("answers NOT_FOUND for an id with no account", async () => {
    await expect(
      callerFor(ADMIN).admin.users.update({ user_id: "missing", status: "disabled" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  describe("quotas", () => {
    it("is admin-only", async () => {
      await expect(callerFor(MEMBER).admin.quotas.getDefault()).rejects.toMatchObject({
        code: "FORBIDDEN"
      });
      await expect(
        callerFor(MEMBER).admin.quotas.setUser({
          user_id: MEMBER,
          period: "month",
          token_limit: null,
          media_usd_limit: null
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("sets a default every user inherits until they get their own", async () => {
      const admin = callerFor(ADMIN);
      expect(await admin.admin.quotas.getDefault()).toEqual({
        period: "month",
        token_limit: null,
        media_usd_limit: null,
        configured: false
      });
      await admin.admin.quotas.setDefault({
        period: "month",
        token_limit: 5000,
        media_usd_limit: 10
      });
      await Prediction.create({
        user_id: MEMBER,
        provider: "openai",
        model: "m",
        status: "completed",
        input_tokens: 40,
        output_tokens: 2
      });

      const member = await admin.admin.users.get({ user_id: MEMBER });
      expect(member.quota).toMatchObject({
        period: "month",
        token_limit: 5000,
        media_usd_limit: 10,
        custom: false,
        tokens_used: 42,
        media_usd_used: 0
      });

      const own = await admin.admin.quotas.setUser({
        user_id: MEMBER,
        period: "day",
        token_limit: null,
        media_usd_limit: 1
      });
      expect(own).toMatchObject({ custom: true, period: "day", token_limit: null });

      const back = await admin.admin.quotas.clearUser({ user_id: MEMBER });
      expect(back).toMatchObject({ custom: false, token_limit: 5000 });
    });

    it("answers NOT_FOUND for limits on an id with no account", async () => {
      await expect(
        callerFor(ADMIN).admin.quotas.setUser({
          user_id: "*",
          period: "month",
          token_limit: 1,
          media_usd_limit: null
        })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("permissions", () => {
    it("is admin-only", async () => {
      await expect(
        callerFor(MEMBER).admin.permissions.setUser({
          user_id: MEMBER,
          overrides: { install_packs: true }
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("applies the default and then one user's flags, at once", async () => {
      const admin = callerFor(ADMIN);
      const initial = await admin.admin.permissions.getDefault();
      expect(initial.overrides).toEqual({});
      expect(Object.values(initial.flags).every(Boolean)).toBe(true);

      // Read once so the member's flags are cached before the change.
      expect((await permissionsFor(MEMBER)).install_packs).toBe(true);
      await admin.admin.permissions.setDefault({
        overrides: { install_packs: false, share_public: false }
      });
      expect((await permissionsFor(MEMBER)).install_packs).toBe(false);

      const own = await admin.admin.permissions.setUser({
        user_id: MEMBER,
        overrides: { share_public: true }
      });
      expect(own.overrides).toEqual({ share_public: true });
      expect(own.flags).toMatchObject({ share_public: true, install_packs: false });
      expect((await permissionsFor(MEMBER)).share_public).toBe(true);

      const member = await admin.admin.users.get({ user_id: MEMBER });
      expect(member.permissions).toEqual(own);
    });
  });
});
