/**
 * The local half of a send to a cloud project
 * (docs/plans/native-cloud-sync/technical-design.md, "Sending: capture,
 * stage, commit attempt", WP2.7). It runs in the server bundled with a
 * native app, against the cloud's `transfers` endpoints through a
 * {@link SendTransport}.
 *
 * {@link captureSend} reads the project under the folder lock and records the
 * manifest and the captured payloads in a `cloud_sends` row, so every
 * attempt of the transfer carries the same content. {@link runSend} opens the
 * transfer, stages the files the cloud lacks, and commits one attempt. The
 * attempt id is recorded before the commit is sent: after a crash
 * {@link resumeSends} asks the cloud for that attempt's recorded result, and
 * a committed attempt only updates the local bases.
 *
 * This half captures documents and the asset files they need. Workspace
 * files that no document names, and the folder rules CF1 to CF6 in full, are
 * WP2.11.
 */
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { createLogger } from "@nodetool-ai/config";
import {
  Asset,
  createCloudLink,
  createCloudSend,
  deleteCloudLinkDocument,
  deleteCloudSend,
  getCloudLink,
  getCloudLinkById,
  getCloudLinkDocumentByLocalId,
  getCloudLinkFile,
  getCloudSend,
  listCloudLinkDocuments,
  listCloudSends,
  setCloudLinkDocumentBase,
  setCloudLinkFileBase,
  TimelineSequence,
  updateCloudSend,
  withTransaction,
  Workflow,
  type CloudLinkRow,
  type CloudSendRow
} from "@nodetool-ai/models";
import type { Workspace } from "@nodetool-ai/runtime";
import { withProjectFolderLock } from "@nodetool-ai/asset-services/project-asset";
import { contentHashOfFile, requireProjectFolder } from "@nodetool-ai/asset-services/project-asset-file";
import type {
  CancelTransferOutput,
  CommitTransferInput,
  OpenTransferOutput,
  TransferAttemptResult,
  TransferDecision,
  TransferDocumentKind,
  TransferFailure,
  TransferFileOperation,
  TransferManifest,
  TransferMissingFile,
  TransferOperation,
  TransferPayload,
  TransferRequiredFile,
  TransferStatusOutput
} from "@nodetool-ai/protocol/api-schemas/transfer.js";
import { reconcileInBackground } from "./project-index.js";
import { identityHash, TRANSFER_DOCUMENT_KINDS, transferPayloadOf } from "./transfer-documents.js";

const log = createLogger("nodetool.project-services.cloud-send-client");

/** The cloud's `transfers` endpoints, as the client calls them. */
export interface SendTransport {
  open(input: {
    transfer_id: string;
    project_id: string;
    first_publication: boolean;
    manifest: TransferManifest;
  }): Promise<OpenTransferOutput>;
  /** Sends the bytes of the file at `source`, a path on this computer. */
  stageFile(input: { transfer_id: string; hash: string; size: number }, source: string): Promise<void>;
  commit(input: CommitTransferInput): Promise<TransferAttemptResult>;
  status(input: { transfer_id: string }): Promise<TransferStatusOutput>;
  cancel(input: { transfer_id: string }): Promise<CancelTransferOutput>;
}

/** Where a send goes: the cloud server and account, and the project when it is linked already. */
export interface SendTarget {
  userId: string;
  projectId: string;
  serverKey: string;
  accountId: string;
  /** The project name a first publication gives the cloud project. */
  projectName?: string;
  deviceName?: string;
}

/** A local document the capture left out, for the review sheet. */
export interface SkippedDocument {
  kind: TransferDocumentKind;
  id: string;
  name: string;
  /** `invalid_file` for a file that does not validate (CF3). */
  reason: "invalid_file";
  detail: string;
}

/** A document a send would delete on the cloud because it is gone here. */
export interface DeletedLocally {
  kind: TransferDocumentKind;
  localId: string;
  cloudId: string;
  baseHash: string;
}

interface CapturedDocument {
  kind: TransferDocumentKind;
  localId: string;
  cloudId: string;
  name: string;
  capturedHash: string;
}

