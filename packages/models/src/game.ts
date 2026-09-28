import { createHash } from "node:crypto";
import { and, desc, eq, inArray, like } from "drizzle-orm";
import { createLogger } from "@nodetool-ai/config";
import { isShortResourceId } from "@nodetool-ai/protocol";
import { gameDocument, type GameDocument } from "@nodetool-ai/protocol/game.js";
import { applyGameOps, type GameDocumentOp } from "@nodetool-ai/game-runtime";
import {
  DBModel,
  ModelChangeEvent,
  ModelObserver,
  createTimeOrderedUuid
} from "./base-model.js";
import { getDb, getDbType, type DbTransaction } from "./db.js";
import { games } from "./schema/games.js";
import { gameDraftChanges } from "./schema/game-draft-changes.js";
import { gameRevisionMessages } from "./schema/game-revision-messages.js";

const log = createLogger("nodetool.game");

export interface GameDraftWorkspace {
  readText(path: string): Promise<string | null>;
  write(path: string, data: string, contentType?: string): Promise<void>;
  delete(path: string): Promise<boolean>;
}

export interface GameDraftChange {
  id: string;
  gameId: string;
  actor: "agent" | "user";
  threadId: string | null;
  messageId: string | null;
  ops: GameDocumentOp[];
  affectedEntityIds: string[];
  summary: string;
  beforeUpdatedAt: string;
  beforeDigest: string;
  createdAt: string;
}

export interface GameDraftWriteContext {
  actor: "agent" | "user";
  threadId?: string;
  messageId?: string;
}

function nextUpdatedAtAfter(previous: string): string {
  const now = new Date();
  const previousMs = Date.parse(previous);
  if (Number.isFinite(previousMs) && now.getTime() <= previousMs) {
    return new Date(previousMs + 1).toISOString();
  }
  return now.toISOString();
}

function draftVersionPath(game: Game, versionId: string): string {
  return `${game.source_root}/drafts/${versionId}.json`;
}

