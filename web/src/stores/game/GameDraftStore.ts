import { createStore, type StoreApi } from "zustand/vanilla";
import { useStore } from "zustand";
import type { AnyGameDocument as GameDocument } from "@nodetool-ai/protocol";
import { applyAnyGameOps as applyGameOps, type AnyGameDocumentOp as GameDocumentOp } from "@nodetool-ai/game-runtime";

import { temporal, type WithTemporal } from "../temporal";
import { diffAnyGameDocuments as diffGameDocuments } from "./diffAnyGameDocuments";

export type GameSaveStatus = "saved" | "unsaved" | "saving" | "error";

interface GameDraftState {
  document: GameDocument | null;
  savedDocument: GameDocument | null;
  baseUpdatedAt: string | null;
  pendingOps: GameDocumentOp[];
  savingCount: number;
  saveStatus: GameSaveStatus;
  error: string | null;
  selectedIds: string[];
  load: (document: GameDocument, baseUpdatedAt: string) => void;
  applyMerged: (document: GameDocument, server: GameDocument, baseUpdatedAt: string) => void;
  apply: (ops: GameDocumentOp[]) => void;
  acknowledge: (document: GameDocument, baseUpdatedAt: string, savedCount: number) => void;
  failSave: (error: string) => void;
  setSaving: (count: number) => void;
  select: (id: string, additive?: boolean) => void;
  selectMany: (ids: string[], additive?: boolean) => void;
  undo: () => void;
  redo: () => void;
}

type GameDraftStore = WithTemporal<StoreApi<GameDraftState>, Pick<GameDraftState, "document">>;
const stores = new Map<string, GameDraftStore>();

export function getGameDraftStore(gameId: string): GameDraftStore {
  const existing = stores.get(gameId);
  if (existing) return existing;
  let lastScriptEdit: { key: string; time: number } | null = null;
  const store = createStore<GameDraftState>()(temporal<GameDraftState, Pick<GameDraftState, "document">>((set, get, api) => ({
    document: null,
    savedDocument: null,
    baseUpdatedAt: null,
    pendingOps: [],
    savingCount: 0,
    saveStatus: "saved",
    error: null,
    selectedIds: [],
    load: (document, baseUpdatedAt) => {
      (api as GameDraftStore).temporal.getState().pause();
      set({ document, savedDocument: document, baseUpdatedAt, pendingOps: [], savingCount: 0, saveStatus: "saved", error: null });
      (api as GameDraftStore).temporal.getState().clear();
      (api as GameDraftStore).temporal.getState().resume();
    },
    applyMerged: (document, server, baseUpdatedAt) => {
      const pendingOps = diffGameDocuments(server, document);
      const history = (api as GameDraftStore).temporal.getState();
      history.pause();
      set({ document, savedDocument: server, baseUpdatedAt, pendingOps, savingCount: 0,
        saveStatus: pendingOps.length ? "unsaved" : "saved", error: null });
      history.clear();
      history.resume();
    },
    apply: (ops) => {
      const current = get().document;
      if (!current || ops.length === 0) return;
      try {
        const document = applyGameOps(current, ops);
        const script = ops.length === 1 && ops[0].op === "set_script" ? ops[0] : null;
        const scriptKey = script ? `${script.scene_id ?? ""}:${script.entity_id}:${script.index}` : null;
        const coalesce = scriptKey !== null && lastScriptEdit?.key === scriptKey && Date.now() - lastScriptEdit.time < 500;
        const history = (api as GameDraftStore).temporal.getState();
        if (coalesce) history.pause();
        set((state) => {
          const pendingOps = [...state.pendingOps];
          const last = pendingOps[pendingOps.length - 1];
          if (script && pendingOps.length > state.savingCount && last?.op === "set_script" && last.scene_id === script.scene_id &&
              last.entity_id === script.entity_id && last.index === script.index) {
            pendingOps[pendingOps.length - 1] = script;
          } else pendingOps.push(...ops);
          return { document, pendingOps, saveStatus: "unsaved", error: null };
        });
        if (coalesce) history.resume();
        lastScriptEdit = scriptKey ? { key: scriptKey, time: Date.now() } : null;
      } catch (cause) {
        set({ error: cause instanceof Error ? cause.message : String(cause) });
      }
    },
    acknowledge: (document, baseUpdatedAt, savedCount) => {
      const remaining = get().pendingOps.slice(savedCount);
      (api as GameDraftStore).temporal.getState().pause();
      set({ savedDocument: document, baseUpdatedAt, pendingOps: remaining, savingCount: 0,
        document: remaining.length === 0 ? document : get().document,
        saveStatus: remaining.length === 0 ? "saved" : "unsaved", error: null });
      (api as GameDraftStore).temporal.getState().resume();
    },
    failSave: (error) => {
      (api as GameDraftStore).temporal.getState().pause();
      set({ saveStatus: "error", savingCount: 0, error });
      (api as GameDraftStore).temporal.getState().resume();
    },
    setSaving: (count) => {
      (api as GameDraftStore).temporal.getState().pause();
      set({ saveStatus: "saving", savingCount: count });
      (api as GameDraftStore).temporal.getState().resume();
    },
    select: (id, additive = false) => {
      (api as GameDraftStore).temporal.getState().pause();
      set((state) => ({ selectedIds: additive
        ? state.selectedIds.includes(id) ? state.selectedIds.filter((entry) => entry !== id) : [...state.selectedIds, id]
        : [id] }));
      (api as GameDraftStore).temporal.getState().resume();
    },
    selectMany: (ids, additive = false) => {
      (api as GameDraftStore).temporal.getState().pause();
      set((state) => ({ selectedIds: additive ? [...new Set([...state.selectedIds, ...ids])] : [...new Set(ids)] }));
      (api as GameDraftStore).temporal.getState().resume();
    },
    undo: () => {
      const before = get().document;
      const history = (api as GameDraftStore).temporal.getState();
      history.undo();
      const after = get().document;
      if (!before || !after || before === after) return;
      const ops = diffGameDocuments(before, after);
      history.pause();
      set((state) => ({ pendingOps: [...state.pendingOps, ...ops], saveStatus: "unsaved" }));
      history.resume();
    },
    redo: () => {
      const before = get().document;
      const history = (api as GameDraftStore).temporal.getState();
      history.redo();
      const after = get().document;
      if (!before || !after || before === after) return;
      const ops = diffGameDocuments(before, after);
      history.pause();
      set((state) => ({ pendingOps: [...state.pendingOps, ...ops], saveStatus: "unsaved" }));
      history.resume();
    }
  }), { partialize: (state) => ({ document: state.document }), equality: (a, b) => a.document === b.document, limit: 100 }));
  stores.set(gameId, store);
  return store;
}

export function useGameDraft<T>(gameId: string, selector: (state: GameDraftState) => T): T {
  return useStore(getGameDraftStore(gameId), selector);
}
