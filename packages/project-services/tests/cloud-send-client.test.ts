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
import {
  Asset,
  getCloudLink,
  getCloudLinkDocumentByLocalId,
  getCloudLinkFile,
  getCloudSend,
  initTestDb,
  Workflow
} from "@nodetool-ai/models";
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

  async open(input: { transfer_id: string; project_id: string; first_publication: boolean; manifest: TransferManifest }) {
    expect(input.project_id).toBe(PROJECT);
    expect(input.first_publication).toBe(!this.projectExists);
    const staged = this.staged.get(input.transfer_id) ?? new Set<string>();
    this.staged.set(input.transfer_id, staged);
    const needed = input.manifest.required_files
      .map((file) => file.hash)
      .filter((hash) => !this.blobs.has(hash) && !staged.has(hash));
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
    for (const file of input.manifest.required_files) {
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
    await runSend(cloud, review.transferId, { confirmDeletes: [workflow.id] });
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
});
