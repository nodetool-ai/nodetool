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
  commitProjectBlobs,
  committedHashesOfOwner,
  deletedDocumentExists,
  deleteStagedBlobsOfTransfer,
  exceedsStorageAllowance,
  findCloudTransferAttempt,
  getCloudTransfer,
  getDatabase,
  listCloudTransferAttempts,
  lockAccessEpochs,
  lockCloudTransfer,
  openCloudTransfer,
  Project,
  readableProjectBlob,
  recordCloudTransferAttempt,
  setCloudTransferState,
  storageAllowanceStatus,
  withTransaction,
  type AccessKey
} from "@nodetool-ai/models";
import type { StorageAdapter } from "@nodetool-ai/storage";
import { pausePoint } from "@nodetool-ai/config/pause-points";
import { hashesToSend, stageBlob, stageKnownBlob } from "@nodetool-ai/asset-services/blob-store";
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

function requiredHashes(manifest: TransferManifest): string[] {
  return [...new Set(manifest.required_files.map((file) => file.hash))];
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

  const hashes = requiredHashes(input.manifest);
  const needed = new Set(await hashesToSend(host.storage, userId, hashes));
  for (const file of input.manifest.required_files) {
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
    }))
  });
}

function failure(code: TransferFailure["code"], message: string, extra: Partial<TransferFailure> = {}): TransferFailure {
  return { code, message, ...extra };
}

function documentKey(kind: string, id: string): string {
  return `${kind}:${id}`;
}

