import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initTestDb, resetChatGptDiscoveryForTests } from "@nodetool-ai/models";
import { LocalCallbackServer } from "@nodetool-ai/runtime/oauth";
import {
  closeActiveChatGptCallbackServer,
  handleOAuthRequest,
  pendingChatGptLogins
} from "../src/oauth-api.js";
import { resetChatGptHostIdForTests } from "../src/chatgpt-signin.js";

let dataHome: string;

beforeEach(async () => {
  initTestDb();
  resetChatGptDiscoveryForTests();
  resetChatGptHostIdForTests();
  dataHome = await mkdtemp(join(tmpdir(), "nodetool-chatgpt-"));
  vi.stubEnv("XDG_DATA_HOME", dataHome);
  vi.stubEnv("APPDATA", dataHome);
  vi.stubEnv("SUPABASE_URL", "");
  vi.stubEnv("SUPABASE_KEY", "");
  // Discovery is unreachable here, so the documented endpoints are used.
  const realFetch = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://auth.openai.com/")) {
      return new Response("offline", { status: 503 });
    }
    return realFetch(input, init);
  });
});

afterEach(async () => {
  await closeActiveChatGptCallbackServer();
  pendingChatGptLogins.clear();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(dataHome, { recursive: true, force: true });
});

describe("ChatGPT local sign-in", () => {
  it("reports callback failures only to the initiating user without exposing error details", async () => {
    vi.spyOn(LocalCallbackServer.prototype, "waitForCode").mockRejectedValue(new Error("private callback details"));
    const start = await handleOAuthRequest(
      new Request("http://localhost:7777/api/oauth/openai/start"),
      "/api/oauth/openai/start", () => "owner"
    );
    const { auth_url } = await start!.json();
    const state = new URL(auth_url).searchParams.get("state");
    const status = async (userId: string) => {
      const response = await handleOAuthRequest(new Request("http://localhost:7777/api/oauth/openai/status", {
        method: "POST", body: JSON.stringify({ state })
      }), "/api/oauth/openai/status", () => userId);
      return response!.json();
    };
    await vi.waitFor(async () => expect(await status("owner")).toEqual({ status: "failed" }));
    expect(await status("other-user")).toEqual({ status: "expired" });
  });

  it("finishes from the callback carrying the issued client id", async () => {
    const start = await handleOAuthRequest(
      new Request("http://localhost:7777/api/oauth/openai/start"),
      "/api/oauth/openai/start",
      () => "owner"
    );
    const { auth_url, redirect_uri } = await start!.json();
    const state = new URL(auth_url).searchParams.get("state");
    expect(redirect_uri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/auth\/callback$/);

    const callback = await fetch(`${redirect_uri}?code=ac_1&state=${state}&client_id=oaiapp_1`);
    expect(callback.status).toBe(200);
    // The documented token endpoint is offline in this test, so the login
    // fails after the callback, and the user sees why.
    const status = async () => {
      const response = await handleOAuthRequest(new Request("http://localhost:7777/api/oauth/openai/status", {
        method: "POST", body: JSON.stringify({ state })
      }), "/api/oauth/openai/status", () => "owner");
      return response!.json();
    };
    await vi.waitFor(async () =>
      expect(await status()).toEqual({
        status: "failed",
        detail: "ChatGPT rejected the sign-in (503)."
      })
    );
  });

  it("accepts IPv4 connections and only lets the initiating user cancel it", async () => {
    const listen = vi.spyOn(LocalCallbackServer.prototype, "listen");
    const start = await handleOAuthRequest(
      new Request("http://localhost:7777/api/oauth/openai/start"),
      "/api/oauth/openai/start",
      () => "owner"
    );
    expect(start?.status).toBe(200);
    const { port } = await listen.mock.results[0].value;
    const probeUrl = `http://127.0.0.1:${port}/probe`;
    expect((await fetch(probeUrl)).status).toBe(404);
    const state = [...pendingChatGptLogins.keys()][0];
    const cancel = (user: string) => handleOAuthRequest(
      new Request("http://localhost:7777/api/oauth/openai/cancel", {
        method: "POST",
        body: JSON.stringify({ state })
      }),
      "/api/oauth/openai/cancel",
      () => user
    );
    await cancel("other-user");
    expect(pendingChatGptLogins.has(state)).toBe(true);
    expect((await fetch(probeUrl)).status).toBe(404);
    await cancel("owner");
    expect(pendingChatGptLogins.has(state)).toBe(false);
    await expect(fetch(probeUrl)).rejects.toThrow();
  });
});
