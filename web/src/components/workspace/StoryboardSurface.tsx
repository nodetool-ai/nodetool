/** @jsxImportSource @emotion/react */
import { useCallback, useEffect } from "react";
import { useTheme } from "@mui/material/styles";
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
import { FlexColumn } from "../ui_primitives";
import StoryboardBoard from "../storyboard/StoryboardBoard";
import StoryboardSidebar from "../storyboard/StoryboardSidebar";
import StoryboardQueueOverlay from "../storyboard/StoryboardQueueOverlay";
import StoryboardAgentPanel from "../storyboard/StoryboardAgentPanel";

interface StoryboardSurfaceProps {
  refId: string;
  mode: WorkspaceTabMode;
  /** Whether this tab is the focused one. Not used by the agent bridge, which
   * registers every open board by id. */
  active: boolean;
}

/**
 * Workspace surface for a storyboard tab. `refId` is the board id. Ensures the
 * board exists in the singleton store, mounts the agent bridge (registering this
 * board under its id for the ui_storyboard_* tools) and the generation
 * subscriptions, and renders the board read-only in view mode.
 */
const StoryboardSurface = ({ refId, mode }: StoryboardSurfaceProps) => {
  const theme = useTheme();
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

  useStoryboardAgentBridge(refId);
  useStoryboardGenerationSubscriptions();

  const { direct, directing, error } = useDirectScreenplay();
  const handleDirect = useCallback(
    (shotCount: number) => direct(refId, shotCount),
    [direct, refId]
  );

  const { assemble, assembling, error: assembleError } = useAssembleTimeline();
  const handleAssemble = useCallback(() => {
    void assemble(refId).catch(() => {
      // Surfaced via assembleError; swallow to keep the click handler quiet.
    });
  }, [assemble, refId]);

  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        minHeight: 0,
        position: "relative"
      }}
    >
      {mode !== "view" && <StoryboardSidebar activeBoardId={refId} />}
      <StoryboardQueueOverlay boardId={refId} />
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
      {mode !== "view" && (
        <FlexColumn
          fullHeight
          sx={{
            width: 320,
            flexShrink: 0,
            minHeight: 0,
            borderLeft: `1px solid ${theme.vars.palette.divider}`
          }}
        >
          <StoryboardAgentPanel boardId={refId} />
        </FlexColumn>
      )}
    </div>
  );
};

export default StoryboardSurface;
