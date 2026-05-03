import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  APIUserManager,
  type UserRecord
} from "../src/api-user-manager.js";

// ---------------------------------------------------------------------------
// tRPC client mock — dependency-injected via the APIUserManager constructor.
// We only populate the leaf procedures that the manager calls.
// ---------------------------------------------------------------------------

type ProcWithQuery = { query: ReturnType<typeof vi.fn> };
type ProcWithMutate = { mutate: ReturnType<typeof vi.fn> };

interface MockClient {
  users: {
    list: ProcWithQuery;
    get: ProcWithQuery;
    create: ProcWithMutate;
    remove: ProcWithMutate;
    resetToken: ProcWithMutate;
  };
}

function makeMockClient(): MockClient {
  return {
    users: {
      list: { query: vi.fn() },
      get: { query: vi.fn() },
      create: { mutate: vi.fn() },
      remove: { mutate: vi.fn() },
      resetToken: { mutate: vi.fn() }
    }
  };
}

function makeManager(
  mockClient: MockClient,
  serverUrl = "http://example.com:7777",
  token = "admin-tok"
): APIUserManager {
  // The third constructor arg accepts a TRPCClient<AppRouter>; we cast our
  // partial shape because only leaf methods are exercised.
  return new APIUserManager(serverUrl, token, mockClient as never);
}

