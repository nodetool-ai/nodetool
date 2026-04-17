import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { FileUserManager } from "@nodetool/auth";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

const createCaller = createCallerFactory(appRouter);

function makeCtx(overrides: Partial<Context> = {}): Context {
  return {
    // default to admin dev user "1" so the admin gate opens
    userId: "1",
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false,
    ...overrides
  };
}

describe("users router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ADMIN_USER_IDS;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── admin gate ──────────────────────────────────────────────────
  describe("admin authorization", () => {
    it("allows user '1' as admin in dev mode", async () => {
      vi.spyOn(FileUserManager.prototype, "listUsers").mockResolvedValue({});
      const caller = createCaller(makeCtx({ userId: "1" }));
      await expect(caller.users.list()).resolves.toEqual({ users: [] });
    });

    it("rejects non-admin callers with FORBIDDEN", async () => {
      const caller = createCaller(makeCtx({ userId: "non-admin" }));
      await expect(caller.users.list()).rejects.toMatchObject({
        code: "FORBIDDEN"
      });
    });

    it("allows users listed in ADMIN_USER_IDS env var", async () => {
      process.env.ADMIN_USER_IDS = "admin1,admin2";
      vi.spyOn(FileUserManager.prototype, "listUsers").mockResolvedValue({});
      const caller = createCaller(makeCtx({ userId: "admin2" }));
      await expect(caller.users.list()).resolves.toEqual({ users: [] });
    });

    it("rejects unauthenticated callers with UNAUTHORIZED (not FORBIDDEN)", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(caller.users.list()).rejects.toMatchObject({
        code: "UNAUTHORIZED"
      });
    });
  });

  // ── list ────────────────────────────────────────────────────────
  describe("list", () => {
    it("returns users in the response array with masked token_hash", async () => {
      vi.spyOn(FileUserManager.prototype, "listUsers").mockResolvedValue({
        alice: {
          id: "u1",
          username: "alice",
          role: "admin",
          tokenHash: "0123456789abcdef0123456789abcdef",
          createdAt: "2026-01-01T00:00:00Z"
        },
        bob: {
          id: "u2",
          username: "bob",
          role: "user",
          tokenHash: "fedcba9876543210fedcba9876543210",
          createdAt: "2026-01-02T00:00:00Z"
        }
      });

      const caller = createCaller(makeCtx());
      const result = await caller.users.list();
      expect(result.users).toHaveLength(2);
      const alice = result.users.find((u) => u.username === "alice");
      expect(alice).toMatchObject({
        username: "alice",
        user_id: "u1",
        role: "admin",
        created_at: "2026-01-01T00:00:00Z"
      });
      // token_hash is first 16 chars + "..."
      expect(alice?.token_hash).toBe("0123456789abcdef...");
    });
  });

  // ── get ─────────────────────────────────────────────────────────
  describe("get", () => {
    it("returns a single user with masked token_hash", async () => {
      vi.spyOn(FileUserManager.prototype, "getUser").mockResolvedValue({
        id: "u1",
        username: "alice",
        role: "admin",
        tokenHash: "abcdef0123456789abcdef0123456789",
        createdAt: "2026-01-01T00:00:00Z"
      });

      const caller = createCaller(makeCtx());
      const result = await caller.users.get({ username: "alice" });
      expect(result.user_id).toBe("u1");
      expect(result.token_hash).toBe("abcdef0123456789...");
    });

    it("throws NOT_FOUND when user does not exist", async () => {
      vi.spyOn(FileUserManager.prototype, "getUser").mockResolvedValue(null);
      const caller = createCaller(makeCtx());
      await expect(
        caller.users.get({ username: "ghost" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  // ── create ──────────────────────────────────────────────────────
  describe("create", () => {
    it("creates a user and returns plaintext token", async () => {
      const addUser = vi
        .spyOn(FileUserManager.prototype, "addUser")
        .mockResolvedValue({
          username: "newbie",
          userId: "u99",
          role: "user",
          token: "plaintext-secret-token",
          createdAt: "2026-04-17T00:00:00Z"
        });

      const caller = createCaller(makeCtx());
      const result = await caller.users.create({
        username: "newbie",
        role: "user"
      });

      expect(addUser).toHaveBeenCalledWith("newbie", "user");
      expect(result).toEqual({
        username: "newbie",
        user_id: "u99",
        role: "user",
        token: "plaintext-secret-token",
        created_at: "2026-04-17T00:00:00Z"
      });
    });

    it("defaults role to 'user'", async () => {
      const addUser = vi
        .spyOn(FileUserManager.prototype, "addUser")
        .mockResolvedValue({
          username: "x",
          userId: "u",
          role: "user",
          token: "t",
          createdAt: "c"
        });

      const caller = createCaller(makeCtx());
      await caller.users.create({ username: "x" });
      expect(addUser).toHaveBeenCalledWith("x", "user");
    });

    it("accepts admin role", async () => {
      const addUser = vi
        .spyOn(FileUserManager.prototype, "addUser")
        .mockResolvedValue({
          username: "root",
          userId: "u",
          role: "admin",
          token: "t",
          createdAt: "c"
        });

      const caller = createCaller(makeCtx());
      await caller.users.create({ username: "root", role: "admin" });
      expect(addUser).toHaveBeenCalledWith("root", "admin");
    });

    it("throws BAD_REQUEST when FileUserManager.addUser rejects (already exists)", async () => {
      vi.spyOn(FileUserManager.prototype, "addUser").mockRejectedValue(
        new Error("User 'existing' already exists")
      );

      const caller = createCaller(makeCtx());
      await expect(
        caller.users.create({ username: "existing" })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });
  });

  // ── remove ──────────────────────────────────────────────────────
  describe("remove", () => {
    it("removes a user and returns confirmation", async () => {
      const removeUser = vi
        .spyOn(FileUserManager.prototype, "removeUser")
        .mockResolvedValue(undefined);

      const caller = createCaller(makeCtx());
      const result = await caller.users.remove({ username: "alice" });
      expect(removeUser).toHaveBeenCalledWith("alice");
      expect(result.message).toContain("alice");
      expect(result.message).toMatch(/removed/i);
    });

    it("throws NOT_FOUND when user does not exist", async () => {
      vi.spyOn(FileUserManager.prototype, "removeUser").mockRejectedValue(
        new Error("User 'ghost' not found")
      );

      const caller = createCaller(makeCtx());
      await expect(
        caller.users.remove({ username: "ghost" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  // ── resetToken ──────────────────────────────────────────────────
  describe("resetToken", () => {
    it("resets the token and returns plaintext", async () => {
      const resetToken = vi
        .spyOn(FileUserManager.prototype, "resetToken")
        .mockResolvedValue({
          username: "alice",
          userId: "u1",
          role: "admin",
          token: "new-plaintext-token",
          createdAt: "2026-04-17T00:00:00Z"
        });

      const caller = createCaller(makeCtx());
      const result = await caller.users.resetToken({ username: "alice" });
      expect(resetToken).toHaveBeenCalledWith("alice");
      expect(result).toEqual({
        username: "alice",
        user_id: "u1",
        role: "admin",
        token: "new-plaintext-token",
        created_at: "2026-04-17T00:00:00Z"
      });
    });

    it("throws NOT_FOUND when user does not exist", async () => {
      vi.spyOn(FileUserManager.prototype, "resetToken").mockRejectedValue(
        new Error("User 'ghost' not found")
      );

      const caller = createCaller(makeCtx());
      await expect(
        caller.users.resetToken({ username: "ghost" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });
});
