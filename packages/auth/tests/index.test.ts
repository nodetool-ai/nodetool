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
  type AuthResult,
  type AuthenticatedUser,
  type AuthMiddlewareOptions,
  type HttpAuthOptions,
  type ManagedUser,
  type CreateUserOptions,
  type UserRecord,
  type UsersFile,
  type CreateUserResult,
  type User,
  type MultiUserAuthProviderOptions,
  type SupabaseAuthProviderOptions
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

// ---------------------------------------------------------------------------
// Type-level tests: ensure type aliases/interfaces are importable
// (the import at the top is enough; this section just makes the intent clear)
// ---------------------------------------------------------------------------
describe("type exports", () => {
  it("AuthResult type can be used as a local type", () => {
    const r: AuthResult = {
      ok: true,
      userId: "1",
      tokenType: TokenType.STATIC
    };
    expect(r.ok).toBe(true);
  });

  it("AuthenticatedUser type can be used as a local type", () => {
    const u: AuthenticatedUser = { userId: "x", tokenType: TokenType.USER };
    expect(u.userId).toBe("x");
  });

  it("ManagedUser type can be used as a local type", () => {
    const u: ManagedUser = {
      id: "id",
      username: "n",
      email: "e@e.com",
      role: "user"
    };
    expect(u.role).toBe("user");
  });

  it("CreateUserOptions type can be used as a local type", () => {
    const opts: CreateUserOptions = {
      username: "test",
      email: "test@test.com"
    };
    expect(opts.username).toBe("test");
  });

  it("UserRecord type can be used as a local type", () => {
    const r: UserRecord = {
      id: "id",
      username: "u",
      role: "r",
      tokenHash: "h",
      createdAt: "now"
    };
    expect(r.id).toBe("id");
  });

  it("UsersFile type can be used as a local type", () => {
    const f: UsersFile = { version: "1.0", users: {} };
    expect(f.version).toBe("1.0");
  });

  it("CreateUserResult type can be used as a local type", () => {
    const r: CreateUserResult = {
      username: "u",
      userId: "id",
      role: "user",
      token: "tok",
      createdAt: "now"
    };
    expect(r.token).toBe("tok");
  });

  it("AuthMiddlewareOptions type can be used as a local type", () => {
    const staticProvider = new LocalAuthProvider();
    const opts: AuthMiddlewareOptions = { staticProvider, enforceAuth: false };
    expect(opts.enforceAuth).toBe(false);
  });

  it("HttpAuthOptions type can be used as a local type", () => {
    const provider = new LocalAuthProvider();
    const opts: HttpAuthOptions = { provider };
    expect(opts.provider).toBe(provider);
  });

  it("MultiUserAuthProviderOptions type can be used as a local type", () => {
    const opts: MultiUserAuthProviderOptions = { secret: "s".repeat(32) };
    expect(opts.secret).toBeTruthy();
  });

  it("SupabaseAuthProviderOptions type can be used as a local type", () => {
    const opts: SupabaseAuthProviderOptions = {
      supabaseJwtSecret: "s".repeat(32)
    };
    expect(opts.supabaseJwtSecret).toBeTruthy();
  });
});
