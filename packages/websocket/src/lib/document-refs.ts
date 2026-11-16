/**
 * Reference sets of workflows and timelines, and the two rules that read them
 * (docs/plans/native-cloud-sync/technical-design.md, "Reference sets and file
 * authorization").
 *
 * Read rule: a file of another person is readable when it is in a set of a
 * document the reader can open, in a scope their access may read. The current
 * revision's `viewer` set is readable by everyone with access, its `editor`
 * set by editors, a version's `version_viewer` set by viewers with history
 * and by editors, and its `version_editor` set by editors.
 *
 * Attach rule: a save that adds a file the document did not hold before is
 * accepted only when the writer owns the asset, or the file is in a set the
 * writer may read on a document the writer may duplicate. Otherwise it is
 * refused with FILE_NOT_READABLE and nothing is written.
 *
 * Sets are written after each checked save and computed again whenever the
 * stored content no longer matches the hash a set was computed from, so a
 * write through any other path is reflected on the next read. A computed set
 * holds a file only when the document's owner owns it or the attach rule
 * admitted it, so a reference that reached a document without the check
 * exposes nothing of another library.
 */

import { createHash } from "node:crypto";
import {
  Asset,
  DocumentCollaborator,
  DocumentRefs,
  TimelineSequence,
  TimelineSequenceVersion,
  Workflow,
  WorkflowCollaborator,
  WorkflowVersion,
  type DocumentRefScopeValue
} from "@nodetool-ai/models";
import { isFullResourceId, refsOf, type RefDocumentKind } from "@nodetool-ai/protocol";
import type { EffectiveAccessItem } from "@nodetool-ai/protocol/api-schemas/workflows.js";
import { ApiErrorCode } from "../error-codes.js";
import { throwApiError } from "../trpc/error-formatter.js";
import { effectiveAccess } from "./document-access.js";

const ALL_SCOPES: readonly DocumentRefScopeValue[] = [
  "viewer",
  "editor",
  "version_viewer",
  "version_editor"
];

/** Versions read per document when its version sets are computed. */
const VERSION_LIMIT = 1000;

const ASSET_LOOKUP_CHUNK = 900;

interface RefDocument {
  id: string;
  user_id: string;
}

/** The stored content of a document, as the set function reads it. */
function currentContent(
  kind: RefDocumentKind,
  document: RefDocument
): unknown {
  if (kind === "workflow") return (document as Workflow).graph ?? null;
  return (document as TimelineSequence).document ?? null;
}

/** SHA-256 of the content as JSON. Equal content gives an equal hash. */
export function contentHash(content: unknown): string {
  const text =
    typeof content === "string" ? content : (JSON.stringify(content) ?? "null");
  return createHash("sha256").update(text).digest("hex");
}

async function loadRefDocument(
  kind: RefDocumentKind,
  id: string
): Promise<RefDocument | null> {
  if (kind === "workflow") {
    return ((await Workflow.get(id)) as Workflow | null) ?? null;
  }
  return TimelineSequence.findById(id);
}

/** The ids among `ids` that are assets of `ownerId`. */
async function ownedBy(ownerId: string, ids: readonly string[]): Promise<Set<string>> {
  const owned = new Set<string>();
  for (let start = 0; start < ids.length; start += ASSET_LOOKUP_CHUNK) {
    const assets = await Asset.findMany(
      ownerId,
      ids.slice(start, start + ASSET_LOOKUP_CHUNK)
    );
    for (const asset of assets) owned.add(asset.id);
  }
  return owned;
}

/**
 * The files of `content` a set may hold: those the document's owner owns and
 * those the attach rule admitted.
 */
async function eligibleFiles(
  kind: RefDocumentKind,
  document: RefDocument,
  content: unknown
): Promise<string[]> {
  const ids = refsOf(kind, content);
  if (ids.length === 0) return [];
  const [owned, admitted] = await Promise.all([
    ownedBy(document.user_id, ids),
    DocumentRefs.admitted(kind, document.id)
  ]);
  return ids.filter((id) => owned.has(id) || admitted.has(id));
}

/**
 * Write the current revision's set when it is missing or stale. Call it after
 * a save, and before reading the set.
 */
