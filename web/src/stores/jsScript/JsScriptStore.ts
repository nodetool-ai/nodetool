/**
 * JsScriptStore
 *
 * Singleton Zustand store for the JS script workspace surface, modelled on
 * {@link useScriptStore}: every open script lives in one `scripts` map keyed by
 * its js_scripts row id, so the body, ports and test cases survive tab switches
 * without a provider wrapper.
 *
 * The stored value is the wire document itself (`JsScriptDocument` from
 * `@nodetool-ai/protocol`) plus the row's name — nothing is remodelled, so
 * autosave writes what the store holds and a server load replaces it whole.
 *
 * Usage:
 *   const document = useJsScriptDocument(id);        // reactive document view
 *   useJsScriptStore.getState().setCode(id, "…");    // mutate
 */

import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { jsScripts } from "@nodetool-ai/protocol/api-schemas";
import {
  pushHistory,
  undoHistory,
  redoHistory,
  clearHistory,
  type HistoryMap
} from "../documentHistory";

export type JsScriptDocument = jsScripts.JsScriptDocument;
export type JsScriptPort = jsScripts.JsScriptPort;
export type JsScriptTestCase = jsScripts.JsScriptTestCase;
export type JsScriptPalette = jsScripts.JsScriptPalette;

/** Default and ceiling mirrored from the protocol schema. */
export const JS_SCRIPT_DEFAULT_TIMEOUT_SECONDS = 30;
export const JS_SCRIPT_MAX_TIMEOUT_SECONDS = 120;

/** What one server run answered with — the run endpoint's response body. */
export interface JsScriptRunOutcome {
  ok: boolean;
  outputs?: Record<string, unknown>;
  streamed?: unknown[];
  logs: string[];
  error?: string;
  duration_ms: number;
}

/** One graded case: the run plus what it failed to match. */
export interface JsScriptTestCaseReport {
  name: string;
  ok: boolean;
  outputs?: Record<string, unknown>;
  streamed?: unknown[];
  logs: string[];
  error?: string;
  mismatches: { output: string; expected: unknown; actual: unknown }[];
}

export interface JsScriptTestReport {
  passed: number;
  failed: number;
  cases: JsScriptTestCaseReport[];
}

/** One open script: the row's name plus the document the editor writes. */
export interface JsScriptEntry {
  id: string;
  name: string;
  document: JsScriptDocument;
  /** Epoch ms of the last mutation; drives the autosave subscriber. */
  updatedAt: number;
}

/** Autosave lifecycle, same states the script editor surfaces. */
export type JsScriptSaveStatus =
  | "saved"
  | "unsaved"
  | "saving"
  | "error"
  | "reloaded";

interface JsScriptStoreState {
  scripts: Record<string, JsScriptEntry>;
  /** Server `updatedAt` token per script — the CAS base for the next save. */
  serverRevisions: Record<string, string>;
  saveStatus: Record<string, JsScriptSaveStatus>;
  /** Last run per script — transient, never saved. */
  lastRun: Record<string, JsScriptRunOutcome>;
  /** Last graded test report per script — transient, never saved. */
  lastTest: Record<string, JsScriptTestReport>;
  /** Scripts with a run or test in flight. */
  running: Record<string, true>;
  history: HistoryMap<JsScriptEntry>;

  undo: (scriptId: string) => void;
  redo: (scriptId: string) => void;

  setServerRevision: (scriptId: string, revision: string | null) => void;
  setSaveStatus: (scriptId: string, status: JsScriptSaveStatus) => void;
  ensureScript: (id: string) => void;
  loadScript: (
    id: string,
    entry: Omit<JsScriptEntry, "id" | "updatedAt">,
    options?: { checkpoint?: boolean }
  ) => void;
  /**
   * Apply a document merged with an external change. Stamps `updatedAt` so
   * autosave picks the result up, and records no undo checkpoint: an external
   * change never enters the undo stack (ADR 0001).
   */
  applyMerged: (id: string, entry: JsScriptEntry) => void;
  removeScript: (id: string) => void;
  getScript: (id: string) => JsScriptEntry | undefined;

  setName: (scriptId: string, name: string) => void;
  setDescription: (scriptId: string, description: string) => void;
  setCode: (scriptId: string, code: string) => void;
  setPorts: (
    scriptId: string,
    ports: { inputs?: JsScriptPort[]; outputs?: JsScriptPort[] }
  ) => void;
  setSecrets: (scriptId: string, secrets: string[]) => void;
  setTimeoutSeconds: (scriptId: string, timeoutSeconds: number) => void;
  setTests: (scriptId: string, tests: JsScriptTestCase[]) => void;
  /** Expose the script in the node menu, or (with null) stop exposing it. */
  setPalette: (scriptId: string, palette: JsScriptPalette | null) => void;

