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

import { useEffect } from "react";

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
}

const StoryboardSetupHost = ({
  boardId,
  onFinish
}: StoryboardSetupHostProps) => {
  const ensureBoard = useStoryboardStore((state) => state.ensureBoard);
  useEffect(() => {
    ensureBoard(boardId);
  }, [ensureBoard, boardId]);

  const loadState = useStoryboardServerSync(boardId);
  useStoryboardAgentBridge(boardId);
  const config = useStoryboardSetupFlow({ boardId, onFinish });

  // The store seeds an empty board on mount, and an empty board's stage reads
  // `done` — rendering before the server copy lands would show no flow at all.
  if (loadState !== "ready") {
    return <DocumentLoadStatus state={loadState} label="storyboard" />;
  }

  return <SetupFlow config={config} />;
};

export default StoryboardSetupHost;
