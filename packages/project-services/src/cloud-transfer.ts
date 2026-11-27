/**
 * The server half of a transfer into a cloud project
 * (docs/plans/native-cloud-sync/technical-design.md, "Sending: capture,
 * stage, commit attempt", "Operations of a transfer" and "Order of access
 * changes against writes", WP2.4).
 *
 * A transfer is opened with its manifest, its files are staged, and a commit
 * attempt applies its operations in one database transaction or refuses
 * them all. An attempt id has one recorded result, and at most one attempt
 * of a transfer commits (X3). A refused attempt writes only its own row.
 *
 * The commit needs PostgreSQL. Its operations write files of the project
 * folder and notify observers, which a SQLite transaction body must not wait
 * on, so a server on SQLite refuses to commit.
 */
import {
  appendDocumentActivity,
  commitProjectBlobs,
  committedHashesOfOwner,
  deletedDocumentExists,
  deleteStagedBlobsOfTransfer,
  deleteStagedErasedBlobs,
  erasedFilesOf,
  exceedsStorageAllowance,
  findCloudTransferAttempt,
  getCloudTransfer,
  getDatabase,
  listCloudTransferAttempts,
  lockAccessEpochs,
  lockCloudTransfer,
  lockProjectFiles,
  openCloudTransfer,
  Project,
  readableProjectBlob,
  recordCloudTransferAttempt,
  recordMissingFiles,
  removeMissingFiles,
  setCloudTransferState,
  storageAllowanceStatus,
  withTransaction,
  type AccessKey
} from "@nodetool-ai/models";
import { pausePoint } from "@nodetool-ai/config/pause-points";
import type { StorageAdapter } from "@nodetool-ai/storage";
import { hashesToSend, stageBlob, stageKnownBlob } from "@nodetool-ai/asset-services/blob-store";
import { requireProjectFolder } from "@nodetool-ai/asset-services/project-asset-file";
import type {
  CancelTransferOutput,
  CommitTransferInput,
  OpenTransferOutput,
  TransferAttemptResult,
  TransferDocumentKind,
  TransferFailure,
  TransferManifest,
  TransferOperation,
  TransferStatusOutput
} from "@nodetool-ai/protocol/api-schemas/transfer.js";
import {
  identityHash,
  TRANSFER_DOCUMENT_KINDS,
  type TransferDocument,
  type TransferPayloadContent
} from "./transfer-documents.js";
import { applyFileOperations, planFileOperations, runTransferPlacements } from "./transfer-files.js";
import { applyConversations, conversationHash, verifyConversations } from "./transfer-conversations.js";

export type TransferRole = "owner" | "editor" | "viewer";

/** What the transfer needs from the server that hosts it. */
export interface TransferHost {
  storage: StorageAdapter;
  /** The caller's role on a document now, or null without access. */
  documentRole(userId: string, kind: TransferDocumentKind, id: string): Promise<TransferRole | null>;
  /**
   * The attach rule for writing `content` to the document: the first file
   * the caller may not add, and the files of other people to admit once the
   * write is stored. `before` is null for a document the transfer creates.
   */
  checkAttach(
    userId: string,
    kind: TransferDocumentKind,
    target: { id: string; user_id: string; before: unknown },
    content: unknown
  ): Promise<{ unreadable: string | null; toAdmit: string[] }>;
  /**
   * Admits `toAdmit` and writes the reference sets of a document the commit
   * wrote. Runs after the commit.
   */
  published(kind: TransferDocumentKind, id: string, toAdmit: readonly string[]): Promise<void>;
}

/** A request the server refuses before it records anything. */
export class TransferRequestError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "CONFLICT" | "INVALID" | "ATTEMPT_CONTENT_MISMATCH" | "NEEDS_POSTGRES",
    message: string
  ) {
    super(message);
    this.name = "TransferRequestError";
  }
}

const ROLE_RANK: Record<TransferRole, number> = { viewer: 1, editor: 2, owner: 3 };

function atLeast(role: TransferRole | null, minimum: TransferRole): boolean {
  return role !== null && ROLE_RANK[role] >= ROLE_RANK[minimum];
}

/**
 * Every file the manifest needs staged, by hash: the referenced files that
 * are not on the erased list and the files it puts.
 */
