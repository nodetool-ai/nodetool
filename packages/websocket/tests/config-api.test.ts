/**
 * Tests for the public /api/config endpoint.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import configRoute, { describeMissingAnonKey } from "../src/routes/config.js";

const ENV_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_KEY",
  "SUPABASE_ANON_KEY",
  "AUTH_REDIRECT_URL",
  "OIDC_ISSUER",
  "OIDC_CLIENT_ID",
  "OIDC_CLIENT_SECRET",
  "OIDC_PROVIDER_NAME",
  "NODETOOL_GOOGLE_WORKSPACE",
  "NODETOOL_NODE_PROFILE",
  "NODETOOL_ENV"
] as const;

describe("/api/config endpoint", () => {
  let app: FastifyInstance;
  let saved: Record<string, string | undefined>;

  beforeEach(async () => {
    saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    for (const k of ENV_KEYS) delete process.env[k];
    app = Fastify({ logger: false });
    await app.register(configRoute);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("reports local mode with no supabase env set", async () => {
    const res = await app.inject({ method: "GET", url: "/api/config" });
    const body = JSON.parse(res.body);
    expect(res.statusCode).toBe(200);
    expect(body.authMode).toBe("local");
    expect(body.supabaseUrl).toBeNull();
    expect(body.supabaseAnonKey).toBeNull();
  });

  it("reports supabase mode when URL + service key are set", async () => {
    process.env.SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_KEY = "service-role-key";
    process.env.SUPABASE_ANON_KEY = "anon-key";

    const res = await app.inject({ method: "GET", url: "/api/config" });
    const body = JSON.parse(res.body);
    expect(body.authMode).toBe("supabase");
    expect(body.supabaseUrl).toBe("https://x.supabase.co");
    expect(body.supabaseAnonKey).toBe("anon-key");
  });

  it("reports the cloud profile, and a self-hosted full profile as not cloud", async () => {
    const get = async () =>
      JSON.parse((await app.inject({ method: "GET", url: "/api/config" })).body)
        .cloudProfile;
    expect(await get()).toBe(false);
    process.env.NODETOOL_ENV = "production";
    expect(await get()).toBe(true);
    process.env.NODETOOL_NODE_PROFILE = "full";
    expect(await get()).toBe(false);
    process.env.NODETOOL_NODE_PROFILE = "cloud";
    delete process.env.NODETOOL_ENV;
    expect(await get()).toBe(true);
  });

  it("never exposes the service-role key", async () => {
    process.env.SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_KEY = "super-secret-service-role-key";
    process.env.SUPABASE_ANON_KEY = "anon-key";

    const res = await app.inject({ method: "GET", url: "/api/config" });
    expect(res.body).not.toContain("super-secret-service-role-key");
    expect(Object.keys(JSON.parse(res.body)).sort()).toEqual([
      "authMode",
      "authRedirectUrl",
      "cloudProfile",
      "googleScopes",
      "googleWorkspace",
      "ssoProviderName",
      "supabaseAnonKey",
      "supabaseUrl",
      "version"
    ]);
  });

  it("advertises the Google Workspace scopes only in Supabase mode", async () => {
    const local = JSON.parse(
      (await app.inject({ method: "GET", url: "/api/config" })).body
    );
    expect(local.googleWorkspace).toBe(false);
    expect(local.googleScopes).toEqual([]);

    process.env.SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_KEY = "service-role-key";

    const hosted = JSON.parse(
      (await app.inject({ method: "GET", url: "/api/config" })).body
    );
    expect(hosted.googleWorkspace).toBe(true);
    expect(hosted.googleScopes).toContain(
      "https://www.googleapis.com/auth/drive"
    );
  });

  it("reports SSO mode with the provider's label, and never the client secret", async () => {
    process.env.OIDC_ISSUER = "https://idp.example.com/realms/acme";
    process.env.OIDC_CLIENT_ID = "nodetool";
    process.env.OIDC_CLIENT_SECRET = "oidc-client-secret-value";

    const res = await app.inject({ method: "GET", url: "/api/config" });
    const body = JSON.parse(res.body);
    expect(body.authMode).toBe("oidc");
    expect(body.ssoProviderName).toBe("SSO");
    expect(body.googleWorkspace).toBe(false);
    expect(res.body).not.toContain("oidc-client-secret-value");

    process.env.OIDC_PROVIDER_NAME = "Acme Okta";
    const named = JSON.parse(
      (await app.inject({ method: "GET", url: "/api/config" })).body
    );
    expect(named.ssoProviderName).toBe("Acme Okta");
  });

  it("has no SSO label outside SSO mode", async () => {
    process.env.OIDC_PROVIDER_NAME = "Acme Okta";
    const body = JSON.parse(
      (await app.inject({ method: "GET", url: "/api/config" })).body
    );
    expect(body.authMode).toBe("local");
    expect(body.ssoProviderName).toBeNull();
  });

  it("stays in local mode when only the anon key is set", async () => {
    process.env.SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_ANON_KEY = "anon-key";

    const res = await app.inject({ method: "GET", url: "/api/config" });
    const body = JSON.parse(res.body);
    expect(body.authMode).toBe("local");
  });

  it("serves supabase mode with a null anon key when the key is missing", async () => {
    process.env.SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_KEY = "service-role-key";

    const body = JSON.parse(
      (await app.inject({ method: "GET", url: "/api/config" })).body
    );
    // The shape that took prod down: auth enforced, nothing for the browser to
    // authenticate with, and a 200 either way. The service-role key stays out.
    expect(body.authMode).toBe("supabase");
    expect(body.supabaseAnonKey).toBeNull();
    expect(JSON.stringify(body)).not.toContain("service-role-key");
  });
});

describe("describeMissingAnonKey", () => {
  it("flags auth enforced with no anon key", () => {
    expect(
      describeMissingAnonKey({
        SUPABASE_URL: "https://x.supabase.co",
        SUPABASE_KEY: "service"
      })
    ).toContain("SUPABASE_ANON_KEY");
  });

  it("treats a blank anon key as missing", () => {
    expect(
      describeMissingAnonKey({
        SUPABASE_URL: "https://x.supabase.co",
        SUPABASE_KEY: "service",
        SUPABASE_ANON_KEY: "   "
      })
    ).toContain("SUPABASE_ANON_KEY");
  });

  it("is silent once the anon key is set", () => {
    expect(
      describeMissingAnonKey({
        SUPABASE_URL: "https://x.supabase.co",
        SUPABASE_KEY: "service",
        SUPABASE_ANON_KEY: "anon"
      })
    ).toBeNull();
  });

  it("is silent in local mode, where Supabase is never called", () => {
    expect(describeMissingAnonKey({})).toBeNull();
  });
});
