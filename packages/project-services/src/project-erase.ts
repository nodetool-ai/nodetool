/**
 * Erasing a file of a cloud project
 * (docs/plans/native-cloud-sync/technical-design.md, "Deletion, restore and
 * storage" and "Storage recovery and erase", WP2.9, PRD FR79, SR33).
 *
 * Only the owner erases. The erase is refused while current content shows
 * the file: the current revision of a workflow or timeline of the project,
 * or a file in the project's folder. The refusal names that content.
 * Otherwise every row through which the project holds the hash is deleted,
 * the hash goes on the project's erased list, and each document whose saved
 * versions or deleted copy refer to the file gets a `file_erased` row in its
 * activity record. Storage use drops at once, because it counts committed
 * rows. The object goes once no row of any project and no live revision set
 * names the hash, so a second project of the owner keeps serving it (TC82).
 *
 * The check and the write run in one transaction that locks the project's
 * files and every document row of the project. A save that would make the
 * file current waits for those row locks, so either the erase sees it and
 * refuses, or the save lands after the erase and shows File erased (TC80).
 * Latest delivery snapshots are not checked: they arrive with phase 4.
 */
import {
  Asset,
  assetIdsWithContentHash,
  appendDocumentActivity,
  deleteProjectBlobRows,
  deleteUnnamedBlob,
  deletedDocumentRefFiles,
  deletedDocumentsOfProject,
  getErasedFile,
  lockProjectFiles,
  Project,
  projectFilesWithContentHash,
  readableProjectBlob,
  recordErasedFile,
  removeErasedFile,
  TimelineSequence,
  TimelineSequenceVersion,
  withTransaction,
  Workflow,
  WorkflowVersion
} from "@nodetool-ai/models";
import { refsOf } from "@nodetool-ai/protocol";
import type { TransferDocumentKind } from "@nodetool-ai/protocol/api-schemas/transfer.js";
import type { StorageAdapter } from "@nodetool-ai/storage";
import { blobKey } from "@nodetool-ai/asset-services/blob-store";
import { pausePoint } from "@nodetool-ai/config/pause-points";
import type { TransferRole } from "./cloud-transfer.js";
import { TRANSFER_DOCUMENT_KINDS } from "./transfer-documents.js";

/** Saved versions read per document when the references are collected. */
const VERSION_LIMIT = 1000;

const HASH_PATTERN = /^[0-9a-f]{64}$/;

/** What an erase needs from the server that hosts it. */
export interface EraseHost {
  storage: StorageAdapter;
  /** The caller's role on a document now, or null without access. */
  documentRole(userId: string, kind: TransferDocumentKind, id: string): Promise<TransferRole | null>;
}

/** A request the server refuses before it changes anything. */
export class EraseRequestError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "FORBIDDEN" | "INVALID",
    message: string
  ) {
    super(message);
    this.name = "EraseRequestError";
  }
}

/** Current content that shows the file, so the erase is refused. */
export type EraseBlocker =
  | { kind: TransferDocumentKind; document_id: string; name: string }
  | { kind: "file"; asset_id: string; path: string };

/** Content that refers to the file and keeps referring to it after the erase. */
export interface EraseReference {
  kind: string;
  document_id: string;
  name: string;
  /** `version` for saved versions, with their ids, or `deleted` for a deleted document. */
  where: "version" | "deleted";
  version_ids: string[];
}

export interface ErasePreview {
  hash: string;
  size: number;
  /** The assets with this content, which the documents refer to. */
  asset_ids: string[];
  /** Empty when the erase may go ahead. */
  current: EraseBlocker[];
  references: EraseReference[];
}

export type EraseResult =
  | { outcome: "erased"; hash: string; size: number; asset_ids: string[]; references: EraseReference[]; erased_at: string }
  | { outcome: "refused"; hash: string; current: EraseBlocker[] };

interface ProjectDocument {
  kind: TransferDocumentKind;
  id: string;
}

async function projectDocuments(project: Project): Promise<ProjectDocument[]> {
  const [workflows, timelines] = await Promise.all([
    Workflow.listForProjects(project.user_id, [project.id]),
    TimelineSequence.listForProjects(project.user_id, [project.id])
  ]);
  return [
    ...workflows.map((workflow) => ({ kind: "workflow" as const, id: workflow.id })),
    ...timelines.map((timeline) => ({ kind: "timeline" as const, id: timeline.id }))
  ].sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
}

async function versionContents(kind: TransferDocumentKind, id: string): Promise<{ id: string; content: unknown }[]> {
  if (kind === "workflow") {
    return (await WorkflowVersion.listForWorkflow(id, { limit: VERSION_LIMIT })).map((v) => ({
      id: v.id,
      content: v.graph as unknown
    }));
  }
  return (await TimelineSequenceVersion.listForTimeline(id, { limit: VERSION_LIMIT })).map((v) => ({
    id: v.id,
    content: v.document as unknown
  }));
}

/**
 * Checks the caller and the hash. Returns the project when the caller owns
 * it. A caller with a role on one of its documents learns that only the
 * owner erases; anyone else gets the answer a missing project gets.
 */
async function ownedProject(host: EraseHost, userId: string, projectId: string, hash: string): Promise<Project> {
  if (!HASH_PATTERN.test(hash)) throw new EraseRequestError("INVALID", "A file hash is 64 lowercase hex characters");
  const project = await Project.get<Project>(projectId);
  if (!project || project.deleted_at) throw new EraseRequestError("NOT_FOUND", "Project not found");
  if (project.user_id === userId) return project;
  for (const document of await projectDocuments(project)) {
    if (await host.documentRole(userId, document.kind, document.id)) {
      throw new EraseRequestError("FORBIDDEN", "Only the project's owner can erase a file");
    }
  }
  throw new EraseRequestError("NOT_FOUND", "Project not found");
}

