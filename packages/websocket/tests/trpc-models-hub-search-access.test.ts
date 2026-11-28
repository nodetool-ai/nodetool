/**
 * `models.huggingfaceHubSearch` picks its host and token through
 * `resolveHfHubAccess`: server credentials go only to the operator endpoint,
 * and on a shared server a user's own endpoint is fetched through safeFetch.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import { clearHfTokenCache } from "@nodetool-ai/huggingface";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

const stored = vi.hoisted(() => ({ values: {} as Record<string, string> }));

vi.mock("@nodetool-ai/models", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/models")>();
  return {
    ...actual,
    getSecret: vi.fn(async (key: string) => stored.values[key] ?? null)
  };
});

const ENV_KEYS = [
  "HF_TOKEN",
  "HF_API_TOKEN",
  "HUGGING_FACE_HUB_TOKEN",
  "HF_TOKEN_PATH",
  "HF_HOME",
  "HF_ENDPOINT",
  "NODETOOL_ENV",
  "NODETOOL_NODE_PROFILE",
  "SUPABASE_URL",
  "SUPABASE_KEY",
  "OIDC_ISSUER",
  "OIDC_CLIENT_ID"
];

const createCaller = createCallerFactory(appRouter);

function makeCtx(): Context {
  return {
    userId: "user-1",
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  };
}

let savedEnv: Record<string, string | undefined> = {};
let fetchMock: ReturnType<typeof vi.fn>;

function lastRequest(): { url: string; init: RequestInit } {
  const call = fetchMock.mock.calls.at(-1)!;
  return { url: String(call[0]), init: call[1] as RequestInit };
}

function authHeader(): string | undefined {
  const headers = lastRequest().init.headers as Record<string, string> | Headers;
  return headers instanceof Headers
    ? (headers.get("authorization") ?? undefined)
    : headers["Authorization"];
}

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  process.env["HF_HOME"] = path.join(os.tmpdir(), "hub-search-access-no-dir");
  process.env["HF_TOKEN"] = "hf_server";
  clearHfTokenCache();
  stored.values = {};
  fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify([{ id: "org/model" }]), { status: 200 })
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  clearHfTokenCache();
});

describe("huggingfaceHubSearch credentials", () => {
  it("sends the server token to the operator endpoint", async () => {
    const result = await createCaller(makeCtx()).models.huggingfaceHubSearch({ query: "a" });

    expect(result.map((m) => m.id)).toEqual(["org/model"]);
    expect(lastRequest().url.startsWith("https://huggingface.co/api/models?")).toBe(true);
    expect(authHeader()).toBe("Bearer hf_server");
  });

  it("does not send the server token to an endpoint from the user's settings", async () => {
    stored.values = { HF_ENDPOINT: "https://mirror.example.com" };

    await createCaller(makeCtx()).models.huggingfaceHubSearch({ query: "a" });

    expect(lastRequest().url.startsWith("https://mirror.example.com/api/models?")).toBe(true);
    expect(authHeader()).toBeUndefined();
  });

  it("sends the user's own token to the user's endpoint", async () => {
    stored.values = { HF_ENDPOINT: "https://mirror.example.com", HF_TOKEN: "hf_user" };

    await createCaller(makeCtx()).models.huggingfaceHubSearch({ query: "a" });

    expect(authHeader()).toBe("Bearer hf_user");
  });

  it("checks a user endpoint per hop on a shared server", async () => {
    process.env["OIDC_ISSUER"] = "https://id.example.com";
    process.env["OIDC_CLIENT_ID"] = "client";
    stored.values = { HF_ENDPOINT: "https://mirror.example.com" };

    await createCaller(makeCtx()).models.huggingfaceHubSearch({ query: "a" });
    // safeFetch follows redirects itself, so it asks fetch not to.
    expect(lastRequest().init.redirect).toBe("manual");

    fetchMock.mockClear();
    stored.values = { HF_ENDPOINT: "http://10.0.0.5:8080" };
    const result = await createCaller(makeCtx()).models.huggingfaceHubSearch({ query: "a" });
    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the plain fetch for the operator endpoint on a shared server", async () => {
    process.env["OIDC_ISSUER"] = "https://id.example.com";
    process.env["OIDC_CLIENT_ID"] = "client";
    process.env["HF_ENDPOINT"] = "http://hf-mirror.internal:8080";

    await createCaller(makeCtx()).models.huggingfaceHubSearch({ query: "a" });

    expect(lastRequest().url.startsWith("http://hf-mirror.internal:8080/api/models?")).toBe(true);
    expect(authHeader()).toBe("Bearer hf_server");
  });
});
