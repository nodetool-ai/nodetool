/**
 * Erasing a file of a cloud project and the erased list (technical design,
 * "Deletion, restore and storage" and "Storage recovery and erase", WP2.9),
 * on an in-process PostgreSQL engine with the production migrations, which
 * the transfer commit needs.
 */
import { createHash, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  Asset,
  closeDb,
  commitProjectBlobs,
  getErasedFile,
  listDocumentActivity,
  listMissingFiles,
  Project,
  readableProjectBlob,
  setDocumentRetentionDays,
  stageProjectBlob,
  storageUse,
  TimelineSequence,
  Workflow,
  WorkflowVersion
} from "@nodetool-ai/models";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import { blobKey } from "@nodetool-ai/asset-services/blob-store";
import type { CommitTransferInput, TransferManifest } from "@nodetool-ai/protocol/api-schemas/transfer.js";
import { commitTransfer, openTransfer, stageTransferFile, type TransferHost, type TransferRole } from "../src/cloud-transfer.js";
import { eraseProjectFile, EraseRequestError, previewErase, takeOffErasedList } from "../src/project-erase.js";
import { identityHash, transferPayloadOf } from "../src/transfer-documents.js";
import { initPgliteDb } from "./_helpers/pglite-db.js";

const OWNER = "user-owner";
const EDITOR = "user-editor";
const STRANGER = "user-stranger";

function id(): string {
  return randomBytes(16).toString("hex");
}

function sha(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

interface TestHost extends TransferHost {
  storage: InMemoryStorageAdapter;
  /** Roles of people other than the owner, by `user:kind:id`. */
  grants: Map<string, TransferRole>;
}

function testHost(): TestHost {
  const host: TestHost = {
    storage: new InMemoryStorageAdapter(),
    grants: new Map(),
    async documentRole(userId, kind, documentId) {
      const row =
        kind === "workflow" ? await Workflow.get<Workflow>(documentId) : await TimelineSequence.findById(documentId);
      if (!row) return null;
      if (row.user_id === userId) return "owner";
      return host.grants.get(`${userId}:${kind}:${documentId}`) ?? null;
    },
    async checkAttach() {
      return { unreadable: null, toAdmit: [] };
    },
    async published() {}
  };
  return host;
}

function graphWith(assetId: string | null) {
  const nodes = assetId
    ? [{ id: "n1", type: "nodetool.constant.Image", data: { value: { type: "image", asset_id: assetId } } }]
    : [];
  return { nodes, edges: [] };
}

function workflowPayload(name: string, assetId: string | null): Record<string, unknown> {
  return { name, description: "", tags: [], graph: graphWith(assetId), settings: null, run_mode: "workflow" };
}

async function cloudProject(): Promise<string> {
  const projectId = id();
  await Project.create<Project>({ id: projectId, user_id: OWNER, name: "Cloud project", kind: "project" });
  return projectId;
}

async function workflowIn(projectId: string, assetId: string | null, name = "Edit"): Promise<Workflow> {
  return Workflow.create<Workflow>({
    id: id(),
    user_id: OWNER,
    project_id: projectId,
    name,
    access: "private",
    description: "",
    tags: [],
    graph: graphWith(assetId),
    settings: null,
    run_mode: "workflow"
  });
}

async function versionOf(workflow: Workflow, assetId: string): Promise<WorkflowVersion> {
  return WorkflowVersion.create<WorkflowVersion>({
    workflow_id: workflow.id,
    user_id: OWNER,
    name: "Take two",
    description: null,
    graph: graphWith(assetId),
    save_type: "manual",
    version: await WorkflowVersion.nextVersion(workflow.id)
  });
}

/** An asset with content `bytes` and a committed row of the project, as a committed transfer leaves them. */
async function heldFile(
  host: TestHost,
  projectId: string,
  bytes: Uint8Array,
  options: { workspacePath?: string } = {}
): Promise<{ assetId: string; hash: string }> {
  const hash = sha(bytes);
  const asset = await Asset.create<Asset>({
    user_id: OWNER,
    project_id: projectId,
    name: "take.png",
    content_type: "image/png",
    size: bytes.byteLength,
    content_hash: hash,
    workspace_path: options.workspacePath ?? null
  });
  const transferId = id();
  await stageProjectBlob({ projectId, userId: OWNER, hash, size: bytes.byteLength, transferId });
  await commitProjectBlobs(projectId, transferId);
  await host.storage.store(blobKey(hash), bytes);
  return { assetId: asset.id, hash };
}

/** The transfer hash of the document as stored now, the base of a replace. */
async function storedHash(workflowId: string): Promise<string> {
  return identityHash((await transferPayloadOf("workflow", workflowId))!);
}

async function requestError(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof EraseRequestError) return error.code;
    throw error;
  }
  throw new Error("Expected a refused request");
}