interface CapturedFile {
  assetId: string;
  hash: string;
  size: number;
  /** The path in the project folder. */
  path: string;
}

interface SendPlan {
  version: 1;
  firstPublication: boolean;
  manifest: TransferManifest;
  payloads: TransferPayload[];
  documents: CapturedDocument[];
  files: CapturedFile[];
  missingFiles: TransferMissingFile[];
  skipped: SkippedDocument[];
  deletedLocally: DeletedLocally[];
  decisions: TransferDecision[];
}

/** What {@link captureSend} found, for the review sheet. */
export interface SendReview {
  transferId: string;
  firstPublication: boolean;
  operations: TransferOperation[];
  missingFiles: TransferMissingFile[];
  skipped: SkippedDocument[];
  /** Documents gone here that the deletion review must confirm before a send deletes them. */
  deletedLocally: DeletedLocally[];
}

/** What {@link runSend} ended with. */
export type SendOutcome =
  | { status: "committed"; transferId: string; result: Extract<TransferAttemptResult, { outcome: "committed" }> }
  | { status: "refused"; transferId: string; failures: TransferFailure[] };

/** The capture cannot start, for a reason the person has to fix first. */
export class SendCaptureError extends Error {
  constructor(
    message: string,
    /** Assets with a file outside the folder, which must be collected first (CF6). */
    readonly external: string[]
  ) {
    super(message);
    this.name = "SendCaptureError";
  }
}

function newId(): string {
  return randomBytes(16).toString("hex");
}

/** The path on this computer of a file in a local project folder. */
function localPath(workspace: Workspace, path: string): string {
  if (!workspace.localDir) throw new Error("A send needs a project folder on this computer");
  return join(workspace.localDir, workspace.key(path));
}

/**
 * The hash of an asset's file (CF4): the recorded `content_hash` while the
 * file still has the recorded size and modification time, and otherwise the
 * hash of the file read as a stream. Null when the file is gone.
 */
async function hashOfAsset(workspace: Workspace, asset: Asset): Promise<{ hash: string; size: number } | null> {
  const path = asset.workspace_path;
  if (!path) return null;
  const stat = await workspace.stat(path);
  if (!stat) return null;
  const metadata = asset.metadata ?? {};
  if (
    asset.content_hash &&
    metadata["workspace_size"] === stat.size &&
    metadata["workspace_mtime"] === stat.modifiedAt
  ) {
    return { hash: asset.content_hash, size: stat.size };
  }
  return { hash: await contentHashOfFile(localPath(workspace, path)), size: stat.size };
}

interface LocalDocument {
  kind: TransferDocumentKind;
  id: string;
  name: string;
  fileError: string | null;
}

async function localDocuments(userId: string, projectId: string): Promise<LocalDocument[]> {
  const [workflows, timelines] = await Promise.all([
    Workflow.listForProjects(userId, [projectId]),
    TimelineSequence.listForProjects(userId, [projectId])
  ]);
  return [
    ...workflows.map((row) => ({ kind: "workflow" as const, id: row.id, name: row.name, fileError: row.file_error ?? null })),
    ...timelines.map((row) => ({ kind: "timeline" as const, id: row.id, name: row.name, fileError: row.file_error ?? null }))
  ];
}

/**
 * Captures the project for a send and records it in state `open`. Under the
 * folder lock it compares the folder with the rows first (CF1), then reads
 * every document and the files they need. A project that is not linked yet
 * is a first publication under its local ids.
 */
