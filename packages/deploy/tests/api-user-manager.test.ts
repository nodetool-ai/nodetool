import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  APIUserManager,
  type UserRecord,
  type UserListResponse,
  type RemoveUserResponse
} from "../src/api-user-manager.js";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    headers: new Headers(),
    redirected: false,
    type: "basic",
    url: "",
    clone: () => jsonResponse(data, status) as Response,
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData())
  } as Response;
}

function errorResponse(status: number, body: string): Response {
  return {
    ok: false,
    status,
    statusText: "Error",
    json: () => Promise.reject(new Error("not json")),
    text: () => Promise.resolve(body),
    headers: new Headers(),
    redirected: false,
    type: "basic",
    url: "",
    clone: () => errorResponse(status, body) as Response,
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData())
  } as Response;
}

describe("APIUserManager", () => {
  let mgr: APIUserManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mgr = new APIUserManager("http://example.com:7777", "admin-tok");
  });

  // =========================================================================
  // Constructor
  // =========================================================================

  describe("constructor", () => {
    it("should strip trailing slashes from server URL", () => {
      const m = new APIUserManager("http://host:8000///", "tok");
      // We verify by checking the URL in a request
      mockFetch.mockResolvedValue(jsonResponse({ users: [] }));
      m.listUsers();
      expect(mockFetch).toHaveBeenCalledWith(
        "http://host:8000/api/users/",
        expect.any(Object)
      );
    });

    it("should handle URL without trailing slash", () => {
      const m = new APIUserManager("http://host:8000", "tok");
      mockFetch.mockResolvedValue(jsonResponse({ users: [] }));
      m.listUsers();
      expect(mockFetch).toHaveBeenCalledWith(
        "http://host:8000/api/users/",
        expect.any(Object)
      );
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
          created_at: "2024-01-01"
        }
      ];
      mockFetch.mockResolvedValue(jsonResponse({ users }));
      const result = await mgr.listUsers();
      expect(result).toEqual(users);
    });

    it("should send GET request to /api/users/", async () => {
      mockFetch.mockResolvedValue(jsonResponse({ users: [] }));
      await mgr.listUsers();
      expect(mockFetch).toHaveBeenCalledWith(
        "http://example.com:7777/api/users/",
        expect.objectContaining({ method: "GET" })
      );
    });

    it("should include Bearer authorization header", async () => {
      mockFetch.mockResolvedValue(jsonResponse({ users: [] }));
      await mgr.listUsers();
      const init = mockFetch.mock.calls[0]![1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers["Authorization"]).toBe("Bearer admin-tok");
    });

    it("should include Content-Type header", async () => {
      mockFetch.mockResolvedValue(jsonResponse({ users: [] }));
      await mgr.listUsers();
      const init = mockFetch.mock.calls[0]![1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers["Content-Type"]).toBe("application/json");
    });

    it("should return empty array when users is undefined", async () => {
      mockFetch.mockResolvedValue(jsonResponse({}));
      const result = await mgr.listUsers();
      expect(result).toEqual([]);
    });

    it("should throw on HTTP error", async () => {
      mockFetch.mockResolvedValue(errorResponse(500, "Internal Server Error"));
      await expect(mgr.listUsers()).rejects.toThrow("500");
    });

    it("should throw on network error", async () => {
      mockFetch.mockRejectedValue(new Error("fetch failed"));
      await expect(mgr.listUsers()).rejects.toThrow("fetch failed");
    });

    it("should return multiple users", async () => {
      const users: UserRecord[] = [
        {
          user_id: "u1",
          username: "alice",
          role: "admin",
          created_at: "2024-01-01"
        },
        {
          user_id: "u2",
          username: "bob",
          role: "user",
          created_at: "2024-01-02"
        },
        {
          user_id: "u3",
          username: "carol",
          role: "user",
          created_at: "2024-01-03"
        }
      ];
      mockFetch.mockResolvedValue(jsonResponse({ users }));
      const result = await mgr.listUsers();
      expect(result).toHaveLength(3);
    });
  });

  // =========================================================================
  // addUser
  // =========================================================================

  describe("addUser", () => {
    it("should send POST to /api/users/ with username and role", async () => {
      const userRecord: UserRecord = {
        user_id: "u1",
        username: "newuser",
        role: "user",
        token: "generated-tok",
        created_at: "2024-01-01"
      };
      mockFetch.mockResolvedValue(jsonResponse(userRecord));
      const result = await mgr.addUser("newuser", "user");
      expect(result).toEqual(userRecord);
    });

    it("should send JSON body with username and role", async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({
          user_id: "u",
          username: "x",
          role: "admin",
          created_at: ""
        })
      );
      await mgr.addUser("x", "admin");
      const init = mockFetch.mock.calls[0]![1] as RequestInit;
      expect(JSON.parse(init.body as string)).toEqual({
        username: "x",
        role: "admin"
      });
    });

    it("should use POST method", async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({
          user_id: "u",
          username: "x",
          role: "user",
          created_at: ""
        })
      );
      await mgr.addUser("x");
      const init = mockFetch.mock.calls[0]![1] as RequestInit;
      expect(init.method).toBe("POST");
    });

    it("should default role to 'user'", async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({
          user_id: "u",
          username: "x",
          role: "user",
          created_at: ""
        })
      );
      await mgr.addUser("x");
      const init = mockFetch.mock.calls[0]![1] as RequestInit;
      expect(JSON.parse(init.body as string).role).toBe("user");
    });

    it("should throw on 409 conflict", async () => {
      mockFetch.mockResolvedValue(errorResponse(409, "User already exists"));
      await expect(mgr.addUser("existing")).rejects.toThrow("409");
    });

    it("should throw on 403 forbidden", async () => {
      mockFetch.mockResolvedValue(errorResponse(403, "Forbidden"));
      await expect(mgr.addUser("x")).rejects.toThrow("403");
    });
  });

  // =========================================================================
  // resetToken
  // =========================================================================

  describe("resetToken", () => {
    it("should send POST to /api/users/reset-token", async () => {
      const userRecord: UserRecord = {
        user_id: "u1",
        username: "alice",
        role: "admin",
        token: "new-tok",
        created_at: "2024-01-01"
      };
      mockFetch.mockResolvedValue(jsonResponse(userRecord));
      const result = await mgr.resetToken("alice");
      expect(result.token).toBe("new-tok");
    });

    it("should send username in body", async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({
          user_id: "u",
          username: "alice",
          role: "user",
          created_at: ""
        })
      );
      await mgr.resetToken("alice");
      const init = mockFetch.mock.calls[0]![1] as RequestInit;
      expect(JSON.parse(init.body as string)).toEqual({ username: "alice" });
    });

    it("should throw on 404 not found", async () => {
      mockFetch.mockResolvedValue(errorResponse(404, "User not found"));
      await expect(mgr.resetToken("ghost")).rejects.toThrow("404");
    });

    it("should use POST method", async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({
          user_id: "u",
          username: "x",
          role: "user",
          created_at: ""
        })
      );
      await mgr.resetToken("x");
      const init = mockFetch.mock.calls[0]![1] as RequestInit;
      expect(init.method).toBe("POST");
    });
  });

  // =========================================================================
  // removeUser
  // =========================================================================

  describe("removeUser", () => {
    it("should send DELETE to /api/users/<username>", async () => {
      mockFetch.mockResolvedValue(jsonResponse({ message: "User removed" }));
      await mgr.removeUser("alice");
      expect(mockFetch).toHaveBeenCalledWith(
        "http://example.com:7777/api/users/alice",
        expect.objectContaining({ method: "DELETE" })
      );
    });

    it("should return success message", async () => {
      mockFetch.mockResolvedValue(jsonResponse({ message: "User removed" }));
      const result = await mgr.removeUser("alice");
      expect(result.message).toBe("User removed");
    });

    it("should URL-encode special characters in username", async () => {
      mockFetch.mockResolvedValue(jsonResponse({ message: "ok" }));
      await mgr.removeUser("user@domain");
      expect(mockFetch).toHaveBeenCalledWith(
        "http://example.com:7777/api/users/user%40domain",
        expect.any(Object)
      );
    });

    it("should throw on 404 not found", async () => {
      mockFetch.mockResolvedValue(errorResponse(404, "Not found"));
      await expect(mgr.removeUser("ghost")).rejects.toThrow("404");
    });

    it("should use DELETE method", async () => {
      mockFetch.mockResolvedValue(jsonResponse({ message: "ok" }));
      await mgr.removeUser("x");
      const init = mockFetch.mock.calls[0]![1] as RequestInit;
      expect(init.method).toBe("DELETE");
    });

    it("should not send body for DELETE", async () => {
      mockFetch.mockResolvedValue(jsonResponse({ message: "ok" }));
      await mgr.removeUser("x");
      const init = mockFetch.mock.calls[0]![1] as RequestInit;
      expect(init.body).toBeUndefined();
    });

    it("should throw with error text in message", async () => {
      mockFetch.mockResolvedValue(errorResponse(500, "boom"));
      await expect(mgr.removeUser("x")).rejects.toThrow("boom");
    });
  });
});
