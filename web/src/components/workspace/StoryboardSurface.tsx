/** @jsxImportSource @emotion/react */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import ViewListRoundedIcon from "@mui/icons-material/ViewListRounded";
import TheatersIcon from "@mui/icons-material/Theaters";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
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
import { useDocumentUndoShortcuts } from "../../hooks/useDocumentUndoShortcuts";
import { FlexColumn, TabGroup } from "../ui_primitives";
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

type MobilePane = "boards" | "board" | "assistant";

const MOBILE_TABS = [
  { value: "boards", label: "Boards", icon: <ViewListRoundedIcon /> },
  { value: "board", label: "Board", icon: <TheatersIcon /> },
  { value: "assistant", label: "Assistant", icon: <AutoAwesomeIcon /> }
];

/**
 * Workspace surface for a storyboard tab. `refId` is the board id. Ensures the
 * board exists in the singleton store, mounts the agent bridge (registering this
 * board under its id for the ui_storyboard_* tools) and the generation
 * subscriptions, and renders the board read-only in view mode.
 *
 * On wide screens the sidebar, board, and assistant sit side by side. On phones
 * three columns don't fit, so edit mode collapses to a single pane with a
 * segmented switcher; every pane stays mounted (toggled via `display`) so
 * board, chat, and scroll state survive switches.
 */
const StoryboardSurface = ({ refId, mode, active }: StoryboardSurfaceProps) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [mobilePane, setMobilePane] = useState<MobilePane>("board");
  const ensureBoard = useStoryboardStore((state) => state.ensureBoard);
  const undo = useStoryboardStore((state) => state.undo);
  const redo = useStoryboardStore((state) => state.redo);
  const boardTitle = useStoryboardStore(
    (state) => state.boards[refId]?.title ?? ""
  );
  const setTabTitle = useWorkspaceTabsStore((state) => state.setTitle);

  useEffect(() => {
    ensureBoard(refId);
  }, [ensureBoard, refId]);

  useStoryboardServerSync(refId);

  useDocumentUndoShortcuts({
    active,
    enabled: mode !== "view",
    onUndo: useCallback(() => undo(refId), [undo, refId]),
    onRedo: useCallback(() => redo(refId), [redo, refId])
  });

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

  const board = useMemo(
    () => (
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
    ),
    [
      refId,
      mode,
      handleDirect,
      directing,
      error,
      handleAssemble,
      assembling,
      assembleError
    ]
  );

  if (isMobile && mode !== "view") {
    return (
      <FlexColumn fullHeight sx={{ minHeight: 0, position: "relative" }}>
        <TabGroup
          tabs={MOBILE_TABS}
          value={mobilePane}
          onChange={(value) => setMobilePane(value as MobilePane)}
          size="small"
          fullWidth
          sx={{
            flexShrink: 0,
            borderBottom: `1px solid ${theme.vars.palette.divider}`
          }}
        />
        <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
          <div
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 0,
              display: mobilePane === "boards" ? "flex" : "none"
            }}
          >
            <StoryboardSidebar activeBoardId={refId} />
          </div>
          <div
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 0,
              display: mobilePane === "board" ? "block" : "none"
            }}
          >
            {board}
          </div>
          <div
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 0,
              display: mobilePane === "assistant" ? "flex" : "none"
            }}
          >
            <StoryboardAgentPanel boardId={refId} />
          </div>
        </div>
        <StoryboardQueueOverlay boardId={refId} />
      </FlexColumn>
    );
  }

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
      <div style={{ flex: 1, minWidth: 0 }}>{board}</div>
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
