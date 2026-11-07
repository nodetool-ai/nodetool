import { describe, it, expect } from "vitest";
import {
  isAuthEnforced,
  isOidcAuthConfigured,
  isSupabaseAuthConfigured
} from "../deployment.js";

const SUPABASE = {
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_KEY: "service-role-key"
};
const OIDC = {
  OIDC_ISSUER: "https://idp.example.com/realms/acme",
  OIDC_CLIENT_ID: "nodetool"
};

describe("isAuthEnforced", () => {
  it("is false for a local install", () => {
    expect(isAuthEnforced({})).toBe(false);
  });

  it("is true with Supabase auth", () => {
    expect(isAuthEnforced(SUPABASE)).toBe(true);
    expect(isSupabaseAuthConfigured(SUPABASE)).toBe(true);
    expect(isOidcAuthConfigured(SUPABASE)).toBe(false);
  });

  it("is true with OIDC single sign-on", () => {
    expect(isAuthEnforced(OIDC)).toBe(true);
    expect(isOidcAuthConfigured(OIDC)).toBe(true);
    expect(isSupabaseAuthConfigured(OIDC)).toBe(false);
  });

  it("needs both variables of a provider", () => {
    expect(isAuthEnforced({ OIDC_ISSUER: OIDC.OIDC_ISSUER })).toBe(false);
    expect(isAuthEnforced({ OIDC_CLIENT_ID: "nodetool" })).toBe(false);
    expect(isAuthEnforced({ SUPABASE_URL: SUPABASE.SUPABASE_URL })).toBe(false);
    expect(isAuthEnforced({ OIDC_ISSUER: "  ", OIDC_CLIENT_ID: "x" })).toBe(false);
  });
});
