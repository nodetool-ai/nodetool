/**
 * Project model — the unit of the workspace.
 *
 * Every document table already carries `project_id`; a project row is what
 * that column points at. A project owns nothing on its own: its documents,
 * status and spend are derived by reading the rows that name it
 * (`project-summary.ts`).
 *
 * `"default"` stays the loose-documents bucket. It has no row here, and
 * nothing migrates into one.
 */

import { and, desc, eq, isNull } from "drizzle-orm";
import {
  DBModel,
  ModelChangeEvent,
  ModelObserver,
  createTimeOrderedUuid
} from "./base-model.js";
import { executeRaw, getDb } from "./db.js";
import { projects } from "./schema/projects.js";
import { reassignProjectDocuments } from "./project-membership.js";
import { Thread } from "./thread.js";

/** The bucket documents land in when no project is active. */
export const LOOSE_PROJECT_ID = "default";
export const PERSONAL_PROJECT_KIND = "personal";
export const PERSONAL_PROJECT_NAME = "Personal";

export interface PersonalMigrationReport {
  project: Project;
  migrated: number;
  dangling: number;
}

export interface ProjectResponse {
  id: string;
  name: string;
  /** Free text — "spot", "trailer", "report". Not an enum on purpose. */
  kind: string;
  isPersonal: boolean;
  /** The conversation that builds it, or null while nobody has asked for one. */
  threadId: string | null;
  createdAt: string;
  updatedAt: string;
}

export class Project extends DBModel {
  static override table = projects;

  declare id: string;
  declare user_id: string;
  declare name: string;
  declare kind: string;
  declare thread_id: string | null;
  declare created_at: string;
  declare updated_at: string;

  constructor(data: Record<string, unknown>) {
    super(data);
    const now = new Date().toISOString();
    this.id ??= createTimeOrderedUuid();
    this.name ??= "Untitled project";
    this.kind ??= "";
    this.thread_id ??= null;
    this.created_at ??= now;
    this.updated_at ??= now;
  }

  override beforeSave(): void {
    this.updated_at = new Date().toISOString();
  }

  toResponse(): ProjectResponse {
    return {
      id: this.id,
      name: this.name,
      kind: this.kind,
      isPersonal: this.kind === PERSONAL_PROJECT_KIND,
      threadId: this.thread_id,
      createdAt: this.created_at,
      updatedAt: this.updated_at
    };
  }

  static async findById(id: string): Promise<Project | null> {
    return Project.get<Project>(id);
  }

  static async ensurePersonal(userId: string): Promise<Project> {
    const db = getDb();
    const existing = await db
      .select()
      .from(projects)
      .where(
        and(eq(projects.user_id, userId), eq(projects.kind, PERSONAL_PROJECT_KIND))
      )
      .orderBy(projects.created_at)
      .limit(1);
    if (existing[0]) return new Project(existing[0]);

    const created = await Project.insertNew({
      id: `personal:${userId}`,
      user_id: userId,
      name: PERSONAL_PROJECT_NAME,
      kind: PERSONAL_PROJECT_KIND
    });
    if (created) return created;

    const resolved = await db
      .select()
      .from(projects)
      .where(
        and(eq(projects.user_id, userId), eq(projects.kind, PERSONAL_PROJECT_KIND))
      )
      .orderBy(projects.created_at)
      .limit(1);
    if (!resolved[0]) throw new Error("Unable to resolve Personal project");
    return new Project(resolved[0]);
  }

