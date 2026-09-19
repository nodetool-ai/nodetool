/**
 * Every document a project holds, as a navigator needs them.
 *
 * The left rail lists eight kinds of document and shows a name and an icon for
 * each. It used to build that list from eight list endpoints, and every one of
 * them answered with whole rows: `SELECT *` over tables whose bulk is a JSON
 * document column — a board's every shot and take, a sketch's every layer, a
 * workflow's whole graph. Printing a name cost megabytes per kind, eight round
 * trips deep, and the panel showed a spinner until the slowest of them landed.
 * Over a cloud database that is the difference between a panel and a wait.
 *
 * So the index asks for the three columns a row in the panel actually draws,
 * across every table at once. Entities are the exception that proves the rule:
 * they are image assets carrying a marker under `metadata.nodetool_entity`, so
 * the client used to read a thousand asset rows to find the handful that are
 * entities. The marker is a substring of the stored JSON, so the database
 * filters on it and only entities cross the wire.
 */

import { and, desc, eq, isNull, like, or, type SQL } from "drizzle-orm";
import type { Entity } from "@nodetool-ai/protocol";

import { getDb } from "./db.js";
import { entityFromAsset } from "./entity.js";
import { applications } from "./schema/applications.js";
import { assets } from "./schema/assets.js";
import { imageDocuments } from "./schema/image-documents.js";
import { jsScripts } from "./schema/js-scripts.js";
import { scripts } from "./schema/scripts.js";
import { storyboards } from "./schema/storyboards.js";
import { timelineSequences } from "./schema/timeline-sequences.js";
import { workflows } from "./schema/workflows.js";

/**
 * The kinds the navigator opens, spelled as the workspace tab type where one
 * exists. `entity` has no tab — it opens an editor in place.
 */
export type DocumentIndexType =
  | "workflow"
  | "application"
  | "sketch"
  | "script"
  | "storyboard"
  | "timeline"
  | "jsscript"
  | "entity";

/** One row of the navigator. */
export interface DocumentIndexEntry {
  id: string;
  type: DocumentIndexType;
  name: string;
  updatedAt: string;
  /**
   * Set only on `entity` rows. An entity is edited in place rather than opened
   * as a tab, and it is small enough to carry here, so the editor opens without
   * a second read.
   */
  entity?: Entity;
}

export interface DocumentIndex {
  documents: DocumentIndexEntry[];
  /** True when a kind filled its cap, so documents are missing from this index. */
  partial: boolean;
}

/**
 * Rows read per kind. The navigator is a list to scroll and search, not a
 * paginated surface, so the cap is high enough that hitting it is unusual — and
 * when it is hit, the index says so instead of looking complete.
 */
const DOCUMENT_INDEX_PER_TYPE = 500;

/** The marker key, as it appears in the stored metadata JSON. */
const ENTITY_MARKER_KEY = "nodetool_entity";

/**
 * The document tables. They differ in everything but the five columns this
 * reads, which is why one query shape serves all of them.
 */
type DocumentTable =
  | typeof workflows
  | typeof applications
  | typeof imageDocuments
  | typeof scripts
  | typeof storyboards
  | typeof timelineSequences
  | typeof jsScripts;

interface NamedRow {
  id: string;
  name: string;
  updated_at: string;
}

/**
 * A workflow listing shows standalone workflows plus the legacy layer/clip
 * rows, matching `Workflow.paginate`'s default. Selecting every run mode would
 * put rows in the navigator that no other surface shows.
 */
function listedRunModes(): SQL<unknown> {
  const condition = or(
    eq(workflows.run_mode, "workflow"),
    eq(workflows.run_mode, "layer"),
    eq(workflows.run_mode, "clip"),
    isNull(workflows.run_mode)
  );
  if (!condition) {
    throw new Error("Expected SQL condition");
  }
  return condition;
}

