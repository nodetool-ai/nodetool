/**
 * Tests for T-SEC-3: MultiUserAuthProvider (JWT validation)
 * and T-SEC-5: isAdmin helper.
 */
import { describe, it, expect } from "vitest";
import * as jose from "jose";
import { MultiUserAuthProvider } from "../src/providers/multi-user-provider.js";
import { isAdmin, type User } from "../src/index.js";
import { TokenType } from "../src/auth-provider.js";

const TEST_SECRET = "test-secret-key-for-jwt-signing-minimum-32-chars";

async function createTestJwt(
  claims: Record<string, unknown>,
  secret: string = TEST_SECRET,
  expiresIn = "1h"
): Promise<string> {
  const encoder = new TextEncoder();
  const jwt = await new jose.SignJWT(claims as jose.JWTPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(encoder.encode(secret));
  return jwt;
}

// ── T-SEC-3: MultiUserAuthProvider ──────────────────────────────────

describe("T-SEC-3: MultiUserAuthProvider", () => {
  it("validates a valid JWT and extracts user_id", async () => {
    const provider = new MultiUserAuthProvider({ secret: TEST_SECRET });
    const token = await createTestJwt({ sub: "user-42" });
    const result = await provider.verifyToken(token);
    expect(result.ok).toBe(true);
    expect(result.userId).toBe("user-42");
    expect(result.tokenType).toBe(TokenType.USER);
  });

  it("returns error for expired JWT", async () => {
    const provider = new MultiUserAuthProvider({ secret: TEST_SECRET });
    const token = await createTestJwt({ sub: "user-42" }, TEST_SECRET, "0s");
    // Wait a tick for the token to be expired
    await new Promise((r) => setTimeout(r, 1100));
    const result = await provider.verifyToken(token);
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("returns error for JWT signed with wrong secret", async () => {
    const provider = new MultiUserAuthProvider({ secret: TEST_SECRET });
    const token = await createTestJwt(
      { sub: "user-42" },
      "wrong-secret-key-that-is-also-long-enough"
    );
    const result = await provider.verifyToken(token);
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("returns error for malformed token", async () => {
    const provider = new MultiUserAuthProvider({ secret: TEST_SECRET });
    const result = await provider.verifyToken("not-a-jwt");
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("extracts user_id from custom claim", async () => {
    const provider = new MultiUserAuthProvider({
      secret: TEST_SECRET,
      userIdClaim: "user_id"
    });
    const token = await createTestJwt({ user_id: "custom-user" });
    const result = await provider.verifyToken(token);
    expect(result.ok).toBe(true);
    expect(result.userId).toBe("custom-user");
  });

  it("returns error when user_id claim is missing", async () => {
    const provider = new MultiUserAuthProvider({ secret: TEST_SECRET });
    const token = await createTestJwt({ name: "no-sub" });
    const result = await provider.verifyToken(token);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("user");
  });

  it("extracts role from JWT claims", async () => {
    const provider = new MultiUserAuthProvider({ secret: TEST_SECRET });
    const token = await createTestJwt({ sub: "user-42", role: "admin" });
    const result = await provider.verifyToken(token);
    expect(result.ok).toBe(true);
    expect(result.role).toBe("admin");
  });
});

// ── T-SEC-5: isAdmin helper ─────────────────────────────────────────

describe("T-SEC-5: isAdmin helper", () => {
  it("returns true for admin role", () => {
    const user: User = { id: "u1", role: "admin" };
    expect(isAdmin(user)).toBe(true);
  });

  it("returns false for non-admin role", () => {
    const user: User = { id: "u1", role: "user" };
    expect(isAdmin(user)).toBe(false);
  });

  it("returns false for undefined role", () => {
    const user: User = { id: "u1" };
    expect(isAdmin(user)).toBe(false);
  });
});
