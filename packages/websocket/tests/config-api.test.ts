/**
 * Tests for the public /api/config endpoint.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import configRoute from "../src/routes/config.js";

const ENV_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_KEY",
  "SUPABASE_ANON_KEY",
  "AUTH_REDIRECT_URL"
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

  it("never exposes the service-role key", async () => {
    process.env.SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_KEY = "super-secret-service-role-key";
    process.env.SUPABASE_ANON_KEY = "anon-key";

    const res = await app.inject({ method: "GET", url: "/api/config" });
    expect(res.body).not.toContain("super-secret-service-role-key");
    expect(Object.keys(JSON.parse(res.body)).sort()).toEqual([
      "authMode",
      "authRedirectUrl",
      "supabaseAnonKey",
      "supabaseUrl",
      "version"
    ]);
  });

  it("stays in local mode when only the anon key is set", async () => {
    process.env.SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_ANON_KEY = "anon-key";

    const res = await app.inject({ method: "GET", url: "/api/config" });
    const body = JSON.parse(res.body);
    expect(body.authMode).toBe("local");
  });
});
