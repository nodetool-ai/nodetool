/**
 * Workspace files in a receive's capture and download (technical design,
 * "Receiving workspace files", RW1 to RW5), on SQLite and on an in-process
 * PostgreSQL engine with the production migrations.
 */
import { createHash, randomBytes } from "node:crypto";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  Asset,
  closeDb,
  initTestDb,
  listProjectWorkspaceHashes,
  Project,
  recordErasedFile,
  Workflow
} from "@nodetool-ai/models";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import {
  createLocalWorkspace,
  setProjectFolderResolver,
  type ProjectFolderResolution,
  type Workspace
} from "@nodetool-ai/runtime";
import { BLOB_CLEANUP_GRACE_MS, blobKey, cleanupBlobs } from "@nodetool-ai/asset-services/blob-store";
import type { TransferRole } from "../src/cloud-transfer.js";
import {
  captureRevisionSet,
  receiveFile,
  ReceiveRequestError,
  releaseRevisionSet,
  type ReceiveHost
} from "../src/cloud-receive.js";
import { initPgliteDb } from "./_helpers/pglite-db.js";

const OWNER = "user-owner";
const READER = "user-reader";

function id(): string {
  return randomBytes(16).toString("hex");
}

function sha(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
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

function workspaceSuite(name: string, init: () => Promise<void>): void {
  describe(`workspace files of a receive on ${name}`, { timeout: 30_000 }, () => {
    let root: string;
    let folder: Workspace;
    let projectId: string;
    let host: ReceiveHost & { storage: InMemoryStorageAdapter; grants: Map<string, TransferRole> };

    beforeEach(async () => {
      await init();
      root = await mkdtemp(join(tmpdir(), "nodetool-receive-ws-"));
      projectId = id();
      folder = createLocalWorkspace(join(root, projectId));
      await folder.mkdir("");
      setProjectFolderResolver(async (requested): Promise<ProjectFolderResolution> => {
        if (requested !== projectId) return { ok: false, reason: "No such folder" };
        return { ok: true, projectId: requested, workspace: folder };
      });
      await Project.create<Project>({
        id: projectId,
        user_id: OWNER,
        name: "Cloud project",
        kind: "project",
        workspace_id: id()
      });
      const grants = new Map<string, TransferRole>();
      host = {
        storage: new InMemoryStorageAdapter(),
        grants,
        async documentRole(userId, kind, documentId) {
          const row = await Workflow.get<Workflow>(documentId);
          if (!row) return null;
          if (row.user_id === userId) return "owner";
          return grants.get(`${userId}:${kind}:${documentId}`) ?? null;
        },
        async readableFiles() {
          return [];
        }
      };
    });

    afterEach(async () => {
      setProjectFolderResolver(null);
      await closeDb();
      await rm(root, { recursive: true, force: true });
    });

    async function workflowWithFile(filePath: string | null): Promise<Workflow> {
      return Workflow.create<Workflow>({
        user_id: OWNER,
        project_id: projectId,
        name: "Edit",
        access: "private",
        graph: { nodes: [], edges: [] },
        file_path: filePath
      });
    }

    it("lists the owner's workspace files only, and serves their bytes (RW1, RW2)", async () => {
      const notes = new TextEncoder().encode("notes of the owner");
      await folder.write("notes/plan.txt", notes);
      // An asset's file, a document's file, any workflow file and NodeTool's own files are not workspace files.
      await folder.write("media/still.png", new Uint8Array(randomBytes(16)));
      await Asset.create<Asset>({
        user_id: OWNER,
        project_id: projectId,
        parent_id: OWNER,
        name: "still.png",
        content_type: "image/png",
        workspace_path: "media/still.png",
        size: 16
      });
      await folder.write("edit.json", new TextEncoder().encode("{}"));
      const workflow = await workflowWithFile("edit.json");
      await folder.write("other.workflow.json", new TextEncoder().encode("{}"));
      await mkdir(join(root, projectId, ".nodetool"), { recursive: true });
      await writeFile(join(root, projectId, ".nodetool", "state.json"), "{}");

      const set = await captureRevisionSet(host, OWNER, { project_id: projectId });
      expect(set.workspace_files).toEqual([{ path: "notes/plan.txt", hash: sha(notes), size: notes.byteLength }]);
      expect(await receiveFile(host, OWNER, { set_id: set.set_id, hash: sha(notes) })).toEqual(notes);

      // A collaborator who may open the workflow captures it without the owner's files (TC126).
      host.grants.set(`${READER}:workflow:${workflow.id}`, "editor");
      const theirs = await captureRevisionSet(host, READER, { project_id: projectId });
      expect(theirs.documents.map((document) => document.document_id)).toEqual([workflow.id]);
      expect(theirs.workspace_files).toEqual([]);
      expect(await refusal(receiveFile(host, READER, { set_id: theirs.set_id, hash: sha(notes) }))).toBe("NOT_FOUND");

      // A capture of one document lists none either.
      const single = await captureRevisionSet(host, OWNER, { kind: "workflow", document_id: workflow.id });
      expect(single.workspace_files).toEqual([]);
    });

    it("lists none for a project that has no folder", async () => {
      await folder.write("notes.txt", new TextEncoder().encode("notes"));
      const project = await Project.get<Project>(projectId);
      project!.workspace_id = null;
      await project!.save();
      const set = await captureRevisionSet(host, OWNER, { project_id: projectId });
      expect(set.workspace_files).toEqual([]);
    });

    it("refuses a former owner's download through a live set (RW5, TC126)", async () => {
      const bytes = new TextEncoder().encode("data");
      await folder.write("data.csv", bytes);
      const set = await captureRevisionSet(host, OWNER, { project_id: projectId });
      expect(set.workspace_files).toHaveLength(1);

      const project = await Project.get<Project>(projectId);
      project!.user_id = READER;
      await project!.save();

      expect(await refusal(receiveFile(host, OWNER, { set_id: set.set_id, hash: sha(bytes) }))).toBe("NOT_FOUND");
    });

    it("reads a file again only when its size or time changed, and forgets removed paths (RW3)", async () => {
      const first = new TextEncoder().encode("first");
      await folder.write("a.txt", first);
      // Whole seconds, so setting the time again restores it exactly.
      const path = join(root, projectId, "a.txt");
      await utimes(path, 1_700_000_000, 1_700_000_000);
      await folder.write("b.txt", new TextEncoder().encode("gone soon"));
      const set = await captureRevisionSet(host, OWNER, { project_id: projectId });
      expect(set.workspace_files.find((file) => file.path === "a.txt")?.hash).toBe(sha(first));

      // Same size and time: the recorded hash stands, without a read.
      await writeFile(path, "FIRST");
      await utimes(path, 1_700_000_000, 1_700_000_000);
      await folder.delete("b.txt");
      const again = await captureRevisionSet(host, OWNER, { project_id: projectId });
      expect(again.workspace_files).toEqual([{ path: "a.txt", hash: sha(first), size: first.byteLength }]);
      expect([...(await listProjectWorkspaceHashes(projectId)).keys()]).toEqual(["a.txt"]);

      // A new size is read and hashed again.
      const second = new TextEncoder().encode("second version");
      await folder.write("a.txt", second);
      const third = await captureRevisionSet(host, OWNER, { project_id: projectId });
      expect(third.workspace_files).toEqual([{ path: "a.txt", hash: sha(second), size: second.byteLength }]);
      expect(await receiveFile(host, OWNER, { set_id: third.set_id, hash: sha(second) })).toEqual(second);
    });

    it("leaves out a file whose hash the owner erased (FR79)", async () => {
      const bytes = new TextEncoder().encode("erased bytes");
      await folder.write("old.txt", bytes);
      await recordErasedFile({ projectId, userId: OWNER, hash: sha(bytes), size: bytes.byteLength, assetIds: [] });
      const set = await captureRevisionSet(host, OWNER, { project_id: projectId });
      expect(set.workspace_files).toEqual([]);
    });

    it("holds a copied workspace file as a retention root until the set is released (RW4)", async () => {
      const bytes = new Uint8Array(randomBytes(48));
      await folder.write("scan.bin", bytes);
      const set = await captureRevisionSet(host, OWNER, { project_id: projectId });
      const key = host.storage.uriForKey(blobKey(sha(bytes)));
      expect(await host.storage.exists(key)).toBe(true);
      // The cloud run replaces the file after the capture.
      await folder.write("scan.bin", new Uint8Array(randomBytes(48)));
      const later = new Date(Date.now() + BLOB_CLEANUP_GRACE_MS + 60_000);

      await cleanupBlobs(host.storage, later);
      expect(await receiveFile(host, OWNER, { set_id: set.set_id, hash: sha(bytes) })).toEqual(bytes);

      await releaseRevisionSet(OWNER, set.set_id);
      await cleanupBlobs(host.storage, later);
      expect(await host.storage.exists(key)).toBe(false);
    });
  });
}

workspaceSuite("SQLite", async () => {
  initTestDb();
});
workspaceSuite("PostgreSQL", initPgliteDb);
