import { createHash } from "node:crypto";
import { and, desc, eq, inArray, like } from "drizzle-orm";
import { z } from "zod";
import { createLogger } from "@nodetool-ai/config";
import { isShortResourceId, parseGameDocument, type GameDiagnostic } from "@nodetool-ai/protocol";
import { type AnyGameDocument as GameDocument } from "@nodetool-ai/protocol";
import { applyAnyGameOps as applyGameOps, anyGameDocumentOp, validateAnyGame, type AnyGameDocumentOp as GameDocumentOp } from "@nodetool-ai/game-runtime";
import {
  DBModel,
  ModelChangeEvent,
  ModelObserver,
  createTimeOrderedUuid,
  nextUpdatedAtAfter
} from "./base-model.js";
import { getPortableDb, getDbType, type DbTransaction } from "./db.js";
import { games } from "./schema/games.js";
import { gameDraftChanges } from "./schema/game-draft-changes.js";
import { gameRevisionMessages } from "./schema/game-revision-messages.js";

const log = createLogger("nodetool.game");

export interface GameDraftWorkspace {
  readText(path: string): Promise<string | null>;
  write(path: string, data: string, contentType?: string): Promise<void>;
  delete(path: string): Promise<boolean>;
  list?(path: string, options: { recursive: boolean }): Promise<readonly { path: string; modifiedAt: number }[]>;
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

function draftVersionPath(game: Game, versionId: string): string {
  return `${game.source_root}/drafts/${versionId}.json`;
}

function newDraftVersionId(digest: string, baseUpdatedAt: string): string {
  return `${digest}.${Buffer.from(baseUpdatedAt).toString("base64url")}.${createTimeOrderedUuid()}`;
}

function draftVersionInfo(versionId: string): { digest: string; baseUpdatedAt: string | null } | null {
  const match = /^([a-f0-9]{64})(?:\.([A-Za-z0-9_-]+)\.([a-f0-9]{32}))?$/.exec(versionId);
  return match ? { digest: match[1], baseUpdatedAt: match[2] ? Buffer.from(match[2], "base64url").toString("utf8") : null } : null;
}

function summarizeOps(ops: readonly GameDocumentOp[]): string {
  const counts = new Map<GameDocumentOp["op"], number>();
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
    set_audio: ["Changed audio mix", "Changed audio mix"],
    bind_asset: ["Bound asset", "Bound assets"],
    unbind_asset: ["Unbound asset", "Unbound assets"],
    set_prefab: ["Changed prefab", "Changed prefabs"],
    remove_prefab: ["Removed prefab", "Removed prefabs"],
    instantiate_prefab: ["Instantiated prefab", "Instantiated prefabs"],
    set_animation_graph: ["Changed animation graph", "Changed animation graphs"],
    remove_animation_graph: ["Removed animation graph", "Removed animation graphs"],
    reset_override: ["Reset override", "Reset overrides"],
    set_override_membership: ["Changed property ownership", "Changed property ownership"],
    set_authoring_membership: ["Changed authoring membership", "Changed authoring memberships"],
    detach_entity: ["Detached entity", "Detached entities"]
  };
  return [...counts].map(([type, count]) => {
    const [singular, plural] = labels[type];
    return `${count === 1 ? singular : plural} (${count})`;
  }).join("; ");
}

