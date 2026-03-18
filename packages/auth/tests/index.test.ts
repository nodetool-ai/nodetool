/**
 * Tests for index.ts exports and the User / isAdmin helpers.
 */
import { describe, it, expect } from "vitest";
import * as AuthModule from "../src/index.js";
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
  UserManager,
  FileUserManager,
  isAdmin,
  type User,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// Exported symbols
// ---------------------------------------------------------------------------
describe("index.ts exports", () => {
  it("exports TokenType enum", () => {
    expect(TokenType).toBeDefined();
    expect(TokenType.STATIC).toBe("static");
    expect(TokenType.USER).toBe("user");
  });

  it("exports AuthProvider class", () => {
    expect(AuthProvider).toBeDefined();
    expect(typeof AuthProvider).toBe("function");
  });

  it("exports LocalAuthProvider class", () => {
    expect(LocalAuthProvider).toBeDefined();
    expect(typeof LocalAuthProvider).toBe("function");
  });

  it("exports StaticTokenProvider class", () => {
    expect(StaticTokenProvider).toBeDefined();
    expect(typeof StaticTokenProvider).toBe("function");
  });

  it("exports MultiUserAuthProvider class", () => {
    expect(MultiUserAuthProvider).toBeDefined();
    expect(typeof MultiUserAuthProvider).toBe("function");
  });

  it("exports SupabaseAuthProvider class", () => {
    expect(SupabaseAuthProvider).toBeDefined();
    expect(typeof SupabaseAuthProvider).toBe("function");
  });

  it("exports createAuthMiddleware function", () => {
    expect(createAuthMiddleware).toBeDefined();
    expect(typeof createAuthMiddleware).toBe("function");
  });

  it("exports getUserId function", () => {
    expect(getUserId).toBeDefined();
    expect(typeof getUserId).toBe("function");
  });

  it("exports HttpError class", () => {
    expect(HttpError).toBeDefined();
    expect(typeof HttpError).toBe("function");
  });

  it("exports extractBearerToken function", () => {
    expect(extractBearerToken).toBeDefined();
    expect(typeof extractBearerToken).toBe("function");
  });

  it("exports authenticateRequest function", () => {
    expect(authenticateRequest).toBeDefined();
    expect(typeof authenticateRequest).toBe("function");
  });

  it("exports requireAuth function", () => {
    expect(requireAuth).toBeDefined();
    expect(typeof requireAuth).toBe("function");
  });

  it("exports UserManager class", () => {
    expect(UserManager).toBeDefined();
    expect(typeof UserManager).toBe("function");
  });

  it("exports FileUserManager class", () => {
    expect(FileUserManager).toBeDefined();
    expect(typeof FileUserManager).toBe("function");
  });

  it("exports isAdmin function", () => {
    expect(isAdmin).toBeDefined();
    expect(typeof isAdmin).toBe("function");
  });

  it("does not have unexpected missing exports", () => {
    const expectedKeys = [
      "TokenType",
      "AuthProvider",
      "LocalAuthProvider",
      "StaticTokenProvider",
      "MultiUserAuthProvider",
      "SupabaseAuthProvider",
      "createAuthMiddleware",
      "getUserId",
      "HttpError",
      "extractBearerToken",
      "authenticateRequest",
      "requireAuth",
      "UserManager",
      "FileUserManager",
      "isAdmin",
    ];
    for (const key of expectedKeys) {
      expect((AuthModule as Record<string, unknown>)[key]).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// isAdmin helper
// ---------------------------------------------------------------------------
describe("isAdmin", () => {
  it("returns true for admin role", () => {
    const user: User = { id: "1", role: "admin" };
    expect(isAdmin(user)).toBe(true);
  });

  it("returns false for non-admin role", () => {
    const user: User = { id: "2", role: "user" };
    expect(isAdmin(user)).toBe(false);
  });

  it("returns false for undefined role", () => {
    const user: User = { id: "3" };
    expect(isAdmin(user)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// User interface compatibility
// ---------------------------------------------------------------------------
describe("User interface", () => {
  it("accepts object with id and role", () => {
    const user: User = { id: "u1", role: "admin" };
    expect(user.id).toBe("u1");
    expect(user.role).toBe("admin");
  });

  it("accepts object with id only (role is optional)", () => {
    const user: User = { id: "u2" };
    expect(user.id).toBe("u2");
    expect(user.role).toBeUndefined();
  });
});
