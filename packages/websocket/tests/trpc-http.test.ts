/**
 * HTTP smoke tests for the tRPC endpoints.
 *
 * Spins up a minimal Fastify app with just the tRPC plugin mounted at /trpc
 * and verifies the HTTP wire format: status codes, JSON-RPC shape, etc.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import {
  fastifyTRPCPlugin,
  type FastifyTRPCPluginOptions
} from "@trpc/server/adapters/fastify";
import { appRouter, type AppRouter } from "../src/trpc/router.js";
import { createContextFactory } from "../src/trpc/context.js";
import type { Context } from "../src/trpc/context.js";

// ── Mock heavy dependencies ────────────────────────────────────────────────

vi.mock("@nodetool-ai/models", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/models")>();
  return { ...actual, getSecret: vi.fn().mockResolvedValue(null) };
});

vi.mock("@nodetool-ai/runtime", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/runtime")>();
  return {
    ...actual,
    listRegisteredProviderIds: vi.fn().mockReturnValue([]),
    isProviderConfigured: vi.fn().mockResolvedValue(false),
    getProvider: vi.fn().mockResolvedValue(null)
  };
});

vi.mock("@nodetool-ai/huggingface", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/huggingface")>();
  return {
    ...actual,
    readCachedHfModels: vi.fn().mockResolvedValue([]),
    searchCachedHfModels: vi.fn().mockResolvedValue([]),
    getModelsByHfType: vi.fn().mockResolvedValue([]),
    deleteCachedHfModel: vi.fn().mockResolvedValue(true),
    getHuggingfaceFileInfos: vi.fn().mockResolvedValue([])
  };
});

vi.mock("node:fs/promises", async (orig) => {
  const actual = await orig<typeof import("node:fs/promises")>();
  return {
    ...actual,
    access: vi.fn().mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" })),
    readdir: vi.fn().mockResolvedValue([])
  };
});

// ── Server setup ──────────────────────────────────────────────────────────

let app: FastifyInstance;
let baseUrl: string;

const AUTH_USER_ID = "test-user-http";

beforeAll(async () => {
  app = Fastify();

  // Add userId to every request from the x-user-id header (mimics auth middleware)
  app.decorateRequest("userId", null);
  app.addHook("onRequest", async (req) => {
    req.userId = (req.headers["x-user-id"] as string | undefined) ?? null;
  });

  const createContext = createContextFactory({
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  });

  await app.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: {
      router: appRouter,
      createContext
    } satisfies FastifyTRPCPluginOptions<AppRouter>["trpcOptions"]
  });

  const address = await app.listen({ port: 0, host: "127.0.0.1" });
  baseUrl = address;
});

afterAll(async () => {
  await app.close();
});

// ── Helpers ───────────────────────────────────────────────────────────────

function trpcUrl(procedure: string): string {
  return `${baseUrl}/trpc/${procedure}`;
}

async function trpcQuery(
  procedure: string,
  input?: unknown,
  userId?: string
): Promise<Response> {
  const headers: Record<string, string> = {
    "content-type": "application/json"
  };
  if (userId) headers["x-user-id"] = userId;

  // Default (JSON) transformer: input is the raw value, urlencoded.
  const params = input !== undefined
    ? `?input=${encodeURIComponent(JSON.stringify(input))}`
    : "";
  return fetch(`${trpcUrl(procedure)}${params}`, { headers });
}

async function trpcMutation(
  procedure: string,
  input: unknown,
  userId?: string
): Promise<Response> {
  const headers: Record<string, string> = {
    "content-type": "application/json"
  };
  if (userId) headers["x-user-id"] = userId;
  return fetch(trpcUrl(procedure), {
    method: "POST",
    headers,
    body: JSON.stringify(input)
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("tRPC HTTP smoke tests", () => {
  describe("healthz (public query)", () => {
    it("returns ok: true", async () => {
      const res = await trpcQuery("healthz");
      expect(res.status).toBe(200);
      const body = await res.json() as { result: { data: unknown } };
      expect(body.result.data).toEqual({ ok: true });
    });
  });

  describe("nodes.replicateStatus (public query)", () => {
    it("returns 200 with configured: false when no token", async () => {
      const res = await trpcQuery("nodes.replicateStatus");
      expect(res.status).toBe(200);
      const body = await res.json() as { result: { data: unknown } };
      const data = body.result.data as { configured: boolean };
      expect(data.configured).toBe(false);
    });
  });


  describe("models.recommended (protected query)", () => {
    it("returns 401 when no userId header", async () => {
      const res = await trpcQuery("models.recommended", { check_servers: false });
      expect(res.status).toBe(401);
    });

    it("returns an array of models with auth", async () => {
      const res = await trpcQuery(
        "models.recommended",
        { check_servers: false },
        AUTH_USER_ID
      );
      expect(res.status).toBe(200);
      const body = await res.json() as { result: { data: unknown[] } };
      const models = body.result.data;
      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThan(0);
    });
  });

  describe("models.providers (protected query)", () => {
    it("returns 401 when no userId header", async () => {
      const res = await trpcQuery("models.providers");
      expect(res.status).toBe(401);
    });

    it("returns an array (empty when no providers configured) with auth", async () => {
      const res = await trpcQuery("models.providers", undefined, AUTH_USER_ID);
      expect(res.status).toBe(200);
      const body = await res.json() as { result: { data: unknown } };
      expect(Array.isArray(body.result.data)).toBe(true);
    });
  });

  describe("models.pullOllamaModel (protected mutation)", () => {
    it("returns unavailable status with auth", async () => {
      const res = await trpcMutation(
        "models.pullOllamaModel",
        { model: "llama3" },
        AUTH_USER_ID
      );
      expect(res.status).toBe(200);
      const body = await res.json() as { result: { data: unknown } };
      const data = body.result.data as { status: string };
      expect(data.status).toBe("unavailable");
    });
  });
});
