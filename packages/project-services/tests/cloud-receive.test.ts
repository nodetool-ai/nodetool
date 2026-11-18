/**
 * Revision sets and the receive endpoints (technical design, "Receiving:
 * revision set, stage, check, apply", WP2.5), on SQLite and on an
 * in-process PostgreSQL engine with the production migrations.
 */
import { createHash, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  closeDb,
  initTestDb,
  Project,
  TimelineSequence,
  TimelineSequenceVersion,
  Workflow,
  WorkflowVersion
} from "@nodetool-ai/models";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import { refsOf } from "@nodetool-ai/protocol";
import { BLOB_CLEANUP_GRACE_MS, blobKey, cleanupBlobs } from "@nodetool-ai/asset-services/blob-store";
import type { TransferRole } from "../src/cloud-transfer.js";
import {
  captureRevisionSet,
  ERASED,
  receiveDocument,
  receiveFile,
  ReceiveRequestError,
  releaseRevisionSet,
  type ReceiveFileInfo,
  type ReceiveHost
} from "../src/cloud-receive.js";
import { HELD_VERSION_NAME, identityHash, transferPayloadOf } from "../src/transfer-documents.js";
import { initPgliteDb } from "./_helpers/pglite-db.js";

const OWNER = "user-owner";
const READER = "user-reader";

function id(): string {
  return randomBytes(16).toString("hex");
}

function sha(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

interface TestHost extends ReceiveHost {
  storage: InMemoryStorageAdapter;
  /** Roles of people other than the owner, by `user:kind:id`. */
  grants: Map<string, TransferRole>;
  /** What the server holds of each asset. */
  files: Map<string, { hash: string | null; size: number }>;
}

function testHost(): TestHost {
  const host: TestHost = {
    storage: new InMemoryStorageAdapter(),
    grants: new Map(),
    files: new Map(),
    async documentRole(userId, kind, documentId) {
      const row =
        kind === "workflow" ? await Workflow.get<Workflow>(documentId) : await TimelineSequence.findById(documentId);
      if (!row) return null;
      if (row.user_id === userId) return "owner";
      return host.grants.get(`${userId}:${kind}:${documentId}`) ?? null;
    },
    async readableFiles(_userId, kind, _documentId, content): Promise<ReceiveFileInfo[]> {
      return refsOf(kind, content).flatMap((assetId) => {
        const file = host.files.get(assetId);
        return file ? [{ assetId, hash: file.hash, size: file.size }] : [];
      });
    }
  };
  return host;
}

function graphWith(assetId: string | null) {
  const nodes = assetId
    ? [{ id: "n1", type: "nodetool.constant.Image", data: { value: { type: "image", asset_id: assetId } } }]
    : [];
  return { nodes, edges: [] };
}

async function cloudProject(): Promise<string> {
  const projectId = id();
  await Project.create<Project>({ id: projectId, user_id: OWNER, name: "Cloud project", kind: "project" });
  return projectId;
}

async function workflowIn(projectId: string, assetId: string | null): Promise<Workflow> {
  return Workflow.create<Workflow>({
    id: id(),
    user_id: OWNER,
    project_id: projectId,
    name: "Edit",
    access: "private",
    description: "",
    tags: ["cut"],
    graph: graphWith(assetId),
    settings: null,
    run_mode: "workflow"
  });
}

/** Stores `bytes` in the blob store, as a committed transfer leaves them. */
async function storeBlob(host: TestHost, assetId: string, bytes: Uint8Array): Promise<string> {
  const hash = sha(bytes);
  await host.storage.store(blobKey(hash), bytes);
  host.files.set(assetId, { hash, size: bytes.byteLength });
  return hash;
}

async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ReceiveRequestError) return error.code;
    throw error;
  }
  throw new Error("Expected a refusal");
}

