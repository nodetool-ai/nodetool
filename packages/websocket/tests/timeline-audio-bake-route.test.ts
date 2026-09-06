/**
 * `POST /api/timelines/:id/bake-audio-animation`.
 *
 * The capability itself is covered in `@nodetool-ai/agents`; what is tested
 * here is the door: the body schema refuses what the capability would have to
 * guess at, the timeline id comes off the path rather than the body, and a
 * capability refusal is a 400 with the message rather than a 500.
 *
 * Run with:
 *   npm run test --workspace=packages/websocket -- timeline-audio-bake-route
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import { ModelObserver, initTestDb } from "@nodetool-ai/models";

const adapter = new InMemoryStorageAdapter();

vi.mock("../src/lib/storage.js", () => ({
  getAssetAdapter: () => adapter,
  getTempAdapter: () => adapter
}));

/** What the stubbed capability was called with, and what it answers. */
const invoke = vi.fn<(name: string, args: Record<string, unknown>) => unknown>();

// A whole-module stub, not a partial one: `importOriginal` would load the real
// agents package, and through it the node packages, whose optional
// `@comfyorg/sdk` is not installed here. `Tool` is the one other export the
// import graph reaches (llm-nodes' agent tools subclass it).
vi.mock("@nodetool-ai/agents", () => ({
  Tool: class {},
  gateFromContext: () => ({}),
  contextSecretAvailability: () => async () => new Set<string>(),
  createCapabilityRun: () => ({
    invoke: (name: string, args: Record<string, unknown>) =>
      Promise.resolve(invoke(name, args))
  })
}));

const timelineAudioBakeRoutes = (
  await import("../src/routes/timeline-audio-bake.js")
).default;

const USER_ID = "user-1";
const TIMELINE_ID = "tl-1";

const VALID_BODY = {
  audio_clip_id: "audio-1",
  target_clip_id: "target-1",
  property: "scale",
  output_range: [1, 1.15],
  mode: "envelope",
  sensitivity: 1,
  attack_ms: 40,
  release_ms: 160,
  offset_ms: 0
} as const;

const CAPABILITY_RESULT = {
  timeline_id: TIMELINE_ID,
  updated_at: "2026-01-01T00:00:00.000Z",
  clip_id: "target-1",
  property: "scale",
  mode: "envelope",
  animationId: "anim-1",
  keyframeCount: 42,
  analyzed: { fromMs: 0, toMs: 4000 },
  truncated: false,
  replaced: false
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
  await app.register(timelineAudioBakeRoutes, { apiOptions: {} });
  await app.ready();
  return app;
}

const post = (server: FastifyInstance, payload: unknown) =>
  server.inject({
    method: "POST",
    url: `/api/timelines/${TIMELINE_ID}/bake-audio-animation`,
    headers: { "content-type": "application/json" },
    payload: JSON.stringify(payload)
  });

describe("POST /api/timelines/:id/bake-audio-animation", () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    initTestDb();
    invoke.mockReset();
    server = await buildServer();
  });

  afterEach(async () => {
    await server.close();
    ModelObserver.clear();
  });

  it("bakes and returns the capability's result", async () => {
    invoke.mockReturnValue(CAPABILITY_RESULT);

    const res = await post(server, VALID_BODY);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(CAPABILITY_RESULT);
    expect(invoke).toHaveBeenCalledWith("bake_audio_animation", {
      ...VALID_BODY,
      output_range: [1, 1.15],
      timeline_id: TIMELINE_ID
    });
  });

  it("refuses a body missing the target clip", async () => {
    const { target_clip_id: _omitted, ...body } = VALID_BODY;

    const res = await post(server, body);

    expect(res.statusCode).toBe(400);
    expect(String(res.json().detail)).toContain("target_clip_id");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("refuses a property the bake cannot drive", async () => {
    const res = await post(server, { ...VALID_BODY, property: "rotation" });

    expect(res.statusCode).toBe(400);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("refuses an output range that is not two numbers", async () => {
    const res = await post(server, { ...VALID_BODY, output_range: [1] });

    expect(res.statusCode).toBe(400);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("reports a capability refusal as 400 with its message", async () => {
    invoke.mockReturnValue({ error: 'No clip matching "audio-1".' });

    const res = await post(server, VALID_BODY);

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ detail: 'No clip matching "audio-1".' });
  });
});
