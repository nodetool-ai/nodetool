import { createStore, type StoreApi } from "zustand/vanilla";
import { useStore } from "zustand";
import type { AnyGameDocument as GameDocument } from "@nodetool-ai/protocol";
import { applyAnyGameOps as applyGameOps, validateAnyGame, type AnyGameDocumentOp as GameDocumentOp } from "@nodetool-ai/game-runtime";

import { acceptServerAnyGameUnit } from "./anyMerge";
import { diffAnyGameDocuments as diffGameDocuments } from "./diffAnyGameDocuments";
import { diffGameOwnership } from "./diffGameOwnership";

export type GameSaveStatus = "saved" | "unsaved" | "saving" | "error";
export interface GameCommand {
  readonly label: string;
  readonly ops: readonly GameDocumentOp[];
  readonly inverseOps: readonly GameDocumentOp[];
  readonly mergeKey?: string;
}
export interface GameCommandOptions {
  readonly label: string;
  readonly mergeKey?: string;
  readonly gestureId?: number;
}
export interface GameCommandHistory {
  readonly past: readonly GameCommand[];
  readonly future: readonly GameCommand[];
}
interface GameDraftState {
  document: GameDocument | null;
  savedDocument: GameDocument | null;
  baseUpdatedAt: string | null;
  pendingOps: GameDocumentOp[];
  savingCount: number;
  /** Set after the server rejected an op batch. The next save sends the whole document instead. */
  documentSaveRequired: boolean;
  saveStatus: GameSaveStatus;
  error: string | null;
  selectedIds: string[];
  commandHistory: GameCommandHistory;
  canUndo: boolean;
  canRedo: boolean;
  load: (document: GameDocument, baseUpdatedAt: string) => void;
  applyMerged: (document: GameDocument, server: GameDocument, baseUpdatedAt: string) => void;
  acceptConflict: (server: GameDocument, kind: string, unitId: string) => void;
  apply: (ops: GameDocumentOp[], options?: GameCommandOptions) => void;
  beginGesture: () => number;
  endGesture: (gestureId: number) => void;
  acknowledge: (document: GameDocument, baseUpdatedAt: string, savedCount: number) => void;
  failSave: (error: string) => void;
  reportOperationError: (error: string) => void;
  setSaving: (count: number) => void;
  captureSaveOps: () => GameDocumentOp[];
  /** Protect every pending op and return the document they produce. */
  captureSaveDocument: () => { count: number; document: GameDocument } | null;
  requireDocumentSave: () => void;
  select: (id: string, additive?: boolean) => void;
  selectMany: (ids: string[], additive?: boolean) => void;
  undo: () => void;
  redo: () => void;
}

type GameDraftStore = StoreApi<GameDraftState>;
const stores = new Map<string, GameDraftStore>();
const HISTORY_LIMIT = 100;
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function same(left: unknown, right: unknown): boolean {
  if (left === right) { return true; }
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length
      && left.every((value, index) => same(value, right[index]));
  }
  if (!isRecord(left) || !isRecord(right)) { return false; }
  const keys = Object.keys(left).filter((key) => left[key] !== undefined);
  return keys.length === Object.keys(right).filter((key) => right[key] !== undefined).length
    && keys.every((key) => Object.prototype.hasOwnProperty.call(right, key) && same(left[key], right[key]));
}
function historyState(past: readonly GameCommand[], future: readonly GameCommand[]) {
  return { commandHistory: { past, future }, canUndo: past.length > 0, canRedo: future.length > 0 };
}
function fallbackLabel(ops: readonly GameDocumentOp[]): string {
  const op = ops[0];
  if (ops.length !== 1 || !op) { return "Edit Game"; }
  if (op.op === "set_script") { return "Edit Script"; }
  if (op.op === "set_script_params") { return "Change Script Parameters"; }
  if (op.op === "update_entity") { return "Change Entity"; }
  if (op.op === "update_scene") { return "Change Scene"; }
  if (op.op === "add_entity") { return "Add Entity"; }
  if (op.op === "remove_entity") { return "Remove Entity"; }
  return "Edit Game";
}
function validateReplay(before: GameDocument, ops: readonly GameDocumentOp[], desired: GameDocument): void {
  if (!same(applyGameOps(before, ops), desired)) { throw new Error("Game command operations do not reproduce the captured document"); }
}
function rebuildHistoryQueue(state: GameDraftState, document: GameDocument, protectedCount: number): GameDocumentOp[] {
  if (!state.savedDocument) { throw new Error("Saved game document missing"); }
  const prefix = state.pendingOps.slice(0, protectedCount);
  const before = prefix.length === 0 ? state.savedDocument : applyGameOps(state.savedDocument, prefix);
  const suffix = diffGameDocuments(before, document);
  validateReplay(before, suffix, document);
  const pendingOps = [...prefix, ...suffix];
  validateReplay(state.savedDocument, pendingOps, document);
  return pendingOps;
}
function createCommand(before: GameDocument, after: GameDocument, ops: readonly GameDocumentOp[], label: string,
  mergeKey?: string): GameCommand {
  const inverseOps = diffGameDocuments(after, before);
  validateReplay(before, ops, after);
  validateReplay(after, inverseOps, before);
  const command: GameCommand = { label, ops: structuredClone(ops), inverseOps: structuredClone(inverseOps), mergeKey };
  return command;
}

