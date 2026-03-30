/**
 * Tests for T-SEC-6: UserManager.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { UserManager } from "../src/user-manager.js";

describe("T-SEC-6: UserManager", () => {
  let manager: UserManager;

  beforeEach(() => {
    manager = new UserManager();
  });

  it("create persists a user", () => {
    const user = manager.create({ username: "alice", email: "alice@example.com" });
    expect(user.id).toBeDefined();
    expect(user.username).toBe("alice");
    expect(user.email).toBe("alice@example.com");
  });

  it("create assigns default role", () => {
    const user = manager.create({ username: "bob", email: "bob@example.com" });
    expect(user.role).toBe("user");
  });

  it("create with custom role", () => {
    const user = manager.create({ username: "admin", email: "admin@example.com", role: "admin" });
    expect(user.role).toBe("admin");
  });

  it("findById returns created user", () => {
    const user = manager.create({ username: "alice", email: "alice@example.com" });
    const found = manager.findById(user.id);
    expect(found).toBeDefined();
    expect(found!.username).toBe("alice");
    expect(found!.email).toBe("alice@example.com");
  });

  it("findById returns null for unknown id", () => {
    expect(manager.findById("nonexistent")).toBeNull();
  });

  it("setRole updates user role", () => {
    const user = manager.create({ username: "alice", email: "alice@example.com" });
    manager.setRole(user.id, "admin");
    const found = manager.findById(user.id);
    expect(found!.role).toBe("admin");
  });

  it("setRole throws for unknown user", () => {
    expect(() => manager.setRole("nonexistent", "admin")).toThrow();
  });

  it("multiple users are independent", () => {
    const alice = manager.create({ username: "alice", email: "alice@example.com" });
    const bob = manager.create({ username: "bob", email: "bob@example.com" });
    expect(alice.id).not.toBe(bob.id);
    expect(manager.findById(alice.id)!.username).toBe("alice");
    expect(manager.findById(bob.id)!.username).toBe("bob");
  });

  it("each user gets a unique id", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const user = manager.create({ username: `user${i}`, email: `user${i}@test.com` });
      ids.add(user.id);
    }
    expect(ids.size).toBe(100);
  });
});
