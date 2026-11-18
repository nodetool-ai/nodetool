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
import { pausePoint } from "@nodetool-ai/config/pause-points";
import {
  Asset,
  createCloudLink,
  createCloudSend,
  deleteCloudLinkDocument,
  DOCUMENT_FILE_MISSING,
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
import { contentHashOfWorkspaceFile, requireProjectFolder } from "@nodetool-ai/asset-services/project-asset-file";
import { matchesRecordedFingerprint } from "./project-hash-job.js";
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

/** A document whose file is gone from the folder. Its last row is sent, and the sheet lists the file (CF3). */
export interface MissingDocumentFile {
  kind: TransferDocumentKind;
  id: string;
  name: string;
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
  missingDocumentFiles: MissingDocumentFile[];
  deletedLocally: DeletedLocally[];
  decisions: TransferDecision[];
  /** The person confirmed `missingFiles` exactly as listed, so an attempt may send without them. */
  missingConfirmed?: boolean;
  /** The cloud opened the transfer. Until then the send exists only here (review F41). */
  opened?: boolean;
}

/** What {@link captureSend} found, for the review sheet. */
export interface SendReview {
  transferId: string;
  firstPublication: boolean;
  operations: TransferOperation[];
  /** Each captured document's ids and name, so the sheet can name an operation's document. */
  documents: Array<{ kind: TransferDocumentKind; localId: string; cloudId: string; name: string }>;
  /** Files the send puts, also for documents it leaves unchanged. A send with operations or file operations has work. */
  fileOperations: TransferFileOperation[];
  missingFiles: TransferMissingFile[];
  skipped: SkippedDocument[];
  /** Documents sent from their rows because their files are missing (CF3). */
  missingDocumentFiles: MissingDocumentFile[];
  /** Documents gone here that the deletion review must confirm before a send deletes them. */
  deletedLocally: DeletedLocally[];
}

/** What {@link runSend} ended with. */
export type SendOutcome =
  | { status: "committed"; transferId: string; result: Extract<TransferAttemptResult, { outcome: "committed" }> }
  | { status: "refused"; transferId: string; failures: TransferFailure[] }
  /**
   * The capture lists files missing here, and the person has not confirmed
   * this exact list. Nothing was sent (X7, review F36).
   */
  | { status: "missing_files_unconfirmed"; transferId: string; missingFiles: TransferMissingFile[] };

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

/** A required file whose hash capture reads after it releases the folder lock (CF4). */
interface PendingHash {
  asset: Asset;
  path: string;
  /** The row's metadata under the lock: the fingerprint the file must still have after the read. */
  read: Record<string, unknown> | null;
}

type AssetContent = { hash: string; size: number } | { pending: PendingHash } | null;

/**
 * The content of an asset's file under the folder lock (CF4): the recorded
 * `content_hash` while the file still has the recorded size and modification
 * time, a file to hash after the lock is released otherwise, and null when
 * the file is gone.
 */
async function contentOfAsset(workspace: Workspace, asset: Asset): Promise<AssetContent> {
  const path = asset.workspace_path;
  if (!path) return null;
  const stat = await workspace.stat(path);
  if (!stat) return null;
  if (asset.content_hash && (await matchesRecordedFingerprint(workspace, path, asset.metadata))) {
    return { hash: asset.content_hash, size: stat.size };
  }
  return { pending: { asset, path, read: asset.metadata } };
}

/**
 * Hashes a file the capture found without a valid hash, outside the folder
 * lock. Null when the file no longer has the fingerprint its row recorded,
 * before or after the read: another app wrote it, and the capture runs again
 * after a reconcile records the new fingerprint. A hash read from an
 * unchanged file is stored with the hash job's conditional write (RF7).
 */
async function hashPending(workspace: Workspace, pending: PendingHash): Promise<{ hash: string; size: number } | null> {
  const size = pending.read?.["workspace_size"];
  if (typeof size !== "number") return null;
  if (!(await matchesRecordedFingerprint(workspace, pending.path, pending.read))) return null;
  const hash = await contentHashOfWorkspaceFile(workspace, pending.path);
  await pausePoint("send.capture.file-read");
  if (!(await matchesRecordedFingerprint(workspace, pending.path, pending.read))) return null;
  await pending.asset.recordContentHash(hash, pending.read);
  return { hash, size };
}

/** How many times a capture runs again because a file changed while it was read. */
const CAPTURE_ATTEMPTS = 3;

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
 * every document and the recorded hashes of the files they need. A file
 * without a valid hash is read after the lock is released, and the capture
 * runs again when the file changed meanwhile (CF4). A project that is not
 * linked yet is a first publication under its local ids.
 */
export async function captureSend(target: SendTarget): Promise<SendReview> {
  const link = await getCloudLink(target.userId, target.projectId);
  const { workspace } = await requireProjectFolder(target.projectId, target.userId);
  const transferId = newId();
  // The reconcile runs under this hold of the folder lock. Work it leaves
  // running, such as its delayed follow-up, queues for the lock (review F35).
  let plan: SendPlan | null = null;
  for (let attempt = 0; attempt < CAPTURE_ATTEMPTS && !plan; attempt++) {
    const captured = await withProjectFolderLock(target.userId, target.projectId, async (hold) => {
      await reconcileInBackground(target.projectId, target.userId, { under: hold });
      return captureDocuments(target, link, workspace);
    });
    // Files without a valid hash are read after the lock is released, so a
    // long read holds up no other writer (CF4, review F38).
    plan = await planFiles(target, link, workspace, captured);
  }
  if (!plan) {
    throw new SendCaptureError("A file changed each time it was read. Synchronize again once it is saved.", []);
  }
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
    documents: plan.documents.map(({ kind, localId, cloudId, name }) => ({ kind, localId, cloudId, name })),
    fileOperations: plan.manifest.file_operations ?? [],
    missingFiles: plan.missingFiles,
    skipped: plan.skipped,
    missingDocumentFiles: plan.missingDocumentFiles,
    deletedLocally: plan.deletedLocally
  };
}

