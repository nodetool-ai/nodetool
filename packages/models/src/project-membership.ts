/**
 * Moving a document between projects.
 *
 * Membership is one column on the document's own table, so a move is one
 * write per document — there is no join table to keep in step. The write
 * deliberately leaves `updated_at` alone: a project is not content, and
 * bumping the column would break the compare-and-swap save of an editor that
 * has the document open.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "./db.js";
import { applications } from "./schema/applications.js";
import { imageDocuments } from "./schema/image-documents.js";
import { jsScripts } from "./schema/js-scripts.js";
import { scripts } from "./schema/scripts.js";
import { storyboards } from "./schema/storyboards.js";
import { timelineSequences } from "./schema/timeline-sequences.js";
import type { ProjectDocumentType } from "./project-summary.js";

/**
 * Every table that carries `project_id`. The list is the one
 * {@link moveDocumentToProject} switches over and the one the project overview
 * reads; a new document kind has to arrive in both.
 */
const DOCUMENT_TABLES = [
  storyboards,
  scripts,
  timelineSequences,
  imageDocuments,
  applications,
  jsScripts
] as const;

/**
 * Point every document of one project at another — the bulk form of
 * {@link moveDocumentToProject}, used when a project goes away and its
 * documents must land back in the loose bucket rather than keep naming an id
 * that resolves to nothing. Scoped to the owner, and `updated_at` is left alone
 * for the same reason a single move leaves it alone.
 *
 * Returns how many rows moved.
 */
export async function reassignProjectDocuments(
  userId: string,
  fromProjectId: string,
  toProjectId: string
): Promise<number> {
  const db = getDb();
  let moved = 0;
  for (const table of DOCUMENT_TABLES) {
    // Only the id comes back: a moved document would otherwise ship its whole
    // stored text column across just to be counted.
    const rows = await db
      .update(table)
      .set({ project_id: toProjectId })
      .where(and(eq(table.project_id, fromProjectId), eq(table.user_id, userId)))
      .returning({ id: table.id });
    moved += rows.length;
  }
  return moved;
}

/**
 * Point one document at `projectId`. Pass {@link LOOSE_PROJECT_ID} to move it
 * back out of every project. Returns false when the caller owns no such
 * document, so a wrong id reads as a miss rather than as a silent no-op.
 */
export async function moveDocumentToProject(
  userId: string,
  type: ProjectDocumentType,
  documentId: string,
  projectId: string
): Promise<boolean> {
  const db = getDb();
  const fields = { project_id: projectId };
  switch (type) {
    case "storyboard": {
      const rows = await db
        .update(storyboards)
        .set(fields)
        .where(
          and(eq(storyboards.id, documentId), eq(storyboards.user_id, userId))
        )
        .returning({ id: storyboards.id });
      return rows.length > 0;
    }
    case "script": {
      const rows = await db
        .update(scripts)
        .set(fields)
        .where(and(eq(scripts.id, documentId), eq(scripts.user_id, userId)))
        .returning({ id: scripts.id });
      return rows.length > 0;
    }
    case "timeline": {
      const rows = await db
        .update(timelineSequences)
        .set(fields)
        .where(
          and(
            eq(timelineSequences.id, documentId),
            eq(timelineSequences.user_id, userId)
          )
        )
        .returning({ id: timelineSequences.id });
      return rows.length > 0;
    }
    case "sketch": {
      const rows = await db
        .update(imageDocuments)
        .set(fields)
        .where(
          and(
            eq(imageDocuments.id, documentId),
            eq(imageDocuments.user_id, userId)
          )
        )
        .returning({ id: imageDocuments.id });
      return rows.length > 0;
    }
    case "application": {
      const rows = await db
        .update(applications)
        .set(fields)
        .where(
          and(eq(applications.id, documentId), eq(applications.user_id, userId))
        )
        .returning({ id: applications.id });
      return rows.length > 0;
    }
    case "jsscript": {
      const rows = await db
        .update(jsScripts)
        .set(fields)
        .where(and(eq(jsScripts.id, documentId), eq(jsScripts.user_id, userId)))
        .returning({ id: jsScripts.id });
      return rows.length > 0;
    }
    default: {
      const exhaustive: never = type;
      return exhaustive;
    }
  }
}
