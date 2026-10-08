/**
 * BoardRetryFailed
 *
 * The board toolbar's `Retry N failed`. A batch leaves a mix: most shots
 * rendered, a few came back with an error. This retries exactly the shots
 * whose *last* job failed, with the fields they already hold. Request records
 * persist, so the set is the latest record per shot and kind: a shot that
 * failed and was re-rendered since is not in it, and neither is a shot that
 * has left the board.
 *
 * Renders null while nothing on this board has failed (E1 criterion 18).
 */

import { memo, useCallback } from "react";
import { useShallow } from "zustand/react/shallow";

import {
  useStoryboardGenerationStore,
  type ShotRequestRecord
} from "../../stores/storyboard/StoryboardGenerationStore";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import { useGenerateShot } from "../../hooks/storyboard/useGenerateShot";
import { EditorButton } from "../ui_primitives";

export interface BoardRetryFailedProps {
  /** The open board. Only its own failed shots are counted and retried. */
  boardId: string;
  /** Disables the button — a read-only board, or a run in flight. */
  disabled?: boolean;
}

/**
 * The failed requests worth retrying: for each shot and kind, the latest
 * record, when it failed, was not retried, and its shot is still on the board.
 */
export const latestFailedRequestIds = (
  records: readonly ShotRequestRecord[],
  boardId: string,
  shotIds: ReadonlySet<string>
): string[] => {
  const latest = new Map<string, ShotRequestRecord>();
  for (const record of records) {
    if (record.boardId !== boardId || !shotIds.has(record.shotId)) {
      continue;
    }
    const key = `${record.shotId}:${record.kind}`;
    const previous = latest.get(key);
    if (!previous || (record.startedAt ?? 0) >= (previous.startedAt ?? 0)) {
      latest.set(key, record);
    }
  }
  return [...latest.values()]
    .filter(
      (record) => record.status === "failed" && record.retriedAt === undefined
    )
    .sort((left, right) => (left.startedAt ?? 0) - (right.startedAt ?? 0))
    .map((record) => record.jobId);
};

const BoardRetryFailedImpl = ({
  boardId,
  disabled = false
}: BoardRetryFailedProps) => {
  const { retryFailedRequest } = useGenerateShot();

  const shotIds = useStoryboardStore(
    useShallow((state) =>
      (state.boards[boardId]?.shots ?? []).map((shot) => shot.id)
    )
  );
  const failedRequestIds = useStoryboardGenerationStore(
    useShallow((state) =>
      latestFailedRequestIds(
        Object.values(state.requestRecords),
        boardId,
        new Set(shotIds)
      )
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
