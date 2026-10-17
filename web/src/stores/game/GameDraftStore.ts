import { createStore, type StoreApi } from "zustand/vanilla";
import { useStore } from "zustand";
import { gameDocument3D, type AnyGameDocument as GameDocument } from "@nodetool-ai/protocol";
import { applyAnyGameOps, gameDocumentOp3D, validateAnyGame, type AnyGameDocumentOp as GameDocumentOp } from "@nodetool-ai/game-runtime";

import { acceptServerAnyGameUnit } from "./anyMerge";
import { diffAnyGameDocuments as diffGameDocuments } from "./diffAnyGameDocuments";
import { diffGameOwnership } from "./diffGameOwnership";

function applyGameOps(document: GameDocument, ops: readonly GameDocumentOp[]): GameDocument {
  if (document.schemaVersion !== 3 || !ops.every((op) => op.op === "set_animation_graph" || op.op === "remove_animation_graph")) {
    return applyAnyGameOps(document, ops);
  }
  const graphs = { ...document.animationGraphs };
  for (const value of ops) {
    const op = gameDocumentOp3D.parse(value);
    if (op.op === "set_animation_graph") { graphs[op.graph_id] = op.graph; }
    else if (op.op === "remove_animation_graph") { delete graphs[op.graph_id]; }
  }
  const { animationGraphs: _previous, ...rest } = document;
  return gameDocument3D.parse(Object.keys(graphs).length ? { ...rest, animationGraphs: graphs } : rest);
}

function structuralVersions(versions: Readonly<Record<string, number>>, ops: readonly GameDocumentOp[]): Readonly<Record<string, number>> {
  const next = new Map(Object.entries(versions));
  for (const op of ops) {
    const structural = op.op === "add_behavior" || op.op === "remove_behavior" || op.op === "move_behavior" || op.op === "update_behavior"
      || (op.op === "update_entity" && Object.hasOwn(op.set, "behaviors")) || op.op === "set_document" || op.op === "set_prefab";
    if (structural) {
      const key = "entity_id" in op ? op.entity_id : "*";
      next.set(key, (next.get(key) ?? 0) + 1);
    }
  }
  return Object.fromEntries(next);
}
function replacedVersions(versions: Readonly<Record<string, number>>): Readonly<Record<string, number>> {
  return { ...versions, "*": (versions["*"] ?? 0) + 1 };
}

function diagnosticKey(diagnostic: { readonly code?: string; readonly path: readonly (string | number)[] }): string {
  return `${diagnostic.code}|${JSON.stringify(diagnostic.path)}`;
}

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
export interface GameEntityTarget {
  readonly sceneId: string;
  readonly entityId: string;
}
interface GameEntitySelection {
  readonly sceneId: string;
  readonly entityIds: readonly string[];
}
interface GameDraftState {
  behaviorStructureVersions: Readonly<Record<string, number>>;
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
  selectedSceneId: string | null;
  commandHistory: GameCommandHistory;
  canUndo: boolean;
  canRedo: boolean;
  load: (document: GameDocument, baseUpdatedAt: string) => void;
  /** Adopt `server` as the saved draft and `document` as the local one. `keepHistory` keeps undo and redo across the rebase. */
  applyMerged: (document: GameDocument, server: GameDocument, baseUpdatedAt: string, options?: { readonly keepHistory?: boolean }) => void;
  acceptConflict: (server: GameDocument, kind: string, unitId: string) => void;
  apply: (ops: GameDocumentOp[], options?: GameCommandOptions) => boolean;
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
  select: (id: string | GameEntityTarget, additive?: boolean) => void;
  selectMany: (ids: string[] | GameEntitySelection, additive?: boolean) => void;
  undo: () => void;
  redo: () => void;
}