/** A document that refers to a file, and whether the send changes that document. */
interface Referrer {
  kind: TransferDocumentKind;
  document_id: string;
  changed: boolean;
}

/** What the capture read under the folder lock, before the files without a hash are read. */
interface CapturedDocuments {
  operations: TransferOperation[];
  payloads: TransferPayload[];
  documents: CapturedDocument[];
  skipped: SkippedDocument[];
  deletedLocally: DeletedLocally[];
  missingDocumentFiles: MissingDocumentFile[];
  files: Array<{ assetId: string; asset: Asset | null; content: AssetContent; referrers: Referrer[] }>;
  external: string[];
}

async function captureDocuments(target: SendTarget, link: CloudLinkRow | null, workspace: Workspace): Promise<CapturedDocuments> {
  const operations: TransferOperation[] = [];
  const payloads: TransferPayload[] = [];
  const documents: CapturedDocument[] = [];
  const skipped: SkippedDocument[] = [];
  const missingDocumentFiles: MissingDocumentFile[] = [];
  const references = new Map<string, Referrer[]>();
  const locals = await localDocuments(target.userId, target.projectId);

  for (const local of locals) {
    // A file that does not validate keeps its document out of the send. A
    // missing file does not: the row is sent and the sheet lists the file (CF3).
    if (local.fileError === DOCUMENT_FILE_MISSING) {
      missingDocumentFiles.push({ kind: local.kind, id: local.id, name: local.name });
    } else if (local.fileError) {
      skipped.push({ kind: local.kind, id: local.id, name: local.name, reason: "invalid_file", detail: local.fileError });
      continue;
    }
    const payload = await transferPayloadOf(local.kind, local.id);
    if (!payload) continue;
    const capturedHash = identityHash(payload);
    const linked = link ? await getCloudLinkDocumentByLocalId(link.id, local.kind, local.id) : null;
    const cloudId = linked?.cloud_id ?? local.id;
    // The files of an unchanged document are compared with their bases too:
    // a file can change in place under the same asset id (review F33).
    const changed = linked?.base_content_hash !== capturedHash;
    for (const assetId of TRANSFER_DOCUMENT_KINDS[local.kind].files(payload)) {
      const list = references.get(assetId) ?? [];
      list.push({ kind: local.kind, document_id: cloudId, changed });
      references.set(assetId, list);
    }
    if (!changed) continue;
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

  const referenced: CapturedDocuments["files"] = [];
  const external: string[] = [];
  for (const [assetId, referrers] of references) {
    const asset = await Asset.get<Asset>(assetId);
    const required = referrers.some((referrer) => referrer.changed);
    if (asset?.external_path) {
      if (required) external.push(assetId);
      continue;
    }
    const content = asset && asset.project_id === target.projectId ? await contentOfAsset(workspace, asset) : null;
    referenced.push({ assetId, asset, content, referrers });
  }
  return { operations, payloads, documents, skipped, deletedLocally, missingDocumentFiles, files: referenced, external };
}

/**
 * Completes a capture outside the folder lock: hashes the files that had no
 * valid hash, and lists the required files and file operations. Null when a
 * file changed while it was read.
 */
async function planFiles(
  target: SendTarget,
  link: CloudLinkRow | null,
  workspace: Workspace,
  captured: CapturedDocuments
): Promise<SendPlan | null> {
  const { operations, payloads, documents, skipped, deletedLocally, missingDocumentFiles, external } = captured;
  if (external.length > 0) {
    throw new SendCaptureError(
      "Some files are linked from outside the project folder. Collect them into the folder before sending.",
      external
    );
  }
  const requiredFiles: TransferRequiredFile[] = [];
  const fileOperations: TransferFileOperation[] = [];
  const files: CapturedFile[] = [];
  const missingFiles: TransferMissingFile[] = [];
  for (const { assetId, asset, content: found, referrers } of captured.files) {
    let content: { hash: string; size: number } | null = null;
    if (found && "pending" in found) {
      content = await hashPending(workspace, found.pending);
      if (!content) return null;
    } else {
      content = found;
    }
    // A file that only unchanged documents use is sent when it changed, and
    // left as the cloud has it when it is missing here.
    const changedReferrers = referrers
      .filter((referrer) => referrer.changed)
      .map((referrer) => ({ kind: referrer.kind, document_id: referrer.document_id }));
    const required = changedReferrers.length > 0;
    if (!asset || !content || !asset.workspace_path) {
      if (required) missingFiles.push({ asset_id: assetId, reason: "missing_locally", documents: changedReferrers });
      continue;
    }
    const base = link ? await getCloudLinkFile(link.id, assetId) : null;
    const put = base?.base_hash !== content.hash;
    if (!required && !put) continue;
    if (required) {
      requiredFiles.push({ asset_id: assetId, hash: content.hash, size: content.size, documents: changedReferrers });
    }
    files.push({ assetId, hash: content.hash, size: content.size, path: asset.workspace_path });
    if (put) {
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
    missingDocumentFiles,
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

function missingFileKey(file: TransferMissingFile): string {
  const documents = file.documents.map((document) => `${document.kind}:${document.document_id}`).sort();
  return JSON.stringify([file.asset_id, file.reason, file.hash ?? null, file.size ?? null, documents]);
}

/** Whether `confirmed` names exactly the files of `listed`. */
function sameMissingFiles(listed: TransferMissingFile[], confirmed: TransferMissingFile[]): boolean {
  const want = new Set(listed.map(missingFileKey));
  const got = new Set(confirmed.map(missingFileKey));
  return want.size === got.size && [...want].every((key) => got.has(key));
}

/** A deletion the person confirmed, bound to the cloud revision the sheet showed. */
export interface DeleteConfirmation {
  kind: TransferDocumentKind;
  cloudId: string;
  /** The cloud document's hash as the review showed it: the base, or a newer hash the cloud reported. */
  cloudHash: string;
}

/** Options of {@link runSend}. */
export interface SendRunOptions {
  /** Keep local over cloud revisions the person reviewed (BASE_CHANGED). */
  decisions?: TransferDecision[];
  /**
   * The missing files the person confirmed in the review. A send with missing
   * files commits only when this names each of them, with its reason, hash,
   * size and documents, exactly as the capture listed them (X7).
   */
  confirmMissingFiles?: TransferMissingFile[];
  /**
   * Documents the deletion review confirmed for deletion on the cloud, each
   * with the cloud revision the person reviewed. That hash is the delete's
   * precondition, so a cloud edit made after the review refuses the delete
   * and the review asks again (V4, review F40).
   */
  confirmDeletes?: DeleteConfirmation[];
  /**
   * Set only by {@link resumeSends}: the run continues an attempt a crash
   * interrupted, with the approvals recorded for it. Every other run is a
   * reviewed attempt, and its deletions are exactly `confirmDeletes`, none
   * when it is absent (review F43).
   */
  resume?: boolean;
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

  if (options.confirmMissingFiles) {
    plan.missingConfirmed = sameMissingFiles(plan.missingFiles, options.confirmMissingFiles);
  }
  if (plan.missingFiles.length > 0 && !plan.missingConfirmed) {
    return { status: "missing_files_unconfirmed", transferId, missingFiles: plan.missingFiles };
  }
  if (options.decisions) plan.decisions = options.decisions;
  if (!options.resume) {
    // A withdrawn confirmation must not survive in the saved manifest of an
    // earlier attempt (review F43).
    const confirmDeletes = options.confirmDeletes ?? [];
    plan.manifest.operations = plan.manifest.operations.filter((operation) => operation.op !== "delete_document");
    for (const deleted of plan.deletedLocally) {
      const confirmation = confirmDeletes.find(
        (entry) => entry.kind === deleted.kind && entry.cloudId === deleted.cloudId
      );
      if (!confirmation) continue;
      plan.manifest.operations.push({
        op: "delete_document",
        kind: deleted.kind,
        document_id: deleted.cloudId,
        base_hash: confirmation.cloudHash,
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
  if (!plan.opened) {
    plan.opened = true;
    await updateCloudSend(transferId, { plan });
  }
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

/**
 * Cancels a send. A send the cloud never opened, such as one whose review
 * was closed, is only deleted here. A transfer that committed already only
 * updates the local bases.
 */
export async function cancelSend(transport: SendTransport, transferId: string): Promise<"cancelled" | "committed"> {
  const row = await getCloudSend(transferId);
  if (!row) return "cancelled";
  if (!parsePlan(row).opened) {
    await deleteCloudSend(transferId);
    return "cancelled";
  }
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
      outcomes.push(await runSend(transport, row.id, { resume: true }));
    } catch (error) {
      log.warn("Could not resume a send", {
        transferId: row.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return outcomes;
}
