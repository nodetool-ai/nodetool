/**
 * Keeps a timeline instance's document as it was loaded.
 *
 * The marketing embed mounts the real editor so a visitor can scrub, zoom,
 * select and play. Selection, zoom and the playhead live in the UI and
 * playback stores. Every edit lands in the document store, so restoring the
 * document fields after each change makes the editor read-only without
 * touching the editor's own code.
 */
import type { TimelineStoreApi, TimelineStoreState } from "../../../stores/timeline/TimelineStore";

const DOCUMENT_FIELDS = [
  "fps",
  "width",
  "height",
  "durationMs",
  "tracks",
  "trackFolders",
  "clips",
  "markers",
  "mediaTracks",
  "transcript",
  "scriptEnabled",
  "tempo",
  "master",
  "camera2d"
] as const satisfies readonly (keyof TimelineStoreState)[];

type DocumentSnapshot = Pick<TimelineStoreState, (typeof DOCUMENT_FIELDS)[number]>;

function snapshot(state: TimelineStoreState): DocumentSnapshot {
  const out: Partial<DocumentSnapshot> = {};
  for (const field of DOCUMENT_FIELDS) {
    Object.assign(out, { [field]: state[field] });
  }
  return out as DocumentSnapshot;
}

/**
 * Restore the document whenever it changes. `onBlocked` runs once per
 * restored edit. Returns the unsubscribe function.
 */
export function guardReadOnly(doc: TimelineStoreApi, onBlocked: () => void): () => void {
  const pristine = snapshot(doc.getState());
  let restoring = false;
  return doc.subscribe((state) => {
    if (restoring) {
      return;
    }
    const changed = DOCUMENT_FIELDS.some((field) => state[field] !== pristine[field]);
    if (!changed) {
      return;
    }
    restoring = true;
    doc.setState(pristine);
    restoring = false;
    onBlocked();
  });
}