export async function captureSend(target: SendTarget): Promise<SendReview> {
  const link = await getCloudLink(target.userId, target.projectId);
  const { workspace } = await requireProjectFolder(target.projectId, target.userId);
  const transferId = newId();
  // The reconcile runs under this hold of the folder lock. Work it leaves
  // running, such as its delayed follow-up, queues for the lock (review F35).
  const plan = await withProjectFolderLock(target.userId, target.projectId, async (hold) => {
    await reconcileInBackground(target.projectId, target.userId, { under: hold });
    return capturePlan(target, link, workspace);
  });
  await createCloudSend({
    transferId,
    link,
    userId: target.userId,
    projectId: target.projectId,
    serverKey: link?.server_key ?? target.serverKey,
    accountId: link?.account_id ?? target.accountId,
    cloudProjectId: link?.cloud_project_id ?? target.projectId,
    plan
  });
  return {
    transferId,
    firstPublication: plan.firstPublication,
    operations: plan.manifest.operations,
    missingFiles: plan.missingFiles,
    skipped: plan.skipped,
    deletedLocally: plan.deletedLocally
  };
}

async function capturePlan(target: SendTarget, link: CloudLinkRow | null, workspace: Workspace): Promise<SendPlan> {
  const operations: TransferOperation[] = [];
  const payloads: TransferPayload[] = [];
  const documents: CapturedDocument[] = [];
  const skipped: SkippedDocument[] = [];
  const references = new Map<string, Array<{ kind: TransferDocumentKind; document_id: string }>>();
  const locals = await localDocuments(target.userId, target.projectId);

  for (const local of locals) {
    if (local.fileError) {
      skipped.push({ kind: local.kind, id: local.id, name: local.name, reason: "invalid_file", detail: local.fileError });
      continue;
    }
    const payload = await transferPayloadOf(local.kind, local.id);
    if (!payload) continue;
    const capturedHash = identityHash(payload);
    const linked = link ? await getCloudLinkDocumentByLocalId(link.id, local.kind, local.id) : null;
    const cloudId = linked?.cloud_id ?? local.id;
    if (linked?.base_content_hash === capturedHash) continue;
    operations.push(
      linked
        ? {
            op: "replace_document",
            kind: local.kind,
            document_id: cloudId,
            base_hash: linked.base_content_hash,
            captured_hash: capturedHash
          }
        : { op: "create_document", kind: local.kind, document_id: cloudId, captured_hash: capturedHash }
    );
    payloads.push({ kind: local.kind, document_id: cloudId, document: payload });
    documents.push({ kind: local.kind, localId: local.id, cloudId, name: local.name, capturedHash });
    for (const assetId of TRANSFER_DOCUMENT_KINDS[local.kind].files(payload)) {
      const list = references.get(assetId) ?? [];
      list.push({ kind: local.kind, document_id: cloudId });
      references.set(assetId, list);
    }
  }

  const deletedLocally: DeletedLocally[] = [];
  if (link) {
    const present = new Set(locals.map((local) => `${local.kind}:${local.id}`));
    for (const linked of await listCloudLinkDocuments(link.id)) {
      if (present.has(`${linked.kind}:${linked.local_id}`)) continue;
      deletedLocally.push({
        kind: linked.kind as TransferDocumentKind,
        localId: linked.local_id,
        cloudId: linked.cloud_id,
        baseHash: linked.base_content_hash
      });
    }
  }

  const requiredFiles: TransferRequiredFile[] = [];
  const fileOperations: TransferFileOperation[] = [];
  const files: CapturedFile[] = [];
  const missingFiles: TransferMissingFile[] = [];
  const external: string[] = [];
  for (const [assetId, referrers] of references) {
    const asset = await Asset.get<Asset>(assetId);
    if (asset?.external_path) {
      external.push(assetId);
      continue;
    }
    const content = asset && asset.project_id === target.projectId ? await hashOfAsset(workspace, asset) : null;
    if (!asset || !content || !asset.workspace_path) {
      missingFiles.push({ asset_id: assetId, reason: "missing_locally", documents: referrers });
      continue;
    }
    requiredFiles.push({ asset_id: assetId, hash: content.hash, size: content.size, documents: referrers });
    files.push({ assetId, hash: content.hash, size: content.size, path: asset.workspace_path });
    const base = link ? await getCloudLinkFile(link.id, assetId) : null;
    if (base?.base_hash !== content.hash) {
      fileOperations.push({
        op: "put_asset_file",
        asset_id: assetId,
        path: asset.workspace_path,
        hash: content.hash,
        size: content.size,
        base_hash: base?.base_hash ?? null,
        name: asset.name,
        content_type: asset.content_type
      });
    }
  }
  if (external.length > 0) {
    throw new SendCaptureError(
      "Some files are linked from outside the project folder. Collect them into the folder before sending.",
      external
    );
  }

  const manifest: TransferManifest = {
    operations,
    required_files: requiredFiles,
    file_operations: fileOperations
  };
  if (!link) manifest.project_name = target.projectName ?? "Untitled project";
  if (target.deviceName) manifest.device_name = target.deviceName;
  return {
    version: 1,
    firstPublication: link === null,
    manifest,
    payloads,
    documents,
    files,
    missingFiles,
    skipped,
    deletedLocally,
    decisions: []
  };
}

