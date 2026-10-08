/**
 * Undo/redo stack for the 3D model editor.
 *
 * The scene lives in mutable three.js objects, not in a store, so history is a
 * list of commands that know how to apply and revert one edit. A command whose
 * `mergeKey` matches the previous one within {@link MERGE_WINDOW_MS} folds into
 * it, so a slider drag or a run of keystrokes in one field undoes as one step.
 */

export interface EditorCommand {
  /** Short description shown in the undo/redo tooltips, e.g. "Move Crate". */
  label: string;
  undo: () => void;
  redo: () => void;
  /**
   * Edits to the same field share a key so consecutive changes merge into one
   * undo step. Leave undefined for commands that must never merge.
   */
  mergeKey?: string;
  /**
   * Releases resources only this command holds, such as a deleted object's
   * geometry. Called when the command can no longer be reached: evicted from
   * the bottom of the stack, discarded by a new edit after undo, or cleared.
   * `undone` says which side of the command was live when it was dropped.
   */
  dispose?: (undone: boolean) => void;
}

export const MERGE_WINDOW_MS = 1000;
export const MAX_HISTORY = 200;

interface Entry {
  command: EditorCommand;
  at: number;
}

export interface EditorHistory {
  /** Record an edit that has already been applied to the scene. */
  push: (command: EditorCommand, now?: number) => void;
  undo: () => EditorCommand | null;
  redo: () => EditorCommand | null;
  canUndo: () => boolean;
  canRedo: () => boolean;
  undoLabel: () => string | null;
  redoLabel: () => string | null;
  /**
   * A number that identifies the current scene state. It changes on every
   * push, undo and redo, and returns to an earlier value when history returns
   * to that state, so comparing it with the value at the last save gives the
   * dirty flag.
   */
  revision: () => number;
  /** Drop every command, e.g. when a new file is loaded. */
  clear: () => void;
}

export const createEditorHistory = (
  maxEntries: number = MAX_HISTORY
): EditorHistory => {
  let entries: Entry[] = [];
  // Number of entries currently applied. entries[cursor - 1] is the last one.
  let cursor = 0;
  // Each entry keeps the revision of the state it produced. A push mints a new
  // revision, so undoing and redoing returns to the same number.
  let revisions: number[] = [];
  let nextRevision = 1;
  let baseRevision = 0;
  // Merging stops after an undo or redo, so the next edit starts a new step.
  let mergeable = true;

  const dropRedoTail = () => {
    for (const entry of entries.slice(cursor)) {
      entry.command.dispose?.(true);
    }
    entries = entries.slice(0, cursor);
    revisions = revisions.slice(0, cursor);
  };

  return {
    push: (command, now = Date.now()) => {
      dropRedoTail();
      const last = entries[cursor - 1];
      if (
        mergeable &&
        last &&
        command.mergeKey !== undefined &&
        last.command.mergeKey === command.mergeKey &&
        now - last.at <= MERGE_WINDOW_MS
      ) {
        const first = last.command;
        last.command = {
          label: first.label,
          mergeKey: first.mergeKey,
          undo: first.undo,
          redo: command.redo,
          dispose: (undone) => {
            first.dispose?.(undone);
            command.dispose?.(undone);
          }
        };
        last.at = now;
        revisions[cursor - 1] = nextRevision++;
        return;
      }
      entries.push({ command, at: now });
      revisions.push(nextRevision++);
      cursor = entries.length;
      mergeable = true;
      while (entries.length > maxEntries) {
        const evicted = entries.shift();
        const evictedRevision = revisions.shift();
        evicted?.command.dispose?.(false);
        if (evictedRevision !== undefined) {
          baseRevision = evictedRevision;
        }
        cursor -= 1;
      }
    },
    undo: () => {
      if (cursor === 0) {
        return null;
      }
      cursor -= 1;
      const { command } = entries[cursor];
      command.undo();
      mergeable = false;
      return command;
    },
    redo: () => {
      if (cursor >= entries.length) {
        return null;
      }
      const { command } = entries[cursor];
      command.redo();
      cursor += 1;
      mergeable = false;
      return command;
    },
    canUndo: () => cursor > 0,
    canRedo: () => cursor < entries.length,
    undoLabel: () => (cursor > 0 ? entries[cursor - 1].command.label : null),
    redoLabel: () =>
      cursor < entries.length ? entries[cursor].command.label : null,
    revision: () => (cursor === 0 ? baseRevision : revisions[cursor - 1]),
    clear: () => {
      entries.forEach((entry, index) => entry.command.dispose?.(index >= cursor));
      entries = [];
      revisions = [];
      cursor = 0;
      baseRevision = nextRevision++;
      mergeable = true;
    }
  };
};
