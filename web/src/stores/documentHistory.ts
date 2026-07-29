/**
 * documentHistory
 *
 * Per-document undo/redo stacks for the singleton, Record-keyed workspace
 * stores (script, storyboard). Unlike the timeline/graph editors — one
 * `temporal`-wrapped store per open document — these stores hold every open
 * document in one map, so a single `temporal` wrapper would give one undo stack
 * shared across all of them. Instead each document id gets its own past/future
 * stack, keyed the same way its content is.
 *
 * A checkpoint is the whole document snapshot taken *before* a mutation. Undo
 * restores the most recent checkpoint (pushing the current document onto the
 * redo stack); redo reverses it. Rapid same-field edits (typing into one text
 * field) fold into a single checkpoint via `coalesceKey` so undo steps back a
 * word, not a keystroke.
 *
 * These are pure functions over the history map; the stores own the `Record`
 * of documents and decide which mutations record a checkpoint.
 */

export interface DocHistory<Doc> {
  /** Checkpoints oldest-first; the last is the most recent undo target. */
  past: Doc[];
  /** Redo checkpoints; the last is the next redo target. */
  future: Doc[];
  /** Field key of the last checkpoint, for folding rapid same-field edits. */
  coalesceKey: string | null;
  /** Epoch ms of the last checkpoint, paired with `coalesceKey`. */
  coalesceAt: number;
}

export type HistoryMap<Doc> = Record<string, DocHistory<Doc>>;

/** Max checkpoints retained per document; oldest dropped first. */
export const HISTORY_LIMIT = 100;
/** Same-field edits within this window fold into one checkpoint. */
export const HISTORY_COALESCE_MS = 500;

const emptyHistory = <Doc>(): DocHistory<Doc> => ({
  past: [],
  future: [],
  coalesceKey: null,
  coalesceAt: 0
});

/**
 * Record `prevDoc` (the document as it was before the mutation) as an undo
 * checkpoint for `id`, clearing the redo stack. When `coalesceKey` matches the
 * previous checkpoint's and lands within {@link HISTORY_COALESCE_MS}, the edit
 * folds into that checkpoint instead of pushing a new one, so a run of
 * keystrokes collapses to a single undo step.
 */
export const pushHistory = <Doc>(
  history: HistoryMap<Doc>,
  id: string,
  prevDoc: Doc,
  coalesceKey: string | null,
  now: number
): HistoryMap<Doc> => {
  const entry = history[id] ?? emptyHistory<Doc>();

  const fold =
    coalesceKey !== null &&
    entry.coalesceKey === coalesceKey &&
    now - entry.coalesceAt < HISTORY_COALESCE_MS &&
    entry.past.length > 0;

  if (fold) {
    // Keep the existing pre-edit checkpoint; just slide the coalesce clock and
    // drop any redo branch (this is still a fresh edit).
    const future = entry.future.length === 0 ? entry.future : [];
    return { ...history, [id]: { ...entry, future, coalesceAt: now } };
  }

  const past =
    entry.past.length >= HISTORY_LIMIT
      ? entry.past.slice(entry.past.length - HISTORY_LIMIT + 1)
      : entry.past;

  return {
    ...history,
    [id]: {
      past: [...past, prevDoc],
      future: [],
      coalesceKey,
      coalesceAt: coalesceKey !== null ? now : 0
    }
  };
};

/**
 * Pop the most recent checkpoint for `id`, returning the document to restore
 * and the history with `currentDoc` moved onto the redo stack. Returns null
 * when there is nothing to undo.
 */
export const undoHistory = <Doc>(
  history: HistoryMap<Doc>,
  id: string,
  currentDoc: Doc
): { restored: Doc; history: HistoryMap<Doc> } | null => {
  const entry = history[id];
  if (!entry || entry.past.length === 0) {
    return null;
  }
  const restored = entry.past[entry.past.length - 1];
  return {
    restored,
    history: {
      ...history,
      [id]: {
        past: entry.past.slice(0, -1),
        future: [...entry.future, currentDoc],
        coalesceKey: null,
        coalesceAt: 0
      }
    }
  };
};

/** Mirror of {@link undoHistory} for the redo stack. */
export const redoHistory = <Doc>(
  history: HistoryMap<Doc>,
  id: string,
  currentDoc: Doc
): { restored: Doc; history: HistoryMap<Doc> } | null => {
  const entry = history[id];
  if (!entry || entry.future.length === 0) {
    return null;
  }
  const restored = entry.future[entry.future.length - 1];
  return {
    restored,
    history: {
      ...history,
      [id]: {
        past: [...entry.past, currentDoc],
        future: entry.future.slice(0, -1),
        coalesceKey: null,
        coalesceAt: 0
      }
    }
  };
};

/** Drop all history for `id` (document closed or replaced from the server). */
export const clearHistory = <Doc>(
  history: HistoryMap<Doc>,
  id: string
): HistoryMap<Doc> => {
  if (!(id in history)) {
    return history;
  }
  const next = { ...history };
  delete next[id];
  return next;
};

export const canUndo = <Doc>(history: HistoryMap<Doc>, id: string): boolean =>
  (history[id]?.past.length ?? 0) > 0;

export const canRedo = <Doc>(history: HistoryMap<Doc>, id: string): boolean =>
  (history[id]?.future.length ?? 0) > 0;