function parsePlan(row: CloudSendRow): SendPlan {
  return JSON.parse(row.plan) as SendPlan;
}

/** Records the bases a committed attempt gave every document and file, and ends the send. */
async function finishCommitted(
  row: CloudSendRow,
  plan: SendPlan,
  result: Extract<TransferAttemptResult, { outcome: "committed" }>
): Promise<void> {
  await withTransaction(async () => {
    let link = row.link_id ? await getCloudLinkById(row.link_id) : null;
    if (!link) {
      link =
        (await getCloudLink(row.user_id, row.project_id)) ??
        (await createCloudLink({
          userId: row.user_id,
          projectId: row.project_id,
          serverKey: row.server_key,
          accountId: row.account_id,
          cloudProjectId: result.project_id
        }));
    }
    const stored = new Map(result.documents.map((entry) => [`${entry.kind}:${entry.document_id}`, entry.hash]));
    for (const document of plan.documents) {
      await setCloudLinkDocumentBase(link, {
        kind: document.kind,
        localId: document.localId,
        cloudId: document.cloudId,
        contentHash: stored.get(`${document.kind}:${document.cloudId}`) ?? document.capturedHash,
        cloudRevision: null
      });
    }
    for (const deleted of plan.deletedLocally) {
      const confirmed = plan.manifest.operations.some(
        (operation) => operation.op === "delete_document" && operation.document_id === deleted.cloudId
      );
      if (confirmed) await deleteCloudLinkDocument(link.id, deleted.kind, deleted.localId);
    }
    const keptAssets = new Set((result.kept_beside ?? []).map((entry) => entry.asset_id).filter(Boolean));
    for (const file of plan.files) {
      // A file kept beside a changed cloud file is a new cloud asset; this one's base is the cloud's, unchanged.
      if (keptAssets.has(file.assetId)) continue;
      await setCloudLinkFileBase(link, { assetId: file.assetId, cloudAssetId: file.assetId, hash: file.hash });
    }
    await deleteCloudSend(row.id);
  });
}

/** Options of {@link runSend}. */
export interface SendRunOptions {
  /** Keep local over cloud revisions the person reviewed (BASE_CHANGED). */
  decisions?: TransferDecision[];
  /** Local ids of documents the deletion review confirmed for deletion on the cloud. */
  confirmDeletes?: string[];
  /**
   * Called once each step is recorded: `staged` after the files are sent,
   * `committing` once the attempt id is recorded. A kill test throws here.
   */
  afterStep?: (step: "staged" | "committing") => void | Promise<void>;
}

/**
 * Sends a captured transfer, or continues one a crash interrupted. A refused
 * attempt leaves the send open with the failures: the person reviews them
 * and a later run sends a new attempt, with decisions that name the cloud
 * revisions they reviewed.
 */