export class InvalidGameDocumentError extends Error {
  constructor(readonly diagnostics: readonly GameDiagnostic[]) {
    super(diagnostics.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "));
    this.name = "InvalidGameDocumentError";
  }
}

export class MissingGameDraftSourceError extends Error {
  constructor() {
    super("Game draft source is unavailable");
    this.name = "MissingGameDraftSourceError";
  }
}

function parseStoredDocument(value: unknown): GameDocument {
  const result = parseGameDocument(value);
  if (!result.ok) { throw new InvalidGameDocumentError(result.diagnostics); }
  return result.document;
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
    const rows = await getPortableDb()
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
    const rows = await getPortableDb()
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
    const rows = await getPortableDb()
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
    if (game.draft_version_id && versioned === null) {
      const mirror = await workspace.readText(`${game.source_root}/draft.json`);
      const matchesMirror = mirror !== null && createHash("sha256").update(mirror).digest("hex") === draftVersionInfo(game.draft_version_id)?.digest;
      if (!matchesMirror || mirror === null) { throw new MissingGameDraftSourceError(); }
      const recoveredSource = mirror;
      const document = parseStoredDocument(JSON.parse(recoveredSource));
      if (document.id !== game.id || document.revision !== game.current_revision) { throw new Error("Game recovery source is corrupt"); }
      const digest = createHash("sha256").update(recoveredSource).digest("hex");
      const versionId = newDraftVersionId(digest, game.draft_updated_at);
      await workspace.write(draftVersionPath(game, versionId), recoveredSource, "application/json");
      const rows = await getPortableDb().update(games).set({ draft_version_id: versionId,
        draft_updated_at: nextUpdatedAtAfter(game.draft_updated_at) }).where(and(eq(games.id, game.id),
        eq(games.user_id, userId), eq(games.draft_updated_at, game.draft_updated_at),
        eq(games.current_revision, game.current_revision))).returning();
      if (!rows[0]) { return Game.readDraft(userId, game.id, workspace); }
      const recovered = new Game(rows[0]);
      ModelObserver.notify(recovered, ModelChangeEvent.UPDATED);
      return { game: recovered, document };
    }
    const path = `${game.source_root}/revisions/${game.current_revision}/game.json`;
    const source = versioned ?? await workspace.readText(path);
    if (source === null) throw new Error("Game draft source is missing");
    if (versioned !== null && createHash("sha256").update(versioned).digest("hex") !== draftVersionInfo(game.draft_version_id)?.digest) {
      throw new Error("Game draft source is corrupt");
    }
    const document = parseStoredDocument(JSON.parse(source));
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
    const beforeVersionId = game.draft_version_id || newDraftVersionId(beforeDigest, game.draft_updated_at);
    const nextSource = JSON.stringify(document);
    const versionId = newDraftVersionId(createHash("sha256").update(nextSource).digest("hex"), game.draft_updated_at);
    const newPath = draftVersionPath(game, versionId);
    if (!game.draft_version_id) { await workspace.write(draftVersionPath(game, beforeVersionId), beforeSource, "application/json"); }
    await workspace.write(newPath, nextSource, "application/json");
    const updated = await Game.commitDraft(game, userId, expectedUpdatedAt, now, versionId, ops, beforeVersionId, context, summarizeOps(ops));
    if (!updated) {
      // The orphan scan reclaims attempts only after their base token is stale.
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
    try {
      return await Game.replaceDraftChecked(userId, id, expectedUpdatedAt, document, workspace,
        { actor: "user" }, "Restored a revision");
    } catch (error) {
      if (!(error instanceof MissingGameDraftSourceError)) { throw error; }
      const game = await Game.findOwned(userId, id);
      if (!game || game.draft_updated_at !== expectedUpdatedAt) { return null; }
      const source = await workspace.readText(`${game.source_root}/revisions/${game.current_revision}/game.json`);
      if (source === null) { throw new Error("Game published source is missing"); }
      const published = parseStoredDocument(JSON.parse(source));
      if (published.id !== game.id || published.revision !== game.current_revision) {
        throw new Error("Game published source is corrupt");
      }
      const replacement = Game.validateReplacement(game, document, published);
      return Game.commitReplacement(game, userId, expectedUpdatedAt, replacement, game.draft_version_id,
        workspace, { actor: "user" }, "Restored a revision after draft source loss");
    }
  }

  /** Persist a validated rebuild only against the exact draft used for preview. */
  /** Replace the draft with an editor's whole document when its op batch cannot be saved. */
  static async saveDraftDocument(
    userId: string,
    id: string,
    expectedUpdatedAt: string,
    document: GameDocument,
    workspace: GameDraftWorkspace
  ): Promise<{ game: Game; document: GameDocument } | null> {
    return Game.replaceDraftChecked(userId, id, expectedUpdatedAt, document, workspace,
      { actor: "user" }, "Saved the whole draft");
  }

  static async applyAuthoringCandidate(
    userId: string,
    id: string,
    expectedUpdatedAt: string,
    expectedDigest: string,
    document: GameDocument,
    workspace: GameDraftWorkspace,
    context: GameDraftWriteContext = { actor: "agent" }
  ): Promise<{ game: Game; document: GameDocument } | null> {
    return Game.replaceDraftChecked(userId, id, expectedUpdatedAt, document, workspace,
      context, "Rebuilt retained game", expectedDigest);
  }

  private static async replaceDraftChecked(
    userId: string,
    id: string,
    expectedUpdatedAt: string,
    document: GameDocument,
    workspace: GameDraftWorkspace,
    context: GameDraftWriteContext,
    summary: string,
    expectedDigest?: string
  ): Promise<{ game: Game; document: GameDocument } | null> {
    const current = await Game.readDraft(userId, id, workspace);
    if (!current || current.game.draft_updated_at !== expectedUpdatedAt) return null;
    const { game, document: before } = current;
    const beforeSource = JSON.stringify(before);
    const beforeDigest = createHash("sha256").update(beforeSource).digest("hex");
    if (expectedDigest !== undefined && beforeDigest !== expectedDigest) return null;
    const replacement = Game.validateReplacement(game, document, before);
    const beforeVersionId = game.draft_version_id || newDraftVersionId(beforeDigest, game.draft_updated_at);
    if (!game.draft_version_id) { await workspace.write(draftVersionPath(game, beforeVersionId), beforeSource, "application/json"); }
    return Game.commitReplacement(game, userId, expectedUpdatedAt, replacement, beforeVersionId, workspace, context, summary);
  }

  private static validateReplacement(game: Game, document: GameDocument, reference: GameDocument): GameDocument {
    const checked = validateAnyGame({ ...document, id: game.id, revision: game.current_revision });
    if (!checked.valid) { throw new InvalidGameDocumentError(checked.diagnostics); }
    if ((reference.schemaVersion === 3) !== (checked.document.schemaVersion === 3)) {
      throw new InvalidGameDocumentError([{ code: "dimension_mismatch", path: ["dimension"], message: "A game cannot change dimension" }]);
    }
    return checked.document;
  }

  private static async commitReplacement(
    game: Game, userId: string, expectedUpdatedAt: string, replacement: GameDocument,
    beforeVersionId: string, workspace: GameDraftWorkspace, context: GameDraftWriteContext, summary: string
  ): Promise<{ game: Game; document: GameDocument } | null> {
    const now = nextUpdatedAtAfter(expectedUpdatedAt);
    const nextSource = JSON.stringify(replacement);
    const versionId = newDraftVersionId(createHash("sha256").update(nextSource).digest("hex"), game.draft_updated_at);
    const newPath = draftVersionPath(game, versionId);
    await workspace.write(newPath, nextSource, "application/json");
    const updated = await Game.commitDraft(game, userId, expectedUpdatedAt, now, versionId, [], beforeVersionId, context, summary);
    if (!updated) {
      // The orphan scan reclaims attempts only after their base token is stale.
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
    beforeVersionId: string,
    context: GameDraftWriteContext,
    summary: string
  ): Promise<Game | null> {
    const values = {
      id: createTimeOrderedUuid(), game_id: game.id, actor: context.actor,
      thread_id: context.threadId ?? null, message_id: context.messageId ?? null,
      ops: JSON.stringify(ops), summary, before_updated_at: beforeUpdatedAt,
      before_digest: beforeVersionId, created_at: now
    };
    const condition = and(eq(games.id, game.id), eq(games.user_id, userId), eq(games.draft_updated_at, beforeUpdatedAt));
    const db = getPortableDb();
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
    const rows = await getPortableDb().select().from(gameDraftChanges)
      .where(eq(gameDraftChanges.game_id, game.id))
      .orderBy(desc(gameDraftChanges.created_at))
      .limit(500);
    return rows.map((row): GameDraftChange => ({
      id: row.id,
      gameId: row.game_id,
      actor: z.enum(["agent", "user"]).parse(row.actor),
      threadId: row.thread_id,
      messageId: row.message_id,
      ops: z.array(anyGameDocumentOp).parse(JSON.parse(row.ops)),
      affectedEntityIds: [],
      summary: row.summary,
      beforeUpdatedAt: row.before_updated_at,
      beforeDigest: draftVersionInfo(row.before_digest)?.digest ?? row.before_digest,
      createdAt: row.created_at
    })).map((change) => ({
      ...change,
      affectedEntityIds: [...new Set(change.ops.flatMap((op) => {
        if (op.op === "set_document") return op.document.scenes.flatMap((scene) => scene.entities.map((entity) => entity.id));
        if (op.op === "add_entity") return [op.entity.id];
        if (op.op === "duplicate_entity") return [op.entity_id, op.new_id];
        if (op.op === "instantiate_prefab") return [op.instance_id];
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
    const rows = await getPortableDb().select({ before_digest: gameDraftChanges.before_digest })
      .from(gameDraftChanges)
      .where(and(eq(gameDraftChanges.id, changeId), eq(gameDraftChanges.game_id, game.id)))
      .limit(1);
    const digest = rows[0]?.before_digest;
    if (!digest) return null;
    const source = await workspace.readText(`${game.source_root}/drafts/${digest}.json`);
    return source ? parseStoredDocument(JSON.parse(source)) : null;
  }

  private static async cleanupDraftVersions(game: Game, workspace: GameDraftWorkspace, digests: readonly string[]): Promise<void> {
    try {
      const current = await Game.findOwned(game.user_id, game.id);
      if (!current) { return; }
      const rows = await getPortableDb().select({ before_digest: gameDraftChanges.before_digest })
        .from(gameDraftChanges).where(eq(gameDraftChanges.game_id, game.id));
      const retained = new Set(rows.map((row) => row.before_digest));
      retained.add(current.draft_version_id);
      const committedTime = Date.parse(current.draft_updated_at);
      for (const versionId of new Set(digests)) {
        const base = draftVersionInfo(versionId)?.baseUpdatedAt;
        const baseTime = base ? Date.parse(base) : NaN;
        // A pending attempt can still win only while its captured base token is current.
        if (!retained.has(versionId) && Number.isFinite(baseTime) && baseTime < committedTime) {
          await workspace.delete(draftVersionPath(game, versionId));
        }
      }
    } catch (error) {
      log.error("Game orphan draft cleanup failed", { gameId: game.id, error: String(error) });
    }
  }

  private static async pruneDraftChanges(game: Game, workspace: GameDraftWorkspace): Promise<void> {
    const rows = await getPortableDb().select({ id: gameDraftChanges.id, before_digest: gameDraftChanges.before_digest })
      .from(gameDraftChanges)
      .where(eq(gameDraftChanges.game_id, game.id))
      .orderBy(desc(gameDraftChanges.created_at), desc(gameDraftChanges.id));
    const expired = rows.slice(500);
    if (expired.length > 0) {
      await getPortableDb().delete(gameDraftChanges).where(inArray(gameDraftChanges.id, expired.map((row) => row.id)));
      await Game.cleanupDraftVersions(game, workspace, expired.map((row) => row.before_digest));
    }
    if (workspace.list) {
      const prefix = `${game.source_root}/drafts/`;
      const entries = await workspace.list(prefix, { recursive: true });
      // Recent uncommitted versions can belong to another in-flight writer.
      const cutoff = Date.now() - 60 * 60 * 1000;
      const oldVersions = entries.flatMap((entry) => {
        const match = /^([a-f0-9]{64}\.[A-Za-z0-9_-]+\.[a-f0-9]{32})\.json$/.exec(entry.path.slice(prefix.length));
        return match && entry.modifiedAt < cutoff ? [match[1]] : [];
      });
      await Game.cleanupDraftVersions(game, workspace, oldVersions);
    }
  }

  static async pruneRevisionFiles(userId: string, id: string, workspace: GameDraftWorkspace): Promise<void> {
    if (!workspace.list) { return; }
    const game = await Game.findOwned(userId, id);
    if (!game) { return; }
    const prefix = `${game.source_root}/revisions/`;
    const entries = await workspace.list(prefix, { recursive: true });
    const revisions = entries.flatMap((entry) => {
      const match = /^([a-f0-9]{32})\/game\.json$/.exec(entry.path.slice(prefix.length));
      return match ? [{ revision: match[1], path: entry.path, modifiedAt: entry.modifiedAt }] : [];
    }).sort((left, right) => right.modifiedAt - left.modifiedAt || right.revision.localeCompare(left.revision));
    const archived = revisions.filter((entry) => entry.revision !== game.current_revision);
    for (const entry of archived.slice(99)) {
      const current = await Game.findOwned(userId, game.id);
      if (!current || entry.revision === current.current_revision) { continue; }
      await workspace.delete(entry.path);
      await getPortableDb().delete(gameRevisionMessages).where(and(eq(gameRevisionMessages.game_id, game.id),
        eq(gameRevisionMessages.revision, entry.revision)));
    }
  }

  static async listRevisionMessages(userId: string, id: string): Promise<Map<string, string | null>> {
    const game = await Game.findOwned(userId, id);
    if (!game) return new Map();
    const rows = await getPortableDb().select({ revision: gameRevisionMessages.revision, message: gameRevisionMessages.message })
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
    let capturedDraftUpdatedAt = expectedDraftUpdatedAt;
    if (capturedDraftUpdatedAt === undefined) {
      const current = await Game.findOwned(userId, id);
      if (!current) { return null; }
      capturedDraftUpdatedAt = current.draft_updated_at;
    }
    const publishedAt = new Date().toISOString();
    const fields = {
      current_revision: revision,
      draft_base_revision: revision,
      draft_version_id: "",
      draft_updated_at: nextUpdatedAtAfter(capturedDraftUpdatedAt),
      updated_at: publishedAt
    };
    const condition = and(
      eq(games.id, id), eq(games.user_id, userId), eq(games.current_revision, expectedRevision),
      eq(games.draft_updated_at, capturedDraftUpdatedAt)
    );
    const revisionMessage = { revision, game_id: id, message: message?.trim() || null, created_at: publishedAt };
    const db = getPortableDb();
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
        const rows = await getPortableDb().select({ before_digest: gameDraftChanges.before_digest })
          .from(gameDraftChanges).where(eq(gameDraftChanges.game_id, id));
        await getPortableDb().delete(gameDraftChanges).where(eq(gameDraftChanges.game_id, id));
        await Game.cleanupDraftVersions(updated, workspace, rows.map((change) => change.before_digest));
      } else {
        await getPortableDb().delete(gameDraftChanges).where(eq(gameDraftChanges.game_id, id));
      }
    } catch (error) {
      log.error("Game publish cleanup failed", { gameId: id, error: String(error) });
    }
    ModelObserver.notify(updated, ModelChangeEvent.UPDATED);
    return updated;
  }
}