function receiveSuite(name: string, init: () => Promise<void>): void {
  describe(`receiving on ${name}`, { timeout: 30_000 }, () => {
    let host: TestHost;

    beforeEach(async () => {
      await init();
      host = testHost();
    });

    afterEach(async () => {
      await closeDb();
    });

    it("serves the captured revision and its files after later saves remove them (TC27)", async () => {
      const projectId = await cloudProject();
      const assetId = id();
      const bytes = new Uint8Array(randomBytes(64));
      const hash = await storeBlob(host, assetId, bytes);
      const workflow = await workflowIn(projectId, assetId);
      const captured = await transferPayloadOf("workflow", workflow.id);

      const set = await captureRevisionSet(host, OWNER, { project_id: projectId });

      expect(set.project_id).toBe(projectId);
      expect(set.documents).toEqual([
        {
          kind: "workflow",
          document_id: workflow.id,
          name: "Edit",
          revision_id: expect.stringMatching(/^[0-9a-f]{32}$/),
          content_hash: identityHash(captured),
          files: [{ asset_id: assetId, hash, size: bytes.byteLength }],
          missing_files: []
        }
      ]);

      // Two saves, the second of which no longer names the file.
      const stored = await Workflow.get<Workflow>(workflow.id);
      stored!.name = "Renamed";
      stored!.tags = ["other"];
      await stored!.save();
      stored!.graph = graphWith(null);
      await stored!.save();

      const document = await receiveDocument(host, OWNER, {
        set_id: set.set_id,
        kind: "workflow",
        document_id: workflow.id
      });
      expect(document.document).toEqual(captured);
      expect(document.content_hash).toBe(identityHash(captured));
      expect(await receiveFile(host, OWNER, { set_id: set.set_id, hash })).toEqual(bytes);
    });

    it("holds the file as a retention root until the set is released", async () => {
      const projectId = await cloudProject();
      const assetId = id();
      // No blob row names this hash: only the set holds it.
      const hash = await storeBlob(host, assetId, new Uint8Array(randomBytes(32)));
      await workflowIn(projectId, assetId);
      const set = await captureRevisionSet(host, OWNER, { project_id: projectId });
      const later = new Date(Date.now() + BLOB_CLEANUP_GRACE_MS + 60_000);
      const key = host.storage.uriForKey(blobKey(hash));

      await cleanupBlobs(host.storage, later);
      expect(await host.storage.exists(key)).toBe(true);

      await releaseRevisionSet(OWNER, set.set_id);
      await releaseRevisionSet(OWNER, set.set_id);
      await cleanupBlobs(host.storage, later);
      expect(await host.storage.exists(key)).toBe(false);
      expect(await refusal(receiveFile(host, OWNER, { set_id: set.set_id, hash }))).toBe("SET_EXPIRED");
    });

    it("reuses the newest version that holds the content and writes one otherwise", async () => {
      const projectId = await cloudProject();
      const workflow = await workflowIn(projectId, null);

      const first = await captureRevisionSet(host, OWNER, { kind: "workflow", document_id: workflow.id });
      const second = await captureRevisionSet(host, OWNER, { kind: "workflow", document_id: workflow.id });

      expect(second.documents[0]?.revision_id).toBe(first.documents[0]?.revision_id);
      const versions = await WorkflowVersion.listForWorkflow(workflow.id);
      expect(versions.map((version) => [version.name, version.save_type])).toEqual([[HELD_VERSION_NAME, "manual"]]);

      // A rename keeps the content, so no version is written.
      const stored = await Workflow.get<Workflow>(workflow.id);
      stored!.name = "Renamed";
      await stored!.save();
      const third = await captureRevisionSet(host, OWNER, { kind: "workflow", document_id: workflow.id });
      expect(third.documents[0]?.revision_id).toBe(first.documents[0]?.revision_id);
      expect(third.documents[0]?.name).toBe("Renamed");
      expect(await WorkflowVersion.listForWorkflow(workflow.id)).toHaveLength(1);
    });

    it("captures a timeline at its stored revision", async () => {
      const projectId = await cloudProject();
      const timeline = await TimelineSequence.create<TimelineSequence>({
        id: id(),
        user_id: OWNER,
        project_id: projectId,
        name: "Cut",
        fps: 30,
        width: 1920,
        height: 1080,
        document: JSON.stringify({ tracks: [], clips: [], markers: [] })
      });
      const captured = await transferPayloadOf("timeline", timeline.id);

      const set = await captureRevisionSet(host, OWNER, { project_id: projectId });
      await TimelineSequence.update(timeline.id, {
        name: "Recut",
        document: JSON.stringify({ tracks: [{ id: "t1" }], clips: [], markers: [] })
      });

      const document = await receiveDocument(host, OWNER, {
        set_id: set.set_id,
        kind: "timeline",
        document_id: timeline.id
      });
      expect(document.document).toEqual(captured);
      const versions = await TimelineSequenceVersion.listForTimeline(timeline.id);
      expect(versions.map((version) => version.name)).toEqual([HELD_VERSION_NAME]);
    });

    it("refuses every download after the reader's access is removed (TC94)", async () => {
      const projectId = await cloudProject();
      const assetId = id();
      const hash = await storeBlob(host, assetId, new Uint8Array(randomBytes(16)));
      const workflow = await workflowIn(projectId, assetId);
      const hidden = await workflowIn(projectId, null);
      host.grants.set(`${READER}:workflow:${workflow.id}`, "viewer");

      const set = await captureRevisionSet(host, READER, { project_id: projectId });
      expect(set.documents.map((document) => document.document_id)).toEqual([workflow.id]);
      expect(set.documents.map((document) => document.document_id)).not.toContain(hidden.id);

      host.grants.delete(`${READER}:workflow:${workflow.id}`);
      const input = { set_id: set.set_id, kind: "workflow" as const, document_id: workflow.id };
      expect(await refusal(receiveDocument(host, READER, input))).toBe("NOT_FOUND");
      expect(await refusal(receiveFile(host, READER, { set_id: set.set_id, hash }))).toBe("NOT_FOUND");
    });

    it("refuses a project the caller may open nothing of, and another reader's set", async () => {
      const projectId = await cloudProject();
      const workflow = await workflowIn(projectId, null);

      expect(await refusal(captureRevisionSet(host, READER, { project_id: projectId }))).toBe("NOT_FOUND");
      expect(
        await refusal(captureRevisionSet(host, READER, { kind: "workflow", document_id: workflow.id }))
      ).toBe("NOT_FOUND");
      expect(await refusal(captureRevisionSet(host, OWNER, { project_id: id() }))).toBe("NOT_FOUND");

      const set = await captureRevisionSet(host, OWNER, { project_id: projectId });
      const input = { set_id: set.set_id, kind: "workflow" as const, document_id: workflow.id };
      expect(await refusal(receiveDocument(host, READER, input))).toBe("SET_EXPIRED");
      // Releasing another reader's set changes nothing.
      await releaseRevisionSet(READER, set.set_id);
      expect((await receiveDocument(host, OWNER, input)).document_id).toBe(workflow.id);
    });

    it("answers ERASED for a file whose bytes were freed, and lists files without bytes", async () => {
      const projectId = await cloudProject();
      const assetId = id();
      const missingId = id();
      host.files.set(missingId, { hash: null, size: 0 });
      const hash = await storeBlob(host, assetId, new Uint8Array(randomBytes(16)));
      const workflow = await Workflow.create<Workflow>({
        id: id(),
        user_id: OWNER,
        project_id: projectId,
        name: "Two files",
        access: "private",
        graph: {
          nodes: [
            { id: "a", type: "nodetool.constant.Image", data: { value: { type: "image", asset_id: assetId } } },
            { id: "b", type: "nodetool.constant.Image", data: { value: { type: "image", asset_id: missingId } } }
          ],
          edges: []
        }
      });

      const set = await captureRevisionSet(host, OWNER, { kind: "workflow", document_id: workflow.id });
      expect(set.documents[0]?.missing_files).toEqual([missingId]);

      await host.storage.delete(host.storage.uriForKey(blobKey(hash)));
      expect(await receiveFile(host, OWNER, { set_id: set.set_id, hash })).toBe(ERASED);
    });

    it("treats a set past its lifetime as expired", async () => {
      const projectId = await cloudProject();
      const workflow = await workflowIn(projectId, null);
      const set = await captureRevisionSet(host, OWNER, { project_id: projectId });
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(Date.now() + 8 * 24 * 60 * 60 * 1000);
      try {
        const input = { set_id: set.set_id, kind: "workflow" as const, document_id: workflow.id };
        expect(await refusal(receiveDocument(host, OWNER, input))).toBe("SET_EXPIRED");
      } finally {
        vi.useRealTimers();
      }
    });
  });
}

receiveSuite("SQLite", async () => {
  initTestDb();
});
receiveSuite("PostgreSQL", initPgliteDb);