/**
 * What shows and what refers to the file. Inside a transaction each
 * document row stays locked until it ends.
 */
async function inspect(project: Project, hash: string): Promise<Omit<ErasePreview, "size">> {
  const held = new Set(await assetIdsWithContentHash(hash));
  const projectAssets = await Asset.listByProject(project.user_id, project.id);
  const scopedAssetIds = new Set(
    projectAssets.filter((asset) => asset.content_hash === hash).map((asset) => asset.id)
  );
  const refers = (files: readonly string[]) => {
    let matched = false;
    for (const file of files) {
      if (held.has(file)) {
        scopedAssetIds.add(file);
        matched = true;
      }
    }
    return matched;
  };
  const current: EraseBlocker[] = [];
  const references: EraseReference[] = [];
  for (const document of await projectDocuments(project)) {
    const handler = TRANSFER_DOCUMENT_KINDS[document.kind];
    // Inside the erase's transaction this locks the row until it ends.
    const stored = await handler.lock(document.id);
    if (!stored) continue;
    const files = handler.files(stored.payload);
    if (refers(files)) {
      current.push({ kind: document.kind, document_id: document.id, name: stored.name });
      continue;
    }
    const versionIds = (await versionContents(document.kind, document.id))
      .filter((version) => refers(refsOf(document.kind, version.content)))
      .map((version) => version.id);
    if (versionIds.length > 0) {
      references.push({ kind: document.kind, document_id: document.id, name: stored.name, where: "version", version_ids: versionIds.sort() });
    }
  }
  for (const file of await projectFilesWithContentHash(project.id, hash)) {
    current.push({ kind: "file", asset_id: file.assetId, path: file.path });
  }
  for (const deleted of await deletedDocumentsOfProject(project.id)) {
    if (refers([...deletedDocumentRefFiles(deleted.payload)])) {
      references.push({ kind: deleted.kind, document_id: deleted.documentId, name: deleted.name, where: "deleted", version_ids: [] });
    }
  }
  return { hash, asset_ids: [...scopedAssetIds].sort(), current, references };
}

/** The size the project's committed row records, or the not-found refusal. */
async function committedSize(projectId: string, hash: string): Promise<number> {
  const row = await readableProjectBlob({ projectId, hash });
  if (!row || row.committed_at === null) {
    throw new EraseRequestError("NOT_FOUND", "The project holds no file with this hash");
  }
  return Number(row.size);
}

/** What the erase dialog shows before the confirmation. */
export async function previewErase(
  host: EraseHost,
  userId: string,
  input: { project_id: string; hash: string }
): Promise<ErasePreview> {
  const project = await ownedProject(host, userId, input.project_id, input.hash);
  const size = await committedSize(project.id, input.hash);
  return { ...(await inspect(project, input.hash)), size };
}

/**
 * Erases the file with `hash` from the project. Erasing a file that is on
 * the list already answers with its row.
 */
export async function eraseProjectFile(
  host: EraseHost,
  userId: string,
  input: { project_id: string; hash: string }
): Promise<EraseResult> {
  const project = await ownedProject(host, userId, input.project_id, input.hash);
  const now = new Date();
  const result = await withTransaction(async (): Promise<EraseResult> => {
    await lockProjectFiles(project.id);
    const erased = await getErasedFile(project.id, input.hash);
    if (erased) {
      return {
        outcome: "erased",
        hash: erased.hash,
        size: Number(erased.size),
        asset_ids: erased.asset_ids,
        references: [],
        erased_at: erased.erased_at
      };
    }
    const size = await committedSize(project.id, input.hash);
    const found = await inspect(project, input.hash);
    await pausePoint("erase.checked");
    if (found.current.length > 0) return { outcome: "refused", hash: input.hash, current: found.current };
    await deleteProjectBlobRows(project.id, input.hash);
    await recordErasedFile({ projectId: project.id, userId, hash: input.hash, size, assetIds: found.asset_ids, now });
    for (const reference of found.references) {
      await appendDocumentActivity(
        {
          kind: reference.kind,
          documentId: reference.document_id,
          type: "file_erased",
          userId,
          payload: {
            project_id: project.id,
            hash: input.hash,
            size,
            asset_ids: found.asset_ids,
            version_ids: reference.version_ids
          }
        },
        now
      );
    }
    return {
      outcome: "erased",
      hash: input.hash,
      size,
      asset_ids: found.asset_ids,
      references: found.references,
      erased_at: now.toISOString()
    };
  });
  if (result.outcome === "erased") {
    // Kept while another project or a live revision set names the hash; the
    // blob cleanup deletes it later.
    await deleteUnnamedBlob(input.hash, () => host.storage.delete(host.storage.uriForKey(blobKey(input.hash))));
  }
  return result;
}

/**
 * Takes a file off the erased list. The next transfer from a copy that holds
 * the file stages it again as a required file. Returns false when it was not
 * on the list.
 */
export async function takeOffErasedList(
  host: EraseHost,
  userId: string,
  input: { project_id: string; hash: string }
): Promise<boolean> {
  const project = await ownedProject(host, userId, input.project_id, input.hash);
  return removeErasedFile(project.id, input.hash);
}