function stagedFiles(manifest: TransferManifest, erased: ReadonlySet<string>): { hash: string; size: number }[] {
  return [
    ...manifest.required_files.filter((file) => !erased.has(file.hash)),
    ...(manifest.file_operations ?? []).flatMap((op) => (op.op === "delete_workspace_file" ? [] : [op]))
  ];
}

function requiredHashes(manifest: TransferManifest, erased: ReadonlySet<string>): string[] {
  return [...new Set(stagedFiles(manifest, erased).map((file) => file.hash))];
}

async function ownedTransfer(userId: string, transferId: string) {
  const transfer = await getCloudTransfer(transferId);
  if (!transfer || transfer.user_id !== userId) {
    throw new TransferRequestError("NOT_FOUND", "Transfer not found");
  }
  return transfer;
}

/**
 * Opens the transfer, stages the files the owner already holds, and returns
 * the hashes whose bytes the client must stage, with the allowance and use.
 */
export async function openTransfer(
  host: TransferHost,
  userId: string,
  input: { transfer_id: string; project_id: string; first_publication: boolean; manifest: TransferManifest }
): Promise<OpenTransferOutput> {
  const project = await Project.get<Project>(input.project_id);
  if (input.first_publication) {
    if (project) throw new TransferRequestError("CONFLICT", "A project with this id exists");
  } else if (!project || project.deleted_at || project.user_id !== userId) {
    // Projects have no editors before project grants (phase 4).
    throw new TransferRequestError("NOT_FOUND", "Project not found");
  }
  const transfer = await openCloudTransfer({
    id: input.transfer_id,
    userId,
    projectId: input.project_id,
    firstPublication: input.first_publication
  });
  if (!transfer) throw new TransferRequestError("CONFLICT", "The transfer id is taken");
  if (transfer.state !== "open") throw new TransferRequestError("CONFLICT", `The transfer is ${transfer.state}`);

  // A file on the erased list is not required and not staged again (FR79).
  const erased = input.first_publication ? new Set<string>() : (await erasedFilesOf(input.project_id)).hashes;
  const hashes = requiredHashes(input.manifest, erased);
  const needed = new Set(await hashesToSend(host.storage, userId, hashes));
  for (const file of stagedFiles(input.manifest, erased)) {
    if (needed.has(file.hash)) continue;
    const staged = await stageKnownBlob(host.storage, {
      projectId: input.project_id,
      userId,
      hash: file.hash,
      size: file.size,
      transferId: input.transfer_id
    });
    if (!staged) needed.add(file.hash);
  }
  const status = await storageAllowanceStatus(userId);
  return {
    needed_hashes: [...needed].sort(),
    allowance_bytes: status.allowanceBytes,
    used_bytes: status.usedBytes
  };
}

/** Stages the bytes of one file of an open transfer. */
export async function stageTransferFile(
  host: TransferHost,
  userId: string,
  input: { transfer_id: string; hash: string; size: number; bytes: Uint8Array }
): Promise<"stored" | "already_present"> {
  const transfer = await ownedTransfer(userId, input.transfer_id);
  if (transfer.state !== "open") throw new TransferRequestError("CONFLICT", `The transfer is ${transfer.state}`);
  return stageBlob(host.storage, {
    projectId: transfer.project_id,
    userId,
    hash: input.hash,
    size: input.size,
    transferId: transfer.id,
    bytes: input.bytes
  });
}

function parseResult(text: string): TransferAttemptResult {
  return JSON.parse(text) as TransferAttemptResult;
}

export async function transferStatus(userId: string, transferId: string): Promise<TransferStatusOutput> {
  const transfer = await ownedTransfer(userId, transferId);
  const attempts = await listCloudTransferAttempts(transfer.id);
  return {
    state: transfer.state as TransferStatusOutput["state"],
    project_id: transfer.project_id,
    attempts: attempts.map((attempt) => ({ attempt_id: attempt.attempt_id, result: parseResult(attempt.result) }))
  };
}

/**
 * Cancels an open transfer and drops what it staged. A committed one returns
 * its result. The transfer's row is locked and read again, so a cancel that
 * meets a commit under way waits for it and then answers with its result,
 * and never marks a committed transfer cancelled (review F28).
 */
