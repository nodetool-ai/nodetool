/**
 * The local half of a send (technical design, "Sending: capture, stage,
 * commit attempt", WP2.7): capture against the link bases, staging only what
 * the cloud lacks, one attempt per commit, bases after a commit, a refusal
 * answered with a decision, and resume of an attempt in flight. The cloud is
 * a fake transport that checks payload hashes and bases as the server does.
 */
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PauseGate } from "@nodetool-ai/config/testing/pause-harness";
import { setPauseHandler } from "@nodetool-ai/config/pause-points";
import { withProjectFolderLock } from "@nodetool-ai/asset-services/project-asset";
import {
  Asset,
  getCloudLink,
  getCloudLinkDocumentByLocalId,
  getCloudLinkFile,
  getCloudSend,
  DOCUMENT_FILE_MISSING,
  initTestDb,
  updateCloudSend,
  Workflow
} from "@nodetool-ai/models";
import { CloudRequestError } from "../src/cloud-http-transport.js";
import {
  createLocalWorkspace,
  setProjectFolderResolver,
  type ProjectFolderResolution,
  type Workspace
} from "@nodetool-ai/runtime";
import type {
  CommitTransferInput,
  TransferAttemptResult,
  TransferFailure,
  TransferManifest,
  TransferStatusOutput
} from "@nodetool-ai/protocol/api-schemas/transfer.js";
import {
  cancelSend,
  captureSend,
  resumeSends,
  runSend,
  SendCaptureError,
  type SendTransport
} from "../src/cloud-send-client.js";
import { identityHash } from "../src/transfer-documents.js";

const USER = "local-user";
const PROJECT = "b".repeat(32);
const TARGET = { userId: USER, projectId: PROJECT, serverKey: "0123456789abcdef", accountId: "account-1", projectName: "Film" };

function id(): string {
  return randomBytes(16).toString("hex");
}

