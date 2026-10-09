import { describe, it, expect } from "vitest";
import {
  matchesServerAuthToken,
  resolveServerAuthToken
} from "../src/lib/server-auth-token.js";

describe("resolveServerAuthToken", () => {
  it("is null when unset or blank", () => {
    expect(resolveServerAuthToken(undefined)).toBeNull();
    expect(resolveServerAuthToken("")).toBeNull();
    expect(resolveServerAuthToken("   ")).toBeNull();
  });

  it("trims the configured value", () => {
    expect(resolveServerAuthToken("  secret-token \n")).toBe("secret-token");
  });
});

describe("matchesServerAuthToken", () => {
  it("accepts the exact configured token", () => {
    expect(matchesServerAuthToken("secret-token", "secret-token")).toBe(true);
  });

  it("rejects a different token, a prefix, and a longer token", () => {
    expect(matchesServerAuthToken("other-token", "secret-token")).toBe(false);
    expect(matchesServerAuthToken("secret", "secret-token")).toBe(false);
    expect(matchesServerAuthToken("secret-token-x", "secret-token")).toBe(false);
  });

  it("rejects everything when no token is configured", () => {
    expect(matchesServerAuthToken("secret-token", null)).toBe(false);
    expect(matchesServerAuthToken("", null)).toBe(false);
  });

  it("rejects a missing presented token", () => {
    expect(matchesServerAuthToken(null, "secret-token")).toBe(false);
    expect(matchesServerAuthToken(undefined, "secret-token")).toBe(false);
    expect(matchesServerAuthToken("", "secret-token")).toBe(false);
  });
});
