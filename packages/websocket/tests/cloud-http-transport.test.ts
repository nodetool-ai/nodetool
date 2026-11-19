/**
 * The transfer client's HTTP transport against this server's own routes:
 * the tRPC `receive` and `transfers` procedures over the Fastify mount, and
 * the REST routes for file bytes. It proves the client speaks the wire
 * format the server answers, including streamed file bodies and the error
 * codes the client maps. The commit needs PostgreSQL, so here it is refused.
 */
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Asset, initTestDb, Project, Workflow } from "@nodetool-ai/models";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import { blobKey } from "@nodetool-ai/asset-services/blob-store";
import {
  CloudHttpTransport,
  CloudRequestError,
  CloudSignedOutError
} from "@nodetool-ai/project-services/cloud-http-transport";
import { ReceiveSetExpiredError } from "@nodetool-ai/project-services/cloud-receive-client";
import { appRouter } from "../src/trpc/router.js";
import { createContextFactory } from "../src/trpc/context.js";

const storage = new InMemoryStorageAdapter();

vi.mock("../src/lib/storage.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/storage.js")>()),
  getAssetAdapter: () => storage
}));

vi.mock("../src/lib/transfer-host.js", () => ({
  transferHost: () => ({
    storage,
    documentRole: async () => "owner",
    checkAttach: async () => ({ unreadable: null, toAdmit: [] }),
    published: async () => {}
  })
}));

const { default: receiveRoutes } = await import("../src/routes/receive.js");
const { default: transferRoutes } = await import("../src/routes/transfers.js");

// The REST routes fall back to the local user "1" when no authentication ran.
const USER = "1";
const ORIGIN = "https://cloud.example";

function id(): string {
  return randomBytes(16).toString("hex");
}

function sha(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function serverApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.addContentTypeParser("application/octet-stream", { parseAs: "buffer" }, (_req, body, done) => {
    done(null, body);
  });
  app.decorateRequest("userId", null);
  app.addHook("onRequest", async (req) => {
    req.userId = USER;
  });
  const createContext = createContextFactory({
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: { hasPython: () => false, close: () => {} } as never,
    getPythonBridgeReady: () => false
  });
  await app.register(fastifyTRPCPlugin, { prefix: "/trpc", trpcOptions: { router: appRouter, createContext } });
  await app.register(receiveRoutes, { apiOptions: {} as never });
  await app.register(transferRoutes, { apiOptions: {} as never });
  await app.ready();
  return app;
}

/** A fetch that answers from the Fastify app, so the request crosses the real routes. */
function fetchFrom(app: FastifyInstance, seen: Array<{ url: string; authorization: string | null }>) {
  return async (url: string, init: RequestInit): Promise<Response> => {
    const target = new URL(url);
    expect(target.origin).toBe(ORIGIN);
    const headers = new Headers(init.headers);
    seen.push({ url, authorization: headers.get("authorization") });
    let payload: Buffer | string | undefined;
    if (typeof init.body === "string") payload = init.body;
    else if (init.body) payload = Buffer.from(await new Response(init.body as BodyInit).arrayBuffer());
    const response = await app.inject({
      method: (init.method ?? "GET") as "GET",
      url: `${target.pathname}${target.search}`,
      headers: Object.fromEntries(headers.entries()),
      payload
    });
    return new Response(response.statusCode === 204 ? null : response.rawPayload, {
      status: response.statusCode,
      headers: { "content-type": String(response.headers["content-type"] ?? "application/octet-stream") }
    });
  };
}