export async function cancelTransfer(userId: string, transferId: string): Promise<CancelTransferOutput> {
  const found = await ownedTransfer(userId, transferId);
  const outcome = await withTransaction(async (): Promise<CancelTransferOutput | "dropped"> => {
    const transfer = await lockCloudTransfer(found.id);
    if (!transfer || transfer.user_id !== userId) {
      throw new TransferRequestError("NOT_FOUND", "Transfer not found");
    }
    if (transfer.state === "committed" && transfer.committed_attempt_id) {
      const attempt = await findCloudTransferAttempt(transfer.id, transfer.committed_attempt_id);
      if (attempt) return { state: "committed", result: parseResult(attempt.result) };
    }
    if (transfer.state !== "open") return { state: "cancelled" };
    await setCloudTransferState(transfer.id, "cancelled");
    return "dropped";
  });
  if (outcome !== "dropped") return outcome;
  // A commit refuses a cancelled transfer, so its staged rows can go.
  await deleteStagedBlobsOfTransfer(found.id);
  return { state: "cancelled" };
}

/** The digest of an attempt: its manifest, decisions, missing files and payload hashes. */
export function attemptDigest(input: CommitTransferInput): string {
  return identityHash({
    manifest: input.manifest,
    decisions: input.decisions,
    missing_files: input.missing_files,
    payloads: input.payloads.map((payload) => ({
      kind: payload.kind,
      document_id: payload.document_id,
      hash: identityHash(payload.document)
    })),
    versions: (input.versions ?? []).map((version) => ({
      kind: version.kind,
      document_id: version.document_id,
      version_id: version.version_id,
      hash: identityHash(version.version)
    })),
    conversations: (input.conversations ?? []).map((conversation) => ({
      thread_id: conversation.thread_id,
      hash: conversationHash(conversation)
    }))
  });
}

function failure(code: TransferFailure["code"], message: string, extra: Partial<TransferFailure> = {}): TransferFailure {
  return { code, message, ...extra };
}

function documentKey(kind: string, id: string): string {
  return `${kind}:${id}`;
}

/** The documents the operations name, in the manifest's order, without repeats. */
function targets(operations: readonly TransferOperation[]): { kind: TransferDocumentKind; id: string }[] {
  const seen = new Set<string>();
  const out: { kind: TransferDocumentKind; id: string }[] = [];
  const add = (kind: TransferDocumentKind, id: string) => {
    const key = documentKey(kind, id);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ kind, id });
  };
  for (const op of operations) {
    add(op.kind, op.document_id);
    if (op.op === "keep_both") add(op.kind, op.new_document_id);
  }
  return out;
}

/** The document an operation writes content to under a payload, or null for one that carries none. */
function payloadTarget(op: TransferOperation): { id: string; capturedHash: string } | null {
  switch (op.op) {
    case "create_document":
    case "replace_document":
      return { id: op.document_id, capturedHash: op.captured_hash };
    case "keep_both":
      return { id: op.new_document_id, capturedHash: op.captured_hash };
    default:
      return null;
  }
}

/**
 * The order the operations apply in: documents are created first, so a later
 * operation can name them, and deleted last.
 */
const APPLY_ORDER: Record<TransferOperation["op"], number> = {
  create_document: 0,
  keep_both: 0,
  replace_document: 1,
  rename_document: 1,
  add_versions: 1,
  move_document: 2,
  delete_document: 3
};

/**
 * Runs one commit attempt: the steps of "Sending: capture, stage, commit
 * attempt" in one transaction under a lock on the transfer.
 */