export async function ensureCurrentSet(
  kind: RefDocumentKind,
  document: RefDocument
): Promise<void> {
  const content = currentContent(kind, document);
  const hash = contentHash(content);
  const sets = await DocumentRefs.listSets(kind, document.id);
  const current = sets.find((s) => s.versionId === DocumentRefs.CURRENT);
  if (current?.contentHash === hash) return;
  const files = await eligibleFiles(kind, document, content);
  // Whole documents in phase 1: the viewer and editor sets are equal.
  await DocumentRefs.writeSet(kind, document.id, DocumentRefs.CURRENT, hash, {
    viewer: files,
    editor: files
  });
}

/**
 * Write the set of every saved version that has none, and remove the sets of
 * versions that no longer exist. A version never changes once written.
 */
export async function ensureVersionSets(
  kind: RefDocumentKind,
  document: RefDocument
): Promise<void> {
  const versions =
    kind === "workflow"
      ? (
          await WorkflowVersion.listForWorkflow(document.id, {
            limit: VERSION_LIMIT
          })
        ).map((v) => ({ id: v.id, content: v.graph as unknown }))
      : (
          await TimelineSequenceVersion.listForTimeline(document.id, {
            limit: VERSION_LIMIT
          })
        ).map((v) => ({ id: v.id, content: v.document as unknown }));
  const sets = await DocumentRefs.listSets(kind, document.id);
  const written = new Set(sets.map((s) => s.versionId));
  const live = new Set(versions.map((v) => v.id));
  for (const version of versions) {
    if (written.has(version.id)) continue;
    const files = await eligibleFiles(kind, document, version.content);
    await DocumentRefs.writeSet(
      kind,
      document.id,
      version.id,
      contentHash(version.content),
      { version_viewer: files, version_editor: files }
    );
  }
  for (const set of sets) {
    if (set.versionId === DocumentRefs.CURRENT || live.has(set.versionId)) {
      continue;
    }
    await DocumentRefs.removeSet(kind, document.id, set.versionId);
  }
}

/** The scopes an access may read on one document. */
export function readableScopes(
  access: EffectiveAccessItem
): DocumentRefScopeValue[] {
  const scopes: DocumentRefScopeValue[] = ["viewer"];
  if (access.role !== "viewer") scopes.push("editor", "version_editor");
  if (access.options.allow_history) scopes.push("version_viewer");
  return scopes;
}

function readsVersions(access: EffectiveAccessItem): boolean {
  return access.role !== "viewer" || access.options.allow_history;
}

/**
 * Whether `access` may read `file` through the sets of one document. The
 * sets are brought up to date first.
 */
export async function isFileInReadableSet(
  kind: RefDocumentKind,
  document: RefDocument,
  access: EffectiveAccessItem,
  file: string
): Promise<boolean> {
  await ensureCurrentSet(kind, document);
  if (readsVersions(access)) await ensureVersionSets(kind, document);
  return DocumentRefs.contains(kind, document.id, file, readableScopes(access));
}

