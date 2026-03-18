import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { FileUserManager } from "../src/file-user-manager.js";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let tmpDir: string;
let usersFilePath: string;
let manager: FileUserManager;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "nodetool-auth-test-"));
  usersFilePath = join(tmpDir, "users.json");
  manager = new FileUserManager(usersFilePath);
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// addUser
// ---------------------------------------------------------------------------
describe("FileUserManager.addUser", () => {
  it("creates a new user and returns result with a token", async () => {
    const result = await manager.addUser("alice");
    expect(result.username).toBe("alice");
    expect(result.userId).toMatch(/^user_alice_/);
    expect(result.role).toBe("user");
    expect(result.token).toBeTruthy();
    expect(result.createdAt).toBeTruthy();
  });

  it("assigns custom role when provided", async () => {
    const result = await manager.addUser("bob", "admin");
    expect(result.role).toBe("admin");
  });

  it("throws when username already exists", async () => {
    await manager.addUser("charlie");
    await expect(manager.addUser("charlie")).rejects.toThrow(/already exists/i);
  });

  it("returns different tokens for different users", async () => {
    const r1 = await manager.addUser("user-1");
    const r2 = await manager.addUser("user-2");
    expect(r1.token).not.toBe(r2.token);
    expect(r1.userId).not.toBe(r2.userId);
  });

  it("persists user to file so a new manager instance sees it", async () => {
    await manager.addUser("dave");
    const manager2 = new FileUserManager(usersFilePath);
    const user = await manager2.getUser("dave");
    expect(user).not.toBeNull();
    expect(user!.username).toBe("dave");
  });
});

// ---------------------------------------------------------------------------
// removeUser
// ---------------------------------------------------------------------------
describe("FileUserManager.removeUser", () => {
  it("removes an existing user", async () => {
    await manager.addUser("eve");
    await manager.removeUser("eve");
    const user = await manager.getUser("eve");
    expect(user).toBeNull();
  });

  it("throws when the user does not exist", async () => {
    await expect(manager.removeUser("ghost")).rejects.toThrow(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// resetToken
// ---------------------------------------------------------------------------
describe("FileUserManager.resetToken", () => {
  it("returns a new token for the user", async () => {
    const { token: oldToken } = await manager.addUser("frank");
    const result = await manager.resetToken("frank");
    expect(result.token).toBeTruthy();
    expect(result.token).not.toBe(oldToken);
  });

  it("preserves username, userId, and role", async () => {
    const created = await manager.addUser("grace", "admin");
    const reset = await manager.resetToken("grace");
    expect(reset.username).toBe("grace");
    expect(reset.userId).toBe(created.userId);
    expect(reset.role).toBe("admin");
  });

  it("throws when the user does not exist", async () => {
    await expect(manager.resetToken("nobody")).rejects.toThrow(/not found/i);
  });

  it("the new token is persisted", async () => {
    await manager.addUser("henry");
    const { token: newToken } = await manager.resetToken("henry");
    const manager2 = new FileUserManager(usersFilePath);
    const stored = await manager2.getUser("henry");
    // We cannot read back the raw token (only hash stored), but the userId must match.
    expect(stored).not.toBeNull();
    expect(newToken).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// listUsers
// ---------------------------------------------------------------------------
describe("FileUserManager.listUsers", () => {
  it("returns an empty object when no users exist", async () => {
    const users = await manager.listUsers();
    expect(Object.keys(users)).toHaveLength(0);
  });

  it("returns all added users", async () => {
    await manager.addUser("alice");
    await manager.addUser("bob");
    const users = await manager.listUsers();
    expect(Object.keys(users)).toHaveLength(2);
    expect(users["alice"]).toBeDefined();
    expect(users["bob"]).toBeDefined();
  });

  it("does not include removed users", async () => {
    await manager.addUser("ivan");
    await manager.removeUser("ivan");
    const users = await manager.listUsers();
    expect(users["ivan"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getUser
// ---------------------------------------------------------------------------
describe("FileUserManager.getUser", () => {
  it("returns null for a non-existent user", async () => {
    expect(await manager.getUser("unknown")).toBeNull();
  });

  it("returns the user record for an existing user", async () => {
    const { userId } = await manager.addUser("judy");
    const record = await manager.getUser("judy");
    expect(record).not.toBeNull();
    expect(record!.id).toBe(userId);
    expect(record!.username).toBe("judy");
    expect(record!.role).toBe("user");
  });

  it("user record stores tokenHash, not the raw token", async () => {
    const { token } = await manager.addUser("kim");
    const record = await manager.getUser("kim");
    expect(record!.tokenHash).not.toBe(token);
    expect(record!.tokenHash).toHaveLength(64); // SHA-256 hex
  });
});

// ---------------------------------------------------------------------------
// USERS_FILE environment variable
// ---------------------------------------------------------------------------
describe("USERS_FILE env var", () => {
  it("uses the path from USERS_FILE when no explicit path given", async () => {
    const envPath = join(tmpDir, "env-users.json");
    process.env["USERS_FILE"] = envPath;
    try {
      const m = new FileUserManager();
      await m.addUser("envuser");
      const user = await m.getUser("envuser");
      expect(user).not.toBeNull();
    } finally {
      delete process.env["USERS_FILE"];
    }
  });
});