/** The operations' targets, in the manifest's order, without repeats. */
function targets(operations: readonly TransferOperation[]): { kind: TransferDocumentKind; id: string }[] {
  const seen = new Set<string>();
  const out: { kind: TransferDocumentKind; id: string }[] = [];
  for (const op of operations) {
    const key = documentKey(op.kind, op.document_id);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: op.kind, id: op.document_id });
  }
  return out;
}

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

    const failures: TransferFailure[] = [];
    const operations = input.manifest.operations;

    // Step 3: verify the payloads, and derive the required files from them.
    const payloads = new Map<string, TransferPayloadContent>();
    for (const payload of input.payloads) {
      payloads.set(documentKey(payload.kind, payload.document_id), payload.document);
    }
    const listed = new Set([
      ...input.manifest.required_files.map((file) => file.asset_id),
      ...input.missing_files.map((file) => file.asset_id)
    ]);
    for (const op of operations) {
      if (op.op !== "create_document" && op.op !== "replace_document") continue;
      const payload = payloads.get(documentKey(op.kind, op.document_id));
      if (!payload) {
        failures.push(failure("PAYLOAD_MISSING", "The operation has no payload", { kind: op.kind, document_id: op.document_id }));
        continue;
      }
      if (identityHash(payload) !== op.captured_hash) {
        failures.push(
          failure("PAYLOAD_HASH_MISMATCH", "The payload does not have the captured hash", {
            kind: op.kind,
            document_id: op.document_id
          })
        );
        continue;
      }
      const invalid = TRANSFER_DOCUMENT_KINDS[op.kind].invalid(payload);
      if (invalid) {
        failures.push(failure("PAYLOAD_INVALID", invalid, { kind: op.kind, document_id: op.document_id }));
        continue;
      }
      for (const file of TRANSFER_DOCUMENT_KINDS[op.kind].files(payload)) {
        if (!listed.has(file)) {
          failures.push(
            failure("MANIFEST_INCOMPLETE", "The document refers to a file the manifest does not list", {
              kind: op.kind,
              document_id: op.document_id,
              asset_id: file
            })
          );
        }
      }
    }
    if (failures.length > 0) return refuse(failures);

    // Step 4: lock the access epochs, then check the sender's role on the project.
    const projectId = transfer.project_id;
    const epochKeys: AccessKey[] = [
      { kind: "project", id: projectId },
      ...targets(operations).map((target) => ({ kind: target.kind, id: target.id }))
    ];
    await lockAccessEpochs(epochKeys);
    const project = await Project.get<Project>(projectId);
    if (transfer.first_publication) {
      if (project) return refuse([failure("PROJECT_EXISTS", "A project with this id exists")]);
      const committed = await committedHashesOfOwner(userId, requiredHashes(input.manifest));
      const sizes = new Map(input.manifest.required_files.map((file) => [file.hash, file.size]));
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
    for (const op of operations) {
      const key = documentKey(op.kind, op.document_id);
      const handler = TRANSFER_DOCUMENT_KINDS[op.kind];
      const document = stored.get(key) ?? null;
      const where = { kind: op.kind, document_id: op.document_id };
      if (op.op === "create_document") {
        if (document || (await deletedDocumentExists(op.kind, op.document_id))) {
          failures.push(failure("DOCUMENT_EXISTS", "A document with this id exists", where));
          continue;
        }
        const payload = payloads.get(key) ?? {};
        const check = await host.checkAttach(
          userId,
          op.kind,
          { id: op.document_id, user_id: userId, before: null },
          handler.content(payload)
        );
        if (check.unreadable) {
          failures.push(
            failure("FILE_NOT_READABLE", "The sender may not attach this file", { ...where, asset_id: check.unreadable })
          );
        }
        admissions.set(key, check.toAdmit);
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
      if (document.projectId !== projectId) {
        failures.push(failure("DOCUMENT_NOT_IN_PROJECT", "The document is not in this project", where));
        continue;
      }
      const role = await host.documentRole(userId, op.kind, op.document_id);
      if (role === null) {
        failures.push(failure("ACCESS_REMOVED", "The sender no longer has access to the document", where));
        continue;
      }
      if (op.op === "delete_document") {
        if (role !== "owner") failures.push(failure("OWNER_REQUIRED", "Only the owner deletes a document", where));
      } else if (!atLeast(role, "editor")) {
        failures.push(failure("EDITOR_REQUIRED", "The sender may only view the document", where));
        continue;
      }
      if (op.op === "replace_document") {
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
        admissions.set(key, check.toAdmit);
      }
      // Step 7: the stored content must be the base. For a replace, a Keep
      // local decision may name the stored hash instead.
      if (op.op === "replace_document" || op.op === "delete_document") {
        const storedHash = identityHash(document.payload);
        const decided = op.op === "replace_document" && decisions.get(key) === storedHash;
        if (storedHash !== op.base_hash && !decided) {
          failures.push(
            failure("BASE_CHANGED", "The cloud document changed since the review", { ...where, stored_hash: storedHash })
          );
        }
      }
    }

    // Step 6: every required file is staged or committed, or confirmed missing.
    const missing = new Set(input.missing_files.map((file) => file.asset_id));
    for (const file of input.manifest.required_files) {
      if (missing.has(file.asset_id)) continue;
      const row = await readableProjectBlob({ projectId, hash: file.hash, transferId: transfer.id });
      if (!row) {
        failures.push(failure("FILE_NOT_STAGED", "The file was not staged", { asset_id: file.asset_id, hash: file.hash }));
      }
    }

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
    for (const op of operations) {
      const key = documentKey(op.kind, op.document_id);
      const handler = TRANSFER_DOCUMENT_KINDS[op.kind];
      const document = stored.get(key);
      switch (op.op) {
        case "create_document":
          await handler.create({ id: op.document_id, userId, projectId, payload: payloads.get(key) ?? {} });
          break;
        case "replace_document":
          if (document) await handler.replace(document, payloads.get(key) ?? {});
          break;
        case "rename_document":
          if (document) await handler.rename(document, op.name);
          break;
        case "delete_document":
          if (document) await handler.remove(document);
          break;
      }
      if (op.op !== "delete_document") {
        written.push({ kind: op.kind, id: op.document_id, toAdmit: admissions.get(key) ?? [] });
      }
    }
    await commitProjectBlobs(projectId, transfer.id);

    // Step 11: record the attempt and the transfer as committed.
    const documents: { kind: TransferDocumentKind; document_id: string; hash: string }[] = [];
    for (const target of targets(operations)) {
      const after = await TRANSFER_DOCUMENT_KINDS[target.kind].lock(target.id);
      if (after) documents.push({ kind: target.kind, document_id: target.id, hash: identityHash(after.payload) });
    }
    const committed: TransferAttemptResult = { outcome: "committed", project_id: projectId, documents };
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
  return result;
}
