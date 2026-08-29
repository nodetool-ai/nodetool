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

import { eq, desc, and } from "drizzle-orm";
import { DBModel, createTimeOrderedUuid } from "./base-model.js";
import { getDb } from "./db.js";
import { projects } from "./schema/projects.js";

/** The bucket documents land in when no project is active. */
export const LOOSE_PROJECT_ID = "default";

export interface ProjectResponse {
  id: string;
  name: string;
  /** Free text — "spot", "trailer", "report". Not an enum on purpose. */
  kind: string;
  createdAt: string;
  updatedAt: string;
}

export class Project extends DBModel {
  static override table = projects;

  declare id: string;
  declare user_id: string;
  declare name: string;
  declare kind: string;
  declare created_at: string;
  declare updated_at: string;

  constructor(data: Record<string, unknown>) {
    super(data);
    const now = new Date().toISOString();
    this.id ??= createTimeOrderedUuid();
    this.name ??= "Untitled project";
    this.kind ??= "";
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
      createdAt: this.created_at,
      updatedAt: this.updated_at
    };
  }

  static async findById(id: string): Promise<Project | null> {
    return Project.get<Project>(id);
  }

  static async findOwned(userId: string, id: string): Promise<Project | null> {
    const row = await Project.findById(id);
    return row && row.user_id === userId ? row : null;
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
   * Delete a project the caller owns. Its documents are left where they are —
   * they keep pointing at a project id that no longer resolves, which reads as
   * loose rather than as data loss. Missing and not-yours answer the same, so
   * a caller cannot probe ids.
   */
  static async deleteOwned(userId: string, id: string): Promise<boolean> {
    const row = await Project.findOwned(userId, id);
    if (!row) return false;
    await row.delete();
    return true;
  }

  static async updateOwned(
    userId: string,
    id: string,
    fields: Partial<{ name: string; kind: string }>
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
