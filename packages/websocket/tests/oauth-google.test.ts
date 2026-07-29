import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initTestDb, resolveGoogleAccessToken } from "@nodetool-ai/models";
import { handleOAuthRequest } from "../src/oauth-api.js";

const USER_ID = "test-user-google";

function getUserId(): string {
  return USER_ID;
}

async function jsonBody(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

function post(path: string, body: unknown): Request {
  return new Request(`http://localhost:7777${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

const ENV_KEYS = ["SUPABASE_URL", "SUPABASE_KEY", "NODETOOL_GOOGLE_WORKSPACE"];
let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  initTestDb();
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  // Simulate a production deployment: Supabase auth configured.
  process.env.SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_KEY = "service-role-key";
  delete process.env.NODETOOL_GOOGLE_WORKSPACE;
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe("POST /api/oauth/google/session", () => {
  it("stores the provider token so tools can resolve it", async () => {
    const response = await handleOAuthRequest(
      post("/api/oauth/google/session", {
        access_token: "ya29.from-login",
        refresh_token: "refresh-1",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        scope: "https://www.googleapis.com/auth/drive",
        email: "alice@example.com"
      }),
      "/api/oauth/google/session",
      getUserId
    );

    expect(response?.status).toBe(200);
    const body = await jsonBody(response as Response);
    expect(body.success).toBe(true);
    // The response never echoes the token back.
    expect(JSON.stringify(body)).not.toContain("ya29.from-login");

    await expect(resolveGoogleAccessToken(USER_ID)).resolves.toBe(
      "ya29.from-login"
    );
  });

  it("rejects a body without an access token", async () => {
    const response = await handleOAuthRequest(
      post("/api/oauth/google/session", { refresh_token: "r" }),
      "/api/oauth/google/session",
      getUserId
    );

    expect(response?.status).toBe(400);
  });

  it("is not available in local mode", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_KEY;

    const response = await handleOAuthRequest(
      post("/api/oauth/google/session", { access_token: "ya29.x" }),
      "/api/oauth/google/session",
      getUserId
    );

    expect(response?.status).toBe(404);
    await expect(resolveGoogleAccessToken(USER_ID)).resolves.toBeNull();
  });
});

describe("GET /api/oauth/google/tokens", () => {
  it("reports the connection without exposing the token", async () => {
    await handleOAuthRequest(
      post("/api/oauth/google/session", {
        access_token: "ya29.from-login",
        email: "alice@example.com"
      }),
      "/api/oauth/google/session",
      getUserId
    );

    const response = await handleOAuthRequest(
      new Request("http://localhost:7777/api/oauth/google/tokens"),
      "/api/oauth/google/tokens",
      getUserId
    );
    const body = await jsonBody(response as Response);

    expect(body.enabled).toBe(true);
    expect((body.tokens as unknown[]).length).toBe(1);
    expect(JSON.stringify(body)).not.toContain("ya29.from-login");
  });

  it("reports disabled in local mode", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_KEY;

    const response = await handleOAuthRequest(
      new Request("http://localhost:7777/api/oauth/google/tokens"),
      "/api/oauth/google/tokens",
      getUserId
    );
    const body = await jsonBody(response as Response);

    expect(body.enabled).toBe(false);
    expect(body.tokens).toEqual([]);
  });
});

describe("POST /api/oauth/google/disconnect", () => {
  it("removes the stored credential", async () => {
    await handleOAuthRequest(
      post("/api/oauth/google/session", { access_token: "ya29.from-login" }),
      "/api/oauth/google/session",
      getUserId
    );

    const response = await handleOAuthRequest(
      post("/api/oauth/google/disconnect", {}),
      "/api/oauth/google/disconnect",
      getUserId
    );
    const body = await jsonBody(response as Response);

    expect(body.removed).toBe(1);
    await expect(resolveGoogleAccessToken(USER_ID)).resolves.toBeNull();
  });
});
