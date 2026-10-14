/**
 * Raw row access for a whole project, used by the project file export and
 * import in `@nodetool-ai/websocket`.
 *
 * A project owns no content of its own: its content is every row that carries
 * its `project_id`, plus the child rows that hang off those (versions,
 * messages, game history). {@link PROJECT_ARCHIVE_TABLES} names all of them
 * once, so the reader and the writer cannot disagree about what a project is.
 * Rows travel whole, every column included, so a column added later is
 * exported without touching this file.
 */
import { and, eq, getTableColumns, inArray } from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import { getDbType, getPortableDb, type DbTransaction } from "./db.js";
import { applications, applicationVersions } from "./schema/applications.js";
import { assets } from "./schema/assets.js";
import { gameDraftChanges } from "./schema/game-draft-changes.js";
import { gameRevisionMessages } from "./schema/game-revision-messages.js";
import { games } from "./schema/games.js";
import { imageDocumentVersions } from "./schema/image-document-versions.js";
import { imageDocuments } from "./schema/image-documents.js";
import { jsScriptVersions } from "./schema/js-script-versions.js";
import { jsScripts } from "./schema/js-scripts.js";
import { messages } from "./schema/messages.js";
import { projects } from "./schema/projects.js";
import { scripts } from "./schema/scripts.js";
import { storyboards } from "./schema/storyboards.js";
import { threads } from "./schema/threads.js";
import { timelineSequenceVersions } from "./schema/timeline-sequence-versions.js";
import { timelineSequences } from "./schema/timeline-sequences.js";
import { workflowVersions } from "./schema/workflow-versions.js";
import { workflows } from "./schema/workflows.js";
import { workspaces } from "./schema/workspaces.js";

/** One exported row: column name → value, as Drizzle reads it. */
export type ProjectArchiveRow = Record<string, unknown>;

interface ProjectTable {
  readonly table: SQLiteTable;
  /** Set for a child table: the parent table and the column naming its row. */
  readonly parent?: { readonly name: string; readonly column: string };
}

/**
 * Every table a project file carries, parents before children. The order is
 * also the insert order, so a child's foreign key always finds its parent.
 */
export const PROJECT_ARCHIVE_TABLES = {
  workspaces: { table: workspaces },
  assets: { table: assets },
  workflows: { table: workflows },
  workflow_versions: {
    table: workflowVersions,
    parent: { name: "workflows", column: "workflow_id" }
  },
  storyboards: { table: storyboards },
  scripts: { table: scripts },
  timeline_sequences: { table: timelineSequences },
  timeline_sequence_versions: {
    table: timelineSequenceVersions,
    parent: { name: "timeline_sequences", column: "timeline_id" }
  },
  image_documents: { table: imageDocuments },
  image_document_versions: {
    table: imageDocumentVersions,
    parent: { name: "image_documents", column: "image_document_id" }
  },
  applications: { table: applications },
  application_versions: {
    table: applicationVersions,
    parent: { name: "applications", column: "application_id" }
  },
  js_scripts: { table: jsScripts },
  js_script_versions: {
    table: jsScriptVersions,
    parent: { name: "js_scripts", column: "js_script_id" }
  },
  threads: { table: threads },
  messages: { table: messages, parent: { name: "threads", column: "thread_id" } },
  games: { table: games },
  game_draft_changes: {
    table: gameDraftChanges,
    parent: { name: "games", column: "game_id" }
  },
  game_revision_messages: {
    table: gameRevisionMessages,
    parent: { name: "games", column: "game_id" }
  }
} as const satisfies Record<string, ProjectTable>;

export type ProjectArchiveTableName = keyof typeof PROJECT_ARCHIVE_TABLES;

export const PROJECT_ARCHIVE_TABLE_NAMES = Object.keys(
  PROJECT_ARCHIVE_TABLES
) as ProjectArchiveTableName[];

export type ProjectArchiveRecords = Record<
  ProjectArchiveTableName,
  ProjectArchiveRow[]
>;