function manifestFor(
  operations: TransferManifest["operations"],
  requiredFiles: TransferManifest["required_files"] = []
): TransferManifest {
  return { operations, required_files: requiredFiles };
}

function commitInput(
  transferId: string,
  manifest: TransferManifest,
  payloads: CommitTransferInput["payloads"],
  extra: Partial<CommitTransferInput> = {}
): CommitTransferInput {
  return { transfer_id: transferId, attempt_id: id(), manifest, decisions: [], missing_files: [], payloads, ...extra };
}

describe("erasing files of a cloud project", { timeout: 30_000 }, () => {
  let host: TestHost;

  beforeEach(async () => {
    await initPgliteDb();
    setDocumentRetentionDays(30);
    host = testHost();
  });

  afterEach(async () => {
    setDocumentRetentionDays(null);
    await closeDb();
  });

  it("refuses while a current revision shows the file and names it, then erases a file only versions keep", async () => {
    const projectId = await cloudProject();
    const bytes = new Uint8Array(randomBytes(64));
    const { assetId, hash } = await heldFile(host, projectId, bytes);
    const workflow = await workflowIn(projectId, assetId);

    const refused = await eraseProjectFile(host, OWNER, { project_id: projectId, hash });
    expect(refused).toEqual({
      outcome: "refused",
      hash,
      current: [{ kind: "workflow", document_id: workflow.id, name: "Edit" }]
    });
    expect(await readableProjectBlob({ projectId, hash })).not.toBeNull();
    expect(await getErasedFile(projectId, hash)).toBeNull();

    // The take is no longer current: only a saved version refers to it.
    const version = await versionOf(workflow, assetId);
    const stored = await Workflow.get<Workflow>(workflow.id);
    stored!.graph = graphWith(null);
    await stored!.save();

    const preview = await previewErase(host, OWNER, { project_id: projectId, hash });
    expect(preview).toEqual({
      hash,
      size: bytes.byteLength,
      asset_ids: [assetId],
      current: [],
      references: [{ kind: "workflow", document_id: workflow.id, name: "Edit", where: "version", version_ids: [version.id] }]
    });
    expect(await storageUse(OWNER)).toEqual({ usedBytes: bytes.byteLength, fileCount: 1 });

    const erased = await eraseProjectFile(host, OWNER, { project_id: projectId, hash });
    expect(erased).toMatchObject({ outcome: "erased", hash, size: bytes.byteLength, asset_ids: [assetId] });
    // Storage use drops at once, the row and the object are gone, and the hash is on the list.
    expect(await storageUse(OWNER)).toEqual({ usedBytes: 0, fileCount: 0 });
    expect(await readableProjectBlob({ projectId, hash })).toBeNull();
    expect(await host.storage.exists(host.storage.uriForKey(blobKey(hash)))).toBe(false);
    expect(await getErasedFile(projectId, hash)).toMatchObject({ user_id: OWNER, size: bytes.byteLength, asset_ids: [assetId] });
    // The version still refers to the file, and the activity record names who erased it.
    expect((await WorkflowVersion.get<WorkflowVersion>(version.id))?.graph).toEqual(graphWith(assetId));
    expect(await listDocumentActivity("workflow", workflow.id)).toEqual([
      expect.objectContaining({
        type: "file_erased",
        user_id: OWNER,
        payload: { project_id: projectId, hash, size: bytes.byteLength, asset_ids: [assetId], version_ids: [version.id] }
      })
    ]);

    // A second erase answers with the row and writes nothing more.
    const again = await eraseProjectFile(host, OWNER, { project_id: projectId, hash });
    expect(again).toMatchObject({ outcome: "erased", hash, erased_at: erased.outcome === "erased" ? erased.erased_at : "" });
    expect(await listDocumentActivity("workflow", workflow.id)).toHaveLength(1);
  });

  it("refuses while a file in the project's folder has the content", async () => {
    const projectId = await cloudProject();
    const { assetId, hash } = await heldFile(host, projectId, new Uint8Array(randomBytes(32)), {
      workspacePath: "media/take.png"
    });

    expect(await eraseProjectFile(host, OWNER, { project_id: projectId, hash })).toEqual({
      outcome: "refused",
      hash,
      current: [{ kind: "file", asset_id: assetId, path: "media/take.png" }]
    });
    expect(await readableProjectBlob({ projectId, hash })).not.toBeNull();
  });

  it("keeps serving the file in a second project of the owner (TC82)", async () => {
    const first = await cloudProject();
    const second = await cloudProject();
    const bytes = new Uint8Array(randomBytes(48));
    const { hash } = await heldFile(host, first, bytes);
    const transferId = id();
    await stageProjectBlob({ projectId: second, userId: OWNER, hash, size: bytes.byteLength, transferId });
    await commitProjectBlobs(second, transferId);

    expect((await eraseProjectFile(host, OWNER, { project_id: first, hash })).outcome).toBe("erased");

    expect(await readableProjectBlob({ projectId: first, hash })).toBeNull();
    expect(await readableProjectBlob({ projectId: second, hash })).not.toBeNull();
    expect(await host.storage.exists(host.storage.uriForKey(blobKey(hash)))).toBe(true);
    // The hash is still held once, so storage use drops by nothing.
    expect(await storageUse(OWNER)).toEqual({ usedBytes: bytes.byteLength, fileCount: 1 });
  });

  it("lets only the owner erase or take a file off the list (SR33)", async () => {
    const projectId = await cloudProject();
    const { hash } = await heldFile(host, projectId, new Uint8Array(randomBytes(16)));
    const workflow = await workflowIn(projectId, null);
    host.grants.set(`${EDITOR}:workflow:${workflow.id}`, "editor");

    expect(await requestError(eraseProjectFile(host, EDITOR, { project_id: projectId, hash }))).toBe("FORBIDDEN");
    expect(await requestError(previewErase(host, EDITOR, { project_id: projectId, hash }))).toBe("FORBIDDEN");
    expect(await requestError(eraseProjectFile(host, STRANGER, { project_id: projectId, hash }))).toBe("NOT_FOUND");
    expect(await requestError(takeOffErasedList(host, EDITOR, { project_id: projectId, hash }))).toBe("FORBIDDEN");
    expect(await requestError(eraseProjectFile(host, OWNER, { project_id: projectId, hash: "abc" }))).toBe("INVALID");
    expect(await requestError(eraseProjectFile(host, OWNER, { project_id: projectId, hash: sha(new Uint8Array([1])) }))).toBe(
      "NOT_FOUND"
    );
    expect(await readableProjectBlob({ projectId, hash })).not.toBeNull();
  });

  it("does not require, stage or commit an erased file, and stages it again once it is off the list", async () => {
    const projectId = await cloudProject();
    const bytes = new Uint8Array(randomBytes(40));
    const { assetId, hash } = await heldFile(host, projectId, bytes);
    const workflow = await workflowIn(projectId, null);
    expect((await eraseProjectFile(host, OWNER, { project_id: projectId, hash })).outcome).toBe("erased");

    // A copy that holds the file sends a pick of it: nothing is uploaded.
    const payload = workflowPayload("Edit", assetId);
    const required = [{ asset_id: assetId, hash, size: bytes.byteLength, documents: [{ kind: "workflow" as const, document_id: workflow.id }] }];
    const replace = (base: string) =>
      manifestFor(
        [{ op: "replace_document", kind: "workflow", document_id: workflow.id, base_hash: base, captured_hash: identityHash(payload) }],
        required
      );
    const base = await storedHash(workflow.id);
    const transferId = id();
    const opened = await openTransfer(host, OWNER, { transfer_id: transferId, project_id: projectId, first_publication: false, manifest: replace(base) });
    expect(opened.needed_hashes).toEqual([]);
    const committed = await commitTransfer(
      host,
      OWNER,
      commitInput(transferId, replace(base), [{ kind: "workflow", document_id: workflow.id, document: payload }])
    );
    expect(committed.outcome).toBe("committed");
    expect(await readableProjectBlob({ projectId, hash })).toBeNull();

    // A copy that does not hold the file lists it nowhere: the erased list covers it.
    const later = workflowPayload("Edit again", assetId);
    const laterManifest = manifestFor([
      {
        op: "replace_document",
        kind: "workflow",
        document_id: workflow.id,
        base_hash: await storedHash(workflow.id),
        captured_hash: identityHash(later)
      }
    ]);
    const laterId = id();
    await openTransfer(host, OWNER, { transfer_id: laterId, project_id: projectId, first_publication: false, manifest: laterManifest });
    expect(
      (await commitTransfer(host, OWNER, commitInput(laterId, laterManifest, [{ kind: "workflow", document_id: workflow.id, document: later }])))
        .outcome
    ).toBe("committed");
    expect(await listMissingFiles(projectId)).toEqual([]);

    // Off the list, the next transfer from a copy that holds the file stages it again.
    expect(await takeOffErasedList(host, OWNER, { project_id: projectId, hash })).toBe(true);
    expect(await takeOffErasedList(host, OWNER, { project_id: projectId, hash })).toBe(false);
    const again = await openTransfer(host, OWNER, {
      transfer_id: id(),
      project_id: projectId,
      first_publication: false,
      manifest: manifestFor([], required)
    });
    expect(again.needed_hashes).toEqual([hash]);
  });

  it("commits a transfer without a file erased after it was staged (TC81)", async () => {
    const projectId = await cloudProject();
    const workflow = await workflowIn(projectId, null);
    const bytes = new Uint8Array(randomBytes(24));
    // Another asset with this content is held already, and a version refers to it.
    const { hash, assetId: heldAsset } = await heldFile(host, projectId, bytes);
    await versionOf(workflow, heldAsset);
    const assetId = id();
    const payload = workflowPayload("Edit", assetId);
    const manifest = manifestFor(
      [
        {
          op: "replace_document",
          kind: "workflow",
          document_id: workflow.id,
          base_hash: await storedHash(workflow.id),
          captured_hash: identityHash(payload)
        }
      ],
      [{ asset_id: assetId, hash, size: bytes.byteLength, documents: [{ kind: "workflow", document_id: workflow.id }] }]
    );
    const transferId = id();
    await openTransfer(host, OWNER, { transfer_id: transferId, project_id: projectId, first_publication: false, manifest });
    expect(await stageTransferFile(host, OWNER, { transfer_id: transferId, hash, size: bytes.byteLength, bytes })).toBe(
      "already_present"
    );

    expect((await eraseProjectFile(host, OWNER, { project_id: projectId, hash })).outcome).toBe("erased");
    // A client that missed the erase sends the bytes again: they are staged, not committed.
    await stageTransferFile(host, OWNER, { transfer_id: transferId, hash, size: bytes.byteLength, bytes });
    expect(await readableProjectBlob({ projectId, hash, transferId })).not.toBeNull();
    const committed = await commitTransfer(
      host,
      OWNER,
      commitInput(transferId, manifest, [{ kind: "workflow", document_id: workflow.id, document: payload }])
    );

    expect(committed.outcome).toBe("committed");
    expect(await readableProjectBlob({ projectId, hash, transferId })).toBeNull();
    expect(await storageUse(OWNER)).toEqual({ usedBytes: 0, fileCount: 0 });
  });

  it("keeps the Incomplete list: a confirmed missing file is listed until a transfer supplies it (X7)", async () => {
    const projectId = await cloudProject();
    const workflow = await workflowIn(projectId, null);
    const first = id();
    const second = id();
    const secondBytes = new Uint8Array(randomBytes(20));
    const secondHash = sha(secondBytes);
    const payload: Record<string, unknown> = {
      ...workflowPayload("Edit", null),
      graph: {
        nodes: [
          { id: "n1", type: "nodetool.constant.Image", data: { value: { type: "image", asset_id: first } } },
          { id: "n2", type: "nodetool.constant.Image", data: { value: { type: "image", asset_id: second } } }
        ],
        edges: []
      }
    };
    const replace = manifestFor(
      [
        {
          op: "replace_document",
          kind: "workflow",
          document_id: workflow.id,
          base_hash: await storedHash(workflow.id),
          captured_hash: identityHash(payload)
        }
      ],
      [{ asset_id: second, hash: secondHash, size: secondBytes.byteLength, documents: [{ kind: "workflow", document_id: workflow.id }] }]
    );
    const transferId = id();
    await openTransfer(host, OWNER, { transfer_id: transferId, project_id: projectId, first_publication: false, manifest: replace });
    const committed = await commitTransfer(
      host,
      OWNER,
      commitInput(transferId, replace, [{ kind: "workflow", document_id: workflow.id, document: payload }], {
        missing_files: [
          { asset_id: first, size: 900, reason: "too_large", documents: [{ kind: "workflow", document_id: workflow.id }] },
          { asset_id: second, hash: secondHash, size: secondBytes.byteLength, reason: "missing_locally", documents: [] }
        ]
      })
    );
    expect(committed.outcome).toBe("committed");
    expect((await listMissingFiles(projectId)).map((row) => [row.asset_id, row.reason, row.size])).toEqual(
      [
        [first, "too_large", 900],
        [second, "missing_locally", secondBytes.byteLength]
      ].sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    );

    // A later transfer supplies the second file: it leaves the list, the first stays.
    const supply = manifestFor([], replace.required_files);
    const supplyId = id();
    await openTransfer(host, OWNER, { transfer_id: supplyId, project_id: projectId, first_publication: false, manifest: supply });
    await stageTransferFile(host, OWNER, { transfer_id: supplyId, hash: secondHash, size: secondBytes.byteLength, bytes: secondBytes });
    expect((await commitTransfer(host, OWNER, commitInput(supplyId, supply, []))).outcome).toBe("committed");
    expect((await listMissingFiles(projectId)).map((row) => row.asset_id)).toEqual([first]);
  });
});
