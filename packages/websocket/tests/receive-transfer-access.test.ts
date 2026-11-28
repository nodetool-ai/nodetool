/**
 * Who may receive from and transfer into a cloud project document: the
 * owner and collaborators, never a person who only sees a workflow because
 * it is public. A viewer receives only through a grant that allows
 * downloads, since a receive delivers the original files.
 */
import { createHash, randomBytes } from "node:crypto";
import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Asset, initTestDb, Project, Workflow, WorkflowCollaborator, WorkflowVersion } from "@nodetool-ai/models";
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
const { transferHost } = await import("../src/lib/transfer-host.js");
const { receiveHost } = await import("../src/lib/receive-host.js");

const createCaller = createCallerFactory(appRouter);
const caller = (userId: string) =>
  createCaller({
    userId,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  } as Context);

const OWNER = "owner-1";
// The REST route reads the user from the bridge, which falls back to the
// local user "1" when no authentication ran.
const READER = "1";

function id(): string {
  return randomBytes(16).toString("hex");
}

/** A cloud project of OWNER with one workflow that shows one stored file. */
async function workflowWithFile(access: "public" | "private"): Promise<{ workflowId: string; hash: string }> {
  const projectId = id();
  await Project.create<Project>({ id: projectId, user_id: OWNER, name: "Film", kind: "project" });
  const bytes = randomBytes(48);
  const hash = createHash("sha256").update(bytes).digest("hex");
  await storage.store(blobKey(hash), new Uint8Array(bytes));
  const asset = await Asset.create<Asset>({
    id: id(),
    user_id: OWNER,
    project_id: projectId,
    name: "original.png",
    content_type: "image/png",
    size: bytes.byteLength,
    content_hash: hash
  });
  const workflow = await Workflow.create<Workflow>({
    id: id(),
    user_id: OWNER,
    project_id: projectId,
    name: "Shared one",
    access,
    graph: {
      nodes: [{ id: "n1", type: "nodetool.constant.Image", data: { value: { type: "image", asset_id: asset.id } } }],
      edges: []
    }
  });
  return { workflowId: workflow.id, hash };
}

async function grantViewer(workflowId: string, allowDownload: boolean): Promise<void> {
  await WorkflowCollaborator.create<WorkflowCollaborator>({
    workflow_id: workflowId,
    user_id: READER,
    role: "viewer",
    invited_by: OWNER,
    allow_download: allowDownload
  });
}

describe("receive and transfer access", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("receive refuses a workflow the caller only sees as public, and writes nothing to it", async () => {
    const { workflowId } = await workflowWithFile("public");
    // Public viewing itself still works.
    await expect(caller(READER).workflows.get({ id: workflowId })).resolves.toMatchObject({ id: workflowId });
    const before = (await WorkflowVersion.listForWorkflow(workflowId, { limit: 100 })).length;

    await expect(caller(READER).receive.capture({ kind: "workflow", document_id: workflowId })).rejects.toMatchObject({
      code: "NOT_FOUND"
    });
    expect(await receiveHost().documentRole(READER, "workflow", workflowId)).toBeNull();
    expect((await WorkflowVersion.listForWorkflow(workflowId, { limit: 100 })).length).toBe(before);
  });

  it("transfer gives no role on a workflow the caller only sees as public", async () => {
    const { workflowId } = await workflowWithFile("public");
    expect(await transferHost().documentRole(READER, "workflow", workflowId)).toBeNull();
    expect(await transferHost().documentRole(OWNER, "workflow", workflowId)).toBe("owner");
  });

  it("receive refuses a viewer whose grant does not allow downloads", async () => {
    const { workflowId } = await workflowWithFile("private");
    await grantViewer(workflowId, false);

    await expect(caller(READER).receive.capture({ kind: "workflow", document_id: workflowId })).rejects.toMatchObject({
      code: "NOT_FOUND"
    });
    // The viewer still opens the workflow, and transfer still sees the role.
    await expect(caller(READER).workflows.get({ id: workflowId })).resolves.toMatchObject({ id: workflowId });
    expect(await transferHost().documentRole(READER, "workflow", workflowId)).toBe("viewer");
  });

  it("receive serves a viewer whose grant allows downloads", async () => {
    const { workflowId, hash } = await workflowWithFile("public");
    await grantViewer(workflowId, true);

    const set = await caller(READER).receive.capture({ kind: "workflow", document_id: workflowId });
    expect(set.documents[0]?.files).toMatchObject([{ hash }]);
    const app = Fastify({ logger: false });
    await app.register(receiveRoutes, { apiOptions: {} as never });
    try {
      const file = await app.inject({ method: "GET", url: `/api/receive/${set.set_id}/files/${hash}` });
      expect(file.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});
