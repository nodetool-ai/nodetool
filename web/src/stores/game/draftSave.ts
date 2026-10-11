import { MAX_GAME_DRAFT_OPS, type AnyGameDocumentOp } from "@nodetool-ai/game-runtime";
import type { AnyGameDocument } from "@nodetool-ai/protocol";
import { useConflictStore } from "../ConflictStore";
import { mergeByUnits } from "../documentMerge";
import { anyGameMergeAdapter } from "./anyMerge";
import { getGameDraftStore } from "./GameDraftStore";

export interface DraftSaveFlight {
  current: Promise<void> | null;
}

/** Share the active save between flush callers, including recovery. */
export async function flushGameDraft(flight: DraftSaveFlight, save: () => Promise<void>): Promise<void> {
  if (flight.current) {
    await flight.current;
    return flushGameDraft(flight, save);
  }
  const pending = Promise.resolve().then(save);
  flight.current = pending;
  try {
    await pending;
  } finally {
    if (flight.current === pending) { flight.current = null; }
  }
}

/** Resource echoes must not merge a batch before its acknowledgement. */
export async function pullGameDraft(flight: DraftSaveFlight, pull: () => Promise<void>): Promise<void> {
  while (flight.current) {
    try { await flight.current; } catch { /* A failed save still permits reloading the server draft. */ }
  }
  await flushGameDraft(flight, pull);
}

export type GameDraftBatch =
  | { readonly count: number; readonly ops: AnyGameDocumentOp[] }
  | { readonly count: number; readonly document: AnyGameDocument };

/** Send ops, or the whole document when the op route rejected the batch or cannot accept its size. */
export function captureGameDraftBatch(gameId: string): GameDraftBatch | null {
  const state = getGameDraftStore(gameId).getState();
  const ops = state.captureSaveOps();
  if (ops.length === 0) { return null; }
  if (!state.documentSaveRequired && ops.length <= MAX_GAME_DRAFT_OPS) { return { count: ops.length, ops }; }
  return state.captureSaveDocument();
}

/** The server validated the request and refused it, so resending the same ops cannot succeed. */
export function isRejectedGameSave(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("data" in error)) { return false; }
  const data = error.data;
  return !!data && typeof data === "object" && "code" in data && data.code === "BAD_REQUEST";
}

/**
 * Fold a draft the server saved into the local one, as a pull does, but keep
 * undo history: the server edit lands as if it had been there all along.
 * Local edits made while the server worked stay pending on top of it, and a
 * unit both sides changed is raised as a conflict. Call it inside the save
 * flight (`pullGameDraft`) so no batch is in the air.
 */
export function absorbServerGameDraft(gameId: string, server: { readonly document: AnyGameDocument; readonly game: { readonly draftUpdatedAt: string } }): void {
  const store = getGameDraftStore(gameId);
  const state = store.getState();
  if (server.game.draftUpdatedAt === state.baseUpdatedAt) { return; }
  if (!state.document || !state.savedDocument) {
    state.load(server.document, server.game.draftUpdatedAt);
    return;
  }
  const merged = mergeByUnits(state.savedDocument, state.document, server.document, anyGameMergeAdapter(server.document), { mergeWithoutOps: true });
  state.applyMerged(merged.doc, server.document, server.game.draftUpdatedAt, { keepHistory: true });
  useConflictStore.getState().addConflicts(`game:${gameId}`, merged.conflicts, {
    onAccept: (unitId) => {
      const conflict = merged.conflicts.find((entry) => entry.unit.id === unitId);
      if (conflict) { store.getState().acceptConflict(server.document, conflict.unit.kind, unitId); }
    },
    onDiscard: () => undefined
  });
}