type GameDraftStore = StoreApi<GameDraftState>;
const stores = new Map<string, GameDraftStore>();
function reconciledSelection(document: GameDocument, state: Pick<GameDraftState, "selectedIds" | "selectedSceneId">) {
  if (state.selectedSceneId === null) { return {}; }
  const scene = document.scenes.find((entry) => entry.id === state.selectedSceneId);
  const ids = new Set(scene?.entities.map((entity) => entity.id));
  return { selectedSceneId: scene?.id ?? null, selectedIds: state.selectedIds.filter((id) => ids.has(id)) };
}
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
    behaviorStructureVersions: {}, document: null, savedDocument: null, baseUpdatedAt: null, pendingOps: [], savingCount: 0, documentSaveRequired: false,
    saveStatus: "saved", error: null, selectedIds: [], selectedSceneId: null, ...historyState([], []),
    load: (document, baseUpdatedAt) => {
      retryPrefixCount = 0;
      closeCoalescing();
      set({ ...reconciledSelection(document, get()), behaviorStructureVersions: replacedVersions(get().behaviorStructureVersions), document, savedDocument: document, baseUpdatedAt, pendingOps: [], savingCount: 0, documentSaveRequired: false,
        saveStatus: "saved", error: null, ...historyState([], []) });
    },
    applyMerged: (document, server, baseUpdatedAt, options) => {
      const validation = validateAnyGame(document);
      if (!validation.valid) {
        set({ error: validation.diagnostics.map((issue) => issue.message).join(", ") });
        throw new Error(validation.diagnostics.map((issue) => issue.message).join(", "));
      }
      const pendingOps = diffGameDocuments(server, validation.document);
      validateReplay(server, pendingOps, validation.document);
      retryPrefixCount = 0;
      closeCoalescing();
      const { past, future } = options?.keepHistory ? get().commandHistory : { past: [], future: [] };
      set({ ...reconciledSelection(validation.document, get()), behaviorStructureVersions: replacedVersions(get().behaviorStructureVersions), document: validation.document, savedDocument: server, baseUpdatedAt, pendingOps, savingCount: 0, documentSaveRequired: false,
        saveStatus: pendingOps.length ? "unsaved" : "saved", error: null, ...historyState(past, future) });
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
      if (!before || ops.length === 0) { return false; }
      try {
        const document = applyGameOps(before, ops);
        const known = new Set(validateAnyGame(before).diagnostics.map(diagnosticKey));
        const introduced = validateAnyGame(document).diagnostics.find((diagnostic) => !known.has(diagnosticKey(diagnostic)));
        if (introduced) { throw new Error(introduced.message); }
        if (same(before, document)) { return true; }
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
        const behaviorStructureVersions = structuralVersions(state.behaviorStructureVersions, ops);
        set({ ...reconciledSelection(document, state), document, behaviorStructureVersions, pendingOps, saveStatus: "unsaved", error: null, ...historyState(past, []) });
        if (gestureMatches && gesture) { gesture = { id: gesture.id, key: options?.mergeKey, before: commandBefore, index: past.length - 1 }; }
        else { gesture = null; }
        lastScriptEdit = scriptKey ? { key: scriptKey, time: Date.now(), before: commandBefore, index: past.length - 1 } : null;
        lastScriptQueue = scriptKey ? { key: scriptKey, before: queueBefore, start: queueStart } : null;
        return true;
      } catch (cause) { set({ error: cause instanceof Error ? cause.message : String(cause) }); return false; }
    },
    acknowledge: (document, baseUpdatedAt, savedCount) => {
      retryPrefixCount = Math.max(0, retryPrefixCount - savedCount);
      if (lastScriptQueue) {
        lastScriptQueue = lastScriptQueue.start >= savedCount
          ? { ...lastScriptQueue, start: lastScriptQueue.start - savedCount } : null;
      }
      const current = get();
      const remaining = current.pendingOps.slice(savedCount);
      const behaviorLists = (value: GameDocument): unknown => [
        value.scenes.map((scene) => [scene.id, scene.entities.map((entity) => [entity.id, entity.behaviors])]),
        value.schemaVersion === 3 ? Object.entries(value.prefabs).map(([id, prefab]) => [id, prefab.entities.map((entity) => [entity.id, entity.behaviors])]) : []
      ];
      const behaviorStructureVersions = remaining.length === 0 && current.document && !same(behaviorLists(current.document), behaviorLists(document))
        ? replacedVersions(current.behaviorStructureVersions) : current.behaviorStructureVersions;
      set({ ...reconciledSelection(remaining.length === 0 ? document : current.document ?? document, current), behaviorStructureVersions, savedDocument: document, baseUpdatedAt, pendingOps: remaining, savingCount: 0, documentSaveRequired: false,
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
    select: (target, additive = false) => {
      const state = get();
      const id = typeof target === "string" ? target : target.entityId;
      const selectedSceneId = typeof target === "string" ? null : target.sceneId;
      const previous = selectedSceneId === state.selectedSceneId ? state.selectedIds : [];
      const selectedIds = additive
        ? previous.includes(id) ? previous.filter((entry) => entry !== id) : [...previous, id]
        : [id];
      if (!same(selectedIds, state.selectedIds) || selectedSceneId !== state.selectedSceneId) {
        closeCoalescing(); set({ selectedIds, selectedSceneId });
      }
    },
    selectMany: (target, additive = false) => {
      const state = get();
      const ids = Array.isArray(target) ? target : target.entityIds;
      const selectedSceneId = Array.isArray(target) ? null : target.sceneId;
      const previous = selectedSceneId === state.selectedSceneId ? state.selectedIds : [];
      const selectedIds = [...new Set(additive ? [...previous, ...ids] : ids)];
      if (!same(selectedIds, state.selectedIds) || selectedSceneId !== state.selectedSceneId) {
        closeCoalescing(); set({ selectedIds, selectedSceneId });
      }
    },
    undo: () => {
      const state = get(), command = state.commandHistory.past.at(-1);
      if (!state.document || !command) { return; }
      try {
        const document = applyGameOps(state.document, command.inverseOps);
        const pendingOps = rebuildHistoryQueue(state, document, Math.max(state.savingCount, retryPrefixCount));
        closeCoalescing();
        set({ ...reconciledSelection(document, state), document, behaviorStructureVersions: structuralVersions(state.behaviorStructureVersions, command.inverseOps), pendingOps, saveStatus: pendingOps.length === 0 ? "saved" : "unsaved", error: null,
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
        set({ ...reconciledSelection(document, state), document, behaviorStructureVersions: structuralVersions(state.behaviorStructureVersions, command.ops), pendingOps, saveStatus: pendingOps.length === 0 ? "saved" : "unsaved", error: null,
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
