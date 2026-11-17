/**
 * Stored reference sets and the files admitted into documents. See
 * schema/document-refs.ts and `refsOf` in @nodetool-ai/protocol.
 *
 * A set is written for one revision of one document: a saved version, keyed
 * by the version id, or a current revision, keyed by `current:<content
 * hash>`. Keying the current set by its content means a set computed from an
 * older read can never stand in for the content stored now: an authorization
 * reads the document, hashes its content and consults exactly that set.
 */

import { and, eq, inArray, like, ne, notLike, or } from "drizzle-orm";
import { createTimeOrderedUuid } from "./base-model.js";
import { getPortableDb } from "./db.js";
import {
  documentAdmittedFiles,
  documentRefSets,
  documentRefs
} from "./schema/document-refs.js";

export type DocumentRefScopeValue =
  | "viewer"
  | "editor"
  | "version_viewer"
  | "version_editor";

/** The files of one revision, by scope. */
export type DocumentRefSetFiles = Partial<
  Record<DocumentRefScopeValue, readonly string[]>
>;

export interface DocumentRefSetRow {
  versionId: string;
  contentHash: string;
}

/** The key of a current set written before sets were keyed by content. */
const LEGACY_CURRENT = "";
const CURRENT_PREFIX = "current:";
const IN_LIST_CHUNK = 500;

/** The set key of the current revision whose content hashes to `contentHash`. */
function currentKey(contentHash: string): string {
  return `${CURRENT_PREFIX}${contentHash}`;
}

/** Whether a set key names a current revision rather than a saved version. */
function isCurrentKey(versionId: string): boolean {
  return versionId === LEGACY_CURRENT || versionId.startsWith(CURRENT_PREFIX);
}

/** Rows of saved versions only. */
const versionRowsOnly = () =>
  and(
    ne(documentRefs.version_id, LEGACY_CURRENT),
    notLike(documentRefs.version_id, `${CURRENT_PREFIX}%`)
  );

function setCondition(kind: string, documentId: string, versionId: string) {
  return and(
    eq(documentRefs.document_type, kind),
    eq(documentRefs.document_id, documentId),
    eq(documentRefs.version_id, versionId)
  );
}

