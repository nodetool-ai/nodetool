import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { Prediction, Secret, Setting } from "@nodetool-ai/models";
import * as vectorstore from "@nodetool-ai/vectorstore";
import { appRouter } from "../src/trpc/router.js";
import { createContextFactory } from "../src/trpc/context.js";

function buildTestApp() {
  const app = Fastify({ logger: false });
  app.decorateRequest("userId", null);
  app.addHook("onRequest", async (req) => {
    req.userId = "test-user";
  });
  const stubBridge = { hasPython: () => false, close: () => {} } as never;
  const stubRegistry = {} as never;
  const stubApiOptions = { metadataRoots: [], registry: stubRegistry } as never;
  const createContext = createContextFactory({
    registry: stubRegistry,
    apiOptions: stubApiOptions,
    pythonBridge: stubBridge,
    getPythonBridgeReady: () => false
  });
  void app.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: { router: appRouter, createContext }
  });
  return app;
}

describe("tRPC Fastify mount", () => {
  it("serves the healthz query at /trpc/healthz", async () => {
    const app = buildTestApp();
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/trpc/healthz" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    // tRPC v11 returns { result: { data: { json: ..., meta: ... } } } when superjson is active.
    const data = body.result?.data?.json ?? body.result?.data;
    expect(data).toEqual({ ok: true });
    await app.close();
  });
});

describe("tRPC /trpc/costs.list over Fastify", () => {
  it("returns an empty list for a user with no predictions", async () => {
    // Prediction.paginate returns [items, cursorString] — empty cursor is "".
    // The costs.list procedure normalizes "" → null for the response payload.
    vi.spyOn(Prediction, "paginate").mockResolvedValue([[], ""]);
    const app = buildTestApp();
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: `/trpc/costs.list?input=${encodeURIComponent(
        JSON.stringify({ json: { limit: 10 } })
      )}`,
      headers: { "content-type": "application/json" }
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const data = body.result?.data?.json ?? body.result?.data;
    expect(data.calls).toEqual([]);
    expect(data.next_start_key).toBeNull();
    await app.close();
  });
});

describe("tRPC /trpc/settings.list over Fastify", () => {
  it("returns the registered settings with configured values resolved", async () => {
    // Mock model reads to produce a deterministic (empty-DB) response so the
    // snapshot is the registry defaults with env/DB values resolved.
    vi.spyOn(Setting, "listForUser").mockResolvedValue([]);
    vi.spyOn(Secret, "listForUser").mockResolvedValue([[], ""]);

    const app = buildTestApp();
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: "/trpc/settings.list"
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const data = body.result?.data?.json ?? body.result?.data;
    expect(Array.isArray(data.settings)).toBe(true);
    expect(data.settings.length).toBeGreaterThan(0);
    // Sanity check a well-known registry entry.
    const openai = data.settings.find(
      (s: { env_var: string }) => s.env_var === "OPENAI_API_KEY"
    );
    expect(openai).toBeDefined();
    expect(openai.is_secret).toBe(true);
    await app.close();
  });
});

describe("tRPC /trpc/collections.list over Fastify", () => {
  it("returns the empty list shape when no collections exist", async () => {
    vi.spyOn(vectorstore, "getDefaultVectorProvider").mockReturnValue({
      listCollections: vi.fn().mockResolvedValue([]),
      getCollection: vi.fn()
    } as unknown as ReturnType<typeof vectorstore.getDefaultVectorProvider>);

    const app = buildTestApp();
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: "/trpc/collections.list"
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const data = body.result?.data?.json ?? body.result?.data;
    expect(data).toEqual({ collections: [], count: 0 });
    await app.close();
  });
});

describe("tRPC /trpc/skills.list over Fastify", () => {
  it("returns the skills list shape", async () => {
    const app = buildTestApp();
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: "/trpc/skills.list"
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const data = body.result?.data?.json ?? body.result?.data;
    expect(data).toHaveProperty("count");
    expect(data).toHaveProperty("skills");
    expect(Array.isArray(data.skills)).toBe(true);
    expect(typeof data.count).toBe("number");
    await app.close();
  });
});