describe("the transfer client's HTTP transport", () => {
  let app: FastifyInstance;
  let dir: string;
  let seen: Array<{ url: string; authorization: string | null }>;
  let transport: CloudHttpTransport;

  beforeEach(async () => {
    initTestDb();
    app = await serverApp();
    dir = await mkdtemp(join(tmpdir(), "nodetool-http-transport-"));
    seen = [];
    transport = new CloudHttpTransport({ origin: `${ORIGIN}/`, accessToken: "token-1", fetchImpl: fetchFrom(app, seen) });
  });

  afterEach(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("captures a set, reads a document, streams a file and releases the set", async () => {
    const projectId = id();
    await Project.create<Project>({ id: projectId, user_id: USER, name: "Film", kind: "project" });
    const bytes = randomBytes(48);
    await storage.store(blobKey(sha(bytes)), new Uint8Array(bytes));
    const asset = await Asset.create<Asset>({
      id: id(),
      user_id: USER,
      project_id: projectId,
      name: "still.png",
      content_type: "image/png",
      size: bytes.byteLength,
      content_hash: sha(bytes)
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

    const set = await transport.capture({ project_id: projectId });
    expect(set.documents).toMatchObject([
      { document_id: workflow.id, files: [{ asset_id: asset.id, hash: sha(bytes), name: "still.png", content_type: "image/png" }] }
    ]);
    const document = await transport.document({ set_id: set.set_id, kind: "workflow", document_id: workflow.id });
    expect(document.content_hash).toBe(set.documents[0]!.content_hash);

    const destination = join(dir, "file");
    expect(await transport.downloadFile({ set_id: set.set_id, hash: sha(bytes) }, destination)).toBe("ok");
    expect((await readFile(destination)).equals(bytes)).toBe(true);

    await transport.release({ set_id: set.set_id });
    await expect(
      transport.document({ set_id: set.set_id, kind: "workflow", document_id: workflow.id })
    ).rejects.toBeInstanceOf(ReceiveSetExpiredError);
    await expect(
      transport.downloadFile({ set_id: set.set_id, hash: sha(bytes) }, destination)
    ).rejects.toBeInstanceOf(ReceiveSetExpiredError);
    expect(seen.every((request) => request.authorization === "Bearer token-1")).toBe(true);
  });

  it("opens a transfer, streams a file to stage, reads its status and cancels it", async () => {
    const transferId = id();
    const projectId = id();
    const bytes = randomBytes(64);
    const source = join(dir, "source");
    await writeFile(source, bytes);
    const opened = await transport.open({
      transfer_id: transferId,
      project_id: projectId,
      first_publication: true,
      manifest: {
        project_name: "Film",
        operations: [],
        required_files: [{ asset_id: id(), hash: sha(bytes), size: bytes.byteLength, documents: [] }]
      }
    });
    expect(opened.needed_hashes).toEqual([sha(bytes)]);
    await transport.stageFile({ transfer_id: transferId, hash: sha(bytes), size: bytes.byteLength }, source);
    expect(await transport.status({ transfer_id: transferId })).toEqual({ state: "open", project_id: projectId, attempts: [] });

    // A commit needs PostgreSQL. The refusal comes back as a typed error.
    const refusal = await transport
      .commit({
        transfer_id: transferId,
        attempt_id: id(),
        manifest: { project_name: "Film", operations: [], required_files: [] },
        decisions: [],
        missing_files: [],
        payloads: []
      })
      .catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(CloudRequestError);
    expect((refusal as CloudRequestError).code).toBe("SERVICE_UNAVAILABLE");
    expect((refusal as CloudRequestError).message).toContain("PostgreSQL");

    expect(await transport.cancel({ transfer_id: transferId })).toEqual({ state: "cancelled" });
  });

  it("refuses to stage a file whose size changed since capture", async () => {
    const source = join(dir, "source");
    await writeFile(source, randomBytes(10));
    await expect(transport.stageFile({ transfer_id: id(), hash: "0".repeat(64), size: 11 }, source)).rejects.toThrow(
      "changed size"
    );
  });

  it("reports a stale token as signed out and a failed network as retryable", async () => {
    const stale = new CloudHttpTransport({
      origin: ORIGIN,
      accessToken: "old",
      fetchImpl: async () => new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
    });
    await expect(stale.capture({ project_id: id() })).rejects.toBeInstanceOf(CloudSignedOutError);
    const offline = new CloudHttpTransport({
      origin: ORIGIN,
      accessToken: "token",
      fetchImpl: async () => {
        throw new Error("connect ECONNREFUSED");
      }
    });
    const error = await offline.status({ transfer_id: id() }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CloudRequestError);
    expect((error as CloudRequestError).retryable).toBe(true);
  });
});
