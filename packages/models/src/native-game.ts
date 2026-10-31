import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { nativeGameDocument, type NativeGameDocument } from "@nodetool-ai/protocol/native-game";
import { getPortableDb } from "./db.js";
import { games } from "./schema/games.js";
import { Game, type GameDraftWorkspace } from "./game.js";
import { ModelObserver, ModelChangeEvent, nextUpdatedAtAfter } from "./base-model.js";

/** Immutable source is written before the database pointer changes. A failed CAS leaves only an orphan. */
export class NativeGameStore {
  static async read(userId: string, id: string, workspace: GameDraftWorkspace): Promise<{ game: Game; document: NativeGameDocument } | null> {
    const game = await Game.findOwned(userId, id);
    if (!game) { return null; }
    const key = game.draft_version_id || "initial";
    if (key !== "initial" && !/^[a-f0-9]{64}$/.test(key)) { throw new Error("Game is not a native C++ document"); }
    const source = await workspace.readText(`${game.source_root}/native/${key}.json`);
    if (source === null) { throw new Error("Native game source is unavailable"); }
    if (key !== "initial" && createHash("sha256").update(source).digest("hex") !== key) { throw new Error("Native game source digest mismatch"); }
    const document = nativeGameDocument.parse(JSON.parse(source));
    if (document.id !== game.id || String(document.revision) !== game.current_revision) { throw new Error("Native game source identity mismatch"); }
    return { game, document };
  }

  static async save(userId: string, id: string, expectedRevision: number, candidate: NativeGameDocument, workspace: GameDraftWorkspace): Promise<{ game: Game; document: NativeGameDocument } | null> {
    const current = await NativeGameStore.read(userId, id, workspace);
    if (!current) { return null; }
    const document = nativeGameDocument.parse(candidate);
    // expectedRevision is the durable base. The worker draft may include several edits,
    // undo, and redo operations before it is saved. Persist its exact revision without rebasing.
    // Recover a lost-response retry only when the complete candidate is already durable.
    if (current.document.revision > expectedRevision && JSON.stringify(current.document) === JSON.stringify(document)) { return current; }
    if (current.document.revision !== expectedRevision) { return null; }
    if (document.id !== current.game.id || document.revision <= expectedRevision) { throw new Error("Native game candidate identity or revision is invalid"); }
    const source = JSON.stringify(document);
    const digest = createHash("sha256").update(source).digest("hex");
    await workspace.write(`${current.game.source_root}/native/${digest}.json`, source, "application/json");
    const now = nextUpdatedAtAfter(current.game.draft_updated_at);
    const rows = await getPortableDb().update(games).set({ current_revision: String(document.revision),
      draft_version_id: digest, draft_updated_at: now, updated_at: now, name: document.title
    }).where(and(eq(games.id, current.game.id), eq(games.user_id, userId),
      eq(games.current_revision, String(expectedRevision)), eq(games.draft_version_id, current.game.draft_version_id))).returning();
    const row = rows[0];
    if (!row) { return null; }
    const game = new Game(row);
    ModelObserver.notify(game, ModelChangeEvent.UPDATED);
    return { game, document };
  }
}