export async function commitTransfer(
  host: TransferHost,
  userId: string,
  input: CommitTransferInput
): Promise<TransferAttemptResult> {
  if (getDatabase().dialect !== "postgres") {
    throw new TransferRequestError("NEEDS_POSTGRES", "Transfers need a server on PostgreSQL");
  }
  const digest = attemptDigest(input);
  const written: { kind: TransferDocumentKind; id: string; toAdmit: string[] }[] = [];
  let placing = false;
  const result = await withTransaction(async () => {
    const transfer = await lockCloudTransfer(input.transfer_id);
    if (!transfer || transfer.user_id !== userId) {
      throw new TransferRequestError("NOT_FOUND", "Transfer not found");
    }
    await pausePoint("transfer.commit.locked");
    // Step 1: an attempt id has one recorded result.
    const recorded = await findCloudTransferAttempt(transfer.id, input.attempt_id);
    if (recorded) {
      if (recorded.digest !== digest) {
        throw new TransferRequestError(
          "ATTEMPT_CONTENT_MISMATCH",
          "This attempt id was recorded with other content"
        );
      }
      return parseResult(recorded.result);
    }
    const refuse = async (failures: TransferFailure[]): Promise<TransferAttemptResult> => {
      const refused: TransferAttemptResult = { outcome: "refused", failures };
      await recordCloudTransferAttempt({
        transferId: transfer.id,
        attemptId: input.attempt_id,
        userId,
        digest,
        outcome: "refused",
        result: refused
      });
      return refused;
    };
    // Step 2: one attempt of a transfer commits.
    if (transfer.state === "committed") {
      return refuse([failure("ALREADY_COMMITTED", "Another attempt of this transfer committed")]);
    }
    if (transfer.state === "cancelled") {
      return refuse([failure("TRANSFER_CANCELLED", "The transfer was cancelled")]);
    }

    // The project's files before any document row, the order an erase
    // takes them in, so the two never wait on each other.
    await lockProjectFiles(transfer.project_id);
    const erased = transfer.first_publication
      ? { hashes: new Set<string>(), assetIds: new Set<string>() }
      : await erasedFilesOf(transfer.project_id);

    const failures: TransferFailure[] = [];
    const operations = input.manifest.operations;

    // Step 3: verify the payloads, and derive the required files from them.
    const payloads = new Map<string, TransferPayloadContent>();
    for (const payload of input.payloads) {
      payloads.set(documentKey(payload.kind, payload.document_id), payload.document);
    }
    const listed = new Set([
      ...input.manifest.required_files.map((file) => file.asset_id),
      ...input.missing_files.map((file) => file.asset_id),
      ...erased.assetIds
    ]);
    const versionPayloads = new Map<string, TransferPayloadContent>();
    for (const version of input.versions ?? []) {
      versionPayloads.set(documentKey(version.kind, version.version_id), version.version);
    }
    const listedFiles = (op: TransferOperation, content: TransferPayloadContent, extra: Partial<TransferFailure>) => {
      for (const file of TRANSFER_DOCUMENT_KINDS[op.kind].files(content)) {
        if (!listed.has(file)) {
          failures.push(
            failure("MANIFEST_INCOMPLETE", "The document refers to a file the manifest does not list", {
              kind: op.kind,
              ...extra,
              asset_id: file
            })
          );
        }
      }
    };
    for (const op of operations) {
      if (op.op === "move_document" && op.base_project_id !== transfer.project_id) {
        failures.push(
          failure("DOCUMENT_NOT_IN_PROJECT", "A move starts from the project of the transfer", {
            kind: op.kind,
            document_id: op.document_id,
            project_id: op.base_project_id
          })
        );
        continue;
      }
      if (op.op === "add_versions") {
        for (const entry of op.versions) {
          const where = { kind: op.kind, document_id: op.document_id, version_id: entry.version_id };
          const version = versionPayloads.get(documentKey(op.kind, entry.version_id));
          if (!version) {
            failures.push(failure("PAYLOAD_MISSING", "The saved version has no payload", where));
            continue;
          }
          if (identityHash(version) !== entry.hash) {
            failures.push(failure("PAYLOAD_HASH_MISMATCH", "The saved version does not have its hash", where));
            continue;
          }
          const invalid = TRANSFER_DOCUMENT_KINDS[op.kind].invalidVersion(version);
          if (invalid) {
            failures.push(failure("PAYLOAD_INVALID", invalid, where));
            continue;
          }
          listedFiles(op, version, { document_id: op.document_id, version_id: entry.version_id });
        }
        continue;
      }
      const target = payloadTarget(op);
      if (!target) continue;
      const where = { kind: op.kind, document_id: target.id };
      const payload = payloads.get(documentKey(op.kind, target.id));
      if (!payload) {
        failures.push(failure("PAYLOAD_MISSING", "The operation has no payload", where));
        continue;
      }
      if (identityHash(payload) !== target.capturedHash) {
        failures.push(failure("PAYLOAD_HASH_MISMATCH", "The payload does not have the captured hash", where));
        continue;
      }
      const invalid = TRANSFER_DOCUMENT_KINDS[op.kind].invalid(payload);
      if (invalid) {
        failures.push(failure("PAYLOAD_INVALID", invalid, where));
        continue;
      }
      listedFiles(op, payload, { document_id: target.id });
    }
    const conversations = verifyConversations(input.manifest, input.conversations, failures);
    if (failures.length > 0) return refuse(failures);

    // Step 4: lock the access epochs, then check the sender's role on the project.
    const projectId = transfer.project_id;
    const targetProjects = [
      ...new Set(operations.flatMap((op) => (op.op === "move_document" ? [op.target_project_id] : [])))
    ].filter((id) => id !== projectId);
    const epochKeys: AccessKey[] = [
      { kind: "project", id: projectId },
      ...targetProjects.map((id): AccessKey => ({ kind: "project", id })),
      ...targets(operations).map((target) => ({ kind: target.kind, id: target.id }))
    ];
    await lockAccessEpochs(epochKeys);
    const project = await Project.get<Project>(projectId);
    if (transfer.first_publication) {
      if (project) return refuse([failure("PROJECT_EXISTS", "A project with this id exists")]);
      const committed = await committedHashesOfOwner(userId, requiredHashes(input.manifest, erased.hashes));
      const sizes = new Map(stagedFiles(input.manifest, erased.hashes).map((file) => [file.hash, file.size]));
      let added = 0;
      for (const [hash, size] of sizes) if (!committed.has(hash)) added += size;
      if (await exceedsStorageAllowance(userId, added)) {
        return refuse([failure("STORAGE_EXCEEDED", "The files would take the owner over the storage allowance")]);
      }
    } else if (!project || project.deleted_at) {
      return refuse([failure("PROJECT_NOT_FOUND", "The project is gone")]);
    } else if (project.user_id !== userId) {
      return refuse([failure("ACCESS_REMOVED", "The sender may no longer write to the project")]);
    }

    // Step 5: membership, deleted state, role and the attach rule per operation.
    const decisions = new Map(
      input.decisions.map((decision) => [documentKey(decision.kind, decision.document_id), decision.cloud_hash])
    );
    const stored = new Map<string, TransferDocument>();
    const admissions = new Map<string, string[]>();
    for (const target of targets(operations)) {
      const document = await TRANSFER_DOCUMENT_KINDS[target.kind].lock(target.id);
      if (document) stored.set(documentKey(target.kind, target.id), document);
    }
    const created = new Set<string>();
    for (const op of operations) {
      if (op.op === "create_document") created.add(documentKey(op.kind, op.document_id));
      if (op.op === "keep_both") created.add(documentKey(op.kind, op.new_document_id));
    }
    const admit = (key: string, files: readonly string[]) => {
      admissions.set(key, [...(admissions.get(key) ?? []), ...files]);
    };
    // A document the attempt creates: its id is free, live or deleted, and
    // the sender may attach what it refers to.
    const checkNew = async (kind: TransferDocumentKind, id: string) => {
      const where = { kind, document_id: id };
      if (stored.has(documentKey(kind, id)) || (await deletedDocumentExists(kind, id))) {
        failures.push(failure("DOCUMENT_EXISTS", "A document with this id exists", where));
        return;
      }
      const handler = TRANSFER_DOCUMENT_KINDS[kind];
      const check = await host.checkAttach(
        userId,
        kind,
        { id, user_id: userId, before: null },
        handler.content(payloads.get(documentKey(kind, id)) ?? {})
      );
      if (check.unreadable) {
        failures.push(failure("FILE_NOT_READABLE", "The sender may not attach this file", { ...where, asset_id: check.unreadable }));
      }
      admit(documentKey(kind, id), check.toAdmit);
    };
    // Saved versions: an id the cloud holds with the same content counts as
    // done, with other content it refuses. A new version passes the attach
    // rule against the document it joins.
    const presentVersions = new Set<string>();
    const checkVersions = async (op: Extract<TransferOperation, { op: "add_versions" }>, document: TransferDocument | null) => {
      const handler = TRANSFER_DOCUMENT_KINDS[op.kind];
      for (const entry of op.versions) {
        const where = { kind: op.kind, document_id: op.document_id, version_id: entry.version_id };
        const found = await handler.findVersion(entry.version_id);
        if (found) {
          if (found.documentId === op.document_id && found.hash === entry.hash) {
            presentVersions.add(entry.version_id);
          } else {
            failures.push(failure("VERSION_CONFLICT", "A saved version with this id holds other content", where));
          }
          continue;
        }
        const check = await host.checkAttach(
          userId,
          op.kind,
          {
            id: op.document_id,
            user_id: document?.userId ?? userId,
            before: document ? handler.content(document.payload) : null
          },
          handler.content(versionPayloads.get(documentKey(op.kind, entry.version_id)) ?? {})
        );
        if (check.unreadable) {
          failures.push(failure("FILE_NOT_READABLE", "The sender may not attach this file", { ...where, asset_id: check.unreadable }));
        }
        admit(documentKey(op.kind, op.document_id), check.toAdmit);
      }
    };
    for (const op of operations) {
      const key = documentKey(op.kind, op.document_id);
      const handler = TRANSFER_DOCUMENT_KINDS[op.kind];
      const document = stored.get(key) ?? null;
      const where = { kind: op.kind, document_id: op.document_id };
      if (op.op === "create_document") {
        await checkNew(op.kind, op.document_id);
        continue;
      }
      if (op.op === "add_versions" && !document && created.has(key)) {
        await checkVersions(op, null);
        continue;
      }
      if (!document) {
        failures.push(
          (await deletedDocumentExists(op.kind, op.document_id))
            ? failure("DOCUMENT_DELETED", "The document was deleted", where)
            : failure("DOCUMENT_NOT_FOUND", "The document does not exist", where)
        );
        continue;
      }
      // A document already in the target project counts as moved, once the
      // caller's ownership of the document and target project is verified.
      const alreadyMoved = op.op === "move_document" && document.projectId === op.target_project_id;
      if (!alreadyMoved && document.projectId !== projectId) {
        failures.push(failure("DOCUMENT_NOT_IN_PROJECT", "The document is not in this project", where));
        continue;
      }
      const role = await host.documentRole(userId, op.kind, op.document_id);
      if (role === null) {
        failures.push(failure("ACCESS_REMOVED", "The sender no longer has access to the document", where));
        continue;
      }
      if (op.op === "delete_document" || op.op === "move_document") {
        if (role !== "owner") {
          failures.push(
            failure("OWNER_REQUIRED", `Only the owner ${op.op === "delete_document" ? "deletes" : "moves"} a document`, where)
          );
        }
      } else if (!atLeast(role, "editor")) {
        failures.push(failure("EDITOR_REQUIRED", "The sender may only view the document", where));
        continue;
      }
      const storedHash = identityHash(document.payload);
      switch (op.op) {
        case "move_document": {
          // Projects have no grants before phase 4, so the editor of the
          // target project is its owner.
          const target = await Project.get<Project>(op.target_project_id);
          if (!target || target.deleted_at) {
            failures.push(failure("PROJECT_NOT_FOUND", "The target project is gone", { ...where, project_id: op.target_project_id }));
          } else if (target.user_id !== userId) {
            failures.push(
              failure("PROJECT_EDITOR_REQUIRED", "The sender may not add documents to the target project", {
                ...where,
                project_id: op.target_project_id
              })
            );
          }
          break;
        }
        case "keep_both":
          if (decisions.get(key) !== storedHash) {
            failures.push(
              failure("DECISION_REQUIRED", "Keep both needs a decision that names the stored revision", {
                ...where,
                stored_hash: storedHash
              })
            );
          }
          await checkNew(op.kind, op.new_document_id);
          break;
        case "add_versions":
          await checkVersions(op, document);
          break;
        case "replace_document": {
          const check = await host.checkAttach(
            userId,
            op.kind,
            { id: document.id, user_id: document.userId, before: handler.content(document.payload) },
            handler.content(payloads.get(key) ?? {})
          );
          if (check.unreadable) {
            failures.push(
              failure("FILE_NOT_READABLE", "The sender may not attach this file", { ...where, asset_id: check.unreadable })
            );
          }
          admit(key, check.toAdmit);
          break;
        }
        default:
          break;
      }
      // Step 7: the stored content must be the base. For a replace, a Keep
      // local decision may name the stored hash instead.
      if (op.op === "replace_document" || op.op === "delete_document") {
        const decided = op.op === "replace_document" && decisions.get(key) === storedHash;
        if (storedHash !== op.base_hash && !decided) {
          failures.push(
            failure("BASE_CHANGED", "The cloud document changed since the review", { ...where, stored_hash: storedHash })
          );
        }
      }
    }

    // Step 6: every required file is staged or committed, confirmed missing,
    // or on the erased list (X7).
    const missing = new Set(input.missing_files.map((file) => file.asset_id));
    const isErased = (file: { asset_id: string; hash?: string }) =>
      erased.assetIds.has(file.asset_id) || (file.hash !== undefined && erased.hashes.has(file.hash));
    for (const file of input.manifest.required_files) {
      if (missing.has(file.asset_id) || isErased(file)) continue;
      const row = await readableProjectBlob({ projectId, hash: file.hash, transferId: transfer.id });
      if (!row) {
        failures.push(failure("FILE_NOT_STAGED", "The file was not staged", { asset_id: file.asset_id, hash: file.hash }));
      }
    }
    const fileOperations = input.manifest.file_operations ?? [];
    for (const op of fileOperations) {
      if (op.op === "delete_workspace_file") continue;
      const row = await readableProjectBlob({ projectId, hash: op.hash, transferId: transfer.id });
      if (!row) failures.push(failure("FILE_NOT_STAGED", "The file was not staged", { path: op.path, hash: op.hash }));
    }

    // Step 7 for files: each put and delete against what the cloud holds at its path.
    // A first publication has no folder yet, so every path is free.
    const now = new Date();
    const filePlan = await planFileOperations({
      projectId,
      userId,
      operations: fileOperations,
      workspace:
        fileOperations.length > 0 && !transfer.first_publication
          ? (await requireProjectFolder(projectId, userId)).workspace
          : null,
      deviceName: input.manifest.device_name,
      failures,
      now
    });

    await pausePoint("transfer.commit.files-planned");

    // Step 9: anything collected refuses the attempt, and nothing else was written.
    if (failures.length > 0) return refuse(failures);

    // Step 10: apply.
    if (transfer.first_publication) {
      await Project.create<Project>({
        id: projectId,
        user_id: userId,
        name: input.manifest.project_name ?? "Project",
        kind: "project"
      });
    }
    const ordered = operations
      .map((op, index) => ({ op, index }))
      .sort((a, b) => APPLY_ORDER[a.op.op] - APPLY_ORDER[b.op.op] || a.index - b.index)
      .map((entry) => entry.op);
    const publish = new Set<string>();
    const publishList: { kind: TransferDocumentKind; id: string }[] = [];
    const willPublish = (kind: TransferDocumentKind, id: string) => {
      const key = documentKey(kind, id);
      if (publish.has(key)) return;
      publish.add(key);
      publishList.push({ kind, id });
    };
    for (const op of ordered) {
      const key = documentKey(op.kind, op.document_id);
      const handler = TRANSFER_DOCUMENT_KINDS[op.kind];
      const document = stored.get(key);
      switch (op.op) {
        case "create_document":
          await handler.create({ id: op.document_id, userId, projectId, payload: payloads.get(key) ?? {} });
          willPublish(op.kind, op.document_id);
          break;
        case "keep_both": {
          const newKey = documentKey(op.kind, op.new_document_id);
          await handler.create({ id: op.new_document_id, userId, projectId, payload: payloads.get(newKey) ?? {} });
          willPublish(op.kind, op.new_document_id);
          break;
        }
        case "replace_document":
          if (document) await handler.replace(document, payloads.get(key) ?? {});
          willPublish(op.kind, op.document_id);
          break;
        case "rename_document":
          // V6: the later rename wins, and both names go to the activity record.
          if (document && document.name !== op.name) {
            await handler.rename(document, op.name);
            await appendDocumentActivity(
              { kind: op.kind, documentId: document.id, type: "rename", userId, payload: { from: document.name, to: op.name } },
              now
            );
          }
          willPublish(op.kind, op.document_id);
          break;
        case "add_versions": {
          const owner = { id: op.document_id, userId: document?.userId ?? userId };
          for (const entry of op.versions) {
            if (presentVersions.has(entry.version_id)) continue;
            await handler.addVersion(owner, entry.version_id, versionPayloads.get(documentKey(op.kind, entry.version_id)) ?? {});
          }
          willPublish(op.kind, op.document_id);
          break;
        }
        case "move_document":
          if (document && document.projectId !== op.target_project_id) {
            await handler.move(document, op.target_project_id);
            // V8: the later move wins and is recorded.
            await appendDocumentActivity(
              {
                kind: op.kind,
                documentId: document.id,
                type: "move",
                userId,
                payload: { from: document.projectId, to: op.target_project_id }
              },
              now
            );
          }
          willPublish(op.kind, op.document_id);
          break;
        case "delete_document":
          if (document) await handler.remove(document);
          break;
      }
    }
    const deleted = new Set(
      operations.flatMap((op) => (op.op === "delete_document" ? [documentKey(op.kind, op.document_id)] : []))
    );
    for (const target of publishList) {
      const key = documentKey(target.kind, target.id);
      if (!deleted.has(key)) written.push({ ...target, toAdmit: admissions.get(key) ?? [] });
    }
    // The erased list wins over a file staged before the erase (TC81). A
    // file the transfer also puts in the folder keeps its row for the placement.
    const putHashes = new Set(fileOperations.flatMap((op) => (op.op === "delete_workspace_file" ? [] : [op.hash])));
    await deleteStagedErasedBlobs(
      projectId,
      transfer.id,
      new Set([...erased.hashes].filter((hash) => !putHashes.has(hash)))
    );
    await commitProjectBlobs(projectId, transfer.id);
    // The Incomplete list: the files this attempt confirmed missing, less
    // those the transfer supplied (X7).
    await recordMissingFiles({
      projectId,
      userId,
      transferId: transfer.id,
      files: input.missing_files
        .filter((file) => !isErased(file))
        .map((file) => ({ assetId: file.asset_id, hash: file.hash, size: file.size, reason: file.reason })),
      now
    });
    await removeMissingFiles(
      projectId,
      input.manifest.required_files.filter((file) => !missing.has(file.asset_id)).map((file) => file.asset_id)
    );
    const keptBeside = await applyFileOperations(filePlan, { projectId, userId, transferId: transfer.id, now });
    placing = filePlan.placements.length > 0;
    const addedConversations = await applyConversations(input.manifest, conversations, {
      projectId,
      userId,
      transferId: transfer.id,
      now
    });
    await pausePoint("transfer.commit.conversations-added");

    // Step 11: record the attempt and the transfer as committed.
    const documents: { kind: TransferDocumentKind; document_id: string; hash: string }[] = [];
    for (const target of targets(operations)) {
      const after = await TRANSFER_DOCUMENT_KINDS[target.kind].lock(target.id);
      if (after) documents.push({ kind: target.kind, document_id: target.id, hash: identityHash(after.payload) });
    }
    const committed: Extract<TransferAttemptResult, { outcome: "committed" }> = {
      outcome: "committed",
      project_id: projectId,
      documents
    };
    if (keptBeside.length > 0) committed.kept_beside = keptBeside;
    if (addedConversations.length > 0) committed.conversations = addedConversations;
    await recordCloudTransferAttempt({
      transferId: transfer.id,
      attemptId: input.attempt_id,
      userId,
      digest,
      outcome: "committed",
      result: committed
    });
    await setCloudTransferState(transfer.id, "committed", input.attempt_id);
    return committed;
  });
  for (const document of written) await host.published(document.kind, document.id, document.toAdmit);
  if (placing && result.outcome === "committed") {
    // A placement that fails here is the sweeper's to repeat.
    await runTransferPlacements(host.storage, result.project_id).catch(() => 0);
  }
  return result;
}
