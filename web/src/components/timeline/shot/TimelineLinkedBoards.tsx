/**
 * TimelineLinkedBoards
 *
 * Opens the storyboards the cut's shot clips come from, for as long as the
 * timeline editor is open. The Shot tab edits those boards, renders takes on
 * them and inserts derived shots into them, and a render that finishes after
 * its clip was deselected still has to reach the server — so the board stays
 * synced here, not in the panel.
 *
 * A board some other editor (its own tab, another timeline) already saves is
 * left to that editor: both read the one storyboard store. This one takes over
 * when that editor closes. A board the server does not have is never opened,
 * because the sync would recreate it empty.
 */

import { memo, useEffect, useState } from "react";

import { trpc } from "../../../trpc/client";
import { useStoryboardServerSync } from "../../../hooks/storyboard/useStoryboardServerSync";
import {
  hasStoryboardSaver,
  subscribeStoryboardSavers
} from "../../../hooks/storyboard/storyboardSaveRegistry";
import {
  useLinkedBoardIds,
  useLinkedShotTakes
} from "../../../hooks/timeline/useLinkedShotTakes";

const LinkedBoardWriter = ({ boardId }: { boardId: string }) => {
  useStoryboardServerSync(boardId);
  return null;
};

const LinkedBoardSession = ({ boardId }: { boardId: string }) => {
  const { data } = trpc.storyboards.get.useQuery(
    { id: boardId },
    { staleTime: 30_000, retry: false }
  );
  const [writer, setWriter] = useState(() => !hasStoryboardSaver(boardId));

  useEffect(() => {
    if (writer) {
      return;
    }
    const takeOverWhenFree = (): void => {
      if (!hasStoryboardSaver(boardId)) {
        setWriter(true);
      }
    };
    takeOverWhenFree();
    return subscribeStoryboardSavers(takeOverWhenFree);
  }, [writer, boardId]);

  return writer && data ? <LinkedBoardWriter boardId={boardId} /> : null;
};

const TimelineLinkedBoardsInner = () => {
  const boardIds = useLinkedBoardIds();
  useLinkedShotTakes(boardIds);
  return (
    <>
      {boardIds.map((boardId) => (
        <LinkedBoardSession key={boardId} boardId={boardId} />
      ))}
    </>
  );
};

export const TimelineLinkedBoards = memo(TimelineLinkedBoardsInner);
TimelineLinkedBoards.displayName = "TimelineLinkedBoards";

export default TimelineLinkedBoards;
