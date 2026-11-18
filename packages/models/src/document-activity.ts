/**
 * The activity record of documents
 * (docs/plans/native-cloud-sync/technical-design.md, `document_activity`).
 * Phase 2 writes a row for each rename (V6) and move (V8) a transfer
 * applies. The caller holds the document's access epoch, so the next `seq`
 * of a document is read and written without a race.
 */
import { and, asc, eq, max } from "drizzle-orm";
import { createTimeOrderedUuid } from "./base-model.js";
import { getPortableDb } from "./db.js";
import { documentActivity } from "./schema/document-activity.js";

export type DocumentActivityType = "rename" | "move";

export interface DocumentActivityEntry {
  id: string;
  seq: number;
  type: string;
  user_id: string;
  payload: Record<string, unknown>;
  created_at: string;
}

/** Appends one row to the activity record of a document. */
export async function appendDocumentActivity(
  entry: {
    kind: string;
    documentId: string;
    type: DocumentActivityType;
    userId: string;
    payload: Record<string, unknown>;
  },
  now: Date = new Date()
): Promise<void> {
  const db = getPortableDb();
  const [last] = await db
    .select({ seq: max(documentActivity.seq) })
    .from(documentActivity)
    .where(and(eq(documentActivity.document_kind, entry.kind), eq(documentActivity.document_id, entry.documentId)));
  await db.insert(documentActivity).values({
    id: createTimeOrderedUuid(),
    document_kind: entry.kind,
    document_id: entry.documentId,
    seq: (last?.seq ?? 0) + 1,
    type: entry.type,
    user_id: entry.userId,
    payload: JSON.stringify(entry.payload),
    created_at: now.toISOString()
  });
}

/** The activity record of a document, oldest first. */
export async function listDocumentActivity(kind: string, documentId: string): Promise<DocumentActivityEntry[]> {
  const rows = await getPortableDb()
    .select()
    .from(documentActivity)
    .where(and(eq(documentActivity.document_kind, kind), eq(documentActivity.document_id, documentId)))
    .orderBy(asc(documentActivity.seq));
  return rows.map((row) => ({
    id: row.id,
    seq: row.seq,
    type: row.type,
    user_id: row.user_id,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    created_at: row.created_at
  }));
}
