/**
 * Tests for the /api/timeline REST endpoints.
 *
 * Uses Fastify's inject() API to make requests against a minimal Fastify app
 * that registers the timelineRoutes plugin.  The test database is reset before
 * each test so cases are isolated.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { initTestDb } from "@nodetool-ai/models";
import timelineRoutes from "../src/routes/timeline.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorateRequest("userId", null);

  // Simplified auth hook: honour x-user-id header, default to "test-user"
  app.addHook("onRequest", async (req) => {
    req.userId =
      (req.headers["x-user-id"] as string | undefined) ?? "test-user";
  });

  // Parse body as JSON for content-type application/json
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_req, body, done) => {
      try {
        done(null, JSON.parse(body as string));
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  );

  await app.register(timelineRoutes);
  await app.ready();
  return app;
}

/** App with no auth (userId stays null) — used to test 401 responses. */
async function buildUnauthApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorateRequest("userId", null);
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_req, body, done) => {
      try {
        done(null, JSON.parse(body as string));
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  );
  await app.register(timelineRoutes);
  await app.ready();
  return app;
}

async function json(res: { body: string }): Promise<unknown> {
  return JSON.parse(res.body);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("401 Unauthorized (missing auth)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    initTestDb();
    app = await buildUnauthApp();
  });

  afterEach(() => app.close());

  it("GET /api/timeline returns 401 when userId is not set", async () => {
    const res = await app.inject({ method: "GET", url: "/api/timeline" });
    expect(res.statusCode).toBe(401);
  });

  it("POST /api/timeline returns 401 when userId is not set", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/timeline",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "X", projectId: "p" })
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("GET /api/timeline (list)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    initTestDb();
    app = await buildApp();
  });

  afterEach(() => app.close());

  it("returns an empty array when no sequences exist", async () => {
    const res = await app.inject({ method: "GET", url: "/api/timeline" });
    expect(res.statusCode).toBe(200);
    expect(await json(res)).toEqual([]);
  });

  it("filters by projectId when provided", async () => {
    // Create two sequences in different projects
    await app.inject({
      method: "POST",
      url: "/api/timeline",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Seq A",
        projectId: "project-1"
      })
    });
    await app.inject({
      method: "POST",
      url: "/api/timeline",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Seq B",
        projectId: "project-2"
      })
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/timeline?projectId=project-1"
    });
    expect(res.statusCode).toBe(200);
    const items = (await json(res)) as Array<{ name: string }>;
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("Seq A");
  });
});

describe("POST /api/timeline (create)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    initTestDb();
    app = await buildApp();
  });

  afterEach(() => app.close());

  it("creates a sequence with defaults", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/timeline",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "My Sequence", projectId: "proj-x" })
    });
    expect(res.statusCode).toBe(201);
    const body = (await json(res)) as Record<string, unknown>;
    expect(typeof body.id).toBe("string");
    expect(body.name).toBe("My Sequence");
    expect(body.fps).toBe(30);
    expect(body.width).toBe(1920);
    expect(body.height).toBe(1080);
    expect(Array.isArray(body.tracks)).toBe(true);
    expect(Array.isArray(body.clips)).toBe(true);
  });

  it("returns 400 when name is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/timeline",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: "proj-x" })
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("GET /api/timeline/:id (get by id)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    initTestDb();
    app = await buildApp();
  });

  afterEach(() => app.close());

  it("returns 404 for an unknown id", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/timeline/does-not-exist"
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 404 when sequence belongs to another user", async () => {
    // Create under user-A
    const created = await app.inject({
      method: "POST",
      url: "/api/timeline",
      headers: {
        "content-type": "application/json",
        "x-user-id": "user-a"
      },
      body: JSON.stringify({ name: "Private", projectId: "p1" })
    });
    const { id } = (await json(created)) as { id: string };

    // Fetch as user-B
    const res = await app.inject({
      method: "GET",
      url: `/api/timeline/${id}`,
      headers: { "x-user-id": "user-b" }
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns the sequence for the owning user", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/timeline",
      headers: {
        "content-type": "application/json",
        "x-user-id": "user-c"
      },
      body: JSON.stringify({ name: "Mine", projectId: "p2" })
    });
    const { id } = (await json(created)) as { id: string };

    const res = await app.inject({
      method: "GET",
      url: `/api/timeline/${id}`,
      headers: { "x-user-id": "user-c" }
    });
    expect(res.statusCode).toBe(200);
    const body = (await json(res)) as Record<string, unknown>;
    expect(body.id).toBe(id);
    expect(body.name).toBe("Mine");
  });
});

