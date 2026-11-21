import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalCallbackServer } from "@nodetool-ai/runtime/oauth";
import {
  closeActiveCodexCallbackServer,
  handleOAuthRequest,
  pendingCodexLogins
} from "../src/oauth-api.js";

vi.mock("@nodetool-ai/runtime/oauth", async (importOriginal) => ({
  ...await importOriginal<typeof import("@nodetool-ai/runtime/oauth")>(),
  CODEX_CALLBACK_PORT: 0
}));

afterEach(async () => {
  await closeActiveCodexCallbackServer();
  pendingCodexLogins.clear();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("Codex local sign-in", () => {
  it("reports callback failures only to the initiating user without exposing error details", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_KEY", "");
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

  it("accepts IPv4 connections and only lets the initiating user cancel it", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_KEY", "");
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
    const state = [...pendingCodexLogins.keys()][0];
    const cancel = (user: string) => handleOAuthRequest(
      new Request("http://localhost:7777/api/oauth/openai/cancel", {
        method: "POST",
        body: JSON.stringify({ state })
      }),
      "/api/oauth/openai/cancel",
      () => user
    );
    await cancel("other-user");
    expect(pendingCodexLogins.has(state)).toBe(true);
    expect((await fetch(probeUrl)).status).toBe(404);
    await cancel("owner");
    expect(pendingCodexLogins.has(state)).toBe(false);
    await expect(fetch(probeUrl)).rejects.toThrow();
  });
});