  /** Claim only loose legacy rows. Explicit project ids are never rewritten. */
  static async migrateToPersonal(userId: string): Promise<PersonalMigrationReport> {
    const personal = await Project.ensurePersonal(userId);
    const owner = userId.replace(/'/g, "''");
    const target = personal.id.replace(/'/g, "''");
    let migrated = 0;
    // Restore the legacy project.thread_id association before claiming
    // remaining threads for Personal.
    await executeRaw(
      `UPDATE nodetool_threads SET project_id = (` +
        `SELECT p.id FROM projects p WHERE p.thread_id = nodetool_threads.id ` +
        `AND p.user_id = nodetool_threads.user_id) ` +
        `WHERE user_id = '${owner}' AND EXISTS (` +
        `SELECT 1 FROM projects p WHERE p.thread_id = nodetool_threads.id ` +
        `AND p.user_id = nodetool_threads.user_id) RETURNING id`
    );
    // Runs created from an already-assigned workflow inherit that ownership.
    // Jobs without a project column were otherwise indistinguishable from
    // genuinely unassigned runs.
    await executeRaw(
      `UPDATE nodetool_jobs SET project_id = (` +
        `SELECT w.project_id FROM nodetool_workflows w ` +
        `WHERE w.id = nodetool_jobs.workflow_id AND w.user_id = nodetool_jobs.user_id) ` +
        `WHERE user_id = '${owner}' AND (project_id IS NULL OR project_id = '' ` +
        `OR project_id = 'default') AND EXISTS (` +
        `SELECT 1 FROM nodetool_workflows w WHERE w.id = nodetool_jobs.workflow_id ` +
        `AND w.user_id = nodetool_jobs.user_id AND w.project_id <> 'default') RETURNING id`
    );
    const tables = [
      "storyboards", "scripts", "timeline_sequences", "image_documents",
      "applications", "js_scripts", "nodetool_assets", "nodetool_workflows",
      "nodetool_threads", "nodetool_jobs", "nodetool_workspaces",
      "nodetool_predictions"
    ];
    for (const table of tables) {
      const result = await executeRaw(
        `UPDATE ${table} SET project_id = '${target}' ` +
          `WHERE user_id = '${owner}' AND ` +
          `(project_id IS NULL OR project_id = '' OR project_id = 'default') RETURNING id`
      );
      migrated += result.rows.length;
    }
    // Dangling non-default ids are intentionally left in place. They need a
    // repair decision, and moving them would hide a broken legacy reference.
    let dangling = 0;
    for (const table of tables) {
      const result = await executeRaw(
        `SELECT COUNT(*) AS count FROM ${table} r ` +
          `WHERE r.user_id = '${owner}' AND r.project_id IS NOT NULL ` +
          `AND r.project_id <> 'default' AND r.project_id <> '${target}' ` +
          `AND NOT EXISTS (SELECT 1 FROM projects p ` +
          `WHERE p.id = r.project_id AND p.user_id = r.user_id)`
      );
      const rows = result.rows;
      const count = (rows[0] as { count?: unknown } | undefined)?.count;
      dangling += Number(count ?? 0);
    }
    return { project: personal, migrated, dangling };
  }

  static async findOwned(userId: string, id: string): Promise<Project | null> {
    const row = await Project.findById(id);
    return row && row.user_id === userId ? row : null;
  }

  /**
   * The project whose agent thread this is. A chat turn knows its thread, so
   * this is how a run learns which project the documents it creates belong to.
   */
  static async findByThread(
    userId: string,
    threadId: string
  ): Promise<Project | null> {
    const db = getDb();
    const rows = await db
      .select()
      .from(projects)
      .where(
        and(eq(projects.user_id, userId), eq(projects.thread_id, threadId))
      )
      .limit(1);
    const row = rows[0];
    return row ? new Project(row as Record<string, unknown>) : null;
  }

  static async listByUser(userId: string, limit = 100): Promise<Project[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(projects)
      .where(eq(projects.user_id, userId))
      .orderBy(desc(projects.updated_at))
      .limit(limit);
    return rows.map((r: Record<string, unknown>) => new Project(r));
  }

  /**
   * Create a project without ever rewriting a row that already exists.
   *
   * `save()` is an upsert, and the primary key is install-global with no
   * `(user_id, id)` uniqueness — so an id the caller supplies could otherwise
   * overwrite another user's project. This inserts and answers null on
   * conflict, leaving the existing row untouched for the caller to report.
   */
  static async insertNew(data: Record<string, unknown>): Promise<Project | null> {
    const project = new Project(data);
    project.beforeSave();
    const db = getDb();
    const rows = await db
      .insert(projects)
      .values({
        id: project.id,
        user_id: project.user_id,
        name: project.name,
        kind: project.kind,
        thread_id: project.thread_id,
        created_at: project.created_at,
        updated_at: project.updated_at
      })
      .onConflictDoNothing()
      .returning();
    const row = rows[0];
    if (!row) return null;
    const created = new Project(row as Record<string, unknown>);
    // `create()` notifies, and the websocket forwards that as the resource
    // event an open project list refreshes on.
    ModelObserver.notify(created, ModelChangeEvent.CREATED);
    return created;
  }

  /**
   * Delete a project the caller owns, moving its documents back into the loose
   * bucket first. Leaving them pointing at a dead id loses them: the loose
   * listing filters on {@link LOOSE_PROJECT_ID}, so an orphan appears in no
   * project and in no unassigned list. Ledger rows keep the dead id — they are
   * history, not something a user opens. Missing and not-yours answer the same,
   * so a caller cannot probe ids.
   */
  static async deleteOwned(userId: string, id: string): Promise<boolean> {
    const row = await Project.findOwned(userId, id);
    if (!row) return false;
    if (row.kind === PERSONAL_PROJECT_KIND) return false;
    await reassignProjectDocuments(userId, id, LOOSE_PROJECT_ID);
    await row.delete();
    return true;
  }

  /**
   * The project's agent thread, created on first ask.
   *
   * The row is created here rather than left to the chat path, because the
   * project has to be able to name it before anyone has said anything. The
   * write claims the column only while it is still null, so two callers
   * racing settle on one thread and the loser's row is dropped rather than
   * left as a conversation nothing points at.
   */
  static async ensureThread(
    userId: string,
    id: string
  ): Promise<string | null> {
    const project = await Project.findOwned(userId, id);
    if (!project) return null;
    if (project.thread_id) return project.thread_id;

    const thread = await Thread.create<Thread>({
      user_id: userId,
      title: project.name,
      project_id: project.id
    });
    const db = getDb();
    const rows = await db
      .update(projects)
      // `updated_at` is left alone: naming the thread is bookkeeping, not
      // work on the project, and the list orders by when it was last worked on.
      .set({ thread_id: thread.id })
      .where(
        and(
          eq(projects.id, id),
          eq(projects.user_id, userId),
          isNull(projects.thread_id)
        )
      )
      .returning();
    if (rows.length > 0) return thread.id;

    await thread.delete();
    const winner = await Project.findOwned(userId, id);
    return winner?.thread_id ?? null;
  }

  static async updateOwned(
    userId: string,
    id: string,
    fields: Partial<{ name: string; kind: string; thread_id: string }>
  ): Promise<Project | null> {
    const db = getDb();
    const rows = await db
      .update(projects)
      .set({ ...fields, updated_at: new Date().toISOString() })
      .where(and(eq(projects.id, id), eq(projects.user_id, userId)))
      .returning();
    const row = rows[0];
    return row ? new Project(row) : null;
  }
}
