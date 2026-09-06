/**
 * BoardRetryFailed
 *
 * The board toolbar's `Retry N failed`. A batch leaves a mix: most shots
 * rendered, a few came back with an error. This retries exactly the shots
 * whose *last* job failed, with the fields they already hold — a shot that
 * failed and was re-rendered successfully is not in the set, because the
 * successful render cleared its row.
 *
 * Renders null while nothing on this board has failed (E1 criterion 18).
 */

import { memo, useCallback } from "react";
import { useShallow } from "zustand/react/shallow";

import { useBoard } from "../../stores/storyboard/StoryboardStore";
import { useStoryboardGenerationStore } from "../../stores/storyboard/StoryboardGenerationStore";
import { useGenerateShot } from "../../hooks/storyboard/useGenerateShot";
import { EditorButton } from "../ui_primitives";

export interface BoardRetryFailedProps {
  /** The open board. Only its own failed shots are counted and retried. */
  boardId: string;
  /** Disables the button — a read-only board, or a run in flight. */
  disabled?: boolean;
}

const BoardRetryFailedImpl = ({
  boardId,
  disabled = false
}: BoardRetryFailedProps) => {
  const board = useBoard(boardId);
  const { generateKeyframe, generateClip } = useGenerateShot();

  // `failedShotIds` is membership-stable, and `shotJobs` holds one row per
  // shot — the last job it ran — so this is exactly "shots whose last job
  // failed", narrowed to this board.
  const failedShotIds = useStoryboardGenerationStore(
    useShallow((state) =>
      state.failedShotIds.filter(
        (shotId) => state.shotJobs[shotId]?.boardId === boardId
      )
    )
  );

  const handleRetry = useCallback(() => {
    const { shotJobs } = useStoryboardGenerationStore.getState();
    for (const shotId of failedShotIds) {
      const job = shotJobs[shotId];
      const shot = board.shots.find((candidate) => candidate.id === shotId);
      if (!job || !shot) {
        continue;
      }
      const retry =
        job.kind === "keyframe"
          ? generateKeyframe(boardId, shot)
          : generateClip(boardId, shot);
      // One shot that cannot start records the reason on itself, so a single
      // failure must not stop the rest of the retry.
      void retry.catch(() => undefined);
    }
  }, [failedShotIds, board.shots, generateKeyframe, generateClip, boardId]);

  if (failedShotIds.length === 0) {
    return null;
  }

  return (
    <EditorButton
      variant="outlined"
      className="board-retry-failed"
      onClick={handleRetry}
      disabled={disabled}
    >
      {`Retry ${failedShotIds.length} failed`}
    </EditorButton>
  );
};

export const BoardRetryFailed = memo(BoardRetryFailedImpl);

export default BoardRetryFailed;
