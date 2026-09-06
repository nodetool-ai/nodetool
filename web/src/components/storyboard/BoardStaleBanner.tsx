/**
 * BoardStaleBanner
 *
 * The board toolbar's "these versions are out of date" line. A style change,
 * a model change or a rewritten action leaves already-rendered stills and
 * clips describing a board that no longer exists; the banner counts them and
 * offers the one action that costs money — `Re-render stills`.
 *
 * Nothing here renders automatically (PRD D12): a style change marks versions
 * stale and spends nothing. The creator clicks, and only the shots whose
 * *selected* still is stale are enqueued. Clips stay stale until the toolbar's
 * `Render clips`.
 *
 * With nothing stale the component renders null — not an empty banner, not a
 * zero count. A toolbar that reserves space for a message it has none of is a
 * layout shift every creator pays for (E1 criterion 7).
 */

import { memo, useCallback, useMemo } from "react";
import type { BoardRenderContext, Entity } from "@nodetool-ai/protocol";
import { staleClipShots, staleKeyframeShots } from "@nodetool-ai/protocol";

import { boardRenderContext } from "../../lib/storyboard/boardRenderContext";
import { useBoard } from "../../stores/storyboard/StoryboardStore";
import { useEntities } from "../../serverState/useEntities";
import { useGenerateShot } from "../../hooks/storyboard/useGenerateShot";
import { AlertBanner, EditorButton } from "../ui_primitives";

/** "3 stills", "1 clip" — the count and its noun. */
const countLabel = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;

/**
 * The banner's sentence, or null when nothing is stale.
 *
 * Pure and exported so the null case can be asserted without a DOM: it is the
 * same condition the component early-returns on.
 */
export const staleBannerMessage = (
  staleStills: number,
  staleClips: number
): string | null => {
  const parts: string[] = [];
  if (staleStills > 0) {
    parts.push(countLabel(staleStills, "still"));
  }
  if (staleClips > 0) {
    parts.push(countLabel(staleClips, "clip"));
  }
  if (parts.length === 0) {
    return null;
  }
  const verb = parts.length === 1 && staleStills + staleClips === 1 ? "is" : "are";
  return `Style changed. ${parts.join(" and ")} ${verb} stale.`;
};

export interface BoardStaleBannerProps {
  /** The open board. Its shots and settings are what staleness is read from. */
  boardId: string;
  /** Disables `Re-render stills` — a read-only board, or a run in flight. */
  disabled?: boolean;
}

/**
 * The board values staleness is measured against.
 *
 * `style_entity_id` is the board's one style entity — the id `setStylePreset`
 * writes — so changing the preset is what marks versions stale, not every cast
 * edit.
 */

const BoardStaleBannerImpl = ({
  boardId,
  disabled = false
}: BoardStaleBannerProps) => {
  const board = useBoard(boardId);
  const { data: allEntities } = useEntities();
  const { generateKeyframe } = useGenerateShot();

  const context = useMemo(
    () => boardRenderContext(board, allEntities ?? []),
    [board, allEntities]
  );
  const staleStills = useMemo(
    () => staleKeyframeShots(board.shots, context),
    [board.shots, context]
  );
  const staleClips = useMemo(
    () => staleClipShots(board.shots, context),
    [board.shots, context]
  );

  // One shot that cannot start records the reason on itself and is toasted, so
  // a single failure must not stop the rest of the re-render.
  const handleRerenderStills = useCallback(() => {
    for (const shot of staleStills) {
      void generateKeyframe(boardId, shot).catch(() => undefined);
    }
  }, [staleStills, generateKeyframe, boardId]);

  const message = staleBannerMessage(staleStills.length, staleClips.length);
  if (!message) {
    return null;
  }

  return (
    <AlertBanner
      severity="info"
      compact
      className="board-stale-banner"
      action={
        staleStills.length > 0 ? (
          <EditorButton
            variant="outlined"
            onClick={handleRerenderStills}
            disabled={disabled}
          >
            Re-render stills
          </EditorButton>
        ) : undefined
      }
    >
      {message}
    </AlertBanner>
  );
};

export const BoardStaleBanner = memo(BoardStaleBannerImpl);

export default BoardStaleBanner;
