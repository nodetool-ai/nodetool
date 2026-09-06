/**
 * Cloning an approved cut for a recast board.
 *
 * A director approves one cut: shot clips laid down in order, plus whatever
 * else was edited on top — a text overlay, a music bed, a logo sting. When a
 * board is recast for another SKU, the copy should inherit that cut rather than
 * a bare assembly of its own shots.
 *
 * {@link cloneTimelineForBoard} is the first half: a new sequence in which the
 * clips owned by the source board point at the copy instead, with their media
 * cleared so nothing plays the template's footage. The second half is the
 * re-assemble, which fills those clips from the copy's renders and — through
 * `foreignTimelineParts` (`reassemble.ts`), which keeps every clip the board
 * does not own — leaves the overlay and the music bed exactly where they were.
 */

import { createTimeOrderedUuid } from "./defaults.js";
import type { TimelineClip, TimelineSequence } from "./types.js";

/** A clip re-stamped onto the destination board, with the source's media gone. */
function recloneClip(clip: TimelineClip, boardId: string): TimelineClip {
  const next: TimelineClip = {
    ...clip,
    storyboardBoardId: boardId,
    status: "draft",
    versions: []
  };
  delete next.currentAssetId;
  delete next.thumbnailAssetId;
  delete next.waveformAssetId;
  delete next.dependencyHash;
  delete next.lastGeneratedHash;
  return next;
}

/**
 * A copy of `seq` whose shot clips belong to `to.boardId`.
 *
 * The copy takes a fresh sequence id and stamps `templateId` with the source's,
 * so the lineage is readable from the row. Every clip carrying
 * `storyboardBoardId === from.boardId` is re-stamped and emptied of media;
 * every other clip, every track, and every marker is copied verbatim, because
 * they are the edit the director approved and no re-assemble should rebuild
 * them.
 */
export function cloneTimelineForBoard(
  seq: TimelineSequence,
  from: { boardId: string },
  to: { boardId: string }
): TimelineSequence {
  const now = new Date().toISOString();
  return {
    ...seq,
    id: createTimeOrderedUuid(),
    templateId: seq.id,
    clips: seq.clips.map((clip) =>
      clip.storyboardBoardId === from.boardId ? recloneClip(clip, to.boardId) : clip
    ),
    createdAt: now,
    updatedAt: now
  };
}