describe("PATCH /api/timeline/:id", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    initTestDb();
    app = await buildApp();
  });

  afterEach(() => app.close());

  it("patches name and fps", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/timeline",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Original", projectId: "p" })
    });
    const { id } = (await json(created)) as { id: string };

    const res = await app.inject({
      method: "PATCH",
      url: `/api/timeline/${id}`,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Updated", fps: 60 })
    });
    expect(res.statusCode).toBe(200);
    const body = (await json(res)) as Record<string, unknown>;
    expect(body.name).toBe("Updated");
    expect(body.fps).toBe(60);
  });

  it("returns 400 for malformed document (missing tracks array)", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/timeline",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Bad", projectId: "p" })
    });
    const { id } = (await json(created)) as { id: string };

    const res = await app.inject({
      method: "PATCH",
      url: `/api/timeline/${id}`,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ document: { tracks: "not-an-array", clips: [], markers: [] } })
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 409 when If-Match header is stale", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/timeline",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Stale", projectId: "p" })
    });
    const { id } = (await json(created)) as { id: string };

    // Patch with a stale updatedAt
    const res = await app.inject({
      method: "PATCH",
      url: `/api/timeline/${id}`,
      headers: {
        "content-type": "application/json",
        "if-match": "1970-01-01T00:00:00.000Z"
      },
      body: JSON.stringify({ name: "Conflict" })
    });
    expect(res.statusCode).toBe(409);
  });

  it("returns 404 for an unknown id", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/timeline/no-such-id",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Nope" })
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("DELETE /api/timeline/:id", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    initTestDb();
    app = await buildApp();
  });

  afterEach(() => app.close());

  it("deletes a sequence and returns 204", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/timeline",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "ToDelete", projectId: "p" })
    });
    const { id } = (await json(created)) as { id: string };

    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/api/timeline/${id}`
    });
    expect(deleteRes.statusCode).toBe(204);

    const getRes = await app.inject({
      method: "GET",
      url: `/api/timeline/${id}`
    });
    expect(getRes.statusCode).toBe(404);
  });

  it("returns 404 for an unknown id", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/timeline/ghost"
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("Clip version endpoints", () => {
  let app: FastifyInstance;
  let sequenceId: string;
  const clipId = "clip-abc";

  beforeEach(async () => {
    initTestDb();
    app = await buildApp();

    // Create a sequence with one clip
    const doc = {
      tracks: [],
      markers: [],
      clips: [
        {
          id: clipId,
          trackId: "track-1",
          name: "Clip A",
          startMs: 0,
          durationMs: 1000,
          mediaType: "video",
          sourceType: "generated",
          status: "draft",
          locked: false,
          versions: []
        }
      ]
    };
    const created = await app.inject({
      method: "POST",
      url: "/api/timeline",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Seq", projectId: "proj" })
    });
    const seq = (await json(created)) as { id: string };
    sequenceId = seq.id;

    // Patch the document to include our clip
    await app.inject({
      method: "PATCH",
      url: `/api/timeline/${sequenceId}`,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ document: doc })
    });
  });

  afterEach(() => app.close());

  it("GET returns empty versions array initially", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/timeline/${sequenceId}/clips/${clipId}/versions`
    });
    expect(res.statusCode).toBe(200);
    expect(await json(res)).toEqual([]);
  });

  it("POST appends a new clip version", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/timeline/${sequenceId}/clips/${clipId}/versions`,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jobId: "job-1",
        assetId: "asset-1",
        dependencyHash: "abc123",
        workflowUpdatedAt: "2024-01-01T00:00:00.000Z",
        paramOverridesSnapshot: {}
      })
    });
    expect(res.statusCode).toBe(201);
    const version = (await json(res)) as Record<string, unknown>;
    expect(typeof version.id).toBe("string");
    expect(version.jobId).toBe("job-1");
    expect(version.status).toBe("success");

    // GET should now return the version
    const getRes = await app.inject({
      method: "GET",
      url: `/api/timeline/${sequenceId}/clips/${clipId}/versions`
    });
    const versions = (await json(getRes)) as unknown[];
    expect(versions).toHaveLength(1);
  });

  it("returns 404 for an unknown clipId", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/timeline/${sequenceId}/clips/no-such-clip/versions`
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 400 for missing required fields on POST versions", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/timeline/${sequenceId}/clips/${clipId}/versions`,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId: "j1" }) // missing assetId, dependencyHash, etc.
    });
    expect(res.statusCode).toBe(400);
  });
});
