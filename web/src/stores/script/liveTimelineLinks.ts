/**
 * Timelines open in an editor that reconciles its linked script live
 * (`useLinkedScriptSync`). A writer that would otherwise patch the saved
 * sequence leaves such a timeline to that editor, so the two never race on
 * one document.
 */

const liveSequences = new Map<string, number>();

/** Count one more live editor of `sequenceId`; the returned function undoes it. */
export function holdLiveTimeline(sequenceId: string): () => void {
  liveSequences.set(sequenceId, (liveSequences.get(sequenceId) ?? 0) + 1);
  return () => {
    const count = (liveSequences.get(sequenceId) ?? 1) - 1;
    if (count > 0) liveSequences.set(sequenceId, count);
    else liveSequences.delete(sequenceId);
  };
}

export const isTimelineReconciledLive = (sequenceId: string): boolean =>
  (liveSequences.get(sequenceId) ?? 0) > 0;
