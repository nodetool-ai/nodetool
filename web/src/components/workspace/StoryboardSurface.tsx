/** @jsxImportSource @emotion/react */
import { useCallback, useEffect } from "react";
import type { WorkspaceTabMode } from "../../stores/WorkspaceTabsStore";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import { useStoryboardGenerationSubscriptions } from "../../stores/storyboard/StoryboardGenerationStore";
import { useStoryboardAgentBridge } from "../../hooks/storyboard/useStoryboardAgentBridge";
import { useDirectScreenplay } from "../../hooks/storyboard/useDirectScreenplay";
import { useAssembleTimeline } from "../../hooks/storyboard/useAssembleTimeline";
import StoryboardBoard from "../storyboard/StoryboardBoard";

interface StoryboardSurfaceProps {
  refId: string;
  mode: WorkspaceTabMode;
  active: boolean;
}

/**
 * Workspace surface for a storyboard tab. `refId` is the board id. Ensures the
 * board exists in the singleton store, mounts the agent bridge (so the active
 * board drives the ui_storyboard_* tools) and the generation subscriptions, and
 * renders the board read-only in view mode.
 */
const StoryboardSurface = ({ refId, mode, active }: StoryboardSurfaceProps) => {
  const ensureBoard = useStoryboardStore((state) => state.ensureBoard);

  useEffect(() => {
    ensureBoard(refId);
  }, [ensureBoard, refId]);

  useStoryboardAgentBridge(refId, active);
  useStoryboardGenerationSubscriptions();

  const { direct, directing, error } = useDirectScreenplay();
  const handleDirect = useCallback(
    (shotCount: number) => direct(refId, shotCount),
    [direct, refId]
  );

  const {
    assemble,
    assembling,
    error: assembleError
  } = useAssembleTimeline();
  const handleAssemble = useCallback(() => {
    void assemble(refId).catch(() => {
      // Surfaced via assembleError; swallow to keep the click handler quiet.
    });
  }, [assemble, refId]);

  return (
    <StoryboardBoard
      boardId={refId}
      readOnly={mode === "view"}
      onDirect={handleDirect}
      directing={directing}
      directError={error}
      onAssemble={handleAssemble}
      assembling={assembling}
      assembleError={assembleError}
    />
  );
};

export default StoryboardSurface;
