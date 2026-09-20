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
 *
 * Eight reads also mean eight ways to fail. They are gathered so that a kind
 * whose read errors costs the navigator that kind, not the panel: the index
 * says it is partial and names the failure in the log, rather than answering
 * the whole request with a database error. Only a request where every kind
 * failed throws, because then there is no index to show.
 */

import { and, desc, eq, isNull, like, or, type SQL } from "drizzle-orm";
import { createLogger } from "@nodetool-ai/config";
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

const log = createLogger("nodetool.models.document-index");

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

/** What one kind's read produced. */
interface KindRead {
  entries: DocumentIndexEntry[];
  /**
   * Rows the read consumed from its cap. Not `entries.length`: an entity row
   * the marker read rejected took its place in the cap all the same.
   */
  rowCount: number;
}

/** One kind of document, and the read that lists it. */
interface Kind {
  type: DocumentIndexType;
  read: () => Promise<KindRead>;
}

/**
 * An error's message followed by its causes.
 *
 * A database error arrives wrapped: Drizzle's `DrizzleQueryError` says only
 * `Failed query: <sql> params: <params>`, and the reason the database gave —
 * the relation that does not exist, the statement that timed out — hangs off
 * `cause`. Logging the outer message alone is how the navigator came to quote
 * SQL at somebody with no way to tell what was wrong with it.
 */
function describeError(error: unknown): string {
  const messages: string[] = [];
  let current: unknown = error;
  // Bounded rather than exhaustive: a `cause` chain can be cyclic.
  for (let depth = 0; depth < 8 && current instanceof Error; depth += 1) {
    if (current.message) messages.push(current.message);
    current = current.cause;
  }
  return messages.length > 0 ? messages.join(": ") : String(error);
}

/** The kinds the index gathers, each with the read that lists it. */
function documentKinds(userId: string, projectId: string, cap: number): Kind[] {
  const named = (
    type: DocumentIndexType,
    table: DocumentTable,
    extra?: SQL<unknown>
  ): Kind => ({
    type,
    read: async () => {
      const rows = await listNamed(table, userId, projectId, cap, extra);
      return { entries: toEntries(type, rows), rowCount: rows.length };
    }
  });
  return [
    named("workflow", workflows, listedRunModes()),
    named("application", applications),
    named("sketch", imageDocuments),
    named("script", scripts),
    named("storyboard", storyboards),
    named("timeline", timelineSequences),
    named("jsscript", jsScripts),
    { type: "entity", read: () => listEntities(userId, projectId, cap) }
  ];
}

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
  const kinds = documentKinds(userId, projectId, cap);
  const results = await Promise.allSettled(kinds.map((kind) => kind.read()));

  const documents: DocumentIndexEntry[] = [];
  const failures: Array<{ type: DocumentIndexType; error: unknown }> = [];
  let partial = false;

  results.forEach((result, index) => {
    const { type } = kinds[index]!;
    if (result.status === "rejected") {
      // A kind the database could not answer for is a kind missing from the
      // index, which is what `partial` says.
      failures.push({ type, error: result.reason });
      partial = true;
      return;
    }
    if (result.value.rowCount > documentsPerType) {
      partial = true;
    }
    documents.push(...result.value.entries.slice(0, documentsPerType));
  });

  if (failures.length === kinds.length) {
    // Nothing was read, so there is no partial index to draw. The reason the
    // database gave travels with the error rather than only the failed SQL.
    const first = failures[0]!;
    throw new Error(
      `The document index could not be read: ${describeError(first.error)}`,
      { cause: first.error }
    );
  }
  for (const failure of failures) {
    log.error(`Document index: the ${failure.type} read failed`, {
      userId,
      projectId,
      error: describeError(failure.error)
    });
  }

  documents.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { documents, partial };
}