function sha(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** A cloud server that answers the `transfers` endpoints from memory, with the server's checks. */
class FakeCloud implements SendTransport {
  readonly documents = new Map<string, string>();
  readonly blobs = new Set<string>();
  readonly staged = new Map<string, Set<string>>();
  readonly attempts = new Map<string, Array<{ attempt_id: string; result: TransferAttemptResult }>>();
  readonly committed = new Set<string>();
  readonly commits: CommitTransferInput[] = [];
  projectExists = false;
  dropCommitAnswer = false;

  readonly opened = new Set<string>();
  readonly cancels: string[] = [];

  async open(input: { transfer_id: string; project_id: string; first_publication: boolean; manifest: TransferManifest }) {
    this.opened.add(input.transfer_id);
    expect(input.project_id).toBe(PROJECT);
    expect(input.first_publication).toBe(!this.projectExists);
    const staged = this.staged.get(input.transfer_id) ?? new Set<string>();
    this.staged.set(input.transfer_id, staged);
    const needed = [
      ...input.manifest.required_files.map((file) => file.hash),
      ...(input.manifest.file_operations ?? []).flatMap((op) => (op.op === "delete_workspace_file" ? [] : [op.hash]))
    ].filter((hash) => !this.blobs.has(hash) && !staged.has(hash));
    return { needed_hashes: [...new Set(needed)].sort(), allowance_bytes: null, used_bytes: 0 };
  }

  async stageFile(input: { transfer_id: string; hash: string; size: number }, source: string) {
    const bytes = await readFile(source);
    expect(sha(bytes)).toBe(input.hash);
    this.staged.get(input.transfer_id)!.add(input.hash);
  }

  async commit(input: CommitTransferInput): Promise<TransferAttemptResult> {
    this.commits.push(input);
    const result = this.decide(input);
    const list = this.attempts.get(input.transfer_id) ?? [];
    list.push({ attempt_id: input.attempt_id, result });
    this.attempts.set(input.transfer_id, list);
    if (this.dropCommitAnswer) {
      this.dropCommitAnswer = false;
      throw new Error("The connection dropped before the answer");
    }
    return result;
  }

  private decide(input: CommitTransferInput): TransferAttemptResult {
    if (this.committed.has(input.transfer_id)) {
      return { outcome: "refused", failures: [{ code: "ALREADY_COMMITTED", message: "committed" }] };
    }
    const failures: TransferFailure[] = [];
    const payloads = new Map(input.payloads.map((payload) => [payload.document_id, identityHash(payload.document)]));
    for (const operation of input.manifest.operations) {
      if (operation.op === "create_document" || operation.op === "replace_document") {
        expect(payloads.get(operation.document_id)).toBe(operation.captured_hash);
      }
      if (operation.op === "delete_document" && this.documents.get(operation.document_id) !== operation.base_hash) {
        const stored = this.documents.get(operation.document_id);
        failures.push({ code: "BASE_CHANGED", document_id: operation.document_id, stored_hash: stored, message: "changed" });
      }
      if (operation.op === "replace_document") {
        const stored = this.documents.get(operation.document_id);
        const covered = input.decisions.some(
          (decision) => decision.document_id === operation.document_id && decision.cloud_hash === stored
        );
        if (stored !== operation.base_hash && !covered) {
          failures.push({ code: "BASE_CHANGED", document_id: operation.document_id, stored_hash: stored, message: "changed" });
        }
      }
    }
    const staged = this.staged.get(input.transfer_id) ?? new Set<string>();
    for (const file of [...input.manifest.required_files, ...(input.manifest.file_operations ?? [])]) {
      if (!("hash" in file)) continue;
      if (!this.blobs.has(file.hash) && !staged.has(file.hash)) {
        failures.push({ code: "FILE_NOT_STAGED", hash: file.hash, message: "not staged" });
      }
    }
    if (failures.length > 0) return { outcome: "refused", failures };
    const documents = [];
    for (const operation of input.manifest.operations) {
      if (operation.op === "create_document" || operation.op === "replace_document") {
        this.documents.set(operation.document_id, operation.captured_hash);
        documents.push({ kind: operation.kind, document_id: operation.document_id, hash: operation.captured_hash });
      }
      if (operation.op === "delete_document") this.documents.delete(operation.document_id);
    }
    for (const hash of staged) this.blobs.add(hash);
    this.committed.add(input.transfer_id);
    this.projectExists = true;
    return { outcome: "committed", project_id: PROJECT, documents };
  }

  async status(input: { transfer_id: string }): Promise<TransferStatusOutput> {
    return {
      state: this.committed.has(input.transfer_id) ? "committed" : "open",
      project_id: PROJECT,
      attempts: this.attempts.get(input.transfer_id) ?? []
    };
  }

  async cancel(input: { transfer_id: string }) {
    this.cancels.push(input.transfer_id);
    // The server knows no transfer it did not open.
    if (!this.opened.has(input.transfer_id)) throw new CloudRequestError(404, "NOT_FOUND", "Transfer not found");
    const committed = this.attempts.get(input.transfer_id)?.find((attempt) => attempt.result.outcome === "committed");
    return committed ? { state: "committed" as const, result: committed.result } : { state: "cancelled" as const };
  }
}

describe("sending a project to the cloud", { timeout: 30_000 }, () => {
  let root: string;
  let folder: Workspace;
  let cloud: FakeCloud;

  beforeEach(async () => {
    initTestDb();
    root = await mkdtemp(join(tmpdir(), "nodetool-send-"));
    folder = createLocalWorkspace(join(root, PROJECT));
    await folder.mkdir("");
    setProjectFolderResolver(async (projectId): Promise<ProjectFolderResolution> => {
      if (projectId !== PROJECT) return { ok: false, reason: "No such folder" };
      return { ok: true, projectId, workspace: folder };
    });
    cloud = new FakeCloud();
  });

  afterEach(async () => {
    setProjectFolderResolver(null);
    await rm(root, { recursive: true, force: true });
  });

  async function workflowWithFile(bytes: Uint8Array | null, marker = "one"): Promise<{ workflow: Workflow; asset: Asset | null }> {
    let asset: Asset | null = null;
    if (bytes) {
      await folder.write("media/still.png", bytes);
      asset = await Asset.create<Asset>({
        user_id: USER,
        project_id: PROJECT,
        parent_id: USER,
        name: "still.png",
        content_type: "image/png",
        workspace_path: "media/still.png",
        size: bytes.byteLength
      });
    }
    const nodes = [
      { id: "n0", type: "nodetool.constant.String", data: { value: marker } },
      ...(asset ? [{ id: "n1", type: "nodetool.constant.Image", data: { value: { type: "image", asset_id: asset.id } } }] : [])
    ];
    const workflow = await Workflow.create<Workflow>({
      user_id: USER,
      project_id: PROJECT,
      name: "Edit",
      access: "private",
      graph: { nodes, edges: [] }
    });
    return { workflow, asset };
  }

  it("publishes a project for the first time, stages its file once and links it", async () => {
    const bytes = randomBytes(64);
    const { workflow, asset } = await workflowWithFile(bytes);

    const review = await captureSend(TARGET);
    expect(review.firstPublication).toBe(true);
    expect(review.operations).toMatchObject([{ op: "create_document", document_id: workflow.id }]);
    expect(review.documents).toEqual([
      { kind: "workflow", localId: workflow.id, cloudId: workflow.id, name: workflow.name }
    ]);

    const outcome = await runSend(cloud, review.transferId);
    expect(outcome.status).toBe("committed");
    expect(cloud.commits).toHaveLength(1);
    expect(cloud.commits[0]!.manifest.project_name).toBe("Film");
    expect(cloud.commits[0]!.manifest.file_operations).toMatchObject([
      { op: "put_asset_file", asset_id: asset!.id, hash: sha(bytes), base_hash: null, path: "media/still.png" }
    ]);
    expect(cloud.blobs.has(sha(bytes))).toBe(true);

    const link = await getCloudLink(USER, PROJECT);
    expect(link).toMatchObject({ cloud_project_id: PROJECT, server_key: TARGET.serverKey });
    expect(await getCloudLinkDocumentByLocalId(link!.id, "workflow", workflow.id)).toMatchObject({
      cloud_id: workflow.id,
      base_content_hash: cloud.documents.get(workflow.id)
    });
    expect((await getCloudLinkFile(link!.id, asset!.id))?.base_hash).toBe(sha(bytes));
    expect(await getCloudSend(review.transferId)).toBeNull();

    // Nothing changed: the next capture sends nothing.
    const again = await captureSend(TARGET);
    expect(again.firstPublication).toBe(false);
    expect(again.operations).toEqual([]);
  });

  it("sends the folder's workspace files, and only the ones that changed since (CF2, CF5, TC101)", async () => {
    const { workflow } = await workflowWithFile(randomBytes(64));
    const notes = new TextEncoder().encode("shot list");
    await folder.write("notes.txt", notes);
    await folder.write("docs/brief.md", new TextEncoder().encode("brief"));
    // Workflow and timeline files travel as documents only (CF2).
    await folder.write("cuts/rough.timeline.json", new TextEncoder().encode("{}"));
    await folder.write("by-row.json", new TextEncoder().encode("{}"));
    workflow.file_path = "by-row.json";
    await workflow.save();
    // The index's scan leaves out dot directories and node_modules (CF5).
    await folder.write(".git/config", new TextEncoder().encode("[core]"));
    await folder.write("node_modules/pkg/index.js", new TextEncoder().encode("x"));

    const review = await captureSend(TARGET);
    const workspacePuts = () =>
      cloud.commits.at(-1)!.manifest.file_operations!.filter((op) => op.op === "put_workspace_file");
    expect(review.fileOperations.filter((op) => op.op === "put_workspace_file").map((op) => op.path)).toEqual([
      "docs/brief.md",
      "notes.txt"
    ]);
    expect(await runSend(cloud, review.transferId)).toMatchObject({ status: "committed" });
    expect(workspacePuts()).toEqual([
      { op: "put_workspace_file", path: "docs/brief.md", hash: sha(new TextEncoder().encode("brief")), size: 5, base_hash: null },
      { op: "put_workspace_file", path: "notes.txt", hash: sha(notes), size: notes.byteLength, base_hash: null }
    ]);
    expect(cloud.blobs.has(sha(notes))).toBe(true);

    // Nothing changed: no workspace file goes again.
    expect((await captureSend(TARGET)).fileOperations).toEqual([]);

    // An edited file goes over the base of its path.
    const edited = new TextEncoder().encode("shot list, take two");
    await folder.write("notes.txt", edited);
    const next = await captureSend(TARGET);
    expect(next.fileOperations).toEqual([
      { op: "put_workspace_file", path: "notes.txt", hash: sha(edited), size: edited.byteLength, base_hash: sha(notes) }
    ]);
  });

  it("captures again when a workspace file changes while it is read (CF4)", async () => {
    await workflowWithFile(null);
    await folder.write("notes.txt", new TextEncoder().encode("first"));
    let writes = 0;
    setPauseHandler(async (name) => {
      if (name !== "send.capture.workspace-file-read" || writes > 0) return;
      writes += 1;
      await folder.write("notes.txt", new TextEncoder().encode("second, longer"));
    });
    try {
      const review = await captureSend(TARGET);
      expect(writes).toBe(1);
      expect(review.fileOperations).toEqual([
        expect.objectContaining({ path: "notes.txt", hash: sha(new TextEncoder().encode("second, longer")) })
      ]);
    } finally {
      setPauseHandler(null);
    }
  });

  it("replaces an edited document over its base, and stages no file the cloud holds", async () => {
    const { workflow } = await workflowWithFile(randomBytes(64));
    await runSend(cloud, (await captureSend(TARGET)).transferId);
    const before = cloud.documents.get(workflow.id);
    workflow.graph = { ...workflow.graph, nodes: [...workflow.graph.nodes, { id: "n2", type: "nodetool.constant.String", data: { value: "two" } }] };
    await workflow.save();

    const review = await captureSend(TARGET);
    expect(review.operations).toMatchObject([{ op: "replace_document", document_id: workflow.id, base_hash: before }]);
    const outcome = await runSend(cloud, review.transferId);
    expect(outcome.status).toBe("committed");
    expect(cloud.commits.at(-1)!.manifest.file_operations).toEqual([]);
  });

  it("keeps the send open on a refusal, and commits a new attempt with the person's decision", async () => {
    const { workflow } = await workflowWithFile(null);
    await runSend(cloud, (await captureSend(TARGET)).transferId);
    workflow.name = "Edit 2";
    await workflow.save();
    // A collaborator saved the cloud document meanwhile.
    const collaborator = "f".repeat(64);
    cloud.documents.set(workflow.id, collaborator);

    const review = await captureSend(TARGET);
    const refused = await runSend(cloud, review.transferId);
    expect(refused).toMatchObject({ status: "refused", failures: [{ code: "BASE_CHANGED", stored_hash: collaborator }] });
    expect((await getCloudSend(review.transferId))?.state).toBe("open");

    const decided = await runSend(cloud, review.transferId, {
      decisions: [{ kind: "workflow", document_id: workflow.id, choice: "keep_local", cloud_hash: collaborator }]
    });
    expect(decided.status).toBe("committed");
    expect(new Set(cloud.commits.map((commit) => commit.attempt_id)).size).toBe(cloud.commits.length);
  });

  it("asks the cloud for the recorded result after a crash with an attempt in flight", async () => {
    const { workflow } = await workflowWithFile(randomBytes(32));
    const review = await captureSend(TARGET);
    cloud.dropCommitAnswer = true;
    await expect(runSend(cloud, review.transferId)).rejects.toThrow("dropped");
    expect((await getCloudSend(review.transferId))?.state).toBe("committing");

    const outcomes = await resumeSends(() => cloud, USER);
    expect(outcomes).toMatchObject([{ status: "committed", transferId: review.transferId }]);
    // The commit was not sent again: the recorded result was enough.
    expect(cloud.commits).toHaveLength(1);
    const link = await getCloudLink(USER, PROJECT);
    expect((await getCloudLinkDocumentByLocalId(link!.id, "workflow", workflow.id))?.base_content_hash).toBe(
      cloud.documents.get(workflow.id)
    );
  });

  it("sends the commit again when a crash came before it reached the cloud", async () => {
    await workflowWithFile(null);
    const review = await captureSend(TARGET);
    await expect(
      runSend(cloud, review.transferId, {
        afterStep: (step) => {
          if (step === "committing") throw new Error("killed");
        }
      })
    ).rejects.toThrow("killed");
    expect(cloud.commits).toHaveLength(0);
    expect(await resumeSends(() => cloud, USER)).toMatchObject([{ status: "committed" }]);
    expect(cloud.commits).toHaveLength(1);
  });

  it("deletes a document gone locally only after the deletion review confirms it", async () => {
    const { workflow } = await workflowWithFile(null);
    await runSend(cloud, (await captureSend(TARGET)).transferId);
    await Workflow.deleteOwned(USER, workflow.id);

    const review = await captureSend(TARGET);
    expect(review.deletedLocally).toMatchObject([{ localId: workflow.id }]);
    expect(review.operations).toEqual([]);
    await runSend(cloud, review.transferId, {
      confirmDeletes: [{ kind: "workflow", cloudId: workflow.id, cloudHash: review.deletedLocally[0]!.baseHash }]
    });
    expect(cloud.commits.at(-1)!.manifest.operations).toMatchObject([{ op: "delete_document", document_id: workflow.id }]);
    expect(cloud.documents.has(workflow.id)).toBe(false);
    const link = await getCloudLink(USER, PROJECT);
    expect(await getCloudLinkDocumentByLocalId(link!.id, "workflow", workflow.id)).toBeNull();
  });

  it("refuses to capture a file linked from outside the folder (CF6)", async () => {
    const { asset } = await workflowWithFile(randomBytes(16));
    await asset!.update({ external_path: "/elsewhere/still.png" });
    await expect(captureSend(TARGET)).rejects.toBeInstanceOf(SendCaptureError);
  });

  it("lists a file missing from the folder for the review", async () => {
    const { asset } = await workflowWithFile(randomBytes(16));
    await folder.delete("media/still.png");
    const review = await captureSend(TARGET);
    expect(review.missingFiles).toMatchObject([{ asset_id: asset!.id, reason: "missing_locally" }]);
  });

  it("cancels an open send, and keeps the bases of one that committed", async () => {
    await workflowWithFile(null);
    const open = await captureSend(TARGET);
    expect(await cancelSend(cloud, open.transferId)).toBe("cancelled");
    expect(await getCloudSend(open.transferId)).toBeNull();

    const review = await captureSend(TARGET);
    cloud.dropCommitAnswer = true;
    await expect(runSend(cloud, review.transferId)).rejects.toThrow();
    expect(await cancelSend(cloud, review.transferId)).toBe("committed");
    expect(await getCloudLink(USER, PROJECT)).not.toBeNull();
  });

  it("hashes a file without a hash after it releases the folder lock, and again when another app wrote it meanwhile (CF4, review F38)", async () => {
    const first = randomBytes(64);
    const { asset } = await workflowWithFile(first);
    const gate = new PauseGate(["send.capture.file-read"]).install();
    try {
      const capturing = captureSend(TARGET);
      await gate.waitFor("send.capture.file-read");
      // The read holds no folder lock: another writer gets the lock meanwhile.
      expect(await withProjectFolderLock(USER, PROJECT, async () => "free")).toBe("free");
      const second = randomBytes(96);
      await folder.write("media/still.png", second);
      gate.release("send.capture.file-read");
      // The changed fingerprint makes the capture run again and read the new bytes.
      await gate.waitFor("send.capture.file-read", 2);
      gate.release("send.capture.file-read");
      const review = await capturing;
      const sent = (await getCloudSend(review.transferId))!;
      const manifest = (JSON.parse(sent.plan) as { manifest: TransferManifest }).manifest;
      expect(manifest.required_files).toMatchObject([{ asset_id: asset!.id, hash: sha(second), size: 96 }]);
      expect((await Asset.get<Asset>(asset!.id))?.content_hash).toBe(sha(second));
    } finally {
      gate.uninstall();
    }
  });

  it("sends a document whose file is missing from its row and lists the file, and leaves out an invalid file (CF3, TC99, review F37)", async () => {
    const { workflow: missing } = await workflowWithFile(null, "missing");
    const { workflow: invalid } = await workflowWithFile(null, "invalid");
    // The first capture's reconcile writes each document's file.
    await captureSend(TARGET);
    const missingFile = (await Workflow.get<Workflow>(missing.id))!.file_path!;
    const invalidFile = (await Workflow.get<Workflow>(invalid.id))!.file_path!;
    await folder.delete(missingFile);
    await folder.write(invalidFile, new TextEncoder().encode("{ not json"));

    const review = await captureSend(TARGET);
    expect((await Workflow.get<Workflow>(missing.id))?.file_error).toBe(DOCUMENT_FILE_MISSING);
    expect(review.operations).toMatchObject([{ op: "create_document", document_id: missing.id }]);
    expect(review.missingDocumentFiles).toEqual([{ kind: "workflow", id: missing.id, name: missing.name }]);
    expect(review.skipped).toMatchObject([{ id: invalid.id, reason: "invalid_file" }]);
  });

  it("sends a media file that changed in place while its workflow stayed the same (review F33)", async () => {
    const { asset } = await workflowWithFile(randomBytes(64));
    const first = await captureSend(TARGET);
    await runSend(cloud, first.transferId);
    const before = (await getCloudLinkFile((await getCloudLink(USER, PROJECT))!.id, asset!.id))!.base_hash;
    const edited = randomBytes(80);
    await folder.write("media/still.png", edited);

    const review = await captureSend(TARGET);
    expect(review.operations).toEqual([]);
    expect(review.fileOperations).toMatchObject([
      { op: "put_asset_file", asset_id: asset!.id, hash: sha(edited), base_hash: before }
    ]);
    expect(await runSend(cloud, review.transferId)).toMatchObject({ status: "committed" });
    expect(cloud.blobs.has(sha(edited))).toBe(true);
    const link = await getCloudLink(USER, PROJECT);
    expect((await getCloudLinkFile(link!.id, asset!.id))?.base_hash).toBe(sha(edited));
    expect((await captureSend(TARGET)).fileOperations).toEqual([]);
  });

  it("sends without a missing file only after the person confirms that exact file (X7, review F36)", async () => {
    const { asset } = await workflowWithFile(randomBytes(16));
    await folder.delete("media/still.png");
    const review = await captureSend(TARGET);
    expect(review.missingFiles).toHaveLength(1);
    const listed = review.missingFiles[0]!;

    expect(await runSend(cloud, review.transferId)).toMatchObject({ status: "missing_files_unconfirmed", missingFiles: [listed] });
    expect(cloud.commits).toHaveLength(0);
    // A confirmation of another file, or of the file for other documents, is not one of this list.
    const wrong = [{ ...listed, asset_id: id() }];
    expect((await runSend(cloud, review.transferId, { confirmMissingFiles: wrong })).status).toBe("missing_files_unconfirmed");
    const fewer = [{ ...listed, documents: [] }];
    expect((await runSend(cloud, review.transferId, { confirmMissingFiles: fewer })).status).toBe("missing_files_unconfirmed");
    expect(cloud.commits).toHaveLength(0);

    expect(await runSend(cloud, review.transferId, { confirmMissingFiles: [listed] })).toMatchObject({ status: "committed" });
    expect(cloud.commits.at(-1)!.missing_files).toMatchObject([{ asset_id: asset!.id }]);
  });

  it("deletes a document the cloud edited after its local deletion once the person confirms that cloud revision (V4, review F40)", async () => {
    const { workflow } = await workflowWithFile(null);
    await runSend(cloud, (await captureSend(TARGET)).transferId);
    await Workflow.deleteOwned(USER, workflow.id);
    // A collaborator saved the cloud document after the local deletion.
    const newer = "e".repeat(64);
    cloud.documents.set(workflow.id, newer);

    const review = await captureSend(TARGET);
    const [deleted] = review.deletedLocally;
    // Confirming against the last exchanged hash is refused with the newer one.
    const refused = await runSend(cloud, review.transferId, {
      confirmDeletes: [{ kind: "workflow", cloudId: workflow.id, cloudHash: deleted!.baseHash }]
    });
    expect(refused).toMatchObject({ status: "refused", failures: [{ code: "BASE_CHANGED", stored_hash: newer }] });
    expect(cloud.documents.get(workflow.id)).toBe(newer);

    // The sheet shows the newer revision and the person confirms it.
    const confirmed = await runSend(cloud, review.transferId, {
      confirmDeletes: [{ kind: "workflow", cloudId: workflow.id, cloudHash: newer }]
    });
    expect(confirmed.status).toBe("committed");
    expect(cloud.commits.at(-1)!.manifest.operations).toMatchObject([
      { op: "delete_document", document_id: workflow.id, base_hash: newer, confirmed: true }
    ]);
    expect(cloud.documents.has(workflow.id)).toBe(false);
  });

  it("drops a withdrawn deletion from the next attempt and keeps it only for crash recovery (review F43)", async () => {
    const { workflow } = await workflowWithFile(null);
    await runSend(cloud, (await captureSend(TARGET)).transferId);
    await Workflow.deleteOwned(USER, workflow.id);
    const review = await captureSend(TARGET);
    const [deleted] = review.deletedLocally;
    const confirm = [{ kind: "workflow" as const, cloudId: workflow.id, cloudHash: deleted!.baseHash }];

    // The first attempt with the confirmed deletion is refused for another reason.
    const original = cloud.commit.bind(cloud);
    cloud.commit = async (input) => {
      cloud.commits.push(input);
      return { outcome: "refused", failures: [{ code: "QUOTA", message: "full" }] };
    };
    expect((await runSend(cloud, review.transferId, { confirmDeletes: confirm })).status).toBe("refused");
    cloud.commit = original;

    // The person unchecks the last deletion. The next attempt carries none,
    // whether the list comes empty or not at all.
    expect((await runSend(cloud, review.transferId, {})).status).toBe("committed");
    expect(cloud.commits.at(-1)!.manifest.operations).not.toContainEqual(
      expect.objectContaining({ op: "delete_document" })
    );
    expect(cloud.documents.has(workflow.id)).toBe(true);
  });

  it("keeps a confirmed deletion when a crash interrupts its attempt (review F43)", async () => {
    const { workflow } = await workflowWithFile(null);
    await runSend(cloud, (await captureSend(TARGET)).transferId);
    await Workflow.deleteOwned(USER, workflow.id);
    const review = await captureSend(TARGET);
    const [deleted] = review.deletedLocally;
    await expect(
      runSend(cloud, review.transferId, {
        confirmDeletes: [{ kind: "workflow", cloudId: workflow.id, cloudHash: deleted!.baseHash }],
        afterStep: (step) => {
          if (step === "committing") throw new Error("killed");
        }
      })
    ).rejects.toThrow("killed");
    expect(await resumeSends(() => cloud, USER)).toMatchObject([{ status: "committed" }]);
    expect(cloud.documents.has(workflow.id)).toBe(false);
  });

  it("cancels a send the cloud never opened here alone, and an opened one on the cloud too (review F41)", async () => {
    await workflowWithFile(null);
    const captured = await captureSend(TARGET);
    expect(await cancelSend(cloud, captured.transferId)).toBe("cancelled");
    expect(await getCloudSend(captured.transferId)).toBeNull();

    const refused = await captureSend(TARGET);
    const original = cloud.commit.bind(cloud);
    cloud.commit = async (input) => {
      cloud.commits.push(input);
      return { outcome: "refused", failures: [{ code: "QUOTA", message: "full" }] };
    };
    expect((await runSend(cloud, refused.transferId)).status).toBe("refused");
    cloud.commit = original;
    expect(cloud.opened.has(refused.transferId)).toBe(true);
    expect(await cancelSend(cloud, refused.transferId)).toBe("cancelled");
    expect(await getCloudSend(refused.transferId)).toBeNull();
  });

  it("cancels on the cloud a send whose open answer was lost, and a send from before the open was recorded (review F52)", async () => {
    await workflowWithFile(null);
    const lost = await captureSend(TARGET);
    const open = cloud.open.bind(cloud);
    cloud.open = async (input) => {
      await open(input);
      throw new CloudRequestError(0, "HTTP_0", "The connection reset");
    };
    await expect(runSend(cloud, lost.transferId)).rejects.toThrow("The connection reset");
    expect(cloud.opened.has(lost.transferId)).toBe(true);
    expect(await cancelSend(cloud, lost.transferId)).toBe("cancelled");
    expect(cloud.cancels).toContain(lost.transferId);
    expect(await getCloudSend(lost.transferId)).toBeNull();

    // An open that never reached the cloud: the cloud answers not found.
    const unreached = await captureSend(TARGET);
    cloud.open = async () => {
      throw new CloudRequestError(0, "HTTP_0", "The connection reset");
    };
    await expect(runSend(cloud, unreached.transferId)).rejects.toThrow("The connection reset");
    expect(await cancelSend(cloud, unreached.transferId)).toBe("cancelled");
    expect(cloud.cancels).toContain(unreached.transferId);
    expect(await getCloudSend(unreached.transferId)).toBeNull();
    cloud.open = open;

    // A plan written before the open was recorded may have been opened.
    const legacy = await captureSend(TARGET);
    await open({
      transfer_id: legacy.transferId,
      project_id: PROJECT,
      first_publication: true,
      manifest: { operations: [], required_files: [], file_operations: [] } as unknown as TransferManifest
    });
    const row = await getCloudSend(legacy.transferId);
    const plan = JSON.parse(row!.plan) as Record<string, unknown>;
    delete plan["openAttempted"];
    delete plan["opened"];
    await updateCloudSend(legacy.transferId, { plan });
    expect(await cancelSend(cloud, legacy.transferId)).toBe("cancelled");
    expect(cloud.cancels).toContain(legacy.transferId);
    expect(await getCloudSend(legacy.transferId)).toBeNull();
  });
});
