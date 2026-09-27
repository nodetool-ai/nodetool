import { and, eq, like } from "drizzle-orm";
import { isShortResourceId } from "@nodetool-ai/protocol";
import {
  DBModel,
  ModelChangeEvent,
  ModelObserver,
  createTimeOrderedUuid
} from "./base-model.js";
import { getDb } from "./db.js";
import { games } from "./schema/games.js";

export class AmbiguousGameIdError extends Error {
  constructor() {
    super("Ambiguous game id");
  }
}

/** The database pointer to a game's immutable source revisions. */
export class Game extends DBModel {
  static override table = games;

  declare id: string;
  declare user_id: string;
  declare project_id: string;
  declare workspace_id: string;
  declare name: string;
  declare source_root: string;
  declare current_revision: string;
  declare created_at: string;
  declare updated_at: string;

  constructor(data: Record<string, unknown>) {
    super(data);
    const now = new Date().toISOString();
    this.id ??= createTimeOrderedUuid();
    this.source_root ??= `games/${this.id}`;
    this.created_at ??= now;
    this.updated_at ??= now;
  }

  static async insertNew(data: {
    id: string;
    userId: string;
    projectId: string;
    workspaceId: string;
    name: string;
    revision: string;
  }): Promise<Game | null> {
    const game = new Game({
      id: data.id,
      user_id: data.userId,
      project_id: data.projectId,
      workspace_id: data.workspaceId,
      name: data.name,
      current_revision: data.revision
    });
    const rows = await getDb()
      .insert(games)
      .values({
        id: game.id,
        user_id: game.user_id,
        project_id: game.project_id,
        workspace_id: game.workspace_id,
        name: game.name,
        source_root: game.source_root,
        current_revision: game.current_revision,
        created_at: game.created_at,
        updated_at: game.updated_at
      })
      .onConflictDoNothing()
      .returning();
    const row = rows[0];
    if (!row) return null;
    const created = new Game(row);
    ModelObserver.notify(created, ModelChangeEvent.CREATED);
    return created;
  }

  static async findOwned(userId: string, id: string): Promise<Game | null> {
    const rows = await getDb()
      .select()
      .from(games)
      .where(
        and(
          eq(games.user_id, userId),
          isShortResourceId(id) ? like(games.id, `${id}%`) : eq(games.id, id)
        )
      )
      .limit(2);
    if (rows.length > 1) throw new AmbiguousGameIdError();
    return rows[0] ? new Game(rows[0]) : null;
  }

  static async listByProject(userId: string, projectId: string): Promise<Game[]> {
    const rows = await getDb()
      .select()
      .from(games)
      .where(and(eq(games.user_id, userId), eq(games.project_id, projectId)));
    return rows.map((row) => new Game(row));
  }

  /** Publish a source revision only if no editor has published since the read. */
  static async publish(
    userId: string,
    id: string,
    expectedRevision: string,
    revision: string
  ): Promise<Game | null> {
    const rows = await getDb()
      .update(games)
      .set({ current_revision: revision, updated_at: new Date().toISOString() })
      .where(
        and(
          eq(games.id, id),
          eq(games.user_id, userId),
          eq(games.current_revision, expectedRevision)
        )
      )
      .returning();
    const row = rows[0];
    if (!row) return null;
    const updated = new Game(row);
    ModelObserver.notify(updated, ModelChangeEvent.UPDATED);
    return updated;
  }
}