describe("tRPC /trpc/users.list over Fastify", () => {
  it("rejects non-admin callers with FORBIDDEN", async () => {
    const { FileUserManager } = await import("@nodetool-ai/auth");
    vi.spyOn(FileUserManager.prototype, "listUsers").mockResolvedValue({});

    // buildTestApp sets req.userId = "test-user" — not an admin, so the
    // router's admin guard should reject with 403.
    const app = buildTestApp();
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: "/trpc/users.list"
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe("tRPC /trpc/workspace.list over Fastify", () => {
  it("returns the workspaces list shape", async () => {
    const { Workspace } = await import("@nodetool-ai/models");
    vi.spyOn(Workspace, "paginate").mockResolvedValue([[], ""]);

    const app = buildTestApp();
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: `/trpc/workspace.list?input=${encodeURIComponent(
        JSON.stringify({ json: { limit: 10 } })
      )}`
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const data = body.result?.data?.json ?? body.result?.data;
    expect(data).toEqual({ workspaces: [], next: null });
    await app.close();
  });
});

describe("tRPC /trpc/mcpConfig.status over Fastify", () => {
  it("returns the MCP target status list", async () => {
    const app = buildTestApp();
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: "/trpc/mcpConfig.status"
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const data = body.result?.data?.json ?? body.result?.data;
    expect(data).toHaveProperty("targets");
    expect(data).toHaveProperty("defaultUrl");
    expect(Array.isArray(data.targets)).toBe(true);
    expect(data.targets).toHaveLength(3);
    for (const t of data.targets) {
      expect(["claude", "codex", "opencode"]).toContain(t.target);
    }
    await app.close();
  });
});

describe("tRPC /trpc/messages.list over Fastify", () => {
  it("returns the messages list shape", async () => {
    const { Message } = await import("@nodetool-ai/models");
    vi.spyOn(Message, "paginate").mockResolvedValue([[], ""]);

    const app = buildTestApp();
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: `/trpc/messages.list?input=${encodeURIComponent(
        JSON.stringify({ json: { thread_id: "t1", limit: 50 } })
      )}`
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const data = body.result?.data?.json ?? body.result?.data;
    expect(data).toEqual({ messages: [], next: null });
    await app.close();
  });
});

describe("tRPC /trpc/threads.list over Fastify", () => {
  it("returns the threads list shape", async () => {
    const { Thread } = await import("@nodetool-ai/models");
    vi.spyOn(Thread, "paginate").mockResolvedValue([[], ""]);

    const app = buildTestApp();
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: `/trpc/threads.list?input=${encodeURIComponent(
        JSON.stringify({ json: { limit: 10 } })
      )}`
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const data = body.result?.data?.json ?? body.result?.data;
    expect(data).toEqual({ threads: [], next: null });
    await app.close();
  });
});

describe("tRPC /trpc/jobs.list over Fastify", () => {
  it("returns the jobs list shape", async () => {
    const { Job } = await import("@nodetool-ai/models");
    vi.spyOn(Job, "paginate").mockResolvedValue([[], ""]);

    const app = buildTestApp();
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: `/trpc/jobs.list?input=${encodeURIComponent(
        JSON.stringify({ json: { limit: 10 } })
      )}`
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const data = body.result?.data?.json ?? body.result?.data;
    expect(data).toEqual({ jobs: [], next_start_key: null });
    await app.close();
  });
});

describe("tRPC /trpc/assets.list over Fastify", () => {
  it("returns the assets list shape", async () => {
    const { Asset } = await import("@nodetool-ai/models");
    vi.spyOn(Asset, "paginate").mockResolvedValue([[], ""]);

    const app = buildTestApp();
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: `/trpc/assets.list?input=${encodeURIComponent(
        JSON.stringify({ json: { parent_id: "test-user" } })
      )}`
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const data = body.result?.data?.json ?? body.result?.data;
    expect(data).toEqual({ assets: [], next: null });
    await app.close();
  });
});

describe("tRPC /trpc/files.list over Fastify", () => {
  it("returns an array of file entries for the home directory", async () => {
    const app = buildTestApp();
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: `/trpc/files.list?input=${encodeURIComponent(
        JSON.stringify({ json: { path: "." } })
      )}`
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const data = body.result?.data?.json ?? body.result?.data;
    expect(Array.isArray(data)).toBe(true);
    if (data.length > 0) {
      expect(data[0]).toHaveProperty("name");
      expect(data[0]).toHaveProperty("is_dir");
      expect(data[0]).toHaveProperty("size");
      expect(data[0]).toHaveProperty("modified_at");
    }
    await app.close();
  });
});

describe("tRPC /trpc/storage.list over Fastify", () => {
  it("returns the storage list shape (may be empty if storage dir missing)", async () => {
    const app = buildTestApp();
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: `/trpc/storage.list?input=${encodeURIComponent(
        JSON.stringify({ json: {} })
      )}`
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const data = body.result?.data?.json ?? body.result?.data;
    expect(data).toHaveProperty("entries");
    expect(data).toHaveProperty("count");
    expect(Array.isArray(data.entries)).toBe(true);
    expect(typeof data.count).toBe("number");
    await app.close();
  });
});