export async function runSend(transport: SendTransport, transferId: string, options: SendRunOptions = {}): Promise<SendOutcome> {
  const after = options.afterStep ?? (() => undefined);
  const row = await getCloudSend(transferId);
  if (!row) throw new Error(`No send ${transferId} is in progress`);
  const plan = parsePlan(row);

  if (row.state === "committing" && row.attempt_id) {
    const recorded = await recordedResult(transport, row.id, row.attempt_id);
    if (recorded?.outcome === "committed") {
      await finishCommitted(row, plan, recorded);
      return { status: "committed", transferId, result: recorded };
    }
    await updateCloudSend(transferId, { state: "open", attemptId: null });
    if (recorded?.outcome === "refused" && !options.decisions && !options.confirmDeletes) {
      return { status: "refused", transferId, failures: recorded.failures };
    }
  }

  if (options.decisions) plan.decisions = options.decisions;
  if (options.confirmDeletes) {
    const confirmed = new Set(options.confirmDeletes);
    plan.manifest.operations = plan.manifest.operations.filter((operation) => operation.op !== "delete_document");
    for (const deleted of plan.deletedLocally) {
      if (!confirmed.has(deleted.localId)) continue;
      plan.manifest.operations.push({
        op: "delete_document",
        kind: deleted.kind,
        document_id: deleted.cloudId,
        base_hash: deleted.baseHash,
        confirmed: true
      });
    }
  }

  const opened = await transport.open({
    transfer_id: row.id,
    project_id: row.cloud_project_id,
    first_publication: plan.firstPublication,
    manifest: plan.manifest
  });
  const needed = new Set(opened.needed_hashes);
  if (needed.size > 0) {
    const { workspace } = await requireProjectFolder(row.project_id, row.user_id);
    for (const file of plan.files) {
      if (!needed.has(file.hash)) continue;
      needed.delete(file.hash);
      await transport.stageFile(
        { transfer_id: row.id, hash: file.hash, size: file.size },
        localPath(workspace, file.path)
      );
    }
  }
  await after("staged");

  const attemptId = newId();
  await updateCloudSend(transferId, { state: "committing", attemptId, plan });
  await after("committing");
  const result = await transport.commit({
    transfer_id: row.id,
    attempt_id: attemptId,
    manifest: plan.manifest,
    decisions: plan.decisions,
    missing_files: plan.missingFiles,
    payloads: plan.payloads
  });
  if (result.outcome === "committed") {
    await finishCommitted({ ...row, state: "committing", attempt_id: attemptId }, plan, result);
    return { status: "committed", transferId, result };
  }
  await updateCloudSend(transferId, { state: "open", attemptId: null });
  return { status: "refused", transferId, failures: result.failures };
}

/** The result the cloud recorded for an attempt, or the committed attempt of the transfer. */
async function recordedResult(
  transport: SendTransport,
  transferId: string,
  attemptId: string
): Promise<TransferAttemptResult | null> {
  const status = await transport.status({ transfer_id: transferId });
  const committed = status.attempts.find((attempt) => attempt.result.outcome === "committed");
  if (committed) return committed.result;
  return status.attempts.find((attempt) => attempt.attempt_id === attemptId)?.result ?? null;
}

/** Cancels a send. A transfer that committed already only updates the local bases. */
export async function cancelSend(transport: SendTransport, transferId: string): Promise<"cancelled" | "committed"> {
  const row = await getCloudSend(transferId);
  if (!row) return "cancelled";
  const answer = await transport.cancel({ transfer_id: transferId });
  if (answer.state === "committed" && answer.result.outcome === "committed") {
    await finishCommitted(row, parsePlan(row), answer.result);
    return "committed";
  }
  await deleteCloudSend(transferId);
  return "cancelled";
}

/**
 * Resumes every send of `userId` a restart left with an attempt in flight,
 * so its recorded result reaches the local bases. A send with no attempt in
 * flight waits for the person. `transportFor` gives the transport of a
 * send's server and account, or null when the app is signed out of it.
 */
export async function resumeSends(
  transportFor: (send: { serverKey: string; accountId: string }) => SendTransport | null,
  userId: string
): Promise<SendOutcome[]> {
  const outcomes: SendOutcome[] = [];
  for (const row of await listCloudSends(userId)) {
    if (row.state !== "committing") continue;
    const transport = transportFor({ serverKey: row.server_key, accountId: row.account_id });
    if (!transport) continue;
    try {
      outcomes.push(await runSend(transport, row.id));
    } catch (error) {
      log.warn("Could not resume a send", {
        transferId: row.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return outcomes;
}
