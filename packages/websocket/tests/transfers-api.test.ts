/**
 * The transfer API (WP2.4): the tRPC `transfers` router and the REST route
 * that stages a file's bytes. The commit itself is tested on PostgreSQL in
 * `@nodetool-ai/project-services` (tests/cloud-transfer.test.ts).
 */
import { createHash, randomBytes } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initTestDb, readableProjectBlob } from "@nodetool-ai/models";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import { stageTransferFile } from "@nodetool-ai/project-services/cloud-transfer";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

const storage = new InMemoryStorageAdapter();

vi.mock("../src/lib/transfer-host.js", () => ({
  transferHost: () => ({
    storage,
    documentRole: async () => "owner",
    checkAttach: async () => ({ unreadable: null, toAdmit: [] }),
    published: async () => {}
  })
}));

const { default: transferRoutes } = await import("../src/routes/transfers.js");
const { transferHost } = await import("../src/lib/transfer-host.js");

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
  app.removeAllContentTypeParsers();
  app.addContentTypeParser("*", { parseAs: "buffer" }, (_req, body, done) => {
    done(null, body);
  });
  await app.register(transferRoutes, { apiOptions: {} as never });
  return app;
}

describe("transfer API", () => {
  let app: FastifyInstance | undefined;

  beforeEach(() => {
    initTestDb();
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("opens a transfer, stages a file over REST, and cancels it", async () => {
    const caller = createCaller(makeCtx(USER));
    const transferId = id();
    const projectId = id();
    const bytes = Buffer.from("staged bytes");
    const hash = createHash("sha256").update(bytes).digest("hex");
    const opened = await caller.transfers.open({
      transfer_id: transferId,
      project_id: projectId,
      first_publication: true,
      manifest: {
        project_name: "Film",
        operations: [],
        required_files: [{ asset_id: id(), hash, size: bytes.byteLength, documents: [] }]
      }
    });
    expect(opened).toEqual({ needed_hashes: [hash], allowance_bytes: null, used_bytes: 0 });

    app = await routeApp();
    const wrong = await app.inject({
      method: "PUT",
      url: `/api/transfers/${transferId}/files/${hash}`,
      headers: { "content-type": "application/octet-stream" },
      payload: Buffer.from("other bytes")
    });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json()).toMatchObject({ code: "HASH_MISMATCH" });

    const staged = await app.inject({
      method: "PUT",
      url: `/api/transfers/${transferId}/files/${hash}`,
      headers: { "content-type": "application/octet-stream" },
      payload: bytes
    });
    expect(staged.statusCode).toBe(201);
    expect(await readableProjectBlob({ projectId, hash, transferId })).not.toBeNull();

    const unknown = await app.inject({
      method: "PUT",
      url: `/api/transfers/${id()}/files/${hash}`,
      headers: { "content-type": "application/octet-stream" },
      payload: bytes
    });
    expect(unknown.statusCode).toBe(404);

    expect(await caller.transfers.status({ transfer_id: transferId })).toEqual({
      state: "open",
      project_id: projectId,
      attempts: []
    });
    expect(await caller.transfers.cancel({ transfer_id: transferId })).toEqual({ state: "cancelled" });
    expect(await readableProjectBlob({ projectId, hash, transferId })).toBeNull();
  });

  it("refuses another person's transfer and a commit on SQLite", async () => {
    const transferId = id();
    await createCaller(makeCtx(USER)).transfers.open({
      transfer_id: transferId,
      project_id: id(),
      first_publication: true,
      manifest: { operations: [], required_files: [] }
    });
    await expect(
      createCaller(makeCtx("someone-else")).transfers.status({ transfer_id: transferId })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      createCaller(makeCtx(USER)).transfers.commit({
        transfer_id: transferId,
        attempt_id: id(),
        manifest: { operations: [], required_files: [] },
        decisions: [],
        missing_files: [],
        payloads: []
      })
    ).rejects.toMatchObject({ cause: { apiCode: "SERVICE_UNAVAILABLE" } });
  });

  /** Opens a transfer of USER whose manifest lists one file with `bytes`. */
  async function openWithFile(userId: string, bytes: Buffer): Promise<{ transferId: string; hash: string }> {
    const transferId = id();
    const hash = createHash("sha256").update(bytes).digest("hex");
    await createCaller(makeCtx(userId)).transfers.open({
      transfer_id: transferId,
      project_id: id(),
      first_publication: true,
      manifest: { operations: [], required_files: [{ asset_id: id(), hash, size: bytes.byteLength, documents: [] }] }
    });
    return { transferId, hash };
  }

  it("refuses a body larger than the declared file, and a file the manifest does not list", async () => {
    const bytes = Buffer.from("staged bytes");
    const { transferId, hash } = await openWithFile(USER, bytes);
    app = await routeApp();

    const larger = await app.inject({
      method: "PUT",
      url: `/api/transfers/${transferId}/files/${hash}`,
      headers: { "content-type": "application/octet-stream" },
      payload: Buffer.concat([bytes, Buffer.from(" and more")])
    });
    expect(larger.statusCode).toBe(413);
    expect(larger.json()).toMatchObject({ code: "FILE_TOO_LARGE" });

    const unlisted = Buffer.from("unlisted bytes");
    const notListed = await app.inject({
      method: "PUT",
      url: `/api/transfers/${transferId}/files/${createHash("sha256").update(unlisted).digest("hex")}`,
      headers: { "content-type": "application/octet-stream" },
      payload: unlisted
    });
    expect(notListed.statusCode).toBe(400);
    expect(notListed.json()).toMatchObject({ code: "INVALID" });
  });

  it("staging answers the same whether or not another account holds the bytes", async () => {
    const bytes = randomBytes(64);
    const other = await openWithFile("someone-else", bytes);
    expect(
      await stageTransferFile(transferHost(), "someone-else", {
        transfer_id: other.transferId,
        hash: other.hash,
        size: bytes.byteLength,
        bytes: new Uint8Array(bytes)
      })
    ).toBe("stored");

    const { transferId, hash } = await openWithFile(USER, bytes);
    app = await routeApp();
    const staged = await app.inject({
      method: "PUT",
      url: `/api/transfers/${transferId}/files/${hash}`,
      headers: { "content-type": "application/octet-stream" },
      payload: bytes
    });
    expect(staged.statusCode).toBe(201);
    expect(staged.json()).toEqual({ outcome: "stored" });
  });
});