function summarizeOps(ops: readonly GameDocumentOp[]): string {
  const counts = new Map<string, number>();
  for (const op of ops) {
    counts.set(op.op, (counts.get(op.op) ?? 0) + 1);
  }
  const labels: Record<GameDocumentOp["op"], [string, string]> = {
    set_document: ["Replaced game document", "Replaced game documents"],
    add_entity: ["Added entity", "Added entities"],
    update_entity: ["Changed entity", "Changed entities"],
    remove_entity: ["Removed entity", "Removed entities"],
    duplicate_entity: ["Duplicated entity", "Duplicated entities"],
    move_entity: ["Moved entity", "Moved entities"],
    add_behavior: ["Added behavior", "Added behaviors"],
    update_behavior: ["Changed behavior", "Changed behaviors"],
    remove_behavior: ["Removed behavior", "Removed behaviors"],
    move_behavior: ["Moved behavior", "Moved behaviors"],
    set_script: ["Changed script", "Changed scripts"],
    add_scene: ["Added scene", "Added scenes"],
    update_scene: ["Changed scene", "Changed scenes"],
    remove_scene: ["Removed scene", "Removed scenes"],
    set_lighting: ["Changed lighting", "Changed lighting"],
    add_light: ["Added light", "Added lights"],
    update_light: ["Changed light", "Changed lights"],
    remove_light: ["Removed light", "Removed lights"],
    add_background: ["Added background", "Added backgrounds"],
    update_background: ["Changed background", "Changed backgrounds"],
    remove_background: ["Removed background", "Removed backgrounds"],
    move_background: ["Moved background", "Moved backgrounds"],
    set_effects: ["Changed effects", "Changed effects"],
    set_game: ["Changed game settings", "Changed game settings"],
    bind_asset: ["Bound asset", "Bound assets"],
    unbind_asset: ["Unbound asset", "Unbound assets"]
  };
  return [...counts].map(([type, count]) => {
    const [singular, plural] = labels[type as GameDocumentOp["op"]];
    return `${count === 1 ? singular : plural} (${count})`;
  }).join("; ");
}

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
  declare draft_updated_at: string;
  declare draft_base_revision: string;
  declare draft_version_id: string;
  declare created_at: string;
  declare updated_at: string;

  constructor(data: Record<string, unknown>) {
    super(data);
    const now = new Date().toISOString();
    this.id ??= createTimeOrderedUuid();
    this.source_root ??= `games/${this.id}`;
    this.created_at ??= now;
    this.updated_at ??= now;
    this.draft_updated_at ||= this.updated_at;
    this.draft_base_revision ||= this.current_revision;
    this.draft_version_id ??= "";
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
        draft_updated_at: game.draft_updated_at,
        draft_base_revision: game.draft_base_revision,
        draft_version_id: game.draft_version_id,
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

  static async readDraft(
    userId: string,
    id: string,
    workspace: GameDraftWorkspace
  ): Promise<{ game: Game; document: GameDocument } | null> {
    const game = await Game.findOwned(userId, id);
    if (!game) return null;
    const versioned = game.draft_version_id
      ? await workspace.readText(draftVersionPath(game, game.draft_version_id))
      : null;
    if (game.draft_version_id && versioned === null) throw new Error("Game draft source is missing");
    const path = `${game.source_root}/revisions/${game.current_revision}/game.json`;
    const source = versioned ?? await workspace.readText(path);
    if (source === null) throw new Error("Game draft source is missing");
    if (versioned !== null && createHash("sha256").update(versioned).digest("hex") !== game.draft_version_id) {
      throw new Error("Game draft source is corrupt");
    }
    const document = gameDocument.parse(JSON.parse(source));
    if (document.id !== game.id) throw new Error("Game draft belongs to another game");
    if (document.revision !== game.current_revision) throw new Error("Game draft revision is stale");
    return { game, document };
  }

  static async updateDraft(
    userId: string,
    id: string,
    expectedUpdatedAt: string,
    ops: readonly GameDocumentOp[],
    workspace: GameDraftWorkspace,
    context: GameDraftWriteContext = { actor: "user" }
  ): Promise<{ game: Game; document: GameDocument } | null> {
    const current = await Game.readDraft(userId, id, workspace);
    if (!current || current.game.draft_updated_at !== expectedUpdatedAt) return null;
    const { game, document: before } = current;
    const document = applyGameOps(before, ops);
    const now = nextUpdatedAtAfter(expectedUpdatedAt);
    const beforeSource = JSON.stringify(before);
    const beforeDigest = createHash("sha256").update(beforeSource).digest("hex");
    const beforePath = `${game.source_root}/drafts/${beforeDigest}.json`;
    const nextSource = JSON.stringify(document);
    const versionId = createHash("sha256").update(nextSource).digest("hex");
    const newPath = draftVersionPath(game, versionId);
    await workspace.write(beforePath, beforeSource, "application/json");
    await workspace.write(newPath, nextSource, "application/json");
    const updated = await Game.commitDraft(game, userId, expectedUpdatedAt, now, versionId, ops, beforeDigest, context, summarizeOps(ops));
    if (!updated) {
      return null;
    }
    try {
      await Game.pruneDraftChanges(updated, workspace);
    } catch (error) {
      log.error("Game change pruning failed", { gameId: game.id, error: String(error) });
    }
    try {
      await workspace.write(`${game.source_root}/draft.json`, nextSource, "application/json");
    } catch (error) {
      log.error("Game draft mirror write failed", { gameId: game.id, error: String(error) });
    }
    ModelObserver.notify(updated, ModelChangeEvent.UPDATED, {
      ops: ops.map((op) => ({ tool: op.op, input: op }))
    });
    return { game: updated, document };
  }

  static async replaceDraft(
    userId: string,
    id: string,
    expectedUpdatedAt: string,
    document: GameDocument,
    workspace: GameDraftWorkspace
  ): Promise<{ game: Game; document: GameDocument } | null> {
    const current = await Game.readDraft(userId, id, workspace);
    if (!current || current.game.draft_updated_at !== expectedUpdatedAt) return null;
    const { game, document: before } = current;
    const replacement = gameDocument.parse({ ...document, id: game.id, revision: game.current_revision });
    const now = nextUpdatedAtAfter(expectedUpdatedAt);
    const beforeSource = JSON.stringify(before);
    const beforeDigest = createHash("sha256").update(beforeSource).digest("hex");
    await workspace.write(`${game.source_root}/drafts/${beforeDigest}.json`, beforeSource, "application/json");
    const nextSource = JSON.stringify(replacement);
    const versionId = createHash("sha256").update(nextSource).digest("hex");
    const newPath = draftVersionPath(game, versionId);
    await workspace.write(newPath, nextSource, "application/json");
    const updated = await Game.commitDraft(game, userId, expectedUpdatedAt, now, versionId, [], beforeDigest, { actor: "user" }, "Restored a revision");
    if (!updated) {
      return null;
    }
    try {
      await Game.pruneDraftChanges(updated, workspace);
    } catch (error) {
      log.error("Game change pruning failed", { gameId: game.id, error: String(error) });
    }
    try {
      await workspace.write(`${game.source_root}/draft.json`, nextSource, "application/json");
    } catch (error) {
      log.error("Game draft mirror write failed", { gameId: game.id, error: String(error) });
    }
    ModelObserver.notify(updated, ModelChangeEvent.UPDATED, { ops: [] });
    return { game: updated, document: replacement };
  }

  private static async commitDraft(
    game: Game,
    userId: string,
    beforeUpdatedAt: string,
    now: string,
    versionId: string,
    ops: readonly GameDocumentOp[],
    beforeDigest: string,
    context: GameDraftWriteContext,
    summary: string
  ): Promise<Game | null> {
    const values = {
      id: createTimeOrderedUuid(), game_id: game.id, actor: context.actor,
      thread_id: context.threadId ?? null, message_id: context.messageId ?? null,
      ops: JSON.stringify(ops), summary, before_updated_at: beforeUpdatedAt,
      before_digest: beforeDigest, created_at: now
    };
    const condition = and(eq(games.id, game.id), eq(games.user_id, userId), eq(games.draft_updated_at, beforeUpdatedAt));
    const db = getDb();
    if (getDbType() === "sqlite") {
      const row = db.transaction((tx: DbTransaction) => {
        const rows = tx.update(games).set({ draft_updated_at: now, draft_version_id: versionId, updated_at: now }).where(condition).returning().all();
        if (!rows[0]) return null;
        tx.insert(gameDraftChanges).values(values).run();
        return rows[0];
      });
      return row ? new Game(row) : null;
    }
    const row = await db.transaction(async (tx: DbTransaction) => {
      const rows = await tx.update(games).set({ draft_updated_at: now, draft_version_id: versionId, updated_at: now }).where(condition).returning();
      if (!rows[0]) return null;
      await tx.insert(gameDraftChanges).values(values);
      return rows[0];
    });
    return row ? new Game(row) : null;
  }

  static async listDraftChanges(userId: string, id: string): Promise<GameDraftChange[]> {
    const game = await Game.findOwned(userId, id);
    if (!game) return [];
    const rows = await getDb().select().from(gameDraftChanges)
      .where(eq(gameDraftChanges.game_id, game.id))
      .orderBy(desc(gameDraftChanges.created_at))
      .limit(500);
    return rows.map((row): GameDraftChange => ({
      id: row.id,
      gameId: row.game_id,
      actor: row.actor as GameDraftChange["actor"],
      threadId: row.thread_id,
      messageId: row.message_id,
      ops: JSON.parse(row.ops) as GameDocumentOp[],
      affectedEntityIds: [],
      summary: row.summary,
      beforeUpdatedAt: row.before_updated_at,
      beforeDigest: row.before_digest,
      createdAt: row.created_at
    })).map((change) => ({
      ...change,
      affectedEntityIds: [...new Set(change.ops.flatMap((op) => {
        if (op.op === "set_document") return op.document.scenes.flatMap((scene) => scene.entities.map((entity) => entity.id));
        if (op.op === "add_entity") return [op.entity.id];
        if (op.op === "duplicate_entity") return [op.entity_id, op.new_id];
        return "entity_id" in op ? [op.entity_id] : [];
      }))]
    }));
  }

  static async readDraftBeforeChange(
    userId: string,
    id: string,
    changeId: string,
    workspace: GameDraftWorkspace
  ): Promise<GameDocument | null> {
    const game = await Game.findOwned(userId, id);
    if (!game) return null;
    const rows = await getDb().select({ before_digest: gameDraftChanges.before_digest })
      .from(gameDraftChanges)
      .where(and(eq(gameDraftChanges.id, changeId), eq(gameDraftChanges.game_id, game.id)))
      .limit(1);
    const digest = rows[0]?.before_digest;
    if (!digest) return null;
    const source = await workspace.readText(`${game.source_root}/drafts/${digest}.json`);
    return source ? gameDocument.parse(JSON.parse(source)) : null;
  }

  private static async pruneDraftChanges(game: Game, workspace: GameDraftWorkspace): Promise<void> {
    const rows = await getDb().select({ id: gameDraftChanges.id, before_digest: gameDraftChanges.before_digest })
      .from(gameDraftChanges)
      .where(eq(gameDraftChanges.game_id, game.id))
      .orderBy(desc(gameDraftChanges.created_at), desc(gameDraftChanges.id));
    if (rows.length <= 500) return;
    const expired = rows.slice(500);
    await getDb().delete(gameDraftChanges).where(inArray(gameDraftChanges.id, expired.map((row) => row.id)));
    const retained = new Set(rows.slice(0, 500).map((row) => row.before_digest));
    for (const digest of new Set(expired.map((row) => row.before_digest))) {
      if (!retained.has(digest) && digest !== game.draft_version_id) {
        await workspace.delete(`${game.source_root}/drafts/${digest}.json`);
      }
    }
  }

  static async listRevisionMessages(userId: string, id: string): Promise<Map<string, string | null>> {
    const game = await Game.findOwned(userId, id);
    if (!game) return new Map();
    const rows = await getDb().select({ revision: gameRevisionMessages.revision, message: gameRevisionMessages.message })
      .from(gameRevisionMessages)
      .where(eq(gameRevisionMessages.game_id, game.id));
    return new Map(rows.map((row) => [row.revision, row.message]));
  }

  /** Publish a source revision only if no editor has published since the read. */
  static async publish(
    userId: string,
    id: string,
    expectedRevision: string,
    revision: string,
    expectedDraftUpdatedAt?: string,
    workspace?: GameDraftWorkspace,
    message?: string
  ): Promise<Game | null> {
    const publishedAt = new Date().toISOString();
    const fields = {
      current_revision: revision,
      draft_base_revision: revision,
      draft_version_id: "",
      draft_updated_at: nextUpdatedAtAfter(expectedDraftUpdatedAt ?? publishedAt),
      updated_at: publishedAt
    };
    const condition = and(
      eq(games.id, id), eq(games.user_id, userId), eq(games.current_revision, expectedRevision),
      ...(expectedDraftUpdatedAt ? [eq(games.draft_updated_at, expectedDraftUpdatedAt)] : [])
    );
    const revisionMessage = { revision, game_id: id, message: message?.trim() || null, created_at: publishedAt };
    const db = getDb();
    let row: Record<string, unknown> | null;
    if (getDbType() === "sqlite") {
      row = db.transaction((tx: DbTransaction) => {
        const rows = tx.update(games).set(fields).where(condition).returning().all();
        if (!rows[0]) return null;
        tx.insert(gameRevisionMessages).values(revisionMessage).run();
        return rows[0];
      });
    } else {
      row = await db.transaction(async (tx: DbTransaction) => {
        const rows = await tx.update(games).set(fields).where(condition).returning();
        if (!rows[0]) return null;
        await tx.insert(gameRevisionMessages).values(revisionMessage);
        return rows[0];
      });
    }
    if (!row) return null;
    const updated = new Game(row);
    try {
      if (workspace) {
        const rows = await getDb().select({ before_digest: gameDraftChanges.before_digest })
          .from(gameDraftChanges).where(eq(gameDraftChanges.game_id, id));
        await getDb().delete(gameDraftChanges).where(eq(gameDraftChanges.game_id, id));
        for (const digest of new Set(rows.map((change) => change.before_digest))) {
          await workspace.delete(`${updated.source_root}/drafts/${digest}.json`);
        }
      } else {
        await getDb().delete(gameDraftChanges).where(eq(gameDraftChanges.game_id, id));
      }
    } catch (error) {
      log.error("Game publish cleanup failed", { gameId: id, error: String(error) });
    }
    ModelObserver.notify(updated, ModelChangeEvent.UPDATED);
    return updated;
  }
}
