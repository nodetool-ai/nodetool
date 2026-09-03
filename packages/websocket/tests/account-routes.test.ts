/**
 * `GET /api/account/export` and `DELETE /api/account` — the DSR door.
 *
 * Real database, real storage adapter, real library calls. What is worth
 * pinning here is not that the library works (its own suite does that) but
 * that the HTTP surface cannot be pointed at anybody but the caller, and that
 * an irreversible operation needs a deliberate confirmation to happen.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import {
  Asset,
  Secret,
  UserEventType,
  WITHHELD_VALUE,
  Workflow,
  initTestDb,
  listUserEvents
} from "@nodetool-ai/models";
import {
  FileStorageAdapter,
  type StorageAdapter,
  type StorageListResult
} from "@nodetool-ai/storage";

import accountRoutes, {
  ERASURE_CONFIRMATION,
  assetErasureStore
} from "../src/routes/account.js";

const USER_A = "user-a";
const USER_B = "user-b";

interface ErasureTableReport {
  table: string;
  deleted: number;
  redacted: number;
  retained: number;
}

interface ErasureBody {
  requestId: string;
  report: {
    userId: string;
    deleted: number;
    redacted: number;
    retained: number;
    tables: ErasureTableReport[];
    objectKeysDeleted: string[] | null;
  };
}

interface ExportBody {
  format: string;
  subjectUserId: string;
  tables: Record<string, { rowCount: number; rows: Record<string, unknown>[] }>;
}

async function buildServer(
  userId: string | null,
  storage: StorageAdapter
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorateRequest("userId", null);
  app.addHook("onRequest", async (req) => {
    req.userId = userId;
  });
  await app.register(accountRoutes, { apiOptions: {}, storage });
  await app.ready();
  return app;
}

async function seedUser(
  userId: string,
  storage: StorageAdapter
): Promise<void> {
  await new Workflow({
    user_id: userId,
    name: `${userId} workflow`,
    graph: { nodes: [], edges: [] }
  }).save();
  await new Asset({
    user_id: userId,
    name: `${userId}.png`,
    content_type: "image/png"
  }).save();
  await new Secret({
    user_id: userId,
    key: "OPENAI_API_KEY",
    encrypted_value: `ciphertext-for-${userId}`
  }).save();
  await storage.store(`${userId}/object.bin`, new Uint8Array([1, 2, 3]));
}

async function workflowCount(userId: string): Promise<number> {
  const [rows] = await Workflow.paginate(userId, { limit: 100 });
  return rows.length;
}

describe("account DSR routes", () => {
  let app: FastifyInstance | null = null;
  let dir = "";
  let storage: StorageAdapter;

  beforeEach(async () => {
    await initTestDb();
    dir = await mkdtemp(join(tmpdir(), "account-routes-"));
    storage = new FileStorageAdapter(dir);
    await seedUser(USER_A, storage);
    await seedUser(USER_B, storage);
  });

  afterEach(async () => {
    await app?.close();
    app = null;
    await rm(dir, { recursive: true, force: true });
  });

  // ── Export ─────────────────────────────────────────────────────────

  it("exports the caller's own rows and withholds credential values", async () => {
    app = await buildServer(USER_A, storage);

    const response = await app.inject({
      method: "GET",
      url: "/api/account/export"
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-disposition"]).toMatch(
      /^attachment; filename="nodetool-personal-data-export-\d{4}-\d{2}-\d{2}\.json"$/
    );
    const body = response.json() as ExportBody;
    expect(body.format).toBe("nodetool.personal-data-export/1");
    expect(body.subjectUserId).toBe(USER_A);

    const workflows = body.tables.nodetool_workflows;
    expect(workflows.rowCount).toBe(1);
    expect(workflows.rows[0]?.user_id).toBe(USER_A);

    const secrets = body.tables.nodetool_secrets;
    expect(secrets.rowCount).toBe(1);
    expect(secrets.rows[0]?.key).toBe("OPENAI_API_KEY");
    // The record is visible; the credential is not.
    expect(secrets.rows[0]?.encrypted_value).toBe(WITHHELD_VALUE);
    expect(JSON.stringify(body)).not.toContain(`ciphertext-for-${USER_A}`);
  });

  it("records data_export_requested for the caller", async () => {
    app = await buildServer(USER_A, storage);
    await app.inject({ method: "GET", url: "/api/account/export" });

    const events = await listUserEvents(USER_A, {
      eventTypes: [UserEventType.DATA_EXPORT_REQUESTED]
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.metadata?.format).toBe(
      "nodetool.personal-data-export/1"
    );
    expect(typeof events[0]?.metadata?.request_id).toBe("string");
    expect(
      await listUserEvents(USER_B, {
        eventTypes: [UserEventType.DATA_EXPORT_REQUESTED]
      })
    ).toHaveLength(0);
  });

  it("refuses an unauthenticated export", async () => {
    app = await buildServer(null, storage);
    const response = await app.inject({
      method: "GET",
      url: "/api/account/export"
    });
    expect(response.statusCode).toBe(401);
  });

  // ── Cross-user access ──────────────────────────────────────────────
  //
  // The security test that matters. There is no subject parameter anywhere in
  // these routes, so the only thing an attacker can try is to smuggle one in
  // through a channel the handler might read. Every channel is tried here.

  it("cannot export another user, whatever the request claims", async () => {
    app = await buildServer(USER_B, storage);

    const response = await app.inject({
      method: "GET",
      url: `/api/account/export?userId=${USER_A}&user_id=${USER_A}&subject=${USER_A}`,
      headers: {
        "x-user-id": USER_A,
        "x-nodetool-user-id": USER_A,
        "x-forwarded-user": USER_A
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as ExportBody;
    expect(body.subjectUserId).toBe(USER_B);
    expect(body.tables.nodetool_workflows.rows[0]?.user_id).toBe(USER_B);
    // Nothing of user A's anywhere in the payload.
    expect(JSON.stringify(body)).not.toContain(`${USER_A} workflow`);
    expect(JSON.stringify(body)).not.toContain(`ciphertext-for-${USER_A}`);
  });

  it("cannot erase another user, whatever the request claims", async () => {
    app = await buildServer(USER_B, storage);

    const response = await app.inject({
      method: "DELETE",
      url: `/api/account?userId=${USER_A}&user_id=${USER_A}`,
      headers: { "x-user-id": USER_A, "x-forwarded-user": USER_A },
      payload: { confirm: ERASURE_CONFIRMATION }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as ErasureBody;
    expect(body.report.userId).toBe(USER_B);

    // User A is untouched: rows, credential and bytes all still there.
    expect(await workflowCount(USER_A)).toBe(1);
    expect(await workflowCount(USER_B)).toBe(0);
    expect(await Secret.find(USER_A, "OPENAI_API_KEY")).not.toBeNull();
    expect(await Secret.find(USER_B, "OPENAI_API_KEY")).toBeNull();
    expect(
      await storage.exists(storage.uriForKey(`${USER_A}/object.bin`))
    ).toBe(true);
    expect(
      await storage.exists(storage.uriForKey(`${USER_B}/object.bin`))
    ).toBe(false);
  });

  it("rejects a subject id smuggled into the erase body", async () => {
    app = await buildServer(USER_B, storage);

    const response = await app.inject({
      method: "DELETE",
      url: "/api/account",
      payload: { confirm: ERASURE_CONFIRMATION, userId: USER_A }
    });

    expect(response.statusCode).toBe(400);
    expect(await workflowCount(USER_A)).toBe(1);
    expect(await workflowCount(USER_B)).toBe(1);
  });

  // ── The confirmation gate ──────────────────────────────────────────

  it.each([
    ["no body at all", undefined],
    ["an empty object", {}],
    ["a near-miss phrase", { confirm: "delete my account" }],
    ["a truthy non-phrase", { confirm: true }]
  ])("refuses erasure with %s", async (_label, payload) => {
    app = await buildServer(USER_A, storage);

    const response = await app.inject(
      payload === undefined
        ? { method: "DELETE", url: "/api/account" }
        : { method: "DELETE", url: "/api/account", payload }
    );

    expect(response.statusCode).toBe(400);
    expect((response.json() as { detail: string }).detail).toContain(
      ERASURE_CONFIRMATION
    );
    // Nothing happened.
    expect(await workflowCount(USER_A)).toBe(1);
    expect(
      await storage.exists(storage.uriForKey(`${USER_A}/object.bin`))
    ).toBe(true);
    expect(
      await listUserEvents(USER_A, {
        eventTypes: [UserEventType.DATA_ERASURE_REQUESTED]
      })
    ).toHaveLength(0);
  });

  // ── Erasure ────────────────────────────────────────────────────────

  it("reports per-table counts and deletes the caller's objects", async () => {
    app = await buildServer(USER_A, storage);

    const response = await app.inject({
      method: "DELETE",
      url: "/api/account",
      payload: { confirm: ERASURE_CONFIRMATION }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as ErasureBody;
    expect(body.report.userId).toBe(USER_A);
    expect(typeof body.requestId).toBe("string");

    const byTable = new Map(body.report.tables.map((t) => [t.table, t]));
    expect(byTable.get("nodetool_workflows")?.deleted).toBe(1);
    expect(byTable.get("nodetool_assets")?.deleted).toBe(1);
    expect(byTable.get("nodetool_secrets")?.deleted).toBe(1);
    expect(body.report.deleted).toBeGreaterThanOrEqual(3);

    // Bytes, not only rows.
    expect(body.report.objectKeysDeleted).toEqual([`${USER_A}/object.bin`]);
    expect(
      await storage.exists(storage.uriForKey(`${USER_A}/object.bin`))
    ).toBe(false);
    expect(
      await storage.exists(storage.uriForKey(`${USER_B}/object.bin`))
    ).toBe(true);
  });

  it("writes the requested event before the sweep and exactly one completed event", async () => {
    app = await buildServer(USER_A, storage);

    const response = await app.inject({
      method: "DELETE",
      url: "/api/account",
      payload: { confirm: ERASURE_CONFIRMATION }
    });
    const { requestId } = response.json() as ErasureBody;

    const requested = await listUserEvents(USER_A, {
      eventTypes: [UserEventType.DATA_ERASURE_REQUESTED]
    });
    const completed = await listUserEvents(USER_A, {
      eventTypes: [UserEventType.DATA_ERASURE_COMPLETED]
    });
    // Both survive the sweep they describe — they are its evidence.
    expect(requested).toHaveLength(1);
    expect(requested[0]?.metadata?.request_id).toBe(requestId);
    // `erasePersonalData` writes this one; the route must not write a second.
    expect(completed).toHaveLength(1);
    expect(completed[0]?.metadata?.request_id).toBe(requestId);
  });

  it("is idempotent — a second erasure succeeds and reports nothing left", async () => {
    app = await buildServer(USER_A, storage);
    const erase = () =>
      app!.inject({
        method: "DELETE",
        url: "/api/account",
        payload: { confirm: ERASURE_CONFIRMATION }
      });

    const first = (await erase()).json() as ErasureBody;
    const secondResponse = await erase();
    expect(secondResponse.statusCode).toBe(200);
    const second = secondResponse.json() as ErasureBody;

    expect(first.report.deleted).toBeGreaterThan(0);
    expect(second.report.deleted).toBe(0);
    expect(second.report.objectKeysDeleted).toEqual([]);
    expect(second.report.tables.map((t) => t.table)).toEqual(
      first.report.tables.map((t) => t.table)
    );
    expect(second.requestId).not.toBe(first.requestId);
  });
});

describe("assetErasureStore", () => {
  /**
   * S3 and Supabase match a listing prefix as a string, and `list()` strips
   * the trailing slash — so `user-1/` reaches the backend as `user-1` and the
   * response can carry `user-10/…`. The adapter must not delete those.
   */
  it("never deletes a key outside the user's own prefix", async () => {
    const deleted: string[] = [];
    const listed: StorageListResult = {
      entries: [
        { key: "user-1/a.bin", uri: "s3://b/user-1/a.bin", size: 1, modifiedAt: 0 },
        { key: "user-10/b.bin", uri: "s3://b/user-10/b.bin", size: 1, modifiedAt: 0 },
        { key: "user-1x.bin", uri: "s3://b/user-1x.bin", size: 1, modifiedAt: 0 }
      ],
      commonPrefixes: []
    };
    const adapter = {
      async list(): Promise<StorageListResult> {
        return listed;
      },
      async delete(uri: string): Promise<boolean> {
        deleted.push(uri);
        return true;
      }
    } as unknown as StorageAdapter;

    const keys = await assetErasureStore(adapter).deleteObjectsForUser("user-1");

    expect(keys).toEqual(["user-1/a.bin"]);
    expect(deleted).toEqual(["s3://b/user-1/a.bin"]);
  });
});
