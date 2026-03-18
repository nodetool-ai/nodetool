/**
 * Tests for FileUserManager — file-based persistent user management.
 */
import { describe, it, expect, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FileUserManager } from "../src/file-user-manager.js";

let tempDir: string;
let usersFile: string;

async function freshManager(): Promise<FileUserManager> {
  tempDir = await mkdtemp(join(tmpdir(), "auth-test-"));
  usersFile = join(tempDir, "users.json");
  return new FileUserManager(usersFile);
}

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// addUser
// ---------------------------------------------------------------------------
describe("FileUserManager.addUser", () => {
  it("creates a user and returns a token", async () => {
    const mgr = await freshManager();
    const result = await mgr.addUser("alice");
    expect(result.username).toBe("alice");
    expect(result.userId).toContain("user_alice_");
    expect(result.role).toBe("user");
    expect(result.token).toBeDefined();
    expect(result.token.length).toBeGreaterThan(0);
    expect(result.createdAt).toBeDefined();
  });

  it("creates a user with a custom role", async () => {
    const mgr = await freshManager();
    const result = await mgr.addUser("admin", "admin");
    expect(result.role).toBe("admin");
  });

  it("throws for duplicate username", async () => {
    const mgr = await freshManager();
    await mgr.addUser("alice");
    await expect(mgr.addUser("alice")).rejects.toThrow(
      "User 'alice' already exists"
    );
  });
});

// ---------------------------------------------------------------------------
// removeUser
// ---------------------------------------------------------------------------
describe("FileUserManager.removeUser", () => {
  it("removes a user", async () => {
    const mgr = await freshManager();
    await mgr.addUser("alice");
    await mgr.removeUser("alice");
    const user = await mgr.getUser("alice");
    expect(user).toBeNull();
  });

  it("throws for non-existent user", async () => {
    const mgr = await freshManager();
    await expect(mgr.removeUser("ghost")).rejects.toThrow(
      "User 'ghost' not found"
    );
  });
});

// ---------------------------------------------------------------------------
// resetToken
// ---------------------------------------------------------------------------
describe("FileUserManager.resetToken", () => {
  it("generates a new token for an existing user", async () => {
    const mgr = await freshManager();
    const original = await mgr.addUser("alice");
    const reset = await mgr.resetToken("alice");
    expect(reset.token).not.toBe(original.token);
    expect(reset.userId).toBe(original.userId);
    expect(reset.username).toBe("alice");
    expect(reset.role).toBe("user");
  });

  it("throws for non-existent user", async () => {
    const mgr = await freshManager();
    await expect(mgr.resetToken("ghost")).rejects.toThrow(
      "User 'ghost' not found"
    );
  });
});

// ---------------------------------------------------------------------------
// listUsers
// ---------------------------------------------------------------------------
describe("FileUserManager.listUsers", () => {
  it("returns all users", async () => {
    const mgr = await freshManager();
    await mgr.addUser("alice");
    await mgr.addUser("bob", "admin");
    const users = await mgr.listUsers();
    expect(Object.keys(users)).toHaveLength(2);
    expect(users["alice"]).toBeDefined();
    expect(users["bob"]).toBeDefined();
    expect(users["alice"].role).toBe("user");
    expect(users["bob"].role).toBe("admin");
  });

  it("returns empty object when no users exist", async () => {
    const mgr = await freshManager();
    const users = await mgr.listUsers();
    expect(users).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// getUser
// ---------------------------------------------------------------------------
describe("FileUserManager.getUser", () => {
  it("returns a specific user", async () => {
    const mgr = await freshManager();
    await mgr.addUser("alice");
    const user = await mgr.getUser("alice");
    expect(user).not.toBeNull();
    expect(user!.username).toBe("alice");
    expect(user!.id).toContain("user_alice_");
    expect(user!.tokenHash).toBeDefined();
    expect(user!.createdAt).toBeDefined();
  });

  it("returns null for non-existent user", async () => {
    const mgr = await freshManager();
    const user = await mgr.getUser("ghost");
    expect(user).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// load handles missing file gracefully
// ---------------------------------------------------------------------------
describe("FileUserManager.load (missing file)", () => {
  it("handles missing file gracefully and returns empty", async () => {
    const mgr = await freshManager();
    // No addUser call — file does not exist yet
    const users = await mgr.listUsers();
    expect(users).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Token hashing
// ---------------------------------------------------------------------------
describe("FileUserManager token hashing", () => {
  it("stores a sha256 hash of the token", async () => {
    const mgr = await freshManager();
    const result = await mgr.addUser("alice");
    const expectedHash = createHash("sha256")
      .update(result.token)
      .digest("hex");
    const user = await mgr.getUser("alice");
    expect(user!.tokenHash).toBe(expectedHash);
  });

  it("resetToken updates the stored hash", async () => {
    const mgr = await freshManager();
    await mgr.addUser("alice");
    const reset = await mgr.resetToken("alice");
    const expectedHash = createHash("sha256")
      .update(reset.token)
      .digest("hex");
    const user = await mgr.getUser("alice");
    expect(user!.tokenHash).toBe(expectedHash);
  });
});
