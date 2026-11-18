/**
 * The receive API (WP2.5): the tRPC `receive` router and the REST route that
 * serves a file's bytes, with the server's real access rules and reference
 * sets. The service itself is tested on SQLite and PostgreSQL in
 * `@nodetool-ai/project-services` (tests/cloud-receive.test.ts).
 */
import { createHash, randomBytes } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Asset, initTestDb, Project, Workflow } from "@nodetool-ai/models";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import { blobKey } from "@nodetool-ai/asset-services/blob-store";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

const storage = new InMemoryStorageAdapter();

vi.mock("../src/lib/storage.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/storage.js")>()),
  getAssetAdapter: () => storage
}));

const { default: receiveRoutes } = await import("../src/routes/receive.js");

const createCaller = createCallerFactory(appRouter);

// The REST route reads the user from the bridge, which falls back to the
// local user "1" when no authentication ran.
const USER = "1";

function makeCtx(userId: string): Context {
  return {
    userId,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  } as Context;
}

function id(): string {
  return randomBytes(16).toString("hex");
}

async function routeApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(receiveRoutes, { apiOptions: {} as never });
  return app;
}

/** A cloud project of USER with one workflow that shows one stored file. */
async function projectWithFile(): Promise<{ projectId: string; workflowId: string; hash: string; bytes: Buffer }> {
  const projectId = id();
  await Project.create<Project>({ id: projectId, user_id: USER, name: "Film", kind: "project" });
  const bytes = randomBytes(48);
  const hash = createHash("sha256").update(bytes).digest("hex");
  await storage.store(blobKey(hash), new Uint8Array(bytes));
  const asset = await Asset.create<Asset>({
    id: id(),
    user_id: USER,
    project_id: projectId,
    name: "still.png",
    content_type: "image/png",
    size: bytes.byteLength,
    content_hash: hash
  });
  const workflow = await Workflow.create<Workflow>({
    id: id(),
    user_id: USER,
    project_id: projectId,
    name: "Edit",
    access: "private",
    graph: {
      nodes: [{ id: "n1", type: "nodetool.constant.Image", data: { value: { type: "image", asset_id: asset.id } } }],
      edges: []
    }
  });
  return { projectId, workflowId: workflow.id, hash, bytes };
}

describe("receive API", () => {
  let app: FastifyInstance | undefined;

  beforeEach(() => {
    initTestDb();
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("captures a set, serves the document and the file, and releases it", async () => {
    const { projectId, workflowId, hash, bytes } = await projectWithFile();
    const caller = createCaller(makeCtx(USER));

    const set = await caller.receive.capture({ project_id: projectId });
    expect(set.documents).toHaveLength(1);
    expect(set.documents[0]).toMatchObject({
      kind: "workflow",
      document_id: workflowId,
      files: [{ hash, size: bytes.byteLength }],
      missing_files: []
    });
    const document = await caller.receive.document({ set_id: set.set_id, kind: "workflow", document_id: workflowId });
    expect(document.content_hash).toBe(set.documents[0]?.content_hash);

    app = await routeApp();
    const file = await app.inject({ method: "GET", url: `/api/receive/${set.set_id}/files/${hash}` });
    expect(file.statusCode).toBe(200);
    expect(file.rawPayload.equals(bytes)).toBe(true);

    const other = await app.inject({ method: "GET", url: `/api/receive/${set.set_id}/files/${"0".repeat(64)}` });
    expect(other.statusCode).toBe(404);

    expect(await caller.receive.release({ set_id: set.set_id })).toEqual({ released: true });
    const released = await app.inject({ method: "GET", url: `/api/receive/${set.set_id}/files/${hash}` });
    expect(released.statusCode).toBe(409);
    expect(released.json()).toMatchObject({ code: "REVISION_SET_EXPIRED" });
    await expect(
      caller.receive.document({ set_id: set.set_id, kind: "workflow", document_id: workflowId })
    ).rejects.toMatchObject({ cause: { apiCode: "REVISION_SET_EXPIRED" } });
  });

  it("answers 410 ERASED for freed bytes, and refuses a person without access", async () => {
    const { projectId, hash } = await projectWithFile();
    const set = await createCaller(makeCtx(USER)).receive.capture({ project_id: projectId });
    await storage.delete(storage.uriForKey(blobKey(hash)));

    app = await routeApp();
    const erased = await app.inject({ method: "GET", url: `/api/receive/${set.set_id}/files/${hash}` });
    expect(erased.statusCode).toBe(410);
    expect(erased.json()).toMatchObject({ code: "ERASED" });

    await expect(
      createCaller(makeCtx("someone-else")).receive.capture({ project_id: projectId })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
