/**
 * History rows — turn the undo history into the list the History panel shows:
 * one row per distinct document state, labelled by the edit that produced it.
 *
 * History entries are snapshots, pushed with two conventions (see
 * `PushHistoryOptions.timing`). An `after` entry holds the result of its
 * action. A `before` entry holds the state *before* its action, so the state
 * that action produced is the next entry, or the live document when nothing
 * has been pushed since. A `before` entry that directly follows an `after`
 * entry repeats that entry's state and gets no row of its own.
 */

import type { HistoryEntry } from "../types";

/** Action label undo gives the snapshot it appends of an unrecorded edit. */
const UNRECORDED_TIP_ACTION = "current state";

export interface HistoryRow {
  /** History index to restore, or `null` for the live, unrecorded edit. */
  index: number | null;
  label: string;
  /** The document is currently in this state. */
  current: boolean;
  /** A redo step: undone, and reachable again until the next edit. */
  undone: boolean;
}

function capitalize(text: string): string {
  return text.length > 0 ? text[0]!.toUpperCase() + text.slice(1) : text;
}

/** Label of the state an entry restores, or `null` when it repeats the previous state. */
function stateLabel(history: readonly HistoryEntry[], index: number): string | null {
  const entry = history[index]!;
  if (index === 0) {
    return entry.timing === "before" ? "Open" : capitalize(entry.action);
  }
  const prev = history[index - 1]!;
  if (entry.action === UNRECORDED_TIP_ACTION || entry.timing === "before") {
    // Reached by the edit the previous checkpoint was pushed ahead of.
    return prev.timing === "before" ? capitalize(prev.action) : null;
  }
  return capitalize(entry.action);
}

export function buildHistoryRows(
  history: readonly HistoryEntry[],
  historyIndex: number,
  hasUncommittedTip: boolean
): HistoryRow[] {
  const rows: HistoryRow[] = [];
  // The visible row whose state matches the entry at historyIndex.
  let currentRow = -1;
  for (let i = 0; i < history.length; i++) {
    const label = stateLabel(history, i);
    if (label !== null) {
      rows.push({ index: i, label, current: false, undone: i > historyIndex });
    }
    if (i === historyIndex) {
      currentRow = rows.length - 1;
    }
  }
  if (hasUncommittedTip && history.length > 0) {
    const last = history[history.length - 1]!;
    rows.push({
      index: null,
      label: last.timing === "before" ? capitalize(last.action) : "Edit",
      current: true,
      undone: false
    });
  } else if (currentRow >= 0) {
    rows[currentRow] = { ...rows[currentRow]!, current: true, undone: false };
  }
  return rows;
}