/** The workflows and timelines `userId` holds a grant on, each once. */
async function grantedRefDocuments(
  userId: string,
  documentGrants?: readonly DocumentCollaborator[]
): Promise<Array<{ kind: RefDocumentKind; id: string }>> {
  const [workflows, documents] = await Promise.all([
    WorkflowCollaborator.listForUser(userId),
    documentGrants ?? DocumentCollaborator.listForUser(userId)
  ]);
  const seen = new Set<string>();
  const out: Array<{ kind: RefDocumentKind; id: string }> = [];
  const add = (kind: RefDocumentKind, id: string): void => {
    const key = `${kind}:${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ kind, id });
  };
  for (const grant of workflows) add("workflow", grant.workflow_id);
  for (const grant of documents) {
    if (grant.document_type === "timeline") add("timeline", grant.document_id);
  }
  return out;
}

/**
 * Every file of another person that `userId` may read through a workflow or
 * timeline shared with them. Each document's access is computed now, so a
 * removed grant or an option turned off applies to the next build.
 * `documentGrants` are the caller's document grants when already loaded.
 */
export async function readableSharedFiles(
  userId: string,
  documentGrants?: readonly DocumentCollaborator[]
): Promise<Set<string>> {
  const files = new Set<string>();
  for (const { kind, id } of await grantedRefDocuments(userId, documentGrants)) {
    const document = await loadRefDocument(kind, id);
    if (!document || document.user_id === userId) continue;
    const access = await effectiveAccess(userId, kind, id);
    if (!access) continue;
    await ensureCurrentSet(kind, document);
    if (readsVersions(access)) await ensureVersionSets(kind, document);
    const scopes = readableScopes(access);
    for (const scope of scopes) {
      if (scope === "viewer" || scope === "editor") {
        for (const file of await DocumentRefs.filesOf(kind, id, scope)) {
          files.add(file);
        }
      }
    }
    if (readsVersions(access)) {
      const sets = await DocumentRefs.listSets(kind, id);
      for (const set of sets) {
        if (set.versionId === DocumentRefs.CURRENT) continue;
        for (const scope of scopes) {
          if (scope !== "version_viewer" && scope !== "version_editor") continue;
          for (const file of await DocumentRefs.filesOf(kind, id, scope, set.versionId)) {
            files.add(file);
          }
        }
      }
    }
  }
  return files;
}

/** May `writerId` duplicate a document that shows `file`? */
async function isFileReadableForAttach(
  writerId: string,
  file: string,
  exclude: { kind: RefDocumentKind; id: string }
): Promise<boolean> {
  for (const kind of ["workflow", "timeline"] as const) {
    for (const id of await documentsShowing(kind, file)) {
      if (kind === exclude.kind && id === exclude.id) continue;
      const access = await effectiveAccess(writerId, kind, id);
      if (!access || !access.options.allow_duplicate) continue;
      const document = await loadRefDocument(kind, id);
      if (!document) continue;
      if (await isFileInReadableSet(kind, document, access, file)) return true;
    }
  }
  return false;
}

/** Ids of the documents of `kind` with a stored set that names `file`. */
async function documentsShowing(
  kind: RefDocumentKind,
  file: string
): Promise<string[]> {
  return DocumentRefs.documentsWithFile(kind, file);
}

/** The document a save writes to, as the attach rule reads it. */
export interface AttachTarget {
  id: string;
  /** The document's owner. */
  user_id: string;
  /** The stored content before the save, null for a new document. */
  before: unknown;
}

/**
 * Apply the attach rule to a save of `content` by `writerId`, before anything
 * is written. Returns the first file the writer may not add, or null when the
 * save may go ahead. When it may, the other people's files it adds are
 * admitted to the document.
 */
export async function findUnreadableFile(
  kind: RefDocumentKind,
  document: AttachTarget,
  writerId: string,
  content: unknown
): Promise<string | null> {
  const next = refsOf(kind, content);
  if (next.length === 0) return null;
  const exists = document.before !== null;
  const before = new Set(exists ? refsOf(kind, document.before) : []);
  const admitted = await DocumentRefs.admitted(kind, document.id);
  const added = next.filter(
    (id) => !before.has(id) && !admitted.has(id) && isFullResourceId(id)
  );
  if (added.length === 0) return null;
  const toAdmit: string[] = [];
  for (const file of added) {
    // A file a stored set of this document already names, such as one of a
    // version being restored, is not new to it.
    if (
      exists &&
      (await DocumentRefs.contains(kind, document.id, file, ALL_SCOPES))
    ) {
      continue;
    }
    const asset = (await Asset.get(file)) as Asset | null;
    // An id that names no asset gives access to nothing.
    if (!asset || asset.id !== file) continue;
    if (asset.user_id === writerId) {
      if (writerId !== document.user_id) toAdmit.push(file);
      continue;
    }
    if (await isFileReadableForAttach(writerId, file, { kind, id: document.id })) {
      if (asset.user_id !== document.user_id) toAdmit.push(file);
      continue;
    }
    return file;
  }
  if (toAdmit.length > 0) await DocumentRefs.admit(kind, document.id, toAdmit);
  return null;
}

/** The message of a FILE_NOT_READABLE refusal. */
export function fileNotReadableMessage(file: string): string {
  return `File ${file} is not readable to you, so it cannot be added`;
}

/** {@link findUnreadableFile} for a tRPC procedure: refuses with FILE_NOT_READABLE. */
export async function checkAttach(
  kind: RefDocumentKind,
  document: AttachTarget,
  writerId: string,
  content: unknown
): Promise<void> {
  const file = await findUnreadableFile(kind, document, writerId, content);
  if (file !== null) {
    throwApiError(ApiErrorCode.FILE_NOT_READABLE, fileNotReadableMessage(file));
  }
}
