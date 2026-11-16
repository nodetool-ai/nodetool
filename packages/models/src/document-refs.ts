/**
 * Stored reference sets and the files admitted into documents. See
 * schema/document-refs.ts and `refsOf` in @nodetool-ai/protocol.
 *
 * A set is written for one revision of one document: the current revision
 * (`version_id` empty) or a saved version. The set row records the hash of the
 * content it was computed from, so a reader can tell a set that a later write
 * made stale and compute it again.
 */

import { and, eq, inArray } from "drizzle-orm";
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

const CURRENT = "";
const IN_LIST_CHUNK = 500;

function setCondition(kind: string, documentId: string, versionId: string) {
  return and(
    eq(documentRefs.document_type, kind),
    eq(documentRefs.document_id, documentId),
    eq(documentRefs.version_id, versionId)
  );
}

export const DocumentRefs = {
  CURRENT,

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

  /** The files of the current revision's set of `scope`. */
  async filesOf(
    kind: string,
    documentId: string,
    scope: DocumentRefScopeValue,
    versionId: string = CURRENT
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
   * Whether `file` is in any of the given sets of a document. `scopes` lists
   * the scopes the reader may read.
   */
  async contains(
    kind: string,
    documentId: string,
    file: string,
    scopes: readonly DocumentRefScopeValue[]
  ): Promise<boolean> {
    if (scopes.length === 0) return false;
    const [row] = await getPortableDb()
      .select({ id: documentRefs.id })
      .from(documentRefs)
      .where(
        and(
          eq(documentRefs.document_type, kind),
          eq(documentRefs.document_id, documentId),
          eq(documentRefs.file, file),
          inArray(documentRefs.scope, [...scopes])
        )
      )
      .limit(1);
    return row !== undefined;
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
