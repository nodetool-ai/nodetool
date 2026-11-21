/**
 * The server half of a receive from a cloud project
 * (docs/plans/native-cloud-sync/technical-design.md, "Receiving: revision
 * set, stage, check, apply", WP2.5).
 *
 * A capture fixes, for one reader, the revision of each document the reader
 * may open and the files each revision needs. The client then downloads
 * each document and file the set names and releases the set. Every download
 * authorizes the reader again (Y6, SR29), and what a set delivers does not
 * change after capture (Y1): a revision is held as a saved version, and the
 * set's file hashes are retention roots of the blob store until it is
 * released or seven days old.
 */
import {
  addRevisionSetEntry,
  createRevisionSet,
  deleteRevisionSet,
  erasedFilesOf,
  getDatabase,
  getErasedFile,
  getLiveRevisionSet,
  getRevisionSet,
  getRevisionSetEntry,
  lockAccessEpochs,
  lockTransferDocumentRow,
  Project,
  revisionSetFilesWithHash,
  TimelineSequence,
  withTransaction,
  Workflow,
  type AccessKey,
  type RevisionSetRow
} from "@nodetool-ai/models";
import { blobKey } from "@nodetool-ai/asset-services/blob-store";
import { pausePoint } from "@nodetool-ai/config/pause-points";
import type {
  CaptureRevisionSetInput,
  CaptureRevisionSetOutput,
  ReceiveDocumentInput,
  ReceiveDocumentOutput,
  RevisionSetDocument
} from "@nodetool-ai/protocol/api-schemas/receive.js";
import type { TransferDocumentKind } from "@nodetool-ai/protocol/api-schemas/transfer.js";
import type { TransferHost } from "./cloud-transfer.js";
import { identityHash, TRANSFER_DOCUMENT_KINDS, type TransferPayloadContent } from "./transfer-documents.js";

/** A file of a revision, as the server holds it. */
export interface ReceiveFileInfo {
  assetId: string;
  /** The content hash, or null when the cloud holds no bytes for it. */
  hash: string | null;
  size: number;
  name: string;
  contentType: string;
  /** The path in the project folder, or null for a file stored outside one. */
  path: string | null;
}

/** What a receive needs from the server that hosts it. */
export interface ReceiveHost extends Pick<TransferHost, "storage" | "documentRole"> {
  /**
   * The files among those `content` refers to that the caller may read
   * through the document's reference sets, with their hashes and sizes.
   */
  readableFiles(
    userId: string,
    kind: TransferDocumentKind,
    id: string,
    content: unknown
  ): Promise<ReceiveFileInfo[]>;
}

/** A request the server refuses. */
export class ReceiveRequestError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "SET_EXPIRED",
    message: string
  ) {
    super(message);
    this.name = "ReceiveRequestError";
  }
}

/** The answer of {@link receiveFile} when an owner's action freed the bytes (Y1, FR79). */
export const ERASED = "ERASED";

const SET_EXPIRED_MESSAGE = "The revision set expired or was released. Capture a new one.";

/**
 * Runs `body` with the epochs of `keys` locked in share mode, so a change
 * of access either commits before the access check or waits until `body`
 * has written. SQLite has a single writer, so there `body` runs as it is.
 */
async function underAccessLock<T>(keys: readonly AccessKey[], body: () => Promise<T>): Promise<T> {
  if (getDatabase().dialect !== "postgres") return body();
  return withTransaction(async () => {
    await lockAccessEpochs(keys);
    return body();
  });
}

/** The documents of a project a receive carries, each once. */
async function projectDocuments(project: Project): Promise<Array<{ kind: TransferDocumentKind; id: string }>> {
  const [workflows, timelines] = await Promise.all([
    Workflow.listForProjects(project.user_id, [project.id]),
    TimelineSequence.listForProjects(project.user_id, [project.id])
  ]);
  return [
    ...workflows.map((workflow) => ({ kind: "workflow" as const, id: workflow.id })),
    ...timelines.map((timeline) => ({ kind: "timeline" as const, id: timeline.id }))
  ];
}

function documentKey(target: { kind: TransferDocumentKind; id: string }): string {
  return `${target.kind}:${target.id}`;
}

/** The project of a document, for a capture of that document alone. */
async function projectOfDocument(kind: TransferDocumentKind, id: string): Promise<string | null> {
  if (kind === "workflow") return (await Workflow.get<Workflow>(id))?.project_id ?? null;
  return (await TimelineSequence.findById(id))?.project_id ?? null;
}

