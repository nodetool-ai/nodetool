/**
 * `POST /api/timelines/:id/isolate-subject`.
 *
 * The capability itself is covered in `@nodetool-ai/agents`; what is tested
 * here is the door: the body schema refuses a value the endpoint would reject,
 * the timeline id comes off the path rather than the body, a refusal is a 400
 * with the message, and a generation that *ran* and failed is still a 200 —
 * the client has to be able to tell "the call was never worth making" from
 * "the provider failed and your previous matte is still there".
 *
 * Run with:
 *   npm run test --workspace=packages/websocket -- timeline-isolate-subject-route
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import { ModelObserver, initTestDb } from "@nodetool-ai/models";

const adapter = new InMemoryStorageAdapter();

vi.mock("../src/lib/storage.js", () => ({
  getAssetAdapter: () => adapter,
  getTempAdapter: () => adapter
}));

/** What the stubbed capability was called with, and what it answers. */
const invoke = vi.fn<(name: string, args: Record<string, unknown>) => unknown>();

/** The registry the route passed to the run, so the wiring is asserted. */
let seenRegistry: unknown;

// A whole-module stub, not a partial one: `importOriginal` would load the real
// agents package, and through it the node packages, whose optional
// `@comfyorg/sdk` is not installed here. `Tool` is the one other export the
// import graph reaches (llm-nodes' agent tools subclass it).
vi.mock("@nodetool-ai/agents", () => ({
  Tool: class {},
  UNGATED: {},
  createCapabilityRun: (options: { nodeRegistry?: unknown }) => {
    seenRegistry = options.nodeRegistry;
    return {
      invoke: (name: string, args: Record<string, unknown>) =>
        Promise.resolve(invoke(name, args))
    };
  }
}));

const timelineIsolateSubjectRoutes = (
  await import("../src/routes/timeline-isolate-subject.js")
).default;

const USER_ID = "user-1";
const TIMELINE_ID = "tl-1";

/** Stands in for the server's registry; the stubbed run never reads it. */
const REGISTRY = { has: () => true } as unknown as NodeRegistry;

const VALID_BODY = {
  clip_id: "clip-1",
  model: "Matting",
  operating_resolution: "2048x2048",
  refine_foreground: true,
  regenerate: false
} as const;

const CAPABILITY_RESULT = {
  timeline_id: TIMELINE_ID,
  clip_id: "clip-1",
  status: "ready",
  source_range: { fromMs: 0, toMs: 9000 },
  reused: false,
  asset_id: "asset_mask_new",
  generation_id: "gen_1",
  cost_usd: 0.42
};

async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorateRequest("userId", null);
  app.addHook("onRequest", async (req) => {
    req.userId = USER_ID;
  });
  // The real server hands every body to the Web API handlers as a raw Buffer.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser("*", { parseAs: "buffer" }, (_req, body, done) => {
    done(null, body);
  });
  await app.register(timelineIsolateSubjectRoutes, {
    apiOptions: { registry: REGISTRY }
  });
  await app.ready();
  return app;
}

const post = (server: FastifyInstance, payload: unknown) =>
  server.inject({
    method: "POST",
    url: `/api/timelines/${TIMELINE_ID}/isolate-subject`,
    headers: { "content-type": "application/json" },
    payload: JSON.stringify(payload)
  });

describe("POST /api/timelines/:id/isolate-subject", () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    initTestDb();
    invoke.mockReset();
    seenRegistry = undefined;
    server = await buildServer();
  });

  afterEach(async () => {
    await server.close();
    ModelObserver.clear();
  });

  it("isolates and returns the capability's result", async () => {
    invoke.mockReturnValue(CAPABILITY_RESULT);

    const res = await post(server, VALID_BODY);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(CAPABILITY_RESULT);
    expect(invoke).toHaveBeenCalledWith("isolate_subject", {
      ...VALID_BODY,
      timeline_id: TIMELINE_ID
    });
  });

  it("gives the run the server's node registry — the provider call needs one", async () => {
    invoke.mockReturnValue(CAPABILITY_RESULT);

    await post(server, VALID_BODY);

    expect(seenRegistry).toBe(REGISTRY);
  });

  it("takes a body naming only the clip and lets the capability default the rest", async () => {
    invoke.mockReturnValue(CAPABILITY_RESULT);

    const res = await post(server, { clip_id: "clip-1" });

    expect(res.statusCode).toBe(200);
    expect(invoke).toHaveBeenCalledWith("isolate_subject", {
      clip_id: "clip-1",
      timeline_id: TIMELINE_ID
    });
  });

  it("refuses a body with no clip", async () => {
    const res = await post(server, { regenerate: true });

    expect(res.statusCode).toBe(400);
    expect(String(res.json().detail)).toContain("clip_id");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("refuses a model the endpoint does not offer", async () => {
    const res = await post(server, { ...VALID_BODY, model: "Best One" });

    expect(res.statusCode).toBe(400);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("refuses a resolution the endpoint does not offer", async () => {
    const res = await post(server, {
      ...VALID_BODY,
      operating_resolution: "4096x4096"
    });

    expect(res.statusCode).toBe(400);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("reports a capability refusal as 400 with its message", async () => {
    invoke.mockReturnValue({ error: 'No clip matching "clip-1".' });

    const res = await post(server, VALID_BODY);

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ detail: 'No clip matching "clip-1".' });
  });

  it("returns a failed generation as 200 — the previous matte is still there", async () => {
    invoke.mockReturnValue({
      timeline_id: TIMELINE_ID,
      clip_id: "clip-1",
      status: "failed",
      source_range: { fromMs: 0, toMs: 9000 },
      reused: false,
      error: "fal: 500 upstream"
    });

    const res = await post(server, VALID_BODY);

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("failed");
  });
});
