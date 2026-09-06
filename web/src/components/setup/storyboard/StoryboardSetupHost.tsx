/**
 * The storyboard flow for a host that is not already a board editor — the New
 * Project tab, which swaps itself for the flow once an entry card creates the
 * board (PRD § 6.1).
 *
 * A storyboard tab and the Studio page already run the board's server sync and
 * agent bridge, so they render `SetupFlow` themselves. This host adds them, so
 * setup writes persist and the `ui_storyboard_*` tools reach the board while
 * the flow is up (PRD § 6.5).
 */

import { useCallback, useEffect } from "react";

import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import { useStoryboardServerSync } from "../../../hooks/storyboard/useStoryboardServerSync";
import { useStoryboardAgentBridge } from "../../../hooks/storyboard/useStoryboardAgentBridge";
import DocumentLoadStatus from "../../workspace/DocumentLoadStatus";
import { SetupFlow } from "../SetupFlow";
import { useStoryboardSetupFlow } from "./useStoryboardSetupFlow";

export interface StoryboardSetupHostProps {
  boardId: string;
  /** Runs when the flow's last step finishes — the host opens the board. */
  onFinish: () => void;
  /**
   * Runs when the creator leaves the flow on step 1 — the wrong entry card
   * was picked (F31). The shell shows the control only when a handler is
   * given, and the caller owns what happens to the board it made.
   *
   * The brief handed over is the one in the store, not the one on the server:
   * the field writes locally and persists on a debounce, so a creator who
   * changes flow right after typing would otherwise carry the older text.
   */
  onChangeFlow?: (brief: string) => void | Promise<void>;
}

const StoryboardSetupHost = ({
  boardId,
  onFinish,
  onChangeFlow
}: StoryboardSetupHostProps) => {
  const ensureBoard = useStoryboardStore((state) => state.ensureBoard);
  useEffect(() => {
    ensureBoard(boardId);
  }, [ensureBoard, boardId]);

  const loadState = useStoryboardServerSync(boardId);
  useStoryboardAgentBridge(boardId);
  const config = useStoryboardSetupFlow({ boardId, onFinish });

  const handleChangeFlow = useCallback(
    () =>
      onChangeFlow?.(
        useStoryboardStore.getState().getBoard(boardId)?.brief ?? ""
      ),
    [boardId, onChangeFlow]
  );

  // The store seeds an empty board on mount, and an empty board's stage reads
  // `done` — rendering before the server copy lands would show no flow at all.
  if (loadState !== "ready") {
    return <DocumentLoadStatus state={loadState} label="storyboard" />;
  }

  return (
    <SetupFlow
      config={config}
      onChangeFlow={onChangeFlow ? handleChangeFlow : undefined}
    />
  );
};

export default StoryboardSetupHost;