/**
 * Captures one document into the set when the caller may open it. Returns
 * the entry as the client sees it, or null without access. Runs inside the
 * capture's transaction, which holds the document's row and access epochs.
 */
async function captureDocument(
  host: ReceiveHost,
  userId: string,
  set: RevisionSetRow,
  kind: TransferDocumentKind,
  id: string
): Promise<RevisionSetDocument | null> {
  const handler = TRANSFER_DOCUMENT_KINDS[kind];
  if (!(await host.documentRole(userId, kind, id))) return null;
  const held = await handler.holdRevision(id);
  if (!held || held.projectId !== set.project_id) return null;
  const files = await host.readableFiles(userId, kind, id, handler.content(held.payload));
  // An erased file is not served, so the set does not name it (FR79).
  const erased = (await erasedFilesOf(set.project_id)).hashes;
  const present = files.filter(
    (file): file is ReceiveFileInfo & { hash: string } => file.hash !== null && !erased.has(file.hash)
  );
  const contentHash = identityHash(held.payload);
  await addRevisionSetEntry(set, {
    kind,
    documentId: id,
    revisionId: held.revisionId,
    fields: held.fields,
    contentHash,
    files: present.map((file) => ({ assetId: file.assetId, hash: file.hash, size: file.size }))
  });
  return {
    kind,
    document_id: id,
    name: held.name,
    revision_id: held.revisionId,
    content_hash: contentHash,
    files: present.map((file) => ({
      asset_id: file.assetId,
      hash: file.hash,
      size: file.size,
      name: file.name,
      content_type: file.contentType,
      path: file.path
    })),
    missing_files: files.filter((file) => file.hash === null).map((file) => file.assetId),
    erased_files: files.filter((file) => file.hash !== null && erased.has(file.hash)).map((file) => file.assetId)
  };
}

/** How often a project capture lists its documents again before it gives up (review F47). */
const MEMBERSHIP_ATTEMPTS = 5;

/** The documents of a project changed while a capture locked them, so it starts again. */
class MembershipChanged extends Error {}

/**
 * Holds every document of the capture in one transaction. The documents of
 * a project are listed, their access epochs and rows locked, and the list
 * read again under those locks. A transfer that adds or moves documents
 * while it changes listed ones has committed by then, so a list that
 * differs starts the capture again with the new members, and the set never
 * holds part of one commit (Y2, reviews F29, F47). Rows are locked in one
 * order, as a commit's are.
 */
async function captureMembers(
  host: ReceiveHost,
  userId: string,
  set: RevisionSetRow,
  project: Project,
  input: CaptureRevisionSetInput
): Promise<RevisionSetDocument[]> {
  const membersOf = async (): Promise<Array<{ kind: TransferDocumentKind; id: string }>> =>
    "project_id" in input ? projectDocuments(project) : [{ kind: input.kind, id: input.document_id }];
  const listed = (targets: Array<{ kind: TransferDocumentKind; id: string }>): string =>
    targets.map(documentKey).sort().join(",");
  let targets = await membersOf();
  await pausePoint("receive.capture.members-listed");
  for (let attempt = 1; ; attempt++) {
    const ordered = [...targets].sort((a, b) => documentKey(a).localeCompare(documentKey(b)));
    const keys: AccessKey[] = [{ kind: "project", id: project.id }, ...ordered.map((target) => ({ kind: target.kind, id: target.id }))];
    try {
      return await underAccessLock(keys, async () => {
        for (const target of ordered) await lockTransferDocumentRow(target.kind, target.id);
        const current = await membersOf();
        if (listed(current) !== listed(targets)) {
          targets = current;
          throw new MembershipChanged();
        }
        const captured: RevisionSetDocument[] = [];
        for (const target of targets) {
          const document = await captureDocument(host, userId, set, target.kind, target.id);
          if (document) captured.push(document);
          await pausePoint("receive.capture.document-held");
        }
        return captured;
      });
    } catch (error) {
      if (!(error instanceof MembershipChanged)) throw error;
      if (attempt >= MEMBERSHIP_ATTEMPTS) {
        throw new Error("The project's documents kept changing during the capture. Try again.");
      }
    }
  }
}

/**
 * Captures a revision set of a whole project or one document. An entry
 * exists only for documents the caller may open now, and its files are those
 * the caller's role may read. A project the caller may open nothing of is
 * not found, unless the caller owns it.
 */