/** The named rows of one table, newest first, one over the cap. */
async function listNamed(
  table: DocumentTable,
  userId: string,
  projectId: string,
  limit: number,
  extra?: SQL<unknown>
): Promise<NamedRow[]> {
  const db = getDb();
  return db
    .select({
      id: table.id,
      name: table.name,
      updated_at: table.updated_at
    })
    .from(table)
    .where(
      and(
        eq(table.user_id, userId),
        eq(table.project_id, projectId),
        ...(extra ? [extra] : [])
      )
    )
    .orderBy(desc(table.updated_at))
    .limit(limit);
}

/**
 * The project's entities. Only the project's own assets are read — the
 * `(user_id, project_id)` index — and the marker lives inside the metadata
 * JSON, stored as text in both dialects, so the predicate is a substring match
 * rather than a per-dialect JSON path. A row whose metadata merely mentions the
 * key without carrying a valid marker reads as `null` and is dropped here.
 */
async function listEntities(
  userId: string,
  projectId: string,
  limit: number
): Promise<{ entries: DocumentIndexEntry[]; rowCount: number }> {
  const db = getDb();
  const rows = await db
    .select({
      id: assets.id,
      name: assets.name,
      content_type: assets.content_type,
      metadata: assets.metadata,
      project_id: assets.project_id,
      created_at: assets.created_at,
      updated_at: assets.updated_at
    })
    .from(assets)
    .where(
      and(
        eq(assets.user_id, userId),
        eq(assets.project_id, projectId),
        like(assets.metadata, `%${ENTITY_MARKER_KEY}%`)
      )
    )
    .orderBy(desc(assets.updated_at))
    .limit(limit);

  const entries: DocumentIndexEntry[] = [];
  for (const row of rows) {
    const entity = entityFromAsset(row);
    if (!entity) continue;
    entries.push({
      id: row.id,
      type: "entity",
      name: entity.name,
      updatedAt: row.updated_at,
      entity
    });
  }
  // The row count, not the entry count, decides overflow: rows the marker read
  // rejected still consumed the cap.
  return { entries, rowCount: rows.length };
}

const toEntries = (
  type: DocumentIndexType,
  rows: NamedRow[]
): DocumentIndexEntry[] =>
  rows.map((row) => ({
    id: row.id,
    type,
    name: row.name,
    updatedAt: row.updated_at
  }));

/**
 * Every document in a project, newest first, read in one pass per kind.
 *
 * @param documentsPerType - rows kept per kind. Injectable so a test can drive
 * the overflow branch without writing 501 documents.
 */
export async function listDocumentIndex(
  userId: string,
  projectId: string,
  documentsPerType = DOCUMENT_INDEX_PER_TYPE
): Promise<DocumentIndex> {
  // One row over the cap, so a kind that ran out of room says so rather than
  // looking complete.
  const cap = documentsPerType + 1;
  const [
    workflowRows,
    applicationRows,
    sketchRows,
    scriptRows,
    storyboardRows,
    timelineRows,
    jsScriptRows,
    entities
  ] = await Promise.all([
    listNamed(workflows, userId, projectId, cap, listedRunModes()),
    listNamed(applications, userId, projectId, cap),
    listNamed(imageDocuments, userId, projectId, cap),
    listNamed(scripts, userId, projectId, cap),
    listNamed(storyboards, userId, projectId, cap),
    listNamed(timelineSequences, userId, projectId, cap),
    listNamed(jsScripts, userId, projectId, cap),
    listEntities(userId, projectId, cap)
  ]);

  const kinds: DocumentIndexEntry[][] = [
    toEntries("workflow", workflowRows),
    toEntries("application", applicationRows),
    toEntries("sketch", sketchRows),
    toEntries("script", scriptRows),
    toEntries("storyboard", storyboardRows),
    toEntries("timeline", timelineRows),
    toEntries("jsscript", jsScriptRows),
    entities.entries
  ];
  const partial =
    entities.rowCount > documentsPerType ||
    kinds.some((rows) => rows.length > documentsPerType);
  const documents = kinds
    .flatMap((rows) => rows.slice(0, documentsPerType))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { documents, partial };
}
