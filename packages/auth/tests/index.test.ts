/**
 * Tests for the package's public API surface (index.ts).
 *
 * Verifies that every named export is accessible and that small helpers
 * such as `isAdmin` behave correctly.
 */
import { describe, it, expect } from "vitest";
import {
  TokenType,
  AuthProvider,
  LocalAuthProvider,
  StaticTokenProvider,
  MultiUserAuthProvider,
  SupabaseAuthProvider,
  createAuthMiddleware,
  getUserId,
  HttpError,
  extractBearerToken,
  authenticateRequest,
  requireAuth,
  isAdmin,
  UserManager,
  FileUserManager,
  type User
} from "../src/index.js";

// ---------------------------------------------------------------------------
// Export smoke-tests – ensure everything that should be exported is exported
// ---------------------------------------------------------------------------
describe("index exports", () => {
  it("TokenType enum is exported with expected values", () => {
    expect(TokenType.STATIC).toBe("static");
    expect(TokenType.USER).toBe("user");
  });

  it("AuthProvider abstract class is exported", () => {
    expect(typeof AuthProvider).toBe("function");
  });

  it("LocalAuthProvider is exported and instantiable", () => {
    expect(new LocalAuthProvider()).toBeInstanceOf(AuthProvider);
  });

  it("StaticTokenProvider is exported and instantiable", () => {
    const p = new StaticTokenProvider({ tok: "user-1" });
    expect(p).toBeInstanceOf(AuthProvider);
  });

  it("MultiUserAuthProvider is exported and instantiable", () => {
    const p = new MultiUserAuthProvider({ secret: "s".repeat(32) });
    expect(p).toBeInstanceOf(AuthProvider);
  });

  it("SupabaseAuthProvider is exported and instantiable", () => {
    const p = new SupabaseAuthProvider({ supabaseJwtSecret: "s".repeat(32) });
    expect(p).toBeInstanceOf(AuthProvider);
  });

  it("createAuthMiddleware is exported and is a function", () => {
    expect(typeof createAuthMiddleware).toBe("function");
  });

  it("getUserId is exported and is a function", () => {
    expect(typeof getUserId).toBe("function");
  });

  it("HttpError is exported and is constructable", () => {
    const err = new HttpError(404, "Not found");
    expect(err).toBeInstanceOf(Error);
  });

  it("extractBearerToken is exported and is a function", () => {
    expect(typeof extractBearerToken).toBe("function");
  });

  it("authenticateRequest is exported and is a function", () => {
    expect(typeof authenticateRequest).toBe("function");
  });

  it("requireAuth is exported and is a function", () => {
    expect(typeof requireAuth).toBe("function");
  });

  it("UserManager is exported and instantiable", () => {
    expect(new UserManager()).toBeInstanceOf(UserManager);
  });

  it("FileUserManager is exported and instantiable", () => {
    expect(new FileUserManager("/tmp/nodetool-test-index.json")).toBeInstanceOf(
      FileUserManager
    );
  });
});

// ---------------------------------------------------------------------------
// isAdmin helper
// ---------------------------------------------------------------------------
describe("isAdmin", () => {
  it("returns true when role is 'admin'", () => {
    const user: User = { id: "u1", role: "admin" };
    expect(isAdmin(user)).toBe(true);
  });

  it("returns false when role is 'user'", () => {
    const user: User = { id: "u2", role: "user" };
    expect(isAdmin(user)).toBe(false);
  });

  it("returns false when role is undefined", () => {
    const user: User = { id: "u3" };
    expect(isAdmin(user)).toBe(false);
  });

  it("returns false for any non-admin string role", () => {
    for (const role of ["moderator", "editor", "superuser", ""]) {
      const user: User = { id: "u4", role };
      expect(isAdmin(user)).toBe(false);
    }
  });
});