export const DocumentRefs = {
  currentKey,
  isCurrentKey,

  /** The set rows of a document, current and versions. */
  async listSets(
    kind: string,
    documentId: string
  ): Promise<DocumentRefSetRow[]> {
    const rows = await getPortableDb()
      .select({
        version_id: documentRefSets.version_id,
        content_hash: documentRefSets.content_hash
      })
      .from(documentRefSets)
      .where(
        and(
          eq(documentRefSets.document_type, kind),
          eq(documentRefSets.document_id, documentId)
        )
      );
    return rows.map((r) => ({
      versionId: r.version_id,
      contentHash: r.content_hash
    }));
  },

  /**
   * Replace the set of one revision. The set row is removed first and
   * written last, so a reader that runs in between sees no set and computes
   * it, and never reads a half-written set as current.
   */
  async writeSet(
    kind: string,
    documentId: string,
    versionId: string,
    contentHash: string,
    files: DocumentRefSetFiles,
    now: Date = new Date()
  ): Promise<void> {
    const db = getPortableDb();
    await db
      .delete(documentRefSets)
      .where(
        and(
          eq(documentRefSets.document_type, kind),
          eq(documentRefSets.document_id, documentId),
          eq(documentRefSets.version_id, versionId)
        )
      );
    await db
      .delete(documentRefs)
      .where(setCondition(kind, documentId, versionId));
    const rows: (typeof documentRefs.$inferInsert)[] = [];
    for (const [scope, ids] of Object.entries(files)) {
      for (const file of new Set(ids)) {
        rows.push({
          id: createTimeOrderedUuid(),
          document_type: kind,
          document_id: documentId,
          scope,
          version_id: versionId,
          file
        });
      }
    }
    for (let start = 0; start < rows.length; start += IN_LIST_CHUNK) {
      await db
        .insert(documentRefs)
        .values(rows.slice(start, start + IN_LIST_CHUNK))
        .onConflictDoNothing();
    }
    await db
      .insert(documentRefSets)
      .values({
        id: createTimeOrderedUuid(),
        document_type: kind,
        document_id: documentId,
        version_id: versionId,
        content_hash: contentHash,
        written_at: now.toISOString()
      })
      .onConflictDoNothing();
  },

  /** Whether the set of one revision has been written. */
  async hasSet(kind: string, documentId: string, versionId: string): Promise<boolean> {
    const [row] = await getPortableDb()
      .select({ id: documentRefSets.id })
      .from(documentRefSets)
      .where(
        and(
          eq(documentRefSets.document_type, kind),
          eq(documentRefSets.document_id, documentId),
          eq(documentRefSets.version_id, versionId)
        )
      )
      .limit(1);
    return row !== undefined;
  },

  /** The files of one revision's set of `scope`. */
  async filesOf(
    kind: string,
    documentId: string,
    scope: DocumentRefScopeValue,
    versionId: string
  ): Promise<string[]> {
    const rows = await getPortableDb()
      .select({ file: documentRefs.file })
      .from(documentRefs)
      .where(
        and(
          setCondition(kind, documentId, versionId),
          eq(documentRefs.scope, scope)
        )
      );
    return rows.map((r) => r.file).sort();
  },

  /**
   * Whether `file` is in a set of a document that the reader may read: the
   * current set named by `current`, in the current scopes among `scopes`,
   * or any saved version's set, in the version scopes among `scopes`. A
   * current set of other content is never consulted.
   */
  async contains(
    kind: string,
    documentId: string,
    file: string,
    scopes: readonly DocumentRefScopeValue[],
    current: string
  ): Promise<boolean> {
    const currentScopes = scopes.filter((s) => s === "viewer" || s === "editor");
    const versionScopes = scopes.filter(
      (s) => s === "version_viewer" || s === "version_editor"
    );
    const branches = [];
    if (currentScopes.length > 0) {
      branches.push(
        and(
          eq(documentRefs.version_id, current),
          inArray(documentRefs.scope, currentScopes)
        )
      );
    }
    if (versionScopes.length > 0) {
      branches.push(
        and(versionRowsOnly(), inArray(documentRefs.scope, versionScopes))
      );
    }
    if (branches.length === 0) return false;
    const [row] = await getPortableDb()
      .select({ id: documentRefs.id })
      .from(documentRefs)
      .where(
        and(
          eq(documentRefs.document_type, kind),
          eq(documentRefs.document_id, documentId),
          eq(documentRefs.file, file),
          or(...branches)
        )
      )
      .limit(1);
    return row !== undefined;
  },

  /** Whether any stored set of a document, current or saved, names `file`. */
  async namesFile(kind: string, documentId: string, file: string): Promise<boolean> {
    const [row] = await getPortableDb()
      .select({ id: documentRefs.id })
      .from(documentRefs)
      .where(
        and(
          eq(documentRefs.document_type, kind),
          eq(documentRefs.document_id, documentId),
          eq(documentRefs.file, file)
        )
      )
      .limit(1);
    return row !== undefined;
  },

  /**
   * Remove every current set of a document except `keep`. A save calls it
   * after it publishes the set of the content it stored.
   */
  async removeOtherCurrentSets(
    kind: string,
    documentId: string,
    keep: string
  ): Promise<void> {
    const db = getPortableDb();
    const stale = (
      await db
        .select({ version_id: documentRefSets.version_id })
        .from(documentRefSets)
        .where(
          and(
            eq(documentRefSets.document_type, kind),
            eq(documentRefSets.document_id, documentId),
            or(
              eq(documentRefSets.version_id, LEGACY_CURRENT),
              like(documentRefSets.version_id, `${CURRENT_PREFIX}%`)
            )
          )
        )
    )
      .map((r) => r.version_id)
      .filter((v) => v !== keep);
    for (const versionId of stale) {
      await DocumentRefs.removeSet(kind, documentId, versionId);
    }
  },

  /** Remove the set of one revision, such as a version that was pruned. */
  async removeSet(
    kind: string,
    documentId: string,
    versionId: string
  ): Promise<void> {
    const db = getPortableDb();
    await db
      .delete(documentRefSets)
      .where(
        and(
          eq(documentRefSets.document_type, kind),
          eq(documentRefSets.document_id, documentId),
          eq(documentRefSets.version_id, versionId)
        )
      );
    await db
      .delete(documentRefs)
      .where(setCondition(kind, documentId, versionId));
  },

  /** Ids of the documents of `kind` that have a stored set naming `file`. */
  async documentsWithFile(kind: string, file: string): Promise<string[]> {
    const rows = await getPortableDb()
      .selectDistinct({ document_id: documentRefs.document_id })
      .from(documentRefs)
      .where(
        and(eq(documentRefs.document_type, kind), eq(documentRefs.file, file))
      );
    return rows.map((r) => r.document_id);
  },

  /** Files of other people the attach rule admitted into the document. */
  async admitted(kind: string, documentId: string): Promise<Set<string>> {
    const rows = await getPortableDb()
      .select({ file: documentAdmittedFiles.file })
      .from(documentAdmittedFiles)
      .where(
        and(
          eq(documentAdmittedFiles.document_type, kind),
          eq(documentAdmittedFiles.document_id, documentId)
        )
      );
    return new Set(rows.map((r) => r.file));
  },

  async admit(
    kind: string,
    documentId: string,
    files: Iterable<string>,
    now: Date = new Date()
  ): Promise<void> {
    const rows = [...new Set(files)].map((file) => ({
      id: createTimeOrderedUuid(),
      document_type: kind,
      document_id: documentId,
      file,
      admitted_at: now.toISOString()
    }));
    for (let start = 0; start < rows.length; start += IN_LIST_CHUNK) {
      await getPortableDb()
        .insert(documentAdmittedFiles)
        .values(rows.slice(start, start + IN_LIST_CHUNK))
        .onConflictDoNothing();
    }
  },

  /** Delete every set and admission of a document. Call when it is deleted. */
  async removeForDocument(kind: string, documentId: string): Promise<void> {
    const db = getPortableDb();
    await db
      .delete(documentRefSets)
      .where(
        and(
          eq(documentRefSets.document_type, kind),
          eq(documentRefSets.document_id, documentId)
        )
      );
    await db
      .delete(documentRefs)
      .where(
        and(
          eq(documentRefs.document_type, kind),
          eq(documentRefs.document_id, documentId)
        )
      );
    await db
      .delete(documentAdmittedFiles)
      .where(
        and(
          eq(documentAdmittedFiles.document_type, kind),
          eq(documentAdmittedFiles.document_id, documentId)
        )
      );
  }
};
