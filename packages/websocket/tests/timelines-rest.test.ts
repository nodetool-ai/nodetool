/**
 * REST routes for the timeline zip — `GET /api/timelines/:id/export-zip` and
 * `POST /api/timelines/import-zip`.
 *
 * Run with:
 *   npm run test --workspace=packages/websocket -- timelines-rest
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import {
  Asset,
  ModelObserver,
  TimelineSequence,
  initTestDb
} from "@nodetool-ai/models";

const adapter = new InMemoryStorageAdapter();

vi.mock("../src/lib/storage.js", () => ({
  getAssetAdapter: () => adapter,
  getTempAdapter: () => adapter
}));

const timelinesRoutes = (await import("../src/routes/timelines.js")).default;
const { unpackTimelineBundle } = await import("../src/lib/timeline-bundle.js");

const USER_ID = "user-1";
const VIDEO = new Uint8Array([1, 2, 3, 4]);

async function buildServer(userId: string | null): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorateRequest("userId", null);
  app.addHook("onRequest", async (req) => {
    req.userId = userId;
  });
  // The real server parses every body as a raw Buffer and lets the Web API
  // handlers do their own parsing; multipart depends on it.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser("*", { parseAs: "buffer" }, (_req, body, done) => {
    done(null, body);
  });
  await app.register(timelinesRoutes, { apiOptions: {} });
  await app.ready();
  return app;
}

/** An asset row whose bytes live under the owner-prefixed key. */
async function seedAsset(userId = USER_ID): Promise<Asset> {
  const asset = (await Asset.create({
    user_id: userId,
    name: "shot.mp4",
    content_type: "video/mp4",
    parent_id: userId
  })) as Asset;
  await adapter.store(`${userId}/${asset.id}.mp4`, VIDEO, "video/mp4");
  return asset;
}

async function seedTimeline(
  userId: string,
  assetId: string
): Promise<TimelineSequence> {
  const seq = new TimelineSequence({
    user_id: userId,
    project_id: "p1",
    name: "My Cut",
    fps: 30,
    width: 1920,
    height: 1080
  });
  seq.fromDocument({
    tracks: [
      {
        id: "t1",
        name: "V1",
        type: "video",
        index: 0,
        visible: true,
        locked: false
      }
    ],
    clips: [
      {
        id: "c1",
        trackId: "t1",
        name: "Shot 1",
        startMs: 0,
        durationMs: 2000,
        mediaType: "video",
        sourceType: "generated",
        status: "generated",
        locked: false,
        versions: [],
        currentAssetId: assetId
      }
    ],
    markers: [],
    transcript: []
  });
  seq.duration_ms = 2000;
  await seq.save();
  return seq;
}

/** Serialize a multipart form the way a browser upload arrives. */
async function multipart(
  fields: Record<string, string>,
  file: { name: string; bytes: Uint8Array }
): Promise<{ payload: Buffer; headers: Record<string, string> }> {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    form.set(key, value);
  }
  form.set(
    "file",
    new File([file.bytes], file.name, { type: "application/zip" })
  );
  const request = new Request("http://localhost/upload", {
    method: "POST",
    body: form
  });
  return {
    payload: Buffer.from(await request.arrayBuffer()),
    headers: { "content-type": request.headers.get("content-type") ?? "" }
  };
}

describe("timeline zip routes", () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    initTestDb();
    for (const entry of (await adapter.list("")).entries) {
      await adapter.delete(adapter.uriForKey(entry.key));
    }
    server = await buildServer(USER_ID);
  });

  afterEach(async () => {
    await server.close();
    ModelObserver.clear();
  });

  it("exports a zip carrying the clip's asset bytes", async () => {
    const asset = await seedAsset();
    const seq = await seedTimeline(USER_ID, asset.id);

    const res = await server.inject({
      url: `/api/timelines/${seq.id}/export-zip`
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
    expect(res.headers["content-disposition"]).toBe(
      'attachment; filename="My_Cut.zip"'
    );

    const bundle = unpackTimelineBundle(new Uint8Array(res.rawPayload));
    expect(bundle.timeline.name).toBe("My Cut");
    expect(bundle.manifest.assets).toHaveLength(1);
    expect(bundle.manifest.assets[0].asset_id).toBe(asset.id);
    expect(bundle.manifest.missing_assets).toEqual([]);
    const [packed] = [...bundle.assets.values()];
    expect(packed).toEqual(VIDEO);
  });

  it("answers 404 for a timeline owned by someone else", async () => {
    const asset = await seedAsset("user-2");
    const seq = await seedTimeline("user-2", asset.id);

    const res = await server.inject({
      url: `/api/timelines/${seq.id}/export-zip`
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ detail: "Timeline not found" });
  });

  it("imports a bundle into a new timeline pointing at newly stored bytes", async () => {
    const asset = await seedAsset();
    const seq = await seedTimeline(USER_ID, asset.id);
    const exported = await server.inject({
      url: `/api/timelines/${seq.id}/export-zip`
    });

    const { payload, headers } = await multipart(
      { project_id: "p2", name: "Imported cut" },
      { name: "cut.zip", bytes: new Uint8Array(exported.rawPayload) }
    );
    const res = await server.inject({
      method: "POST",
      url: "/api/timelines/import-zip",
      payload,
      headers
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.imported).toBe(1);
    expect(body.missing).toEqual([]);
    expect(body.checksum_mismatches).toEqual([]);
    expect(body.timeline.id).not.toBe(seq.id);
    expect(body.timeline.projectId).toBe("p2");
    expect(body.timeline.name).toBe("Imported cut");
    expect(body.timeline.durationMs).toBe(2000);

    const newAssetId = body.timeline.clips[0].currentAssetId;
    expect(newAssetId).not.toBe(asset.id);
    const stored = (await Asset.get(newAssetId)) as Asset | null;
    expect(stored?.user_id).toBe(USER_ID);
    expect(
      await adapter.retrieve(adapter.uriForKey(`${USER_ID}/${newAssetId}.mp4`))
    ).toEqual(VIDEO);
  });

  it("defaults the project to `default` when the form omits it", async () => {
    const asset = await seedAsset();
    const seq = await seedTimeline(USER_ID, asset.id);
    const exported = await server.inject({
      url: `/api/timelines/${seq.id}/export-zip`
    });

    const { payload, headers } = await multipart(
      {},
      { name: "cut.zip", bytes: new Uint8Array(exported.rawPayload) }
    );
    const res = await server.inject({
      method: "POST",
      url: "/api/timelines/import-zip",
      payload,
      headers
    });

    expect(res.json().timeline.projectId).toBe("default");
    expect(res.json().timeline.name).toBe("My Cut");
  });

  it("answers 400 for an archive it cannot read", async () => {
    const { payload, headers } = await multipart(
      {},
      { name: "junk.zip", bytes: new Uint8Array([1, 2, 3, 4, 5]) }
    );
    const res = await server.inject({
      method: "POST",
      url: "/api/timelines/import-zip",
      payload,
      headers
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().detail).toMatch(/^Invalid bundle: /);
  });

  it("answers 400 when the upload carries no file part", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/timelines/import-zip",
      payload: Buffer.from("{}"),
      headers: { "content-type": "application/json" }
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      detail: "A multipart form with a `file` part is required"
    });
  });
});
