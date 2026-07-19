/** @jsxImportSource @emotion/react */
import { useCallback, useEffect } from "react";
import {
  useWorkspaceTabsStore,
  type WorkspaceTabMode
} from "../../stores/WorkspaceTabsStore";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import { useStoryboardGenerationSubscriptions } from "../../stores/storyboard/StoryboardGenerationStore";
import { useStoryboardAgentBridge } from "../../hooks/storyboard/useStoryboardAgentBridge";
import { useDirectScreenplay } from "../../hooks/storyboard/useDirectScreenplay";
import { useStoryboardServerSync } from "../../hooks/storyboard/useStoryboardServerSync";
import { useAssembleTimeline } from "../../hooks/storyboard/useAssembleTimeline";
import StoryboardBoard from "../storyboard/StoryboardBoard";
import StoryboardSidebar from "../storyboard/StoryboardSidebar";

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
  const boardTitle = useStoryboardStore(
    (state) => state.boards[refId]?.title ?? ""
  );
  const setTabTitle = useWorkspaceTabsStore((state) => state.setTitle);

  useEffect(() => {
    ensureBoard(refId);
  }, [ensureBoard, refId]);

  useStoryboardServerSync(refId);

  // Keep the tab label in sync with the board's title field.
  useEffect(() => {
    setTabTitle(refId, "storyboard", boardTitle || "Untitled storyboard");
  }, [setTabTitle, refId, boardTitle]);

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
    <div style={{ display: "flex", height: "100%", minHeight: 0 }}>
      {mode !== "view" && <StoryboardSidebar activeBoardId={refId} />}
      <div style={{ flex: 1, minWidth: 0 }}>
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
      </div>
    </div>
  );
};

export default StoryboardSurface;
