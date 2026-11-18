/**
 * Transfers into a cloud project (technical design, "Sending: capture,
 * stage, commit attempt" and "Operations of a transfer", WP2.4), on an
 * in-process PostgreSQL engine with the production migrations.
 */
import { createHash, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  closeDb,
  deletedDocumentExists,
  initTestDb,
  listCloudTransferAttempts,
  listDocumentActivity,
  Message,
  Thread,
  setDocumentRetentionDays,
  Project,
  readableProjectBlob,
  TimelineSequence,
  TimelineSequenceVersion,
  Workflow,
  WorkflowVersion
} from "@nodetool-ai/models";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import type {
  CommitTransferInput,
  TransferDocumentKind,
  TransferManifest
} from "@nodetool-ai/protocol/api-schemas/transfer.js";
import {
  cancelTransfer,
  commitTransfer,
  openTransfer,
  stageTransferFile,
  TransferRequestError,
  transferStatus,
  type TransferHost,
  type TransferRole
} from "../src/cloud-transfer.js";
import { identityHash, transferPayloadOf, transferVersionPayloadOf } from "../src/transfer-documents.js";
import { conversationHash } from "../src/transfer-conversations.js";
import { initPgliteDb } from "./_helpers/pglite-db.js";

const OWNER = "user-owner";

function id(): string {
  return randomBytes(16).toString("hex");
}

