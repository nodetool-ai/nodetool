/**
 * Tests for users-api.ts — admin checks, user CRUD, token reset.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileUserManager } from "@nodetool/auth";
import { handleUsersRequest } from "../src/users-api.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(
  urlPath: string,
  method = "GET",
  userId = "1",
  body?: Record<string, unknown>,
): Request {
  const init: RequestInit = {
    method,
    headers: {
      "x-user-id": userId,
      ...(body ? { "content-type": "application/json" } : {}),
    },
  };
  if (body) init.body = JSON.stringify(body);
  return new Request(`http://localhost${urlPath}`, init);
}

// ---------------------------------------------------------------------------
// Admin check
// ---------------------------------------------------------------------------

describe("admin authorization", () => {
  it("allows user '1' as admin (dev mode)", async () => {
    vi.spyOn(FileUserManager.prototype, "listUsers").mockResolvedValue({});
    const res = await handleUsersRequest(
      makeRequest("/api/users", "GET", "1"),
      "/api/users",
      {},
    );
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
  });

  it("rejects non-admin users", async () => {
    const res = await handleUsersRequest(
      makeRequest("/api/users", "GET", "non-admin-user"),
      "/api/users",
      {},
    );
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
    const body = await res!.json();
    expect(body.detail).toContain("Admin");
  });

  it("respects ADMIN_USER_IDS env var", async () => {
    const original = process.env.ADMIN_USER_IDS;
    process.env.ADMIN_USER_IDS = "admin-a, admin-b";

    vi.spyOn(FileUserManager.prototype, "listUsers").mockResolvedValue({});

    try {
      const res = await handleUsersRequest(
        makeRequest("/api/users", "GET", "admin-b"),
        "/api/users",
        {},
      );
      expect(res!.status).toBe(200);
    } finally {
      if (original !== undefined) {
        process.env.ADMIN_USER_IDS = original;
      } else {
        delete process.env.ADMIN_USER_IDS;
      }
    }
  });
});

// ---------------------------------------------------------------------------
// GET /api/users
// ---------------------------------------------------------------------------

describe("GET /api/users", () => {
  it("lists users", async () => {
    vi.spyOn(FileUserManager.prototype, "listUsers").mockResolvedValue({
      alice: {
        id: "u1",
        role: "user",
        tokenHash: "abcdef1234567890extra",
        createdAt: "2024-01-01",
      },
    });

    const res = await handleUsersRequest(
      makeRequest("/api/users"),
      "/api/users",
      {},
    );
    expect(res!.status).toBe(200);
    const body = await res!.json();
    expect(body.users).toHaveLength(1);
    expect(body.users[0].username).toBe("alice");
    expect(body.users[0].token_hash).toBe("abcdef1234567890...");
  });
});

// ---------------------------------------------------------------------------
// POST /api/users
// ---------------------------------------------------------------------------

describe("POST /api/users", () => {
  it("creates a new user", async () => {
    vi.spyOn(FileUserManager.prototype, "addUser").mockResolvedValue({
      username: "bob",
      userId: "u2",
      role: "user",
      token: "secret-token",
      createdAt: "2024-01-02",
    });

    const res = await handleUsersRequest(
      makeRequest("/api/users", "POST", "1", { username: "bob" }),
      "/api/users",
      {},
    );
    expect(res!.status).toBe(200);
    const body = await res!.json();
    expect(body.username).toBe("bob");
    expect(body.token).toBe("secret-token");
  });

  it("returns 400 when username is missing", async () => {
    const res = await handleUsersRequest(
      makeRequest("/api/users", "POST", "1", {}),
      "/api/users",
      {},
    );
    expect(res!.status).toBe(400);
  });

  it("returns 400 when addUser throws", async () => {
    vi.spyOn(FileUserManager.prototype, "addUser").mockRejectedValue(
      new Error("User already exists"),
    );

    const res = await handleUsersRequest(
      makeRequest("/api/users", "POST", "1", { username: "dup" }),
      "/api/users",
      {},
    );
    expect(res!.status).toBe(400);
    const body = await res!.json();
    expect(body.detail).toContain("already exists");
  });
});

// ---------------------------------------------------------------------------
// GET /api/users/:username
// ---------------------------------------------------------------------------

describe("GET /api/users/:username", () => {
  it("returns a specific user", async () => {
    vi.spyOn(FileUserManager.prototype, "getUser").mockResolvedValue({
      id: "u1",
      role: "admin",
      tokenHash: "hash1234567890abcdef",
      createdAt: "2024-01-01",
    });

    const res = await handleUsersRequest(
      makeRequest("/api/users/alice"),
      "/api/users/alice",
      {},
    );
    expect(res!.status).toBe(200);
    const body = await res!.json();
    expect(body.username).toBe("alice");
    expect(body.role).toBe("admin");
  });

  it("returns 404 for unknown user", async () => {
    vi.spyOn(FileUserManager.prototype, "getUser").mockResolvedValue(null);

    const res = await handleUsersRequest(
      makeRequest("/api/users/unknown"),
      "/api/users/unknown",
      {},
    );
    expect(res!.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/users/:username
// ---------------------------------------------------------------------------

describe("DELETE /api/users/:username", () => {
  it("removes a user", async () => {
    vi.spyOn(FileUserManager.prototype, "removeUser").mockResolvedValue(
      undefined,
    );

    const res = await handleUsersRequest(
      makeRequest("/api/users/alice", "DELETE"),
      "/api/users/alice",
      {},
    );
    expect(res!.status).toBe(200);
    const body = await res!.json();
    expect(body.message).toContain("alice");
  });

  it("returns 404 when removeUser throws", async () => {
    vi.spyOn(FileUserManager.prototype, "removeUser").mockRejectedValue(
      new Error("Not found"),
    );

    const res = await handleUsersRequest(
      makeRequest("/api/users/ghost", "DELETE"),
      "/api/users/ghost",
      {},
    );
    expect(res!.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /api/users/reset-token
// ---------------------------------------------------------------------------

describe("POST /api/users/reset-token", () => {
  it("resets a user token", async () => {
    vi.spyOn(FileUserManager.prototype, "resetToken").mockResolvedValue({
      username: "alice",
      userId: "u1",
      role: "user",
      token: "new-token-value",
      createdAt: "2024-01-01",
    });

    const res = await handleUsersRequest(
      makeRequest("/api/users/reset-token", "POST", "1", {
        username: "alice",
      }),
      "/api/users/reset-token",
      {},
    );
    expect(res!.status).toBe(200);
    const body = await res!.json();
    expect(body.token).toBe("new-token-value");
  });

  it("returns 405 for GET on reset-token", async () => {
    const res = await handleUsersRequest(
      makeRequest("/api/users/reset-token", "GET"),
      "/api/users/reset-token",
      {},
    );
    expect(res!.status).toBe(405);
  });

  it("returns 400 when username missing for reset", async () => {
    const res = await handleUsersRequest(
      makeRequest("/api/users/reset-token", "POST", "1", {}),
      "/api/users/reset-token",
      {},
    );
    expect(res!.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Method not allowed
// ---------------------------------------------------------------------------

describe("method not allowed", () => {
  it("returns 405 for PATCH on /api/users", async () => {
    const res = await handleUsersRequest(
      makeRequest("/api/users", "PATCH"),
      "/api/users",
      {},
    );
    expect(res!.status).toBe(405);
  });

  it("returns 405 for PUT on /api/users/:username", async () => {
    const res = await handleUsersRequest(
      makeRequest("/api/users/alice", "PUT"),
      "/api/users/alice",
      {},
    );
    expect(res!.status).toBe(405);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
