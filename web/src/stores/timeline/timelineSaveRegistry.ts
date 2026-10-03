/**
 * Timeline save registry
 *
 * The autosave controller is the one writer of a sequence's document. Other
 * paths that must see the document on the server (the Save button, project
 * settings, the audio bake and matte actions, version snapshots) ask it to
 * flush through this registry instead of calling `timeline.update` themselves,
 * so their writes queue behind an in-flight autosave rather than racing it.
 *
 * Kept free of imports from the store module so the store can use it.
 */
import type { TimelineStoreState } from "./TimelineStore";

/** The document the server holds after a flush, as the next merge base. */
type SavedTimelineDocument = NonNullable<TimelineStoreState["syncedDocument"]>;

export type TimelineSaveResult =
  | {
      ok: true;
      updatedAt: string | null;
      /** What the server now holds, or null when nothing was loaded. */
      sent: SavedTimelineDocument | null;
    }
  | { ok: false; error: string };

interface TimelineSaver {
  handles: (sequenceId: string) => boolean;
  save: () => Promise<TimelineSaveResult>;
}

const savers = new Set<TimelineSaver>();

export function registerTimelineSaver(saver: TimelineSaver): () => void {
  savers.add(saver);
  return () => {
    savers.delete(saver);
  };
}

/**
 * Flush the open editor's pending edits for `sequenceId` through its autosave
 * controller. Null when no editor holds that sequence, so the caller falls
 * back to writing directly.
 */
export function saveTimelineThroughEditor(
  sequenceId: string
): Promise<TimelineSaveResult> | null {
  for (const saver of savers) {
    if (saver.handles(sequenceId)) return saver.save();
  }
  return null;
}