  setLastRun: (scriptId: string, outcome: JsScriptRunOutcome | null) => void;
  setLastTest: (scriptId: string, report: JsScriptTestReport | null) => void;
  setRunning: (scriptId: string, running: boolean) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export const emptyJsScriptDocument = (): JsScriptDocument => ({
  schemaVersion: 1,
  description: "",
  code: "",
  inputs: [],
  outputs: [],
  secrets: [],
  timeoutSeconds: JS_SCRIPT_DEFAULT_TIMEOUT_SECONDS,
  tests: []
});

const emptyEntry = (id: string): JsScriptEntry => ({
  id,
  name: "",
  document: emptyJsScriptDocument(),
  updatedAt: Date.now()
});

/** See {@link withScript}: `false` skips the undo checkpoint. */
type Track = false | { coalesceKey?: string };

/**
 * Apply `mutate` to the entry with `scriptId`. Returns the SAME state when the
 * script is absent or `mutate` returns the entry unchanged, so no-op edits do
 * not churn subscribers (the autosave subscriber keys off identity).
 */
const withScript = (
  state: JsScriptStoreState,
  scriptId: string,
  mutate: (entry: JsScriptEntry) => JsScriptEntry,
  track: Track = {}
): Partial<JsScriptStoreState> | JsScriptStoreState => {
  const entry = state.scripts[scriptId];
  if (!entry) return state;
  const next = mutate(entry);
  if (next === entry) return state;
  const now = Date.now();
  const patch: Partial<JsScriptStoreState> = {
    scripts: { ...state.scripts, [scriptId]: { ...next, updatedAt: now } }
  };
  if (track !== false) {
    patch.history = pushHistory(
      state.history,
      scriptId,
      entry,
      track.coalesceKey ?? null,
      now
    );
  }
  return patch;
};

/** Patch the document, keeping the entry identity on a no-op. */
const withDocument = (
  entry: JsScriptEntry,
  patch: Partial<JsScriptDocument>
): JsScriptEntry => {
  const keys = Object.keys(patch) as (keyof JsScriptDocument)[];
  const unchanged = keys.every((key) =>
    Object.is(entry.document[key], patch[key])
  );
  return unchanged
    ? entry
    : { ...entry, document: { ...entry.document, ...patch } };
};

// ── Store ────────────────────────────────────────────────────────────────────

export const useJsScriptStore = create<JsScriptStoreState>((set, get) => ({
  scripts: {},
  serverRevisions: {},
  saveStatus: {},
  lastRun: {},
  lastTest: {},
  running: {},
  history: {},

  undo: (scriptId) =>
    set((state) => {
      const current = state.scripts[scriptId];
      if (!current) return state;
      const result = undoHistory(state.history, scriptId, current);
      if (!result) return state;
      return {
        scripts: {
          ...state.scripts,
          [scriptId]: { ...result.restored, updatedAt: Date.now() }
        },
        history: result.history
      };
    }),

  redo: (scriptId) =>
    set((state) => {
      const current = state.scripts[scriptId];
      if (!current) return state;
      const result = redoHistory(state.history, scriptId, current);
      if (!result) return state;
      return {
        scripts: {
          ...state.scripts,
          [scriptId]: { ...result.restored, updatedAt: Date.now() }
        },
        history: result.history
      };
    }),

  setServerRevision: (scriptId, revision) =>
    set((state) => {
      const serverRevisions = { ...state.serverRevisions };
      if (revision === null) delete serverRevisions[scriptId];
      else serverRevisions[scriptId] = revision;
      return { serverRevisions };
    }),

  setSaveStatus: (scriptId, status) =>
    set((state) =>
      state.saveStatus[scriptId] === status
        ? state
        : { saveStatus: { ...state.saveStatus, [scriptId]: status } }
    ),

  ensureScript: (id) =>
    set((state) =>
      state.scripts[id]
        ? state
        : { scripts: { ...state.scripts, [id]: emptyEntry(id) } }
    ),

  loadScript: (id, entry, options) =>
    set((state) => {
      const prev = state.scripts[id];
      const next = { ...entry, id, updatedAt: Date.now() };
      const patch: Partial<JsScriptStoreState> = {
        scripts: { ...state.scripts, [id]: next }
      };
      if (options?.checkpoint && prev) {
        patch.history = pushHistory(
          state.history,
          id,
          prev,
          null,
          Date.now()
        );
      }
      return patch;
    }),

  applyMerged: (id, entry) =>
    set((state) => ({
      scripts: {
        ...state.scripts,
        [id]: { ...entry, id, updatedAt: Date.now() }
      }
    })),

  removeScript: (id) =>
    set((state) => {
      if (
        !(id in state.scripts) &&
        !(id in state.serverRevisions) &&
        !(id in state.saveStatus)
      ) {
        return state;
      }
      const scripts = { ...state.scripts };
      delete scripts[id];
      const serverRevisions = { ...state.serverRevisions };
      delete serverRevisions[id];
      const saveStatus = { ...state.saveStatus };
      delete saveStatus[id];
      const lastRun = { ...state.lastRun };
      delete lastRun[id];
      const lastTest = { ...state.lastTest };
      delete lastTest[id];
      return {
        scripts,
        serverRevisions,
        saveStatus,
        lastRun,
        lastTest,
        history: clearHistory(state.history, id)
      };
    }),

  getScript: (id) => get().scripts[id],

  setName: (scriptId, name) =>
    set((state) =>
      withScript(
        state,
        scriptId,
        (entry) => (entry.name === name ? entry : { ...entry, name }),
        { coalesceKey: "name" }
      )
    ),

  setDescription: (scriptId, description) =>
    set((state) =>
      withScript(
        state,
        scriptId,
        (entry) => withDocument(entry, { description }),
        { coalesceKey: "description" }
      )
    ),

  setCode: (scriptId, code) =>
    set((state) =>
      withScript(state, scriptId, (entry) => withDocument(entry, { code }), {
        coalesceKey: "code"
      })
    ),

  setPorts: (scriptId, ports) =>
    set((state) =>
      withScript(state, scriptId, (entry) => {
        const patch: Partial<JsScriptDocument> = {};
        if (ports.inputs) patch.inputs = ports.inputs;
        if (ports.outputs) patch.outputs = ports.outputs;
        return withDocument(entry, patch);
      })
    ),

  setSecrets: (scriptId, secrets) =>
    set((state) =>
      withScript(state, scriptId, (entry) => withDocument(entry, { secrets }))
    ),

  setTimeoutSeconds: (scriptId, timeoutSeconds) =>
    set((state) =>
      withScript(
        state,
        scriptId,
        (entry) =>
          withDocument(entry, {
            timeoutSeconds: Math.min(
              JS_SCRIPT_MAX_TIMEOUT_SECONDS,
              Math.max(1, Math.round(timeoutSeconds))
            )
          }),
        { coalesceKey: "timeout" }
      )
    ),

  setTests: (scriptId, tests) =>
    set((state) =>
      withScript(state, scriptId, (entry) => withDocument(entry, { tests }))
    ),

  setPalette: (scriptId, palette) =>
    set((state) =>
      withScript(
        state,
        scriptId,
        (entry) => {
          if (palette === null) {
            if (entry.document.palette === undefined) return entry;
            const document = { ...entry.document };
            delete document.palette;
            return { ...entry, document };
          }
          return entry.document.palette?.category === palette.category
            ? entry
            : { ...entry, document: { ...entry.document, palette } };
        },
        { coalesceKey: "palette" }
      )
    ),

  setLastRun: (scriptId, outcome) =>
    set((state) => {
      const lastRun = { ...state.lastRun };
      if (outcome === null) delete lastRun[scriptId];
      else lastRun[scriptId] = outcome;
      return { lastRun };
    }),

  setLastTest: (scriptId, report) =>
    set((state) => {
      const lastTest = { ...state.lastTest };
      if (report === null) delete lastTest[scriptId];
      else lastTest[scriptId] = report;
      return { lastTest };
    }),

  setRunning: (scriptId, running) =>
    set((state) => {
      const next = { ...state.running };
      if (running) next[scriptId] = true;
      else delete next[scriptId];
      return { running: next };
    })
}));

// ── Selector hooks ───────────────────────────────────────────────────────────

const EMPTY_DOCUMENT = emptyJsScriptDocument();
const EMPTY_PORTS: JsScriptPort[] = [];
const EMPTY_TESTS: JsScriptTestCase[] = [];

/** Reactive document for a script (the empty document before it loads). */
export const useJsScriptDocument = (id: string): JsScriptDocument =>
  useJsScriptStore((state) => state.scripts[id]?.document ?? EMPTY_DOCUMENT);

/** Reactive name — narrow, so typing in the body does not re-render the header. */
export const useJsScriptName = (id: string): string =>
  useJsScriptStore((state) => state.scripts[id]?.name ?? "");

/** Reactive body. */
export const useJsScriptCode = (id: string): string =>
  useJsScriptStore((state) => state.scripts[id]?.document.code ?? "");

/** Reactive declared ports (shallow-compared). */
export const useJsScriptPorts = (
  id: string
): { inputs: JsScriptPort[]; outputs: JsScriptPort[] } =>
  useJsScriptStore(
    useShallow((state) => ({
      inputs: state.scripts[id]?.document.inputs ?? EMPTY_PORTS,
      outputs: state.scripts[id]?.document.outputs ?? EMPTY_PORTS
    }))
  );

/** Reactive saved test cases. */
export const useJsScriptTests = (id: string): JsScriptTestCase[] =>
  useJsScriptStore((state) => state.scripts[id]?.document.tests ?? EMPTY_TESTS);

export const useJsScriptSaveStatus = (id: string): JsScriptSaveStatus =>
  useJsScriptStore((state) => state.saveStatus[id] ?? "saved");

export const useJsScriptLastRun = (id: string): JsScriptRunOutcome | null =>
  useJsScriptStore((state) => state.lastRun[id] ?? null);

export const useJsScriptLastTest = (id: string): JsScriptTestReport | null =>
  useJsScriptStore((state) => state.lastTest[id] ?? null);

export const useJsScriptRunning = (id: string): boolean =>
  useJsScriptStore((state) => state.running[id] === true);
