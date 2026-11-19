/**
 * The file operations of a transfer (technical design, "Operations of a
 * transfer" and "Placement", WP2.4): puts and deletes of workspace and asset
 * files, keeping both on a changed base, recovery copies and the sweeper. On
 * an in-process PostgreSQL engine, with each project folder a key prefix in
 * an in-memory object store.
 */
import { createHash, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  Asset,
  closeDb,
  listRecoveryCopies,
  listTransferPlacements,
  pendingPlacementPaths
} from "@nodetool-ai/models";
import {
  createWorkspace,
  setProjectFolderResolver,
  type ProjectFolderResolution,
  type Workspace
} from "@nodetool-ai/runtime";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import { readBlob } from "@nodetool-ai/asset-services/blob-store";
import type {
  CommitTransferInput,
  TransferAttemptResult,
  TransferFileOperation
} from "@nodetool-ai/protocol/api-schemas/transfer.js";
import { commitTransfer, openTransfer, stageTransferFile, type TransferHost } from "../src/cloud-transfer.js";
import { sweepTransferPlacements } from "../src/transfer-files.js";
import { initPgliteDb } from "./_helpers/pglite-db.js";

const OWNER = "user-owner";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function id(): string {
  return randomBytes(16).toString("hex");
}

function sha(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function host(): TransferHost {
  return {
    storage: new InMemoryStorageAdapter(),
    async documentRole() {
      return "owner";
    },
    async checkAttach() {
      return { unreadable: null, toAdmit: [] };
    },
    async published() {}
  };
}

describe("transfer file operations on PostgreSQL", { timeout: 30_000 }, () => {
  let server: TransferHost;
  let folders: Map<string, Workspace>;
  let folderDown: boolean;

  beforeEach(async () => {
    await initPgliteDb();
    server = host();
    folders = new Map();
    folderDown = false;
    setProjectFolderResolver(async (projectId): Promise<ProjectFolderResolution> => {
      if (folderDown || !projectId) return { ok: false, reason: "The folder is not reachable" };
      let workspace = folders.get(projectId);
      if (!workspace) {
        workspace = createWorkspace(new InMemoryStorageAdapter(), { prefix: `workspaces/${projectId}` });
        folders.set(projectId, workspace);
      }
      return { ok: true, projectId, workspace };
    });
  });

  afterEach(async () => {
    setProjectFolderResolver(null);
    await closeDb();
  });

  /** Opens, stages and commits one transfer of file operations. */
  async function send(
    projectId: string,
    firstPublication: boolean,
    operations: TransferFileOperation[],
    files: Uint8Array[],
    extra: Partial<CommitTransferInput["manifest"]> = {}
  ): Promise<TransferAttemptResult> {
    const transferId = id();
    const manifest = {
      project_name: "Files",
      operations: [],
      required_files: [],
      file_operations: operations,
      device_name: "Studio Mac",
      ...extra
    };
    const opened = await openTransfer(server, OWNER, {
      transfer_id: transferId,
      project_id: projectId,
      first_publication: firstPublication,
      manifest
    });
    for (const bytes of files) {
      if (!opened.needed_hashes.includes(sha(bytes))) continue;
      await stageTransferFile(server, OWNER, { transfer_id: transferId, hash: sha(bytes), size: bytes.byteLength, bytes });
    }
    return commitTransfer(server, OWNER, {
      transfer_id: transferId,
      attempt_id: id(),
      manifest,
      decisions: [],
      missing_files: [],
      payloads: []
    });
  }

  async function text(projectId: string, path: string): Promise<string | null> {
    const bytes = await folders.get(projectId)?.read(path);
    return bytes ? decoder.decode(bytes) : null;
  }

  /** Publishes a project holding `notes.txt` and the asset `clip.mp4`. */
  async function published(): Promise<{ projectId: string; assetId: string; notes: Uint8Array; clip: Uint8Array }> {
    const projectId = id();
    const assetId = id();
    const notes = encoder.encode("cloud notes");
    const clip = encoder.encode("cloud clip");
    const result = await send(
      projectId,
      true,
      [
        { op: "put_workspace_file", path: "notes.txt", hash: sha(notes), size: notes.byteLength, base_hash: null },
        {
          op: "put_asset_file",
          asset_id: assetId,
          path: "media/clip.mp4",
          hash: sha(clip),
          size: clip.byteLength,
          base_hash: null,
          name: "clip.mp4",
          content_type: "video/mp4"
        }
      ],
      [notes, clip]
    );
    expect(result.outcome).toBe("committed");
    return { projectId, assetId, notes, clip };
  }

  it("places the files of a first publication and records the asset", async () => {
    const { projectId, assetId, clip } = await published();
    expect(await text(projectId, "notes.txt")).toBe("cloud notes");
    expect(await text(projectId, "media/clip.mp4")).toBe("cloud clip");
    const asset = await Asset.get<Asset>(assetId);
    expect(asset).toMatchObject({ project_id: projectId, workspace_path: "media/clip.mp4", content_hash: sha(clip) });
    expect(asset?.metadata).toMatchObject({ workspace_size: clip.byteLength });
    expect(await listTransferPlacements(projectId)).toEqual([]);
  });

  it("replaces a file on its base and keeps the replaced bytes as a recovery copy", async () => {
    const { projectId, notes } = await published();
    const next = encoder.encode("new notes");
    const result = await send(
      projectId,
      false,
      [{ op: "put_workspace_file", path: "notes.txt", hash: sha(next), size: next.byteLength, base_hash: sha(notes) }],
      [next]
    );
    expect(result).toMatchObject({ outcome: "committed" });
    expect(result.outcome === "committed" ? result.kept_beside : null).toBeUndefined();
    expect(await text(projectId, "notes.txt")).toBe("new notes");
    const copies = await listRecoveryCopies(projectId);
    expect(copies).toHaveLength(1);
    expect(copies[0]).toMatchObject({ workspace_path: "notes.txt", blob_hash: sha(notes), operation: "put_workspace_file" });
    const kept = await readBlob(server.storage, { projectId, hash: sha(notes) });
    expect(kept && decoder.decode(kept)).toBe("cloud notes");
  });

  it("keeps both files when the cloud file changed since the base", async () => {
    const { projectId } = await published();
    const mine = encoder.encode("my notes");
    const result = await send(
      projectId,
      false,
      [{ op: "put_workspace_file", path: "notes.txt", hash: sha(mine), size: mine.byteLength, base_hash: sha(encoder.encode("older")) }],
      [mine]
    );
    expect(result.outcome).toBe("committed");
    const keptPath = `notes (Studio Mac ${new Date().toISOString().slice(0, 10)}).txt`;
    expect(result.outcome === "committed" ? result.kept_beside : null).toEqual([{ path: "notes.txt", kept_path: keptPath }]);
    expect(await text(projectId, "notes.txt")).toBe("cloud notes");
    expect(await text(projectId, keptPath)).toBe("my notes");
    expect(await listRecoveryCopies(projectId)).toEqual([]);
  });

  it("keeps a changed asset's sent bytes as a new asset beside it (V22)", async () => {
    const { projectId, assetId } = await published();
    const mine = encoder.encode("my clip");
    const result = await send(
      projectId,
      false,
      [
        {
          op: "put_asset_file",
          asset_id: assetId,
          path: "media/clip.mp4",
          hash: sha(mine),
          size: mine.byteLength,
          base_hash: sha(encoder.encode("older clip")),
          name: "clip.mp4",
          content_type: "video/mp4"
        }
      ],
      [mine]
    );
    if (result.outcome !== "committed") throw new Error("expected a commit");
    const keptPath = `media/clip (Studio Mac ${new Date().toISOString().slice(0, 10)}).mp4`;
    expect(result.kept_beside).toHaveLength(1);
    const [entry] = result.kept_beside ?? [];
    expect(entry).toMatchObject({ path: "media/clip.mp4", kept_path: keptPath, asset_id: assetId });
    expect(entry?.kept_asset_id).not.toBe(assetId);
    expect(await text(projectId, "media/clip.mp4")).toBe("cloud clip");
    expect(await text(projectId, keptPath)).toBe("my clip");
    const keptAsset = await Asset.get<Asset>(entry?.kept_asset_id ?? "");
    expect(keptAsset).toMatchObject({ workspace_path: keptPath, content_hash: sha(mine), project_id: projectId });
    expect((await Asset.get<Asset>(assetId))?.content_hash).toBe(sha(encoder.encode("cloud clip")));
  });

  it("replaces an asset's bytes on its base and counts the same bytes again as done", async () => {
    const { projectId, assetId, clip } = await published();
    const next = encoder.encode("recut clip");
    const op: TransferFileOperation = {
      op: "put_asset_file",
      asset_id: assetId,
      path: "media/clip.mp4",
      hash: sha(next),
      size: next.byteLength,
      base_hash: sha(clip),
      name: "clip.mp4",
      content_type: "video/mp4"
    };
    expect((await send(projectId, false, [op], [next])).outcome).toBe("committed");
    expect(await text(projectId, "media/clip.mp4")).toBe("recut clip");
    expect((await Asset.get<Asset>(assetId))?.content_hash).toBe(sha(next));
    expect(await listRecoveryCopies(projectId)).toMatchObject([{ asset_id: assetId, blob_hash: sha(clip) }]);
    const again = await send(projectId, false, [op], [next]);
    expect(again.outcome === "committed" ? again.kept_beside : null).toBeUndefined();
    expect(await listRecoveryCopies(projectId)).toHaveLength(1);
  });

  it("deletes a file on its base, and refuses a delete over a changed file", async () => {
    const { projectId, notes } = await published();
    const refused = await send(projectId, false, [{ op: "delete_workspace_file", path: "notes.txt", base_hash: sha(encoder.encode("x")) }], []);
    expect(refused).toMatchObject({
      outcome: "refused",
      failures: [{ code: "BASE_CHANGED", path: "notes.txt", stored_hash: sha(notes) }]
    });
    expect(await text(projectId, "notes.txt")).toBe("cloud notes");
    const deleted = await send(projectId, false, [{ op: "delete_workspace_file", path: "notes.txt", base_hash: sha(notes) }], []);
    expect(deleted.outcome).toBe("committed");
    expect(await text(projectId, "notes.txt")).toBeNull();
    expect(await listRecoveryCopies(projectId)).toMatchObject([{ operation: "delete_workspace_file", blob_hash: sha(notes) }]);
    // An absent path counts as done.
    const again = await send(projectId, false, [{ op: "delete_workspace_file", path: "notes.txt", base_hash: sha(notes) }], []);
    expect(again.outcome).toBe("committed");
  });

  it("refuses a document file sent as a workspace file, and a put whose bytes were not staged", async () => {
    const projectId = id();
    const bytes = encoder.encode("{}");
    const refused = await send(
      projectId,
      true,
      [
        { op: "put_workspace_file", path: "a.workflow.json", hash: sha(bytes), size: bytes.byteLength, base_hash: null },
        { op: "put_workspace_file", path: "b.txt", hash: sha(encoder.encode("never sent")), size: 10, base_hash: null }
      ],
      [bytes]
    );
    expect(refused.outcome).toBe("refused");
    const codes = refused.outcome === "refused" ? refused.failures.map((f) => `${f.code}:${f.path}`) : [];
    expect(codes).toEqual(expect.arrayContaining(["PAYLOAD_INVALID:a.workflow.json", "FILE_NOT_STAGED:b.txt"]));
    expect(await listTransferPlacements(projectId)).toEqual([]);
  });

  it("leaves a placement that could not run in flux until the sweeper places it", async () => {
    const projectId = id();
    const assetId = id();
    const clip = encoder.encode("late clip");
    folderDown = true;
    const result = await send(
      projectId,
      true,
      [
        {
          op: "put_asset_file",
          asset_id: assetId,
          path: "clip.mp4",
          hash: sha(clip),
          size: clip.byteLength,
          base_hash: null,
          name: "clip.mp4",
          content_type: "video/mp4"
        }
      ],
      [clip]
    );
    expect(result.outcome).toBe("committed");
    expect(await pendingPlacementPaths(projectId)).toEqual(new Set(["clip.mp4"]));
    folderDown = false;
    // Too young for the sweeper.
    expect(await sweepTransferPlacements(server.storage)).toBe(0);
    expect(await sweepTransferPlacements(server.storage, new Date(Date.now() + 31_000))).toBe(1);
    expect(await text(projectId, "clip.mp4")).toBe("late clip");
    expect(await pendingPlacementPaths(projectId)).toEqual(new Set());
    expect((await Asset.get<Asset>(assetId))?.metadata).toMatchObject({ workspace_size: clip.byteLength });
  });
});