export async function captureRevisionSet(
  host: ReceiveHost,
  userId: string,
  input: CaptureRevisionSetInput
): Promise<CaptureRevisionSetOutput> {
  const projectId = "project_id" in input ? input.project_id : await projectOfDocument(input.kind, input.document_id);
  const project = projectId ? await Project.get<Project>(projectId) : null;
  if (!project || project.deleted_at) throw new ReceiveRequestError("NOT_FOUND", "Not found");
  const set = await createRevisionSet({ userId, projectId: project.id });
  try {
    const documents = await captureMembers(host, userId, set, project, input);
    const ownsProject = "project_id" in input && project.user_id === userId;
    if (documents.length === 0 && !ownsProject) throw new ReceiveRequestError("NOT_FOUND", "Not found");
    return { set_id: set.id, project_id: project.id, expires_at: set.expires_at, documents };
  } catch (error) {
    await deleteRevisionSet(set.id);
    throw error;
  }
}

async function liveSetOf(userId: string, setId: string): Promise<RevisionSetRow> {
  const set = await getLiveRevisionSet(setId);
  // Another reader's set answers like an expired one, so set ids are not probeable.
  if (!set || set.user_id !== userId) throw new ReceiveRequestError("SET_EXPIRED", SET_EXPIRED_MESSAGE);
  return set;
}

/** The captured revision of one document of the set, after authorizing the caller again. */
export async function receiveDocument(
  host: ReceiveHost,
  userId: string,
  input: ReceiveDocumentInput
): Promise<ReceiveDocumentOutput> {
  const set = await liveSetOf(userId, input.set_id);
  const entry = await getRevisionSetEntry(set.id, input.kind, input.document_id);
  if (!entry || !(await host.documentRole(userId, input.kind, input.document_id))) {
    throw new ReceiveRequestError("NOT_FOUND", "Document not found");
  }
  const fields = JSON.parse(entry.fields) as Record<string, unknown>;
  const document: TransferPayloadContent | null = await TRANSFER_DOCUMENT_KINDS[input.kind].readRevision(
    entry.revision_id,
    fields
  );
  // The owner deleted the saved version that held it, which frees storage.
  if (!document) throw new ReceiveRequestError("SET_EXPIRED", SET_EXPIRED_MESSAGE);
  if (identityHash(document) !== entry.content_hash) {
    throw new Error(`The held revision of ${input.kind} ${input.document_id} no longer has its captured hash`);
  }
  return { kind: input.kind, document_id: input.document_id, content_hash: entry.content_hash, document };
}

/**
 * The bytes of a file the set names, after authorizing the caller again on
 * a document that needs it. {@link ERASED} when an owner's action freed
 * them: the client then treats the set as expired (Y7).
 */
export async function receiveFile(
  host: ReceiveHost,
  userId: string,
  input: { set_id: string; hash: string }
): Promise<Uint8Array | typeof ERASED> {
  const set = await liveSetOf(userId, input.set_id);
  const rows = await revisionSetFilesWithHash(set.id, input.hash);
  let authorized = false;
  // The caller must still read this asset through the captured revision's
  // reference sets, not only hold some role on the document: a reference
  // that only an editor reads does not serve a viewer (Y6, SR29).
  for (const row of rows) {
    const kind = row.document_kind as TransferDocumentKind;
    if (!(await host.documentRole(userId, kind, row.document_id))) continue;
    const entry = await getRevisionSetEntry(set.id, kind, row.document_id);
    if (!entry) continue;
    const handler = TRANSFER_DOCUMENT_KINDS[kind];
    const document = await handler.readRevision(entry.revision_id, JSON.parse(entry.fields) as Record<string, unknown>);
    if (!document) continue;
    const readable = await host.readableFiles(userId, kind, row.document_id, handler.content(document));
    if (readable.some((file) => file.assetId === row.asset_id && file.hash === input.hash)) {
      authorized = true;
      break;
    }
  }
  if (!authorized) throw new ReceiveRequestError("NOT_FOUND", "File not found");
  // The owner erased it after the capture. The object may still exist for
  // another project or another set, but this project serves it to nobody (SR33).
  if (await getErasedFile(set.project_id, input.hash)) return ERASED;
  const bytes = await host.storage.retrieve(host.storage.uriForKey(blobKey(input.hash)));
  return bytes ?? ERASED;
}

/** Releases the caller's set. Releasing a set that is gone, or another reader's, changes nothing. */
export async function releaseRevisionSet(userId: string, setId: string): Promise<void> {
  const set = await getRevisionSet(setId);
  if (set?.user_id === userId) await deleteRevisionSet(set.id);
}