/** Batch size for `IN (...)` lists, under SQLite's bound-parameter limit. */
const IN_BATCH = 900;

function column(table: SQLiteTable, name: string): SQLiteColumn {
  const found = getTableColumns(table)[name];
  if (!found) throw new Error(`Table has no column ${name}`);
  return found;
}

/** The column names of one archive table. */
export function projectArchiveColumns(name: ProjectArchiveTableName): string[] {
  return Object.keys(getTableColumns(PROJECT_ARCHIVE_TABLES[name].table));
}

/** The primary-key column of one archive table. */
export function projectArchivePrimaryKey(name: ProjectArchiveTableName): string {
  const entry = Object.entries(
    getTableColumns(PROJECT_ARCHIVE_TABLES[name].table)
  ).find(([, col]) => col.primary);
  if (!entry) throw new Error(`Table ${name} has no primary key`);
  return entry[0];
}

/**
 * Read every row of a project. The caller has checked that `userId` owns
 * `projectId`. Top-level rows are matched on owner and project, child rows
 * on their parent's id, so a child row never reaches past its parent.
 */
export async function readProjectArchiveRecords(
  userId: string,
  projectId: string
): Promise<ProjectArchiveRecords> {
  const db = getPortableDb();
  const records = {} as ProjectArchiveRecords;
  for (const name of PROJECT_ARCHIVE_TABLE_NAMES) {
    const spec: ProjectTable = PROJECT_ARCHIVE_TABLES[name];
    if (!spec.parent) {
      records[name] = (await db
        .select()
        .from(spec.table)
        .where(
          and(
            eq(column(spec.table, "user_id"), userId),
            eq(column(spec.table, "project_id"), projectId)
          )
        )) as ProjectArchiveRow[];
      continue;
    }
    const parentName = spec.parent.name as ProjectArchiveTableName;
    const parentKey = projectArchivePrimaryKey(parentName);
    const parentIds = records[parentName].map((row) =>
      String(row[parentKey])
    );
    const rows: ProjectArchiveRow[] = [];
    for (let i = 0; i < parentIds.length; i += IN_BATCH) {
      rows.push(
        ...((await db
          .select()
          .from(spec.table)
          .where(
            inArray(
              column(spec.table, spec.parent.column),
              parentIds.slice(i, i + IN_BATCH)
            )
          )) as ProjectArchiveRow[])
      );
    }
    records[name] = rows;
  }
  return records;
}

/** Keep only the columns the table has, so an older or newer file inserts. */
function knownColumns(
  name: ProjectArchiveTableName,
  row: ProjectArchiveRow
): ProjectArchiveRow {
  const columns = getTableColumns(PROJECT_ARCHIVE_TABLES[name].table);
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => key in columns)
  );
}

/**
 * Insert a new project and all of its rows in one transaction, so a failed
 * import leaves nothing behind. Every id must already be fresh: nothing here
 * overwrites an existing row.
 */
export async function persistProjectArchive(args: {
  readonly project: typeof projects.$inferInsert;
  readonly records: Partial<ProjectArchiveRecords>;
}): Promise<void> {
  const db = getPortableDb();
  const statements = (tx: DbTransaction) => {
    const out: Array<{ run: () => void }> = [
      tx.insert(projects).values(args.project)
    ];
    for (const name of PROJECT_ARCHIVE_TABLE_NAMES) {
      // Rows are dynamic here; `knownColumns` keeps them to the table's columns.
      const table: SQLiteTable = PROJECT_ARCHIVE_TABLES[name].table;
      for (const row of args.records[name] ?? []) {
        out.push(
          tx.insert(table).values(knownColumns(name, row) as never)
        );
      }
    }
    return out;
  };
  if (getDbType() === "sqlite") {
    db.transaction((tx: DbTransaction): void => {
      for (const statement of statements(tx)) statement.run();
    });
    return;
  }
  await db.transaction(async (tx: DbTransaction): Promise<void> => {
    for (const statement of statements(tx)) await statement;
  });
}