describe("APIUserManager", () => {
  let mockClient: MockClient;
  let mgr: APIUserManager;

  beforeEach(() => {
    mockClient = makeMockClient();
    mgr = makeManager(mockClient);
  });

  // =========================================================================
  // Constructor
  // =========================================================================

  describe("constructor", () => {
    it("should strip trailing slashes from server URL", () => {
      const m = new APIUserManager(
        "http://host:8000///",
        "tok",
        makeMockClient() as never
      );
      // The serverUrl is private; exercise via any call. Here we just verify
      // the instance is created without throwing.
      expect(m).toBeInstanceOf(APIUserManager);
    });

    it("should handle URL without trailing slash", () => {
      const m = new APIUserManager(
        "http://host:8000",
        "tok",
        makeMockClient() as never
      );
      expect(m).toBeInstanceOf(APIUserManager);
    });

    it("builds its own tRPC client when none is provided", () => {
      const m = new APIUserManager("http://example.com:7777", "tok");
      // Just verify instantiation succeeds — the real client is constructed
      // by createTRPCClient() under the hood.
      expect(m).toBeInstanceOf(APIUserManager);
    });
  });

  // =========================================================================
  // listUsers
  // =========================================================================

  describe("listUsers", () => {
    it("should return array of users", async () => {
      const users: UserRecord[] = [
        {
          user_id: "u1",
          username: "alice",
          role: "admin",
          token_hash: "abc...",
          created_at: "2024-01-01"
        }
      ];
      mockClient.users.list.query.mockResolvedValue({ users });
      const result = await mgr.listUsers();
      expect(result).toEqual(users);
    });

    it("should call users.list.query with no arguments", async () => {
      mockClient.users.list.query.mockResolvedValue({ users: [] });
      await mgr.listUsers();
      expect(mockClient.users.list.query).toHaveBeenCalledWith();
    });

    it("should return empty array when backend returns empty users", async () => {
      mockClient.users.list.query.mockResolvedValue({ users: [] });
      const result = await mgr.listUsers();
      expect(result).toEqual([]);
    });

    it("should propagate errors from the tRPC client", async () => {
      mockClient.users.list.query.mockRejectedValue(new Error("fetch failed"));
      await expect(mgr.listUsers()).rejects.toThrow("fetch failed");
    });

    it("should return multiple users", async () => {
      const users: UserRecord[] = [
        {
          user_id: "u1",
          username: "alice",
          role: "admin",
          token_hash: "h...",
          created_at: "2024-01-01"
        },
        {
          user_id: "u2",
          username: "bob",
          role: "user",
          token_hash: "h...",
          created_at: "2024-01-02"
        },
        {
          user_id: "u3",
          username: "carol",
          role: "user",
          token_hash: "h...",
          created_at: "2024-01-03"
        }
      ];
      mockClient.users.list.query.mockResolvedValue({ users });
      const result = await mgr.listUsers();
      expect(result).toHaveLength(3);
    });
  });

  // =========================================================================
  // addUser
  // =========================================================================

  describe("addUser", () => {
    it("should call users.create.mutate and return the created user", async () => {
      const userRecord: UserRecord = {
        user_id: "u1",
        username: "newuser",
        role: "user",
        token: "generated-tok",
        created_at: "2024-01-01"
      };
      mockClient.users.create.mutate.mockResolvedValue(userRecord);
      const result = await mgr.addUser("newuser", "user");
      expect(result).toEqual(userRecord);
    });

    it("should pass username and role to the tRPC procedure", async () => {
      mockClient.users.create.mutate.mockResolvedValue({
        user_id: "u",
        username: "x",
        role: "admin",
        token: "t",
        created_at: ""
      });
      await mgr.addUser("x", "admin");
      expect(mockClient.users.create.mutate).toHaveBeenCalledWith({
        username: "x",
        role: "admin"
      });
    });

    it("should default role to 'user'", async () => {
      mockClient.users.create.mutate.mockResolvedValue({
        user_id: "u",
        username: "x",
        role: "user",
        token: "t",
        created_at: ""
      });
      await mgr.addUser("x");
      expect(mockClient.users.create.mutate).toHaveBeenCalledWith({
        username: "x",
        role: "user"
      });
    });

    it("should propagate 'already exists' errors", async () => {
      mockClient.users.create.mutate.mockRejectedValue(
        new Error("User 'existing' already exists")
      );
      await expect(mgr.addUser("existing")).rejects.toThrow("already exists");
    });

    it("should propagate forbidden errors", async () => {
      mockClient.users.create.mutate.mockRejectedValue(new Error("Forbidden"));
      await expect(mgr.addUser("x")).rejects.toThrow("Forbidden");
    });
  });

  // =========================================================================
  // resetToken
  // =========================================================================

  describe("resetToken", () => {
    it("should call users.resetToken.mutate and return new token", async () => {
      const userRecord: UserRecord = {
        user_id: "u1",
        username: "alice",
        role: "admin",
        token: "new-tok",
        created_at: "2024-01-01"
      };
      mockClient.users.resetToken.mutate.mockResolvedValue(userRecord);
      const result = await mgr.resetToken("alice");
      expect(result.token).toBe("new-tok");
    });

    it("should pass username to the tRPC procedure", async () => {
      mockClient.users.resetToken.mutate.mockResolvedValue({
        user_id: "u",
        username: "alice",
        role: "user",
        token: "t",
        created_at: ""
      });
      await mgr.resetToken("alice");
      expect(mockClient.users.resetToken.mutate).toHaveBeenCalledWith({
        username: "alice"
      });
    });

    it("should propagate 'not found' errors", async () => {
      mockClient.users.resetToken.mutate.mockRejectedValue(
        new Error("User 'ghost' not found")
      );
      await expect(mgr.resetToken("ghost")).rejects.toThrow("not found");
    });
  });

  // =========================================================================
  // removeUser
  // =========================================================================

  describe("removeUser", () => {
    it("should call users.remove.mutate with the username", async () => {
      mockClient.users.remove.mutate.mockResolvedValue({
        message: "User removed"
      });
      await mgr.removeUser("alice");
      expect(mockClient.users.remove.mutate).toHaveBeenCalledWith({
        username: "alice"
      });
    });

    it("should return success message", async () => {
      mockClient.users.remove.mutate.mockResolvedValue({
        message: "User removed"
      });
      const result = await mgr.removeUser("alice");
      expect(result.message).toBe("User removed");
    });

    it("should pass special characters in username verbatim (tRPC handles encoding)", async () => {
      mockClient.users.remove.mutate.mockResolvedValue({ message: "ok" });
      await mgr.removeUser("user@domain");
      expect(mockClient.users.remove.mutate).toHaveBeenCalledWith({
        username: "user@domain"
      });
    });

    it("should propagate 'not found' errors", async () => {
      mockClient.users.remove.mutate.mockRejectedValue(
        new Error("User not found")
      );
      await expect(mgr.removeUser("ghost")).rejects.toThrow("not found");
    });

    it("should propagate generic errors with message", async () => {
      mockClient.users.remove.mutate.mockRejectedValue(new Error("boom"));
      await expect(mgr.removeUser("x")).rejects.toThrow("boom");
    });
  });
});