export function getGameDraftStore(gameId: string): GameDraftStore {
  const existing = stores.get(gameId);
  if (existing) { return existing; }
  let gestureSequence = 0;
  let retryPrefixCount = 0;
  let gesture: { id: number; key?: string; before?: GameDocument; index?: number } | null = null;
  let lastScriptEdit: { key: string; time: number; before: GameDocument; index: number } | null = null;
  let lastScriptQueue: { key: string; before: GameDocument; start: number } | null = null;
  function closeCoalescing(): void { gesture = null; lastScriptEdit = null; lastScriptQueue = null; }
  const store = createStore<GameDraftState>()((set, get) => ({
    document: null, savedDocument: null, baseUpdatedAt: null, pendingOps: [], savingCount: 0, documentSaveRequired: false,
    saveStatus: "saved", error: null, selectedIds: [], ...historyState([], []),
    load: (document, baseUpdatedAt) => {
      retryPrefixCount = 0;
      closeCoalescing();
      set({ document, savedDocument: document, baseUpdatedAt, pendingOps: [], savingCount: 0, documentSaveRequired: false,
        saveStatus: "saved", error: null, ...historyState([], []) });
    },
    applyMerged: (document, server, baseUpdatedAt) => {
      const validation = validateAnyGame(document);
      if (!validation.valid) {
        get().load(server, baseUpdatedAt);
        throw new Error(validation.diagnostics.map((issue) => issue.message).join(", "));
      }
      const pendingOps = diffGameDocuments(server, validation.document);
      validateReplay(server, pendingOps, validation.document);
      retryPrefixCount = 0;
      closeCoalescing();
      set({ document: validation.document, savedDocument: server, baseUpdatedAt, pendingOps, savingCount: 0, documentSaveRequired: false,
        saveStatus: pendingOps.length ? "unsaved" : "saved", error: null, ...historyState([], []) });
    },
    acceptConflict: (server, kind, unitId) => {
      const current = get();
      if (!current.document || !current.savedDocument || !current.baseUpdatedAt) { return; }
      current.applyMerged(acceptServerAnyGameUnit(current.document, server, kind, unitId), current.savedDocument, current.baseUpdatedAt);
    },
    beginGesture: () => {
      closeCoalescing();
      gesture = { id: ++gestureSequence };
      return gesture.id;
    },
    endGesture: (id) => { if (gesture?.id === id) { closeCoalescing(); } },
    apply: (ops, options) => {
      const state = get(), before = state.document;
      if (!before || ops.length === 0) { return; }
      try {
        const document = applyGameOps(before, ops);
        if (same(before, document)) { return; }
        const changesDefinitions = ops.some((op) => op.op === "set_document");
        const forward = changesDefinitions ? structuredClone(ops) : [...structuredClone(ops), ...diffGameOwnership(before, document, document)];
        const script = ops.length === 1 && ops[0].op === "set_script" ? ops[0] : null;
        const scriptKey = script ? `${script.scene_id ?? ""}:${script.entity_id}:${script.index}` : null;
        const gestureMatches = gesture !== null && gesture.id === options?.gestureId && options.mergeKey !== undefined
          && (gesture.key === undefined || gesture.key === options.mergeKey);
        const scriptMatches = scriptKey !== null && lastScriptEdit?.key === scriptKey && Date.now() - lastScriptEdit.time < 500;
        const coalescingBase = gestureMatches ? gesture?.before : scriptMatches ? lastScriptEdit?.before : undefined;
        const coalescingIndex = gestureMatches ? gesture?.index : scriptMatches ? lastScriptEdit?.index : undefined;
        const coalesce = coalescingBase !== undefined && coalescingIndex === state.commandHistory.past.length - 1;
        const commandBefore = coalesce ? coalescingBase : before;
        const commandOps = coalesce ? diffGameDocuments(commandBefore, document) : forward;
        const previous = coalesce ? state.commandHistory.past.at(-1) : undefined;
        const command = createCommand(commandBefore, document, commandOps, previous?.label ?? options?.label ?? fallbackLabel(ops), options?.mergeKey);
        const past = (coalesce ? [...state.commandHistory.past.slice(0, -1), command] : [...state.commandHistory.past, command]).slice(-HISTORY_LIMIT);
        const compactQueue = scriptKey !== null && lastScriptQueue?.key === scriptKey
          && lastScriptQueue.start >= Math.max(state.savingCount, retryPrefixCount) ? lastScriptQueue : null;
        const queueStart = compactQueue ? compactQueue.start : state.pendingOps.length;
        const queueBefore = compactQueue ? compactQueue.before : before;
        const queueOps = compactQueue ? diffGameDocuments(queueBefore, document) : forward;
        validateReplay(queueBefore, queueOps, document);
        const pendingOps = [...state.pendingOps.slice(0, queueStart), ...structuredClone(queueOps)];
        set({ document, pendingOps, saveStatus: "unsaved", error: null, ...historyState(past, []) });
        if (gestureMatches && gesture) { gesture = { id: gesture.id, key: options?.mergeKey, before: commandBefore, index: past.length - 1 }; }
        else { gesture = null; }
        lastScriptEdit = scriptKey ? { key: scriptKey, time: Date.now(), before: commandBefore, index: past.length - 1 } : null;
        lastScriptQueue = scriptKey ? { key: scriptKey, before: queueBefore, start: queueStart } : null;
      } catch (cause) { set({ error: cause instanceof Error ? cause.message : String(cause) }); }
    },
    acknowledge: (document, baseUpdatedAt, savedCount) => {
      retryPrefixCount = Math.max(0, retryPrefixCount - savedCount);
      if (lastScriptQueue) {
        lastScriptQueue = lastScriptQueue.start >= savedCount
          ? { ...lastScriptQueue, start: lastScriptQueue.start - savedCount } : null;
      }
      const remaining = get().pendingOps.slice(savedCount);
      set({ savedDocument: document, baseUpdatedAt, pendingOps: remaining, savingCount: 0, documentSaveRequired: false,
        document: remaining.length === 0 ? document : get().document,
        saveStatus: remaining.length === 0 ? "saved" : "unsaved", error: null });
    },
    reportOperationError: (error) => { set({ error }); },
    failSave: (error) => {
      retryPrefixCount = Math.max(retryPrefixCount, get().savingCount);
      set({ saveStatus: "error", savingCount: 0, error });
    },
    captureSaveOps: () => {
      const state = get();
      const protectedCount = Math.max(state.savingCount, retryPrefixCount);
      return structuredClone(protectedCount > 0 ? state.pendingOps.slice(0, protectedCount) : state.pendingOps);
    },
    captureSaveDocument: () => {
      const state = get();
      if (!state.document || state.pendingOps.length === 0) { return null; }
      return { count: state.pendingOps.length, document: structuredClone(state.document) };
    },
    requireDocumentSave: () => { set({ documentSaveRequired: true }); },
    setSaving: (count) => { set({ saveStatus: "saving", savingCount: count }); },
    select: (id, additive = false) => {
      const selectedIds = additive
        ? get().selectedIds.includes(id) ? get().selectedIds.filter((entry) => entry !== id) : [...get().selectedIds, id]
        : [id];
      if (!same(selectedIds, get().selectedIds)) { closeCoalescing(); set({ selectedIds }); }
    },
    selectMany: (ids, additive = false) => {
      const selectedIds = [...new Set(additive ? [...get().selectedIds, ...ids] : ids)];
      if (!same(selectedIds, get().selectedIds)) { closeCoalescing(); set({ selectedIds }); }
    },
    undo: () => {
      const state = get(), command = state.commandHistory.past.at(-1);
      if (!state.document || !command) { return; }
      try {
        const document = applyGameOps(state.document, command.inverseOps);
        const pendingOps = rebuildHistoryQueue(state, document, Math.max(state.savingCount, retryPrefixCount));
        closeCoalescing();
        set({ document, pendingOps, saveStatus: pendingOps.length === 0 ? "saved" : "unsaved", error: null,
          ...historyState(state.commandHistory.past.slice(0, -1), [...state.commandHistory.future, command]) });
      } catch (cause) { set({ error: cause instanceof Error ? cause.message : String(cause) }); }
    },
    redo: () => {
      const state = get(), command = state.commandHistory.future.at(-1);
      if (!state.document || !command) { return; }
      try {
        const document = applyGameOps(state.document, command.ops);
        const pendingOps = rebuildHistoryQueue(state, document, Math.max(state.savingCount, retryPrefixCount));
        closeCoalescing();
        set({ document, pendingOps, saveStatus: pendingOps.length === 0 ? "saved" : "unsaved", error: null,
          ...historyState([...state.commandHistory.past, command].slice(-HISTORY_LIMIT), state.commandHistory.future.slice(0, -1)) });
      } catch (cause) { set({ error: cause instanceof Error ? cause.message : String(cause) }); }
    }
  }));
  stores.set(gameId, store);
  return store;
}

export function useGameDraft<T>(gameId: string, selector: (state: GameDraftState) => T): T {
  return useStore(getGameDraftStore(gameId), selector);
}
