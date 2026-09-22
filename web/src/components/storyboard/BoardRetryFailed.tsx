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
  const { retryFailedRequest } = useGenerateShot();

  // `failedShotIds` is membership-stable, and `shotJobs` holds one row per
  // shot — the last job it ran — so this is exactly "shots whose last job
  // failed", narrowed to this board.
  const failedRequestIds = useStoryboardGenerationStore(
    useShallow((state) =>
      Object.values(state.requestRecords)
        .filter(
          (record) =>
            record.boardId === boardId &&
            record.status === "failed" &&
            record.retriedAt === undefined
        )
        .sort((left, right) => (left.startedAt ?? 0) - (right.startedAt ?? 0))
        .map((record) => record.jobId)
    )
  );

  const handleRetry = useCallback(() => {
    const retryBatchId = crypto.randomUUID();
    for (const requestId of failedRequestIds) {
      void retryFailedRequest(requestId, retryBatchId).catch(() => undefined);
    }
  }, [failedRequestIds, retryFailedRequest]);

  if (failedRequestIds.length === 0) {
    return null;
  }

  return (
    <EditorButton
      variant="outlined"
      className="board-retry-failed"
      onClick={handleRetry}
      disabled={disabled}
    >
      {`Retry ${failedRequestIds.length} failed`}
    </EditorButton>
  );
};

export const BoardRetryFailed = memo(BoardRetryFailedImpl);

export default BoardRetryFailed;
