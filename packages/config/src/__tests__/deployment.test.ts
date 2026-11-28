import { describe, it, expect } from "vitest";
import {
  isAuthEnforced,
  isOidcAuthConfigured,
  isSupabaseAuthConfigured,
  oauthGrantMaxAgeMs
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

describe("oauthGrantMaxAgeMs", () => {
  const DAY = 24 * 60 * 60 * 1000;

  it("has no maximum on a local install or with Supabase by default", () => {
    expect(oauthGrantMaxAgeMs({})).toBeNull();
    expect(oauthGrantMaxAgeMs(SUPABASE)).toBeNull();
  });

  it("is 30 days under SSO by default", () => {
    expect(oauthGrantMaxAgeMs(OIDC)).toBe(30 * DAY);
  });

  it("reads a configured number of days in any mode", () => {
    expect(oauthGrantMaxAgeMs({ NODETOOL_OAUTH_GRANT_MAX_AGE_DAYS: "7" })).toBe(7 * DAY);
    expect(
      oauthGrantMaxAgeMs({ ...OIDC, NODETOOL_OAUTH_GRANT_MAX_AGE_DAYS: "90" })
    ).toBe(90 * DAY);
  });

  it("treats 0 as no maximum", () => {
    expect(
      oauthGrantMaxAgeMs({ ...OIDC, NODETOOL_OAUTH_GRANT_MAX_AGE_DAYS: "0" })
    ).toBeNull();
  });

  it("throws on a value that is not a whole number of days in range", () => {
    for (const value of ["-1", "1.5", "thirty", "3651"]) {
      expect(() =>
        oauthGrantMaxAgeMs({ NODETOOL_OAUTH_GRANT_MAX_AGE_DAYS: value })
      ).toThrow(/NODETOOL_OAUTH_GRANT_MAX_AGE_DAYS/);
    }
  });
});