function sha(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

interface TestHost extends TransferHost {
  roles: Map<string, TransferRole | null>;
  unreadable: string | null;
  publishedCalls: string[];
}

function testHost(): TestHost {
  const host: TestHost = {
    storage: new InMemoryStorageAdapter(),
    roles: new Map(),
    unreadable: null,
    publishedCalls: [],
    async documentRole(userId, kind, documentId) {
      const set = host.roles.get(`${kind}:${documentId}`);
      if (set !== undefined) return set;
      const payload = await transferPayloadOf(kind, documentId);
      if (!payload) return null;
      const row =
        kind === "workflow"
          ? await Workflow.get<Workflow>(documentId)
          : await TimelineSequence.findById(documentId);
      return row?.user_id === userId ? "owner" : null;
    },
    async checkAttach() {
      return { unreadable: host.unreadable, toAdmit: [] };
    },
    async published(kind, documentId) {
      host.publishedCalls.push(`${kind}:${documentId}`);
    }
  };
  return host;
}

function workflowPayload(name: string, assetId?: string): Record<string, unknown> {
  const nodes = assetId
    ? [{ id: "n1", type: "nodetool.constant.Image", data: { value: { type: "image", asset_id: assetId } } }]
    : [];
  return { name, description: "", tags: [], graph: { nodes, edges: [] }, settings: null, run_mode: "workflow" };
}

function timelinePayload(name: string): Record<string, unknown> {
  return { name, fps: 30, width: 1920, height: 1080, document: { tracks: [], clips: [], markers: [] } };
}

function manifestFor(
  operations: TransferManifest["operations"],
  requiredFiles: TransferManifest["required_files"] = [],
  projectName?: string
): TransferManifest {
  return { project_name: projectName, operations, required_files: requiredFiles };
}

function commitInput(
  transferId: string,
  manifest: TransferManifest,
  payloads: { kind: TransferDocumentKind; document_id: string; document: Record<string, unknown> }[],
  extra: Partial<CommitTransferInput> = {}
): CommitTransferInput {
  return {
    transfer_id: transferId,
    attempt_id: id(),
    manifest,
    decisions: [],
    missing_files: [],
    payloads,
    ...extra
  };
}

/** Publishes a project with one workflow and returns their ids. */
async function publishedProject(host: TestHost): Promise<{ projectId: string; workflowId: string }> {
  const projectId = id();
  const workflowId = id();
  const transferId = id();
  const payload = workflowPayload("First");
  const manifest = manifestFor(
    [{ op: "create_document", kind: "workflow", document_id: workflowId, captured_hash: identityHash(payload) }],
    [],
    "Cloud project"
  );
  await openTransfer(host, OWNER, { transfer_id: transferId, project_id: projectId, first_publication: true, manifest });
  const result = await commitTransfer(
    host,
    OWNER,
    commitInput(transferId, manifest, [{ kind: "workflow", document_id: workflowId, document: payload }])
  );
  expect(result.outcome).toBe("committed");
  return { projectId, workflowId };
}

describe("cloud transfers on PostgreSQL", { timeout: 30_000 }, () => {
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

  it("publishes a project with a workflow and a timeline in one commit", async () => {
    const projectId = id();
    const workflowId = id();
    const timelineId = id();
    const transferId = id();
    const workflow = workflowPayload("Edit");
    const timeline = timelinePayload("Cut");
    const manifest = manifestFor(
      [
        { op: "create_document", kind: "workflow", document_id: workflowId, captured_hash: identityHash(workflow) },
        { op: "create_document", kind: "timeline", document_id: timelineId, captured_hash: identityHash(timeline) }
      ],
      [],
      "Launch"
    );
    await openTransfer(host, OWNER, { transfer_id: transferId, project_id: projectId, first_publication: true, manifest });
    const result = await commitTransfer(
      host,
      OWNER,
      commitInput(transferId, manifest, [
        { kind: "workflow", document_id: workflowId, document: workflow },
        { kind: "timeline", document_id: timelineId, document: timeline }
      ])
    );

    expect(result).toEqual({
      outcome: "committed",
      project_id: projectId,
      documents: [
        { kind: "workflow", document_id: workflowId, hash: identityHash(workflow) },
        { kind: "timeline", document_id: timelineId, hash: identityHash(timeline) }
      ]
    });
    const project = await Project.get<Project>(projectId);
    expect(project?.name).toBe("Launch");
    expect(project?.user_id).toBe(OWNER);
    expect((await Workflow.get<Workflow>(workflowId))?.project_id).toBe(projectId);
    expect((await TimelineSequence.findById(timelineId))?.project_id).toBe(projectId);
    expect(host.publishedCalls).toEqual([`workflow:${workflowId}`, `timeline:${timelineId}`]);
    expect((await transferStatus(OWNER, transferId)).state).toBe("committed");
  });

  it("answers a repeated attempt with its recorded result and refuses other content under its id", async () => {
    const { projectId, workflowId } = await publishedProject(host);
    const transferId = id();
    const before = (await transferPayloadOf("workflow", workflowId))!;
    const next = workflowPayload("Second");
    const manifest = manifestFor([
      {
        op: "replace_document",
        kind: "workflow",
        document_id: workflowId,
        base_hash: identityHash(before),
        captured_hash: identityHash(next)
      }
    ]);
    await openTransfer(host, OWNER, { transfer_id: transferId, project_id: projectId, first_publication: false, manifest });
    const input = commitInput(transferId, manifest, [{ kind: "workflow", document_id: workflowId, document: next }]);

    const first = await commitTransfer(host, OWNER, input);
    const again = await commitTransfer(host, OWNER, input);
    expect(again).toEqual(first);
    expect(first.outcome).toBe("committed");
    expect((await Workflow.get<Workflow>(workflowId))?.name).toBe("Second");
    // A saved version keeps the replaced revision.
    const versions = await WorkflowVersion.listForWorkflow(workflowId);
    expect(versions.some((version) => version.name === "Before a transfer replaced it")).toBe(true);

    const altered = { ...input, decisions: [] , missing_files: [{ asset_id: id(), reason: "missing_locally" as const, documents: [] }] };
    await expect(commitTransfer(host, OWNER, altered)).rejects.toMatchObject({ code: "ATTEMPT_CONTENT_MISMATCH" });

    const other = await commitTransfer(host, OWNER, { ...input, attempt_id: id() });
    expect(other).toMatchObject({ outcome: "refused", failures: [{ code: "ALREADY_COMMITTED" }] });
    expect((await listCloudTransferAttempts(transferId)).map((attempt) => attempt.outcome)).toEqual([
      "committed",
      "refused"
    ]);
  });

  it("refuses a replace whose base changed until a Keep local decision names the stored hash", async () => {
    const { projectId, workflowId } = await publishedProject(host);
    const stored = (await transferPayloadOf("workflow", workflowId))!;
    const staleBase = identityHash(workflowPayload("Something older"));
    const next = workflowPayload("Local edit");
    const manifest = manifestFor([
      { op: "replace_document", kind: "workflow", document_id: workflowId, base_hash: staleBase, captured_hash: identityHash(next) }
    ]);
    const transferId = id();
    await openTransfer(host, OWNER, { transfer_id: transferId, project_id: projectId, first_publication: false, manifest });
    const payloads = [{ kind: "workflow" as const, document_id: workflowId, document: next }];

    const refused = await commitTransfer(host, OWNER, commitInput(transferId, manifest, payloads));
    expect(refused).toEqual({
      outcome: "refused",
      failures: [
        {
          code: "BASE_CHANGED",
          kind: "workflow",
          document_id: workflowId,
          stored_hash: identityHash(stored),
          message: "The cloud document changed since the review"
        }
      ]
    });
    expect((await Workflow.get<Workflow>(workflowId))?.name).toBe("First");

    const wrongDecision = await commitTransfer(
      host,
      OWNER,
      commitInput(transferId, manifest, payloads, {
        decisions: [{ kind: "workflow", document_id: workflowId, choice: "keep_local", cloud_hash: staleBase }]
      })
    );
    expect(wrongDecision).toMatchObject({ outcome: "refused", failures: [{ code: "BASE_CHANGED" }] });

    const kept = await commitTransfer(
      host,
      OWNER,
      commitInput(transferId, manifest, payloads, {
        decisions: [{ kind: "workflow", document_id: workflowId, choice: "keep_local", cloud_hash: identityHash(stored) }]
      })
    );
    expect(kept.outcome).toBe("committed");
    expect((await Workflow.get<Workflow>(workflowId))?.name).toBe("Local edit");
  });

  it("refuses payloads that do not match the manifest, and writes nothing", async () => {
    const projectId = id();
    const workflowId = id();
    const assetId = id();
    const transferId = id();
    const payload = workflowPayload("With a file", assetId);
    const manifest = manifestFor(
      [{ op: "create_document", kind: "workflow", document_id: workflowId, captured_hash: identityHash(workflowPayload("Other")) }],
      [],
      "Project"
    );
    await openTransfer(host, OWNER, { transfer_id: transferId, project_id: projectId, first_publication: true, manifest });

    const mismatch = await commitTransfer(
      host,
      OWNER,
      commitInput(transferId, manifest, [{ kind: "workflow", document_id: workflowId, document: payload }])
    );
    expect(mismatch).toMatchObject({ outcome: "refused", failures: [{ code: "PAYLOAD_HASH_MISMATCH" }] });

    const timelineId = id();
    const broken = { name: "Broken", fps: 30, width: 1920, height: 1080, document: { tracks: [] } };
    const brokenManifest = manifestFor(
      [{ op: "create_document", kind: "timeline", document_id: timelineId, captured_hash: identityHash(broken) }],
      [],
      "Project"
    );
    expect(
      await commitTransfer(
        host,
        OWNER,
        commitInput(transferId, brokenManifest, [{ kind: "timeline", document_id: timelineId, document: broken }])
      )
    ).toMatchObject({ outcome: "refused", failures: [{ code: "PAYLOAD_INVALID" }] });

    const missing = await commitTransfer(host, OWNER, commitInput(transferId, manifest, []));
    expect(missing).toMatchObject({ outcome: "refused", failures: [{ code: "PAYLOAD_MISSING" }] });

    const honest = manifestFor(
      [{ op: "create_document", kind: "workflow", document_id: workflowId, captured_hash: identityHash(payload) }],
      [],
      "Project"
    );
    const incomplete = await commitTransfer(
      host,
      OWNER,
      commitInput(transferId, honest, [{ kind: "workflow", document_id: workflowId, document: payload }])
    );
    expect(incomplete).toMatchObject({
      outcome: "refused",
      failures: [{ code: "MANIFEST_INCOMPLETE", asset_id: assetId }]
    });
    expect(await Project.get(projectId)).toBeNull();
    expect(await Workflow.get(workflowId)).toBeNull();
  });

  it("commits a file only after its bytes are staged, or when the person confirmed it missing", async () => {
    const projectId = id();
    const workflowId = id();
    const assetId = id();
    const transferId = id();
    const bytes = new TextEncoder().encode("file bytes");
    const hash = sha(bytes);
    const payload = workflowPayload("With a file", assetId);
    const manifest = manifestFor(
      [{ op: "create_document", kind: "workflow", document_id: workflowId, captured_hash: identityHash(payload) }],
      [{ asset_id: assetId, hash, size: bytes.byteLength, documents: [{ kind: "workflow", document_id: workflowId }] }],
      "Project"
    );
    const opened = await openTransfer(host, OWNER, {
      transfer_id: transferId,
      project_id: projectId,
      first_publication: true,
      manifest
    });
    expect(opened.needed_hashes).toEqual([hash]);
    const payloads = [{ kind: "workflow" as const, document_id: workflowId, document: payload }];

    const unstaged = await commitTransfer(host, OWNER, commitInput(transferId, manifest, payloads));
    expect(unstaged).toMatchObject({ outcome: "refused", failures: [{ code: "FILE_NOT_STAGED", asset_id: assetId, hash }] });

    await expect(
      stageTransferFile(host, OWNER, { transfer_id: transferId, hash, size: bytes.byteLength, bytes: new Uint8Array([1]) })
    ).rejects.toMatchObject({ code: "HASH_MISMATCH" });
    expect(await stageTransferFile(host, OWNER, { transfer_id: transferId, hash, size: bytes.byteLength, bytes })).toBe(
      "stored"
    );
    const committed = await commitTransfer(host, OWNER, commitInput(transferId, manifest, payloads));
    expect(committed.outcome).toBe("committed");
    expect((await readableProjectBlob({ projectId, hash }))?.committed_at).not.toBeNull();

    // A second transfer of a file the owner holds stages it without bytes.
    const secondId = id();
    const reopened = await openTransfer(host, OWNER, {
      transfer_id: secondId,
      project_id: projectId,
      first_publication: false,
      manifest: manifestFor([], manifest.required_files)
    });
    expect(reopened.needed_hashes).toEqual([]);

    // A file confirmed missing does not hold the commit back.
    const thirdId = id();
    const otherWorkflow = id();
    const otherAsset = id();
    const otherPayload = workflowPayload("Missing file", otherAsset);
    const missingManifest = manifestFor(
      [{ op: "create_document", kind: "workflow", document_id: otherWorkflow, captured_hash: identityHash(otherPayload) }],
      [{ asset_id: otherAsset, hash: sha(new Uint8Array([9])), size: 1, documents: [] }]
    );
    await openTransfer(host, OWNER, { transfer_id: thirdId, project_id: projectId, first_publication: false, manifest: missingManifest });
    const withMissing = await commitTransfer(
      host,
      OWNER,
      commitInput(thirdId, missingManifest, [{ kind: "workflow", document_id: otherWorkflow, document: otherPayload }], {
        missing_files: [{ asset_id: otherAsset, reason: "missing_locally", documents: [] }]
      })
    );
    expect(withMissing.outcome).toBe("committed");
  });

  it("checks access, membership and the attach rule at commit", async () => {
    const { projectId, workflowId } = await publishedProject(host);
    const stored = (await transferPayloadOf("workflow", workflowId))!;
    const next = workflowPayload("Edit");
    const replace = manifestFor([
      { op: "replace_document", kind: "workflow", document_id: workflowId, base_hash: identityHash(stored), captured_hash: identityHash(next) }
    ]);
    const payloads = [{ kind: "workflow" as const, document_id: workflowId, document: next }];
    const transferId = id();
    await openTransfer(host, OWNER, { transfer_id: transferId, project_id: projectId, first_publication: false, manifest: replace });

    host.roles.set(`workflow:${workflowId}`, null);
    expect(await commitTransfer(host, OWNER, commitInput(transferId, replace, payloads))).toMatchObject({
      failures: [{ code: "ACCESS_REMOVED" }]
    });
    host.roles.set(`workflow:${workflowId}`, "viewer");
    expect(await commitTransfer(host, OWNER, commitInput(transferId, replace, payloads))).toMatchObject({
      failures: [{ code: "EDITOR_REQUIRED" }]
    });
    host.roles.set(`workflow:${workflowId}`, "editor");
    const remove = manifestFor([
      { op: "delete_document", kind: "workflow", document_id: workflowId, base_hash: identityHash(stored), confirmed: true }
    ]);
    expect(await commitTransfer(host, OWNER, commitInput(transferId, remove, []))).toMatchObject({
      failures: [{ code: "OWNER_REQUIRED" }]
    });
    host.roles.delete(`workflow:${workflowId}`);
    host.unreadable = "f".repeat(32);
    expect(await commitTransfer(host, OWNER, commitInput(transferId, replace, payloads))).toMatchObject({
      failures: [{ code: "FILE_NOT_READABLE", asset_id: "f".repeat(32) }]
    });
    host.unreadable = null;

    const elsewhere = await publishedProject(host);
    const notHere = manifestFor([
      { op: "rename_document", kind: "workflow", document_id: elsewhere.workflowId, base_name: "First", name: "Moved" }
    ]);
    expect(await commitTransfer(host, OWNER, commitInput(transferId, notHere, []))).toMatchObject({
      failures: [{ code: "DOCUMENT_NOT_IN_PROJECT" }]
    });
    const exists = manifestFor([
      { op: "create_document", kind: "workflow", document_id: workflowId, captured_hash: identityHash(next) }
    ]);
    expect(await commitTransfer(host, OWNER, commitInput(transferId, exists, payloads))).toMatchObject({
      failures: [{ code: "DOCUMENT_EXISTS" }]
    });
    expect((await Workflow.get<Workflow>(workflowId))?.name).toBe("First");

    // Another person's transfer id is not found.
    await expect(transferStatus("someone-else", transferId)).rejects.toBeInstanceOf(TransferRequestError);
  });

  it("deletes a document with its restore period, and refuses later operations on it", async () => {
    const { projectId, workflowId } = await publishedProject(host);
    const stored = (await transferPayloadOf("workflow", workflowId))!;
    const remove = manifestFor([
      { op: "delete_document", kind: "workflow", document_id: workflowId, base_hash: identityHash(stored), confirmed: true }
    ]);
    const transferId = id();
    await openTransfer(host, OWNER, { transfer_id: transferId, project_id: projectId, first_publication: false, manifest: remove });
    const deleted = await commitTransfer(host, OWNER, commitInput(transferId, remove, []));
    expect(deleted).toEqual({ outcome: "committed", project_id: projectId, documents: [] });
    expect(await Workflow.get(workflowId)).toBeNull();
    expect(await deletedDocumentExists("workflow", workflowId)).toBe(true);

    const renameId = id();
    const rename = manifestFor([
      { op: "rename_document", kind: "workflow", document_id: workflowId, base_name: "First", name: "Again" }
    ]);
    await openTransfer(host, OWNER, { transfer_id: renameId, project_id: projectId, first_publication: false, manifest: rename });
    expect(await commitTransfer(host, OWNER, commitInput(renameId, rename, []))).toMatchObject({
      failures: [{ code: "DOCUMENT_DELETED" }]
    });
  });

  it("cancels an open transfer and drops its staged files", async () => {
    const { projectId } = await publishedProject(host);
    const transferId = id();
    const bytes = new TextEncoder().encode("staged then cancelled");
    const hash = sha(bytes);
    const manifest = manifestFor([], [{ asset_id: id(), hash, size: bytes.byteLength, documents: [] }]);
    await openTransfer(host, OWNER, { transfer_id: transferId, project_id: projectId, first_publication: false, manifest });
    await stageTransferFile(host, OWNER, { transfer_id: transferId, hash, size: bytes.byteLength, bytes });
    expect(await readableProjectBlob({ projectId, hash, transferId })).not.toBeNull();

    expect(await cancelTransfer(OWNER, transferId)).toEqual({ state: "cancelled" });
    expect(await readableProjectBlob({ projectId, hash, transferId })).toBeNull();
    expect(await commitTransfer(host, OWNER, commitInput(transferId, manifest, []))).toMatchObject({
      failures: [{ code: "TRANSFER_CANCELLED" }]
    });
    await expect(
      stageTransferFile(host, OWNER, { transfer_id: transferId, hash, size: bytes.byteLength, bytes })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("returns the committed result when a committed transfer is cancelled", async () => {
    const projectId = id();
    const transferId = id();
    const manifest = manifestFor([], [], "Empty");
    await openTransfer(host, OWNER, { transfer_id: transferId, project_id: projectId, first_publication: true, manifest });
    const result = await commitTransfer(host, OWNER, commitInput(transferId, manifest, []));
    expect(await cancelTransfer(OWNER, transferId)).toEqual({ state: "committed", result });
  });

  it("keeps both only with a decision that names the stored revision, and leaves the cloud document as it is", async () => {
    const { projectId, workflowId } = await publishedProject(host);
    const stored = (await transferPayloadOf("workflow", workflowId))!;
    const copyId = id();
    const local = workflowPayload("Local copy");
    const manifest = manifestFor([
      { op: "keep_both", kind: "workflow", document_id: workflowId, new_document_id: copyId, captured_hash: identityHash(local) }
    ]);
    const transferId = id();
    await openTransfer(host, OWNER, { transfer_id: transferId, project_id: projectId, first_publication: false, manifest });
    const payloads = [{ kind: "workflow" as const, document_id: copyId, document: local }];

    const refused = await commitTransfer(host, OWNER, commitInput(transferId, manifest, payloads));
    expect(refused).toMatchObject({
      outcome: "refused",
      failures: [{ code: "DECISION_REQUIRED", document_id: workflowId, stored_hash: identityHash(stored) }]
    });
    expect(await Workflow.get<Workflow>(copyId)).toBeNull();

    const kept = await commitTransfer(
      host,
      OWNER,
      commitInput(transferId, manifest, payloads, {
        decisions: [{ kind: "workflow", document_id: workflowId, choice: "keep_local", cloud_hash: identityHash(stored) }]
      })
    );
    expect(kept).toEqual({
      outcome: "committed",
      project_id: projectId,
      documents: [
        { kind: "workflow", document_id: workflowId, hash: identityHash(stored) },
        { kind: "workflow", document_id: copyId, hash: identityHash(local) }
      ]
    });
    expect((await Workflow.get<Workflow>(workflowId))?.name).toBe("First");
    expect((await Workflow.get<Workflow>(copyId))?.project_id).toBe(projectId);
    expect(host.publishedCalls).toContain(`workflow:${copyId}`);

    // The new id is fixed by the manifest, so another transfer cannot create it twice.
    const again = id();
    await openTransfer(host, OWNER, { transfer_id: again, project_id: projectId, first_publication: false, manifest });
    const twice = await commitTransfer(
      host,
      OWNER,
      commitInput(again, manifest, payloads, {
        decisions: [{ kind: "workflow", document_id: workflowId, choice: "keep_local", cloud_hash: identityHash(stored) }]
      })
    );
    expect(twice).toMatchObject({ outcome: "refused", failures: [{ code: "DOCUMENT_EXISTS", document_id: copyId }] });
  });

  it("adds saved versions under their ids, skips one already held and refuses an id with other content", async () => {
    const { projectId, workflowId } = await publishedProject(host);
    const first = { name: "Morning", description: null, graph: { nodes: [], edges: [] }, save_type: "manual" };
    const second = { name: null, description: "auto", graph: { nodes: [], edges: [] }, save_type: "autosave" };
    const firstId = id();
    const secondId = id();
    const manifest = manifestFor([
      {
        op: "add_versions",
        kind: "workflow",
        document_id: workflowId,
        versions: [
          { version_id: firstId, hash: identityHash(first) },
          { version_id: secondId, hash: identityHash(second) }
        ]
      }
    ]);
    const versions = [
      { kind: "workflow" as const, document_id: workflowId, version_id: firstId, version: first },
      { kind: "workflow" as const, document_id: workflowId, version_id: secondId, version: second }
    ];
    const transferId = id();
    await openTransfer(host, OWNER, { transfer_id: transferId, project_id: projectId, first_publication: false, manifest });

    const missing = await commitTransfer(host, OWNER, commitInput(transferId, manifest, [], { versions: versions.slice(0, 1) }));
    expect(missing).toMatchObject({ outcome: "refused", failures: [{ code: "PAYLOAD_MISSING", version_id: secondId }] });

    const added = await commitTransfer(host, OWNER, commitInput(transferId, manifest, [], { versions }));
    expect(added.outcome).toBe("committed");
    expect(await transferVersionPayloadOf("workflow", firstId)).toEqual(first);
    expect(await transferVersionPayloadOf("workflow", secondId)).toEqual(second);
    const stored = await WorkflowVersion.listForWorkflow(workflowId);
    expect(stored.map((version) => version.id).sort()).toEqual([firstId, secondId].sort());

    // Sent again with the same content, the versions count as done.
    const repeat = id();
    await openTransfer(host, OWNER, { transfer_id: repeat, project_id: projectId, first_publication: false, manifest });
    const numbers = (list: WorkflowVersion[]) => list.map((version) => `${version.id}:${version.version}`).sort();
    const before = numbers(stored);
    expect((await commitTransfer(host, OWNER, commitInput(repeat, manifest, [], { versions }))).outcome).toBe("committed");
    expect(numbers(await WorkflowVersion.listForWorkflow(workflowId))).toEqual(before);

    // The same id with other content is refused.
    const changed = { ...first, name: "Evening" };
    const conflicting = manifestFor([
      { op: "add_versions", kind: "workflow", document_id: workflowId, versions: [{ version_id: firstId, hash: identityHash(changed) }] }
    ]);
    const conflict = id();
    await openTransfer(host, OWNER, { transfer_id: conflict, project_id: projectId, first_publication: false, manifest: conflicting });
    const refused = await commitTransfer(
      host,
      OWNER,
      commitInput(conflict, conflicting, [], {
        versions: [{ kind: "workflow", document_id: workflowId, version_id: firstId, version: changed }]
      })
    );
    expect(refused).toMatchObject({ outcome: "refused", failures: [{ code: "VERSION_CONFLICT", version_id: firstId }] });
  });

  it("creates a document before it adds the saved versions listed ahead of it", async () => {
    const { projectId } = await publishedProject(host);
    const timelineId = id();
    const versionId = id();
    const timeline = timelinePayload("Cut");
    const version = {
      name: "Rough cut",
      save_type: "manual",
      fps: 24,
      width: 1280,
      height: 720,
      document: { tracks: [], clips: [{ id: "c1", startMs: 0, durationMs: 2000 }], markers: [] }
    };
    const manifest = manifestFor([
      { op: "add_versions", kind: "timeline", document_id: timelineId, versions: [{ version_id: versionId, hash: identityHash(version) }] },
      { op: "create_document", kind: "timeline", document_id: timelineId, captured_hash: identityHash(timeline) }
    ]);
    const transferId = id();
    await openTransfer(host, OWNER, { transfer_id: transferId, project_id: projectId, first_publication: false, manifest });
    const result = await commitTransfer(
      host,
      OWNER,
      commitInput(transferId, manifest, [{ kind: "timeline", document_id: timelineId, document: timeline }], {
        versions: [{ kind: "timeline", document_id: timelineId, version_id: versionId, version }]
      })
    );
    expect(result.outcome).toBe("committed");
    const stored = await TimelineSequenceVersion.get<TimelineSequenceVersion>(versionId);
    expect(stored?.timeline_id).toBe(timelineId);
    expect(stored?.duration_ms).toBe(2000);
    expect(await transferVersionPayloadOf("timeline", versionId)).toEqual(version);
  });

  it("moves a document to another project of its owner, and counts a document already there as moved", async () => {
    const { projectId, workflowId } = await publishedProject(host);
    const { projectId: targetId } = await publishedProject(host);
    const strangerProject = id();
    await Project.create<Project>({ id: strangerProject, user_id: "user-stranger", name: "Theirs", kind: "project" });
    const move = (target: string) =>
      manifestFor([
        { op: "move_document", kind: "workflow", document_id: workflowId, base_project_id: projectId, target_project_id: target }
      ]);
    const commitMove = async (target: string) => {
      const transferId = id();
      const manifest = move(target);
      await openTransfer(host, OWNER, { transfer_id: transferId, project_id: projectId, first_publication: false, manifest });
      return commitTransfer(host, OWNER, commitInput(transferId, manifest, []));
    };

    expect(await commitMove(strangerProject)).toMatchObject({
      outcome: "refused",
      failures: [{ code: "PROJECT_EDITOR_REQUIRED", project_id: strangerProject }]
    });
    expect(await commitMove(id())).toMatchObject({ outcome: "refused", failures: [{ code: "PROJECT_NOT_FOUND" }] });

    host.roles.set(`workflow:${workflowId}`, "editor");
    expect(await commitMove(targetId)).toMatchObject({ outcome: "refused", failures: [{ code: "OWNER_REQUIRED" }] });
    host.roles.delete(`workflow:${workflowId}`);

    expect((await commitMove(targetId)).outcome).toBe("committed");
    expect((await Workflow.get<Workflow>(workflowId))?.project_id).toBe(targetId);
    // The same move again changes nothing.
    expect((await commitMove(targetId)).outcome).toBe("committed");
    expect((await Workflow.get<Workflow>(workflowId))?.project_id).toBe(targetId);
    // V8: the move is in the activity record once.
    expect(await listDocumentActivity("workflow", workflowId)).toMatchObject([
      { seq: 1, type: "move", user_id: OWNER, payload: { from: projectId, to: targetId } }
    ]);
  });

  it("records both names of each rename, and nothing for the same name again (V6)", async () => {
    const { projectId, workflowId } = await publishedProject(host);
    const rename = async (baseName: string, name: string) => {
      const transferId = id();
      const manifest = manifestFor([{ op: "rename_document", kind: "workflow", document_id: workflowId, base_name: baseName, name }]);
      await openTransfer(host, OWNER, { transfer_id: transferId, project_id: projectId, first_publication: false, manifest });
      return commitTransfer(host, OWNER, commitInput(transferId, manifest, []));
    };
    expect((await rename("First", "Second")).outcome).toBe("committed");
    expect((await rename("Second", "Third")).outcome).toBe("committed");
    expect((await rename("Third", "Third")).outcome).toBe("committed");
    expect((await Workflow.get<Workflow>(workflowId))?.name).toBe("Third");
    expect(await listDocumentActivity("workflow", workflowId)).toMatchObject([
      { seq: 1, type: "rename", payload: { from: "First", to: "Second" } },
      { seq: 2, type: "rename", payload: { from: "Second", to: "Third" } }
    ]);
  });

  it("adds a conversation under its id, copies one whose id is taken, and never adds one twice", async () => {
    const { projectId } = await publishedProject(host);
    const conversation = (threadId: string, text: string) => ({
      thread_id: threadId,
      title: "Ideas",
      kind: "chat",
      messages: [
        { id: id(), role: "user", content: text, created_at: "2026-11-17T10:00:00.000Z" },
        { id: id(), role: "assistant", content: `Re: ${text}`, created_at: "2026-11-17T10:00:01.000Z" }
      ]
    });
    const send = async (payloads: ReturnType<typeof conversation>[], hashes = payloads.map((p) => conversationHash(p))) => {
      const transferId = id();
      const manifest: TransferManifest = {
        ...manifestFor([]),
        conversations: payloads.map((p, index) => ({ thread_id: p.thread_id, captured_hash: hashes[index] ?? "" }))
      };
      await openTransfer(host, OWNER, { transfer_id: transferId, project_id: projectId, first_publication: false, manifest });
      return commitTransfer(host, OWNER, commitInput(transferId, manifest, [], { conversations: payloads }));
    };

    const free = conversation(id(), "free");
    const takenId = id();
    const otherProject = id();
    await Project.create<Project>({ id: otherProject, user_id: "user-other", name: "Theirs", kind: "project" });
    await Thread.create<Thread>({ id: takenId, user_id: "user-other", project_id: otherProject, title: "Not yours" });
    const taken = conversation(takenId, "taken");

    expect(await send([free], ["0".repeat(64)])).toMatchObject({
      outcome: "refused",
      failures: [{ code: "PAYLOAD_HASH_MISMATCH", thread_id: free.thread_id }]
    });

    const result = await send([free, taken]);
    if (result.outcome !== "committed") throw new Error("expected a commit");
    const copiedId = result.conversations?.[1]?.thread_id ?? "";
    expect(result.conversations).toEqual([
      { source_thread_id: free.thread_id, thread_id: free.thread_id },
      { source_thread_id: takenId, thread_id: copiedId }
    ]);
    expect(copiedId).not.toBe(takenId);
    expect(await Thread.get<Thread>(free.thread_id)).toMatchObject({ user_id: OWNER, project_id: projectId, title: "Ideas" });
    expect((await Thread.get<Thread>(takenId))?.title).toBe("Not yours");
    const [copiedMessages] = await Message.paginate(copiedId, { limit: 10 });
    expect(copiedMessages.map((message) => message.content)).toEqual(["taken", "Re: taken"]);

    // A later transfer of the same conversation changes nothing.
    const again = await send([conversation(free.thread_id, "more")]);
    expect(again).toMatchObject({ outcome: "committed", conversations: [{ thread_id: free.thread_id }] });
    const [freeMessages] = await Message.paginate(free.thread_id, { limit: 10 });
    expect(freeMessages.map((message) => message.content)).toEqual(["free", "Re: free"]);
  });

  it("refuses a first publication into an existing project id", async () => {
    const { projectId } = await publishedProject(host);
    await expect(
      openTransfer(host, OWNER, { transfer_id: id(), project_id: projectId, first_publication: true, manifest: manifestFor([]) })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("cloud transfers on SQLite", () => {
  beforeEach(() => {
    initTestDb();
  });

  afterEach(async () => {
    await closeDb();
  });

  it("refuses to commit, because the commit needs PostgreSQL", async () => {
    await expect(
      commitTransfer(testHost(), OWNER, commitInput(id(), manifestFor([]), []))
    ).rejects.toMatchObject({ code: "NEEDS_POSTGRES" });
  });
});
