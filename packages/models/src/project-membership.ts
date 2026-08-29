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
        .returning();
      return rows.length > 0;
    }
    case "script": {
      const rows = await db
        .update(scripts)
        .set(fields)
        .where(and(eq(scripts.id, documentId), eq(scripts.user_id, userId)))
        .returning();
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
        .returning();
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
        .returning();
      return rows.length > 0;
    }
    case "application": {
      const rows = await db
        .update(applications)
        .set(fields)
        .where(
          and(eq(applications.id, documentId), eq(applications.user_id, userId))
        )
        .returning();
      return rows.length > 0;
    }
    case "jsscript": {
      const rows = await db
        .update(jsScripts)
        .set(fields)
        .where(and(eq(jsScripts.id, documentId), eq(jsScripts.user_id, userId)))
        .returning();
      return rows.length > 0;
    }
    default: {
      const exhaustive: never = type;
      return exhaustive;
    }
  }
}
